# Sprint 210 - Deploy da Blindagem da Agenda

Data: 2026-06-20
Status: concluido

## Objetivo

Implantar em producao os commits da Sprint 209 que blindam a Agenda, sem migration, sem seed e sem alteracao manual de banco.

## Commits implantados

- `db9b10d fix: blindar remarcacao concorrente na agenda`
- `371b3ad fix: alinhar validacao de cliente por unidade na agenda`
- `4ab24d0 fix: blindar regras de agendamento`

## Baseline antes do deploy

- Branch: `main`.
- Estado inicial observado: `main...origin/main`.
- Arvore inicial: limpa.
- Commit antes do restart controlado: `db9b10d fix: blindar remarcacao concorrente na agenda`.
- PM2 antes: `software-barbearia` online.
- Health antes: `{"ok":true,"authEnforced":true}`.
- Observacao: o diretorio de producao ja estava alinhado com `origin/main` antes do restart; `git pull --ff-only origin main` confirmou `Already up to date`.

## Conferencia Git

- `git fetch origin`: executado.
- `git log --oneline HEAD..origin/main`: sem commits pendentes.
- `git diff --name-only HEAD..origin/main`: sem arquivos pendentes.
- `git diff --stat HEAD..origin/main`: sem diff pendente.
- `git pull --ff-only origin main`: executado com sucesso, sem merge commit, resultado `Already up to date`.
- Estado apos pull: `main...origin/main`, arvore limpa.

## Prisma

- `npx prisma migrate status`: passou.
- Resultado: `16 migrations found in prisma/migrations` e `Database schema is up to date!`.
- Migration: nenhuma executada.
- `prisma migrate deploy`: nao executado.
- Seed: nenhuma executada.
- Alteracao manual em banco: nenhuma realizada.

## Dependencias

- `git diff --name-only HEAD~3..HEAD | grep -E 'package(-lock)?\.json' || true`: sem saida.
- `npm ci`: nao executado, pois os commits da Sprint 209 nao alteraram dependencias.

## Build

- `npm run build`: passou.

## PM2 e Health

- `pm2 restart software-barbearia --update-env`: executado com sucesso.
- `pm2 status`: `software-barbearia` online apos restart.
- Health apos restart: `{"ok":true,"authEnforced":true}`.
- Logs recentes: sem crash, sem loop de restart, sem erro Prisma, sem erro de bind e sem erro 500 critico observado.
- Observacao: logs mostram 401 esperados para requisicoes sem token.

## Smoke Readonly

- `npm run smoke:api:readonly`: passou.
- Itens validados:
  - health 200;
  - pagina publica 200;
  - rota protegida sem token 401;
  - login owner 200;
  - `/auth/me` 200;
  - Agenda 200;
  - clientes 200;
  - catalogo/PDV 200;
  - financeiro 200;
  - servicos 200;
  - auditoria 200;
  - configuracoes 200;
  - relatorios gerenciais 200.

## Validacao somente leitura da Agenda

- Validacao adicional sem mutacao executada com variaveis `SMOKE_*` ja configuradas.
- Resultado:
  - pagina publica 200;
  - login owner 200;
  - dashboard 200;
  - Agenda 200;
  - payload de Agenda contem `appointments` como array;
  - payload de Agenda contem `workingHours` como objeto.
- Nao houve criacao, remarcacao, cancelamento, checkout ou alteracao de agendamento real.

## Seguranca Operacional

- `.env`: nao alterado.
- Secrets: nenhum valor sensivel foi impresso.
- Firewall: nao alterado.
- Certificado: nao alterado.
- Nginx: nao alterado.
- Backup SQL novo: nao criado; nao houve migration/schema nesta etapa.

## Resultado

Deploy controlado da Sprint 209 concluido e validado em producao.

