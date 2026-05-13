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
      where: { fingerprint },
    });

    if (!device) return { isAuthorized: false };
    if (device.userId !== userId) return { isAuthorized: false };
    if (device.status !== 'APPROVED') {
      return { isAuthorized: false, deviceRequestId: device.id };
    }

    return { isAuthorized: true };
  }

  async requestAuthorization(userId: string, fingerprint: string, deviceInfo: any) {
    const existingDevice = await this.prisma.device.findUnique({
      where: { fingerprint },
    });

    if (existingDevice) {
      return { requestId: existingDevice.id };
    }

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

    return { requestId: device.id };
  }

  async generateAuthorizationCode(deviceId: string, approvedById: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { user: true },
    });

    if (!device) throw new NotFoundException('Device not found');

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
          <h2>Device Authorization</h2>
          <p>Your device has been approved. Use the code below to complete login:</p>
          <h1 style="letter-spacing:8px;color:#2563eb;">${code}</h1>
          <p>This code expires in <strong>30 minutes</strong>.</p>
          <p>If you did not request this, contact your administrator.</p>
        `,
      });
    } catch (err) {
      console.error('Failed to send auth code email:', err.message);
    }

    await this.auditLogsService.create({
      userId: approvedById,
      action: 'DEVICE_APPROVED',
      description: `Device ${deviceId} approved for user ${device.userId}`,
      entityType: 'Device',
      entityId: deviceId,
    });

    return { code, message: 'Device approved and code sent to user email' };
  }

  async verifyAuthorizationCode(requestId: string, code: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: requestId },
    });

    if (!device || device.status !== 'APPROVED') return { valid: false };
    if (!device.authCode || device.authCode !== code) return { valid: false };
    if (device.authCodeExpiry && device.authCodeExpiry < new Date()) {
      return { valid: false };
    }

    // Clear the code after successful use
    await this.prisma.device.update({
      where: { id: requestId },
      data: { authCode: null, authCodeExpiry: null },
    });

    return { valid: true, userId: device.userId };
  }

  async updateLastUsed(fingerprint: string) {
    await this.prisma.device.update({
      where: { fingerprint },
      data: { lastUsedAt: new Date() },
    });
  }

  async getPendingDevices() {
    return this.prisma.device.findMany({
      where: { status: DeviceStatus.PENDING },
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true,
            email: true, role: true, branch: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUserDevices(userId: string) {
    return this.prisma.device.findMany({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  async revokeDevice(deviceId: string) {
    return this.prisma.device.update({
      where: { id: deviceId },
      data: { status: DeviceStatus.REVOKED },
    });
  }
}