import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyDeviceCodeDto {
  @ApiProperty({ example: 'device-request-id' })
  @IsNotEmpty({ message: 'Request ID is required' })
  @IsString()
  requestId: string;

  @ApiProperty({ example: '123456' })
  @IsNotEmpty({ message: 'Authorization code is required' })
  @IsString()
  authorizationCode: string;
}