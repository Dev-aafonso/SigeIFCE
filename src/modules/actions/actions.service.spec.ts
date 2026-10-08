import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  EventStatus,
  UserRole,
} from '../../generated/prisma/enums';
import { ActionsService } from './actions.service';
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

describe('ActionsService', () => {
  const prisma: any = {
    event: {
      findUnique: jest.fn(),
    },
    action: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const organizer = {
    sub: 'u1',
    role: UserRole.ORGANIZADOR,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('bloqueia aÃ§Ã£o fora do perÃ­odo do evento', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'e1',
      organizerId: 'u1',
      status: EventStatus.RASCUNHO,
      startDate:
        new Date('2026-10-20T08:00:00Z'),
      endDate:
        new Date('2026-10-20T18:00:00Z'),
    });

    const service =
      new ActionsService(prisma);

    await expect(
      service.create(
        'e1',
        {
          title: 'Palestra',
          description: 'DescriÃ§Ã£o',
          startDate:
            '2026-10-20T07:00:00Z',
          endDate:
            '2026-10-20T08:00:00Z',
          durationMinutes: 60,
          capacity: 100,
        },
        organizer,
      ),
    ).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('bloqueia organizador em evento de outro usuÃ¡rio', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'e1',
      organizerId: 'outro',
      status: EventStatus.RASCUNHO,
      startDate:
        new Date('2026-10-20T08:00:00Z'),
      endDate:
        new Date('2026-10-20T18:00:00Z'),
    });

    const service =
      new ActionsService(prisma);

    await expect(
      service.create(
        'e1',
        {
          title: 'Palestra',
          description: 'DescriÃ§Ã£o',
          startDate:
            '2026-10-20T09:00:00Z',
          endDate:
            '2026-10-20T10:00:00Z',
          durationMinutes: 60,
          capacity: 100,
        },
        organizer,
      ),
    ).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});