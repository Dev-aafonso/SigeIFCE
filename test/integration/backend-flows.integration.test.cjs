'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { Client } = require('pg');
const argon2 = require('argon2');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const baseUrl = (process.env.SIGE_TEST_BASE_URL || '').replace(/\/+$/, '');
const runId = process.env.SIGE_TEST_RUN_ID || '';
const organizerEmail = process.env.SIGE_TEST_ORGANIZER_EMAIL || '';
const organizerPassword = process.env.SIGE_TEST_ORGANIZER_PASSWORD || '';
const eventTitle = `SIGE Sprint10 Integration ${runId}`;
const ctx = {};
let db;

function safeDbName() {
  try {
    return decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.replace(/^\/+/, ''));
  } catch {
    return '';
  }
}

if (process.env.SIGE_TEST_RUN_BACKEND_FLOWS !== '1') {
  throw new Error('Execucao bloqueada: use npm run test:backend-flows para criar um banco isolado.');
}
if (!/^sige_s10_test_[a-z0-9_]+$/i.test(safeDbName())) {
  throw new Error('Execucao bloqueada: DATABASE_URL nao aponta para o banco temporario SIGE Sprint 10.');
}
if (!baseUrl || !runId || !organizerEmail || !organizerPassword) {
  throw new Error('Configuracao de teste incompleta; nenhum fluxo foi executado.');
}

function expectStatus(response, allowed, label) {
  const statuses = Array.isArray(allowed) ? allowed : [allowed];
  const details = response && response.body && response.body.message
    ? `; mensagem=${String(response.body.message).slice(0, 240)}`
    : '';
  assert.ok(statuses.includes(response.status),
    `${label}: esperado HTTP ${statuses.join('/')} e recebido HTTP ${response.status}${details}`);
}

function agent() {
  return request.agent(baseUrl);
}

function newStudentPayload(index) {
  return {
    name: `Aluno Teste Sprint10 ${index}`,
    email: `s10-${runId}-aluno${index}@example.test`,
    password: 'Temp-SIGE-Sprint10-Password!9',
    passwordConfirmation: 'Temp-SIGE-Sprint10-Password!9',
  };
}

function binaryParser(response, callback) {
  const chunks = [];
  response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
}

before(async () => {
  db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const organizerId = `c${crypto.randomBytes(12).toString('hex')}`;
  const passwordHash = await argon2.hash(organizerPassword);
  await db.query(
    'INSERT INTO "User" ("id", "name", "email", "password", "role") VALUES ($1, $2, $3, $4, $5::"UserRole")',
    [organizerId, 'Organizador de Teste Sprint10', organizerEmail, passwordHash, 'ORGANIZADOR'],
  );
  ctx.organizerId = organizerId;

  // Segundo organizador no banco descartavel para validar o isolamento por proprietario.
  ctx.secondOrganizerEmail = `s10-${runId}-outsider@example.test`;
  ctx.secondOrganizerPassword = 'Temp-SIGE-Sprint10-Organizer2!9';
  const secondOrganizerId = `c${crypto.randomBytes(12).toString('hex')}`;
  const secondOrganizerHash = await argon2.hash(ctx.secondOrganizerPassword);
  await db.query(
    'INSERT INTO "User" ("id", "name", "email", "password", "role") VALUES ($1, $2, $3, $4, $5::"UserRole")',
    [secondOrganizerId, 'Segundo Organizador Teste Sprint10', ctx.secondOrganizerEmail, secondOrganizerHash, 'ORGANIZADOR'],
  );
  ctx.secondOrganizerId = secondOrganizerId;
});

after(async () => {
  if (!db) return;
  try {
    const rows = await db.query(
      'SELECT c."filePath" FROM "Certificate" c JOIN "Event" e ON e."id" = c."eventId" WHERE e."title" = $1',
      [eventTitle],
    );
    const storageRoot = path.resolve(process.cwd(), 'storage', 'certificates');
    for (const row of rows.rows) {
      const file = path.resolve(process.cwd(), row.filePath);
      if ((file.startsWith(storageRoot + path.sep) || file === storageRoot) && fs.existsSync(file)) {
        fs.rmSync(file, { force: true });
      }
    }
  } catch (error) {
    console.warn(`Limpeza de arquivos temporarios de certificado incompleta: ${error.message}`);
  } finally {
    await db.end().catch(() => {});
  }
});

test('fluxos integrados do backend no PostgreSQL isolado', async (t) => {
  await t.test('autenticacao, identidade e permissao por perfil', async () => {
    ctx.organizer = agent();
    let response = await ctx.organizer.post('/auth/login').send({
      email: organizerEmail,
      password: organizerPassword,
    }).timeout({ deadline: 15000 });
    expectStatus(response, [200, 201], 'Login do organizador');
    assert.equal(response.body.role, 'ORGANIZADOR', 'Login nao retornou perfil ORGANIZADOR');

    response = await ctx.organizer.get('/auth/me').timeout({ deadline: 15000 });
    expectStatus(response, 200, 'Identidade autenticada do organizador');
    assert.ok(response.body && (response.body.sub || response.body.id), 'JWT nao identificou o organizador');

    ctx.secondOrganizer = agent();
    response = await ctx.secondOrganizer.post('/auth/login').send({
      email: ctx.secondOrganizerEmail,
      password: ctx.secondOrganizerPassword,
    }).timeout({ deadline: 15000 });
    expectStatus(response, [200, 201], 'Login do segundo organizador');
    assert.equal(response.body.role, 'ORGANIZADOR');

    ctx.student = agent();
    response = await ctx.student.post('/auth/register').send(newStudentPayload(1)).timeout({ deadline: 15000 });
    expectStatus(response, [200, 201], 'Cadastro do aluno 1');
    assert.equal(response.body.role, 'ALUNO', 'Cadastro publico nao deve elevar privilegios');
    ctx.studentUser = response.body;

    ctx.student2 = agent();
    response = await ctx.student2.post('/auth/register').send(newStudentPayload(2)).timeout({ deadline: 15000 });
    expectStatus(response, [200, 201], 'Cadastro do aluno 2');
    assert.equal(response.body.role, 'ALUNO');
    ctx.student2User = response.body;

    response = await ctx.student.post('/events').send({
      title: `Tentativa nao autorizada ${runId}`,
      description: 'Este evento nao deve ser criado por aluno.',
      startDate: new Date(Date.now() + 3600000).toISOString(),
      endDate: new Date(Date.now() + 7200000).toISOString(),
    }).timeout({ deadline: 15000 });
    expectStatus(response, 403, 'Aluno nao pode criar evento');

    response = await ctx.student.get('/dashboard/overview').timeout({ deadline: 15000 });
    expectStatus(response, 403, 'Aluno nao pode acessar dashboard administrativo');
  });

  await t.test('criacao, publicacao e consulta publica de evento e acoes', async (t) => {
    if (!ctx.organizer || !ctx.student || !ctx.student2User) return t.skip('Pre-requisito de autenticacao falhou.');

    const baseMinute = Math.ceil(Date.now() / 60000) * 60000;
    ctx.eventDates = {
      start: new Date(baseMinute + 30 * 60000),
      end: new Date(baseMinute + 8 * 60 * 60000),
      action1Start: new Date(baseMinute + 60 * 60000),
      action1End: new Date(baseMinute + 120 * 60000),
      action2Start: new Date(baseMinute + 180 * 60000),
      action2End: new Date(baseMinute + 240 * 60000),
    };

    let response = await ctx.organizer.post('/events').send({
      title: eventTitle,
      description: 'Evento de integracao backend para validar os fluxos completos da Sprint 10.',
      startDate: ctx.eventDates.start.toISOString(),
      endDate: ctx.eventDates.end.toISOString(),
      location: 'Ambiente PostgreSQL de testes',
    }).timeout({ deadline: 15000 });
    expectStatus(response, [200, 201], 'Criacao de evento');
    assert.ok(response.body.id, 'Evento criado sem identificador');
    ctx.event = response.body;

    // SEGMENTO DE TESTES NEGATIVOS SPRINT10: um organizador nao administra evento alheio.
    await t.test('organizador nao pode administrar evento de outro organizador', async () => {
      const foreignResponse = await ctx.secondOrganizer.get(`/events/${ctx.event.id}/manage`).timeout({ deadline: 15000 });
      expectStatus(foreignResponse, 403, 'Isolamento entre organizadores');
      const persisted = await db.query('SELECT "organizerId" FROM "Event" WHERE "id" = $1', [ctx.event.id]);
      assert.equal(persisted.rows[0]?.organizerId, ctx.organizerId, 'O evento nao deve mudar de proprietario');
    });

    response = await ctx.organizer.post(`/events/${ctx.event.id}/actions`).send({
      title: `Acao principal ${runId}`,
      description: 'Acao principal usada para presenca e certificado.',
      startDate: ctx.eventDates.action1Start.toISOString(),
      endDate: ctx.eventDates.action1End.toISOString(),
      durationMinutes: 60,
      capacity: 1,
      location: 'Sala de testes A',
    }).timeout({ deadline: 15000 });
    expectStatus(response, [200, 201], 'Criacao da acao principal');
    assert.ok(response.body.id, 'Acao principal sem identificador');
    ctx.action1 = response.body;

    response = await ctx.organizer.post(`/events/${ctx.event.id}/actions`).send({
      title: `Acao cancelamento ${runId}`,
      description: 'Acao auxiliar para testar cancelamento de inscricao.',
      startDate: ctx.eventDates.action2Start.toISOString(),
      endDate: ctx.eventDates.action2End.toISOString(),
      durationMinutes: 60,
      capacity: 20,
      location: 'Sala de testes B',
    }).timeout({ deadline: 15000 });
    expectStatus(response, [200, 201], 'Criacao da acao de cancelamento');
    assert.ok(response.body.id, 'Acao de cancelamento sem identificador');
    ctx.action2 = response.body;

    response = await ctx.organizer.post(`/events/${ctx.event.id}/publish`).timeout({ deadline: 15000 });
    expectStatus(response, [200, 201], 'Publicacao do evento');
    assert.equal(response.body.status, 'PUBLICADO');
    response = await request(baseUrl).get(`/events/${ctx.event.id}`).timeout({ deadline: 15000 });
    expectStatus(response, 200, 'Consulta publica do evento publicado');
    assert.equal(response.body.id, ctx.event.id);

    response = await request(baseUrl).get(`/events/${ctx.event.id}/actions`).timeout({ deadline: 15000 });
    expectStatus(response, 200, 'Consulta publica das acoes do evento');
  });

  await t.test('inscricao por acao e cancelamento com persistencia de estado', async (t) => {
    if (!ctx.event || !ctx.action1 || !ctx.action2 || !ctx.student || !ctx.student2) {
      return t.skip('Pre-requisito de evento, acoes ou usuarios falhou.');
    }

    let response = await ctx.student.post(`/registrations/actions/${ctx.action1.id}`).send({}).timeout({ deadline: 15000 });
    expectStatus(response, [200, 201], 'Inscricao do aluno na acao principal');
    ctx.registration1 = response.body;
    if (!ctx.registration1.id) {
      const row = await db.query(
        'SELECT "id" FROM "Registration" WHERE "userId" = $1 AND "actionId" = $2',
        [ctx.studentUser.id, ctx.action1.id],
      );
      assert.ok(row.rowCount, 'Inscricao principal nao foi persistida');
      ctx.registration1 = { id: row.rows[0].id };
    }

    // SEGMENTO DE TESTES NEGATIVOS SPRINT10: duplicidade e lotacao devem ser rejeitadas sem inserir linhas extras.
    await t.test('inscricao duplicada na mesma acao e rejeitada', async () => {
      const duplicateResponse = await ctx.student.post(`/registrations/actions/${ctx.action1.id}`).send({}).timeout({ deadline: 15000 });
      expectStatus(duplicateResponse, 409, 'Inscricao duplicada');
      const count = await db.query(
        'SELECT COUNT(*)::int AS total FROM "Registration" WHERE "userId" = $1 AND "actionId" = $2',
        [ctx.studentUser.id, ctx.action1.id],
      );
      assert.equal(count.rows[0].total, 1, 'Inscricao duplicada criou registros extras');
    });

    await t.test('lotacao da acao impede inscricao adicional', async () => {
      const fullResponse = await ctx.student2.post(`/registrations/actions/${ctx.action1.id}`).send({}).timeout({ deadline: 15000 });
      expectStatus(fullResponse, 409, 'Acao com capacidade esgotada');
      const count = await db.query(
        'SELECT COUNT(*)::int AS total FROM "Registration" WHERE "userId" = $1 AND "actionId" = $2',
        [ctx.student2User.id, ctx.action1.id],
      );
      assert.equal(count.rows[0].total, 0, 'Inscricao acima da capacidade foi persistida');
    });

    response = await ctx.student2.post(`/registrations/actions/${ctx.action2.id}`).send({}).timeout({ deadline: 15000 });
    expectStatus(response, [200, 201], 'Inscricao do aluno 2 na acao auxiliar');
    ctx.registration2 = response.body;
    if (!ctx.registration2.id) {
      const row = await db.query(
        'SELECT "id" FROM "Registration" WHERE "userId" = $1 AND "actionId" = $2',
        [ctx.student2User.id, ctx.action2.id],
      );
      assert.ok(row.rowCount, 'Inscricao auxiliar nao foi persistida');
      ctx.registration2 = { id: row.rows[0].id };
    }

    // SEGMENTO DE TESTES NEGATIVOS SPRINT10: nao pode cancelar a inscricao de outra pessoa.
    await t.test('participante nao pode cancelar inscricao alheia', async () => {
      const foreignCancel = await ctx.student.delete(`/registrations/actions/${ctx.action2.id}`).timeout({ deadline: 15000 });
      expectStatus(foreignCancel, 404, 'Tentativa de cancelar inscricao alheia');
      const unchanged = await db.query(
        'SELECT "status" FROM "Registration" WHERE "id" = $1 AND "userId" = $2',
        [ctx.registration2.id, ctx.student2User.id],
      );
      assert.equal(unchanged.rows[0]?.status, 'ACTIVE', 'A inscricao de outro participante foi alterada');
    });

    response = await ctx.student2.delete(`/registrations/actions/${ctx.action2.id}`).timeout({ deadline: 15000 });
    expectStatus(response, [200, 202], 'Cancelamento da propria inscricao');

    const status = await db.query(
      'SELECT "status", "cancelledAt" FROM "Registration" WHERE "id" = $1',
      [ctx.registration2.id],
    );
    assert.equal(status.rows[0]?.status, 'CANCELLED', 'Cancelamento nao foi persistido como CANCELLED');
    assert.ok(status.rows[0]?.cancelledAt, 'Cancelamento sem timestamp cancelledAt');
  });

  await t.test('registro de presenca, encerramento e emissao/validacao de certificado', async (t) => {
    if (!ctx.event || !ctx.action1 || !ctx.action2 || !ctx.registration1 || !ctx.organizer) {
      return t.skip('Pre-requisito de inscricao/evento falhou.');
    }

    const now = Date.now();
    const eventStart = new Date(now - 6 * 60 * 60000);
    const eventEnd = new Date(now - 10 * 60000);
    const action1Start = new Date(now - 5 * 60 * 60000);
    const action1End = new Date(now - 4 * 60 * 60000);
    const action2Start = new Date(now - 3 * 60 * 60000);
    const action2End = new Date(now - 2 * 60 * 60000);

    await db.query(
      'UPDATE "Event" SET "startDate" = $1, "endDate" = $2, "updatedAt" = NOW() WHERE "id" = $3',
      [eventStart, eventEnd, ctx.event.id],
    );
    await db.query(
      'UPDATE "Action" SET "startDate" = $1, "endDate" = $2, "updatedAt" = NOW() WHERE "id" = $3',
      [action1Start, action1End, ctx.action1.id],
    );
    await db.query(
      'UPDATE "Action" SET "startDate" = $1, "endDate" = $2, "updatedAt" = NOW() WHERE "id" = $3',
      [action2Start, action2End, ctx.action2.id],
    );

    // SEGMENTO DE TESTES NEGATIVOS SPRINT10: um aluno nao pode registar presenca.
    await t.test('aluno nao pode registrar presenca', async () => {
      const denied = await ctx.student.post('/presences').send({ registrationId: ctx.registration1.id }).timeout({ deadline: 15000 });
      expectStatus(denied, 403, 'Aluno tenta registrar presenca');
      const count = await db.query('SELECT COUNT(*)::int AS total FROM "Presence" WHERE "registrationId" = $1', [ctx.registration1.id]);
      assert.equal(count.rows[0].total, 0, 'A tentativa nao autorizada criou presenca');
    });

    let response = await ctx.organizer.post('/presences').send({
      registrationId: ctx.registration1.id,
    }).timeout({ deadline: 15000 });
    expectStatus(response, [200, 201], 'Registro de presenca do inscrito');
    const presence = await db.query(
      'SELECT "id" FROM "Presence" WHERE "registrationId" = $1',
      [ctx.registration1.id],
    );
    assert.equal(presence.rowCount, 1, 'Presenca nao foi persistida exatamente uma vez');

    // SEGMENTO DE TESTES NEGATIVOS SPRINT10: presença e unica por inscricao.
    await t.test('presenca duplicada e rejeitada', async () => {
      const duplicatePresence = await ctx.organizer.post('/presences').send({ registrationId: ctx.registration1.id }).timeout({ deadline: 15000 });
      expectStatus(duplicatePresence, 409, 'Presenca duplicada');
      const count = await db.query('SELECT COUNT(*)::int AS total FROM "Presence" WHERE "registrationId" = $1', [ctx.registration1.id]);
      assert.equal(count.rows[0].total, 1, 'Foi persistida mais de uma presenca para a inscricao');
    });

    response = await ctx.organizer.post(`/actions/${ctx.action1.id}/close`).timeout({ deadline: 15000 });
    expectStatus(response, [200, 201], 'Encerramento da acao principal');
    response = await ctx.organizer.post(`/actions/${ctx.action2.id}/close`).timeout({ deadline: 15000 });
    expectStatus(response, [200, 201], 'Encerramento da acao auxiliar');
    response = await ctx.organizer.post(`/events/${ctx.event.id}/close`).timeout({ deadline: 15000 });
    expectStatus(response, [200, 201], 'Encerramento do evento');

    response = await ctx.organizer.post(`/certificates/registrations/${ctx.registration1.id}/issue`).send({}).timeout({ deadline: 20000 });
    expectStatus(response, [200, 201], 'Emissao de certificado');
    const certificate = await db.query(
      'SELECT c."id", c."validationCode", c."filePath" FROM "Certificate" c WHERE c."registrationId" = $1',
      [ctx.registration1.id],
    );
    assert.equal(certificate.rowCount, 1, 'Certificado nao foi persistido exatamente uma vez');
    ctx.certificate = certificate.rows[0];

    // SEGMENTO DE TESTES NEGATIVOS SPRINT10: reemissao deve ser idempotente e nao gerar duplicata.
    await t.test('reemissao de certificado retorna o existente', async () => {
      const repeatIssue = await ctx.organizer.post(`/certificates/registrations/${ctx.registration1.id}/issue`).send({}).timeout({ deadline: 20000 });
      expectStatus(repeatIssue, [200, 201], 'Reemissao idempotente de certificado');
      assert.equal(repeatIssue.body.alreadyExisted, true, 'Reemissao nao sinalizou o certificado existente');
      const count = await db.query('SELECT COUNT(*)::int AS total FROM "Certificate" WHERE "registrationId" = $1', [ctx.registration1.id]);
      assert.equal(count.rows[0].total, 1, 'Reemissao criou certificado duplicado');
    });

    response = await request(baseUrl).get(`/certificates/validate/${encodeURIComponent(ctx.certificate.validationCode)}`).timeout({ deadline: 15000 });
    expectStatus(response, 200, 'Validacao publica do certificado');
    assert.equal(response.body.valid, true, 'O certificado emitido nao foi validado como valido');

    response = await ctx.student.get(`/certificates/${ctx.certificate.id}/download`)
      .buffer(true)
      .parse(binaryParser)
      .timeout({ deadline: 20000 });
    expectStatus(response, 200, 'Download do PDF pelo participante');
    const pdf = Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.text || '');
    assert.ok(pdf.subarray(0, 4).toString('ascii') === '%PDF', 'O download nao contem uma assinatura PDF valida');

    // SEGMENTO DE TESTES NEGATIVOS SPRINT10: certificados privados nao sao acessiveis a outros participantes.
    await t.test('participante nao consulta nem baixa certificado de outra pessoa', async () => {
      const details = await ctx.student2.get(`/certificates/${ctx.certificate.id}`).timeout({ deadline: 15000 });
      expectStatus(details, 403, 'Consulta de certificado alheio');
      const download = await ctx.student2.get(`/certificates/${ctx.certificate.id}/download`).timeout({ deadline: 15000 });
      expectStatus(download, 403, 'Download de certificado alheio');
    });
  });

  await t.test('dashboard, relatorios e exportacoes autenticadas', async (t) => {
    if (!ctx.event || !ctx.organizer) return t.skip('Pre-requisito de dashboard falhou.');

    let response = await ctx.organizer.get('/dashboard/overview').query({ eventId: ctx.event.id }).timeout({ deadline: 20000 });
    expectStatus(response, 200, 'Dashboard overview');
    assert.equal(typeof response.body, 'object');

    response = await ctx.organizer.get('/dashboard/filters').timeout({ deadline: 20000 });
    expectStatus(response, 200, 'Filtros do dashboard');

    response = await ctx.organizer.get('/dashboard/events').query({ eventId: ctx.event.id }).timeout({ deadline: 20000 });
    expectStatus(response, 200, 'Indicadores por evento');

    response = await ctx.organizer.get('/dashboard/actions').query({ eventId: ctx.event.id }).timeout({ deadline: 20000 });
    expectStatus(response, 200, 'Indicadores por acao');

    for (const type of ['events', 'registrations', 'attendance', 'certificates']) {
      response = await ctx.organizer.get(`/reports/${type}`).query({ eventId: ctx.event.id }).timeout({ deadline: 20000 });
      expectStatus(response, 200, `Relatorio JSON ${type}`);
      assert.equal(typeof response.body, 'object');

      response = await ctx.organizer.get(`/reports/${type}/export`).query({ eventId: ctx.event.id, format: 'csv' }).timeout({ deadline: 20000 });
      expectStatus(response, 200, `Exportacao CSV ${type}`);
      const csv = typeof response.text === 'string' ? response.text : response.body.toString('utf8');
      assert.ok(csv.length > 10, `CSV ${type} esta vazio`);
    }

    response = await ctx.student.get('/reports').timeout({ deadline: 15000 });
    expectStatus(response, 403, 'Aluno sem permissao para relatorios');
  });
  // TESTES ADICIONAIS AUTH-02 AUTH-03 USR-01
  await t.test('AUTH-02: login rejeita credenciais inválidas sem emitir cookie', async () => {
    const invalidEmail = await agent().post('/auth/login').send({
      email: `inexistente-${runId}@example.test`,
      password: 'Senha-Incorreta-123!',
    }).timeout({ deadline: 15000 });

    expectStatus(invalidEmail, 401, 'Login com email inexistente');
    assert.equal(invalidEmail.headers['set-cookie'], undefined,
      'Login inválido não deve emitir cookie de autenticação');

    const invalidPassword = await agent().post('/auth/login').send({
      email: organizerEmail,
      password: 'Senha-Incorreta-123!',
    }).timeout({ deadline: 15000 });

    expectStatus(invalidPassword, 401, 'Login com senha incorreta');
    assert.equal(invalidPassword.headers['set-cookie'], undefined,
      'Senha incorreta não deve emitir cookie de autenticação');

    assert.equal(
      invalidEmail.body.message,
      invalidPassword.body.message,
      'As respostas não devem revelar se o email existe',
    );
  });

  await t.test('AUTH-03: logout limpa o cookie e o agente perde a sessão', async () => {
    const client = agent();

    let response = await client.post('/auth/login').send({
      email: organizerEmail,
      password: organizerPassword,
    }).timeout({ deadline: 15000 });

    expectStatus(response, [200, 201], 'Login antes do logout');
    assert.ok(response.headers['set-cookie'], 'Login não emitiu cookie');

    response = await client.post('/auth/logout').timeout({ deadline: 15000 });
    expectStatus(response, [200, 201], 'Logout');

    const cookies = response.headers['set-cookie'] || [];
    const clearingCookie = cookies.find((cookie) => /^access_token=/.test(cookie));
    assert.ok(clearingCookie, 'Logout não enviou instrução para limpar access_token');
    assert.match(clearingCookie, /Expires=/i,
      'Cookie de logout deveria ter expiração explícita');

    response = await client.get('/auth/me').timeout({ deadline: 15000 });
    expectStatus(response, 401, 'Identidade após logout');
  });

  await t.test('USR-01: cadastro rejeita dados inválidos e email duplicado', async () => {
    const base = newStudentPayload(91);

    const invalid = await agent().post('/auth/register').send({
      ...base,
      email: 'email-invalido',
      password: '123',
      passwordConfirmation: 'Outra-Senha-123!',
      isAdmin: true,
    }).timeout({ deadline: 15000 });

    expectStatus(invalid, 400, 'Cadastro com dados inválidos');
    assert.ok(invalid.body.message, 'Resposta de validação sem mensagem');

    const duplicate = await agent().post('/auth/register').send({
      ...base,
      email: ctx.studentUser.email,
    }).timeout({ deadline: 15000 });

    expectStatus(duplicate, 409, 'Cadastro com email já utilizado');
  });

  await t.test('USR-02: organizador não pode administrar usuários', async () => {
    for (const [method, route, payload] of [
      ['get', '/users', undefined],
      ['get', `/users/${ctx.studentUser.id}`, undefined],
      ['patch', `/users/${ctx.studentUser.id}/role`, { role: 'ADMIN' }],
      ['delete', `/users/${ctx.studentUser.id}`, undefined],
    ]) {
      let operation = ctx.organizer[method](route);
      if (payload) operation = operation.send(payload);

      const response = await operation.timeout({ deadline: 15000 });
      expectStatus(response, 403, `Organizador sem permissão: ${method.toUpperCase()} ${route}`);
    }
  });
});