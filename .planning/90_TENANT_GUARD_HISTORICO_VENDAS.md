# 90 - Tenant guard e historico operacional de vendas

Data: 2026-05-04
Fase: 0.5
Status: IMPLEMENTADA

## Objetivo da fase
Fechar lacunas operacionais e de seguranca multiunidade antes das proximas fases comerciais, com foco em historico de vendas de produto e tenant guard profundo em rotas por path de produto/estoque/venda/devolucao.

## Lacuna anterior
- A UI de devolucao de produto dependia das vendas recentes da sessao atual do PDV.
- Nao havia endpoint operacional para listar vendas antigas de produtos por unidade.
- O tenant guard por query/body ja existia, mas ainda havia pontos profundos em produto/estoque por path que dependiam de convencao.
- `getStockOverview` ainda podia agregar produtos ativos sem filtrar por unidade no backend Prisma e no backend em memoria.

## Endpoint de historico de vendas
Criado:
- `GET /sales/products`

Parametros:
- `unitId` obrigatorio.
- `start`, `end`, `clientId`, `professionalId`, `productId`, `search`, `status` e `limit` opcionais.
- `limit` limitado a 500.

Retorno:
- `sales[]` com `id`, `unitId`, `soldAt`, cliente/profissional quando disponiveis, `grossAmount`, `items`, `totalRefundedAmount`, `status` e `createdAt`.
- Cada item traz `productId`, `productName`, `quantity`, `unitPrice`, `unitCost`, `refundedQuantity` e `refundableQuantity`.
- `status` calculado como `NOT_REFUNDED`, `PARTIALLY_REFUNDED` ou `REFUNDED`.

## Regras de tenant guard adicionadas
- `GET /sales/products` entrou na policy com `unitSource=query` e roles `owner`/`recepcao`.
- `POST /sales/products/:id/refund` ficou explicitamente mapeado para `owner`/`recepcao` e `unitSource=body`.
- `registerProductSale` em memoria passou a validar produto dentro da unidade da venda.
- `registerStockManualMovement` em memoria e Prisma passou a validar produto por `businessId/unitId`.
- `refundProductSale` Prisma passou a incrementar estoque com `updateMany` filtrado por `businessId`.
- `getStockOverview` em memoria e Prisma passou a filtrar produtos, baixo estoque, sugestoes e totais por unidade.
- Ficha tecnica de consumo de estoque por servico agora valida servico e produtos dentro da unidade.

## Fluxos frontend implementados
- A area do PDV agora exibe `Vendas recentes e historico`.
- A lista consome `GET /sales/products?unitId=unit-01`.
- Foram adicionados filtros simples por texto e periodo.
- Cada venda exibe data, cliente, profissional, valor, itens vendidos/devolvidos e status de devolucao.
- O botao `Devolver produto` aparece apenas quando ha quantidade devolvivel.
- A modal de devolucao foi reaproveitada e passou a usar `refundableQuantity` para impedir excesso no frontend.
- A devolucao segue enviando `idempotencyKey` via `buildOperationIdempotencyKey("product-refund")`.
- A lista e recarregada apos venda/devolucao.

## Testes adicionados
Em `tests/api.spec.ts`:
- Listagem historica de vendas por unidade com filtros de periodo, produto e busca.
- Retorno de itens com nome de produto e quantidade devolvida.
- Devolucao de venda antiga a partir do id retornado pelo historico.
- Validacao de financeiro reverso, `StockMovement IN` e auditoria de devolucao historica.
- Bloqueio de devolucao por path quando a venda pertence a outra unidade.
- Garantia de que o bloqueio nao cria refund, despesa financeira nem movimento de estoque reverso.
- Bloqueio de alteracao de produto e movimentacao manual de estoque por path fora da unidade ativa.

## Validacoes executadas
- `Get-Content -Raw public/app.js | node --input-type=module --check`: passou.
- `npm.cmd run build`: passou.
- `npm.cmd run test`: falhou no sandbox por `spawn EPERM` do Vitest/Vite; passou fora do sandbox (`63 passed | 10 skipped`).
- `npm.cmd run smoke:api`: falhou no sandbox por verificacao/download de engine Prisma; passou fora do sandbox.
- `npm.cmd run test:db`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox (`10 passed`).

## Limitacoes reais
- Nao foi implementada auditoria transacional/outbox; a limitacao da Fase 0.2.3 permanece.
- Nao foi criado CRUD completo de usuarios/equipe.
- Nao foi feita validacao manual em navegador nesta rodada.
- O frontend ainda usa `unit-01` como unidade fixa do app estatico atual; a seguranca real segue no backend/token.
- Profissional continua sem escopo refinado por profissional em todos os endpoints, pois ainda falta associacao formal User -> Professional.

## Proxima etapa recomendada
Proxima prioridade recomendada: Outbox/auditoria transacional para fluxos financeiros criticos.

Alternativas proximas, conforme decisao de produto:
- CRUD operacional de usuarios/equipe.
- Deploy/producao controlada com checklist de ambiente e smoke manual.
