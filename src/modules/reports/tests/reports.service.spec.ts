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
