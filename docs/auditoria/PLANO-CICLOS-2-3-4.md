# SIGE IFCE — Auditoria integrada: Ciclos 2, 3 e 4

Data: 27/10/2026. Fonte: arquivos de codigo enviados em `auditoria-sige-codigo-critico-20261027-081138.zip`, com Ciclo 1 V2 sobreposto. **Este pacote nao e uma declaracao de conformidade integral da ERS.**

## Ciclo 2 — integridade
- Cancelamento e registro de presenca usam o mesmo `SELECT ... FOR UPDATE` da linha de `Registration`, dentro de transacoes `Serializable`.
- Checagens de status, presenca, certificado, organizador e antecedencia sao refeitas **apos** o lock.
- Requisoes simultaneas devem terminar em um dos resultados validos: cancelamento confirmado e presenca rejeitada; ou presenca confirmada e cancelamento rejeitado.
- Pendencias: testes reais com duas conexoes e concorrencia; auditoria de outros escritores da tabela.

## Ciclo 3 — seguranca de sessao
- `User.sessionVersion` e coluna aditiva (`DEFAULT 0`).
- Novo JWT inclui `sv`; o guard consulta o registro atual e valida id, perfil e versao.
- Logout incrementa a versao, invalidando **todas** as sessoes simultaneamente daquele usuario (inclusive tokens Bearer).
- Troca de senha e de perfil invalidam sessoes preexistentes; exclusao do usuario desabilita o JWT em requisicoes seguintes.
- **Impacto proposital:** tokens emitidos antes da migracao deixam de funcionar; usuarios precisarao fazer login outra vez.
- A migracao deve ser aplicada antes de reiniciar qualquer backend com este patch; nunca usar a URL do banco principal nos testes.
- Pendencias: testes HTTP reais de login/logout, roles por endpoint e politica formal da ERS para papéis Coordenador vs Professor.

## Ciclo 4 — conformidade RN06/RN07 e RNFs
- **Nao incluimos uma migracao improvisada de RN06/RN07** porque alteraria schema, DTOs, formulários, filtros publicos, ciclo de vida, calculo de certificados e processos de homologacao.
- RN06 da ERS exige titulo, descricao, categoria, periodo do evento, local, carga horaria, janela de inscricoes e total de vagas.
- RN07 exige `PUBLICADO → EM_ANDAMENTO → ENCERRADO` em transicoes automaticas.
- Requer novo desenho aprovado, backfill para eventos legados e transicoes testadas antes do deploy. Nao declare conformidade enquanto nao existir a implementacao validada.
- Docker: CI usa Node 24 e Dockerfile Node 22; `APP_URL` Compose tem default HTTP mesmo em producao, incompativel com PDF HTTPS; exigir dominio real e HTTPS antes de deploy, sem inserir senhas em repositorio.
- RNF-CON01: testar `pg_restore --list` nao e uma restauracao, deve executar restauracao em banco descartavel e comparar dados.
- RNF-DES: executar carga do sistema de homologacao (pelo menos 300 usuarios simultaneos, 95% abaixo de 3 s conforme ERS), com metricas e limiares registrados.
- RNF-SEG e acessibilidade: testar CSRF, JWT antigo, controle de escopo por organizador e navegacao por teclado; identificar e corrigir achados antes de producao.
- Teste de certificados legados: verificar download e autenticidade apos migracao de sessao.

## Ordem de execucao
1. Aplicar o patch protegido com backup. Rodar `npm run prisma:generate`, `npm run prisma:validate`, `npm run build`, `npm test -- --runInBand`, `npm run test:frontend`, `npm run lint`, `npm run test:e2e`.
2. Confirmar a branch `feature/modernizacao-ui-figma`. Parar Node/NestJS.
3. Fazer backup do banco `sigeifce_homologacao` e aplicar `prisma migrate deploy` **somente** com DATABASE_URL apontando exclusivamente para homologacao; `prisma migrate status`.
4. Reiniciar backend apontando para homologacao e repetir a bateria HTTP real, inclusive dois requests concorrentes, revogacao de token e certificado legado.
5. Atualizar a matriz RF01–RF22 e Plano de Testes com evidencias; implementar RN06/RN07 separadamente antes do PR final.
6. Validar Docker em ambiente isolado, backup/restore e RNFs antes de release.

## Dados sensiveis
Nao inclua `.env`, tokens, senhas ou dump em commits e evidencias. Nunca execute `prisma migrate reset` em banco com dados.
