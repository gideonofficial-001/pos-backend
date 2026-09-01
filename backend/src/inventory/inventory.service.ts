import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, MovementType } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  private withComputedEmptyCylinders<
    T extends { quantity: number; fullCylinders: number | null },
  >(item: T) {
    return {
      ...item,
      emptyCylinders:
        item.fullCylinders != null ? item.quantity - item.fullCylinders : null,
    };
  }

  async findAll(query: { branchId?: string; user?: any; lowStock?: boolean }) {
    const { branchId, user, lowStock } = query;
    const where: any = {};

    if (branchId) {
      if (
        user?.role === UserRole.BRANCH_MANAGER &&
        user.branchId !== branchId
      ) {
        throw new ForbiddenException('You can only view your branch inventory');
      }
      where.branchId = branchId;
    } else if (user?.role === UserRole.BRANCH_MANAGER) {
      where.branchId = user.branchId;
    }

    if (lowStock) where.quantity = { lte: 10 };

    const items = await this.prisma.inventory.findMany({
      where,
      include: {
        product: { include: { category: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
      orderBy: { product: { name: 'asc' } },
    });

    return items.map((item) => this.withComputedEmptyCylinders(item));
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
          include: {
            performedBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!inventory) throw new NotFoundException('Inventory item not found');
    return this.withComputedEmptyCylinders(inventory);
  }

  async restock(inventoryId: string, quantity: number, userId: string) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { id: inventoryId },
      include: { product: true },
    });
    if (!inventory) throw new NotFoundException('Inventory item not found');

    const updated = await this.prisma.inventory.update({
      where: { id: inventoryId },
      data: {
        quantity: { increment: quantity },
        fullCylinders:
          inventory.product.type === 'LPG_REFILL'
            ? { increment: quantity }
            : undefined,
        totalRefilled: { increment: quantity },
        lastRestocked: new Date(),
      },
      include: { product: true, branch: true },
    });

    await this.prisma.stockMovement.create({
      data: {
        inventoryId,
        type: MovementType.RESTOCK,
        quantity,
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
    if (!inventory) throw new NotFoundException('Inventory item not found');

    const tracksCylinders = inventory.fullCylinders != null;
    const previousQuantity = inventory.quantity;
    const newQuantity = payload.quantity ?? previousQuantity;
    const newFull = tracksCylinders
      ? (payload.fullCylinders ?? inventory.fullCylinders!)
      : undefined;

    if (tracksCylinders && newFull! > newQuantity) {
      throw new BadRequestException(
        'Full cylinders cannot exceed total shells',
      );
    }

    const difference = newQuantity - previousQuantity;

    const updated = await this.prisma.inventory.update({
      where: { id: inventoryId },
      data: { quantity: newQuantity, fullCylinders: newFull },
      include: { product: true, branch: true },
    });

    await this.prisma.stockMovement.create({
      data: {
        inventoryId,
        type: MovementType.ADJUSTMENT,
        quantity: difference,
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
    const where: any = { quantity: { lte: 10 } };
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

    return items.map((item) => this.withComputedEmptyCylinders(item));
  }

  async getStockMovements(inventoryId?: string, branchId?: string) {
    const where: any = {};
    if (inventoryId) where.inventoryId = inventoryId;
    // branchId filter via inventory relation
    if (branchId) where.inventory = { branchId };

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

async delete(id: string) {
    try {
      await this.prisma.inventory.delete({ where: { id } });
      return { message: 'Item successfully removed from this branch.' };
    } catch (error: any) {
      if (error.code === 'P2003') {
        throw new BadRequestException(
          'Cannot remove this item locally because it has an established stock movement history. Please adjust its quantity to 0 instead to maintain accurate financial audits.'
        );
      }
      throw error;
    }
  }

}
