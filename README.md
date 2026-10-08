# SIGE IFCE

Sistema de Gerenciamento de Eventos Científicos do Instituto Federal de Educação, Ciência e Tecnologia do Ceará (IFCE).

> Sistema web para gerenciamento de eventos científicos, inscrições, ações, certificados, usuários e permissões, desenvolvido com arquitetura modular e foco em manutenção, escalabilidade e organização do código.

---

## Sobre o Projeto

O **SIGE IFCE** tem como objetivo fornecer uma plataforma para gerenciamento centralizado de eventos científicos do IFCE.

O sistema contempla funcionalidades relacionadas a:

* gerenciamento de usuários e perfis;
* autenticação e controle de acesso;
* criação e gerenciamento de eventos;
* gerenciamento de ações vinculadas aos eventos;
* inscrições em eventos e ações;
* acompanhamento da participação dos usuários;
* emissão e gerenciamento de certificados;
* controle de permissões;
* disponibilização de informações e recursos administrativos.

A aplicação utiliza uma arquitetura modular inspirada nos princípios de **Domain-Driven Design (DDD)**, buscando manter as responsabilidades separadas e os domínios do sistema isolados.

---

# Tecnologias

## Backend

* **Node.js** — ambiente de execução JavaScript;
* **TypeScript** — tipagem estática e desenvolvimento do backend;
* **NestJS** — framework principal da aplicação;
* **Prisma ORM** — camada de acesso ao banco de dados;
* **PostgreSQL** — sistema gerenciador de banco de dados;
* **Class Validator** — validação dos dados recebidos pela aplicação.

## Interface

* **HTML5** — estrutura das páginas;
* **CSS3** — estilização da interface;
* **Handlebars** — renderização dos templates;
* **HTMX** — atualização dinâmica de partes da interface sem necessidade de uma SPA tradicional.

## Ferramentas

* **Git** — controle de versão;
* **GitHub** — hospedagem do repositório e colaboração;
* **Visual Studio Code** — ambiente de desenvolvimento;
* **Docker** — configuração e execução de serviços;
* **GitHub Actions** — integração e automação do processo de desenvolvimento.

---

# Arquitetura

O SIGE IFCE utiliza uma arquitetura modular organizada por domínios de negócio.

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

A responsabilidade de cada área é separada da seguinte forma:

```text
src/
│
├── common/
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   ├── pipes/
│   └── utils/
│
├── database/
│   ├── prisma.module.ts
│   └── prisma.service.ts
│
└── modules/
    ├── auth/
    ├── users/
    ├── events/
    ├── registrations/
    ├── actions/
    └── certificates/
```

### Camada visual

Os templates são mantidos separadamente do código de negócio:

```text
views/
├── layouts/
├── pages/
└── components/
```

Essa separação permite que as regras de negócio permaneçam concentradas no backend enquanto a camada de apresentação permanece responsável pela geração do HTML.

---

# Fluxo da Aplicação

O fluxo principal do sistema é baseado em requisições HTTP processadas pelo NestJS e renderizadas dinamicamente para o navegador.

```text
┌──────────────┐
│   Browser    │
└──────┬───────┘
       │
       │ HTMX
       ▼
┌──────────────┐
│  Controller  │
└──────┬───────┘
       ▼
┌──────────────┐
│   Service    │
└──────┬───────┘
       ▼
┌──────────────┐
│    Prisma    │
└──────┬───────┘
       ▼
┌──────────────┐
│  PostgreSQL  │
└──────────────┘
```

Quando uma requisição é realizada pelo HTMX, o backend pode retornar apenas o fragmento HTML necessário para atualizar determinada região da interface.

Exemplo:

```html
<form
    hx-post="/events"
    hx-target="#lista-eventos"
    hx-swap="beforeend">
```

Nesse cenário:

1. o usuário envia o formulário;
2. o HTMX realiza a requisição;
3. o Controller recebe os dados;
4. o Service executa as regras de negócio;
5. o Prisma persiste os dados no PostgreSQL;
6. o NestJS renderiza o fragmento HTML correspondente;
7. o HTMX insere o resultado na página.

---

# Respostas HTMX

O backend utiliza os cabeçalhos HTTP fornecidos pelo HTMX para controlar o comportamento da interface.

Entre os principais recursos utilizados estão:

| Cabeçalho     | Finalidade                                              |
| ------------- | ------------------------------------------------------- |
| `HX-Request`  | Identificar requisições realizadas pelo HTMX            |
| `HX-Target`   | Identificar o elemento alvo da atualização              |
| `HX-Redirect` | Realizar redirecionamentos após operações bem-sucedidas |
| `HX-Trigger`  | Disparar eventos no frontend                            |
| `HX-Refresh`  | Solicitar atualização da página                         |

A aplicação possui componentes globais responsáveis pelo tratamento desses comportamentos, incluindo interceptadores, filtros e decorators.

---

# Tratamento de Erros

A aplicação diferencia erros de validação, autenticação, autorização e falhas internas.

Para erros de validação de formulários, o backend pode retornar novamente o fragmento HTML do formulário contendo as mensagens de erro.

Exemplo conceitual:

```text
Requisição
    ↓
Validação
    ↓
Dados inválidos
    ↓
HTTP 422
    ↓
Renderização do formulário
    ↓
HTMX substitui o fragmento
```

Para falhas internas, podem ser utilizados mecanismos como `HX-Trigger` para permitir que a interface apresente mensagens de erro ao usuário.

---

# Estrutura do Projeto

```text
sige-ifce/
│
├── .github/
│   ├── workflows/
│   ├── ISSUE_TEMPLATE/
│   └── pull_request_template.md
│
├── .vscode/
│   ├── settings.json
│   ├── extensions.json
│   └── launch.json
│
├── docs/
│   ├── arquitetura/
│   ├── diagramas/
│   ├── requisitos/
│   └── api/
│
├── prisma/
│   ├── migrations/
│   ├── schema.prisma
│   └── seed.ts
│
├── public/
│   ├── css/
│   ├── js/
│   ├── images/
│   └── icons/
│
├── src/
│   ├── common/
│   ├── database/
│   └── modules/
│
├── test/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── views/
│   ├── layouts/
│   ├── pages/
│   └── components/
│
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── package.json
├── README.md
├── tsconfig.json
└── nest-cli.json
```

---

# Pré-requisitos

Antes de executar o projeto, certifique-se de possuir:

* **Node.js**;
* **npm**;
* **Git**;
* **Docker e Docker Compose** ou uma instalação local do PostgreSQL;
* **Visual Studio Code** recomendado para desenvolvimento.

Para verificar as instalações:

```bash
node --version
npm --version
git --version
docker --version
```

---

# Instalação

## 1. Clonar o repositório

```bash
git clone <URL_DO_REPOSITORIO>
cd sige-ifce
```

## 2. Instalar as dependências

```bash
npm install
```

## 3. Configurar as variáveis de ambiente

Crie uma cópia do arquivo de exemplo:

```bash
cp .env.example .env
```

No Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Configure o arquivo `.env` de acordo com o ambiente local.

Exemplo:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sige_ifce?schema=public"
PORT=3000
JWT_SECRET="sua-chave-secreta"
```

---

# Banco de Dados

O SIGE IFCE utiliza **PostgreSQL** com **Prisma ORM**.

## Utilizando Docker

Inicialize o banco:

```bash
docker compose up -d
```

Verifique os containers:

```bash
docker compose ps
```

## Configuração do Prisma

Gere o Prisma Client:

```bash
npm run prisma:generate
```

Execute as migrations:

```bash
npm run prisma:migrate
```

Para abrir o Prisma Studio:

```bash
npm run prisma:studio
```

---

# Execução

## Ambiente de desenvolvimento

```bash
npm run start:dev
```

Após iniciar, a aplicação estará disponível na porta configurada no arquivo `.env`.

Por padrão:

```text
http://localhost:3000
```

## Ambiente de produção

Compile o projeto:

```bash
npm run build
```

Execute:

```bash
npm run start:prod
```

---

# Scripts Disponíveis

| Comando                   | Descrição                          |
| ------------------------- | ---------------------------------- |
| `npm run start`           | Inicia a aplicação                 |
| `npm run start:dev`       | Executa em modo de desenvolvimento |
| `npm run start:prod`      | Executa a versão compilada         |
| `npm run build`           | Compila o projeto                  |
| `npm run lint`            | Executa análise estática           |
| `npm run format`          | Formata o código                   |
| `npm test`                | Executa testes unitários           |
| `npm run test:watch`      | Executa testes em modo observação  |
| `npm run test:cov`        | Gera cobertura de testes           |
| `npm run test:e2e`        | Executa testes end-to-end          |
| `npm run prisma:generate` | Gera o Prisma Client               |
| `npm run prisma:migrate`  | Executa migrations                 |
| `npm run prisma:studio`   | Abre o Prisma Studio               |
| `npm run prisma:seed`     | Executa o seed do banco            |

---

# Desenvolvimento com Git

O projeto utiliza um fluxo baseado em branches.

```text
main
└── develop
    ├── feature/*
    ├── fix/*
    ├── refactor/*
    ├── test/*
    ├── docs/*
    └── chore/*
```

## Fluxo recomendado

Atualize a branch de desenvolvimento:

```bash
git checkout develop
git pull origin develop
```

Crie uma branch para sua tarefa:

```bash
git checkout -b feature/nome-da-feature
```

Exemplo:

```bash
git checkout -b feature/event-crud
```

Após implementar a funcionalidade:

```bash
git add .
git commit -m "feat(events): implement event creation"
```

Envie a branch:

```bash
git push -u origin feature/event-crud
```

Em seguida, abra um **Pull Request para `develop`**.

---

# Convenção de Branches

Utilize nomes objetivos e consistentes.

### Feature

```text
feature/event-crud
feature/event-actions
feature/auth-login
```

### Correção

```text
fix/registration-validation
fix/login-error
```

### Refatoração

```text
refactor/htmx-interceptor
refactor/events-service
```

### Testes

```text
test/events-service
test/auth
```

### Documentação

```text
docs/update-readme
docs/architecture
```

### Manutenção

```text
chore/update-dependencies
chore/configure-ci
```

---

# Convenção de Commits

O projeto utiliza **Conventional Commits**.

Formato:

```text
tipo(escopo): descrição
```

Tipos utilizados:

| Tipo       | Utilização                                 |
| ---------- | ------------------------------------------ |
| `feat`     | Nova funcionalidade                        |
| `fix`      | Correção de problema                       |
| `refactor` | Refatoração sem alteração de comportamento |
| `test`     | Testes                                     |
| `docs`     | Documentação                               |
| `chore`    | Configuração e manutenção                  |

Exemplos:

```bash
git commit -m "feat(events): implement event creation"
```

```bash
git commit -m "fix(auth): correct invalid credentials handling"
```

```bash
git commit -m "test(events): add event service tests"
```

```bash
git commit -m "docs(readme): update installation instructions"
```

---

# Testes

O projeto utiliza diferentes níveis de testes.

## Testes unitários

```bash
npm test
```

## Testes com cobertura

```bash
npm run test:cov
```

## Testes end-to-end

```bash
npm run test:e2e
```

Os testes são organizados em:

```text
test/
├── unit/
├── integration/
└── e2e/
```

---

# Qualidade do Código

Antes de abrir um Pull Request, recomenda-se executar:

```bash
npm run lint
npm test
npm run build
```

O objetivo é garantir que:

* o código siga o padrão definido;
* os testes estejam passando;
* o projeto compile corretamente;
* alterações incompatíveis sejam identificadas antes do merge.

---

# Segurança

Informações sensíveis **não devem ser versionadas no Git**.

Nunca envie para o repositório:

```text
.env
.env.production
senhas
tokens
chaves privadas
credenciais de serviços
```

As configurações necessárias devem ser documentadas no:

```text
.env.example
```

---

# Documentação

A documentação complementar do projeto está organizada na pasta:

```text
docs/
├── arquitetura/
├── diagramas/
├── requisitos/
└── api/
```

Os diagramas, especificações e demais documentos técnicos devem ser mantidos atualizados conforme a evolução do sistema.

---

# Contribuição

Para contribuir com o projeto:

1. Atualize a `develop`;
2. Crie uma branch específica para a tarefa;
3. Implemente a alteração;
4. Execute os testes e verificações;
5. Faça commits seguindo a convenção;
6. Envie a branch para o GitHub;
7. Abra um Pull Request para `develop`.

Alterações devem ser revisadas antes de serem integradas à branch de desenvolvimento.

---

# Organização da Equipe

Cada integrante deve trabalhar preferencialmente dentro do domínio ou responsabilidade definida para sua tarefa, evitando alterações desnecessárias em módulos de outros responsáveis.

Alterações que afetem múltiplos módulos devem ser comunicadas à equipe antes da implementação.

---

# Status do Projeto

**Em desenvolvimento.**

O projeto encontra-se em fase de implementação e evolução dos módulos funcionais, arquitetura, interface e infraestrutura.

---

# Licença

Projeto acadêmico desenvolvido no contexto do Instituto Federal de Educação, Ciência e Tecnologia do Ceará (IFCE).

A definição da licença de distribuição do projeto deverá ser realizada conforme as diretrizes estabelecidas pela instituição e pela equipe responsável.
