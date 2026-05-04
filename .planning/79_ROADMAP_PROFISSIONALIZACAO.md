# 79 - Roadmap de Profissionalizacao

Data: 2026-04-30
Objetivo: transformar achados da auditoria em sequencia antes da IA/WhatsApp.

## Principio CTO
Nao automatizar caixa preta. Antes de IA/WhatsApp, cada acao automatica precisa ser idempotente, auditavel, reversivel e segura por permissao/tenant.

## Fase 0 - Guardrails P0
### 0.1 Idempotencia e constraints
- Adicionar `idempotencyKey` em checkout, venda, lancamento financeiro manual, devolucao e webhooks operacionais.
- Criar constraints para evitar duplicidade de financeiro/comissao por origem.
- Criar `normalizedPhone` e unique por unidade para clientes.
- Criar testes de retry/concorrencia.

### 0.2 Devolucao/estorno
- Criar `Refund` e `RefundItem`.
- Criar devolucao parcial/total de produto.
- Gerar financeiro de estorno.
- Gerar movimento reverso de estoque.
- Ajustar/reverter comissoes.
- Preservar venda original.

### 0.3 Financeiro profissional
- Adicionar `status`, `createdBy`, `updatedBy`, `voidedBy`, `voidReason`.
- Criar despesa financeira ao pagar comissao.
- Formalizar referencias para appointment, sale, commission e refund.

### 0.4 Auditoria persistente
- Criar `AuditLog` append-only.
- Persistir before/after/motivo/requestId.
- Gravar eventos criticos dentro da transacao ou outbox.

### 0.5 Seguranca SaaS minima
- Criar `User` e `UserUnitRole` persistentes.
- Hash de senha e status de usuario.
- Remover defaults inseguros em producao.
- Refinar RBAC por rota e escopo.

## Fase 1 - Estoque confiavel
- Garantir ledger para todo `stockQty`.
- Criar movimento inicial.
- Adicionar `balanceBefore`, `balanceAfter`, `createdBy`, `reason`, `metadata`.
- Filtrar produtos por `businessId/unitId` em todas as operacoes.
- Criar reconciliacao de estoque.

## Fase 2 - Modelo de dados
- Padronizar `unitId` vs `businessId`.
- Criar dicionario de dados.
- Adicionar `saleNumber`, `refundNumber`, `transactionNumber`.
- Adicionar status em `ProductSale`.
- Criar ADRs para financeiro/estoque/comissao.

## Fase 3 - Politicas operacionais
- Definir cancelamento/no-show por unidade.
- Definir taxa, tolerancia, motivo obrigatorio e impacto no cliente.
- Definir politica de comissao em devolucao/cancelamento.
- Definir permissao de recepcao vs profissional.

## Fase 4 - Observabilidade e reconciliacao
- Dashboards de duplicidade, divergencia financeira e estoque.
- Alertas para venda sem financeiro, venda sem movimento, comissao sem origem.
- Outbox para eventos futuros de IA/WhatsApp.
- Correlation ID atravessando eventos internos e webhooks.

## Fase 5 - Preparacao para IA/WhatsApp
- IA le agenda e cliente sem risco de duplicidade.
- WhatsApp confirma/cancela/no-show com motivo e trilha.
- Automacoes criam campanhas com idempotencia.
- Acoes automatizadas passam por policy engine e audit log.

## Backlog priorizado
| Prioridade | Item | Resultado esperado |
|---|---|---|
| P0 | Idempotencia checkout/venda/financeiro | Retry nao duplica receita, estoque ou comissao |
| P0 | Refund/estorno | Devolucao preserva venda e corrige caixa/estoque/comissao |
| P0 | FinancialEntry profissional | Status, createdBy e referencias confiaveis |
| P0 | CommissionPayment financeiro | Pagamento de comissao reduz caixa |
| P0 | AuditLog persistente | Toda acao critica rastreavel apos restart |
| P0 | User persistente e segredo obrigatorio | Base SaaS segura |
| P0 | Tenant guard em produtos/estoque | Sem cross-unit por ID vazado |
| P1 | RBAC refinado | Menos exposicao sensivel |
| P1 | Ledger estoque completo | Inventario reconciliavel |
| P1 | Cancel/no-show policy | Automacoes com contexto correto |
| P2 | IDs de negocio legiveis | Suporte e conciliacao melhores |
| P2 | Dicionario de dados/ADRs | Governanca e onboarding |

## Problemas tratados por este roadmap

### 1. Automatizacao antes de idempotencia
- Problema: IA/WhatsApp pode repetir operacoes ou usar dados duplicados.
- Evidencia no codigo: Checkout/venda sem idempotency key em `src/application/prisma-operations-service.ts:2671` e `src/application/prisma-operations-service.ts:2531`.
- Impacto: Automacao amplifica falhas.
- Risco: Caixa preta em escala.
- Recomendacao CTO: Bloquear automacoes mutantes ate Fase 0.1.
- Prioridade: P0

### 2. Automatizacao sem reversibilidade
- Problema: Nao existe devolucao/estorno.
- Evidencia no codigo: Ausencia de `Refund`; financeiro sem status em `prisma/schema.prisma:404`.
- Impacto: Erros de automacao nao tem reversao limpa.
- Risco: Perda financeira e operacional.
- Recomendacao CTO: Implementar refund antes de IA acionar venda/cobranca.
- Prioridade: P0

### 3. Automatizacao sem audit log persistente
- Problema: Acoes automatizadas nao teriam trilha confiavel.
- Evidencia no codigo: `auditEvents` em memoria em `src/http/app.ts:176`.
- Impacto: Impossivel explicar acao automatizada apos reinicio.
- Risco: Compliance e suporte comprometidos.
- Recomendacao CTO: Fase 0.4 antes de IA/WhatsApp.
- Prioridade: P0

### 4. Automatizacao sem RBAC por escopo
- Problema: Permissao atual e por grupo de rota, nao por contexto fino.
- Evidencia no codigo: `queryRoutes` generica em `src/http/app.ts:133` a `src/http/app.ts:167`.
- Impacto: IA/WhatsApp poderia expor ou operar dados fora do escopo.
- Risco: Vazamento de informacao.
- Recomendacao CTO: Policy engine por recurso/acao/escopo.
- Prioridade: P1
