import {
  IsString,
  IsUUID,
  IsArray,
  ValidateNested,
  IsNumber,
  IsOptional,
  IsIn,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class TransferItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantity: number;

  // STANDARD   = non-LPG products
  // REFILL     = gas refill (full gas, no physical cylinder moving)
  // CYLINDER   = full physical cylinder being moved to another branch
  // EMPTY_SHELL = empty cylinder shell being returned/moved
  @ApiProperty({ required: false, enum: ['STANDARD', 'REFILL', 'CYLINDER', 'EMPTY_SHELL'] })
  @IsOptional()
  @IsIn(['STANDARD', 'REFILL', 'CYLINDER', 'EMPTY_SHELL'])
  variant?: 'STANDARD' | 'REFILL' | 'CYLINDER' | 'EMPTY_SHELL';
}

export class CreateTransferDto {
  @ApiProperty()
  @IsUUID()
  fromBranchId: string;

  @ApiProperty()
  @IsUUID()
  toBranchId: string;

  @ApiProperty({ type: [TransferItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferItemDto)
  items: TransferItemDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
