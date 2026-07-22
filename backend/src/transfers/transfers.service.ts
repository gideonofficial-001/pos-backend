import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransferStatus, TransferItemStatus, TransferItemVariant, MovementType, UserRole } from '@prisma/client';

interface AuthUser {
  userId: string;
  role: UserRole;
  branchId?: string;
  firstName?: string;
  lastName?: string;
}

function itemLabel(item: { quantity: number; variant: string; product: { name: string } }): string {
  const suffix = item.variant === 'REFILL' ? ' (Refill)' : item.variant === 'EMPTY_SHELL' ? ' (Empty Shell)' : '';
  return `${item.product.name}${suffix} x${item.quantity}`;
}

function buildItemsSummary(items: { quantity: number; variant: string; product: { name: string } }[]): string {
  return items.map(itemLabel).join(', ');
}

@Injectable()
export class TransfersService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async create(data: CreateTransferDto, user: AuthUser) {
    const { fromBranchId, toBranchId, items, notes } = data;

    if (!items || items.length === 0) {
      throw new BadRequestException('At least one product must be included in the transfer');
    }

    if (fromBranchId === toBranchId) {
      throw new BadRequestException('Source and destination branches cannot be the same');
    }

    // Validate branch access for branch managers
    if (user.role === UserRole.BRANCH_MANAGER && user.branchId !== fromBranchId) {
      throw new ForbiddenException('You can only transfer from your assigned branch');
    }

    const [sourceBranch, destBranch] = await Promise.all([
      this.prisma.branch.findUnique({ where: { id: fromBranchId } }),
      this.prisma.branch.findUnique({ where: { id: toBranchId } }),
    ]);

    if (!sourceBranch) {
      throw new NotFoundException('Source branch not found');
    }
    if (!destBranch) {
      throw new NotFoundException('Destination branch not found');
    }
    if (!destBranch.isActive) {
      throw new BadRequestException(`${destBranch.name} is inactive and cannot receive transfers`);
    }

    for (const item of items) {
      if (!item.quantity || item.quantity <= 0) {
        throw new BadRequestException('Quantity must be greater than 0 for every item');
      }
    }

    // Validate stock availability per item, variant-aware, and build the
    // records to create.
    const transferItems: { productId: string; inventoryId: string; quantity: number; variant: TransferItemVariant }[] = [];
    for (const item of items) {
      const variant: TransferItemVariant = (item.variant ?? 'STANDARD') as TransferItemVariant;

      const inventory = await this.prisma.inventory.findUnique({
        where: { branchId_productId: { branchId: fromBranchId, productId: item.productId } },
        include: { product: true },
      });

      if (!inventory) {
        throw new BadRequestException('Product not found in source branch');
      }

      // Cylinder-tracked LPG products must specify which stock is moving
      // (full cylinders vs empty shells) instead of one merged quantity.
      if (inventory.product.isCylinderTracked) {
        if (variant === TransferItemVariant.STANDARD) {
          throw new BadRequestException(
            `${inventory.product.name} tracks cylinders — specify whether you're sending Refill (full) or Empty Shell cylinders`,
          );
        }
      } else if (variant !== TransferItemVariant.STANDARD) {
        throw new BadRequestException(`${inventory.product.name} does not support Refill/Empty Shell transfers`);
      }

      if (variant === TransferItemVariant.REFILL) {
        const availableFull = inventory.fullCylinders ?? 0;
        if (availableFull < item.quantity) {
          throw new BadRequestException(
            `Insufficient full cylinders for ${inventory.product.name}. Available: ${availableFull}, Requested: ${item.quantity}`,
          );
        }
      } else if (variant === TransferItemVariant.EMPTY_SHELL) {
        const availableEmpty = inventory.quantity - (inventory.fullCylinders ?? 0);
        if (availableEmpty < item.quantity) {
          throw new BadRequestException(
            `Insufficient empty cylinders for ${inventory.product.name}. Available: ${availableEmpty}, Requested: ${item.quantity}`,
          );
        }
      } else {
        if (inventory.quantity < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for ${inventory.product.name}. Available: ${inventory.quantity}, Requested: ${item.quantity}`,
          );
        }
      }

      transferItems.push({
        productId: item.productId,
        inventoryId: inventory.id,
        quantity: item.quantity,
        variant,
      });
    }

    // Generate transfer code
    const count = await this.prisma.transfer.count();
    const transferCode = `TRF-${String(count + 1).padStart(5, '0')}`;

    const transfer = await this.prisma.transfer.create({
      data: {
        transferCode,
        fromBranchId,
        toBranchId,
        initiatedBy: user.userId,
        status: TransferStatus.PENDING,
        notes,
        items: { create: transferItems },
      },
      include: {
        fromBranch: { select: { id: true, name: true, code: true } },
        toBranch: { select: { id: true, name: true, code: true } },
        initiator: { select: { firstName: true, lastName: true } },
        items: { include: { product: true } },
      },
    });

    // Notify the destination branch's manager with the actual products requested
    const itemsSummary = buildItemsSummary(transfer.items);
    if (destBranch.managerId) {
      await this.notificationsService.create({
        type: 'TRANSFER_REQUEST',
        title: 'New Transfer Request',
        message: `${transfer.fromBranch.name} wants to send you: ${itemsSummary} (${transferCode})`,
        userId: destBranch.managerId,
        entityId: transfer.id,
        entityType: 'Transfer',
      });
    }

    // Create activity feed
    await this.prisma.activityFeed.create({
      data: {
        actorId: user.userId,
        actorName: `${user.firstName} ${user.lastName}`,
        branchId: fromBranchId,
        title: 'Transfer Requested',
        message: `Transfer ${transferCode} from ${transfer.fromBranch.name} to ${transfer.toBranch.name}`,
        entityId: transfer.id,
        entityType: 'Transfer',
        visibleToAdmin: true,
        visibleToBranch: true,
      },
    });

    return transfer;
  }

  async findAll(query?: { fromBranchId?: string; toBranchId?: string; status?: string; user?: any }) {
    const where: any = {};

    if (query?.fromBranchId) {
      where.fromBranchId = query.fromBranchId;
    }
    if (query?.toBranchId) {
      where.toBranchId = query.toBranchId;
    }
    if (query?.status) {
      where.status = query.status;
    }

    return this.prisma.transfer.findMany({
      where,
      include: {
        fromBranch: { select: { id: true, name: true, code: true } },
        toBranch: { select: { id: true, name: true, code: true } },
        initiator: { select: { firstName: true, lastName: true } },
        approvedBy: { select: { firstName: true, lastName: true } },
        items: { include: { product: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: {
        fromBranch: true,
        toBranch: true,
        initiator: { select: { firstName: true, lastName: true } },
        approvedBy: { select: { firstName: true, lastName: true } },
        items: { include: { product: true, inventory: true } },
      },
    });

    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }

    return transfer;
  }

  // Moves stock for a single transfer item, variant-aware. Must run inside
  // a transaction. REFILL moves full (gas-filled) cylinders and adjusts
  // fullCylinders at both branches; EMPTY_SHELL moves only empty shells
  // (quantity only); STANDARD is the original behaviour for non-cylinder
  // products.
  private async applyItemStockMovement(tx: any, transfer: any, item: any, performedById: string) {
    const variantSuffix =
      item.variant === 'REFILL' ? ' (refill)' : item.variant === 'EMPTY_SHELL' ? ' (empty shell)' : '';

    const sourceInventory = await tx.inventory.findUnique({
      where: { branchId_productId: { branchId: transfer.fromBranchId, productId: item.productId } },
    });

    if (sourceInventory) {
      if (item.variant === 'REFILL') {
        const availableFull = sourceInventory.fullCylinders ?? 0;
        if (availableFull < item.quantity) {
          throw new BadRequestException(
            `Insufficient full cylinders remaining at the source branch to approve this item`,
          );
        }
      } else if (sourceInventory.quantity < item.quantity) {
        throw new BadRequestException('Insufficient stock remaining at the source branch to approve this item');
      }

      const updateData: any = { quantity: { decrement: item.quantity } };
      if (item.variant === 'REFILL') {
        updateData.fullCylinders = (sourceInventory.fullCylinders ?? 0) - item.quantity;
      }

      await tx.inventory.update({ where: { id: sourceInventory.id }, data: updateData });

      await tx.stockMovement.create({
        data: {
          inventoryId: sourceInventory.id,
          productId: item.productId,
          branchId: transfer.fromBranchId,
          quantityBefore: sourceInventory.quantity,
          quantityChanged: -item.quantity,
          quantityAfter: sourceInventory.quantity - item.quantity,
          movementType: MovementType.TRANSFER_OUT,
          referenceId: transfer.id,
          referenceType: 'Transfer',
          performedById,
          notes: `Transfer ${transfer.transferCode} out${variantSuffix}`,
        },
      });
    }

    const destInventory = await tx.inventory.findUnique({
      where: { branchId_productId: { branchId: transfer.toBranchId, productId: item.productId } },
    });

    if (destInventory) {
      const updateData: any = { quantity: { increment: item.quantity } };
      if (item.variant === 'REFILL') {
        updateData.fullCylinders = (destInventory.fullCylinders ?? 0) + item.quantity;
      }

      await tx.inventory.update({ where: { id: destInventory.id }, data: updateData });

      await tx.stockMovement.create({
        data: {
          inventoryId: destInventory.id,
          productId: item.productId,
          branchId: transfer.toBranchId,
          quantityBefore: destInventory.quantity,
          quantityChanged: item.quantity,
          quantityAfter: destInventory.quantity + item.quantity,
          movementType: MovementType.TRANSFER_IN,
          referenceId: transfer.id,
          referenceType: 'Transfer',
          performedById,
          notes: `Transfer ${transfer.transferCode} in${variantSuffix}`,
        },
      });
    } else {
      await tx.inventory.create({
        data: {
          branchId: transfer.toBranchId,
          productId: item.productId,
          quantity: item.quantity,
          fullCylinders: item.variant === 'REFILL' ? item.quantity : undefined,
        },
      });
    }
  }

  // Rolls every item's individual status up into the transfer's overall
  // status and persists it.
  private async recomputeTransferStatus(transferId: string): Promise<TransferStatus> {
    const items = await this.prisma.transferItem.findMany({ where: { transferId } });

    const allPending = items.every((i) => i.status === TransferItemStatus.PENDING);
    const allApproved = items.every((i) => i.status === TransferItemStatus.APPROVED);
    const allRejected = items.every((i) => i.status === TransferItemStatus.REJECTED);

    let status: TransferStatus;
    if (allPending) {
      status = TransferStatus.PENDING;
    } else if (allApproved) {
      status = TransferStatus.APPROVED;
    } else if (allRejected) {
      status = TransferStatus.REJECTED;
    } else {
      status = TransferStatus.PARTIALLY_APPROVED;
    }

    await this.prisma.transfer.update({ where: { id: transferId }, data: { status } });
    return status;
  }

  private assertIsReceivingManager(transfer: { toBranchId: string }, user: AuthUser) {
    if (user.branchId !== transfer.toBranchId) {
      throw new ForbiddenException('Only the receiving branch manager can act on this transfer');
    }
  }

  async approveItem(transferId: string, itemId: string, user: AuthUser) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      include: { items: { include: { product: true } } },
    });
    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }

    this.assertIsReceivingManager(transfer, user);

    const item = transfer.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException('Transfer item not found');
    }
    if (item.status !== TransferItemStatus.PENDING) {
      throw new BadRequestException(`This item has already been ${item.status.toLowerCase()}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await this.applyItemStockMovement(tx, transfer, item, user.userId);
      await tx.transferItem.update({ where: { id: itemId }, data: { status: TransferItemStatus.APPROVED } });
      await tx.transfer.update({ where: { id: transferId }, data: { approvedById: user.userId } });
    });

    await this.recomputeTransferStatus(transferId);

    await this.notificationsService.create({
      type: 'TRANSFER_APPROVED',
      title: 'Transfer Item Approved',
      message: `${itemLabel(item)} from transfer ${transfer.transferCode} was approved`,
      userId: transfer.initiatedBy,
      entityId: transferId,
      entityType: 'Transfer',
    });

    return this.findOne(transferId);
  }

  async rejectItem(transferId: string, itemId: string, user: AuthUser, rejectionReason: string) {
    if (!rejectionReason || !rejectionReason.trim()) {
      throw new BadRequestException('A rejection reason is required');
    }

    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      include: { items: { include: { product: true } } },
    });
    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }

    this.assertIsReceivingManager(transfer, user);

    const item = transfer.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException('Transfer item not found');
    }
    if (item.status !== TransferItemStatus.PENDING) {
      throw new BadRequestException(`This item has already been ${item.status.toLowerCase()}`);
    }

    await this.prisma.transferItem.update({
      where: { id: itemId },
      data: { status: TransferItemStatus.REJECTED, rejectionReason: rejectionReason.trim() },
    });
    await this.prisma.transfer.update({ where: { id: transferId }, data: { approvedById: user.userId } });

    await this.recomputeTransferStatus(transferId);

    await this.notificationsService.create({
      type: 'TRANSFER_REJECTED',
      title: 'Transfer Item Rejected',
      message: `${itemLabel(item)} from transfer ${transfer.transferCode} was rejected. Reason: ${rejectionReason}`,
      userId: transfer.initiatedBy,
      entityId: transferId,
      entityType: 'Transfer',
    });

    return this.findOne(transferId);
  }

  // Whole-transfer convenience actions: resolve every still-pending item at
  // once with the same outcome, using the same per-item logic as
  // approveItem/rejectItem above.
  async approve(id: string, user: AuthUser) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });
    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }

    this.assertIsReceivingManager(transfer, user);

    const pendingItems = transfer.items.filter((i) => i.status === TransferItemStatus.PENDING);
    if (pendingItems.length === 0) {
      throw new BadRequestException('There are no pending items left to approve on this transfer');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of pendingItems) {
        await this.applyItemStockMovement(tx, transfer, item, user.userId);
        await tx.transferItem.update({ where: { id: item.id }, data: { status: TransferItemStatus.APPROVED } });
      }
      await tx.transfer.update({ where: { id }, data: { approvedById: user.userId } });
    });

    await this.recomputeTransferStatus(id);

    await this.notificationsService.create({
      type: 'TRANSFER_APPROVED',
      title: 'Transfer Approved',
      message: `Your transfer ${transfer.transferCode} (${buildItemsSummary(pendingItems)}) has been approved`,
      userId: transfer.initiatedBy,
      entityId: id,
      entityType: 'Transfer',
    });

    return this.findOne(id);
  }

  async reject(id: string, user: AuthUser, rejectionReason: string) {
    if (!rejectionReason || !rejectionReason.trim()) {
      throw new BadRequestException('A rejection reason is required');
    }

    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });
    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }

    this.assertIsReceivingManager(transfer, user);

    const pendingItems = transfer.items.filter((i) => i.status === TransferItemStatus.PENDING);
    if (pendingItems.length === 0) {
      throw new BadRequestException('There are no pending items left to reject on this transfer');
    }

    await this.prisma.transferItem.updateMany({
      where: { id: { in: pendingItems.map((i) => i.id) } },
      data: { status: TransferItemStatus.REJECTED, rejectionReason: rejectionReason.trim() },
    });
    await this.prisma.transfer.update({ where: { id }, data: { approvedById: user.userId } });

    await this.recomputeTransferStatus(id);

    await this.notificationsService.create({
      type: 'TRANSFER_REJECTED',
      title: 'Transfer Rejected',
      message: `Your transfer ${transfer.transferCode} (${buildItemsSummary(pendingItems)}) was rejected. Reason: ${rejectionReason}`,
      userId: transfer.initiatedBy,
      entityId: id,
      entityType: 'Transfer',
    });

    return this.findOne(id);
  }

  async cancel(id: string, user: AuthUser) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: {
        toBranch: { select: { managerId: true } },
        items: { include: { product: true } },
      },
    });
    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }

    if (!transfer.items.every((i) => i.status === TransferItemStatus.PENDING)) {
      throw new BadRequestException(
        'This transfer already has items that were approved or rejected and can no longer be cancelled outright',
      );
    }

    if (transfer.status !== TransferStatus.PENDING) {
      throw new BadRequestException(
        `Transfer has already been ${transfer.status.toLowerCase()} and can no longer be cancelled`,
      );
    }

    // Only the branch manager who initiated the request (or an admin) may withdraw it
    if (user.role === UserRole.BRANCH_MANAGER && transfer.initiatedBy !== user.userId) {
      throw new ForbiddenException('Only the branch manager who created this transfer can cancel it');
    }

    await this.prisma.transfer.update({
      where: { id },
      data: { status: TransferStatus.CANCELLED },
    });

    // Notify the destination branch's manager that the request was withdrawn
    if (transfer.toBranch?.managerId) {
      await this.notificationsService.create({
        type: 'TRANSFER_CANCELLED',
        title: 'Transfer Cancelled',
        message: `Transfer ${transfer.transferCode} (${buildItemsSummary(transfer.items)}) to your branch was cancelled by the sender`,
        userId: transfer.toBranch.managerId,
        entityId: id,
        entityType: 'Transfer',
      });
    }

    return this.findOne(id);
  }
}
