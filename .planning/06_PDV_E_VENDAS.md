# 06 - PDV e Vendas

## 1. Visao geral do modulo
Venda de produtos avulsa e venda associada ao fechamento de atendimento.

## 2. O que ja esta implementado (baseado no codigo)
- Endpoint dedicado `POST /sales/products` para venda isolada.
- Carrinho no frontend (`public/modules/pdv.js`) com ajuste de quantidade/remocao.
- Venda gera receita financeira, comissao (quando aplicavel) e baixa de estoque.
- Checkout unificado tambem suporta venda de produtos no mesmo comando.

## 3. O que esta incompleto
- Ausencia de fluxo de estorno/devolucao de venda no contrato atual.
- Nao ha catalogo de descontos/promocoes por regra de PDV.

## 4. Problemas identificados
- Parte do fluxo de PDV usa dados carregados de catalogo local; risco de drift com estoque em concorrencia.
- Sem trilha dedicada de operador por item no frontend alem de `changedBy` textual.

## 5. Dependencias com outros modulos
- Estoque, financeiro, comissoes, clientes e profissionais.

## 6. Impacto no fluxo principal
Impacto direto na etapa de pagamento e no resultado financeiro real do atendimento.
