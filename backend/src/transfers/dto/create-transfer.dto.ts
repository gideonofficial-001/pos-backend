import { IsNotEmpty, IsString, IsOptional, IsArray, ValidateNested, IsNumber, IsPositive, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class TransferItemDto {
  @ApiProperty()
  @IsNotEmpty({ message: 'Product ID is required for every transfer item' })
  @IsString()
  productId: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber({}, { message: 'Quantity must be a number' })
  @IsPositive({ message: 'Quantity must be greater than 0' })
  quantity: number;
}

export class CreateTransferDto {
  @ApiProperty()
  @IsNotEmpty({ message: 'Source branch ID is required' })
  @IsString()
  fromBranchId: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'Destination branch ID is required' })
  @IsString()
  toBranchId: string;

  @ApiProperty({ type: [TransferItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one product must be included in the transfer' })
  @ValidateNested({ each: true })
  @Type(() => TransferItemDto)
  items: TransferItemDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
  }
