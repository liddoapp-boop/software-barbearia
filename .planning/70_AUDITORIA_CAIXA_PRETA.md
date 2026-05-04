# 70 - Auditoria Caixa Preta

Data: 2026-04-30
Escopo: auditoria de rastreabilidade interna, IDs, dados, estoque, vendas, clientes, transacoes, devolucoes, auditoria e permissoes.

## Resumo executivo
O sistema ja possui um core operacional funcional para agenda, checkout, venda de produto, financeiro, estoque e comissoes. A implementacao mais importante esta em `PrismaOperationsService`, com transacoes Prisma envolvendo atendimento, financeiro, venda, baixa de estoque e comissao.

O risco de caixa preta ainda existe porque partes criticas nao tem contratos de idempotencia, constraints unicas no banco, auditoria persistente, modelo formal de devolucao/estorno e entidade real de usuarios. O sistema sabe executar o fluxo feliz, mas ainda nao protege suficientemente contra repeticao, concorrencia, contestacao, reprocessamento e explicabilidade historica.

## Como explicar uma venda hoje
- Venda isolada de produto entra por `POST /sales/products` em `src/http/app.ts:1785`.
- A operacao chama `registerProductSale` em `src/application/prisma-operations-service.ts:2531`.
- Um `ProductSale` e criado com `id` UUID, `unitId`, `clientId`, `professionalId`, `grossAmount` e `soldAt` em `src/application/prisma-operations-service.ts:2584`.
- Cada item vira `ProductSaleItem` com `id`, `productSaleId`, `productId`, quantidade, preco e custo em `src/application/prisma-operations-service.ts:2593`.
- O financeiro recebe um `FinancialEntry` de receita com `referenceType=PRODUCT_SALE` e `referenceId=sale.id` em `src/application/prisma-operations-service.ts:2605`.
- O estoque recebe `StockMovement` de saida por item com `referenceType=PRODUCT_SALE` e `referenceId=sale.id` em `src/application/prisma-operations-service.ts:2624`.
- A comissao, quando existe profissional/regra, recebe `CommissionEntry` com `productSaleId=sale.id` em `src/application/prisma-operations-service.ts:2647`.

## Como explicar um checkout de atendimento hoje
- Checkout unificado entra por `POST /appointments/:id/checkout` em `src/http/app.ts:1753`.
- A operacao valida que o atendimento pertence a unidade ativa e ainda nao esta `COMPLETED` em `src/application/prisma-operations-service.ts:2684`.
- O servico gera receita `FinancialEntry` referenciada ao `Appointment` em `src/application/prisma-operations-service.ts:2805`.
- Se houver produtos no checkout, tambem cria `ProductSale`, `ProductSaleItem`, receita de produto, `StockMovement` e comissao de produto em `src/application/prisma-operations-service.ts:2842`.
- O status do `Appointment` vira `COMPLETED` e recebe `AppointmentHistory` em `src/application/prisma-operations-service.ts:2788`.

## Status geral por dominio
| Dominio | Status | Observacao CTO |
|---|---|---|
| IDs tecnicos | Parcialmente solido | UUID manual em quase tudo, mas sem padrao de identificador de negocio ou idempotency key por operacao critica. |
| Multiunidade | Parcial | `Unit` e `unitId/businessId` existem, mas alguns modelos core nao tem relacao formal ou usam nomes mistos. |
| Vendas | Parcialmente solido | Rastreia venda, itens, financeiro, estoque e comissao; falta idempotencia e devolucao. |
| Estoque | Parcialmente solido | Venda, ajuste e consumo por servico geram movimento; criacao de produto com estoque inicial nao gera movimento explicito. |
| Financeiro | Parcial | Receitas e despesas existem; pagamento de comissao nao gera despesa; sem status e createdBy em `FinancialEntry`. |
| Comissoes | Parcial | Gera e marca como pago; falta transacao financeira de pagamento e constraint contra duplicidade. |
| Devolucoes | Ausente | Nao ha modelos/rotas de refund/return/exchange. |
| Auditoria | Parcial | Eventos em memoria e logs HTTP; sem tabela persistente e sem before/depois completo. |
| Permissoes | Parcial | RBAC por rota existe; acesso de profissional ainda amplo em areas sensiveis de consulta. |

## Problemas encontrados

### 1. Nao existe modelo persistente de devolucao/estorno
- Problema: O schema nao possui `Refund`, `RefundItem`, `Return`, `Exchange` ou equivalente.
- Evidencia no codigo: `prisma/schema.prisma` lista `ProductSale`, `ProductSaleItem`, `FinancialEntry`, `StockMovement` e `CommissionEntry`, mas nao ha entidade de devolucao em `prisma/schema.prisma:449` a `prisma/schema.prisma:493`; busca por `refund/return/devol/estorno` nao encontrou implementacao de negocio.
- Impacto: Uma venda nao pode ser revertida de forma auditavel preservando a venda original.
- Risco: Alto risco financeiro e operacional quando houver produto devolvido, troca, chargeback ou erro de checkout.
- Recomendacao CTO: Criar modelo imutavel de devolucao com `Refund`, `RefundItem`, referencia a `ProductSale`/`ProductSaleItem`, transacao financeira negativa, movimento de estoque reverso e motivo obrigatorio.
- Prioridade: P0

### 2. Checkout nao tem idempotency key nem constraint anti-reprocessamento
- Problema: O endpoint bloqueia apenas se `Appointment.status === COMPLETED`, mas nao ha chave idempotente por request nem constraint unica de financeiro/comissao por appointment.
- Evidencia no codigo: Validacao de completo em `src/application/prisma-operations-service.ts:2694`; criacao de financeiro/comissao em `src/application/prisma-operations-service.ts:2805` e `src/application/prisma-operations-service.ts:2824`; schema sem `@@unique` em `FinancialEntry` e `CommissionEntry` para referencia em `prisma/schema.prisma:404` e `prisma/schema.prisma:426`.
- Impacto: Requisicoes concorrentes ou retry podem criar duplicidade antes do status ser efetivamente commitado.
- Risco: Duplicidade de receita, comissao e baixa de estoque.
- Recomendacao CTO: Adicionar `idempotencyKey` em operacoes de checkout/venda/transacao e constraints parciais ou compostas por `unitId + referenceType + referenceId + source` onde fizer sentido.
- Prioridade: P0

### 3. Financeiro nao registra status nem createdBy
- Problema: `FinancialEntry` nao possui `status`, `createdBy`, `updatedBy`, `voidedAt` ou trilha de conciliacao.
- Evidencia no codigo: Campos do modelo em `prisma/schema.prisma:404` a `prisma/schema.prisma:424`; `createFinancialTransaction` recebe `changedBy`, mas nao persiste em `src/application/prisma-operations-service.ts:3351` a `src/application/prisma-operations-service.ts:3407`.
- Impacto: Nao da para distinguir lancamento pendente/confirmado/estornado/cancelado nem responsabilizar criacao.
- Risco: Auditoria financeira insuficiente para SaaS multiunidade.
- Recomendacao CTO: Evoluir `FinancialEntry` para `FinancialTransaction` com `status`, `createdBy`, `createdAt`, `confirmedAt`, `voidedAt`, `voidReason` e vinculos formais.
- Prioridade: P0

### 4. Pagamento de comissao nao gera despesa financeira
- Problema: Marcar comissao como paga muda apenas `CommissionEntry.status` e `paidAt`.
- Evidencia no codigo: `markFinancialCommissionAsPaid` atualiza status em `src/application/prisma-operations-service.ts:3572` a `src/application/prisma-operations-service.ts:3599`; nao cria `FinancialEntry` de `EXPENSE`.
- Impacto: Caixa/resultado nao reflete saida real de pagamento de comissao.
- Risco: DRE e fluxo de caixa podem ficar superestimados.
- Recomendacao CTO: Definir politica: comissao pendente como provisao e pagamento como despesa financeira referenciada a `CommissionEntry` ou lote de pagamento.
- Prioridade: P0

### 5. Auditoria e volatil em memoria
- Problema: Eventos de auditoria ficam em array local e somem ao reiniciar a API.
- Evidencia no codigo: `const auditEvents: AuditEvent[] = []` em `src/http/app.ts:176`; `recordAudit` apenas faz push em memoria em `src/http/app.ts:1186` a `src/http/app.ts:1215`.
- Impacto: RCA, compliance e explicabilidade historica dependem da vida do processo.
- Risco: Perda de trilha de alteracoes criticas.
- Recomendacao CTO: Criar tabela `AuditLog` append-only com actor, role, unitId, action, entity, entityId, before, after, reason, requestId e createdAt.
- Prioridade: P0

### 6. Constraints de duplicidade sao insuficientes no banco
- Problema: Existem indices, mas poucas constraints unicas nas entidades transacionais principais.
- Evidencia no codigo: `Client` tem apenas indices por telefone em `prisma/schema.prisma:324`; `ProductSale`, `FinancialEntry`, `CommissionEntry` e `StockMovement` nao possuem `@@unique` de negocio em `prisma/schema.prisma:404`, `prisma/schema.prisma:426`, `prisma/schema.prisma:449` e `prisma/schema.prisma:478`.
- Impacto: A aplicacao tenta evitar alguns duplicados, mas o banco nao garante consistencia sob concorrencia.
- Risco: Duplicidade silenciosa em clientes, checkout, vendas, comissoes e transacoes.
- Recomendacao CTO: Transformar regras de unicidade criticas em constraints ou chaves idempotentes persistidas.
- Prioridade: P0

### 7. Entidade de usuarios nao existe no banco
- Problema: Usuarios do sistema sao configurados por env/default, nao por tabela persistente.
- Evidencia no codigo: `DEFAULT_USERS` em `src/http/security.ts:32` a `src/http/security.ts:54`; `loadAuthUsers` le `AUTH_USERS_JSON` em `src/http/security.ts:111`.
- Impacto: Permissoes, desligamento, senha, auditoria e multiunidade nao tem governanca SaaS real.
- Risco: Falha operacional e de seguranca ao escalar.
- Recomendacao CTO: Criar `User`, `UserUnitRole`, senha hash, status, ultimo login, MFA futuro e relacao com `TeamMember`/`Professional`.
- Prioridade: P0

### 8. Profissional tem acesso amplo a dados financeiros e estoque em rotas de consulta
- Problema: Rotas de consulta financeira/estoque aparecem liberadas para `owner`, `recepcao` e `profissional` pela politica generica de query routes.
- Evidencia no codigo: `queryRoutes` inclui `/financial/transactions`, `/financial/commissions`, `/financial/reports`, `/inventory`, `/stock/overview`; permissao em `src/http/app.ts:133` a `src/http/app.ts:167`.
- Impacto: Profissional pode consultar dados sensiveis alem do necessario.
- Risco: Exposicao de margem, caixa, comissoes de outros profissionais e estoque.
- Recomendacao CTO: Separar permissoes por acao e escopo: profissional ve agenda propria, comissao propria e performance propria; financeiro gerencial apenas owner.
- Prioridade: P1

### 9. Estoque inicial de produto nao gera movimento explicito
- Problema: Cadastro de produto recebe `quantity`, mas nao ha evidencia de `StockMovement` inicial obrigatorio no contrato de criacao.
- Evidencia no codigo: `Product` guarda `stockQty` em `prisma/schema.prisma:328` a `prisma/schema.prisma:346`; endpoint cria produto em `src/http/app.ts:2024` a `src/http/app.ts:2052`; ajustes posteriores geram movimento em `src/application/prisma-operations-service.ts:1972` a `src/application/prisma-operations-service.ts:1991`.
- Impacto: Saldo inicial aparece sem origem rastreavel.
- Risco: Divergencia de inventario inicial e auditoria incompleta.
- Recomendacao CTO: Criar movimento `IN` com `referenceType=INITIAL_STOCK` ou `ADJUSTMENT` na criacao quando quantidade inicial > 0.
- Prioridade: P1

### 10. Modelagem usa `businessId` e `unitId` de forma mista
- Problema: Algumas entidades usam `businessId` (`Client`, `Product`, `Service`, `MonthlyGoal`) e outras usam `unitId` (`Appointment`, `FinancialEntry`, `ProductSale`, `StockMovement`).
- Evidencia no codigo: `Client.businessId` em `prisma/schema.prisma:302`, `Product.businessId` em `prisma/schema.prisma:328`, `Appointment.unitId` em `prisma/schema.prisma:367`, `FinancialEntry.unitId` em `prisma/schema.prisma:404`.
- Impacto: Aumenta custo cognitivo e risco de bug em filtros multiunidade.
- Risco: Vazamento entre unidades por query inconsistente.
- Recomendacao CTO: Padronizar nomenclatura ou documentar regra formal: `Unit` como tenant operacional e `businessId` como alias legado a migrar.
- Prioridade: P1

## Decisao CTO
Antes de IA/WhatsApp, profissionalizar quatro pontos: idempotencia, devolucao/estorno, auditoria persistente e permissoes por escopo. Sem isso, a automacao pode amplificar duplicidades, baixas indevidas e mensagens baseadas em dados inconsistentes.
