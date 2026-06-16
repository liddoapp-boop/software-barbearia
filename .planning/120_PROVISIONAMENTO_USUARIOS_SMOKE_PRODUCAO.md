# Fase 1.2.2 - Provisionamento de usuarios smoke de producao

Data: 2026-06-15

## Objetivo
Criar ou identificar usuarios reais seguros de producao para `owner`, `recepcao` e `profissional`, configurar `SMOKE_*` fora do Git e executar validacao autenticada remota sem expor senhas, tokens, `.env` ou `DATABASE_URL`.

## Regras aplicadas
Nao foi feito:
- impressao de senha;
- impressao de token;
- impressao de `.env`;
- impressao de `DATABASE_URL`;
- commit de `.env`;
- commit de backup SQL;
- uso de senha padrao;
- seed;
- migration;
- alteracao de regra financeira;
- alteracao de RBAC backend;
- deploy;
- alteracao de firewall;
- alteracao de certificado;
- `git add`;
- commit;
- push.

## Baseline inicial
Comandos executados:
- `git status --short`
- `git status -sb`
- `pm2 status`
- `systemctl status nginx --no-pager`
- `systemctl status postgresql --no-pager`
- `ufw status verbose`
- `curl -I https://barbearia.76-13-161-250.nip.io/health`
- `curl https://barbearia.76-13-161-250.nip.io/health`

Resultados:
- Branch: `main...origin/main`.
- `.env` nao apareceu no Git status.
- `test-results/` apareceu apenas como untracked.
- PM2 online, incluindo `software-barbearia`.
- Nginx ativo.
- PostgreSQL ativo.
- UFW ativo, permitindo `22/80/443` e negando `3333/tcp`.
- Dominio publico respondeu `/health` com `200 OK`.
- Corpo do health: `{"ok":true,"authEnforced":true}`.

## Modelo de usuarios
Arquivos verificados:
- `prisma/schema.prisma`
- `src/http/security.ts`
- `src/http/app.ts`
- `scripts/smoke-api-flow.mjs`
- `scripts/smoke-api-flow.ps1`

Modelo/tabelas:
- `User`
- `UserUnitAccess`

Campos obrigatorios principais de `User`:
- `id`
- `email`
- `passwordHash`
- `name`
- `role`
- `isActive`

Campos principais de `UserUnitAccess`:
- `id`
- `userId`
- `unitId`
- `role`
- `isActive`

Roles validas de autenticacao:
- `owner`
- `recepcao`
- `profissional`

Algoritmo de hash:
- `pbkdf2`
- digest `sha256`
- `210000` iteracoes
- salt aleatorio de 16 bytes em base64url
- chave de 32 bytes em base64url
- formato: `pbkdf2$sha256$210000$<salt>$<hash>`

Script seguro pronto:
- Nao foi encontrado script dedicado de provisionamento/rotacao de usuarios de producao.
- O smoke remoto existe em `scripts/smoke-api-flow.mjs`, mas exige credenciais `SMOKE_OWNER_EMAIL`/`SMOKE_OWNER_PASSWORD` em producao/remoto.

Endpoint administrativo:
- Existe `POST /settings/team-members`, protegido por policy `owner`, mas cria membro de equipe operacional; nao e CRUD completo de usuario autenticavel com senha.
- Existe `GET /users`, protegido por `owner`, para listagem.
- Nao foi identificado endpoint administrativo seguro para criar/resetar senha de `User` autenticavel.

## Consulta segura do banco
Consulta executada via Prisma sem selecionar `passwordHash`.

Resumo:
- `users_total=88`
- `unit_access_total=90`
- `units_total=276`

Contagem por role/status:
- `owner:active`: 23
- `recepcao:active`: 43
- `recepcao:inactive`: 21
- `profissional:active`: 1

Usuarios relevantes para `unit-01` identificados sem expor email completo:
- `ow***r@ba***a.local`, role `owner`, ativo, acesso `unit-01` ativo e `unit-02` ativo.
- `pe***1@gm***l.com`, role `owner`, ativo, acesso `unit-01` ativo.
- `re***o@ba***a.local`, role `recepcao`, ativo, acesso `unit-01` ativo.
- `pr***l@ba***a.local`, role `profissional`, ativo, acesso `unit-01` ativo.

Observacao:
- Existem usuarios para os tres perfis, mas nao ha credenciais reais seguras disponiveis na sessao.
- As senhas padrao versionadas ja haviam retornado `401` em producao na Fase 1.2 e nao foram reutilizadas nesta fase.

## Estrategia segura definida
Como usuarios reais ja existem:
- Nao alterar senha automaticamente.
- Nao criar usuarios duplicados.
- Nao rodar seed.
- Nao inserir hash manual inventado via SQL.
- Nao resetar senha sem confirmacao humana.
- Operador humano deve definir/fornecer senhas reais fora do chat e fora do Git.

Como nao ha canal seguro nesta sessao para entrada oculta de senha pelo operador:
- `.env` nao foi editado.
- `SMOKE_*` nao foi configurado.
- smoke remoto autenticado nao foi executado.

## Presenca de SMOKE_*
Verificacao feita sem imprimir valores:
- `SMOKE_BASE_URL`: ausente
- `SMOKE_OWNER_EMAIL`: ausente
- `SMOKE_OWNER_PASSWORD`: ausente
- `SMOKE_RECEPTION_EMAIL`: ausente
- `SMOKE_RECEPTION_PASSWORD`: ausente
- `SMOKE_PROFESSIONAL_EMAIL`: ausente
- `SMOKE_PROFESSIONAL_PASSWORD`: ausente

## Login, RBAC e smoke remoto
Nao executado:
- login owner;
- `/auth/me` owner;
- login recepcao;
- `/auth/me` recepcao;
- login profissional;
- `/auth/me` profissional;
- RBAC remoto;
- `npm run smoke:api` remoto.

Motivo:
- `SMOKE_*` seguros continuam ausentes.
- Nao e permitido usar senha padrao, inventar senha ou resetar credenciais reais sem confirmacao humana.

## Logs e servicos
Logs PM2 verificados com:
- `pm2 logs software-barbearia --lines 100 --nostream`

Resultado:
- Sem crash.
- Sem loop de restart.
- Sem erro `500` critico.
- Requisicoes `401` observadas eram de rotas protegidas sem token em validacoes anteriores.
- Health publico recente retornou `200`.

Status final:
- PM2: online.
- Nginx: ativo.
- PostgreSQL: ativo.
- UFW: ativo.
- Nao houve restart PM2.

## Arquivos alterados
- `.planning/120_PROVISIONAMENTO_USUARIOS_SMOKE_PRODUCAO.md`
- `.planning/119_VALIDACAO_AUTENTICADA_SMOKE_REMOTO.md`
- `.planning/118_VALIDACAO_FUNCIONAL_DOMINIO_PUBLICO.md`
- `.planning/112_HARDENING_VPS_PRE_DEPLOY.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Decisao final
BLOQUEADO.

Motivo:
- Usuarios existem para os tres perfis, mas nao ha senha real segura disponivel na sessao e nao ha canal seguro aqui para o operador digitar senha oculta.
- A fase proibe senha padrao, seed, migration, criacao insegura, SQL manual com hash inventado e reset automatico de usuario real.

## Proxima etapa recomendada
Executar uma fase assistida com operador no terminal da VPS para configurar credenciais fora do Git:
1. operador define senhas fortes e distintas para owner/recepcao/profissional;
2. se for necessario resetar senha, confirmar explicitamente no terminal;
3. usar script temporario fora do repositorio que importe `hashPassword` oficial e grave apenas `passwordHash`;
4. criar backup local timestampado do `.env` fora do Git;
5. inserir `SMOKE_BASE_URL` e `SMOKE_*` no `.env` ignorado, sem imprimir valores;
6. confirmar apenas presenca das variaveis;
7. executar probes autenticados e RBAC remoto.

## Atualizacao 2026-06-15 - Fase 1.2.3
Foi criado script temporario fora do repositorio para coleta oculta de senhas fortes:
- `/root/software-barbearia-secure/provision-smoke-users.cjs`

O script foi iniciado, mas nao houve entrada no TTY acessivel por esta sessao. O prompt foi encerrado para evitar processo pendurado.

Confirmado apos a interrupcao:
- `SMOKE_*` continuam ausentes.
- Os tres usuarios continuam ativos em `unit-01`.
- Health publico continua OK.
- Nenhuma senha, hash, token, `.env` ou `DATABASE_URL` foi impresso.

Decisao da Fase 1.2.3: BLOQUEADO por falta de canal interativo acessivel para coleta oculta.

Documento: `.planning/121_CONFIGURACAO_SMOKE_SENHAS_TERMINAL.md`.

## Atualizacao 2026-06-15 - Decisao piloto monousuario owner
Decisao de produto alterada:
- O piloto de producao sera usado apenas pelo Geovane/proprietario.
- Perfil de validacao do piloto: `owner`.
- `recepcao` e `profissional` ficam fora do escopo do piloto atual.
- RBAC, roles e permissoes continuam no codigo para uso futuro.
- Nao houve remocao/refatoracao de permissoes.

Usuario owner principal escolhido para o piloto:
- Email mascarado: `pe***1@gm***l.com`
- Role: `owner`
- UnitId principal: `unit-01`
- Status: ativo

Backup PostgreSQL criado antes da tentativa owner-only:
- `/root/software-barbearia-backups/barbearia_owner_reset_20260615_201316.sql`
- SHA-256: `55d47b3d25b47bdf134d5108393455e4a8c8acfe1d2779a043a167dd2ace5aa6`

Script temporario owner-only criado fora do Git:
- `/root/software-barbearia-secure/provision-owner-smoke.cjs`

Resultado:
- Prompt oculto foi iniciado.
- Nao houve entrada humana no TTY.
- Processo encerrado sem aplicar reset.
- `SMOKE_OWNER_*` seguem ausentes.
- Login owner, `/auth/me` e modulos autenticados nao foram validados.
- Health e booking publicos continuam OK.
- Sem exposicao de senha/hash/token/.env/DATABASE_URL.

Decisao: BLOQUEADO.

Documento: `.planning/121_DECISAO_PILOTO_MONOUSUARIO_OWNER.md`.

## Atualizacao 2026-06-15 - Consolidacao owner-only
Foi criada a fase de consolidacao final do piloto monousuario.

Resultado de banco apos backup:
- `users_total=88`
- `users_active=1`
- `active_unit_accesses=1`

Usuario ativo final:
- `pe***1@gm***l.com`, role `owner`, `unit-01`, ativo.

Usuarios explicitamente desativados:
- `ow***r@ba***a.local`, role `owner`, acessos inativos.
- `re***o@ba***a.local`, role `recepcao`, acesso inativo.
- `pr***l@ba***a.local`, role `profissional`, acesso inativo.

Demais usuarios persistentes:
- inativos para login no piloto.

Nao houve delecao fisica, seed, migration, deploy, restart PM2, firewall, certificado, `git add`, commit ou push.

Bloqueio restante:
- Senha owner nao foi digitada no TTY.
- `SMOKE_OWNER_*` seguem ausentes.
- Login owner e `/auth/me` nao foram validados.

Decisao: BLOQUEADO.

Documento: `.planning/122_CONSOLIDACAO_PILOTO_OWNER_ONLY.md`.

## Atualizacao 2026-06-16 UTC - SMOKE_OWNER configurado e validado
A pendencia de credenciais foi resolvida para o escopo owner-only do piloto.

Provisionamento:
- Operador humano executou o script owner-only no terminal real da VPS.
- Backup local do `.env` foi criado fora do repositorio em `/root/software-barbearia-secure/env-backup-owner-20260615T223447Z`.
- `SMOKE_BASE_URL`, `SMOKE_OWNER_EMAIL` e `SMOKE_OWNER_PASSWORD` estao presentes.
- Valores nao foram impressos.

Validacao:
- Login owner remoto: `200`, token redigido.
- `/auth/me`: `200`, role `owner`, activeUnitId `unit-01`.
- Modulos owner principais retornaram `200`: Agenda, Clientes, PDV, Financeiro, Servicos, Equipe, Auditoria e Configuracoes.
- Health e booking publicos seguem `200`.

Owner-only:
- `users_active=1`.
- `active_unit_accesses=1`.
- Usuario/acesso ativo unico: role `owner`, `unit-01`.
- Demais usuarios/acessos continuam inativos.

Seguranca operacional:
- Nao houve seed, migration, alteracao de RBAC, regra financeira, firewall, certificado, `git add`, commit ou push.
- Nao foram impressos senha, hash, token completo, `.env` ou `DATABASE_URL`.

Decisao atualizada para o escopo owner-only: APROVADO.
