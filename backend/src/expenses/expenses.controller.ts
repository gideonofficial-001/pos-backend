import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Expenses')
@Controller('expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ExpensesController {
  constructor(private expensesService: ExpensesService) {}

  @Post()
  @Roles(UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Submit expense (Branch Manager)' })
  async create(@Body() createExpenseDto: CreateExpenseDto, @GetUser() user: any) {
    return this.expensesService.create(createExpenseDto, user);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Get all expenses' })
  async findAll(
    @Query('branchId') branchId?: string,
    @Query('status') status?: string,
    @GetUser() user?: any,
  ) {
    return this.expensesService.findAll({ branchId, status, user });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get expense by ID' })
  async findOne(@Param('id') id: string) {
    return this.expensesService.findOne(id);
  }

  @Patch(':id/approve')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Approve expense (Admin only)' })
  async approve(@Param('id') id: string, @GetUser('userId') userId: string) {
    return this.expensesService.approve(id, userId);
  }

  @Patch(':id/reject')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Reject expense (Admin only)' })
  async reject(
    @Param('id') id: string,
    @Body('rejectionReason') rejectionReason: string,
    @GetUser('userId') userId: string,
  ) {
    return this.expensesService.reject(id, userId, rejectionReason);
  }
}