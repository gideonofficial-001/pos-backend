import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationStatus } from '@prisma/client';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  async create(data: { type: string; title: string; message: string; userId?: string; entityId?: string; entityType?: string }) {
    try {
      return this.prisma.notification.create({
        data: {
          type: data.type as any,
          title: data.title,
          message: data.message,
          userId: data.userId,
          entityId: data.entityId,
          entityType: data.entityType,
          status: NotificationStatus.UNREAD,
        },
      });
    } catch (error) {
      this.logger.error('Failed to create notification', error);
      return null;
    }
  }

  async findAll(userId?: string) {
    const where: any = {};
    if (userId) {
      where.OR = [
        { userId },
        { userId: null }, // System-wide notifications
      ];
    }

    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: {
        OR: [{ userId }, { userId: null }],
        status: NotificationStatus.UNREAD,
      },
    });
    return { count };
  }

  async markAsRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: {
        OR: [{ userId }, { userId: null }],
        status: NotificationStatus.UNREAD,
      },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });
  }

  async getPendingApprovals() {
    const [pendingReturns, pendingDevices, pendingTransfers, pendingExpenses] = await Promise.all([
      this.prisma.return.count({ where: { status: 'PENDING' } }),
      this.prisma.device.count({ where: { status: 'PENDING' } }),
      this.prisma.transfer.count({ where: { status: 'PENDING' } }),
      this.prisma.expense.count({ where: { status: 'PENDING' } }),
    ]);

    return {
      pendingReturns,
      pendingDevices,
      pendingTransfers,
      pendingExpenses,
      total: pendingReturns + pendingDevices + pendingTransfers + pendingExpenses,
    };
  }
}