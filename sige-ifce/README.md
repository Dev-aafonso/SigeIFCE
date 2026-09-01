# SIGE IFCE

Sistema de Gerenciamento de Eventos Científicos do IFCE.

## Stack

- Node.js
- TypeScript
- NestJS
- Prisma ORM
- PostgreSQL
- Handlebars
- HTMX

## Estrutura

- src/       -> backend
- views/     -> templates HTML
- public/    -> arquivos públicos
- prisma/    -> banco de dados
- test/      -> testes
- docs/      -> documentação
- .github/   -> automações do GitHub

## Instalação

`ash
npm install
``

## Desenvolvimento

`ash
npm run start:dev
`

## Banco

`ash
npm run prisma:generate
npm run prisma:migrate
`

## Testes

`ash
npm test
npm run test:e2e
`

