# SIGE IFCE

Sistema de Gerenciamento de Eventos Científicos do Instituto Federal de Educação, Ciência e Tecnologia do Ceará (IFCE).

## Sobre o projeto

O SIGE IFCE é um sistema web destinado ao gerenciamento de eventos científicos, permitindo a organização de eventos, inscrições, ações, emissão de certificados e controle de usuários e permissões.

O sistema foi desenvolvido com uma arquitetura modular baseada nos princípios de Domain-Driven Design (DDD), utilizando NestJS no backend, PostgreSQL como banco de dados e HTMX para atualização dinâmica das interfaces sem a necessidade de uma aplicação SPA tradicional.

## Stack tecnológica

### Backend

* Node.js
* TypeScript
* NestJS
* Prisma ORM
* PostgreSQL
* Class Validator

### Interface

* HTML5
* CSS
* Handlebars
* HTMX

### Ferramentas

* Git
* GitHub
* Visual Studio Code
* Docker

## Arquitetura

A aplicação está organizada em módulos de negócio independentes.

```text
src/
├── common/
├── database/
└── modules/
    ├── auth/
    ├── users/
    ├── events/
    ├── registrations/
    ├── actions/
    └── certificates/
```

A camada visual é organizada separadamente:

```text
views/
├── layouts/
├── pages/
└── components/
```

O fluxo principal da aplicação é:

```text
Browser
   ↓
HTMX
   ↓
NestJS Controller
   ↓
Service
   ↓
Prisma
   ↓
PostgreSQL
```

Quando necessário, o backend renderiza páginas completas ou fragmentos HTML que são inseridos dinamicamente pelo HTMX.

## Pré-requisitos

Antes de executar o projeto, instale:

* Node.js
* npm
* PostgreSQL ou Docker
* Git

## Instalação

Clone o repositório:

```bash
git clone <URL_DO_REPOSITORIO>
cd sige-ifce
```

Instale as dependências:

```bash
npm install
```

Configure as variáveis de ambiente:

```bash
cp .env.example .env
```

Configure a conexão com o PostgreSQL no arquivo `.env`.

Execute a geração do Prisma:

```bash
npm run prisma:generate
```

Execute as migrations:

```bash
npm run prisma:migrate
```

Inicie o ambiente de desenvolvimento:

```bash
npm run start:dev
```

A aplicação estará disponível na porta configurada no ambiente.

## Banco de dados

O projeto utiliza PostgreSQL com Prisma ORM.

O schema principal está localizado em:

```text
prisma/schema.prisma
```

As migrations ficam em:

```text
prisma/migrations/
```

Para abrir o Prisma Studio:

```bash
npm run prisma:studio
```

## Desenvolvimento

Crie uma branch específica para cada tarefa:

```bash
git checkout develop
git pull

git checkout -b feature/nome-da-feature
```

Após implementar a funcionalidade:

```bash
npm run lint
npm run test
npm run build
```

Em seguida:

```bash
git add .
git commit -m "feat(events): implement event creation"
git push origin feature/nome-da-feature
```

Depois, abra um Pull Request para `develop`.

## Convenção de branches

```text
main
develop

feature/*
fix/*
refactor/*
test/*
docs/*
chore/*
```

Exemplos:

```text
feature/event-crud
feature/event-actions
feature/auth-login
fix/registration-validation
refactor/htmx-interceptor
```

## Convenção de commits

O projeto utiliza Conventional Commits.

```text
feat: nova funcionalidade
fix: correção de problema
refactor: refatoração
test: testes
docs: documentação
chore: tarefas de manutenção
```

Exemplo:

```bash
git commit -m "feat(events): implement event creation"
```

## Testes

Testes unitários:

```bash
npm test
```

Testes com cobertura:

```bash
npm run test:cov
```

Testes end-to-end:

```bash
npm run test:e2e
```

## Estrutura do projeto

```text
sige-ifce/
├── .github/
├── docs/
├── prisma/
├── public/
├── src/
├── views/
├── test/
├── .env.example
├── docker-compose.yml
├── package.json
└── README.md
```

## Equipe

Projeto desenvolvido pela equipe responsável pelo SIGE IFCE.

## Status

Em desenvolvimento.
