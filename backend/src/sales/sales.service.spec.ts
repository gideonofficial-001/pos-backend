import { Test, TestingModule } from '@nestjs/testing';
import { SalesService } from './sales.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('SalesService', () => {
  let service: SalesService;

  const mockPrismaService = {
    sale: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    inventory: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
    },
  };

  const mockAuditLogsService = {
    create: jest.fn().mockResolvedValue({}),
  };

  const mockNotificationsService = {
    sendInvoiceNotification: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditLogsService, useValue: mockAuditLogsService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a sale and update inventory', async () => {
      const mockProduct = {
        id: 'prod-1',
        name: 'LPG 6kg',
        price: 1200,
        type: 'LPG_REFILL',
      };

      const mockInventory = {
        quantity: 50,
        product: mockProduct,
      };

      const mockSale = {
        id: 'sale-1',
        saleCode: 'ABC123-2024',
        total: 2400,
        items: [{ product: mockProduct, quantity: 2 }],
      };

      mockPrismaService.inventory.findUnique.mockResolvedValue(mockInventory);
      mockPrismaService.product.findUnique.mockResolvedValue(mockProduct);
      mockPrismaService.sale.create.mockResolvedValue(mockSale);
      mockPrismaService.inventory.update.mockResolvedValue({});

      const result = await service.create(
        {
          branchId: 'branch-1',
          type: 'CASH',
          items: [{ productId: 'prod-1', quantity: 2 }],
        },
        { userId: 'user-1', role: 'BRANCH_MANAGER', branchId: 'branch-1' },
      );

      expect(result).toBeDefined();
      expect(mockPrismaService.sale.create).toHaveBeenCalled();
      expect(mockPrismaService.inventory.update).toHaveBeenCalled();
    });

    it('should throw ForbiddenException for wrong branch', async () => {
      await expect(
        service.create(
          {
            branchId: 'branch-2',
            type: 'CASH',
            items: [{ productId: 'prod-1', quantity: 1 }],
          },
          { userId: 'user-1', role: 'BRANCH_MANAGER', branchId: 'branch-1' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for insufficient stock', async () => {
      const mockInventory = {
        quantity: 0,
        product: { name: 'LPG 6kg' },
      };

      mockPrismaService.inventory.findUnique.mockResolvedValue(mockInventory);

      await expect(
        service.create(
          {
            branchId: 'branch-1',
            type: 'CASH',
            items: [{ productId: 'prod-1', quantity: 5 }],
          },
          { userId: 'user-1', role: 'BRANCH_MANAGER', branchId: 'branch-1' },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return sales list', async () => {
      const mockSales = [
        { id: 'sale-1', total: 1200 },
        { id: 'sale-2', total: 2400 },
      ];

      mockPrismaService.sale.findMany.mockResolvedValue(mockSales);

      const result = await service.findAll({
        user: { role: 'SUPER_ADMIN' },
      });

      expect(result).toEqual(mockSales);
      expect(mockPrismaService.sale.findMany).toHaveBeenCalled();
    });
  });

  describe('getDailySales', () => {
    it('should return daily sales summary', async () => {
      const mockSales = [
        {
          total: 1200,
          type: 'CASH',
          items: [
            { product: { type: 'LPG_REFILL' }, quantity: 1 },
          ],
          branch: { name: 'Branch 1' },
        },
      ];

      mockPrismaService.sale.findMany.mockResolvedValue(mockSales);

      const result = await service.getDailySales();

      expect(result).toHaveProperty('totalSales', 1);
      expect(result).toHaveProperty('totalAmount', 1200);
      expect(result).toHaveProperty('byBranch');
    });
  });
});
