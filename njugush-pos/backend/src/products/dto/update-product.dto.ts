import { IsString, IsOptional, IsEnum, IsDecimal, IsInt, Min, IsBoolean } from 'class-validator';
import { ProductType } from '@prisma/client';

export class UpdateProductDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ProductType)
  @IsOptional()
  type?: ProductType;

  @IsDecimal({ decimal_digits: '2' })
  @IsOptional()
  price?: string;

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

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
