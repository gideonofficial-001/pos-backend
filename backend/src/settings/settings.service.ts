import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getAll() {
    return this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
  }

  async getByKey(key: string) {
    return this.prisma.systemSetting.findUnique({ where: { key } });
  }

  async getPublicSettings() {
    return this.prisma.systemSetting.findMany({
      where: { isPublic: true },
      select: { key: true, value: true },
    });
  }

  async upsert(key: string, value: string, description?: string, isPublic?: boolean, updatedBy?: string) {
    const existing = await this.prisma.systemSetting.findUnique({ where: { key } });

    if (existing) {
      return this.prisma.systemSetting.update({
        where: { key },
        data: { value, description: description || existing.description, isPublic: isPublic ?? existing.isPublic, updatedBy },
      });
    }

    return this.prisma.systemSetting.create({
      data: { key, value, description, isPublic: isPublic ?? false, updatedBy },
    });
  }

  async delete(key: string) {
    return this.prisma.systemSetting.delete({ where: { key } });
  }
}