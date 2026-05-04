import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SaleStatus, ProductType } from '@prisma/client';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  async sendInvoiceNotification(invoice: any) {
    try {
      this.logger.log(`Sending invoice notification for ${invoice.invoiceCode}`);

      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { smsSent: true, smsSentAt: new Date() },
      });

      // TODO: Integrate with actual SMS gateway (e.g., Africa's Talking)
      // TODO: Send email to CEO

      return { success: true };
    } catch (error: any) {
      this.logger.error('Failed to send invoice notification', error);
      return { success: false, error: error.message };
    }
  }

  async sendDailySalesSummary(date?: Date) {
    try {
      const targetDate = date || new Date();
      const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

      const sales = await this.prisma.sale.findMany({
        where: {
          saleDate: { gte: startOfDay, lte: endOfDay },
          status: SaleStatus.COMPLETED,
        },
        include: {
          items: { include: { product: true } },
          branch: true,
        },
      });

      const summary = {
        date: targetDate.toISOString().split('T')[0],
        totalSales: sales.length,
        totalAmount: sales.reduce((sum, sale) => sum + Number(sale.total), 0),
        cashSales: sales.filter((s) => s.type === 'CASH').length,
        invoiceSales: sales.filter((s) => s.type === 'INVOICE').length,
        lpgRefills: sales.reduce(
          (sum, sale) => sum + sale.items.filter((i) => i.product.type === ProductType.LPG_REFILL).reduce((itemSum, item) => itemSum + item.quantity, 0),
          0,
        ),
        lpgCylinders: sales.reduce(
          (sum, sale) => sum + sale.items.filter((i) => i.product.type === ProductType.LPG_CYLINDER).reduce((itemSum, item) => itemSum + item.quantity, 0),
          0,
        ),
        electronics: sales.reduce(
          (sum, sale) => sum + sale.items.filter((i) => i.product.type === ProductType.ELECTRONICS).reduce((itemSum, item) => itemSum + item.quantity, 0),
          0,
        ),
        byBranch: {},
      };

      sales.forEach((sale) => {
        const branchName = sale.branch.name;
        if (!summary.byBranch[branchName]) {
          summary.byBranch[branchName] = { sales: 0, amount: 0 };
        }
        summary.byBranch[branchName].sales += 1;
        summary.byBranch[branchName].amount += Number(sale.total);
      });

      await this.prisma.dailySalesSummary.create({
        data: {
          date: startOfDay,
          totalSales: summary.totalSales,
          totalAmount: summary.totalAmount,
          cashSales: summary.cashSales,
          invoiceSales: summary.invoiceSales,
          lpgRefills: summary.lpgRefills,
          lpgCylinders: summary.lpgCylinders,
          electronics: summary.electronics,
          sentAt: new Date(),
        },
      });

      this.logger.log(`Daily sales summary sent for ${summary.date}`);

      return summary;
    } catch (error: any) {
      this.logger.error('Failed to send daily sales summary', error);
      throw error;
    }
  }

  async getDashboardNotifications() {
    const [pendingReturns, pendingDevices, pendingInvoices, lowStockItems, discrepancies] = await Promise.all([
      this.prisma.return.count({ where: { status: 'PENDING' } }),
      this.prisma.device.count({ where: { status: 'PENDING' } }),
      this.prisma.invoice.count({ where: { status: 'PENDING' } }),
      this.prisma.inventory.count({ where: { quantity: { lte: 10 } } }),
      this.prisma.inventory.count({ where: { product: { type: ProductType.LPG_REFILL } } }),
    ]);

    return {
      pendingReturns,
      pendingDevices,
      pendingInvoices,
      lowStockItems,
      discrepancies,
      total: pendingReturns + pendingDevices + pendingInvoices + lowStockItems,
    };
  }
}
