# Aplicação e homologação — 27/10/2026

## Estado entregue

Patch aplicado na branch `feature/modernizacao-ui-figma`, sem commit, merge, reset ou alteração do banco principal. HEAD permanece `bd290b9cc0d85e7c504b8aae6a912388a8098dcd`. As alterações locais anteriores foram preservadas.

Backend iniciado em `http://localhost:3000`, com DATABASE_URL explicitamente substituída em memória por `sigeifce_homologacao`. O `.env` não foi alterado. O processo não observa alterações de arquivos: executa o código compilado.

**Para reiniciar esta homologação**, usar `node C:\Users\Afonso\Documents\ChatGPT\SIGEIFCE\iniciar-homologacao.cjs` depois de conferir que a porta está livre. Não usar o início padrão enquanto o `.env` ainda apontar para outro banco. O inicializador força homologação, usa processo oculto e grava o PID em `homologacao-evidencias\backend.json`. Não inclui credenciais em argumentos ou relatórios.

## Proteções e migração

- Branch, HEAD e hashes de todos os arquivos conferidos antes da aplicação.
- Backup de código e recibo: `C:\Users\Afonso\SIGEIFCE\SigeIFCE\_sige-rn06-backups\b961fb1b4c7b478d9849200f96ac7914`.
- Uma única migração pendente, `20261027210000_event_rn06_rn07`, aplicada exclusivamente em `sigeifce_homologacao`, porta local 5432.
- Backup PostgreSQL em formato custom criado antes da migração, com SHA-256 e inventário verificados. Não se declara ensaio de restauração: `pg_restore --list` verifica reconhecimento do arquivo, não restauração.
- Hashes de todos os dados anteriores das seis entidades foram comparados imediatamente antes/depois da migração e permaneceram iguais, desconsiderando apenas as cinco novas colunas nullable do evento.
- Após início do backend, o reconciliador RN07 pode atualizar estados e datas de encerramento dos eventos existentes, conforme suas datas. Isso é comportamento esperado da nova regra.

## Correção do empacotamento

A primeira compilação no original incluiu os arquivos TypeScript do backup. A compilação de validação isolada anterior não continha esse diretório. A pasta `_sige-rn06-backups` foi excluída de `tsconfig.build.json` e de `.gitignore`; as configurações anteriores também foram adicionadas ao recibo de backup. A compilação subsequente passou. O pacote V2 contém essa correção e substitui o pacote inicial para novas aplicações.

## Resultados no projeto aplicado

| Verificação | Resultado |
|---|---|
| Compilação | Passou com o backup presente |
| Backend | 22 suítes, 110 testes passaram |
| Frontend | 24 testes passaram |
| ESLint | Passou |
| Navegador no backend real | 12 testes passaram |
| Identidade do banco | Login HTTP confirmou usuários criados somente em homologação |
| Cancelamento vencedor | Seis disputas reais: cancelamento 200, presença antecipada 400, CANCELLED sem presença |
| RN06 | Publicação com campos completos, janela e vagas por usuário único entre ações validadas |
| RN07 | Consulta pública atualizou PUBLICADO para EM_ANDAMENTO e depois ENCERRADO nas fixtures temporárias |
| Presença retroativa | Registro permitido, cancelamento posterior bloqueado |
| Segurança | Aluno sem permissão para presença; origem externa bloqueada por CSRF |
| Certificado legado | Download PDF 200, bytes/SHA iguais ao arquivo existente, autenticidade válida e acesso de terceiro 403 |
| Limpeza | Todos os registros temporários removidos; contagens iniciais restauradas |

Contagens antes/depois dos testes: 24 usuários, 13 eventos, 37 ações, 82 inscrições, 53 presenças e um certificado. Não foram redefinidas senhas de usuários existentes nem recalculados certificados.

As fixtures SQL de datas foram normalizadas para ISO UTC, para evitar a interpretação local de `Date` pelo driver `pg` em colunas sem timezone. O teste respeitou o tempo de espera do limitador de requisições; a proteção permaneceu ativa.

## Evidências e rollback

Evidências sanitizadas: `C:\Users\Afonso\Documents\ChatGPT\SIGEIFCE\homologacao-evidencias`. Incluem relatório de migração, backup SHA, HTTP, limpeza, PID e log do backend. O dump contém dados de homologação e **não** integra o ZIP nem deve ser commitado.

O rollback de arquivos foi ensaiado no Windows PowerShell 5.1, incluindo recusa de hashes divergentes. **Como a migração já foi aplicada, não executar o rollback simples com `-DatabaseUnchanged` neste ambiente.** Esse parâmetro seria falso. A enumeração EM_ANDAMENTO exige reversão coordenada de aplicação e banco, com backend parado e ensaio separado, ou correção adiante. Nenhuma restauração de banco ou rollback destrutivo é automático.

Permanecem fora desta homologação: carga de 300 usuários, restauração integral de dump em banco descartável e revisão completa da ERS. O ambiente está pronto para revisão funcional; isso não constitui liberação de produção.
