Data: 2026-06-06
Escopo: Fase 0.9.5 - Hardening critico de producao, ambiente e dependencias.

## Objetivo da fase
Adicionar guard rails minimos para impedir startup inseguro em producao, reduzir risco de seed/teste destrutivo em banco real, remover a dependencia exclusiva de PowerShell no smoke e fechar vulnerabilidades reportadas pelo `npm audit`.

## Estado inicial registrado
- `git status --short`: worktree ja estava sujo antes com alteracoes em `public/*`, `public/modules/*`, `public/styles/layout.css`, `src/application/operations-service.ts` e `src/application/prisma-operations-service.ts`.
- `git status -sb`: `main...origin/main [ahead 1]`.
- `git diff --stat`: 11 arquivos pre-existentes, 1944 insercoes e 577 remocoes.
- `git diff --name-only`: somente arquivos frontend/application service pre-existentes.
- `git log --oneline -5`: `7407bd1`, `e70a140`, `f7fc202`, `1cede31`, `35ff774`.

## Problemas criticos corrigidos
1. `AUTH_SECRET` fraco/ausente agora bloqueia startup em `NODE_ENV=production`.
2. `DATA_BACKEND` agora precisa ser `prisma` em producao.
3. `AUTH_ENFORCED=false` agora bloqueia startup em producao.
4. `CORS_ORIGIN` agora e obrigatorio, restritivo e sem `*` em producao; listas por virgula continuam suportadas.
5. Usuarios default/dev nao sao carregados por fallback em producao e credenciais dev conhecidas em `AUTH_USERS_JSON` sao recusadas.
6. Login com `DATA_BACKEND=prisma` em producao nao cai para fallback em memoria/dev users.
7. `prisma/seed.ts` aborta com `NODE_ENV=production` e exige confirmacao explicita para banco nao-local ou URL com indicios sensiveis.
8. `test:db` ganhou guard para `RUN_DB_TESTS=1`, `DATABASE_URL` e URL sem indicios obvios de producao.
9. `smoke:api` passou a usar Node.js (`scripts/smoke-api-flow.mjs`), mantendo PowerShell como `smoke:api:ps`.
10. Vulnerabilidades do `npm audit` foram corrigidas sem `--force`.

## Comportamento em producao
- Startup falha se `AUTH_SECRET` estiver ausente, curto, `dev-secret-change-me` ou igual a valor de exemplo/documentacao conhecido.
- Startup falha se `DATA_BACKEND` estiver ausente, vazio, `memory` ou diferente de `prisma`.
- Startup falha se `AUTH_ENFORCED=false`.
- Startup falha se `CORS_ORIGIN` estiver ausente, vazio, `*` ou nao for origem `http/https` valida.
- `AUTH_USERS_JSON`, se usado, precisa ser lista valida e nao pode conter as credenciais default de desenvolvimento.
- Login Prisma em producao usa usuario persistente real; fallback dev nao e aceito.
- `prisma/seed.ts` nao roda com `NODE_ENV=production`.

## Comportamento em dev/test
- `DATA_BACKEND=memory` continua permitido.
- Sem `CORS_ORIGIN`, CORS continua permissivo para desenvolvimento local.
- Usuarios default continuam disponiveis fora de producao.
- `test:db` continua pulando na suite comum quando `RUN_DB_TESTS` nao esta setado.
- Seed continua permitido em banco local dev/test; banco nao-local exige `ALLOW_DESTRUCTIVE_SEED=true`.

## Status do npm audit
- Antes: `npm audit` e `npm audit --omit=dev` reportaram 5 vulnerabilidades: 4 high e 1 moderate.
- Pacotes/caminhos principais: `prisma -> @prisma/config -> effect` (high), `fast-uri` (high), `brace-expansion` (moderate).
- Acao: `npm audit fix` sem `--force`, seguido de alinhamento de `prisma` e `@prisma/client` para `6.19.3`.
- Depois: `npm audit` passou com 0 vulnerabilidades.
- Depois: `npm audit --omit=dev` passou com 0 vulnerabilidades.

## Status do smoke cross-platform
- Criado `scripts/smoke-api-flow.mjs`.
- `package.json` agora usa `node scripts/smoke-api-flow.mjs` em `smoke:api`.
- PowerShell ficou disponivel como `smoke:api:ps`.
- Execucao local de `npm run smoke:api`: o script rodou, encontrou API ja ativa em `127.0.0.1:3333`, mas falhou em `/auth/login` com `401` usando credenciais dev default. Nao foram usadas senhas reais. Para passar nesse alvo, informar `SMOKE_OWNER_EMAIL` e `SMOKE_OWNER_PASSWORD` validos ou rodar contra API dev isolada com usuarios default.

## Status do seed
- `prisma/seed.ts` continua destrutivo e deve ser tratado como dev/test only.
- Guard novo aborta sempre em `NODE_ENV=production`.
- URL com `prod`, `production`, `render` ou `railway` exige `ALLOW_DESTRUCTIVE_SEED=true`, e banco nao-local tambem exige confirmacao.
- Nenhum seed foi executado nesta fase.

## Status do test:db
- Guard novo exige `RUN_DB_TESTS=1` e `DATABASE_URL`.
- URLs com indicios obvios de producao (`prod`, `production`, `render`, `railway`) sao recusadas.
- Execucao manual `RUN_DB_TESTS=1 DATA_BACKEND=prisma npx vitest run tests/db.integration.spec.ts` rodou contra o ambiente local disponivel, mas falhou em 8 testes com `404` em fluxos operacionais Prisma. Nao foi feita correcao funcional nessa fase porque o objetivo era hardening/guard rails.

## RBAC revalidado
- `npx vitest run tests/api.spec.ts -t "bloqueia probes reais de RBAC"` passou.
- Cobriu owner acessando rotas administrativas e bloqueios 403 para:
  - profissional em `GET /users`;
  - recepcao em `GET /audit/events`;
  - profissional em `GET /settings`;
  - profissional em `GET /reports/management/financial`.

## Comandos executados
- `git status --short`
- `git status -sb`
- `git diff --stat`
- `git diff --name-only`
- `git log --oneline -5`
- `npm audit --json`
- `npm audit --omit=dev --json`
- `npm audit fix`
- `npm install prisma@^6.19.3 @prisma/client@^6.19.3`
- `node --check scripts/smoke-api-flow.mjs`
- `npm run build`
- `npx vitest run tests/environment-hardening.spec.ts`
- `RUN_DB_TESTS=1 DATA_BACKEND=prisma npx vitest run tests/db.integration.spec.ts`
- `npm run test`
- `npx vitest run tests/api.spec.ts -t "bloqueia probes reais de RBAC"`
- `npm.cmd run build`
- `npm.cmd run test`
- `npm run smoke:api`
- `git diff --check`

## Resultado das validacoes
- `npm run build`: passou.
- `npx vitest run tests/environment-hardening.spec.ts`: passou (`10 passed`).
- `npm run test`: passou (`80 passed | 11 skipped`).
- RBAC focado: passou (`1 passed | 65 skipped`).
- `npm audit`: passou com 0 vulnerabilidades.
- `npm audit --omit=dev`: passou com 0 vulnerabilidades.
- `node --check scripts/smoke-api-flow.mjs`: passou.
- `git diff --check`: passou.
- `npm.cmd run build`: falhou neste Linux com `npm.cmd: command not found`.
- `npm.cmd run test`: falhou neste Linux com `npm.cmd: command not found`.
- `npm run smoke:api`: executou o runner Node, mas o alvo local ativo retornou `401` no login default.
- `test:db` explicito: falhou em fluxos Prisma com `404` no banco local disponivel.

## Pendencias reais
1. Rodar `npm run smoke:api` com credenciais reais de smoke em ambiente isolado ou API dev limpa.
2. Corrigir/normalizar fixtures do `test:db` Prisma ou executar em banco isolado comprovadamente preparado.
3. Reexecutar smoke e DB no ambiente alvo real antes de qualquer deploy controlado.
4. XSS/localStorage segue fora desta fase e deve entrar como proxima fase critica.
5. Separar as alteracoes pre-existentes do worktree antes de qualquer commit; nao usar `git add .`.

## Decisao final
Fase 0.9.5 aprovada para hardening local com ressalvas. Os guard rails criticos de startup, seed, DB test, CORS, auth e dependencias foram implementados e a suite principal passou. Release/deploy continua bloqueado ate smoke autenticado e `test:db` passarem em ambiente isolado e ate as pendencias criticas restantes serem tratadas.
