# Fase 1.2.5 - Consolidacao piloto owner-only

Data: 2026-06-15

## Objetivo
Consolidar o ambiente de producao para o piloto monousuario:
- apenas Geovane/proprietario com login ativo;
- perfil `owner`/administrador;
- RBAC, roles e permissoes preservados no codigo para expansao futura.

## Regras aplicadas
Nao foi feito:
- remocao de RBAC;
- remocao de roles;
- refatoracao de permissoes;
- alteracao de endpoints;
- alteracao de regra financeira;
- seed;
- migration;
- deploy;
- alteracao de firewall;
- alteracao de certificado;
- restart PM2;
- delecao fisica de usuarios;
- `git add`;
- commit;
- push;
- exposicao de `.env`, senha, hash, token ou `DATABASE_URL`.

## Baseline inicial
Comandos executados:
- `git status --short`
- `git status -sb`
- `pm2 status`
- `systemctl status nginx --no-pager`
- `systemctl status postgresql --no-pager`
- `ufw status verbose`
- `curl https://barbearia.76-13-161-250.nip.io/health`
- `curl -L https://barbearia.76-13-161-250.nip.io/booking.html`

Resultados:
- Branch: `main...origin/main`.
- `.env` nao apareceu no `git status`.
- PM2 online, incluindo `software-barbearia`.
- Nginx ativo.
- PostgreSQL ativo.
- UFW ativo.
- Dominio publico OK.
- Health publico: `200 OK`, corpo `{"ok":true,"authEnforced":true}`.
- Booking publico: `/booking.html` redirecionou para `/agendamento`, destino `200`.

## Backup pre-alteracao
Backup PostgreSQL criado antes de alterar usuarios:
- Caminho: `/root/software-barbearia-backups/barbearia_pre_owner_only_20260615_221305.sql`
- Tamanho: `1526775` bytes
- Permissao: `-rw------- root:root`
- SHA-256: `ddb3a3c52497cff1d84b837236e7747177e239dabc0c1a372b6ec0e46ceec845`

O backup esta fora do repositorio e nao apareceu no `git status`.

## Modelo de usuario
Verificado em `prisma/schema.prisma` e `src/http/app.ts`:
- `User` possui `email`, `role`, `isActive` e relacao `unitAccesses`.
- `UserUnitAccess` possui `userId`, `unitId`, `role` e `isActive`.
- Autenticacao persistente recusa `User.isActive=false`.
- Autenticacao considera apenas `UserUnitAccess.isActive=true`.
- Roles validas no runtime: `owner`, `recepcao`, `profissional`.

Nao foram exibidos senha, hash, salt, token, `.env` ou `DATABASE_URL`.

## Estado antes da consolidacao
Consulta segura sem selecionar `passwordHash`:
- `users_total=88`
- `users_active=67`
- `active_unit_accesses=89`

Usuarios alvo antes da consolidacao:
- `pe***1@gm***l.com` | role `owner` | `unit-01` | usuario ativo | acesso ativo
- `pe***1@gm***l.com` | role `owner` | `unit-fb-1551296a2b9017fa311c` | usuario ativo | acesso inativo
- `ow***r@ba***a.local` | role `owner` | `unit-01` | usuario ativo | acesso ativo
- `ow***r@ba***a.local` | role `owner` | `unit-02` | usuario ativo | acesso ativo
- `re***o@ba***a.local` | role `recepcao` | `unit-01` | usuario ativo | acesso ativo
- `pr***l@ba***a.local` | role `profissional` | `unit-01` | usuario ativo | acesso ativo

## Consolidacao owner-only
Alteracao aplicada via Prisma, apos backup:
- `User.isActive=false` para todos os usuarios exceto o owner escolhido.
- `UserUnitAccess.isActive=false` para todos os acessos exceto o acesso `unit-01` do owner escolhido.
- Owner escolhido mantido com `User.isActive=true`, role `owner`.
- Acesso `unit-01` do owner escolhido mantido ativo com role `owner`.
- Nenhum usuario foi deletado fisicamente.
- Nenhum dado operacional, historico ou auditoria foi removido.

Resultado da transacao:
- `users_disabled=87`
- `accesses_disabled_other_users=88`
- `accesses_disabled_owner_other_units=1`
- `owner_active_ensured=true`
- `owner_unit_access_ensured=1`

## Estado final de usuarios
Consulta segura sem selecionar `passwordHash`:
- `users_total=88`
- `users_active=1`
- `active_unit_accesses=1`

Usuario ativo final:
- `pe***1@gm***l.com` | role `owner` | `unit-01` | usuario ativo | acesso ativo

Usuarios desativados ou fora do piloto:
- `ow***r@ba***a.local` | role `owner` | `unit-01`/`unit-02` | usuario inativo | acessos inativos
- `re***o@ba***a.local` | role `recepcao` | `unit-01` | usuario inativo | acesso inativo
- `pr***l@ba***a.local` | role `profissional` | `unit-01` | usuario inativo | acesso inativo
- demais usuarios persistentes: inativos para login no piloto.

Ressalva operacional:
- A desativacao bloqueia novos logins persistentes desses usuarios.
- O token customizado HS256 e stateless, com expiracao padrao de ate 8 horas.
- Nao ha revogacao central de JWT nesta fase sem alteracao de codigo/segredo/restart.
- Portanto, se algum usuario desativado ja possuia token emitido antes da consolidacao, esse token pode permanecer valido ate expirar.

## Reset seguro do owner e SMOKE_OWNER
Script executado:
- `/root/software-barbearia-secure/provision-owner-smoke.cjs`

Resultado:
- Prompt oculto foi iniciado.
- Nao houve entrada humana no TTY durante a janela de espera.
- Processo encerrado para evitar sessao pendurada.
- Nenhum reset de senha foi confirmado.
- Nenhuma senha, hash, token, `.env` ou `DATABASE_URL` foi impresso.

Presenca de variaveis, sem valores:
- `SMOKE_BASE_URL`: ausente
- `SMOKE_OWNER_EMAIL`: ausente
- `SMOKE_OWNER_PASSWORD`: ausente
- `SMOKE_RECEPTION_EMAIL`: ausente
- `SMOKE_PROFESSIONAL_EMAIL`: ausente

## Validacao autenticada
Nao executado:
- login owner;
- `/auth/me`;
- Agenda;
- Clientes;
- PDV;
- Financeiro;
- Servicos;
- Equipe;
- Auditoria;
- Configuracoes.

Motivo:
- A senha forte do owner nao foi digitada pelo operador.
- `SMOKE_OWNER_*` seguem ausentes.
- Nao ha credencial segura disponivel para autenticar sem expor segredo.

## Validacao publica final
- Health publico: `200 OK`, corpo `{"ok":true,"authEnforced":true}`.
- Booking publico: `/booking.html` redireciona para `/agendamento`; destino `200`.
- HTTPS real continua funcionando sem `-k`.

## Logs e servicos finais
Logs PM2:
- Error log sem linhas relevantes recentes.
- Out log registrou health `200`, booking `302` e `/agendamento` `200`.
- Sem crash.
- Sem loop de restart.
- Sem erro `500` critico.

Status final:
- PM2: `software-barbearia` online, sem restart nesta fase.
- Nginx: `active (running)`.
- PostgreSQL: `active (exited)` com processo `postgres` em loopback.
- UFW: ativo, `22/80/443` permitidos, `3333/tcp` negado.
- `ss -tulpn`: app em `127.0.0.1:3333`, sem listener em `0.0.0.0:3333`.

## Git e arquivos sensiveis
Confirmado:
- `.env` nao aparece no `git status`.
- Backup SQL nao aparece no `git status`.
- Script seguro fora do repositorio nao aparece no `git status`.
- `test-results/` permanece apenas untracked quando listado.

Nao houve `git add`, commit ou push.

## Arquivos alterados
- `.planning/122_CONSOLIDACAO_PILOTO_OWNER_ONLY.md`
- `.planning/121_DECISAO_PILOTO_MONOUSUARIO_OWNER.md`
- `.planning/120_PROVISIONAMENTO_USUARIOS_SMOKE_PRODUCAO.md`
- `.planning/119_VALIDACAO_AUTENTICADA_SMOKE_REMOTO.md`
- `.planning/118_VALIDACAO_FUNCIONAL_DOMINIO_PUBLICO.md`
- `.planning/112_HARDENING_VPS_PRE_DEPLOY.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

Artefatos fora do repositorio:
- `/root/software-barbearia-backups/barbearia_pre_owner_only_20260615_221305.sql`
- `/root/software-barbearia-secure/provision-owner-smoke.cjs`

## Decisao final
BLOQUEADO.

Motivos:
- Backup foi criado.
- Owner-only foi consolidado no banco: apenas `pe***1@gm***l.com` permanece ativo.
- Health, booking e servicos seguem OK.
- Porem a senha forte do owner nao foi digitada no TTY.
- `SMOKE_OWNER_*` nao foi configurado.
- Login owner, `/auth/me` e modulos principais nao foram validados.

## Proxima etapa recomendada
Operador humano deve executar diretamente no terminal real da VPS:

```text
/root/software-barbearia-secure/provision-owner-smoke.cjs
```

Depois:
1. digitar senha forte do owner, com entrada oculta;
2. confirmar presenca de `SMOKE_BASE_URL`, `SMOKE_OWNER_EMAIL` e `SMOKE_OWNER_PASSWORD` sem valores;
3. validar login owner;
4. validar `/auth/me`;
5. validar modulos owner;
6. revalidar health, booking, logs e servicos;
7. atualizar esta fase para `APROVADO` ou `APROVADO COM RESSALVAS`.

## Atualizacao 2026-06-16 UTC - Validacao owner-only apos provisionamento humano
Contexto recebido:
- Operador humano executou `node /root/software-barbearia-secure/provision-owner-smoke.cjs` no terminal real da VPS.
- Owner principal foi atualizado.
- `SMOKE_OWNER_*` foi configurado sem exibir segredos.
- Backup local do `.env` criado fora do repositorio em `/root/software-barbearia-secure/env-backup-owner-20260615T223447Z`.

Regras preservadas:
- Nao foi impresso valor de senha, hash, token completo, `.env` ou `DATABASE_URL`.
- Nao houve seed, migration, alteracao de RBAC, regra financeira, firewall ou certificado.
- Nao houve `git add`, commit ou push.

Presenca de variaveis, sem valores:
- `SMOKE_BASE_URL`: presente.
- `SMOKE_OWNER_EMAIL`: presente.
- `SMOKE_OWNER_PASSWORD`: presente.

Validacao autenticada remota no dominio publico:
- Login owner em `/auth/login`: `200`, token emitido e mantido redigido.
- `/auth/me`: `200`, role `owner`, activeUnitId `unit-01`.

Modulos owner validados com chamadas GET representativas:
- Agenda (`/agenda/day`): `200`.
- Clientes (`/clients/overview` com `start`/`end`): `200`.
- PDV (`/catalog`): `200`.
- Financeiro (`/financial/summary`): `200`.
- Servicos (`/services`): `200`.
- Equipe (`/professionals/performance` com `start`/`end`): `200`.
- Auditoria (`/audit/events`): `200`.
- Configuracoes (`/settings`): `200`.

Validacao publica:
- `/health`: `200`, payload `ok=true`.
- `/agendamento`: `200`, HTML servido pelo dominio publico.

Banco owner-only, sem selecionar ou imprimir `passwordHash`:
- `users_total=88`.
- `users_active=1`.
- `users_inactive=87`.
- `unit_accesses_total=90`.
- `unit_accesses_active=1`.
- `unit_accesses_inactive=89`.
- Usuario ativo unico: role `owner`, acesso ativo unico em `unit-01`, role do acesso `owner`.

Logs PM2:
- `pm2 logs software-barbearia --lines 100 --nostream` nao mostrou linhas no error log.
- Out log registrou login owner `200`, `/auth/me` `200`, modulos autenticados `200`, health `200` e `/agendamento` `200`.
- Dois `400` apareceram apenas nas primeiras chamadas manuais a Clientes/Equipe sem `start`/`end`; as mesmas rotas foram repetidas com contrato correto e retornaram `200`.
- Sem crash, sem loop de restart e sem erro `500` critico.

Status de servicos:
- PM2: `software-barbearia` online.
- Nginx: `active (running)`.
- PostgreSQL: unit `active (exited)` e processo `postgres` ouvindo em loopback.
- UFW: ativo, default incoming deny, `3333/tcp` negado.
- `ss -tulpn`: app em `127.0.0.1:3333`; nao ha listener `0.0.0.0:3333`.

Git e arquivos sensiveis:
- `.env` nao apareceu no `git status`.
- Backup SQL nao apareceu no `git status`.
- Script seguro em `/root/software-barbearia-secure/provision-owner-smoke.cjs` nao apareceu no `git status`.
- Backup local do `.env` em `/root/software-barbearia-secure/env-backup-owner-20260615T223447Z` nao apareceu no `git status`.
- `test-results/` pode permanecer untracked.

Decisao final atualizada: APROVADO.

Proxima etapa recomendada:
- Fazer revisao seletiva das alteracoes documentais e preparar commit documental quando o operador autorizar, mantendo `.env`, backups, scripts seguros e `test-results/` fora do stage.
