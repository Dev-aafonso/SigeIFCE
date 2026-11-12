import {
  Controller,
  Delete,
  Get,
  Query,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { RegistrationsService } from './registrations.service';
import { RegistrationQueryDto } from './dto/registration-query.dto';

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

  /** Nunca aceita um userId do navegador: o histórico pertence ao JWT. */
  @Get('me')
  listMine(
    @Req() request: AuthenticatedRequest,
    @Query() query: RegistrationQueryDto,
  ) {
    return this.registrationsService.listMine(
      this.userId(request), query,
    );
  }

  private userId(request: AuthenticatedRequest): string {
    const userId = request.user?.sub ?? request.user?.id ?? request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Usuário autenticado não identificado.');
    }
    return userId;
  }

  @Post('actions/:actionId')
  async create(
    @Param('actionId') actionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = this.userId(request);

    return this.registrationsService.createForAction(userId, actionId);
  }
  @Delete('actions/:actionId')
  async cancelForAction(
    @Param('actionId') actionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = this.userId(request);

    return this.registrationsService.cancelForAction(userId, actionId);
  }
}
