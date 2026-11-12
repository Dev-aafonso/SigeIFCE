import { Controller, Get, Param, Patch, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { NotificationsService } from './notifications.service';

type AuthenticatedRequest = Request & { user?: { sub?: string; id?: string; userId?: string } };
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  private userId(request: AuthenticatedRequest) {
    const id = request.user?.sub ?? request.user?.id ?? request.user?.userId;
    if (!id) throw new UnauthorizedException();
    return id;
  }
  @Get() list(@Req() request: AuthenticatedRequest) { return this.notifications.list(this.userId(request)); }
  @Patch(':key/read') read(@Req() request: AuthenticatedRequest, @Param('key') key: string) {
    return this.notifications.markRead(this.userId(request), key);
  }
}
