import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransferStatus, MovementType, UserRole } from '@prisma/client';

interface AuthUser {
  userId: string;
  role: UserRole;
  branchId?: string;
  firstName?: string;
  lastName?: string;
}

function buildItemsSummary(items: { quantity: number; product: { name: string } }[]): string {
  return items.map((i) => `${i.product.name} x${i.quantity}`).join(', ');
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

    // Validate stock availability
    for (const item of items) {
      if (!item.quantity || item.quantity <= 0) {
        throw new BadRequestException('Quantity must be greater than 0 for every item');
      }
    }
    for (const item of items) {
      const inventory = await this.prisma.inventory.findUnique({
        where: { branchId_productId: { branchId: fromBranchId, productId: item.productId } },
        include: { product: true },
      });

      if (!inventory) {
        throw new BadRequestException(`Product not found in source branch`);
      }

      if (inventory.quantity < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for ${inventory.product.name}. Available: ${inventory.quantity}, Requested: ${item.quantity}`,
        );
      }
    }

    // Generate transfer code
    const count = await this.prisma.transfer.count();
    const transferCode = `TRF-${String(count + 1).padStart(5, '0')}`;

    // Create transfer items with inventory lookup
    const transferItems = [];
    for (const item of items) {
      const inventory = await this.prisma.inventory.findUnique({
        where: { branchId_productId: { branchId: fromBranchId, productId: item.productId } },
      });
      transferItems.push({
        productId: item.productId,
        inventoryId: inventory.id,
        quantity: item.quantity,
      });
    }

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

  async approve(id: string, user: AuthUser) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });

    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }

    if (transfer.status !== TransferStatus.PENDING) {
      throw new BadRequestException(`Transfer has already been ${transfer.status.toLowerCase()}`);
    }

    // Route is already restricted to BRANCH_MANAGER; enforce it's specifically
    // the receiving branch's manager (not just any branch manager).
    if (user.branchId !== transfer.toBranchId) {
      throw new ForbiddenException('Only the receiving branch manager can approve this transfer');
    }

    const approvedById = user.userId;

    // Process transfer in transaction
    await this.prisma.$transaction(async (tx) => {
      // Update transfer status
      await tx.transfer.update({
        where: { id },
        data: {
          status: TransferStatus.APPROVED,
          approvedById,
        },
      });

      // Process each item
      for (const item of transfer.items) {
        // Reduce stock from source
        const sourceInventory = await tx.inventory.findUnique({
          where: { branchId_productId: { branchId: transfer.fromBranchId, productId: item.productId } },
        });

        if (sourceInventory) {
          await tx.inventory.update({
            where: { id: sourceInventory.id },
            data: { quantity: { decrement: item.quantity } },
          });

          await tx.stockMovement.create({
            data: {
              inventoryId: sourceInventory.id,
              productId: item.productId,
              branchId: transfer.fromBranchId,
              quantityBefore: sourceInventory.quantity,
              quantityChanged: -item.quantity,
              quantityAfter: sourceInventory.quantity - item.quantity,
              movementType: MovementType.TRANSFER_OUT,
              referenceId: id,
              referenceType: 'Transfer',
              performedById: approvedById,
              notes: `Transfer ${transfer.transferCode} out`,
            },
          });
        }

        // Add stock to destination
        const destInventory = await tx.inventory.findUnique({
          where: { branchId_productId: { branchId: transfer.toBranchId, productId: item.productId } },
        });

        if (destInventory) {
          await tx.inventory.update({
            where: { id: destInventory.id },
            data: { quantity: { increment: item.quantity } },
          });

          await tx.stockMovement.create({
            data: {
              inventoryId: destInventory.id,
              productId: item.productId,
              branchId: transfer.toBranchId,
              quantityBefore: destInventory.quantity,
              quantityChanged: item.quantity,
              quantityAfter: destInventory.quantity + item.quantity,
              movementType: MovementType.TRANSFER_IN,
              referenceId: id,
              referenceType: 'Transfer',
              performedById: approvedById,
              notes: `Transfer ${transfer.transferCode} in`,
            },
          });
        } else {
          // Create inventory entry for destination if it doesn't exist
          await tx.inventory.create({
            data: {
              branchId: transfer.toBranchId,
              productId: item.productId,
              quantity: item.quantity,
            },
          });
        }
      }
    });

    // Notify initiator
    await this.notificationsService.create({
      type: 'TRANSFER_APPROVED',
      title: 'Transfer Approved',
      message: `Your transfer ${transfer.transferCode} (${buildItemsSummary(transfer.items)}) has been approved`,
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

    if (transfer.status !== TransferStatus.PENDING) {
      throw new BadRequestException(`Transfer has already been ${transfer.status.toLowerCase()}`);
    }

    if (user.branchId !== transfer.toBranchId) {
      throw new ForbiddenException('Only the receiving branch manager can reject this transfer');
    }

    await this.prisma.transfer.update({
      where: { id },
      data: {
        status: TransferStatus.REJECTED,
        approvedById: user.userId,
        rejectionReason: rejectionReason.trim(),
      },
    });

    // Notify initiator
    await this.notificationsService.create({
      type: 'TRANSFER_REJECTED',
      title: 'Transfer Rejected',
      message: `Your transfer ${transfer.transferCode} (${buildItemsSummary(transfer.items)}) was rejected. Reason: ${rejectionReason}`,
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
