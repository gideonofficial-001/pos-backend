import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDecimal, IsInt, Min } from 'class-validator';
import { ProductType } from '@prisma/client';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ProductType)
  type: ProductType;

  @IsDecimal({ decimal_digits: '2' })
  price: string;

  @IsDecimal({ decimal_digits: '2' })
  @IsOptional()
  costPrice?: string;

  @IsString()
  @IsOptional()
  cylinderSize?: string;

  @IsString()
  @IsOptional()
  brand?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  minStockLevel?: number;
}
