import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BranchesModule } from './branches/branches.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';
import { SalesModule } from './sales/sales.module';
import { InvoicesModule } from './invoices/invoices.module';
import { ReturnsModule } from './returns/returns.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DevicesModule } from './devices/devices.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    BranchesModule,
    ProductsModule,
    InventoryModule,
    SalesModule,
    InvoicesModule,
    ReturnsModule,
    AuditLogsModule,
    ReportsModule,
    NotificationsModule,
    DevicesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
