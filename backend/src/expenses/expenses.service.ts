import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ExpenseStatus, UserRole } from '@prisma/client';
import { CreateExpenseDto } from './dto/create-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async create(createExpenseDto: CreateExpenseDto, user: any) {
    const { branchId, amount, category, description, receiptUrl } = createExpenseDto;

    const count = await this.prisma.expense.count();
    const expenseCode = `EXP-${String(count + 1).padStart(5, '0')}`;

    const expense = await this.prisma.expense.create({
      data: {
        expenseCode,
        branchId,
        userId: user.userId,
        amount,
        category,
        description,
        receiptUrl,
        status: ExpenseStatus.PENDING,
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        user: { select: { firstName: true, lastName: true } },
      },
    });

    // Notify all admins who need to action the expense — NOT the submitter.
    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.SUPER_ADMIN },
      select: { id: true },
    });
    await Promise.all(
      admins.map((admin) =>
        this.notificationsService.create({
          type: 'EXPENSE_SUBMITTED',
          title: 'New Expense Submitted',
          message: `Expense ${expenseCode} from ${expense.branch.name} — KES ${Number(amount).toFixed(2)}`,
          userId: admin.id,
          entityId: expense.id,
          entityType: 'Expense',
        }),
      ),
    );

    await this.prisma.activityFeed.create({
      data: {
        type: 'EXPENSE_SUBMITTED',
        branchId,
        title: 'Expense Submitted',
        message: `Expense ${expenseCode} - KES ${Number(amount).toFixed(2)}: ${description}`,
        entityId: expense.id,
        entityType: 'Expense',
        visibleToBranch: true,
      },
    });

    return expense;
  }

  async findAll(query?: { branchId?: string; status?: string; user?: any }) {
    const where: any = {};
    if (query?.branchId) where.branchId = query.branchId;
    if (query?.status) where.status = query.status;

    return this.prisma.expense.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        user: { select: { firstName: true, lastName: true } },
        approvedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: {
        branch: true,
        user: { select: { firstName: true, lastName: true } },
        approvedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async approve(id: string, approvedById: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Expense not found');
    if (expense.status !== ExpenseStatus.PENDING) {
      throw new BadRequestException('Expense is not pending');
    }

    const updated = await this.prisma.expense.update({
      where: { id },
      data: { status: ExpenseStatus.APPROVED, approvedById, approvedAt: new Date() },
      include: { branch: true, user: { select: { firstName: true, lastName: true } } },
    });

    await this.notificationsService.create({
      type: 'EXPENSE_APPROVED',
      title: 'Expense Approved',
      message: `Your expense ${expense.expenseCode} has been approved`,
      userId: expense.userId,
      entityId: id,
      entityType: 'Expense',
    });

    return updated;
  }

  async reject(id: string, approvedById: string, rejectionReason: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Expense not found');
    if (expense.status !== ExpenseStatus.PENDING) {
      throw new BadRequestException('Expense is not pending');
    }

    const updated = await this.prisma.expense.update({
      where: { id },
      data: { status: ExpenseStatus.REJECTED, approvedById, approvedAt: new Date(), rejectionReason },
    });

    await this.notificationsService.create({
      type: 'EXPENSE_REJECTED',
      title: 'Expense Rejected',
      message: `Your expense ${expense.expenseCode} has been rejected. Reason: ${rejectionReason}`,
      userId: expense.userId,
      entityId: id,
      entityType: 'Expense',
    });

    return updated;
  }
}
