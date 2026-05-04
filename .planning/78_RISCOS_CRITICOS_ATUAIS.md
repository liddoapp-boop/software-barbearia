# 78 - Riscos Criticos Atuais

Data: 2026-04-30
Objetivo: consolidar riscos antes de IA/WhatsApp.

## Ranking executivo
1. P0: Sem devolucao/estorno rastreavel.
2. P0: Sem idempotencia/constraints em checkout, venda, financeiro e comissao.
3. P0: Financeiro sem status/createdBy e pagamento de comissao sem despesa.
4. P0: Auditoria geral nao persistente.
5. P0: Usuarios/seguranca ainda MVP.
6. P0: Risco multi-tenant em produtos/estoque por buscas sem `businessId` em alguns fluxos.
7. P1: Permissoes de profissional amplas em consultas financeiras/estoque.
8. P1: Estoque sem saldo antes/depois e sem movimento inicial formal.
9. P1: Nomenclatura mista `businessId`/`unitId`.
10. P1: Cancelamento/no-show sem politica financeira/relacional.

## Problemas detalhados

### 1. Devolucoes inexistentes
- Problema: Nao existe entidade, rota ou politica de devolucao.
- Evidencia no codigo: Ausencia de `Refund`; venda e financeiro em `prisma/schema.prisma:404` e `prisma/schema.prisma:449` sem refund.
- Impacto: Venda original nao pode ser estornada mantendo rastreabilidade.
- Risco: Financeiro, estoque e comissao ficam errados.
- Recomendacao CTO: Implementar `Refund`/`RefundItem` como proxima macrofuncionalidade estrutural.
- Prioridade: P0

### 2. Duplicidade por retry/concorrencia
- Problema: Operacoes criticas nao tem idempotency key nem constraints unicas por origem.
- Evidencia no codigo: Checkout/venda sem chave em `src/application/prisma-operations-service.ts:2531` e `src/application/prisma-operations-service.ts:2671`; schema sem uniques em `FinancialEntry`, `CommissionEntry`, `ProductSale`.
- Impacto: Uma automacao ou cliente HTTP com retry pode duplicar efeitos.
- Risco: Caixa preta em escala.
- Recomendacao CTO: Introduzir idempotencia e constraints de referencia.
- Prioridade: P0

### 3. Financeiro incompleto
- Problema: Sem status/createdBy e sem despesa no pagamento de comissao.
- Evidencia no codigo: `FinancialEntry` em `prisma/schema.prisma:404`; pagamento de comissao em `src/application/prisma-operations-service.ts:3572`.
- Impacto: Relatorios nao representam caixa completo.
- Risco: Decisao errada sobre lucro.
- Recomendacao CTO: Profissionalizar financeiro antes de automacoes de cobranca/venda.
- Prioridade: P0

### 4. Auditoria volatil
- Problema: Auditoria principal esta em memoria.
- Evidencia no codigo: `auditEvents` em `src/http/app.ts:176`.
- Impacto: Perde historico em restart.
- Risco: Sem prova de quem fez o que.
- Recomendacao CTO: Persistir `AuditLog`.
- Prioridade: P0

### 5. Seguranca e usuarios em modo MVP
- Problema: Usuarios default/env e segredo default.
- Evidencia no codigo: `DEFAULT_USERS` em `src/http/security.ts:32`; `getAuthSecret` em `src/http/security.ts:72`.
- Impacto: Sem governanca de acesso SaaS.
- Risco: Acesso indevido em deploy mal configurado.
- Recomendacao CTO: User model persistente, hash de senha e segredo obrigatorio.
- Prioridade: P0

### 6. Risco multi-tenant em produto/estoque
- Problema: Algumas buscas por produto usam somente `id`.
- Evidencia no codigo: Venda busca produtos em `src/application/prisma-operations-service.ts:2541`; movimento manual em `src/application/prisma-operations-service.ts:3022`.
- Impacto: Produto de outra unidade pode ser afetado.
- Risco: Integridade multi-tenant.
- Recomendacao CTO: Todas as queries tenantizadas devem usar `id + unitId/businessId`.
- Prioridade: P0
