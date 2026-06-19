import { Module } from '@nestjs/common';
import { ActivityFeedService } from './activity-feed.service';
import { ActivityFeedController } from './activity-feed.controller';

@Module({
  providers: [ActivityFeedService],
  controllers: [ActivityFeedController],
  exports: [ActivityFeedService],
})
export class ActivityFeedModule {}