import { jest } from '@jest/globals';
import { UserRole } from '../../../generated/prisma/client';
import { ReportsService } from '../reports.service';

describe('Relatório de certificados (3D)', () => {
  it('distingue certificado consolidado de legado sem perder PDF/CSV', async () => {
    const prisma = { certificate: { findMany: jest.fn() } };
    prisma.certificate.findMany.mockResolvedValue([
      { scope: 'EVENT', validationCode: 'SIGE-NEW', certifiedMinutes: 120, attendancePercent: 100, issuedAt: new Date('2026-10-01'), revokedAt: null, user: { name: 'Maria', email: 'maria@example.test' }, event: { title: 'Evento' }, action: null },
      { scope: 'ACTION', validationCode: 'SIGE-OLD', certifiedMinutes: 60, attendancePercent: 100, issuedAt: new Date('2026-10-01'), revokedAt: null, user: { name: 'João', email: 'joao@example.test' }, event: { title: 'Evento' }, action: { title: 'Oficina' } },
    ] as never);
    const service = new ReportsService(prisma as never);
    const report = await service.getReport('certificates', { id: 'admin-1', role: UserRole.ADMIN }, {});
    expect(report.columns).toContain('Abrangência');
    expect(report.rows[0]['Abrangência']).toBe('EVENTO CONSOLIDADO');
    expect(report.rows[1]['Abrangência']).toBe('AÇÃO LEGADA');
    const csv = service.toCsv(report.rows, report.columns);
    expect(csv).toContain('EVENTO CONSOLIDADO');
    expect(csv).toContain('AÇÃO LEGADA');
  });
});
