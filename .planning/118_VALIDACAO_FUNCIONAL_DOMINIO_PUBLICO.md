# Fase 1.2 - Validacao funcional curta no dominio publico

Data: 2026-06-15

## Objetivo
Validar rapidamente o dominio publico `https://barbearia.76-13-161-250.nip.io` apos hardening da VPS, sem deploy, sem restart PM2, sem alteracao de firewall/certificado/codigo, sem migration, sem seed, sem alterar RBAC/regra financeira/endpoints e sem expor segredos.

## Baseline inicial
Comandos executados:
- `git status --short`
- `git status -sb`
- `pm2 status`
- `systemctl status nginx --no-pager`
- `systemctl status postgresql --no-pager`
- `ufw status verbose`
- `ss -tulpn`

Resultados:
- Branch: `main...origin/main`.
- `.env` nao apareceu no status.
- `test-results/` apareceu apenas como untracked.
- Worktree ja continha alteracoes pendentes de documentacao/hardening anteriores e `src/server.ts`.
- PM2 online, incluindo `software-barbearia`.
- Nginx ativo.
- PostgreSQL ativo.
- UFW ativo, permitindo `22/80/443` e negando `3333/tcp`.
- App Node escutando em `127.0.0.1:3333`.
- App Node nao escuta mais em `0.0.0.0:3333`.
- Nginx continua expondo `80/443` publicamente.

## Health publico
Comandos:
- `curl -I https://barbearia.76-13-161-250.nip.io/health`
- `curl https://barbearia.76-13-161-250.nip.io/health`

Resultado:
- `HTTP/1.1 200 OK`.
- Corpo: `{"ok":true,"authEnforced":true}`.
- HTTPS funcionou sem `-k`.
- Headers de seguranca presentes: CSP, `X-Content-Type-Options`, `Referrer-Policy`.

## Booking publico
Comandos:
- `curl -I https://barbearia.76-13-161-250.nip.io/booking.html`
- `curl -I https://barbearia.76-13-161-250.nip.io/agendamento`
- `curl -L -o /dev/null -w ... https://barbearia.76-13-161-250.nip.io/booking.html`

Resultado:
- `/booking.html` retornou `302 Found` para `/agendamento`.
- `/agendamento` retornou `HTTP/1.1 200 OK`.
- Seguindo redirect, URL final foi `/agendamento`, `http_code=200`, `content_type=text/html; charset=utf-8`, tamanho aproximado `50119` bytes.

Smoke automatizado de booking:
- Nao executado.
- Motivo: nao foi identificado smoke especifico de booking sem criacao de dados; `scripts/smoke-api-flow.mjs` cria agendamento e outros dados, fora do escopo desta validacao curta.

## Painel interno e assets
Validacoes HTTP:
- `GET /`: `200`, HTML carregado.
- `GET /login`: `200`, HTML carregado.
- `HEAD /app.js`: `200`, JavaScript principal carregado.
- `HEAD /styles/layout.css`: `200`, CSS principal carregado.

Rotas protegidas sem token:
- `/dashboard`: `401`
- `/agenda/range`: `401`
- `/clients`: `401`
- `/sales/products`: `401`
- `/financial/summary`: `401`
- `/audit/events`: `401`
- `/settings`: `401`

Interpretacao:
- A pagina inicial, login e assets principais carregam via dominio publico.
- Rotas internas protegidas nao retornaram `500`; retornaram `401` esperado sem token.

## Login owner
Verificacao de credenciais de smoke:
- `SMOKE_OWNER_EMAIL`: ausente.
- `SMOKE_OWNER_PASSWORD`: ausente.
- `SMOKE_RECEPTION_EMAIL`: ausente.
- `SMOKE_RECEPTION_PASSWORD`: ausente.
- `SMOKE_PROFESSIONAL_EMAIL`: ausente.
- `SMOKE_PROFESSIONAL_PASSWORD`: ausente.
- `SMOKE_UNIT_ID`: ausente.
- `AUTH_USERS_JSON`: ausente.
- `FIREBASE_PROJECT_ID`: presente.
- Service account Firebase local: ausente.

Tentativa controlada:
- Foram testadas as contas padrao versionadas do projeto para owner/recepcao/profissional, sem imprimir senhas nem tokens.
- Todas retornaram `401` em producao.
- O banco possui usuarios ativos para `owner@barbearia.local`, `recepcao@barbearia.local`, `profissional@barbearia.local` e owner real Firebase, mas as senhas padrao nao autenticam no ambiente real.

Resultado:
- Login owner via credencial de smoke nao validado.
- Nao ha evidencia de quebra do login real; ha ausencia de credencial de smoke valida no ambiente desta sessao.

## RBAC basico
Resultado:
- RBAC com token de recepcao/profissional nao foi validado porque nao houve credencial de smoke valida para obter tokens.
- Como controle limitado, rotas protegidas sem token retornaram `401` e nao `500`.
- A validacao completa de 403 por perfil permanece pendente ate configurar credenciais de smoke ou executar validacao manual autenticada.

## Modulos principais
Validacao HTTP sem autenticacao:
- Shell inicial (`/`) carregou com `200`.
- Login (`/login`) carregou com `200`.
- Assets principais carregaram com `200`.
- Booking publico carregou com `200` via `/agendamento`.
- Endpoints dos modulos internos responderam `401` sem token, sem `500`.

Validacao autenticada dos modulos:
- Agenda, PDV, Clientes, Financeiro, Auditoria e Configuracoes como owner nao foram validados por falta de credencial de smoke valida.

## Logs PM2
Comando:
- `pm2 logs software-barbearia --lines 100 --nostream`

Resultado:
- Error log sem novas linhas relevantes.
- Out log registrou:
  - servidor em `http://127.0.0.1:3333`;
  - health publico/local `200`;
  - `/booking.html` `302` e `/agendamento` `200`;
  - `/`, `/login`, `/app.js`, `/styles/layout.css` `200`;
  - tentativas de login padrao `401`;
  - rotas protegidas sem token com `auth.denied reason=missing_token` e `401`.
- Nao houve crash.
- Nao houve loop de restart.

## Status final dos servicos
- PM2: `software-barbearia` online, PID `73539`, restarts `1` desde o restart controlado da fase anterior.
- Nginx: `active (running)`.
- PostgreSQL: unit `active (exited)` e processo `postgres` ouvindo em loopback.
- UFW: `active`, com `22/80/443` permitidos e `3333/tcp` negado.
- `ss -tulpn`: app permanece em `127.0.0.1:3333`, sem `0.0.0.0:3333`.

## Arquivos alterados
- `.planning/118_VALIDACAO_FUNCIONAL_DOMINIO_PUBLICO.md`
- `.planning/112_HARDENING_VPS_PRE_DEPLOY.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

Nao houve `git add`, commit ou push.

## Decisao final
APROVADO COM RESSALVAS.

Motivos:
- Dominio publico funciona com HTTPS real.
- Health publico OK sem `-k`.
- Booking publico acessivel via `/agendamento`.
- Shell, login e assets principais carregam.
- Rotas protegidas nao retornaram `500`; retornaram `401` sem token.
- PM2, Nginx, PostgreSQL e UFW seguem saudaveis.
- Logs sem erro critico, crash ou loop de restart.

Ressalvas:
- Login owner autenticado nao foi validado porque `SMOKE_*` nao esta configurado e as senhas padrao versionadas retornam `401` no ambiente real.
- RBAC basico por perfil nao foi validado por falta de tokens validos de recepcao/profissional.
- Modulos internos como owner nao foram validados de forma autenticada.

## Proxima etapa recomendada
Configurar credenciais de smoke seguras (`SMOKE_OWNER_EMAIL`, `SMOKE_OWNER_PASSWORD`, `SMOKE_RECEPTION_EMAIL`, `SMOKE_RECEPTION_PASSWORD`, `SMOKE_PROFESSIONAL_EMAIL`, `SMOKE_PROFESSIONAL_PASSWORD`, `SMOKE_UNIT_ID`) ou executar validacao manual autenticada com owner real. Em seguida, repetir apenas os probes autenticados de login, `/auth/me`, modulos principais e RBAC 403.

## Atualizacao 2026-06-15 - Fase 1.2.1
Tentativa de avancar para validacao autenticada remota foi bloqueada:
- `SMOKE_BASE_URL`: ausente.
- `SMOKE_OWNER_EMAIL`: ausente.
- `SMOKE_OWNER_PASSWORD`: ausente.
- `SMOKE_RECEPTION_EMAIL`: ausente.
- `SMOKE_RECEPTION_PASSWORD`: ausente.
- `SMOKE_PROFESSIONAL_EMAIL`: ausente.
- `SMOKE_PROFESSIONAL_PASSWORD`: ausente.

Nao foram impressos valores secretos, nao foi editado `.env`, nao foi usado usuario padrao fraco, nao foi criado usuario, nao foi executado seed/migration e nao houve restart PM2.

Decisao da Fase 1.2.1: BLOQUEADO por ausencia de credenciais reais de smoke.

Documento: `.planning/119_VALIDACAO_AUTENTICADA_SMOKE_REMOTO.md`.

## Atualizacao 2026-06-15 - Fase 1.2.2
Provisionamento de usuarios smoke foi analisado:
- Usuarios ativos ja existem para `owner`, `recepcao` e `profissional`.
- Acesso a `unit-01` existe para os tres perfis.
- Nao ha credenciais reais disponiveis na sessao.
- Nao houve reset automatico de senha, seed, migration, SQL manual ou criacao insegura.
- `SMOKE_*` nao foi configurado porque falta entrada segura de senha pelo operador.

Decisao da Fase 1.2.2: BLOQUEADO.

Documento: `.planning/120_PROVISIONAMENTO_USUARIOS_SMOKE_PRODUCAO.md`.

## Atualizacao 2026-06-15 - Piloto monousuario owner
Nova decisao de produto:
- Piloto de producao sera owner-only para o Geovane/proprietario.
- `recepcao` e `profissional` ficam fora do escopo da validacao do piloto.
- RBAC e roles permanecem no codigo.

Estado publico revalidado:
- Health publico: `200 OK`, corpo `{"ok":true,"authEnforced":true}`.
- Booking publico: `/booking.html` redireciona para `/agendamento`, destino `200`.
- App segue escutando em `127.0.0.1:3333`, sem `0.0.0.0:3333`.
- Logs PM2 sem crash, loop de restart ou erro `500` critico.

Estado autenticado:
- Owner principal escolhido com email mascarado `pe***1@gm***l.com`.
- Backup PostgreSQL criado antes da tentativa owner-only.
- Script seguro fora do Git preparado para senha forte owner.
- Prompt oculto nao recebeu entrada humana.
- `SMOKE_OWNER_*` continuam ausentes.
- Login owner, `/auth/me` e modulos owner ainda nao foram validados.

Decisao da atualizacao: BLOQUEADO para validacao autenticada owner-only.

Documento: `.planning/121_DECISAO_PILOTO_MONOUSUARIO_OWNER.md`.

## Atualizacao 2026-06-15 - Consolidacao owner-only
Consolidacao de usuarios aplicada no banco, apos backup:
- Apenas `pe***1@gm***l.com` permanece ativo.
- Role final: `owner`.
- UnitId ativo final: `unit-01`.
- Usuarios fora do piloto ficaram inativos, sem delecao fisica.

Validacao publica apos a consolidacao:
- Health publico: `200 OK`, `{"ok":true,"authEnforced":true}`.
- Booking publico: `/booking.html` -> `/agendamento`, `200`.
- App segue em `127.0.0.1:3333`.
- Porta `3333/tcp` segue negada pelo UFW.
- Logs PM2 sem crash, loop de restart ou erro `500` critico.

Validacao autenticada:
- Ainda bloqueada, pois a senha owner nao foi digitada no TTY e `SMOKE_OWNER_*` segue ausente.

Decisao da atualizacao: BLOQUEADO para login owner e modulos autenticados.

Documento: `.planning/122_CONSOLIDACAO_PILOTO_OWNER_ONLY.md`.

## Atualizacao 2026-06-16 UTC - Dominio publico validado com owner autenticado
A validacao funcional do dominio publico foi reexecutada apos configuracao de `SMOKE_OWNER_*`.

Resultados:
- Health publico `/health`: `200`, `ok=true`.
- Booking publico `/agendamento`: `200`, HTML carregado.
- Login owner no dominio publico: `200`.
- `/auth/me`: `200`, role `owner`, activeUnitId `unit-01`.
- Modulos autenticados owner: Agenda, Clientes, PDV, Financeiro, Servicos, Equipe, Auditoria e Configuracoes retornaram `200`.

Infraestrutura:
- PM2, Nginx, PostgreSQL e UFW permanecem saudaveis.
- App segue em `127.0.0.1:3333`.
- Nao ha listener `0.0.0.0:3333`.
- `3333/tcp` segue negado.

Logs:
- Sem crash, loop de restart ou erro `500` critico.
- Chamadas iniciais a Clientes/Equipe sem `start`/`end` geraram `400`, corrigidas em seguida com retorno `200`; nao configuram falha funcional.

Decisao atualizada: APROVADO.
