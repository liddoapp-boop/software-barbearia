# Auditoria Pos-Implementacao - Idempotencia e Constraints

Data: 2026-05-01
Escopo: auditoria da Fase 0.1 apos implementacao.
Parecer CTO: APROVADO COM RESSALVAS.

## 1. Prisma/schema

Campos adicionados:
- `FinancialEntry.idempotencyKey String?`
- `CommissionEntry.idempotencyKey String?`
- `ProductSale.idempotencyKey String?`
- Relacao `Unit.idempotencyRecords IdempotencyRecord[]`
- Novo modelo `IdempotencyRecord`

Constraints e indexes criados:
- `IdempotencyRecord`: `@@unique([unitId, action, idempotencyKey])`, index por `unitId + action + status + createdAt`, index por `expiresAt`.
- `FinancialEntry`: `@@unique([unitId, idempotencyKey])` e `@@unique([unitId, referenceType, referenceId, source])`.
- `CommissionEntry`: `@@unique([unitId, idempotencyKey])`, `@@unique([unitId, source, appointmentId])`, `@@unique([unitId, source, productSaleId])`.
- `ProductSale`: `@@unique([unitId, idempotencyKey])`.
- `StockMovement`: `@@unique([unitId, productId, referenceType, referenceId, movementType])`.

Migration correspondente:
- Existe em `prisma/migrations/20260430_idempotency_constraints/migration.sql`.
- A migration adiciona as colunas, cria `IdempotencyRecord`, cria os unique indexes e adiciona FK para `Unit`.
- O versionamento esta coerente com a sequencia temporal das migrations do projeto (`20260430_idempotency_constraints`) e o `migration_lock.toml` continua em `postgresql`.

## 2. IdempotencyRecord

Campos do modelo:
- `id`: identificador tecnico.
- `unitId`: escopo da unidade.
- `action`: operacao logica protegida.
- `idempotencyKey`: chave fornecida pelo cliente.
- `payloadHash`: hash canonico do payload.
- `status`: estado da execucao (`IN_PROGRESS`, `SUCCEEDED`; tipo tambem preve `FAILED` no helper).
- `responseJson`: resposta persistida para replay.
- `resolution`: id da entidade/operacao resolvida.
- `expiresAt`: reservado para expiracao futura.
- `createdAt` e `updatedAt`: auditoria temporal.

Calculo do `payloadHash`:
- Implementado em `src/application/idempotency.ts`.
- Normaliza datas para ISO.
- Ordena chaves de objetos para hash deterministico.
- Remove `idempotencyKey` e `idempotencyPayloadHash` do conteudo hasheado.
- Ignora `undefined`.
- Gera SHA-256 do JSON canonico.

Persistencia de status:
- Cada operacao Prisma cria `IdempotencyRecord` dentro da transacao com `status: "IN_PROGRESS"`.
- Apos gravar os efeitos colaterais, atualiza o mesmo registro para `status: "SUCCEEDED"`, preenchendo `responseJson` e `resolution`.

Replay:
- Antes de executar efeitos, `getReplayResult` busca por `unitId + action + idempotencyKey`.
- Se o hash bate e `status === "SUCCEEDED"` com `responseJson`, retorna a resposta persistida.
- Em conflito de unique durante corrida, `replayAfterUniqueConflict` tenta reaproveitar a resposta ja persistida.

Conflito 409:
- Se a mesma chave for reutilizada com payload diferente, `getReplayResult` dispara `Conflito: idempotencyKey reutilizada com payload diferente`.
- O error handler HTTP converte mensagens com `conflito` e erros Prisma `P2002` para HTTP 409.

## 3. Rotas protegidas

### POST /appointments/:id/checkout
- Aplicacao: `src/http/app.ts` calcula `idempotencyPayloadHash` com rota, params e body; `PrismaOperationsService.checkoutAppointment` usa action `APPOINTMENT_CHECKOUT`.
- Chave de escopo: `unitId + APPOINTMENT_CHECKOUT + idempotencyKey`.
- Efeito protegido: finalizacao do appointment, historico, receita de servico, comissao de servico, venda de produto do checkout, receita de produto, baixa de estoque, comissao de produto e metricas do cliente.
- Defesa adicional: `appointment.updateMany` com `status not COMPLETED` dentro da transacao e uniques por referencia/origem.

### POST /sales/products
- Aplicacao: `src/http/app.ts` calcula hash com rota e body; `registerProductSale` usa action `PRODUCT_SALE_CREATE`.
- Chave de escopo: `unitId + PRODUCT_SALE_CREATE + idempotencyKey`.
- Efeito protegido: criacao de `ProductSale`, itens, receita financeira, movimentos de estoque, decremento de estoque e comissao de produto.

### POST /financial/transactions
- Aplicacao: `src/http/app.ts` calcula hash com rota e body; `createFinancialTransaction` usa action `FINANCIAL_TRANSACTION_CREATE`.
- Chave de escopo: `unitId + FINANCIAL_TRANSACTION_CREATE + idempotencyKey`.
- Efeito protegido: criacao de `FinancialEntry` manual ou referenciada por appointment/product sale.

### POST /financial/manual-entry
- Aplicacao: `src/http/app.ts` calcula hash com rota e body; `registerManualFinancialEntry` delega para `createFinancialTransaction`.
- Chave de escopo efetiva: `unitId + FINANCIAL_TRANSACTION_CREATE + idempotencyKey`.
- Efeito protegido: criacao de `FinancialEntry` manual simplificada.
- Ressalva: a action interna e compartilhada com `/financial/transactions`; o hash inclui a rota HTTP, entao nao ha colisao de payload entre as duas rotas, mas a nomenclatura da action nao diferencia a origem do endpoint.

### PATCH /financial/commissions/:id/pay
- Aplicacao: `src/http/app.ts` calcula hash com rota, params e body; `markFinancialCommissionAsPaid` usa action `COMMISSION_PAY`.
- Chave de escopo: `unitId + COMMISSION_PAY + idempotencyKey`.
- Efeito protegido: alteracao de status da comissao para `PAID` e gravacao de `paidAt`.

## 4. Constraints transacionais

Validacao por entidade:
- `FinancialEntry`: protegido por `unitId + idempotencyKey` quando ha chave; protegido por `unitId + referenceType + referenceId + source` para receitas vinculadas a appointment/product sale. Ressalva: lancamentos manuais sem idempotency key continuam duplicaveis por regra de negocio, pois `referenceId` e `source` podem ser nulos e PostgreSQL permite multiplos NULL em unique indexes.
- `CommissionEntry`: protegido por `unitId + idempotencyKey`; tambem por origem de appointment/product sale. Ressalva: constraints com colunas nullable nao bloqueiam multiplos NULL, mas os fluxos criticos preenchem `appointmentId` ou `productSaleId`.
- `ProductSale`: protegido por `unitId + idempotencyKey` quando ha chave. Ressalva: venda avulsa sem idempotency key ainda pode duplicar.
- `StockMovement`: protegido por `unitId + productId + referenceType + referenceId + movementType`; funciona bem quando `referenceId` vem da venda/appointment. Ressalva: movimentos manuais/ajustes com `referenceId` nulo nao sao totalmente deduplicados por constraint.
- `IdempotencyRecord`: protegido por `unitId + action + idempotencyKey`; e a primeira linha de defesa para replay e conflito de payload.

Conclusao: nao ha duplicidade possivel nas operacoes criticas quando o cliente envia `idempotencyKey`. Sem chave, ainda ha risco residual em venda avulsa e lancamentos manuais; checkout tem defesa adicional forte por status do appointment.

## 5. Testes

Testes adicionados/ajustados em `tests/api.spec.ts`:
- Replay com mesma chave e mesmo payload: coberto em checkout, venda de produto, transacao financeira e pagamento de comissao.
- 409 com mesma chave e payload diferente: coberto em `/financial/transactions`.
- Checkout sem duplicar financeiro: `mantem checkout idempotente em retry e concorrencia sem duplicar financeiro, comissao ou estoque` valida duas transacoes esperadas, sem duplicacao extra.
- Checkout sem duplicar comissao: mesmo teste valida quantidade de comissoes igual a resposta inicial.
- Checkout sem baixar estoque duas vezes: mesmo teste valida um movimento de produto e saldo final.
- Venda de produto sem duplicar: teste de venda/retry valida mesmo `sale.id` e apenas uma transacao `PRODUCT_SALE`.
- Lancamento financeiro manual sem duplicar: coberto via `/financial/transactions`; `/financial/manual-entry` tem teste funcional, mas nao tem teste dedicado de idempotencia.
- Pagamento de comissao sem duplicar: teste valida `payRetry` igual a primeira resposta.

Validacao executada nesta auditoria:
- `npm.cmd test`: passou com `2 passed | 1 skipped`, `51 passed | 1 skipped`.
- `npm.cmd run build`: passou.
- `tests/db.integration.spec.ts` ficou skipped porque depende de `RUN_DB_TESTS=1` e `DATABASE_URL`; portanto a concorrencia real em PostgreSQL nao foi exercitada nesta rodada.

## 6. EPERM Prisma/Windows

Resultado investigado:
- `npm.cmd run db:generate` falhou fora do sandbox com:
  `EPERM: operation not permitted, rename ... node_modules\.prisma\client\query_engine-windows.dll.node.tmp21868 -> query_engine-windows.dll.node`.
- O client gerado contem `IdempotencyRecord`, `payloadHash` e os novos campos.
- `npm.cmd run build` passou, indicando que os tipos Prisma atuais estao coerentes com o codigo.
- `npm.cmd test` passou fora do sandbox.

Interpretacao:
- O risco principal nao e de schema ou codigo; e operacional no Windows/OneDrive: arquivo `.dll.node` travado por processo, sincronizacao do OneDrive, antivirus ou handle aberto.
- Existem arquivos temporarios `query_engine-windows.dll.node.tmp*` no client Prisma, reforcando a hipotese de rename bloqueado.

Recomendacao:
- Antes de rodar migration/generate em ambiente real, fechar processos Node/Prisma, pausar OneDrive/antivirus para a pasta ou mover o workspace para uma pasta local fora de OneDrive.
- Reexecutar `npm.cmd run db:generate`.
- Rodar `npm.cmd run db:migrate` ou fluxo equivalente de deploy de migration no banco alvo.
- Rodar `npm.cmd run test:db` com PostgreSQL real para validar constraints e concorrencia no banco.

## 7. Resultado final

Parecer: APROVADO COM RESSALVAS.

Motivos de aprovacao:
- Schema e migration estao coerentes.
- Idempotencia por `IdempotencyRecord` esta bem posicionada antes dos efeitos colaterais.
- Replay reutiliza resposta persistida.
- Conflito de payload retorna 409.
- Efeitos criticos de checkout, venda, financeiro e comissao estao transacionados.
- Constraints do banco criam uma segunda linha de defesa.
- Suite automatizada principal passou.

Ressalvas antes da proxima fase:
- `idempotencyKey` ainda e opcional nas rotas criticas; sem chave, venda avulsa e lancamentos manuais ainda podem duplicar.
- `/financial/manual-entry` nao tem teste dedicado de idempotencia, apesar de delegar para o fluxo protegido de transacao financeira.
- `prisma generate` ainda falha no Windows/OneDrive por lock de arquivo; nao bloqueou build/test, mas precisa ser limpo antes de deploy ou validacao DB real.
- Teste de concorrencia real em PostgreSQL nao foi executado nesta auditoria.

Nao encontrei falha P0 que justificasse alterar codigo nesta rodada.
