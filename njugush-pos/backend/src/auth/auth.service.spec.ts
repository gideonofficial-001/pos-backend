import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DevicesService } from '../devices/devices.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UnauthorizedException } from '@nestjs/common';

// Mock bcrypt
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

const bcrypt = require('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-token'),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockDevicesService = {
    validateDevice: jest.fn(),
    updateLastUsed: jest.fn(),
  };

  const mockAuditLogsService = {
    create: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DevicesService, useValue: mockDevicesService },
        { provide: AuditLogsService, useValue: mockAuditLogsService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);

    // Reset mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('should return access token on successful login', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'ceo@njugush.co.ke',
        firstName: 'Njugush',
        lastName: 'CEO',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        password: 'hashed-password',
        branch: null,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);
      mockDevicesService.validateDevice.mockResolvedValue({ isAuthorized: true });

      const result = await service.login(
        { email: 'ceo@njugush.co.ke', password: 'admin123', deviceFingerprint: 'fp-123' },
        { ipAddress: '127.0.0.1', userAgent: 'test' },
      );

      expect(result).toHaveProperty('access_token');
      expect(result.access_token).toBe('mock-token');
      expect(result).toHaveProperty('user');
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login(
          { email: 'wrong@email.com', password: 'wrong', deviceFingerprint: 'fp' },
          { ipAddress: '127.0.0.1', userAgent: 'test' },
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should require device auth for new devices', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'ceo@njugush.co.ke',
        password: 'hashed',
        status: 'ACTIVE',
        role: 'SUPER_ADMIN',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);
      mockDevicesService.validateDevice.mockResolvedValue({
        isAuthorized: false,
        deviceRequestId: 'device-1',
      });

      const result = await service.login(
        { email: 'ceo@njugush.co.ke', password: 'admin123', deviceFingerprint: 'fp-123' },
        { ipAddress: '127.0.0.1', userAgent: 'test' },
      );

      expect(result).toHaveProperty('requiresDeviceAuth', true);
      expect(result).toHaveProperty('deviceRequestId', 'device-1');
    });
  });

  describe('logout', () => {
    it('should log logout action', async () => {
      const result = await service.logout('user-1', {
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      });

      expect(result).toHaveProperty('message', 'Logged out successfully');
      expect(mockAuditLogsService.create).toHaveBeenCalled();
    });
  });
});
