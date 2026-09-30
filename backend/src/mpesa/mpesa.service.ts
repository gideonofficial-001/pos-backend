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
    this.environment     = (this.configService.get('MPESA_ENVIRONMENT')      || 'sandbox').trim();
    this.consumerKey     = (this.configService.get('MPESA_CONSUMER_KEY')     || '').trim();
    this.consumerSecret  = (this.configService.get('MPESA_CONSUMER_SECRET')  || '').trim();
    this.passKey         = (this.configService.get('MPESA_PASSKEY')          || '').trim();
    this.shortcode       = (this.configService.get('MPESA_SHORTCODE')        || '').trim();
    this.callbackUrl     = (this.configService.get('MPESA_CALLBACK_URL')     || '').trim();
    // ✅ Fix 5: configuration-driven so PayBill vs Till never needs a code change
    this.transactionType = (this.configService.get('MPESA_TRANSACTION_TYPE') || 'CustomerPayBillOnline').trim();
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
    let transaction = await this.prisma.mpesaTransaction.findUnique({
      where: { checkoutRequestId },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');

    // If still PENDING, proactively query Safaricom's STK push query endpoint
    // to reconcile in real time without relying solely on incoming webhooks
    if (transaction.status === 'PENDING') {
      transaction = await this.syncTransactionWithSafaricom(transaction);
    }

    return {
      status:        transaction.status,
      receiptNumber: transaction.receiptNumber,
      customerName:  transaction.customerName  ?? null,
      resultDesc:    transaction.resultDesc    ?? null,
      amount:        transaction.amount,
      phoneNumber:   transaction.phoneNumber,
    };
  }

  // ── Safaricom STK Push Query Sync ─────────────────────────────────────────
  // Queries Safaricom directly to verify the real-time status of a pending STK push.
  // This serves as the essential fallback when webhook callbacks are delayed, dropped,
  // or blocked by firewalls / server cold starts.
  private async syncTransactionWithSafaricom(transaction: any) {
    if (!transaction || !transaction.checkoutRequestId) return transaction;

    // Do not query for placeholder IDs
    if (transaction.checkoutRequestId.startsWith('PENDING_') || transaction.checkoutRequestId.startsWith('MANUAL_')) {
      return transaction;
    }

    // Throttle queries: don't query if the transaction was updated less than 3 seconds ago
    const lastUpdated = new Date(transaction.updatedAt).getTime();
    if (Date.now() - lastUpdated < 3000) {
      return transaction;
    }

    try {
      const token     = await this.getAccessToken();
      const timestamp = this.generateTimestamp();
      const password  = Buffer.from(`${this.shortcode}${this.passKey}${timestamp}`).toString('base64');

      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpushquery/v1/query`,
        {
          BusinessShortCode: this.shortcode,
          Password:          password,
          Timestamp:         timestamp,
          CheckoutRequestID: transaction.checkoutRequestId,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const data = response.data;
      const resultCode = data?.ResultCode ?? data?.Body?.stkCallback?.ResultCode ?? data?.stkCallback?.ResultCode;
      const resultDesc = data?.ResultDesc ?? data?.Body?.stkCallback?.ResultDesc ?? data?.stkCallback?.ResultDesc;

      this.logger.log(`STK Query result for ${transaction.checkoutRequestId}: ResultCode=${resultCode}, Desc=${resultDesc}`);

      // Case 1: Payment succeeded!
      if (resultCode === 0 || resultCode === '0') {
        const meta = data?.CallbackMetadata?.Item || data?.Body?.stkCallback?.CallbackMetadata?.Item || [];
        const receiptItem = meta.find((i: any) =>
          (i.Name || i.name)?.toLowerCase() === 'mpesareceiptnumber',
        );
        const receiptNumber =
          receiptItem?.Value ||
          receiptItem?.value ||
          `MPESA_${transaction.checkoutRequestId.slice(-8).toUpperCase()}`;

        // Customer name if returned in metadata
        const firstName    = meta.find((i: any) => (i.Name || i.name)?.toLowerCase() === 'firstname')?.Value || '';
        const lastName     = meta.find((i: any) => (i.Name || i.name)?.toLowerCase() === 'lastname')?.Value || '';
        const customerName = [firstName, lastName].filter(Boolean).join(' ').trim() || transaction.customerName || null;

        const updatedTx = await this.prisma.$transaction(async (tx) => {
          const updated = await tx.mpesaTransaction.update({
            where: { id: transaction.id },
            data: {
              status:        'COMPLETED',
              receiptNumber,
              customerName,
              resultDesc:    resultDesc || 'Payment successful (verified via STK Query)',
            },
          });

          if (transaction.saleId) {
            const sale = await tx.sale.findUnique({ where: { id: transaction.saleId } });
            if (sale) {
              await tx.sale.update({
                where: { id: transaction.saleId },
                data:  { status: 'COMPLETED' },
              });
            }
          }

          if (transaction.invoiceId) {
            const invoice = await tx.invoice.findUnique({ where: { id: transaction.invoiceId } });
            if (invoice) {
              const newPaid    = Number(invoice.amountPaid) + Number(transaction.amount);
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

          return updated;
        });

        return updatedTx;
      }

      // Case 2: Payment failed, declined or cancelled
      if (resultCode !== undefined && resultCode !== null) {
        const failureText =
          resultCode === 1032 || resultCode === '1032'
            ? 'Payment cancelled by user'
            : resultCode === 1037 || resultCode === '1037'
              ? 'Payment timed out on customer phone'
              : resultDesc || 'Payment failed';

        const updated = await this.prisma.mpesaTransaction.update({
          where: { id: transaction.id },
          data: {
            status:     'FAILED',
            resultDesc: failureText,
          },
        });
        return updated;
      }

      return transaction;
    } catch (error: any) {
      const errMsg = error.response?.data?.errorMessage || error.response?.data?.ResponseDescription || error.message;
      // Safaricom returns error 500.001.1001 when transaction is still processing on customer phone
      this.logger.debug(`STK query active polling for ${transaction.checkoutRequestId}: ${errMsg}`);
      return transaction;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Manual receipt verification
  // ─────────────────────────────────────────────────────────────────────────

  async verifyManualReceipt(receiptNumber: string, amount: number) {
    const clean = receiptNumber.trim().toUpperCase();

    // Check if this receipt came in via a real Safaricom callback or STK query
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
    const { randomUUID } = await import('crypto');
    await this.prisma.mpesaTransaction.create({
      data: {
        checkoutRequestId: `MANUAL_${clean}_${randomUUID()}`,
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

    // Extract metadata items if present
    const meta          = stkCallback.CallbackMetadata?.Item || [];
    const receiptItem   = meta.find((i: any) => (i.Name || i.name)?.toLowerCase() === 'mpesareceiptnumber');
    const officialReceipt = receiptItem?.Value || receiptItem?.value;
    const amountItem    = meta.find((i: any) => (i.Name || i.name)?.toLowerCase() === 'amount');
    const amountPaid    = amountItem?.Value || amountItem?.value;

    const firstName    = meta.find((i: any) => (i.Name || i.name)?.toLowerCase() === 'firstname')?.Value || '';
    const middleName   = meta.find((i: any) => (i.Name || i.name)?.toLowerCase() === 'middlename')?.Value || '';
    const lastName     = meta.find((i: any) => (i.Name || i.name)?.toLowerCase() === 'lastname')?.Value || '';
    const customerName = [firstName, middleName, lastName].filter(Boolean).join(' ').trim() || null;

    // ✅ Idempotency guard — if already completed, update with official receipt number if previously fallback
    if (transaction.status === 'COMPLETED') {
      if (officialReceipt && (!transaction.receiptNumber || transaction.receiptNumber.startsWith('MPESA_'))) {
        await this.prisma.mpesaTransaction.update({
          where: { id: transaction.id },
          data: {
            receiptNumber: officialReceipt,
            customerName:  customerName || transaction.customerName,
          },
        });
        this.logger.log(`Updated existing transaction ${CheckoutRequestID} with official receipt: ${officialReceipt}`);
      }
      return { message: 'Already processed' };
    }

    if (transaction.status === 'FAILED') {
      this.logger.log(`Duplicate callback ignored for ${CheckoutRequestID} (status: FAILED)`);
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
    const receiptNumber = officialReceipt || `MPESA_${CheckoutRequestID.slice(-8).toUpperCase()}`;

    // ✅ All DB updates inside a single Prisma transaction
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
        const sale = await tx.sale.findUnique({ where: { id: transaction.saleId } });
        if (sale) {
          await tx.sale.update({
            where: { id: transaction.saleId },
            data:  { status: 'COMPLETED' },
          });
          this.logger.log(`Sale ${transaction.saleId} marked COMPLETED via M-Pesa (${receiptNumber})`);
        }
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
