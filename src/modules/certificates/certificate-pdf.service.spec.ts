import { CertificatePdfService } from './certificate-pdf.service';

describe('CertificatePdfService', () => {
  it('gera um PDF com o cÃ³digo e os dados da aÃ§Ã£o', async () => {
    const service = new CertificatePdfService();
    const pdf = await service.generate({
      participantName: 'Maria Eduarda da Silva',
      eventTitle: 'I Jornada de Pesquisa e InovaÃ§Ã£o do IFCE',
      actionTitle: 'Minicurso: IntroduÃ§Ã£o Ã  CiÃªncia de Dados',
      actionStartDate: new Date('2026-10-06T12:00:00.000Z'),
      actionEndDate: new Date('2026-10-06T16:00:00.000Z'),
      certifiedMinutes: 240,
      validationCode: 'SIGE-2026-DEMO-000001',
      verificationUrl: 'https://sige-ifce.example/certificates/validate/SIGE-2026-DEMO-000001',
      issuedAt: new Date('2026-10-09T12:00:00.000Z'),
      campusName: 'Campus Cedro',
    });

    expect(pdf.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(1_000);
  });
});
