# 25 - Plano de Evolucao IA/WhatsApp

## Visao geral
Roadmap para entrada segura de IA/WhatsApp em cima do core operacional ja existente.

## Implementado
- Base de automacoes, scoring de retencao, regras e logs de webhook.
- Atalhos de WhatsApp no frontend para operacao manual.

## Incompleto
- Orquestracao de campanhas em fila robusta.
- Templates e politicas de consentimento/LGPD formalizadas no produto.

## Problemas
- IA sobre dados inconsistentes amplifica erro operacional.
- Sem observabilidade completa, ROI de automacao fica dificil de medir com confianca.

## Dependencias
Clientes, agenda, historico, automacoes, integracoes e permissoes.

## Impacto no funil
Bem implementado, aumenta reativacao e ocupacao. Mal implementado, gera ruido operacional e risco de marca.

## Sequencia recomendada
1. Fechar gaps P0 de cadastro/permissao/auditoria.
2. Implementar campanha semi-automatica com aprovacao humana.
3. Medir conversao por coorte e canal.
4. Evoluir para playbooks de IA com guardrails.
