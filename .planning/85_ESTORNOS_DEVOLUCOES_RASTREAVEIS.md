# 85 - Estornos e devolucoes rastreaveis

Data: 2026-05-02
Fase: 0.2.2
Status: IMPLEMENTADA

## Objetivo da fase
Implementar estornos/devolucoes rastreaveis sem apagar ou sobrescrever lancamentos originais.

## Diagnostico do problema
- Atendimentos concluidos geravam receita de servico, mas nao havia fluxo formal de estorno.
- Vendas de produto geravam receita e `StockMovement OUT`, mas nao havia devolucao parcial/total com retorno de estoque.
- O financeiro ja era usado como ledger operacional, entao desfazer uma operacao por edicao ou exclusao destruiria rastreabilidade.

## Regra de nao apagar registros originais
- A receita original de servico/produto permanece intacta.
- O movimento original de estoque `OUT` permanece intacto.
- Todo estorno/devolucao cria um novo registro `Refund` e um novo `FinancialEntry EXPENSE`.
- Devolucao de produto cria tambem novo `StockMovement IN`.

## Endpoints criados
- `POST /appointments/:id/refund`
- `POST /sales/products/:id/refund`

Ambos exigem `idempotencyKey` via body ou header e retornam `400` com:
`idempotencyKey é obrigatória para esta operação`.

## Modelo financeiro adotado
- Criado `Refund` como cabecalho rastreavel, com `appointmentId` ou `productSaleId`, motivo, ator, data e valor total.
- Criado `RefundItem` para devolucoes de produto.
- Expandido `RevenueSource` do Prisma com `REFUND`.
- Estorno de servico gera:
  - `kind=EXPENSE`
  - `source=REFUND`
  - `category=ESTORNO_SERVICO`
  - `referenceType=APPOINTMENT_REFUND`
  - `referenceId=<refundId>`
- Devolucao de produto gera:
  - `kind=EXPENSE`
  - `source=REFUND`
  - `category=DEVOLUCAO_PRODUTO`
  - `referenceType=PRODUCT_SALE_REFUND`
  - `referenceId=<refundId>`

`FinancialEntry.referenceType` continua texto livre no Prisma. A decisao foi manter essa convencao controlada nesta fase e usar `Refund` como entidade formal de rastreabilidade.

## Modelo de estoque adotado
- Devolucao de produto cria `StockMovement IN` por item devolvido.
- O movimento usa `referenceType=PRODUCT_REFUND` e `referenceId=<refundId>`.
- O saldo do produto e incrementado na mesma operacao.
- A venda original e o movimento `PRODUCT_SALE OUT` nao sao removidos.

## Comportamento idempotente
- Mesma chave e mesmo payload retornam replay sem duplicar `Refund`, `FinancialEntry` ou `StockMovement`.
- Mesma chave com payload diferente retorna `409`.
- Ausencia de chave retorna `400` antes de efeitos colaterais.
- Backend Prisma usa `IdempotencyRecord` transacional.
- Backend em memoria usa o mapa de idempotencia existente.

## Testes adicionados
Em `tests/api.spec.ts`:
- Estorno de atendimento concluido cria despesa reversa.
- Receita original de servico permanece listada.
- Summary/listagem financeira refletem o estorno.
- Replay de estorno nao duplica financeiro.
- Chave divergente retorna `409`.
- Sem chave retorna `400`.
- Atendimento nao concluido nao pode ser estornado.
- Devolucao parcial de produto cria despesa reversa.
- Devolucao cria `StockMovement IN`.
- Estoque aumenta apos devolucao.
- Venda original e movimento original `PRODUCT_SALE` permanecem.
- Replay de devolucao nao duplica financeiro nem estoque.
- Chave divergente retorna `409`.
- Sem chave retorna `400`.
- Quantidade devolvida acima do saldo vendido retorna erro.

## Comandos executados
- `npm.cmd run db:generate`: primeira tentativa falhou por rede/sandbox ao verificar binario Prisma; passou fora do sandbox.
- `npm.cmd run test`: primeira tentativa falhou por `spawn EPERM` do Vite no sandbox; passou fora do sandbox (`56 passed | 1 skipped`).
- `npm.cmd run build`: passou.
- `npm.cmd run smoke:api`: primeira tentativa falhou por rede/sandbox ao verificar binario Prisma; passou fora do sandbox.
- `npm.cmd run test:db`: primeira tentativa falhou por `spawn EPERM` do Vite no sandbox; passou fora do sandbox (`1 passed`).

## Limitacoes e pendencias reais
- Auditoria persistente append-only ainda nao foi implementada; `recordAudit` segue em memoria.
- Cancelamento/ajuste de comissao paga em caso de refund continua fora de escopo.
- UI operacional para estorno/devolucao nao foi criada; a fase entrega backend/API/testes.
- Estorno de atendimento nao devolve automaticamente produtos vendidos no checkout; devolucao de produto deve ser feita pelo endpoint proprio.

## Proxima etapa recomendada
Fase 0.2.3 - Auditoria persistente append-only.
