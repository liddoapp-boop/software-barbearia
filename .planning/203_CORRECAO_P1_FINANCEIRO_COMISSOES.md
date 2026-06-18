# 203 - Correcao P1 financeiro e comissoes

Data: 2026-06-18

Escopo: Fase 2.3 - correcao dos P1 encontrados na reconciliacao financeiro/estoque/comissoes.

## 1. Resumo executivo

A fase corrigiu os dois P1 identificados na Fase 2.2 sem deploy, sem restart PM2, sem firewall, sem certificado, sem migration, sem seed, sem alteracao manual de dados de producao, sem apagar auditoria e sem commit.

Resultado: **APROVADO COM RESSALVAS**.

A aprovacao e com ressalvas porque `npm run test:db` nao foi executado: a URL de banco existe no `.env`, mas a verificacao local nao confirmou que se trata de banco isolado de teste. Por seguranca, a fase nao tocou esse banco. O arquivo de teste DB foi transformado em modo skip para validar sintaxe/importacao sem executar queries.

## 2. Baseline

| Validacao | Resultado |
| --- | --- |
| `git status --short` | limpo antes da fase |
| `git status -sb` | `main...origin/main` |
| `git log --oneline -10` | ultimo commit: `95b19f0 docs: registrar reconciliacao financeiro estoque comissoes` |
| Health publico | `{"ok":true,"authEnforced":true}` |

## 3. P1-1 - causa raiz

Campo envolvido:

- `Service.defaultCommissionRate`
- Prisma: `Decimal(5,4)`
- Escala real suportada pelo banco: decimal entre `0` e `1`

Causa raiz:

- A API e os servicos de aplicacao aceitavam `defaultCommissionRate` entre `0` e `100`.
- O valor era gravado diretamente no Prisma.
- Entrada humana `30` era tratada como `30.00`, mas o campo `Decimal(5,4)` exige valor absoluto menor que `10`, gerando `numeric field overflow`.
- A UI usa label de percentual humano, portanto `30` significa 30%, mas o banco deve guardar `0.3`.

## 4. P1-1 - correcao aplicada

Foi criado helper puro:

- `src/domain/commission-rate.ts`

Regra final:

- entrada `0.3` -> persiste `0.3`;
- entrada `30` -> persiste `0.3`;
- entrada `100` -> persiste `1`;
- entrada `1` -> persiste `1`;
- entrada `150` -> erro controlado;
- entrada `-10` -> erro controlado;
- `NaN`/valor nao numerico -> erro controlado.

Aplicacao:

- `src/application/operations-service.ts`: backend em memoria normaliza antes de persistir no store.
- `src/application/prisma-operations-service.ts`: backend Prisma normaliza antes de chamar Prisma.
- A API segue aceitando entrada humana em percentual.
- A resposta de gerenciamento de servicos volta em percentual humano para manter a UX consistente com o label `%`.

## 5. P1-1 - testes adicionados

Em `tests/api.spec.ts`:

- cria servico com `defaultCommissionRate=0.3` e retorna `30` para a UI;
- cria servico com `defaultCommissionRate=30` e retorna `30`;
- cria servico com `defaultCommissionRate=100` e retorna `100`;
- rejeita `defaultCommissionRate=150` com erro `400`;
- rejeita `defaultCommissionRate=-10` com erro `400`.

Em `tests/db.integration.spec.ts`:

- valida que `0.3` persiste como `0.3`;
- valida que `30` persiste como `0.3`;
- valida que `100` persiste como `1`;
- valida rejeicao de `150` e `-10`.

Observacao: os testes DB foram adicionados, mas nao executados contra banco real nesta fase por falta de confirmacao de isolamento.

## 6. P1-2 - causa raiz

Fluxo envolvido:

- venda de produto cria `CommissionEntry` de origem `PRODUCT`;
- devolucao de produto cria `Refund`, despesa financeira e movimento de estoque `IN`;
- antes da correcao, a devolucao nao revisava comissoes pendentes ligadas a `productSaleId`.

Causa raiz:

- A comissao de produto fica vinculada por `CommissionEntry.productSaleId`.
- O status da comissao e textual e ja suporta `PENDING`, `PAID` e `CANCELED` no dominio/API.
- A devolucao total nao alterava comissao `PENDING`, portanto uma venda integralmente devolvida podia continuar gerando comissao a pagar.

## 7. P1-2 - correcao aplicada

Regra final:

- devolucao total de produto cancela comissoes de produto pendentes vinculadas a venda;
- status usado: `CANCELED`;
- a comissao nao e deletada;
- a rastreabilidade e preservada;
- comissao `PAID` nao e alterada silenciosamente;
- devolucao parcial nao cancela comissao inteira;
- replay com mesma `idempotencyKey` nao duplica efeito nem auditoria.

Aplicacao:

- `src/application/operations-service.ts`: backend em memoria calcula se a venda ficou 100% devolvida e marca comissoes pendentes como `CANCELED`.
- `src/application/prisma-operations-service.ts`: backend Prisma faz a mesma verificacao dentro da transacao da devolucao.
- `src/http/app.ts`: backend em memoria registra auditoria adicional para cancelamento de comissao.
- Backend Prisma registra auditoria adicional transacional.

Acao de auditoria adicionada:

- `PRODUCT_COMMISSION_CANCELED_BY_REFUND`
- entidade: `commission`

## 8. P1-2 - testes adicionados

Em `tests/api.spec.ts`:

- venda de produto cria comissao pendente quando aplicavel;
- devolucao total cancela a comissao pendente;
- replay da devolucao nao duplica o cancelamento nem a auditoria;
- comissao de produto ja paga permanece `PAID` apos devolucao total.

Em `tests/db.integration.spec.ts`:

- teste Prisma para cancelamento de comissao pendente na devolucao total;
- auditoria Prisma para `PRODUCT_COMMISSION_CANCELED_BY_REFUND`;
- replay Prisma sem duplicar auditoria;
- comissao de produto ja paga preservada como `PAID`.

Observacao: os testes DB foram adicionados, mas nao executados contra banco real nesta fase por falta de confirmacao de isolamento.

## 9. Limitacoes restantes

- A comissao pendente historica criada na massa da Fase 2.2 nao foi alterada manualmente no banco. Isso respeita a restricao da fase de nao alterar dados de producao manualmente.
- Devolucao parcial segue sem recalculo proporcional de comissao. A regra atual apenas cancela quando a venda fica totalmente devolvida.
- `npm run test:db` ficou pendente ate haver banco isolado de teste confirmado.

## 10. Validacoes executadas

| Validacao | Resultado |
| --- | --- |
| `npm run build` | passou |
| `npm test -- --run tests/api.spec.ts -t "normaliza comissao padrao|cancela comissao de produto pendente|nao cancela silenciosamente"` | passou: 3 testes, 67 skipped |
| `npm test -- --run tests/api.spec.ts` | passou: 70 testes |
| `npm test -- --run tests/engine.spec.ts` | passou: 4 testes |
| `npm run test` | passou: 6 arquivos, 1 skipped; 91 testes, 14 skipped |
| `RUN_DB_TESTS=0 DATA_BACKEND=prisma npx vitest run tests/db.integration.spec.ts` | passou em modo skip: 14 skipped, sem tocar no banco |
| `npm audit` | 0 vulnerabilidades |
| `npm audit --omit=dev` | 0 vulnerabilidades |
| `git diff --check` | passou |
| Health publico | `{"ok":true,"authEnforced":true}` |

`npm run test:db` nao foi executado porque a URL de banco carregada do `.env` nao foi classificada como banco isolado de teste. Nenhum valor da URL foi impresso.

## 11. Riscos residuais

### P0

Nenhum P0 confirmado.

### P1

Nenhum P1 funcional novo confirmado no codigo alterado.

### P2

1. Executar `npm run test:db` em banco isolado confirmado antes de commit/deploy.
2. Validar o fluxo Prisma em ambiente de staging ou banco temporario antes de publicar.
3. Definir tratamento futuro para comissoes de produto ja pagas em vendas devolvidas.
4. Definir recalculo proporcional para devolucao parcial, se entrar no escopo.

### P3

1. Expor na UI a informacao de comissao cancelada por devolucao.
2. Criar relatorio de reconciliacao por venda ligando venda, refund, estoque, financeiro, comissao e auditoria.

## 12. Arquivos alterados

Codigo:

- `src/domain/commission-rate.ts`
- `src/application/operations-service.ts`
- `src/application/prisma-operations-service.ts`
- `src/http/app.ts`

Testes:

- `tests/api.spec.ts`
- `tests/db.integration.spec.ts`

Documentacao:

- `.planning/203_CORRECAO_P1_FINANCEIRO_COMISSOES.md`
- `.planning/202_RECONCILIACAO_FINANCEIRO_ESTOQUE_COMISSOES.md`
- `.planning/200_AUDITORIA_COMPLETA_PRODUTO_TG.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## 13. Decisao final

**APROVADO COM RESSALVAS.**

Criterios atendidos:

- `defaultCommissionRate=30` nao chega mais como `30.00` ao Prisma;
- entrada percentual e normalizada no backend;
- entrada invalida retorna erro controlado;
- devolucao total neutraliza comissao de produto pendente;
- replay nao duplica efeito;
- comissao paga nao e alterada silenciosamente;
- auditoria foi preservada e ampliada;
- build, testes unitarios/API, audits e health publico passaram;
- nenhum segredo foi exposto.

Ressalva:

- falta executar `npm run test:db` em banco isolado confirmado.

## 14. Proxima etapa recomendada

Fase 2.3.1: validar `test:db` em banco isolado confirmado e, se aprovado, fazer commit seletivo desta correcao. Depois disso, seguir para manual owner-only e consolidacao academica do TG.
