import { IsString, IsEmail, IsOptional, IsNumber } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  // ── Existing device-auth fingerprint ──────────────────────────────────────
  @IsOptional()
  @IsString()
  deviceFingerprint?: string;

  // ── New: GPS coords from browser Geolocation API (optional) ──────────────
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsNumber()
  accuracy?: number;

  // ── New: device metadata sent by frontend ─────────────────────────────────
  @IsOptional()
  @IsString()
  deviceType?: string; // 'mobile' | 'tablet' | 'desktop'

  @IsOptional()
  @IsString()
  userAgent?: string;
}
