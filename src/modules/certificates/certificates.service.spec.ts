import { jest } from '@jest/globals';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ActionStatus, EventStatus } from '../../generated/prisma/client';
import { CertificatesService } from './certificates.service';

describe('CertificatesService', () => {
  const prisma: any = {
    event: { findUnique: jest.fn() },
    registration: { findMany: jest.fn() },
    certificate: { findUnique: jest.fn(), create: jest.fn() },
  };

  let service: CertificatesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CertificatesService(prisma);
    jest.spyOn(service as any, 'generatePdf').mockResolvedValue(undefined);
  });

  const event = {
    id: 'event-1',
    title: 'Evento Teste',
    description: 'DescriÃƒÂ§ÃƒÂ£o',
    location: 'AuditÃƒÂ³rio',
    startDate: new Date('2026-10-01T08:00:00Z'),
    endDate: new Date('2026-10-01T18:00:00Z'),
    status: EventStatus.ENCERRADO,
    minAttendancePercent: 75,
  };

  const reg = (minutes: number, present: boolean) => ({
    id: `reg-${minutes}-${present}`,
    user: { id: 'user-1', name: 'Afonso', email: 'teste@example.com' },
    action: {
      id: `action-${minutes}`,
      title: 'AÃƒÂ§ÃƒÂ£o Teste',
      description: 'DescriÃƒÂ§ÃƒÂ£o',
      startDate: event.startDate,
      endDate: event.endDate,
      durationMinutes: minutes,
      capacity: 100,
      status: ActionStatus.ENCERRADA,
      eventId: 'event-1',
      location: 'AuditÃƒÂ³rio',
      createdAt: new Date(),
      updatedAt: new Date(),
      canceledAt: null,
      closedAt: new Date(),
    },
    presence: present ? { id: 'p1', registrationId: 'r1', responsibleId: 'r2', registeredAt: new Date(), createdAt: new Date(), updatedAt: new Date() } : null,
  });

  it('emite certificado com presenÃƒÂ§a suficiente', async () => {
    prisma.event.findUnique.mockResolvedValue(event);
    prisma.certificate.findUnique.mockResolvedValue(null);
    prisma.registration.findMany.mockResolvedValue([reg(60, true), reg(60, true)]);
    prisma.certificate.create.mockResolvedValue({
      id: 'cert-1',
      userId: 'user-1',
      eventId: 'event-1',
      validationCode: 'SIGE-ABC',
      certifiedMinutes: 120,
      attendancePercent: 100,
      issuedAt: new Date(),
      filePath: 'storage/certificates/SIGE-ABC.pdf',
      user: { id: 'user-1', name: 'Afonso', email: 'teste@example.com' },
      event,
    });

    const result = await service.issueForUser('event-1', 'user-1');
    expect(result.alreadyExisted).toBe(false);
    expect(result.certificate.certifiedMinutes).toBe(120);
    expect(result.certificate.attendancePercent).toBe(100);
  });

  it('bloqueia presenÃƒÂ§a abaixo do mÃƒÂ­nimo', async () => {
    prisma.event.findUnique.mockResolvedValue(event);
    prisma.certificate.findUnique.mockResolvedValue(null);
    prisma.registration.findMany.mockResolvedValue([reg(60, true), reg(60, false)]);

    await expect(service.issueForUser('event-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });

  it('retorna certificado existente sem duplicar', async () => {
    prisma.event.findUnique.mockResolvedValue(event);
    prisma.certificate.findUnique.mockResolvedValue({
      id: 'cert-1',
      userId: 'user-1',
      eventId: 'event-1',
      validationCode: 'SIGE-ABC',
      certifiedMinutes: 60,
      attendancePercent: 100,
      issuedAt: new Date(),
      filePath: 'storage/certificates/SIGE-ABC.pdf',
      user: { id: 'user-1', name: 'Afonso', email: 'teste@example.com' },
      event,
    });

    const result = await service.issueForUser('event-1', 'user-1');
    expect(result.alreadyExisted).toBe(true);
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });

  it('bloqueia outro usuÃƒÂ¡rio de consultar certificado', async () => {
    prisma.certificate.findUnique.mockResolvedValue({
      id: 'cert-1',
      userId: 'owner',
      validationCode: 'SIGE-ABC',
      certifiedMinutes: 60,
      attendancePercent: 100,
      issuedAt: new Date(),
      filePath: 'storage/certificates/SIGE-ABC.pdf',
      user: { id: 'owner', name: 'Owner', email: 'owner@example.com' },
      event,
    });

    await expect(service.findById('cert-1', { id: 'other' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('valida cÃƒÂ³digo existente', async () => {
    prisma.certificate.findUnique.mockResolvedValue({
      id: 'cert-1',
      validationCode: 'SIGE-ABC',
      certifiedMinutes: 120,
      attendancePercent: 100,
      issuedAt: new Date(),
      user: { name: 'Afonso' },
      event: {
        id: 'event-1',
        title: 'Evento Teste',
        location: 'AuditÃƒÂ³rio',
        startDate: event.startDate,
        endDate: event.endDate,
      },
    });

    const result = await service.validateCode('sige-abc');
    expect(result.valid).toBe(true);
    expect(result.certificate?.certifiedHours).toBe(2);
  });

  it('invalida cÃƒÂ³digo inexistente', async () => {
    prisma.certificate.findUnique.mockResolvedValue(null);
    const result = await service.validateCode('SIGE-NAO-EXISTE');
    expect(result.valid).toBe(false);
  });
});
