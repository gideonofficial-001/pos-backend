import { IsString, IsNotEmpty, IsEnum, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SaleType } from '@prisma/client';

class SaleItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNotEmpty()
  quantity: number;
}

export class CreateSaleDto {
  @IsString()
  @IsNotEmpty()
  branchId: string;

  @IsEnum(SaleType)
  type: SaleType;

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;
}
