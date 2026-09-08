import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReturnStatus, MovementType, UserRole } from '@prisma/client';
import { CreateReturnDto } from './dto/create-return.dto';

@Injectable()
export class ReturnsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async create(createReturnDto: CreateReturnDto, user: any) {
    const { saleId, reason, amount } = createReturnDto;

    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { saleItems: { include: { product: true } }, branch: true },
    });

    if (!sale) throw new NotFoundException('Sale not found');

    const existingReturn = await this.prisma.return.findFirst({
      where: { saleId, status: { in: ['PENDING', 'APPROVED'] } },
    });
    if (existingReturn) {
      throw new BadRequestException('A return request already exists for this sale');
    }

    const count = await this.prisma.return.count();
    const returnCode = `RTN-${String(count + 1).padStart(5, '0')}`;

    const returnRequest = await this.prisma.return.create({
      data: {
        returnCode,
        saleId,
        branchId: sale.branchId,
        userId: user.userId,
        reason,
        refundAmount: amount || sale.total,
        status: ReturnStatus.PENDING,
      },
      include: {
        sale: { include: { saleItems: { include: { product: true } } } },
        user: { select: { firstName: true, lastName: true } },
      },
    });

    // Notify all admins who need to action the return — NOT the submitter.
    // The submitter (branch manager) already knows they submitted it.
    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.SUPER_ADMIN },
      select: { id: true },
    });
    await Promise.all(
      admins.map((admin) =>
        this.notificationsService.create({
          type: 'RETURN_REQUEST',
          title: 'New Return Request',
          message: `Return ${returnCode} for sale ${sale.saleCode} — Reason: ${reason}`,
          userId: admin.id,
          entityId: returnRequest.id,
          entityType: 'Return',
        }),
      ),
    );

    await this.prisma.activityFeed.create({
      data: {
        type: 'RETURN_REQUESTED',
        branchId: sale.branchId,
        title: 'Return Requested',
        message: `Return ${returnCode} for sale ${sale.saleCode}`,
        entityId: returnRequest.id,
        entityType: 'Return',
        visibleToBranch: true,
      },
    });

    return returnRequest;
  }

  async findAll(query?: { branchId?: string; status?: string; user?: any }) {
    const where: any = {};
    if (query?.status) where.status = query.status;
    if (query?.branchId) where.branchId = query.branchId;

    return this.prisma.return.findMany({
      where,
      include: {
        sale: {
          include: {
            saleItems: { include: { product: true } },
            branch: { select: { id: true, name: true, code: true } },
          },
        },
        user: { select: { firstName: true, lastName: true } },
        approvedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const returnRequest = await this.prisma.return.findUnique({
      where: { id },
      include: {
        sale: { include: { saleItems: { include: { product: true } } } },
        user: { select: { firstName: true, lastName: true } },
        approvedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!returnRequest) throw new NotFoundException('Return request not found');
    return returnRequest;
  }

    async approve(id: string, approvedById: string) {
    const returnRequest = await this.prisma.return.findUnique({
      where: { id },
      include: { sale: { include: { saleItems: true } } },
    });
    if (!returnRequest) throw new NotFoundException('Return request not found');
    if (returnRequest.status !== ReturnStatus.PENDING) {
      throw new BadRequestException('Return request is not pending');
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Mark Return as Approved
      await tx.return.update({
        where: { id },
        data: {
          status: ReturnStatus.APPROVED,
          approvedById,
          approvedAt: new Date(),
        },
      });

      // 2. Restore Inventory based on Product/LPG Type
      for (const item of returnRequest.sale.saleItems) {
        //  FIX: Use findFirst to safely avoid compound ID errors
        const inventory = await tx.inventory.findFirst({
          where: {
            branchId: returnRequest.branchId,
            productId: item.productId,
          },
        });

        if (inventory) {
          let inventoryUpdate: any = {};

          //  FIX: Handle your custom LPG Gas logic
          if (item.lpgVariant === 'REFILL') {
            inventoryUpdate = { fullCylinders: { increment: item.quantity } };
          } else if (item.lpgVariant === 'EMPTY_SHELL') {
            inventoryUpdate = { quantity: { increment: item.quantity } };
          } else if (item.lpgVariant === 'COMPLETE_SET') {
            inventoryUpdate = {
              quantity: { increment: item.quantity },
              fullCylinders: { increment: item.quantity }
            };
          } else {
            // Standard non-LPG items
            inventoryUpdate = { quantity: { increment: item.quantity } };
          }

          await tx.inventory.update({
            where: { id: inventory.id },
            data: inventoryUpdate,
          });

          await tx.stockMovement.create({
            data: {
              inventoryId: inventory.id,
              type: MovementType.RETURN,
              quantity: item.quantity,
              referenceId: id,
              referenceType: 'Return',
              performedById: approvedById,
              notes: `Return approved: ${returnRequest.returnCode}`,
            },
          });
        }
      }

      // 3. Mark Sale as RETURNED
      await tx.sale.update({
        where: { id: returnRequest.saleId },
        data: { status: 'RETURNED' },
      });
    });

    await this.notificationsService.create({
      type: 'RETURN_APPROVED',
      title: 'Return Approved',
      message: `Your return request ${returnRequest.returnCode} has been approved`,
      userId: returnRequest.userId,
      entityId: id,
      entityType: 'Return',
    });

    return this.findOne(id);
  }


  async reject(id: string, approvedById: string, rejectionReason: string) {
    const returnRequest = await this.prisma.return.findUnique({ where: { id } });
    if (!returnRequest) throw new NotFoundException('Return request not found');
    if (returnRequest.status !== ReturnStatus.PENDING) {
      throw new BadRequestException('Return request is not pending');
    }

    await this.prisma.return.update({
      where: { id },
      data: { status: ReturnStatus.REJECTED, approvedById, approvedAt: new Date(), rejectionReason },
    });

    await this.notificationsService.create({
      type: 'RETURN_REJECTED',
      title: 'Return Rejected',
      message: `Your return request ${returnRequest.returnCode} has been rejected. Reason: ${rejectionReason}`,
      userId: returnRequest.userId,
      entityId: id,
      entityType: 'Return',
    });

    return this.findOne(id);
  }
}
