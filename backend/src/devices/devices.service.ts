import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { DeviceStatus } from '@prisma/client';
import * as nodemailer from 'nodemailer';

@Injectable()
export class DevicesService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
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
    const device = await this.prisma.device.findUnique({
      where: { userId_fingerprint: { userId, fingerprint } },
    });

    if (!device) {
      return { isAuthorized: false };
    }

    if (device.status !== DeviceStatus.APPROVED) {
      return { isAuthorized: false, deviceRequestId: device.id };
    }

    return { isAuthorized: true };
  }

  async requestAuthorization(userId: string, fingerprint: string, deviceInfo: { ipAddress: string; userAgent: string }) {
    // Check if device already exists
    const existingDevice = await this.prisma.device.findUnique({
      where: { userId_fingerprint: { userId, fingerprint } },
    });

    if (existingDevice) {
      return { requestId: existingDevice.id, status: existingDevice.status };
    }

    // Create new device request
    const device = await this.prisma.device.create({
      data: {
        userId,
        fingerprint,
        deviceInfo: deviceInfo.userAgent || 'Unknown',
        ipAddress: deviceInfo.ipAddress || 'Unknown',
        status: DeviceStatus.PENDING,
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

    return { requestId: device.id, status: DeviceStatus.PENDING };
  }

  async generateAuthorizationCode(deviceId: string, approvedById: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { user: true },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        status: DeviceStatus.APPROVED,
        approvedById,
        approvedAt: new Date(),
        authCode: code,
        authCodeExpiry: expiry,
      },
    });

    // Send code via email
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
    } catch (err) {
      console.error('Failed to send auth code email:', err.message);
    }

    await this.auditLogsService.create({
      userId: approvedById,
      action: 'DEVICE_APPROVED',
      description: `Device ${deviceId} approved for user ${device.user.email}`,
      entityType: 'Device',
      entityId: deviceId,
    });

    return { code, message: 'Device approved and code sent to user email' };
  }

  async verifyAuthorizationCode(requestId: string, code: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: requestId },
    });

    if (!device || device.status !== DeviceStatus.APPROVED) {
      return { valid: false, message: 'Device not approved' };
    }

    if (!device.authCode || device.authCode !== code) {
      return { valid: false, message: 'Invalid authorization code' };
    }

    if (device.authCodeExpiry && device.authCodeExpiry < new Date()) {
      return { valid: false, message: 'Authorization code has expired' };
    }

    // Clear the code after successful use (single-use)
    await this.prisma.device.update({
      where: { id: requestId },
      data: { authCode: null, authCodeExpiry: null },
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
        approvedBy: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeDevice(deviceId: string) {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) {
      throw new NotFoundException('Device not found');
    }

    return this.prisma.device.update({
      where: { id: deviceId },
      data: { status: DeviceStatus.REVOKED },
    });
  }
}