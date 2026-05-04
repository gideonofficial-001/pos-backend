import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UserRole, InvoiceStatus } from '@prisma/client';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
    private notificationsService: NotificationsService,
  ) {}

  async create(createInvoiceDto: CreateInvoiceDto, user: any) {
    const { branchId, customerName, customerPhone, customerEmail, amount, dueDate, notes } = createInvoiceDto;

    if (user.role === UserRole.BRANCH_MANAGER && user.branchId !== branchId) {
      throw new ForbiddenException('Access denied for this branch');
    }

    const year = new Date().getFullYear();
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const invoiceCode = `INV-${randomCode}-${year}`;

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceCode,
        branchId,
        userId: user.userId,
        customerName,
        customerPhone,
        customerEmail,
        amount,
        dueDate: new Date(dueDate),
        status: InvoiceStatus.PENDING,
        notes,
      },
      include: {
        branch: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await this.notificationsService.sendInvoiceNotification(invoice);

    await this.auditLogsService.create({
      userId: user.userId,
      action: 'INVOICE_CREATED',
      description: `Created invoice ${invoiceCode} for ${customerName}`,
      entityType: 'Invoice',
      entityId: invoice.id,
      newValues: createInvoiceDto,
    });

    return invoice;
  }

  async findAll(query: { branchId?: string; status?: InvoiceStatus; user?: any }) {
    const { branchId, status, user } = query;
    const where: any = {};

    if (branchId) {
      if (user.role === UserRole.BRANCH_MANAGER && user.branchId !== branchId) {
        throw new ForbiddenException('Access denied for this branch');
      }
      where.branchId = branchId;
    } else if (user.role === UserRole.BRANCH_MANAGER) {
      where.branchId = user.branchId;
    }

    if (status) {
      where.status = status;
    }

    return this.prisma.invoice.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
        sale: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user: any) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        branch: true,
        user: { select: { id: true, firstName: true, lastName: true } },
        sale: { include: { items: { include: { product: true } } } },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (user.role === UserRole.BRANCH_MANAGER && user.branchId !== invoice.branchId) {
      throw new ForbiddenException('Access denied for this invoice');
    }

    return invoice;
  }

  async markAsPaid(id: string, user: any) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already paid');
    }

    const updatedInvoice = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.PAID },
      include: {
        branch: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await this.auditLogsService.create({
      userId: user.userId,
      action: 'INVOICE_PAID',
      description: `Marked invoice ${invoice.invoiceCode} as paid`,
      entityType: 'Invoice',
      entityId: id,
      oldValues: { status: invoice.status },
      newValues: { status: InvoiceStatus.PAID },
    });

    return updatedInvoice;
  }

  async cancel(id: string, user: any) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Cannot cancel a paid invoice');
    }

    const updatedInvoice = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.CANCELLED },
      include: {
        branch: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await this.auditLogsService.create({
      userId: user.userId,
      action: 'INVOICE_CREATED',
      description: `Cancelled invoice ${invoice.invoiceCode}`,
      entityType: 'Invoice',
      entityId: id,
      oldValues: { status: invoice.status },
      newValues: { status: InvoiceStatus.CANCELLED },
    });

    return updatedInvoice;
  }
}
