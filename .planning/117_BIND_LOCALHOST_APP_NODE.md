# Fase 1.1.9 - Bind do app Node em 127.0.0.1

Data: 2026-06-15

## Objetivo
Garantir que o app Node/Fastify do `software-barbearia` escute somente em `127.0.0.1:3333`, mantendo o Nginx como proxy publico para `https://barbearia.76-13-161-250.nip.io` e sem alterar regras de negocio, RBAC backend, endpoints, migrations, seeds, certificado ou firewall.

## Baseline inicial
Comandos executados antes da alteracao:
- `git status --short`
- `git status -sb`
- `pm2 status`
- `systemctl status nginx --no-pager`
- `systemctl status postgresql --no-pager`
- `ufw status verbose`
- `ss -tulpn`

Resultados:
- Branch: `main...origin/main`.
- Worktree inicial ja possuia documentacao alterada:
  - `.planning/112_HARDENING_VPS_PRE_DEPLOY.md`
  - `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
  - `.planning/24_NEXT_PRIORITIES.md`
- Arquivos untracked iniciais:
  - `.planning/115_MITIGACAO_PORTA_3333_FIREWALL.md`
  - `.planning/116_CERTIFICADO_LETSENCRYPT_REAL.md`
  - `test-results/`
- `.env` nao apareceu no `git status`.
- PM2 online, incluindo `software-barbearia`.
- Nginx ativo.
- PostgreSQL ativo.
- UFW ativo, politica padrao `deny incoming`.
- UFW permitindo `22/tcp`, `80/tcp` e `443/tcp`.
- UFW negando `3333/tcp` em IPv4 e IPv6.
- Estado inicial do bind: `software-barbearia` escutava em `0.0.0.0:3333`.

## Investigacao do bind
Arquivos/configuracoes verificados:
- `src/server.ts`
- `src/index.ts`
- `package.json`
- arquivos PM2/ecosystem versionados: nenhum encontrado
- `pm2 describe software-barbearia`
- variaveis nao sensiveis de ambiente: `NODE_ENV`, `PORT`, `HOST`, `DATA_BACKEND`

Respostas:
- `PORT` vem do env, com fallback para `3333`.
- Antes desta fase, `HOST` nao existia no codigo.
- Fastify escutava com host fixo `0.0.0.0`.
- O app estava configurado explicitamente para `0.0.0.0`.
- Nao era possivel ajustar para `127.0.0.1` apenas por env antes da fase.
- Alteracao minima necessaria: adicionar suporte a `process.env.HOST` no bootstrap do servidor.

## Alteracao aplicada
Alterado `src/server.ts`:
- adiciona `const host = process.env.HOST ?? defaultHost`;
- usa `127.0.0.1` como default quando `NODE_ENV=production`;
- preserva `0.0.0.0` fora de producao para compatibilidade local;
- passa `host` para `app.listen({ port, host })`;
- ajusta a mensagem de startup para refletir o host real.

Configuracao local da VPS:
- `.env` recebeu `HOST=127.0.0.1`.
- O `.env` e ignorado pelo Git e nao foi exibido integralmente.

Nao houve:
- alteracao de endpoint;
- alteracao de regra financeira;
- alteracao de RBAC backend;
- migration;
- seed;
- alteracao de certificado;
- alteracao de firewall;
- `git add`;
- commit;
- push.

## Validacoes antes do restart
Comandos executados:
- `npm run build`: passou.
- `npm run test`: passou, `6 passed | 1 skipped`, `88 passed | 11 skipped`.
- `npm run test:db`: passou, `1 passed`, `11 passed`.
- `npm audit`: `found 0 vulnerabilities`.
- `npm audit --omit=dev`: `found 0 vulnerabilities`.
- `git diff --check`: passou.
- `nginx -t`: passou.

Nginx:
- `proxy_pass` confirmado em `/etc/nginx/sites-available/software-barbearia` apontando para `http://127.0.0.1:3333`.
- Nenhuma alteracao de Nginx foi aplicada.

Backup:
- Backup PostgreSQL pre-hardening ja existia em `/root/software-barbearia-backups/barbearia_20260615_122852.sql`.

Rollback registrado:
```text
Remover HOST=127.0.0.1 do .env se necessario, restaurar src/server.ts para host 0.0.0.0, executar npm run build, e pm2 restart software-barbearia --update-env.
```

## Restart PM2
Comando executado:
```text
pm2 restart software-barbearia --update-env
```

Resultado:
- Restart concluido.
- `software-barbearia` voltou online.
- PID mudou de `41733` para `73539`.
- Restarts do processo passaram de `0` para `1`.

## Validacao final
`curl http://127.0.0.1:3333/health`:
- `HTTP/1.1 200 OK`
- corpo: `{"ok":true,"authEnforced":true}`

`curl https://barbearia.76-13-161-250.nip.io/health`:
- `HTTP/1.1 200 OK`
- corpo: `{"ok":true,"authEnforced":true}`

`ss -tulpn` final:
- `software-barbearia`: `127.0.0.1:3333`
- nao ha mais listener do app em `0.0.0.0:3333`.
- Nginx segue em `0.0.0.0:80` e `0.0.0.0:443`.
- PostgreSQL segue em loopback `127.0.0.1:5432` e `[::1]:5432`.
- SSH segue em `0.0.0.0:22` e `[::]:22`.

Logs PM2:
- erro log sem novas linhas relevantes.
- out log registrou:
  - `Server listening at http://127.0.0.1:3333`
  - `API online em http://127.0.0.1:3333`
  - `/health` local e publico com `statusCode:200`.

Status final:
- PM2: `software-barbearia` online.
- Nginx: `active (running)`.
- PostgreSQL: `active (exited)` no unit service, com processo `postgres` ouvindo em loopback.
- UFW: `active`, com `22/80/443` permitidos e `3333/tcp` negado.

## Arquivos alterados
- `src/server.ts`
- `.env` ignorado pelo Git, apenas para `HOST=127.0.0.1`
- `.planning/117_BIND_LOCALHOST_APP_NODE.md`
- `.planning/112_HARDENING_VPS_PRE_DEPLOY.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Decisao final
APROVADO.

Motivos:
- App passou de `0.0.0.0:3333` para `127.0.0.1:3333`.
- Nginx continua apontando para `127.0.0.1:3333`.
- HTTPS publico continua respondendo `200 OK`.
- PM2, Nginx, PostgreSQL e UFW continuam saudaveis.
- Testes e auditorias solicitados passaram.

## Proxima etapa recomendada
Executar uma validacao funcional curta no dominio publico autenticado, especialmente login, agenda e PDV, e depois preparar commit seletivo desta fase sem incluir `test-results/` nem segredos.
