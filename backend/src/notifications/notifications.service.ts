import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationStatus, UserRole } from '@prisma/client';

// Transfer notification types — only branch managers involved in a transfer see these
const TRANSFER_TYPES = [
  'TRANSFER_REQUEST',
  'TRANSFER_SENT',
  'TRANSFER_RESPONSE',
  'TRANSFER_CANCELLED',
  'TRANSFER_APPROVED',  // legacy
  'TRANSFER_REJECTED',  // legacy
] as const;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  // ── Create (existing, unchanged) ─────────────────────────────────────────

  async create(data: {
    type: string;
    title: string;
    message: string;
    userId?: string;
    entityId?: string;
    entityType?: string;
  }) {
    try {
      return await this.prisma.notification.create({
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
    } catch (error: any) {
      // Log with full stack so the error is traceable in Render logs,
      // but return null so a notification failure never crashes the caller's flow.
      this.logger.error(
        `Failed to create notification (type=${data.type}, userId=${data.userId}): ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  // ── Role-aware notification fetch ─────────────────────────────────────────

  async getNotifications(userId: string, userRole: UserRole) {
    const where = this.buildWhere(userId, userRole);

    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ── findAll (kept for backwards compat with older controllers) ────────────

  async findAll(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId }, // 🚀 STRICTLY SCOPED
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ── Unread count (role-aware) ─────────────────────────────────────────────

  async getUnreadCount(userId: string, userRole?: UserRole) {
    const base = this.buildWhere(userId, userRole);
    const where = { ...base, status: NotificationStatus.UNREAD };

    const count = await this.prisma.notification.count({ where });
    return { count };
  }

  // ── Mark as read ──────────────────────────────────────────────────────────

  async markAsRead(id: string, userId: string) {
    // 🚀 STRICTLY SCOPED to the exact user
    return this.prisma.notification.updateMany({
      where: {
        id,
        userId: userId,
      },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    // 🚀 STRICTLY SCOPED to the exact user
    return this.prisma.notification.updateMany({
      where: {
        userId: userId,
        status: NotificationStatus.UNREAD,
      },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });
  }

  // ── Pending approvals (existing, unchanged) ───────────────────────────────

  async getPendingApprovals(userId?: string, userRole?: UserRole) {
    // For transfers: only count ones relevant to the user's branch.
    // SUPER_ADMIN and BRANCH_MANAGER only see transfers involving their branch.
    // Returns, devices, expenses are admin-wide concerns.
    let transferWhere: any = { status: 'PENDING' };

    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { branchId: true },
      });
      if (user?.branchId) {
        transferWhere = {
          status: 'PENDING',
          OR: [
            { fromBranchId: user.branchId },
            { toBranchId: user.branchId },
          ],
        };
      }
    }

    const [pendingReturns, pendingDevices, pendingTransfers, pendingExpenses] =
      await Promise.all([
        this.prisma.return.count({ where: { status: 'PENDING' } }),
        this.prisma.device.count({ where: { status: 'PENDING' } }),
        this.prisma.transfer.count({ where: transferWhere }),
        this.prisma.expense.count({ where: { status: 'PENDING' } }),
      ]);

    return {
      pendingReturns,
      pendingDevices,
      pendingTransfers,
      pendingExpenses,
      total:
        pendingReturns + pendingDevices + pendingTransfers + pendingExpenses,
    };
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async delete(id: string, userId: string) {
    // 🚀 STRICTLY SCOPED to the exact user
    return this.prisma.notification.deleteMany({
      where: {
        id,
        userId: userId, 
      },
    });
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private buildWhere(userId: string, userRole?: UserRole) {
    const isAdmin =
      userRole === UserRole.SUPER_ADMIN ||
      userRole === UserRole.OVERALL_MANAGER;

    if (isAdmin) {
      // Admins see their own notifications but NOT transfer noise
      return {
        AND: [
          { userId: userId }, // 🚀 STRICTLY SCOPED
          {
            NOT: {
              type: { in: TRANSFER_TYPES as any },
            },
          },
        ],
      };
    }

    // Branch managers see only their own notifications strictly
    return {
      userId: userId, // 🚀 STRICTLY SCOPED
    };
  }
}
