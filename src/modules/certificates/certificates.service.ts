import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

import {
  ActionStatus,
  EventStatus,
  RegistrationStatus,
  UserRole,
} from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CertificatePdfService } from './certificate-pdf.service';

type Requester = {
  id: string;
  role?: UserRole | string;
};

function getPrismaErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: CertificatePdfService,
  ) {}

  async issueForRegistration(registrationId: string, requester: Requester) {
    if (!requester.id) throw new ForbiddenException('Usuário autenticado sem identificador.');

    const registration = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        action: { include: { event: true } },
        presence: true,
        certificate: true,
      },
    });

    if (!registration) throw new NotFoundException('Inscrição não encontrada.');

    const isAdmin = requester.role === UserRole.ADMIN;
    const isEventOrganizer =
      requester.role === UserRole.ORGANIZADOR && registration.action.event.organizerId === requester.id;
    const isOwner = registration.userId === requester.id;

    if (!isAdmin && !isEventOrganizer && !isOwner) {
      throw new ForbiddenException('Você não tem permissão para emitir este certificado.');
    }

    if (registration.certificate) {
      return {
        alreadyExisted: true,
        certificate: this.publicCertificate(registration.certificate, registration.user, registration.action, registration.action.event),
      };
    }

    if (registration.status !== RegistrationStatus.ACTIVE) {
      throw new BadRequestException('A inscrição não está ativa e não pode gerar certificado.');
    }

    if (registration.action.status === ActionStatus.CANCELADA) {
      throw new BadRequestException('A ação foi cancelada e não pode gerar certificado.');
    }

    if (registration.action.status !== ActionStatus.ENCERRADA) {
      throw new BadRequestException('O certificado só pode ser emitido após o encerramento da ação.');
    }

    if (registration.action.event.status === EventStatus.CANCELADO) {
      throw new BadRequestException('O evento foi cancelado e não pode gerar certificados.');
    }

    // Para certificados por ação, a presença registrada nessa inscrição é o critério de elegibilidade.
    if (!registration.presence) {
      throw new BadRequestException('Não há presença registrada para esta inscrição.');
    }

    const validationCode = `SIGE-${randomBytes(12).toString('hex').toUpperCase()}`;
    const verificationUrl = this.getVerificationUrl(validationCode);
    const relativeFilePath = `storage/certificates/${validationCode}.pdf`;
    const absoluteFilePath = resolve(process.cwd(), relativeFilePath);
    const pdf = await this.pdfService.generate({
      participantName: registration.user.name,
      eventTitle: registration.action.event.title,
      actionTitle: registration.action.title,
      actionStartDate: registration.action.startDate,
      actionEndDate: registration.action.endDate,
      certifiedMinutes: registration.action.durationMinutes,
      validationCode,
      verificationUrl,
      issuedAt: new Date(),
      campusName: process.env.IFCE_CAMPUS_NAME,
    });

    await mkdir(resolve(process.cwd(), 'storage', 'certificates'), { recursive: true });
    let fileCreated = false;

    try {
      await writeFile(absoluteFilePath, pdf, { flag: 'wx' });
      fileCreated = true;

      const certificate = await this.prisma.certificate.create({
        data: {
          userId: registration.userId,
          eventId: registration.action.eventId,
          actionId: registration.actionId,
          registrationId: registration.id,
          validationCode,
          certifiedMinutes: registration.action.durationMinutes,
          attendancePercent: 100,
          filePath: relativeFilePath,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          event: true,
          action: true,
          registration: true,
        },
      });

      return {
        alreadyExisted: false,
        certificate: this.publicCertificate(certificate, certificate.user, certificate.action, certificate.event),
      };
    } catch (error) {
      if (fileCreated) await rm(absoluteFilePath, { force: true });

      // Duas requisições simultâneas para a mesma inscrição não devem criar certificados duplicados.
      if (getPrismaErrorCode(error) === 'P2002') {
        const existing = await this.prisma.certificate.findUnique({
          where: { registrationId },
          include: {
            user: { select: { id: true, name: true, email: true } },
            event: true,
            action: true,
            registration: true,
          },
        });
        if (existing) {
          return {
            alreadyExisted: true,
            certificate: this.publicCertificate(existing, existing.user, existing.action, existing.event),
          };
        }
      }

      throw error;
    }
  }

  async findMine(userId: string) {
    return this.prisma.certificate.findMany({
      where: { userId },
      include: { event: true, action: true },
      orderBy: { issuedAt: 'desc' },
    }).then((items) => items.map((item) => this.publicCertificate(item, undefined, item.action, item.event)));
  }

  async findOneForRequester(id: string, requester: Requester) {
    const certificate = await this.prisma.certificate.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        event: true,
        action: true,
        registration: true,
      },
    });

    if (!certificate) throw new NotFoundException('Certificado não encontrado.');
    await this.assertCanAccess(certificate, requester);

    return this.publicCertificate(certificate, certificate.user, certificate.action, certificate.event);
  }

  async download(id: string, requester: Requester) {
    const certificate = await this.prisma.certificate.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        event: true,
        action: true,
        registration: true,
      },
    });

    if (!certificate) throw new NotFoundException('Certificado não encontrado.');
    await this.assertCanAccess(certificate, requester);
    if (certificate.revokedAt) throw new ForbiddenException('Este certificado foi revogado.');

    const storageRoot = resolve(process.cwd(), 'storage', 'certificates');
    const absoluteFilePath = resolve(process.cwd(), certificate.filePath);
    if (!absoluteFilePath.startsWith(storageRoot + sep) && absoluteFilePath !== storageRoot) {
      throw new NotFoundException('Caminho de arquivo inválido.');
    }
    if (!existsSync(absoluteFilePath)) {
      throw new NotFoundException('O PDF não está disponível no armazenamento. Solicite uma nova emissão ao suporte.');
    }

    return {
      buffer: await readFile(absoluteFilePath),
      filename: `certificado-${certificate.validationCode}.pdf`,
    };
  }

  async validateCode(code: string) {
    const normalizedCode = code.trim().toUpperCase();
    const certificate = await this.prisma.certificate.findUnique({
      where: { validationCode: normalizedCode },
      include: {
        user: { select: { name: true } },
        event: { select: { title: true, location: true, startDate: true, endDate: true } },
        action: { select: { title: true, startDate: true, endDate: true, durationMinutes: true } },
      },
    });

    if (!certificate) return { valid: false, message: 'Certificado não encontrado.' };
    if (certificate.revokedAt) {
      return { valid: false, message: 'Este certificado foi revogado.', validationCode: normalizedCode };
    }

    return {
      valid: true,
      certificate: {
        validationCode: certificate.validationCode,
        participantName: certificate.user.name,
        eventTitle: certificate.event.title,
        actionTitle: certificate.action?.title ?? null,
        location: certificate.event.location,
        actionStartDate: certificate.action?.startDate ?? null,
        actionEndDate: certificate.action?.endDate ?? null,
        certifiedMinutes: certificate.certifiedMinutes,
        certifiedHours: Number((certificate.certifiedMinutes / 60).toFixed(2)),
        issuedAt: certificate.issuedAt,
      },
    };
  }

  private async assertCanAccess(certificate: any, requester: Requester): Promise<void> {
    if (!requester.id) throw new ForbiddenException('Usuário autenticado sem identificador.');

    const isAdmin = requester.role === UserRole.ADMIN;
    const isEventOrganizer =
      requester.role === UserRole.ORGANIZADOR && certificate.event?.organizerId === requester.id;
    const isOwner = certificate.userId === requester.id;

    if (!isAdmin && !isEventOrganizer && !isOwner) {
      throw new ForbiddenException('Você não tem acesso a este certificado.');
    }
  }

  private getVerificationUrl(code: string): string {
    const baseUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    return `${baseUrl}/certificates/validate/${encodeURIComponent(code)}`;
  }

  private publicCertificate(certificate: any, participant?: any, action?: any, event?: any) {
    const resolvedEvent = event ?? certificate.event;
    const resolvedAction = action ?? certificate.action;
    const resolvedParticipant = participant ?? certificate.user;

    return {
      id: certificate.id,
      validationCode: certificate.validationCode,
      certifiedMinutes: certificate.certifiedMinutes,
      certifiedHours: Number((certificate.certifiedMinutes / 60).toFixed(2)),
      attendancePercent: certificate.attendancePercent,
      issuedAt: certificate.issuedAt,
      revoked: Boolean(certificate.revokedAt),
      participant: resolvedParticipant
        ? { id: resolvedParticipant.id, name: resolvedParticipant.name }
        : undefined,
      event: resolvedEvent
        ? {
            id: resolvedEvent.id,
            title: resolvedEvent.title,
            location: resolvedEvent.location,
            startDate: resolvedEvent.startDate,
            endDate: resolvedEvent.endDate,
          }
        : undefined,
      action: resolvedAction
        ? {
            id: resolvedAction.id,
            title: resolvedAction.title,
            startDate: resolvedAction.startDate,
            endDate: resolvedAction.endDate,
            durationMinutes: resolvedAction.durationMinutes,
          }
        : undefined,
    };
  }
}
