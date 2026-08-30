import { Controller, Post, Get, Body, Param, Logger } from '@nestjs/common';
import { MpesaService } from './mpesa.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('M-Pesa')
@Controller('mpesa')
export class MpesaController {
  private readonly logger = new Logger(MpesaController.name);

  constructor(private readonly mpesaService: MpesaService) {}

  @Post('stkpush')
  @ApiOperation({ summary: 'Initiate M-Pesa STK Push' })
  async initiateStkPush(
    @Body('phoneNumber') phoneNumber: string,
    @Body('amount') amount: number,
    @Body('saleId') saleId?: string,
    @Body('invoiceId') invoiceId?: string,
  ) {
    return this.mpesaService.initiateStkPush(phoneNumber, amount, saleId, invoiceId);
  }

  //  FRONTEND POLLING ENDPOINT
  @Get('status/:checkoutRequestId')
  @ApiOperation({ summary: 'Check status of an STK Push' })
  async getTransactionStatus(@Param('checkoutRequestId') checkoutRequestId: string) {
    return this.mpesaService.getTransactionStatus(checkoutRequestId);
  }

  //  SAFARICOM WEBHOOK (Must be completely public, no Auth Guards!)
  @Post('callback')
  @ApiOperation({ summary: 'Safaricom Callback Webhook' })
  async handleCallback(@Body() callbackData: any) {
    this.logger.log('Received M-Pesa Callback payload');
    return this.mpesaService.handleCallback(callbackData);
  }
}
