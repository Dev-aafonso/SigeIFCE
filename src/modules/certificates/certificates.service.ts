import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

import {
  EventStatus,
  UserRole,
} from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CertificatePdfService } from './certificate-pdf.service';
import { calculateEventAttendance } from './event-attendance';

type Requester = {
  id: string;
  role?: UserRole | string;
};

type CertificateParticipantSummary = {
  id: string;
  name: string;
};

type CertificateEventSummary = {
  id: string;
  title: string;
  location: string | null;
  startDate: Date;
  endDate: Date;
  organizerId?: string;
};

type CertificateActionSummary = {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  durationMinutes: number;
};

type CertificatePublicRecord = {
  id: string;
  validationCode: string;
  certifiedMinutes: number;
  attendancePercent: number;
  issuedAt: Date;
  revokedAt: Date | null;
  scope?: string;
  user?: CertificateParticipantSummary | null;
  event?: CertificateEventSummary | null;
  action?: CertificateActionSummary | null;
};

type CertificateAccessRecord = {
  userId: string;
  event?: { organizerId: string } | null;
};

function getPrismaErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/** Gera o endereço canônico do QR Code sem depender do Host da requisição. */
export function buildCertificateVerificationUrl(
  code: string,
  configuredAppUrl = process.env.APP_URL,
  nodeEnv = process.env.NODE_ENV,
): string {
  const isProduction = nodeEnv === 'production';
  const value = configuredAppUrl?.trim();
  if (!value && isProduction) {
    throw new InternalServerErrorException(
      'Configure APP_URL com o endereço público HTTPS antes de emitir certificados.',
    );
  }

  let origin: URL;
  try {
    origin = new URL(value || 'http://localhost:3000');
  } catch {
    throw new InternalServerErrorException('APP_URL inválida para a emissão de certificados.');
  }

  const localhost = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname.toLowerCase());
  const isHttps = origin.protocol === 'https:';
  const isLocalHttp = !isProduction && localhost && origin.protocol === 'http:';
  if ((!isHttps && !isLocalHttp) || (isProduction && localhost) ||
      origin.username || origin.password || origin.search || origin.hash) {
    throw new InternalServerErrorException(
      'A URL de certificação exige HTTPS público (HTTP somente para homologação local).',
    );
  }

  const basePath = origin.pathname.replace(/\/+$/, '');
  return `${origin.origin}${basePath}/certificates/verify/${encodeURIComponent(code)}`;
}

@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: CertificatePdfService,
  ) {}

  /** Read-only preview of consolidated event eligibility (RN23 / RF17).
   * This does not issue certificates or modify existing per-action certificates.
   */
  async getEventEligibility(eventId: string, requester: Requester, targetUserId?: string) {
    if (!requester.id) throw new ForbiddenException('Usuário autenticado sem identificador.');
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, status: true, minAttendancePercent: true, endDate: true, organizerId: true },
    });
    if (!event) throw new NotFoundException('Evento não encontrado.');
    const userId = targetUserId || requester.id;
    if (userId !== requester.id && requester.role !== UserRole.ADMIN &&
        !((requester.role === UserRole.ORGANIZADOR || requester.role === UserRole.PROFESSOR) && event.organizerId === requester.id)) {
      throw new ForbiddenException('Sem acesso à elegibilidade de outro participante.');
    }

    const registrations = await this.prisma.registration.findMany({
      where: { userId, action: { eventId } },
      select: {
        status: true,
        presence: { select: { id: true } },
        action: { select: { id: true, status: true, durationMinutes: true } },
      },
    });
    const attendance = calculateEventAttendance(registrations);
    const closed = event.status === EventStatus.ENCERRADO;
    const validThreshold = Number.isInteger(event.minAttendancePercent) &&
      event.minAttendancePercent >= 0 && event.minAttendancePercent <= 100;
    const eligible = closed && validThreshold && attendance.enrolledMinutes > 0 &&
      attendance.attendancePercent >= event.minAttendancePercent;

    return {
      event: { id: event.id, title: event.title, status: event.status },
      minAttendancePercent: event.minAttendancePercent,
      ...attendance,
      eligible,
      reason: !closed ? 'EVENT_NOT_CLOSED'
        : !validThreshold ? 'INVALID_THRESHOLD'
        : attendance.enrolledMinutes === 0 ? 'NO_ELIGIBLE_REGISTRATIONS'
        : eligible ? null : 'BELOW_MIN_ATTENDANCE',
      issuingEnabled: eligible,
    };
  }

  /** Backward compatible lookup for legacy action certificates.
   * New action-level issuance is intentionally disabled by the consolidated model.
   */
  async issueForRegistration(registrationId: string, requester: Requester) {
    if (!requester.id) throw new ForbiddenException('Usuário autenticado sem identificador.');
    const registration = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        action: { include: { event: true } },
        certificate: true,
      },
    });
    if (!registration) throw new NotFoundException('Inscrição não encontrada.');
    const manager = requester.role === UserRole.ADMIN ||
      ((requester.role === UserRole.ORGANIZADOR || requester.role === UserRole.PROFESSOR) && registration.action.event.organizerId === requester.id);
    if (!manager && registration.userId !== requester.id) {
      throw new ForbiddenException('Sem acesso ao certificado desta inscrição.');
    }
    if (registration.certificate) {
      return {
        alreadyExisted: true,
        certificate: this.publicCertificate(registration.certificate, registration.user, registration.action, registration.action.event),
      };
    }
    throw new BadRequestException('Emissão por inscrição foi descontinuada. Utilize POST /certificates/events/:eventId/issue.');
  }

  /** One consolidated certificate for one participant in an event (RN23/RF17). */
  async issueForEvent(eventId: string, requester: Requester, targetUserId?: string) {
    const userId = targetUserId || requester.id;
    const eligibility = await this.getEventEligibility(eventId, requester, userId);
    if (!eligibility.eligible) {
      throw new BadRequestException(`Certificado não elegível: ${eligibility.reason}.`);
    }

    const existing = await this.prisma.certificate.findFirst({
      where: { eventId, userId, scope: 'EVENT' },
      include: { user: { select: { id: true, name: true } }, event: true, action: true },
    });
    if (existing) {
      if (existing.revokedAt) throw new BadRequestException('Certificado consolidado revogado. Procure a administração.');
      return {
        alreadyExisted: true,
        certificate: this.publicCertificate(existing, existing.user, existing.action, existing.event),
      };
    }

    const [user, event] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } }),
      this.prisma.event.findUnique({ where: { id: eventId } }),
    ]);
    if (!user || !event) throw new NotFoundException('Participante ou evento não encontrado.');

    const validationCode = `SIGE-${randomBytes(12).toString('hex').toUpperCase()}`;
    const relativeFilePath = `storage/certificates/${validationCode}.pdf`;
    const absoluteFilePath = resolve(process.cwd(), relativeFilePath);
    const issuedAt = new Date();
    const pdf = await this.pdfService.generate({
      scope: 'EVENT',
      participantName: user.name,
      eventTitle: event.title,
      eventStartDate: event.startDate,
      eventEndDate: event.endDate,
      certifiedMinutes: eligibility.attendedMinutes,
      enrolledMinutes: eligibility.enrolledMinutes,
      attendancePercent: eligibility.attendancePercent,
      validationCode,
      verificationUrl: this.getVerificationUrl(validationCode),
      issuedAt,
      campusName: process.env.IFCE_CAMPUS_NAME,
    });
    await mkdir(resolve(process.cwd(), 'storage', 'certificates'), { recursive: true });
    let fileCreated = false;
    try {
      await writeFile(absoluteFilePath, pdf, { flag: 'wx' });
      fileCreated = true;
      const created = await this.prisma.certificate.create({
        data: {
          scope: 'EVENT', userId, eventId, actionId: null, registrationId: null,
          certifiedMinutes: eligibility.attendedMinutes,
          attendancePercent: eligibility.attendancePercent,
          validationCode, filePath: relativeFilePath,
        },
        include: { user: { select: { id: true, name: true } }, event: true, action: true },
      });
      return { alreadyExisted: false, certificate: this.publicCertificate(created, created.user, created.action, created.event) };
    } catch (error) {
      if (fileCreated) await rm(absoluteFilePath, { force: true });
      if (getPrismaErrorCode(error) === 'P2002') {
        const concurrent = await this.prisma.certificate.findFirst({
          where: { eventId, userId, scope: 'EVENT' },
          include: { user: { select: { id: true, name: true } }, event: true, action: true },
        });
        if (concurrent && !concurrent.revokedAt) {
          return { alreadyExisted: true, certificate: this.publicCertificate(concurrent, concurrent.user, concurrent.action, concurrent.event) };
        }
      }
      throw error;
    }
  }

  /** Bounded manager preview; individual issuance remains explicit and auditable. */
  async listEventCandidates(eventId: string, requester: Requester) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, status: true, organizerId: true, minAttendancePercent: true },
    });
    if (!event) throw new NotFoundException('Evento não encontrado.');
    const manager = requester.role === UserRole.ADMIN ||
      ((requester.role === UserRole.ORGANIZADOR || requester.role === UserRole.PROFESSOR) && event.organizerId === requester.id);
    if (!requester.id || !manager) throw new ForbiddenException('Sem permissão para consultar participantes do evento.');

    const registrations = await this.prisma.registration.findMany({
      where: { action: { eventId } },
      orderBy: { createdAt: 'asc' },
      take: 5001,
      select: {
        userId: true,
        user: { select: { name: true, email: true } },
        status: true,
        presence: { select: { id: true } },
        action: { select: { id: true, status: true, durationMinutes: true } },
      },
    });
    if (registrations.length > 5000) {
      throw new BadRequestException('O evento excede 5.000 inscrições. Utilize relatórios com filtros; a emissão em lote foi bloqueada para evitar avaliação parcial.');
    }
    const byUser = new Map<string, typeof registrations>();
    for (const row of registrations) {
      if (!byUser.has(row.userId)) byUser.set(row.userId, []);
      byUser.get(row.userId)!.push(row);
    }
    const users = [];
    for (const [userId, rows] of byUser) {
      const attendance = calculateEventAttendance(rows);
      users.push({
        userId, name: rows[0].user.name, email: rows[0].user.email,
        ...attendance,
        eligible: event.status === EventStatus.ENCERRADO &&
          Number.isInteger(event.minAttendancePercent) &&
          event.minAttendancePercent >= 0 && event.minAttendancePercent <= 100 &&
          attendance.enrolledMinutes > 0 && attendance.attendancePercent >= event.minAttendancePercent,
      });
    }
    return { event: { id: event.id, title: event.title, status: event.status },
      minAttendancePercent: event.minAttendancePercent,
      totalParticipants: users.length, candidates: users };
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
        scope: certificate.scope ?? 'ACTION',
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

  private async assertCanAccess(
    certificate: CertificateAccessRecord,
    requester: Requester,
  ): Promise<void> {
    if (!requester.id) throw new ForbiddenException('Usuário autenticado sem identificador.');

    const isAdmin = requester.role === UserRole.ADMIN;
    const isEventOrganizer =
      (requester.role === UserRole.ORGANIZADOR || requester.role === UserRole.PROFESSOR) && certificate.event?.organizerId === requester.id;
    const isOwner = certificate.userId === requester.id;

    if (!isAdmin && !isEventOrganizer && !isOwner) {
      throw new ForbiddenException('Você não tem acesso a este certificado.');
    }
  }

  private getVerificationUrl(code: string): string {
    return buildCertificateVerificationUrl(code);
  }

  private publicCertificate(
    certificate: CertificatePublicRecord,
    participant?: CertificateParticipantSummary | null,
    action?: CertificateActionSummary | null,
    event?: CertificateEventSummary | null,
  ) {
    const resolvedEvent = event ?? certificate.event;
    const resolvedAction = action ?? certificate.action;
    const resolvedParticipant = participant ?? certificate.user;

    return {
      id: certificate.id,
      scope: certificate.scope ?? 'ACTION',
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
