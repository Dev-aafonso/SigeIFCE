# Matriz de rastreabilidade — Ciclos de auditoria 2–4

**Base de evidências:** código enviado em 27/10/2026, pacote do Ciclo 1 V2 e logs de testes fornecidos. O status abaixo NÃO comprova aprovação completa dos RFs.

## Situação atual — após homologação e ensaios de 27/10/2026

Esta seção prevalece sobre o retrato histórico abaixo. Evidências: `HOMOLOGACAO-RN06-RN07-20261027.md` e `VALIDACAO-RNFS-20261027.md`. Aprovação integral da ERS continua pendente.

| Escopo | Situação atual |
|---|---|
| RN06 / RN07; RF06–RF08, RF10, RF12 e RF22 | Implementados e homologados no escopo documentado; campos aditivos e compatibilidade de legados validados |
| RN12/RN15; RF13/RF16 | Seis cancelamentos vencedores HTTP/SQL, presença antecipada rejeitada e presença retroativa preservada |
| RF14 | Capacidade por ação e por participante único entre ações cobertas pelos testes documentados |
| RF18 | PDF legado idêntico, autenticidade válida e acesso de terceiro bloqueado |
| RNF Confiabilidade | Restore real do banco e migração sobre os dados restaurados aprovados; armazenamento de PDFs e RPO/RTO pendentes |
| RNF Desempenho | Ensaio curto de leitura aprovado: 300 usuários, 3.600 respostas 200, p95 709,49 ms; perfil sustentado e escritas pendentes |
| RNF Segurança | RBAC, CSRF e proteção de sessão cobertos pelos testes existentes; não equivale a auditoria integral de segurança |
| Demais RFs/RNFs e acessibilidade | Mantêm as ressalvas históricas até evidência específica e revisão da ERS |

## Retrato histórico da auditoria inicial

| Código | Escopo ERS | Evidência / situação |
|---|---|---|
| RF01 | Cadastro | Implementado; regressao obrigatoria |
| RF02 | Autenticacao e sessao | Patch proposto: versao de sessao; teste HTTP necessario |
| RF03 | Recuperacao de senha | PENDENTE (Should Have) |
| RF04 | Perfil de usuario | Implementado parcialmente; telefone/politica de exclusao pendente |
| RF05 | Perfis e acesso | Guard revalida role; equivalencia COORDENADOR/PROFESSOR pendente |
| RF06 | Cadastro de eventos | PENDENTE RN06: categoria, janela, vagas, carga |
| RF07 | Edicao de eventos | Ciclo 1 protege acoes, demais regras RN07 pendentes |
| RF08 | Publicacao de eventos | PENDENTE campos obrigatorios RN06 |
| RF09 | Cancelamento de evento | Cancelamento logico; justificativa pendente |
| RF10 | Eventos publicos | Consulta PUBLICADO; estado EM_ANDAMENTO pendente |
| RF11 | Filtros | Titulo e datas; categoria pendente |
| RF12 | Inscricao | Ciclo 1 adicionou status/evento/prazo; janela formal pendente |
| RF13 | Cancelamento de inscricao | Ciclo 2 propoe lock na mesma inscricao da presenca |
| RF14 | Vagas | Ciclo 1 lock em Action; teste paralelo real pendente |
| RF15 | Participantes | Implementado; teste de escopo cruzado pendente |
| RF16 | Presenca | Ciclo 2 propoe transacao lock; teste concorrencia pendente |
| RF17 | Certificado por evento | Homologacao funcional anterior; novos testes de cancelamento requeridos |
| RF18 | Validacao e download | Homologacao funcional anterior; teste de legado/QR invalido pendente |
| RF19 | Dashboard | Implementado; auditoria dos totais por SQL pendente |
| RF20 | Relatorios | Implementados; consistencia de exportacao/escopo pendente |
| RF21 | Acoes | Ciclo 1 valida vagas/periodo; estados RN07 pendentes |
| RF22 | Inscricao por acao | Ciclo 1 protege disponibilidade; RN06 janela e capacidade geral pendentes |

## RN e RNF prioritários — retrato histórico

| Documento | Situação | Próva necessária |
|---|---|---|
| RN06 | NÃO CONFORME | Migração de Evento, DTOs, UI, backfill e regras de publicação |
| RN07 | NÃO CONFORME | Estado EM_ANDAMENTO e encerramento automático verificáveis |
| RN12/RN15 | PATCH PROPOSTO | Corrida cancelamento/presença com transação e HTTP simultâneos |
| RN13/RN21 | Ciclo 1 implantado | Concorrência de inscrições contra redução de vagas |
| RN14 | Parcial | Acesso entre dois organizadores e alunos |
| RN23 | Cenário demonstrado | Elegibilidade limiar, legados, codes revogados |
| RNF Segurança | PATCH PROPOSTO | Verificar logout global, downgrade de ADMIN e usuário removido |
| RNF Desempenho | PENDENTE | 300 usuários simultâneos, p95 < 3 segundos |
| RNF Confiabilidade | PENDENTE | Restore validado em banco descartável |
| RNF Acessibilidade | PENDENTE | Teclado, contraste, foco, rótulos e leitor de tela |
| RNF Implantação | Parcial | Docker Compose com HTTPS válido, PostgreSQL e migrations CI |

## Critério para mover status para APROVADO
- Arquivo/endpoint específico identificado, caso de teste executado contra commit candidato, resultado esperado/obtido e evidência anexa.
- Qualquer falha crítica aberta impede merge.
- Aprovação do responsável de requisitos para alterações de RN06/RN07, papéis, retenção e escopo do MVP.

## Atualizacao de 27/10/2026 - continuidade
As linhas acima registram a auditoria anterior. RN06/RN07 receberam implementacao aditiva e validacao isolada nesta continuidade. Consulte RN06-RN07-20261027.md e as evidencias do pacote; a conformidade integral da ERS permanece pendente de revisao e homologacao operacional.

