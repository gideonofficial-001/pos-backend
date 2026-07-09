import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, MovementType } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

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

    return this.prisma.inventory.findMany({
      where,
      include: {
        product: { include: { category: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
      orderBy: { product: { name: 'asc' } },
    });
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
    return inventory;
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

    return updated;
  }

  async adjustStock(
    inventoryId: string, 
    payload: { quantity?: number; fullCylinders?: number; emptyCylinders?: number; reason: string }, 
    userId: string
  ) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { id: inventoryId },
      include: { product: { include: { category: true } } },
    });

    if (!inventory) {
      throw new NotFoundException('Inventory item not found');
    }

    const isLpg = inventory.product.category?.name.toUpperCase().includes('LPG');
    const previousQuantity = inventory.quantity;
    
    let newQuantity = payload.quantity ?? previousQuantity;
    let newFull = inventory.fullCylinders;
    let newEmpty = inventory.emptyCylinders;

    // Dual-column logic for LPG
    if (isLpg && payload.fullCylinders !== undefined && payload.emptyCylinders !== undefined) {
      newFull = payload.fullCylinders;
      newEmpty = payload.emptyCylinders;
      newQuantity = newFull + newEmpty; // Total shells is always Full + Empty
    }

    const difference = newQuantity - previousQuantity;

    const updated = await this.prisma.inventory.update({
      where: { id: inventoryId },
      data: {
        quantity: newQuantity,
        fullCylinders: newFull,
        emptyCylinders: newEmpty,
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

    return updated;
  }

  async getLowStock(user?: any) {
    const where: any = { quantity: { lte: 10 } };
    if (user?.role === UserRole.BRANCH_MANAGER) {
      where.branchId = user.branchId;
    }

    return this.prisma.inventory.findMany({
      where,
      include: {
        product: true,
        branch: { select: { id: true, name: true, code: true } },
      },
      orderBy: { quantity: 'asc' },
    });
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
