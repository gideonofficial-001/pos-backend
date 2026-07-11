import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, MovementType } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  // Empty cylinders are never stored — always derived as total shells
  // (quantity) minus shells currently holding gas (fullCylinders). This
  // keeps the two numbers from ever drifting apart, and matches reality
  // across every transaction type (restock, refill swap, empty-shell sale,
  // complete-set sale) with no extra bookkeeping anywhere else.
  private withComputedEmptyCylinders<T extends { quantity: number; fullCylinders: number | null }>(item: T) {
    return {
      ...item,
      emptyCylinders: item.fullCylinders != null ? item.quantity - item.fullCylinders : null,
    };
  }

  async findAll(query: { branchId?: string; user?: any; lowStock?: boolean }) {
    const { branchId, user, lowStock } = query;
    const where: any = {};

    if (branchId) {
      if (user?.role === UserRole.BRANCH_MANAGER && user.branchId !== branchId) {
        throw new ForbiddenException('You can only view your branch inventory');
      }
      where.branchId = branchId;
    } else if (user?.role === UserRole.BRANCH_MANAGER) {
      where.branchId = user.branchId;
    }

    if (lowStock) {
      where.quantity = { lte: 10 };
    }

    const items = await this.prisma.inventory.findMany({
      where,
      include: {
        product: { include: { category: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
      orderBy: { product: { name: 'asc' } },
    });

    return items.map(item => this.withComputedEmptyCylinders(item));
  }

  async findOne(id: string) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { id },
      include: {
        product: { include: { category: true } },
        branch: true,
        stockMovements: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { performedBy: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    if (!inventory) {
      throw new NotFoundException('Inventory item not found');
    }

    return this.withComputedEmptyCylinders(inventory);
  }

  async restock(inventoryId: string, quantity: number, userId: string) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { id: inventoryId },
      include: { product: true },
    });

    if (!inventory) {
      throw new NotFoundException('Inventory item not found');
    }

    const previousQuantity = inventory.quantity;

    const updated = await this.prisma.inventory.update({
      where: { id: inventoryId },
      data: {
        quantity: { increment: quantity },
        // A restock brings in shells that are already full, so both totals
        // rise together — the derived empty count is untouched.
        fullCylinders: inventory.product.type === 'LPG_REFILL' ? { increment: quantity } : undefined,
        totalRefilled: { increment: quantity },
        lastRestocked: new Date(),
      },
      include: { product: true, branch: true },
    });

    await this.prisma.stockMovement.create({
      data: {
        inventoryId,
        productId: inventory.productId,
        branchId: inventory.branchId,
        quantityBefore: previousQuantity,
        quantityChanged: quantity,
        quantityAfter: previousQuantity + quantity,
        movementType: MovementType.RESTOCK,
        performedById: userId,
        notes: `Restocked ${quantity} units`,
      },
    });

    return this.withComputedEmptyCylinders(updated);
  }

  async adjustStock(
    inventoryId: string,
    payload: { quantity?: number; fullCylinders?: number; reason: string },
    userId: string,
  ) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { id: inventoryId },
      include: { product: true },
    });

    if (!inventory) {
      throw new NotFoundException('Inventory item not found');
    }

    // Whether this product tracks the full/empty cylinder split at all.
    // (Replaces the old category-name string match with a direct data check.)
    const tracksCylinders = inventory.fullCylinders != null;
    const previousQuantity = inventory.quantity;

    const newQuantity = payload.quantity ?? previousQuantity;
    const newFull = tracksCylinders ? payload.fullCylinders ?? inventory.fullCylinders! : undefined;

    if (tracksCylinders && newFull! > newQuantity) {
      throw new BadRequestException('Full cylinders cannot exceed total shells');
    }

    const difference = newQuantity - previousQuantity;

    const updated = await this.prisma.inventory.update({
      where: { id: inventoryId },
      data: {
        quantity: newQuantity,
        fullCylinders: newFull,
      },
      include: { product: true, branch: true },
    });

    await this.prisma.stockMovement.create({
      data: {
        inventoryId,
        productId: inventory.productId,
        branchId: inventory.branchId,
        quantityBefore: previousQuantity,
        quantityChanged: difference,
        quantityAfter: newQuantity,
        movementType: MovementType.ADJUSTMENT,
        performedById: userId,
        notes: payload.reason,
      },
    });

    await this.prisma.stockAdjustment.create({
      data: {
        inventoryId,
        type: difference >= 0 ? 'INCREASE' : 'DECREASE',
        quantity: Math.abs(difference),
        reason: payload.reason,
        userId,
      },
    });

    return this.withComputedEmptyCylinders(updated);
  }

  async getLowStock(user?: any) {
    const where: any = {
      quantity: { lte: 10 },
    };

    if (user?.role === UserRole.BRANCH_MANAGER) {
      where.branchId = user.branchId;
    }

    const items = await this.prisma.inventory.findMany({
      where,
      include: {
        product: true,
        branch: { select: { id: true, name: true, code: true } },
      },
      orderBy: { quantity: 'asc' },
    });

    return items.map(item => this.withComputedEmptyCylinders(item));
  }

  async getStockMovements(inventoryId?: string, branchId?: string) {
    const where: any = {};
    if (inventoryId) where.inventoryId = inventoryId;
    if (branchId) where.branchId = branchId;

    return this.prisma.stockMovement.findMany({
      where,
      include: {
        inventory: { include: { product: { select: { name: true } } } },
        performedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
