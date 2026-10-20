FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY --chown=node:node . .

# Prisma 7 exige DATABASE_URL na configuracao durante generate.
# Esta URL e temporaria e nao e utilizada para conectar ao banco.
RUN DATABASE_URL="postgresql://postgres:build-only@localhost:5432/sige_ifce?schema=public" npx prisma generate

RUN npm run build

RUN mkdir -p /app/storage/certificates \
    && chown -R node:node /app/storage

ENV NODE_ENV=production

USER node

EXPOSE 3000

# Aplica apenas migracoes pendentes antes de iniciar a aplicacao.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
