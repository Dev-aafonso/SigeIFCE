import { describe, expect, it, jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { DashboardService } from '../dashboard.service';

describe('DashboardService', () => {
  const service = new DashboardService({} as PrismaService);

  it('rejects a profile without administrative dashboard access', async () => {
    await expect(
      service.getOverview({ id: 'user-1', role: UserRole.ALUNO }, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an inverted date interval before querying the database', async () => {
    await expect(
      service.getOverview(
        { id: 'admin-1', role: UserRole.ADMIN },
        { startDateFrom: '2026-10-10', startDateTo: '2026-10-01' },
      ),
    ).rejects.toThrow('A data inicial deve ser anterior ou igual à data final.');
  });

  it('scopes the overview to the organizer and aggregates unique participants by month', async () => {
    const now = new Date();
    const prisma = {
      event: { findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'e1', title: 'Evento', totalCapacity: null, actions: [{ capacity: 10, _count: { registrations: 2 } }] }]) },
      registration: { findMany: jest.fn().mockResolvedValueOnce([{ userId: 'u1', createdAt: now }, { userId: 'u1', createdAt: now }]).mockResolvedValueOnce([]) },
      presence: { findMany: jest.fn().mockResolvedValueOnce([{ registeredAt: now, registration: { userId: 'u1' } }]).mockResolvedValueOnce([]) },
    };
    const dashboard = new DashboardService(prisma as unknown as PrismaService);
    const result = await dashboard.getSummary({ id: 'organizer-1', role: UserRole.ORGANIZADOR });
    expect(prisma.event.findMany.mock.calls[0][0].where.organizerId).toBe('organizer-1');
    expect(result.events[0]).toMatchObject({ capacity: 10, registrations: 2 });
    expect(result.trend.at(-1)).toMatchObject({ registrations: 1, presences: 1 });
  });
});
