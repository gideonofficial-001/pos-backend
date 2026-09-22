import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClosingStockService {
  constructor(private prisma: PrismaService) {}

  // ── Record a snapshot of current inventory for a branch ───────────────────
  async recordSnapshot(branchId: string, date: Date, userId: string) {
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

    const inventory = await this.prisma.inventory.findMany({
      where: { branchId, product: { isActive: true } },
      include: { product: true },
    });

    if (!inventory.length) {
      throw new NotFoundException('No inventory found for this branch');
    }

    // Upsert each product — re-recording overwrites the previous snapshot for the day
    await this.prisma.$transaction(
      inventory.map((inv) =>
        this.prisma.closingStockSnapshot.upsert({
          where: {
            branchId_date_productId: {
              branchId,
              date: dateOnly,
              productId: inv.productId,
            },
          },
          create: {
            branchId,
            date:         dateOnly,
            productId:    inv.productId,
            quantity:     inv.quantity,
            fullCylinders: inv.fullCylinders ?? null,
            recordedById: userId,
          },
          update: {
            quantity:      inv.quantity,
            fullCylinders: inv.fullCylinders ?? null,
            recordedAt:    new Date(),
            recordedById:  userId,
          },
        }),
      ),
    );

    return {
      message:  'Closing stock recorded successfully',
      date:     dateOnly,
      branchId,
      products: inventory.length,
    };
  }

  // ── Return dates that have snapshots in a range ────────────────────────────
  async getSnapshotDates(branchId: string, startDate: Date, endDate: Date) {
    const rows = await this.prisma.closingStockSnapshot.groupBy({
      by:    ['date'],
      where: { branchId, date: { gte: startDate, lte: endDate } },
      _count: { productId: true },
      _max:   { recordedAt: true },
      orderBy: { date: 'desc' },
    });

    return rows.map((r) => ({
      date:         r.date,
      productCount: r._count.productId,
      recordedAt:   r._max.recordedAt,
    }));
  }

  // ── Full snapshot for a specific date ────────────────────────────────────
  async getSnapshot(branchId: string, date: Date) {
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

    const snapshots = await this.prisma.closingStockSnapshot.findMany({
      where: { branchId, date: dateOnly },
      include: {
        product: { include: { category: true } },
      },
      orderBy: [
        { product: { category: { name: 'asc' } } },
        { product: { name: 'asc' } },
      ],
    });

    if (!snapshots.length) {
      throw new NotFoundException('No closing stock record found for this date');
    }

    // Group by category
    const categoryMap = new Map<string, any>();
    snapshots.forEach((snap) => {
      const catId   = snap.product.category?.id   || 'uncategorized';
      const catName = snap.product.category?.name || 'Uncategorized';

      if (!categoryMap.has(catId)) {
        categoryMap.set(catId, { id: catId, name: catName, items: [] });
      }

      const isLpg = catName.toUpperCase().includes('LPG');
      categoryMap.get(catId).items.push({
        productId:     snap.productId,
        productName:   snap.product.name,
        productCode:   snap.product.code,
        quantity:      snap.quantity,
        fullCylinders: snap.fullCylinders,
        emptyCylinders: isLpg && snap.fullCylinders != null
          ? Math.max(0, snap.quantity - snap.fullCylinders)
          : null,
      });
    });

    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { name: true, code: true },
    });

    return {
      branchId,
      branchName:    branch?.name || '',
      date:          dateOnly,
      recordedAt:    snapshots[0].recordedAt,
      totalProducts: snapshots.length,
      categories:    Array.from(categoryMap.values()),
    };
  }
}
