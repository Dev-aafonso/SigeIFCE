import { describe, expect, it } from '@jest/globals';
import { PrismaService } from '../../../database/prisma.service';
import { ReportsService } from '../reports.service';

describe('ReportsService CSV safeguards', () => {
  const service = new ReportsService({} as PrismaService);

  it('quotes delimiters, quotes and newlines using Brazilian CSV separators', () => {
    const csv = service.toCsv(
      [{ Nome: 'Ana; Maria', Observação: 'linha 1\nlinha 2', Email: 'ana@example.com' }],
      ['Nome', 'Observação', 'Email'],
    );
    expect(csv).toContain('"Ana; Maria"');
    expect(csv).toContain('"linha 1\nlinha 2"');
    expect(csv).toContain('ana@example.com');
    expect(csv.startsWith('\uFEFF')).toBe(true);
  });

  it('neutralizes spreadsheet formulas in exported fields', () => {
    const csv = service.toCsv(
      [{ Nome: '=HYPERLINK("https://example.invalid")', Valor: '+1+1' }],
      ['Nome', 'Valor'],
    );
    expect(csv).toContain("'=HYPERLINK(");
    expect(csv).toContain("'+1+1");
  });
});

import { UserRole } from '../../../generated/prisma/client';

describe('Relatório geral', () => {
  it('consolida o escopo do organizador e conta presenças apenas em inscrições ativas', async () => {
    let eventQuery: unknown;
    let presenceQuery: unknown;
    const prisma = {
      event: { findMany: async (query: unknown) => {
        eventQuery = query;
        return [{ id: 'e1', title: 'Evento', status: 'PUBLICADO', startDate: new Date('2026-01-01T12:00:00Z'),
          actions: [{ id: 'a1', _count: { registrations: 3 } }], _count: { certificates: 2 } }];
      } },
      registration: { groupBy: async (query: unknown) => {
        presenceQuery = query;
        return [{ actionId: 'a1', _count: { _all: 2 } }];
      } },
    } as unknown as PrismaService;
    const payload = await new ReportsService(prisma).getReport('general',
      { id: 'org', role: UserRole.ORGANIZADOR }, { eventId: 'e1', actionId: 'a1' });
    expect(eventQuery).toMatchObject({ where: { organizerId: 'org', id: 'e1' }, select: { actions: { where: { id: 'a1' } } } });
    expect(presenceQuery).toMatchObject({ where: { status: 'ACTIVE', actionId: { in: ['a1'] } } });
    expect(payload.rows[0]).toMatchObject({ 'Ações': 1, 'Inscrições ativas': 3, 'Presenças': 2, 'Ausências': 1, 'Certificados registrados': 2 });
  });
});


describe('Filtros dos relatórios', () => {
  it('aplica a data local de Fortaleza e restringe as contagens à ação selecionada', async () => {
    let captured: unknown;
    const prisma = { event: { findMany: async (query: unknown) => { captured = query; return []; } } } as unknown as PrismaService;
    await new ReportsService(prisma).getReport('events', { id: 'admin', role: UserRole.ADMIN }, { startDateFrom: '2026-10-10', startDateTo: '2026-10-10', actionId: 'a1' });
    expect(captured).toMatchObject({ where: { startDate: { gte: new Date('2026-10-10T03:00:00.000Z'), lte: new Date('2026-10-11T02:59:59.999Z') } }, select: { actions: { where: { id: 'a1' } }, _count: { select: { certificates: { where: { actionId: 'a1' } } } } } });
  });
  it('identifica excesso somente quando ultrapassa o limite', async () => {
    const item = { title: 'E', status: 'PUBLICADO', startDate: new Date(), endDate: new Date(), actions: [], _count: { certificates: 0 } };
    const prisma = { event: { findMany: async () => Array(10000).fill(item) } } as unknown as PrismaService;
    const report = await new ReportsService(prisma).getReport('events', { id: 'admin', role: UserRole.ADMIN }, {});
    expect(report.rows).toHaveLength(10000);
    expect(report.truncated).toBe(false);
  });
});


describe('Escopo do professor', () => {
  it('restringe relatórios aos eventos do próprio professor', async () => {
    let query: unknown;
    const prisma = { event: { findMany: async (value: unknown) => { query = value; return []; } } } as unknown as PrismaService;
    await new ReportsService(prisma).getReport('events', {id:'prof1', role:UserRole.PROFESSOR}, {});
    expect(query).toMatchObject({ where: { organizerId: 'prof1' } });
  });
});
