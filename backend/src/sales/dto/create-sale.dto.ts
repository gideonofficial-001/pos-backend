import { IsNotEmpty, IsString, IsOptional, IsEnum, IsNumber, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { SaleType, PaymentProvider, LpgSaleVariant } from '@prisma/client';

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

  @ApiProperty({ enum: LpgSaleVariant, required: false })
  @IsOptional()
  @IsEnum(LpgSaleVariant, { message: 'lpgVariant must be REFILL, EMPTY_SHELL, or COMPLETE_SET' })
  lpgVariant?: LpgSaleVariant;

  @ApiProperty({ required: false, default: 0, description: 'Per-item discount in KES' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;
}

export class CreateSaleDto {
  @ApiProperty()
  @IsNotEmpty({ message: 'Branch ID is required' })
  @IsString()
  branchId: string;

  @ApiProperty({ enum: SaleType })
  @IsEnum(SaleType, { message: 'Sale type must be CASH, WHOLESALE or INVOICE' })
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

  @IsOptional()
  @IsEnum(PaymentProvider)
  paymentProvider?: PaymentProvider;

  @IsOptional()
  @IsString()
  mpesaRef?: string;

  @ApiProperty({ type: [SaleItemDto] })
  @IsArray({ message: 'Items array is required' })
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
