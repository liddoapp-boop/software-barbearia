# 91 - Outbox/auditoria transacional

Data: 2026-05-04
Fase: 0.6
Status: IMPLEMENTADA

## Objetivo da fase
Garantir que fluxos financeiros criticos no backend Prisma persistam o fato de negocio e o rastro de auditoria de forma atomica.

Meta operacional: se uma operacao financeira critica for confirmada no banco, deve existir `AuditLog` confiavel da operacao.

## Problema anterior
A auditoria persistente append-only ja existia via `AuditRecorder`, mas as rotas HTTP chamavam auditoria depois do servico de negocio retornar. No backend Prisma isso deixava uma janela real:
- a transacao financeira podia confirmar;
- a escrita posterior em `AuditLog` podia falhar;
- a operacao principal nao era revertida, porque falha de auditoria era apenas logada.

Esse desenho era aceitavel para a Fase 0.2.3, mas insuficiente para fluxos financeiros criticos antes de uso comercial mais pesado.

## Diagnostico tecnico
Onde a auditoria era chamada:
- `src/http/app.ts` tinha um helper `recordAudit(...)`.
- As rotas criticas chamavam `recordAudit` depois de `operations.*` finalizar com sucesso.
- `AuditRecorder.record(...)` gravava em `AuditLog` no Prisma ou array no backend memory.

Operacoes financeiras transacionais no Prisma:
- `registerProductSale`: cria `ProductSale`, `FinancialEntry` de receita, `StockMovement` OUT e eventual `CommissionEntry`.
- `checkoutAppointment`: finaliza `Appointment`, cria receita de servico, opcionalmente venda de produto, baixa estoque e cria comissoes.
- `refundAppointment`: cria `Refund`, `FinancialEntry` reversa e historico do atendimento.
- `refundProductSale`: cria `Refund`, `RefundItem`, `FinancialEntry` reversa, `StockMovement` IN e incrementa estoque.
- `createFinancialTransaction`: cria `FinancialEntry` manual/idempotente.
- `registerManualFinancialEntry`: delega para `createFinancialTransaction`.
- `markFinancialCommissionAsPaid`: atualiza `CommissionEntry` para `PAID` e cria/upserta `FinancialEntry` de despesa.

Risco identificado:
- Todas essas operacoes ja tinham transacao de negocio, mas a auditoria era externa a ela.
- Um erro de `auditLog.create` depois do commit deixaria fato financeiro confirmado sem rastro persistente.

Pontos viaveis para correcao sem grande refatoracao:
- Os metodos Prisma criticos ja concentravam os efeitos de banco dentro de `this.prisma.$transaction`.
- O helper de auditoria podia expor escrita usando `Prisma.TransactionClient`.
- O HTTP podia passar apenas o contexto de request/ator, sem mover regra financeira para a rota.

## Decisao tecnica adotada
Adotada a Opcao A: auditoria transacional direta.

Motivos:
- O modelo `AuditLog` ja existe.
- Os fluxos criticos ja possuem transacoes Prisma bem delimitadas.
- Nao era necessario criar `AuditOutbox`, worker, drain ou nova migration.
- A mudanca ficou restrita aos fluxos financeiros criticos, preservando o comportamento geral do sistema.

## Alteracoes feitas
- `AuditRecorder` passou a expor `toAuditEvent(...)` e `writePrismaAuditEvent(...)`.
- `writePrismaAuditEvent(...)` aceita `PrismaClient` ou `Prisma.TransactionClient`.
- A deduplicacao por replay idempotente preservou advisory lock transacional por `unitId/action/entity/entityId`.
- `PrismaOperationsService` ganhou `recordCriticalAudit(...)` e passou a gravar `AuditLog` dentro da mesma transacao dos fluxos criticos.
- `src/http/app.ts` passou a montar um `TransactionalAuditContext` com actor, role, rota, metodo, requestId e idempotencyKey.
- Para `DATA_BACKEND=prisma`, as rotas criticas passam esse contexto ao servico e nao fazem auditoria pos-transacao.
- Para `DATA_BACKEND=memory`, as rotas continuam usando o caminho antigo com array em memoria.

## Fluxos cobertos
- `PATCH /financial/commissions/:id/pay`
- `POST /appointments/:id/checkout`
- `POST /sales/products`
- `POST /appointments/:id/refund`
- `POST /sales/products/:id/refund`
- `POST /financial/transactions`
- `POST /financial/manual-entry`

## Comportamento idempotente
- Replay com a mesma `idempotencyKey` continua retornando a resposta persistida em `IdempotencyRecord`.
- Como o replay Prisma retorna antes de abrir nova transacao de negocio, ele nao cria novo `AuditLog`.
- Concorrencia simultanea preserva a protecao por unique constraints e replay apos conflito.
- A auditoria tambem deduplica por `unitId + action + entity + entityId` com advisory lock, evitando dois eventos que parecam duas execucoes reais.
- Payload divergente com mesma chave continua retornando `409`.
- Ausencia de `idempotencyKey` nas rotas criticas continua retornando `400`.

## Testes adicionados
Em `tests/db.integration.spec.ts`:
- Pagamento concorrente de comissao agora valida tambem `AuditLog` unico para `FINANCIAL_COMMISSION_MARKED_PAID`.
- Helper de devolucao valida `Refund`, `FinancialEntry`, `StockMovement IN` e `AuditLog` unico para `PRODUCT_SALE_REFUNDED`.
- Replay simultaneo de refund com a mesma chave continua verificando ausencia de duplicidade de efeitos e auditoria via `GET /audit/events`.

## Comandos executados
- `npm.cmd run build`: passou.
- `npm.cmd run db:generate`: falhou no sandbox por verificacao/download da engine Prisma; passou fora do sandbox.
- `npm.cmd run test`: falhou no sandbox por `spawn EPERM` do Vite/Rolldown no Windows/OneDrive; passou fora do sandbox (`63 passed | 10 skipped`).
- `npm.cmd run build`: rerodado e passou.
- `npm.cmd run smoke:api`: falhou no sandbox porque o servidor local nao conseguiu verificar a engine Prisma; passou fora do sandbox.
- `npm.cmd run test:db`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox (`10 passed`).

Como nao houve schema novo, nao ha migration nova e `db:push` nao e necessario por decisao tecnica.

## Limitacoes reais
- A auditoria transacional foi aplicada somente aos fluxos financeiros criticos listados.
- Eventos nao financeiros continuam usando o `AuditRecorder` pos-operacao.
- Nao foi implementado outbox, porque a gravacao direta no `AuditLog` dentro da transacao foi suficiente.
- Nao foi criado mecanismo artificial para simular falha de auditoria em runtime; a garantia vem da escrita dentro da mesma transacao Prisma e do build/teste de caminho positivo.
- Backend memory continua sem semantica transacional real, por escolha de compatibilidade.

## Proxima etapa recomendada
Proxima prioridade recomendada: validacao manual no navegador e deploy/producao controlada com checklist de ambiente.

Alternativas seguintes:
- CRUD operacional de usuarios/equipe.
- Vinculo `User -> Professional`.
- Refinamento comercial do frontend.
