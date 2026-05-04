# 80 - Implementacao de Idempotencia e Constraints

Data: 2026-05-01
Escopo: Fase 0.1 do roadmap de profissionalizacao.

## Estrategia adotada
- Operacoes criticas aceitam `idempotencyKey` no body ou nos headers `Idempotency-Key` / `X-Idempotency-Key`.
- A chave e persistida em `IdempotencyRecord` por `unitId + action + idempotencyKey`.
- O payload e normalizado e salvo como hash SHA-256, ignorando a propria chave.
- Repeticao com mesma chave e mesmo payload retorna a resposta gravada da primeira execucao.
- Repeticao com mesma chave e payload diferente retorna `409 Conflito`.
- O registro idempotente e criado e concluido dentro da mesma transacao Prisma dos efeitos criticos sempre que ha banco envolvido.

## Modelos alterados
- `IdempotencyRecord`: guarda action, chave, hash, status, resposta JSON, resolucao e expiracao futura.
- `ProductSale`: recebeu `idempotencyKey` opcional.
- `FinancialEntry`: recebeu `idempotencyKey` opcional.
- `CommissionEntry`: recebeu `idempotencyKey` opcional.

## Constraints criadas
- `IdempotencyRecord`: unique por `unitId + action + idempotencyKey`.
- `FinancialEntry`: unique por `unitId + idempotencyKey`.
- `FinancialEntry`: unique por `unitId + referenceType + referenceId + source`.
- `CommissionEntry`: unique por `unitId + idempotencyKey`.
- `CommissionEntry`: unique por `unitId + source + appointmentId`.
- `CommissionEntry`: unique por `unitId + source + productSaleId`.
- `ProductSale`: unique por `unitId + idempotencyKey`.
- `StockMovement`: unique por `unitId + productId + referenceType + referenceId + movementType`.

## Rotas protegidas
- `POST /appointments/:id/checkout`
- `POST /sales/products`
- `POST /financial/transactions`
- `POST /financial/manual-entry`
- `PATCH /financial/commissions/:id/pay`

## Protecoes transacionais
- Checkout usa transacao Prisma para appointment, historico, financeiro, venda, estoque, comissao e idempotencia.
- Checkout usa update condicional para impedir corrida entre validacao e finalizacao.
- Venda de produto usa transacao Prisma para venda, financeiro, estoque, comissao e idempotencia.
- Baixa de estoque por venda usa update condicional com saldo suficiente.
- Erro de unique constraint e tratado como conflito amigavel.

## Webhooks
- Webhooks de cobranca ja possuiam idempotencia por evento/idempotencyKey.
- Webhooks operacionais de teste/inbound continuam sem efeitos financeiros; receberam `occurredAt` opcional para logs deterministicos.
- Proximo passo recomendado: migrar webhooks operacionais mutantes futuros para `IdempotencyRecord`.

## Politica de retencao
- Fase 0.1 mantem `IdempotencyRecord` sem expiracao automatica.
- Campo `expiresAt` foi criado para permitir politica futura por job, sem perder rastreabilidade atual.

## Limites conhecidos
- A idempotencia forte depende do cliente enviar uma chave estavel em retries.
- Constraints de origem protegem checkout e registros derivados mesmo sem chave.
- Pagamento de comissao ainda nao gera despesa financeira; isso permanece na Fase 0.3.
- Refund/estorno ainda nao foi implementado; a base de `referenceType/referenceId/source` ficou preparada.

## Validacao
- Testes adicionados cobrem retry de checkout, venda, lancamento manual, pagamento de comissao, conflito de payload e concorrencia simulada.
- Suite `npm run test` passou em 2026-05-01.
