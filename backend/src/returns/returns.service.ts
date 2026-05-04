import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UserRole, ReturnStatus, ProductType } from '@prisma/client';
import { CreateReturnDto } from './dto/create-return.dto';

@Injectable()
export class ReturnsService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  async create(createReturnDto: CreateReturnDto, user: any) {
    const { saleId, reason, amount } = createReturnDto;

    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: { include: { product: true } } },
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    if (user.role === UserRole.BRANCH_MANAGER && user.branchId !== sale.branchId) {
      throw new ForbiddenException('Access denied for this sale');
    }

    const existingReturn = await this.prisma.return.findFirst({
      where: { saleId },
    });

    if (existingReturn) {
      throw new BadRequestException('Sale already has a return request');
    }

    const year = new Date().getFullYear();
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const returnCode = `RET-${randomCode}-${year}`;

    const returnRequest = await this.prisma.return.create({
      data: {
        returnCode,
        saleId,
        userId: user.userId,
        reason,
        amount,
        status: ReturnStatus.PENDING,
      },
      include: {
        sale: { include: { items: { include: { product: true } } } },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await this.auditLogsService.create({
      userId: user.userId,
      action: 'SALE_RETURNED',
      description: `Requested return for sale ${sale.saleCode}`,
      entityType: 'Return',
      entityId: returnRequest.id,
      newValues: createReturnDto,
    });

    return returnRequest;
  }

  async findAll(query: { status?: ReturnStatus; user?: any }) {
    const { status, user } = query;
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (user.role === UserRole.BRANCH_MANAGER) {
      where.sale = { branchId: user.branchId };
    }

    return this.prisma.return.findMany({
      where,
      include: {
        sale: { include: { branch: { select: { id: true, name: true, code: true } } } },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user: any) {
    const returnRequest = await this.prisma.return.findUnique({
      where: { id },
      include: {
        sale: { include: { items: { include: { product: true } }, branch: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!returnRequest) {
      throw new NotFoundException('Return request not found');
    }

    if (user.role === UserRole.BRANCH_MANAGER && user.branchId !== returnRequest.sale.branchId) {
      throw new ForbiddenException('Access denied for this return');
    }

    return returnRequest;
  }

  async approve(id: string, user: any) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can approve returns');
    }

    const returnRequest = await this.prisma.return.findUnique({
      where: { id },
      include: {
        sale: { include: { items: { include: { product: true } } } },
      },
    });

    if (!returnRequest) {
      throw new NotFoundException('Return request not found');
    }

    if (returnRequest.status !== ReturnStatus.PENDING) {
      throw new BadRequestException('Return request is not pending');
    }

    // Update return status
    const updatedReturn = await this.prisma.return.update({
      where: { id },
      data: {
        status: ReturnStatus.APPROVED,
        approvedById: user.userId,
        approvedAt: new Date(),
      },
      include: {
        sale: { include: { branch: true } },
      },
    });

    // Reverse stock
    for (const item of returnRequest.sale.items) {
      const updateData: any = {
        quantity: { increment: item.quantity },
      };

      if (item.product.type === ProductType.LPG_REFILL) {
        updateData.fullCylinders = { increment: item.quantity };
        updateData.emptyCylinders = { decrement: item.quantity };
        updateData.totalSold = { decrement: item.quantity };
      }

      await this.prisma.inventory.update({
        where: { branchId_productId: { branchId: returnRequest.sale.branchId, productId: item.productId } },
        data: updateData,
      });
    }

    // Update sale status
    await this.prisma.sale.update({
      where: { id: returnRequest.saleId },
      data: { status: 'RETURNED' },
    });

    // Mark stock as reversed
    await this.prisma.return.update({
      where: { id },
      data: { stockReversed: true },
    });

    await this.auditLogsService.create({
      userId: user.userId,
      action: 'SALE_RETURNED',
      description: `Approved return ${returnRequest.returnCode}`,
      entityType: 'Return',
      entityId: id,
      oldValues: { status: ReturnStatus.PENDING },
      newValues: { status: ReturnStatus.APPROVED },
    });

    return updatedReturn;
  }

  async reject(id: string, reason: string, user: any) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can reject returns');
    }

    const returnRequest = await this.prisma.return.findUnique({
      where: { id },
    });

    if (!returnRequest) {
      throw new NotFoundException('Return request not found');
    }

    if (returnRequest.status !== ReturnStatus.PENDING) {
      throw new BadRequestException('Return request is not pending');
    }

    const updatedReturn = await this.prisma.return.update({
      where: { id },
      data: {
        status: ReturnStatus.REJECTED,
        approvedById: user.userId,
        approvedAt: new Date(),
        rejectionReason: reason,
      },
      include: {
        sale: { include: { branch: true } },
      },
    });

    await this.auditLogsService.create({
      userId: user.userId,
      action: 'SALE_RETURNED',
      description: `Rejected return ${returnRequest.returnCode}`,
      entityType: 'Return',
      entityId: id,
      oldValues: { status: ReturnStatus.PENDING },
      newValues: { status: ReturnStatus.REJECTED, reason },
    });

    return updatedReturn;
  }
}
