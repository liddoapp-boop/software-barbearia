# Checkout Unificado de Atendimento

Data: 2026-04-29

## Objetivo
Consolidar finalizacao de atendimento em uma unica operacao transacional, cobrindo servico, produtos, pagamento, financeiro, estoque, comissao e atualizacao de metricas do cliente.

## Fluxo implementado
1. Agenda/Central de agendamentos: acao `Concluir` abre modal de fechamento.
2. Modal exibe cliente, servico, profissional e valor do servico.
3. Usuario pode adicionar produtos e quantidades.
4. Usuario informa metodo de pagamento e observacoes.
5. Acao `Finalizar tudo` chama `POST /appointments/:id/checkout`.
6. Sucesso fecha modal e recarrega agenda automaticamente.

## Endpoint
`POST /appointments/:id/checkout`

Payload:
- `changedBy` (obrigatorio)
- `completedAt` (opcional; default agora)
- `paymentMethod` (obrigatorio)
- `expectedTotal` (opcional; validado contra servico + produtos)
- `notes` (opcional)
- `products` (opcional): `{ productId, quantity }[]`

## Regras de negocio aplicadas
- Impede dupla finalizacao (`COMPLETED` nao pode finalizar novamente).
- Atendimento so conclui via regra valida do motor (exige status em atendimento).
- Metodo de pagamento obrigatorio no checkout.
- Servico sempre gera receita financeira.
- Produto sempre gera receita financeira e baixa estoque.
- Impede estoque negativo para produtos vendidos no checkout.
- Impede quantidade acima do estoque ja no frontend e revalida no backend.
- Valida consistencia de total (`expectedTotal` deve bater com servico + produtos).
- Comissao registrada com status `PENDING` (servico e produto quando aplicavel).
- Cliente tem metricas recalculadas e retornadas: `lastVisitAt`, `totalSpent`, `frequency90d`.

## Transacao
No backend Prisma, o checkout executa em uma transacao unica:
- conclui agendamento
- cria receita de servico
- cria comissao de servico
- cria venda de produto (quando houver)
- cria receita de produto
- baixa estoque e cria movimentos
- cria comissao de produto
- atualiza cliente

Falha em qualquer etapa faz rollback total.

## Impacto sistêmico
- Financeiro passa a receber servico e produto em uma unica finalizacao.
- Estoque reflete imediatamente as vendas do atendimento.
- Comissoes ficam consistentes por atendimento fechado.
- Agenda passa a encerrar atendimento sem navegar para PDV/Financeiro.
