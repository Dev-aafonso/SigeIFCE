import { buildCertificateVerificationUrl } from './certificates.service';

describe('Endereço público do QR Code', () => {
  const code = 'SIGE-TESTE-123';

  it('gera HTTPS com APP_URL pública, sem barra duplicada', () => {
    expect(buildCertificateVerificationUrl(code, 'https://sige.ifce.edu.br/'))
      .toBe('https://sige.ifce.edu.br/certificates/verify/SIGE-TESTE-123');
  });

  it('mantém contexto quando a implantação utiliza um prefixo', () => {
    expect(buildCertificateVerificationUrl(code, 'https://servicos.ifce.edu.br/sige/'))
      .toBe('https://servicos.ifce.edu.br/sige/certificates/verify/SIGE-TESTE-123');
  });

  it('permite HTTP local apenas em desenvolvimento ou teste', () => {
    expect(buildCertificateVerificationUrl(code, '', 'test'))
      .toBe('http://localhost:3000/certificates/verify/SIGE-TESTE-123');
  });

  it('exige APP_URL explicitamente configurada em produção', () => {
    expect(() => buildCertificateVerificationUrl(code, '', 'production')).toThrow();
  });

  it('rejeita HTTPS local e HTTP público em produção', () => {
    expect(() => buildCertificateVerificationUrl(code, 'https://localhost:3000', 'production')).toThrow();
    expect(() => buildCertificateVerificationUrl(code, 'http://sige.ifce.edu.br', 'production')).toThrow();
  });

  it('rejeita configuração com autenticação ou parâmetros inesperados', () => {
    expect(() => buildCertificateVerificationUrl(code, 'https://usuario:senha@sige.ifce.edu.br', 'production')).toThrow();
    expect(() => buildCertificateVerificationUrl(code, 'https://sige.ifce.edu.br/?token=123', 'production')).toThrow();
  });
});
