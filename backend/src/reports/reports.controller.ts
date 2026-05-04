import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReportsService } from './reports.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';

@Controller('reports')
@UseGuards(AuthGuard(), RolesGuard)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('sales')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  async getSalesReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.reportsService.getSalesReport(startDate, endDate, branchId);
  }

  @Get('inventory')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  async getInventoryReport(@Query('branchId') branchId?: string) {
    return this.reportsService.getInventoryReport(branchId);
  }

  @Get('cylinder-reconciliation')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  async getCylinderReconciliationReport(@Query('branchId') branchId?: string) {
    return this.reportsService.getCylinderReconciliationReport(branchId);
  }

  @Get('user-performance')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  async getUserPerformanceReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reportsService.getUserPerformanceReport(startDate, endDate);
  }
}
