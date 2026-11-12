-- Alteracao aditiva: invalida JWTs antigos por versao de sessao.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
