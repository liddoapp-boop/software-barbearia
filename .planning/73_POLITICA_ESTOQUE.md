# 73 - Politica de Estoque

Data: 2026-04-30
Objetivo: auditar se toda alteracao de estoque gera movimento.

## Modelo atual
- `Product`: `stockQty`, `minStockAlert`, preco/custo e `businessId` em `prisma/schema.prisma:328`.
- `StockMovement`: `unitId`, `productId`, `movementType`, `quantity`, `occurredAt`, `referenceType`, `referenceId`, `createdAt` em `prisma/schema.prisma:478`.
- Tipos: `IN`, `OUT`, `LOSS`, `INTERNAL_USE` em `prisma/schema.prisma:30`.

## Matriz de movimentos
| Alteracao | Movimento? | Tipo | Referencia | Evidencia |
|---|---|---|---|---|
| Entrada manual | Sim | `IN` | `ADJUSTMENT`/`INTERNAL` | `src/application/prisma-operations-service.ts:3038` |
| Saida manual | Sim | `OUT`, `LOSS`, `INTERNAL_USE` | `ADJUSTMENT`/`INTERNAL` | `src/application/prisma-operations-service.ts:3038` |
| Ajuste rapido | Sim se delta != 0 | `IN` ou `OUT` | `ADJUSTMENT` | `src/application/prisma-operations-service.ts:1972` |
| Venda de produto | Sim | `OUT` | `PRODUCT_SALE` | `src/domain/rules.ts:186`; `src/application/prisma-operations-service.ts:2624` |
| Venda no checkout | Sim | `OUT` | `PRODUCT_SALE` | `src/application/prisma-operations-service.ts:2882` |
| Consumo por servico | Sim | `OUT` | `SERVICE_CONSUMPTION` | `src/application/prisma-operations-service.ts:2496` |
| Devolucao | Nao existe | Ausente | Ausente | Sem `Refund`/`REFUND` |
| Estoque inicial | Nao comprovado | Ausente | Ausente | Cadastro recebe quantidade, mas movimento inicial nao esta formalizado |

## Regras boas
- Venda bloqueia estoque insuficiente em `src/domain/rules.ts:198`.
- Checkout revalida estoque dentro da transacao em `src/application/prisma-operations-service.ts:2883`.
- Ajuste bloqueia saldo negativo em `src/application/prisma-operations-service.ts:1937`.
- Movimento manual bloqueia saida sem saldo em `src/application/prisma-operations-service.ts:3034`.

## Politica CTO recomendada
- Todo `Product.stockQty` deve ser explicavel por ledger.
- Nenhuma alteracao de saldo deve ocorrer sem `StockMovement`.
- `StockMovement` deve registrar `createdBy`, `reason`, `balanceBefore`, `balanceAfter` e `metadata`.
- Devolucao deve gerar movimento `IN` com `referenceType=REFUND`.
- Consumo por servico deve diferenciar item critico bloqueante de item com warning.

## Problemas encontrados

### 1. Produto de venda pode nao ser filtrado por unidade
- Problema: Venda busca produtos por `id` e `active`, sem `businessId=input.unitId`.
- Evidencia no codigo: `product.findMany` em `src/application/prisma-operations-service.ts:2541` a `src/application/prisma-operations-service.ts:2543`.
- Impacto: Produto de outra unidade pode ser vendido/baixado se ID vazar.
- Risco: Integridade multi-tenant.
- Recomendacao CTO: Sempre filtrar produto por `id + businessId`.
- Prioridade: P0

### 2. Movimento manual nao valida unidade do produto
- Problema: Busca produto por ID global.
- Evidencia no codigo: `product.findUnique({ where: { id: input.productId } })` em `src/application/prisma-operations-service.ts:3022`.
- Impacto: Uma unidade pode movimentar produto de outra.
- Risco: Corrupcao de estoque multiunidade.
- Recomendacao CTO: Usar `findFirst({ id, businessId: input.unitId })` e falhar se nao pertencer a unidade.
- Prioridade: P0

### 3. Estoque inicial sem movimento obrigatorio
- Problema: Saldo pode nascer direto em `Product.stockQty`.
- Evidencia no codigo: `Product.stockQty` em `prisma/schema.prisma:335`; endpoint de criacao em `src/http/app.ts:2024`.
- Impacto: Ledger nao explica saldo inicial.
- Risco: Reconciliacao de inventario falha.
- Recomendacao CTO: Criar `StockMovement IN` na criacao quando quantidade inicial > 0.
- Prioridade: P1

### 4. Movimento nao guarda saldo antes/depois
- Problema: So guarda delta.
- Evidencia no codigo: Campos de `StockMovement` em `prisma/schema.prisma:478` a `prisma/schema.prisma:493`.
- Impacto: Auditoria exige recomputacao.
- Risco: RCA lento em divergencias.
- Recomendacao CTO: Adicionar `balanceBefore` e `balanceAfter`.
- Prioridade: P1

### 5. Devolucao nao retorna estoque
- Problema: Nao existe fluxo de devolucao.
- Evidencia no codigo: Sem `Refund`; tipos de referencia nao incluem `REFUND` em `src/domain/types.ts:348`.
- Impacto: Produto devolvido nao volta ao saldo de forma rastreavel.
- Risco: Estoque errado.
- Recomendacao CTO: Implementar `RefundItem.returnToStock` e movimento `IN`.
- Prioridade: P0
