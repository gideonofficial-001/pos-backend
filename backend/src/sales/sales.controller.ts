import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Sales')
@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SalesController {
  constructor(private salesService: SalesService) {}

  @Post()
  @Roles(UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Create new sale (Branch Manager only)' })
  async create(@Body() createSaleDto: CreateSaleDto, @GetUser() user: any) {
    return this.salesService.create(createSaleDto, user);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Get all sales' })
  async findAll(
    @Query('branchId') branchId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @GetUser() user?: any,
  ) {
    return this.salesService.findAll({ branchId, startDate, endDate, type, search, user });
  }

  @Get('weekly')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Get weekly sales report' })
  async getWeeklySales(
    @Query('year') year?: string,
    @Query('week') week?: string,
    @GetUser() user?: any,
  ) {
    return this.salesService.getWeeklySales(
      year ? parseInt(year) : undefined,
      week ? parseInt(week) : undefined,
      user,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get sale by ID' })
  async findOne(@Param('id') id: string, @GetUser() user?: any) {
    return this.salesService.findOne(id, user);
  }

  @Get('code/:saleCode')
  @ApiOperation({ summary: 'Get sale by code' })
  async findByCode(@Param('saleCode') saleCode: string, @GetUser() user?: any) {
    return this.salesService.findByCode(saleCode, user);
  }
}