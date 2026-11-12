'use strict';
const { Client } = require('pg');
const crypto = require('node:crypto');
const argon2 = require('argon2');
const TARGET='sigeifce_homologacao';
const url=process.env.DATABASE_URL;
const pw=process.env.SIGE_DEMO_PASSWORD;
if (!url || !pw || pw.length<12) {console.error('Defina DATABASE_URL e SIGE_DEMO_PASSWORD (12+ caracteres).'); process.exit(1)}
let parsed;try {parsed=new URL(url)} catch {console.error('DATABASE_URL inválida');process.exit(1)}
if (!['127.0.0.1','localhost','::1'].includes(parsed.hostname.toLowerCase()) || decodeURIComponent(parsed.pathname.slice(1))!==TARGET){console.error('BLOQUEADO: o seed só executa em PostgreSQL local / '+TARGET);process.exit(1)}
function id(){return crypto.randomUUID()}
function iso(day,month,hour=9){return new Date(Date.UTC(2026,month-1,day,hour,0))}
(async()=>{
 const db=new Client({connectionString:url,connectionTimeoutMillis:10000}); await db.connect();let tx=false;
 try {
   const tables=await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'`);
   const present=new Set(tables.rows.map(r=>r.tablename));
   for(const table of ['User','Event','Action','Registration','Presence','Certificate']) if(!present.has(table))throw Error('Tabela não migrada: '+table);
   const counts=await db.query('SELECT (SELECT COUNT(*)::int FROM "User") u, (SELECT COUNT(*)::int FROM "Event") e, (SELECT COUNT(*)::int FROM "Action") a, (SELECT COUNT(*)::int FROM "Registration") r, (SELECT COUNT(*)::int FROM "Presence") p, (SELECT COUNT(*)::int FROM "Certificate") c');
   if (Object.values(counts.rows[0]).some(n=>Number(n)!==0))throw Error('Banco de homologação não está vazio; nenhum registro alterado.');
   const hash=await argon2.hash(pw);
   await db.query('BEGIN');tx=true;
   const roles=['ADMIN','ORGANIZADOR','PROFESSOR','ALUNO'];
   const users=[];
   for(let i=0;i<20;i++){
     const role=i===0?'ADMIN':i<=3?'ORGANIZADOR':i<=6?'PROFESSOR':'ALUNO';
     const email=i===0?'admin.demo@example.test':i<=3?`organizador${i}.demo@example.test`:i<=6?`professor${i-3}.demo@example.test`:`aluno${i-6}.demo@example.test`;
     const user={id:id(),name:i===0?'Administrador Demo':`Usuario Demonstracao ${String(i).padStart(2,'0')}`,email,role};
     await db.query('INSERT INTO "User" (id,name,email,password,role) VALUES ($1,$2,$3,$4,$5::"UserRole")',[user.id,user.name,user.email,hash,role]);users.push(user);
   }
   const events=[];const actions=[];
   const titles=['Semana da Computação','Encontro de Iniciação Científica','Oficina de Robótica','Jornada de Engenharia de Software','Simpósio de Tecnologia','Feira de Projetos Integradores','Seminário de Pesquisa','Mostra de Extensão','Encontro de Programação','Festival de Ciência','Congresso de Informática','Ciclo de Palestras'];
   for(let e=0;e<12;e++){
     const start=iso(2+e*2<=28?2+e*2:2+(e*2)%27,e<5?11:e<9?12:10,8);
     const end=new Date(start.getTime()+8*3600000);
     const status=e===10?'RASCUNHO':e===11?'CANCELADO':e===9?'ENCERRADO':'PUBLICADO';
     const ev={id:id(),title:`${titles[e]} 2026`,status,organizerId:users[1+e%3].id,start};
     await db.query(`INSERT INTO "Event" (id,title,description,"startDate","endDate",location,status,"organizerId","minAttendancePercent","publishedAt","canceledAt","closedAt","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7::"EventStatus",$8,75,$9,$10,$11,NOW(),NOW())`,[ev.id,ev.title,`Evento demonstrativo para testes do SIGE IFCE: ${ev.title}.`,start,end,'IFCE - Campus Cedro',status,ev.organizerId,status==='RASCUNHO'?null:start,status==='CANCELADO'?end:null,status==='ENCERRADO'?end:null]);events.push(ev);
     for(let a=0;a<3;a++){
       const from=new Date(start.getTime()+a*2*3600000);const to=new Date(from.getTime()+90*60000);
       const act={id:id(),eventId:ev.id,status:e===11?'CANCELADA':e===9?'ENCERRADA':'ATIVA',capacity: a===2?8:25};
       await db.query(`INSERT INTO "Action" (id,"eventId",title,description,"startDate","endDate","durationMinutes",capacity,location,status,"canceledAt","closedAt","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::"ActionStatus",$11,$12,NOW(),NOW())`,[act.id,ev.id,`${['Palestra','Oficina','Minicurso'][a]}: ${['Introdução ao tema','Aplicações práticas','Projeto colaborativo'][a]}`,`Atividade demonstrativa de ${ev.title}`,from,to,90,act.capacity,`Sala ${a+1}`,act.status,act.status==='CANCELADA'?to:null,act.status==='ENCERRADA'?to:null]);actions.push(act);
     }
   }
   let nreg=0,npres=0;
   // 80 registros distribuídos entre ações válidas, sem ultrapassar a capacidade.
   const eligible=actions.filter(a=>a.status==='ATIVA' && events.find(e=>e.id===a.eventId).status==='PUBLICADO');
   for(let i=0;i<80;i++){
     const act=eligible[i%eligible.length];const user=users[7+Math.floor(i/eligible.length)%13];
     // Distribuição circular sem duplicar o par usuário/ação.
     const keyUser=users[7+(Math.floor(i/eligible.length)+i%13)%13];
     const registrationId=id();const active=i%11!==0;
     await db.query(`INSERT INTO "Registration" (id,"userId","actionId",status,"createdAt","updatedAt","cancelledAt") VALUES ($1,$2,$3,$4::"RegistrationStatus",NOW(),NOW(),$5)`,[registrationId,keyUser.id,act.id,active?'ACTIVE':'CANCELLED',active?null:new Date()]);nreg++;
     if(active && npres<50 && i%4!==0){await db.query('INSERT INTO "Presence" (id,"registrationId","responsibleId","registeredAt","createdAt","updatedAt") VALUES ($1,$2,$3,NOW(),NOW(),NOW())',[id(),registrationId,events.find(e=>e.id===act.eventId).organizerId]);npres++}
   }
   await db.query('COMMIT');tx=false;
   console.log(JSON.stringify({database:TARGET,users:users.length,events:events.length,actions:actions.length,registrations:nreg,presences:npres,certificates:0,account:users[0].email},null,2));
 }catch(err){if(tx)await db.query('ROLLBACK').catch(()=>{});console.error('Nenhum dado parcial deve permanecer (transação revertida):',err.message);process.exitCode=1}
 finally {await db.end()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
