# 74 - Politica Financeira

Data: 2026-04-30
Objetivo: auditar campos financeiros e politica de transacoes.

## Checklist de transacao financeira
| Campo | Existe? | Evidencia | Observacao |
|---|---|---|---|
| id | Sim | `prisma/schema.prisma:405` | UUID tecnico |
| tipo | Sim | `kind` em `prisma/schema.prisma:407` | `INCOME`/`EXPENSE` |
| origem | Parcial | `source` em `prisma/schema.prisma:408` | So `SERVICE`/`PRODUCT`; manual vira null |
| referencia | Parcial | `referenceType/referenceId` em `prisma/schema.prisma:413` | Texto livre, sem FK |
| valor | Sim | `amount` em `prisma/schema.prisma:411` | Manual exige positivo |
| metodo de pagamento | Parcial | `paymentMethod` em `prisma/schema.prisma:410` | Pode ser null/NAO_INFORMADO |
| status | Nao | Ausente | Gap P0 |
| createdBy | Nao | Ausente | Gap P0 |
| createdAt | Sim | `createdAt` em `prisma/schema.prisma:419` | OK |

## Origens atuais
- Servico: `buildServiceRevenueEntry` em `src/domain/rules.ts:140`, persistido como `referenceType=APPOINTMENT`.
- Produto: `buildProductRevenueEntry` em `src/domain/rules.ts:163`, persistido como `referenceType=PRODUCT_SALE`.
- Manual: `createFinancialTransaction` em `src/application/prisma-operations-service.ts:3351`.
- Comissao paga: nao cria despesa financeira.
- Devolucao: ausente.

## Politica CTO recomendada
- Adicionar `status`: `PENDING`, `CONFIRMED`, `VOIDED`, `REFUNDED`, `FAILED`.
- Adicionar `createdBy`, `updatedBy`, `voidedBy`, `voidReason`.
- Criar `FinancialEntry`/`FinancialTransaction` de despesa ao pagar comissao.
- Proibir edicao destrutiva de receitas automaticas; corrigir com estorno.
- Formalizar referencias para `appointmentId`, `productSaleId`, `commissionId`, `refundId`.

## Problemas encontrados

### 1. Status financeiro ausente
- Problema: `FinancialEntry` nao distingue confirmado, pendente, cancelado ou estornado.
- Evidencia no codigo: Modelo em `prisma/schema.prisma:404` a `prisma/schema.prisma:424`.
- Impacto: Relatorios misturam estados diferentes.
- Risco: Caixa e DRE incorretos.
- Recomendacao CTO: Adicionar `status` e filtrar relatorios por status valido.
- Prioridade: P0

### 2. `createdBy` nao persiste
- Problema: O ator chega no request, mas nao e gravado no financeiro.
- Evidencia no codigo: Hook injeta `createdBy/changedBy` em `src/http/app.ts:1162`; `createFinancialTransaction` recebe `changedBy` em `src/application/prisma-operations-service.ts:3365`, mas nao salva.
- Impacto: Nao ha responsabilizacao persistente.
- Risco: Auditoria financeira fraca.
- Recomendacao CTO: Adicionar `createdBy` com futura FK para `User`.
- Prioridade: P0

### 3. Pagamento de comissao nao reduz caixa
- Problema: Apenas marca comissao como paga.
- Evidencia no codigo: `CommissionEntry.update` em `src/application/prisma-operations-service.ts:3586`.
- Impacto: Fluxo de caixa nao registra saida.
- Risco: Lucro superestimado.
- Recomendacao CTO: Criar despesa financeira atomica ao pagar comissao.
- Prioridade: P0

### 4. Devolucao financeira ausente
- Problema: Nao ha transacao negativa/refund.
- Evidencia no codigo: `FinancialKind` so tem `INCOME` e `EXPENSE` em `prisma/schema.prisma:20`; nao ha `Refund`.
- Impacto: Estornos virariam lancamentos manuais sem vinculo.
- Risco: Conciliacao fraca.
- Recomendacao CTO: Criar origem `REFUND` e transacao de estorno vinculada.
- Prioridade: P0

### 5. Referencia financeira sem integridade
- Problema: `referenceType/referenceId` sao strings livres.
- Evidencia no codigo: `prisma/schema.prisma:413` a `prisma/schema.prisma:414`.
- Impacto: Pode apontar para registro inexistente.
- Risco: Lancamentos orfaos.
- Recomendacao CTO: Adicionar FKs opcionais por origem ou tabela de evento financeiro.
- Prioridade: P1
