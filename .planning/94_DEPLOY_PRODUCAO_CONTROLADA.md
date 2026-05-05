# 94 - Deploy / producao controlada

Data: 2026-05-04
Fase: 0.9
Status: PREPARACAO DE RELEASE CONTROLADA

## A) Objetivo da fase
Preparar o Software Barbearia para producao controlada, com ambiente real, banco PostgreSQL real, autenticacao obrigatoria, smoke pos-deploy, checklist visual humano e plano minimo de rollback.

Esta etapa nao representa producao publica aberta. O objetivo e liberar uso acompanhado, com dados controlados, operador conhecido, janela de observacao e criterio claro para bloquear ou voltar versao.

Fora do escopo:
- IA/WhatsApp.
- Feature nova.
- Modulo novo.
- Troca de stack.
- Refatoracao arquitetural.
- Mudanca nas regras financeiras ja validadas.
- Deploy real sem checklist e confirmacao humana.

## B) Pre-requisitos tecnicos
- Node >=22 instalado no host de deploy.
- PostgreSQL real disponivel e acessivel pela aplicacao.
- Prisma Client gerado com `npm.cmd run db:generate`.
- Estrategia de schema definida antes do deploy: `npm.cmd run db:push` para ambiente controlado/homologacao ou migrations revisadas quando o processo de migracao formal estiver fechado.
- `DATA_BACKEND=prisma`.
- `AUTH_ENFORCED=true`.
- `AUTH_SECRET` forte, unico e diferente de `dev-secret-change-me`.
- `DATABASE_URL` apontando para banco correto de homologacao/producao controlada.
- `PORT` configurada.
- CORS revisado para o dominio real. O backend atual usa CORS permissivo; em exposicao publica, restringir antes de abrir a internet.
- Dominio e HTTPS definidos antes de uso real por usuarios.
- Logs habilitados e acessiveis.
- Backup do banco antes de qualquer `db:push` ou migration.
- Smoke pos-deploy executado contra a URL alvo.

## C) Variaveis de ambiente
Valores abaixo sao exemplos seguros ou placeholders. Nao commitar segredos reais.

| Variavel | Obrigatoria | Exemplo seguro | Descricao |
| --- | --- | --- | --- |
| `NODE_ENV` | Sim | `production` | Define modo de execucao. Em producao, bloqueia `AUTH_SECRET` fraco/dev. |
| `PORT` | Sim | `3333` | Porta HTTP da API. |
| `DATA_BACKEND` | Sim | `prisma` | Em producao controlada deve usar PostgreSQL via Prisma. |
| `DATABASE_URL` | Sim | `postgresql://app_user:***@db-host:5432/barbearia?schema=public` | URL real do banco. Criar fora do Git. |
| `AUTH_ENFORCED` | Sim | `true` | Deve estar `true` em producao controlada. |
| `AUTH_SECRET` | Sim | `replace-with-strong-random-32-plus-chars` | Segredo HMAC dos tokens. Nunca usar `dev-secret-change-me`. |
| `HTTP_LOG_ENABLED` | Recomendado | `true` | Liga logs HTTP estruturados. |
| `LOG_LEVEL` | Recomendado | `info` | Nivel de log (`info`, `warn`, `error`). |
| `AUTH_USERS_JSON` | Dev/fallback | nao usar em producao Prisma | Fallback para backend memory/dev. Preferir usuarios persistentes no banco. |
| `BILLING_WEBHOOK_SECRET` | Se billing ativo | `replace-with-strong-webhook-secret` | Segredo padrao de webhook de billing. |
| `BILLING_WEBHOOK_SECRET_<PROVIDER>` | Se billing ativo | `BILLING_WEBHOOK_SECRET_STRIPE=...` | Segredo especifico por provider normalizado em uppercase. |
| `SMOKE_BASE_URL` | Opcional | `https://barbearia.example.com` | URL alvo para `smoke:api`. |
| `SMOKE_UNIT_ID` | Opcional | `unit-01` | Unidade usada pelo smoke. |
| `SMOKE_OWNER_EMAIL` | Opcional | `owner@example.com` | Usuario owner usado pelo smoke. |
| `SMOKE_OWNER_PASSWORD` | Opcional | definido fora do Git | Senha usada pelo smoke. Nao registrar em arquivo versionado. |

## D) Checklist antes do deploy
- [ ] Worktree/commit revisado e limpo para a versao que sera implantada.
- [ ] `npm.cmd run test` passando.
- [ ] `npm.cmd run build` passando.
- [ ] `npm.cmd run smoke:api` passando localmente.
- [ ] `npm.cmd run test:db` passando com PostgreSQL real.
- [ ] `npm.cmd run db:generate` executado quando schema/dependencias Prisma mudarem.
- [ ] Backup do banco realizado antes de schema change.
- [ ] Migration ou `db:push` revisado por humano.
- [ ] `.env` real criado fora do Git.
- [ ] `DATA_BACKEND=prisma`.
- [ ] `AUTH_ENFORCED=true`.
- [ ] `AUTH_SECRET` forte.
- [ ] `DATABASE_URL` conferida contra o ambiente correto.
- [ ] Owner inicial definido em usuario persistente.
- [ ] Senha inicial trocada antes de liberar uso real.
- [ ] CORS revisado para o dominio real.
- [ ] HTTPS/domino revisados.
- [ ] `prisma/seed.ts` nao sera rodado em base real, pois limpa dados operacionais.

## E) Passo a passo de deploy controlado
Comandos genericos e seguros para preparar build:

```powershell
npm.cmd install
npm.cmd run db:generate
npm.cmd run build
```

Para ambiente controlado/homologacao com schema ainda sem fluxo formal de migrations:

```powershell
npm.cmd run db:push
```

Se o processo de migrations estiver fechado e revisado, usar migrations em vez de `db:push`:

```powershell
npm.cmd run db:migrate
```

Subida local para validacao:

```powershell
npm.cmd run dev:api
```

Smoke contra alvo local ou remoto:

```powershell
npm.cmd run smoke:api
```

Ou parametrizado:

```powershell
$env:SMOKE_BASE_URL="https://barbearia.example.com"
$env:SMOKE_UNIT_ID="unit-01"
$env:SMOKE_OWNER_EMAIL="owner@example.com"
$env:SMOKE_OWNER_PASSWORD="<senha fora do Git>"
npm.cmd run smoke:api
```

Docker/PostgreSQL:
- O `package.json` possui `db:up` e `db:down`, mas nao ha `docker-compose.yml` versionado neste workspace.
- Se o compose for adicionado/fornecido no ambiente, o fluxo local previsto e:

```powershell
npm.cmd run db:up
npm.cmd run db:push
npm.cmd run test:db
```

## F) Smoke pos-deploy
O smoke pos-deploy deve cobrir, no minimo:
- `/health`.
- `POST /auth/login`.
- Agenda: criar, confirmar e iniciar atendimento.
- Checkout de atendimento.
- Venda de produto.
- Historico de vendas.
- Devolucao de produto.
- Financeiro.
- Comissoes consultaveis.
- Auditoria.
- Permissoes basicas por perfil em validacao manual complementar.

O script atual `scripts/smoke-api-flow.ps1` cobre o fluxo operacional owner de ponta a ponta e aceita `SMOKE_BASE_URL`, `SMOKE_UNIT_ID`, `SMOKE_OWNER_EMAIL` e `SMOKE_OWNER_PASSWORD`.

## G) Checklist visual final
Antes da liberacao real, executar manualmente:
- [ ] Owner desktop.
- [ ] Recepcao desktop.
- [ ] Profissional desktop.
- [ ] Owner mobile.
- [ ] Fluxo agenda -> checkout -> financeiro -> auditoria.
- [ ] Fluxo venda -> devolucao -> estoque -> financeiro -> auditoria.
- [ ] Pagamento de comissao -> despesa financeira -> auditoria.
- [ ] Confirmar que o seletor visual de perfil usa token real correspondente ao perfil.
- [ ] Confirmar que recepcao/profissional nao veem nem acessam modulos bloqueados.

## H) Rollback
Plano minimo:
- Registrar versao/commit implantado antes do deploy.
- Manter backup do banco feito imediatamente antes de migration ou `db:push`.
- Se o deploy falhar antes de uso real, voltar para o commit anterior e reiniciar a aplicacao.
- Se a falha envolver schema/dados, avaliar restauracao do banco apenas quando necessario e com aprovacao humana.
- Nao rodar seed destrutivo em base real.
- Registrar incidente em `.planning/log` ou documento de ocorrencia equivalente, com horario, commit, causa, decisao e acao tomada.

## I) Criterios de bloqueio
Nao liberar producao controlada se houver:
- P0/P1 aberto.
- Login quebrado.
- Owner sem auditoria.
- Recepcao/profissional com acesso indevido.
- Checkout duplicando financeiro.
- Refund duplicando estoque/financeiro.
- Comissao sem despesa financeira.
- Audit log ausente em fluxo financeiro critico.
- Smoke falhando sem explicacao documentada.
- `AUTH_SECRET` fraco/dev.
- `DATABASE_URL` incorreta.
- Ausencia de backup antes de migration/schema change.
- Falha visual bloqueante em desktop/mobile nos fluxos criticos.

## J) Decisao final
Decisao da Fase 0.9: APROVADO COM RESSALVAS.

Justificativa:
- Checklist de deploy controlado criado.
- `.env.example` revisado para reforcar producao Prisma, auth forte e ausencia de segredos reais.
- Smoke passou a aceitar URL/credenciais por ambiente.
- Guard minimo de `AUTH_SECRET` e `BILLING_WEBHOOK_SECRET` em `NODE_ENV=production` foi adicionado.
- Ainda falta a ultima passada visual humana desktop/mobile registrada na Fase 0.8 antes de executar deploy real.

Opcoes de decisao para o deploy real:
- `APROVADO PARA PRODUCAO CONTROLADA`: somente apos smoke alvo + checklist visual final + backup confirmado.
- `APROVADO COM RESSALVAS`: permitido apenas para homologacao/acompanhamento interno, sem uso comercial aberto.
- `BLOQUEADO`: se qualquer criterio de bloqueio acima aparecer.

## Diagnostico da preparacao
- Scripts essenciais existem: `build`, `test`, `test:db`, `smoke:api`, `db:generate`, `db:push`, `db:migrate`, `dev:api`, `db:up`, `db:down`.
- `README.md` nao existe; a documentacao operacional desta fase fica centralizada neste arquivo.
- `docker-compose.yml` nao existe no workspace; scripts Docker dependem de arquivo externo/ambiente.
- `prisma/seed.ts` limpa dados operacionais e deve ser tratado como seed local/desenvolvimento, nao como comando de producao.
- `src/http/app.ts` mantem `GET /users` e `GET /audit/events` owner-only via policy central.
- `POST /auth/login` nao retorna `passwordHash`.
- Logs HTTP registram metodo, rota, status, latencia, requestId, usuario, role e unidade; nao registram senha nem token.

## Validacao executada nesta fase
- Checagem sintatica de `scripts/smoke-api-flow.ps1`: passou.
- `npm.cmd run build`: passou.
- `npm.cmd run test`: falhou no sandbox por `spawn EPERM` do Vite/Rolldown; passou fora do sandbox (`63 passed | 10 skipped`).
- `npm.cmd run smoke:api`: falhou no sandbox por verificacao/download da engine Prisma; passou fora do sandbox.
- `npm.cmd run test:db`: falhou no sandbox por `spawn EPERM` do Vite/Rolldown; passou fora do sandbox (`10 passed`).

Evidencias do smoke:
- Agendamento testado: `f12080d9-4e9a-4300-86b8-ed7c9c4a6fe8`.
- Checkout gerado: `75`.
- Venda testada: `5b348fcd-60be-4774-8a51-282c39d38312`.
- Refund testado: `3265e455-7ba0-46fe-b84b-dfcd3b76e7b7`.
