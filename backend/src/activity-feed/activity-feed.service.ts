import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class ActivityFeedService {
  constructor(private prisma: PrismaService) {}

  async findAll(user?: any) {
    const where: any = {};

    if (user) {
      if (user.role === UserRole.BRANCH_MANAGER) {
        where.OR = [
          { visibleToBranch: true, branchId: user.branchId },
          { visibleToAdmin: true },
        ];
      } else if (user.role === UserRole.OVERALL_MANAGER) {
        where.visibleToManager = true;
      }
      // SUPER_ADMIN sees everything
    }

    return this.prisma.activityFeed.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getRecent(limit: number = 10, user?: any) {
    const where: any = {};

    if (user?.role === UserRole.BRANCH_MANAGER) {
      where.OR = [
        { visibleToBranch: true, branchId: user.branchId },
        { visibleToAdmin: true },
      ];
    }

    return this.prisma.activityFeed.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}