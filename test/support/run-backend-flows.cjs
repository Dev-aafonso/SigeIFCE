'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { Client: PgClient } = require('pg');
class Client extends PgClient {
  constructor(config) {
    super({
      ...config,
      connectionTimeoutMillis: 10000,
      query_timeout: 30000,
    });
  }
}
const dotenv = require('dotenv');

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, '.env');
const RUN_ID = `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${crypto.randomBytes(3).toString('hex')}`;
const DB_NAME = `sige_s10_test_${RUN_ID.toLowerCase()}`;
const EVENT_TITLE = `SIGE Sprint10 Integration ${RUN_ID}`;
const LOG_PATH = path.join(os.tmpdir(), `sige-s10-test-server-${RUN_ID}.log`);
let createdDb = false;
let server;
let serverLogFd;
let testDbUrl;
let adminUrl;
let exitStatus = 1;

function redact(text) {
  return String(text || '').replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '<DATABASE_URL ocultada>');
}
function shell(command, env) {
  const result = spawnSync(command, {
    cwd: ROOT,
    env,
    shell: true,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    timeout: 300000,
  });
  if (result.stdout) process.stdout.write(redact(result.stdout));
  if (result.stderr) process.stderr.write(redact(result.stderr));
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Comando falhou (${result.status}): ${command}`);
}
async function getFreePort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    listener.once('listening', resolve);
    listener.once('error', reject);
  });
  const port = listener.address().port;
  await new Promise((resolve, reject) => listener.close((err) => err ? reject(err) : resolve()));
  return port;
}
async function waitForServer(baseUrl, child, logFile) {
  let spawnError;
  const onSpawnError = (error) => { spawnError = error; };
  child.on('error', onSpawnError);
  const deadline = Date.now() + 60000;
  let lastError;
  try {
    while (Date.now() < deadline) {
      if (spawnError) {
        throw new Error('Falha ao criar processo do servidor: ' + spawnError.message + '. Log: ' + logFile);
      }
      if (child.exitCode !== null) {
        throw new Error('Servidor de teste terminou prematuramente com codigo ' + child.exitCode + '. Log: ' + logFile);
      }
      try {
        const response = await fetch(baseUrl + '/', { signal: AbortSignal.timeout(3000) });
        if (response.status === 200) return;
        lastError = new Error('GET / respondeu HTTP ' + response.status);
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    throw new Error('Servidor de teste nao ficou pronto em 60 segundos: ' + (lastError ? lastError.message : 'sem resposta') + '. Log: ' + logFile);
  } finally {
    child.off('error', onSpawnError);
  }
}
async function stopServer() {
  if (!server) return;
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => server.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (server.exitCode === null) {
      server.kill('SIGKILL');
      await Promise.race([
        new Promise((resolve) => server.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    }
  }
  server = undefined;
  if (serverLogFd !== undefined) {
    try { fs.closeSync(serverLogFd); } catch {}
    serverLogFd = undefined;
  }
}
async function cleanCertificateFiles(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const result = await client.query(
      'SELECT c."filePath" FROM "Certificate" c JOIN "Event" e ON e."id" = c."eventId" WHERE e."title" = $1',
      [EVENT_TITLE],
    );
    const safeRoot = path.resolve(ROOT, 'storage', 'certificates');
    let removed = 0;
    for (const row of result.rows) {
      const file = path.resolve(ROOT, row.filePath);
      if ((file === safeRoot || file.startsWith(safeRoot + path.sep)) && fs.existsSync(file)) {
        fs.rmSync(file, { force: true });
        removed++;
      }
    }
    if (removed) console.log(`PDFs temporarios do teste removidos: ${removed}`);
  } catch (error) {
    console.warn(`Aviso: limpeza de PDF de teste incompleta: ${redact(error.message)}`);
  } finally {
    await client.end().catch(() => {});
  }
}
async function dropDatabase() {
  if (!createdDb || !adminUrl) return;
  let client;
  try {
    client = new Client({ connectionString: adminUrl });
    await client.connect();
    await client.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [DB_NAME],
    );
    await client.query(`DROP DATABASE IF EXISTS "${DB_NAME}"`);
    console.log(`Banco de teste descartavel removido: ${DB_NAME}`);
    createdDb = false;
  } catch (error) {
    console.error(`ATENCAO: nao foi possivel remover o banco temporario ${DB_NAME}: ${redact(error.message)}`);
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

(async () => {
  try {
    const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
    if (branch.status !== 0 || !['feature/SPRINT10-12', 'integracao/teste-develop-main'].includes(branch.stdout.trim())) {
      throw new Error(`Branch inesperada (${branch.stdout ? branch.stdout.trim() : 'desconhecida'}). O runner so executa nas branches autorizadas.`);
    }
    if (!fs.existsSync(ENV_PATH)) throw new Error('.env nao encontrado; nenhum banco foi criado.');
    const envFile = dotenv.parse(fs.readFileSync(ENV_PATH));
    if (!envFile.DATABASE_URL) throw new Error('.env nao contem DATABASE_URL; nenhum banco foi criado.');

    adminUrl = envFile.DATABASE_URL;
    const baseUrl = new URL(adminUrl);
    if (!['postgres:', 'postgresql:'].includes(baseUrl.protocol)) {
      throw new Error('DATABASE_URL nao e PostgreSQL; nenhum banco foi criado.');
    }
    const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
    if (!localHosts.has(baseUrl.hostname.toLowerCase())) {
      throw new Error(`Por seguranca, a URL do banco precisa apontar para localhost; host detectado: ${baseUrl.hostname}. Nenhum banco foi criado.`);
    }
    const sourceDb = decodeURIComponent(baseUrl.pathname.replace(/^\/+/, ''));
    if (!sourceDb || /^sige_s10_test_/i.test(sourceDb)) {
      throw new Error('DATABASE_URL parece apontar para um banco temporario ou nao tem nome. Nenhuma alteracao foi feita.');
    }

    console.log(`Branch: ${branch.stdout.trim()}`);
    console.log(`Banco de origem detectado (sem credenciais): ${sourceDb}`);
    console.log(`Criando banco descartavel: ${DB_NAME}`);
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
      if (exists.rowCount) throw new Error('O nome aleatorio do banco ja existe; tente novamente.');
      await admin.query(`CREATE DATABASE "${DB_NAME}"`);
      createdDb = true;
    } finally {
      await admin.end();
    }

    const testUrl = new URL(adminUrl);
    testUrl.pathname = `/${DB_NAME}`;
    testDbUrl = testUrl.toString();

    const commonEnv = {
      ...envFile,
      ...process.env,
      DATABASE_URL: testDbUrl,
      NODE_ENV: 'test',
    };

    console.log('\n1/5 Compilando o backend...');
    shell('npm run build', commonEnv);

    console.log('\n2/5 Aplicando as migracoes apenas no banco descartavel...');
    shell('npx prisma migrate deploy', commonEnv);

    const port = await getFreePort();
    const base = `http://127.0.0.1:${port}`;
    const runEnv = {
      ...commonEnv,
      PORT: String(port),
      SIGE_TEST_RUN_BACKEND_FLOWS: '1',
      SIGE_TEST_RUN_ID: RUN_ID,
      SIGE_TEST_BASE_URL: base,
      SIGE_TEST_ORGANIZER_EMAIL: `s10-${RUN_ID.toLowerCase()}-organizer@example.test`,
      SIGE_TEST_ORGANIZER_PASSWORD: `S10-${crypto.randomBytes(20).toString('base64url')}!`,
    };

    console.log(`\n3/5 Iniciando servidor isolado em ${base}...`);
    serverLogFd = fs.openSync(LOG_PATH, 'a');
    const distRoot = path.join(ROOT, 'dist');
    const entryPointCandidates = [
      path.join(distRoot, 'main.js'),
      path.join(distRoot, 'src', 'main.js'),
      path.join(distRoot, 'main.cjs'),
      path.join(distRoot, 'src', 'main.cjs'),
      path.join(distRoot, 'main.mjs'),
      path.join(distRoot, 'src', 'main.mjs'),
    ];
    let entryPoint = entryPointCandidates.find((file) => fs.existsSync(file));
    if (!entryPoint) {
      const found = fs.existsSync(distRoot)
        ? fs.readdirSync(distRoot, { recursive: true }).filter((name) => /^main\.(?:js|cjs|mjs)$/i.test(path.basename(name)))
        : [];
      if (found.length === 1) {
        entryPoint = path.join(distRoot, found[0]);
      } else {
        throw new Error('Entry point compilado do NestJS nao encontrado de forma inequivoca. Procurados: ' + entryPointCandidates.map((file) => path.relative(ROOT, file)).join(', ') + '. Arquivos main encontrados em dist: ' + (found.join(', ') || 'nenhum') + '. Confira tsconfig.build.json e nest-cli.json.');
      }
    }
    console.log('Entry point compilado: ' + path.relative(ROOT, entryPoint));
    server = spawn(process.execPath, [entryPoint], {
      cwd: ROOT,
      env: runEnv,
      stdio: ['ignore', serverLogFd, serverLogFd],
      windowsHide: true,
    });
    server.on('error', (error) => {
      console.error('Falha ao iniciar o processo do servidor de teste: ' + error.message);
    });
    await waitForServer(base, server, LOG_PATH);

    console.log('\n4/5 Executando fluxos HTTP com usuarios e dados descartaveis...');
    await new Promise((resolve, reject) => {
      const testFile = path.join(ROOT, 'test', 'integration', 'backend-flows.integration.test.cjs');
      const child = spawn(process.execPath, [
        '--test',
        testFile,
      ], {
        cwd: ROOT,
        env: runEnv,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let finished = false;
      const timeout = setTimeout(() => {
        if (finished) return;
        finished = true;

        if (process.platform === 'win32') {
          spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            timeout: 10000,
          });
        } else {
          child.kill('SIGKILL');
        }

        reject(new Error('Testes HTTP excederam 180 segundos.'));
      }, 180000);

      child.stdout.on('data', (chunk) => process.stdout.write(redact(chunk.toString())));
      child.stderr.on('data', (chunk) => process.stderr.write(redact(chunk.toString())));

      child.once('error', (error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        reject(error);
      });

      child.once('close', (code) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);

        if (code === 0) resolve();
        else reject(new Error('Testes HTTP falharam com codigo ' + code));
      });
    });
    exitStatus = 0;
    console.log('\nFluxos de backend concluidos sem falhas.');
  } catch (error) {
    exitStatus = 1;
    console.error(`\nFALHA: ${redact(error && error.message ? error.message : error)}`);
    if (fs.existsSync(LOG_PATH)) {
      try {
        const lines = fs.readFileSync(LOG_PATH, 'utf8').split(/\r?\n/);
        console.error('\nUltimas linhas do log do servidor (segredos redigidos):');
        console.error(redact(lines.slice(-60).join('\n')));
      } catch {}
    }
  } finally {
    await stopServer();
    if (createdDb && testDbUrl) await cleanCertificateFiles(testDbUrl);
    await dropDatabase();
    console.log('\n5/5 Limpeza concluida (na medida permitida pelo usuario PostgreSQL).');
    console.log(`Log de inicializacao do servidor: ${LOG_PATH}`);
    process.exitCode = exitStatus;
  }
})();