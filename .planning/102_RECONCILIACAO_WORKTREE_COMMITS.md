# Fase 0.9.8 - Reconciliacao do worktree, commits e documentacao real

Data: 2026-06-07

## Objetivo

Reconciliar o estado real do projeto apos queda/reconexao SSH, separando alteracoes por origem provavel, grupos de commit recomendados, riscos restantes e evidencias de validacao antes de continuar novas fases. Esta fase nao implementou feature, nao alterou codigo de produto, nao executou `git add`, `git commit`, `git push`, seed, migration destrutiva, revert ou limpeza de arquivos.

## Estado Git/local/remoto

- Branch atual: `main`.
- Relacao com remoto: `main...origin/main [ahead 1]`.
- Commit local atual: `7407bd1 fix: aplicar rbac e corrigir permissoes criticas`.
- Commits locais ainda nao enviados ao origin: `7407bd1`.
- Commits do origin ainda nao presentes localmente: nenhum em `HEAD..origin/main`.
- Remoto: `origin https://github.com/dormammudev/software-barbearia.git`.
- GitHub/origin nao parece alinhado ao commit local, porque o branch local esta `ahead 1`.
- Estado local real esta diferente do commit, com 26 arquivos modificados e 6 arquivos untracked antes desta documentacao.
- `.env` nao aparece no status; apenas `.env.example` aparece modificado.
- `.planning/README.md` nao esta modificado.
- `.planning/102_RECONCILIACAO_WORKTREE_COMMITS.md` nao existia no inicio da recuperacao e foi criado nesta fase.

## Arquivos modificados antes da documentacao 0.9.8

- `.env.example`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`
- `package-lock.json`
- `package.json`
- `prisma/seed.ts`
- `public/app.js`
- `public/booking.html`
- `public/components/operational-ui.js`
- `public/components/sidebar.js`
- `public/components/topbar.js`
- `public/components/whatsapp.js`
- `public/index.html`
- `public/login.html`
- `public/modules/agendamentos.js`
- `public/modules/configuracoes.js`
- `public/modules/feedback.js`
- `public/modules/financeiro.js`
- `public/styles/layout.css`
- `src/application/operations-service.ts`
- `src/application/prisma-operations-service.ts`
- `src/http/app.ts`
- `src/http/security.ts`
- `tests/api.spec.ts`
- `tests/db.integration.spec.ts`
- `tests/environment-hardening.spec.ts`

## Arquivos untracked antes da documentacao 0.9.8

- `.planning/99_HARDENING_PRODUCAO_AMBIENTE_DEPENDENCIAS.md`
- `.planning/100_CORRECAO_TESTDB_SMOKE_ISOLADO.md`
- `.planning/101_HARDENING_XSS_LOCALSTORAGE_FRONTEND.md`
- `public/modules/sanitize.js`
- `scripts/smoke-api-flow.mjs`
- `tests/frontend-sanitize.spec.ts`

## Classificacao dos arquivos

| Arquivo | Tipo de alteracao | Origem provavel | Risco | Recomendacao | Observacao |
| --- | --- | --- | --- | --- | --- |
| `.env.example` | Documentacao/config exemplo | Fase 0.9.5 e Fase 0.9.6 | Medio | Comitar em fase especifica com revisao | Mistura hardening de producao, smoke e test:db; revisar para nao expor segredo real. |
| `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md` | Tracker documental | Fases 0.9.5, 0.9.6, 0.9.7 e 0.9.8 | Baixo | Comitar junto aos docs de fases ou em commit documental | Arquivo compartilhado entre fases; evitar `git add .`. |
| `.planning/24_NEXT_PRIORITIES.md` | Tracker documental | Fases 0.9.5, 0.9.6, 0.9.7 e 0.9.8 | Baixo | Comitar junto aos docs de fases ou em commit documental | Prioridades foram atualizadas de forma cumulativa. |
| `package.json` | Scripts/dependencias | Fase 0.9.5 | Medio | Comitar em Fase 0.9.5 | Inclui `smoke:api` Node, `smoke:api:ps`, `test:db` com guard e possiveis updates de dependencias. |
| `package-lock.json` | Lockfile | Fase 0.9.5 | Medio | Comitar em Fase 0.9.5 | Relacionado ao `npm audit fix` e alinhamento Prisma. |
| `prisma/seed.ts` | Guard de seed | Fase 0.9.5 | Alto | Comitar em Fase 0.9.5 com teste | Mudanca de seguranca impede seed destrutivo em producao. |
| `src/http/security.ts` | Auth/env hardening | Fase 0.9.5 e Fase 0.9.4 | Alto | Revisar antes e comitar em fase especifica | Contem guards de producao e roles; arquivo sensivel. |
| `src/http/app.ts` | RBAC, CORS/CSP e rotas | Fases 0.9.4, 0.9.5 e 0.9.7 | Alto | Revisar antes e separar commit por fase quando possivel | Mistura RBAC owner-only, CORS/CSP e headers de seguranca. |
| `tests/environment-hardening.spec.ts` | Teste de hardening | Fase 0.9.5 | Medio | Comitar em Fase 0.9.5 | Cobre auth secret, backend, auth enforced, CORS e users default. |
| `tests/api.spec.ts` | Testes API/RBAC/headers | Fase 0.9.4 e Fase 0.9.7 | Medio | Revisar antes e separar se possivel | Inclui probes de RBAC e headers minimos de seguranca. |
| `tests/db.integration.spec.ts` | Fixture/test:db | Fase 0.9.6 | Medio | Comitar em Fase 0.9.6 | `Professional.businessId` agora acompanha `unitId` isolado. |
| `.planning/99_HARDENING_PRODUCAO_AMBIENTE_DEPENDENCIAS.md` | Novo documento | Fase 0.9.5 | Baixo | Comitar em Fase 0.9.5 | Documento coerente com validacoes atuais. |
| `.planning/100_CORRECAO_TESTDB_SMOKE_ISOLADO.md` | Novo documento | Fase 0.9.6 | Baixo | Comitar em Fase 0.9.6 | Documento coerente com test:db e smoke atuais. |
| `.planning/101_HARDENING_XSS_LOCALSTORAGE_FRONTEND.md` | Novo documento | Fase 0.9.7 | Baixo | Comitar em Fase 0.9.7 | Documenta risco residual de JWT em localStorage. |
| `scripts/smoke-api-flow.mjs` | Novo script de smoke | Fase 0.9.5 e Fase 0.9.6 | Medio | Comitar em Fase 0.9.6 ou dividir com 0.9.5 | Criado na 0.9.5, refinado na 0.9.6. |
| `public/modules/sanitize.js` | Novo helper frontend | Fase 0.9.7 | Medio | Comitar em Fase 0.9.7 | Helper central de escape/safe values. |
| `tests/frontend-sanitize.spec.ts` | Novo teste frontend | Fase 0.9.7 | Baixo | Comitar em Fase 0.9.7 | Cobre helper de sanitizacao. |
| `public/app.js` | Sanitizacao/localStorage e alteracoes antigas | Fase 0.9.7 e alteracao antiga/preexistente | Alto | Revisar antes; separar XSS do legado se possivel | Arquivo grande e misturado; nao recomendar commit automatico integral. |
| `public/booking.html` | Sanitizacao do fluxo publico | Fase 0.9.7 | Medio | Comitar em Fase 0.9.7 com revisao | Escapes em dados do usuario/API no booking publico. |
| `public/modules/feedback.js` | Sanitizacao de feedback | Fase 0.9.7 | Medio | Comitar em Fase 0.9.7 | Escapa `error.message` antes de `innerHTML`. |
| `public/components/topbar.js` | Sanitizacao e possivel polimento previo | Fase 0.9.7 e alteracao antiga/preexistente | Medio | Revisar antes | Pequena mudanca de escape, mas arquivo ja tinha historico visual. |
| `public/components/operational-ui.js` | Reexport sanitize e alteracao visual antiga | Fase 0.9.7 e alteracao antiga/preexistente | Medio | Revisar antes | Reexport do helper central mistura com diff visual preexistente. |
| `public/login.html` | Reducao payload localStorage | Fase 0.9.7 | Medio | Comitar em Fase 0.9.7 | JWT ainda segue em `localStorage`; risco residual documentado. |
| `public/index.html` | Limpeza de sessao expirada | Fase 0.9.7 | Medio | Comitar em Fase 0.9.7 | Remove `authToken` e `sb.authSession` em token expirado. |
| `public/components/sidebar.js` | Frontend visual/escape local | Alteracao antiga/preexistente | Medio | Revisar separadamente | Fora dos grupos principais, nao commitar automaticamente. |
| `public/components/whatsapp.js` | Frontend/WhatsApp | Alteracao antiga/preexistente | Medio | Revisar separadamente | Fora do escopo 0.9.5-0.9.7. |
| `public/modules/agendamentos.js` | Frontend operacional | Alteracao antiga/preexistente | Medio | Revisar separadamente | Ja contem escapes locais; nao atribuir automaticamente a 0.9.7. |
| `public/modules/configuracoes.js` | Frontend configuracoes | Alteracao antiga/preexistente | Medio | Revisar separadamente | Diff grande fora do escopo declarado da 0.9.7. |
| `public/modules/financeiro.js` | Frontend financeiro | Alteracao antiga/preexistente | Medio | Revisar separadamente | Diff operacional/visual; requer revisao propria. |
| `public/styles/layout.css` | CSS/layout | Alteracao antiga/preexistente | Alto | Revisar separadamente | Maior diff do worktree; nao misturar com hardening. |
| `src/application/operations-service.ts` | Servico de dominio/memory | Alteracao antiga/preexistente | Alto | Revisar separadamente e testar | Arquivo de regra operacional; fora das fases 0.9.5-0.9.7. |
| `src/application/prisma-operations-service.ts` | Servico Prisma | Alteracao antiga/preexistente | Alto | Revisar separadamente e testar | Arquivo de regra persistente; fora das fases 0.9.5-0.9.7. |

## Grupos de commit sugeridos

### Grupo A - Fase 0.9.5 hardening producao/env/dependencias

Arquivos provaveis:
- `.env.example`
- `package.json`
- `package-lock.json`
- `prisma/seed.ts`
- `src/http/app.ts`
- `src/http/security.ts`
- `tests/environment-hardening.spec.ts`
- `.planning/99_HARDENING_PRODUCAO_AMBIENTE_DEPENDENCIAS.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

Observacao: `src/http/app.ts`, `.env.example` e trackers tambem contem mudancas de fases posteriores; usar staging seletivo por hunk, nao `git add .`.

### Grupo B - Fase 0.9.6 test:db e smoke isolado

Arquivos provaveis:
- `tests/db.integration.spec.ts`
- `scripts/smoke-api-flow.mjs`
- `.env.example`
- `.planning/100_CORRECAO_TESTDB_SMOKE_ISOLADO.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

Observacao: `scripts/smoke-api-flow.mjs` nasceu na 0.9.5 e foi refinado na 0.9.6; se houver tempo, separar criacao e refinamento por hunk. Se nao, commitar o script final junto da 0.9.6 com nota.

### Grupo C - Fase 0.9.7 XSS/localStorage

Arquivos provaveis:
- `public/modules/sanitize.js`
- `public/app.js`
- `public/booking.html`
- `public/modules/feedback.js`
- `public/components/topbar.js`
- `src/http/app.ts`
- `tests/frontend-sanitize.spec.ts`
- `tests/api.spec.ts`
- `.planning/101_HARDENING_XSS_LOCALSTORAGE_FRONTEND.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

Observacao: `public/app.js`, `public/components/topbar.js`, `src/http/app.ts` e trackers estao misturados com outras fases; staging seletivo e obrigatorio.

### Grupo D - alteracoes antigas/preexistentes de frontend/servicos

Arquivos restantes a revisar separadamente:
- `public/components/operational-ui.js`
- `public/components/sidebar.js`
- `public/components/whatsapp.js`
- `public/index.html`
- `public/login.html`
- `public/modules/agendamentos.js`
- `public/modules/configuracoes.js`
- `public/modules/financeiro.js`
- `public/styles/layout.css`
- `src/application/operations-service.ts`
- `src/application/prisma-operations-service.ts`

Observacao: alguns arquivos acima tambem receberam pequenos hunks da 0.9.7, mas o diff total deles inclui material preexistente. Nao recomendar commit automatico. Revisar em fase separada ou dividir por hunks cuidadosamente.

## Verificacao da documentacao `.planning`

- `.planning/99_HARDENING_PRODUCAO_AMBIENTE_DEPENDENCIAS.md`: existe, status coerente, registra comandos executados, validacoes, pendencias de smoke/test:db e worktree sujo.
- `.planning/100_CORRECAO_TESTDB_SMOKE_ISOLADO.md`: existe, status coerente, registra causa dos 404, comandos executados, smoke dev isolado, test:db e pendencia de smoke remoto.
- `.planning/101_HARDENING_XSS_LOCALSTORAGE_FRONTEND.md`: existe, status coerente, registra XSS/localStorage, CSP compativel, risco residual de JWT em localStorage e pendencias de cookie/CSP forte.
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`: contem entradas recentes de 0.9.5, 0.9.6 e 0.9.7; foi atualizado nesta fase com 0.9.8.
- `.planning/24_NEXT_PRIORITIES.md`: contem prioridades coerentes com bloqueio de release/deploy e separacao de commits; foi atualizado nesta fase com 0.9.8.
- Contradicao relevante encontrada: nenhuma contradicao grave entre documentacao e codigo atual. A ressalva e que os trackers agregam varias fases no mesmo arquivo e exigem staging seletivo.

## Correcoes criticas confirmadas no codigo atual

### RBAC

- `preHandler` aplica `policy.roles` e retorna `Acesso negado` quando `req.auth.role` nao esta permitido.
- `normalizeUserRole()` preserva somente `owner`, `recepcao` e `profissional`; role invalida lanca erro e nao vira `owner`.
- `/users` esta owner-only.
- `/audit/events` esta owner-only.
- `/reports/management/*`, incluindo summary, financial, audit e export CSV, estao owner-only.
- Pagamento de comissao em `/financial/commissions/:id/pay` esta owner-only.

### Hardening producao

- `getAuthSecret()` exige segredo forte em `NODE_ENV=production`.
- `getDataBackend()` exige `DATA_BACKEND=prisma` em producao.
- `isAuthEnforced()` bloqueia `AUTH_ENFORCED=false` em producao.
- `getAllowedCorsOrigins()` exige `CORS_ORIGIN` restrito em producao e bloqueia `*`.
- `loadAuthUsers()` nao carrega usuarios default em producao sem `AUTH_USERS_JSON` e recusa credenciais default/dev em producao.
- `authenticateLogin()` nao faz fallback dev em producao com backend Prisma.
- `prisma/seed.ts` aborta sempre em `NODE_ENV=production` e exige `ALLOW_DESTRUCTIVE_SEED=true` para banco nao-local/sensivel fora de producao.

### test:db/smoke

- `tests/db.integration.spec.ts` guarda `RUN_DB_TESTS=1`, `DATABASE_URL` e recusa marcadores obvios de producao.
- `createScenario()` cria `Professional` com `businessId: unitId`.
- `scripts/smoke-api-flow.mjs` aceita `SMOKE_BASE_URL`.
- Smoke exige `SMOKE_OWNER_EMAIL` e `SMOKE_OWNER_PASSWORD` em producao ou endpoint remoto.
- Defaults `owner@barbearia.local`/`owner123` ficam restritos a alvo local fora de producao.

### XSS/localStorage

- Helper `public/modules/sanitize.js` existe com `escapeHtml`, `safeText`, `safeAttr`, `safeNumber`, `safeCurrency` e `safeDate`.
- Pontos criticos em feedback, booking publico, app principal e topbar usam escape em dados dinamicos.
- Headers minimos existem: `Content-Security-Policy`, `X-Content-Type-Options: nosniff` e `Referrer-Policy: strict-origin-when-cross-origin`.
- `public/login.html` reduz payload persistido em `sb.authSession`.
- `authToken` ainda fica em `localStorage`; risco residual documentado na Fase 0.9.7 e mantido como pendencia real.

## Comandos executados

- `git status --short`: confirmou 26 modificados e 6 untracked antes desta fase.
- `git status -sb`: `## main...origin/main [ahead 1]`.
- `git branch --show-current`: `main`.
- `git log --oneline -15`: HEAD `7407bd1`.
- `git remote -v`: `origin https://github.com/dormammudev/software-barbearia.git`.
- `git diff --stat`: 26 arquivos, 2612 insercoes, 752 remocoes antes desta documentacao.
- `git diff --name-only`: listou os 26 modificados.
- `git ls-files --modified`: listou os 26 modificados.
- `git ls-files --others --exclude-standard`: listou os 6 untracked.
- `git diff -- .planning/README.md`: sem saida.
- `git log --oneline origin/main..HEAD`: `7407bd1`.
- `git log --oneline HEAD..origin/main`: sem saida.
- Verificacao segura de `DATABASE_URL`: presente, host `127.0.0.1`, banco `barbearia`, local `true`, marcador sensivel `false`.
- Verificacao de porta `3334`: livre antes e depois do smoke.
- `ps -eo pid,ppid,stat,comm,args | rg -i 'npm|node|vitest|codex'`: ha processos node/npm/codex/vscode, incluindo `node /root/software-barbearia/dist/src/server.js`; nao havia `vitest` persistente apos validacoes.
- `npm run build`: passou.
- `npm run test`: passou (`83 passed | 11 skipped`).
- `npm audit`: passou (`found 0 vulnerabilities`).
- `npm audit --omit=dev`: passou (`found 0 vulnerabilities`).
- `git diff --check`: passou sem saida.
- `NODE_ENV=development DATA_BACKEND=memory SMOKE_BASE_URL=http://127.0.0.1:3334 npm run smoke:api`: passou.
- `npm run test:db`: passou (`11 passed`).

## Pendencias reais

1. Organizar commits com staging seletivo por fase; nao usar `git add .`.
2. Enviar ao origin o commit local `7407bd1` quando autorizado.
3. Separar ou revisar manualmente as alteracoes antigas/preexistentes do Grupo D.
4. Rodar smoke remoto no ambiente alvo real com `SMOKE_BASE_URL`, `SMOKE_UNIT_ID`, `SMOKE_OWNER_EMAIL` e `SMOKE_OWNER_PASSWORD` validos.
5. Definir migracao de `authToken` de `localStorage` para cookie httpOnly/SameSite com mitigacao CSRF.
6. Endurecer CSP em fase futura removendo scripts/styles inline e dependencias CDN.

## Riscos de misturar commits

- Alto risco em `src/http/app.ts`, porque mistura RBAC, CORS/CSP, headers e rotas sensiveis.
- Alto risco em `public/app.js` e `public/styles/layout.css`, porque os diffs sao grandes e parte deles e preexistente.
- Medio risco nos trackers `.planning/23...` e `.planning/24...`, porque consolidam varias fases no mesmo arquivo.
- Medio risco em `.env.example`, porque concentra exemplos de producao, smoke e test:db; revisar para garantir que nao ha segredo real.
- Baixo risco nos documentos novos 99/100/101/102, desde que sejam commitados como documentacao.

## Decisao final

APROVADO PARA ORGANIZAR COMMITS.

Justificativa:
- Alteracoes foram classificadas por origem provavel.
- Grupos de commit foram sugeridos.
- `.env` nao aparece no status e nenhum segredo real foi exposto.
- Build, teste principal, audit, audit sem dev, diff check, smoke dev isolado e test:db passaram.
- Riscos restantes estao documentados e concentrados em separacao de commits, smoke remoto real, token em localStorage e CSP ainda compativel com inline/CDN.

## Proxima etapa recomendada

Executar uma fase operacional curta para organizar commits por grupos A, B e C com staging seletivo, mantendo Grupo D fora dos commits de hardening ate revisao separada. Depois, com autorizacao, enviar `7407bd1` e os commits novos ao remoto.
