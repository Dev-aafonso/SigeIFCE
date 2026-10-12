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
  const prisma: any = {
    action: { findUnique: jest.fn() },
    registration: { findUnique: jest.fn(), findMany: jest.fn() },
    presence: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
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
    action: { event: { organizerId: 'organizer-1' } },
    presence: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PresenceService(prisma);
  });

  it('nega registro de presença a ALUNO antes de consultar inscrição', async () => {
    await expect(
      service.create({ registrationId: 'registration-1' } as any, student),
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
        user: { select: { id: true, name: true, email: true } },
        presence: true,
      },
    });
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
    prisma.registration.findUnique.mockResolvedValue(null);

    await expect(
      service.create({ registrationId: 'missing-registration' } as any, admin),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.presence.create).not.toHaveBeenCalled();
  });

  it('nega registro quando a inscrição não está ativa', async () => {
    prisma.registration.findUnique.mockResolvedValue(
      registration({ status: 'CANCELLED' }),
    );

    await expect(
      service.create({ registrationId: 'registration-1' } as any, admin),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.presence.create).not.toHaveBeenCalled();
  });

  it('impede registrar novamente uma presença existente', async () => {
    prisma.registration.findUnique.mockResolvedValue(
      registration({ presence: { id: 'presence-1' } }),
    );

    await expect(
      service.create({ registrationId: 'registration-1' } as any, admin),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.presence.create).not.toHaveBeenCalled();
  });

  it('registra o responsável autenticado, não um ID informado pelo cliente', async () => {
    prisma.registration.findUnique.mockResolvedValue(registration());
    prisma.presence.create.mockResolvedValue({ id: 'presence-1' });

    await service.create({ registrationId: 'registration-1' } as any, admin);

    expect(prisma.presence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          registrationId: 'registration-1',
          responsibleId: admin.id,
        },
      }),
    );
  });
});
