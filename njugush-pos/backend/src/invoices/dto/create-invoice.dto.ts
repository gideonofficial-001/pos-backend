import { IsString, IsNotEmpty, IsOptional, IsDecimal, IsEmail, IsDateString } from 'class-validator';

export class CreateInvoiceDto {
  @IsString()
  @IsNotEmpty()
  branchId: string;

  @IsString()
  @IsNotEmpty()
  customerName: string;

  @IsString()
  @IsNotEmpty()
  customerPhone: string;

  @IsEmail()
  @IsOptional()
  customerEmail?: string;

  @IsDecimal({ decimal_digits: '2' })
  amount: string;

  @IsDateString()
  dueDate: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
