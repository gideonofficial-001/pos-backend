import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TransfersService } from './transfers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Transfers')
@Controller('transfers')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class TransfersController {
  constructor(private transfersService: TransfersService) {}

  @Post()
  @Roles(UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Create transfer request' })
  async create(@Body() data: any, @GetUser() user: any) {
    return this.transfersService.create(data, user);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Get all transfers' })
  async findAll(
    @Query('fromBranchId') fromBranchId?: string,
    @Query('toBranchId') toBranchId?: string,
    @Query('status') status?: string,
    @GetUser() user?: any,
  ) {
    return this.transfersService.findAll({ fromBranchId, toBranchId, status, user });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transfer by ID' })
  async findOne(@Param('id') id: string) {
    return this.transfersService.findOne(id);
  }

  @Patch(':id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Approve transfer' })
  async approve(@Param('id') id: string, @GetUser('userId') userId: string) {
    return this.transfersService.approve(id, userId);
  }

  @Patch(':id/reject')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Reject transfer' })
  async reject(
    @Param('id') id: string,
    @Body('rejectionReason') rejectionReason: string,
    @GetUser('userId') userId: string,
  ) {
    return this.transfersService.reject(id, userId, rejectionReason);
  }
}