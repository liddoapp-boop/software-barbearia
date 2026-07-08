# Macro 235.2 - Pacote para futura VPS

Data: 2026-07-08

## Escopo

Este documento e apenas um pacote de requisitos e runbook para uma futura VPS. Nenhuma VPS foi escolhida, contratada, acessada ou configurada nesta macro.

Status atual: uso futuro bloqueado ate reconciliar o schema local e concluir a preparacao do banco principal `barbearia`.

## Requisitos minimos

- Linux LTS compativel com Node.js moderno.
- Node.js compativel com o projeto (`>=22`).
- npm compativel com `package-lock.json`.
- PostgreSQL compativel com o banco local validado.
- Nginx ou proxy reverso equivalente.
- PM2 ou servico equivalente de processo.
- HTTPS com renovacao automatica de certificado.
- Firewall com exposicao minima: SSH, HTTP e HTTPS.
- SSH somente por chave.
- Usuario de deploy sem privilegios desnecessarios.
- Backup externo e testado.
- Espaco em disco suficiente para banco, dumps, logs e releases.
- Memoria e CPU dimensionadas para Node.js, PostgreSQL, build e rotina de backup.
- Monitoramento basico de processo, disco, memoria e disponibilidade.

## Variaveis necessarias

Listar nomes, sem valores:

- `DATABASE_URL`
- `AUTH_ENFORCED`
- `AUTH_SECRET`
- `BILLING_WEBHOOK_SECRET`
- `BILLING_WEBHOOK_SECRET_STRIPE`
- `BILLING_WEBHOOK_SECRET_MERCADO_PAGO`
- `DATA_BACKEND`
- `NODE_ENV`
- `PORT`
- `HOST`
- `PUBLIC_BASE_URL`
- `PUBLIC_BOOKING_UNIT_ID`
- `CORS_ORIGIN`
- `HTTP_LOG_ENABLED`
- `LOG_LEVEL`
- `SMOKE_BASE_URL`
- `SMOKE_OWNER_EMAIL`
- `SMOKE_OWNER_PASSWORD`
- `SMOKE_UNIT_ID`

Confirmar a lista final contra `.env.example` e contra o processo real antes de provisionar.

## Procedimento futuro

1. Provisionar servidor.
2. Endurecer SSH:
   - acesso por chave;
   - desabilitar senha;
   - restringir usuarios;
   - revisar firewall.
3. Instalar dependencias do sistema:
   - Node.js;
   - npm;
   - PostgreSQL;
   - Nginx;
   - PM2 ou equivalente;
   - ferramentas de backup.
4. Criar usuario tecnico do banco.
5. Criar banco da aplicacao.
6. Definir politica de backup externo.
7. Preparar `.env` com valores reais, sem versionar segredos.
8. Instalar aplicacao.
9. Executar `npm ci`.
10. Executar `npm run build`.
11. Gerar Prisma Client se necessario.
12. Executar `npx prisma migrate deploy` somente quando o banco alvo estiver correto e o historico de migrations estiver consistente.
13. Configurar processo via PM2 ou servico equivalente.
14. Configurar Nginx como proxy reverso.
15. Ativar HTTPS.
16. Validar health check local.
17. Executar smoke readonly.
18. Executar smoke mutavel controlado somente se aprovado.
19. Criar backup pos-deploy.
20. Testar restore do backup.
21. Liberar uso somente apos aceite operacional.

## Caminhos de decisao do banco

### Banco limpo

1. Criar banco vazio.
2. Executar `npx prisma migrate deploy`.
3. Validar `npx prisma migrate status`.
4. Aplicar dados reais por procedimento aprovado.
5. Rodar smokes.

### Banco restaurado de backup local

1. Restaurar dump validado em banco novo.
2. Confirmar host, porta e nome do banco sem imprimir senha.
3. Executar `npx prisma migrate status`.
4. Se `_prisma_migrations` estiver ausente, nao executar deploy direto.
5. Gerar matriz de equivalencia por migration.
6. Resolver divergencias estruturais antes de qualquer baseline.
7. Executar `migrate resolve --applied` somente para migrations comprovadamente equivalentes.
8. Executar `npx prisma migrate deploy`.
9. Validar status, estrutura e dados.

## Validacoes obrigatorias

- `pg_dump --format=custom`
- SHA-256 do dump
- `pg_restore --list`
- restore em banco temporario
- contagens criticas
- financeiro agregado
- estoque agregado
- `npx prisma migrate status`
- `npm test`
- `npm run test:db`
- `npx tsc --noEmit`
- `npm run build`
- smoke readonly
- smoke mutavel controlado, quando seguro
- busca por secrets versionados
- revisao de logs sanitizados

## Rollback

1. Parar aplicacao.
2. Preservar logs sanitizados e horario do incidente.
3. Restaurar backup validado em banco novo ou usar snapshot conforme politica.
4. Apontar aplicacao para banco restaurado somente apos validacao.
5. Rodar health check e smoke readonly.
6. Registrar causa, impacto e decisao.

## Proibicoes

- Nao usar `prisma migrate dev` em ambiente alvo.
- Nao usar `prisma db push` em ambiente alvo.
- Nao usar `prisma migrate reset`.
- Nao executar seed geral em banco real.
- Nao fazer `DELETE` por padroes genericos.
- Nao registrar segredos em logs.
- Nao commitar `.env`, dumps ou evidencias sensiveis.
- Nao usar force push.

## Pendencias antes da VPS

- Resolver bloqueio de baseline encontrado na Macro 235.2.
- Confirmar dados reais da Barbearia Geovane Borges.
- Aprovar plano de limpeza por IDs, se desejado.
- Definir credenciais reais de smoke.
- Confirmar politica de backup externo.
- Escolher e provisionar VPS em etapa futura separada.
