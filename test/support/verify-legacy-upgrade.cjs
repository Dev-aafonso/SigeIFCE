'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.DOTENV_CONFIG_PATH = path.resolve('__sige_no_env__.missing');
if (fs.existsSync(process.env.DOTENV_CONFIG_PATH)) throw new Error('Arquivo reservado de isolamento ja existe.');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');
const target = new URL(process.env.DATABASE_URL || 'http://invalid');
if (target.hostname !== '127.0.0.1' || target.port !== '55439' || target.pathname !== '/sigeifce_legacy_disposable')
  throw new Error('Guard: somente sigeifce_legacy_disposable na porta descartavel.');
// Precondicao: as nove migracoes anteriores, sem a migracao RN06/RN07.
(async () => {
  const db = new Client({ connectionString: target.href });
  await db.connect();
  try {
    const tables = ['User','Event','Action','Registration','Presence','Certificate'];
    for (const table of tables) assert.equal(Number((await db.query(`SELECT count(*) n FROM "${table}"`)).rows[0].n), 0);
    await db.query(`INSERT INTO "User" (id,email,password,name,role) VALUES ('legacy-user','legacy@test.invalid','unused','Legado','ORGANIZADOR');
      INSERT INTO "Event" (id,title,description,"startDate","endDate","organizerId","updatedAt",status)
      VALUES ('legacy-event','Legado','Descricao legado','2099-01-01','2099-01-02','legacy-user',now(),'PUBLICADO');
      INSERT INTO "Action" (id,"eventId",title,description,"startDate","endDate","durationMinutes",capacity,"updatedAt")
      VALUES ('legacy-action','legacy-event','Acao','Descricao','2099-01-01','2099-01-02',60,3,now());
      INSERT INTO "Registration" (id,"userId","actionId","updatedAt") VALUES ('legacy-reg','legacy-user','legacy-action',now());
      INSERT INTO "Presence" (id,"registrationId","responsibleId","updatedAt") VALUES ('legacy-presence','legacy-reg','legacy-user',now());
      INSERT INTO "Certificate" (id,"userId","eventId","actionId","registrationId","validationCode","certifiedMinutes","attendancePercent","filePath")
      VALUES ('legacy-cert','legacy-user','legacy-event','legacy-action','legacy-reg','LEGACY-TEST',60,100,'test-only.pdf');`);
    const before = {};
    for (const table of tables) before[table] = (await db.query(`SELECT to_jsonb(t) row FROM "${table}" t ORDER BY id`)).rows;
    const migration = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
      cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', env: { ...process.env, JITI_FS_CACHE: 'false' },
    });
    if (migration.status !== 0) throw new Error(migration.stderr || migration.stdout);
    const columns = ['category','workloadMinutes','registrationStartDate','registrationEndDate','totalCapacity'];
    for (const table of tables) {
      const selection = table === 'Event' ? 'to_jsonb(t) - $1::text[]' : 'to_jsonb(t)';
      const rows = (await db.query(`SELECT ${selection} row FROM "${table}" t ORDER BY id`, table === 'Event' ? [columns] : [])).rows;
      assert.deepEqual(rows, before[table]);
    }
    const event = (await db.query('SELECT * FROM "Event" WHERE id=$1', ['legacy-event'])).rows[0];
    for (const key of columns) assert.equal(event[key], null);
    fs.mkdirSync('evidence', { recursive: true });
    fs.writeFileSync('evidence/legacy-upgrade.json', JSON.stringify({ approved: true, database: 'sigeifce_legacy_disposable',
      oldRowsPreserved: tables, nullableNewFields: columns, date: new Date().toISOString() }, null, 2));
    console.log('OK: migracao preserva evento, usuario, acao, inscricao, presenca e certificado legados.');
  } finally { await db.end(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
