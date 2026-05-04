# 04 - Agenda

## 1. Visao geral do modulo
Gestao de agenda operacional com criacao, confirmacao, inicio, remarcacao, cancelamento, no-show e finalizacao.

## 2. O que ja esta implementado (baseado no codigo)
- Endpoints: `/agenda/day`, `/agenda/range`, `/appointments`, `/appointments/:id`, `:id/reschedule`, `:id/status`, `:id/checkout`.
- Regra de conflito centralizada por sobreposicao real e status ativos (`SCHEDULED`, `CONFIRMED`, `IN_SERVICE`).
- Sugestao automatica de horarios alternativos (`POST /appointments/suggestions`).
- UI com visao lista/cards, fila ativa, indicadores de atraso/falta e acoes por status.

## 3. O que esta incompleto
- Nomenclatura tecnica fragmentada (`agenda.js`, `agendamento.js`, `agendamentos.js`).
- Ainda sem camada dedicada de observabilidade para incidentes de agenda em producao.

## 4. Problemas identificados
- Alto acoplamento das acoes da agenda dentro de `public/app.js`.
- Validacoes locais e remotas coexistem; qualquer divergencia futura pode reabrir bug de conflito.

## 5. Dependencias com outros modulos
- Depende diretamente de clientes, profissionais, servicos e configuracoes (duracao, buffers).
- Finalizacao aciona financeiro, estoque, comissoes e historico do cliente.

## 6. Impacto no fluxo principal
E o ponto de entrada do funil core. Qualquer falha aqui bloqueia receita, atendimento e qualidade dos dados seguintes.
