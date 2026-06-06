# Fase 0.9.4 - Correcao critica de RBAC, permissoes e relatorios sensiveis

Data: 2026-06-06

## Estado inicial do working tree

Registrado antes de alterar codigo da fase, conforme criterio de auditoria.

### git status --short

```text
 M public/app.js
 M public/booking.html
 M public/components/operational-ui.js
 M public/components/sidebar.js
 M public/components/whatsapp.js
 M public/index.html
 M public/modules/configuracoes.js
 M public/modules/financeiro.js
 M public/styles/layout.css
 M src/application/operations-service.ts
 M src/application/prisma-operations-service.ts
 M src/http/app.ts
 M tests/api.spec.ts
```

### git status -sb

```text
## main...origin/main
 M public/app.js
 M public/booking.html
 M public/components/operational-ui.js
 M public/components/sidebar.js
 M public/components/whatsapp.js
 M public/index.html
 M public/modules/configuracoes.js
 M public/modules/financeiro.js
 M public/styles/layout.css
 M src/application/operations-service.ts
 M src/application/prisma-operations-service.ts
 M src/http/app.ts
 M tests/api.spec.ts
```

### git diff --stat

```text
 public/app.js                                |  543 +++++++++--
 public/booking.html                          |  165 +++-
 public/components/operational-ui.js          |  114 +--
 public/components/sidebar.js                 |   10 +-
 public/components/whatsapp.js                |   40 +-
 public/index.html                            |   30 +-
 public/modules/configuracoes.js              |  185 ++--
 public/modules/financeiro.js                 |  100 +-
 public/styles/layout.css                     | 1277 ++++++++++++++++++++++----
 src/application/operations-service.ts        |   26 +-
 src/application/prisma-operations-service.ts |   31 +-
 src/http/app.ts                              |   60 +-
 tests/api.spec.ts                            |   55 ++
 13 files changed, 2055 insertions(+), 581 deletions(-)
```

### git diff --name-only

```text
public/app.js
public/booking.html
public/components/operational-ui.js
public/components/sidebar.js
public/components/whatsapp.js
public/index.html
public/modules/configuracoes.js
public/modules/financeiro.js
public/styles/layout.css
src/application/operations-service.ts
src/application/prisma-operations-service.ts
src/http/app.ts
tests/api.spec.ts
```

### git log --oneline -5

```text
e70a140 mock db
f7fc202 login
1cede31 Simplifica usuarios e isola dados por unidade
35ff774 Inclui seed no typecheck
118fb66 Migra preferencia de tema legada
```

## Problema encontrado

Auditoria local reportou que o backend declarava politicas por role, mas nao aplicava bloqueio efetivo quando o usuario autenticado tinha role diferente da permitida. Isso permitia acessos indevidos a rotas sensiveis de usuarios, auditoria, configuracoes e relatorios gerenciais.

## Evidencias da auditoria

- `profissional GET /users -> 200`
- `recepcao GET /audit/events -> 200`
- `profissional GET /settings -> 200`
- `profissional GET /reports/management/financial -> 200`
- `normalizeUserRole()` promovia `recepcao` e `profissional` para `owner`.
- `assertManagementReportAccess()` estava vazio.
- Alguns testes esperavam sucesso em acessos que deveriam ser bloqueados.

## Causa raiz

1. `policy.roles` era declarado na matriz de rotas, mas o `preHandler` validava apenas autenticacao, unidade e permissao granular.
2. `normalizeUserRole()` retornava `owner` para roles validas e tambem para valores invalidos, promovendo indevidamente perfis nao-owner.
3. `assertManagementReportAccess()` nao aplicava nenhuma regra efetiva antes de liberar relatorios gerenciais sensiveis.
4. Tokens autenticados nao revalidavam se `role` continuava dentro do enum permitido.
5. Testes existentes ainda aceitavam `200` em probes que deveriam retornar `403`.

## Alteracoes feitas

1. O `preHandler` passou a aplicar `policy.roles` para toda rota autenticada, retornando `Acesso negado` quando o perfil autenticado nao esta entre os roles permitidos.
2. `normalizeUserRole()` passou a preservar `owner`, `recepcao` e `profissional` corretamente, rejeitando qualquer role invalida.
3. `verifyAccessToken()` passou a validar o role carregado no token antes de aceitar a sessao.
4. Relatorios gerenciais e exportacao CSV em `/reports/management/*` passaram a ser owner-only.
5. `assertManagementReportAccess()` passou a bloquear perfis nao-owner quando a rota esta autenticada.
6. Testes de API foram corrigidos para esperar `403` em acessos sensiveis por recepcao/profissional.
7. Probes reais de RBAC foram adicionados para usuarios, auditoria, configuracoes, financeiro, relatorios gerenciais e exportacao CSV.

## Rotas corrigidas

- `/users`
- `/audit/events`
- `/settings`
- `/settings/*`
- `/reports/management/*`
- `/reports/management/export.csv`
- `/financial/*`
- `/financial/commissions/:id/pay`
- `/integrations/*` e `/automations/*` permanecem owner-only pela politica existente.
- Rotas multiunidade permanecem owner-only pela politica existente.

## Matriz de permissoes final

### Publicas

- `/health`
- `/`
- `/login`
- `/agendamento`
- `/booking.html`
- `/public/*`
- `/favicon.ico`
- `/auth/login`
- `/auth/firebase`
- Webhook de billing configurado como publico pela politica atual.

### Owner

- Usuarios.
- Auditoria.
- Configuracoes.
- Relatorios gerenciais e exportacao CSV.
- Financeiro, comissoes e pagamento de comissao.
- Integracoes e automacoes.
- Multiunidade.
- Billing/reconciliacao.
- Retencao/scoring.
- Metas com escrita.

### Recepcao

- Agenda, appointments, catalogo, dashboard, performance operacional, servicos, clientes, estoque, inventario e vendas PDV conforme politica atual.
- Sem acesso a usuarios, auditoria, configuracoes, financeiro gerencial, relatorios gerenciais, exportacao gerencial ou pagamento de comissao.

### Profissional

- Leituras operacionais, performance e appointments conforme politica atual.
- Sem acesso a usuarios, auditoria, configuracoes, financeiro global, relatorios gerenciais, exportacao gerencial ou pagamento de comissao.

## Testes adicionados/corrigidos

1. `/auth/me` agora valida que cada perfil autenticado permanece com o role correto.
2. Login com role invalida em `AUTH_USERS_JSON` retorna `401` e nao promove o usuario para owner.
3. Probes reais garantem `403` para profissional em `/users`, `/settings` e `/reports/management/financial`.
4. Probes reais garantem `403` para recepcao/profissional em `/audit/events`.
5. Testes financeiros garantem que apenas owner paga comissao e acessa resumo financeiro sensivel.
6. Testes de relatorios gerenciais garantem owner-only para summary, audit, financial e exportacao CSV.
7. Testes antigos que aceitavam sucesso indevido foram ajustados para `403`.

## Comandos executados

- `git status --short`
- `git status -sb`
- `git diff --stat`
- `git diff --name-only`
- `git log --oneline -5`
- `npx vitest run tests/api.spec.ts -t "autentica e preserva|role invalida|bloqueia probes|refina permissoes|preserva permissoes"`: passou (`5 passed`, `61 skipped`).
- `npx vitest run tests/api.spec.ts`: passou (`66 passed`).
- `npm run build`: passou.
- `npm run test`: passou (`3 passed | 1 skipped`, `74 passed | 11 skipped`).
- `npm run smoke:api`: bloqueado no ambiente Linux atual porque o script chama `powershell` e o binario nao esta instalado (`sh: 1: powershell: not found`).
- Checagem segura de `DATABASE_URL`: variavel nao definida.
- `npm run test:db`: nao executado porque nao ha `DATABASE_URL` local/isolado definido para validar seguranca da base alvo.

## Pendencias reais

1. Reexecutar `npm.cmd run smoke:api` em ambiente Windows/PowerShell ou instalar PowerShell no host Linux antes de usar este smoke.
2. Reexecutar `npm.cmd run test:db` somente com `DATABASE_URL` explicitamente local/isolado e proprio para teste.
3. Empacotar commits de forma limpa, separando esta correcao critica das alteracoes pre-existentes no working tree.
4. `AUTH_ENFORCED=false` continua permitindo modo dev sem autenticacao por decisao atual do projeto; os bloqueios de RBAC sao garantidos no modo autenticado/enforced.
5. Uma matriz ainda mais ampla pode ser refinada depois, mas os probes criticos solicitados foram cobertos.

## Decisao final

Aprovado para a correcao critica local de RBAC com ressalvas de ambiente.

Build, suite principal e testes focados de API passaram. Smoke e teste DB nao foram executados por limitacoes objetivas do ambiente atual, registradas acima.
