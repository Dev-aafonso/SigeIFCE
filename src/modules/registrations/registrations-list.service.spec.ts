import { beforeEach, describe, expect, it } from '@jest/globals';
import { RegistrationStatus } from '../../generated/prisma/client';
import { RegistrationsService } from './registrations.service';
import { RegistrationQueryDto } from './dto/registration-query.dto';

/** Isola a consulta para comprovar filtros e ausência de vazamento entre usuários. */
describe('RegistrationsService.listMine', () => {
  let service: RegistrationsService;
  let dataWhere: unknown;
  let countWhere: unknown;
  let dataSkip: unknown;
  let dataTake: unknown;
  const row = {
    id: 'r1', actionId: 'action-1', status: RegistrationStatus.ACTIVE,
    action: {
      id: 'action-1', title: 'Palestra', startDate: new Date('2026-11-01T15:00:00Z'),
      event: { id: 'event-1', title: 'Semana acadêmica' },
    },
  };

  const prismaMock = {
    registration: {
      findMany: async (args: Record<string, unknown>) => {
        if ('take' in args) {
          dataWhere = args.where;
          dataSkip = args.skip;
          dataTake = args.take;
          return [row];
        }
        return [{ action: { event: { id: 'event-1', title: 'Semana acadêmica' } } }];
      },
      count: async (args: Record<string, unknown>) => {
        countWhere = args.where;
        return 1;
      },
      groupBy: async () => [
        { status: RegistrationStatus.ACTIVE, _count: { _all: 3 } },
        { status: RegistrationStatus.CANCELLED, _count: { _all: 2 } },
      ],
    },
  };

  beforeEach(() => {
    dataWhere = undefined;
    countWhere = undefined;
    dataSkip = undefined;
    dataTake = undefined;
    service = new RegistrationsService(prismaMock as never);
  });

  it('retorna somente as inscrições do titular, com resumo e eventos', async () => {
    const result = await service.listMine('user-1', new RegistrationQueryDto());
    expect(dataWhere).toEqual({ userId: 'user-1' });
    expect(countWhere).toEqual({ userId: 'user-1' });
    expect(result).toMatchObject({
      total: 1, page: 1, limit: 10, pages: 1,
      summary: { active: 3, cancelled: 2, total: 5 },
      events: [{ id: 'event-1', title: 'Semana acadêmica' }],
    });
    expect(result.data).toHaveLength(1);
  });

  it('aplica paginação, evento, status e busca no mesmo escopo do usuário', async () => {
    const result = await service.listMine('user-2', {
      page: 3, limit: 5, eventId: 'event-1',
      status: RegistrationStatus.CANCELLED, search: ' oficina ',
    });
    expect(dataSkip).toBe(10);
    expect(dataTake).toBe(5);
    expect(result.page).toBe(3);
    expect(dataWhere).toMatchObject({
      userId: 'user-2', status: RegistrationStatus.CANCELLED,
      action: { eventId: 'event-1' },
    });
    expect(dataWhere).toHaveProperty('AND');
    expect(countWhere).toEqual(dataWhere);
  });

  it('não executa consultas para usuário ausente', async () => {
    await expect(service.listMine('', new RegistrationQueryDto()))
      .rejects.toThrow('Usuário autenticado não identificado.');
    expect(dataWhere).toBeUndefined();
  });
});
