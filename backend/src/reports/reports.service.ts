import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, SaleStatus } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats(user?: any) {
    const where: any = {};
    if (user?.role === UserRole.BRANCH_MANAGER) {
      where.branchId = user.branchId;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalSales,
      todaySales,
      totalRevenue,
      totalBranches,
      totalProducts,
      totalUsers,
      lowStock,
      pendingInvoices,
      recentSales,
    ] = await Promise.all([
      this.prisma.sale.count({ where }),
      this.prisma.sale.count({ where: { ...where, createdAt: { gte: today } } }),
      this.prisma.sale.aggregate({
        where: { ...where, status: SaleStatus.COMPLETED },
        _sum: { total: true },
      }),
      this.prisma.branch.count(),
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.user.count(),
      this.prisma.inventory.count({ where: { quantity: { lte: 10 } } }),
      this.prisma.invoice.count({ where: { status: { in: ['PENDING', 'SENT'] } } }),
      this.prisma.sale.findMany({
        where,
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          saleItems: { include: { product: true } },
          branch: { select: { name: true } },
          user: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    return {
      totalSales,
      todaySales,
      totalRevenue: totalRevenue._sum.total || 0,
      totalBranches,
      totalProducts,
      totalUsers,
      lowStock,
      pendingInvoices,
      recentSales,
    };
  }

  async getSalesTrend(days = 30, user?: any) {
    const where: any = { status: SaleStatus.COMPLETED };
    if (user?.role === UserRole.BRANCH_MANAGER) {
      where.branchId = user.branchId;
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const sales = await this.prisma.sale.findMany({
      where: { ...where, createdAt: { gte: startDate } },
      select: { total: true, createdAt: true, type: true },
      orderBy: { createdAt: 'asc' },
    });

    const grouped: Record<string, any> = {};
    sales.forEach((sale) => {
      const date = sale.createdAt.toISOString().split('T')[0];
      if (!grouped[date]) {
        grouped[date] = { date, total: 0, cash: 0, invoice: 0, count: 0 };
      }
      grouped[date].total += Number(sale.total);
      grouped[date].count += 1;
      if (sale.type === 'CASH') grouped[date].cash += Number(sale.total);
      else grouped[date].invoice += Number(sale.total);
    });

    return Object.values(grouped);
  }

  async getBranchPerformance() {
    const branches = await this.prisma.branch.findMany({
      include: {
        _count: { select: { sales: true, users: true } },
        sales: {
          where: { status: SaleStatus.COMPLETED },
          select: { total: true },
        },
      },
    });

    return branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      code: branch.code,
      totalSales: branch._count.sales,
      totalRevenue: branch.sales.reduce((sum, s) => sum + Number(s.total), 0),
      staffCount: branch._count.users,
      isActive: branch.isActive,
    }));
  }

  async getProductPerformance() {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      include: {
        saleItems: { select: { quantity: true, total: true } },
        inventory: true,
      },
    });

    return products.map((product) => ({
      id: product.id,
      name: product.name,
      code: product.code,
      type: product.type,
      price: product.price,
      totalSold: product.saleItems.reduce((sum, item) => sum + item.quantity, 0),
      totalRevenue: product.saleItems.reduce(
        (sum, item) => sum + Number(item.total),
        0,
      ),
      currentStock: product.inventory.reduce((sum, inv) => sum + inv.quantity, 0),
    }));
  }

  async getExpenseReport(startDate?: string, endDate?: string) {
    const where: any = {};
    if (startDate && endDate) {
      where.createdAt = { gte: new Date(startDate), lte: new Date(endDate) };
    }

    const expenses = await this.prisma.expense.findMany({
      where,
      include: {
        branch: { select: { name: true } },
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const byCategory = await this.prisma.expense.groupBy({
      by: ['category'],
      where,
      _sum: { amount: true },
      _count: { category: true },
    });

    return {
      expenses,
      byCategory,
      total: expenses.reduce((sum, e) => sum + Number(e.amount), 0),
    };
  }

  async getInventoryValuation() {
    const inventory = await this.prisma.inventory.findMany({
      include: { product: true, branch: { select: { name: true } } },
    });

    const totalValue = inventory.reduce(
      (sum, item) => sum + item.quantity * Number(item.product.price),
      0,
    );
    const totalCost = inventory.reduce(
      (sum, item) => sum + item.quantity * Number(item.product.costPrice || 0),
      0,
    );

    return {
      items: inventory,
      summary: {
        totalItems: inventory.length,
        totalQuantity: inventory.reduce((sum, item) => sum + item.quantity, 0),
        totalValue,
        totalCost,
        potentialProfit: totalValue - totalCost,
      },
    };
  }
}
