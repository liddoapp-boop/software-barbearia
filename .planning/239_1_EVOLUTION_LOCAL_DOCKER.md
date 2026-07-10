# 239.1 - Evolution API local isolada com Docker

Data: 2026-07-10

## Objetivo

Criar uma Evolution API local isolada via Docker para o Software Barbearia, sem alterar banco, migrations, seeds, booking, financeiro, estoque, agenda, autenticacao ou VPS.

## Base oficial consultada

- Documentacao Evolution Foundation: instalacao Docker informa compose para Evolution API v2, volume de instancias, `.env` local e acesso em `localhost:8080`.
- Documentacao Evolution API Docker Deployment: recomenda Docker Compose com API, Manager, PostgreSQL, Redis, volume de instancias e bind `127.0.0.1:8080:8080`.
- Documentacao de variaveis do Docker: usa `AUTHENTICATION_API_KEY`, `DATABASE_PROVIDER`, `DATABASE_CONNECTION_URI`, `CACHE_REDIS_ENABLED` e `CACHE_REDIS_URI`.
- Repositorio do Evolution Manager v2: menciona uma imagem propria de Manager, mas ela nao estava publica no Docker Hub durante a validacao. A imagem `evoapicloud/evolution-manager:latest` apresentou falha de nginx conhecida; por isso o Manager ficou opcional em profile separado.

## Estrutura criada

- `infra/evolution-local/docker-compose.yml`
- `infra/evolution-local/.env.example`
- `infra/evolution-local/README.md`
- `infra/evolution-local/.env` local gerado e ignorado pelo Git

## Portas locais

- API: `127.0.0.1:8080 -> 8080`
- Manager: opcional em profile `manager`, `127.0.0.1:3000 -> 80` quando habilitado
- Postgres: somente rede Docker
- Redis: somente rede Docker

## Containers

- `barbearia-evolution-api-local`
- `barbearia-evolution-manager-local` somente se o profile `manager` for habilitado
- `barbearia-evolution-postgres-local`
- `barbearia-evolution-redis-local`

## Volumes

- `barbearia_evolution_instances`
- `barbearia_evolution_postgres`
- `barbearia_evolution_redis`

## Variaveis necessarias

- `EVOLUTION_API_PORT`
- `EVOLUTION_MANAGER_PORT`
- `SERVER_URL`
- `AUTHENTICATION_API_KEY`
- `EVOLUTION_INSTANCE_NAME`
- `POSTGRES_DATABASE`
- `POSTGRES_USERNAME`
- `POSTGRES_PASSWORD`

## Como subir

```powershell
cd infra/evolution-local
docker compose config
docker compose up -d
docker compose ps
```

## Como parar

```powershell
cd infra/evolution-local
docker compose down
```

## Como ver logs

```powershell
cd infra/evolution-local
docker compose logs --tail 100 api
docker compose logs --tail 100 manager
docker compose logs --tail 100 postgres
docker compose logs --tail 100 redis
```

## Como limpar apenas a Evolution local

```powershell
cd infra/evolution-local
docker compose down -v
```

Esse comando remove apenas os recursos definidos no compose local da Evolution: containers, rede e os volumes `barbearia_evolution_*`. Ele nao toca no banco da barbearia nem no banco `barbearia_pilot`.

## Seguranca

- A API esta exposta apenas em loopback.
- Postgres e Redis nao publicam portas no host.
- `.env`, `.env.pilot.local`, API key real, senha, token, QR Code e sessao WhatsApp nao devem ser versionados.
- A chave local forte foi gravada apenas nos arquivos locais ignorados.

## Confirmacoes da macro

- Nao houve migration, seed, reset ou deploy.
- Nao houve alteracao no fluxo de booking.
- Nao houve alteracao em financeiro, estoque, agenda ou autenticacao.
- Nao houve envio real de WhatsApp.
- Nao houve conexao por QR Code nesta etapa.
- Segredos nao foram colocados em arquivos versionados.

## Validacao executada

- `git status --short`: havia arquivos nao rastreados preexistentes relacionados a uma tentativa anterior de Evolution na raiz; eles foram preservados.
- `docker --version`: Docker disponivel.
- `docker compose version`: Docker Compose disponivel.
- Portas locais: `8080` e `3000` livres; `5432` ocupado no host, sem conflito porque o Postgres da Evolution nao publica porta.
- `docker compose config --quiet`: OK.
- `docker compose up -d`: API, Postgres e Redis iniciados.
- `docker compose ps`: API em `127.0.0.1:8080`, Postgres e Redis internos saudaveis.
- Teste HTTP da API: `GET http://localhost:8080` retornou `200`.
- Endpoint de health: `GET /health` nao esta disponivel nessa imagem.
- Endpoint de estado da instancia `geovane-local`: retornou `404` porque a instancia ainda nao foi criada/conectada; nenhum QR Code foi solicitado.
- Manager: nao habilitado no profile padrao. A imagem `evoapicloud/evolution-manager:latest` falhou com erro de nginx; a imagem alternativa indicada pelo repositorio do Manager nao estava publica no Docker Hub.
- `npm run build`: OK.
- `npx vitest run tests/frontend-booking-public.spec.ts tests/frontend-menu-config.spec.ts`: 2 arquivos, 24 testes OK.
- `git diff --check`: OK, com aviso apenas de conversao LF/CRLF no `.gitignore`.
- `.env.pilot.local`: atualizado localmente com URL, chave local e instancia `geovane-local`; arquivo ignorado pelo Git.
