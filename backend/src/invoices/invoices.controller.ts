import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Invoices')
@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Create a new invoice' })
  create(@Body() createInvoiceDto: any, @Request() req) {
    return this.invoicesService.create(createInvoiceDto, req.user);
  }

  @Get()
  @ApiOperation({ summary: 'Get all invoices' })
  findAll(@Query() query: any, @Request() req) {
    return this.invoicesService.findAll({ ...query, user: req.user });
  }

  @Get('dashboard-stats')
  @ApiOperation({ summary: 'Get invoice dashboard statistics' })
  getDashboardStats(@Request() req) {
    return this.invoicesService.getDashboardStats(req.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice details' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.invoicesService.findOne(id, req.user);
  }

  @Patch(':id/payment')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Record a payment for an invoice' })
  recordPayment(
    @Param('id') id: string,
    @Body('amount') amount: number,
    @Request() req,
  ) {
    return this.invoicesService.recordPayment(id, Number(amount), req.user.userId);
  }
}
