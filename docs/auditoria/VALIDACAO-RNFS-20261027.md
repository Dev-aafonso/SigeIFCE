# Restauração e desempenho — 27/10/2026

## Resultado e alcance

Restauração real do backup de homologação aprovada em PostgreSQL independente. Ensaio curto de leitura com 300 usuários simultâneos aprovado no perfil medido. Nenhuma mudança funcional adicional, conexão ao banco principal, merge ou commit nesta etapa. O servidor de homologação na porta 3000 foi mantido separado dos ensaios.

## RNF Confiabilidade: restauração executada

O SHA-256 do dump criado antes da migração RN06/RN07 foi comparado ao relatório de backup antes de restaurar. `pg_restore --exit-on-error --no-owner --no-privileges` restaurou efetivamente o arquivo em `sigeifce_restore_disposable`, criado vazio na instância PostgreSQL 18 em `127.0.0.1:55439`. Nenhum banco existente foi sobrescrito. O script recusa executar se o nome de destino já existir.

Os hashes canônicos de todos os registros das seis entidades foram comparados com o relatório capturado antes da migração original. Todos conferiram: 24 usuários, 13 eventos, 37 ações, 82 inscrições, 53 presenças e um certificado. A restauração recuperou as nove migrações anteriores. Em seguida, a nova migração foi aplicada ao banco restaurado; as mesmas contagens e hashes permaneceram iguais, desconsiderando apenas as novas colunas nullable do evento. O histórico passou a dez migrações.

Isso valida recuperação **dos dados e do esquema do banco** para este backup. O dump não contém os PDFs do armazenamento de arquivos; restauração do diretório de certificados, retenção, RPO/RTO e recuperação completa de produção permanecem fora do ensaio. O download e a autenticidade do PDF legado já foram validados na etapa anterior, sem alterar seu conteúdo.

Evidência: `restauracao-real.json` no pacote complementar. Script do ensaio: `C:\Users\Afonso\Documents\ChatGPT\SIGEIFCE\ensaiar-restauracao.cjs`. O script não é idempotente por sobrescrita: um destino existente exige novo planejamento; não o remove automaticamente.

## RNF Desempenho: leitura concorrente

Backend adicional executado a partir do código compilado da branch em `127.0.0.1:55441`, conectado exclusivamente ao banco restaurado na porta 55439. Foram criados 300 usuários ALUNO distintos nesse banco, com JWTs válidos mantidos somente em memória. Cada usuário usou um endereço loopback próprio, simulando clientes distintos e mantendo o limitador por IP ativo. Não foram alterados os guards, limites, pool de conexões ou código de negócio para o ensaio.

Cada usuário fez 12 requisições sequenciais, com 100 ms de intervalo, alternando quatro rotas. Os usuários começaram em paralelo. A latência inclui a espera no cliente, conexão inicial, processamento HTTP e leitura completa da resposta.

| Métrica | Resultado |
|---|---|
| Usuários distintos | 300 |
| Pico de requisições simultâneas | 300 |
| Total de requisições | 3.600 |
| Respostas HTTP 200 | 3.600 |
| Erros / rejeições 429 | 0 / 0 |
| Duração medida | 5,637 s |
| p95 geral | 709,49 ms |
| p99 geral | 920,99 ms |

| Operação | Requisições | p95 | p99 |
|---|---:|---:|---:|
| Eventos públicos, limite 20 | 900 | 709,07 ms | 789,68 ms |
| Detalhe de ação pública | 900 | 503,25 ms | 543,57 ms |
| Histórico pessoal, limite 10 | 900 | 912,17 ms | 937,74 ms |
| Sessão autenticada | 900 | 355,39 ms | 389,61 ms |

Critério do ensaio: 300 usuários, pico de pelo menos 300 requisições, zero erros e p95 geral abaixo de 3 segundos. Resultado aprovado. **Não se declara aprovação integral do RNF de desempenho**: a base é pequena, os usuários temporários não têm histórico e o teste não cobre carga sustentada, rede externa, login com Argon2, emissão de PDFs, relatórios ou escritas concorrentes. A escolha de misturas e duração representativas de produção ainda depende da ERS completa e do perfil esperado de uso.

Evidência: `carga-300-usuarios.json`. Script: `C:\Users\Afonso\Documents\ChatGPT\SIGEIFCE\ensaiar-carga.cjs`. O script exige o banco descartável e remove seus usuários ao final. O backend de carga foi encerrado e a instância PostgreSQL descartável será desligada ao concluir esta etapa; a homologação da porta 3000 continua independente.

## Revisão e próximas pendências

Esta etapa acrescenta evidência à matriz de rastreabilidade; não substitui os resultados anteriores nem libera produção. Permanecem pendentes a ERS integral, acessibilidade, requisitos funcionais ainda não cobertos, ensaio sustentado de desempenho e recuperação dos arquivos de certificados. O backup e os dados restaurados ficam somente na máquina local e não integram o pacote de evidências sanitizadas.
