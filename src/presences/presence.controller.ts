import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import { PresenceService, PresencePrincipal } from './presence.service';
import { CreatePresenceDto } from './dto/create-presence.dto';

type AuthenticatedRequest = Request & { user?: { sub?: string; id?: string; role?: UserRole } };

@Controller('presences')
@Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
export class PresenceController {
  constructor(private readonly presenceService: PresenceService) {}

  private principal(request: AuthenticatedRequest): PresencePrincipal {
    return {
      id: String(request.user?.sub ?? request.user?.id ?? ''),
      role: request.user?.role as UserRole,
    };
  }

  @Post()
  create(@Body() dto: CreatePresenceDto, @Req() request: AuthenticatedRequest) {
    return this.presenceService.create(dto, this.principal(request));
  }

  @Get('registration/:registrationId')
  findByRegistration(@Param('registrationId') registrationId: string, @Req() request: AuthenticatedRequest) {
    return this.presenceService.findByRegistration(registrationId, this.principal(request));
  }

  @Get('actions/:actionId/participants')
  findParticipantsByAction(@Param('actionId') actionId: string, @Req() request: AuthenticatedRequest) {
    return this.presenceService.findParticipantsByAction(actionId, this.principal(request));
  }

  @Get('actions/:actionId/present')
  findPresentByAction(@Param('actionId') actionId: string, @Req() request: AuthenticatedRequest) {
    return this.presenceService.findPresentByAction(actionId, this.principal(request));
  }

  @Get('actions/:actionId/absent')
  findAbsentByAction(@Param('actionId') actionId: string, @Req() request: AuthenticatedRequest) {
    return this.presenceService.findAbsentByAction(actionId, this.principal(request));
  }
}