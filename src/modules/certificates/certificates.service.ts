import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import PDFDocument = require('pdfkit');

import { ActionStatus, EventStatus, UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';

type Requester = {
  id: string;
  role?: UserRole | string;
};

function prismaCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return String((error as { code?: unknown }).code ?? '');
}

@Injectable()
export class CertificatesService {
  constructor(private readonly prisma: PrismaService) {}

  async issueForUser(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento nÃ£o encontrado.');

    if (event.status !== EventStatus.ENCERRADO) {
      throw new BadRequestException('O certificado somente pode ser emitido apÃ³s o encerramento do evento.');
    }

    const existing = await this.prisma.certificate.findUnique({
      where: { userId_eventId: { userId, eventId } },
      include: {
        user: { select: { id: true, name: true, email: true } },
        event: true,
      },
    });

    if (existing) {
      return { alreadyExisted: true, certificate: this.publicCertificate(existing) };
    }

    const registrations = await this.prisma.registration.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        action: {
          eventId,
          status: { not: ActionStatus.CANCELADA },
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        action: true,
        presence: true,
      },
    });

    if (registrations.length === 0) {
      throw new BadRequestException('O participante nÃ£o possui inscriÃ§Ãµes ativas neste evento.');
    }

    const totalMinutes = registrations.reduce((total, item) => total + item.action.durationMinutes, 0);
    const attendedMinutes = registrations
      .filter((item) => item.presence !== null)
      .reduce((total, item) => total + item.action.durationMinutes, 0);

    if (totalMinutes <= 0) {
      throw new BadRequestException('A carga horÃ¡ria total do evento Ã© invÃ¡lida.');
    }

    const attendancePercent = (attendedMinutes / totalMinutes) * 100;
    const minimum = event.minAttendancePercent;

    if (minimum < 0 || minimum > 100) {
      throw new BadRequestException('O percentual mÃ­nimo de presenÃ§a configurado no evento Ã© invÃ¡lido.');
    }

    if (attendancePercent < minimum) {
      throw new BadRequestException(
        `CritÃ©rio de certificaÃ§Ã£o nÃ£o atingido. PresenÃ§a: ${attendancePercent.toFixed(2)}%; mÃ­nimo: ${minimum}%.`,
      );
    }

    const validationCode = `SIGE-${randomBytes(10).toString('hex').toUpperCase()}`;
    const relativeFilePath = `storage/certificates/${validationCode}.pdf`;
    const absoluteFilePath = join(process.cwd(), relativeFilePath);

    await this.generatePdf({
      absoluteFilePath,
      participantName: registrations[0].user.name,
      participantEmail: registrations[0].user.email,
      eventTitle: event.title,
      eventLocation: event.location,
      eventStartDate: event.startDate,
      eventEndDate: event.endDate,
      certifiedMinutes: attendedMinutes,
      attendancePercent,
      minimumAttendance: minimum,
      validationCode,
    });

    try {
      const certificate = await this.prisma.certificate.create({
        data: {
          userId,
          eventId,
          validationCode,
          certifiedMinutes: attendedMinutes,
          attendancePercent,
          filePath: relativeFilePath,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          event: true,
        },
      });

      return { alreadyExisted: false, certificate: this.publicCertificate(certificate) };
    } catch (error) {
      if (prismaCode(error) === 'P2002') {
        if (existsSync(absoluteFilePath)) unlinkSync(absoluteFilePath);
        const concurrent = await this.prisma.certificate.findUnique({
          where: { userId_eventId: { userId, eventId } },
          include: {
            user: { select: { id: true, name: true, email: true } },
            event: true,
          },
        });
        if (concurrent) return { alreadyExisted: true, certificate: this.publicCertificate(concurrent) };
      }
      throw error;
    }
  }

  async issueForEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento nÃ£o encontrado.');
    if (event.status !== EventStatus.ENCERRADO) {
      throw new BadRequestException('O certificado somente pode ser emitido apÃ³s o encerramento do evento.');
    }

    const registrations = await this.prisma.registration.findMany({
      where: {
        status: 'ACTIVE',
        action: {
          eventId,
          status: { not: ActionStatus.CANCELADA },
        },
      },
      select: { userId: true },
    });

    const userIds = [...new Set(registrations.map((item) => item.userId))];
    const issued: unknown[] = [];
    const rejected: Array<{ userId: string; reason: string }> = [];

    for (const userId of userIds) {
      try {
        const result = await this.issueForUser(eventId, userId);
        issued.push(result.certificate);
      } catch (error) {
        rejected.push({
          userId,
          reason: error instanceof Error ? error.message : 'CritÃ©rio de certificaÃ§Ã£o nÃ£o atendido.',
        });
      }
    }

    return {
      eventId,
      totalParticipants: userIds.length,
      certificates: issued,
      rejected,
    };
  }

  async findMine(userId: string) {
    return this.prisma.certificate.findMany({
      where: { userId },
      include: { event: true },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async findById(id: string, requester: Requester) {
    const certificate = await this.prisma.certificate.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        event: true,
      },
    });

    if (!certificate) throw new NotFoundException('Certificado nÃ£o encontrado.');

    const privileged = requester.role === UserRole.ADMIN || requester.role === UserRole.ORGANIZADOR;
    if (!privileged && certificate.userId !== requester.id) {
      throw new ForbiddenException('VocÃª nÃ£o possui acesso a este certificado.');
    }

    return this.publicCertificate(certificate);
  }

  async download(id: string, requester: Requester) {
    const certificate = await this.prisma.certificate.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        event: true,
      },
    });

    if (!certificate) throw new NotFoundException('Certificado nÃ£o encontrado.');

    const privileged = requester.role === UserRole.ADMIN || requester.role === UserRole.ORGANIZADOR;
    if (!privileged && certificate.userId !== requester.id) {
      throw new ForbiddenException('VocÃª nÃ£o possui acesso a este certificado.');
    }

    const file = join(process.cwd(), certificate.filePath);
    if (!existsSync(file)) throw new NotFoundException('Arquivo PDF do certificado nÃ£o encontrado.');

    return {
      buffer: readFileSync(file),
      filename: `certificado-${certificate.validationCode}.pdf`,
    };
  }

  async validateCode(validationCode: string) {
    const certificate = await this.prisma.certificate.findUnique({
      where: { validationCode: validationCode.trim().toUpperCase() },
      include: {
        user: { select: { name: true } },
        event: { select: { id: true, title: true, location: true, startDate: true, endDate: true } },
      },
    });

    if (!certificate) return { valid: false, message: 'Certificado nÃ£o encontrado.' };

    return {
      valid: true,
      certificate: {
        id: certificate.id,
        validationCode: certificate.validationCode,
        participantName: certificate.user.name,
        event: certificate.event.title,
        location: certificate.event.location,
        startDate: certificate.event.startDate,
        endDate: certificate.event.endDate,
        certifiedMinutes: certificate.certifiedMinutes,
        certifiedHours: Number((certificate.certifiedMinutes / 60).toFixed(2)),
        attendancePercent: Number(certificate.attendancePercent.toFixed(2)),
        issuedAt: certificate.issuedAt,
      },
    };
  }

  private publicCertificate(certificate: any) {
    return {
      id: certificate.id,
      validationCode: certificate.validationCode,
      certifiedMinutes: certificate.certifiedMinutes,
      certifiedHours: Number((certificate.certifiedMinutes / 60).toFixed(2)),
      attendancePercent: Number(certificate.attendancePercent.toFixed(2)),
      issuedAt: certificate.issuedAt,
      filePath: certificate.filePath,
      participant: certificate.user
        ? { id: certificate.user.id, name: certificate.user.name, email: certificate.user.email }
        : undefined,
      event: certificate.event
        ? {
            id: certificate.event.id,
            title: certificate.event.title,
            description: certificate.event.description,
            location: certificate.event.location,
            startDate: certificate.event.startDate,
            endDate: certificate.event.endDate,
          }
        : undefined,
    };
  }

  private async generatePdf(data: {
    absoluteFilePath: string;
    participantName: string;
    participantEmail: string;
    eventTitle: string;
    eventLocation: string | null;
    eventStartDate: Date;
    eventEndDate: Date;
    certifiedMinutes: number;
    attendancePercent: number;
    minimumAttendance: number;
    validationCode: string;
  }) {
    const directory = dirname(data.absoluteFilePath);
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true });

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 55, bottom: 55, left: 60, right: 60 },
        info: {
          Title: `Certificado - ${data.participantName}`,
          Author: 'SIGE IFCE',
          Subject: data.eventTitle,
        },
      });

      const stream = createWriteStream(data.absoluteFilePath);
      stream.on('finish', resolve);
      stream.on('error', reject);
      doc.on('error', reject);
      doc.pipe(stream);

      doc.fontSize(26).font('Helvetica-Bold').text('CERTIFICADO', { align: 'center' });
      doc.moveDown(2);
      doc.fontSize(15).font('Helvetica').text('O SIGE IFCE certifica que', { align: 'center' });
      doc.moveDown(0.7);
      doc.fontSize(23).font('Helvetica-Bold').text(data.participantName, { align: 'center' });
      doc.moveDown(1.1);
      doc.fontSize(14).font('Helvetica').text(
        `participou do evento "${data.eventTitle}", atendendo aos critÃ©rios de certificaÃ§Ã£o estabelecidos.`,
        { align: 'center', lineGap: 6 },
      );
      doc.moveDown(1.5);
      doc.fontSize(15).font('Helvetica-Bold').text(
        `Carga horÃ¡ria certificada: ${(data.certifiedMinutes / 60).toFixed(2)} hora(s)`,
        { align: 'center' },
      );
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica').text(
        `PresenÃ§a consolidada: ${data.attendancePercent.toFixed(2)}%`,
        { align: 'center' },
      );
      doc.moveDown(1.8);
      doc.fontSize(11).text(`Evento: ${data.eventTitle}`);
      if (data.eventLocation) doc.text(`Local: ${data.eventLocation}`);
      doc.text(`PerÃ­odo: ${data.eventStartDate.toLocaleString('pt-BR')} a ${data.eventEndDate.toLocaleString('pt-BR')}`);
      doc.text(`Participante: ${data.participantEmail}`);
      doc.moveDown(0.8);
      doc.fontSize(10).fillColor('#444444').text(`CritÃ©rio mÃ­nimo de presenÃ§a: ${data.minimumAttendance}%`);
      doc.moveDown(2);
      doc.fontSize(11).fillColor('#000000').font('Helvetica-Bold').text(
        `CÃ³digo de validaÃ§Ã£o: ${data.validationCode}`,
        { align: 'center' },
      );
      doc.moveDown(0.5);
      doc.fontSize(9).font('Helvetica').fillColor('#444444').text(
        `${process.env.APP_URL ?? 'http://localhost:3000'}/certificates/validate/${data.validationCode}`,
        { align: 'center' },
      );
      doc.moveDown(2);
      doc.fontSize(9).fillColor('#666666').text(
        'Documento gerado eletronicamente pelo Sistema de Gerenciamento de Eventos CientÃ­ficos do IFCE.',
        { align: 'center' },
      );

      doc.end();
    });
  }
}