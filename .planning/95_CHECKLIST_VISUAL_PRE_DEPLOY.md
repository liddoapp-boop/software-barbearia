# 95 - Checklist visual final e pre-deploy controlado

Data/hora da validacao: 2026-05-04 23:35:37 -03:00
Fase: 0.9.1
Status: PRE-DEPLOY CONTROLADO EXECUTADO COM BLOQUEIO VISUAL
Decisao final: BLOQUEADO

## A) Objetivo da fase
Executar e registrar o checklist visual final e o pre-deploy controlado antes de qualquer deploy real controlado.

Esta fase nao cria feature nova, nao altera regra financeira, nao troca stack, nao executa seed destrutivo, nao publica segredo e nao realiza deploy real sem confirmacao humana.

## B) Ambiente usado
- Workspace: `C:\Users\joaov\OneDrive\Desktop\Projetos\Software Barbearia`.
- Sistema: Windows local.
- Node: `v24.14.1`.
- Branch: `main`, ahead de `origin/main` por 1 commit no momento da verificacao.
- URL local prevista: `http://localhost:3333/index.html`.
- URL smoke local: `http://127.0.0.1:3333`.
- URL alvo real: NAO TESTADO.
- Backend usado nas validacoes automatizadas: `prisma` para smoke/test DB; `memory` permanece default em `.env.example` para dev.
- Banco usado: PostgreSQL local via Prisma nas validacoes `smoke:api` e `test:db`.
- Backup do banco alvo real: NAO CONFIRMADO.
- `.env` real: existe no workspace e esta ignorado pelo Git (`.gitignore:8:.env`), mas valores nao foram lidos nem registrados.

## C) Perfis testados
| Perfil | Status | Evidencia |
| --- | --- | --- |
| Owner | PARCIAL | API/smoke/testes validaram login e fluxos owner. Navegador desktop/mobile nao foi operado nesta rodada. |
| Recepcao | PARCIAL | Testes validaram permissoes e bloqueios. Troca visual real no navegador nao foi operada nesta rodada. |
| Profissional | PARCIAL | Testes validaram permissoes e bloqueios. Troca visual real no navegador nao foi operada nesta rodada. |

## D) Checklist visual desktop
| Area | Item | Status | Resultado |
| --- | --- | --- | --- |
| Owner | Login como owner | PARCIAL | Validado por API/teste; navegador nao operado. |
| Owner | Dashboard abre sem erro | NAO TESTADO | Requer passada visual humana/browser. |
| Owner | Menu mostra Agenda/PDV/Financeiro/Comissoes/Auditoria/Configuracoes | PARCIAL | `menu-config.js` permite todos os modulos para owner; visual nao confirmado. |
| Owner | Navegacao entre modulos | NAO TESTADO | Requer navegador. |
| Owner | Console sem erro critico | NAO TESTADO | Requer navegador/devtools. |
| Recepcao | Login/troca com sessao real | PARCIAL | Testes/API cobrem role; frontend foi corrigido na Fase 0.8; visual nao confirmado agora. |
| Recepcao | Menu oculta Auditoria/Financeiro/Comissoes/Configuracoes | PARCIAL | `ROLE_ACCESS.recepcao` remove os modulos; visual nao confirmado. |
| Recepcao | Agenda/PDV funcionam conforme permitido | PARCIAL | API permite agenda/PDV; visual nao confirmado. |
| Recepcao | Acoes bloqueadas retornam mensagem amigavel | PARCIAL | Tratamento de erro existe; visual nao confirmado. |
| Profissional | Login/troca com sessao real | PARCIAL | Testes/API cobrem role; visual nao confirmado agora. |
| Profissional | Menu mostra apenas permitido | PARCIAL | `ROLE_ACCESS.profissional` contem Agenda/Dashboard; visual nao confirmado. |
| Profissional | Bloqueio de Auditoria/Financeiro/Comissoes/Configuracoes | PARCIAL | Testes/API cobrem `403`; visual nao confirmado. |
| Profissional | Agenda/Dashboard nao quebram | NAO TESTADO | Requer navegador. |

## E) Checklist visual mobile
| Item | Status | Resultado |
| --- | --- | --- |
| Menu/mobile tabs | PARCIAL | Estrutura existe em `public/components/mobile-tabs.js` e CSS responsivo; nao houve execucao visual. |
| Dashboard | NAO TESTADO | Requer viewport mobile real. |
| Agenda | NAO TESTADO | Requer viewport mobile real. |
| Criacao/visualizacao de agendamento | NAO TESTADO | Requer clique no navegador. |
| PDV | NAO TESTADO | Requer viewport mobile real. |
| Modal de checkout | NAO TESTADO | Requer clique no navegador. |
| Modal de estorno | NAO TESTADO | Requer clique no navegador. |
| Modal de devolucao | NAO TESTADO | Requer clique no navegador. |
| Financeiro owner | NAO TESTADO | Requer viewport mobile real. |
| Auditoria owner | NAO TESTADO | Requer viewport mobile real. |
| Botoes clicaveis | NAO TESTADO | Requer interacao visual. |
| Modais nao cortam conteudo | NAO TESTADO | Requer inspecao visual. |
| Tabelas/listas com alternativa mobile | PARCIAL | Codigo possui listas mobile em areas criticas; sem evidencia visual final. |

## F) Fluxo operacional completo
| Fluxo | Status | Evidencia |
| --- | --- | --- |
| Agenda -> checkout | PASSOU | `smoke:api` criou, confirmou, iniciou e finalizou atendimento via checkout. Agendamento `426027cd-dd06-49b3-a3f9-bcf1cc4a1596`; receita `75`. |
| Validar financeiro apos checkout | PASSOU | Smoke consultou `/financial/transactions` com movimentacoes do fluxo. |
| Validar auditoria apos checkout | PASSOU | Smoke consultou `/audit/events` com eventos recentes. |
| PDV -> venda -> devolucao | PASSOU | Smoke vendeu produto e devolveu venda pelo historico. Venda `b0eacc74-57ce-42a0-a9ee-8fd8dafa8ac8`; refund `8a171a6a-c31a-465e-9453-faa83d85c3ff`. |
| Validar estoque/financeiro reverso | PASSOU | Smoke validou lancamento financeiro reverso; testes DB cobrem consistencia de estoque. |
| Comissao | PARCIAL | Smoke consultou 2 comissoes; testes automatizados validam pagamento owner, despesa e bloqueios. Pagamento por clique no navegador nao testado. |
| Financeiro | PARCIAL | API/testes validam transacoes, receitas, despesas, refund e filtros; tela visual nao testada. |
| Auditoria | PARCIAL | API/testes validam listagem, filtros, actor, requestId/correlation-id e idempotencyKey; tela visual nao testada. |

## G) Pre-deploy tecnico
### Git
| Item | Status | Resultado |
| --- | --- | --- |
| `git status` revisado | PASSOU | Branch `main...origin/main [ahead 1]`; worktree contem alteracoes de fases anteriores e desta fase. |
| Branch correta | PASSOU | `main`. |
| Commits anteriores feitos | PARCIAL | Branch esta ahead 1; ha alteracoes ainda nao commitadas no workspace. |
| Nada sensivel staged | PASSOU | Nao ha indicacao de arquivos staged; `.env` segue ignorado. |
| `.env` real nao versionado | PASSOU | `git check-ignore -v .env` confirmou `.gitignore:8:.env`. |

### Ambiente
| Item | Status | Resultado |
| --- | --- | --- |
| Node >=22 | PASSOU | `v24.14.1`. |
| `DATA_BACKEND=prisma` para producao | PARCIAL | Exigencia documentada; ambiente alvo real nao confirmado. |
| `AUTH_ENFORCED=true` | PARCIAL | `.env.example` orienta true; ambiente alvo real nao confirmado. |
| `AUTH_SECRET` forte | PARCIAL | Guard em producao existe; valor real nao lido/confirmado. |
| `DATABASE_URL` real fora do Git | PARCIAL | `.env` ignorado; URL alvo real nao confirmada. |
| `PORT` definido | PARCIAL | `.env.example` define `3333`; alvo real nao confirmado. |
| `HTTP_LOG_ENABLED` definido | PARCIAL | `.env.example` define `true`; alvo real nao confirmado. |
| `LOG_LEVEL` adequado | PARCIAL | `.env.example` define `info`; alvo real nao confirmado. |
| `CORS_ORIGIN` | PARCIAL | Adicionado suporte por env; alvo real ainda precisa definir origem restrita. |

### Banco
| Item | Status | Resultado |
| --- | --- | --- |
| PostgreSQL acessivel | PASSOU | `smoke:api` e `test:db` passaram com Prisma/PostgreSQL local. |
| Backup confirmado | NAO TESTADO | Backup do banco alvo real nao foi confirmado. |
| Migration/push planejado | PARCIAL | Fase 0.9 documenta estrategia; nenhum schema novo nesta fase. |
| Prisma generate validado | PARCIAL | Sem alteracao Prisma; nao foi necessario rerodar. |
| Seed destrutivo proibido em base real | PASSOU | `prisma/seed.ts` foi inspecionado e confirmado como destrutivo; nao foi rodado. |
| Owner inicial planejado | PARCIAL | Seed/dev cria owner; owner real em banco alvo precisa confirmacao humana. |

### Seguranca
| Item | Status | Resultado |
| --- | --- | --- |
| CORS revisado | PARCIAL | Risco mitigado por `CORS_ORIGIN`, mas exposicao publica segue bloqueada se a origem real nao for configurada. |
| HTTPS/dominio planejado | NAO TESTADO | Nao confirmado nesta rodada. |
| Logs sem senha/token | PARCIAL | Inspecao anterior indicou logs sem senha/token; revalidacao visual/operacional em alvo nao feita. |
| `AUTH_SECRET` nao dev em producao | PASSOU | `src/http/security.ts` bloqueia segredo fraco/dev em `NODE_ENV=production`. |
| `GET /users` owner-only | PASSOU | Policy em `src/http/app.ts` mantem owner-only. |
| `GET /audit/events` owner-only | PASSOU | Policy em `src/http/app.ts` mantem owner-only. |

### Smoke
| Item | Status | Resultado |
| --- | --- | --- |
| Smoke local passou | PASSOU | Passou fora do sandbox. |
| Smoke contra alvo | NAO TESTADO | Requer URL/credenciais reais via `SMOKE_*`. |
| Base URL parametrizada | PASSOU | `scripts/smoke-api-flow.ps1` usa `SMOKE_BASE_URL` ou parametro `BaseUrl`. |

## H) CORS
Estado anterior: `src/http/app.ts` usava `app.register(cors, { origin: true })`, permissivo para qualquer origem.

Correcao segura aplicada:
- Criado helper `getAllowedCorsOrigins()`.
- Quando `CORS_ORIGIN` nao estiver definido, dev local continua permissivo.
- Quando `CORS_ORIGIN` estiver definido, Fastify CORS usa a origem ou lista de origens separadas por virgula.
- `.env.example` documenta `CORS_ORIGIN=https://barbearia.example.com`.

Risco restante:
- Exposicao publica continua bloqueada se `CORS_ORIGIN` nao for configurado no ambiente alvo real.

## I) Bugs encontrados
| Severidade | Item | Status | Observacao |
| --- | --- | --- | --- |
| P1 | Checklist visual desktop/mobile nao executado por navegador/humano nesta rodada | ABERTO | Bloqueia deploy real porque era ressalva explicita da Fase 0.9. |
| P1 | Backup do banco alvo real nao confirmado | ABERTO | Bloqueia deploy real antes de migration/db push/uso real. |
| P1 | Smoke contra ambiente alvo real nao executado | ABERTO | Bloqueia liberacao do alvo. |
| P2 | CORS permissivo por default se `CORS_ORIGIN` nao for definido | MITIGADO/PENDENTE | Suporte por env foi implementado; falta configurar no alvo. |
| P2 | Worktree com alteracoes nao commitadas | ABERTO | Nao e bug de codigo, mas bloqueia release limpa. |

## J) Correcoes feitas
- `src/http/app.ts`: CORS passou a aceitar `CORS_ORIGIN` opcional.
- `.env.example`: documentado `CORS_ORIGIN` para homologacao/producao controlada.

Nao houve mudanca de regra financeira, seed, stack, IA/WhatsApp, modulo novo ou redesign.

## K) Comandos executados
| Comando | Resultado |
| --- | --- |
| `Get-Content public/app.js \| node --input-type=module --check` | PASSOU |
| `Get-ChildItem public/modules -Filter *.js ... node --check` | PASSOU |
| `Get-ChildItem public/components -Filter *.js ... node --check` | PASSOU |
| `npm.cmd run build` | PASSOU |
| `npm.cmd run test` | FALHOU no sandbox por `spawn EPERM` do Vite/Rolldown; PASSOU fora do sandbox: `63 passed`, `10 skipped`. |
| `npm.cmd run smoke:api` | FALHOU no sandbox por tentativa de acesso/verificacao de engine Prisma; PASSOU fora do sandbox. |
| `npm.cmd run test:db` | FALHOU no sandbox por `spawn EPERM`; PASSOU fora do sandbox: `10 passed`. |
| `git check-ignore -v .env` | PASSOU: `.env` ignorado por `.gitignore`. |
| `node --version` | PASSOU: `v24.14.1`. |

## L) Decisao final
Decisao: BLOQUEADO.

Justificativa:
- Nao ha falha automatizada aberta nos fluxos criticos testados.
- CORS foi mitigado por variavel de ambiente sem quebrar dev.
- Porem, deploy real controlado continua bloqueado porque a ultima passada visual humana desktop/mobile nao foi executada, o backup do banco alvo real nao foi confirmado e o smoke contra o alvo real nao foi executado.

Condicoes para sair de BLOQUEADO:
1. Executar checklist visual humano desktop/mobile e registrar evidencias.
2. Configurar `CORS_ORIGIN` no ambiente alvo ou documentar uso restrito sem exposicao publica.
3. Confirmar `.env` real fora do Git com `DATA_BACKEND=prisma`, `AUTH_ENFORCED=true`, `AUTH_SECRET` forte e `DATABASE_URL` correta.
4. Confirmar backup do banco alvo antes de schema change.
5. Rodar `npm.cmd run smoke:api` contra `SMOKE_BASE_URL` do ambiente alvo.
6. Confirmar que `prisma/seed.ts` nao sera rodado em base real.

## M) Proxima etapa recomendada
Proxima prioridade: Fase 0.9.2 - Correcoes/preparacao pre-deploy focada em evidencia visual humana, configuracao de ambiente alvo, backup e smoke remoto.
