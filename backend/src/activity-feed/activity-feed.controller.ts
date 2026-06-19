import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ActivityFeedService } from './activity-feed.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Activity Feed')
@Controller('activity-feed')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ActivityFeedController {
  constructor(private activityFeedService: ActivityFeedService) {}

  @Get()
  @ApiOperation({ summary: 'Get activity feed' })
  async findAll(@GetUser() user?: any) {
    return this.activityFeedService.findAll(user);
  }

  @Get('recent')
  @ApiOperation({ summary: 'Get recent activity' })
  async getRecent(
    @Query('limit') limit?: string,
    @GetUser() user?: any,
  ) {
    return this.activityFeedService.getRecent(limit ? parseInt(limit) : 10, user);
  }
}