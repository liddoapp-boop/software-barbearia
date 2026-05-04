# 75 - Devolucoes e Estornos

Data: 2026-04-30
Objetivo: auditar suporte atual e definir desenho futuro.

## Status atual
Nao existe suporte implementado a devolucoes, trocas ou estornos.

## Checklist
| Capacidade | Existe? | Evidencia | Recomendacao |
|---|---|---|---|
| Devolver produto | Nao | Sem `Refund`/rota | Criar `POST /sales/:id/refunds` |
| Gerar transacao financeira negativa | Nao | Criacao manual exige valor positivo | Criar transacao de estorno vinculada |
| Devolver item ao estoque | Nao | `StockMovement` nao tem `REFUND` | Criar movimento `IN` por item |
| Registrar motivo | Nao | Sem entidade de refund | Motivo obrigatorio |
| Preservar venda original | Nao aplicavel | Venda existe, mas sem refund | Venda deve ser imutavel e receber status derivado |

## Desenho futuro recomendado
`Refund`: `id`, `unitId`, `productSaleId`, `appointmentId?`, `refundNumber`, `status`, `reasonCode`, `reasonText`, `totalAmount`, `paymentMethod`, `createdBy`, `createdAt`, `approvedBy?`, `completedAt?`.

`RefundItem`: `id`, `refundId`, `productSaleItemId`, `productId`, `quantity`, `unitPrice`, `amount`, `returnToStock`, `stockMovementId?`.

## Fluxo futuro
1. Receber `productSaleId`, itens, quantidades, motivo, metodo e `idempotencyKey`.
2. Validar venda original e unidade.
3. Validar quantidade devolvida acumulada <= quantidade vendida.
4. Criar `Refund` e `RefundItem`.
5. Criar `FinancialEntry` de estorno com `referenceType=REFUND`.
6. Criar `StockMovement IN` para itens retornados ao estoque.
7. Atualizar `Product.stockQty`.
8. Ajustar comissao por ledger negativo ou adjustment.
9. Atualizar status derivado da venda: `PARTIALLY_REFUNDED` ou `REFUNDED`.
10. Gravar `AuditLog` persistente com motivo.

## Problemas encontrados

### 1. Ausencia completa de devolucao
- Problema: Nao existe entidade, rota ou regra de devolucao.
- Evidencia no codigo: `prisma/schema.prisma` nao possui `Refund`; rotas em `src/http/app.ts:1218` a `src/http/app.ts:3102` nao incluem devolucao.
- Impacto: Venda errada nao pode ser corrigida de forma rastreavel.
- Risco: Caixa, estoque e comissao inconsistentes.
- Recomendacao CTO: Implementar `Refund`/`RefundItem` antes de automacoes transacionais.
- Prioridade: P0

### 2. Financeiro nao aceita estorno proprio
- Problema: Valor manual positivo e sem referencia `REFUND`.
- Evidencia no codigo: Validacao `amount <= 0` em `src/application/prisma-operations-service.ts:3367`; referencia atual so appointment/product/manual em `src/application/prisma-operations-service.ts:3378`.
- Impacto: Estorno vira despesa manual sem vinculo.
- Risco: Perda de rastreabilidade.
- Recomendacao CTO: Criar origem `REFUND` e transacao de estorno controlada.
- Prioridade: P0

### 3. Comissao nao tem reversao
- Problema: Venda devolvida nao ajusta comissao.
- Evidencia no codigo: `CommissionEntry.status` simples em `prisma/schema.prisma:436`; pagamento em `src/application/prisma-operations-service.ts:3586`.
- Impacto: Profissional pode receber comissao de venda devolvida.
- Risco: Perda financeira.
- Recomendacao CTO: Criar `CommissionAdjustment` vinculado a refund.
- Prioridade: P0

### 4. Venda original nao tem status de devolucao
- Problema: `ProductSale` nao indica devolucao parcial/total.
- Evidencia no codigo: Modelo em `prisma/schema.prisma:449` a `prisma/schema.prisma:462` nao tem `status`.
- Impacto: Listagens nao mostram venda devolvida.
- Risco: Atendimento sem contexto.
- Recomendacao CTO: Adicionar status derivado ou calculado por refunds.
- Prioridade: P1
