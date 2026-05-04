# 20 - Matriz de Permissoes por Rota

## Visao geral
Matriz de acesso derivada de `getPolicyForRoute` em `src/http/app.ts`.

## Implementado
- Perfis: `owner`, `recepcao`, `profissional`.
- Rotas publicas: `health`, `catalog`, `auth/login`, webhook billing inbound.
- Rotas owner-only: multiunit, billing reconciliation, automacoes/integracoes sensiveis, ajustes administrativos.
- Tenant guard por `unitId` em query/body com bloqueio de mismatch.

## Incompleto
- Falta documento formal em tabela endpoint x role x acao (read/write).

## Problemas
- Cobertura de testes RBAC nao e total para todo crescimento de endpoints.

## Dependencias
Depende de JWT (`src/http/security.ts`) e parsers Zod por rota.

## Impacto no funil
Permissao incorreta pode expor dados financeiros e quebrar segregacao operacional.
