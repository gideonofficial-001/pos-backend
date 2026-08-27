import { IsNotEmpty, IsString, IsOptional, IsArray, ValidateNested, IsNumber, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum TransferVariant {
  STANDARD = 'STANDARD',
  REFILL = 'REFILL',
  CYLINDER = 'CYLINDER',
  EMPTY_SHELL = 'EMPTY_SHELL'
}

export class TransferItemDto {
  @IsNotEmpty()
  @IsString()
  productId: string;

  @IsNotEmpty()
  @IsNumber()
  quantity: number;

  @IsOptional()
  @IsEnum(TransferVariant)
  variant?: TransferVariant;
}

export class CreateTransferDto {
  @IsOptional()
  @IsString()
  fromBranchId?: string;

  @IsNotEmpty()
  @IsString()
  toBranchId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferItemDto)
  items: TransferItemDto[];
}
