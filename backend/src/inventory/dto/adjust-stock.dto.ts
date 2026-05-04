import { IsString, IsNotEmpty, IsInt, IsOptional } from 'class-validator';

export class AdjustStockDto {
  @IsString()
  @IsNotEmpty()
  branchId: string;

  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsInt()
  quantity: number;

  @IsString()
  @IsNotEmpty()
  reason: string;
}
