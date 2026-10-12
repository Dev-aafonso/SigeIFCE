import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../generated/prisma/client';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { DashboardPrincipal, DashboardService } from './dashboard.service';

type AuthenticatedRequest = Request & {
  user?: { id?: string; sub?: string; role?: UserRole };
};

@Controller('dashboard')
@Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  private principal(request: AuthenticatedRequest): DashboardPrincipal {
    return {
      id: String(request.user?.sub ?? request.user?.id ?? ''),
      role: request.user?.role as UserRole,
    };
  }

  @Get('overview')
  getOverview(@Query() query: DashboardQueryDto, @Req() request: AuthenticatedRequest) {
    return this.dashboardService.getOverview(this.principal(request), query);
  }

  @Get('filters')
  getFilters(@Query() query: DashboardQueryDto, @Req() request: AuthenticatedRequest) {
    return this.dashboardService.getFilters(this.principal(request), query);
  }

  @Get('events')
  getEvents(@Query() query: DashboardQueryDto, @Req() request: AuthenticatedRequest) {
    return this.dashboardService.getEventBreakdown(this.principal(request), query);
  }

  @Get('actions')
  getActions(@Query() query: DashboardQueryDto, @Req() request: AuthenticatedRequest) {
    return this.dashboardService.getActionBreakdown(this.principal(request), query);
  }
}
