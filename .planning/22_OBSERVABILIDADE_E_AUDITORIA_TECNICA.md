# 22 - Observabilidade e Auditoria Tecnica

## Visao geral
Plano de rastreabilidade tecnica para incidentes operacionais e compliance.

## Implementado
- `correlationId` por request em partes do fluxo.
- Registro de eventos de auditoria em memoria (`/audit/events`).
- Logs de webhooks e billing em entidades dedicadas.

## Incompleto
- Auditoria nao persistente para todos eventos sensiveis.
- Sem stack de metricas/traces centralizada (APM/OTel).

## Problemas
- Reinicio da API perde historico de auditoria em memoria.
- Dificuldade de RCA sem trilha persistida e dashboards de erro.

## Dependencias
Depende de middleware HTTP, regras de negocio e integracoes externas.

## Impacto no funil
Sem observabilidade forte, incidentes em checkout/financeiro demoram mais para detectar e corrigir.
