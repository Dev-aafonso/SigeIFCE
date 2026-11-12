import { CertificatePdfService } from './certificate-pdf.service';

describe('PDF institucional consolidado (3C)', () => {
  it('gera PDF do evento com QR e dados de carga horária', async () => {
    const pdf = await new CertificatePdfService().generate({
      scope: 'EVENT', participantName: 'Aluno Demonstracao', eventTitle: 'Semana Científica do IFCE',
      eventStartDate: new Date('2026-10-01T12:00:00Z'), eventEndDate: new Date('2026-10-02T12:00:00Z'),
      certifiedMinutes: 240, enrolledMinutes: 300, attendancePercent: 80,
      validationCode: 'SIGE-2026-UNICO', verificationUrl: 'https://sige.example/certificates/validate/SIGE-2026-UNICO',
      issuedAt: new Date('2026-10-03T12:00:00Z'), campusName: 'Campus Cedro',
    });
    expect(pdf.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});

describe('Formatação do certificado institucional', () => {
  it('expressa a carga horária em horas e minutos, sem decimais', async () => {
    const { formatCertificateDuration } = await import('./certificate-pdf.service');
    expect(formatCertificateDuration(90)).toBe('1h30min');
    expect(formatCertificateDuration(180)).toBe('3h');
    expect(formatCertificateDuration(45)).toBe('45min');
    expect(formatCertificateDuration(125)).toBe('2h05min');
    expect(() => formatCertificateDuration(-30)).toThrow();
  });

  it('mostra somente uma data se início e fim coincidirem em Fortaleza', async () => {
    const { formatCertificatePeriod } = await import('./certificate-pdf.service');
    expect(formatCertificatePeriod(
      new Date('2026-10-20T12:00:00Z'),
      new Date('2026-10-20T20:00:00Z'), 'EVENT',
    )).toBe('Data do evento: 20 de outubro de 2026');
    expect(formatCertificatePeriod(
      new Date('2026-10-20T20:00:00Z'),
      new Date('2026-10-21T01:00:00Z'), 'ACTION',
    )).toBe('Data da ação: 20 de outubro de 2026');
  });

  it('preserva período com duas datas locais distintas', async () => {
    const { formatCertificatePeriod } = await import('./certificate-pdf.service');
    expect(formatCertificatePeriod(
      new Date('2026-10-20T12:00:00Z'),
      new Date('2026-10-22T12:00:00Z'), 'EVENT',
    )).toBe('Período: 20 de outubro de 2026 a 22 de outubro de 2026');
  });
});
