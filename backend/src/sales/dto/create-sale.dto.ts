import { IsNotEmpty, IsString, IsOptional, IsEnum, IsNumber, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { SaleType } from '@prisma/client';

class SaleItemDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity: number;
}

export class CreateSaleDto {
  @ApiProperty()
  @IsNotEmpty({ message: 'Branch ID is required' })
  @IsString()
  branchId: string;

  @ApiProperty({ enum: SaleType })
  @IsEnum(SaleType, { message: 'Sale type must be CASH or INVOICE' })
  @IsNotEmpty()
  type: SaleType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiProperty({ type: [SaleItemDto] })
  @IsArray({ message: 'Items array is required' })
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  discount?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}