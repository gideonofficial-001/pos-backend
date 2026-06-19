import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  async getDashboardStats(@GetUser() user?: any) {
    return this.reportsService.getDashboardStats(user);
  }

  @Get('sales-trend')
  @ApiOperation({ summary: 'Get sales trend data' })
  async getSalesTrend(
    @Query('days') days?: string,
    @GetUser() user?: any,
  ) {
    return this.reportsService.getSalesTrend(days ? parseInt(days) : 30, user);
  }

  @Get('branch-performance')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  @ApiOperation({ summary: 'Get branch performance report' })
  async getBranchPerformance() {
    return this.reportsService.getBranchPerformance();
  }

  @Get('product-performance')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  @ApiOperation({ summary: 'Get product performance report' })
  async getProductPerformance() {
    return this.reportsService.getProductPerformance();
  }

  @Get('expenses')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  @ApiOperation({ summary: 'Get expense report' })
  async getExpenseReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getExpenseReport(startDate, endDate);
  }

  @Get('inventory-valuation')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  @ApiOperation({ summary: 'Get inventory valuation report' })
  async getInventoryValuation() {
    return this.reportsService.getInventoryValuation();
  }
}