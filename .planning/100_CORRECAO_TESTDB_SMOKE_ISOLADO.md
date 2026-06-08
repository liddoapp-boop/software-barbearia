Data: 2026-06-07
Escopo: Fase 0.9.6 - Correcao da suite Prisma/test:db e smoke com ambiente isolado.

## Objetivo da fase
Corrigir as falhas herdadas da Fase 0.9.5 em `test:db` e tornar o smoke Node.js diagnostico e confiavel, sem depender cegamente de credenciais default nem de massa fragil.

## Estado inicial registrado
- `git status --short`: worktree ja estava sujo com alteracoes preexistentes em `.env.example`, `.planning/*`, `package*.json`, `prisma/seed.ts`, `public/*`, `src/application/*`, `src/http/*`, `tests/*`, alem de `.planning/99_HARDENING_PRODUCAO_AMBIENTE_DEPENDENCIAS.md` e `scripts/smoke-api-flow.mjs` nao rastreados.
- `git status -sb`: `## main...origin/main [ahead 1]`.
- `git diff --stat`: 21 arquivos modificados, 2340 insercoes e 658 remocoes antes desta fase.
- `git diff --name-only`: confirmou alteracoes preexistentes nos arquivos acima, incluindo frontend fora do escopo.
- `git log --oneline -5`: `7407bd1`, `e70a140`, `f7fc202`, `1cede31`, `35ff774`.

## Falhas herdadas da 0.9.5
1. `npm run smoke:api` usava credenciais dev default contra a API ativa em `127.0.0.1:3333` e recebia `401`.
2. `npm run test:db` falhava em 8 testes Prisma com `404`.
3. O `test:db` precisava comprovar que suas fixtures nao dependiam de seed destrutivo nem de dados preexistentes.

## Diagnostico dos 8 testes 404
Causa comum: `createScenario()` criava `Professional` sem `businessId`. Pelo schema Prisma, o default e `unit-01`, mas cada cenario DB cria `unit-db-<uuid>`. O backend Prisma exige `Professional.id + businessId == unitId` em `schedule()` e `registerProductSale()`. Assim, a rota existia, o backend memory nao era o problema, a autenticacao estava desabilitada nesses testes (`AUTH_ENFORCED=false`) e o erro vinha da fixture Prisma inconsistente.

| Teste | Metodo/rota | Payload usado | Recebido | Esperado | Diagnostico |
| --- | --- | --- | --- | --- | --- |
| `persiste agendamento e conclusao com receita` | `POST /appointments` | `unitId`, `clientId`, `professionalId`, `serviceId`, `startsAt`, `changedBy` do cenario | `404` via erro `Profissional nao encontrado ou inativo` | `200` com `appointment.id` | Rota existe em `app.ts`; fixture criava profissional em `unit-01`, nao no `unitId` do cenario. |
| `paga comissao concorrente sem duplicar despesa financeira` | `POST /appointments` | Mesmo helper `createAppointment()` | `404` | `200` | Mesma causa; falha antes do checkout/comissao. |
| `faz replay simultaneo de refund com mesma idempotencyKey sem duplicar efeitos ou auditoria` | `POST /sales/products` | `unitId`, `clientId`, `professionalId`, `soldAt`, `items[{productId, quantity}]` | `404` via erro `Profissional nao encontrado` | `200` com `sale.id` | Rota existe em `app.ts`; fixture Prisma do profissional estava fora da unidade. |
| `rejeita payload divergente com mesma idempotencyKey sem efeito colateral extra` | `POST /sales/products` | Mesmo helper `createProductSale()` | `404` | `200` | Mesma causa; nao era idempotencia. |
| `bloqueia devolucao concorrente acima do vendido e preserva estoque` | `POST /sales/products` | Mesmo helper `createProductSale()` | `404` | `200` | Mesma causa; nao era estoque/refund. |
| `finaliza checkout concorrente sem duplicar receita de atendimento` | `POST /appointments` | Mesmo helper `createAppointment()` | `404` | `200` | Mesma causa; falha antes da concorrencia de checkout. |
| `consulta auditoria persistente via novo app Prisma` | `POST /sales/products` | Mesmo helper `createProductSale()` | `404` | `200` | Mesma causa; falha antes da auditoria persistente. |
| `gera relatorios gerenciais e CSV com dados reais do Prisma` | `POST /appointments` | Mesmo helper `createAppointment()` | `404` | `200` | Mesma causa; falha antes dos relatorios. |

Classificacao:
- Rota ausente: nao.
- Path antigo: nao.
- Auth: nao nos 8 casos, pois `AUTH_ENFORCED=false`.
- Tenant guard: nao; era fixture com `Professional.businessId` incorreto.
- Massa inexistente: sim, massa criada parcialmente fora da unidade.
- Hardening de producao: nao.
- Servico Prisma: comportamento correto; recusou recurso fora do tenant/unidade.
- Backend memory: nao aplicavel; os caminhos existem e o problema estava na fixture Prisma.

## Correcao feita
- `tests/db.integration.spec.ts`: `createScenario()` agora cria `Professional` com `businessId: unitId`.
- Nenhuma rota, regra financeira, schema Prisma, seed, migration, IA/WhatsApp ou frontend visual foi alterado nesta fase.

## Smoke Node.js
Correcoes feitas em `scripts/smoke-api-flow.mjs`:
- Carrega `.env` com `dotenv.config({ quiet: true })`, preservando precedencia de variaveis externas.
- Le `SMOKE_OWNER_EMAIL` e `SMOKE_OWNER_PASSWORD`.
- Usa default local (`owner@barbearia.local` / `owner123`) somente quando o alvo e local e `NODE_ENV !== production`.
- Exige credenciais explicitas quando `NODE_ENV=production` ou quando `SMOKE_BASE_URL` aponta para endpoint remoto.
- Em `401`, falha com mensagem clara de credenciais invalidas ou usuario inexistente, sem imprimir senha.
- Em `403`, informa provavel falta de acesso a `SMOKE_UNIT_ID`.
- Mantem `SMOKE_BASE_URL` e compatibilidade Windows/Linux.
- Ao iniciar API local em Unix, encerra o grupo de processos no cleanup para nao deixar `tsx src/server.ts` pendurado.

## Como rodar test:db com banco isolado
1. Configure `DATABASE_URL` para um banco PostgreSQL dedicado a teste, nunca producao.
2. Confirme que a URL nao contem indicios sensiveis como `prod`, `production`, `render` ou `railway`.
3. Rode:

```bash
npm run test:db
```

A suite cria seus proprios `Unit`, `Service`, `Professional`, `Client`, `Product` e usuarios persistentes. Nao depende de `prisma/seed.ts` nem de dados preexistentes.

## Como rodar smoke local
Para smoke local isolado com defaults dev:

```bash
NODE_ENV=development DATA_BACKEND=memory SMOKE_BASE_URL=http://127.0.0.1:3334 npm run smoke:api
```

O runner sobe a API atual na porta informada se `/health` estiver offline.

## Como rodar smoke remoto
Para ambiente remoto ou producao, informe credenciais reais:

```bash
SMOKE_BASE_URL=https://api.example.com SMOKE_UNIT_ID=unit-01 SMOKE_OWNER_EMAIL=dono@example.com SMOKE_OWNER_PASSWORD=senha-real npm run smoke:api
```

Nao commitar credenciais reais em `.env` versionado. O runner nao imprime a senha.

## Comandos executados
- `git status --short`
- `git status -sb`
- `git diff --stat`
- `git diff --name-only`
- `git log --oneline -5`
- `npm run test:db -- --reporter=verbose` antes da correcao: falhou com 8 `404`.
- `npm run test:db -- --reporter=verbose` apos correcao: passou (`11 passed`).
- `npm run smoke:api`: falhou cedo no ambiente atual exigindo `SMOKE_OWNER_EMAIL`/`SMOKE_OWNER_PASSWORD`, pois o `.env` local indica contexto que nao deve usar defaults.
- `NODE_ENV=development DATA_BACKEND=memory SMOKE_BASE_URL=http://127.0.0.1:3334 npm run smoke:api`: passou.
- `node --check scripts/smoke-api-flow.mjs`: passou.
- `npm run build`: passou.
- `npm run test`: passou (`80 passed | 11 skipped`).
- `npm audit`: passou com 0 vulnerabilidades.
- `npm audit --omit=dev`: passou com 0 vulnerabilidades.

## Hardening dev/test verificado
- `npm run test` manteve a suite de hardening passando dentro da suite completa.
- `NODE_ENV=test/development` nao exige `CORS_ORIGIN` para iniciar em dev/test.
- `DATA_BACKEND=memory` continua permitido fora de producao.
- Usuarios dev/default continuam permitidos apenas fora de producao.
- Producao continua bloqueada para `AUTH_SECRET` fraco/ausente, `DATA_BACKEND` diferente de `prisma`, `AUTH_ENFORCED=false`, `CORS_ORIGIN` ausente/permissivo e credenciais dev em `AUTH_USERS_JSON`.

## Pendencias reais
1. Rodar smoke remoto contra o ambiente alvo real com `SMOKE_BASE_URL`, `SMOKE_OWNER_EMAIL`, `SMOKE_OWNER_PASSWORD` e `SMOKE_UNIT_ID` reais.
2. Garantir que o banco usado por `DATABASE_URL` em CI/homologacao seja dedicado a teste e descartavel.
3. Separar commits sem misturar alteracoes preexistentes do worktree; nao usar `git add .`.
4. XSS/localStorage permanece fora desta fase.

## Decisao final
Fase 0.9.6 aprovada localmente para `test:db` e smoke dev isolado. Release/deploy continua bloqueado ate o smoke remoto passar com credenciais reais no ambiente alvo.
