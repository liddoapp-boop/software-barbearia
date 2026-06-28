# Sprint 226.8 - Aplicacao controlada da migration de snapshot

## 1. Objetivo

Aplicar de forma controlada a migration `20260628_service_snapshot_appointments` no banco correto, validando alvo, conteudo da migration, pendencias, colunas criadas e ausencia de backfill.

## 2. Contexto vindo da Sprint 226.7

A Sprint 226.7 adicionou snapshot de servico em novos agendamentos no codigo e versionou a migration, mas nao aplicou a alteracao no banco. Esta sprint alinha o banco local ao codigo ja versionado.

## 3. Decisao do pre-flight CTO

`LIBERADO PARA APLICAR MIGRATION`.

Pre-flight confirmou:

- repositorio em `/root/software-barbearia`;
- branch `main`;
- Git limpo em `main...origin/main`;
- commits `88d05d0` e `62febda` presentes;
- migration esperada existente;
- alvo classificado como `LOCAL`;
- unica migration pendente era `20260628_service_snapshot_appointments`.

## 4. Decisao de CTO

Aplicar no alvo local era correto e de baixo risco. A migration so adiciona colunas nullable e nao executa backfill, `UPDATE`, `DELETE` ou `DROP`.

## 5. Alvo identificado do DATABASE_URL

`DATABASE_URL` presente, engine `postgresql`, host classificado como local. Segredos nao foram impressos.

## 6. Classificacao do alvo

`LOCAL`.

## 7. Migration avaliada

`prisma/migrations/20260628_service_snapshot_appointments/migration.sql`

## 8. Confirmacao de colunas nullable

A migration executa apenas:

- `ADD COLUMN "serviceNameSnapshot" TEXT`
- `ADD COLUMN "servicePriceSnapshot" DECIMAL(10,2)`
- `ADD COLUMN "serviceDurationMinSnapshot" INTEGER`

Todas as colunas sao nullable.

## 9. Confirmacao de que nao houve backfill

Nao ha `UPDATE`, `INSERT`, `DELETE`, `DROP`, alteracao de catalogo, alteracao de financeiro ou alteracao de estoque na migration.

## 10. Backup criado

Nao aplicavel. O alvo foi `LOCAL`, nao producao. Backup completo era obrigatorio apenas para producao.

## 11. Checksum do backup

Nao aplicavel.

## 12. Comando de restore documentado

Nao aplicavel para esta execucao local sem backup.

## 13. Resultado do migrate deploy

`npx prisma migrate deploy --schema prisma/schema.prisma` aplicado com sucesso.

Migration aplicada:

`20260628_service_snapshot_appointments`

Depois da aplicacao, `npx prisma migrate status --schema prisma/schema.prisma` indicou schema atualizado e sem migrations pendentes.

## 14. Resultado do prisma generate

`npx prisma generate --schema prisma/schema.prisma` executado com sucesso.

## 15. Validacao das colunas no banco

Consulta readonly em `information_schema.columns` confirmou:

- `serviceDurationMinSnapshot`: `integer`, nullable;
- `serviceNameSnapshot`: `text`, nullable;
- `servicePriceSnapshot`: `numeric(10,2)`, nullable.

## 16. Validacao de snapshots nulos em legado

Consulta readonly em `Appointment` retornou:

- total de agendamentos locais: 392;
- agendamentos com os tres snapshots nulos: 392;
- agendamentos com algum snapshot preenchido: 0.

Isso confirma ausencia de backfill nesta base local.

## 17. Testes executados

- `npx vitest run tests/api.spec.ts -t "snapshot"`
- `npx vitest run tests/api.spec.ts -t "agendamento"`
- `npx vitest run tests/api.spec.ts -t "checkout"`
- `npx vitest run tests/api.spec.ts -t "relatorios"`
- `npx vitest run tests/api.spec.ts -t "financial"`
- `npm test`
- `npx tsc --noEmit`
- `npm run build`
- `git diff --check`

`npm test`: 8 arquivos passaram, 1 skipped; 129 testes passaram, 19 skipped.

## 18. Smoke readonly executado

Smoke readonly por `app.inject`, com `NODE_ENV=test`, `DATA_BACKEND=memory`, `AUTH_ENFORCED=false`:

- `/health`: 200;
- `/public/services?unitId=unit-01`: 200;
- `/appointments?...`: 200.

Nao houve criacao de agendamento no smoke readonly final.

## 19. O que nao foi feito por seguranca

- Nao houve backfill.
- Nao houve seed.
- Nao houve alteracao manual de dados.
- Nao houve alteracao de catalogo.
- Nao houve alteracao de preco ou duracao.
- Nao houve checkout real.
- Nao houve venda, pagamento, comissao, refund ou lancamento financeiro real.
- Nao houve alteracao de estoque.
- Nao houve deploy.
- Nao houve restart/reload de PM2.
- Nao houve Nginx/firewall/certificado.
- Nao houve avancar para Sprint 227.

## 20. Riscos restantes

- A aplicacao foi feita apenas no banco local. Staging/producao ainda precisam de execucao controlada propria.
- Se outro ambiente estiver com codigo novo sem essa migration, pode falhar ao acessar colunas inexistentes.
- Para producao, segue obrigatorio backup, checksum, comando de restore e autorizacao explicita antes de `migrate deploy`.

## 21. PM2/restart/deploy

Nao foi necessario. Esta sprint aplicou migration local e validou codigo/testes; nao houve deploy nem restart.

## 22. Opiniao tecnica CTO

Etapa util e correta. A 226.7 deixou o contrato de codigo pronto; a 226.8 fechou o ciclo no banco local sem tocar historico. Para producao, eu nao aplicaria sem a frase de autorizacao e backup completo.

## 23. Decisao final

Migration aplicada com sucesso no alvo `LOCAL`, sem backfill, com colunas validadas e testes passando.

## 24. Proxima sprint recomendada

Planejar aplicacao controlada em staging/homologacao ou producao, conforme o proximo alvo real. Se for producao, exigir autorizacao explicita, backup PostgreSQL completo, checksum SHA-256 e comando de restore documentado.
