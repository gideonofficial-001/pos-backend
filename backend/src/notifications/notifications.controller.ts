import { Controller, Get, Post, Param, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Get notifications — transfer notifications are hidden for Admin/Manager',
  })
  async getNotifications(@Request() req) {
    return this.notificationsService.getNotifications(
      req.user.userId,
      req.user.role,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count (role-aware)' })
  async getUnreadCount(@Request() req) {
    return this.notificationsService.getUnreadCount(
      req.user.userId,
      req.user.role,
    );
  }

  @Get('pending-approvals')
  @ApiOperation({ summary: 'Get pending approvals count (transfer count scoped to user branch)' })
  async getPendingApprovals(@Request() req) {
    return this.notificationsService.getPendingApprovals(
      req.user.userId,
      req.user.role,
    );
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markAsRead(@Param('id') id: string, @Request() req) {
    return this.notificationsService.markAsRead(id, req.user.userId);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@Request() req) {
    return this.notificationsService.markAllAsRead(req.user.userId);
  }
}
