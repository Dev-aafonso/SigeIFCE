import { test, expect } from '@playwright/test';

test.describe('Sprint 10 - verificacoes E2E de base', () => {
  test('aplicacao abre e publica cabecalhos de seguranca', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const response = await page.goto('/');
    expect(response, 'A navegacao inicial nao recebeu resposta HTTP').not.toBeNull();
    expect(response!.status()).toBe(200);
    await expect(page.locator('body')).toBeVisible();

    const headers = await response!.allHeaders();
    const policy = headers['content-security-policy'] ?? '';
    expect(policy).toContain("script-src-attr 'none'");
    const scriptDirective = policy.split(';').map((part) => part.trim()).find((part) => /^script-src\s/.test(part));
    expect(scriptDirective).toBeTruthy();
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(pageErrors, 'A pagina gerou excecoes JavaScript nao tratadas').toEqual([]);
  });

  test('script CSP externo e servido sem depender de handlers inline', async ({ request }) => {
    const response = await request.get('/js/sprint9-csp.js');
    expect(response.status()).toBe(200);
    const source = await response.text();
    expect(source).toContain('addEventListener');
  });

  test('telas HTML de dashboard e relatorios respondem', async ({ request }) => {
    for (const path of [
      '/web/views/modules/Dashboard/dashboard.html',
      '/web/views/modules/reports/reports.html',
    ]) {
      const response = await request.get(path);
      expect(response.status(), `${path} deve responder HTTP 200`).toBe(200);
    }
  });

  test('fragmentos de autenticacao nao usam atributos inline de eventos', async ({ request }) => {
    const paths = [
      '/web/views/components/login/login.html',
      '/web/views/components/cadastro/cadastro.html',
      '/web/views/components/selecao-funcao/selecao-funcao.html',
    ];

    for (const path of paths) {
      const response = await request.get(path);
      expect(response.status(), `${path} deve responder HTTP 200`).toBe(200);
      const html = await response.text();
      expect(html, `${path} ainda contem manipuladores de evento inline`).not.toMatch(/\son(?:click|submit|change|input|keyup|keydown)\s*=/i);
    }
  });

  test('arquivos de configuracao e fontes internas nao sao publicos', async ({ request }) => {
    for (const path of ['/package.json', '/src/main.ts', '/prisma/schema.prisma']) {
      const response = await request.get(path);
      expect(response.status(), `${path} deve responder HTTP 404`).toBe(404);
    }
  });
});