# 07 - Estoque

## 1. Visao geral do modulo
Controle de produtos, saldo, movimentacoes e consumo por servico.

## 2. O que ja esta implementado (baseado no codigo)
- CRUD de inventario: `GET/POST/PATCH/DELETE /inventory`.
- Ajuste de saldo: `PATCH /inventory/:id/stock` e movimento manual `POST /stock/movements/manual`.
- Baixa automatica em vendas e checkout.
- Perfil de consumo por servico (`/services/:id/stock-consumption`) e sugestoes de reposicao.

## 3. O que esta incompleto
- Sem politica de fornecedor/compra integrada.
- Sem inventario ciclico ou contagem cega com reconciliacao formal.

## 4. Problemas identificados
- Controle depende de disciplina operacional; nao existe workflow de aprovacao para ajustes criticos.
- Consumo por servico tem base forte, mas governanca de parametrizacao ainda manual.

## 5. Dependencias com outros modulos
- PDV, agenda/checkout, servicos e financeiro (custos indiretos).

## 6. Impacto no fluxo principal
Sem estoque consistente, fechamento unificado quebra ou gera margem falsa. E um modulo de risco operacional alto.
