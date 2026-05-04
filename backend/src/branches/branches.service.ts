import { Injectable, NotFoundException } from '@nestjs/common';
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
    const branch = await this.prisma.branch.create({ data: createBranchDto });
    await this.auditLogsService.create({
      userId: performedBy,
      action: 'BRANCH_CREATED',
      description: `Created branch ${branch.name}`,
      entityType: 'Branch',
      entityId: branch.id,
      newValues: createBranchDto,
    });
    return branch;
  }

  async findAll() {
    return this.prisma.branch.findMany({
      include: {
        _count: { select: { users: true, inventory: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
        inventory: { include: { product: true } },
      },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return branch;
  }

  async findByCode(code: string) {
    return this.prisma.branch.findUnique({ where: { code } });
  }

  async update(id: string, updateBranchDto: UpdateBranchDto, performedBy: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const updatedBranch = await this.prisma.branch.update({
      where: { id },
      data: updateBranchDto,
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

    return updatedBranch;
  }

  async remove(id: string, performedBy: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (branch._count.users > 0) {
      throw new NotFoundException('Cannot delete branch with assigned users');
    }

    await this.prisma.branch.delete({ where: { id } });

    await this.auditLogsService.create({
      userId: performedBy,
      action: 'BRANCH_UPDATED',
      description: `Deleted branch ${branch.name}`,
      entityType: 'Branch',
      entityId: id,
      oldValues: branch,
    });

    return { message: 'Branch deleted successfully' };
  }
}
