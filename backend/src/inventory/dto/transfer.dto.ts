import { IsString, IsArray, IsOptional, IsInt, IsEnum, ValidateNested, ArrayMinSize, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { LpgComponent } from '@prisma/client';

export class CreateTransferItemDto {
  @IsString()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsEnum(LpgComponent)
  lpgComponent?: LpgComponent;

  @IsOptional()
  @IsString()
  cylinderId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateTransferDto {
  @IsString()
  toBranchId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTransferItemDto)
  @ArrayMinSize(1)
  items: CreateTransferItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RespondToTransferItemDto {
  @IsString()
  itemId: string;

  @IsEnum(['ACCEPTED', 'REJECTED'] as const)
  status: 'ACCEPTED' | 'REJECTED';

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RespondToTransferDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RespondToTransferItemDto)
  @ArrayMinSize(1)
  items: RespondToTransferItemDto[];
}

export class TransferFilterDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  type?: 'incoming' | 'outgoing'; // For filtering transfers relevant to a branch
}
