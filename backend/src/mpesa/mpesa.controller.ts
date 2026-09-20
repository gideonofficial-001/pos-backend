import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MpesaService } from './mpesa.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('M-Pesa')
@Controller('mpesa')
export class MpesaController {
  constructor(private readonly mpesaService: MpesaService) {}

  // ✅ Fix 6: STK push and status require a valid JWT — only callback is public
  @Post('stkpush')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate M-Pesa STK Push (authenticated)' })
  async initiateStkPush(
    @Body('phoneNumber') phoneNumber: string,
    @Body('amount')      amount:      number,
    @Body('saleId')      saleId?:     string,
    @Body('invoiceId')   invoiceId?:  string,
  ) {
    return this.mpesaService.initiateStkPush(phoneNumber, amount, saleId, invoiceId);
  }

  @Get('status/:checkoutRequestId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Poll M-Pesa payment status (authenticated)' })
  async getTransactionStatus(
    @Param('checkoutRequestId') checkoutRequestId: string,
  ) {
    return this.mpesaService.getTransactionStatus(checkoutRequestId);
  }

  // ✅ Manual receipt verification — calls backend so any string can't fake a payment
  @Post('verify-manual')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify a manually entered M-Pesa receipt code (authenticated)' })
  async verifyManualReceipt(
    @Body('receiptNumber') receiptNumber: string,
    @Body('amount')        amount:        number,
  ) {
    return this.mpesaService.verifyManualReceipt(receiptNumber, amount);
  }

  // ✅ Safaricom callback — intentionally public, no JWT guard
  @Post('callback')
  @ApiOperation({ summary: 'Safaricom webhook callback (public — Safaricom IP only)' })
  async handleCallback(@Body() callbackData: any) {
    return this.mpesaService.handleCallback(callbackData);
  }
}
