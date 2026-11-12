import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ActionStatus, EventStatus, UserRole } from '../../generated/prisma/enums';
import { EventsService } from './events.service';

const organizer = { sub: 'org-1', role: UserRole.ORGANIZADOR };
const oldDate = new Date('2020-01-01T18:00:00.000Z');
const futureDate = new Date('2099-01-01T18:00:00.000Z');

describe('Auditoria ERS: integridade de eventos', () => {
  const db = {
    $queryRaw: async () => [],
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(db),
    event: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(() => jest.clearAllMocks());

  it('impede encerramento antes do fim do evento', async () => {
    db.event.findUnique.mockResolvedValue({
      id: 'event-1', organizerId: 'org-1', status: EventStatus.PUBLICADO,
      endDate: futureDate, actions: [],
    } as never);
    const service = new EventsService(db as never);
    await expect(service.close('event-1', organizer))
      .rejects.toBeInstanceOf(ConflictException);
    expect(db.event.update).not.toHaveBeenCalled();
  });

  it('permite encerrar evento publicado depois do seu fim', async () => {
    db.event.findUnique.mockResolvedValue({
      id: 'event-1', organizerId: 'org-1', status: EventStatus.PUBLICADO,
      endDate: oldDate, actions: [],
    } as never);
    db.event.update.mockResolvedValue({ status: EventStatus.ENCERRADO } as never);
    const service = new EventsService(db as never);
    const result = await service.close('event-1', organizer);
    expect(result.status).toBe(EventStatus.ENCERRADO);
  });

  it('impede alteracao de datas que exclua uma acao existente', async () => {
    db.event.findUnique.mockResolvedValue({
      id: 'event-1', organizerId: 'org-1', status: EventStatus.RASCUNHO,
      startDate: new Date('2099-01-01T08:00:00Z'),
      endDate: new Date('2099-01-01T18:00:00Z'),
      actions: [{
        status: ActionStatus.ATIVA,
        startDate: new Date('2099-01-01T09:00:00Z'),
        endDate: new Date('2099-01-01T10:00:00Z'),
      }],
    } as never);
    const service = new EventsService(db as never);
    await expect(service.update('event-1', {
      startDate: '2099-01-01T09:30:00Z',
    }, organizer)).rejects.toBeInstanceOf(ConflictException);
    expect(db.event.update).not.toHaveBeenCalled();
  });
});
