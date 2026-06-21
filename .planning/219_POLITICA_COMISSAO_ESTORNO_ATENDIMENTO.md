# Fase 219 - Politica de comissao em estorno de atendimento

Data de inicio: 2026-06-21 UTC
Decisao final: em validacao pos-deploy

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

Pendente apos commit e push de codigo.

## Riscos restantes

- Esta fase bloqueia estorno automatico com comissao `PAID`; ainda falta definir uma politica operacional para ajuste manual controlado de comissoes ja pagas.
- O comportamento de cancelamento automatico foi aplicado somente a comissao de servico ligada ao appointment estornado.

## Decisao final

Pendente ate concluir validacao completa, deploy controlado e teste controlado em producao.
