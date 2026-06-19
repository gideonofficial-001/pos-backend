import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { DevicesService } from '../devices/devices.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { LoginDto } from './dto/login.dto';
import { RequestDeviceCodeDto } from './dto/request-device-code.dto';
import { VerifyDeviceCodeDto } from './dto/verify-device-code.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private devicesService: DevicesService,
    private auditLogsService: AuditLogsService,
  ) {}

  async login(loginDto: LoginDto, deviceInfo: { ipAddress: string; userAgent: string }) {
    const { email, password, deviceFingerprint } = loginDto;

    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { branch: true },
    });

    if (!user) {
      throw new UnauthorizedException('Incorrect email or password');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await this.auditLogsService.create({
        action: 'LOGIN',
        entityType: 'USER',
        description: `Failed login attempt for ${email} - incorrect password`,
        ipAddress: deviceInfo.ipAddress,
        userAgent: deviceInfo.userAgent,
      });
      throw new UnauthorizedException('Incorrect email or password');
    }

    // Check if account is active
    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException('Your account has been suspended. Contact administrator.');
    }
    if (user.status === 'INACTIVE') {
      throw new ForbiddenException('Your account is inactive. Contact administrator.');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is not active');
    }

    // Device check - skip for SUPER_ADMIN
    if (user.role !== 'SUPER_ADMIN') {
      const deviceCheck = await this.devicesService.validateDevice(user.id, deviceFingerprint);

      if (!deviceCheck.isAuthorized) {
        // Create pending device request
        const deviceResult = await this.devicesService.requestAuthorization(
          user.id,
          deviceFingerprint,
          deviceInfo,
        );

        return {
          requiresDeviceAuth: true,
          message: 'New device detected. Device authorization required.',
          deviceRequestId: deviceResult.requestId,
        };
      }

      await this.devicesService.updateLastUsed(deviceFingerprint);
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate JWT
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    };
    const token = this.jwtService.sign(payload);

    // Log successful login
    await this.auditLogsService.create({
      userId: user.id,
      action: 'LOGIN',
      entityType: 'USER',
      description: `User ${email} logged in successfully`,
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
    });

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    return {
      access_token: token,
      user: userWithoutPassword,
    };
  }

  async requestDeviceCode(requestDto: RequestDeviceCodeDto, deviceInfo: { ipAddress: string; userAgent: string }) {
    const { email, deviceFingerprint } = requestDto;

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const result = await this.devicesService.requestAuthorization(
      user.id,
      deviceFingerprint,
      deviceInfo,
    );

    return {
      message: 'Device authorization requested. Please contact admin for approval.',
      requestId: result.requestId,
    };
  }

  async verifyDeviceCode(verifyDto: VerifyDeviceCodeDto, deviceInfo: { ipAddress: string; userAgent: string }) {
    const { requestId, authorizationCode } = verifyDto;

    const result = await this.devicesService.verifyAuthorizationCode(requestId, authorizationCode);

    if (!result.valid) {
      throw new BadRequestException('Invalid or expired authorization code');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: result.userId },
      include: { branch: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Generate JWT
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    };
    const token = this.jwtService.sign(payload);

    // Log device approval
    await this.auditLogsService.create({
      userId: user.id,
      action: 'DEVICE_APPROVED',
      entityType: 'DEVICE',
      description: 'New device approved and user logged in',
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
    });

    const { password: _, ...userWithoutPassword } = user;

    return {
      access_token: token,
      user: userWithoutPassword,
    };
  }

  async logout(userId: string, deviceInfo: { ipAddress: string; userAgent: string }) {
    await this.auditLogsService.create({
      userId,
      action: 'LOGOUT',
      entityType: 'USER',
      description: 'User logged out',
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
    });
    return { message: 'Logged out successfully' };
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });
  }
}