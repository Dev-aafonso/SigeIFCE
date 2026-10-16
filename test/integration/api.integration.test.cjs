'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

// Testes somente de leitura contra a API local. Nao criam nem alteram registros.
const baseUrl = (process.env.SIGE_TEST_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const client = request(baseUrl);
const get = (path) => client.get(path).timeout({ deadline: 10000 });

 test('pagina inicial responde HTTP 200', async () => {
  const response = await get('/');
  assert.equal(response.status, 200, `GET / retornou HTTP ${response.status}`);
});

test('cabecalho CSP bloqueia scripts e handlers inline', async () => {
  const response = await get('/');
  assert.equal(response.status, 200);
  const policy = response.headers['content-security-policy'];
  assert.ok(policy, 'Content-Security-Policy ausente');
  const scriptDirective = policy.split(';').map((value) => value.trim()).find((value) => /^script-src\s/.test(value));
  assert.ok(scriptDirective, 'Diretiva script-src ausente');
  assert.equal(/\bunsafe-inline\b/.test(scriptDirective), false, 'script-src nao deve permitir unsafe-inline');
  assert.match(policy, /(?:^|;)\s*script-src-attr\s+'none'(?:;|$)/, 'script-src-attr deve ser none');
});

test('JavaScript externo da Sprint 9 esta acessivel', async () => {
  const response = await get('/js/sprint9-csp.js');
  assert.equal(response.status, 200);
  const source = typeof response.text === 'string' ? response.text : response.body.toString('utf8');
  assert.match(source, /addEventListener/);
});

test('HTML do dashboard e de relatorios estao acessiveis', async () => {
  const dashboard = await get('/web/views/modules/Dashboard/dashboard.html');
  const reports = await get('/web/views/modules/reports/reports.html');
  assert.equal(dashboard.status, 200, `Dashboard retornou HTTP ${dashboard.status}`);
  assert.equal(reports.status, 200, `Relatorios retornou HTTP ${reports.status}`);
});

test('configuracao, fonte e schema nao sao publicados', async () => {
  for (const path of ['/package.json', '/src/main.ts', '/prisma/schema.prisma']) {
    const response = await get(path);
    assert.equal(response.status, 404, `${path} deveria retornar 404, recebeu ${response.status}`);
  }
});

test('dashboard exige autenticacao', async () => {
  const response = await get('/dashboard/overview');
  assert.equal(response.status, 401, `Dashboard anonimo retornou HTTP ${response.status}`);
});

test('relatorios exigem autenticacao', async () => {
  const response = await get('/reports');
  assert.equal(response.status, 401, `Relatorios anonimos retornaram HTTP ${response.status}`);
});

test('consulta de presencas exige autenticacao antes de consultar registros', async () => {
  const response = await get('/presences/actions/sprint10-sentinel/participants');
  assert.equal(response.status, 401, `Presencas anonimas retornaram HTTP ${response.status}`);
});

test('endpoint de identidade exige sessao autenticada', async () => {
  const response = await get('/auth/me');
  assert.equal(response.status, 401, `GET /auth/me anonimo retornou HTTP ${response.status}`);
});
test('cancelamento de inscricao exige autenticacao', async () => {
  const response = await client.delete('/registrations/actions/sprint10-sentinel').timeout({ deadline: 10000 });
  assert.equal(response.status, 401, `Cancelamento anonimo retornou HTTP ${response.status}`);
});
