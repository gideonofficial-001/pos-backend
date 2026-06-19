import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBranchDto {
  @ApiProperty({ example: 'Branch 7 - Kilimani' })
  @IsNotEmpty({ message: 'Branch name is required' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'BR07' })
  @IsNotEmpty({ message: 'Branch code is required' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'Kilimani, Nairobi' })
  @IsNotEmpty({ message: 'Address is required' })
  @IsString()
  address: string;

  @ApiProperty({ example: '+254700000008' })
  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString()
  phone: string;

  @ApiProperty({ example: 'kilimani@njugush.co.ke', required: false })
  @IsOptional()
  @IsString()
  email?: string;
}