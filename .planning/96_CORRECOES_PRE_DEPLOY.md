# 96 - Correcoes / preparacao pre-deploy

Data/hora da validacao: 2026-05-04 23:42:01 -03:00
Fase: 0.9.2
Status: PREPARACAO PRE-DEPLOY COM BLOQUEIO DE RELEASE
Decisao final: BLOQUEADO

## A) Objetivo da fase
Remover ou explicitar os bloqueios herdados da Fase 0.9.1 e preparar uma decisao final sobre deploy controlado real.

Esta fase nao implementa IA/WhatsApp, nao cria feature nova, nao cria modulo novo, nao troca stack, nao refatora arquitetura, nao altera regra financeira, nao roda seed destrutivo, nao commita `.env` real, nao commita segredos e nao executa deploy real sem confirmacao humana.

## B) Bloqueios herdados da Fase 0.9.1
| Bloqueio | Status 0.9.2 | Evidencia / observacao |
| --- | --- | --- |
| Checklist visual humano desktop/mobile ainda nao executado | NAO TESTADO | Nenhuma evidencia humana/browser nova foi anexada nesta fase. Continua bloqueando deploy real. |
| Backup do banco alvo real ainda nao confirmado | NAO TESTADO | Nao ha confirmacao de banco alvo real nem backup registrado. Continua bloqueando deploy real. |
| Smoke contra ambiente alvo real ainda nao executado | NAO TESTADO | Script aceita `SMOKE_BASE_URL`, mas nenhuma URL alvo real foi informada/rodada nesta fase. |
| `CORS_ORIGIN` precisa estar configurado no alvo | PARCIAL | Implementacao e `.env.example` documentam a variavel; alvo real ainda nao confirmado. |
| `.env` real precisa estar fora do Git e validado | PARCIAL | `.env` esta ignorado e nao aparece no status; arquivo local atual nao esta pronto como env de alvo real. |
| Worktree ainda tinha alteracoes nao commitadas | FALHOU | `git status --short --branch` segue com branch `main...origin/main [ahead 1]`, arquivos modificados e arquivos de planejamento novos. |

## C) Evidencias coletadas nesta fase
| Item | Status | Resultado |
| --- | --- | --- |
| Documentos 92-95 lidos | PASSOU | Revisados checklists, deploy controlado, execucao manual e decisao bloqueada da Fase 0.9.1. |
| Logs e prioridades lidos | PASSOU | `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md` e `.planning/24_NEXT_PRIORITIES.md` confirmam maturidade atual e proxima prioridade 0.9.2. |
| `.env.example` inspecionado | PASSOU | Documenta producao controlada, `AUTH_SECRET` forte, `DATABASE_URL` sem segredo real e `CORS_ORIGIN`. |
| `src/http/app.ts` inspecionado | PASSOU | CORS usa `getAllowedCorsOrigins()` e policies sensiveis seguem owner-only. |
| `src/http/security.ts` inspecionado | PASSOU | `AUTH_SECRET` fraco/dev e segredo billing dev sao bloqueados em `NODE_ENV=production`. |
| `scripts/smoke-api-flow.ps1` inspecionado | PASSOU | Aceita `SMOKE_BASE_URL`, `SMOKE_UNIT_ID`, `SMOKE_OWNER_EMAIL` e `SMOKE_OWNER_PASSWORD`. |
| `public/index.html`, `public/app.js`, `public/modules/*.js`, `public/components/*.js` inspecionados | PARCIAL | Estrutura e pontos criticos foram revisados por leitura/grep; sem execucao visual humana. |
| Sintaxe ES module do frontend | PASSOU | `public/app.js`, `public/modules/*.js` e `public/components/*.js` passaram com `node --input-type=module --check` via stdin. |
| `package.json` inspecionado | PASSOU | Scripts essenciais existem: `build`, `test`, `test:db`, `smoke:api`, `db:generate`, `db:push`, `dev:api`. |
| `prisma/seed.ts` inspecionado | PASSOU | Seed limpa dados operacionais e permanece proibido para banco real. Nao foi executado. |

Observacao tecnica: uma tentativa inicial de `node --check` direto em arquivos `.js` ES module falhou porque o pacote raiz esta como `type: commonjs`. A verificacao correta foi rerodada com `node --input-type=module --check` recebendo o conteudo via stdin e passou.

## D) Checklist visual desktop
| Perfil | Item | Status | Resultado |
| --- | --- | --- | --- |
| Owner | Login como owner | NAO TESTADO | Requer execucao humana/browser com sessao real. |
| Owner | Dashboard abre | NAO TESTADO | Requer execucao visual desktop. |
| Owner | Agenda abre | NAO TESTADO | Requer execucao visual desktop. |
| Owner | PDV abre | NAO TESTADO | Requer execucao visual desktop. |
| Owner | Financeiro abre | NAO TESTADO | Requer execucao visual desktop. |
| Owner | Comissoes abre | NAO TESTADO | Requer execucao visual desktop. |
| Owner | Auditoria abre | NAO TESTADO | Requer execucao visual desktop. |
| Owner | Configuracoes abre | NAO TESTADO | Requer execucao visual desktop. |
| Owner | Menus nao quebram | PARCIAL | `ROLE_ACCESS.owner` permite todos os modulos; sem evidencia visual. |
| Owner | Sem erro visual critico | NAO TESTADO | Requer navegador/devtools. |
| Recepcao | Login/troca para recepcao | NAO TESTADO | Requer execucao humana/browser com token real. |
| Recepcao | Sessao real acompanha perfil visual | PARCIAL | `public/app.js` invalida sessao se role visual diverge da sessao; sem evidencia visual nova. |
| Recepcao | Nao ve Auditoria | PARCIAL | `ROLE_ACCESS.recepcao` nao inclui `auditoria`; sem evidencia visual. |
| Recepcao | Nao ve Financeiro global | PARCIAL | `ROLE_ACCESS.recepcao` nao inclui `financeiro`; sem evidencia visual. |
| Recepcao | Nao ve Comissoes | PARCIAL | `ROLE_ACCESS.recepcao` nao inclui `comissoes`; sem evidencia visual. |
| Recepcao | Nao ve Configuracoes | PARCIAL | `ROLE_ACCESS.recepcao` nao inclui `configuracoes`; sem evidencia visual. |
| Recepcao | Agenda/PDV funcionam conforme permitido | NAO TESTADO | Requer clique real no navegador. |
| Profissional | Login/troca para profissional | NAO TESTADO | Requer execucao humana/browser com token real. |
| Profissional | Sessao real acompanha perfil visual | PARCIAL | `public/app.js` valida role da sessao contra `state.role`; sem evidencia visual nova. |
| Profissional | Ve apenas permitido | PARCIAL | `ROLE_ACCESS.profissional` contem `agenda` e `dashboard`; sem evidencia visual. |
| Profissional | Nao acessa Auditoria/Financeiro/Comissoes/Configuracoes | PARCIAL | Menu e backend restringem; tentativa visual direta nao foi executada. |
| Profissional | Agenda/Dashboard nao quebram | NAO TESTADO | Requer clique real no navegador. |

## E) Checklist visual mobile
| Item | Status | Resultado |
| --- | --- | --- |
| Menu/mobile tabs | PARCIAL | `public/components/mobile-tabs.js` existe e `MOBILE_TABS` esta em `menu-config.js`; sem viewport mobile real. |
| Dashboard | NAO TESTADO | Requer largura mobile ou dispositivo real. |
| Agenda | NAO TESTADO | Requer largura mobile ou dispositivo real. |
| PDV | NAO TESTADO | Requer largura mobile ou dispositivo real. |
| Modais de checkout | NAO TESTADO | Requer clique real no fluxo de atendimento. |
| Modal de estorno | NAO TESTADO | Requer atendimento concluido e clique real. |
| Modal de devolucao | NAO TESTADO | Requer venda antiga/devolvivel e clique real. |
| Financeiro como owner | NAO TESTADO | Requer largura mobile com perfil owner. |
| Auditoria como owner | NAO TESTADO | Requer largura mobile com perfil owner. |
| Botoes clicaveis | NAO TESTADO | Requer interacao em browser/dispositivo. |
| Layout nao corta modais criticos | NAO TESTADO | Requer inspecao visual mobile. |
| Listas/tabelas comportamento aceitavel | PARCIAL | Existem listas mobile em areas como agendamentos, estoque e servicos; sem evidencia visual final. |

## F) Fluxos visuais operacionais minimos
| Fluxo | Status | Evidencia / resultado |
| --- | --- | --- |
| Agenda -> criar agendamento | NAO TESTADO | Fluxo API passou em fases anteriores; clique visual nao executado nesta fase. |
| Agenda -> confirmar | NAO TESTADO | Requer execucao visual. |
| Agenda -> iniciar | NAO TESTADO | Requer execucao visual. |
| Agenda -> checkout | NAO TESTADO | Requer execucao visual e validacao de feedback na UI. |
| Agenda -> validar financeiro | PARCIAL | Smoke local anterior validou API; tela Financeiro nao conferida visualmente nesta fase. |
| Agenda -> validar auditoria | PARCIAL | Smoke local anterior validou API; tela Auditoria nao conferida visualmente nesta fase. |
| PDV -> vender produto | NAO TESTADO | Requer execucao visual. |
| PDV -> ver historico | NAO TESTADO | Requer execucao visual. |
| PDV -> devolver produto antigo | NAO TESTADO | Requer massa de venda devolvivel e execucao visual. |
| PDV -> validar estoque | PARCIAL | Coberto por testes/smoke anteriores; tela Estoque nao conferida visualmente nesta fase. |
| PDV -> validar financeiro reverso | PARCIAL | Coberto por testes/smoke anteriores; tela Financeiro nao conferida visualmente nesta fase. |
| PDV -> validar auditoria | PARCIAL | Coberto por testes/smoke anteriores; tela Auditoria nao conferida visualmente nesta fase. |
| Comissao -> consultar | NAO TESTADO | Requer execucao visual. |
| Comissao -> pagar como owner | PARCIAL | Backend/testes anteriores cobrem; clique visual depende de comissao pendente preparada. |
| Comissao -> validar despesa financeira | PARCIAL | Backend/testes anteriores cobrem; tela Financeiro nao conferida visualmente nesta fase. |
| Comissao -> bloqueio recepcao/profissional | PARCIAL | Backend/testes e `ROLE_ACCESS` cobrem; tentativa visual direta nao executada. |
| Auditoria -> listar eventos | NAO TESTADO | Requer execucao visual como owner. |
| Auditoria -> filtrar por acao/entidade | NAO TESTADO | Requer execucao visual como owner. |
| Auditoria -> actor | PARCIAL | Backend/testes/smoke anteriores cobrem; tela nao conferida visualmente nesta fase. |
| Auditoria -> requestId/correlation-id | PARCIAL | Smoke envia `x-correlation-id`; tela nao conferida visualmente nesta fase. |
| Auditoria -> idempotencyKey | PARCIAL | UI renderiza campo de idempotency; sem inspecao visual no navegador. |

## G) Validacao de CORS_ORIGIN
| Item | Status | Resultado |
| --- | --- | --- |
| `.env.example` documenta `CORS_ORIGIN` | PASSOU | Contem exemplo seguro comentado: `https://barbearia.example.com`. |
| Valor pretendido para ambiente alvo | PARCIAL | Pretendido: dominio HTTPS real do frontend do ambiente alvo, por exemplo `https://barbearia.example.com`. Substituir pelo dominio real antes do deploy. |
| Origem unica ou lista | PARCIAL | Recomendado origem unica. Lista separada por virgula apenas se houver dominios reais distintos de frontend. |
| Exemplo seguro sem segredo | PASSOU | Exemplo nao contem segredo nem credencial. |
| Comportamento local sem `CORS_ORIGIN` | PASSOU | `getAllowedCorsOrigins()` retorna `true`, mantendo dev/local permissivo. |
| Comportamento producao com `CORS_ORIGIN` | PASSOU | Retorna string/lista de origens para `@fastify/cors`, restringindo o alvo configurado. |
| Bug simples encontrado | PASSOU | Nenhum bug simples encontrado na implementacao atual. Nenhuma alteracao de codigo foi feita nesta fase. |

## H) Validacao de `.env` real fora do Git
| Item | Status | Resultado |
| --- | --- | --- |
| `.env` esta no `.gitignore` | PASSOU | `.gitignore` contem `.env`. |
| `git check-ignore -v .env` | PASSOU | Confirmado por `.gitignore:8:.env`. |
| `.env.example` sem segredo real | PASSOU | Contem apenas exemplos locais/placeholders. |
| `.env` real nao aparece em `git status` | PASSOU | `git status --short --branch` nao lista `.env`. |
| `.env` existe no workspace | PASSOU | Existe arquivo local; valores nao foram impressos. |
| `DATA_BACKEND=prisma` no arquivo local atual | FALHOU | Validacao segura indicou que o `.env` local atual nao esta configurado como Prisma. |
| `AUTH_ENFORCED=true` no arquivo local atual | PASSOU | Validacao segura indicou `AUTH_ENFORCED=true`. |
| `AUTH_SECRET` forte no arquivo local atual | FALHOU | Validacao segura indicou segredo ausente de formato forte ou igual/dev-curto. Valor nao foi impresso. |
| `DATABASE_URL` presente fora do Git | PASSOU | Presenca confirmada sem imprimir valor. Alvo real nao confirmado. |
| `CORS_ORIGIN` configurado no arquivo local atual | FALHOU | Validacao segura indicou ausencia local. Deve ser configurado no alvo. |
| `NODE_ENV=production` no arquivo local atual | FALHOU | Validacao segura indicou que o arquivo local nao esta como producao. |

Conclusao: `.env` esta protegido contra commit, mas o arquivo local atual nao deve ser considerado `.env` de alvo real. Antes do deploy controlado, validar no host alvo: `NODE_ENV=production`, `DATA_BACKEND=prisma`, `AUTH_ENFORCED=true`, `AUTH_SECRET` forte, `DATABASE_URL` correta e `CORS_ORIGIN` restrito.

## I) Validacao de backup do banco alvo
| Item | Status | Resultado |
| --- | --- | --- |
| Existe banco alvo real | NAO TESTADO | Nenhum identificador/URL de banco alvo foi informado nesta fase. |
| Backup foi feito | NAO TESTADO | Nao ha comprovante de backup. |
| Data/hora do backup | NAO TESTADO | Nao informado. |
| Responsavel | NAO TESTADO | Nao informado. |
| Local seguro do backup | NAO TESTADO | Nao informado; nao registrar credenciais em documentacao. |
| Restore testado | NAO TESTADO | Nao informado/testado. |

Conclusao: sem backup confirmado, deploy real permanece bloqueado.

## J) Smoke contra ambiente alvo
| Item | Status | Resultado |
| --- | --- | --- |
| Script aceita `SMOKE_BASE_URL` | PASSOU | Parametro `$BaseUrl = $env:SMOKE_BASE_URL` confirmado. |
| Script aceita unidade e credenciais por env | PASSOU | `SMOKE_UNIT_ID`, `SMOKE_OWNER_EMAIL` e `SMOKE_OWNER_PASSWORD` confirmados. |
| Smoke local herdado | PASSOU | Fase 0.9.1 registrou `npm.cmd run smoke:api` passando fora do sandbox. |
| Smoke contra alvo real | NAO TESTADO | URL alvo real e credenciais de smoke nao foram fornecidas nesta fase. |

Comando esperado, sem registrar senha no Git:

```powershell
$env:SMOKE_BASE_URL="https://URL-DO-AMBIENTE-ALVO"
$env:SMOKE_UNIT_ID="unit-01"
$env:SMOKE_OWNER_EMAIL="owner@example.com"
$env:SMOKE_OWNER_PASSWORD="<senha fora do Git>"
npm.cmd run smoke:api
```

## K) Worktree / git status
| Item | Status | Resultado |
| --- | --- | --- |
| Branch revisada | PASSOU | `main...origin/main [ahead 1]`. |
| Worktree limpo | FALHOU | Existem alteracoes modificadas e arquivos novos nao commitados. |
| `.env` fora do status | PASSOU | `.env` nao aparece no status. |
| Segredos staged | PASSOU | Nao ha indicacao de staging; `.env` ignorado. |
| Arquivo desta fase criado | PASSOU | `.planning/96_CORRECOES_PRE_DEPLOY.md`. |

Arquivos nao commitados observados antes da criacao deste arquivo:
- `.env.example`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`
- `.planning/README.md`
- `scripts/smoke-api-flow.ps1`
- `src/http/app.ts`
- `src/http/security.ts`
- `.planning/94_DEPLOY_PRODUCAO_CONTROLADA.md`
- `.planning/95_CHECKLIST_VISUAL_PRE_DEPLOY.md`

## L) Decisao final
Decisao: BLOQUEADO.

Justificativa:
- Nao foi encontrado bug simples no CORS atual.
- `.env.example`, smoke parametrizado, guard de segredo em producao e sintaxe frontend estao em estado aceitavel para preparacao.
- Porem, os bloqueios de release real permanecem: checklist visual humano desktop/mobile nao executado, backup do banco alvo real nao confirmado, smoke contra alvo real nao executado, `CORS_ORIGIN` do alvo nao confirmado, `.env` alvo real nao validado e worktree ainda nao esta limpo.

Condicoes para mudar a decisao:
1. Registrar checklist visual humano desktop/mobile com status final por perfil e por fluxo.
2. Configurar e validar `.env` do host alvo sem expor segredos.
3. Confirmar backup do banco alvo real, com data/hora, responsavel e local seguro.
4. Rodar smoke contra `SMOKE_BASE_URL` do ambiente alvo e registrar o resultado.
5. Revisar/limpar worktree, commitar somente arquivos permitidos e confirmar que `.env`/segredos nao entram no Git.
6. Confirmar explicitamente que `prisma/seed.ts` nao sera executado em base real.

