import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TransfersService } from './transfers.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
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
  async create(@Body() data: CreateTransferDto, @GetUser() user: any) {
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
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Get transfer by ID' })
  async findOne(@Param('id') id: string) {
    return this.transfersService.findOne(id);
  }

  @Patch(':id/approve')
  @Roles(UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Approve all remaining pending items on a transfer' })
  async approve(@Param('id') id: string, @GetUser() user: any) {
    return this.transfersService.approve(id, user);
  }

  @Patch(':id/reject')
  @Roles(UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Reject all remaining pending items on a transfer' })
  async reject(
    @Param('id') id: string,
    @Body('rejectionReason') rejectionReason: string,
    @GetUser() user: any,
  ) {
    return this.transfersService.reject(id, user, rejectionReason);
  }

  @Patch(':id/items/:itemId/approve')
  @Roles(UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Approve a single item on a transfer' })
  async approveItem(@Param('id') id: string, @Param('itemId') itemId: string, @GetUser() user: any) {
    return this.transfersService.approveItem(id, itemId, user);
  }

  @Patch(':id/items/:itemId/reject')
  @Roles(UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Reject a single item on a transfer' })
  async rejectItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body('rejectionReason') rejectionReason: string,
    @GetUser() user: any,
  ) {
    return this.transfersService.rejectItem(id, itemId, user, rejectionReason);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Cancel a pending transfer request (initiator only)' })
  async cancel(@Param('id') id: string, @GetUser() user: any) {
    return this.transfersService.cancel(id, user);
  }
}
