import { test, expect } from '@playwright/test';

test.describe('Navegação real da SPA', () => {
  test('abre autenticação, configurações e eventos sem recarregar o documento', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/#/auth/login');
    await expect(page.locator('#area-componentes-auth [data-testid="login-form"]')).toBeVisible();

    await page.evaluate(() => (window as typeof window & { navegarParaModulo: (name: string) => Promise<void> }).navegarParaModulo('config'));
    await expect(page.locator('.sige-config')).toBeVisible();
    await expect(page).toHaveURL(/#\/config$/);

    await page.evaluate(() => (window as typeof window & { navegarParaModulo: (name: string) => Promise<void> }).navegarParaModulo('events'));
    await expect(page.getByTestId('events-module')).toBeVisible();
    await expect(page).toHaveURL(/#\/events$/);
    expect(errors).toEqual([]);
  });

  test('hashchange e histórico recuperam módulos e componentes de autenticação', async ({ page }) => {
    await page.goto('/#/auth/login');
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    await page.evaluate(() => { window.location.hash = '#/auth/cadastro'; });
    await expect(page.locator('[data-testid="signup-form"]')).toBeVisible();
    await page.goBack();
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
  });

  test('uma navegação lenta não substitui a última página solicitada', async ({ page }) => {
    await page.route('**/web/views/modules/events/events.html', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.continue();
    });
    await page.goto('/#/auth/login');
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    await page.evaluate(() => {
      const app = window as typeof window & { navegarParaModulo: (name: string) => Promise<void> };
      void app.navegarParaModulo('events');
      void app.navegarParaModulo('config');
    });
    await expect(page.locator('.sige-config')).toBeVisible();
    await expect(page).toHaveURL(/#\/config$/);
    await page.waitForTimeout(500);
    await expect(page.locator('.sige-config')).toBeVisible();
  });
});
