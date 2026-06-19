import { IsNotEmpty, IsString, IsOptional, IsEnum, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ExpenseCategory } from '@prisma/client';

export class CreateExpenseDto {
  @ApiProperty()
  @IsNotEmpty({ message: 'Branch ID is required' })
  @IsString()
  branchId: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'Amount is required' })
  @IsNumber()
  amount: number;

  @ApiProperty({ enum: ExpenseCategory })
  @IsEnum(ExpenseCategory, { message: 'Category must be FUEL, UTILITIES, REPAIRS, MISCELLANEOUS, or OTHER' })
  @IsNotEmpty()
  category: ExpenseCategory;

  @ApiProperty()
  @IsNotEmpty({ message: 'Description is required' })
  @IsString()
  description: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  receiptUrl?: string;
}