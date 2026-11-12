import { expect, test } from '@playwright/test';

test('lista de chamada carrega participantes, filtra e registra presença com confirmação', async ({ page }) => {
  let presenceAdded = false;
  await page.route('**/events/event-demo/manage', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ id: 'event-demo', title: 'Evento IFCE', actions: [{ id: 'action-demo', title: 'Oficina de Testes' }] }),
  }));
  await page.route('**/presences/actions/action-demo/participants', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([{ registrationId: 'reg-1', user: { id: 'student-1', name: '<script>alert(1)</script>', email: 'aluno@ifce.edu.br' }, createdAt: '2026-10-20T10:00:00Z', present: presenceAdded, presence: presenceAdded ? { responsibleId: 'organizer-1' } : null }]),
  }));
  await page.route('**/presences', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    expect(route.request().postDataJSON()).toEqual({ registrationId: 'reg-1' });
    presenceAdded = true;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 'presence-1' }) });
  });
  await page.goto('/#/participants');
  await expect(page.getByTestId('attendance-module')).toBeVisible();
  await page.getByTestId('attendance-event-id').fill('event-demo');
  await page.getByTestId('load-attendance-event').click();
  await expect(page.locator('#lista-participantes tr')).toHaveCount(1);
  await expect(page.locator('#lista-participantes')).toContainText('<script>alert(1)</script>');
  await expect(page.locator('#lista-participantes script')).toHaveCount(0);
  await expect(page.locator('#total-ausentes-presenca')).toHaveText('1 ausentes');
  await page.locator('#lista-participantes button').click();
  await expect(page.locator('#dialog-confirmar-presenca')).toBeVisible();
  await page.getByTestId('confirm-attendance').click();
  await expect(page.locator('#total-presentes-presenca')).toHaveText('1 presentes');
  await expect(page.locator('#lista-participantes')).toContainText('Registrada');
});
