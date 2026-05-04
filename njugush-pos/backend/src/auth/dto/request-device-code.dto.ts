import { IsEmail, IsString, IsNotEmpty } from 'class-validator';

export class RequestDeviceCodeDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  deviceFingerprint: string;
}
