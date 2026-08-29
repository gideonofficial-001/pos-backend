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
    const { branchId, customerId, saleId, subtotal, discount = 0, dueDate, notes } = createInvoiceDto;

    if (customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
      if (!customer) throw new NotFoundException('Customer not found');
    }

    const count = await this.prisma.invoice.count();
    const invoiceCode = `INV-${String(count + 1).padStart(5, '0')}`;

    const total = Number(subtotal) - Number(discount);
    const balance = total; // starts fully unpaid

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceCode,
        branchId,
        userId: user.userId,
        customerId,
        saleId,
        subtotal,
        discount,
        total,
        amountPaid: 0,
        balance,
        dueDate: dueDate ? new Date(dueDate) : null,
        notes,
      },
      include: {
        branch: { select: { name: true } },
        customer: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });

    await this.notificationsService.create({
      type: 'INVOICE_CREATED',
      title: 'New Invoice Created',
      message: `Invoice ${invoiceCode} for KES ${total.toFixed(2)}`,
      userId: user.userId,
      entityId: invoice.id,
      entityType: 'Invoice',
    });

    await this.prisma.activityFeed.create({
      data: {
        type: 'INVOICE_CREATED',
        branchId,
        title: 'Invoice Created',
        message: `Invoice ${invoiceCode} for KES ${total.toFixed(2)}`,
        entityId: invoice.id,
        entityType: 'Invoice',
        visibleToBranch: true,
      },
    });

    return invoice;
  }

  async findAll(query?: { branchId?: string; status?: string; overdue?: boolean; user?: any }) {
    const where: any = {};
    if (query?.branchId) where.branchId = query.branchId;
    if (query?.status) where.status = query.status;
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
        sale: { include: { saleItems: { include: { product: true } } } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async updateStatus(id: string, status: InvoiceStatus, userId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const updateData: any = { status };

    if (status === InvoiceStatus.PAID) {
      updateData.amountPaid = invoice.total;
      updateData.balance = 0;
      updateData.paidAt = new Date();
    }

    return this.prisma.invoice.update({
      where: { id },
      data: updateData,
      include: { branch: true, customer: true },
    });
  }

  async getOverdueInvoices() {
    return this.prisma.invoice.findMany({
      where: { status: { in: ['PENDING', 'SENT'] }, dueDate: { lt: new Date() } },
      include: { branch: { select: { name: true } }, customer: true },
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
      this.prisma.invoice.aggregate({ _sum: { total: true } }),
    ]);

    return { total, paid, pending, overdue, totalAmount: totalAmount._sum.total || 0 };
  }
}
