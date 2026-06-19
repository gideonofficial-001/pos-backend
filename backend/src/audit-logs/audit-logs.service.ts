import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    userId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    description: string;
    oldValues?: any;
    newValues?: any;
    ipAddress?: string;
    userAgent?: string;
  }) {
    try {
      return this.prisma.auditLog.create({
        data: {
          userId: data.userId,
          action: data.action as any,
          entityType: data.entityType,
          entityId: data.entityId,
          description: data.description,
          oldValues: data.oldValues || null,
          newValues: data.newValues || null,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        },
      });
    } catch (error) {
      // Don't throw - audit logs should not break the main flow
      console.error('Failed to create audit log:', error);
      return null;
    }
  }

  async findAll(query?: { userId?: string; action?: string; entityType?: string; startDate?: string; endDate?: string }) {
    const where: any = {};

    if (query?.userId) where.userId = query.userId;
    if (query?.action) where.action = query.action;
    if (query?.entityType) where.entityType = query.entityType;
    if (query?.startDate && query?.endDate) {
      where.createdAt = { gte: new Date(query.startDate), lte: new Date(query.endDate) };
    }

    return this.prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async getStats() {
    const [total, todayCount, byAction] = await Promise.all([
      this.prisma.auditLog.count(),
      this.prisma.auditLog.count({
        where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),
    ]);

    return { total, today: todayCount, byAction };
  }
}