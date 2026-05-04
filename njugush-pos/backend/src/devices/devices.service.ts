import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { DeviceStatus } from '@prisma/client';

@Injectable()
export class DevicesService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  async validateDevice(userId: string, fingerprint: string) {
    const device = await this.prisma.device.findUnique({
      where: { fingerprint },
    });

    if (!device) {
      return { isAuthorized: false };
    }

    if (device.userId !== userId) {
      return { isAuthorized: false };
    }

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
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        status: DeviceStatus.APPROVED,
        approvedById,
        approvedAt: new Date(),
      },
    });

    await this.auditLogsService.create({
      userId: approvedById,
      action: 'DEVICE_APPROVED',
      description: `Device ${deviceId} approved for user ${device.userId}`,
      entityType: 'Device',
      entityId: deviceId,
    });

    return { code };
  }

  async verifyAuthorizationCode(requestId: string, code: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: requestId },
    });

    if (!device || device.status !== 'APPROVED') {
      return { valid: false };
    }

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
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            branch: true,
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
