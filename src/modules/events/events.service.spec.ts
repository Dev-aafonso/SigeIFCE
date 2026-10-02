import {
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  EventStatus,
  UserRole,
} from '../../generated/prisma/enums';
import { EventsService } from './events.service';
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

describe('EventsService', () => {
  const prisma: any = {
    event: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    action: {
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const organizer = {
    sub: 'u1',
    role: UserRole.ORGANIZADOR,
  };

  const admin = {
    sub: 'admin1',
    role: UserRole.ADMIN,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cria evento como organizador', async () => {
    prisma.event.create.mockResolvedValue({
      id: 'e1',
      status: EventStatus.RASCUNHO,
    });

    const service =
      new EventsService(prisma);

    const result =
      await service.create(
        {
          title: 'Evento teste',
          description:
            'DescriÃ§Ã£o vÃ¡lida do evento',
          startDate:
            '2026-10-20T08:00:00.000Z',
          endDate:
            '2026-10-20T18:00:00.000Z',
        },
        organizer,
      );

    expect(result.status).toBe(
      EventStatus.RASCUNHO,
    );

    expect(
      prisma.event.create,
    ).toHaveBeenCalled();
  });

  it('bloqueia professor no gerenciamento', async () => {
    const service =
      new EventsService(prisma);

    await expect(
      service.create(
        {
          title: 'Evento teste',
          description:
            'DescriÃ§Ã£o vÃ¡lida do evento',
          startDate:
            '2026-10-20T08:00:00.000Z',
          endDate:
            '2026-10-20T18:00:00.000Z',
        },
        {
          sub: 'u2',
          role: UserRole.PROFESSOR,
        },
      ),
    ).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('permite ADMIN editar evento de outro organizador', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'e1',
      organizerId: 'owner',
      status: EventStatus.RASCUNHO,
      startDate:
        new Date('2026-10-20T08:00:00Z'),
      endDate:
        new Date('2026-10-20T18:00:00Z'),
      organizer: {},
      actions: [],
    });

    prisma.event.update.mockResolvedValue({
      id: 'e1',
      title: 'Novo',
    });

    const service =
      new EventsService(prisma);

    await service.update(
      'e1',
      {
        title: 'Novo',
      },
      admin,
    );

    expect(
      prisma.event.update,
    ).toHaveBeenCalled();
  });

  it('bloqueia ediÃ§Ã£o de evento encerrado', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'e1',
      organizerId: 'u1',
      status: EventStatus.ENCERRADO,
      startDate:
        new Date('2026-10-20T08:00:00Z'),
      endDate:
        new Date('2026-10-20T18:00:00Z'),
      organizer: {},
      actions: [],
    });

    const service =
      new EventsService(prisma);

    await expect(
      service.update(
        'e1',
        {
          title: 'Novo',
        },
        organizer,
      ),
    ).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});