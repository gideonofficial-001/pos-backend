import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SaleStatus, ProductType } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getSalesReport(startDate: string, endDate: string, branchId?: string) {
    const where: any = {
      saleDate: { gte: new Date(startDate), lte: new Date(endDate) },
      status: SaleStatus.COMPLETED,
    };

    if (branchId) where.branchId = branchId;

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        items: { include: { product: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
    });

    const totalAmount = sales.reduce((sum, sale) => sum + Number(sale.total), 0);
    const totalSales = sales.length;

    const byProductType = {
      lpgRefills: { count: 0, amount: 0 },
      lpgCylinders: { count: 0, amount: 0 },
      electronics: { count: 0, amount: 0 },
      accessories: { count: 0, amount: 0 },
    };

    sales.forEach((sale) => {
      sale.items.forEach((item) => {
        const amount = Number(item.total);
        switch (item.product.type) {
          case ProductType.LPG_REFILL:
            byProductType.lpgRefills.count += item.quantity;
            byProductType.lpgRefills.amount += amount;
            break;
          case ProductType.LPG_CYLINDER:
            byProductType.lpgCylinders.count += item.quantity;
            byProductType.lpgCylinders.amount += amount;
            break;
          case ProductType.ELECTRONICS:
            byProductType.electronics.count += item.quantity;
            byProductType.electronics.amount += amount;
            break;
          default:
            byProductType.accessories.count += item.quantity;
            byProductType.accessories.amount += amount;
        }
      });
    });

    const byBranch = {};
    sales.forEach((sale) => {
      const branchName = sale.branch.name;
      if (!byBranch[branchName]) {
        byBranch[branchName] = { sales: 0, amount: 0 };
      }
      byBranch[branchName].sales += 1;
      byBranch[branchName].amount += Number(sale.total);
    });

    const byDay = {};
    sales.forEach((sale) => {
      const date = sale.saleDate.toISOString().split('T')[0];
      if (!byDay[date]) {
        byDay[date] = { sales: 0, amount: 0 };
      }
      byDay[date].sales += 1;
      byDay[date].amount += Number(sale.total);
    });

    return {
      summary: { totalSales, totalAmount, averageSale: totalSales > 0 ? totalAmount / totalSales : 0 },
      byProductType,
      byBranch,
      byDay,
      sales,
    };
  }

  async getInventoryReport(branchId?: string) {
    const where = branchId ? { branchId } : {};

    const inventory = await this.prisma.inventory.findMany({
      where,
      include: {
        product: true,
        branch: { select: { id: true, name: true, code: true } },
      },
    });

    const totalProducts = inventory.length;
    const lowStockItems = inventory.filter((item) => item.quantity <= item.product.minStockLevel);
    const outOfStockItems = inventory.filter((item) => item.quantity === 0);
    const totalValue = inventory.reduce((sum, item) => sum + item.quantity * Number(item.product.price), 0);

    return {
      summary: { totalProducts, lowStockCount: lowStockItems.length, outOfStockCount: outOfStockItems.length, totalValue },
      lowStockItems,
      outOfStockItems,
      inventory,
    };
  }

  async getCylinderReconciliationReport(branchId?: string) {
    const where: any = { product: { type: ProductType.LPG_REFILL } };
    if (branchId) where.branchId = branchId;

    const inventory = await this.prisma.inventory.findMany({
      where,
      include: { product: true, branch: true },
    });

    const reconciliation = inventory.map((item) => {
      const expectedEmpty = item.totalSold - item.totalRefilled;
      const discrepancy = item.emptyCylinders - expectedEmpty;
      return {
        branch: item.branch,
        product: item.product,
        fullCylinders: item.fullCylinders,
        emptyCylinders: item.emptyCylinders,
        totalRefilled: item.totalRefilled,
        totalSold: item.totalSold,
        expectedEmpty,
        discrepancy,
        hasDiscrepancy: discrepancy !== 0,
      };
    });

    const discrepancies = reconciliation.filter((r) => r.hasDiscrepancy);

    return {
      summary: { totalTracked: reconciliation.length, discrepanciesFound: discrepancies.length },
      reconciliation,
      discrepancies,
    };
  }

  async getUserPerformanceReport(startDate: string, endDate: string) {
    const users = await this.prisma.user.findMany({
      where: { role: 'BRANCH_MANAGER' },
      include: {
        sales: {
          where: {
            saleDate: { gte: new Date(startDate), lte: new Date(endDate) },
            status: SaleStatus.COMPLETED,
          },
        },
        branch: true,
      },
    });

    return users.map((user) => ({
      user: {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        branch: user.branch,
      },
      performance: {
        totalSales: user.sales.length,
        totalAmount: user.sales.reduce((sum, sale) => sum + Number(sale.total), 0),
        averageSale: user.sales.length > 0
          ? user.sales.reduce((sum, sale) => sum + Number(sale.total), 0) / user.sales.length
          : 0,
      },
    }));
  }
}
