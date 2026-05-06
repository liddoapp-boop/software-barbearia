# Fase 1.21 - Ambiente interno e release candidate operacional

Data: 2026-05-06
Decisao final: bloqueado

## Resumo executivo

A Fase 1.21 evoluiu o pacote para um release candidate operacional localmente validado, mas o release controlado interno real continua bloqueado por ausencia de ambiente alvo real confirmado. No codigo e na documentacao, os requisitos P0 de hardening (AUTH, CORS, Prisma/PostgreSQL, smoke com permissoes e guardrails de seed/backup) foram consolidados; no entanto, sem host interno real, sem `.env` real forte validado no alvo e sem backup/restore comprovado no banco alvo, nao ha condicao de liberar com seguranca.

## Escopo executado

1. Documentacao da fase criada neste arquivo.
2. Atualizados `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md` e `.planning/24_NEXT_PRIORITIES.md`.
3. Revisadas variaveis de ambiente criticas e exemplos seguros em `.env.example`.
4. Validado que `.env` esta fora do Git (`.gitignore`).
5. Confirmado que `dotenv` nao usa `override: true` (`src/server.ts` usa `dotenv.config()`), preservando variaveis externas para smoke/porta.
6. Validado e testado CORS restrito quando `CORS_ORIGIN` e definido, incluindo origem unica/lista por virgula.
7. Confirmado guard de seguranca minima: `AUTH_SECRET` fraco/default bloqueado em `NODE_ENV=production`.
8. Reforcado smoke (`scripts/smoke-api-flow.ps1`) para validar tambem permissoes basicas: `401` sem token e `403` cross-unit.
9. Registrado risco de `prisma/seed.ts` ser destrutivo e proibicao de uso em base operacional real.
10. Executadas validacoes obrigatorias de build/test/test:db/smoke + checks Git.

## Variaveis de ambiente criticas (checklist)

- `DATA_BACKEND=prisma`: obrigatorio no alvo interno.
- `DATABASE_URL`: obrigatoria, apontando para PostgreSQL alvo (nao documentar segredo real).
- `AUTH_SECRET`: obrigatoria e forte (>=32 chars aleatorios) em ambiente nao-dev.
- `AUTH_ENFORCED=true`: obrigatorio para release interno.
- `CORS_ORIGIN`: obrigatorio e restrito ao frontend real (origem unica ou lista explicita).
- `NODE_ENV`: coerente com release interno (normalmente `production` em host interno controlado).
- `PORT`: definido conforme host.
- `LOG_LEVEL` / `HTTP_LOG_ENABLED`: definidos conforme operacao.
- `.env` no Git: proibido; confirmado ignorado.

## Dotenv override e smoke

- Estado atual: `src/server.ts` usa `dotenv.config()` sem `override`.
- Impacto: variaveis externas (como `SMOKE_BASE_URL` e `PORT`) nao sao sobrescritas pelo `.env`, evitando a friccao observada em fases anteriores.
- Decisao: manter comportamento atual (compativel com local e com smoke remoto).

## CORS e hardening

- Implementacao atual em `src/http/app.ts`: `CORS_ORIGIN` vazio => permissivo (dev/local); definido => restritivo por allowlist.
- `.env.example` atualizado com exemplo de lista de origens.
- Cobertura adicionada: teste automatizado para cabecalho `access-control-allow-origin` quando `CORS_ORIGIN` esta definido.

## Seguranca minima

- `AUTH_SECRET` fraco/default falha em `NODE_ENV=production` (`src/http/security.ts`).
- Cobertura adicionada: teste automatizado para falha com segredo fraco e sucesso com segredo forte em ambiente de producao.
- Credenciais dev (`AUTH_USERS_JSON`) explicitamente marcadas como proibidas para uso real em `.env.example`.

## Prisma/PostgreSQL

Fluxo validado no estado atual do projeto:

1. `npm.cmd run db:generate`
2. `npm.cmd run db:push` (ou `db:migrate` conforme processo definido do ambiente)
3. `npm.cmd run test:db` com `DATA_BACKEND=prisma`

Observacoes:

- Nao executar `prisma migrate dev` em base operacional real sem janela, backup e aprovacao.
- `prisma/seed.ts` e destrutivo (`deleteMany` em cadeia) e NAO deve ser executado em base operacional real.

## Backup/restore e rollback (procedimento sugerido)

Checklist pre-release (obrigatorio no alvo real):

1. Confirmar janela de release e responsavel tecnico.
2. Gerar backup completo do PostgreSQL alvo antes do deploy.
3. Validar integridade do arquivo de backup.
4. Executar smoke remoto completo.
5. Liberar acesso interno apenas apos criterios de aceite.

Comandos de referencia (NAO executar em producao sem aprovacao):

- Backup: `pg_dump --format=custom --no-owner --no-privileges --file=<backup>.dump <DATABASE_URL>`
- Restore: `pg_restore --clean --if-exists --no-owner --no-privileges --dbname=<DATABASE_URL_DESTINO> <backup>.dump`

Criterio de rollback:

- Qualquer falha P0 em auth, tenant guard, financeiro, checkout/PDV, auditoria ou relatorios => rollback imediato para artefato anterior + restauracao do backup quando houver alteracao indevida de dados.

## Smoke remoto

Escopo coberto pelo script atual (`scripts/smoke-api-flow.ps1`):

1. `health` + login.
2. Agenda -> checkout.
3. Venda de produto.
4. Devolucao de produto.
5. Financeiro.
6. Comissoes consultaveis.
7. Auditoria.
8. Relatorios gerenciais (`summary`, `financial`, `product-sales`, `stock`).
9. CSV (`financial` e `clients`).
10. Permissoes basicas (`401` sem token e `403` cross-unit).

Status desta fase:

- Smoke local: validavel.
- Smoke remoto no host real: BLOQUEADO por ausencia de URL alvo interno real.

## Checklist visual desktop/mobile (host real)

Status: BLOQUEADO por ausencia de ambiente alvo.

Checklist objetivo para execucao no host real:

1. Login/sessao (owner, recepcao, profissional).
2. Menu por perfil (restricoes corretas).
3. Dashboard.
4. Agenda.
5. Checkout.
6. PDV.
7. Financeiro.
8. Estoque.
9. Comissoes.
10. Auditoria.
11. Relatorios e exportacao CSV.

## Validacoes obrigatorias executadas

- `npm.cmd run build`.
- `npm.cmd run test`.
- `npm.cmd run test:db`.
- `npm.cmd run smoke:api`.
- `git diff --check`.
- `git status --short`.

Obs.: Quando houver falha por `EPERM`/sandbox/OneDrive, classificar explicitamente como falha ambiental versus falha de codigo.

## Bloqueios P0 remanescentes

1. Ambiente alvo interno real nao informado/validado.
2. `.env` real do alvo nao validado (sem expor segredo).
3. PostgreSQL alvo e estrategia de backup/restore nao comprovados no host real.
4. Smoke remoto real nao executado.
5. Checklist visual desktop/mobile no host real nao executado.

## Decisao da fase

Bloqueado.

O projeto permanece aprovado para evolucao local e validacao interna assistida, mas nao aprovado para release controlado interno real ate resolver os P0 acima.

## Proxima fase recomendada

Fase 1.22 - Execucao assistida no host interno real:

1. Definir URL/host/protocolo/porta do ambiente alvo.
2. Validar `.env` real forte no alvo (sem expor valores).
3. Confirmar PostgreSQL alvo + backup/restore testado.
4. Rodar smoke remoto completo com `SMOKE_BASE_URL`.
5. Executar checklist visual desktop/mobile por perfil.
6. Reavaliar decisao final (aprovado, aprovado com ressalvas, ou bloqueado).
