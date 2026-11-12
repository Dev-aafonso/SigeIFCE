import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsString, IsOptional, Length } from 'class-validator';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../database/prisma.service';

class SaveScanDto { @IsOptional() @IsString() @Length(1, 200) eventId?: string; @IsString() @Length(1, 50000) text!: string; }
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../generated/prisma/client';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportPrincipal, ReportsService } from './reports.service';

type AuthenticatedRequest = Request & {
  user?: { id?: string; sub?: string; role?: UserRole };
};

@Controller('reports')
@Roles(UserRole.ADMIN, UserRole.ORGANIZADOR, UserRole.PROFESSOR)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService, private readonly prisma: PrismaService) {}

  private principal(request: AuthenticatedRequest): ReportPrincipal {
    return {
      id: String(request.user?.sub ?? request.user?.id ?? ''),
      role: request.user?.role as UserRole,
    };
  }

  private async scanEvent(id: string, principal: ReportPrincipal) {
    const event = await this.prisma.event.findFirst({ where: { id, ...(principal.role !== UserRole.ADMIN ? { organizerId: principal.id } : {}) }, select: { id: true } });
    if (!event) throw new ForbiddenException('Evento não encontrado ou sem permissão.');
    return event;
  }

  @Post('scans/read')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async readScan(@UploadedFile() file: {buffer: Buffer; mimetype: string} | undefined) {
    const b = file?.buffer;
    const valid = b && ((b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) || (b.length > 8 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) || (b.length > 12 && b.toString('ascii',0,4) === 'RIFF' && b.toString('ascii',8,12) === 'WEBP'));
    if (!valid || !b) throw new BadRequestException('Selecione uma imagem JPG, PNG ou WebP válida de até 5 MB.');
    try {
      const response = await fetch('http://127.0.0.1:55883/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({image: b.toString('base64')}), signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error('OCR indisponível');
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || !('text' in result) || typeof result.text !== 'string') throw new Error('Resposta inválida');
      return { text: result.text.slice(0, 50000) };
    } catch { throw new ServiceUnavailableException('O leitor local está indisponível. Inicie o leitor e tente novamente.'); }
  }

  @Post('scans')
  async saveScan(@Body() data: SaveScanDto, @Req() request: AuthenticatedRequest) {
    const principal = this.principal(request); if (data.eventId) await this.scanEvent(data.eventId, principal);
    const text = data.text.trim(); if (!text) throw new BadRequestException('Revise e informe o texto antes de salvar.');
    return this.prisma.scannedReport.create({data: {eventId: data.eventId || null, authorId: principal.id, text}, select: {id: true, createdAt: true}});
  }

  @Post('scans/pdf')
  async exportScanPdf(@Body() data: SaveScanDto, @Req() request: AuthenticatedRequest, @Res() response: Response): Promise<void> {
    const principal = this.principal(request);
    if (data.eventId) await this.scanEvent(data.eventId, principal);
    const text = data.text.trim();
    if (!text) throw new BadRequestException('Informe o texto revisado para gerar o PDF.');
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 54, info: { Title: 'Relatório digitalizado — SIGE IFCE' } });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.font('Helvetica-Bold').fontSize(18).text('Relatório digitalizado');
      doc.moveDown().font('Helvetica').fontSize(11).text(text, { lineGap: 3 });
      doc.end();
    });
    response.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="sige-ifce-digitalizacao.pdf"', 'Content-Length': String(buffer.length), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(buffer);
  }

  @Get('scans/list')
  async listScans(@Query('eventId') eventId: string, @Req() request: AuthenticatedRequest) {
    const principal = this.principal(request);
    if (eventId) await this.scanEvent(eventId, principal);
    return this.prisma.scannedReport.findMany({where: eventId ? {eventId} : {eventId: null, authorId: principal.id}, select: {id: true, text: true, createdAt: true}, orderBy: {createdAt: 'desc'}, take: 100});
  }

  @Get()
  catalog() {
    return {
      reports: [
        { type: 'events', title: 'Eventos e ações', endpoint: '/reports/events' },
        { type: 'general', title: 'Geral por evento', endpoint: '/reports/general' },
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
