import { jest } from '@jest/globals';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ActionStatus,
  EventStatus,
  RegistrationStatus,
  UserRole,
} from '../../generated/prisma/client';
import { CertificatesService } from './certificates.service';

describe('CertificatesService (modelo por inscrição)', () => {
  const prisma = {
    registration: { findUnique: jest.fn() },
    certificate: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };
  const pdfService = { generate: jest.fn() };

  let service: CertificatesService;
  let currentRegistration: ReturnType<typeof makeRegistration> | undefined;
  let originalCwd = '';
  let tempRoot = '';

  const makeEvent = () => ({
    id: 'event-1',
    title: 'Evento de teste',
    description: 'Descrição do evento',
    location: 'Auditório',
    startDate: new Date('2026-10-01T08:00:00.000Z'),
    endDate: new Date('2026-10-01T18:00:00.000Z'),
    status: EventStatus.ENCERRADO,
    organizerId: 'organizer-1',
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
  });

  const makeRegistration = (overrides: object = {}) => {
    const event = makeEvent();
    const action = {
      id: 'action-1',
      eventId: event.id,
      title: 'Oficina de teste',
      description: 'Descrição da oficina',
      startDate: new Date('2026-10-01T08:00:00.000Z'),
      endDate: new Date('2026-10-01T10:00:00.000Z'),
      durationMinutes: 120,
      capacity: 30,
      location: 'Sala 1',
      status: ActionStatus.ENCERRADA,
      createdAt: new Date('2026-09-01T10:00:00.000Z'),
      updatedAt: new Date('2026-09-01T10:00:00.000Z'),
      canceledAt: null,
      closedAt: new Date('2026-10-01T10:00:00.000Z'),
      event,
    };
    return {
      id: 'registration-1',
      userId: 'user-1',
      actionId: action.id,
      status: RegistrationStatus.ACTIVE,
      createdAt: new Date('2026-09-20T12:00:00.000Z'),
      updatedAt: new Date('2026-09-20T12:00:00.000Z'),
      cancelledAt: null,
      user: { id: 'user-1', name: 'Participante Teste', email: 'participant@example.com' },
      action,
      presence: {
        id: 'presence-1',
        registrationId: 'registration-1',
        responsibleId: 'organizer-1',
        registeredAt: new Date('2026-10-01T10:05:00.000Z'),
        createdAt: new Date('2026-10-01T10:05:00.000Z'),
        updatedAt: new Date('2026-10-01T10:05:00.000Z'),
      },
      certificate: null,
      ...overrides,
    };
  };

  const makeCertificateRecord = (overrides: object = {}) => {
    const registration = currentRegistration ?? makeRegistration();
    return {
      id: 'certificate-1',
      userId: registration.userId,
      eventId: registration.action.event.id,
      actionId: registration.action.id,
      registrationId: registration.id,
      validationCode: 'SIGE-ABC123',
      certifiedMinutes: registration.action.durationMinutes,
      attendancePercent: 100,
      issuedAt: new Date('2026-10-02T12:00:00.000Z'),
      filePath: 'storage/certificates/SIGE-ABC123.pdf',
      revokedAt: null,
      user: registration.user,
      event: registration.action.event,
      action: registration.action,
      registration,
      ...overrides,
    };
  };

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempRoot = await mkdtemp(join(tmpdir(), 'sige-certificates-spec-'));
    process.chdir(tempRoot);

    currentRegistration = makeRegistration();
    prisma.registration.findUnique.mockReset().mockImplementation(async () => currentRegistration);
    prisma.certificate.findUnique.mockReset();
    prisma.certificate.findMany.mockReset();
    prisma.certificate.create.mockReset().mockImplementation(async ({ data }: { data: object }) =>
      makeCertificateRecord({
        ...data,
        id: 'certificate-created-1',
        userId: data.userId,
        eventId: data.eventId,
        actionId: data.actionId,
        registrationId: data.registrationId,
        validationCode: data.validationCode,
        certifiedMinutes: data.certifiedMinutes,
        attendancePercent: data.attendancePercent,
        filePath: data.filePath,
        issuedAt: new Date(),
        revokedAt: null,
      }),
    );
    pdfService.generate.mockReset().mockResolvedValue(Buffer.from('%PDF-test', 'ascii'));
    service = new CertificatesService(prisma, pdfService);
  });

  afterEach(async () => {
    if (originalCwd) process.chdir(originalCwd);
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
    tempRoot = '';
  });

  it('emite certificado para inscrição ativa com presença e ação encerrada', async () => {
    const result = await service.issueForRegistration('registration-1', {
      id: 'user-1',
      role: UserRole.ALUNO,
    });

    expect(result.alreadyExisted).toBe(false);
    expect(result.certificate.certifiedMinutes).toBe(120);
    expect(result.certificate.attendancePercent).toBe(100);
    expect(result.certificate.participant).toEqual({ id: 'user-1', name: 'Participante Teste' });
    expect(pdfService.generate).toHaveBeenCalledWith(expect.objectContaining({
      participantName: 'Participante Teste',
      eventTitle: 'Evento de teste',
      actionTitle: 'Oficina de teste',
      certifiedMinutes: 120,
    }));
    expect(prisma.certificate.create).toHaveBeenCalledTimes(1);
  });

  it('impede emissão quando não há presença registrada', async () => {
    currentRegistration = makeRegistration({ presence: null });

    await expect(service.issueForRegistration('registration-1', {
      id: 'user-1',
      role: UserRole.ALUNO,
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(pdfService.generate).not.toHaveBeenCalled();
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });

  it('nega emissão para usuário que não é dono nem gestor autorizado', async () => {
    await expect(service.issueForRegistration('registration-1', {
      id: 'someone-else',
      role: UserRole.ALUNO,
    })).rejects.toBeInstanceOf(ForbiddenException);

    expect(pdfService.generate).not.toHaveBeenCalled();
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });

  it('retorna certificado existente sem gerar arquivo duplicado', async () => {
    currentRegistration = makeRegistration({ certificate: makeCertificateRecord() });

    const result = await service.issueForRegistration('registration-1', {
      id: 'user-1',
      role: UserRole.ALUNO,
    });

    expect(result.alreadyExisted).toBe(true);
    expect(result.certificate.validationCode).toBe('SIGE-ABC123');
    expect(pdfService.generate).not.toHaveBeenCalled();
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });

  it('retorna 404 lógico quando a inscrição não existe', async () => {
    prisma.registration.findUnique.mockResolvedValue(null);

    await expect(service.issueForRegistration('missing-registration', {
      id: 'user-1',
      role: UserRole.ALUNO,
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('impede outro usuário de consultar certificado privado', async () => {
    prisma.certificate.findUnique.mockResolvedValue(makeCertificateRecord({ userId: 'owner-id' }));

    await expect(service.findOneForRequester('certificate-1', {
      id: 'different-user',
      role: UserRole.ALUNO,
    })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite ao dono consultar seu certificado', async () => {
    prisma.certificate.findUnique.mockResolvedValue(makeCertificateRecord());

    const result = await service.findOneForRequester('certificate-1', {
      id: 'user-1',
      role: UserRole.ALUNO,
    });

    expect(result.id).toBe('certificate-1');
    expect(result.participant?.name).toBe('Participante Teste');
  });

  it('valida código existente sem diferenciar maiúsculas/minúsculas', async () => {
    prisma.certificate.findUnique.mockResolvedValue(makeCertificateRecord());

    const result = await service.validateCode('sige-abc123');

    expect(prisma.certificate.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { validationCode: 'SIGE-ABC123' },
    }));
    expect(result.valid).toBe(true);
    expect(result.certificate?.certifiedHours).toBe(2);
  });

  it('informa código inexistente como inválido', async () => {
    prisma.certificate.findUnique.mockResolvedValue(null);

    const result = await service.validateCode('SIGE-INEXISTENTE');

    expect(result.valid).toBe(false);
  });

  it('informa certificado revogado como inválido', async () => {
    prisma.certificate.findUnique.mockResolvedValue(makeCertificateRecord({ revokedAt: new Date() }));

    const result = await service.validateCode('SIGE-ABC123');

    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/revogado/i);
  });
});
