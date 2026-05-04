import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DevicesService } from './devices.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('devices')
@UseGuards(AuthGuard(), RolesGuard)
export class DevicesController {
  constructor(private devicesService: DevicesService) {}

  @Get('pending')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  async getPendingDevices() {
    return this.devicesService.getPendingDevices();
  }

  @Post(':id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  async approveDevice(@Param('id') deviceId: string, @GetUser('userId') userId: string) {
    const result = await this.devicesService.generateAuthorizationCode(deviceId, userId);
    return { message: 'Device approved successfully', authorizationCode: result.code };
  }

  @Get('my-devices')
  async getMyDevices(@GetUser('userId') userId: string) {
    return this.devicesService.getUserDevices(userId);
  }

  @Post(':id/revoke')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  async revokeDevice(@Param('id') deviceId: string) {
    await this.devicesService.revokeDevice(deviceId);
    return { message: 'Device revoked successfully' };
  }
}
