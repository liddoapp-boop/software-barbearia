# 97 - Execucao checklist visual e ambiente alvo

Data/hora da validacao: 2026-05-04 23:49:16 -03:00
Fase: 0.9.3
Status: EXECUCAO TECNICA LOCAL COM BLOQUEIO DE AMBIENTE ALVO
Decisao final: BLOQUEADO

## A) Objetivo da fase
Executar ou registrar a execucao real do checklist visual e da preparacao do ambiente alvo, para decidir se o projeto pode sair do status `BLOQUEADO` e avancar para deploy controlado real.

Esta fase nao implementa feature nova, nao implementa IA/WhatsApp, nao cria modulo novo, nao refatora arquitetura, nao altera regras financeiras ja validadas, nao roda seed destrutivo em base real, nao commita `.env` real, nao commita segredos e nao executa deploy real se bloqueios criticos continuarem.

## B) Bloqueios herdados da Fase 0.9.2
| Bloqueio | Status 0.9.3 | Evidencia / observacao |
| --- | --- | --- |
| Checklist visual humano desktop/mobile ainda nao executado | NAO TESTADO | Nao houve navegador humano/device real anexado nesta fase. Continua bloqueando deploy real. |
| Backup do banco alvo real ainda nao confirmado | NAO TESTADO | Nenhum banco alvo real/backup foi informado. Continua bloqueando deploy real. |
| Smoke remoto com `SMOKE_BASE_URL` ainda nao executado | NAO TESTADO | Nao ha URL alvo real informada. Continua bloqueando deploy real. |
| `.env` real do alvo ainda nao confirmado | NAO TESTADO | `.env` local existe, mas nao representa alvo real pronto; host alvo nao foi validado. |
| `CORS_ORIGIN` precisa ser configurado no ambiente alvo | NAO TESTADO | Implementado/documentado, mas nao confirmado em alvo real. |
| Worktree sujo | FALHOU | `git status` mostra arquivos modificados e nao rastreados. |
| Branch `main...origin/main [ahead 1]` | PARCIAL | Branch atual segue ahead 1; precisa `git push` apos commit/revisao. |

## C) Ambiente utilizado
| Item | Status | Resultado |
| --- | --- | --- |
| Workspace | PASSOU | `C:\Users\joaov\OneDrive\Desktop\Projetos\Software Barbearia`. |
| Sistema | PASSOU | Windows local via PowerShell. |
| Data/hora local | PASSOU | `2026-05-04 23:49:16 -03:00`. |
| Branch atual | PASSOU | `main`. |
| Ahead de origin | PARCIAL | `main...origin/main [ahead 1]`. |
| URL local testada | PASSOU | Smoke local passou em `http://127.0.0.1:3333`. Primeira tentativa com `http://localhost:3333` falhou sem saida util fora do sandbox, e a tentativa isolada com `127.0.0.1` passou. |
| URL alvo real | NAO TESTADO | Nenhuma URL alvo real foi informada. |
| Backend usado em build/test | PASSOU | Suite automatizada padrao; testes de API usam app local. |
| Backend usado no smoke/test DB | PASSOU | `DATA_BACKEND=prisma` via `dev:api`/`test:db`. |
| Banco usado localmente | PASSOU | PostgreSQL local via Prisma, conforme `smoke:api` e `test:db`. |
| Banco alvo real | NAO TESTADO | Nao informado. |

## D) Git / worktree
### Comandos executados
| Comando | Resultado |
| --- | --- |
| `git status` | PASSOU para diagnostico; worktree sujo. |
| `git branch --show-current` | PASSOU: `main`. |
| `git log --oneline -5` | PASSOU: `fff8156 fix: alinhar sessao real ao perfil visual na validacao manual`; `3511da0 Initial commit`. |
| `git status --short --branch` | PASSOU para diagnostico; `## main...origin/main [ahead 1]`. |
| `git diff --check` | PASSOU sem erro; apenas avisos de CRLF do Git no Windows. |

### Estado registrado
| Item | Status | Resultado |
| --- | --- | --- |
| Branch atual | PASSOU | `main`. |
| Ahead de origin | PARCIAL | Ahead 1. Precisa `git push` apos revisao/commit. |
| Arquivos modificados | FALHOU | `.env.example`, `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`, `.planning/24_NEXT_PRIORITIES.md`, `.planning/README.md`, `scripts/smoke-api-flow.ps1`, `src/http/app.ts`, `src/http/security.ts`. |
| Arquivos nao rastreados | FALHOU | `.planning/94_DEPLOY_PRODUCAO_CONTROLADA.md`, `.planning/95_CHECKLIST_VISUAL_PRE_DEPLOY.md`, `.planning/96_CORRECOES_PRE_DEPLOY.md` e este arquivo 97 apos sua criacao. |
| `.planning/README.md` modificado de antes | PASSOU | Continua modificado. Precisa revisao antes de commit. |
| Algo sensivel no `git status` | PASSOU | Nao ha `.env`, credenciais ou arquivo de segredo no status. |
| `.env` fora do `git status` | PASSOU | `.env` nao aparece no status. |
| Commit pendente Fase 0.9.2 | PARCIAL | `.planning/96_CORRECOES_PRE_DEPLOY.md` e atualizacoes de log/prioridades ainda nao estao commitadas. |

Orientacao de commit separado, sem usar `git add .`:

```powershell
git add .planning/96_CORRECOES_PRE_DEPLOY.md
git add .planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md
git add .planning/24_NEXT_PRIORITIES.md
git commit -m "chore: registrar bloqueios pre-deploy controlado"
```

Observacao: como ha outras alteracoes relevantes de fases anteriores (`.env.example`, `scripts/smoke-api-flow.ps1`, `src/http/app.ts`, `src/http/security.ts`, `.planning/94...`, `.planning/95...`), a release limpa tambem exige revisar e commitar esses arquivos em commit(s) apropriados antes de `git push`.

## E) `.env` real fora do Git
| Item | Status | Resultado |
| --- | --- | --- |
| `git check-ignore -v .env` | PASSOU | `.gitignore:8:.env`. |
| `.env` ignorado | PASSOU | Confirmado pelo Git. |
| `.env` nao aparece em `git status` | PASSOU | Confirmado. |
| `.env.example` sem segredo real | PASSOU | Contem exemplos locais/placeholders, nao segredos reais. |
| `.env` real sera commitado | PASSOU | Nao sera commitado; segue ignorado. |
| `.env` local existe | PASSOU | Existe arquivo local, sem valores impressos. |
| `DATA_BACKEND=prisma` no alvo | NAO TESTADO | Alvo real nao informado. Validacao segura do `.env` local indicou `DATA_BACKEND_IS_PRISMA=False`. |
| `AUTH_ENFORCED=true` no alvo | NAO TESTADO | Alvo real nao informado. Validacao segura local indicou `AUTH_ENFORCED_IS_TRUE=True`. |
| `AUTH_SECRET` forte no alvo | NAO TESTADO | Alvo real nao informado. Validacao segura local indicou `AUTH_SECRET_STRONG_SHAPE=False`. |
| `DATABASE_URL` real fora do Git | PARCIAL | Presenca local confirmada sem imprimir valor; URL real alvo nao confirmada. |
| `CORS_ORIGIN` definido no alvo | NAO TESTADO | Alvo real nao informado. Validacao segura local indicou `CORS_ORIGIN_PRESENT=False`. |
| `NODE_ENV=production` ou equivalente planejado | PARCIAL | Planejado/documentado; validacao segura local indicou `NODE_ENV_IS_PRODUCTION=False`. |
| `PORT` definido | PARCIAL | Presenca local confirmada; host alvo nao confirmado. |

Conclusao: `.env` esta corretamente fora do Git, mas o `.env` alvo real ainda nao foi validado. Isso mantem a decisao `BLOQUEADO`.

## F) CORS_ORIGIN
| Item | Status | Resultado |
| --- | --- | --- |
| `CORS_ORIGIN` documentado em `.env.example` | PASSOU | Exemplo seguro comentado: `# CORS_ORIGIN=https://barbearia.example.com`. |
| Valor pretendido para alvo | PARCIAL | Usar origem HTTPS real do frontend, por exemplo `CORS_ORIGIN=https://app.seudominio.com.br`. |
| Origem unica ou lista | PARCIAL | Recomendado origem unica. Lista separada por virgula somente se houver dominios reais distintos. |
| Comportamento local sem `CORS_ORIGIN` | PASSOU | `getAllowedCorsOrigins()` retorna `true`, mantendo dev/local permissivo. |
| Comportamento producao com `CORS_ORIGIN` | PASSOU | `getAllowedCorsOrigins()` retorna origem/lista para `@fastify/cors`, restringindo o CORS configurado. |
| Wildcard em producao publica | PASSOU | Nao recomendado e nao documentado como opcao de producao. |
| Teste local com `CORS_ORIGIN` | PARCIAL | Tentativa com API temporaria falhou por ambiente: no sandbox `tsx/esbuild` teve `spawn EPERM`; fora do sandbox, `dotenv.config({ override: true })` carregou `.env` local e tentou usar porta 3333, ja ocupada no momento. Sem bug de CORS identificado. |
| `CORS_ORIGIN` no alvo real | NAO TESTADO | Nao confirmado. Mantem bloqueio. |

## G) Backup do banco alvo
| Item | Status | Resultado |
| --- | --- | --- |
| Existe banco alvo real | NAO TESTADO | Nao informado. |
| Identificacao do ambiente | NAO TESTADO | Nao informada. |
| Backup feito | NAO TESTADO | Nao confirmado. |
| Data/hora do backup | NAO TESTADO | Nao informada. |
| Responsavel | NAO TESTADO | Nao informado. |
| Local seguro do backup | NAO TESTADO | Nao informado; nao registrar credenciais. |
| Restore testado | NAO TESTADO | Nao informado/testado. |

Conclusao: sem backup confirmado, deploy controlado real permanece `BLOQUEADO`.

## H) Smoke local e remoto
| Smoke | Base URL | Status | Resultado |
| --- | --- | --- | --- |
| Local no sandbox | `http://localhost:3333` | FALHOU | API nao ficou pronta por falha de ambiente ao verificar/baixar engine Prisma (`binaries.prisma.sh`). |
| Local fora do sandbox, primeira tentativa | `http://localhost:3333` | FALHOU | Retornou exit 1 sem saida util. Tratado como falha ambiental/porta, nao bug comprovado de fluxo. |
| Local fora do sandbox, tentativa isolada | `http://127.0.0.1:3333` | PASSOU | Smoke concluiu com sucesso. Agendamento `a17dddb7-7b23-4430-a6cb-48dba0e7de6c`; checkout `75`; venda `d1f29edb-bf6c-4aaf-b1a5-2335c653a308`; refund `740a510c-e3cb-43b2-8228-54fbaa43ed12`; comissoes consultadas `2`. |
| Remoto | NAO INFORMADA | NAO TESTADO | Nenhuma `SMOKE_BASE_URL` de alvo real foi fornecida. |

Comando local executado com sucesso:

```powershell
$env:SMOKE_BASE_URL="http://127.0.0.1:3333"
npm.cmd run smoke:api
```

Comando remoto esperado quando houver alvo:

```powershell
$env:SMOKE_BASE_URL="https://URL-DO-AMBIENTE-ALVO"
$env:SMOKE_UNIT_ID="unit-01"
$env:SMOKE_OWNER_EMAIL="owner@example.com"
$env:SMOKE_OWNER_PASSWORD="<senha fora do Git>"
npm.cmd run smoke:api
```

## I) Checklist visual desktop
| Perfil | Item | Status | Resultado |
| --- | --- | --- | --- |
| Owner | Login como owner | NAO TESTADO | Requer execucao humana/browser. |
| Owner | Dashboard abre | NAO TESTADO | Requer execucao visual desktop. |
| Owner | Agenda abre | NAO TESTADO | Requer execucao visual desktop. |
| Owner | PDV abre | NAO TESTADO | Requer execucao visual desktop. |
| Owner | Financeiro abre | NAO TESTADO | Requer execucao visual desktop. |
| Owner | Comissoes abre | NAO TESTADO | Requer execucao visual desktop. |
| Owner | Auditoria abre | NAO TESTADO | Requer execucao visual desktop. |
| Owner | Configuracoes abre | NAO TESTADO | Requer execucao visual desktop. |
| Owner | Navegacao entre modulos nao quebra | NAO TESTADO | Requer clique real no navegador. |
| Owner | Sem erro visual critico | NAO TESTADO | Requer browser/devtools ou evidencia humana. |
| Owner | Acoes principais aparecem corretamente | PARCIAL | Codigo contem acoes principais; visual nao confirmado. |
| Recepcao | Login/troca para recepcao | NAO TESTADO | Requer browser com sessao real. |
| Recepcao | Sessao real acompanha perfil visual | PARCIAL | Codigo invalida sessao divergente; visual nao confirmado. |
| Recepcao | Auditoria nao aparece | PARCIAL | `ROLE_ACCESS.recepcao` nao inclui `auditoria`; visual nao confirmado. |
| Recepcao | Financeiro global nao aparece | PARCIAL | `ROLE_ACCESS.recepcao` nao inclui `financeiro`; visual nao confirmado. |
| Recepcao | Comissoes nao aparece | PARCIAL | `ROLE_ACCESS.recepcao` nao inclui `comissoes`; visual nao confirmado. |
| Recepcao | Configuracoes nao aparece | PARCIAL | `ROLE_ACCESS.recepcao` nao inclui `configuracoes`; visual nao confirmado. |
| Recepcao | Agenda/PDV funcionam conforme permitido | NAO TESTADO | Requer clique real. |
| Recepcao | Acao bloqueada mostra mensagem amigavel | PARCIAL | Testes/backend cobrem 403; UI visual nao confirmada. |
| Profissional | Login/troca para profissional | NAO TESTADO | Requer browser com sessao real. |
| Profissional | Sessao real acompanha perfil visual | PARCIAL | Codigo valida role de sessao contra role visual; visual nao confirmado. |
| Profissional | Ve apenas modulos permitidos | PARCIAL | `ROLE_ACCESS.profissional` contem `agenda` e `dashboard`; visual nao confirmado. |
| Profissional | Nao acessa Auditoria/Financeiro/Comissoes/Configuracoes | PARCIAL | Menu/backend restringem; tentativa visual direta nao executada. |
| Profissional | Agenda/Dashboard nao quebram | NAO TESTADO | Requer clique real. |

Conclusao: sem checklist visual desktop humano, deploy real permanece `BLOQUEADO`.

## J) Checklist visual mobile
| Item | Status | Resultado |
| --- | --- | --- |
| Menu/mobile tabs | PARCIAL | `renderMobileTabs()` e `MOBILE_TABS` existem; viewport real nao testado. |
| Dashboard | NAO TESTADO | Requer largura mobile/dispositivo. |
| Agenda | NAO TESTADO | Requer largura mobile/dispositivo. |
| PDV | NAO TESTADO | Requer largura mobile/dispositivo. |
| Modal de checkout | NAO TESTADO | Requer fluxo visual. |
| Modal de estorno | NAO TESTADO | Requer atendimento concluido e clique visual. |
| Modal de devolucao | NAO TESTADO | Requer venda devolvivel e clique visual. |
| Financeiro como owner | NAO TESTADO | Requer viewport mobile como owner. |
| Auditoria como owner | NAO TESTADO | Requer viewport mobile como owner. |
| Botoes clicaveis | NAO TESTADO | Requer interacao real. |
| Modais nao cortam conteudo critico | NAO TESTADO | Requer inspecao visual. |
| Listas/tabelas comportamento aceitavel | PARCIAL | Existem listas mobile para agendamentos, estoque e servicos; sem evidencia final. |
| Sem bloqueio visual em operacao critica | NAO TESTADO | Requer passada real. |

Conclusao: sem checklist visual mobile, deploy real permanece `BLOQUEADO`.

## K) Fluxos operacionais minimos
| Fluxo | Status | Evidencia / resultado |
| --- | --- | --- |
| Agenda -> criar agendamento | PASSOU | Smoke local API criou agendamento. Clique visual nao testado. |
| Agenda -> confirmar | PASSOU | Smoke local API confirmou. Clique visual nao testado. |
| Agenda -> iniciar | PASSOU | Smoke local API iniciou. Clique visual nao testado. |
| Agenda -> checkout | PASSOU | Smoke local API finalizou checkout com receita `75`. Clique visual nao testado. |
| Agenda -> validar feedback UI | NAO TESTADO | Requer browser. |
| Agenda -> validar financeiro | PASSOU | Smoke local consultou financeiro. Tela visual nao testada. |
| Agenda -> validar auditoria | PASSOU | Smoke local consultou auditoria. Tela visual nao testada. |
| PDV -> vender produto | PASSOU | Smoke local API vendeu produto. Clique visual nao testado. |
| PDV -> consultar historico | PASSOU | Smoke local API consultou historico e encontrou a venda. |
| PDV -> devolver venda antiga | PASSOU | Smoke local API devolveu venda pelo historico. Clique visual nao testado. |
| PDV -> validar estoque | PARCIAL | Coberto por testes/smoke de devolucao; tela Estoque nao testada visualmente. |
| PDV -> validar financeiro reverso | PASSOU | Smoke validou lancamento financeiro reverso. |
| PDV -> validar auditoria | PASSOU | Smoke consultou auditoria. |
| Comissao -> consultar | PASSOU | Smoke consultou `2` comissoes. Tela visual nao testada. |
| Comissao -> pagar como owner | PARCIAL | `test` e `test:db` cobrem pagamento owner; smoke mantem pagamento opcional. Clique visual nao testado. |
| Comissao -> validar despesa financeira | PASSOU | `test:db` passou com cobertura de despesa de comissao. |
| Comissao -> validar auditoria | PASSOU | `test:db` cobre auditoria de pagamento. |
| Comissao -> bloqueio recepcao/profissional | PASSOU | `test` cobre bloqueios 403. UI visual nao testada. |
| Financeiro -> consultar transacoes | PASSOU | Smoke local consultou transacoes. |
| Financeiro -> receita de servico | PASSOU | Smoke local gerou receita de servico. |
| Financeiro -> receita de produto | PASSOU | Smoke local gerou receita de produto. |
| Financeiro -> despesa de comissao | PASSOU | Testes DB cobrem. |
| Financeiro -> estorno/devolucao | PASSOU | Smoke local gerou financeiro reverso de devolucao. |
| Financeiro -> filtro/periodo basico | PARCIAL | API/smoke usam periodo; UI visual nao testada. |
| Auditoria -> listar eventos | PASSOU | Smoke local consultou eventos. Tela visual nao testada. |
| Auditoria -> filtrar action/entity | PASSOU | Testes DB cobrem filtros; tela visual nao testada. |
| Auditoria -> validar actor | PASSOU | Testes/smoke registram actor. |
| Auditoria -> requestId/correlation-id | PASSOU | Smoke envia `x-correlation-id`; auditoria consultada. |
| Auditoria -> idempotencyKey | PASSOU | Testes e UI renderizam campo; tela visual nao testada. |

## L) Validacoes automatizadas
| Comando | Status | Resultado |
| --- | --- | --- |
| `npm.cmd run build` | PASSOU | `tsc -p tsconfig.json` passou. |
| `npm.cmd run test` no sandbox | FALHOU | Falha ambiental conhecida: `spawn EPERM` do Vite/Rolldown. |
| `npm.cmd run test` fora do sandbox | PASSOU | `63 passed`, `10 skipped`. |
| `npm.cmd run smoke:api` local no sandbox | FALHOU | Falha ambiental ao verificar/baixar engine Prisma. |
| `npm.cmd run smoke:api` local fora do sandbox | PASSOU | Passou com `SMOKE_BASE_URL=http://127.0.0.1:3333`. |
| `npm.cmd run test:db` no sandbox | FALHOU | Falha ambiental conhecida: `spawn EPERM` do Vite/Rolldown. |
| `npm.cmd run test:db` fora do sandbox | PASSOU | `10 passed`. |
| `npm.cmd run db:generate` | NAO TESTADO | Nao houve alteracao Prisma nesta fase; nao necessario. |
| `npm.cmd run db:push` | NAO TESTADO | Nao houve alteracao Prisma nesta fase; nao necessario fora do smoke. |

## M) Bugs encontrados
| Severidade | Item | Status | Observacao |
| --- | --- | --- | --- |
| P1 Release | Checklist visual desktop/mobile nao executado | ABERTO | Bloqueio de release, nao bug funcional confirmado. |
| P1 Release | Backup alvo real nao confirmado | ABERTO | Bloqueia deploy real. |
| P1 Release | Smoke remoto nao executado | ABERTO | Bloqueia deploy real. |
| P1 Release | `.env` alvo real nao validado | ABERTO | Bloqueia deploy real. |
| P1 Release | `CORS_ORIGIN` alvo nao confirmado | ABERTO | Bloqueia exposicao publica. |
| P2 Release | Worktree sujo e branch ahead | ABERTO | Bloqueia release limpa ate commit/push revisados. |
| Bug de codigo novo em fluxo critico | NAO TESTADO | Nenhum bug novo identificado pelas validacoes automatizadas locais; visual ainda nao executado. |

## N) Decisao final
Decisao: BLOQUEADO.

Justificativa:
- Build, testes, smoke local e testes DB passaram fora das limitacoes conhecidas de sandbox.
- O smoke local validou os fluxos operacionais de Agenda, checkout, venda, devolucao, financeiro, comissoes consultaveis, dashboard e auditoria.
- CORS esta implementado e documentado, e `.env` esta fora do Git.
- Porem, os criterios obrigatorios para `APROVADO PARA DEPLOY CONTROLADO` ainda nao foram atendidos: checklist visual desktop/mobile nao foi executado, backup do banco alvo real nao foi confirmado, smoke remoto nao foi executado, `.env` real do alvo nao foi validado, `CORS_ORIGIN` no alvo nao foi confirmado e worktree segue sujo/ahead.

## O) Proxima etapa recomendada
Proxima prioridade: preparar ambiente alvo.

Sequencia recomendada:
1. Definir URL alvo real e host de deploy.
2. Criar/validar `.env` do alvo sem expor segredos: `NODE_ENV=production`, `DATA_BACKEND=prisma`, `AUTH_ENFORCED=true`, `AUTH_SECRET` forte, `DATABASE_URL` correta, `CORS_ORIGIN` restrito e `PORT`.
3. Confirmar backup do banco alvo real com data/hora, responsavel e local seguro.
4. Rodar smoke remoto com `SMOKE_BASE_URL`.
5. Executar checklist visual humano desktop/mobile no ambiente local ou alvo.
6. Revisar worktree, criar commits pequenos sem `git add .`, executar `git push`.
7. Se surgir P0/P1 visual ou operacional, abrir Fase 0.9.4 - Correcoes bloqueadoras de release.

