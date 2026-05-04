import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole, UserStatus } from '@prisma/client';

@Controller('users')
@UseGuards(AuthGuard(), RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  async create(@Body() createUserDto: CreateUserDto, @GetUser('userId') userId: string) {
    return this.usersService.create(createUserDto, userId);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  async findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto, @GetUser('userId') userId: string) {
    return this.usersService.update(id, updateUserDto, userId);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async remove(@Param('id') id: string, @GetUser('userId') userId: string) {
    return this.usersService.remove(id, userId);
  }

  @Patch(':id/status')
  @Roles(UserRole.SUPER_ADMIN)
  async updateStatus(@Param('id') id: string, @Query('status') status: UserStatus, @GetUser('userId') userId: string) {
    return this.usersService.updateStatus(id, status, userId);
  }
}
