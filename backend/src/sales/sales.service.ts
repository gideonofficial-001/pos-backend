import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  UserRole,
  SaleType,
  SaleStatus,
  MovementType,
  ProductType,
  LpgSaleVariant,
} from '@prisma/client';
import { CreateSaleDto } from './dto/create-sale.dto';

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
    private notificationsService: NotificationsService,
  ) {}

  async create(createSaleDto: CreateSaleDto, user: any) {
    const { branchId, type, customerId, items, discount = 0, notes } =
      createSaleDto;

    if (
      user.role === UserRole.BRANCH_MANAGER &&
      user.branchId !== branchId
    ) {
      throw new ForbiddenException(
        'You can only create sales for your assigned branch',
      );
    }

    // ── 1. VALIDATION PHASE ────────────────────────────────────────────────
    for (const item of items) {
      const inventory = await this.prisma.inventory.findUnique({
        where: { branchId_productId: { branchId, productId: item.productId } },
        include: { product: true },
      });

      if (!inventory) {
        throw new BadRequestException(`Product not found in branch inventory`);
      }

      const variant = this.resolveVariant(inventory.product.type, item.lpgVariant);
      const availableEmpty = inventory.fullCylinders != null ? inventory.quantity - inventory.fullCylinders : 0;

      if (variant === LpgSaleVariant.EMPTY_SHELL) {
        if (availableEmpty < item.quantity) {
          throw new BadRequestException(`Insufficient empty shells for ${inventory.product.name}. Available: ${availableEmpty}`);
        }
      } else if (variant === LpgSaleVariant.REFILL || variant === LpgSaleVariant.COMPLETE_SET || inventory.product.type === ProductType.LPG_CYLINDER) {
        // Complete sets only validate gas (fullCylinders)
        if ((inventory.fullCylinders ?? 0) < item.quantity) {
          throw new BadRequestException(`Insufficient full cylinders for ${inventory.product.name}. Available: ${inventory.fullCylinders ?? 0}`);
        }
      } else {
        if (inventory.quantity < item.quantity) {
          throw new BadRequestException(`Insufficient stock for ${inventory.product.name}. Available: ${inventory.quantity}`);
        }
      }
    }


    // ── 2. CALCULATION ─────────────────────────────────────────────────────
    let subtotal = 0;
    const saleItems: any[] = [];

    for (const item of items) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
      });
      const variant = this.resolveVariant(product.type, item.lpgVariant);

      // Determine Retail vs Wholesale Pricing
      let basePrice = Number(product.price);
      let emptyPrice = Number(product.emptyPrice || 0);

      if (type === SaleType.WHOLESALE) {
        basePrice = Number(product.wholesalePrice || product.price);
        emptyPrice = Number(product.wholesaleEmptyPrice || product.emptyPrice || 0);
      }

      let unitPrice = basePrice;
      if (variant === LpgSaleVariant.EMPTY_SHELL) {
        unitPrice = emptyPrice;
        if (emptyPrice === 0) throw new BadRequestException(`Empty shell price is not configured for ${product.name}`);
      } else if (variant === LpgSaleVariant.COMPLETE_SET) {
        if (emptyPrice === 0) throw new BadRequestException(`Empty shell price is not configured for ${product.name}`);
        unitPrice = basePrice + emptyPrice;
      }

      const total = unitPrice * item.quantity;
      subtotal += total;
      saleItems.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        total,
        lpgVariant: variant ?? undefined,
      });
    }

    const finalDiscount = Math.min(Number(discount), subtotal);
    const total = subtotal - finalDiscount;

    // Unique sale code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let saleCode = '';
    do {
      saleCode = Array.from(
        { length: 6 },
        () => chars.charAt(Math.floor(Math.random() * chars.length)),
      ).join('');
    } while (await this.prisma.sale.findUnique({ where: { saleCode } }));
  }

        // ── 3. TRANSACTION ─────────────────────────────────────────────────────
    const sale = await this.prisma.$transaction(async (tx) => {
      const newSale = await tx.sale.create({
        data: {
          saleCode,
          branchId,
          userId: user.userId,
          customerId,
          type,
          status: SaleStatus.COMPLETED,
          subtotal,
          discount: finalDiscount,
          total,
          notes,
          saleItems: { create: saleItems },
        },
        include: {
          saleItems: { include: { product: true } },
          branch: true,
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      // ---- NEW: AUTOMATIC INVOICE GENERATION ----
      if (type === SaleType.INVOICE && customerId) {
        const invCount = await tx.invoice.count();
        const invoiceCode = `INV-${String(invCount + 1).padStart(5, '0')}`;
        
        await tx.invoice.create({
          data: {
            invoiceCode,
            branchId,
            customerId,
            userId: user.userId,
            saleId: newSale.id,
            status: 'PENDING',
            subtotal,
            discount: finalDiscount,
            total,
            balance: total,
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default due date 7 days
            notes: notes || 'Auto-generated from POS checkout'
          }
        });
      }
      // -------------------------------------------

      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });
        const inventory = await tx.inventory.findUnique({
          where: {
            branchId_productId: { branchId, productId: item.productId },
          },
        });
        const variant = this.resolveVariant(product.type, item.lpgVariant);

        const updateData: any = { totalSold: { increment: item.quantity } };
        let quantityDelta = -item.quantity;

        if (product.type === ProductType.LPG_REFILL) {
          if (variant === LpgSaleVariant.REFILL) {
            updateData.fullCylinders = { decrement: item.quantity };
            quantityDelta = 0;
          } else if (variant === LpgSaleVariant.EMPTY_SHELL) {
            updateData.quantity = { decrement: item.quantity };
          } else if (variant === LpgSaleVariant.COMPLETE_SET) {
            updateData.fullCylinders = { decrement: item.quantity };
            updateData.quantity = { decrement: item.quantity };
          }
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
            inventoryId: inventory.id,
            type: MovementType.SALE,
            quantity: quantityDelta,
            referenceId: newSale.id,
            referenceType: 'Sale',
            performedById: user.userId,
            notes: `Sale ${saleCode}${variant ? ` (${variant})` : ''}`,
          },
        });
      }

      return newSale;
    });

    // ── 4. LOGGING ─────────────────────────────────────────────────────────
    await this.auditLogsService.create({
      userId: user.userId,
      action: 'SALE_CREATED',
      description: `Created ${type} sale ${saleCode} for KES ${total.toFixed(2)}`,
      entityType: 'Sale',
      entityId: sale.id,
      newValues: { type, total, items: saleItems },
    });

    await this.prisma.activityFeed.create({
      data: {
        type: 'SALE_COMPLETED',
        branchId: sale.branchId,
        title: type === SaleType.INVOICE ? 'Invoice Created' : 'Sale Completed',
        message: `${type} sale ${saleCode} for KES ${total.toFixed(2)}`,
        entityId: sale.id,
        entityType: 'Sale',
        visibleToBranch: true,
      },
    });

    // NOTIFY ALL ADMINS ABOUT THE INVOICE
    if (type === SaleType.INVOICE) {
      const admins = await this.prisma.user.findMany({
        where: { role: { in: [UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER] } },
        select: { id: true },
      });
      
      const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });

      await Promise.all(
        admins.map((admin) =>
          this.notificationsService.create({
            type: 'INVOICE_CREATED',
            title: 'New Invoice Issued',
            message: `${branch?.name} issued an invoice (${saleCode}) for KES ${total.toFixed(2)}`,
            userId: admin.id,
            entityId: sale.id,
            entityType: 'Sale',
          }),
        ),
      );
    }

    return sale;
  }

  // ... (Keep the rest of findAll, findOne, findByCode, getWeeklySales exactly the same) ...
  async findAll(query: {
    branchId?: string;
    startDate?: string;
    endDate?: string;
    type?: string;
    search?: string;
    user?: any;
  }) {
    const { branchId, startDate, endDate, type, search, user } = query;
    const where: any = {};

    if (branchId) {
      if (
        user?.role === UserRole.BRANCH_MANAGER &&
        user.branchId !== branchId
      ) {
        throw new ForbiddenException('You can only view your branch sales');
      }
      where.branchId = branchId;
    } else if (user?.role === UserRole.BRANCH_MANAGER) {
      where.branchId = user.branchId;
    }

    if (startDate && endDate) {
      where.createdAt = { gte: new Date(startDate), lte: new Date(endDate) };
    }
    if (type) where.type = type;
    if (search) where.saleCode = { contains: search, mode: 'insensitive' };

    return this.prisma.sale.findMany({
      where,
      include: {
        saleItems: { include: { product: true } },
        branch: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user?: any) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        saleItems: { include: { product: true } },
        branch: true,
        user: { select: { id: true, firstName: true, lastName: true } },
        customer: true,
        returns: true,
      },
    });

    if (!sale) throw new NotFoundException('Sale not found');
    if (
      user?.role === UserRole.BRANCH_MANAGER &&
      user.branchId !== sale.branchId
    ) {
      throw new ForbiddenException('You can only view your branch sales');
    }
    return sale;
  }

  async findByCode(saleCode: string, user?: any) {
    const sale = await this.prisma.sale.findUnique({
      where: { saleCode },
      include: {
        saleItems: { include: { product: true } },
        branch: true,
        user: { select: { id: true, firstName: true, lastName: true } },
        returns: true,
      },
    });

    if (!sale) throw new NotFoundException('Sale not found');
    if (
      user?.role === UserRole.BRANCH_MANAGER &&
      user.branchId !== sale.branchId
    ) {
      throw new ForbiddenException('You can only view your branch sales');
    }
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

    const where: any = {
      createdAt: { gte: weekStart, lte: weekEnd },
      status: SaleStatus.COMPLETED,
    };
    if (user?.role === UserRole.BRANCH_MANAGER) {
      where.branchId = user.branchId;
    }

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        saleItems: { include: { product: true } },
        branch: { select: { name: true } },
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const groupedByDate: Record<string, typeof sales> = {};
    sales.forEach((sale) => {
      const date = sale.createdAt.toISOString().split('T')[0];
      if (!groupedByDate[date]) groupedByDate[date] = [];
      groupedByDate[date].push(sale);
    });

    return {
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0],
      weekNumber: targetWeek,
      year: targetYear,
      totalSales: sales.length,
      totalAmount: sales.reduce((sum, s) => sum + Number(s.total), 0),
      groupedByDate,
      sales,
    };
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(
      ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
  }

  private getWeekStartDate(year: number, week: number): Date {
    const jan4 = new Date(year, 0, 4);
    const jan4Day = jan4.getDay() || 7;
    const firstMonday = new Date(jan4);
    firstMonday.setDate(jan4.getDate() - jan4Day + 1);
    return new Date(firstMonday.getTime() + (week - 1) * 7 * 86400000);
  }

  private resolveVariant(
    productType: ProductType,
    requested?: LpgSaleVariant,
  ): LpgSaleVariant | null {
    if (productType !== ProductType.LPG_REFILL) return null;
    return requested ?? LpgSaleVariant.REFILL;
  }
}
