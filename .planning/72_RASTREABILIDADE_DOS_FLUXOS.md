# 72 - Rastreabilidade dos Fluxos

Data: 2026-04-30
Objetivo: explicar quais registros sao criados em cada fluxo e como se conectam.

## Criacao de cliente
- Entrada: `POST /clients` em `src/http/app.ts:1302`.
- Registros criados: `Client` com UUID, `businessId`, nome, telefone normalizado, email, nascimento, notas e tags em `src/application/prisma-operations-service.ts:289`.
- Conexoes futuras: `Appointment.clientId`, `ProductSale.clientId`, `FinancialEntry.customerId`, fidelidade, pacotes, assinaturas e retencao.
- Auditoria: `CLIENT_CREATED` em `src/http/app.ts:1319`.

## Criacao de agendamento
- Entrada: `POST /appointments` em `src/http/app.ts:1528`.
- Validacoes: servico por unidade em `src/application/prisma-operations-service.ts:2111`, profissional ativo em `src/application/prisma-operations-service.ts:2118`, cliente por unidade em `src/application/prisma-operations-service.ts:2127`.
- Anti-conflito: status ativos `SCHEDULED`, `CONFIRMED`, `IN_SERVICE` em `src/domain/rules.ts:24`.
- Registros criados: `Appointment` e `AppointmentHistory.CREATED` em `src/application/prisma-operations-service.ts:2161`.
- Auditoria: `APPOINTMENT_CREATED` em `src/http/app.ts:1534`.

## Checkout de atendimento
- Entrada: `POST /appointments/:id/checkout` em `src/http/app.ts:1753`.
- Registros/efeitos: atualiza `Appointment` para `COMPLETED`, cria `AppointmentHistory`, cria `FinancialEntry` de servico, cria `CommissionEntry` de servico, opcionalmente cria `ProductSale`, `ProductSaleItem`, `FinancialEntry` de produto, `StockMovement` e `CommissionEntry` de produto.
- Evidencia: transacao em `src/application/prisma-operations-service.ts:2788` a `src/application/prisma-operations-service.ts:2939`.
- Conexoes: financeiro de servico aponta para `Appointment`; financeiro/estoque/comissao de produto apontam para `ProductSale`.

## Venda de produto
- Entrada: `POST /sales/products` em `src/http/app.ts:1785`.
- Registros criados: `ProductSale`, `ProductSaleItem`, `FinancialEntry`, `StockMovement`, `CommissionEntry?` em `src/application/prisma-operations-service.ts:2584` a `src/application/prisma-operations-service.ts:2666`.
- Conexoes: `FinancialEntry.referenceType=PRODUCT_SALE`; `StockMovement.referenceType=PRODUCT_SALE`; `CommissionEntry.productSaleId`.

## Baixa de estoque
- Venda: `buildStockMovementsFromSale` cria movimentos `OUT` com `referenceType=PRODUCT_SALE` em `src/domain/rules.ts:186`.
- Consumo por servico: cria `StockMovement OUT` com `referenceType=SERVICE_CONSUMPTION` e `referenceId=appointment.id` em `src/application/prisma-operations-service.ts:2496`.
- Ajuste/manual: `PATCH /inventory/:id/stock` e `POST /stock/movements/manual` em `src/http/app.ts:2113` e `src/http/app.ts:2345`.

## Lancamento financeiro
- Servico: `buildServiceRevenueEntry` em `src/domain/rules.ts:140` cria `FinancialEntry` com `referenceType=APPOINTMENT`.
- Produto: `buildProductRevenueEntry` em `src/domain/rules.ts:163` cria `FinancialEntry` com `referenceType=PRODUCT_SALE`.
- Manual: `createFinancialTransaction` em `src/application/prisma-operations-service.ts:3351`.

## Comissao
- Servico: `calculateServiceCommission` em `src/domain/rules.ts:62`, referenciando `appointmentId`.
- Produto: `calculateProductCommission` em `src/domain/rules.ts:98`, referenciando `productSaleId`.
- Pagamento: `PATCH /financial/commissions/:id/pay` em `src/http/app.ts:1982`, atualizando `status=PAID` em `src/application/prisma-operations-service.ts:3586`.

## Cancelamento e no-show
- Entrada: `PATCH /appointments/:id/status` em `src/http/app.ts:1700`.
- Regras: `SCHEDULED/CONFIRMED` podem ir para `CANCELLED` ou `NO_SHOW`; `IN_SERVICE` pode ir para `CANCELLED` em `src/domain/rules.ts:49`.
- Registros: atualiza `Appointment.status` e cria `AppointmentHistory` em `src/application/prisma-operations-service.ts:2287`.
- Lacuna: nao ha financeiro, taxa, motivo obrigatorio ou politica de comissao.

## Devolucao/troca
- Status atual: ausente. Nao existe `Refund`, rota de devolucao, financeiro negativo, movimento reverso ou motivo obrigatorio.

## Problemas encontrados

### 1. Checkout/venda sem idempotencia ponta a ponta
- Problema: Rastreamento existe depois do commit, mas a intencao da operacao nao tem chave unica.
- Evidencia no codigo: Venda sempre gera novo UUID em `src/application/prisma-operations-service.ts:2560`; checkout bloqueia apenas status `COMPLETED` em `src/application/prisma-operations-service.ts:2694`.
- Impacto: Retry pode virar nova venda/lancamento.
- Risco: Duplicidade financeira e baixa dupla.
- Recomendacao CTO: Exigir `idempotencyKey` e persistir resultado da primeira execucao.
- Prioridade: P0

### 2. Cancelamento/no-show sem efeito de negocio formal
- Problema: Apenas muda status/historico.
- Evidencia no codigo: `updateStatus` em `src/application/prisma-operations-service.ts:2263` a `src/application/prisma-operations-service.ts:2304`.
- Impacto: IA/WhatsApp nao tem contexto para reagendar, cobrar taxa ou reter cliente.
- Risco: Automacoes inadequadas.
- Recomendacao CTO: Criar politica de motivo, taxa, janela, score e notificacao por unidade.
- Prioridade: P1

### 3. Pagamento de comissao nao cria trilha financeira
- Problema: Comissao muda para paga, mas caixa nao muda.
- Evidencia no codigo: `markFinancialCommissionAsPaid` em `src/application/prisma-operations-service.ts:3572`.
- Impacto: Resultado financeiro incompleto.
- Risco: Lucro superestimado.
- Recomendacao CTO: Criar `FinancialEntry EXPENSE` vinculado a comissao ou lote de pagamento.
- Prioridade: P0
