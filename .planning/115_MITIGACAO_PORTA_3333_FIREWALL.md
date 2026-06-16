# Fase 1.1.5 - Commit da documentacao do backup e mitigacao da porta 3333

Data: 2026-06-15

## Objetivo
Commitar e enviar somente a documentacao do backup PostgreSQL da Fase 1.1.4 e mitigar a exposicao publica direta da porta `3333` sem deploy, restart PM2, certificado, migration, seed ou alteracao de codigo.

## Estado inicial
Git:
- Branch `main` alinhada com `origin/main`: `git rev-list --left-right --count main...origin/main` retornou `0 0`.
- `.env` nao apareceu no status.
- `test-results/` apareceu apenas como untracked.
- Backup SQL real permanece fora do repositorio em `/root/software-barbearia-backups/barbearia_20260615_122852.sql`.
- Checksum confirmado: `b3d000747e8e5ac4982be9c0cbb190c612b862b24442a0df7b0fd707c78b2082`.

Servicos:
- PM2 online, incluindo `software-barbearia`.
- Nginx ativo.
- PostgreSQL ativo.
- PostgreSQL escutando em loopback `127.0.0.1:5432` e `[::1]:5432`.
- `software-barbearia` escutando em `0.0.0.0:3333`.
- UFW inicial: `inactive`.

## Commit da documentacao do backup
Staging seletivo executado apenas para:
- `.planning/114_BACKUP_POSTGRESQL_PRE_HARDENING.md`
- `.planning/112_HARDENING_VPS_PRE_DEPLOY.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

Validacoes antes do commit:
- `git diff --cached --stat`: 4 arquivos, 163 insercoes.
- `git diff --cached --name-only`: somente os quatro documentos acima.
- `git diff --cached --check`: sem saida.
- Nao entraram `.env`, `test-results/`, backup SQL, arquivos `.sql`, chaves SSH ou temporarios.

Commit criado e enviado:
- `6433952 docs: registrar backup postgresql pre hardening`
- `git push origin main`: concluido para `origin/main`.

Status apos push:
- Branch `main` alinhada com `origin/main`.
- Working tree com apenas `test-results/` untracked antes da documentacao desta fase.

## Testes antes do firewall
Resultados antes de qualquer mudanca de firewall:
- `curl -sS http://127.0.0.1:3333/health`: `{"ok":true,"authEnforced":true}`
- `curl -k -sS https://barbearia.76-13-161-250.nip.io/health`: `{"ok":true,"authEnforced":true}`
- `curl -sS --max-time 5 http://76.13.161.250:3333/health`: `{"ok":true,"authEnforced":true}`

Conclusao inicial:
- Localhost `127.0.0.1:3333` respondia.
- HTTPS publico via Nginx respondia.
- IP publico direto em `:3333` respondia antes da mitigacao.

## Plano de firewall
SSH foi validado antes de ativar UFW:
- `sshd -T`: `port 22`.
- `sshd` escutando em `0.0.0.0:22` e `[::]:22`.
- Perfil UFW `OpenSSH`: `22/tcp`.

Politica UFW observada:
- `DEFAULT_INPUT_POLICY="DROP"`.
- `DEFAULT_OUTPUT_POLICY="ACCEPT"`.
- `DEFAULT_FORWARD_POLICY="DROP"`.

Regras planejadas:
- `ufw allow OpenSSH`
- `ufw allow 80/tcp`
- `ufw allow 443/tcp`
- `ufw deny 3333/tcp`
- `ufw --force enable`

Risco observado:
- Existe listener em `*:8080`.
- A fase abriu explicitamente apenas SSH, HTTP e HTTPS, mantendo o objetivo de exposicao publica por Nginx em `80/443`.
- O processo PM2 nao foi parado; a politica de firewall pode impedir acesso externo direto a portas nao permitidas.

## Regras aplicadas
Comandos executados:
- `ufw allow OpenSSH`
- `ufw allow 80/tcp`
- `ufw allow 443/tcp`
- `ufw deny 3333/tcp`
- `ufw --force enable`

Status UFW final:
- `Status: active`
- `Default: deny (incoming), allow (outgoing), deny (routed)`
- `22/tcp (OpenSSH) ALLOW IN Anywhere`
- `80/tcp ALLOW IN Anywhere`
- `443/tcp ALLOW IN Anywhere`
- `3333/tcp DENY IN Anywhere`
- Regras equivalentes aplicadas para IPv6.
- Regra preexistente `Nginx Full` segue presente.

## Validacao apos firewall
Resultados locais na VPS:
- `curl -sS http://127.0.0.1:3333/health`: `{"ok":true,"authEnforced":true}`
- `curl -k -sS https://barbearia.76-13-161-250.nip.io/health`: `{"ok":true,"authEnforced":true}`
- `curl -sS --max-time 5 http://76.13.161.250:3333/health`: `{"ok":true,"authEnforced":true}`

Observacao importante:
- `ip route get 76.13.161.250` retornou `local 76.13.161.250 dev lo`.
- Portanto, o curl para o proprio IP publico executado de dentro da VPS usa rota local e nao comprova exposicao externa apos o firewall.

Validacao externa de TCP:
- `check-host.net` para `76.13.161.250:3333`: timeout em `br1`, `md1` e `si1`.
- `check-host.net` para `barbearia.76-13-161-250.nip.io:443`: conexao bem-sucedida em `de4`, `hu1` e `id2`.

Conclusao apos firewall:
- `127.0.0.1:3333` continua funcionando localmente.
- HTTPS publico continua funcionando via Nginx.
- A porta `3333/tcp` deixou de responder externamente conforme verificacao por nos externos.
- SSH permanece permitido por regra UFW `OpenSSH` em `22/tcp`.
- PM2, Nginx e PostgreSQL seguem ativos.

## Status final de servicos
PM2:
- Todos os processos listados permaneceram `online`.
- `software-barbearia` permaneceu `online`.

Nginx:
- `active (running)`.

PostgreSQL:
- `active (exited)` no unit manager, com processo `postgres` escutando localmente em `127.0.0.1:5432` e `[::1]:5432`.

Sockets relevantes:
- SSH: `0.0.0.0:22` e `[::]:22`.
- Nginx: `0.0.0.0:80`, `[::]:80` e `0.0.0.0:443`.
- PostgreSQL: `127.0.0.1:5432` e `[::1]:5432`.
- App: `0.0.0.0:3333`, bloqueado externamente por UFW.

## Acoes nao executadas
- Deploy nao executado.
- PM2 nao reiniciado.
- Certificado nao emitido.
- Migration nao executada.
- Seed nao executado.
- Codigo de aplicacao nao alterado.
- `.env`, segredos e `DATABASE_URL` completa nao foram expostos.
- Backup SQL nao foi commitado.
- `test-results/` nao foi commitado.
- Esta documentacao da Fase 1.1.5 nao foi commitada nesta rodada.

## Riscos restantes
1. `software-barbearia` ainda faz bind em `0.0.0.0:3333`; a mitigacao externa depende do UFW permanecer ativo.
2. Ha listener em `*:8080`; a regra padrao do UFW bloqueia entrada externa nao permitida, mas a finalidade desse servico deve ser revisada em fase propria.
3. Certificado real ainda nao foi emitido.
4. Validacao de SSH foi feita por configuracao e regra de firewall; nao foi aberta uma nova sessao SSH externa durante esta execucao.

## Decisao final
APROVADO.

Motivos:
- Documentacao do backup foi commitada e enviada.
- Porta `3333/tcp` deixou de responder externamente por verificacao independente.
- HTTPS publico continuou funcionando.
- `127.0.0.1:3333` continuou funcionando localmente.
- SSH esta explicitamente permitido em `22/tcp`.
- PM2, Nginx e PostgreSQL seguiram ativos.

## Proxima etapa recomendada
1. Validar abertura de nova sessao SSH por operador humano antes de qualquer hardening adicional.
2. Planejar bind futuro do app em `127.0.0.1` via configuracao `HOST`/env para reduzir dependencia exclusiva do firewall.
3. Revisar o servico em `*:8080` e decidir se deve continuar privado, ser exposto por Nginx ou ser bloqueado permanentemente.
4. Emitir certificado real somente apos checklist de Nginx/DNS e plano de rollback.
