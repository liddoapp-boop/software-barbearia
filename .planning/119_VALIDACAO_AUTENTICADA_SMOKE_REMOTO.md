# Fase 1.2.1 - Configurar SMOKE seguro e validar login/RBAC remoto

Data: 2026-06-15

## Objetivo
Configurar/validar credenciais `SMOKE_*` seguras sem expor senhas ou tokens e executar validacao autenticada remota no dominio publico `https://barbearia.76-13-161-250.nip.io`, cobrindo login owner, `/auth/me`, modulos principais e RBAC de recepcao/profissional.

## Regras aplicadas
Nao foi feito:
- impressao de senha;
- impressao de token;
- exibicao de `.env`;
- exibicao de `DATABASE_URL`;
- criacao de usuario;
- seed;
- migration;
- alteracao de regra financeira;
- alteracao de RBAC backend;
- deploy;
- restart PM2;
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
- `.env` nao apareceu no `git status`.
- `test-results/` apareceu apenas como untracked.
- PM2 online, incluindo `software-barbearia`.
- Nginx ativo.
- PostgreSQL ativo.
- UFW ativo, permitindo `22/80/443` e negando `3333/tcp`.
- Dominio publico respondeu `/health` com `HTTP/1.1 200 OK`.
- Corpo do health: `{"ok":true,"authEnforced":true}`.

## Presenca de SMOKE_*
Verificacao feita sem imprimir valores:
- `SMOKE_BASE_URL`: ausente
- `SMOKE_OWNER_EMAIL`: ausente
- `SMOKE_OWNER_PASSWORD`: ausente
- `SMOKE_RECEPTION_EMAIL`: ausente
- `SMOKE_RECEPTION_PASSWORD`: ausente
- `SMOKE_PROFESSIONAL_EMAIL`: ausente
- `SMOKE_PROFESSIONAL_PASSWORD`: ausente

Decisao operacional:
- Nao foi editado `.env`, pois nao ha valores reais fornecidos pelo operador.
- Nao foi inventada senha.
- Nao foram usadas senhas padrao fracas em producao.
- Nao foi criado usuario direto no banco.
- Nao foi executado seed.

## Smoke remoto
Comando planejado:
```text
SMOKE_BASE_URL=https://barbearia.76-13-161-250.nip.io npm run smoke:api
```

Resultado:
- Nao executado.

Motivo:
- `SMOKE_*` seguros nao estao configurados.
- Executar smoke remoto sem credenciais reais cairia em bloqueio por falta de `SMOKE_OWNER_EMAIL`/`SMOKE_OWNER_PASSWORD` ou estimularia uso de credenciais padrao, explicitamente proibido nesta fase.

## Validacao autenticada minima
Nao executada por ausencia de credenciais reais:
- login owner;
- `/auth/me`;
- dashboard/painel;
- Agenda;
- PDV;
- Clientes;
- Financeiro;
- Auditoria;
- Configuracoes;
- login recepcao;
- login profissional;
- RBAC remoto com `403` esperado.

## Logs PM2
Comando executado:
- `pm2 logs software-barbearia --lines 100 --nostream`

Resultado:
- Error log sem novas linhas relevantes.
- Out log sem crash.
- Sem loop de restart.
- Sem erro `500` critico.
- Logs recentes registram health publico `200` e requisicoes protegidas sem token com `401` esperado de fase anterior.

## Status final
- PM2 permaneceu online.
- Nginx permaneceu ativo.
- PostgreSQL permaneceu ativo.
- UFW permaneceu ativo.
- Nao houve restart PM2.
- Nao houve alteracao de runtime.

## Arquivos alterados
- `.planning/119_VALIDACAO_AUTENTICADA_SMOKE_REMOTO.md`
- `.planning/118_VALIDACAO_FUNCIONAL_DOMINIO_PUBLICO.md`
- `.planning/112_HARDENING_VPS_PRE_DEPLOY.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Decisao final
BLOQUEADO.

Motivo:
- Nao existem credenciais reais `SMOKE_*` configuradas no ambiente da sessao.
- Pela regra da fase, nao e permitido inventar senha, usar senha padrao fraca, criar usuario inseguro, rodar seed ou alterar banco sem autorizacao.

## Proxima etapa recomendada
Operador humano deve configurar credenciais reais e seguras fora do Git, por exemplo em `.env` ignorado ou export no shell:
- `SMOKE_BASE_URL=https://barbearia.76-13-161-250.nip.io`
- `SMOKE_OWNER_EMAIL=<email owner real>`
- `SMOKE_OWNER_PASSWORD=<senha owner real>`
- `SMOKE_RECEPTION_EMAIL=<email recepcao real>`
- `SMOKE_RECEPTION_PASSWORD=<senha recepcao real>`
- `SMOKE_PROFESSIONAL_EMAIL=<email profissional real>`
- `SMOKE_PROFESSIONAL_PASSWORD=<senha profissional real>`

Depois disso, reexecutar a Fase 1.2.1 somente nos probes autenticados e RBAC remoto.

## Atualizacao 2026-06-15 - Fase 1.2.2
Inspecao de provisionamento seguro executada:
- Modelo persistente: `User` e `UserUnitAccess`.
- Roles validas: `owner`, `recepcao`, `profissional`.
- Hash oficial: PBKDF2 SHA-256 com 210000 iteracoes.
- Nao foi encontrado script dedicado de provisionamento/rotacao segura de usuarios de producao.
- `POST /settings/team-members` e owner-only, mas nao cria usuario autenticavel com senha.
- Banco contem usuarios ativos para os tres perfis, incluindo acessos ativos a `unit-01`.
- Emails foram registrados apenas mascarados.
- `SMOKE_*` seguem ausentes.
- Nenhuma senha foi impressa, gerada, resetada ou armazenada.

Decisao da Fase 1.2.2: BLOQUEADO por falta de senha real segura/canal de coleta oculta para o operador.

Documento: `.planning/120_PROVISIONAMENTO_USUARIOS_SMOKE_PRODUCAO.md`.

## Atualizacao 2026-06-15 - Fase 1.2.3
Tentativa de configurar senhas fortes via terminal:
- script temporario criado fora do repositorio;
- prompt oculto iniciado para o usuario owner;
- sem entrada no TTY durante a janela de espera;
- prompt encerrado;
- `SMOKE_*` continuaram ausentes;
- nenhuma validacao autenticada foi executada.

Decisao: BLOQUEADO.

Documento: `.planning/121_CONFIGURACAO_SMOKE_SENHAS_TERMINAL.md`.

## Atualizacao 2026-06-15 - Piloto monousuario owner
Escopo autenticado reduzido por decisao de produto:
- Validar apenas owner/administrador para o piloto do Geovane.
- Nao validar recepcao/profissional nesta fase.
- Manter RBAC e roles no codigo para expansao futura.

Owner principal escolhido:
- Email mascarado: `pe***1@gm***l.com`
- Role: `owner`
- UnitId: `unit-01`
- Status: ativo

Tentativa owner-only:
- Backup PostgreSQL criado fora do repositorio.
- Script temporario owner-only criado fora do Git.
- Prompt oculto iniciado para senha forte.
- Sem entrada humana no TTY; processo encerrado.
- `SMOKE_OWNER_EMAIL` e `SMOKE_OWNER_PASSWORD` seguem ausentes.

Validacao autenticada:
- Login owner: nao executado.
- `/auth/me`: nao executado.
- Modulos owner: nao executados.

Validacao publica preservada:
- Health publico: `200 OK`, `{"ok":true,"authEnforced":true}`.
- Booking publico: `/booking.html` -> `/agendamento`, `200`.

Decisao: BLOQUEADO ate operador digitar senha forte no terminal real e configurar `SMOKE_OWNER_*` fora do Git.

Documento: `.planning/121_DECISAO_PILOTO_MONOUSUARIO_OWNER.md`.

## Atualizacao 2026-06-15 - Consolidacao owner-only
Escopo autenticado final do piloto:
- Apenas owner Geovane deve autenticar em producao.
- Recepcao/profissional/local owner ficaram fora do piloto e inativos.

Estado final de usuarios:
- Usuario ativo unico: `pe***1@gm***l.com`, role `owner`, `unit-01`.
- `users_active=1`.
- `active_unit_accesses=1`.

Bloqueio de credencial:
- Script owner-only foi executado com prompt oculto.
- Nao houve entrada humana no TTY.
- `SMOKE_OWNER_EMAIL` e `SMOKE_OWNER_PASSWORD` seguem ausentes.

Validacao autenticada:
- Login owner: nao executado.
- `/auth/me`: nao executado.
- Modulos owner: nao executados.

Validacao publica/infra:
- Health publico OK.
- Booking publico OK.
- PM2, Nginx, PostgreSQL e UFW saudaveis.

Decisao: BLOQUEADO ate senha owner ser definida fora do Git e login ser validado.

Documento: `.planning/122_CONSOLIDACAO_PILOTO_OWNER_ONLY.md`.

## Atualizacao 2026-06-16 UTC - Validacao autenticada owner-only concluida
Escopo atual do piloto: owner-only.

Presenca de credenciais de smoke sem valores:
- `SMOKE_BASE_URL`: presente.
- `SMOKE_OWNER_EMAIL`: presente.
- `SMOKE_OWNER_PASSWORD`: presente.

Resultados autenticados:
- `/auth/login`: `200`, token emitido e redigido.
- `/auth/me`: `200`, role `owner`, activeUnitId `unit-01`.

Modulos principais como owner:
- Agenda: `200`.
- Clientes: `200`.
- PDV: `200`.
- Financeiro: `200`.
- Servicos: `200`.
- Equipe: `200`.
- Auditoria: `200`.
- Configuracoes: `200`.

Resultados publicos:
- `/health`: `200`, `ok=true`.
- `/agendamento`: `200`.

Observacao:
- RBAC multi-perfil recepcao/profissional segue fora do escopo do piloto owner-only; roles e RBAC continuam preservados no codigo para expansao futura.

Decisao atualizada para owner-only: APROVADO.
