import {
  Body,
  Controller,
  Get,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  @Get('/')
  home(@Res() res: Response) {
    return res.redirect('/login');
  }

  @Get('/login')
  loginPage(@Res() res: Response) {
    return res.render('modules/auth/login');
  }

  @Get('/cadastro')
  registerPage(@Res() res: Response) {
    return res.render('modules/auth/register');
  }

  @Get('/selecao-funcao')
  rolePage(@Res() res: Response) {
    return res.render('modules/auth/role-selection');
  }

  @Post('/auth/login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('/auth/register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }
  @Get('/sistema')
  systemPage(@Res() res: Response) {
    return res.render('modules/auth/system');
  }
}

