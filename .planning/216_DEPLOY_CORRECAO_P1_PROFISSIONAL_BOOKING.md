# Fase 212.2.3.1 — Diagnóstico Prisma antes do deploy da correção P1

Data: 2026-06-20
Horario UTC: 2026-06-20T23:25:00Z

## Decisão

BLOQUEADO NO PRISMA.

O push da correção P1 foi concluído e o repositório está alinhado com `origin/main`, mas o deploy ativo foi bloqueado antes de `npm run build` e antes de `pm2 restart`, porque o Prisma não consegue alcançar o banco configurado em `127.0.0.1:5432`.

## Estado seguro confirmado

- Branch: `main`.
- Status: `main...origin/main`.
- Árvore: limpa.
- HEAD: `fb0429e fix: tornar profissional deterministico no booking publico`.
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

`pg_isready -h 127.0.0.1 -p 5432`:

```text
127.0.0.1:5432 - no response
```

`systemctl is-active postgresql`:

- Não pôde consultar via bus no sandbox: `Failed to connect to bus: Operation not permitted`.

`systemctl status postgresql --no-pager -l`:

- Exibiu `postgresql.service` como `active (exited)`.

`ss -tulpn`:

- Mostrou processo `postgres` escutando em `127.0.0.1:5432` e `[::1]:5432`.

## Causa provável

A causa provável do `Schema engine error` não é schema inválido nem ausência/corrupção de engine Prisma.

As evidências apontam para problema de conectividade/aceitação de conexão do PostgreSQL local:

- `prisma validate` passou.
- `prisma generate` passou.
- Engines existem.
- `pg_isready` retornou `no response`.
- Prisma Client não conseguiu conectar ao servidor em `127.0.0.1:5432`.
- `migrate status` falha somente ao tentar consultar o datasource.

## Deploy

Não executado:

- `npm run build`.
- `pm2 restart software-barbearia --update-env`.
- `npm run smoke:api:readonly`.
- teste controlado de booking público.
- criação/cancelamento de agendamento de teste.

Motivo: `npx prisma migrate status` não passou.

## Restrições respeitadas

- Não reiniciei PM2.
- Não rodei build.
- Não rodei migration deploy.
- Não rodei seed.
- Não alterei `.env`.
- Não imprimi `DATABASE_URL`.
- Não imprimi senha, token, chave ou segredo.
- Não alterei banco manualmente.
- Não fiz deploy ativo.
- Não criei agendamento.
- Não fiz checkout.
- Não fiz venda.
- Não fiz devolução.
- Não usei reset, rebase ou force push.
- Não usei `git add .` nem `git add -A`.

## Próximo passo recomendado

Investigar a indisponibilidade do PostgreSQL local em `127.0.0.1:5432` antes de liberar build/restart/deploy. O serviço PM2 e o health HTTP estavam saudáveis ao final do diagnóstico, então a aplicação em execução não foi alterada.
