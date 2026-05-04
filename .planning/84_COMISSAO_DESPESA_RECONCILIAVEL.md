# 84 - Comissao como despesa reconciliavel

Data: 2026-05-02
Fase: 0.2.1
Status: IMPLEMENTADA

## Objetivo da fase
Garantir que o pagamento de uma comissao pendente gere uma saida financeira real no ledger operacional.

Quando `PATCH /financial/commissions/:id/pay` marca uma comissao como `PAID`, o sistema agora cria uma `FinancialEntry` de despesa vinculada a essa comissao.

## Diagnostico do fluxo anterior
- A rota de pagamento de comissao ja exigia `idempotencyKey`.
- O backend em memoria e o backend Prisma apenas alteravam `CommissionEntry.status` para `PAID` e preenchiam `paidAt`.
- Nenhuma `FinancialEntry` era criada.
- O caixa/financeiro nao refletia a saida real de dinheiro.
- O replay idempotente retornava a mesma resposta do pagamento, mas nao havia despesa a deduplicar.

## Decisao tecnica adotada
Foi mantida a separacao entre:
- `CommissionEntry`: provisao/obrigacao operacional gerada por servico ou produto.
- `FinancialEntry`: movimentacao financeira efetiva quando a comissao e paga.

A despesa criada usa:
- `kind=EXPENSE`
- `source=COMMISSION`
- `category=COMISSAO`
- `referenceType=COMMISSION`
- `referenceId=<commissionEntry.id>`
- `professionalId=<commissionEntry.professionalId>`
- `unitId=<commissionEntry.unitId>`
- `amount=<commissionEntry.commissionAmount>`
- `occurredAt=<paidAt>`
- `description=Pagamento de comissao`

Como `FinancialEntry.source` era tipado pela enum Prisma `RevenueSource`, a menor alteracao segura foi expandir a enum para incluir `COMMISSION`. Isso permite reaproveitar a constraint unica existente:

`FinancialEntry(unitId, referenceType, referenceId, source)`

Com `referenceType=COMMISSION`, `referenceId=<commissionId>` e `source=COMMISSION`, o banco passa a bloquear duplicidade de despesa por comissao.

## Arquivos alterados
- `src/domain/types.ts`
- `src/domain/rules.ts`
- `src/application/operations-service.ts`
- `src/application/prisma-operations-service.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260502_commission_expense_source/migration.sql`
- `tests/api.spec.ts`
- `.planning/84_COMISSAO_DESPESA_RECONCILIAVEL.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Regra de negocio implementada
Ao pagar uma comissao:
1. A comissao permanece bloqueada se estiver `CANCELED`.
2. Se estiver `PENDING`, passa para `PAID`.
3. `paidAt` e preenchido com o valor informado ou com a data atual.
4. Uma despesa financeira e criada para representar a saida de caixa.
5. A resposta do endpoint inclui `financialEntryId`.
6. Se a comissao ja estiver `PAID`, o sistema retorna a despesa ja vinculada ou cria a despesa faltante em caso de legado, sem duplicar.

## Comportamento idempotente
- Mesma `idempotencyKey` com mesmo payload faz replay da mesma resposta.
- Mesma `idempotencyKey` com payload diferente retorna conflito `409`.
- Ausencia de `idempotencyKey` continua retornando `400` antes de efeitos colaterais.
- Repetir o pagamento de uma comissao ja paga com outra chave nao cria nova despesa.
- No backend Prisma, a operacao ocorre em transacao com `IdempotencyRecord`, update de comissao e upsert da despesa.
- No backend em memoria, a resposta idempotente e persistida no mapa de idempotencia e a despesa e procurada por `referenceType/referenceId/source` antes de criar.

## Impacto no financeiro
- `GET /financial/transactions` passa a listar a despesa com `referenceType=COMMISSION`, `referenceId=<commissionId>`, `source=COMMISSION` e `commissionId`.
- `GET /financial/entries` passa a expor a despesa de comissao como `EXPENSE`.
- `GET /financial/summary` passa a refletir a saida em `summary.expenses` e `cashFlow.outgoing`.
- O lucro estimado do resumo financeiro passou a subtrair apenas comissoes pendentes como provisao; comissoes pagas ja entram em `expenses`, evitando dupla contagem.
- O frontend ja enviava `idempotencyKey` na acao de pagar comissao e recarrega o financeiro apos sucesso; nao foi necessario ajuste visual.

## Testes adicionados
Teste em `tests/api.spec.ts`:
- `paga comissao criando despesa financeira reconciliavel e idempotente`

Coberturas:
- prepara comissao `PENDING`;
- paga com `idempotencyKey`;
- valida status `PAID`;
- valida `financialEntryId`;
- valida replay sem duplicar despesa;
- valida conflito por payload divergente com mesma chave;
- valida nova tentativa sobre comissao ja paga sem duplicar despesa;
- valida listagem de transacoes com `EXPENSE`, `COMISSAO`, `COMMISSION`, `professionalId`, `referenceType` e `referenceId`;
- valida `/financial/entries`;
- valida `/financial/summary`.

Testes da Fase 0.1.1 para ausencia de `idempotencyKey` continuam cobrindo `400`.

## Comandos executados
- `npm.cmd run db:generate`: passou apos permissao de rede para baixar/verificar binario Prisma.
- `npm.cmd run test`: passou (`54 passed | 1 skipped`).
- `npm.cmd run build`: passou.
- `npm.cmd run smoke:api`: passou.
- `npm.cmd run test:db`: passou (`1 passed`).

Observacoes de ambiente:
- `npm run db:generate` via PowerShell falhou por Execution Policy do `npm.ps1`; usado `npm.cmd`.
- Primeiras tentativas de `test` e `test:db` no sandbox falharam com `spawn EPERM` ao carregar config do Vite; ambas passaram fora do sandbox.
- Primeira tentativa de `smoke:api` falhou porque a API tentou baixar/verificar engine Prisma sem rede; passou fora do sandbox.

## Pendencias reais
- Ainda nao existe estorno/devolucao rastreavel.
- Ainda nao existe auditoria geral persistente append-only.
- Ainda nao existe lote de pagamento de varias comissoes em uma unica saida.
- `FinancialEntry.referenceType` segue como texto livre no Prisma; a origem ficou rastreavel por convencao controlada e constraint composta.

## Proxima etapa recomendada
Fase 0.2.2 - Estornos/devolucoes rastreaveis, preservando venda/receita original e criando movimentos reversos financeiros/estoque/comissao sem apagamento destrutivo.
