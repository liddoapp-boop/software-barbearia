# Idempotencia Obrigatoria

Data: 2026-05-02

## Decisao
As operacoes criticas abaixo nao podem executar efeito colateral sem `idempotencyKey`.

Rotas protegidas:
- `POST /appointments/:id/checkout`
- `POST /sales/products`
- `POST /financial/transactions`
- `POST /financial/manual-entry`
- `PATCH /financial/commissions/:id/pay`

## Contrato HTTP
A chave pode ser enviada por:
- body: `idempotencyKey`
- header: `idempotency-key`
- header: `x-idempotency-key`

Quando ausente ou vazia, a API retorna `400 Bad Request` com:

```json
{ "error": "idempotencyKey é obrigatória para esta operação" }
```

Nenhuma rota protegida deve chamar servico de dominio, gravar auditoria ou alterar estado antes dessa validacao.

## Impacto no frontend
`public/app.js` passou a gerar uma chave nova por tentativa de operacao em:
- finalizar atendimento via checkout
- vender produto
- criar lancamento financeiro manual pela UI (`POST /financial/transactions`)
- pagar comissao

A chave nao e global, nao e fixa e nao deve ser reaproveitada entre operacoes diferentes.

Nao ha suite automatizada dedicada ao frontend estatico nesta etapa. A validacao do frontend foi feita por inspecao direta de `public/app.js` e pelo fluxo `smoke:api`, preservando o padrao existente de envio da chave no body da requisicao.

## Testes adicionados/ajustados
Cobertura em `tests/api.spec.ts`:
- rota critica sem `idempotencyKey` retorna 400
- checkout sem chave nao finaliza atendimento
- venda sem chave nao cria venda/receita de produto
- financeiro manual sem chave nao cria lancamento
- `POST /financial/transactions` sem chave nao cria transacao
- pagamento de comissao sem chave nao altera status da comissao
- `/financial/manual-entry` tem replay idempotente
- mesma `idempotencyKey` + mesmo payload retorna replay seguro
- mesma `idempotencyKey` + payload diferente retorna 409
- operacoes com chave continuam funcionando normalmente

## Validacao executada
- `npm.cmd run test`: passou, 53 testes, 1 skipped
- `npm.cmd run build`: passou
- `npm.cmd run smoke:api`: passou
- `npm.cmd run test:db`: passou contra backend Prisma/PostgreSQL

Observacao local: `npm run ...` via PowerShell pode ser bloqueado por Execution Policy (`npm.ps1`). Usar `npm.cmd run ...` no Windows.

## PostgreSQL real
Comando esperado:

```bash
npm.cmd run test:db
```

Pre-requisitos:
- PostgreSQL ativo
- `DATABASE_URL` apontando para PostgreSQL real
- `DATA_BACKEND=prisma`
- `RUN_DB_TESTS=1`
- migrations/constraints aplicadas
- client Prisma gerado (`npm.cmd run db:generate`)
- banco acessivel localmente ou por rede

O script `test:db` ja define `RUN_DB_TESTS=1` e `DATA_BACKEND=prisma`; `DATABASE_URL` deve vir do ambiente local.

Fluxo com Docker Compose, quando houver `docker-compose` local configurado para Postgres:

```bash
npm.cmd run db:up
npm.cmd run db:push
npm.cmd run test:db
```

Checklist de constraints no PostgreSQL real:
- `IdempotencyRecord`: unique por `unitId + action + idempotencyKey`
- `FinancialEntry`: unique por `unitId + idempotencyKey`
- `FinancialEntry`: unique por `unitId + referenceType + referenceId + source`
- `CommissionEntry`: unique por `unitId + idempotencyKey`
- `CommissionEntry`: uniques por origem critica de appointment/product sale
- `ProductSale`: unique por `unitId + idempotencyKey`
- replay com mesma chave/payload retorna a resposta persistida
- reuso de chave com payload divergente retorna 409

## EPERM Prisma no Windows/OneDrive
Risco operacional local observado em Windows/OneDrive: processos de Node/Vite/Prisma podem falhar com `EPERM` ao criar subprocessos ou manipular arquivos do client Prisma.

Procedimento recomendado:
1. Fechar dev server.
2. Fechar processos Node pendurados.
3. Parar watchers.
4. Remover `node_modules/.prisma` se necessario.
5. Rodar `npm install` novamente se a instalacao local estiver inconsistente.
6. Rodar `npx prisma generate` ou `npm.cmd run db:generate`.
7. Evitar executar o projeto em pasta sincronizada pelo OneDrive; preferir, por exemplo, `C:\dev\software-barbearia`.

Esse risco nao bloqueia entrega quando `test`, `build`, `smoke:api` e `test:db` rodam verdes fora do bloqueio local/sandbox.

## Status final
Fase 0.1.1 concluida: as cinco rotas criticas exigem `idempotencyKey` antes de qualquer efeito colateral, o frontend gera chave para as acoes criticas expostas na UI, `/financial/manual-entry` tem replay/conflito cobertos por teste, e as validacoes finais passaram.
