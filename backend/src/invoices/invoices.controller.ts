import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole, InvoiceStatus } from '@prisma/client';

@ApiTags('Invoices')
@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class InvoicesController {
  constructor(private invoicesService: InvoicesService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Create new invoice' })
  async create(@Body() createInvoiceDto: CreateInvoiceDto, @GetUser() user: any) {
    return this.invoicesService.create(createInvoiceDto, user);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Get all invoices' })
  async findAll(
    @Query('branchId') branchId?: string,
    @Query('status') status?: string,
    @Query('overdue') overdue?: string,
    @GetUser() user?: any,
  ) {
    return this.invoicesService.findAll({ branchId, status, overdue: overdue === 'true', user });
  }

  @Get('summary')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  @ApiOperation({ summary: 'Get invoice summary' })
  async getInvoiceSummary() {
    return this.invoicesService.getInvoiceSummary();
  }

  @Get('overdue')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  @ApiOperation({ summary: 'Get overdue invoices' })
  async getOverdueInvoices() {
    return this.invoicesService.getOverdueInvoices();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice by ID' })
  async findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  @Patch(':id/status')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update invoice status (Admin only)' })
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: InvoiceStatus,
    @GetUser('userId') userId: string,
  ) {
    return this.invoicesService.updateStatus(id, status, userId);
  }
}