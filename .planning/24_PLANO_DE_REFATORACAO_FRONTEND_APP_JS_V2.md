# 24 - Plano de Refatoracao Frontend app.js (V2)

## Visao geral
Plano para quebrar `public/app.js` em modulos orientados a dominio.

## Implementado
- Ja existe separacao parcial em `public/modules/*`, mas orquestracao ainda centralizada.

## Incompleto
- Falta fatiamento por contextos: agenda, financeiro, estoque, clientes, automacoes.
- Falta camada de API client unificada com contratos tipados.

## Problemas
- Alto acoplamento de estado global e listeners.
- Manutencao lenta e maior risco de efeitos colaterais.

## Dependencias
Depende de preservacao dos contratos HTTP existentes.

## Impacto no funil
Refatorar reduz regressao no core operacional e acelera evolucao de produto.

## Fases recomendadas
1. Extrair `api-client.js` e `auth-session.js`.
2. Extrair stores por modulo.
3. Migrar handlers por tela para arquivos dedicados.
4. Remover estado global residual com validacao por smoke tests.
