import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransferStatus, TransferItemStatus, MovementType, UserRole, LpgComponent } from '@prisma/client';

interface AuthUser {
  userId: string;
  role: UserRole;
  branchId?: string;
}

function itemLabel(item: { quantity: number; product: { name: string }; lpgComponent?: string | null }): string {
  const v = item.lpgComponent ? ` (${item.lpgComponent})` : '';
  return `${item.product.name}${v} x${item.quantity}`;
}

function buildItemsSummary(items: { quantity: number; product: { name: string }; lpgComponent?: string | null }[]): string {
  return items.map(itemLabel).join(', ');
}

@Injectable()
export class TransfersService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async create(data: CreateTransferDto, user: AuthUser) {
    const fromBranchId = data.fromBranchId || user.branchId;
    const toBranchId = data.toBranchId;
    const { items, notes } = data;

    if (!fromBranchId) throw new BadRequestException('Source branch ID is required');
    if (!items || items.length === 0) throw new BadRequestException('At least one product must be included');
    if (fromBranchId === toBranchId) throw new BadRequestException('Source and destination branches cannot be the same');
    
    if (user.role === UserRole.BRANCH_MANAGER && user.branchId !== fromBranchId) {
      throw new ForbiddenException('You can only transfer from your assigned branch');
    }

    const [sourceBranch, destBranch] = await Promise.all([
      this.prisma.branch.findUnique({ where: { id: fromBranchId } }),
      this.prisma.branch.findUnique({ where: { id: toBranchId } }),
    ]);

    if (!sourceBranch) throw new NotFoundException('Source branch not found');
    if (!destBranch) throw new NotFoundException('Destination branch not found');
    if (!destBranch.isActive) throw new BadRequestException(`${destBranch.name} is inactive and cannot receive transfers`);

    const transferItems: { productId: string; quantity: number; lpgComponent?: LpgComponent }[] = [];

    for (const item of items) {
      if (!item.quantity || item.quantity <= 0)
        throw new BadRequestException('Quantity must be greater than 0 for every item');

      const inventory = await this.prisma.inventory.findUnique({
        where: { branchId_productId: { branchId: fromBranchId, productId: item.productId } },
        include: { product: true },
      });

      if (!inventory) throw new BadRequestException(`Product not found in source branch inventory`);

      const variant = item.variant ?? 'STANDARD';
      const isLpg = inventory.product.isCylinderTracked;
      let lpgComponent: LpgComponent | undefined = undefined;

      if (isLpg) {
        if (variant === 'CYLINDER') {
          const available = inventory.fullCylinders ?? 0;
          if (available < item.quantity) throw new BadRequestException(`Insufficient full cylinders. Available: ${available}`);
          lpgComponent = LpgComponent.CYLINDER;
        } else if (variant === 'REFILL') {
          const available = inventory.fullCylinders ?? 0;
          if (available < item.quantity) throw new BadRequestException(`Insufficient gas refills. Available: ${available}`);
          lpgComponent = LpgComponent.REFILL;
        } else if (variant === 'EMPTY_SHELL') {
          const empties = (inventory.quantity || 0) - (inventory.fullCylinders ?? 0);
          if (empties < item.quantity) throw new BadRequestException(`Insufficient empty shells. Available: ${empties}`);
        }
      } else {
        if (inventory.quantity < item.quantity) {
          throw new BadRequestException(`Insufficient stock. Available: ${inventory.quantity}`);
        }
      }

      transferItems.push({
        productId: item.productId,
        quantity: item.quantity,
        ...(lpgComponent && { lpgComponent }),
      });
    }

    const count = await this.prisma.transfer.count();
    const transferCode = `TRF-${String(count + 1).padStart(5, '0')}`;

    const transfer = await this.prisma.transfer.create({
      data: {
        transferCode,
        fromBranchId,
        toBranchId,
        requestedById: user.userId,
        status: TransferStatus.PENDING,
        notes,
        items: { create: transferItems },
      },
      include: {
        fromBranch: { select: { id: true, name: true, code: true } },
        toBranch:   { select: { id: true, name: true, code: true } },
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { product: true } },
      },
    });

    if (destBranch.managerId) {
      await this.notificationsService.create({
        type: 'TRANSFER_REQUEST',
        title: 'New Transfer Request',
        message: `${transfer.fromBranch.name} wants to send you: ${buildItemsSummary(transfer.items)}`,
        userId: destBranch.managerId,
        entityId: transfer.id,
        entityType: 'Transfer',
      });
    }

    await this.prisma.activityFeed.create({
      data: {
        type: 'TRANSFER_CREATED',
        branchId: fromBranchId,
        title: 'Transfer Requested',
        message: `Transfer from ${transfer.fromBranch.name} to ${transfer.toBranch.name}: ${buildItemsSummary(transfer.items)}`,
        entityId: transfer.id,
        entityType: 'Transfer',
        visibleToBranch: true,
      },
    });

    return transfer;
  }

  async findAll(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, branchId: true },
    });

    if (!user) throw new NotFoundException('User not found');

    const where: any = {};
    if (user.branchId) {
      where.OR = [
        { fromBranchId: user.branchId },
        { toBranchId: user.branchId },
      ];
    }

    return this.prisma.transfer.findMany({
      where,
      include: {
        fromBranch:  { select: { id: true, name: true } },
        toBranch:    { select: { id: true, name: true } },
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
        items: {
          include: { product: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: {
        fromBranch:  true,
        toBranch:    true,
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
        items: {
          include: { product: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    return transfer;
  }

  private async applyItemStockMovement(tx: any, transfer: any, item: any, performedById: string) {
    const lpgComponent = item.lpgComponent;
    const isLpg = item.product?.isCylinderTracked;

    // ── Deduct from sender ────────────────────────────────────────────────
    const sourceInv = await tx.inventory.findUnique({
      where: { branchId_productId: { branchId: transfer.fromBranchId, productId: item.productId } },
    });

    if (sourceInv) {
      let updateData: any = {};

      if (isLpg) {
        if (lpgComponent === LpgComponent.CYLINDER) {
          updateData.quantity = { decrement: item.quantity };
          updateData.fullCylinders = { decrement: item.quantity };
        } else if (lpgComponent === LpgComponent.REFILL) {
          updateData.fullCylinders = { decrement: item.quantity };
        } else {
          updateData.quantity = { decrement: item.quantity };
        }
      } else {
        updateData.quantity = { decrement: item.quantity };
      }

      await tx.inventory.update({ where: { id: sourceInv.id }, data: updateData });
      await tx.stockMovement.create({
        data: {
          inventoryId: sourceInv.id,
          type: MovementType.TRANSFER_OUT,
          quantity: -item.quantity,
          referenceId: transfer.id,
          referenceType: 'Transfer',
          performedById,
          notes: `Transfer ${transfer.transferCode} out${lpgComponent ? ` (${lpgComponent})` : ''}`,
        },
      });
    }

    // ── Add to receiver ───────────────────────────────────────────────────
    const destInv = await tx.inventory.findUnique({
      where: { branchId_productId: { branchId: transfer.toBranchId, productId: item.productId } },
    });

    if (destInv) {
      let updateData: any = {};

      if (isLpg) {
        if (lpgComponent === LpgComponent.CYLINDER) {
          updateData.quantity = { increment: item.quantity };
          updateData.fullCylinders = { increment: item.quantity };
        } else if (lpgComponent === LpgComponent.REFILL) {
          updateData.fullCylinders = { increment: item.quantity };
        } else {
          updateData.quantity = { increment: item.quantity };
        }
      } else {
        updateData.quantity = { increment: item.quantity };
      }

      await tx.inventory.update({ where: { id: destInv.id }, data: updateData });
      await tx.stockMovement.create({
        data: {
          inventoryId: destInv.id,
          type: MovementType.TRANSFER_IN,
          quantity: item.quantity,
          referenceId: transfer.id,
          referenceType: 'Transfer',
          performedById,
          notes: `Transfer ${transfer.transferCode} in${lpgComponent ? ` (${lpgComponent})` : ''}`,
        },
      });
    } else {
      const createData: any = { branchId: transfer.toBranchId, productId: item.productId };
      
      if (isLpg) {
        if (lpgComponent === LpgComponent.CYLINDER) {
          createData.quantity = item.quantity;
          createData.fullCylinders = item.quantity;
        } else if (lpgComponent === LpgComponent.REFILL) {
          createData.quantity = 0;
          createData.fullCylinders = item.quantity;
        } else {
          createData.quantity = item.quantity;
          createData.fullCylinders = 0;
        }
      } else {
        createData.quantity = item.quantity;
      }
      await tx.inventory.create({ data: createData });
    }
  }

  private async recomputeTransferStatus(transferId: string): Promise<TransferStatus> {
    const items = await this.prisma.transferItem.findMany({ where: { transferId } });
    const allResolved = items.every((i) => i.status !== TransferItemStatus.PENDING);
    const anyResolved = items.some((i) => i.status !== TransferItemStatus.PENDING);

    const status: TransferStatus = allResolved
      ? TransferStatus.COMPLETED
      : anyResolved
      ? TransferStatus.PARTIAL
      : TransferStatus.PENDING;

    await this.prisma.transfer.update({ where: { id: transferId }, data: { status } });
    return status;
  }

  private assertIsReceivingManager(transfer: { toBranchId: string }, user: AuthUser) {
    const canRespond =
      (user.role === UserRole.BRANCH_MANAGER || user.role === UserRole.SUPER_ADMIN || user.role === UserRole.OVERALL_MANAGER) &&
      (user.role !== UserRole.BRANCH_MANAGER || user.branchId === transfer.toBranchId);
    
    if (!canRespond)
      throw new ForbiddenException('Only the receiving branch manager or an admin can act on this transfer');
  }

  async approveItem(transferId: string, itemId: string, user: AuthUser) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      include: { items: { include: { product: true } } },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    this.assertIsReceivingManager(transfer, user);

    const item = transfer.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Transfer item not found');
    if (item.status !== TransferItemStatus.PENDING)
      throw new BadRequestException(`This item has already been ${item.status.toLowerCase()}`);

    await this.prisma.$transaction(async (tx) => {
      await this.applyItemStockMovement(tx, transfer, item, user.userId);
      await tx.transferItem.update({
        where: { id: itemId },
        data: { status: TransferItemStatus.ACCEPTED },
      });
    });

    await this.recomputeTransferStatus(transferId);

    const fromBranch = await this.prisma.branch.findUnique({ where: { id: transfer.fromBranchId } });
    if (fromBranch?.managerId) {
      await this.notificationsService.create({
        type: 'TRANSFER_RESPONSE',
        title: 'Transfer Item Accepted',
        message: `${itemLabel(item)} was accepted`,
        userId: fromBranch.managerId,
        entityId: transferId,
        entityType: 'Transfer',
      });
    }

    return this.findOne(transferId);
  }

  async rejectItem(transferId: string, itemId: string, user: AuthUser, rejectionReason: string) {
    if (!rejectionReason?.trim()) throw new BadRequestException('A rejection reason is required');

    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      include: { items: { include: { product: true } } },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    this.assertIsReceivingManager(transfer, user);

    const item = transfer.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Transfer item not found');
    if (item.status !== TransferItemStatus.PENDING)
      throw new BadRequestException(`This item has already been ${item.status.toLowerCase()}`);

    await this.prisma.transferItem.update({
      where: { id: itemId },
      data: { status: TransferItemStatus.REJECTED, notes: rejectionReason.trim() },
    });
    await this.recomputeTransferStatus(transferId);

    const fromBranch = await this.prisma.branch.findUnique({ where: { id: transfer.fromBranchId } });
    if (fromBranch?.managerId) {
      await this.notificationsService.create({
        type: 'TRANSFER_RESPONSE',
        title: 'Transfer Item Rejected',
        message: `${itemLabel(item)} was rejected. Reason: ${rejectionReason}`,
        userId: fromBranch.managerId,
        entityId: transferId,
        entityType: 'Transfer',
      });
    }

    return this.findOne(transferId);
  }

  async approve(id: string, user: AuthUser) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    this.assertIsReceivingManager(transfer, user);

    const pending = transfer.items.filter((i) => i.status === TransferItemStatus.PENDING);
    if (pending.length === 0) throw new BadRequestException('No pending items left to approve');

    await this.prisma.$transaction(async (tx) => {
      for (const item of pending) {
        await this.applyItemStockMovement(tx, transfer, item, user.userId);
        await tx.transferItem.update({ where: { id: item.id }, data: { status: TransferItemStatus.ACCEPTED } });
      }
    });

    await this.recomputeTransferStatus(id);

    const fromBranch = await this.prisma.branch.findUnique({ where: { id: transfer.fromBranchId } });
    if (fromBranch?.managerId) {
      await this.notificationsService.create({
        type: 'TRANSFER_RESPONSE',
        title: 'Transfer Accepted',
        message: `All items accepted: ${buildItemsSummary(pending)}`,
        userId: fromBranch.managerId,
        entityId: id,
        entityType: 'Transfer',
      });
    }

    return this.findOne(id);
  }

  async reject(id: string, user: AuthUser, rejectionReason: string) {
    if (!rejectionReason?.trim()) throw new BadRequestException('A rejection reason is required');

    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    this.assertIsReceivingManager(transfer, user);

    const pending = transfer.items.filter((i) => i.status === TransferItemStatus.PENDING);
    if (pending.length === 0) throw new BadRequestException('No pending items left to reject');

    await this.prisma.transferItem.updateMany({
      where: { id: { in: pending.map((i) => i.id) } },
      data: { status: TransferItemStatus.REJECTED, notes: rejectionReason.trim() },
    });
    await this.recomputeTransferStatus(id);

    const fromBranch = await this.prisma.branch.findUnique({ where: { id: transfer.fromBranchId } });
    if (fromBranch?.managerId) {
      await this.notificationsService.create({
        type: 'TRANSFER_RESPONSE',
        title: 'Transfer Rejected',
        message: `Items rejected: ${buildItemsSummary(pending)}. Reason: ${rejectionReason}`,
        userId: fromBranch.managerId,
        entityId: id,
        entityType: 'Transfer',
      });
    }

    return this.findOne(id);
  }

  async cancel(id: string, user: AuthUser) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: {
        toBranch: { select: { managerId: true } },
        items:    { include: { product: true } },
      },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');

    if (!transfer.items.every((i) => i.status === TransferItemStatus.PENDING))
      throw new BadRequestException('Cannot cancel — some items have already been accepted or rejected');
    if (transfer.status !== TransferStatus.PENDING)
      throw new BadRequestException(`Transfer is already ${transfer.status.toLowerCase()}`);
    if (user.role === UserRole.BRANCH_MANAGER && transfer.requestedById !== user.userId)
      throw new ForbiddenException('Only the manager who created this transfer can cancel it');

    await this.prisma.transfer.update({ where: { id }, data: { status: TransferStatus.CANCELLED } });

    if (transfer.toBranch?.managerId) {
      await this.notificationsService.create({
        type: 'TRANSFER_CANCELLED',
        title: 'Transfer Cancelled',
        message: `Transfer of ${buildItemsSummary(transfer.items)} to your branch was cancelled`,
        userId: transfer.toBranch.managerId,
        entityId: id,
        entityType: 'Transfer',
      });
    }

    return this.findOne(id);
  }
}
