import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../generated/prisma/client';
import { PresenceService, PresencePrincipal } from './presence.service';

describe('PresenceService — autorização e integridade', () => {
  const prisma = {
    action: { findUnique: jest.fn() },
    registration: { findUnique: jest.fn(), findMany: jest.fn() },
    presence: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    $queryRaw: jest.fn(async () => [{ id: 'registration-1' }]),
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
  };

  let service: PresenceService;

  const admin: PresencePrincipal = { id: 'admin-1', role: UserRole.ADMIN };
  const organizer: PresencePrincipal = { id: 'organizer-1', role: UserRole.ORGANIZADOR };
  const student: PresencePrincipal = { id: 'student-1', role: UserRole.ALUNO };

  const action = (organizerId = 'organizer-1') => ({
    id: 'action-1',
    event: { organizerId },
  });

  const registration = (overrides: Record<string, unknown> = {}) => ({
    id: 'registration-1',
    actionId: 'action-1',
    status: 'ACTIVE',
    action: { startDate: new Date('2020-01-01T00:00:00Z'), event: { organizerId: 'organizer-1' } },
    presence: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PresenceService(prisma);
  });

  it('nega registro de presença a ALUNO antes de consultar inscrição', async () => {
    await expect(
      service.create({ registrationId: 'registration-1' }, student),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.registration.findUnique).not.toHaveBeenCalled();
    expect(prisma.presence.create).not.toHaveBeenCalled();
  });

  it('nega consulta de participantes a ALUNO antes de consultar ação', async () => {
    await expect(
      service.findParticipantsByAction('action-1', student),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.action.findUnique).not.toHaveBeenCalled();
    expect(prisma.registration.findMany).not.toHaveBeenCalled();
  });

  it('nega consulta de presença por inscrição a ALUNO', async () => {
    await expect(
      service.findByRegistration('registration-1', student),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.registration.findUnique).not.toHaveBeenCalled();
  });

  it('impede organizador de consultar ação de outro organizador', async () => {
    prisma.action.findUnique.mockResolvedValue(action('organizer-2'));

    await expect(
      service.findParticipantsByAction('action-1', organizer),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.registration.findMany).not.toHaveBeenCalled();
  });

  it('permite ao organizador consultar participantes da própria ação', async () => {
    prisma.action.findUnique.mockResolvedValue(action('organizer-1'));
    prisma.registration.findMany.mockResolvedValue([]);

    await expect(
      service.findParticipantsByAction('action-1', organizer),
    ).resolves.toEqual([]);

    expect(prisma.registration.findMany).toHaveBeenCalledWith({
      where: { actionId: 'action-1', status: 'ACTIVE' },
      include: {
        user: { select: { id: true, name: true, email: true, enrollmentNumber: true, course: true, campus: true, role: true, isActive: true } },
        presence: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('permite professor na própria ação e impede acesso à ação de outro responsável', async () => {
    const professor: PresencePrincipal = { id: 'professor-1', role: UserRole.PROFESSOR };
    prisma.action.findUnique.mockResolvedValue(action('professor-1'));
    prisma.registration.findMany.mockResolvedValue([]);
    await expect(service.findParticipantsByAction('action-1', professor)).resolves.toEqual([]);
    prisma.action.findUnique.mockResolvedValue(action('outro'));
    await expect(service.findParticipantsByAction('action-1', professor)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite ADMIN consultar ação de qualquer organizador', async () => {
    prisma.action.findUnique.mockResolvedValue(action('organizer-2'));
    prisma.registration.findMany.mockResolvedValue([]);

    await expect(
      service.findParticipantsByAction('action-1', admin),
    ).resolves.toEqual([]);

    expect(prisma.registration.findMany).toHaveBeenCalledTimes(1);
  });

  it('retorna 404 lógico quando a ação consultada não existe', async () => {
    prisma.action.findUnique.mockResolvedValue(null);

    await expect(
      service.findParticipantsByAction('missing-action', admin),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.registration.findMany).not.toHaveBeenCalled();
  });

  it('nega registro para inscrição inexistente', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);
    prisma.registration.findUnique.mockResolvedValue(null);

    await expect(
      service.create({ registrationId: 'missing-registration' }, admin),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.presence.create).not.toHaveBeenCalled();
  });

  it('nega registro quando a inscrição não está ativa', async () => {
    prisma.registration.findUnique.mockResolvedValue(
      registration({ status: 'CANCELLED' }),
    );

    await expect(
      service.create({ registrationId: 'registration-1' }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.presence.create).not.toHaveBeenCalled();
  });

  it('impede registrar novamente uma presença existente', async () => {
    prisma.registration.findUnique.mockResolvedValue(
      registration({ presence: { id: 'presence-1' } }),
    );

    await expect(
      service.create({ registrationId: 'registration-1' }, admin),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.presence.create).not.toHaveBeenCalled();
  });

  it('registra o responsável autenticado, não um ID informado pelo cliente', async () => {
    prisma.registration.findUnique.mockResolvedValue(registration());
    prisma.presence.create.mockResolvedValue({ id: 'presence-1' });

    await service.create({ registrationId: 'registration-1' }, admin);

    expect(prisma.presence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          registrationId: 'registration-1',
          responsibleId: admin.id,
        },
      }),
    );
  });

  it.each([admin, organizer])('rejeita presenca antecipada para $role', async (requester) => {
    prisma.registration.findUnique.mockResolvedValue(registration({
      action: { startDate: new Date(Date.now() + 48 * 3600000), event: { organizerId: organizer.id } },
    }));
    await expect(service.create({ registrationId: 'registration-1' }, requester))
      .rejects.toThrow('a partir do inicio da acao');
    expect(prisma.presence.create).not.toHaveBeenCalled();
  });

  it('aceita exatamente no inicio e preserva lancamento retroativo', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-27T12:00:00Z'));
    try {
      for (const startDate of [new Date(), new Date('2020-01-01T00:00:00Z')]) {
        prisma.registration.findUnique.mockResolvedValue(registration({
          action: { startDate, event: { organizerId: organizer.id } },
        }));
        await service.create({ registrationId: 'registration-1' }, admin);
      }
      expect(prisma.presence.create).toHaveBeenCalledTimes(2);
    } finally { jest.useRealTimers(); }
  });

  it('rele o cancelamento vencedor depois do lock e nao grava presenca', async () => {
    prisma.registration.findUnique.mockResolvedValue(registration({ status: 'CANCELLED' }));
    await expect(service.create({ registrationId: 'registration-1' }, admin))
      .rejects.toThrow('A inscricao nao esta ativa.');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.registration.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.presence.create).not.toHaveBeenCalled();
  });
});
