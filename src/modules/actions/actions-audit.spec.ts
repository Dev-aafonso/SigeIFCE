import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ActionStatus, EventStatus, UserRole } from '../../generated/prisma/enums';
import { ActionsService } from './actions.service';

const manager = { sub: 'org-1', role: UserRole.ORGANIZADOR };
const startDate = new Date('2099-01-01T09:00:00Z');
const endDate = new Date('2099-01-01T10:00:00Z');
const event = {
  id: 'event-1', organizerId: 'org-1', status: EventStatus.PUBLICADO,
  startDate: new Date('2099-01-01T08:00:00Z'),
  endDate: new Date('2099-01-01T18:00:00Z'),
};

describe('Auditoria ERS: capacidade de acoes', () => {
  const tx = {
    $queryRaw: jest.fn(),
    action: { findUnique: jest.fn(), update: jest.fn() },
    registration: { count: jest.fn() },
  };
  const db = {
    action: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    db.action.findUnique.mockResolvedValue({
      id: 'action-1', status: ActionStatus.ATIVA, startDate,
      endDate, durationMinutes: 60, capacity: 10, event,
    } as never);
    tx.$queryRaw.mockResolvedValue([{ id: 'action-1' }] as never);
    tx.action.findUnique.mockResolvedValue({
      status: ActionStatus.ATIVA, event,
    } as never);
    tx.registration.count.mockResolvedValue(6 as never);
    tx.action.update.mockResolvedValue({ id: 'action-1', capacity: 6 } as never);
    db.$transaction.mockImplementation((async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) as never);
  });

  it('recusa diminuir capacidade abaixo de inscricoes ativas', async () => {
    const service = new ActionsService(db as never);
    await expect(service.update('action-1', { capacity: 5 }, manager))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.action.update).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('aceita capacidade igual a ocupacao atual', async () => {
    const service = new ActionsService(db as never);
    const result = await service.update('action-1', { capacity: 6 }, manager);
    expect(result.capacity).toBe(6);
    expect(tx.action.update).toHaveBeenCalledTimes(1);
  });

  it('nao encerra acao antes de sua data de fim', async () => {
    const service = new ActionsService(db as never);
    await expect(service.close('action-1', manager))
      .rejects.toBeInstanceOf(ConflictException);
    expect(db.action.update).not.toHaveBeenCalled();
  });
});
