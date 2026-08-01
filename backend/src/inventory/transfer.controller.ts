import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { TransferService } from './transfer.service';
import { CreateTransferDto, RespondToTransferDto, TransferFilterDto } from './dto/transfer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('inventory/transfers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransferController {
  constructor(private transferService: TransferService) {}

  @Post()
  @Roles(UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN)
  async createTransfer(@Body() dto: CreateTransferDto, @Request() req) {
    return this.transferService.createTransfer(req.user.userId, dto);
  }

  @Get()
  async getTransfers(@Query() filters: TransferFilterDto, @Request() req) {
    return this.transferService.getTransfers(req.user.userId, filters);
  }

  @Get(':id')
  async getTransfer(@Param('id') id: string, @Request() req) {
    return this.transferService.getTransferById(id, req.user.userId);
  }

  @Post(':id/respond')
  @Roles(UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN)
  async respondToTransfer(
    @Param('id') transferId: string,
    @Body() dto: RespondToTransferDto,
    @Request() req,
  ) {
    return this.transferService.respondToTransfer(transferId, req.user.userId, dto);
  }

  @Post(':id/cancel')
  async cancelTransfer(@Param('id') transferId: string, @Request() req) {
    return this.transferService.cancelTransfer(transferId, req.user.userId);
  }
}
