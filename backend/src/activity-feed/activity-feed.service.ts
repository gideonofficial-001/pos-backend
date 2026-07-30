import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class ActivityFeedService {
  constructor(private prisma: PrismaService) {}

  async findAll(user?: any) {
    const where: any = {};

    if (user?.role === UserRole.BRANCH_MANAGER) {
      // Branch managers only see activity from their own branch
      where.AND = [
        { visibleToBranch: true },
        { branchId: user.branchId },
      ];
    }
    // SUPER_ADMIN and OVERALL_MANAGER see everything — no filter

    return this.prisma.activityFeed.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getRecent(limit = 10, user?: any) {
    const where: any = {};

    if (user?.role === UserRole.BRANCH_MANAGER) {
      where.AND = [
        { visibleToBranch: true },
        { branchId: user.branchId },
      ];
    }

    return this.prisma.activityFeed.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
