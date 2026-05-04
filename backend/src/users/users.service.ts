import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  async create(createUserDto: CreateUserDto, performedBy: string) {
    const { email, password, firstName, lastName, phone, role, branchId } = createUserDto;

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    if (role === UserRole.BRANCH_MANAGER && !branchId) {
      throw new BadRequestException('Branch ID is required for branch managers');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone,
        role,
        branchId,
        status: UserStatus.ACTIVE,
      },
      include: { branch: true },
    });

    await this.auditLogsService.create({
      userId: performedBy,
      action: 'USER_CREATED',
      description: `Created user ${email} with role ${role}`,
      entityType: 'User',
      entityId: user.id,
      newValues: { email, firstName, lastName, role, branchId },
    });

    const { password: _, ...result } = user;
    return result;
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      include: {
        branch: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return users.map(({ password, ...user }) => user);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        branch: true,
        devices: {
          select: { id: true, deviceInfo: true, status: true, lastUsedAt: true, createdAt: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { password, ...result } = user;
    return result;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email }, include: { branch: true } });
  }

  async update(id: string, updateUserDto: UpdateUserDto, performedBy: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updateData: any = { ...updateUserDto };
    if (updateUserDto.password) {
      updateData.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: updateData,
      include: { branch: true },
    });

    await this.auditLogsService.create({
      userId: performedBy,
      action: 'USER_UPDATED',
      description: `Updated user ${user.email}`,
      entityType: 'User',
      entityId: id,
      oldValues: user,
      newValues: updateUserDto,
    });

    const { password, ...result } = updatedUser;
    return result;
  }

  async remove(id: string, performedBy: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { _count: { select: { sales: true } } },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('Cannot delete super admin user');
    }

    await this.prisma.user.delete({ where: { id } });

    await this.auditLogsService.create({
      userId: performedBy,
      action: 'USER_DELETED',
      description: `Deleted user ${user.email}`,
      entityType: 'User',
      entityId: id,
      oldValues: user,
    });

    return { message: 'User deleted successfully' };
  }

  async updateStatus(id: string, status: UserStatus, performedBy: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { status },
      include: { branch: true },
    });

    await this.auditLogsService.create({
      userId: performedBy,
      action: 'USER_UPDATED',
      description: `Changed user ${user.email} status to ${status}`,
      entityType: 'User',
      entityId: id,
      oldValues: { status: user.status },
      newValues: { status },
    });

    const { password, ...result } = updatedUser;
    return result;
  }
}
