# 03 - Fluxo Funil Core

## 1. Visao geral do modulo
Funil core mapeado no codigo: Agendamento -> Atendimento -> Finalizacao -> Pagamento -> Financeiro -> Comissao -> Estoque -> Historico do Cliente.

## 2. O que ja esta implementado (baseado no codigo)
- Agendamento: `POST /appointments`, validacao de conflito e sugestoes de horario.
- Atendimento: transicoes `CONFIRMED` e `IN_SERVICE` por `PATCH /appointments/:id/status`.
- Finalizacao + pagamento unificados: `POST /appointments/:id/checkout` com `paymentMethod` obrigatorio.
- Financeiro: lancamentos automaticos de servico/produto + consultas analiticas (`/financial/*`).
- Comissao: provisao automatica `PENDING` para servico/produto e pagamento manual por endpoint.
- Estoque: baixa automatica em venda/checkout e bloqueio de estoque insuficiente.
- Historico cliente: atualizacao de metricas de recorrencia e valor no fechamento.

## 3. O que esta incompleto
- Fechamento contabil da comissao como despesa financeira ainda nao esta totalmente padronizado em reconciliacao.
- Algumas rotas de ajuste/manual permitem variacao de qualidade de dados (dependem de input humano).

## 4. Problemas identificados
- Sem trilha de auditoria persistida para todo o funil.
- Pagamento e metodo sao obrigatorios no checkout, mas validacoes de conciliacao externa (gateway) ainda sao modulo separado de billing.

## 5. Dependencias com outros modulos
- Depende de clientes, servicos, profissionais, estoque, financeiro, comissoes e permissoes.

## 6. Impacto no fluxo principal
O funil core esta funcional e e o ponto mais maduro do sistema. E a melhor base para evolucao de IA/WhatsApp, desde que os gaps de governanca e dados sejam fechados.
