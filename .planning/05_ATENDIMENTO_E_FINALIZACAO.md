# 05 - Atendimento e Finalizacao

## 1. Visao geral do modulo
Controla ciclo operacional do atendimento desde confirmacao ate conclusao do servico.

## 2. O que ja esta implementado (baseado no codigo)
- Maquina de estado com transicoes validas (`canTransitionAppointmentStatus`).
- Conclusao classica (`POST /appointments/:id/complete`) e fechamento unificado (`POST /appointments/:id/checkout`).
- Checkout unificado registra servico, itens de produto, pagamento, comissao, estoque e metricas do cliente em fluxo unico.
- Bloqueios: dupla finalizacao, estoque insuficiente e divergencia de total esperado.

## 3. O que esta incompleto
- Concilicao contabil fina de comissao paga no financeiro ainda demanda endurecimento de politica.
- Nao ha idempotencia explicita de request no checkout (alem de validacao de estado).

## 4. Problemas identificados
- Fluxo e robusto, mas complexo; regressao pode ocorrer sem cobertura de testes dirigida por contrato de checkout.
- UI de fechamento ainda reside em modulo monolitico sem separacao por dominio.

## 5. Dependencias com outros modulos
- Agenda, financeiro, estoque, comissoes, clientes, servicos e profissionais.

## 6. Impacto no fluxo principal
Modulo critico de monetizacao. A maturidade dele define consistencia de caixa, comissao e historico do cliente.
