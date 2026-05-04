import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole, ProductType } from '@prisma/client';

@Controller('products')
@UseGuards(AuthGuard(), RolesGuard)
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  async create(@Body() createProductDto: CreateProductDto, @GetUser('userId') userId: string) {
    return this.productsService.create(createProductDto, userId);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  async findAll(@Query('type') type?: ProductType) {
    return this.productsService.findAll(type);
  }

  @Get('lpg')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  async getLPGProducts() {
    return this.productsService.getLPGProducts();
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  async findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto, @GetUser('userId') userId: string) {
    return this.productsService.update(id, updateProductDto, userId);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async remove(@Param('id') id: string, @GetUser('userId') userId: string) {
    return this.productsService.remove(id, userId);
  }
}
