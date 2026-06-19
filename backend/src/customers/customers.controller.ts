import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Customers')
@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class CustomersController {
  constructor(private customersService: CustomersService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create new customer (Admin only)' })
  async create(@Body() data: { fullName: string; phone: string; email?: string; businessName?: string; address?: string; creditLimit?: number }) {
    return this.customersService.create(data);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Get all customers' })
  async findAll(
    @Query('search') search?: string,
    @Query('isInvoiceEligible') isInvoiceEligible?: string,
  ) {
    return this.customersService.findAll({
      search,
      isInvoiceEligible: isInvoiceEligible !== undefined ? isInvoiceEligible === 'true' : undefined,
    });
  }

  @Get('outstanding-balances')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  @ApiOperation({ summary: 'Get customers with outstanding balances' })
  async getOutstandingBalances() {
    return this.customersService.getOutstandingBalances();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer by ID' })
  async findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update customer (Admin only)' })
  async update(@Param('id') id: string, @Body() data: any) {
    return this.customersService.update(id, data);
  }

  @Patch(':id/toggle')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Toggle customer status' })
  async toggleStatus(@Param('id') id: string) {
    return this.customersService.toggleStatus(id);
  }
}