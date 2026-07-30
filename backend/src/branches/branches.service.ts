import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Injectable()
export class BranchesService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  async create(createBranchDto: CreateBranchDto, performedBy: string) {
    const existing = await this.prisma.branch.findUnique({
      where: { code: createBranchDto.code },
    });
    if (existing) {
      throw new ConflictException(
        `Branch with code ${createBranchDto.code} already exists`,
      );
    }

    const branch = await this.prisma.branch.create({
      data: createBranchDto,
      include: {
        manager: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    await this.auditLogsService.create({
      userId: performedBy,
      action: 'BRANCH_CREATED',
      description: `Created branch ${branch.name} (${branch.code})`,
      entityType: 'Branch',
      entityId: branch.id,
      newValues: createBranchDto,
    });

    return branch;
  }

  async findAll() {
    return this.prisma.branch.findMany({
      include: {
        manager: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: { select: { users: true, inventory: true, sales: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: {
        manager: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        users: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        inventory: { include: { product: true } },
        _count: { select: { sales: true } },
      },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async update(id: string, updateBranchDto: UpdateBranchDto, performedBy: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) throw new NotFoundException('Branch not found');

    const updated = await this.prisma.branch.update({
      where: { id },
      data: updateBranchDto,
      include: {
        manager: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    await this.auditLogsService.create({
      userId: performedBy,
      action: 'BRANCH_UPDATED',
      description: `Updated branch ${branch.name}`,
      entityType: 'Branch',
      entityId: id,
      oldValues: branch,
      newValues: updateBranchDto,
    });

    return updated;
  }

  async toggleStatus(id: string, performedBy: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) throw new NotFoundException('Branch not found');
    return this.prisma.branch.update({
      where: { id },
      data: { isActive: !branch.isActive },
    });
  }

  async getBranchInventory(id: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) throw new NotFoundException('Branch not found');

    return this.prisma.inventory.findMany({
      where: { branchId: id },
      include: { product: { include: { category: true } } },
      orderBy: { product: { name: 'asc' } },
    });
  }

  async getBranchSales(id: string, startDate?: string, endDate?: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) throw new NotFoundException('Branch not found');

    const where: any = { branchId: id };
    if (startDate && endDate) {
      where.createdAt = { gte: new Date(startDate), lte: new Date(endDate) };
    }

    return this.prisma.sale.findMany({
      where,
      include: {
        saleItems: { include: { product: true } },
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
