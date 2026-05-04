# 18 - Mapa de Endpoints e Contratos

## Visao geral
Inventario tecnico das rotas em `src/http/app.ts` para reduzir risco de quebra de contrato frontend/backend.

## Implementado
- Auth: `/auth/login`, `/auth/me`.
- Agenda/Atendimento: `/agenda/*`, `/appointments/*`, `/appointments/:id/checkout`.
- Vendas/PDV: `/sales/products`.
- Financeiro: `/financial/*`.
- Estoque: `/inventory/*`, `/stock/*`.
- Servicos/Clientes/Profissionais: `/services*`, `/clients*`, `/professionals/performance`.
- Configuracoes: `/settings/*`.
- Comissoes/Fidelizacao: `/commissions/statement`, `/loyalty/*`, `/packages/*`, `/subscriptions/*`.
- Automacoes/Retencao/Integracoes/Billing: `/automations/*`, `/retention/*`, `/integrations/*`, `/billing/reconciliation/*`.

## Incompleto
- Falta documento de versionamento de API (v1/v2) e politica formal de deprecacao.

## Problemas
- Contratos extensos sem schema publicado externamente (OpenAPI/Swagger).

## Dependencias
Frontend `public/app.js` consome a maior parte desses endpoints diretamente.

## Impacto no funil
Contratos estaveis sao obrigatorios para manter checkout, financeiro e estoque sincronizados.
