# Macro 235.2.1 - Reconciliacao pre-baseline em clone

Data: 2026-07-08

## Decisao

APROVADO PARA RECONCILIACAO CONTROLADA NO BANCO LOCAL PRINCIPAL.

A reconciliacao foi testada somente em clones. O banco principal `barbearia` nao recebeu SQL mutavel, `migrate resolve`, `migrate deploy`, `db push` nem smoke mutavel.

## Estado inicial

- Branch: `main`
- HEAD: `527d1e5fe07f906a01e4c1e038794534be506c94`
- Ahead/behind: `0 0`
- Worktree inicial: documentos da 235.1/235.2 nao rastreados.
- Prisma: `6.19.3`
- PostgreSQL tools: `18.3`
- Backup usado: `C:\Projetos\backups-local\software-barbearia\235_2\barbearia_before_local_pilot_20260708_022845.dump`

## Banco de referencia

- Banco: `barbearia_reference_235_2_1_20260708_023839`
- Migrations aplicadas via `prisma migrate deploy` a partir de copia temporaria fora do projeto.
- Total aplicado: `19`.

Migrations aplicadas:

1. `20260422_init`
2. `20260423_etapa7_premium`
3. `20260424_etapa8_automacoes_ia_integracoes`
4. `20260426_etapa16_service_stock_consumption`
5. `20260426_financeiro_modulo_completo`
6. `20260426_inventory_module_product_metadata`
7. `20260427_clients_manual_create_flow`
8. `20260427_services_module_complete`
9. `20260427_settings_module_complete`
10. `20260428_goals_performance_module`
11. `20260430_idempotency_constraints`
12. `20260502_audit_log_append_only`
13. `20260502_commission_expense_source`
14. `20260502_refunds_traceable`
15. `20260503_persistent_users_permissions`
16. `20260523_professional_unit_scope`
17. `20260628_service_snapshot_appointments`
18. `20260702_appointment_service_items_contract`
19. `20260703_commission_per_appointment_service_item`

## Clone restaurado

- Banco: `barbearia_reconcile_235_2_1_20260708_023939`
- Restore do backup: passou em `722 ms`.
- `_prisma_migrations`: ausente antes do baseline.
- `AppointmentBlock`: ausente antes do deploy das migrations novas.

Contagens iniciais do clone:

| Entidade | Contagem |
| --- | ---: |
| Client | 315 |
| Appointment | 99 |
| ProductSale | 111 |
| FinancialEntry | 327 |
| Product | 311 |
| StockMovement | 215 |
| AuditLog | 573 |
| User | 92 |
| Service | 332 |
| Professional | 306 |
| Unit | 326 |
| Financeiro liquido | 6125.00 |
| Estoque agregado | 374 |

As contagens bateram com o banco principal.

## Divergencias encontradas

Obrigatorias:

- Ausentes os checks de `Appointment`:
  - `Appointment_totalPriceSnapshot_check`
  - `Appointment_effectiveDurationMinSnapshot_check`
- Ausentes os checks de `AppointmentServiceItem`:
  - `AppointmentServiceItem_position_check`
  - `AppointmentServiceItem_price_check`
  - `AppointmentServiceItem_duration_check`
- Ausentes os checks de regras:
  - `ServiceCombinationRule_effectiveDurationMin_check`
  - `ServiceCombinationRuleItem_position_check`
- `FinancialEntry.updatedAt` estava `NOT NULL`, sem valores nulos, mas sem default `CURRENT_TIMESTAMP`.

Apenas nominal:

- Indice unico funcional de `StockMovement` existia com as mesmas colunas, ordem, unicidade e sem predicado, mas com nome diferente:
  - referencia: `StockMovement_unitId_productId_referenceType_referenceId_moveme`
  - clone: `StockMovement_unitId_productId_referenceType_referenceId_mo_key`

Schema adiantado:

- `BusinessSettings.bufferBetweenAppointmentsMinutes`: clone com default `0`, referencia das 19 migrations com default `10`.
- `BusinessSettings.themeMode`: clone com default `system`, referencia das 19 migrations com default `light`.

Esses defaults nao foram revertidos, pois correspondem ao estado operacional final esperado.

## SQL de reconciliacao

Arquivo criado:

- `.planning/sql/235_2_1_reconcile_prebaseline.sql`

O script:

- usa transacao;
- recusa rodar no banco principal `barbearia`;
- exige banco com nome `barbearia_reconcile_235_2_1_%`;
- exige `_prisma_migrations` ausente;
- exige `AppointmentBlock` ausente;
- valida que nao ha dados violando os checks;
- valida que `FinancialEntry.updatedAt` nao tem nulos;
- valida que o indice funcional de `StockMovement` existe;
- adiciona somente:
  - default de `FinancialEntry.updatedAt`;
  - 7 checks faltantes.

Resultado no clone: aplicado com sucesso.

## Equivalencia final

Apos o SQL, restaram somente diferencas aceitas:

- defaults adiantados de `BusinessSettings`;
- nome nominal diferente do indice unico de `StockMovement`.

Contagens, financeiro e estoque permaneceram iguais depois da reconciliacao.

## Baseline e migrations no clone

As 19 migrations verificadas foram marcadas com:

`npx prisma migrate resolve --applied <migration>`

Depois, `npx prisma migrate status` indicou somente 2 migrations pendentes:

- `20260706_macro_233_owner_operations`
- `20260706_operational_hours_and_zero_buffer`

`npx prisma migrate deploy` aplicou somente essas 2 migrations.

Status final:

- 21 migrations aplicadas em `_prisma_migrations`.
- `npx prisma migrate status`: schema em dia.
- `AppointmentBlock`: criada.

## AppointmentBlock

Validado no clone:

- tabela criada;
- colunas, enum, FKs e indices presentes;
- criacao de bloqueio: OK;
- replay idempotente: mesmo ID;
- agendamento dentro do bloqueio: rejeitado com HTTP `400`;
- cancelamento: status `CANCELLED`;
- horario liberado apos cancelamento: agendamento criado.

IDs controlados:

- Block: `e389f717-e77a-46a8-bb6a-2b5a23eb5e5f`
- Appointment apos cancelamento: `5cbc899d-123b-49d0-b800-3d14442d0292`

Um primeiro bloqueio criado durante tentativa anterior tambem foi cancelado:

- Block: `9c2efc9b-c9e6-4b5c-b5fa-4aea96b544af`

## Testes e smokes

Resultados:

- `npm test`: 22 arquivos passed, 1 skipped; 275 testes passed, 38 skipped.
- `npm run test:db`: passou em banco derivado `barbearia_reconcile_235_2_1_20260708_023939_test`; 38 testes passed.
- `npx tsc --noEmit`: passou.
- `npm run build`: passou.
- `git diff --check`: passou.
- Smoke readonly local: passou.
- Smoke mutavel local: passou.
- Validacao funcional de `AppointmentBlock`: passou.

Observacoes:

- `test:db` foi executado com `PRISMA_CLIENT_ENGINE_TYPE=binary` somente no processo, para evitar lock conhecido do Prisma no Windows.
- A API de smoke foi iniciada por `node dist/src/server.js`, nao por `npm run dev:api`, para evitar `prisma db push`.
- O smoke production com credencial local default foi recusado por 401 porque o clone nao possui `owner@barbearia.local` persistido. O smoke aprovado foi local/development com `AUTH_ENFORCED=true` e fallback local.

## Integridade final do clone

Linha base pos-migration antes de smoke:

| Entidade | Contagem |
| --- | ---: |
| Appointment | 99 |
| AppointmentBlock | 0 |
| AppointmentCheckout | 0 |
| CheckoutPayment | 0 |
| ProductSale | 111 |
| FinancialEntry | 327 |
| StockMovement | 215 |
| AuditLog | 573 |
| Financeiro liquido | 6125.00 |
| Estoque agregado | 374 |

Depois de smokes e validacao:

| Entidade | Contagem |
| --- | ---: |
| Appointment | 101 |
| AppointmentBlock | 2 |
| AppointmentCheckout | 1 |
| CheckoutPayment | 1 |
| ProductSale | 112 |
| FinancialEntry | 330 |
| StockMovement | 217 |
| AuditLog | 580 |
| Financeiro liquido | 6145.00 |
| Estoque agregado | 374 |

Diferencas esperadas:

- `+1` appointment do smoke mutavel: `a91e4576-e95b-40ef-bffe-cd389f0ae49b`.
- `+1` appointment da validacao de desbloqueio: `5cbc899d-123b-49d0-b800-3d14442d0292`.
- `+1` product sale: `a28cbf39-b5d7-499a-9507-5c785ae494e5`.
- `+1` refund: `27b25cfb-ea2b-49dc-bef7-4283b9b8462e`.
- `+3` financial entries, liquido `+20.00`.
- `+2` stock movements, estoque final preservado.
- `+2` appointment blocks, ambos `CANCELLED`.

Sem perda inesperada de clientes, produtos, usuarios, servicos, profissionais ou unidades.

## Plano para o banco principal

Nao executar automaticamente. Procedimento futuro para a Macro 235.2.2:

1. Confirmar Git limpo e sincronizado.
2. Confirmar `DATABASE_URL` local para `barbearia`, sem imprimir senha.
3. Criar backup novo de `barbearia` com `pg_dump --format=custom`.
4. Gerar SHA-256.
5. Executar `pg_restore --list`.
6. Restaurar backup em banco temporario e comparar contagens.
7. Confirmar pre-condicoes:
   - `_prisma_migrations` ausente;
   - `AppointmentBlock` ausente;
   - checks ainda ausentes;
   - `FinancialEntry.updatedAt` sem default e sem nulos;
   - defaults de `BusinessSettings` em `0` e `system`;
   - indice funcional de `StockMovement` existente.
8. Aplicar `.planning/sql/235_2_1_reconcile_prebaseline.sql` no banco principal somente apos adaptar/remover a trava de nome do banco em versao operacional aprovada, ou executar uma variante especifica da 235.2.2 com pre-condicoes equivalentes para `barbearia`.
9. Recomparar schema funcional contra referencia das 19 migrations.
10. Executar `npx prisma migrate resolve --applied` para as 19 migrations listadas neste documento.
11. Executar `npx prisma migrate status`.
12. Executar `npx prisma migrate deploy`.
13. Confirmar que somente as duas migrations de 20260706 foram aplicadas.
14. Confirmar `AppointmentBlock`.
15. Executar testes e smokes locais.
16. Comparar integridade financeira, estoque e auditoria.
17. Criar backup pos-migration e testar restore.
18. Se falhar, parar e restaurar backup validado.

## Banco principal

Conferencia final somente leitura:

- `_prisma_migrations`: ausente.
- `AppointmentBlock`: ausente.
- Contagens criticas preservadas:
  - Client: 315
  - Appointment: 99
  - ProductSale: 111
  - FinancialEntry: 327
  - StockMovement: 215
  - AuditLog: 573

## Achados

P0:

- Nenhum.

P1:

- O banco principal ainda nao foi reconciliado; a aprovacao e apenas para executar uma etapa controlada futura.
- O script atual contem trava para clones `barbearia_reconcile_235_2_1_%`. Para o banco principal, a Macro 235.2.2 deve usar variante operacional aprovada com trava equivalente para `barbearia` e backup novo.

P2:

- Smoke production com credencial default local falhou por ausencia do usuario persistido; smoke local/development com autenticao ligada passou.

## Arquivos criados ou alterados

- `.planning/sql/235_2_1_reconcile_prebaseline.sql`
- `.planning/235_2_1_RECONCILIACAO_PRE_BASELINE.md`
- `.planning/235_2_PREPARACAO_LOCAL_PILOTO.md`

## Git

Nao houve commit.

Nao houve push.

Proxima etapa:

`Macro 235.2.2 - Reconciliacao, baseline e migrations no banco local principal`
