'use strict';
// Executar apos build/migrate em cluster descartavel; nunca le .env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
process.env.DOTENV_CONFIG_PATH = require('node:path').resolve('__sige_no_env__.missing');
if (fs.existsSync(process.env.DOTENV_CONFIG_PATH)) throw new Error('Arquivo reservado de isolamento ja existe.');
const url = new URL(process.env.DATABASE_URL || 'http://invalid');
if (url.hostname !== '127.0.0.1' || url.port !== '55439' || url.pathname !== '/sigeifce_disposable') {
  throw new Error('Guard: somente cluster descartavel 127.0.0.1:55439/sigeifce_disposable.');
}
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
process.env.MOCK_MODE = 'false';
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { JwtService } = require('@nestjs/jwt');
const request = require('supertest');
const { AppModule } = require('../../dist/src/app.module');
const { PrismaService } = require('../../dist/src/database/prisma.service');
const { EventsService } = require('../../dist/src/modules/events/events.service');

(async () => {
  let app;
  const results = [];
  try {
    app = await NestFactory.create(AppModule, { logger: ['error'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    const db = app.get(PrismaService), jwt = app.get(JwtService), events = app.get(EventsService);
    const tag = crypto.randomUUID();
    const users = await Promise.all(['ORGANIZADOR', 'ALUNO', 'ALUNO'].map((role, i) => db.user.create({
      data: { email: `${tag}-${i}@test.invalid`, password: 'unused-test-hash', name: 'Teste', role },
    })));
    const tokens = users.map(u => jwt.sign({ sub: u.id, role: u.role, sv: 0 }));
    const http = (method, path, token, body) => {
      const req = request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${tokens[token]}`);
      return body ? req.send(body) : req;
    };
    const now = Date.now(), future = new Date(now + 72 * 3600000), end = new Date(now + 96 * 3600000);
    const base = { title: 'Evento teste RN06', description: 'Descricao do evento de teste',
      startDate: future, endDate: end, location: 'IFCE', organizerId: users[0].id, status: 'PUBLICADO' };
    const event = await db.event.create({ data: base }); // legado, campos novos NULL
    const action = await db.action.create({ data: { eventId: event.id, title: 'Oficina', description: 'Teste',
      startDate: future, endDate: end, durationMinutes: 60, capacity: 20 } });
    for (let i = 0; i < 6; i++) {
      const testUser = await db.user.create({ data: { email: `${tag}-race-${i}@test.invalid`, password: 'unused', role: 'ALUNO' } });
      const token = jwt.sign({ sub: testUser.id, role: 'ALUNO', sv: 0 });
      const registration = await db.registration.create({ data: { userId: testUser.id, actionId: action.id } });
      const [cancel, presence] = await Promise.all([
        request(app.getHttpServer()).delete(`/registrations/actions/${action.id}`).set('Authorization', `Bearer ${token}`),
        http('post', '/presences', 0, { registrationId: registration.id }),
      ]);
      assert.equal(cancel.status, 200); assert.equal(presence.status, 400);
      const persisted = await db.registration.findUnique({ where: { id: registration.id }, include: { presence: true } });
      assert.equal(persisted.status, 'CANCELLED'); assert.equal(persisted.presence, null);
      assert.equal((await http('post', '/presences', 0, { registrationId: registration.id })).status, 400);
      results.push({ scenario: 'cancelamento vencedor paralelo', case: i + 1, cancel: cancel.status, presence: presence.status, state: persisted.status });
    }
    const pastAction = await db.action.create({ data: { eventId: event.id, title: 'Retroativo', description: 'Teste',
      startDate: new Date(now - 7200000), endDate: new Date(now - 3600000), durationMinutes: 60, capacity: 3 } });
    const pastReg = await db.registration.create({ data: { userId: users[1].id, actionId: pastAction.id } });
    assert.equal((await http('post', '/presences', 1, { registrationId: pastReg.id })).status, 403);
    assert.equal((await http('post', '/presences', 0, { registrationId: pastReg.id })).status, 201);
    assert.equal((await http('delete', `/registrations/actions/${pastAction.id}`, 1)).status, 409);
    results.push({ scenario: 'presenca retroativa e autorizacao', approved: true });

    const capped = await db.event.create({ data: { ...base, category: 'Oficina', workloadMinutes: 120, totalCapacity: 1,
      registrationStartDate: new Date(now - 3600000), registrationEndDate: new Date(now + 48 * 3600000) } });
    const actions = await Promise.all([1, 2].map(i => db.action.create({ data: {
      eventId: capped.id, title: `Acao ${i}`, description: 'Teste', startDate: future, endDate: end, durationMinutes: 60, capacity: 10,
    } })));
    const capRace = await Promise.all([1,2].map((u,i) => http('post', `/registrations/actions/${actions[i].id}`, u)));
    assert.deepEqual(capRace.map(r => r.status).sort(), [201,409]);
    const winner = capRace[0].status === 201 ? 1 : 2;
    assert.equal((await http('post', `/registrations/actions/${actions[winner === 1 ? 1 : 0].id}`, winner)).status, 201);
    assert.equal((await db.registration.findMany({ where: { action: { eventId: capped.id }, status: 'ACTIVE' }, distinct: ['userId'] })).length, 1);
    results.push({ scenario: 'vagas entre acoes e participante unico', approved: true });
    const outsider = winner === 1 ? 2 : 1;
    assert.equal((await http('delete', `/registrations/actions/${actions[0].id}`, winner)).status, 200);
    assert.equal((await http('post', `/registrations/actions/${actions[0].id}`, outsider)).status, 409);
    assert.equal((await http('delete', `/registrations/actions/${actions[1].id}`, winner)).status, 200);
    assert.equal((await http('post', `/registrations/actions/${actions[0].id}`, outsider)).status, 201);
    results.push({ scenario: 'vaga liberada somente na ultima inscricao ativa', approved: true });
    await db.event.update({ where: { id: capped.id }, data: { registrationStartDate: new Date(now + 3600000) } });
    assert.equal((await http('post', `/registrations/actions/${actions[0].id}`, winner === 1 ? 2 : 1)).status, 409);
    results.push({ scenario: 'janela de inscricoes', approved: true });

    const lower = await db.event.create({ data: { ...base, totalCapacity: 2 } });
    const lowerAction = await db.action.create({ data: { eventId: lower.id, title: 'Limite', description: 'Teste',
      startDate: future, endDate: end, capacity: 10, durationMinutes: 60 } });
    for (const user of users.slice(1)) await db.registration.create({ data: { userId: user.id, actionId: lowerAction.id } });
    await assert.rejects(events.update(lower.id, { totalCapacity: 1 }, { id: users[0].id, role: 'ORGANIZADOR' }), /Vagas inferiores/);
    assert.equal((await db.event.findUnique({ where: { id: lower.id } })).totalCapacity, 2);
    results.push({ scenario: 'reducao de vagas rejeitada sem alterar estado', approved: true });

    const draft = await db.event.create({ data: { ...base, status: 'RASCUNHO' } });
    await db.action.create({ data: { eventId: draft.id, title: 'Acao', description: 'Teste', startDate: future, endDate: end, capacity: 2, durationMinutes: 60 } });
    await assert.rejects(events.publish(draft.id, { id: users[0].id, role: 'ORGANIZADOR' }), /RN06/);
    await db.event.update({ where: { id: draft.id }, data: { category: 'Oficina', workloadMinutes: 60, totalCapacity: 2,
      registrationStartDate: new Date(now - 3600000), registrationEndDate: future } });
    assert.equal((await events.publish(draft.id, { id: users[0].id, role: 'ORGANIZADOR' })).status, 'PUBLICADO');
    await events.synchronizeLifecycle(future);
    assert.equal((await db.event.findUnique({ where: { id: draft.id } })).status, 'EM_ANDAMENTO');
    await events.synchronizeLifecycle(end);
    await events.synchronizeLifecycle(end);
    assert.equal((await db.event.findUnique({ where: { id: draft.id } })).status, 'ENCERRADO');
    results.push({ scenario: 'publicacao RN06 e limites RN07 idempotentes', approved: true });
    fs.mkdirSync('evidence', { recursive: true });
    fs.writeFileSync('evidence/http-rn06-rn07.json', JSON.stringify({ database: 'sigeifce_disposable', date: new Date().toISOString(), approved: true, results }, null, 2));
    console.log('OK: HTTP/SQL descartavel, 6 cancelamentos vencedores, presenca, vagas, janela, publicacao e ciclo.');
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

