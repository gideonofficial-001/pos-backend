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

  async login(loginDto: LoginDto, deviceInfo: any) {
    const { email, password, deviceFingerprint } = loginDto;

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { branch: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await this.auditLogsService.create({
        action: 'LOGIN',
        description: `Failed login attempt for ${email}`,
        ipAddress: deviceInfo.ipAddress,
        userAgent: deviceInfo.userAgent,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is not active');
    }

    const deviceCheck = await this.devicesService.validateDevice(user.id, deviceFingerprint);

    if (!deviceCheck.isAuthorized) {
      return {
        requiresDeviceAuth: true,
        message: 'Device authorization required',
        deviceRequestId: deviceCheck.deviceRequestId,
      };
    }

    await this.devicesService.updateLastUsed(deviceFingerprint);

    const payload = { sub: user.id, email: user.email, role: user.role, branchId: user.branchId };
    const token = this.jwtService.sign(payload);

    await this.auditLogsService.create({
      userId: user.id,
      action: 'LOGIN',
      description: `User ${email} logged in successfully`,
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
    });

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        branch: user.branch,
      },
    };
  }

  async requestDeviceCode(requestDto: RequestDeviceCodeDto, deviceInfo: any) {
    const { email, deviceFingerprint } = requestDto;
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const result = await this.devicesService.requestAuthorization(user.id, deviceFingerprint, deviceInfo);

    return {
      message: 'Device authorization requested. Please contact admin/manager for approval.',
      requestId: result.requestId,
    };
  }

  async verifyDeviceCode(verifyDto: VerifyDeviceCodeDto, deviceInfo: any) {
    const { requestId, authorizationCode } = verifyDto;
    const result = await this.devicesService.verifyAuthorizationCode(requestId, authorizationCode);

    if (!result.valid) {
      throw new BadRequestException('Invalid or expired authorization code');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: result.userId },
      include: { branch: true },
    });

    const payload = { sub: user.id, email: user.email, role: user.role, branchId: user.branchId };
    const token = this.jwtService.sign(payload);

    await this.auditLogsService.create({
      userId: user.id,
      action: 'DEVICE_APPROVED',
      description: 'New device approved and user logged in',
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
    });

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        branch: user.branch,
      },
    };
  }

  async logout(userId: string, deviceInfo: any) {
    await this.auditLogsService.create({
      userId,
      action: 'LOGOUT',
      description: 'User logged out',
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
    });
    return { message: 'Logged out successfully' };
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, include: { branch: true } });
  }
}
