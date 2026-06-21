# Fase 219 - Politica de comissao em estorno de atendimento

Data de inicio: 2026-06-21 UTC
Decisao final: APROVADO

## Problema

Na Fase 218, o piloto de checkout controlado foi aprovado com ressalvas porque o estorno de atendimento gerou a despesa `REFUND`, mas manteve a comissao de servico vinculada ao appointment com status `PENDING`.

Risco identificado: uma comissao de atendimento estornado poderia ser paga indevidamente.

Referencia da Fase 218:

- Agendamento: `6543a83a-f2d1-45a0-996f-59cadabb0a25`
- Cliente: `CLIENTE TESTE CHECKOUT CONTROLADO - FASE 218`
- Profissional: `Geovane Borges`
- Servico: `Barba Terapia`
- Receita: `SERVICE` de `55`
- Comissao: `22`, status `PENDING`
- Estorno: `REFUND` de `55`
- Documento: `.planning/218_PILOTO_CHECKOUT_CONTROLADO.md`

## Diagnostico

Perguntas respondidas:

1. Onde a comissao e criada no checkout?
   - No checkout de atendimento, `checkoutAppointment` chama a conclusao do atendimento e persiste `commissionEntry` quando a regra de comissao existe.
   - No backend Prisma, a criacao ocorre em `src/application/prisma-operations-service.ts`.
   - No backend em memoria, a criacao ocorre em `src/application/operations-service.ts`.

2. Onde o refund cria despesa?
   - `refundAppointment` cria `FinancialEntry` com `kind=EXPENSE`, `source=REFUND` e `referenceType=APPOINTMENT_REFUND`.

3. O refund consultava comissao vinculada ao appointment?
   - Antes desta fase, nao consultava no fluxo de appointment refund.
   - O fluxo de devolucao de produto ja tinha politica propria para cancelar comissao de produto pendente.

4. Existe status `CANCELED` ja usado?
   - Sim. `CommissionEntry.status` ja aceita `PENDING`, `PAID` e `CANCELED`.

5. Pagamento de comissao ja bloqueia `CANCELED`?
   - Sim. `markFinancialCommissionAsPaid` ja rejeita comissao `CANCELED` com `Comissao cancelada nao pode ser paga`.

## Politica implementada

### Comissao `PENDING`

Quando um atendimento estornado tem comissao de servico vinculada com status `PENDING`:

- a comissao e atualizada para `CANCELED`;
- `paidAt` permanece `null`;
- a comissao deixa de compor o total pendente;
- o endpoint de pagamento passa a rejeitar essa comissao por ja estar cancelada;
- o refund retorna `canceledCommissions` com os dados da comissao cancelada.

### Comissao `PAID`

Quando um atendimento tem comissao ja paga:

- o refund automatico e bloqueado;
- nenhuma despesa `REFUND` e criada;
- nenhum registro de refund e criado;
- a mensagem retornada e:

```text
Comissao ja paga exige ajuste manual antes do estorno
```

Motivo: evitar inconsistencia financeira sem uma politica aprovada de ajuste manual.

### Sem comissao vinculada

Quando nao existe comissao de servico vinculada ao appointment:

- o refund continua funcionando normalmente;
- a despesa `REFUND` e criada;
- `canceledCommissions` retorna vazio.

### Idempotencia

Para a mesma `idempotencyKey`:

- repetir o refund retorna o mesmo refund;
- nao duplica despesa `REFUND`;
- nao duplica alteracao de comissao;
- nao duplica auditoria da comissao cancelada.

## Auditoria

O refund continua auditado como `APPOINTMENT_REFUNDED`.

Quando uma comissao de atendimento pendente e cancelada pelo refund, a nova auditoria e:

```text
COMMISSION_CANCELED_DUE_TO_APPOINTMENT_REFUND
```

No backend Prisma, a auditoria e registrada dentro da transacao do refund.
No backend em memoria, a rota registra a auditoria apos o refund, seguindo o mesmo padrao ja usado para devolucao de produto.

## Arquivos alterados

- `src/application/prisma-operations-service.ts`
- `src/application/operations-service.ts`
- `src/http/app.ts`
- `tests/api.spec.ts`
- `tests/db.integration.spec.ts`

## Testes criados

Backend em memoria (`tests/api.spec.ts`):

- cancela comissao de atendimento pendente no estorno;
- impede pagamento posterior de comissao cancelada;
- replay do refund nao duplica efeitos;
- valida receita `SERVICE` e despesa `REFUND`;
- valida auditoria `COMMISSION_CANCELED_DUE_TO_APPOINTMENT_REFUND`;
- bloqueia estorno automatico quando a comissao ja esta `PAID`.

Backend Prisma (`tests/db.integration.spec.ts`):

- cancela comissao `PENDING` no refund de atendimento;
- mantem `paidAt` nulo;
- impede pagamento posterior;
- valida receita `SERVICE`;
- valida despesa `REFUND`;
- valida ausencia de duplicidade no replay;
- valida que comissao cancelada nao aparece como pendente;
- valida auditoria transacional;
- bloqueia refund quando a comissao ja esta `PAID`;
- mantem refund funcionando quando nao ha comissao vinculada.

## Validacoes locais parciais

Baseline antes da alteracao:

- `git status -sb`: limpo e alinhado com `origin/main`.
- `git status --short`: sem alteracoes.
- `git log --oneline -8`: ultimo commit `46cf6f0 docs: registrar piloto checkout controlado`.
- `npm run build`: passou.
- `npm test`: passou.
- `npm run test:db`: passou.
- `node --check scripts/smoke-api-readonly.mjs`: passou.

Apos implementacao:

- `npm run build`: passou.
- `npx vitest run tests/api.spec.ts -t "comissao de atendimento|estorno automatico de atendimento"`: passou.
- `RUN_DB_TESTS=1 DATA_BACKEND=prisma npx vitest run tests/db.integration.spec.ts -t "estorno de atendimento|comissao pendente"`: passou.

## Validacoes completas

Executadas antes do commit de codigo:

- `npm run build`: passou.
- `npm test`: passou, 107 testes passaram e 19 ficaram skipped.
- `npm run test:db`: passou, 19 testes de integracao Prisma passaram.
- `node --check scripts/smoke-api-readonly.mjs`: passou.
- `git diff --check`: passou.

Observacao: durante a primeira execucao completa de `npm run test:db`, um caso concorrente existente expôs erro Prisma `P2034` retornando 400. A fase incluiu ajuste de robustez no handler global para tratar `P2034` como conflito HTTP 409, e a suite completa passou em seguida.

## Deploy e teste em producao

Commit de codigo:

- `6aeef90 fix: cancelar comissao pendente em estorno de atendimento`

Deploy controlado executado em `2026-06-21 UTC`:

- `git status -sb`: limpo e alinhado com `origin/main`.
- `git status --short`: sem alteracoes.
- `git pull --ff-only origin main`: already up to date.
- `npx prisma migrate status`: schema em dia; nenhuma migration aplicada.
- `npm run build`: passou.
- `pm2 restart software-barbearia --update-env`: processo `software-barbearia` reiniciado e online.
- `pm2 status`: `software-barbearia` online.
- `curl -sS https://barbearia.76-13-161-250.nip.io/health`: `{"ok":true,"authEnforced":true}`.
- `npm run smoke:api:readonly`: passou.

Teste controlado em producao:

- Ambiente: `https://barbearia.76-13-161-250.nip.io`
- Cliente fake: `CLIENTE TESTE COMISSAO ESTORNO - FASE 219`
- Telefone fake: `00000021900`
- Unidade: `unit-01`
- Servico: `svc-barba` / `Barba Terapia`
- Profissional: `pro-01` / `Geovane Borges`
- Agendamento: `bbc7aa3c-f275-480d-9d66-54846f9f1c26`
- Horario: `2026-06-22T12:00:00.000Z`
- Status percorrido: `SCHEDULED -> CONFIRMED -> IN_SERVICE -> COMPLETED`

Resultado financeiro:

- Receita `SERVICE`: `92895cdc-66d0-46dd-8f56-8aa28a3b4156`, valor `55`, appointment `bbc7aa3c-f275-480d-9d66-54846f9f1c26`.
- Refund: `3be1a961-4b96-4ce9-8d86-d38a2ddcba6b`.
- Despesa `REFUND`: `f9c63b28-172d-448b-b34b-7e30e56b3d33`, valor `55`, `referenceType=APPOINTMENT_REFUND`, notes com `appointmentId=bbc7aa3c-f275-480d-9d66-54846f9f1c26`.

Resultado da comissao:

- Comissao: `d674b9f1-23b9-4075-9d44-3713b0e1e112`.
- Valor: `22`.
- Status inicial: `PENDING`.
- Status final apos refund: `CANCELED`.
- `paidAt`: `null`.
- Tentativa de pagamento apos cancelamento: HTTP `400`, mensagem `Comissao cancelada nao pode ser paga`.

Auditoria em producao:

- `APPOINTMENT_REFUNDED`: `967c08a8-c7cb-465e-9dee-7e871c1a5b1e`.
- `COMMISSION_CANCELED_DUE_TO_APPOINTMENT_REFUND`: `e08ae373-8b76-407a-8123-548c3c554918`.

Observacao de idempotencia em producao:

- O refund foi executado uma vez com sucesso.
- Um replay manual posterior reutilizou a mesma `idempotencyKey` com `refundedAt` diferente e retornou HTTP `409` por payload diferente, comportamento esperado do contrato de idempotencia.
- O replay com payload identico foi validado nas suites automatizadas local e Prisma, sem duplicar despesa, comissao ou auditoria.

Smoke e logs finais:

- Health final: `{"ok":true,"authEnforced":true}`.
- `npm run smoke:api:readonly`: passou.
- `pm2 logs software-barbearia --lines 160 --nostream`: error log vazio; sem crash, loop, erro Prisma critico ou 500 repetido. Os status observados foram os esperados pelo teste (`409` de idempotency key com payload diferente e `400` ao tentar pagar comissao cancelada).

## Riscos restantes

- Esta fase bloqueia estorno automatico com comissao `PAID`; ainda falta definir uma politica operacional para ajuste manual controlado de comissoes ja pagas.
- O comportamento de cancelamento automatico foi aplicado somente a comissao de servico ligada ao appointment estornado.

## Garantias de escopo

Nao houve:

- migration;
- seed;
- alteracao de `.env`;
- impressao de segredo no relatorio final;
- alteracao manual em banco;
- uso de cliente real;
- venda real de produto;
- devolucao real de produto;
- estorno de atendimento real;
- force push;
- rebase;
- `git reset --hard`.

## Decisao final

`APROVADO`

Motivo: a politica definida foi implementada, testada localmente em memoria e Prisma, publicada sem migration, e validada em producao controlada com cliente fake. O refund de atendimento com comissao pendente criou a despesa `REFUND`, cancelou a comissao para `CANCELED`, manteve `paidAt` nulo, bloqueou pagamento posterior e registrou auditoria propria.

## Proxima etapa recomendada

Definir uma fase operacional pequena para regularizacao manual de atendimentos estornados com comissao ja `PAID`, incluindo permissao, auditoria e lancamento financeiro de ajuste quando aplicavel.
