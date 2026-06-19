import { IsNotEmpty, IsString, IsOptional, IsEnum, IsNumber, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ProductType } from '@prisma/client';

export class CreateProductDto {
  @ApiProperty({ example: 'LPG Refill 6kg' })
  @IsNotEmpty({ message: 'Product name is required' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'LPG-6KG' })
  @IsNotEmpty({ message: 'Product code is required' })
  @IsString()
  code: string;

  @ApiProperty({ example: '6kg LPG gas refill', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ProductType, example: 'LPG_REFILL' })
  @IsEnum(ProductType, { message: 'Type must be LPG_REFILL, LPG_CYLINDER, ELECTRONICS, or ACCESSORIES' })
  @IsNotEmpty({ message: 'Product type is required' })
  type: ProductType;

  @ApiProperty({ example: 'category-id', required: false })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ example: 1200.00 })
  @IsNotEmpty({ message: 'Price is required' })
  @IsNumber()
  price: number;

  @ApiProperty({ example: 1000.00, required: false })
  @IsOptional()
  @IsNumber()
  costPrice?: number;

  @ApiProperty({ example: '6kg', required: false })
  @IsOptional()
  @IsString()
  cylinderSize?: string;

  @ApiProperty({ example: 'Total', required: false })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({ example: 10, required: false })
  @IsOptional()
  @IsNumber()
  minStockLevel?: number;
}