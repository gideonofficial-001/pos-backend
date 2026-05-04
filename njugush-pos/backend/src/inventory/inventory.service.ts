import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UserRole } from '@prisma/client';
import { RestockDto } from './dto/restock.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  async getBranchInventory(branchId: string, user: any) {
    if (user.role === UserRole.BRANCH_MANAGER && user.branchId !== branchId) {
      throw new ForbiddenException('Access denied for this branch');
    }

    const inventory = await this.prisma.inventory.findMany({
      where: { branchId },
      include: { product: true },
    });

    return inventory.map((item) => ({
      ...item,
      isLowStock: item.quantity <= item.product.minStockLevel,
    }));
  }

  async getAllInventory() {
    const inventory = await this.prisma.inventory.findMany({
      include: {
        product: true,
        branch: { select: { id: true, name: true, code: true } },
      },
    });

    return inventory.map((item) => ({
      ...item,
      isLowStock: item.quantity <= item.product.minStockLevel,
    }));
  }

  async getProductInventory(productId: string) {
    return this.prisma.inventory.findMany({
      where: { productId },
      include: {
        branch: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async restock(restockDto: RestockDto, performedBy: string) {
    const { branchId, productId, quantity, fullCylinders, emptyCylinders, reason } = restockDto;

    const inventory = await this.prisma.inventory.findUnique({
      where: { branchId_productId: { branchId, productId } },
      include: { product: true },
    });

    if (!inventory) {
      throw new NotFoundException('Inventory record not found');
    }

    const updateData: any = {
      quantity: { increment: quantity },
      lastRestocked: new Date(),
    };

    if (inventory.product.type === 'LPG_REFILL') {
      if (fullCylinders !== undefined) {
        updateData.fullCylinders = { increment: fullCylinders };
        updateData.totalRefilled = { increment: fullCylinders };
      }
      if (emptyCylinders !== undefined) {
        updateData.emptyCylinders = emptyCylinders;
      }
    }

    const updatedInventory = await this.prisma.inventory.update({
      where: { branchId_productId: { branchId, productId } },
      data: updateData,
      include: { product: true, branch: true },
    });

    await this.prisma.stockAdjustment.create({
      data: {
        inventoryId: inventory.id,
        type: 'RESTOCK',
        quantity,
        reason: reason || 'Restocking',
        performedBy,
      },
    });

    await this.auditLogsService.create({
      userId: performedBy,
      action: 'STOCK_RESTOCKED',
      description: `Restocked ${inventory.product.name} at ${updatedInventory.branch.name}`,
      entityType: 'Inventory',
      entityId: inventory.id,
      newValues: restockDto,
    });

    return updatedInventory;
  }

  async adjustStock(adjustStockDto: AdjustStockDto, performedBy: string) {
    const { branchId, productId, quantity, reason } = adjustStockDto;

    const inventory = await this.prisma.inventory.findUnique({
      where: { branchId_productId: { branchId, productId } },
      include: { product: true },
    });

    if (!inventory) {
      throw new NotFoundException('Inventory record not found');
    }

    const oldQuantity = inventory.quantity;
    const newQuantity = oldQuantity + quantity;

    if (newQuantity < 0) {
      throw new BadRequestException('Adjustment would result in negative stock');
    }

    const updatedInventory = await this.prisma.inventory.update({
      where: { branchId_productId: { branchId, productId } },
      data: { quantity: newQuantity },
      include: { product: true, branch: true },
    });

    await this.prisma.stockAdjustment.create({
      data: {
        inventoryId: inventory.id,
        type: 'ADJUSTMENT',
        quantity,
        reason,
        performedBy,
      },
    });

    await this.auditLogsService.create({
      userId: performedBy,
      action: 'STOCK_ADJUSTED',
      description: `Adjusted stock for ${inventory.product.name} at ${updatedInventory.branch.name}`,
      entityType: 'Inventory',
      entityId: inventory.id,
      oldValues: { quantity: oldQuantity },
      newValues: { quantity: newQuantity, reason },
    });

    return updatedInventory;
  }

  async getLowStockAlerts() {
    const allInventory = await this.prisma.inventory.findMany({
      include: { product: true, branch: { select: { id: true, name: true, code: true } } },
    });

    return allInventory.filter((item) => item.quantity <= item.product.minStockLevel);
  }

  async getCylinderReconciliation(branchId?: string) {
    const where: any = { product: { type: 'LPG_REFILL' } };
    if (branchId) where.branchId = branchId;

    const inventory = await this.prisma.inventory.findMany({
      where,
      include: { product: true, branch: true },
    });

    return inventory.map((item) => {
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
  }

  async transferStock(fromBranchId: string, toBranchId: string, productId: string, quantity: number, performedBy: string) {
    const sourceInventory = await this.prisma.inventory.findUnique({
      where: { branchId_productId: { branchId: fromBranchId, productId } },
    });

    if (!sourceInventory || sourceInventory.quantity < quantity) {
      throw new BadRequestException('Insufficient stock in source branch');
    }

    await this.prisma.inventory.update({
      where: { branchId_productId: { branchId: fromBranchId, productId } },
      data: { quantity: { decrement: quantity } },
    });

    await this.prisma.inventory.update({
      where: { branchId_productId: { branchId: toBranchId, productId } },
      data: { quantity: { increment: quantity } },
    });

    await this.auditLogsService.create({
      userId: performedBy,
      action: 'STOCK_ADJUSTED',
      description: `Transferred stock from ${fromBranchId} to ${toBranchId}`,
      entityType: 'Inventory',
      newValues: { fromBranchId, toBranchId, productId, quantity },
    });

    return { message: 'Stock transferred successfully' };
  }
}
