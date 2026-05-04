# 08 - Financeiro

## 1. Visao geral do modulo
Fonte de consolidacao de entradas/saidas, caixa operacional e visao gerencial.

## 2. O que ja esta implementado (baseado no codigo)
- Endpoints: `/financial/summary`, `/financial/transactions`, `/financial/entries`, `/financial/reports`, `/financial/management/overview`.
- CRUD de transacao manual com update/delete.
- Entradas automaticas por servico e produto no fechamento/venda.
- UI ja exibe lista operacional detalhada alem de cards.

## 3. O que esta incompleto
- Tratamento contabil de comissao paga ainda pode evoluir para reconciliacao mais formal.
- Falta governanca de plano de contas mais estruturado por categoria/fonte.

## 4. Problemas identificados
- Permite forte flexibilidade manual, o que aumenta risco de inconsistencia sem processo.
- Multi-fonte de verdade potencial entre financeiro, comissao e billing caso regras nao sejam unificadas.

## 5. Dependencias com outros modulos
- Recebe dados de agenda/checkout, PDV, comissoes e billing.

## 6. Impacto no fluxo principal
E o consolidado economico do funil. Se ficar inconsistente, compromete decisao gerencial e previsibilidade.
