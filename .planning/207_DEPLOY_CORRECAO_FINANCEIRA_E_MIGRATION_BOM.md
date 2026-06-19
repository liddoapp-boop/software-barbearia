# 207 - Deploy correcao financeira e migration BOM

Data: 2026-06-19

Escopo: deploy controlado pos-backup para ativar em producao o HEAD `d94017b`, contendo a correcao financeira ja commitada, o upgrade seguro do `nodemailer` e o saneamento do BOM da migration historica.

## 1. Resumo executivo

Resultado: **APROVADO COM RESSALVAS**.

O deploy controlado foi executado com sucesso apos validacao do backup pre-deploy.

HEAD implantado:

- `d94017b fix: remover bom de migration historica`

Commits relevantes ja enviados antes do deploy:

- `58dd7a9 chore: corrigir vulnerabilidade do nodemailer`
- `d94017b fix: remover bom de migration historica`

Atualizacao pos-deploy em 2026-06-19:

- A ressalva original de smoke autenticado foi reavaliada.
- As variaveis `SMOKE_*` nao estavam exportadas na sessao, mas havia chaves `SMOKE_BASE_URL`, `SMOKE_UNIT_ID`, `SMOKE_OWNER_EMAIL` e `SMOKE_OWNER_PASSWORD` definidas em `.env`; os valores nao foram impressos nem documentados.
- O `npm run smoke:api` nao foi executado em producao porque o script existente cria agendamento, altera status, executa checkout, registra venda de produto e devolucao.
- Para evitar escrita desnecessaria em dados reais, foi executado smoke autenticado manual somente leitura com owner, cobrindo autenticacao e modulos internos criticos.

## 2. Backup pre-deploy

Backup validado antes do deploy:

- Arquivo: `/var/backups/software-barbearia/software-barbearia-predeploy-20260619-173637.dump`
- Tamanho: `514776` bytes (`503K`)
- Permissao: `600`
- SHA-256: `3670795cc178dd0d585e13aee399a29c9df5a48cfaf2d03829c45c42b005ecac`
- `pg_restore --list`: legivel, `293` linhas

Nenhum novo backup foi criado nesta etapa.

## 3. Diagnostico inicial

Estado inicial confirmado:

- Working tree limpo.
- Branch: `main`.
- HEAD: `d94017b`.
- PM2: `software-barbearia` online.
- Health publico inicial: `{"ok":true,"authEnforced":true}`.
- Nginx ativo.
- PostgreSQL ativo.
- UFW ativo.
- Aplicacao escutando em `127.0.0.1:3333`.
- Ausencia de app em `0.0.0.0:3333`.

## 4. Git

Comandos executados:

- `git fetch origin`
- `git status -sb`
- `git branch -vv`
- `git log --oneline --decorate -10`

Resultado:

- `main` alinhada com `origin/main`.
- Nenhum `git pull --ff-only` foi necessario.
- Nenhum conflito ou divergencia foi identificado.
- Nao foi usado reset, force pull ou force push.

## 5. Dependencias

Comandos executados:

- `node -v`: `v22.22.2`
- `npm -v`: `10.9.7`
- `npm ci`
- `npm ls nodemailer`
- `npm audit`
- `npm audit --omit=dev`

Resultados:

- `npm ci`: passou, `165` pacotes instalados, `166` auditados.
- `npm ls nodemailer`: `nodemailer@9.0.1`.
- `npm audit`: `found 0 vulnerabilities`.
- `npm audit --omit=dev`: `found 0 vulnerabilities`.

## 6. Prisma

Comandos executados:

- `npx prisma generate`
- `npx prisma migrate status`

Resultados:

- Prisma Client `v6.19.3` gerado com sucesso.
- `prisma migrate status`: `Database schema is up to date!`
- Prisma encontrou `16` migrations.
- Nenhuma migration pendente, drift, checksum problematico ou conflito foi reportado.

Importante:

- `prisma migrate deploy` nao foi executado.
- Nenhuma migration foi rodada no banco operacional nesta etapa.
- Seed nao foi rodado.
- Banco operacional nao foi alterado manualmente.

## 7. Build

Comando executado:

- `npm run build`

Resultado:

- Build TypeScript passou.
- Nenhuma alteracao versionada foi gerada pelo build.

## 8. Restart PM2

Antes do restart:

- `pm2 status`: `software-barbearia` online.
- `pm2 describe software-barbearia`: script em `/root/software-barbearia/dist/src/server.js`, cwd `/root/software-barbearia`, status online.

Comando executado:

- `pm2 restart software-barbearia --update-env`

Resultado:

- Restart concluido.
- Novo PID observado: `208821`.
- Status final: online.
- Aplicacao voltou a escutar em `127.0.0.1:3333`.

Observacao:

- O primeiro health executado imediatamente apos o restart retornou `502 Bad Gateway` durante a subida.
- Revalidacao alguns segundos depois retornou `200 OK` com `{"ok":true,"authEnforced":true}`.

## 9. Health e logs

Health pos-deploy:

- `HTTP/1.1 200 OK`
- Body: `{"ok":true,"authEnforced":true}`

Logs PM2 relevantes apos restart:

- `Server listening at http://127.0.0.1:3333`
- `API online em http://127.0.0.1:3333`
- `GET /health` respondeu `200`

Nao foram observados:

- crash;
- loop de restart;
- erro 500 critico;
- erro de conexao com banco nos logs avaliados.

## 10. Smoke basico

Paginas publicas:

- `GET /`: `200 OK`
- `GET /agendamento`: `200 OK`
- `GET /login`: `200 OK`

Endpoints protegidos sem token:

- `GET /dashboard?unitId=unit-01`: `401 Unauthorized`
- `GET /financial/transactions?...`: `401 Unauthorized`
- `GET /audit/events?unitId=unit-01`: `401 Unauthorized`

Resultado:

- Endpoints internos sem token nao vazaram dados.
- Resposta esperada: `{"error":"Nao autenticado"}`.

## 11. Smoke autenticado

Verificacao:

- `printenv | grep '^SMOKE_' | sed 's/=.*/=<definido>/'`
- verificacao segura de chaves `SMOKE_*` em arquivos locais, sem imprimir valores

Resultado:

- Nenhuma variavel `SMOKE_*` estava exportada na sessao.
- Foram encontradas chaves `SMOKE_BASE_URL`, `SMOKE_UNIT_ID`, `SMOKE_OWNER_EMAIL` e `SMOKE_OWNER_PASSWORD` em `.env`; os valores nao foram impressos.
- O script `smoke:api` usa `scripts/smoke-api-flow.mjs`.
- O script carrega `dotenv`, usa endpoint remoto quando `SMOKE_BASE_URL` esta definido e exige login owner para producao ou base remota.
- O script nao e somente leitura: cria agendamento, confirma/inicia atendimento, finaliza checkout, registra venda de produto, registra devolucao e consulta relatorios/auditoria.
- Por risco de escrita em producao, `npm run smoke:api` nao foi executado.

Smoke manual autenticado somente leitura:

- Rota protegida sem token: `401`, conforme esperado.
- Login owner: `200`, com token mantido apenas em memoria de processo e nao impresso.
- `GET /auth/me`: `200`, usuario owner e unidade ativa esperada.
- Agenda: `GET /agenda/range`: `200`.
- Clientes: `GET /clients`: `200`.
- PDV/catalogo: `GET /catalog`: `200`.
- Financeiro: `GET /financial/summary`: `200`.
- Financeiro: `GET /financial/transactions`: `200`.
- Servicos: `GET /services`: `200`.
- Auditoria: `GET /audit/events`: `200`.
- Configuracoes: `GET /settings`: `200`.
- Relatorios gerenciais: `GET /reports/management/summary`: `200`.

Garantias do smoke manual:

- Nenhuma senha foi impressa.
- Nenhum token foi impresso.
- Nenhum `DATABASE_URL` foi impresso.
- Nenhum conteudo de `.env` foi impresso.
- Nenhuma migration, seed, escrita manual em banco, restart PM2, alteracao de firewall ou alteracao de certificado foi executada nesta revalidacao.

## 12. Garantias da etapa

Confirmado:

- Backup pre-deploy validado antes do deploy.
- Deploy ativou o build do HEAD `d94017b` via restart PM2.
- `prisma migrate deploy` nao foi rodado.
- Seed nao foi rodado.
- Banco operacional nao foi alterado manualmente.
- Firewall nao foi alterado.
- Certificado nao foi alterado.
- `.env` nao foi alterado.
- Nenhuma senha, token de aplicacao, `DATABASE_URL`, hash de senha, chave privada ou backup SQL foi registrado neste documento.
- A documentacao foi atualizada para registrar o smoke manual autenticado somente leitura.

## 13. Decisao final

**APROVADO COM RESSALVAS.**

Criterios atendidos:

- backup pre-deploy confirmado;
- `npm ci` passou;
- `nodemailer@9.0.1` confirmado;
- audits sem vulnerabilidades;
- `prisma generate` passou;
- `prisma migrate status` sem problema;
- build passou;
- PM2 reiniciou corretamente;
- health publico OK apos subida;
- logs sem erro 500 critico;
- smoke basico passou;
- smoke manual autenticado owner somente leitura passou;
- `/auth/me` validou usuario owner e unidade ativa esperada;
- Agenda, Clientes, PDV/catalogo, Financeiro, Servicos, Auditoria, Configuracoes e Relatorios gerenciais responderam sem erro critico;
- banco operacional nao foi alterado indevidamente.

Ressalva:

- `npm run smoke:api` permanece nao executado em producao porque o script atual cria e altera dados reais. A validacao autenticada foi substituida por smoke manual somente leitura para cumprir o objetivo sem escrita desnecessaria.

## 14. Proxima etapa recomendada

1. Criar variante `smoke:api:readonly` para producao, cobrindo login owner e modulos criticos sem criar agendamentos, vendas, devolucoes ou lancamentos.
2. Revisar este documento e, se aprovado, commitar apenas `.planning/207_DEPLOY_CORRECAO_FINANCEIRA_E_MIGRATION_BOM.md`.
3. Seguir para pacote academico/manual owner-only com o deploy ja validado.
