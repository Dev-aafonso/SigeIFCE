import { test, expect } from '@playwright/test';

test.describe('Navegação real da SPA', () => {
  test('abre autenticação, configurações e eventos sem recarregar o documento', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/#/auth/login');
    await expect(page.locator('#area-componentes-auth [data-testid="login-form"]')).toBeVisible();

    await page.evaluate(() => (window as typeof window & { navegarParaModulo: (name: string) => Promise<void> }).navegarParaModulo('config'));
    await expect(page.locator('.sige-config')).toBeVisible();
    await expect(page).toHaveURL(/\/configuracoes$/);

    await page.evaluate(() => (window as typeof window & { navegarParaModulo: (name: string) => Promise<void> }).navegarParaModulo('events'));
    await expect(page.getByTestId('events-module')).toBeVisible();
    await expect(page).toHaveURL(/\/eventos$/);
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
    await expect(page).toHaveURL(/\/configuracoes$/);
    await page.waitForTimeout(500);
    await expect(page.locator('.sige-config')).toBeVisible();
  });
  test('rota limpa aceita acesso direto, recarga e navegação por teclado', async ({ page }) => {
    await page.goto('/configuracoes');
    await expect(page.locator('.sige-config')).toBeVisible();
    await page.reload();
    await expect(page.locator('.sige-config')).toBeVisible();
    await expect(page).toHaveURL(/\/configuracoes$/);
    const tab = page.getByRole('tab', { name: 'Geral' });
    await tab.focus();
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'Sobre' })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(tab).toBeFocused();
    await page.getByRole('button', { name: 'Abrir perfil do usuário' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#modal-perfil')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#modal-perfil')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir perfil do usuário' })).toBeFocused();
  });
  test('metadados sociais e imagem estão disponíveis sem JavaScript', async ({ request }) => {
    const response = await request.get('/');
    const html = await response.text();
    expect(html).toContain('property="og:description"');
    expect(html).toContain('property="og:image" content="https://sigeifce.onrender.com/assets/sige-social-preview.png"');
    const media = await request.get('/assets/sige-social-preview.png');
    expect(media.ok()).toBeTruthy();
    expect(media.headers()['content-type']).toContain('image/png');
    const bytes = await media.body();
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
  });
  test('menu mobile fechado não recebe foco e Escape o fecha', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/configuracoes');
    await expect(page.locator('.sige-config')).toBeVisible();
    const menu = page.locator('#barra-lateral');
    const toggle = page.getByRole('button', { name: 'Alternar menu lateral' });
    await expect(menu).toHaveAttribute('inert', '');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.locator('.botao-menu').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(toggle).toBeFocused();
    await expect(menu).toHaveAttribute('inert', '');
  });
});
