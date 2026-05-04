# 71 - Modelo de Dados e IDs

Data: 2026-04-30
Objetivo: documentar identificacao, tenant, timestamps, relacoes e constraints das entidades principais.

## Padrao atual
O sistema usa `String @id` e gera IDs com `crypto.randomUUID()` na aplicacao. Exemplos: agendamento em `src/application/barbershop-engine.ts:80`, cliente em `src/application/prisma-operations-service.ts:289`, venda em `src/application/prisma-operations-service.ts:2560`, financeiro em `src/domain/rules.ts:147` e estoque em `src/domain/rules.ts:204`.

Nao ha identificadores de negocio legiveis como numero de venda, recibo, protocolo de devolucao, SKU obrigatorio ou numero de transacao.

## Matriz das entidades
| Entidade | Modelo | PK | Identificador unico | Tenant | Timestamps | Relacoes | Constraints de duplicidade |
|---|---|---|---|---|---|---|---|
| customers | `Client` | `id` | Nao ha | `businessId` | `createdAt`, `updatedAt` | Unit, Appointment, ProductSale, Loyalty, Packages, Subscriptions | Apenas indices; validacao por telefone na app |
| appointments | `Appointment` | `id` | Nao ha | `unitId` | `createdAt`, `updatedAt` | Unit, Client, Professional, Service, History, Commissions | Sem unique; conflito validado na app |
| sales | `ProductSale` | `id` | Nao ha | `unitId` | `createdAt`; sem `updatedAt` | Unit, Client, Professional, Items, Commissions | Sem unique/idempotencia |
| saleItems | `ProductSaleItem` | `id` | Nao ha | Herdado da venda | Sem timestamps | ProductSale, Product | Sem unique por produto na venda |
| products | `Product` | `id` | Nao ha SKU | `businessId` | `createdAt`, `updatedAt` | SaleItems, StockMovements, ServiceConsumption | Sem unique por nome/SKU |
| inventoryMovements | `StockMovement` | `id` | Nao ha | `unitId` | `createdAt`; sem `updatedAt` | Unit, Product | Sem unique/idempotencia |
| financialTransactions | `FinancialEntry` | `id` | Nao ha | `unitId` | `createdAt`, `updatedAt` | Unit + referencia textual | Sem unique/status |
| commissions | `CommissionEntry` | `id` | Nao ha | `unitId` | `createdAt`; sem `updatedAt` | Professional, Appointment?, ProductSale? | Sem unique por origem |
| refunds | Ausente | Ausente | Ausente | Ausente | Ausente | Ausente | Ausente |
| users | Ausente no banco | `AuthUser.id` em env/memoria | Email em env | `unitIds` no token | Ausente | Ausente | Ausente |
| units/businesses | `Unit` | `id` | Nao ha slug/documento | Raiz | `createdAt`, `updatedAt` | Relaciona a maioria dos dominios | Sem unique de documento/slug |

## Evidencias principais
- `Unit`: `prisma/schema.prisma:91` a `prisma/schema.prisma:121`.
- `Client`: `prisma/schema.prisma:302` a `prisma/schema.prisma:326`.
- `Product`: `prisma/schema.prisma:328` a `prisma/schema.prisma:346`.
- `Appointment`: `prisma/schema.prisma:367` a `prisma/schema.prisma:390`.
- `AppointmentHistory`: `prisma/schema.prisma:392` a `prisma/schema.prisma:402`.
- `FinancialEntry`: `prisma/schema.prisma:404` a `prisma/schema.prisma:424`.
- `CommissionEntry`: `prisma/schema.prisma:426` a `prisma/schema.prisma:447`.
- `ProductSale`: `prisma/schema.prisma:449` a `prisma/schema.prisma:462`.
- `ProductSaleItem`: `prisma/schema.prisma:464` a `prisma/schema.prisma:476`.
- `StockMovement`: `prisma/schema.prisma:478` a `prisma/schema.prisma:493`.
- Usuarios default/env: `src/http/security.ts:32` a `src/http/security.ts:54` e `src/http/security.ts:111`.

## Problemas encontrados

### 1. Ausencia de IDs de negocio legiveis
- Problema: Entidades criticas tem apenas UUID tecnico.
- Evidencia no codigo: Modelos `ProductSale`, `FinancialEntry`, `StockMovement` e `CommissionEntry` nao possuem `saleNumber`, `transactionNumber`, `movementNumber` ou equivalente em `prisma/schema.prisma:404` a `prisma/schema.prisma:493`.
- Impacto: Operacao e suporte dependem de UUIDs opacos.
- Risco: Conciliacao e atendimento ao cliente ficam lentos e frageis.
- Recomendacao CTO: Criar identificadores sequenciais por unidade para venda, transacao, movimento e devolucao.
- Prioridade: P1

### 2. Cliente duplicado por telefone nao e bloqueado no banco
- Problema: A regra existe na aplicacao, nao como constraint.
- Evidencia no codigo: Indice nao unico em `prisma/schema.prisma:324` a `prisma/schema.prisma:325`; validacao `findFirst` em `src/application/prisma-operations-service.ts:273`.
- Impacto: Concorrencia/importacao pode duplicar cliente.
- Risco: Historico, LTV e WhatsApp fragmentados.
- Recomendacao CTO: Criar `normalizedPhone` e `@@unique([businessId, normalizedPhone])`.
- Prioridade: P0

### 3. Venda, financeiro e comissao nao tem idempotencia/unique
- Problema: Nao ha constraint por origem ou chave de operacao.
- Evidencia no codigo: `ProductSale`, `FinancialEntry` e `CommissionEntry` sem `@@unique` em `prisma/schema.prisma:404`, `prisma/schema.prisma:426` e `prisma/schema.prisma:449`.
- Impacto: Retry pode duplicar efeitos.
- Risco: Receita, estoque e comissao duplicados.
- Recomendacao CTO: Adicionar `idempotencyKey` e uniques por referencia de origem.
- Prioridade: P0

### 4. Usuarios nao sao entidade persistente
- Problema: Auth depende de defaults/env.
- Evidencia no codigo: `DEFAULT_USERS` em `src/http/security.ts:32`; `AUTH_USERS_JSON` em `src/http/security.ts:111`.
- Impacto: Sem ciclo de vida de usuario, bloqueio, senha hash e auditoria persistente.
- Risco: Inadequado para SaaS real.
- Recomendacao CTO: Criar `User` e `UserUnitRole` persistentes.
- Prioridade: P0

### 5. `businessId` e `unitId` misturados
- Problema: O tenant e representado por nomes diferentes.
- Evidencia no codigo: `Client.businessId` em `prisma/schema.prisma:304`, `Product.businessId` em `prisma/schema.prisma:330`, `Appointment.unitId` em `prisma/schema.prisma:369`, `FinancialEntry.unitId` em `prisma/schema.prisma:406`.
- Impacto: Maior risco de queries inconsistentes.
- Risco: Vazamento multiunidade ou bugs de filtro.
- Recomendacao CTO: Padronizar em `unitId` ou documentar e migrar alias legado.
- Prioridade: P1
