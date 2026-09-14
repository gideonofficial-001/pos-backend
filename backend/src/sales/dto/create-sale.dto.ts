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
  @Min(1)
  quantity: number;

  @ApiProperty({ enum: LpgSaleVariant, required: false })
  @IsOptional()
  @IsEnum(LpgSaleVariant)
  lpgVariant?: LpgSaleVariant;

  @ApiProperty({ required: false, default: 0, description: 'Per-item discount in KES' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;
}

class SalePaymentDto {
  @ApiProperty({ enum: PaymentProvider })
  @IsEnum(PaymentProvider)
  method: PaymentProvider;

  @ApiProperty({ description: 'Amount for this payment method in KES' })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ required: false, description: 'M-Pesa receipt number (MPESA payments only)' })
  @IsOptional()
  @IsString()
  mpesaRef?: string;
}

export class CreateSaleDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  branchId: string;

  @ApiProperty({ enum: SaleType })
  @IsEnum(SaleType)
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

  @ApiProperty({ type: [SaleItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @ApiProperty({ type: [SalePaymentDto], required: false, description: 'Payment breakdown (supports split payments)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalePaymentDto)
  payments?: SalePaymentDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
