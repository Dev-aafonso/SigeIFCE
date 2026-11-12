import { jest } from '@jest/globals';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ActionStatus, EventStatus, RegistrationStatus, UserRole } from '../../generated/prisma/client';
import { CertificatesService } from './certificates.service';

describe('Certificados consolidados (3B)', () => {
  const event = { id: 'event-1', title: 'Semana da Computação', status: EventStatus.ENCERRADO, organizerId: 'manager-1', minAttendancePercent: 75, startDate: new Date('2026-01-01'), endDate: new Date('2026-01-02') };
  const prisma = {
    event: { findUnique: jest.fn() }, user: { findUnique: jest.fn() },
    registration: { findMany: jest.fn() },
    certificate: { findFirst: jest.fn(), create: jest.fn() },
  };
  const pdf = { generate: jest.fn() };
  const service = new CertificatesService(prisma as never, pdf as never);
  let root = ''; let oldCwd = '';
  beforeEach(async () => {
    oldCwd = process.cwd();root = await mkdtemp(join(tmpdir(), 'sige-event-cert-'));process.chdir(root);
    prisma.event.findUnique.mockReset().mockResolvedValue(event as never);
    prisma.user.findUnique.mockReset().mockResolvedValue({ id: 'user-1', name: 'Aluno de Teste' } as never);
    prisma.registration.findMany.mockReset().mockResolvedValue([
      { status: RegistrationStatus.ACTIVE, action: { id: 'action-1', status: ActionStatus.ENCERRADA, durationMinutes: 120 }, presence: { id: 'presence-1' } },
      { status: RegistrationStatus.ACTIVE, action: { id: 'action-2', status: ActionStatus.ENCERRADA, durationMinutes: 60 }, presence: { id: 'presence-2' } },
    ] as never);
    prisma.certificate.findFirst.mockReset().mockResolvedValue(null as never);
    prisma.certificate.create.mockReset().mockImplementation(async (args: never) => {
      const data = (args as { data: Record<string, unknown> }).data;
      return { id: 'cert-1', ...data, issuedAt: new Date(), revokedAt: null, user: { id: 'user-1', name: 'Aluno de Teste' }, event, action: null } as never;
    });
    pdf.generate.mockReset().mockResolvedValue(Buffer.from('%PDF-TEST') as never);
  });
  afterEach(async () => { process.chdir(oldCwd);await rm(root, { recursive: true, force: true }); });

  it('emite documento consolidado sem vínculo a ação ou inscrição', async () => {
    const result = await service.issueForEvent('event-1', { id: 'user-1', role: UserRole.ALUNO });
    expect(result.alreadyExisted).toBe(false);
    expect(result.certificate.scope).toBe('EVENT');
    expect(result.certificate.certifiedMinutes).toBe(180);
    expect(prisma.certificate.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ scope: 'EVENT', actionId: null, registrationId: null }) }));
    expect(pdf.generate).toHaveBeenCalledWith(expect.objectContaining({ scope: 'EVENT', eventTitle: event.title, attendancePercent: 100 }));
  });

  it('não emite antes do encerramento', async () => {
    prisma.event.findUnique.mockResolvedValue({ ...event, status: EventStatus.PUBLICADO } as never);
    await expect(service.issueForEvent('event-1', { id: 'user-1', role: UserRole.ALUNO })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });

  it('impede emissão de certificado de terceiro para aluno', async () => {
    await expect(service.issueForEvent('event-1', { id: 'user-2', role: UserRole.ALUNO }, 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });

  it('retorna documento existente, sem emitir outro PDF', async () => {
    prisma.certificate.findFirst.mockResolvedValue({ id: 'cert-1', userId: 'user-1', eventId: 'event-1', scope: 'EVENT', validationCode: 'SIGE-123', certifiedMinutes: 180, attendancePercent: 100, issuedAt: new Date(), revokedAt: null, user: { id: 'user-1', name: 'Aluno de Teste' }, event, action: null } as never);
    const result = await service.issueForEvent('event-1', { id: 'user-1', role: UserRole.ALUNO });
    expect(result.alreadyExisted).toBe(true);
    expect(pdf.generate).not.toHaveBeenCalled();
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });
});
