import { Injectable, Logger, InternalServerErrorException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class MpesaService {
  private readonly logger = new Logger(MpesaService.name);
  private readonly environment: string;
  private readonly consumerKey: string;
  private readonly consumerSecret: string;
  private readonly passKey: string;
  private readonly shortcode: string;
  private readonly callbackUrl: string;
  private readonly baseUrl: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.environment = this.configService.get<string>('MPESA_ENVIRONMENT') || 'sandbox';
    this.consumerKey = this.configService.get<string>('MPESA_CONSUMER_KEY') || '';
    this.consumerSecret = this.configService.get<string>('MPESA_CONSUMER_SECRET') || '';
    this.passKey = this.configService.get<string>('MPESA_PASSKEY') || '';
    this.shortcode = this.configService.get<string>('MPESA_SHORTCODE') || '';
    this.callbackUrl = this.configService.get<string>('MPESA_CALLBACK_URL') || '';

    this.baseUrl = this.environment === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';
  }

  private async getAccessToken(): Promise<string> {
    const credentials = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
    try {
      const response = await axios.get(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: { Authorization: `Basic ${credentials}` },
      });
      return response.data.access_token;
    } catch (error) {
      this.logger.error('Failed to get M-Pesa access token', error);
      throw new InternalServerErrorException('Payment gateway authentication failed');
    }
  }

  private generateTimestamp(): string {
    const date = new Date();
    const pad = (num: number) => (num < 10 ? '0' + num : num.toString());
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  async initiateStkPush(phoneNumber: string, amount: number, saleId?: string, invoiceId?: string) {
    let formattedPhone = phoneNumber.replace(/\s+/g, '');
    if (formattedPhone.startsWith('0')) formattedPhone = '254' + formattedPhone.substring(1);
    else if (formattedPhone.startsWith('+')) formattedPhone = formattedPhone.substring(1);

    if (!/^2547\d{8}$|^2541\d{8}$/.test(formattedPhone)) {
      throw new BadRequestException('Invalid Kenyan phone number format. Use 2547XXXXXXXX');
    }

    const token = await this.getAccessToken();
    const timestamp = this.generateTimestamp();
    const password = Buffer.from(`${this.shortcode}${this.passKey}${timestamp}`).toString('base64');

    try {
      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
        {
          BusinessShortCode: this.shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: 'CustomerPayBillOnline',
          Amount: Math.ceil(amount),
          PartyA: formattedPhone,
          PartyB: this.shortcode,
          PhoneNumber: formattedPhone,
          CallBackURL: this.callbackUrl,
          AccountReference: saleId ? `Sale ${saleId.slice(0, 5)}` : 'Njugush POS',
          TransactionDesc: 'POS Payment',
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const checkoutRequestId = response.data.CheckoutRequestID;

      await this.prisma.mpesaTransaction.create({
        data: {
          checkoutRequestId,
          merchantRequestId: response.data.MerchantRequestID,
          phoneNumber: formattedPhone,
          amount: Math.ceil(amount),
          status: 'PENDING',
          saleId,
          invoiceId,
        },
      });

      return { success: true, checkoutRequestId, message: 'STK Push sent to customer' };
    } catch (error: any) {
      this.logger.error('STK Push failed', error.response?.data || error.message);
      throw new InternalServerErrorException('Failed to initiate STK push');
    }
  }

  async getTransactionStatus(checkoutRequestId: string) {
    const transaction = await this.prisma.mpesaTransaction.findUnique({
      where: { checkoutRequestId },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');

    return {
      status: transaction.status,
      receiptNumber: transaction.receiptNumber,
      customerName: transaction.customerName ?? null,
      resultDesc: transaction.resultDesc ?? null,
      amount: transaction.amount,
      phoneNumber: transaction.phoneNumber,
    };
  }

  async handleCallback(callbackData: any) {
    const stkCallback = callbackData?.Body?.stkCallback;
    if (!stkCallback) return { message: 'Invalid payload' };

    const resultCode = stkCallback.ResultCode;
    const checkoutRequestId = stkCallback.CheckoutRequestID;
    const resultDesc = stkCallback.ResultDesc;

    const transaction = await this.prisma.mpesaTransaction.findUnique({
      where: { checkoutRequestId },
    });

    if (!transaction) {
      this.logger.warn(`Received callback for unknown transaction: ${checkoutRequestId}`);
      return { message: 'Transaction not found in database' };
    }

    // ── FAILED or CANCELLED by user ────────────────────────────────────────
    if (resultCode !== 0) {
      await this.prisma.mpesaTransaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED', resultDesc },
      });
      this.logger.log(`Transaction ${checkoutRequestId} failed: ${resultDesc}`);
      return { message: 'Processed failed transaction' };
    }

    // ── SUCCESS ────────────────────────────────────────────────────────────
    const meta = stkCallback.CallbackMetadata?.Item || [];
    const amountPaid    = meta.find((i: any) => i.Name === 'Amount')?.Value;
    const receiptNumber = meta.find((i: any) => i.Name === 'MpesaReceiptNumber')?.Value;

    // Safaricom includes customer name in the metadata in production
    const firstName  = meta.find((i: any) => i.Name === 'FirstName')?.Value  || '';
    const middleName = meta.find((i: any) => i.Name === 'MiddleName')?.Value || '';
    const lastName   = meta.find((i: any) => i.Name === 'LastName')?.Value   || '';
    const customerName = [firstName, middleName, lastName].filter(Boolean).join(' ').trim() || null;

    await this.prisma.mpesaTransaction.update({
      where: { id: transaction.id },
      data: {
        status: 'COMPLETED',
        receiptNumber,
        resultDesc: 'Payment successful',
        customerName,
      },
    });

    // Auto-settle linked sale
    if (transaction.saleId) {
      await this.prisma.sale.update({
        where: { id: transaction.saleId },
        data: { status: 'COMPLETED' },
      });
      this.logger.log(`Sale ${transaction.saleId} marked COMPLETED via M-Pesa`);
    }

    // Auto-update linked invoice
    if (transaction.invoiceId) {
      const invoice = await this.prisma.invoice.findUnique({ where: { id: transaction.invoiceId } });
      if (invoice) {
        const newPaid    = Number(invoice.amountPaid) + Number(amountPaid);
        const newBalance = Number(invoice.total) - newPaid;
        await this.prisma.invoice.update({
          where: { id: transaction.invoiceId },
          data: {
            amountPaid: newPaid,
            balance: newBalance,
            status: newBalance <= 0 ? 'PAID' : 'PENDING',
          },
        });
      }
    }

    return { message: 'Callback processed successfully' };
  }
}
