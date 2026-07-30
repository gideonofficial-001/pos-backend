import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Settings')
@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all settings' })
  async getAll() {
    return this.settingsService.getAll();
  }

  @Get('public')
  @ApiOperation({ summary: 'Get public settings' })
  async getPublicSettings() {
    return this.settingsService.getPublicSettings();
  }

  @Get(':key')
  @ApiOperation({ summary: 'Get setting by key' })
  async getByKey(@Param('key') key: string) {
    return this.settingsService.getByKey(key);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create or update setting (Admin only)' })
  async upsert(
    @Body('key') key: string,
    @Body('value') value: string,
    @Body('description') description?: string,
  ) {
    return this.settingsService.upsert(key, value, description);
  }

  @Delete(':key')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete setting (Admin only)' })
  async delete(@Param('key') key: string) {
    return this.settingsService.delete(key);
  }
}
