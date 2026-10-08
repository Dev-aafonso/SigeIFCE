import { Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../generated/prisma/client';
import { CertificatesService } from './certificates.service';

@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Post('me/events/:eventId')
  issueMine(@Param('eventId') eventId: string, @Req() req: any) {
    return this.certificatesService.issueForUser(eventId, req.user.sub);
  }

  @Post('events/:eventId')
  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
  issueForEvent(@Param('eventId') eventId: string) {
    return this.certificatesService.issueForEvent(eventId);
  }

  @Get('me')
  findMine(@Req() req: any) {
    return this.certificatesService.findMine(req.user.sub);
  }

  @Get('validate/:validationCode')
  @Public()
  validate(@Param('validationCode') validationCode: string) {
    return this.certificatesService.validateCode(validationCode);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const result = await this.certificatesService.download(id, {
      id: req.user.sub,
      role: req.user.role,
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': String(result.buffer.length),
      'Cache-Control': 'no-store',
    });

    res.end(result.buffer);
  }

  @Get(':id')
  findById(@Param('id') id: string, @Req() req: any) {
    return this.certificatesService.findById(id, {
      id: req.user.sub,
      role: req.user.role,
    });
  }
}