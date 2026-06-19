import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async create(data: { fullName: string; phone: string; email?: string; businessName?: string; address?: string; creditLimit?: number }) {
    const existing = await this.prisma.customer.findUnique({ where: { phone: data.phone } });
    if (existing) {
      throw new ConflictException('Customer with this phone number already exists');
    }

    if (data.email) {
      const existingEmail = await this.prisma.customer.findUnique({ where: { email: data.email } });
      if (existingEmail) {
        throw new ConflictException('Customer with this email already exists');
      }
    }

    // Generate customer code
    const count = await this.prisma.customer.count();
    const customerCode = `CUST-${String(count + 1).padStart(4, '0')}`;

    return this.prisma.customer.create({
      data: {
        ...data,
        customerCode,
        creditLimit: data.creditLimit || 0,
      },
    });
  }

  async findAll(query?: { search?: string; isInvoiceEligible?: boolean }) {
    const where: any = {};

    if (query?.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { customerCode: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query?.isInvoiceEligible !== undefined) {
      where.isInvoiceEligible = query.isInvoiceEligible;
    }

    return this.prisma.customer.findMany({
      where,
      include: {
        _count: { select: { invoices: true, sales: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        invoices: { orderBy: { createdAt: 'desc' } },
        sales: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { items: { include: { product: true } } },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async findByPhone(phone: string) {
    return this.prisma.customer.findUnique({ where: { phone } });
  }

  async update(id: string, data: any) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.prisma.customer.update({
      where: { id },
      data,
    });
  }

  async toggleStatus(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.prisma.customer.update({
      where: { id },
      data: { isActive: !customer.isActive },
    });
  }

  async getOutstandingBalances() {
    return this.prisma.customer.findMany({
      where: { outstandingBalance: { gt: 0 } },
      orderBy: { outstandingBalance: 'desc' },
      select: {
        id: true,
        customerCode: true,
        fullName: true,
        phone: true,
        outstandingBalance: true,
        creditLimit: true,
      },
    });
  }
}