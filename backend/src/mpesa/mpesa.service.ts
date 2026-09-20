import {
  Injectable, Logger, InternalServerErrorException,
  BadRequestException, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class MpesaService {
  private readonly logger = new Logger(MpesaService.name);
  private readonly environment:     string;
  private readonly consumerKey:     string;
  private readonly consumerSecret:  string;
  private readonly passKey:         string;
  private readonly shortcode:       string;
  private readonly callbackUrl:     string;
  private readonly transactionType: string;
  private readonly baseUrl:         string;

  constructor(
    private prisma:        PrismaService,
    private configService: ConfigService,
  ) {
    this.environment     = this.configService.get('MPESA_ENVIRONMENT')      || 'sandbox';
    this.consumerKey     = this.configService.get('MPESA_CONSUMER_KEY')     || '';
    this.consumerSecret  = this.configService.get('MPESA_CONSUMER_SECRET')  || '';
    this.passKey         = this.configService.get('MPESA_PASSKEY')          || '';
    this.shortcode       = this.configService.get('MPESA_SHORTCODE')        || '';
    this.callbackUrl     = this.configService.get('MPESA_CALLBACK_URL')     || '';
    // ✅ Fix 5: configuration-driven so PayBill vs Till never needs a code change
    this.transactionType = this.configService.get('MPESA_TRANSACTION_TYPE') || 'CustomerPayBillOnline';
    this.baseUrl = this.environment === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async getAccessToken(): Promise<string> {
    const credentials = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
    try {
      const response = await axios.get(
        `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
        { headers: { Authorization: `Basic ${credentials}` } },
      );
      return response.data.access_token;
    } catch (error) {
      this.logger.error('Failed to get M-Pesa access token', error);
      throw new InternalServerErrorException('Payment gateway authentication failed');
    }
  }

  // ✅ Fix 4: explicit Nairobi timezone — Render servers run UTC
  private generateTimestamp(): string {
    const parts = new Intl.DateTimeFormat('en-KE', {
      timeZone: 'Africa/Nairobi',
      year:   'numeric', month:  '2-digit', day:    '2-digit',
      hour:   '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(new Date());

    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00';
    return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}${get('second')}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STK Push
  // ─────────────────────────────────────────────────────────────────────────

  async initiateStkPush(
    phoneNumber: string,
    amount:      number,
    saleId?:     string,
    invoiceId?:  string,
  ) {
    // Normalize phone
    let formattedPhone = phoneNumber.replace(/\s+/g, '');
    if (formattedPhone.startsWith('0'))  formattedPhone = '254' + formattedPhone.slice(1);
    else if (formattedPhone.startsWith('+')) formattedPhone = formattedPhone.slice(1);

    if (!/^2547\d{8}$|^2541\d{8}$/.test(formattedPhone)) {
      throw new BadRequestException('Invalid Kenyan phone number. Use 07xx or 254xx format.');
    }

    const roundedAmount = Math.ceil(amount);

    // ✅ Fix 1: create the DB record FIRST before calling Safaricom.
    // We use a temp UUID so checkoutRequestId stays non-nullable in the schema.
    // It gets replaced with the real Safaricom ID immediately after the call.
    const { randomUUID } = await import('crypto');
    const pendingTx = await this.prisma.mpesaTransaction.create({
      data: {
        checkoutRequestId: `PENDING_${randomUUID()}`,
        merchantRequestId: null,
        phoneNumber: formattedPhone,
        amount: roundedAmount,
        status: 'PENDING',
        saleId:    saleId    || null,
        invoiceId: invoiceId || null,
      },
    });

    const token     = await this.getAccessToken();
    const timestamp = this.generateTimestamp();
    const password  = Buffer.from(`${this.shortcode}${this.passKey}${timestamp}`).toString('base64');

    try {
      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
        {
          BusinessShortCode: this.shortcode,
          Password:          password,
          Timestamp:         timestamp,
          TransactionType:   this.transactionType,
          Amount:            roundedAmount,
          PartyA:            formattedPhone,
          PartyB:            this.shortcode,
          PhoneNumber:       formattedPhone,
          CallBackURL:       this.callbackUrl,
          AccountReference:  saleId ? `Sale-${saleId.slice(0, 6)}` : 'NjugushPOS',
          TransactionDesc:   'POS Payment',
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const checkoutRequestId  = response.data.CheckoutRequestID;
      const merchantRequestId  = response.data.MerchantRequestID;

      // Update record with the checkout ID now that we have it
      await this.prisma.mpesaTransaction.update({
        where: { id: pendingTx.id },
        data:  { checkoutRequestId, merchantRequestId },
      });

      return { success: true, checkoutRequestId, message: 'STK Push sent to customer' };

    } catch (error: any) {
      // Mark the pre-created record as failed so we have an audit trail
      await this.prisma.mpesaTransaction.update({
        where: { id: pendingTx.id },
        data:  { status: 'FAILED', resultDesc: 'STK Push request failed' },
      });

      this.logger.error('STK Push failed', error.response?.data || error.message);
      throw new InternalServerErrorException('Failed to initiate M-Pesa payment');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Status polling (used by frontend)
  // ─────────────────────────────────────────────────────────────────────────

  async getTransactionStatus(checkoutRequestId: string) {
    const transaction = await this.prisma.mpesaTransaction.findUnique({
      where: { checkoutRequestId },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');

    return {
      status:        transaction.status,
      receiptNumber: transaction.receiptNumber,
      customerName:  transaction.customerName  ?? null,
      resultDesc:    transaction.resultDesc    ?? null,
      amount:        transaction.amount,
      phoneNumber:   transaction.phoneNumber,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Manual receipt verification
  // ─────────────────────────────────────────────────────────────────────────

  async verifyManualReceipt(receiptNumber: string, amount: number) {
    const clean = receiptNumber.trim().toUpperCase();

    // Check if this receipt came in via a real Safaricom callback
    const existing = await this.prisma.mpesaTransaction.findFirst({
      where: { receiptNumber: clean, status: 'COMPLETED' },
    });

    if (existing) {
      // Receipt is genuine — warn if it's already linked to another sale
      const alreadyUsed = !!existing.saleId;
      return {
        verified:    true,
        alreadyUsed,
        message: alreadyUsed
          ? 'This receipt is already linked to another sale'
          : 'Receipt verified — found in system',
      };
    }

    // Not in DB — create an unverified record so the manager can reconcile it
    this.logger.warn(`Unverified manual receipt: ${clean} | KES ${amount}`);
    await this.prisma.mpesaTransaction.create({
      data: {
        checkoutRequestId: null,
        phoneNumber:       'MANUAL',
        amount,
        status:            'MANUAL_UNVERIFIED',
        receiptNumber:     clean,
        resultDesc:        'Manually entered by cashier — pending manager reconciliation',
      },
    });

    return {
      verified:    false,
      alreadyUsed: false,
      message:     'Receipt not found in system — logged for manager reconciliation',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Safaricom callback webhook
  // ─────────────────────────────────────────────────────────────────────────

  async handleCallback(callbackData: any) {
    const stkCallback = callbackData?.Body?.stkCallback;
    if (!stkCallback) {
      this.logger.warn('Received invalid callback payload');
      return { message: 'Invalid payload structure' };
    }

    const { ResultCode, CheckoutRequestID, ResultDesc } = stkCallback;

    const transaction = await this.prisma.mpesaTransaction.findUnique({
      where: { checkoutRequestId: CheckoutRequestID },
    });

    if (!transaction) {
      this.logger.warn(`Callback for unknown CheckoutRequestID: ${CheckoutRequestID}`);
      return { message: 'Transaction not found' };
    }

    // ✅ Fix 2: idempotency guard — never process the same callback twice
    if (transaction.status === 'COMPLETED' || transaction.status === 'FAILED') {
      this.logger.log(`Duplicate callback ignored for ${CheckoutRequestID} (status: ${transaction.status})`);
      return { message: 'Already processed' };
    }

    // ── Payment failed or cancelled by user ───────────────────────────────
    if (ResultCode !== 0) {
      await this.prisma.mpesaTransaction.update({
        where: { id: transaction.id },
        data:  { status: 'FAILED', resultDesc: ResultDesc },
      });
      this.logger.log(`Transaction ${CheckoutRequestID} failed: ${ResultDesc}`);
      return { message: 'Failed transaction recorded' };
    }

    // ── Payment successful ────────────────────────────────────────────────
    const meta         = stkCallback.CallbackMetadata?.Item || [];
    const receiptNumber = meta.find((i: any) => i.Name === 'MpesaReceiptNumber')?.Value;
    const amountPaid    = meta.find((i: any) => i.Name === 'Amount')?.Value;

    if (!receiptNumber) {
      this.logger.error(`Successful callback missing receipt number: ${CheckoutRequestID}`);
      return { message: 'Missing receipt number in callback' };
    }

    // Extract customer name (present in production, absent in sandbox)
    const firstName   = meta.find((i: any) => i.Name === 'FirstName')?.Value  || '';
    const middleName  = meta.find((i: any) => i.Name === 'MiddleName')?.Value || '';
    const lastName    = meta.find((i: any) => i.Name === 'LastName')?.Value   || '';
    const customerName = [firstName, middleName, lastName].filter(Boolean).join(' ').trim() || null;

    // ✅ Fix 3: all DB updates inside a single Prisma transaction
    // If any step fails, all changes roll back — no partial financial state
    await this.prisma.$transaction(async (tx) => {
      // 1. Mark M-Pesa transaction as completed
      await tx.mpesaTransaction.update({
        where: { id: transaction.id },
        data: {
          status:        'COMPLETED',
          receiptNumber,
          resultDesc:    'Payment successful',
          customerName,
        },
      });

      // 2. Update linked sale if present
      if (transaction.saleId) {
        await tx.sale.update({
          where: { id: transaction.saleId },
          data:  { status: 'COMPLETED' },
        });
        this.logger.log(`Sale ${transaction.saleId} marked COMPLETED via M-Pesa (${receiptNumber})`);
      }

      // 3. Update linked invoice if present
      if (transaction.invoiceId) {
        const invoice = await tx.invoice.findUnique({ where: { id: transaction.invoiceId } });
        if (invoice) {
          const newPaid    = Number(invoice.amountPaid) + Number(amountPaid || transaction.amount);
          const newBalance = Math.max(0, Number(invoice.total) - newPaid);
          await tx.invoice.update({
            where: { id: transaction.invoiceId },
            data: {
              amountPaid: newPaid,
              balance:    newBalance,
              status:     newBalance <= 0 ? 'PAID' : 'PENDING',
              paidAt:     newBalance <= 0 ? new Date() : null,
            },
          });
        }
      }
    });

    this.logger.log(`Callback fully processed: ${CheckoutRequestID} → ${receiptNumber}`);
    return { message: 'Callback processed successfully' };
  }
}
