import { Controller, Post, Body, Headers, Ip, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RequestDeviceCodeDto } from './dto/request-device-code.dto';
import { VerifyDeviceCodeDto } from './dto/verify-device-code.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from './decorators/get-user.decorator';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  private getDeviceInfo(req: any, ip: string) {
    return {
      ipAddress: ip || req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    };
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() loginDto: LoginDto, @Ip() ip: string, @Req() req: any) {
    return this.authService.login(loginDto, this.getDeviceInfo(req, ip));
  }

  @Post('device/request')
  @ApiOperation({ summary: 'Request device authorization code' })
  async requestDeviceCode(
    @Body() requestDto: RequestDeviceCodeDto,
    @Ip() ip: string,
    @Req() req: any,
  ) {
    return this.authService.requestDeviceCode(requestDto, this.getDeviceInfo(req, ip));
  }

  @Post('device/verify')
  @ApiOperation({ summary: 'Verify device authorization code' })
  async verifyDeviceCode(
    @Body() verifyDto: VerifyDeviceCodeDto,
    @Ip() ip: string,
    @Req() req: any,
  ) {
    return this.authService.verifyDeviceCode(verifyDto, this.getDeviceInfo(req, ip));
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout user' })
  async logout(@GetUser('userId') userId: string, @Ip() ip: string, @Req() req: any) {
    return this.authService.logout(userId, this.getDeviceInfo(req, ip));
  }
}