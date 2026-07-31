import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    notes?: string;
    creditLimit?: number;
  }) {
    const existing = await this.prisma.customer.findUnique({ where: { phone: data.phone } });
    if (existing) throw new ConflictException('Customer with this phone number already exists');

    // email is not @unique on Customer — must use findFirst
    if (data.email) {
      const existingEmail = await this.prisma.customer.findFirst({ where: { email: data.email } });
      if (existingEmail) throw new ConflictException('Customer with this email already exists');
    }

    return this.prisma.customer.create({
      data: { name: data.name, phone: data.phone, email: data.email, address: data.address, notes: data.notes, creditLimit: data.creditLimit || 0 },
    });
  }

  async findAll(query?: { search?: string }) {
    const where: any = {};
    if (query?.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.customer.findMany({
      where,
      include: { _count: { select: { invoices: true, sales: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        invoices: { orderBy: { createdAt: 'desc' } },
        sales: { orderBy: { createdAt: 'desc' }, take: 20, include: { saleItems: { include: { product: true } } } },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async findByPhone(phone: string) {
    return this.prisma.customer.findUnique({ where: { phone } });
  }

  async update(id: string, data: any) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    return this.prisma.customer.update({ where: { id }, data });
  }

  async toggleStatus(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    return this.prisma.customer.update({ where: { id }, data: { isActive: !customer.isActive } });
  }

  async getOutstandingBalances() {
    return this.prisma.customer.findMany({
      where: { creditUsed: { gt: 0 } },
      orderBy: { creditUsed: 'desc' },
      select: { id: true, name: true, phone: true, creditUsed: true, creditLimit: true },
    });
  }
}
