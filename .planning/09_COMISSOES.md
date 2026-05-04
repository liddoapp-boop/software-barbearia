# 09 - Comissoes

## 1. Visao geral do modulo
Calcula e controla comissao por servico e produto, com status de pagamento.

## 2. O que ja esta implementado (baseado no codigo)
- Regras por profissional (percentual/fixo, thresholds) no dominio e no banco.
- Geracao automatica de `CommissionEntry` em conclusao de atendimento e venda de produto.
- Consulta e pagamento: `/financial/commissions`, `PATCH /financial/commissions/:id/pay`, `/commissions/statement`.

## 3. O que esta incompleto
- Sem ciclo completo de provisao x liquidacao contabil totalmente integrado no financeiro.
- Sem workflow de aprovacao para pagamento em lote.

## 4. Problemas identificados
- Dependencia de consistencia das regras cadastradas; falha de configuracao impacta margem e repasse.
- `status` textual simples pode ficar curto para cenarios mais complexos (contestacao, estorno, bloqueio).

## 5. Dependencias com outros modulos
- Atendimento/finalizacao, PDV, financeiro, profissionais e servicos.

## 6. Impacto no fluxo principal
Comissao e etapa sensivel entre receita e custo. Impacta relacao com equipe e confiabilidade dos numeros.
