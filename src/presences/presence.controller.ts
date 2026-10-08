import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';

import { PresenceService } from './presence.service';
import { CreatePresenceDto } from './dto/create-presence.dto';

@Controller('presences')
export class PresenceController {
  constructor(
    private readonly presenceService: PresenceService,
  ) {}

  @Post()
  async create(
    @Body() dto: CreatePresenceDto,
    @Req() req: any,
  ) {
    return this.presenceService.create(
      dto,
      req.user.sub,
    );
  }

  @Get('registration/:registrationId')
  async findByRegistration(
    @Param('registrationId') registrationId: string,
  ) {
    return this.presenceService.findByRegistration(
      registrationId,
    );
  }

  @Get('actions/:actionId/participants')
  async findParticipantsByAction(
    @Param('actionId') actionId: string,
  ) {
    return this.presenceService.findParticipantsByAction(
      actionId,
    );
  }

  @Get('actions/:actionId/present')
  async findPresentByAction(
    @Param('actionId') actionId: string,
  ) {
    return this.presenceService.findPresentByAction(
      actionId,
    );
  }

  @Get('actions/:actionId/absent')
  async findAbsentByAction(
    @Param('actionId') actionId: string,
  ) {
    return this.presenceService.findAbsentByAction(
      actionId,
    );
  }
}
