import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

class IssueEventCertificateBody {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  userId?: string;
}

import { CertificatesService } from './certificates.service';

type AuthenticatedRequest = Request & {
  user?: { sub?: string; id?: string; role?: string };
};

@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Post('registrations/:registrationId/issue')
  issueForRegistration(
    @Param('registrationId') registrationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.certificatesService.issueForRegistration(registrationId, {
      id: String(request.user?.sub ?? request.user?.id ?? ''),
      role: request.user?.role,
    });
  }

  @Get('events/:eventId/eligibility')
  eligibility(@Param('eventId') eventId: string, @Query('userId') userId: string | undefined, @Req() request: AuthenticatedRequest) {
    return this.certificatesService.getEventEligibility(eventId, {
      id: String(request.user?.sub ?? request.user?.id ?? ''),
      role: request.user?.role,
    }, userId);
  }

  @Get('events/:eventId/candidates')
  candidates(@Param('eventId') eventId: string, @Req() request: AuthenticatedRequest) {
    return this.certificatesService.listEventCandidates(eventId, {
      id: String(request.user?.sub ?? request.user?.id ?? ''),
      role: request.user?.role,
    });
  }

  @Post('events/:eventId/issue')
  issueForEvent(@Param('eventId') eventId: string, @Body() body: IssueEventCertificateBody, @Req() request: AuthenticatedRequest) {
    return this.certificatesService.issueForEvent(eventId, {
      id: String(request.user?.sub ?? request.user?.id ?? ''),
      role: request.user?.role,
    }, body?.userId);
  }

  @Get('me')
  findMine(@Req() request: AuthenticatedRequest) {
    return this.certificatesService.findMine(String(request.user?.sub ?? request.user?.id ?? ''));
  }

  @Get('validate/:code')
  @Public()
  validate(@Param('code') code: string) {
    return this.certificatesService.validateCode(code);
  }

  /** Public HTML page opened by the QR code. Uses escaped text and no inline scripts. */
  @Get('verify/:code')
  @Public()
  async verifyPage(@Param('code') code: string, @Res() response: Response): Promise<void> {
    const result = await this.certificatesService.validateCode(code);
    const escapeMap: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => escapeMap[char] || char);
    const details = result.valid && result.certificate
      ? `<dl><dt>Participante</dt><dd>${escape(result.certificate.participantName)}</dd><dt>Evento</dt><dd>${escape(result.certificate.eventTitle)}</dd><dt>Tipo</dt><dd>${result.certificate.scope === 'EVENT' ? 'Certificado consolidado por evento' : 'Certificado de ação (legado)'}</dd><dt>Carga horária</dt><dd>${escape(result.certificate.certifiedHours)} horas</dd><dt>Código</dt><dd>${escape(result.certificate.validationCode)}</dd></dl>`
      : `<p>${escape(result.message || 'Certificado não encontrado ou revogado.')}</p>`;
    response.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.status(200).send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verificação de certificado — SIGE IFCE</title><link rel="stylesheet" href="/web/shared/styles/certificate-validation.css"></head><body><main><header><strong>SIGE IFCE</strong><span>Instituto Federal do Ceará</span></header><h1>Verificação de certificado</h1><p class="status ${result.valid ? 'valid' : 'invalid'}">${result.valid ? '✓ Certificado válido' : 'Certificado inválido'}</p>${details}<footer>A autenticidade é consultada diretamente no Sistema de Gerenciamento de Eventos Científicos.</footer></main></body></html>`);
  }

  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.certificatesService.download(id, {
      id: String(request.user?.sub ?? request.user?.id ?? ''),
      role: request.user?.role,
    });

    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': String(result.buffer.length),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(result.buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.certificatesService.findOneForRequester(id, {
      id: String(request.user?.sub ?? request.user?.id ?? ''),
      role: request.user?.role,
    });
  }
}
