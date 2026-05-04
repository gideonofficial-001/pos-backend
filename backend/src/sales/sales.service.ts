import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UserRole, SaleType, SaleStatus, ProductType } from '@prisma/client';
import { CreateSaleDto } from './dto/create-sale.dto';

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
    private notificationsService: NotificationsService,
  ) {}

  async create(createSaleDto: CreateSaleDto, user: any) {
    const { branchId, type, customerName, customerPhone, items, notes } = createSaleDto;

    if (user.role === UserRole.BRANCH_MANAGER && user.branchId !== branchId) {
      throw new ForbiddenException('Access denied for this branch');
    }

    // Calculate sale date (sales after 9PM count as next day)
    const now = new Date();
    const currentHour = now.getHours();
    const saleDate = currentHour >= 21
      ? new Date(now.setDate(now.getDate() + 1))
      : now;

    // Validate stock availability
    for (const item of items) {
      const inventory = await this.prisma.inventory.findUnique({
        where: { branchId_productId: { branchId, productId: item.productId } },
        include: { product: true },
      });

      if (!inventory) {
        throw new BadRequestException(`Product not found in branch inventory`);
      }

      if (inventory.quantity < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for ${inventory.product.name}. Available: ${inventory.quantity}, Requested: ${item.quantity}`,
        );
      }
    }

    // Calculate totals
    let subtotal = 0;
    const saleItems = [];

    for (const item of items) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
      });

      const total = Number(product.price) * item.quantity;
      subtotal += total;

      saleItems.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: product.price,
        total,
        isRefill: product.type === ProductType.LPG_REFILL,
      });
    }

    const tax = 0;
    const discount = 0;
    const total = subtotal + tax - discount;

    // Generate unique sale code (6-8 chars + year)
    const year = saleDate.getFullYear();
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const saleCode = `${randomCode}-${year}`;

    // Create sale
    const sale = await this.prisma.sale.create({
      data: {
        saleCode,
        branchId,
        userId: user.userId,
        type,
        status: SaleStatus.COMPLETED,
        customerName,
        customerPhone,
        subtotal,
        tax,
        discount,
        total,
        saleDate,
        notes,
        items: { create: saleItems },
      },
      include: {
        items: { include: { product: true } },
        branch: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Update inventory
    for (const item of items) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
      });

      const updateData: any = {
        quantity: { decrement: item.quantity },
      };

      if (product.type === ProductType.LPG_REFILL) {
        updateData.fullCylinders = { decrement: item.quantity };
        updateData.emptyCylinders = { increment: item.quantity };
        updateData.totalSold = { increment: item.quantity };
      }

      await this.prisma.inventory.update({
        where: { branchId_productId: { branchId, productId: item.productId } },
        data: updateData,
      });
    }

    await this.auditLogsService.create({
      userId: user.userId,
      action: 'SALE_CREATED',
      description: `Created ${type} sale ${saleCode} for ${total}`,
      entityType: 'Sale',
      entityId: sale.id,
      newValues: createSaleDto,
    });

    return sale;
  }

  async findAll(query: { branchId?: string; startDate?: string; endDate?: string; type?: SaleType; user?: any }) {
    const { branchId, startDate, endDate, type, user } = query;

    const where: any = {};

    if (branchId) {
      if (user.role === UserRole.BRANCH_MANAGER && user.branchId !== branchId) {
        throw new ForbiddenException('Access denied for this branch');
      }
      where.branchId = branchId;
    } else if (user.role === UserRole.BRANCH_MANAGER) {
      where.branchId = user.branchId;
    }

    if (startDate && endDate) {
      where.saleDate = { gte: new Date(startDate), lte: new Date(endDate) };
    }

    if (type) {
      where.type = type;
    }

    return this.prisma.sale.findMany({
      where,
      include: {
        items: { include: { product: true } },
        branch: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user: any) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } },
        branch: true,
        user: { select: { id: true, firstName: true, lastName: true } },
        returns: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    if (user.role === UserRole.BRANCH_MANAGER && user.branchId !== sale.branchId) {
      throw new ForbiddenException('Access denied for this sale');
    }

    return sale;
  }

  async findByCode(saleCode: string, user: any) {
    const sale = await this.prisma.sale.findUnique({
      where: { saleCode },
      include: {
        items: { include: { product: true } },
        branch: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    if (user.role === UserRole.BRANCH_MANAGER && user.branchId !== sale.branchId) {
      throw new ForbiddenException('Access denied for this sale');
    }

    return sale;
  }

  async getDailySales(branchId?: string, date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    const where: any = {
      saleDate: { gte: startOfDay, lte: endOfDay },
      status: SaleStatus.COMPLETED,
    };

    if (branchId) {
      where.branchId = branchId;
    }

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        items: { include: { product: true } },
        branch: true,
      },
    });

    const summary = {
      totalSales: sales.length,
      totalAmount: sales.reduce((sum, sale) => sum + Number(sale.total), 0),
      cashSales: sales.filter((s) => s.type === SaleType.CASH).length,
      invoiceSales: sales.filter((s) => s.type === SaleType.INVOICE).length,
      lpgRefills: sales.reduce(
        (sum, sale) => sum + sale.items.filter((i) => i.product.type === ProductType.LPG_REFILL).length,
        0,
      ),
      lpgCylinders: sales.reduce(
        (sum, sale) => sum + sale.items.filter((i) => i.product.type === ProductType.LPG_CYLINDER).length,
        0,
      ),
      electronics: sales.reduce(
        (sum, sale) => sum + sale.items.filter((i) => i.product.type === ProductType.ELECTRONICS).length,
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

    return summary;
  }
}
