# Sprint 228 - Checkout, financeiro, comissao e auditoria local

Data: 2026-07-02

Responsavel tecnico: CTO tecnico do Projeto Software Barbearia

Escopo: preparar o ambiente Windows local, validar a suite atual, auditar checkout em `memory`, reforcar testes de financeiro, comissao, auditoria, idempotencia e rollback local, sem producao, VPS, PostgreSQL, migration, seed ou provisionamento canonico.

## 1. Objetivo

Validar localmente o caminho operacional de checkout e seus efeitos criticos:

- finalizacao explicita de atendimento;
- receita de servico;
- venda adicional de produto no checkout;
- comissao;
- auditoria;
- idempotencia;
- refund/estorno;
- estabilidade de snapshot historico.

## 2. Contexto vindo da 227.2/230.1

A etapa anterior deixou validado em local/teste:

- catalogo canonico real de servicos e produtos;
- snapshot de servico;
- remarcacao por duracao efetiva;
- cancelamento liberando slot;
- transicao `CONFIRMED -> IN_SERVICE`;
- bloqueio de conclusao generica `IN_SERVICE -> COMPLETED` via status;
- provisionamento canonico idempotente;
- legado preservado;
- nome correto `Bucha Nudread`.

## 3. 227.3 producao congelada

A Sprint 227.3 de producao segue congelada ate existir nova VPS e autorizacao explicita. Esta sprint nao usou producao, nao usou banco real e nao dependeu de VPS.

## 4. Estado do ambiente Windows

Pre-flight:

- pasta: `C:\Projetos\software-barbearia`;
- branch: `main`;
- status inicial: `## main...origin/main`;
- HEAD inicial: `7365d6d docs: planejar aplicacao controlada dos canonicos`;
- Node: `v24.14.1`;
- npm: `11.11.0`;
- `.env` ignorado por `.gitignore`;
- `.env.example` rastreado;
- `node_modules` foi instalado via `npm.cmd ci`.

## 5. Baseline

Baseline antes de alterar codigo:

- `npm.cmd test`: 8 arquivos passaram, 134 testes passaram, 21 skipped;
- `npx.cmd tsc -p tsconfig.json --noEmit`: passou;
- `npm.cmd run build`: passou.

Baseline depois das correcoes:

- `npm.cmd test`: 8 arquivos passaram, 135 testes passaram, 21 skipped;
- `npx.cmd tsc -p tsconfig.json --noEmit`: passou;
- `npm.cmd run build`: passou.

## 6. Fluxo de checkout mapeado

Rota principal:

- `POST /appointments/:id/checkout`.

Entrada relevante:

- `changedBy`;
- `completedAt` opcional;
- `paymentMethod`;
- `expectedTotal` opcional;
- `products`;
- `idempotencyKey` no corpo ou header `idempotency-key`/`x-idempotency-key`.

RBAC:

- pela politica padrao de rotas `appointments`, perfis `owner`, `recepcao` e `profissional` podem operar dentro da unidade autorizada;
- o tenant guard usa `activeUnitId` da sessao quando auth esta ativa;
- em `memory` local com `AUTH_ENFORCED=false` nos testes, o fluxo roda sem token.

Estados:

- checkout exige que o atendimento esteja em `IN_SERVICE`;
- `SCHEDULED`, `CONFIRMED`, `CANCELLED`, `NO_SHOW`, `BLOCKED` falham pela regra do motor;
- `COMPLETED` falha como atendimento ja finalizado, salvo replay idempotente ja gravado.

## 7. Regra de valor/snapshot

O valor do servico vem do snapshot do agendamento quando presente:

- `serviceNameSnapshot`;
- `servicePriceSnapshot`;
- `serviceDurationMinSnapshot`.

Se o snapshot nao existir, existe fallback legado para catalogo vivo.

O frontend envia `expectedTotal`, mas o backend recalcula o total com valor de servico efetivo e produtos. Se houver divergencia acima de tolerancia, o checkout falha.

## 8. Financeiro

O checkout cria `FinancialEntry` de servico com:

- `kind=INCOME`;
- `source=SERVICE`;
- `referenceType=APPOINTMENT`;
- `referenceId` do agendamento;
- `professionalId`;
- `customerId`;
- `paymentMethod`.

Quando ha produtos no checkout, cria tambem receita de produto com `source=PRODUCT` e `referenceType=PRODUCT_SALE`.

## 9. Comissao

A comissao e calculada pelo motor usando regra do profissional:

- servico: regra `SERVICE`;
- produto: regra `PRODUCT`;
- status inicial `PENDING`;
- pagamento de comissao segue fluxo separado em `PATCH /financial/commissions/:id/pay`;
- pagamento e idempotente e cria despesa financeira separada.

## 10. Auditoria

Em backend `memory`, a rota grava auditoria apos sucesso do checkout:

- action `APPOINTMENT_CHECKOUT_COMPLETED`;
- entity `appointment_checkout`;
- entityId do agendamento;
- route `/appointments/:id/checkout`;
- method `POST`;
- request/correlation id;
- idempotency key;
- totais de servico/produto e frequencia do cliente.

Em backend Prisma, a auditoria critica e gravada dentro da transacao via `recordCriticalAudit`.

## 11. Idempotencia

Operacoes criticas exigem `idempotencyKey`.

Para checkout:

- primeira execucao cria efeitos;
- replay com mesma chave e mesmo payload retorna a resposta persistida;
- payload divergente com mesma chave falha em conflito;
- replay nao duplica financeiro, comissao, estoque ou auditoria;
- em `memory`, falha antes de sucesso agora limpa o registro `IN_PROGRESS`, permitindo retry correto.

## 12. Estados invalidos

Validado:

- checkout sem `idempotencyKey` falha antes de efeito colateral;
- checkout sem `paymentMethod` falha;
- checkout com total inconsistente falha;
- checkout de agendamento cancelado falha sem financeiro/comissao;
- conclusao generica via status `IN_SERVICE -> COMPLETED` segue bloqueada;
- rota legada `POST /appointments/:id/complete` ainda existe como conclusao operacional separada e tambem gera financeiro/comissao.

## 13. Falha transacional

Prisma:

- checkout usa `$transaction`;
- financeiro, comissao, status, venda de produto, estoque, auditoria critica e idempotencia persistente entram na mesma transacao.

Memory:

- nao ha transacao real de banco;
- foi adicionado snapshot/rollback das colecoes afetadas por checkout;
- se a operacao falhar apos efeitos parciais, o estado em memoria volta ao estado anterior;
- tambem remove o idempotency record em progresso.

## 14. Refund/estorno

Atendimento:

- `POST /appointments/:id/refund`;
- exige atendimento `COMPLETED`;
- exige receita original de servico;
- cria `Refund`;
- cria despesa `source=REFUND`, `referenceType=APPOINTMENT_REFUND`;
- cancela comissoes pendentes;
- bloqueia estorno se a comissao do atendimento ja foi paga.

Produto:

- `POST /sales/products/:id/refund`;
- limita quantidade devolvida ao saldo devolvivel;
- cria despesa e movimentos de estoque de entrada;
- cancela comissoes pendentes quando aplicavel;
- replay nao duplica estorno.

## 15. Bugs encontrados

Bug encontrado no backend `memory`:

- `expectedTotal` era validado depois de completar atendimento e criar efeitos;
- se o total estivesse errado, a resposta falhava mas o estado podia ficar parcial;
- tambem havia risco de idempotency record ficar preso em `IN_PROGRESS`.

## 16. Correcoes feitas

Correcoes:

- adicionado rollback local no checkout em memoria para `appointments`, `financialEntries`, `commissionEntries`, `productSales`, `stockMovements` e `products`;
- adicionado `clearMemoryIdempotency` para limpar tentativa falha;
- preservado contrato HTTP e sem alteracao de schema Prisma;
- sem migration, seed ou banco.

## 17. Testes adicionados

Testes reforcados em `tests/api.spec.ts`:

- replay de checkout nao duplica auditoria `APPOINTMENT_CHECKOUT_COMPLETED`;
- checkout de agendamento cancelado falha sem efeitos colaterais;
- checkout com `expectedTotal` inconsistente preserva status, financeiro, comissao e estoque;
- retry com a mesma chave apos falha corrigida consegue concluir corretamente.

## 18. Smoke local

Smoke executado com:

- `DATA_BACKEND=memory`;
- `PORT=3333`;
- `npx.cmd tsx src/server.ts`.

Endpoints validados por HTTP, sem abrir navegador:

- `/health`: 200 JSON;
- `/`: 200 HTML;
- `/login`: 200 HTML;
- `/agendamento`: 200 HTML.

Servidor temporario encerrado ao final.

## 19. Limitacoes

- Testes DB continuam fora do escopo por exigirem PostgreSQL.
- Nao foi validado comportamento real em PostgreSQL nesta sprint.
- Teste visual com Chrome usa caminho Linux hard-coded e fica skipped no Windows.
- Rota `POST /appointments/:id/complete` permanece existente como caminho de conclusao operacional fora do checkout unificado.

## 20. Riscos P0/P1/P2/P3

| Severidade | Risco | Status |
| --- | --- | --- |
| P0 | Efeito parcial no checkout em memoria apos erro | Mitigado com rollback local e teste de regressao. |
| P0 | Tocar producao/VPS sem autorizacao | Nao ocorreu. |
| P1 | Caminho `complete` coexistir com checkout unificado | Aceito temporariamente; documentado como fluxo operacional legado/separado. |
| P1 | Prisma nao validado em DB real nesta sprint | Aceito por escopo; exige etapa futura com PostgreSQL isolado. |
| P2 | Smoke autenticado visual nao executado em browser | Aceito; smoke HTTP local passou. |
| P3 | Teste visual Chromium skipped no Windows por caminho Linux | Conhecido; ajustar em sprint de frontend/test infra. |

## 21. Opiniao CTO

Comecar por `memory` foi a decisao correta. A sprint encontrou um bug real que so aparece quando tratamos o ambiente local como caminho operacional, nao como burocracia. O checkout agora esta mais seguro no modo local e a cobertura ficou melhor alinhada com financeiro, comissao, auditoria e idempotencia.

## 22. Decisao final

`PRONTO COM RESSALVAS`.

Pronto para continuar desenvolvimento local em Windows com backend em memoria. A ressalva e que validacao persistente em PostgreSQL deve ser feita depois, em banco isolado, sem producao.

## 23. Proxima etapa recomendada

Proxima etapa util:

- revisar se a rota `POST /appointments/:id/complete` deve continuar como caminho oficial ou ser tratada como legado;
- depois preparar validacao Prisma em PostgreSQL local isolado, ainda sem VPS e sem producao;
- so retomar Sprint 227.3 quando a nova VPS existir e houver autorizacao explicita.
