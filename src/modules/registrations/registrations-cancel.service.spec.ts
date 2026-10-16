import { beforeEach, describe, expect, it } from '@jest/globals';
import { ActionStatus, RegistrationStatus } from '../../generated/prisma/client';
import { RegistrationsService } from './registrations.service';

type RegistrationFixture = {
  id: string;
  userId: string;
  actionId: string;
  status: RegistrationStatus;
  createdAt: Date;
  updatedAt: Date;
  action: { id: string; status: ActionStatus; startDate: Date };
  presence: { id: string } | null;
  certificate: { id: string } | null;
};

describe('RegistrationsService.cancelForAction', () => {
  let service: RegistrationsService;
  let registration: RegistrationFixture | null;
  let updateCalls: number;
  let updatedArgs: unknown;

  const prismaMock = {
    registration: {
      findUnique: async (_args: unknown) => registration,
      update: async (args: unknown) => {
        updateCalls += 1;
        updatedArgs = args;
        if (!registration) throw new Error('Fixture de inscricao ausente no teste.');
        return {
          id: registration.id,
          userId: registration.userId,
          actionId: registration.actionId,
          status: RegistrationStatus.CANCELLED,
          createdAt: registration.createdAt,
          updatedAt: new Date(),
          cancelledAt: new Date(),
        };
      },
    },
  };

  beforeEach(() => {
    registration = {
      id: 'registration-test-1',
      userId: 'user-test-1',
      actionId: 'action-test-1',
      status: RegistrationStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
      action: {
        id: 'action-test-1',
        status: ActionStatus.ATIVA,
        startDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      presence: null,
      certificate: null,
    };
    updateCalls = 0;
    updatedArgs = undefined;
    service = new RegistrationsService(prismaMock as never);
  });

  it('cancela uma inscricao ativa antes do inicio da acao', async () => {
    const result = await service.cancelForAction('user-test-1', 'action-test-1');
    expect(result).toMatchObject({
      id: 'registration-test-1',
      userId: 'user-test-1',
      actionId: 'action-test-1',
      status: RegistrationStatus.CANCELLED,
    });
    expect(updateCalls).toBe(1);
    expect(updatedArgs).toMatchObject({
      where: { id: 'registration-test-1' },
      data: { status: RegistrationStatus.CANCELLED },
    });
  });

  it('rejeita identificadores ausentes', async () => {
    await expect(service.cancelForAction('', 'action-test-1')).rejects.toThrow('Usuario e acao sao obrigatorios.');
    await expect(service.cancelForAction('user-test-1', '')).rejects.toThrow('Usuario e acao sao obrigatorios.');
    expect(updateCalls).toBe(0);
  });

  it('rejeita inscricao inexistente para o participante', async () => {
    registration = null;
    await expect(service.cancelForAction('user-test-1', 'action-test-1')).rejects.toThrow('Inscricao nao encontrada');
    expect(updateCalls).toBe(0);
  });

  it('rejeita inscricao ja cancelada', async () => {
    registration!.status = RegistrationStatus.CANCELLED;
    await expect(service.cancelForAction('user-test-1', 'action-test-1')).rejects.toThrow('A inscricao nao esta ativa.');
    expect(updateCalls).toBe(0);
  });

  it('rejeita acao encerrada ou cancelada', async () => {
    registration!.action.status = ActionStatus.ENCERRADA;
    await expect(service.cancelForAction('user-test-1', 'action-test-1')).rejects.toThrow('A acao nao esta disponivel para cancelamento.');
    expect(updateCalls).toBe(0);
  });

  it('rejeita cancelamento quando a acao ja comecou', async () => {
    registration!.action.startDate = new Date(Date.now() - 60_000);
    await expect(service.cancelForAction('user-test-1', 'action-test-1')).rejects.toThrow('Nao e possivel cancelar a inscricao apos o inicio da acao.');
    expect(updateCalls).toBe(0);
  });

  it('rejeita inscricao com presenca registrada', async () => {
    registration!.presence = { id: 'presence-test-1' };
    await expect(service.cancelForAction('user-test-1', 'action-test-1')).rejects.toThrow('Nao e possivel cancelar uma inscricao com presenca registrada.');
    expect(updateCalls).toBe(0);
  });

  it('rejeita inscricao com certificado emitido', async () => {
    registration!.certificate = { id: 'certificate-test-1' };
    await expect(service.cancelForAction('user-test-1', 'action-test-1')).rejects.toThrow('Nao e possivel cancelar uma inscricao com certificado emitido.');
    expect(updateCalls).toBe(0);
  });
});