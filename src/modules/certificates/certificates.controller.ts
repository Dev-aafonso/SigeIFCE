import { Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
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

  @Get('me')
  findMine(@Req() request: AuthenticatedRequest) {
    return this.certificatesService.findMine(String(request.user?.sub ?? request.user?.id ?? ''));
  }

  @Get('validate/:code')
  @Public()
  validate(@Param('code') code: string) {
    return this.certificatesService.validateCode(code);
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
