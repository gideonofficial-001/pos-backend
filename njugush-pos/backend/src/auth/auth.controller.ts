import { Controller, Post, Body, Headers, Ip, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RequestDeviceCodeDto } from './dto/request-device-code.dto';
import { VerifyDeviceCodeDto } from './dto/verify-device-code.dto';
import { GetUser } from './decorators/get-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Headers('user-agent') userAgent: string,
    @Ip() ipAddress: string,
  ) {
    return this.authService.login(loginDto, { userAgent, ipAddress });
  }

  @Post('device/request')
  async requestDeviceCode(
    @Body() requestDto: RequestDeviceCodeDto,
    @Headers('user-agent') userAgent: string,
    @Ip() ipAddress: string,
  ) {
    return this.authService.requestDeviceCode(requestDto, { userAgent, ipAddress });
  }

  @Post('device/verify')
  async verifyDeviceCode(
    @Body() verifyDto: VerifyDeviceCodeDto,
    @Headers('user-agent') userAgent: string,
    @Ip() ipAddress: string,
  ) {
    return this.authService.verifyDeviceCode(verifyDto, { userAgent, ipAddress });
  }

  @Post('logout')
  @UseGuards(AuthGuard())
  async logout(
    @GetUser() user: any,
    @Headers('user-agent') userAgent: string,
    @Ip() ipAddress: string,
  ) {
    return this.authService.logout(user.userId, { userAgent, ipAddress });
  }
}
