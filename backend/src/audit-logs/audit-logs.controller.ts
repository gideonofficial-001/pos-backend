import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuditLogsService } from './audit-logs.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole, AuditAction } from '@prisma/client';

@Controller('audit-logs')
@UseGuards(AuthGuard(), RolesGuard)
export class AuditLogsController {
  constructor(private auditLogsService: AuditLogsService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  async findAll(
    @Query('userId') userId?: string,
    @Query('action') action?: AuditAction,
    @Query('entityType') entityType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.auditLogsService.findAll({ userId, action, entityType, startDate, endDate, page, limit });
  }

  @Get('by-user/:userId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  async findByUser(@Query('userId') userId: string) {
    return this.auditLogsService.findByUser(userId);
  }
}
