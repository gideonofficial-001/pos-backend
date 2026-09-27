import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TransfersModule } from '../transfers/transfers.module';

@Module({
  imports: [
    NotificationsModule, 
    AuditLogsModule, 
    PrismaModule,
    TransfersModule,
  ],
  providers: [SalesService],
  controllers: [SalesController],
  exports: [SalesService],
})
export class SalesModule {}
