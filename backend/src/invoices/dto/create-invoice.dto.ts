import { IsNotEmpty, IsString, IsOptional, IsNumber, IsDateString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInvoiceDto {
  @ApiProperty()
  @IsNotEmpty({ message: 'Branch ID is required' })
  @IsString()
  branchId: string;

  // Required in Invoice schema (String, non-nullable)
  @ApiProperty()
  @IsNotEmpty({ message: 'Customer ID is required' })
  @IsString()
  customerId: string;

  // Optional link to a sale that generated this invoice
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  saleId?: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'Subtotal is required' })
  @IsNumber()
  @Min(0)
  subtotal: number;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiProperty()
  @IsNotEmpty({ message: 'Due date is required' })
  @IsDateString()
  dueDate: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
