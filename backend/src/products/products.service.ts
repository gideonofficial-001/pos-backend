import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  async create(createProductDto: CreateProductDto, performedBy: string) {
    const product = await this.prisma.product.create({
      data: createProductDto,
      include: { category: true },
    });

    await this.auditLogsService.create({
      userId: performedBy,
      action: 'PRODUCT_CREATED',
      description: `Created product ${product.name} (${product.code})`,
      entityType: 'Product',
      entityId: product.id,
      newValues: createProductDto,
    });

    return product;
  }

  async findAll(query?: { categoryId?: string; type?: string; search?: string; isActive?: boolean }) {
    const where: any = {};

    if (query?.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query?.type) {
      where.type = query.type;
    }
    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query?.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto, performedBy: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: updateProductDto,
      include: { category: true },
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

    return updated;
  }

  async toggleStatus(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.prisma.product.update({
      where: { id },
      data: { isActive: !product.isActive },
      include: { category: true },
    });
  }

  async getCategories() {
    return this.prisma.productCategory.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(name: string, description?: string) {
    return this.prisma.productCategory.create({
      data: { name, description },
    });
  }

  async deleteCategory(id: string) {
    const category = await this.prisma.productCategory.findUnique({
      where: { id },
      include: { products: true },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category.products.length > 0) {
      // Unlink products from category before deleting
      await this.prisma.product.updateMany({
        where: { categoryId: id },
        data: { categoryId: null },
      });
    }

    return this.prisma.productCategory.delete({ where: { id } });
  }
}