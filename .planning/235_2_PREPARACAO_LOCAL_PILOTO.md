# Macro 235.2 - Preparacao local do piloto

Data: 2026-07-08

## Decisao

BLOQUEADO.

O Gate A passou: Git local estava em `main`, sincronizado com `origin/main`, o banco confirmado foi `barbearia` local em `localhost:5432`, foi criado backup logico novo fora do repositorio, o catalogo do dump foi lido por `pg_restore --list` e o restore preflight em banco temporario conferiu as contagens criticas.

O Gate B bloqueou o baseline. A comparacao estrutural entre o banco principal `barbearia` e um banco temporario criado com as 19 migrations candidatas antigas encontrou divergencias relevantes. Por isso, nenhuma migration foi marcada como aplicada no banco principal e `npx prisma migrate deploy` nao foi executado.

Resultado correto da macro neste ponto:

`BLOQUEADO - BASELINE NAO EXECUTADO POR DIVERGENCIA ESTRUTURAL`

## Estado inicial

- Branch: `main`
- HEAD inicial: `527d1e5fe07f906a01e4c1e038794534be506c94`
- Ahead/behind apos `git fetch origin`: `0 0`
- Worktree inicial: somente `.planning/235_1_ENSAIO_BANCO_PILOTO.md` nao rastreado, esperado pela macro.
- PostgreSQL tools: `18.3`
- Banco alvo confirmado: `barbearia`
- Host/porta: `localhost:5432`
- Usuario tecnico: mascarado
- Nenhuma VPS foi acessada.

## Ambiente local

- PostgreSQL local: confirmado.
- Banco: `barbearia`.
- Tamanho: `17 MB`.
- Tabelas publicas antes da macro: `43`.
- Timezone: `America/Sao_Paulo`.
- `_prisma_migrations`: ausente.
- `AppointmentBlock`: ausente.
- Conexao ativa observada: local (`::1`).
- Espaco livre em `C:`: cerca de `77.82 GB`.

Observacao de seguranca local: a porta PostgreSQL aparece escutando em `0.0.0.0` e `::`. As conexoes observadas eram locais, mas o bind amplo deve ser revisto antes de qualquer exposicao real.

## Backup pre-alteracao

- Arquivo: `C:\Projetos\backups-local\software-barbearia\235_2\barbearia_before_local_pilot_20260708_022845.dump`
- Lista do catalogo: `C:\Projetos\backups-local\software-barbearia\235_2\barbearia_before_local_pilot_20260708_022845.list.txt`
- Formato: custom (`pg_dump --format=custom`)
- Tamanho: `499430` bytes
- SHA-256: `45A049D98E9C646A574FC99FDB91D4F8123EBAD82D8A80A4B196BC5473C73EDC`
- Duracao do backup: `440 ms`
- `pg_restore --list`: passou, com tabelas e dados principais presentes.

## Restore preflight

- Banco temporario: `barbearia_preflight_235_2_20260708_022907`
- Restore: passou em `822 ms`.
- Comparacao com `barbearia`: equivalente para contagens criticas e somatorios.

Contagens conferidas:

| Entidade | Principal | Restore |
| --- | ---: | ---: |
| Client | 315 | 315 |
| Appointment | 99 | 99 |
| ProductSale | 111 | 111 |
| FinancialEntry | 327 | 327 |
| Product | 311 | 311 |
| StockMovement | 215 | 215 |
| AuditLog | 573 | 573 |
| User | 92 | 92 |
| Service | 332 | 332 |
| Professional | 306 | 306 |
| Unit | 326 | 326 |
| Financeiro liquido | 6125.00 | 6125.00 |
| Estoque agregado | 374 | 374 |

## Inventario de migrations

Total em `prisma/migrations`: `21`.

Ordem:

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
20. `20260706_macro_233_owner_operations`
21. `20260706_operational_hours_and_zero_buffer`

`npx prisma migrate status` no banco principal confirmou 21 migrations pendentes, porque `_prisma_migrations` esta ausente.

## Matriz de baseline

Banco temporario usado como referencia estrutural: `barbearia_expected_235_2_20260708_023000`, criado pela aplicacao das 19 migrations candidatas em banco vazio.

| Migration | Estruturas principais esperadas | Resultado |
| --- | --- | --- |
| `20260422_init` a `20260628_service_snapshot_appointments` | Tabelas base, modulos premium, financeiro, estoque, usuarios, auditoria, refunds, escopo profissional e snapshots | EQUIVALENTE COM RESSALVA |
| `20260702_appointment_service_items_contract` | `AppointmentServiceItem`, regras de combinacao, colunas de snapshot e checks de integridade | NAO EQUIVALENTE |
| `20260703_commission_per_appointment_service_item` | Vinculo de comissao por item de servico e indice de venda por agendamento | EQUIVALENTE COM RESSALVA |
| `20260706_macro_233_owner_operations` | `AppointmentBlock`, checkout, pagamento, contagem de estoque e fechamento diario | NAO VERIFICADA PARA BASELINE; deve ser aplicada por deploy apos baseline valido |
| `20260706_operational_hours_and_zero_buffer` | Default operacional de buffer `0` | Ja refletido fisicamente no banco, mas nao deve ser baselined sem resolver as divergencias anteriores |

Divergencias relevantes encontradas:

- Ausentes no banco principal os checks:
  - `Appointment_totalPriceSnapshot_check`
  - `Appointment_effectiveDurationMinSnapshot_check`
  - `AppointmentServiceItem_position_check`
  - `AppointmentServiceItem_price_check`
  - `AppointmentServiceItem_duration_check`
  - `ServiceCombinationRule_effectiveDurationMin_check`
  - `ServiceCombinationRuleItem_position_check`
- Default de `FinancialEntry.updatedAt` ausente no banco principal, esperado como `CURRENT_TIMESTAMP` pela migration antiga.
- Defaults de `BusinessSettings` diferem do banco temporario das 19 migrations:
  - `bufferBetweenAppointmentsMinutes`: principal `0`, temporario `10`.
  - `themeMode`: principal `system`, temporario `light`.
- O indice unico de `StockMovement` existe com nome fisico diferente. A estrutura e equivalente, mas o nome diverge.

Dados atuais conferidos contra os checks ausentes:

- Agendamentos com `totalPriceSnapshot < 0`: `0`.
- Agendamentos com `effectiveDurationMinSnapshot <= 0`: `0`.
- Itens com posicao negativa: `0`.
- Itens com preco negativo: `0`.
- Itens com duracao invalida: `0`.
- Regras com duracao invalida: `0`.
- Itens de regra com posicao negativa: `0`.

Mesmo com dados compativeis, as constraints ausentes tornam a migration `20260702_appointment_service_items_contract` nao equivalente. O baseline foi bloqueado.

## Acoes nao executadas

Por bloqueio no Gate B, nao foram executados:

- `npx prisma migrate resolve --applied ...`
- `npx prisma migrate deploy`
- `npx prisma migrate status` pos-deploy
- validacao funcional de `AppointmentBlock`
- smokes no banco principal atualizado
- alteracao de dados reais do piloto
- limpeza de dados antigos
- backup pos-migration
- commits
- push

## Integridade antes do bloqueio

O banco principal nao recebeu alteracao de baseline, migration ou dados de negocio.

Contagens antes do bloqueio:

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
| AppointmentBlock | ausente |

Somatorios:

- Financeiro liquido: `6125.00`
- Estoque agregado: `374`
- Pagamentos pendentes: tabela ausente antes das migrations novas.

## Dados reais do piloto

Auditoria somente leitura:

| Item | Status | Observacao |
| --- | --- | --- |
| Estabelecimento `Barbearia Geovane Borges` | AUSENTE | Nenhuma `Unit` ou `BusinessSettings` com esse nome. |
| Unidade `unit-01` | INCONSISTENTE | Nome atual: `Unidade Teste`. |
| Telefone publico | AUSENTE | `BusinessSettings` de `unit-01` sem telefone preenchido. |
| Timezone | PRONTO | Unidades em `America/Sao_Paulo`. |
| Owner ativo | PRONTO COM RESSALVA | 23 usuarios com role `owner` ativos e 23 vinculos ativos; precisa confirmar qual sera usado no piloto. |
| Profissional Geovane | PRONTO | 1 profissional ativo com nome Geovane, vinculado a `unit-01`. |
| Horarios | PRECISA DE CONFIRMACAO | Existem 154 registros de `BusinessHour`; validar quais sao reais para o piloto. |
| Servicos | PRECISA DE CONFIRMACAO | 331 servicos ativos; nao inventar nomes, precos ou duracoes. |
| Produtos | PRECISA DE CONFIRMACAO | 311 produtos ativos; estoque/minimo precisam validacao humana. |
| Pagamentos | PRONTO COM RESSALVA | 4 formas ativas; confirmar se sao realmente aceitas. |
| Booking publico | BLOQUEADOR | Marca publica ainda nao bate com `Barbearia Geovane Borges`. |

Perguntas pendentes para o usuario:

1. Qual usuario owner real deve ser usado no piloto?
2. A unidade `unit-01` e de fato a unidade do Geovane?
3. Quais telefone publico, horarios reais, servicos, precos, duracoes, produtos e formas de pagamento devem ser publicados?

## Dados de teste e dry-run

Padroes buscados: `TESTE`, `VALIDACAO`, `VALIDACAO` acentuado, `MACRO`, `SEED`, `DEMO`, `SMOKE`, `CONTROLADO`, `RETESTE`.

Resultado somente leitura no banco principal:

| Entidade | Suspeitos |
| --- | ---: |
| Client | 3 |
| Appointment | 1 |

Classificacao:

- Categoria A: nenhum registro criado por esta execucao, porque nao houve smoke mutavel nem validacao funcional.
- Categoria B: clientes/agendamento suspeitos antigos; nao excluir sem aprovacao humana por ID.
- Categoria C: demais usuarios, servicos, produtos, profissionais, unidades, financeiro, estoque e auditoria; preservar ate haver origem comprovada.

Plano de limpeza futura:

1. Exportar IDs suspeitos.
2. Validar dependencias financeiras, estoque e auditoria por ID.
3. Gerar backup novo.
4. Executar remocao somente por IDs aprovados, em transacao.
5. Comparar contagens e somatorios.
6. Rollback se qualquer diferenca inesperada aparecer.

Nao foi executado nenhum `DELETE`.

## Seguranca local

Achados:

- P1: default credentials de desenvolvimento existem em codigo de fallback e scripts de smoke; ha testes de hardening para impedir uso inseguro em producao, mas o piloto real nao deve depender desses defaults.
- P1: Postgres local escuta em `0.0.0.0` e `::`; revisar bind/firewall antes de qualquer uso exposto.
- P1: tokens de sessao sao persistidos no `localStorage` no frontend atual; aceitavel para o escopo local, mas deve ter plano de hardening antes de ambiente exposto.
- P2: scripts de smoke imprimem usuario/unidade de smoke, mas nao imprimem senha; manter credenciais reais fora de logs.
- OK: `.env` nao esta versionado; `git ls-files` retornou somente `.env.example`.
- OK: nao foram impressas connection strings completas nem senhas nesta execucao.

Correcoes executadas: nenhuma. O bloqueio principal e de schema/baseline, e nao foi seguro misturar hardening nesta macro.

## Achados

P0:

- Nenhum.

P1:

- Baseline bloqueado por migration antiga nao equivalente: checks de `20260702_appointment_service_items_contract` ausentes e default de `FinancialEntry.updatedAt` divergente.
- Dados minimos do piloto nao estao prontos: marca `Barbearia Geovane Borges` ausente e `unit-01` ainda aparece como `Unidade Teste`.
- Booking publico bloqueado ate confirmacao/correcao dos dados reais.
- Postgres local com bind amplo.
- Credenciais default de desenvolvimento ainda presentes como fallback/scripts; nao usar em piloto real.

P2:

- Nome fisico de indice de `StockMovement` diverge, mas a estrutura logica parece equivalente.
- Defaults de `BusinessSettings` ja refletem valores operacionais mais recentes; registrar no plano de reconciliacao.

## Proxima acao recomendada

Preparar uma macro curta de reconciliacao de schema antes da 235.2 continuar:

1. criar migration ou script controlado para adicionar somente as constraints/checks ausentes e o default faltante;
2. testar em clone restaurado do backup `235_2`;
3. comparar novamente a matriz das 19 migrations;
4. somente depois executar baseline e deploy no banco principal.

Nao iniciar VPS, piloto, limpeza ou deploy enquanto este bloqueio estiver aberto.

## Atualizacao - Macro 235.2.1

Data: 2026-07-08

A reconciliacao pre-baseline foi executada somente em clones e aprovada para uma etapa futura controlada no banco local principal.

Resultado:

- Banco de referencia com 19 migrations antigas: criado e validado.
- Clone restaurado do backup `235_2`: criado e validado.
- SQL de reconciliacao: `.planning/sql/235_2_1_reconcile_prebaseline.sql`.
- SQL aplicado somente no clone.
- Baseline das 19 migrations: passou no clone.
- `migrate deploy`: aplicou somente `20260706_macro_233_owner_operations` e `20260706_operational_hours_and_zero_buffer`.
- `AppointmentBlock`: criada e validada.
- Testes, build, smoke readonly e smoke mutavel: passaram no clone.
- Banco principal `barbearia`: preservado, ainda sem `_prisma_migrations` e sem `AppointmentBlock`.

Documento detalhado:

- `.planning/235_2_1_RECONCILIACAO_PRE_BASELINE.md`

Nova proxima acao:

`Macro 235.2.2 - Reconciliacao, baseline e migrations no banco local principal`
