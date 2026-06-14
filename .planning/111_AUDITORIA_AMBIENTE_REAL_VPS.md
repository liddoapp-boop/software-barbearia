# Fase 1.0 - Auditoria e limpeza do ambiente real VPS

Data: 2026-06-14

## Objetivo
Auditar o ambiente real ja existente da VPS antes de qualquer release controlado, registrando estado operacional, riscos, plano de correcao, backup, deploy e rollback sem executar mudancas destrutivas.

Esta fase nao implementa feature nova, nao altera regra financeira, nao altera RBAC backend, nao altera endpoints, nao roda seed, nao roda migration, nao reinicia PM2, nao altera firewall, nao emite certificado real e nao faz push.

## Estado atual da VPS
- Host informado/observado: `srv1546410`.
- Projeto: `/root/software-barbearia`.
- URL publica: `https://barbearia.76-13-161-250.nip.io`.
- IP publico: `76.13.161.250`.
- Node em runtime PM2: `22.22.2`.
- App PM2: `software-barbearia`.
- Script PM2: `/root/software-barbearia/dist/src/server.js`.
- Porta da app: `3333`.
- Backend esperado: `DATA_BACKEND=prisma`.
- Ambiente esperado: `NODE_ENV=production`.
- Auth esperado: `AUTH_ENFORCED=true`.
- Health publico HTTPS: `{"ok":true,"authEnforced":true}`.

## Estado Git
Comandos executados:
- `git status --short`
- `git status -sb`
- `git log --oneline -15`
- `git remote -v`

Resultado:
- Branch: `main`.
- Relacao com remoto: `main...origin/main [ahead 10]`.
- Remoto: `origin https://github.com/dormammudev/software-barbearia.git`.
- `.env` nao aparece no `git status`.
- `test-results/` aparece como untracked e nao deve entrar em commit.
- Ultimos commits locais incluem `f44ade3 fix: consolidar ajustes operacionais do grupo e`, `744ee3a chore: atualizar lockfile apos audit fix`, `f2c6349 fix: concluir validacao mobile e corrigir responsividade`, `10de7e6 fix: corrigir overflow mobile do painel interno`.

Confirmacao:
- Branch segue ahead 10.
- Nao fazer push ate revisar status, commits locais e arquivos staged/untracked.

## Estado PM2
Comandos executados:
- `pm2 status`
- `pm2 describe software-barbearia`
- `pm2 logs software-barbearia --lines 80 --nostream`

Resultado:
- Processo `software-barbearia` online.
- PID observado: `41733`.
- Uptime observado: cerca de 4h no momento da auditoria.
- Restarts: `0`.
- Exec cwd: `/root/software-barbearia`.
- Script path: `/root/software-barbearia/dist/src/server.js`.
- Node.js version: `22.22.2`.
- Watch: desabilitado.
- Logs recentes: requisicoes HTTP 200 em rotas operacionais e `401/403` esperados para acessos sem token/perfil nao autorizado; sem erro critico no trecho auditado.

Risco:
- PM2 pode estar rodando build antigo. Antes de reiniciar, registrar estado, validar build, fazer backup e executar smoke.

## Estado Nginx
Comandos executados:
- `systemctl status nginx --no-pager`
- `rg -n "barbearia|3333|ssl_certificate|server_name|return 301" /etc/nginx -S`
- leitura de `/etc/nginx/sites-available/software-barbearia`

Resultado:
- `nginx.service` ativo e enabled.
- Proxy HTTPS encaminha `/` para `http://127.0.0.1:3333`.
- HTTP porta 80 redireciona para HTTPS para o host `barbearia.76-13-161-250.nip.io`.
- `curl -I http://barbearia.76-13-161-250.nip.io/health` retornou `301` para `https://barbearia.76-13-161-250.nip.io/health`.
- HTTPS `/health` retornou `200 OK`.

## Estado PostgreSQL
Comandos executados:
- `systemctl status postgresql --no-pager`
- `pg_lsclusters`
- listagem segura de bancos e usuarios via `runuser -u postgres -- psql`, sem exibir senha.

Resultado:
- `postgresql.service` ativo em estado `active (exited)`, com cluster real online.
- Cluster: PostgreSQL `16/main`, porta `5432`, status `online`, owner `postgres`.
- Porta `5432` escuta apenas em `127.0.0.1` e `[::1]`.
- Bancos nao-template observados: `barbearia`, `evolution`, `postgres`.
- Usuarios observados sem senha: `admin`, `barbearia`, `postgres`.

Confirmacao:
- Banco alvo da aplicacao: `barbearia`.
- Usuario esperado da aplicacao: `barbearia`.
- Nenhuma `DATABASE_URL` completa foi exibida.

## Portas abertas
Comando executado:
- `ss -tulpn`

Portas relevantes observadas:
- `0.0.0.0:22`: SSH.
- `0.0.0.0:80`: Nginx HTTP.
- `0.0.0.0:443`: Nginx HTTPS.
- `0.0.0.0:3333`: Node `software-barbearia`.
- `127.0.0.1:5432` e `[::1]:5432`: PostgreSQL local.
- `127.0.0.1:6379` e `[::1]:6379`: Redis local.
- Outras portas locais de apps/servicos existentes foram observadas, mas fora do escopo desta fase.

Firewall:
- `ufw status verbose`: `Status: inactive`.

## Certificado atual
Comando executado:
- `openssl s_client -connect barbearia.76-13-161-250.nip.io:443 -servername barbearia.76-13-161-250.nip.io </dev/null 2>/dev/null | openssl x509 -noout -issuer -subject -dates`

Resultado:
- Issuer: `Let's Encrypt`, CN `(STAGING) Baloney Bulgur YE2`.
- Subject: `CN = barbearia.76-13-161-250.nip.io`.
- Validade observada: `May 24 02:51:30 2026 GMT` ate `Aug 22 02:51:29 2026 GMT`.
- `certbot certificates` marca o certificado como `INVALID: TEST_CERT`.

Decisao:
- Certificado staging e bloqueio para producao publica limpa.
- Emitir certificado Let's Encrypt real somente apos confirmacao explicita de dominio/configuracao.

## Variaveis relevantes sem segredos
Valores relevantes esperados/documentados sem expor secrets:
- `PORT=3333`.
- `DATA_BACKEND=prisma`.
- `NODE_ENV=production`.
- `AUTH_ENFORCED=true`.
- `DATABASE_URL`: presente apenas como requisito operacional; valor nao exibido.
- Credenciais de banco: nao exibidas.
- `.env`: existe localmente e esta ignorado por Git.

## Riscos encontrados
1. P1/P2 Infra - API exposta diretamente em `http://76.13.161.250:3333/health`, retornando `200 OK` e body `{"ok":true,"authEnforced":true}`.
2. P1 Infra - App escuta em `0.0.0.0:3333`; o codigo atual usa `await app.listen({ port, host: "0.0.0.0" })` em `src/server.ts`.
3. P1 Release - Certificado HTTPS atual e Let's Encrypt staging/test cert.
4. P1 Infra - `ufw` esta inativo; a exposicao depende apenas de bind/servicos e regras externas da VPS.
5. P2 Release - Branch local `main` esta ahead 10 de `origin/main`; push exige revisao e autorizacao.
6. P2 Release - PM2 pode estar rodando build antigo ate que build/deploy controlado seja executado.
7. P2 Git hygiene - `test-results/` esta untracked e nao deve ser commitado.
8. P1 Secrets - `.env` existe com segredos e nao deve ser exibido nem commitado.

## Plano de correcao
Ordem recomendada, sem aplicar nesta fase:
1. Corrigir exposicao da porta `3333` com uma destas opcoes:
   - A) app escutar somente `127.0.0.1` em producao;
   - B) bloquear `3333` no firewall;
   - C) aplicar ambas, apos validar que Nginx usa `127.0.0.1:3333`.
2. Para a opcao A, alterar futuramente `src/server.ts` para aceitar `HOST` por env, usando default seguro em producao, por exemplo `HOST=127.0.0.1`.
3. Para a opcao B, planejar firewall com portas liberadas apenas para `22`, `80` e `443`, mantendo PostgreSQL local/restrito.
4. Emitir certificado Let's Encrypt real para `barbearia.76-13-161-250.nip.io` somente com autorizacao.
5. Validar `nginx -t` antes de qualquer reload futuro de Nginx.
6. Confirmar que nenhum processo externo depende de acesso direto a `:3333`.

Impacto esperado:
- Bind em `127.0.0.1` e/ou firewall bloqueando `3333` removem acesso direto a API pelo IP, preservando acesso publico via Nginx 80/443.
- Se houver monitor externo apontando para `:3333`, ele deve ser migrado para `/health` via HTTPS.

## Plano de backup
Antes de qualquer migration, restart de producao ou deploy:
1. Criar diretorio seguro fora do repo:
   - `install -d -m 700 /root/backups/software-barbearia`
2. Gerar backup com usuario local do PostgreSQL, sem imprimir senha:
   - `runuser -u postgres -- pg_dump -Fc -d barbearia -f /root/backups/software-barbearia/barbearia-$(date -u +%Y%m%dT%H%M%SZ).dump`
3. Validar arquivo:
   - `ls -lh /root/backups/software-barbearia/barbearia-*.dump`
   - `runuser -u postgres -- pg_restore -l /root/backups/software-barbearia/<arquivo>.dump >/dev/null`
4. Restauracao documentada:
   - `createdb barbearia_restore_check`
   - `runuser -u postgres -- pg_restore -d barbearia_restore_check /root/backups/software-barbearia/<arquivo>.dump`
5. Nao commitar backup e nao salvar backup dentro do repositorio.

## Plano de deploy controlado
Nao executar sem autorizacao explicita.

Sequencia segura proposta:
1. Confirmar commits locais e `git status -sb`.
2. Rodar validacoes finais.
3. Fazer push para GitHub somente se aprovado.
4. Fazer backup PostgreSQL.
5. Rodar `npm ci` porque existe `package-lock.json`.
6. Rodar `npx prisma generate`.
7. Rodar `npx prisma migrate deploy` somente se houver migrations pendentes e apos backup.
8. Rodar `npm run build`.
9. Reiniciar PM2 com `pm2 restart software-barbearia --update-env`.
10. Rodar smoke remoto.
11. Validar mobile pela URL publica.
12. Registrar resultado e logs PM2.

Validacoes locais executadas nesta fase:
- `npm run build`: passou.
- `npm run test`: passou (`6 passed | 1 skipped` arquivos, `88 passed | 11 skipped` testes).
- `npm run test:db`: passou (`1 passed` arquivo, `11 passed` testes).
- `npm audit`: passou com `0 vulnerabilities`.
- `npm audit --omit=dev`: passou com `0 vulnerabilities`.
- `git diff --check`: passou.

## Plano de rollback
Antes do deploy:
1. Registrar commit/tag/HEAD atual e artifact build atual.
2. Manter backup PostgreSQL validado.
3. Registrar `pm2 describe software-barbearia` e caminho do script.

Rollback de app:
1. Voltar o codigo para o commit anterior aprovado.
2. Rodar `npm ci`, `npx prisma generate` e `npm run build`.
3. Reiniciar PM2 com `pm2 restart software-barbearia --update-env`.
4. Validar `/health`, login owner e rotas criticas.

Rollback de banco:
1. Evitar rollback de banco se migrations forem apenas aditivas e compativeis.
2. Se necessario e autorizado, restaurar dump em janela controlada:
   - parar escrita da app;
   - restaurar dump validado;
   - reiniciar app;
   - rodar smoke.

Rollback de Nginx/certificado/firewall:
1. Guardar copia dos arquivos de site antes de alterar.
2. Validar `nginx -t` antes e depois.
3. Para firewall, documentar regras atuais e manter sessao SSH aberta antes de ativar.

## Smoke remoto planejado
Executar depois de deploy autorizado:
- `curl -k -I https://barbearia.76-13-161-250.nip.io/health`
- `curl -k https://barbearia.76-13-161-250.nip.io/health`
- Login owner com credenciais de smoke sem imprimir senha.
- RBAC recepcao/profissional.
- Booking publico.
- Agenda.
- PDV.
- Financeiro.
- Auditoria.
- Mobile pela URL publica.
- Headers de seguranca.
- CORS.
- Logs PM2 sem erro critico.

## Decisao final
APROVADO PARA DEPLOY CONTROLADO, com bloqueios/ressalvas obrigatorios antes de producao publica limpa:
- resolver ou aceitar formalmente o risco da porta `3333` exposta;
- trocar certificado staging por certificado Let's Encrypt real;
- fazer backup PostgreSQL validado antes de restart/migration/deploy;
- revisar commits locais ahead 10 antes de push;
- manter `.env`, backups e `test-results/` fora de commit.

Nenhuma mudanca destrutiva, deploy, restart PM2, firewall, certificado real, migration, seed ou push foi executado nesta fase.
