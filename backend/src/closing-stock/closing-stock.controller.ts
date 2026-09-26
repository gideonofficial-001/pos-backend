import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClosingStockService } from './closing-stock.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Closing Stock')
@Controller('closing-stock')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ClosingStockController {
  constructor(private readonly closingStockService: ClosingStockService) {}

  @Get('dates')
  @ApiOperation({ summary: 'Get list of dates that have snapshots' })
  async getSnapshotDates(
    @Query('branchId')  branchId:  string,
    @Query('startDate') startStr:  string,
    @Query('endDate')   endStr:    string,
  ) {
    const endDate   = endStr   ? new Date(endStr)   : new Date();
    const startDate = startStr ? new Date(startStr) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    return this.closingStockService.getSnapshotDates(branchId, startDate, endDate);
  }

  @Get()
  @ApiOperation({ summary: 'Get closing stock snapshot for a specific date' })
  async getSnapshot(
    @Query('branchId') branchId: string,
    @Query('date')     dateStr:  string,
  ) {
    return this.closingStockService.getSnapshot(branchId, new Date(dateStr));
  }

  @Post('trigger-midnight-snapshot')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Trigger midnight inventory snapshot for all branches (Super Admin only)' })
  async triggerMidnightSnapshot(@Body('date') dateStr?: string) {
    const targetDate = dateStr ? new Date(dateStr) : undefined;
    return this.closingStockService.captureMidnightSnapshot(targetDate);
  }
}
