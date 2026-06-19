import { IsNotEmpty, IsString, IsOptional, IsNumber, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInvoiceDto {
  @ApiProperty()
  @IsNotEmpty({ message: 'Branch ID is required' })
  @IsString()
  branchId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'Customer name is required' })
  @IsString()
  customerName: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'Customer phone is required' })
  @IsString()
  customerPhone: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerEmail?: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'Amount is required' })
  @IsNumber()
  amount: number;

  @ApiProperty()
  @IsNotEmpty({ message: 'Due date is required' })
  @IsDateString()
  dueDate: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}