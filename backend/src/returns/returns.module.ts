import { Module } from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { ReturnsController } from './returns.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [AuditLogsModule],
  providers: [ReturnsService],
  controllers: [ReturnsController],
  exports: [ReturnsService],
})
export class ReturnsModule {}
