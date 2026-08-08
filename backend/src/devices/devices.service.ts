import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DeviceStatus, UserRole } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import * as bcrypt from 'bcrypt';

@Injectable()
export class DevicesService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
    private notificationsService: NotificationsService,
  ) {}

  private getMailTransporter() {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  async validateDevice(userId: string, fingerprint: string) {
    // fingerprint is globally unique per schema
    const device = await this.prisma.device.findUnique({
      where: { fingerprint },
    });

    if (!device || device.userId !== userId) {
      return { isAuthorized: false };
    }

    if (device.status !== DeviceStatus.APPROVED) {
      return { isAuthorized: false, deviceRequestId: device.id };
    }

    return { isAuthorized: true };
  }

  async requestAuthorization(
    userId: string,
    fingerprint: string,
    deviceInfo: {
      ipAddress: string;
      userAgent: string;
      latitude?: number;
      longitude?: number;
      city?: string;
      region?: string;
      country?: string;
    },
  ) {
    // ─── Pre-generate a 6-digit code for THIS request ────────────────────────
    // The plain code goes into the admin notification so they can share it
    // immediately without navigating to Pending Approvals.
    const plainCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedCode = await bcrypt.hash(plainCode, 10);
    const codeExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Fetch user + branch for notification message
    const requestingUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        branch: { select: { name: true } },
      },
    });

    const userName = requestingUser
      ? `${requestingUser.firstName} ${requestingUser.lastName}`
      : 'A user';
    const branchName = requestingUser?.branch?.name ?? 'unknown branch';
    const locationParts = [deviceInfo.city, deviceInfo.region, deviceInfo.country].filter(Boolean);
    const locationStr = locationParts.length > 0 ? locationParts.join(', ') : null;
    const loginTime = new Date().toLocaleTimeString('en-KE', {
      hour: '2-digit',
      minute: '2-digit',
    });

    // ─── BUG FIX 1 + 2: Handle existing device records ───────────────────────
    // Previously: any existing device caused an early return with NO notification.
    // REVOKED devices left the user in a permanent dead-end.
    // Fix: PENDING → refresh code + resend notification.
    //      REVOKED → delete stale record, treat as new device.
    //      APPROVED → should not reach here (validateDevice blocks earlier), but handle safely.
    const existingDevice = await this.prisma.device.findUnique({
      where: { fingerprint },
    });

    if (existingDevice) {
      if (existingDevice.status === DeviceStatus.APPROVED) {
        // Device is already approved — nothing to do.
        return { requestId: existingDevice.id, status: existingDevice.status };
      }

      if (existingDevice.status === DeviceStatus.REVOKED) {
        // BUG FIX 2: REVOKED device — delete it so a fresh request can be made.
        await this.prisma.device.delete({ where: { id: existingDevice.id } });
        // Fall through to create a new device record below.
      } else {
        // status === PENDING
        // BUG FIX 1: Refresh the code and RE-SEND the notification.
        // Previously this just returned silently — admin was never told again.
        await this.prisma.device.update({
          where: { id: existingDevice.id },
          data: {
            requestCode: hashedCode,
            requestCodeExpiry: codeExpiry,
            // Refresh location in case it changed
            loginIpAddress: deviceInfo.ipAddress ?? existingDevice.loginIpAddress,
            loginCity:      deviceInfo.city      ?? existingDevice.loginCity,
            loginRegion:    deviceInfo.region    ?? existingDevice.loginRegion,
            loginCountry:   deviceInfo.country   ?? existingDevice.loginCountry,
          },
        });

        await this.sendAdminNotification(
          userId,
          existingDevice.id,
          userName,
          branchName,
          locationStr,
          loginTime,
          plainCode,
        );

        return { requestId: existingDevice.id, status: existingDevice.status };
      }
    }

    // ─── Enforce 1 approved device per user ──────────────────────────────────
    const approvedCount = await this.prisma.device.count({
      where: { userId, status: DeviceStatus.APPROVED },
    });

    if (approvedCount >= 1) {
      throw new UnauthorizedException(
        'Security limit reached: user already has an active approved device.',
      );
    }

    // ─── Create new device record ─────────────────────────────────────────────
    // The pre-generated code is stored hashed. Device stays PENDING so it
    // still shows up in the admin's Pending Approvals tab. The code is valid
    // immediately — verifyAuthorizationCode now accepts PENDING status — so
    // the admin can simply copy the code from the notification and share it.
    const device = await this.prisma.device.create({
      data: {
        userId,
        fingerprint,
        name: deviceInfo.userAgent?.substring(0, 100) || 'Unknown device',
        status: DeviceStatus.PENDING,
        requestCode: hashedCode,
        requestCodeExpiry: codeExpiry,
        loginIpAddress: deviceInfo.ipAddress ?? null,
        loginLatitude:  deviceInfo.latitude  ?? null,
        loginLongitude: deviceInfo.longitude ?? null,
        loginCity:      deviceInfo.city      ?? null,
        loginRegion:    deviceInfo.region    ?? null,
        loginCountry:   deviceInfo.country   ?? null,
      },
    });

    await this.auditLogsService.create({
      userId,
      action: 'DEVICE_REGISTERED',
      description: `New device registered for user ${userId}`,
      entityType: 'Device',
      entityId: device.id,
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
    });

    // BUG FIX 3: Notification now contains the authorization code directly.
    await this.sendAdminNotification(
      userId,
      device.id,
      userName,
      branchName,
      locationStr,
      loginTime,
      plainCode,
    );

    return { requestId: device.id, status: DeviceStatus.PENDING };
  }

  // ─── Private: Build notification message and deliver to all SUPER_ADMINs ───

  private async sendAdminNotification(
    userId: string,
    deviceId: string,
    userName: string,
    branchName: string,
    locationStr: string | null,
    loginTime: string,
    plainCode: string,
  ) {
    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.SUPER_ADMIN },
      select: { id: true },
    });

    const locationPart = locationStr ? ` from ${locationStr}` : '';

    // The message embeds the code so the admin can copy it right from the
    // notification card without navigating to Pending Approvals.
    const message =
      `${userName} (${branchName}) is trying to log in${locationPart} ` +
      `at ${loginTime} on a new device. ` +
      `Authorization code: ${plainCode} (expires in 30 min). ` +
      `You can also approve via Pending Approvals to generate a new code.`;

    await Promise.all(
      admins.map((admin) =>
        this.notificationsService.create({
          type: 'DEVICE_AUTH',
          title: `New Device Login — ${userName}`,
          message,
          userId: admin.id,
          entityId: deviceId,
          entityType: 'Device',
        }),
      ),
    );
  }

  // ─── Admin: Approve device and generate a fresh code ─────────────────────

  async generateAuthorizationCode(deviceId: string, approvedById: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { user: true },
    });

    if (!device) throw new NotFoundException('Device not found');

    // 6-digit code stored as bcrypt hash in requestCode
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedCode = await bcrypt.hash(code, 10);
    const expiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        status: DeviceStatus.APPROVED,
        approvedById,
        requestCode: hashedCode,
        requestCodeExpiry: expiry,
      },
    });

    let emailSent = false;
    let emailError: string | null = null;

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      emailError = 'EMAIL_USER / EMAIL_PASS not configured on the server — share the code directly with the user.';
      console.warn('[DevicesService] Email credentials missing. Code was generated but not emailed.');
    } else {
      try {
        const transporter = this.getMailTransporter();
        await transporter.sendMail({
          from: `"Njugush POS" <${process.env.EMAIL_USER}>`,
          to: device.user.email,
          subject: 'Device Authorization Code - Njugush POS',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #2563eb;">Device Authorization</h2>
              <p>Your device has been approved. Use the code below to complete login:</p>
              <div style="background: #f3f4f6; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                <h1 style="letter-spacing: 12px; color: #2563eb; font-size: 36px; margin: 0;">${code}</h1>
              </div>
              <p>This code expires in <strong>30 minutes</strong>.</p>
              <p style="color: #ef4444;">If you did not request this, contact your administrator immediately.</p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
              <p style="font-size: 12px; color: #6b7280;">Njugush Enterprises POS System</p>
            </div>
          `,
        });
        emailSent = true;
      } catch (err: any) {
        emailError = `Email delivery failed (${err.message}). Share the code directly with the user.`;
        console.error('[DevicesService] Failed to send auth code email:', err.message);
      }
    }

    await this.auditLogsService.create({
      userId: approvedById,
      action: 'DEVICE_APPROVED',
      description: `Device ${deviceId} approved for user ${device.user.email}${emailSent ? ' — code emailed' : ' — code not emailed'}`,
      entityType: 'Device',
      entityId: deviceId,
    });

    // Always return the plain code so admin can share it directly when email fails
    return {
      message: emailSent
        ? 'Device approved — authorization code sent to user email'
        : 'Device approved — email not sent, use the code below',
      code,             // plain 6-digit code for admin to share directly
      emailSent,
      emailError,
      userEmail: device.user.email,
      userName: `${device.user.firstName} ${device.user.lastName}`,
    };
  }

  // ─── User: Verify the 6-digit code ───────────────────────────────────────

  async verifyAuthorizationCode(requestId: string, code: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: requestId },
    });

    // BUG FIX: Previously this blocked PENDING devices entirely.
    // Now we allow PENDING (pre-generated code) OR APPROVED (admin clicked Approve).
    // REVOKED is the only status that hard-blocks.
    if (!device) {
      return { valid: false, message: 'Device not found' };
    }

    if (device.status === DeviceStatus.REVOKED) {
      return { valid: false, message: 'Device has been revoked. Contact your administrator.' };
    }

    if (!device.requestCode) {
      return { valid: false, message: 'No authorization code found. Ask admin to approve your device.' };
    }

    if (
      device.requestCodeExpiry &&
      device.requestCodeExpiry < new Date()
    ) {
      return { valid: false, message: 'Authorization code has expired. Please log in again to request a new one.' };
    }

    const isValid = await bcrypt.compare(code, device.requestCode);
    if (!isValid) {
      return { valid: false, message: 'Invalid authorization code' };
    }

    // Mark device as APPROVED and clear the one-time code
    await this.prisma.device.update({
      where: { id: requestId },
      data: {
        status: DeviceStatus.APPROVED,
        requestCode: null,
        requestCodeExpiry: null,
      },
    });

    return { valid: true, userId: device.userId };
  }

  async updateLastUsed(fingerprint: string) {
    const device = await this.prisma.device.findUnique({
      where: { fingerprint },
    });
    if (device) {
      await this.prisma.device.update({
        where: { id: device.id },
        data: { lastUsedAt: new Date() },
      });
    }
  }

  async getPendingDevices() {
    return this.prisma.device.findMany({
      where: { status: DeviceStatus.PENDING },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            branch: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllDevices() {
    return this.prisma.device.findMany({
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        approvedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeDevice(deviceId: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
    });
    if (!device) throw new NotFoundException('Device not found');
    return this.prisma.device.update({
      where: { id: deviceId },
      data: { status: DeviceStatus.REVOKED },
    });
  }
}
