import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
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
  @Roles(UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN)
  async create(@Body() data: CreateTransferDto, @GetUser() user: any) {
    return this.transfersService.create(data, user);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  async findAll(@Request() req) {
    return this.transfersService.findAll(req.user.userId);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  async findOne(@Param('id') id: string) {
    return this.transfersService.findOne(id);
  }

  @Patch(':id/approve')
  @Roles(UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN)
  async approve(@Param('id') id: string, @GetUser() user: any) {
    return this.transfersService.approve(id, user);
  }

  @Patch(':id/reject')
  @Roles(UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN)
  async reject(@Param('id') id: string, @Body('rejectionReason') rejectionReason: string, @GetUser() user: any) {
    return this.transfersService.reject(id, user, rejectionReason);
  }

  @Patch(':id/items/:itemId/approve')
  @Roles(UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN)
  async approveItem(@Param('id') id: string, @Param('itemId') itemId: string, @GetUser() user: any) {
    return this.transfersService.approveItem(id, itemId, user);
  }

  @Patch(':id/items/:itemId/reject')
  @Roles(UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN)
  async rejectItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body('rejectionReason') rejectionReason: string, @GetUser() user: any) {
    return this.transfersService.rejectItem(id, itemId, user, rejectionReason);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async cancel(@Param('id') id: string, @GetUser() user: any) {
    return this.transfersService.cancel(id, user);
  }
}
