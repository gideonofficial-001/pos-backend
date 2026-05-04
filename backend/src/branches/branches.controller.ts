import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('branches')
@UseGuards(AuthGuard(), RolesGuard)
export class BranchesController {
  constructor(private branchesService: BranchesService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  async create(@Body() createBranchDto: CreateBranchDto, @GetUser('userId') userId: string) {
    return this.branchesService.create(createBranchDto, userId);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  async findAll() {
    return this.branchesService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  async findOne(@Param('id') id: string) {
    return this.branchesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async update(@Param('id') id: string, @Body() updateBranchDto: UpdateBranchDto, @GetUser('userId') userId: string) {
    return this.branchesService.update(id, updateBranchDto, userId);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async remove(@Param('id') id: string, @GetUser('userId') userId: string) {
    return this.branchesService.remove(id, userId);
  }
}
