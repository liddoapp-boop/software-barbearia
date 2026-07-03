# Sprint 229.0 - Multiplos servicos: contrato e persistencia

## Decisao

APROVADO PARA INICIAR SPRINT 229.1, condicionado ao escopo desta etapa: a fundacao de persistencia foi criada, mas multiplos servicos ainda nao foram liberados em endpoints publicos ou interface.

## Problema operacional

O agendamento antigo tinha apenas `Appointment.serviceId`. Isso bloqueava checkout futuro por item, comissao por item e snapshots historicos de varios servicos. A Sprint 229.0 adiciona a estrutura `AppointmentServiceItem[]` sem remover o contrato legado.

## Inventario do modelo antigo

- Migrations antes da nova: 17.
- `Appointment`: `id`, `unitId`, `clientId`, `professionalId`, `serviceId`, `startsAt`, `endsAt`, `status`, `isFitting`, `notes`, `serviceNameSnapshot`, `servicePriceSnapshot`, `serviceDurationMinSnapshot`, `createdAt`, `updatedAt`.
- Snapshots existentes: nome, preco e duracao do servico no proprio `Appointment`.
- `serviceId` era usado em agenda, booking publico, checkout, relatorios, performance, estoque por servico, comissao e filtros.
- Preco historico era lido de `servicePriceSnapshot` com fallback ao catalogo; duracao historica de `serviceDurationMinSnapshot` com fallback ao catalogo.
- Mutacoes que alteram servico/horario: `POST /appointments`, `PATCH /appointments/:id`, `PATCH /appointments/:id/reschedule`, booking publico.
- `BarbershopEngine` calculava `endsAt` a partir da duracao do servico e do buffer de agenda interna.

## Modelos adicionados

- `AppointmentServiceItem`: item persistente por servico do agendamento, com `position`, `serviceId`, snapshots obrigatorios de nome/preco/duracao, indices por appointment e service, unicidade por `(appointmentId, position)` e `(appointmentId, serviceId)`.
- `ServiceCombinationRule`: regra oficial por unidade, com `serviceSetKey`, label, duracao efetiva e `active`.
- `ServiceCombinationRuleItem`: servicos participantes da regra, com unicidade por `(ruleId, serviceId)`.

## Campos adicionados no Appointment

- `totalPriceSnapshot`
- `effectiveDurationMinSnapshot`
- `durationCalculationMode` (`SUM` ou `COMBINATION_RULE`)
- `durationRuleIdSnapshot`
- `durationRuleLabelSnapshot`

## Compatibilidade com serviceId

`Appointment.serviceId` permanece obrigatorio e sincronizado como ponteiro legado. Para agendamentos de um item, ele aponta para esse item. O helper `resolveLegacyPrimaryServiceId` escolhe sempre pelo menor `position`, nunca pela ordem incidental do banco.

## Backfill

A migration `20260702_appointment_service_items_contract`:

- adiciona colunas inicialmente sem `NOT NULL`;
- cria `AppointmentServiceItem` exatamente uma vez por appointment legado;
- preserva snapshots existentes e recorre ao catalogo apenas como fallback;
- preenche total, duracao efetiva e modo `SUM`;
- nao altera status ou historico;
- nao cria financeiro ou comissao;
- endurece `NOT NULL`, FKs, indices, uniques e checks apos backfill.

## Regra Corte + Barba

Foi adicionada estrutura canonica idempotente:

- IDs: `canon-svc-corte` + `canon-svc-barba`;
- duracao efetiva: 45 minutos;
- preco permanece soma dos itens;
- `serviceSetKey` gerado por SHA-256 de JSON ordenado dos IDs.

## Banco de upgrade utilizado

Teste real executado em PostgreSQL local:

- upgrade legado: `barbearia_2290_migration_test_20260703012854`;
- banco limpo: `barbearia_2290_migration_clean_test_20260703012854`.

O script `npm run test:migration:2290` aplica primeiro as 17 migrations antigas, insere fixture legada por SQL, aplica a migration nova e valida backfill. Depois aplica todas as 18 migrations em banco limpo.

## Resultado do backfill

Validado no banco isolado:

- 1 `AppointmentServiceItem` para o appointment legado;
- snapshot de preco preservado em `31.00`;
- duracao efetiva `30`;
- modo `SUM`;
- status `SCHEDULED` preservado;
- historico preservado com 1 entrada;
- zero `FinancialEntry`;
- zero `CommissionEntry`.

## Dual-write

- Memory: `OperationsService.schedule` cria item unico; `updateAppointment` troca o item unico sem deixar orfao; leituras retornam campos legados e `serviceItems`.
- Prisma: `PrismaOperationsService.schedule` cria appointment e item na mesma transacao; `updateAppointment` substitui o item unico na mesma transacao; remarcacao usa `effectiveDurationMinSnapshot`.
- Booking publico continua aceitando apenas `serviceId` e tambem grava item unico.

## Limites e adiamentos

Nao foi liberado multiselect, `serviceIds` publico, checkout composto, multiplas comissoes, estoque por multiplos itens, reembolso parcial por item ou relatorios por item.

Dependencia 229.2: `CommissionEntry` devera referenciar `appointmentServiceItemId`; a unicidade atual por appointment deve ser migrada apenas quando o checkout composto existir. A protecao atual contra comissao duplicada permanece.

## Rollback

Rollback tecnico exigiria migration reversa removendo as tabelas novas, colunas agregadas e enum. Como a migration e aditiva, a reversao operacional preferida e manter as colunas/tabelas sem uso e desabilitar leituras novas, preservando dados historicos.

## Riscos restantes

- `endsAt` ainda preserva o comportamento existente de buffer na agenda interna; `effectiveDurationMinSnapshot` representa a duracao efetiva dos servicos, usada como base para remarcacao e conflitos.
- Checkout e relatorios ainda usam o contrato legado/snapshot principal ate a Sprint 229.1/229.2.
- Bancos isolados criados pelo teste de migration foram mantidos para inspecao local.
