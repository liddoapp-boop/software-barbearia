# Evolution API local

Infraestrutura Docker local e isolada para validar a Evolution API sem tocar no banco da barbearia.

## Arquivos

- `docker-compose.yml`: API, Manager, Postgres, Redis, volumes nomeados e rede isolada.
- `.env.example`: modelo sem segredos.
- `.env`: arquivo real local, ignorado pelo Git.

Nao coloque em Git: `.env`, API key real, senha, token, QR Code ou sessao do WhatsApp.

## Preparar

```powershell
Copy-Item .env.example .env
```

Preencha `AUTHENTICATION_API_KEY` e `POSTGRES_PASSWORD` com valores locais fortes. Use o mesmo valor de `AUTHENTICATION_API_KEY` em `.env.pilot.local` como `EVOLUTION_API_KEY`.

## Subir

```powershell
docker compose config
docker compose up -d
docker compose ps
```

API local: `http://localhost:8080`

O Manager e opcional e fica no profile `manager` porque a API e suficiente para esta etapa:

```powershell
docker compose --profile manager up -d manager
```

Manager local, quando habilitado: `http://localhost:3000`

Postgres e Redis ficam acessiveis apenas na rede Docker `barbearia_evolution_local_net`.

## Logs

```powershell
docker compose logs --tail 100 api
docker compose logs --tail 100 manager
docker compose logs --tail 100 postgres
docker compose logs --tail 100 redis
```

## Parar

```powershell
docker compose down
```

## Limpar apenas a Evolution local

Este comando remove somente os containers, rede e volumes definidos neste diretório. Ele nao toca no banco `barbearia_pilot`.

```powershell
docker compose down -v
```

Depois disso, nenhum QR Code ou sessao local da Evolution deve ser reaproveitado.
