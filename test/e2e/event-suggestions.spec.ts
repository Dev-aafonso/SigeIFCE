import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const organizer = { sub: 'org-1', id: 'org-1', email: 'org@example.test', role: 'ORGANIZADOR' };
const events = [
  { id: 'ev-1', title: 'Feira de Tecnologia', startDate: '2099-05-01T12:00:00Z', endDate: '2099-05-01T17:00:00Z', status: 'PUBLICADO', organizer: { id: 'org-1', email: organizer.email }, actions: [], location: 'Cedro' },
  { id: 'ev-2', title: 'Feira de Tecnologia', startDate: '2099-06-01T12:00:00Z', endDate: '2099-06-01T17:00:00Z', status: 'PUBLICADO', organizer: { id: 'other', email: 'other@example.test' }, actions: [], location: 'Iguatu' },
];

test.beforeEach(async ({ page }) => {
  // Offline mode serves the real UI files through browser interception. API
  // responses below remain explicit fixtures in both offline and normal runs.
  if (process.env.SIGE_TEST_OFFLINE === '1') {
    const root = process.cwd();
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      const name = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
      const file = path.resolve(root, `.${name}`);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        return route.fulfill({ status: 404, json: {} });
      }
      const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
      return route.fulfill({ body: fs.readFileSync(file), contentType: types[path.extname(file)] || 'application/octet-stream' });
    });
  }
  await page.addInitScript(value => localStorage.setItem('sige_user', JSON.stringify(value)), organizer);
  await page.route('**/auth/me', route => route.fulfill({ json: organizer }));
  await page.route('**/dashboard/filters', route => route.fulfill({ json: { events: [], actions: [] } }));
  await page.route('**/events/organizer/list?*', route => {
    const term = new URL(route.request().url()).searchParams.get('title')?.toLowerCase() || '';
    const data = events.filter(event => event.title.toLowerCase().includes(term));
    return route.fulfill({ json: { data, meta: { page: 1, pages: 1, total: data.length } } });
  });
  await page.route('**/events/manageable/search?*', route => {
    const term = new URL(route.request().url()).searchParams.get('title')?.toLowerCase() || '';
    return route.fulfill({ json: events.filter(event => event.title.toLowerCase().includes(term)) });
  });
  await page.route('**/events/*/manage', route => {
    const id = new URL(route.request().url()).pathname.split('/')[2];
    return route.fulfill({ json: events.find(event => event.id === id) || {} });
  });
  await page.route('**/registrations/me', route => route.fulfill({ json: { events, data: [] } }));
  await page.route('**/certificates/me', route => route.fulfill({ json: [] }));
  await page.route('**/reports/scans/list*', route => route.fulfill({ json: [] }));
  await page.route('**/dashboard/overview*', route => route.fulfill({ json: {} }));
});

test('minicards da pesquisa abrem o evento e identificam o proprietário', async ({ page }) => {
  await page.goto('/#/events');
  await expect(page.locator('.cartao-evento-publico').first()).toContainText('Seu evento');
  await page.getByTestId('search-events').fill('Feira');
  const suggestions = page.locator('#sugestoes-busca-eventos');
  await expect(suggestions.locator('button')).toHaveCount(2);
  const inputBox = await page.getByTestId('search-events').boundingBox();
  const suggestionsBox = await suggestions.boundingBox();
  expect(suggestionsBox!.y).toBeGreaterThanOrEqual(inputBox!.y + inputBox!.height);
  await suggestions.locator('button').first().click();
  await expect(page.locator('#dialog-detalhes-evento')).toBeVisible();
  await expect(page.locator('#titulo-modal-detalhes-evento')).toHaveText('Feira de Tecnologia');
});

test('participantes seleciona o evento correto quando há nomes repetidos', async ({ page }) => {
  await page.goto('/#/participants');
  await page.getByTestId('attendance-event-id').fill('Feira');
  const suggestions = page.locator('#eventos-participantes');
  await expect(suggestions.locator('button')).toHaveCount(2);
  await suggestions.locator('button').nth(1).click();
  const request = page.waitForRequest('**/events/ev-2/manage');
  await page.getByTestId('load-attendance-event').click();
  await request;
  await expect(page.locator('#resumo-evento-participantes')).toContainText('Feira de Tecnologia');
});

test('certificados e digitalização permitem escolher eventos por minicards', async ({ page }) => {
  await page.route('**/certificates/events/ev-2/eligibility', route => route.fulfill({ json: { eligible: false, attendancePercent: 50, minAttendancePercent: 75, attendedMinutes: 30, reason: 'LOW_ATTENDANCE' } }));
  await page.goto('/#/certificates');
  await page.locator('#id-evento-elegibilidade').fill('Feira');
  const personal = page.locator('#eventos-elegibilidade');
  await expect(personal.locator('button')).toHaveCount(2);
  await personal.locator('button').nth(1).click();
  const request = page.waitForRequest('**/certificates/events/ev-2/eligibility');
  await page.locator('#form-elegibilidade-pessoal button[type=submit]').click();
  await request;
  await expect(page.locator('#estado-elegibilidade-pessoal')).toContainText('50%');

  await page.goto('/#/reports');
  await page.locator('#busca-evento-digitalizacao').fill('Feira');
  const reportSuggestions = page.locator('#sugestoes-evento-digitalizacao');
  await expect(reportSuggestions.locator('button')).toHaveCount(2);
  await reportSuggestions.locator('button').nth(1).click();
  await expect(page.locator('#evento-digitalizacao')).toHaveValue('ev-2');
});

test('gestão de certificados identifica o evento escolhido entre nomes iguais', async ({ page }) => {
  await page.route('**/certificates/events/ev-2/candidates', route => route.fulfill({ json: { candidates: [] } }));
  await page.goto('/#/certificates');
  await page.locator('#id-evento-certificados').fill('Feira');
  const suggestions = page.locator('#eventos-gestao-certificados');
  await expect(suggestions.locator('button')).toHaveCount(2);
  await suggestions.locator('button').nth(1).click();
  const request = page.waitForRequest('**/certificates/events/ev-2/candidates');
  await page.getByTestId('load-certificate-event').click();
  await request;
  await expect(page.locator('#nome-evento-certificados')).toHaveText('Feira de Tecnologia');
});

test('buscas rápidas descartam respostas antigas e permitem fechar as sugestões', async ({ page }) => {
  await page.route('**/events/organizer/list?*', async route => {
    const term = new URL(route.request().url()).searchParams.get('title') || '';
    if (term === 'antigo') await new Promise(resolve => setTimeout(resolve, 650));
    const data = term === 'antigo' ? [{ ...events[0], title: 'Evento antigo' }]
      : term === 'novo' ? [{ ...events[0], title: 'Evento novo' }] : [];
    return route.fulfill({ json: { data, meta: { page: 1, pages: 1, total: data.length } } });
  });
  await page.goto('/#/events');
  const input = page.getByTestId('search-events');
  const first = page.waitForRequest(request => request.url().includes('title=antigo'));
  await input.fill('antigo');
  await first;
  await input.fill('novo');
  await expect(page.locator('#sugestoes-busca-eventos')).toContainText('Evento novo');
  await page.waitForTimeout(500);
  await expect(page.locator('#sugestoes-busca-eventos')).not.toContainText('Evento antigo');
  await input.press('Escape');
  await expect(page.locator('#sugestoes-busca-eventos')).toBeHidden();
  await input.fill('sem resultados');
  await expect(page.locator('#sugestoes-busca-eventos')).toContainText('Nenhum evento encontrado');
});

for (const width of [1440, 390]) {
  test(`campos e botões mantêm alinhamento na largura ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [route, field, button] of [
      ['participants', '#id-evento-participantes', '#form-evento-participantes button[type=submit]'],
      ['certificates', '#id-evento-elegibilidade', '#form-elegibilidade-pessoal button[type=submit]'],
      ['reports', '#busca-evento-digitalizacao', '#form-digitalizar-relatorio button[type=submit]'],
    ]) {
      await page.goto(`/#/${route}`);
      const input = page.locator(field), submit = page.locator(button);
      await expect(input).toBeVisible();
      await expect(submit).toBeVisible();
      // Measure both elements in one frame while the module's fade-in runs.
      const boxes = await input.evaluate((element, selector) => {
        const fieldRect = element.getBoundingClientRect();
        const buttonRect = document.querySelector(selector)!.getBoundingClientRect();
        return { fieldX: fieldRect.x, fieldRight: fieldRect.right, fieldY: fieldRect.y, fieldBottom: fieldRect.bottom,
          buttonRight: buttonRect.right, buttonY: buttonRect.y, buttonBottom: buttonRect.bottom };
      }, button);
      expect(boxes.fieldX).toBeGreaterThanOrEqual(0);
      expect(boxes.fieldRight).toBeLessThanOrEqual(width + 1);
      expect(boxes.buttonRight).toBeLessThanOrEqual(width + 1);
      if (width > 720 && Math.abs(boxes.fieldY - boxes.buttonY) < 50) {
        expect(Math.abs(boxes.fieldBottom - boxes.buttonBottom)).toBeLessThanOrEqual(2);
      }
    }
  });
}
