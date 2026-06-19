import { IsNotEmpty, IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReturnDto {
  @ApiProperty()
  @IsNotEmpty({ message: 'Sale ID is required' })
  @IsString()
  saleId: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'Return reason is required' })
  @IsString()
  reason: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  amount?: number;
}