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
