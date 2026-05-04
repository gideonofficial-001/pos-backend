import { IsString, IsNotEmpty, IsDecimal } from 'class-validator';

export class CreateReturnDto {
  @IsString()
  @IsNotEmpty()
  saleId: string;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsDecimal({ decimal_digits: '2' })
  amount: string;
}
