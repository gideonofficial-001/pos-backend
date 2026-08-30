import { Controller, Post, Body, Req, Logger } from '@nestjs/common';
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
    @Body('invoiceId') invoiceId?: string,
  ) {
    return this.mpesaService.initiateStkPush(phoneNumber, amount, invoiceId);
  }

  @Post('callback')
  @ApiOperation({ summary: 'Safaricom Callback Webhook' })
  async handleCallback(@Body() callbackData: any) {
    this.logger.log('Received M-Pesa Callback');
    return this.mpesaService.handleCallback(callbackData);
  }
}
