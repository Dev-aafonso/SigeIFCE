import { expect, test } from '@playwright/test';
test('edicao RN06 envia categoria, minutos, vagas e janela normalizados', async ({ page }) => {
  const event = { id: 'rn06-ui', title: 'Evento IFCE', description: 'Descricao completa do evento',
    startDate: '2099-10-28T12:00:00Z', endDate: '2099-10-28T14:00:00Z', location: 'IFCE',
    status: 'RASCUNHO', actions: [], category: 'Oficina', workloadMinutes: 60, totalCapacity: 2,
    registrationStartDate: '2099-10-20T12:00:00Z', registrationEndDate: '2099-10-27T12:00:00Z' };
  await page.addInitScript(() => localStorage.setItem('sige_user', JSON.stringify({ id: 'org', role: 'ORGANIZADOR' })));
  await page.route('**/events?*', route => route.fulfill({ json: { data: [], meta: { page: 1, pages: 0, total: 0 } } }));
  await page.route('**/events/rn06-ui/manage', route => route.fulfill({ json: event }));
  let sent: Record<string, unknown> | undefined;
  await page.route('**/events/rn06-ui', async route => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { ...event, ...sent } });
  });
  await page.goto('/#/events');
  await page.getByTestId('managed-event-id').fill(event.id);
  await page.getByTestId('open-event-management').click();
  const form = page.locator('[data-form-type="edit-event"]');
  await expect(form.locator('[name="category"]')).toHaveValue('Oficina');
  await form.locator('[name="workloadMinutes"]').fill('120');
  await form.locator('[name="totalCapacity"]').fill('3');
  await form.locator('[type="submit"]').click();
  await expect.poll(() => sent?.totalCapacity).toBe(3);
  expect(sent?.workloadMinutes).toBe(120);
  expect(sent?.category).toBe('Oficina');
  expect(sent?.registrationStartDate).toBe(new Date(event.registrationStartDate).toISOString());
});
