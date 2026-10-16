# Implantacao do SIGE IFCE

## Requisitos

- Node.js 22 ou versao compativel com as dependencias do projeto.
- npm.
- PostgreSQL para execucao local.
- Docker Desktop com Docker Compose para executar os contêineres.

## Variaveis de ambiente

O arquivo `.env` contem configuracoes locais e segredos e nao deve ser versionado.
Use `.env.example` como referencia, mantendo os valores reais apenas no `.env`.

Gere um segredo JWT localmente com:

```powershell
node -p "require('node:crypto').randomBytes(32).toString('hex')"
```

Defina `JWT_SECRET` com o resultado. Use uma senha PostgreSQL forte e aleatoria.
Quando executar a aplicacao diretamente no computador, `DATABASE_URL` deve apontar
para o host e a porta do banco, usando credenciais correspondentes.

No Compose, a aplicacao usa o nome de servico `postgres` para acessar o banco.
A porta publicada para o computador e `5433` por padrao, para reduzir conflitos
com uma instalacao local do PostgreSQL.

## Executar com Docker Compose

Depois de instalar e iniciar o Docker Desktop:

1. Confira que `.env` contem `JWT_SECRET` e `POSTGRES_PASSWORD`.
2. Valide a configuracao:

   ```powershell
   docker compose config --quiet
   ```

3. Construa e inicie o banco e a aplicacao:

   ```powershell
   docker compose up --build -d
   ```

4. Consulte os registros:

   ```powershell
   docker compose logs -f app
   ```

5. Teste a pagina inicial:

   ```powershell
   Invoke-WebRequest http://localhost:3000/ -UseBasicParsing
   ```

O contêiner da aplicacao aguarda o banco ficar saudavel, aplica as migracoes
pendentes com `prisma migrate deploy` e inicia o servidor.

O Dockerfile nao copia `.env` para a imagem. Os certificados gerados sao guardados
em um volume persistente.

## Execucao local sem Docker

Com o banco PostgreSQL local iniciado e `DATABASE_URL` configurada:

```powershell
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm run start:prod
```

Para desenvolvimento:

```powershell
npm run start:dev
```

## Verificacoes

```powershell
npm run build
npm run test -- --runInBand
npm run lint -- --max-warnings=0
npm run prisma:validate
npm run test:integration
npm run test:e2e
```

O teste `npm run test:backend-flows` cria um banco descartavel e exige a branch
`feature/SPRINT10-12`. Leia as protecoes do script antes da execucao.

## Persistencia e limpeza

`docker compose down` encerra os contêineres sem apagar os volumes.

**Cuidado:** `docker compose down -v` remove os volumes, incluindo os dados do banco
e os arquivos de certificados persistidos. Nao use esse comando se precisar manter
esses dados.

O valor `POSTGRES_PASSWORD` precisa ser definido antes de iniciar o Compose.
Os valores de exemplo nao devem ser usados em um ambiente publico de producao.

## Seguranca do cookie de autenticacao

Para testes locais por HTTP, `COOKIE_SECURE=false` permite que o cliente
local envie o cookie sem TLS. Use esse valor somente em ambiente local.

Em producao, sirva a aplicacao por HTTPS e configure `COOKIE_SECURE=true`.
Nao exponha o ambiente HTTP local em redes publicas.
