import { Controller, Get, Post, Patch, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Devices')
@Controller('devices')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DevicesController {
  constructor(private devicesService: DevicesService) {}

  @Get('pending')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get pending device approvals (Admin only)' })
  async getPendingDevices() {
    return this.devicesService.getPendingDevices();
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all devices (Admin only)' })
  async getAllDevices() {
    return this.devicesService.getAllDevices();
  }

  @Post(':id/approve')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Approve device and generate auth code (Admin only)' })
  async approveDevice(@Param('id') id: string, @GetUser('userId') userId: string) {
    return this.devicesService.generateAuthorizationCode(id, userId);
  }

  @Patch(':id/revoke')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Revoke device (Admin only)' })
  async revokeDevice(@Param('id') id: string) {
    return this.devicesService.revokeDevice(id);
  }
}