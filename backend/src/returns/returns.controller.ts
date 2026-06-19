import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReturnsService } from './returns.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Returns')
@Controller('returns')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ReturnsController {
  constructor(private returnsService: ReturnsService) {}

  @Post()
  @Roles(UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Create return request' })
  async create(@Body() createReturnDto: CreateReturnDto, @GetUser() user: any) {
    return this.returnsService.create(createReturnDto, user);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Get all return requests' })
  async findAll(
    @Query('branchId') branchId?: string,
    @Query('status') status?: string,
    @GetUser() user?: any,
  ) {
    return this.returnsService.findAll({ branchId, status, user });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get return by ID' })
  async findOne(@Param('id') id: string) {
    return this.returnsService.findOne(id);
  }

  @Patch(':id/approve')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Approve return (Admin only)' })
  async approve(@Param('id') id: string, @GetUser('userId') userId: string) {
    return this.returnsService.approve(id, userId);
  }

  @Patch(':id/reject')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Reject return (Admin only)' })
  async reject(
    @Param('id') id: string,
    @Body('rejectionReason') rejectionReason: string,
    @GetUser('userId') userId: string,
  ) {
    return this.returnsService.reject(id, userId, rejectionReason);
  }
}