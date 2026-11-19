import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const organizer = { sub: 'org-1', id: 'org-1', email: 'org@example.test', role: 'ORGANIZADOR' };
const firstRaw = 'Evento: Oficina IFCE\nParticipantes: 25\nAnotação adicional';
const firstStandard = 'Evento: Oficina IFCE\nDescrição:\nData de início:\nHorário de início:\nData de término:\nHorário de término:\nLocal:\nCategoria:\nVagas previstas:\nParticipantes presentes: 25\nRelato:\nOutros trechos reconhecidos: Anotação adicional';
const secondStandard = 'Evento:\nDescrição:\nData de início:\nHorário de início:\nData de término:\nHorário de término:\nLocal: Campus Cedro\nCategoria:\nVagas previstas:\nParticipantes presentes:\nRelato:\nOutros trechos reconhecidos:';

test.beforeEach(async ({ page }) => {
  if (process.env.SIGE_TEST_OFFLINE === '1') {
    const root = process.cwd();
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      const name = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
      const file = path.resolve(root, `.${name}`);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, json: {} });
      const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
      return route.fulfill({ body: fs.readFileSync(file), contentType: types[path.extname(file)] || 'application/octet-stream' });
    });
  }
  await page.addInitScript(value => localStorage.setItem('sige_user', JSON.stringify(value)), organizer);
  await page.route('**/auth/me', route => route.fulfill({ json: organizer }));
  await page.route('**/dashboard/filters', route => route.fulfill({ json: { events: [], actions: [] } }));
  await page.route('**/reports/scans/list*', route => route.fulfill({ json: [] }));
  await page.route('**/reports/scans/template', route => route.fulfill({ body: '%PDF-1.4\n%%EOF', contentType: 'application/pdf' }));
});

test('modelo é baixado e a leitura mantém transcrição e campos revisáveis', async ({ page }) => {
  let count = 0;
  let savedText = '';
  await page.route('**/reports/scans/read', route => {
    count++;
    return route.fulfill({ json: count === 1
      ? { text: firstRaw, standardizedText: firstStandard, hasContent: true }
      : { text: 'Local: Campus Cedro', standardizedText: secondStandard, hasContent: true } });
  });
  await page.route('**/reports/scans/organize', async route => {
    expect(route.request().postDataJSON().text).toContain('Campus Cedro');
    return route.fulfill({ json: { text: secondStandard, hasContent: true } });
  });
  await page.route('**/reports/scans', async route => {
    savedText = route.request().postDataJSON().text;
    return route.fulfill({ json: { id: 'scan-1', text: savedText, createdAt: new Date().toISOString() } });
  });
  await page.goto('/#/reports');
  const download = page.waitForEvent('download');
  await page.locator('#baixar-modelo-manuscrito').click();
  expect((await download).suggestedFilename()).toBe('sige-ifce-modelo-manuscrito.pdf');
  const input = page.locator('#foto-relatorio');
  await input.setInputFiles({ name: 'relatorio.png', mimeType: 'image/png', buffer: Buffer.from([137,80,78,71,13,10,26,10,0]) });
  await page.locator('#form-digitalizar-relatorio button[type=submit]').click();
  await expect(page.locator('#texto-digitalizado')).toHaveValue(firstStandard);
  await expect(page.locator('#texto-original-digitalizado')).toHaveValue(firstRaw);
  await expect(page.locator('#scan-evento-nome')).toHaveValue('Oficina IFCE');
  await expect(page.locator('#scan-evento-vagas')).toHaveValue('');

  // A second manuscript must not inherit values suggested for the first one.
  await input.setInputFiles({ name: 'outro.png', mimeType: 'image/png', buffer: Buffer.from([137,80,78,71,13,10,26,10,1]) });
  await page.locator('#form-digitalizar-relatorio button[type=submit]').click();
  await expect(page.locator('#texto-digitalizado')).toHaveValue(secondStandard);
  await expect(page.locator('#scan-evento-nome')).toHaveValue('');
  await expect(page.locator('#scan-evento-local')).toHaveValue('Campus Cedro');
  await page.locator('#organizar-digitalizacao').click();
  await expect(page.locator('#estado-digitalizacao')).toContainText('Texto organizado');
  await page.locator('#salvar-digitalizacao').click();
  await expect(page.locator('#estado-digitalizacao')).toContainText('formato padronizado');
  expect(savedText).toBe(secondStandard);
});
