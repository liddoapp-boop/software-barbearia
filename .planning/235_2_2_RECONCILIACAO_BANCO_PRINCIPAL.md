# Macro 235.2.2 - Reconciliacao, baseline e migrations no banco principal

Data: 2026-07-08

## Decisao

BANCO LOCAL PRINCIPAL PREPARADO PARA CONFIGURACAO DOS DADOS DO PILOTO.

O banco local principal `barbearia` foi reconciliado, recebeu baseline das 19 migrations antigas e aplicou as 2 migrations pendentes. Nenhuma VPS, producao ou banco remoto foi acessado.

## Git e documentacao inicial

Antes de alterar o banco, foi criado e publicado o commit documental:

- Commit: `233186807dcd3a4f1bed0acc1a9b6cd9b1a9fbcf`
- Mensagem: `docs: registrar reconciliação pré-baseline do banco local`
- Push: normal para `origin/main`
- Ahead/behind apos push: `0 0`
- Worktree antes do banco: limpo

## Banco-alvo

- Host: `localhost`
- Porta: `5432`
- Banco: `barbearia`
- Usuario tecnico: mascarado
- `_prisma_migrations` antes: ausente
- `AppointmentBlock` antes: ausente
- Conexao observada: local

Contagens antes da alteracao:

| Entidade | Contagem |
| --- | ---: |
| Client | 315 |
| Appointment | 99 |
| ProductSale | 111 |
| CheckoutPayment | ausente |
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

## Backup anterior

Backup pre-alteracao:

- Arquivo: `C:\Projetos\backups-local\software-barbearia\235_2_2\barbearia_before_235_2_2_20260708_025704.dump`
- Lista: `C:\Projetos\backups-local\software-barbearia\235_2_2\barbearia_before_235_2_2_20260708_025704.list.txt`
- Tamanho: `499430` bytes
- SHA-256: `93F47938510EA2152742844139DCB82EA01C98964B51DF5BBEF4FFCE9F782A35`
- `pg_dump`: `18.3`
- `pg_restore --list`: passou, 317 linhas.
- Restore de verificacao: passou em `barbearia_pre_235_2_2_20260708_025704`.
- Contagens, financeiro e estoque do restore: equivalentes ao principal.

## Reconciliacao

Precondicoes confirmadas:

- checks de reconciliacao ainda ausentes;
- dados atuais nao violavam os checks;
- `FinancialEntry.updatedAt` sem default e sem nulos;
- `BusinessSettings.bufferBetweenAppointmentsMinutes` com default `0`;
- `BusinessSettings.themeMode` com default `system`;
- indice unico funcional de `StockMovement` presente;
- `_prisma_migrations` e `AppointmentBlock` ausentes.

SQL executado:

- `.planning/sql/235_2_2_reconcile_main_prebaseline.sql`

Esse arquivo e a variante operacional da 235.2.1 para `barbearia`. A logica de reconciliacao foi mantida; a trava de banco foi ajustada para recusar qualquer banco diferente de `barbearia`.

Objetos adicionados:

- Default `CURRENT_TIMESTAMP` em `FinancialEntry.updatedAt`.
- `Appointment_totalPriceSnapshot_check`.
- `Appointment_effectiveDurationMinSnapshot_check`.
- `AppointmentServiceItem_position_check`.
- `AppointmentServiceItem_price_check`.
- `AppointmentServiceItem_duration_check`.
- `ServiceCombinationRule_effectiveDurationMin_check`.
- `ServiceCombinationRuleItem_position_check`.

Resultado:

- SQL executado em transacao.
- 7 constraints criadas.
- Default criado.
- Contagens, financeiro e estoque inalterados.

## Baseline

Foram marcadas como aplicadas as 19 migrations validadas na Macro 235.2.1:

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

`npx prisma migrate status` apos baseline indicou somente as duas migrations esperadas pendentes:

- `20260706_macro_233_owner_operations`
- `20260706_operational_hours_and_zero_buffer`

## Migrations aplicadas

`npx prisma migrate deploy` aplicou somente:

- `20260706_macro_233_owner_operations`
- `20260706_operational_hours_and_zero_buffer`

Status final:

- `npx prisma migrate status`: schema em dia.
- `_prisma_migrations`: 21 migrations aplicadas.
- Migrations falhas: 0.
- `AppointmentBlock`: presente.

## AppointmentBlock

Estrutura validada:

- tabela presente;
- colunas e defaults aderentes ao schema;
- enum `AppointmentBlockStatus`: `ACTIVE,CANCELLED`;
- PK presente;
- FKs para `Unit` e `Professional`;
- indices esperados presentes.

Cenario funcional:

- Criacao de bloqueio: OK.
- Replay idempotente: mesmo registro.
- Agendamento dentro do bloqueio: rejeitado com HTTP `400`.
- Cancelamento: status `CANCELLED`.
- Horario liberado apos cancelamento: agendamento criado.

IDs controlados:

- Block: `77bab20f-9d1d-4252-b3e8-c19af3a7b2a1`
- Appointment apos cancelamento: `cd78dc2f-f0c7-4ca3-8557-e303d4a83d84`

## Testes e smokes

Resultados:

- `npm test`: 22 arquivos passed, 1 skipped; 275 testes passed, 38 skipped.
- `npm run test:db`: 1 arquivo passed; 38 testes passed em `barbearia_test`.
- `npx tsc --noEmit`: passou.
- `npm run build`: passou.
- `git diff --check`: passou.
- Smoke readonly local: passou.
- Smoke mutavel local: passou.

Observacoes:

- `PRISMA_CLIENT_ENGINE_TYPE=binary` foi usado somente no processo do `test:db`, por lock conhecido do Prisma no Windows.
- A API dos smokes foi iniciada por `node dist/src/server.js`, nao por `npm run dev:api`, para evitar `prisma db push`.
- Smokes usaram URL local `http://127.0.0.1:3338`.

IDs do smoke mutavel:

- Appointment: `5c1e5699-5299-411d-a1d0-2389c190ff21`
- ProductSale: `7394331c-2309-402c-bddf-a015a7675720`
- Refund: `97e5f588-314e-4093-bd98-c6921334a1bd`
- Financial entries:
  - `b8d3e565-7cad-4acf-ae0f-05f63b4360c8`
  - `07412857-d6ab-49e3-85f5-3c88e1d51a86`
  - `ff18a28b-b64c-435e-9912-0106de7b5194`
- Stock movements:
  - `946afd5a-fafe-4bee-8c45-49071ce536d2`
  - `12b57916-eaf0-45a4-bf3b-016d441660ba`

## Integridade final

Contagens finais:

| Entidade | Antes | Depois | Diferenca |
| --- | ---: | ---: | ---: |
| Client | 315 | 315 | 0 |
| Appointment | 99 | 101 | +2 controlado |
| ProductSale | 111 | 112 | +1 smoke |
| CheckoutPayment | ausente | 1 | +1 smoke |
| FinancialEntry | 327 | 330 | +3 smoke |
| Product | 311 | 311 | 0 |
| StockMovement | 215 | 217 | +2 venda/refund |
| AuditLog | 573 | 580 | +7 validacao/smoke |
| User | 92 | 92 | 0 |
| Service | 332 | 332 | 0 |
| Professional | 306 | 306 | 0 |
| Unit | 326 | 326 | 0 |
| AppointmentBlock | ausente | 1 | +1 cancelado |
| AppointmentCheckout | ausente | 1 | +1 smoke |

Somatorios:

- Financeiro liquido antes: `6125.00`
- Financeiro liquido depois: `6145.00`
- Diferenca: `+20.00`, explicada pelo atendimento do smoke.
- Estoque agregado antes: `374`
- Estoque agregado depois: `374`
- Diferenca: `0`, venda e refund compensaram.

Nao houve perda inesperada. Auditoria foi preservada e recebeu eventos controlados.

## Backup posterior

Backup pos-migration:

- Arquivo: `C:\Projetos\backups-local\software-barbearia\235_2_2\barbearia_after_235_2_2_20260708_030433.dump`
- Lista: `C:\Projetos\backups-local\software-barbearia\235_2_2\barbearia_after_235_2_2_20260708_030433.list.txt`
- Tamanho: `530298` bytes
- SHA-256: `57617875E511FF78AD47C3858E1BE063C030F0534A163672DEB864C77C4032BF`
- `pg_restore --list`: passou, 367 linhas.
- Restore de verificacao: passou em `barbearia_after_check_235_2_2_20260708_030433`.
- Restore confirmou:
  - 21 migrations aplicadas;
  - 0 migrations falhas;
  - `AppointmentBlock` presente;
  - contagens equivalentes;
  - financeiro `6145.00`;
  - estoque `374`;
  - auditoria `580`.

Os bancos temporarios de verificacao foram removidos. Os dumps permanecem fora do repositorio.

## Achados

P0:

- Nenhum.

P1:

- Nenhum tecnico aberto para migrations/baseline/recuperacao local.

P2:

- O smoke local usou fallback de usuario de desenvolvimento porque o owner real persistido ainda precisa ser definido na proxima macro.
- O banco agora contem registros controlados de validacao/smoke, que devem ser considerados no plano de limpeza futura por IDs.

## Git

Nao houve commit deste documento ainda no momento do registro. Deve ser commitado somente apos revisao final:

`docs: registrar preparação do banco local principal`

## Proxima etapa

`Macro 235.3 - Configuracao dos dados reais da Barbearia Geovane Borges`
