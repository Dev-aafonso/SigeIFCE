import {
  Body,
  Controller,
  Patch,
  Req,
  UnauthorizedException,
} from '@nestjs/common';

import { Request } from 'express';

import { UsersService } from './users.service';
import { SelectRoleDto } from './dto/select-role.dto';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
  ) {}

  @Patch('me/role')
  async selectRole(
    @Req() req: Request,
    @Body() dto: SelectRoleDto,
  ) {
    const auth =
      req.headers.authorization || '';

    if (!auth.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Token não informado.',
      );
    }

    const token = auth.replace(
      'Bearer ',
      '',
    );

    const payload = this.decodeToken(token);

    if (!payload?.sub) {
      throw new UnauthorizedException(
        'Token inválido.',
      );
    }

    return this.usersService.selectRole(
      String(payload.sub),
      dto.role,
    );
  }

  private decodeToken(token: string): any {
    try {
      const parts = token.split('.');

      if (parts.length !== 3) {
        return null;
      }

      return JSON.parse(
        Buffer.from(
          parts[1],
          'base64url',
        ).toString('utf8'),
      );
    } catch {
      return null;
    }
  }
}
