import { IsString, IsNotEmpty, IsInt, Min, IsOptional } from 'class-validator';

export class RestockDto {
  @IsString()
  @IsNotEmpty()
  branchId: string;

  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  fullCylinders?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  emptyCylinders?: number;

  @IsString()
  @IsOptional()
  reason?: string;
}
