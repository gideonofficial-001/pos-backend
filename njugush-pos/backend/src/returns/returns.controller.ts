import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReturnsService } from './returns.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole, ReturnStatus } from '@prisma/client';

@Controller('returns')
@UseGuards(AuthGuard(), RolesGuard)
export class ReturnsController {
  constructor(private returnsService: ReturnsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async create(@Body() createReturnDto: CreateReturnDto, @GetUser() user: any) {
    return this.returnsService.create(createReturnDto, user);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  async findAll(@Query('status') status?: ReturnStatus, @GetUser() user?: any) {
    return this.returnsService.findAll({ status, user });
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  async findOne(@Param('id') id: string, @GetUser() user: any) {
    return this.returnsService.findOne(id, user);
  }

  @Patch(':id/approve')
  @Roles(UserRole.SUPER_ADMIN)
  async approve(@Param('id') id: string, @GetUser() user: any) {
    return this.returnsService.approve(id, user);
  }

  @Patch(':id/reject')
  @Roles(UserRole.SUPER_ADMIN)
  async reject(@Param('id') id: string, @Body('reason') reason: string, @GetUser() user: any) {
    return this.returnsService.reject(id, reason, user);
  }
}
