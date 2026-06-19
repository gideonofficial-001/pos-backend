import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestDeviceCodeDto {
  @ApiProperty({ example: 'user@njugush.co.ke' })
  @IsEmail({}, { message: 'Please enter a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({ example: 'device-fingerprint-123' })
  @IsNotEmpty({ message: 'Device fingerprint is required' })
  @IsString()
  deviceFingerprint: string;
}