import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransferDto, RespondToTransferDto } from './dto/transfer.dto';
import { TransferStatus, TransferItemStatus, UserRole, Prisma } from '@prisma/client';

@Injectable()
export class TransferService {
  private readonly logger = new Logger(TransferService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  async createTransfer(userId: string, dto: CreateTransferDto) {
    const { toBranchId, items, notes } = dto;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user?.branchId) {
      throw new BadRequestException(
        'You must be assigned to a branch to create transfers',
      );
    }

    if (user.branchId === toBranchId) {
      throw new BadRequestException('Cannot transfer to the same branch');
    }

    const toBranch = await this.prisma.branch.findUnique({
      where: { id: toBranchId },
    });
    if (!toBranch) throw new NotFoundException('Target branch not found');
    if (!toBranch.isActive) {
      throw new BadRequestException(
        `${toBranch.name} is inactive and cannot receive transfers`,
      );
    }

    // Validate stock and build item records
    const processedItems: {
      productId: string;
      quantity: number;
      lpgComponent: 'REFILL' | 'CYLINDER' | null;
      cylinderId: string | null;
      notes: string | null;
    }[] = [];

    for (const item of items) {
      if (!item.quantity || item.quantity < 1) {
        throw new BadRequestException('Quantity must be at least 1 for every item');
      }

      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
        include: {
          inventory: { where: { branchId: user.branchId } },
        },
      });

      if (!product) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }

      const inventory = product.inventory[0];
      if (!inventory || inventory.quantity < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for ${product.name}. Available: ${inventory?.quantity ?? 0}, Requested: ${item.quantity}`,
        );
      }

      // LPG product handling
      if ((product as any).isLpg) {
        if (item.lpgComponent) {
          if (item.lpgComponent === 'CYLINDER' && item.cylinderId) {
            const cylinder = await this.prisma.cylinder.findFirst({
              where: {
                id: item.cylinderId,
                productId: product.id,
                branchId: user.branchId,
                status: 'FULL',
              },
            });
            if (!cylinder) {
              throw new BadRequestException(
                `Cylinder ${item.cylinderId} is not available`,
              );
            }
          }
          processedItems.push({
            productId: item.productId,
            quantity: item.quantity,
            lpgComponent: item.lpgComponent,
            cylinderId: item.cylinderId ?? null,
            notes: item.notes ?? null,
          });
        } else {
          // Auto-split into components when not specified
          if ((product as any).hasRefill) {
            processedItems.push({
              productId: item.productId,
              quantity: item.quantity,
              lpgComponent: 'REFILL',
              cylinderId: null,
              notes: item.notes ?? null,
            });
          }
          if ((product as any).hasCylinder) {
            const availableCylinders = await this.prisma.cylinder.findMany({
              where: {
                productId: product.id,
                branchId: user.branchId,
                status: 'FULL',
              },
              take: item.quantity,
            });
            if (availableCylinders.length < item.quantity) {
              throw new BadRequestException(
                `Not enough cylinders for ${product.name}. Available: ${availableCylinders.length}, Requested: ${item.quantity}`,
              );
            }
            for (const cylinder of availableCylinders) {
              processedItems.push({
                productId: item.productId,
                quantity: 1,
                lpgComponent: 'CYLINDER',
                cylinderId: cylinder.id,
                notes: item.notes ?? null,
              });
            }
          }
        }
      } else {
        // Non-LPG
        processedItems.push({
          productId: item.productId,
          quantity: item.quantity,
          lpgComponent: null,
          cylinderId: null,
          notes: item.notes ?? null,
        });
      }
    }

    // Generate transferCode for audit purposes (never shown in UI)
    const transferCode = `TRF-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 7)
      .toUpperCase()}`;

    const transfer = await this.prisma.transfer.create({
      data: {
        transferCode,
        fromBranchId: user.branchId,
        toBranchId,
        requestedById: userId,
        notes: notes ?? null,
        items: {
          create: processedItems,
        },
      },
      include: {
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
        requestedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        items: {
          include: {
            product: { select: { id: true, name: true } },
            cylinder: { select: { id: true, serialNumber: true } },
          },
        },
      },
    });

    // Notify ONLY the receiving branch managers
    await this.notifyBranchManagers(
      transfer.toBranchId,
      'TRANSFER_REQUEST',
      'Incoming Transfer Request',
      `${transfer.fromBranch.name} has requested a transfer with ${transfer.items.length} item(s).`,
      transfer.id,
    );

    // Confirm to the sending branch managers
    await this.notifyBranchManagers(
      transfer.fromBranchId,
      'TRANSFER_SENT',
      'Transfer Sent',
      `Your transfer to ${transfer.toBranch.name} with ${transfer.items.length} item(s) is now pending.`,
      transfer.id,
    );

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'TRANSFER_CREATED',
        entityType: 'TRANSFER',
        entityId: transfer.id,
        description: `Transfer created to ${toBranch.name} with ${processedItems.length} item(s)`,
      },
    });

    return transfer;
  }

  // ─── Per-item response (can be done across multiple sessions) ─────────────

  async respondToTransfer(
    transferId: string,
    userId: string,
    dto: RespondToTransferDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, branchId: true, firstName: true, lastName: true },
    });

    if (!user) throw new NotFoundException('User not found');

    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true } },
            cylinder: true,
          },
        },
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
      },
    });

    if (!transfer) throw new NotFoundException('Transfer not found');

    // Only the RECEIVING branch manager can respond — Super Admin is excluded
    if (
      user.role !== UserRole.BRANCH_MANAGER ||
      transfer.toBranchId !== user.branchId
    ) {
      throw new ForbiddenException(
        'Only the receiving branch manager can respond to this transfer',
      );
    }

    if (transfer.status === 'CANCELLED') {
      throw new BadRequestException('This transfer has been cancelled');
    }

    if (transfer.status === 'COMPLETED') {
      throw new BadRequestException('This transfer has already been completed');
    }

    // Process each item response individually
    const updatedItems: { name: string; status: string }[] = [];

    for (const itemResponse of dto.items) {
      const item = transfer.items.find((i) => i.id === itemResponse.itemId);
      if (!item) {
        throw new NotFoundException(
          `Transfer item ${itemResponse.itemId} not found`,
        );
      }

      if (item.status !== 'PENDING') {
        throw new BadRequestException(
          `${item.product.name} has already been ${item.status.toLowerCase()}`,
        );
      }

      await this.prisma.transferItem.update({
        where: { id: itemResponse.itemId },
        data: {
          status: itemResponse.status as TransferItemStatus,
          notes: itemResponse.notes ?? item.notes,
        },
      });

      if (itemResponse.status === 'ACCEPTED') {
        await this.processAcceptedItem(transfer, item);
      } else {
        await this.processRejectedItem(item);
      }

      updatedItems.push({ name: item.product.name, status: itemResponse.status });
    }

    // Recalculate overall status from all items
    const allItems = await this.prisma.transferItem.findMany({
      where: { transferId },
    });

    const allResolved = allItems.every((i) => i.status !== 'PENDING');
    const anyPending = allItems.some((i) => i.status === 'PENDING');
    const anyResolved = allItems.some((i) => i.status !== 'PENDING');

    let newStatus: TransferStatus;
    if (allResolved) {
      newStatus = 'COMPLETED';
    } else if (anyResolved) {
      newStatus = 'PARTIAL';
    } else {
      newStatus = 'PENDING';
    }

    await this.prisma.transfer.update({
      where: { id: transferId },
      data: {
        status: newStatus,
        respondedAt: new Date(),
      },
    });

    // Notify ONLY the sending branch managers of the per-item response
    const accepted = updatedItems.filter((i) => i.status === 'ACCEPTED');
    const rejected = updatedItems.filter((i) => i.status === 'REJECTED');

    const responseParts: string[] = [];
    if (accepted.length > 0) {
      responseParts.push(
        `Accepted: ${accepted.map((i) => i.name).join(', ')}`,
      );
    }
    if (rejected.length > 0) {
      responseParts.push(
        `Rejected: ${rejected.map((i) => i.name).join(', ')}`,
      );
    }

    await this.notifyBranchManagers(
      transfer.fromBranchId,
      'TRANSFER_RESPONSE',
      'Transfer Response',
      `${transfer.toBranch.name} responded to your transfer. ${responseParts.join(' | ')}`,
      transfer.id,
    );

    return {
      transferId,
      status: newStatus,
      itemsUpdated: updatedItems,
    };
  }

  // ─── Cancel ───────────────────────────────────────────────────────────────

  async cancelTransfer(transferId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, branchId: true },
    });

    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      include: {
        items: true,
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
      },
    });

    if (!transfer) throw new NotFoundException('Transfer not found');

    // Only the sender (or super admin) can cancel
    if (
      transfer.requestedById !== userId &&
      user?.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Only the creator can cancel this transfer');
    }

    const anyAccepted = transfer.items.some((i) => i.status === 'ACCEPTED');
    if (anyAccepted) {
      throw new BadRequestException(
        'Cannot cancel a transfer that already has accepted items',
      );
    }

    // Release any reserved cylinders
    for (const item of transfer.items) {
      if (item.cylinderId) {
        await this.prisma.cylinder.update({
          where: { id: item.cylinderId },
          data: { status: 'FULL' },
        });
      }
    }

    await this.prisma.transfer.update({
      where: { id: transferId },
      data: { status: 'CANCELLED' },
    });

    // Notify ONLY the receiving branch managers of the cancellation
    await this.notifyBranchManagers(
      transfer.toBranchId,
      'TRANSFER_CANCELLED',
      'Transfer Cancelled',
      `${transfer.fromBranch.name} has cancelled a pending transfer.`,
      transfer.id,
    );

    return { message: 'Transfer cancelled successfully' };
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async getTransfers(userId: string, filters: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, branchId: true },
    });

    if (!user) throw new NotFoundException('User not found');

    const where: Prisma.TransferWhereInput = {};

    if (user.role === UserRole.BRANCH_MANAGER) {
      // Branch managers only see transfers involving their branch
      where.OR = [
        { fromBranchId: user.branchId },
        { toBranchId: user.branchId },
      ];
    }
    // SUPER_ADMIN and OVERALL_MANAGER can see all transfers for operational purposes,
    // but they receive NO transfer notifications (handled in NotificationsService)

    if (filters?.status && filters.status !== 'all') {
      where.status = filters.status as TransferStatus;
    }

    if (filters?.type === 'incoming') {
      where.toBranchId = user.branchId ?? undefined;
    } else if (filters?.type === 'outgoing') {
      where.fromBranchId = user.branchId ?? undefined;
    }

    if (filters?.branchId) {
      where.OR = [
        { fromBranchId: filters.branchId },
        { toBranchId: filters.branchId },
      ];
    }

    return this.prisma.transfer.findMany({
      where,
      include: {
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
        requestedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        items: {
          include: {
            product: { select: { id: true, name: true } },
            cylinder: { select: { id: true, serialNumber: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTransferById(transferId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, branchId: true },
    });

    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      include: {
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
        requestedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        items: {
          include: {
            product: { select: { id: true, name: true } },
            cylinder: { select: { id: true, serialNumber: true, status: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!transfer) throw new NotFoundException('Transfer not found');

    if (user?.role === UserRole.BRANCH_MANAGER) {
      if (
        transfer.fromBranchId !== user.branchId &&
        transfer.toBranchId !== user.branchId
      ) {
        throw new ForbiddenException(
          'You do not have access to this transfer',
        );
      }
    }

    return transfer;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async processAcceptedItem(transfer: any, item: any) {
    // Deduct from sender
    await this.prisma.inventory.updateMany({
      where: {
        branchId: transfer.fromBranchId,
        productId: item.productId,
      },
      data: { quantity: { decrement: item.quantity } },
    });

    // Add to receiver (upsert-style)
    const existingInventory = await this.prisma.inventory.findFirst({
      where: {
        branchId: transfer.toBranchId,
        productId: item.productId,
      },
    });

    if (existingInventory) {
      await this.prisma.inventory.update({
        where: { id: existingInventory.id },
        data: { quantity: { increment: item.quantity } },
      });
    } else {
      await this.prisma.inventory.create({
        data: {
          branchId: transfer.toBranchId,
          productId: item.productId,
          quantity: item.quantity,
        },
      });
    }

    // Move cylinder to receiving branch
    if (item.cylinderId) {
      await this.prisma.cylinder.update({
        where: { id: item.cylinderId },
        data: { branchId: transfer.toBranchId, status: 'FULL' },
      });
    }
  }

  private async processRejectedItem(item: any) {
    // Release reserved cylinder back to available
    if (item.cylinderId) {
      await this.prisma.cylinder.update({
        where: { id: item.cylinderId },
        data: { status: 'FULL' },
      });
    }
    // Inventory stays at sender — no changes needed
  }

  /**
   * Notify only the BRANCH_MANAGERs of a specific branch.
   * Super Admin and Overall Manager are intentionally excluded.
   */
  private async notifyBranchManagers(
    branchId: string,
    type: string,
    title: string,
    message: string,
    transferId: string,
  ) {
    const managers = await this.prisma.user.findMany({
      where: {
        branchId,
        role: UserRole.BRANCH_MANAGER,
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    if (managers.length === 0) return;

    await this.prisma.notification.createMany({
      data: managers.map((m) => ({
        userId: m.id,
        type: type as any,
        title,
        message,
        entityId: transferId,
        entityType: 'TRANSFER',
        status: 'UNREAD' as any,
      })),
    });
  }
}
