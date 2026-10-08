import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { UserRole } from '../../generated/prisma/enums';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ActionsService } from './actions.service';
import { CreateActionDto } from './dto/create-action.dto';
import { UpdateActionDto } from './dto/update-action.dto';

@Controller()
export class ActionsController {
  constructor(
    private readonly service: ActionsService,
  ) {}

  @Public()
  @Get('events/:eventId/actions')
  findByEvent(
    @Param('eventId') eventId: string,
  ) {
    return this.service.findPublicByEvent(
      eventId,
    );
  }

  @Public()
  @Get('actions/:id')
  findById(
    @Param('id') id: string,
  ) {
    return this.service.findPublicById(id);
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
  @Post('events/:eventId/actions')
  create(
    @Param('eventId') eventId: string,
    @Body() dto: CreateActionDto,
    @Req() req: any,
  ) {
    return this.service.create(
      eventId,
      dto,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
  @Patch('actions/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateActionDto,
    @Req() req: any,
  ) {
    return this.service.update(
      id,
      dto,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
  @Post('actions/:id/cancel')
  cancel(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.service.cancel(
      id,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
  @Post('actions/:id/close')
  close(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.service.close(
      id,
      req.user,
    );
  }
}