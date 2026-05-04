# 77 - Permissoes e Seguranca

Data: 2026-04-30
Objetivo: auditar acesso de `owner`, `recepcao` e `profissional` a rotas sensiveis.

## Modelo atual
- Roles: `owner`, `recepcao`, `profissional` em `src/http/security.ts:3`.
- Usuarios default em `src/http/security.ts:32`.
- Token carrega `unitIds` e `activeUnitId` em `src/http/security.ts:140`.
- Hook valida role e unidade em `src/http/app.ts:1114`.

## Politica atual resumida
| Grupo | Roles | Evidencia | Avaliacao |
|---|---|---|---|
| Auth/me | todos | `src/http/app.ts:64` | OK |
| Multiunit | owner | `src/http/app.ts:67` | OK |
| Billing reconciliation | owner | `src/http/app.ts:70` | OK |
| Audit events | owner | `src/http/app.ts:77` | OK |
| Integracoes/automacoes | owner | `src/http/app.ts:81` | OK |
| Settings | owner | `src/http/app.ts:98` | OK |
| Appointments | todos | `src/http/app.ts:119` | Parcial; profissional deveria ter escopo proprio |
| Query routes financeiras/estoque/clientes | todos | `src/http/app.ts:133` | Amplo demais |
| Default body routes | owner, recepcao | `src/http/app.ts:169` | Bom default |

## Pontos positivos
- Bloqueio de mismatch de `unitId` em `src/http/app.ts:1154`.
- Sobrescrita de `unitId` para unidade ativa em `src/http/app.ts:1157`.
- Testes cobrem auth basica e tenant mismatch em `tests/api.spec.ts:2347` a `tests/api.spec.ts:2419`.

## Problemas encontrados

### 1. Profissional acessa financeiro sensivel de consulta
- Problema: Rotas financeiras de consulta estao liberadas para `profissional`.
- Evidencia no codigo: `/financial/transactions`, `/financial/commissions`, `/financial/reports`, `/financial/management/overview` em `src/http/app.ts:141` a `src/http/app.ts:147`, liberadas em `src/http/app.ts:166`.
- Impacto: Profissional pode visualizar caixa, relatorios e comissoes alem do necessario.
- Risco: Exposicao de dados sensiveis.
- Recomendacao CTO: Owner para financeiro gerencial; profissional apenas propria comissao/performance.
- Prioridade: P1

### 2. Profissional acessa inventario/estoque geral
- Problema: `/inventory` e `/stock/overview` liberados para todos.
- Evidencia no codigo: `src/http/app.ts:142` e `src/http/app.ts:148`.
- Impacto: Custos e estoque podem ser expostos.
- Risco: Vazamento de margem/operacao.
- Recomendacao CTO: Restringir estoque a owner/recepcao ou criar visao sem custo.
- Prioridade: P2

### 3. Rotas por id dependem de verificacao manual de tenant
- Problema: `/appointments/:id/*` nao usa `unitSource`; passa `activeUnitId` para a camada interna.
- Evidencia no codigo: Politica em `src/http/app.ts:119`; chamadas com `req.auth?.activeUnitId` em `src/http/app.ts:1631`, `src/http/app.ts:1648`, `src/http/app.ts:1681`, `src/http/app.ts:1705`, `src/http/app.ts:1729`, `src/http/app.ts:1757`.
- Impacto: Cada funcao precisa lembrar de validar unidade.
- Risco: Bug futuro pode abrir cross-tenant.
- Recomendacao CTO: Criar helper obrigatorio `findResourceForActiveUnit` e testes por rota.
- Prioridade: P1

### 4. Usuarios e senhas nao sao persistentes
- Problema: Usuarios vem de env/default com senha em texto.
- Evidencia no codigo: `AuthUser.password` em `src/http/security.ts:24`; defaults em `src/http/security.ts:32`.
- Impacto: Sem governanca de usuario SaaS.
- Risco: Offboarding e auditoria fracos.
- Recomendacao CTO: Criar `User` persistente com senha hash, status e roles por unidade.
- Prioridade: P0

### 5. Segredos default em producao seriam perigosos
- Problema: Ha fallback para secrets de dev.
- Evidencia no codigo: `getAuthSecret` em `src/http/security.ts:72`; `getBillingWebhookSecret` em `src/http/security.ts:76`.
- Impacto: Deploy mal configurado fica vulneravel.
- Risco: Token/webhook falsificavel.
- Recomendacao CTO: Falhar startup em producao sem secrets fortes.
- Prioridade: P0
