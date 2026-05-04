# 87 - Validacao PostgreSQL real e robustez

Data: 2026-05-03
Fase: 0.2.4
Status: IMPLEMENTADA

## Objetivo da fase
Validar os fluxos criticos com PostgreSQL real/Prisma, com foco em concorrencia, replay idempotente, constraints, auditoria persistente e consistencia financeira.

Esta fase nao criou feature nova. As mudancas foram restritas a robustez operacional, testes DB, smoke e documentacao.

## Estado do PostgreSQL real
- `DATABASE_URL` apontou para PostgreSQL local: database `barbearia`, schema `public`, host `localhost:5432`.
- `npm.cmd run db:push` confirmou: `The database is already in sync with the Prisma schema`.
- `npm.cmd run test:db` executou com `RUN_DB_TESTS=1` e `DATA_BACKEND=prisma`.
- O projeto usa `db:push` como fluxo padrao atual de sincronizacao local; `db:migrate` existe, mas nao foi necessario porque nenhuma migration de schema foi criada nesta fase.

Fluxo documentado para ambiente com Docker Compose:
1. `npm.cmd run db:up`
2. `npm.cmd run db:push`
3. `npm.cmd run test:db`

## Comandos executados
- `npm.cmd run db:generate`: passou fora do sandbox; no sandbox falhou por restricao de rede/engine Prisma.
- `npm.cmd run db:push`: passou fora do sandbox; banco ja estava sincronizado.
- `npm.cmd run test`: passou fora do sandbox (`58 passed | 7 skipped`).
- `npm.cmd run build`: passou.
- `npm.cmd run smoke:api`: passou fora do sandbox; o smoke agora consulta `/audit/events`.
- `npm.cmd run test:db`: passou fora do sandbox (`7 passed`).

Observacoes de ambiente:
- O sandbox voltou a falhar com `spawn EPERM` ao carregar Vitest/Vite no Windows/OneDrive.
- `db:generate`, `db:push` e o servidor iniciado pelo smoke falharam no sandbox ao tentar verificar/baixar engine Prisma.
- Os mesmos comandos passaram fora do sandbox, mantendo o padrao operacional ja observado nas fases anteriores.

## Cenarios validados em PostgreSQL real
1. Persistencia basica de appointment checkout com receita `SERVICE`.
2. Pagamento concorrente da mesma comissao.
3. Replay simultaneo de refund de produto com a mesma `idempotencyKey`.
4. Payload divergente com a mesma `idempotencyKey` retornando `409`.
5. Refund concorrente de produto com chaves diferentes sem devolver acima do vendido.
6. Checkout concorrente do mesmo appointment sem duplicar receita.
7. Auditoria persistente consultada por um novo app Prisma via `GET /audit/events`.

## Testes de concorrencia adicionados
Arquivo: `tests/db.integration.spec.ts`

Coberturas adicionadas:
- comissao concorrente: duas chamadas de pagamento sobre a mesma comissao terminam com apenas uma `FinancialEntry EXPENSE` de `source=COMMISSION`;
- replay simultaneo: duas devolucoes simultaneas com mesma chave retornam o mesmo refund e nao duplicam refund, financeiro, estoque ou auditoria;
- payload divergente: mesma chave com payload diferente retorna `409` sem novo efeito colateral;
- refund concorrente: duas devolucoes simultaneas de uma venda com quantidade 1 geram uma devolucao real e uma falha controlada, preservando estoque correto;
- checkout concorrente: duas finalizacoes simultaneas do mesmo appointment geram uma receita e uma resposta de conflito;
- auditoria persistente: evento de refund permanece consultavel via novo `createApp()` com backend Prisma.

## Ajustes de robustez implementados
1. `refundProductSale` no Prisma passou a travar a linha da `ProductSale` com `FOR UPDATE` antes de calcular saldo devolvivel acumulado.
   - Motivo: sem essa trava, duas transacoes concorrentes com chaves diferentes poderiam ler o mesmo saldo devolvivel e devolver acima do vendido.
   - Efeito: refunds da mesma venda sao serializados; a segunda transacao enxerga o refund ja criado e falha sem duplicar financeiro/estoque.

2. `AuditRecorder` no backend Prisma passou a usar advisory lock transacional para deduplicar eventos idempotentes da mesma entidade/acao.
   - Motivo: replay simultaneo podia passar no padrao check-then-insert e criar dois eventos de auditoria para a mesma execucao real.
   - Efeito: replay concorrente nao cria evento duplicado que pareca nova execucao real.
   - Limite: isso nao transforma auditoria em outbox nem torna a auditoria atomica com a transacao de negocio.

## Constraints verificadas
- `IdempotencyRecord`: `@@unique([unitId, action, idempotencyKey])`.
- `FinancialEntry`: `@@unique([unitId, idempotencyKey])` e `@@unique([unitId, referenceType, referenceId, source])`.
- `Refund`: `@@unique([unitId, idempotencyKey])` e `@@unique([unitId, appointmentId])`.
- `AuditLog`: indices por `unitId/createdAt`, `unitId/entity/createdAt`, `unitId/action/createdAt`, `unitId/actorId/createdAt`, `requestId` e `idempotencyKey`.
- `StockMovement`: `@@unique([unitId, productId, referenceType, referenceId, movementType])`, cobrindo movimento reverso vinculado ao refund por `referenceType=PRODUCT_REFUND` e `referenceId=<refundId>`.

Nenhuma nova constraint de schema foi criada nesta fase. A lacuna de concorrencia em refunds parciais de produto foi corrigida com lock transacional, porque uma unique em `productSaleId` bloquearia devolucoes parciais legitimas.

## Auditoria persistente com Prisma
- A primeira execucao de operacao critica grava `AuditLog`.
- Replay idempotente simultaneo nao duplica evento principal.
- `GET /audit/events` retorna eventos com backend Prisma.
- Filtros por `unitId`, `entity` e `action` foram exercitados no teste DB.
- O smoke passou a consultar `/audit/events?unitId=unit-01&limit=5`.

Limitacao mantida:
- A auditoria Prisma ainda e pos-transacao HTTP e nao atomica com transacoes financeiras.
- Falha de auditoria continua sendo logada e nao quebra a operacao principal.
- A evolucao ideal segue sendo outbox/auditoria transacional para fluxos financeiros criticos.

## Limitacoes reais
- Usuarios persistentes ainda nao existem; actor/role vem da sessao/token atual ou do fallback quando auth esta desabilitada.
- `FinancialEntry.referenceType` segue como texto livre, embora protegido por convencao e unique composta.
- Nao ha outbox transacional para auditoria.
- Testes DB criam dados isolados com IDs unicos e nao limpam o banco automaticamente; isso preserva evidencia de execucao, mas pode acumular massa local.
- O ambiente Windows/OneDrive segue sensivel a `EPERM` e a verificacao de engines Prisma dentro do sandbox.

## Recomendacoes futuras
1. Proxima fase recomendada: Usuarios persistentes e permissoes refinadas.
2. Em paralelo tecnico, planejar outbox/auditoria transacional para fluxos financeiros criticos.
3. Em seguida, revisar tenant guard produto/estoque em endpoints de estoque e venda para reduzir dependencias de convencao.
4. Considerar rotina de limpeza para massa de teste DB local ou usar schema/database efemero por suite.

## Conclusao da fase
A Fase 0.2.4 foi aprovada. O core financeiro/auditoria/refund foi validado em PostgreSQL real, com testes de concorrencia cobrindo os fluxos de maior risco e com uma correcao objetiva para refund concorrente de produto. Nenhuma feature fora do escopo foi implementada.
