# Fase 216 — Deploy da correção P1 de profissional no booking público

Data: 2026-06-20
Horario UTC: 2026-06-20T23:25:00Z

## Decisão

DEPLOY APROVADO.

O push da correção P1 foi concluído, a conectividade real do PostgreSQL foi validada fora do sandbox, `npx prisma migrate status` passou, o build passou, o PM2 foi reiniciado de forma controlada, o smoke readonly passou e o teste específico do booking público confirmou que o profissional escolhido explicitamente é gravado corretamente.

Observação histórica: a etapa anterior registrou bloqueio porque `npx prisma migrate status` e `pg_isready` foram executados dentro do sandbox de rede e não conseguiam alcançar `127.0.0.1:5432`. Na Fase 216.1, os mesmos comandos foram repetidos fora do sandbox, sem expor segredo, e passaram.

## Estado seguro confirmado

- Branch: `main`.
- Status: `main...origin/main`.
- Árvore: limpa.
- HEAD inicial: `de249bb docs: registrar deploy da correcao de profissional no booking`.
- PM2: `software-barbearia` online.
- Health público: `{"ok":true,"authEnforced":true}`.

## Diagnóstico executado

Comandos readonly executados:

- `git status -sb`
- `git status --short`
- `git log --oneline -8`
- `pm2 status`
- `curl -sS https://barbearia.76-13-161-250.nip.io/health`
- `node -v`
- `npm -v`
- `npx prisma -v`
- `printenv NODE_ENV`
- `printenv HOST`
- `printenv PORT`
- `test -f .env`
- `test -f prisma/schema.prisma`
- `pg_isready -h 127.0.0.1 -p 5432`
- `systemctl is-active postgresql`
- `systemctl status postgresql --no-pager -l`
- `npx prisma validate`
- `npx prisma generate`
- `ss -tulpn`
- `DEBUG="prisma:*" npx prisma migrate status` com sanitização de URL
- `ls -la node_modules/.prisma/client`
- `ls -la node_modules/@prisma/engines`
- `du -sh node_modules/.prisma node_modules/@prisma`
- `npx prisma migrate status --schema prisma/schema.prisma`
- consulta readonly mínima via Prisma Client: `SELECT 1 AS ok`

Nenhum comando imprimiu `DATABASE_URL`, senha, token, hash ou segredo.

## Ambiente observado

- Node.js: `v22.22.2`.
- npm: `10.9.7`.
- Prisma CLI: `6.19.3`.
- `@prisma/client`: `6.19.3`.
- Binary target: `debian-openssl-3.0.x`.
- Schema engine encontrado em `node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x`.
- Query engine encontrado em `node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node`.
- `.env`: existe.
- `prisma/schema.prisma`: existe.
- `NODE_ENV`, `HOST` e `PORT`: não definidos no ambiente do shell.

## Resultados Prisma

`npx prisma validate`:

- Passou.
- Resultado: `The schema at prisma/schema.prisma is valid`.

`npx prisma generate`:

- Passou.
- Prisma Client gerado com sucesso.
- Não alterou banco.
- `git status --short` permaneceu limpo após a geração.

`npx prisma migrate status`:

- Continua falhando.
- Resultado:

```text
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "barbearia", schema "public" at "127.0.0.1:5432"
Error: Schema engine error:
```

`npx prisma migrate status --schema prisma/schema.prisma`:

- Falhou da mesma forma.

Consulta readonly via Prisma Client:

- Falhou com `PrismaClientInitializationError`.
- Mensagem sanitizada:

```text
Can't reach database server at `127.0.0.1:5432`

Please make sure your database server is running at `127.0.0.1:5432`.
```

## PostgreSQL

Resultado dentro do sandbox:

```text
127.0.0.1:5432 - no response
```

Resultado real fora do sandbox:

```text
127.0.0.1:5432 - accepting connections
localhost:5432 - accepting connections
/var/run/postgresql:5432 - accepting connections
```

`systemctl is-active postgresql`:

- Fora do sandbox: `active`.

`systemctl status postgresql --no-pager -l`:

- Exibiu `postgresql.service` como `active (exited)`.

`ss -tulpn`:

- Mostrou processo `postgres` escutando em `127.0.0.1:5432` e `[::1]:5432`.

`pg_lsclusters` dentro do sandbox:

- Reportou `16 main 5432 down nobody`, mas esse resultado não representou o estado real de conectividade usado pelo Prisma fora do sandbox.

Socket local como usuário `postgres`:

- `sudo -u postgres psql -d postgres -c "select now(), version();"` passou.
- `sudo -u postgres psql -d barbearia -c "select now();"` passou.

TCP local como usuário `postgres`:

- Pediu senha e falhou sem senha, comportamento compatível com configuração de autenticação por TCP. Não foi impresso segredo.

Logs PostgreSQL:

- Sem `PANIC`, `out of memory`, `no space left on device`, corrupção, restauração ou shutdown recente.
- Últimos registros relevantes foram erros esperados de testes/integridade anteriores, como constraint duplicada em testes e serialização concorrente.
- Registro `root@root FATAL: role "root" does not exist` corresponde a tentativa de `pg_isready`/conexão sem usuário explícito e não indicou falha do cluster.

Restart PostgreSQL:

- Não foi executado. Como `pg_isready` real passou e o Prisma passou fora do sandbox, não havia necessidade de reiniciar o banco.

## Causa provável

A causa provável do `Schema engine error` inicial foi execução de comandos de conectividade local dentro do sandbox de rede, que não conseguia alcançar corretamente o PostgreSQL em `127.0.0.1:5432`.

Não foi identificado problema real de schema, engine Prisma ou indisponibilidade do PostgreSQL fora do sandbox:

- `prisma validate` passou.
- `prisma generate` passou.
- Engines existem.
- `pg_isready` real fora do sandbox retornou `accepting connections`.
- Socket local PostgreSQL funcionou.
- `npx prisma migrate status` fora do sandbox passou.

## Deploy

Executado:

- `npm run build`: passou.
- `pm2 restart software-barbearia --update-env`: executado.
- `pm2 status`: `software-barbearia` online após restart.
- `curl -sS https://barbearia.76-13-161-250.nip.io/health`: `{"ok":true,"authEnforced":true}`.
- `npm run smoke:api:readonly`: passou.

`npx prisma migrate status` fora do sandbox:

```text
16 migrations found in prisma/migrations
Database schema is up to date!
```

Smoke readonly pós-deploy:

- Health público OK.
- Página pública OK.
- Proteção sem token OK.
- Login owner OK.
- `/auth/me` OK.
- Agenda OK.
- Clientes OK.
- Catálogo/PDV OK.
- Financeiro OK.
- Serviços OK.
- Auditoria OK.
- Configurações OK.
- Relatórios OK.

## Teste específico do booking público

Cliente de teste:

```text
CLIENTE TESTE PROFISSIONAL DETERMINISTICO - FASE 212.2.3
```

Telefone fictício:

```text
00000021223
```

Resultado:

- Profissionais elegíveis para `svc-barba`: 4.
- `Geovane Borges` encontrado com `professionalId = pro-01`.
- `Rafael Andrade` também presente como elegível.
- Slot explícito consultado para Geovane:
  - Data: `2026-06-22`.
  - Hora local: `09:00`.
  - UTC: `2026-06-22T12:00:00.000Z`.
  - `professionalId`: `pro-01`.
  - `professionalName`: `Geovane Borges`.
- Slot sem preferência no mesmo horário retornou deterministicamente:
  - `professionalId`: `pro-01`.
  - `professionalName`: `Geovane Borges`.
- Agendamento de teste criado:
  - ID: `b133406c-8a38-4d1f-b310-770084db6617`.
  - Profissional esperado: `Geovane Borges`.
  - Profissional gravado: `Geovane Borges`.
- Detalhe autenticado confirmou `professionalId = pro-01` e `professional = Geovane Borges`.
- Agendamento cancelado com sucesso.
- Slot voltou a ficar disponível para Geovane após cancelamento.
- Financeiro pesquisado para o cliente de teste:
  - Antes: `0` transações.
  - Depois: `0` transações.
  - Alteração: `false`.

Não executado no teste:

- Checkout.
- Venda.
- Devolução.
- Pagamento.

## Restrições respeitadas

- Não rodei migration deploy.
- Não rodei seed.
- Não alterei `.env`.
- Não imprimi `DATABASE_URL`.
- Não imprimi senha, token, chave ou segredo.
- Não alterei banco manualmente.
- Não reiniciei PostgreSQL.
- Reiniciei apenas `software-barbearia` via PM2 após build e Prisma OK.
- Criei no máximo um agendamento de teste controlado e o cancelei.
- Não fiz checkout.
- Não fiz venda.
- Não fiz devolução.
- Não fiz pagamento.
- Não usei reset, rebase ou force push.
- Não usei `git add .` nem `git add -A`.

## Próximo passo recomendado

Seguir para nova rodada de piloto owner/agenda se desejado, agora com a correção P1 ativa em produção e o contrato de profissional validado. Manter o cliente/agendamento de teste documentado como rastreável; o agendamento criado nesta fase foi cancelado e não gerou financeiro.
