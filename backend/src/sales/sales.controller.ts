import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BranchAccessGuard } from '../auth/guards/branch-access.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole, SaleType } from '@prisma/client';

@Controller('sales')
@UseGuards(AuthGuard(), RolesGuard)
export class SalesController {
  constructor(private salesService: SalesService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @UseGuards(BranchAccessGuard)
  async create(@Body() createSaleDto: CreateSaleDto, @GetUser() user: any) {
    return this.salesService.create(createSaleDto, user);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  async findAll(
    @Query('branchId') branchId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('type') type?: SaleType,
    @GetUser() user?: any,
  ) {
    return this.salesService.findAll({ branchId, startDate, endDate, type, user });
  }

  @Get('daily-summary')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  async getDailySales(@Query('branchId') branchId?: string, @Query('date') date?: string) {
    return this.salesService.getDailySales(branchId, date);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  async findOne(@Param('id') id: string, @GetUser() user: any) {
    return this.salesService.findOne(id, user);
  }

  @Get('code/:saleCode')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  async findByCode(@Param('saleCode') saleCode: string, @GetUser() user: any) {
    return this.salesService.findByCode(saleCode, user);
  }
}
