# Fase 1.1 - Hardening seguro da VPS antes do deploy controlado

Data: 2026-06-14

## Objetivo
Corrigir ou preparar de forma segura os bloqueios de infraestrutura identificados na Fase 1.0 antes do deploy controlado, sem alterar regras de negocio, RBAC backend, endpoints, seeds, migrations destrutivas, segredos ou arquivos fora do escopo.

## Estado inicial
Baseline executado antes de qualquer acao operacional:
- `git status --short`
- `git status -sb`
- `git log --oneline -15`
- `git diff --stat`
- `git diff --name-only`
- `pm2 status`
- `systemctl status nginx --no-pager`
- `systemctl status postgresql --no-pager`
- `ss -tulpn`
- verificacao de certificado via `openssl s_client`
- verificacao DNS via `getent ahosts`
- probe HTTP para challenge ACME

Confirmacoes:
- Branch atual: `main`.
- Antes do commit documental: `main...origin/main [ahead 10]`.
- Depois do commit documental da Fase 1.0: `main...origin/main [ahead 11]`.
- `.env` nao apareceu no Git status.
- `test-results/` apareceu como untracked e nao foi staged.
- PM2 estava online, incluindo `software-barbearia`.
- Nginx estava ativo.
- PostgreSQL estava ativo, com cluster online em loopback.
- Porta `3333` seguia exposta em `0.0.0.0:3333`.
- Certificado seguia como Let's Encrypt staging/test.
- Dominio `barbearia.76-13-161-250.nip.io` resolvia para `76.13.161.250`.
- Porta 80 respondia via Nginx, redirecionando para HTTPS.

## Acoes executadas
1. Revisada e fechada a documentacao da Fase 1.0.
2. Staging seletivo executado apenas para:
   - `.planning/111_AUDITORIA_AMBIENTE_REAL_VPS.md`
   - `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
   - `.planning/24_NEXT_PRIORITIES.md`
3. Verificado `git diff --cached --stat`.
4. Verificado `git diff --cached --name-only`.
5. Confirmado que `test-results/` nao entrou no commit.
6. Criado commit local:
   - `bcf4b99 docs: auditar ambiente real da vps`
7. Tentado `git push`.

## Push
Resultado:
- Falhou.

Erro registrado:
```text
fatal: could not read Username for 'https://github.com': No such device or address
```

Impacto:
- O remoto `origin/main` nao recebeu os commits locais.
- A branch local ficou `ahead 11`.
- Conforme instrucao da fase, as acoes de infraestrutura foram interrompidas apos erro no push.

## Backup criado
Nao criado nesta fase.

Motivo:
- O fluxo foi interrompido apos falha no `git push`, conforme regra "se houver erro no push, registrar e parar".

## Certificado
Status inicial confirmado:
- Certificado atual de `barbearia.76-13-161-250.nip.io` segue Let's Encrypt staging/test.

Acao aplicada:
- Nenhuma emissao real foi executada.
- Nenhum reload/restart de Nginx foi executado.

Motivo:
- Fluxo interrompido apos falha no push.

## Firewall e porta 3333
Status inicial confirmado:
- `software-barbearia` seguia ouvindo em `0.0.0.0:3333`.
- A porta `3333` seguia exposta publicamente.
- `ufw` ja havia sido identificado como inativo na Fase 1.0.

Acao aplicada:
- Nenhuma regra de firewall foi aplicada.
- UFW nao foi ativado.
- SSH nao foi alterado.
- PM2 nao foi reiniciado.

Motivo:
- Fluxo interrompido apos falha no push.
- Tambem foi observado que a VPS possui outros servicos ouvindo, incluindo `*:8080`, entao qualquer politica de firewall restritiva exige confirmacao operacional das portas essenciais antes de aplicar.

## Deploy e restart
Nao executado.

Motivo:
- Push falhou.
- Backup real nao foi criado.
- Certificado e porta `3333` nao foram mitigados.

## Smoke remoto
Smoke completo nao executado.

Verificacoes de baseline ja confirmadas antes da interrupcao:
- HTTPS `/health` respondia na Fase 1.0.
- HTTP redirecionava para HTTPS na Fase 1.0.
- Porta `3333` direta seguia exposta na Fase 1.0 e no baseline desta fase.

## Riscos restantes
1. P1 - Push nao concluido; remoto segue sem os 11 commits locais.
2. P1 - Backup real PostgreSQL ainda nao criado.
3. P1 - Certificado publico segue staging/test.
4. P1 - Porta `3333` segue exposta diretamente.
5. P1/P2 - UFW segue sem hardening aplicado.
6. P2 - Deploy/restart controlado nao executado.
7. P2 - Smoke remoto completo nao executado.
8. P2 - `test-results/` segue untracked e deve permanecer fora de commits.

## Decisao final
BLOQUEADO.

Motivos:
- `git push` falhou por falta de credencial GitHub no ambiente.
- Nao houve backup real do PostgreSQL.
- Porta `3333` segue exposta sem mitigacao aplicada.
- Certificado staging segue ativo.
- Nao houve deploy/restart nem smoke remoto completo.

## Proxima etapa recomendada
1. Configurar credencial GitHub segura para push via HTTPS ou trocar o remote para SSH com chave valida.
2. Reexecutar `git push`.
3. Apos push bem-sucedido, criar backup real do PostgreSQL em pasta fora do repo.
4. Decidir abordagem de porta `3333`: bind local via alteracao pequena futura ou firewall com portas essenciais confirmadas.
5. Emitir certificado Let's Encrypt real apos validacao de Nginx/DNS.
6. So entao executar deploy/restart controlado e smoke remoto completo.

## Atualizacao 2026-06-15 - Fase 1.1.2
Autenticacao SSH e remote foram corrigidos para `git@github.com:liddoapp-boop/software-barbearia.git`, mas `git fetch origin` revelou divergencia por forced update remoto:
- `main...origin/main [ahead 23, behind 1]`
- commit remoto ausente localmente: `9269836 feat: scaffold dashboard and agenda modules with mobile-first layout and navigation shell`

A reconciliacao foi bloqueada antes de merge/rebase porque a simulacao de merge indicou conflitos em arquivos centrais de frontend e planejamento, incluindo `public/app.js`, `public/index.html`, `public/modules/agenda.js`, `public/modules/dashboard.js` e `public/styles/layout.css`.

Documento detalhado: `.planning/113_RECONCILIACAO_GIT_ORIGIN_MAIN.md`.

## Atualizacao 2026-06-15 - Fase 1.1.4
Backup real do PostgreSQL criado antes de qualquer hardening/deploy:
- Banco: `barbearia`
- Caminho: `/root/software-barbearia-backups/barbearia_20260615_122852.sql`
- Tamanho: `1445896` bytes
- SHA-256: `b3d000747e8e5ac4982be9c0cbb190c612b862b24442a0df7b0fd707c78b2082`
- Arquivo fora do repositorio, com permissao `-rw------- root:root`

Nao houve deploy, restart PM2, alteracao de firewall, emissao de certificado, alteracao de Nginx, migration ou seed.

Documento detalhado: `.planning/114_BACKUP_POSTGRESQL_PRE_HARDENING.md`.

## Atualizacao 2026-06-15 - Fase 1.1.5
Documentacao do backup PostgreSQL foi commitada e enviada:
- Commit: `6433952 docs: registrar backup postgresql pre hardening`
- Push para `origin/main` concluido.
- `.env`, `test-results/`, backup SQL e arquivos sensiveis nao entraram no commit.

Mitigacao da porta `3333` aplicada por UFW:
- SSH confirmado em `22/tcp` antes da ativacao.
- Regras aplicadas: `allow OpenSSH`, `allow 80/tcp`, `allow 443/tcp`, `deny 3333/tcp`.
- UFW ativo com politica padrao `deny incoming`.
- `127.0.0.1:3333/health` e HTTPS publico `/health` continuam respondendo.
- Verificacao externa por `check-host.net` indicou timeout em `76.13.161.250:3333` e sucesso em `:443`.

Documento detalhado: `.planning/115_MITIGACAO_PORTA_3333_FIREWALL.md`.

## Atualizacao 2026-06-15 - Fase 1.1.7
Certificado staging/teste de `barbearia.76-13-161-250.nip.io` substituido por certificado Let's Encrypt real:
- Issuer anterior: `Let's Encrypt, CN = (STAGING) Baloney Bulgur YE2`.
- Issuer final: `Let's Encrypt, CN = YE1`.
- Validade final: `2026-06-15 11:54:15 GMT` ate `2026-09-13 11:54:14 GMT`.
- Comando usado: `certbot --nginx -d barbearia.76-13-161-250.nip.io --cert-name barbearia.76-13-161-250.nip.io --force-renewal --server https://acme-v02.api.letsencrypt.org/directory --redirect --non-interactive --agree-tos`.
- `nginx -t` passou e `systemctl reload nginx` concluiu sem erro.
- `curl https://barbearia.76-13-161-250.nip.io/health` passou sem `-k`.
- `certbot renew --dry-run --no-random-sleep-on-renew` passou para os certificados `barbearia` e `liddo`.
- PM2, Nginx, PostgreSQL e UFW permaneceram saudaveis.

Documento detalhado: `.planning/116_CERTIFICADO_LETSENCRYPT_REAL.md`.

## Atualizacao 2026-06-15 - Fase 1.1.9
Bind do app Node/Fastify corrigido para loopback:
- Estado inicial: `software-barbearia` escutava em `0.0.0.0:3333`.
- `src/server.ts` recebeu suporte a `HOST` via env.
- Default de producao agora e `127.0.0.1`; fora de producao segue `0.0.0.0` para compatibilidade local.
- `.env` ignorado pelo Git recebeu `HOST=127.0.0.1`, sem exposicao de segredos.
- `npm run build`, `npm run test`, `npm run test:db`, `npm audit`, `npm audit --omit=dev`, `git diff --check` e `nginx -t` passaram.
- `pm2 restart software-barbearia --update-env` foi executado.
- Estado final: `software-barbearia` escuta em `127.0.0.1:3333`, sem listener em `0.0.0.0:3333`.
- `curl http://127.0.0.1:3333/health` e `curl https://barbearia.76-13-161-250.nip.io/health` retornaram `200 OK`.
- PM2, Nginx, PostgreSQL e UFW permaneceram saudaveis; UFW segue permitindo `22/80/443` e negando `3333`.

Documento detalhado: `.planning/117_BIND_LOCALHOST_APP_NODE.md`.

## Atualizacao 2026-06-15 - Fase 1.2
Validacao funcional curta no dominio publico:
- URL validada: `https://barbearia.76-13-161-250.nip.io`.
- Health publico retornou `200 OK` e `{"ok":true,"authEnforced":true}` sem `-k`.
- `/booking.html` redirecionou para `/agendamento`; `/agendamento` retornou `200 OK`.
- `/`, `/login`, `/app.js` e `/styles/layout.css` carregaram com `200`.
- Rotas internas protegidas sem token retornaram `401`, sem erro `500`.
- Login owner autenticado nao foi validado porque nao ha `SMOKE_*` configurado no ambiente e as senhas padrao versionadas retornaram `401` em producao.
- RBAC por perfil nao foi validado por falta de tokens validos.
- Logs PM2 sem erro critico, crash ou loop de restart.
- PM2, Nginx, PostgreSQL e UFW permaneceram saudaveis; app segue em `127.0.0.1:3333`.

Decisao: APROVADO COM RESSALVAS.

Documento detalhado: `.planning/118_VALIDACAO_FUNCIONAL_DOMINIO_PUBLICO.md`.

## Atualizacao 2026-06-15 - Fase 1.2.1
Validacao autenticada remota com `SMOKE_*` foi bloqueada:
- Nenhuma variavel `SMOKE_*` esperada estava configurada no ambiente da sessao.
- Nao foram impressas senhas, tokens, `.env` ou `DATABASE_URL`.
- Nao foi editado `.env`, pois nao havia valores reais fornecidos.
- Nao foi usado usuario padrao fraco em producao.
- Nao foi criado usuario, executado seed, migration, deploy ou restart PM2.
- Dominio publico continua respondendo `/health` com `200 OK` e `{"ok":true,"authEnforced":true}`.
- PM2, Nginx, PostgreSQL e UFW permaneceram saudaveis.
- Logs PM2 sem crash, sem loop de restart e sem erro `500` critico.

Decisao: BLOQUEADO por ausencia de credenciais reais de smoke.

Documento detalhado: `.planning/119_VALIDACAO_AUTENTICADA_SMOKE_REMOTO.md`.

## Atualizacao 2026-06-16 UTC - Validacao owner-only aprovada
O ambiente endurecido foi revalidado apos provisionamento owner-only no terminal real da VPS.

Confirmacoes:
- `SMOKE_BASE_URL`, `SMOKE_OWNER_EMAIL` e `SMOKE_OWNER_PASSWORD` presentes sem imprimir valores.
- Login owner remoto `200`.
- `/auth/me` `200`, role `owner`, activeUnitId `unit-01`.
- Modulos principais owner `200`: Agenda, Clientes, PDV, Financeiro, Servicos, Equipe, Auditoria e Configuracoes.
- Health publico `200`.
- Booking publico `/agendamento` `200`.
- Banco owner-only: `users_active=1` e `active_unit_accesses=1`; usuario/acesso ativo unico em `unit-01` com role `owner`.
- PM2 online; Nginx ativo; PostgreSQL ativo; UFW ativo.
- App em `127.0.0.1:3333`, sem `0.0.0.0:3333`; `3333/tcp` segue negado.
- Logs PM2 sem crash, loop de restart ou erro `500` critico.
- `.env`, backup SQL, script seguro e backup local do `.env` fora do repositorio nao aparecem no Git.

Nao houve seed, migration, alteracao de RBAC, regra financeira, firewall, certificado, `git add`, commit ou push.

Decisao desta revalidacao: APROVADO.

## Atualizacao 2026-06-15 - Fase 1.2.2
Provisionamento seguro de usuarios smoke:
- Inspecionado `prisma/schema.prisma`, `src/http/security.ts`, `src/http/app.ts` e scripts de smoke.
- Modelo persistente confirmado: `User` e `UserUnitAccess`.
- Roles validas: `owner`, `recepcao`, `profissional`.
- Hash oficial: PBKDF2 SHA-256 com 210000 iteracoes.
- Nao ha script dedicado pronto para provisionamento/rotacao segura de usuario autenticavel.
- Banco possui usuarios ativos para os tres perfis e acessos ativos em `unit-01`, registrados somente com emails mascarados.
- Nao ha senhas reais disponiveis na sessao; `SMOKE_*` continuam ausentes.
- Nao houve seed, migration, criacao/reset de usuario, edicao de `.env`, deploy, restart PM2, firewall, certificado, `git add`, commit ou push.
- PM2, Nginx, PostgreSQL e UFW permaneceram saudaveis.

Decisao: BLOQUEADO por falta de credenciais reais/canal seguro de coleta oculta.

Documento detalhado: `.planning/120_PROVISIONAMENTO_USUARIOS_SMOKE_PRODUCAO.md`.

## Atualizacao 2026-06-15 - Fase 1.2.3
Configuracao de senhas fortes para `SMOKE_*` via terminal:
- Criado script temporario fora do repositorio em `/root/software-barbearia-secure/provision-smoke-users.cjs`.
- Script usa coleta oculta, valida politica de senha e importa `hashPassword` do build do app.
- Prompt foi iniciado, mas nao houve entrada no TTY acessivel por esta sessao.
- O processo foi encerrado sem aplicar provisionamento.
- `SMOKE_*` seguem ausentes.
- Usuarios `owner@barbearia.local`, `recepcao@barbearia.local` e `profissional@barbearia.local` seguem ativos em `unit-01`.
- Health publico continua OK.
- Nao houve impressao de senha/hash/token/.env/DATABASE_URL.

Decisao: BLOQUEADO por falta de canal interativo acessivel para coleta oculta.

Documento detalhado: `.planning/121_CONFIGURACAO_SMOKE_SENHAS_TERMINAL.md`.

## Atualizacao 2026-06-15 - Decisao piloto monousuario owner
Decisao de produto para o piloto:
- O piloto sera usado apenas pelo Geovane/proprietario.
- Perfil usado: `owner`/administrador.
- `recepcao` e `profissional` nao entram no escopo do piloto atual.
- RBAC, roles e permissoes permanecem intactos para expansao futura.

Validacao operacional preservada:
- PM2 online.
- Nginx ativo.
- PostgreSQL ativo.
- UFW ativo.
- App Node em `127.0.0.1:3333`, sem listener em `0.0.0.0:3333`.
- Health publico `200 OK` com `{"ok":true,"authEnforced":true}`.
- Booking publico `/booking.html` -> `/agendamento` com `200`.
- Logs PM2 sem crash, loop de restart ou erro `500` critico.

Owner escolhido para piloto:
- Email mascarado: `pe***1@gm***l.com`
- Role: `owner`
- UnitId principal: `unit-01`
- Status: ativo

Backup PostgreSQL owner-only criado antes da tentativa de reset:
- `/root/software-barbearia-backups/barbearia_owner_reset_20260615_201316.sql`

Resultado da tentativa:
- Script temporario owner-only foi criado fora do Git.
- Prompt oculto foi iniciado, mas nao houve entrada humana no TTY.
- Nenhum reset de senha foi confirmado.
- `SMOKE_OWNER_*` seguem ausentes.
- Login owner, `/auth/me` e modulos owner nao foram validados.

Decisao: BLOQUEADO para autenticacao owner-only ate senha forte ser digitada pelo operador no terminal real.

Documento detalhado: `.planning/121_DECISAO_PILOTO_MONOUSUARIO_OWNER.md`.

## Atualizacao 2026-06-15 - Consolidacao piloto owner-only
Backup PostgreSQL pre-alteracao criado:
- `/root/software-barbearia-backups/barbearia_pre_owner_only_20260615_221305.sql`
- Tamanho: `1526775` bytes
- SHA-256: `ddb3a3c52497cff1d84b837236e7747177e239dabc0c1a372b6ec0e46ceec845`
- Permissao: `-rw------- root:root`

Consolidacao owner-only:
- Antes da alteracao havia `users_active=67` e `active_unit_accesses=89`.
- Depois da alteracao ha `users_active=1` e `active_unit_accesses=1`.
- Usuario ativo final: `pe***1@gm***l.com`, role `owner`, `unit-01`.
- Usuarios fora do piloto foram desativados, nao deletados.

Infra apos alteracao:
- PM2 online.
- Nginx ativo.
- PostgreSQL ativo.
- UFW ativo.
- App Node em `127.0.0.1:3333`.
- Health publico OK.
- Booking publico OK.
- Logs PM2 sem crash, loop de restart ou erro `500` critico.

Bloqueio restante:
- Senha owner nao foi digitada pelo operador no TTY.
- `SMOKE_OWNER_*` ausente.
- Login owner, `/auth/me` e modulos autenticados nao validados.

Decisao: BLOQUEADO para validacao autenticada owner-only.

Documento detalhado: `.planning/122_CONSOLIDACAO_PILOTO_OWNER_ONLY.md`.
