import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ProductType } from '@prisma/client';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  async create(createProductDto: CreateProductDto, performedBy: string) {
    const { code } = createProductDto;
    const existingProduct = await this.prisma.product.findUnique({ where: { code } });
    if (existingProduct) {
      throw new ConflictException('Product code already exists');
    }

    const product = await this.prisma.product.create({ data: createProductDto });

    // Initialize inventory for all branches
    const branches = await this.prisma.branch.findMany();
    for (const branch of branches) {
      await this.prisma.inventory.create({
        data: {
          branchId: branch.id,
          productId: product.id,
          quantity: 0,
          fullCylinders: product.type === 'LPG_REFILL' ? 0 : null,
          emptyCylinders: product.type === 'LPG_REFILL' ? 0 : null,
        },
      });
    }

    await this.auditLogsService.create({
      userId: performedBy,
      action: 'PRODUCT_CREATED',
      description: `Created product ${product.name}`,
      entityType: 'Product',
      entityId: product.id,
      newValues: createProductDto,
    });

    return product;
  }

  async findAll(type?: ProductType) {
    const where = type ? { type } : {};
    return this.prisma.product.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        inventory: {
          include: {
            branch: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async findByCode(code: string) {
    return this.prisma.product.findUnique({ where: { code } });
  }

  async update(id: string, updateProductDto: UpdateProductDto, performedBy: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: updateProductDto,
    });

    await this.auditLogsService.create({
      userId: performedBy,
      action: 'PRODUCT_UPDATED',
      description: `Updated product ${product.name}`,
      entityType: 'Product',
      entityId: id,
      oldValues: product,
      newValues: updateProductDto,
    });

    return updatedProduct;
  }

  async remove(id: string, performedBy: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { inventory: { where: { quantity: { gt: 0 } } } },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.inventory.length > 0) {
      throw new ConflictException('Cannot delete product with stock in inventory');
    }

    await this.prisma.inventory.deleteMany({ where: { productId: id } });
    await this.prisma.product.delete({ where: { id } });

    await this.auditLogsService.create({
      userId: performedBy,
      action: 'PRODUCT_UPDATED',
      description: `Deleted product ${product.name}`,
      entityType: 'Product',
      entityId: id,
      oldValues: product,
    });

    return { message: 'Product deleted successfully' };
  }

  async getLPGProducts() {
    return this.prisma.product.findMany({
      where: { type: { in: ['LPG_REFILL', 'LPG_CYLINDER'] } },
      orderBy: { name: 'asc' },
    });
  }
}
