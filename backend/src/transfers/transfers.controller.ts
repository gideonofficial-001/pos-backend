import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TransfersService } from './transfers.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Transfers')
@Controller('transfers')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Create a new stock transfer' })
  create(@Body() createTransferDto: CreateTransferDto, @Request() req) {
    return this.transfersService.create(createTransferDto, req.user);
  }

  @Get()
  @ApiOperation({ summary: 'Get all transfers for the user branch' })
  findAll(@Request() req) {
    return this.transfersService.findAll(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transfer details' })
  findOne(@Param('id') id: string) {
    return this.transfersService.findOne(id);
  }

  @Patch(':id/items/:itemId/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Approve a single transfer item' })
  approveItem(@Param('id') id: string, @Param('itemId') itemId: string, @Request() req) {
    return this.transfersService.approveItem(id, itemId, req.user);
  }

  @Patch(':id/items/:itemId/reject')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Reject a single transfer item' })
  rejectItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body('rejectionReason') rejectionReason: string,
    @Request() req,
  ) {
    return this.transfersService.rejectItem(id, itemId, req.user, rejectionReason);
  }

  @Patch(':id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Approve all pending items in a transfer' })
  approve(@Param('id') id: string, @Request() req) {
    return this.transfersService.approve(id, req.user);
  }

  @Patch(':id/reject')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Reject all pending items in a transfer' })
  reject(
    @Param('id') id: string,
    @Body('rejectionReason') rejectionReason: string,
    @Request() req,
  ) {
    return this.transfersService.reject(id, req.user, rejectionReason);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Cancel a pending transfer' })
  cancel(@Param('id') id: string, @Request() req) {
    return this.transfersService.cancel(id, req.user);
  }
}
