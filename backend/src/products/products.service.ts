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

    // Automatically seed this product into ALL branches with 0 stock
    const branches = await this.prisma.branch.findMany();

    if (branches.length > 0) {
      const inventoryData = branches.map((branch) => ({
        branchId: branch.id,
        productId: product.id,
        quantity: 0,
        minimumQuantity: product.minStockLevel || 10,
      }));

      await this.prisma.inventory.createMany({ data: inventoryData });
    }

    await this.auditLogsService.create({
      userId: performedBy,
      action: 'PRODUCT_CREATED',
      description: `Created product ${product.name} (${product.code}) and initialized inventory across ${branches.length} branches.`,
      entityType: 'Product',
      entityId: product.id,
      newValues: createProductDto as any,
    });

    return product;
  }

  async findAll(query?: {
    categoryId?: string;
    type?: string;
    search?: string;
    isActive?: boolean;
  }) {
    const where: any = {};

    if (query?.categoryId) where.categoryId = query.categoryId;
    if (query?.type) where.type = query.type;
    if (query?.isActive !== undefined) where.isActive = query.isActive;
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

    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto, performedBy: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');

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
      oldValues: product as any,
      newValues: updateProductDto as any,
    });

    return updated;
  }

  async delete(id: string, performedBy: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');

    // Check whether this product has any associated sale or transfer records.
    // Prisma's onDelete: Cascade covers Inventory rows, but SaleItem and
    // TransferItem do NOT have cascade — attempting a hard delete when those
    // records exist causes a PostgreSQL FK constraint error (P2003).
    const [saleItemCount, transferItemCount] = await Promise.all([
      this.prisma.saleItem.count({ where: { productId: id } }),
      this.prisma.transferItem.count({ where: { productId: id } }),
    ]);

    const hasHistory = saleItemCount > 0 || transferItemCount > 0;

    if (hasHistory) {
      // ── Soft delete ──────────────────────────────────────────────────────
      // We cannot hard-delete this product without destroying sales/transfer
      // history. Mark it inactive instead — it disappears from all active
      // workflows (inventory display, new-sale search, transfer pickers) but
      // its audit trail is fully preserved.
      await this.prisma.product.update({
        where: { id },
        data: { isActive: false },
      });

      await this.auditLogsService.create({
        userId: performedBy,
        action: 'PRODUCT_UPDATED',
        description: `Deactivated product "${product.name}" (${saleItemCount} sale record(s), ${transferItemCount} transfer record(s) — permanent deletion blocked to preserve history)`,
        entityType: 'Product',
        entityId: id,
        oldValues: product as any,
        newValues: { isActive: false } as any,
      });

      return {
        softDeleted: true,
        saleItemCount,
        transferItemCount,
        message: `"${product.name}" has been deactivated. It cannot be permanently deleted because it appears in ${saleItemCount} sale(s) and ${transferItemCount} transfer(s). Deactivating it hides it from all active workflows while keeping your records intact.`,
      };
    }

    // ── Hard delete ──────────────────────────────────────────────────────────
    // No sales or transfer history — safe to remove entirely.
    // Inventory rows across all branches are removed automatically via
    // the onDelete: Cascade constraint on Inventory.productId.
    await this.prisma.product.delete({ where: { id } });

    await this.auditLogsService.create({
      userId: performedBy,
      action: 'PRODUCT_UPDATED',
      description: `Permanently deleted product "${product.name}" (${product.code}) from all branches`,
      entityType: 'Product',
      entityId: id,
      oldValues: product as any,
    });

    return {
      softDeleted: false,
      message: `"${product.name}" has been permanently deleted from all branches.`,
    };
  }

  async toggleStatus(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');

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

    if (!category) throw new NotFoundException('Category not found');

    if (category.products.length > 0) {
      await this.prisma.product.updateMany({
        where: { categoryId: id },
        data: { categoryId: null },
      });
    }

    return this.prisma.productCategory.delete({ where: { id } });
  }
}
