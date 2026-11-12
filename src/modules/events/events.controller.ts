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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '../../generated/prisma/enums';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { EventQueryDto } from './dto/event-query.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

type AuthenticatedRequest = Request & {
  user: {
    id?: string;
    sub?: string;
    userId?: string;
    role: UserRole;
    email?: string;
  };
};
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

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR, UserRole.PROFESSOR)
  @Get('manageable/search')
  searchManageable(@Query('title') title: string, @Req() req: AuthenticatedRequest) {
    return this.service.searchManageable(title, req.user);
  }

  @Public()
  @Get(':id/cover')
  async getCover(@Param('id') id: string, @Res() response: Response) {
    const cover = await this.service.getPublicCover(id);
    response.setHeader('Content-Type', cover.mimeType);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(Buffer.from(cover.data));
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR, UserRole.PROFESSOR)
  @Get(':id/manage/cover')
  async getManagedCover(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Res() response: Response) {
    const cover = await this.service.getManagedCover(id, req.user);
    response.setHeader('Content-Type', cover.mimeType);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(Buffer.from(cover.data));
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR, UserRole.PROFESSOR)
  @Post(':id/cover')
  @UseInterceptors(FileInterceptor('cover', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  uploadCover(@Param('id') id: string, @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined, @Req() req: AuthenticatedRequest) {
    return this.service.setCover(id, req.user, file);
  }

  @Public()
  @Get(':id')
  findPublicById(
    @Param('id') id: string,
  ) {
    return this.service.findPublicById(id);
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR, UserRole.PROFESSOR)
  @Get(':id/manage')
  findManageable(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.findManageable(
      id,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR, UserRole.PROFESSOR)
  @Post()
  create(
    @Body() dto: CreateEventDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.create(
      dto,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR, UserRole.PROFESSOR)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.update(
      id,
      dto,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR, UserRole.PROFESSOR)
  @Post(':id/publish')
  publish(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.publish(
      id,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR, UserRole.PROFESSOR)
  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.cancel(
      id,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR, UserRole.PROFESSOR)
  @Delete(':id')
  cancelByDelete(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.cancel(
      id,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR, UserRole.PROFESSOR)
  @Post(':id/close')
  close(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.close(
      id,
      req.user,
    );
  }
}