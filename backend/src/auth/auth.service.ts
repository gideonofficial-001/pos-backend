import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { DevicesService } from '../devices/devices.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { GeolocationService, LocationCheckResult } from './geolocation.service';
import { LoginDto } from './dto/login.dto';
import { RequestDeviceCodeDto } from './dto/request-device-code.dto';
import { VerifyDeviceCodeDto } from './dto/verify-device-code.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private devicesService: DevicesService,
    private auditLogsService: AuditLogsService,
    private geoService: GeolocationService,
  ) {}

  async login(loginDto: LoginDto, ipAddress: string, userAgent: string) {
    const {
      email,
      password,
      latitude,
      longitude,
      accuracy,
      deviceType,
      deviceFingerprint,
    } = loginDto;

    // 1. Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { branch: true },
    });

    if (!user) {
      await this.recordFailedLogin(
        null, email, ipAddress, userAgent, latitude, longitude, 'User not found',
      );
      throw new UnauthorizedException('Incorrect email or password');
    }

    // 2. Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await this.recordFailedLogin(
        user.id, email, ipAddress, userAgent, latitude, longitude, 'Invalid password',
      );
      await this.auditLogsService.create({
        action: 'LOGIN',
        entityType: 'USER',
        description: `Failed login attempt for ${email} — incorrect password`,
        ipAddress,
        userAgent,
      });
      throw new UnauthorizedException('Incorrect email or password');
    }

    // 3. Check account status
    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException(
        'Your account has been suspended. Contact administrator.',
      );
    }
    if (user.status === 'INACTIVE') {
      throw new ForbiddenException(
        'Your account is inactive. Contact administrator.',
      );
    }
    if (user.status !== 'ACTIVE') {
      await this.recordFailedLogin(
        user.id, email, ipAddress, userAgent, latitude, longitude, 'Account inactive',
      );
      throw new ForbiddenException('Account is not active');
    }

    // 4. Device check (skip for SUPER_ADMIN)
    if (user.role !== 'SUPER_ADMIN') {
      // Guard: fingerprint is marked @IsOptional in DTO but is required for the
      // device-auth flow. Any client that omits it gets a clear 400 error instead
      // of a Prisma crash from querying a @unique field with undefined.
      if (!deviceFingerprint) {
        throw new BadRequestException(
          'Device fingerprint is required. Please log in from the official app.',
        );
      }

      const deviceCheck = await this.devicesService.validateDevice(
        user.id,
        deviceFingerprint,
      );

      if (!deviceCheck.isAuthorized) {
        // Resolve a human-readable location for the admin approval card.
        // Use browser GPS if provided; fall back to IP lookup either way.
        let locationCity: string | undefined;
        let locationRegion: string | undefined;
        let locationCountry: string | undefined;
        try {
          const ipLoc = await this.geoService.getIpLocation(ipAddress);
          locationCity    = ipLoc.city;
          locationRegion  = ipLoc.region;
          locationCountry = ipLoc.country;
        } catch (_) {
          // Non-blocking — location display is best-effort
        }

        const deviceResult = await this.devicesService.requestAuthorization(
          user.id,
          deviceFingerprint,
          {
            ipAddress,
            userAgent,
            latitude:  latitude  ?? undefined,
            longitude: longitude ?? undefined,
            city:    locationCity,
            region:  locationRegion,
            country: locationCountry,
          },
        );

        return {
          requiresDeviceAuth: true,
          message: 'New device detected. Device authorization required.',
          deviceRequestId: deviceResult.requestId,
        };
      }

      await this.devicesService.updateLastUsed(user.id, deviceFingerprint);
    }

    // 5. Location check
    const location =
      latitude && longitude ? { latitude, longitude, accuracy } : null;
    const locationCheck = await this.geoService.checkLoginLocation(
      user.id,
      user.branchId,
      location,
      ipAddress,
    );

    // 6. Block HIGH-risk logins
    if (!locationCheck.isAllowed && locationCheck.riskLevel === 'HIGH') {
      await this.recordBlockedLogin(
        user.id, email, ipAddress, userAgent, latitude, longitude, locationCheck,
      );
      await this.notifyAdminOfSuspiciousLogin(user, locationCheck, ipAddress);
      throw new ForbiddenException(
        `Login blocked: ${locationCheck.reason}. Please contact your administrator.`,
      );
    }

    // 7. Record login location
    const loginRecord = await this.prisma.loginLocation.create({
      data: {
        userId: user.id,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        accuracy: accuracy ?? null,
        ipAddress,
        userAgent: userAgent ?? null,
        deviceType: deviceType ?? null,
        isSuspicious: locationCheck.riskLevel !== 'LOW',
        status: 'SUCCESS',
      },
    });

    // 8. Enrich with IP geolocation if browser location not provided
    if (!latitude || !longitude) {
      const ipLocation = await this.geoService.getIpLocation(ipAddress);
      if (ipLocation.latitude) {
        await this.prisma.loginLocation.update({
          where: { id: loginRecord.id },
          data: {
            latitude: ipLocation.latitude,
            longitude: ipLocation.longitude,
            city: ipLocation.city,
            region: ipLocation.region,
            country: ipLocation.country,
          },
        });
      }
    }

    // 9. Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // 10. Generate JWT (same payload shape as existing system)
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    };
    const access_token = this.jwtService.sign(payload);

    // 11. Audit log
    await this.auditLogsService.create({
      userId: user.id,
      action: 'LOGIN',
      entityType: 'USER',
      description: `User ${email} logged in successfully`,
      ipAddress,
      userAgent,
    });

    const { password: _, ...userWithoutPassword } = user;

    return {
      access_token,
      user: userWithoutPassword,
      // Only included when MEDIUM risk; undefined otherwise (no noise for normal logins)
      locationWarning:
        locationCheck.riskLevel !== 'LOW' ? locationCheck.reason : undefined,
    };
  }

  async requestDeviceCode(
    requestDto: RequestDeviceCodeDto,
    deviceInfo: { ipAddress: string; userAgent: string },
  ) {
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
      message:
        'Device authorization requested. Please contact admin for approval.',
      requestId: result.requestId,
    };
  }

  async verifyDeviceCode(
    verifyDto: VerifyDeviceCodeDto,
    deviceInfo: { ipAddress: string; userAgent: string },
  ) {
    const { requestId, authorizationCode } = verifyDto;

    const result = await this.devicesService.verifyAuthorizationCode(
      requestId,
      authorizationCode,
    );

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

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    };
    const access_token = this.jwtService.sign(payload);

    await this.auditLogsService.create({
      userId: user.id,
      action: 'DEVICE_APPROVED',
      entityType: 'DEVICE',
      description: 'New device approved and user logged in',
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
    });

    const { password: _, ...userWithoutPassword } = user;

    return { access_token, user: userWithoutPassword };
  }

  async logout(
    userId: string,
    deviceInfo: { ipAddress: string; userAgent: string },
  ) {
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

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async recordFailedLogin(
    userId: string | null,
    email: string,
    ipAddress: string,
    userAgent: string,
    latitude?: number,
    longitude?: number,
    reason?: string,
  ) {
    if (userId) {
      try {
        await this.prisma.loginLocation.create({
          data: {
            userId,
            latitude: latitude ?? null,
            longitude: longitude ?? null,
            ipAddress,
            userAgent,
            status: 'FAILED',
            blockReason: reason,
          },
        });
      } catch (e) {
        this.logger.warn('Could not record failed login location', e);
      }
    }
    this.logger.warn(
      `Failed login for ${email} from ${ipAddress}: ${reason}`,
    );
  }

  private async recordBlockedLogin(
    userId: string,
    email: string,
    ipAddress: string,
    userAgent: string,
    latitude?: number,
    longitude?: number,
    locationCheck?: LocationCheckResult,
  ) {
    try {
      await this.prisma.loginLocation.create({
        data: {
          userId,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          ipAddress,
          userAgent,
          isSuspicious: true,
          status: 'BLOCKED',
          blockReason: locationCheck?.reason,
        },
      });
    } catch (e) {
      this.logger.warn('Could not record blocked login location', e);
    }
    this.logger.warn(
      `Blocked login for ${email} from ${ipAddress}: ${locationCheck?.reason}`,
    );
  }

  private async notifyAdminOfSuspiciousLogin(
    user: any,
    locationCheck: LocationCheckResult,
    ipAddress: string,
  ) {
    try {
      await this.prisma.notification.create({
        data: {
          type: 'SYSTEM',
          title: 'Suspicious Login Attempt Blocked',
          message: `${user.firstName} ${user.lastName} (${user.email}) was blocked from logging in. Reason: ${locationCheck.reason}. IP: ${ipAddress}`,
          userId: null, // global — picked up by admin dashboard
          entityId: user.id,
          entityType: 'USER',
        },
      });
    } catch (e) {
      this.logger.warn('Could not create suspicious login notification', e);
    }
  }
}
