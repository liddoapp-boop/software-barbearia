# 76 - Auditoria e Logs

Data: 2026-04-30
Objetivo: auditar usuario, data/hora, acao, entidade, antes/depois e motivo.

## Mecanismos atuais
- Correlation ID por request em `src/http/app.ts:1090`.
- Log HTTP no `onResponse` em `src/http/app.ts:1171`.
- Auditoria em memoria: `auditEvents` em `src/http/app.ts:176` e `recordAudit` em `src/http/app.ts:1186`.
- Historico de agendamento: `AppointmentHistory` em `prisma/schema.prisma:392`.
- Logs de webhook: `IntegrationWebhookLog` em `prisma/schema.prisma:687`.

## Checklist
| Campo | Existe? | Observacao |
|---|---|---|
| usuario | Parcial | `actorId` em audit memory e `changedBy` em history; sem FK persistente |
| data/hora | Sim | `at`, `changedAt`, `createdAt` |
| acao | Sim | `action` |
| entidade afetada | Parcial | `entity/entityId` no audit memory |
| antes/depois | Parcial | Muitos eventos so tem `after` |
| motivo | Parcial | Nao e padrao em `recordAudit` |
| persistencia | Parcial | Historico de agenda/webhook persistem; audit geral nao |

## Acoes auditadas em memoria
Cliente criado, agendamento criado/atualizado/remarcado/status/completo/checkout, venda de produto, financeiro manual/transacao, comissao paga, produto/estoque, servicos, settings e automacoes possuem chamadas `recordAudit` espalhadas em `src/http/app.ts`.

## Politica CTO recomendada
Criar `AuditLog` append-only com `id`, `unitId`, `actorUserId`, `actorRole`, `action`, `entityType`, `entityId`, `beforeJson`, `afterJson`, `reason`, `requestId`, `ipHash`, `userAgent`, `createdAt`.

## Problemas encontrados

### 1. Auditoria geral nao e persistente
- Problema: A trilha principal fica em memoria.
- Evidencia no codigo: `auditEvents` array em `src/http/app.ts:176`; push e limite em `src/http/app.ts:1211`.
- Impacto: Reinicio perde historico.
- Risco: Sem prova de quem fez o que.
- Recomendacao CTO: Criar tabela `AuditLog` e gravar eventos criticos no banco.
- Prioridade: P0

### 2. Antes/depois incompleto
- Problema: Eventos gravam geralmente apenas `after`.
- Evidencia no codigo: `APPOINTMENT_UPDATED` em `src/http/app.ts:1660`; `FINANCIAL_TRANSACTION_UPDATED` em `src/http/app.ts:1907`.
- Impacto: Nao se sabe exatamente o que mudou.
- Risco: RCA e contestacao fracos.
- Recomendacao CTO: Capturar snapshot `before` e `after` em operacoes criticas.
- Prioridade: P1

### 3. Motivo nao e padronizado
- Problema: `recordAudit` nao tem campo `reason` padrao.
- Evidencia no codigo: Assinatura em `src/http/app.ts:1186` a `src/http/app.ts:1195`.
- Impacto: Acoes sensiveis podem ficar sem justificativa.
- Risco: Baixa governanca.
- Recomendacao CTO: Motivo obrigatorio para cancelamento, no-show, ajuste de estoque, exclusao financeira e devolucao.
- Prioridade: P1

### 4. Auditoria nao e transacional
- Problema: Handler executa operacao e depois registra auditoria.
- Evidencia no codigo: Checkout chama operacao em `src/http/app.ts:1757` e depois `recordAudit` em `src/http/app.ts:1767`.
- Impacto: Registro de negocio pode existir sem audit log.
- Risco: Trilhas incompletas.
- Recomendacao CTO: Gravar audit log dentro da transacao ou via outbox transacional.
- Prioridade: P1
