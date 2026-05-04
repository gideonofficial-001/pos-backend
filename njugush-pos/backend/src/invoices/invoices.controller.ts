import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BranchAccessGuard } from '../auth/guards/branch-access.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole, InvoiceStatus } from '@prisma/client';

@Controller('invoices')
@UseGuards(AuthGuard(), RolesGuard)
export class InvoicesController {
  constructor(private invoicesService: InvoicesService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @UseGuards(BranchAccessGuard)
  async create(@Body() createInvoiceDto: CreateInvoiceDto, @GetUser() user: any) {
    return this.invoicesService.create(createInvoiceDto, user);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  async findAll(
    @Query('branchId') branchId?: string,
    @Query('status') status?: InvoiceStatus,
    @GetUser() user?: any,
  ) {
    return this.invoicesService.findAll({ branchId, status, user });
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  async findOne(@Param('id') id: string, @GetUser() user: any) {
    return this.invoicesService.findOne(id, user);
  }

  @Patch(':id/pay')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async markAsPaid(@Param('id') id: string, @GetUser() user: any) {
    return this.invoicesService.markAsPaid(id, user);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.SUPER_ADMIN)
  async cancel(@Param('id') id: string, @GetUser() user: any) {
    return this.invoicesService.cancel(id, user);
  }
}
