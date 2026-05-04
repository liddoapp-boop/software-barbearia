# 21 - Matriz de Testes e Cobertura

## Visao geral
Estado de testes automatizados com foco em funil operacional e integracoes.

## Implementado
- `tests/api.spec.ts`: fluxo agenda -> atendimento -> checkout -> financeiro/estoque/comissao + auth/RBAC + automacoes/billing.
- `tests/engine.spec.ts`: regras de dominio (conflito, transicao, comissao, venda).
- `tests/db.integration.spec.ts`: persistencia ponta a ponta em backend Prisma.

## Incompleto
- Falta matriz explicitando cobertura por endpoint e cenarios negativos por modulo.
- Falta suite frontend (UI/integracao de componentes).

## Problemas
- Regressao de UI pode passar despercebida mesmo com backend coberto.

## Dependencias
Execucao depende de `vitest`, opcionalmente Postgres com `RUN_DB_TESTS=1`.

## Impacto no funil
Boa cobertura do core reduz risco operacional; lacunas de UI e RBAC ainda precisam fechar.
