import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { TransferService } from './transfer.service';
import { TransferController } from './transfer.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [InventoryService, TransferService],
  controllers: [InventoryController, TransferController],
  exports: [InventoryService, TransferService],
})
export class InventoryModule {}
