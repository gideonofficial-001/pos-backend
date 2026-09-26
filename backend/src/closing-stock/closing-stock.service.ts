import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClosingStockService {
  private readonly logger = new Logger(ClosingStockService.name);

  constructor(private prisma: PrismaService) {}

  // ── Automatic Midnight Snapshot ───────────────────────────────────────────
  // Automatically runs every day at 00:00:00 (midnight) in Africa/Nairobi
  // Captures the entire inventory for all branches exactly as it was when the day ended.
  // Any transactions (sales, transfers, adjustments) done past midnight will not affect this snapshot.
  @Cron('0 0 * * *', { timeZone: 'Africa/Nairobi' })
  async handleMidnightSnapshot() {
    this.logger.log('[ClosingStockCron] Midnight arrived — capturing closing inventory snapshot for all branches...');
    try {
      const result = await this.captureMidnightSnapshot();
      this.logger.log(
        `[ClosingStockCron] Midnight snapshot finished. Recorded: ${result.recordedBranches} branches, Total items: ${result.totalItems}.`,
      );
    } catch (error) {
      this.logger.error('[ClosingStockCron] Failed to run automated midnight snapshot', error);
    }
  }

  // ── Capture Midnight Snapshot For All Branches ────────────────────────────
  async captureMidnightSnapshot(targetDate?: Date) {
    const dateOnly = targetDate
      ? this.normalizeDate(targetDate)
      : this.getConcludedBusinessDate();

    this.logger.log(`Executing midnight snapshot for business date: ${dateOnly.toISOString().split('T')[0]}`);

    const branches = await this.prisma.branch.findMany({
      select: { id: true, name: true },
    });

    let recordedBranches = 0;
    let totalItems = 0;

    for (const branch of branches) {
      try {
        const count = await this.recordBranchMidnightSnapshot(branch.id, dateOnly);
        if (count > 0) {
          recordedBranches++;
          totalItems += count;
        }
      } catch (error) {
        this.logger.error(`Error capturing midnight snapshot for branch ${branch.name} (${branch.id}):`, error);
      }
    }

    return {
      message: 'Midnight closing stock snapshot completed',
      date: dateOnly,
      totalBranches: branches.length,
      recordedBranches,
      totalItems,
    };
  }

  // ── Record Midnight Snapshot for a Single Branch (Immutable) ─────────────
  private async recordBranchMidnightSnapshot(branchId: string, dateOnly: Date): Promise<number> {
    // If a snapshot already exists for this branch on this date, skip it.
    // Midnight snapshots are immutable and must not be overwritten.
    const existingCount = await this.prisma.closingStockSnapshot.count({
      where: {
        branchId,
        date: dateOnly,
      },
    });

    if (existingCount > 0) {
      this.logger.warn(
        `Snapshot for branch ${branchId} on date ${dateOnly.toISOString().split('T')[0]} already exists. Skipping to preserve exact midnight state.`,
      );
      return 0;
    }

    const inventory = await this.prisma.inventory.findMany({
      where: { branchId, product: { isActive: true } },
      include: { product: true },
    });

    if (!inventory.length) {
      this.logger.log(`No active inventory found for branch ${branchId}`);
      return 0;
    }

    await this.prisma.$transaction(
      inventory.map((inv) =>
        this.prisma.closingStockSnapshot.create({
          data: {
            branchId,
            date: dateOnly,
            productId: inv.productId,
            quantity: inv.quantity,
            fullCylinders: inv.fullCylinders ?? null,
            recordedAt: new Date(),
            recordedById: null, // Automated midnight system snapshot
          },
        }),
      ),
    );

    return inventory.length;
  }

  // ── Helper: Concluded Business Date ───────────────────────────────────────
  // When midnight (00:00:00) strikes in Nairobi, the business day that just ended is yesterday.
  getConcludedBusinessDate(now: Date = new Date()): Date {
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    return this.normalizeDate(oneHourAgo);
  }

  // ── Helper: Normalize Date to UTC Start-of-Day for Nairobi Date ───────────
  private normalizeDate(date: Date): Date {
    const nairobiDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date); // Formats as YYYY-MM-DD in Africa/Nairobi

    const [year, month, day] = nairobiDateStr.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  }

  // ── Return dates that have snapshots in a range ────────────────────────────
  async getSnapshotDates(branchId: string, startDate: Date, endDate: Date) {
    const start = this.normalizeDate(startDate);
    const end = this.normalizeDate(endDate);

    const rows = await this.prisma.closingStockSnapshot.groupBy({
      by: ['date'],
      where: { branchId, date: { gte: start, lte: end } },
      _count: { productId: true },
      _max: { recordedAt: true },
      orderBy: { date: 'desc' },
    });

    return rows.map((r) => ({
      date: r.date,
      productCount: r._count.productId,
      recordedAt: r._max.recordedAt,
    }));
  }

  // ── Full snapshot for a specific date ────────────────────────────────────
  async getSnapshot(branchId: string, date: Date) {
    const dateOnly = this.normalizeDate(date);

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
      const catId = snap.product.category?.id || 'uncategorized';
      const catName = snap.product.category?.name || 'Uncategorized';

      if (!categoryMap.has(catId)) {
        categoryMap.set(catId, { id: catId, name: catName, items: [] });
      }

      const isLpg = catName.toUpperCase().includes('LPG');
      categoryMap.get(catId).items.push({
        productId: snap.productId,
        productName: snap.product.name,
        productCode: snap.product.code,
        quantity: snap.quantity,
        fullCylinders: snap.fullCylinders,
        emptyCylinders:
          isLpg && snap.fullCylinders != null
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
      branchName: branch?.name || '',
      date: dateOnly,
      recordedAt: snapshots[0].recordedAt,
      totalProducts: snapshots.length,
      categories: Array.from(categoryMap.values()),
    };
  }
}
