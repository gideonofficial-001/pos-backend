import { Module } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { BranchesController } from './branches.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [AuditLogsModule],
  providers: [BranchesService],
  controllers: [BranchesController],
  exports: [BranchesService],
})
export class BranchesModule {}
