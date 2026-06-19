import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InvoiceStatus } from '@prisma/client';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async create(createInvoiceDto: CreateInvoiceDto, user: any) {
    const { branchId, customerId, customerName, customerPhone, customerEmail, amount, dueDate, notes } = createInvoiceDto;

    // Validate customer if customerId is provided
    if (customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
      if (!customer.isInvoiceEligible) {
        throw new BadRequestException('This customer is not eligible for invoicing');
      }
    }

    // Generate invoice code
    const count = await this.prisma.invoice.count();
    const invoiceCode = `INV-${String(count + 1).padStart(5, '0')}`;

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceCode,
        branchId,
        userId: user.userId,
        customerId,
        customerName,
        customerPhone,
        customerEmail,
        amount,
        dueDate: new Date(dueDate),
        notes,
      },
      include: {
        branch: { select: { name: true } },
        customer: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });

    // Update customer outstanding balance
    if (customerId) {
      await this.prisma.customer.update({
        where: { id: customerId },
        data: { outstandingBalance: { increment: amount } },
      });
    }

    // Create notification
    await this.notificationsService.create({
      type: 'INVOICE_CREATED',
      title: 'New Invoice Created',
      message: `Invoice ${invoiceCode} for KES ${Number(amount).toFixed(2)} - ${customerName}`,
      userId: user.userId,
      entityId: invoice.id,
      entityType: 'Invoice',
    });

    // Create activity feed entry
    await this.prisma.activityFeed.create({
      data: {
        actorId: user.userId,
        actorName: `${user.firstName} ${user.lastName}`,
        branchId,
        title: 'Invoice Created',
        message: `Invoice ${invoiceCode} for KES ${Number(amount).toFixed(2)} - ${customerName}`,
        entityId: invoice.id,
        entityType: 'Invoice',
        visibleToAdmin: true,
        visibleToBranch: true,
      },
    });

    return invoice;
  }

  async findAll(query?: { branchId?: string; status?: string; overdue?: boolean; user?: any }) {
    const where: any = {};

    if (query?.branchId) {
      where.branchId = query.branchId;
    }
    if (query?.status) {
      where.status = query.status;
    }
    if (query?.overdue) {
      where.status = { in: ['PENDING', 'SENT'] };
      where.dueDate = { lt: new Date() };
    }

    return this.prisma.invoice.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        customer: true,
        user: { select: { firstName: true, lastName: true } },
        sale: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        branch: true,
        customer: true,
        user: { select: { firstName: true, lastName: true } },
        sale: { include: { items: { include: { product: true } } } },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  async updateStatus(id: string, status: InvoiceStatus, userId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status },
      include: {
        branch: true,
        customer: true,
      },
    });

    // If paid, reduce customer outstanding balance
    if (status === 'PAID' && invoice.customerId) {
      await this.prisma.customer.update({
        where: { id: invoice.customerId },
        data: { outstandingBalance: { decrement: invoice.amount } },
      });
    }

    return updated;
  }

  async getOverdueInvoices() {
    return this.prisma.invoice.findMany({
      where: {
        status: { in: ['PENDING', 'SENT'] },
        dueDate: { lt: new Date() },
      },
      include: {
        branch: { select: { name: true } },
        customer: true,
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async getInvoiceSummary() {
    const [total, paid, pending, overdue, totalAmount] = await Promise.all([
      this.prisma.invoice.count(),
      this.prisma.invoice.count({ where: { status: 'PAID' } }),
      this.prisma.invoice.count({ where: { status: { in: ['PENDING', 'SENT'] } } }),
      this.prisma.invoice.count({
        where: { status: { in: ['PENDING', 'SENT'] }, dueDate: { lt: new Date() } },
      }),
      this.prisma.invoice.aggregate({ _sum: { amount: true } }),
    ]);

    return { total, paid, pending, overdue, totalAmount: totalAmount._sum.amount || 0 };
  }
}