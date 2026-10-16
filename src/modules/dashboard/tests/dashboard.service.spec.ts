import { describe, expect, it } from '@jest/globals';
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
});
