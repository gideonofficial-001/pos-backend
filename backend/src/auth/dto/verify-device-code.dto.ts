import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class VerifyDeviceCodeDto {
  @IsUUID()
  requestId: string;

  @IsString()
  @IsNotEmpty()
  authorizationCode: string;
}
