# Fase 1.2.4 - Decisao piloto monousuario owner

Data: 2026-06-15

## Objetivo
Adaptar a validacao do piloto de producao para um unico usuario `owner`, representando o Geovane/proprietario da barbearia, mantendo a estrutura atual de roles e RBAC para expansao futura.

## Regras aplicadas
Nao foi feito:
- remocao de RBAC;
- remocao de roles;
- refatoracao de permissoes;
- alteracao de regra financeira;
- alteracao de endpoints;
- migration;
- seed;
- deploy;
- alteracao de firewall;
- alteracao de certificado;
- restart PM2;
- `git add`;
- commit;
- push;
- exposicao de `.env`, senha, hash, token ou `DATABASE_URL`.

## Baseline operacional
Comandos executados:
- `git status --short`
- `git status -sb`
- `pm2 status`
- `systemctl status nginx --no-pager`
- `systemctl status postgresql --no-pager`
- `ufw status verbose`
- `ss -tulpn`
- `curl https://barbearia.76-13-161-250.nip.io/health`
- `curl -L https://barbearia.76-13-161-250.nip.io/booking.html`
- `pm2 logs software-barbearia --lines 100 --nostream`

Resultados:
- Branch: `main...origin/main`.
- `.env` nao apareceu no `git status`.
- `test-results/` apareceu apenas como untracked.
- PM2 online, incluindo `software-barbearia`.
- Nginx ativo.
- PostgreSQL ativo.
- UFW ativo, permitindo `22/80/443` e negando `3333/tcp`.
- App Node escuta em `127.0.0.1:3333`.
- App Node nao escuta em `0.0.0.0:3333`.
- Dominio publico respondeu `/health` com `200 OK`.
- Corpo do health: `{"ok":true,"authEnforced":true}`.
- `/booking.html` redirecionou para `/agendamento`, que retornou `200`.

## Decisao de produto
- O piloto sera usado apenas pelo Geovane/proprietario.
- Perfil usado no piloto: `owner`/administrador.
- Perfis `recepcao` e `profissional` ficam fora do escopo do piloto.
- RBAC, roles e permissoes permanecem no codigo para expansao futura.
- Nao sera criada complexidade adicional para validar perfis fora do escopo do piloto.
- A validacao autenticada desta fase deve ser owner-only.

## Usuario owner principal
Foi consultado o banco sem selecionar ou imprimir senha/hash/token.

Usuario escolhido:
- Email mascarado: `pe***1@gm***l.com`
- Role: `owner`
- UnitId principal: `unit-01`
- Status: ativo

Justificativa:
- Existe owner real associado ao responsavel.
- Possui acesso ativo a `unit-01`.
- E preferivel ao owner local generico para o piloto real.

Observacao:
- O usuario tambem possui registro em outra unidade com acesso inativo; para o piloto foi considerado apenas `unit-01`.
- `recepcao` e `profissional` nao foram alterados nesta fase.

## Backup PostgreSQL
Backup criado antes da tentativa de reset de senha owner:
- Caminho: `/root/software-barbearia-backups/barbearia_owner_reset_20260615_201316.sql`
- Tamanho: `1526775` bytes
- SHA-256: `55d47b3d25b47bdf134d5108393455e4a8c8acfe1d2779a043a167dd2ace5aa6`

O backup esta fora do repositorio.

## Reset seguro owner-only
Script temporario criado fora do Git:
- `/root/software-barbearia-secure/provision-owner-smoke.cjs`

Caracteristicas do script:
- alvo unico: owner principal escolhido;
- exige role `owner`;
- exige acesso ativo a `unit-01`;
- usa `hashPassword` oficial do build da aplicacao;
- hash oficial: PBKDF2 SHA-256 com 210000 iteracoes;
- pede senha e confirmacao via TTY com entrada oculta;
- valida minimo 14 caracteres, maiuscula, minuscula, numero e simbolo;
- nao recebe senha por argumento de linha de comando;
- nao imprime senha;
- nao imprime hash;
- nao imprime token;
- nao imprime `.env`;
- nao imprime `DATABASE_URL`;
- grava `SMOKE_OWNER_*` apenas se a senha for digitada e confirmada.

Resultado:
- O prompt oculto foi iniciado.
- Nao houve entrada humana no TTY durante a janela de espera.
- O processo foi interrompido para evitar sessao pendurada.
- Nenhum reset de senha foi confirmado.
- Nenhuma variavel `SMOKE_OWNER_*` foi configurada.

## Presenca de SMOKE_*
Verificacao feita sem imprimir valores:
- `SMOKE_BASE_URL`: ausente
- `SMOKE_UNIT_ID`: ausente
- `SMOKE_OWNER_EMAIL`: ausente
- `SMOKE_OWNER_PASSWORD`: ausente
- `SMOKE_RECEPTION_EMAIL`: ausente
- `SMOKE_RECEPTION_PASSWORD`: ausente
- `SMOKE_PROFESSIONAL_EMAIL`: ausente
- `SMOKE_PROFESSIONAL_PASSWORD`: ausente

## Validacao owner remota
Nao executado:
- login owner;
- `/auth/me`;
- Agenda como owner;
- Clientes como owner;
- PDV como owner;
- Financeiro como owner;
- Servicos como owner;
- Equipe como owner;
- Auditoria como owner;
- Configuracoes como owner.

Motivo:
- A senha forte do owner nao foi digitada pelo operador.
- `SMOKE_OWNER_EMAIL` e `SMOKE_OWNER_PASSWORD` seguem ausentes.
- Validar login sem credencial real geraria falso negativo e estimularia uso de senha fraca/padrao.

## Validacao publica preservada
- Health publico: `200 OK`, corpo `{"ok":true,"authEnforced":true}`.
- Booking publico: `/booking.html` redireciona para `/agendamento`; destino retornou `200`.
- HTTPS real continua funcionando sem `-k`.

## Logs e servicos
Logs PM2:
- Error log sem linhas relevantes recentes.
- Out log registrou health `200`, booking `302` e `/agendamento` `200`.
- Sem crash.
- Sem loop de restart.
- Sem erro `500` critico.

Status final:
- PM2: `software-barbearia` online.
- Nginx: `active (running)`.
- PostgreSQL: `active (exited)` com processo `postgres` em loopback.
- UFW: ativo, `22/80/443` permitidos, `3333/tcp` negado.

## Arquivos alterados
- `.planning/121_DECISAO_PILOTO_MONOUSUARIO_OWNER.md`
- `.planning/120_PROVISIONAMENTO_USUARIOS_SMOKE_PRODUCAO.md`
- `.planning/119_VALIDACAO_AUTENTICADA_SMOKE_REMOTO.md`
- `.planning/118_VALIDACAO_FUNCIONAL_DOMINIO_PUBLICO.md`
- `.planning/112_HARDENING_VPS_PRE_DEPLOY.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

Arquivos fora do repositorio relacionados:
- `/root/software-barbearia-secure/provision-owner-smoke.cjs`
- `/root/software-barbearia-backups/barbearia_owner_reset_20260615_201316.sql`

Nao houve `git add`, commit ou push.

## Decisao final
BLOQUEADO.

Motivo:
- A decisao monousuario foi documentada e o owner principal foi escolhido, mas a senha forte nao foi digitada no TTY.
- Sem senha definida/configurada fora do Git, nao foi possivel validar login owner, `/auth/me` e modulos principais.

Nao houve evidencia de quebra publica:
- Health OK.
- Booking OK.
- PM2/Nginx/PostgreSQL/UFW saudaveis.
- Logs sem erro critico.

## Proxima etapa recomendada
Operador humano deve executar diretamente no terminal real da VPS:

```text
/root/software-barbearia-secure/provision-owner-smoke.cjs
```

Depois:
1. digitar senha forte owner no TTY, sem colocar no chat;
2. confirmar presenca de `SMOKE_BASE_URL`, `SMOKE_OWNER_EMAIL` e `SMOKE_OWNER_PASSWORD` sem imprimir valores;
3. validar login owner remoto;
4. validar `/auth/me`;
5. validar modulos owner-only;
6. repetir health, booking, logs e status de servicos;
7. atualizar esta decisao para `APROVADO` ou `APROVADO COM RESSALVAS`, conforme resultado.

## Atualizacao 2026-06-15 - Consolidacao owner-only
Backup PostgreSQL criado antes da alteracao:
- `/root/software-barbearia-backups/barbearia_pre_owner_only_20260615_221305.sql`
- Tamanho: `1526775` bytes
- SHA-256: `ddb3a3c52497cff1d84b837236e7747177e239dabc0c1a372b6ec0e46ceec845`
- Permissao: `-rw------- root:root`

Consolidacao aplicada no banco:
- Antes: `users_active=67`, `active_unit_accesses=89`.
- Depois: `users_active=1`, `active_unit_accesses=1`.
- Usuario ativo final: `pe***1@gm***l.com`, role `owner`, `unit-01`.
- `ow***r@ba***a.local`, `re***o@ba***a.local` e `pr***l@ba***a.local` ficaram inativos.
- Demais usuarios persistentes tambem ficaram inativos para login no piloto.
- Nenhum usuario foi deletado fisicamente.
- Nenhum historico ou dado operacional foi removido.

Reset/configuracao owner:
- Script `/root/software-barbearia-secure/provision-owner-smoke.cjs` foi iniciado.
- Nao houve entrada humana no TTY.
- Processo encerrado sem reset confirmado.
- `SMOKE_OWNER_*` seguem ausentes.

Validacao:
- Health publico continua `200 OK` com `{"ok":true,"authEnforced":true}`.
- Booking publico continua acessivel em `/agendamento`.
- PM2/Nginx/PostgreSQL/UFW seguem saudaveis.
- Login owner, `/auth/me` e modulos owner continuam pendentes por falta de senha segura digitada.

Decisao: BLOQUEADO.

Documento: `.planning/122_CONSOLIDACAO_PILOTO_OWNER_ONLY.md`.

## Atualizacao 2026-06-16 UTC - Decisao owner-only validada
O bloqueio anterior foi resolvido apos o operador humano executar o provisionamento owner no terminal real da VPS.

Confirmado sem expor valores:
- `SMOKE_BASE_URL`: presente.
- `SMOKE_OWNER_EMAIL`: presente.
- `SMOKE_OWNER_PASSWORD`: presente.

Validacao remota:
- Login owner retornou `200`; token nao foi impresso completo.
- `/auth/me` retornou `200`, role `owner`, activeUnitId `unit-01`.
- Agenda, Clientes, PDV, Financeiro, Servicos, Equipe, Auditoria e Configuracoes retornaram `200` como owner.
- Health publico e booking publico continuam `200`.

Banco:
- Apenas 1 usuario ativo.
- Apenas 1 acesso ativo.
- Usuario/acesso ativo: role `owner`, `unit-01`.
- Demais usuarios/acessos continuam inativos.
- Nenhum hash, salt ou senha foi selecionado ou impresso.

Infraestrutura:
- PM2 online, Nginx ativo, PostgreSQL ativo, UFW ativo.
- App em `127.0.0.1:3333`, sem `0.0.0.0:3333`.
- `3333/tcp` segue negado pelo UFW.
- Logs PM2 sem crash, loop de restart ou erro `500` critico.

Git:
- `.env`, backup SQL, script seguro e backup local do `.env` fora do repositorio nao aparecem no `git status`.
- Nao houve `git add`, commit ou push.

Decisao atualizada: APROVADO.
