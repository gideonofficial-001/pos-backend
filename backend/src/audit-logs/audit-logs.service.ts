import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, Prisma } from '@prisma/client'; // Import Prisma namespace

@Injectable()
export class AuditLogsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    userId?: string;
    action: AuditAction;
    entityType?: string;
    entityId?: string;
    oldValues?: any;
    newValues?: any;
    description: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    // FIXED: Cast to UncheckedCreateInput to resolve the strict relation typing error
    return this.prisma.auditLog.create({ 
      data: { ...data, createdAt: new Date() } as Prisma.AuditLogUncheckedCreateInput 
    });
  }

  async findAll(query: {
    userId?: string;
    action?: AuditAction;
    entityType?: string;
    startDate?: string;
    endDate?: string;
    page?: number | string; // Accept string to handle raw HTTP query params
    limit?: number | string;
  }) {
    // FIXED: Ensure page and limit are strictly parsed as numbers
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    const { userId, action, entityType, startDate, endDate } = query;

    // FIXED: Removed 'any' and applied strict Prisma typing
    const where: Prisma.AuditLogWhereInput = {};

    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    
    // FIXED: Allow independent start or end date filtering
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findByUser(userId: string) {
    return this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findByEntity(entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
    });
  }
}