import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../generated/prisma/client';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportPrincipal, ReportsService } from './reports.service';

type AuthenticatedRequest = Request & {
  user?: { id?: string; sub?: string; role?: UserRole };
};

@Controller('reports')
@Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  private principal(request: AuthenticatedRequest): ReportPrincipal {
    return {
      id: String(request.user?.sub ?? request.user?.id ?? ''),
      role: request.user?.role as UserRole,
    };
  }

  @Get()
  catalog() {
    return {
      reports: [
        { type: 'events', title: 'Eventos e ações', endpoint: '/reports/events' },
        { type: 'registrations', title: 'Inscrições', endpoint: '/reports/registrations' },
        { type: 'attendance', title: 'Frequência', endpoint: '/reports/attendance' },
        { type: 'certificates', title: 'Certificados', endpoint: '/reports/certificates' },
      ],
      formats: ['pdf', 'csv'],
      maximumRowsPerReport: 10000,
    };
  }

  @Get(':type/export')
  async export(
    @Param('type') type: string,
    @Query() query: ReportQueryDto,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const payload = await this.reportsService.getReport(type, this.principal(request), query);
    const format = query.format ?? 'csv';
    const buffer = format === 'pdf'
      ? await this.reportsService.createPdf(payload)
      : await this.reportsService.createCsv(payload);
    const safeType = payload.type.replace(/[^a-z-]/gi, '');
    const filename = `sige-ifce-${safeType}-${new Date().toISOString().slice(0, 10)}.${format}`;

    response.set({
      'Content-Type': format === 'pdf' ? 'application/pdf' : 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(buffer);
  }

  @Get(':type')
  getReport(
    @Param('type') type: string,
    @Query() query: ReportQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.reportsService.getReport(type, this.principal(request), query);
  }
}
