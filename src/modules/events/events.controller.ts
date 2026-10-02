import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { UserRole } from '../../generated/prisma/enums';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { EventQueryDto } from './dto/event-query.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(
    private readonly service: EventsService,
  ) {}

  @Public()
  @Get()
  findPublic(
    @Query() query: EventQueryDto,
  ) {
    return this.service.findPublic(query);
  }

  @Public()
  @Get(':id')
  findPublicById(
    @Param('id') id: string,
  ) {
    return this.service.findPublicById(id);
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
  @Get(':id/manage')
  findManageable(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.service.findManageable(
      id,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
  @Post()
  create(
    @Body() dto: CreateEventDto,
    @Req() req: any,
  ) {
    return this.service.create(
      dto,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
    @Req() req: any,
  ) {
    return this.service.update(
      id,
      dto,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
  @Post(':id/publish')
  publish(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.service.publish(
      id,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
  @Post(':id/cancel')
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
  @Delete(':id')
  cancelByDelete(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.service.cancel(
      id,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
  @Post(':id/close')
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