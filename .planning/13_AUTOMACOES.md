# 13 - Automacoes

## 1. Visao geral do modulo
Orquestra regras e execucoes de campanhas (reativacao, risco etc.), com telemetria e integracoes de webhook.

## 2. O que ja esta implementado (baseado no codigo)
- Regras: `GET/POST/PATCH /automations/rules`, ativar/desativar.
- Execucao: `POST /automations/campaigns/execute`, `GET /automations/executions`, reprocessamento.
- Retencao e scoring: endpoints `/retention/*` e `/retention/scoring/*`.
- Integracoes webhook inbound/outbound e logs: `/integrations/webhooks/*`.

## 3. O que esta incompleto
- Execucao e simulada/sincrona no processo da API (sem fila externa robusta).
- Playbooks ainda sem motor de conteudo e roteamento por provedor real de mensagens.

## 4. Problemas identificados
- Dependencia alta da qualidade dos dados de cliente/agenda para score e segmentacao.
- Idempotencia e retries existem em nivel funcional, mas sem infraestrutura dedicada de mensageria.

## 5. Dependencias com outros modulos
- Clientes, agenda, historico, integracoes externas, permissoes e dashboard.

## 6. Impacto no fluxo principal
Impacta recuperacao de receita e previsibilidade futura do funil, mas depende da maturidade do core e da qualidade dos dados operacionais.
