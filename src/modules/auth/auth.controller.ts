import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';

const COOKIE_NAME = 'access_token';
const COOKIE_MAX_AGE = 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.register(dto);
    this.setAuthCookie(response, result.accessToken);
    return result.user;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto);
    this.setAuthCookie(response, result.accessToken);
    return result.user;
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.isSecureCookie(),
    });

    return { message: 'Logout realizado com sucesso.' };
  }

  @Get('me')
  me(@Req() request: Request & { user?: unknown }) {
    return request.user;
  }

  private isSecureCookie(): boolean {
    const configured = process.env.COOKIE_SECURE?.trim().toLowerCase();

    if (configured === 'true') return true;
    if (configured === 'false') return false;

    return process.env.NODE_ENV === 'production';
  }
  private setAuthCookie(response: Response, token: string) {
    response.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.isSecureCookie(),
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });
  }
}