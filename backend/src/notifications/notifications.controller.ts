import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';

@Controller('notifications')
@UseGuards(AuthGuard(), RolesGuard)
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get('dashboard')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  async getDashboardNotifications() {
    return this.notificationsService.getDashboardNotifications();
  }

  @Post('daily-summary')
  @Roles(UserRole.SUPER_ADMIN)
  async sendDailySummary() {
    return this.notificationsService.sendDailySalesSummary();
  }
}
