# SIGE IFCE — QA-01: diagnóstico de qualidade

**Data:** 26/11/2026 (Fortaleza)  
**Versão-alvo:** 1.0.0  
**Referência local auditada:** `641fa67` (`feature/eventos-inscricoes-professor`)  
**Referência implantada observada:** `bb773df` (`main`, Render)  
**Status:** diagnóstico parcial consolidado; homologação complementar pendente.

## 1. Escopo e restrições

A QA-01 estabelece a linha de base para a consolidação institucional do SIGE IFCE. O diagnóstico abrange arquitetura, código, dependências, regras de negócio, dados, testes e infraestrutura. As inspeções de produção foram somente de leitura; as migrações e os testes de interface e HTTP ocorreram em um PostgreSQL local descartável, sem dados institucionais. Nenhuma correção funcional, migração de produção, deploy ou alteração de configuração foi realizada.

Os resultados locais não devem ser atribuídos automaticamente ao commit implantado. O repositório local e a produção estavam em referências diferentes na data da coleta.

## 2. Arquitetura e inventário

| Camada | Implementação |
|---|---|
| Aplicação | NestJS e TypeScript; SPA HTML/CSS/JavaScript, HTMX e módulos ES |
| Persistência | PostgreSQL 18 no Neon, Prisma e 16 migrações; Compose local PostgreSQL 16 |
| Autenticação | JWT por sessão, perfis ADMIN, ORGANIZADOR, PROFESSOR e ALUNO |
| Funcionalidades | Eventos, ações, inscrições por ação, presenças, certificados, dashboard, relatórios, usuários e notificações |
| OCR | Serviço Python/PaddleOCR integrado ao módulo de relatórios |
| Entrega | Docker, GitHub Actions e Render |
| Testes | Jest, Node Test Runner, Playwright e fluxos HTTP com banco isolado |

O domínio está dividido em módulos do NestJS, embora presenças permaneça fora de `src/modules`. Os arquivos `events.js` (1.767 linhas não vazias), `events.css` (1.350) e `events.service.ts` (569) indicam concentração relevante de responsabilidades. O código compartilhado já possui abstrações úteis para navegação, controle de interface por perfil, formulários, buscas e histórico de inscrições.

## 3. Linha de base automatizada

| Verificação | Resultado em 26/11/2026 |
|---|---|
| Build | Aprovado |
| Prisma validate | Aprovado |
| Migrações em banco vazio | 16/16 aplicadas |
| Jest | 148/148 testes; 29 suítes |
| Frontend Node | 24/24 testes |
| Playwright em ambiente isolado | 21/23 testes |
| Integração HTTP básica | 10/10 testes |
| Total das suítes executadas | 203/205 (99,02%) |
| ESLint rigoroso | 13 advertências, zero erros; reprovado com `--max-warnings=0` |
| npm audit — produção | Zero vulnerabilidades reportadas |
| npm audit — incluindo desenvolvimento | 27 moderadas; zero altas e críticas |

### Cobertura Jest

| Linhas | Instruções | Funções | Ramificações |
|---:|---:|---:|---:|
| 52,12% | 51,36% | 46,00% | 46,41% |

A configuração atual inclui código gerado automaticamente. A métrica deve ser normalizada e a meta de 85% deve ser aplicada sobre código autoral, com relatório de cobertura e controle de regressão na CI.

As falhas E2E estão em `test/e2e/certificates-ui.spec.ts` e `test/e2e/participants-ui.spec.ts`. Ambos receberam mensagem de sessão ausente ao carregar os recursos; há indícios de fixtures desatualizadas diante da seleção por nome e identificador do evento. A causa deve ser confirmada antes de alterar a aplicação ou o teste. Os artefatos locais de falha estão em `test-results`.

Os fluxos HTTP completos com alterações de domínio não foram executados: o runner existente possui proteção de branch que não autoriza a referência auditada. Não contornar a proteção; adequar o runner e homologar sua alternativa isolada na QA-08.

## 4. Integridade dos dados de produção

Consultas agregadas e somente de leitura ao projeto Neon confirmado pelo responsável, na branch `production`, banco `sigeifce`.

| Entidade | Registros |
|---|---:|
| Usuários | 42 |
| Eventos | 13 |
| Ações | 38 |
| Inscrições | 180 |
| Presenças | 18 |
| Certificados | 2 |
| PDFs de certificados armazenados | 2 |

| Verificação | Ocorrências |
|---|---:|
| Migrações aplicadas | 16/16 |
| Ações acima da capacidade | 0 |
| Eventos acima da capacidade de participantes únicos | 0 |
| Sobreposições de horários em inscrições ativas (históricas) | 2 pares, 2 usuários |
| Sobreposições em ações futuras ou em andamento | 0 |
| Ações fora do intervalo do evento ou com intervalo inválido | 0 |
| Eventos com intervalo inválido | 0 |
| Presenças associadas a inscrições canceladas | 0 |
| Responsáveis por presença ausentes | 0 |
| Autores de digitalização ausentes | 0 |

As verificações representam uma fotografia dos dados da data de auditoria, não uma garantia de prevenção futura. O modelo mantém unicidade de inscrição por usuário e ação, presença por inscrição e código de certificado. Campos de responsabilidade e autoria precisam de política explícita de integridade referencial e retenção.

## 5. Infraestrutura e desempenho

O Render apresentou deploy `bb773df` ativo, plano gratuito, uma instância, deploy automático por commit e endpoint público `/health` respondendo HTTP 200. A configuração de health check HTTP não estava preenchida. A janela observada de 24 horas apresentou amostras de memória, mas dados insuficientes para CPU e p95. Portanto, a meta de latência ainda não foi aferida.

No Neon, a tabela `EventCover` ocupa cerca de 31 MB, acima das demais relações de dados da aplicação. Redução de dimensões, compressão, cache e política de armazenamento devem ser avaliados conforme a qualidade visual e o volume real. Há uma branch de homologação e duas branches identificadas como backup; sua existência não substitui um teste de restauração.

## 6. Funcionalidades aprovadas

| ID | Situação encontrada | Critério mínimo para conclusão |
|---|---|---|
| F01 | Interceptor de auditoria estruturada existente | Persistência, rastreabilidade, consulta autorizada, retenção e testes |
| F02 | QR Code e validação pública presentes | Validar certificado válido, inválido, revogado e disponibilidade do destino público, minimizando dados pessoais |
| F03 | Lista de espera não presente no modelo | Fila por ação, ordenação, promoção consistente e notificação |
| F04 | Não existe regra geral de conflito no fluxo de inscrição | Impedir sobreposição entre inscrições por ação, inclusive entre eventos; contemplar alterações de horário |
| F05 | Transações serializáveis e mecanismos de capacidade existentes | Testes concorrentes em banco isolado, verificando capacidade de ação e participantes únicos no evento |
| F06 | Recursos de acessibilidade presentes | Avaliação automatizada e manual de navegação, contraste, foco, leitores de tela e WCAG 2.2 AA |

Nenhuma funcionalidade nova é considerada concluída neste relatório.

## 7. Registro de achados

Gravidade: alta = compromete critério essencial de qualidade, integridade ou lançamento; média = risco relevante de evolução, operação ou manutenção; baixa = melhoria localizada. A prioridade deve ser reavaliada após os testes de homologação.

| ID | Achado | Gravidade | Sprint | Próxima ação |
|---|---|---|---|---|
| QA-001 | Cobertura abaixo da meta | Alta | QA-08 | Normalizar cobertura, testar fluxos críticos |
| QA-002 | Auditoria administrativa ainda parcial | Alta | QA-02 | Consolidar registros e política de retenção |
| QA-003 | Regra de conflito de horários ausente | Alta | QA-04 | Definir sobreposição e critérios de aceitação |
| QA-004 | Lista de espera ausente | Alta | QA-04 | Modelar fila por ação |
| QA-005 | Concorrência de últimas vagas sem comprovação atual | Alta | QA-03 | Homologar cenários concorrentes isolados |
| QA-006 | CI sem meta mínima de cobertura | Média | QA-08 | Definir verificação obrigatória |
| QA-007 | Listagem de usuários sem paginação | Média | QA-06 | Planejar paginação e filtros |
| QA-008 | Backups antigos versionados | Média | QA-01 | Revisar necessidade e preservar histórico pertinente |
| QA-009 | 13 advertências de lint | Baixa | QA-01 | Ajustar tipagem dos testes |
| QA-010 | Documentação de comandos desatualizada | Média | QA-10 | Sincronizar README e scripts reais |
| QA-011 | Dois conflitos históricos de inscrição | Alta | QA-04 | Definir tratamento de registros existentes sem apagar histórico |
| QA-012 | Duas falhas E2E | Alta | QA-08 | Confirmar adequação das fixtures e comportamento |
| QA-013 | Health check HTTP não configurado | Média | QA-09 | Definir e homologar estratégia de prontidão |
| QA-014 | Render implanta por commit sem gate de CI configurado no serviço | Média | QA-09 | Alinhar release à aprovação de CI |
| QA-015 | Runner HTTP completo bloqueia a branch atual | Média | QA-08 | Ajustar compatibilidade mantendo isolamento |
| QA-016 | Capas de eventos concentram armazenamento | Média | QA-06 | Medir impacto e alternativas |
| QA-017 | Integridade referencial de autoria/responsabilidade não formalizada | Média | QA-03 | Definir chaves e regras de exclusão |
| QA-018 | Restauração de backups sem evidência atualizada | Alta | QA-09 | Ensaiar restauração e verificar integridade |
| QA-019 | 27 alertas moderados de dependências de desenvolvimento | Média | QA-02 | Avaliar correções compatíveis e reauditar |
| QA-020 | Mensagens com codificação incorreta | Média | QA-07 | Corrigir textos UTF-8 e testar mensagens exibidas |
| QA-021 | Implementação legada e componentes sem referência | Média | QA-01 | Catalogar e remover apenas após regressão |
| QA-022 | Módulos de eventos com alta concentração de responsabilidades | Média | QA-01 | Planejar extração incremental, evitando reescrita integral |
| QA-023 | Dependência `dotenv` usada sem declaração direta | Média | QA-01 | Declarar explicitamente e validar instalação limpa |
| QA-024 | Divergência de versões PostgreSQL local e CI/produção | Média | QA-09 | Padronizar ambientes ou homologar ambas as versões |
| QA-025 | Ciclo de vida e encerramento de processos requerem validação operacional | Média | QA-09 | Testar encerramento controlado e reconciliação após reinício |
| QA-026 | OCR sem homologação operacional e auditoria de dependências Python atualizadas | Média | QA-02/QA-09 | Confirmar serviço, configuração, limites e dependências |

### Evidência de manutenção

- `src/common/filters/htmx-exception.filter.ts` e `src/common/pipes/validation.pipe.ts` são arquivos vazios.
- `HtmxInterceptor` e `HtmxRequest` não possuem referências encontradas fora das próprias declarações. Revisar antes de remover.
- `web/shared/js/sprint8.js` é carregado no HTML, mas os seletores de inicialização `data-s8-*` não foram localizados nos fragmentos atuais. Verificar o comportamento antes de descontinuar.
- Existem funções equivalentes de formatação de datas e escape de texto distribuídas no frontend. A refatoração deve preservar comportamento e proteção de dados exibidos.
- Busca por padrões de corrompimento UTF-8 em 158 arquivos identificou 13 candidatos; uma mensagem incorreta foi efetivamente visualizada nos testes E2E.

## 8. Critérios de encerramento da QA-01

| Verificação do planejamento | Estado |
|---|---|
| Inspeção da arquitetura | Mapeada; OCR operacional pendente |
| Identificação de bugs e funcionalidades incompletas | Achados catalogados; fluxos completos e falhas E2E pendentes |
| Eliminação de código duplicado e desnecessário | Candidatos identificados; nenhuma remoção nesta auditoria |
| Identificação de débitos técnicos | Registro de 26 achados consolidado |
| Revisão de módulos e componentes | Inventário e concentrações identificados |
| Consistência das regras de negócio | Integridade agregada e revisão inicial; homologação completa pendente |

Não declarar a auditoria integral concluída antes de homologar os fluxos restantes, revisar a matriz completa de verificações, aferir acessibilidade/desempenho e acordar o plano para cada débito. A etapa de implementação deverá ocorrer em branches isoladas conforme o planejamento das sprints.

## 9. Acompanhamento das melhorias de interface e navegação

Na branch `qa/mobile-navegacao-acessibilidade`, foram implementadas antecipadamente melhorias alinhadas à F06 e à QA-07: responsividade dos certificados e do resumo de inscrições, legibilidade do botão de fechar evento, rotas semânticas com History API, metadados de compartilhamento e navegação por teclado. O cartão institucional PNG de 1200 × 630 é servido como recurso público após a implantação.

As URLs canônicas da SPA são `/entrar`, `/cadastro`, `/escolher-perfil`, `/painel`, `/eventos`, `/inscricoes`, `/participantes`, `/certificados`, `/relatorios`, `/usuarios` e `/configuracoes`. `/validar-certificado` é o endereço da consulta de autenticidade; o destino dos QR Codes já emitidos foi preservado. Endereços antigos com hash são reconhecidos e convertidos, sem colidir com as rotas JSON da API.

A regressão isolada de navegador passou em 26/26 testes. As duas falhas originais (certificados e participantes) foram resolvidas com a atualização das fixtures para o fluxo atual de pesquisa por nome de evento. Novos cenários verificam acesso direto, recarga, histórico, teclado em abas e modais, menu lateral mobile, recurso público de compartilhamento e larguras em tela de 390 px. Também foi verificado que o foco não é indevidamente transferido durante a conclusão assíncrona de um módulo.

O resultado é da branch de trabalho, não da produção. A conformidade integral WCAG 2.2 AA, os índices Lighthouse e a aparência dos cards nas plataformas sociais ainda requerem homologação específica após a implantação. Nenhuma migração ou alteração de produção foi feita nessa implementação.
