import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UserRole, SaleType, SaleStatus, MovementType, ProductType } from '@prisma/client';
import { CreateSaleDto } from './dto/create-sale.dto';

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
    private notificationsService: NotificationsService,
  ) {}

  async create(createSaleDto: CreateSaleDto, user: any) {
    const { branchId, type, customerId, customerName, customerPhone, items, discount = 0, notes } = createSaleDto;

    if (user.role === UserRole.BRANCH_MANAGER && user.branchId !== branchId) {
      throw new ForbiddenException('You can only create sales for your assigned branch');
    }

    const now = new Date();
    const currentHour = now.getHours();
    const saleDate = currentHour >= 21 ? new Date(now.setDate(now.getDate() + 1)) : now;

    // 1. VALIDATION PHASE
    for (const item of items) {
      const inventory = await this.prisma.inventory.findUnique({
        where: { branchId_productId: { branchId, productId: item.productId } },
        include: { product: true },
      });

      if (!inventory) throw new BadRequestException(`Product not found in branch inventory`);

      if (inventory.product.type === ProductType.LPG_REFILL || inventory.product.type === ProductType.LPG_CYLINDER) {
        if (inventory.fullCylinders < item.quantity) {
          throw new BadRequestException(`Insufficient full cylinders for ${inventory.product.name}. Available: ${inventory.fullCylinders}`);
        }
      } else {
        if (inventory.quantity < item.quantity) {
          throw new BadRequestException(`Insufficient stock for ${inventory.product.name}. Available: ${inventory.quantity}`);
        }
      }
    }

    // 2. CALCULATION PHASE
    let subtotal = 0;
    const saleItems = [];

    for (const item of items) {
      const product = await this.prisma.product.findUnique({ where: { id: item.productId } });
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

    const finalDiscount = Math.min(discount, subtotal); 
    const total = subtotal - finalDiscount;

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let saleCode = '';
    do {
      saleCode = Array.from({ length: 6 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    } while (await this.prisma.sale.findUnique({ where: { saleCode } }));

    // 3. TRANSACTION & DEDUCTION PHASE
    const sale = await this.prisma.$transaction(async (tx) => {
      const newSale = await tx.sale.create({
        data: {
          saleCode, branchId, userId: user.userId, customerId, type, status: SaleStatus.COMPLETED,
          customerName, customerPhone, subtotal, tax: 0, discount: finalDiscount, total, saleDate, notes,
          items: { create: saleItems },
        },
        include: { items: { include: { product: true } }, branch: true, user: { select: { id: true, firstName: true, lastName: true } } },
      });

      for (const item of items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        const inventory = await tx.inventory.findUnique({ where: { branchId_productId: { branchId, productId: item.productId } } });

        const updateData: any = { totalSold: { increment: item.quantity } };

        if (product.type === ProductType.LPG_REFILL) {
          updateData.fullCylinders = { decrement: item.quantity };
          updateData.emptyCylinders = { increment: item.quantity };
        } else if (product.type === ProductType.LPG_CYLINDER) {
          updateData.fullCylinders = { decrement: item.quantity };
          updateData.quantity = { decrement: item.quantity };
        } else {
          updateData.quantity = { decrement: item.quantity };
        }

        await tx.inventory.update({
          where: { branchId_productId: { branchId, productId: item.productId } },
          data: updateData,
        });

        await tx.stockMovement.create({
          data: {
            inventoryId: inventory.id, productId: item.productId, branchId,
            quantityBefore: inventory.quantity,
            quantityChanged: product.type === ProductType.LPG_REFILL ? 0 : -item.quantity,
            quantityAfter: product.type === ProductType.LPG_REFILL ? inventory.quantity : inventory.quantity - item.quantity,
            movementType: MovementType.SALE, referenceId: newSale.id, referenceType: 'Sale', performedById: user.userId, notes: `Sale ${saleCode}`,
          },
        });
      }
      return newSale;
    });

    // 4. LOGGING PHASE
    await this.auditLogsService.create({
      userId: user.userId, action: 'SALE_CREATED', description: `Created ${type} sale ${saleCode} for KES ${total.toFixed(2)}`,
      entityType: 'Sale', entityId: sale.id, newValues: { type, total, items: saleItems },
    });

    await this.prisma.activityFeed.create({
      data: {
        actorId: user.userId, actorName: `${user.firstName} ${user.lastName}`, branchId: sale.branchId, branchName: sale.branch.name,
        title: 'Sale Completed', message: `${type} sale ${saleCode} for KES ${total.toFixed(2)}`, entityId: sale.id, entityType: 'Sale',
        actionUrl: `/sales-history`, visibleToAdmin: true, visibleToBranch: true,
      },
    });

    if (type === SaleType.INVOICE) {
      await this.notificationsService.create({
        type: 'INVOICE_CREATED', title: 'New Invoice Sale', message: `Invoice sale ${saleCode} created for KES ${total.toFixed(2)}`,
        userId: user.userId, entityId: sale.id, entityType: 'Sale',
      });
    }

    return sale;
  }

  async findAll(query: { branchId?: string; startDate?: string; endDate?: string; type?: string; search?: string; user?: any }) {
    const { branchId, startDate, endDate, type, search, user } = query;
    const where: any = {};

    if (branchId) {
      if (user.role === UserRole.BRANCH_MANAGER && user.branchId !== branchId) throw new ForbiddenException('You can only view your branch sales');
      where.branchId = branchId;
    } else if (user.role === UserRole.BRANCH_MANAGER) {
      where.branchId = user.branchId;
    }

    if (startDate && endDate) where.createdAt = { gte: new Date(startDate), lte: new Date(endDate) };
    if (type) where.type = type;
    if (search) where.saleCode = { contains: search, mode: 'insensitive' };

    return this.prisma.sale.findMany({
      where,
      include: { items: { include: { product: true } }, branch: { select: { id: true, name: true, code: true } }, user: { select: { id: true, firstName: true, lastName: true } }, customer: { select: { id: true, fullName: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user?: any) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: { include: { product: true } }, branch: true, user: { select: { id: true, firstName: true, lastName: true } }, customer: true, returns: true },
    });

    if (!sale) throw new NotFoundException('Sale not found');
    if (user?.role === UserRole.BRANCH_MANAGER && user.branchId !== sale.branchId) throw new ForbiddenException('You can only view your branch sales');
    return sale;
  }

  async findByCode(saleCode: string, user?: any) {
    const sale = await this.prisma.sale.findUnique({
      where: { saleCode },
      include: { items: { include: { product: true } }, branch: true, user: { select: { id: true, firstName: true, lastName: true } }, returns: true },
    });

    if (!sale) throw new NotFoundException('Sale not found');
    if (user?.role === UserRole.BRANCH_MANAGER && user.branchId !== sale.branchId) throw new ForbiddenException('You can only view your branch sales');
    return sale;
  }

  async getWeeklySales(year?: number, week?: number, user?: any) {
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetWeek = week || this.getWeekNumber(now);

    const weekStart = this.getWeekStartDate(targetYear, targetWeek);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const where: any = { createdAt: { gte: weekStart, lte: weekEnd }, status: SaleStatus.COMPLETED };
    if (user?.role === UserRole.BRANCH_MANAGER) where.branchId = user.branchId;

    const sales = await this.prisma.sale.findMany({
      where,
      include: { items: { include: { product: true } }, branch: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const groupedByDate = {};
    sales.forEach((sale) => {
      const date = sale.createdAt.toISOString().split('T')[0];
      if (!groupedByDate[date]) groupedByDate[date] = [];
      groupedByDate[date].push(sale);
    });

    return { weekStart: weekStart.toISOString().split('T')[0], weekEnd: weekEnd.toISOString().split('T')[0], weekNumber: targetWeek, year: targetYear, totalSales: sales.length, totalAmount: sales.reduce((sum, s) => sum + Number(s.total), 0), groupedByDate, sales };
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  private getWeekStartDate(year: number, week: number): Date {
    const januaryFourth = new Date(year, 0, 4);
    const januaryFourthDay = januaryFourth.getDay() || 7;
    const firstMonday = new Date(januaryFourth);
    firstMonday.setDate(januaryFourth.getDate() - januaryFourthDay + 1);
    return new Date(firstMonday.getTime() + (week - 1) * 7 * 86400000);
  }
}
