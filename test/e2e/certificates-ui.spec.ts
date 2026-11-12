import { expect, test } from '@playwright/test';

test('certificado consolidado: elegibilidade, emissão confirmada e listagem segura', async ({ page }) => {
  let issued = false;
  await page.route('**/certificates/me', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(issued ? [{ id:'cert-1', scope:'EVENT', event:{title:'Semana IFCE'}, certifiedMinutes:180, validationCode:'SIGE-TST', certifiedHours:3, revoked:false }] : []) }));
  await page.route('**/certificates/events/event-test/eligibility', (route) => route.fulfill({ contentType:'application/json',body:JSON.stringify({ eligible:true, attendedMinutes:180, enrolledMinutes:180, attendancePercent:100, minAttendancePercent:75, reason:null }) }));
  await page.route('**/certificates/events/event-test/issue', (route) => { issued=true;return route.fulfill({contentType:'application/json',body:JSON.stringify({alreadyExisted:false,certificate:{id:'cert-1'}})}); });
  await page.addInitScript(() => { localStorage.setItem('sige_user',JSON.stringify({ id:'test', role:'ALUNO' })); });
  await page.goto('/#/certificates');
  await expect(page.locator('#form-elegibilidade-pessoal')).toBeVisible();
  await page.locator('#id-evento-elegibilidade').fill('event-test');
  await page.locator('#form-elegibilidade-pessoal button').click();
  await expect(page.locator('#estado-elegibilidade-pessoal')).toContainText('100%');
  page.once('dialog',(dialog)=>dialog.accept());
  await page.locator('#emitir-certificado-pessoal').click();
  await expect(page.locator('#lista-certificados')).toContainText('Semana IFCE');
  await expect(page.locator('#lista-certificados a')).toHaveAttribute('href','/certificates/cert-1/download');
});
