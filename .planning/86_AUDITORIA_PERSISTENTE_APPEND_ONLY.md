# 86 - Auditoria persistente append-only

Data: 2026-05-02
Fase: 0.2.3
Status: IMPLEMENTADA

## Objetivo da fase
Implementar uma trilha de auditoria persistente, consultavel e append-only para acoes criticas do sistema.

## Problema anterior
A auditoria geral de `/audit/events` ficava em array local dentro do app HTTP. Isso permitia observar eventos sensiveis durante a execucao, mas o historico era perdido em restart, nao podia ser consultado com confianca no backend Prisma e nao servia como prova operacional duravel.

## Modelo adotado
Foi criado o modelo persistente `AuditLog` no Prisma e o tipo de dominio `AuditEvent`.

Campos persistidos:
- `id`
- `unitId`
- `actorId`
- `actorEmail`
- `actorRole`
- `action`
- `entity`
- `entityId`
- `route`
- `method`
- `requestId`
- `idempotencyKey`
- `beforeJson`
- `afterJson`
- `metadataJson`
- `createdAt`

No backend em memoria, os eventos ficam em `InMemoryStore.auditEvents`, com o mesmo contrato logico do modelo persistente.

## Helper central
Foi criado `AuditRecorder` em `src/application/audit-service.ts`.

Responsabilidades:
- montar o evento padronizado;
- gravar em `AuditLog` quando `DATA_BACKEND=prisma`;
- gravar no array em memoria quando `DATA_BACKEND=memory`;
- listar eventos com filtros simples;
- evitar duplicidade enganosa em replay idempotente;
- logar falhas de auditoria sem quebrar a operacao principal.

## Decisao sobre transacao
Nesta fase, a auditoria e registrada no helper HTTP logo apos a operacao de negocio retornar com sucesso.

Decisao: falha nao critica de auditoria nao derruba a operacao principal; ela e registrada em log como `audit.record_failed`.

Limitacao real: a auditoria ainda nao esta dentro da mesma transacao Prisma dos fluxos financeiros. Isso evita uma refatoracao grande agora, porque o evento precisa de dados HTTP como rota, metodo, actor, requestId/correlation-id e idempotencyKey. A proxima evolucao recomendada e introduzir outbox/audit context transacional nos servicos criticos.

## Acoes auditadas
As chamadas existentes a `recordAudit` foram migradas para o helper persistente. Entre as acoes criticas cobertas estao:
- criacao, alteracao, remarcacao, status, conclusao e checkout de agendamento;
- estorno de atendimento;
- venda de produto;
- devolucao de produto;
- lancamento financeiro manual;
- criacao, edicao e exclusao de transacao financeira manual;
- pagamento de comissao;
- ajuste/movimentacao manual de estoque;
- alteracoes sensiveis de servicos, produtos, metas, configuracoes, regras de comissao, horarios, time e automacoes.

GET/listagens nao sao auditados.

## Replay idempotente
Decisao adotada:
- a primeira execucao idempotente registra o evento principal;
- replay com a mesma `idempotencyKey` nao duplica efeito de negocio;
- o helper tambem evita criar outro evento principal com mesma `action`, `entity` e `entityId` quando a chamada tem `idempotencyKey`;
- nao foi criado evento separado `IDEMPOTENCY_REPLAY` nesta fase.

Assim, um replay nao parece uma segunda execucao real no historico de auditoria.

## Regra append-only
O fluxo normal da aplicacao apenas insere eventos.

Nao foram criadas rotas de update/delete para auditoria. `PATCH /audit/events` e `DELETE /audit/events` seguem sem handler e retornam 404/405.

## Endpoint de consulta
`GET /audit/events`

Regras:
- acesso restrito a `owner`;
- `unitId` obrigatorio;
- com auth habilitado, o middleware preserva escopo da unidade ativa;
- ordenacao por `createdAt desc`;
- limite maximo de 500;
- filtros suportados: `entity`, `action`, `actorId`, `start`, `end`, `limit`.

## Testes adicionados
Em `tests/api.spec.ts`:
- auditoria de pagamento de comissao com actor, role, email, route, method, requestId e idempotencyKey;
- replay do pagamento de comissao sem evento duplicado;
- auditoria de devolucao de produto;
- `GET /audit/events` permitido para owner;
- `GET /audit/events` bloqueado para recepcao;
- filtro por entity/action/unitId;
- ordenacao desc por `createdAt`;
- append-only por ausencia de PATCH/DELETE;
- evento ja criado permanece inalterado apos outro fluxo.

## Comandos executados
- `npm.cmd run db:generate`: primeira tentativa falhou por rede/sandbox ao verificar engine Prisma; passou fora do sandbox.
- `npm.cmd run test`: primeira tentativa falhou por `spawn EPERM` do Vite no sandbox; passou fora do sandbox (`58 passed | 1 skipped`).
- `npm.cmd run build`: passou.
- `npm.cmd run smoke:api`: primeira tentativa falhou por verificacao de engine Prisma no sandbox; passou fora do sandbox.
- `npm.cmd run test:db`: primeira tentativa falhou por `spawn EPERM` do Vite no sandbox; passou fora do sandbox (`1 passed`).
- `npm.cmd run build`: rerodado apos ajuste final no filtro Prisma do `AuditRecorder`; passou.
- Observacao: uma nova tentativa de rerodar `npm.cmd run test` apos esse ajuste final foi bloqueada pelo limite de uso da ferramenta de execucao. A suite completa ja havia passado antes do ajuste, e o build TypeScript passou depois dele.

## Limitacoes reais
- Auditoria Prisma ainda nao e transacional com os efeitos financeiros; e persistente no fluxo normal, mas pode haver lacuna se a gravacao de auditoria falhar depois do negocio.
- Ainda nao ha usuario persistente real com FK para actor; `actorId`, `actorEmail` e `actorRole` vem da sessao/token atual.
- Nao foi implementada tela grande nova de auditoria.
- Nao foram criadas permissoes refinadas alem da regra atual de owner para consulta.

## Proxima etapa recomendada
Fase 0.2.4 - Validacao PostgreSQL real/robustez, com foco em concorrencia, constraints, replays e eventual evolucao para outbox/auditoria transacional nos fluxos financeiros criticos.
