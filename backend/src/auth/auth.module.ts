import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GeolocationService } from './geolocation.service';
import { JwtStrategy } from './jwt.strategy';
import { DevicesModule } from '../devices/devices.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET') || 'njugush-pos-secret-key-2024',
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN') || '24h',
        },
      }),
      inject: [ConfigService],
    }),
    DevicesModule,
    AuditLogsModule,
  ],
  providers: [AuthService, GeolocationService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, GeolocationService],
})
export class AuthModule {}
