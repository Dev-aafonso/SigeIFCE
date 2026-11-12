import { test, expect } from '@playwright/test';

test('histórico de inscrições renderiza dados da API sem HTML injetado', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/registrations/me?**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      data: [{
        id: 'registration-1', actionId: 'action-1', status: 'ACTIVE',
        createdAt: '2026-10-25T12:00:00Z', presence: null, certificate: null,
        action: {
          id: 'action-1', title: '<img src=x onerror=alert(1)>', status: 'ATIVA',
          startDate: '2026-11-15T12:00:00Z', endDate: '2026-11-15T14:00:00Z',
          location: 'Auditório', event: { id: 'event-1', title: 'Semana do IFCE', status: 'PUBLICADO' },
        },
      }],
      total: 1, page: 1, limit: 10, pages: 1,
      summary: { active: 1, cancelled: 0, total: 1 },
      events: [{ id: 'event-1', title: 'Semana do IFCE' }],
    }),
  }));
  await page.goto('/#/registrations');
  await expect(page.getByTestId('registrations-module')).toBeVisible();
  await expect(page.locator('#total-inscricoes-ativas')).toHaveText('1');
  await expect(page.locator('#lista-minhas-inscricoes tr')).toHaveCount(1);
  await expect(page.locator('#lista-minhas-inscricoes')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#lista-minhas-inscricoes img')).toHaveCount(0);
  await page.locator('#lista-minhas-inscricoes button').first().click();
  await expect(page.locator('#dialog-detalhes-inscricao')).toBeVisible();
  expect(errors).toEqual([]);
});
