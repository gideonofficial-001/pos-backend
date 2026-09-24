import { Module } from '@nestjs/common';
import { ClosingStockService } from './closing-stock.service';
import { ClosingStockController } from './closing-stock.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ClosingStockController],
  providers: [ClosingStockService],
})
export class ClosingStockModule {}
