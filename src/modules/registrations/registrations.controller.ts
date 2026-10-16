import {
  Controller,
  Delete,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { RegistrationsService } from './registrations.service';

type AuthenticatedRequest = Request & {
  user?: {
    id?: string;
    userId?: string;
    sub?: string;
  };
};

@Controller('registrations')
export class RegistrationsController {
  constructor(
    private readonly registrationsService: RegistrationsService,
  ) {}

  @Post('actions/:actionId')
  async create(
    @Param('actionId') actionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const authenticatedUser = request.user;
    const userId =
      authenticatedUser?.id ??
      authenticatedUser?.userId ??
      authenticatedUser?.sub;

    if (!userId) {
      throw new UnauthorizedException(
        'Usu\u00e1rio autenticado n\u00e3o identificado.',
      );
    }

    return this.registrationsService.createForAction(userId, actionId);
  }
  @Delete('actions/:actionId')
  async cancelForAction(
    @Param('actionId') actionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const authenticatedUser = request.user;
    const userId =
      authenticatedUser?.id ??
      authenticatedUser?.userId ??
      authenticatedUser?.sub;

    if (!userId) {
      throw new UnauthorizedException(
        'Usuario autenticado nao identificado.',
      );
    }

    return this.registrationsService.cancelForAction(userId, actionId);
  }
}
