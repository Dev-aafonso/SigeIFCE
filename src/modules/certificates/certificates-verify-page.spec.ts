import { jest } from '@jest/globals';
import { CertificatesController } from './certificates.controller';

describe('Verificação pública via QR (3C)', () => {
  it('escapa os dados retornados pela API e não insere scripts inline', async () => {
    const service = {
      validateCode: jest.fn().mockResolvedValue({
        valid: true,
        certificate: {
          scope: 'EVENT', participantName: '<script>alert(1)</script>',
          eventTitle: 'Evento <IFCE>', certifiedHours: 2,
          validationCode: 'SIGE-DEMO',
        },
      } as never),
    };
    const response = {
      set: jest.fn(), status: jest.fn(), send: jest.fn(),
    };
    response.status.mockReturnValue(response as never);
    await new CertificatesController(service as never).verifyPage('SIGE-DEMO', response as never);
    const html = response.send.mock.calls[0][0] as string;
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Evento &lt;IFCE&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('Certificado válido');
  });
});
