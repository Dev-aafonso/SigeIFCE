'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const dotenv = require('dotenv');
const TARGET = 'sigeifce_homologacao';
(async()=>{
  const env = dotenv.parse(fs.readFileSync(path.resolve('.env')));
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL ausente do .env');
  const source = new URL(env.DATABASE_URL);
  if (!['localhost','127.0.0.1','::1'].includes(source.hostname.toLowerCase())) throw new Error('Host remoto bloqueado.');
  if (!['postgres:','postgresql:'].includes(source.protocol)) throw new Error('URL não é PostgreSQL.');
  const origin = decodeURIComponent(source.pathname.slice(1));
  if (origin !== 'sigeifce') throw new Error('Banco de origem inesperado: ' + origin);
  const client = new Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:10000});
  await client.connect();
  try {
    const r = await client.query('SELECT 1 FROM pg_database WHERE datname=$1',[TARGET]);
    if (r.rowCount) {console.log('Banco '+TARGET+' já existe. Não houve alteração.');return;}
    await client.query('CREATE DATABASE "'+TARGET+'"');
    console.log('Criado o banco isolado: '+TARGET);
  } finally {await client.end()}
})().catch(e=>{console.error('Falha segura:',e.message);process.exitCode=1});
