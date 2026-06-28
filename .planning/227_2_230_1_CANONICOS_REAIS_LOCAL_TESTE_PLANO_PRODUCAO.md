# Sprint 227.2 + 230.1 - Canonicos reais local/teste e plano de producao

Data: 2026-06-28

Responsavel tecnico: CTO tecnico do Projeto Software Barbearia

Escopo: provisionar de forma segura e idempotente os servicos/produtos canonicos reais no alvo local/teste, validar fluxo de atendimento e inventario sem checkout real, e deixar plano de producao pronto. Nenhuma producao, seed, migration, deploy, PM2, venda real, pagamento real, comissao real, refund real ou lancamento financeiro real foi executado.

## 1. Objetivo

Criar um mecanismo travado para provisionar canonicos reais, aplicar apenas em local/teste quando o alvo for seguro, provar idempotencia e preparar a futura aplicacao em producao com backup, checksum, restore e autorizacao explicita.

## 2. Por que junta 227.2 e 230.1

As duas frentes reduzem o mesmo risco: sair de fixture em memoria para catalogo canonico persistente sem manipular banco manualmente e sem misturar legado com dados reais. Separar isso em microetapas geraria burocracia; juntar local/teste + plano de producao e seguro porque producao segue bloqueada.

## 3. Contexto vindo da Sprint 227.1

A Sprint 227.1 validou fluxo em `memory` com dados reais, snapshot de servico, cancelamento liberando slot, remarcacao por duracao efetiva, transicao `CONFIRMED -> IN_SERVICE` e bloqueio de conclusao generica sem caminho financeiro. Tambem confirmou que produtos canonicos podem existir em inventario de fixture sem venda, movimento de estoque, financeiro ou comissao.

## 4. Decisao do pre-flight CTO

Decisao: `LIBERADO COM RESSALVAS`.

| Checagem | Resultado |
| --- | --- |
| Diretorio | `/root/software-barbearia` |
| Branch/status inicial | `## main...origin/main` |
| Worktree inicial | Limpa |
| Commits minimos | `9b7da02`, `481d034`, `4b0be83`, `daf89eb` presentes |
| Correcao posterior `Bucha Nudread` | `3ba61d7 fix: corrigir nome da bucha nudread` presente |
| Alvo detectado | `LOCAL` |
| Migration snapshot local | Aplicada; `npx prisma migrate status --schema prisma/schema.prisma` indicou schema atualizado |
| Migration nesta sprint | Nao executada |
| Seed nesta sprint | Nao executado |
| Producao | Nao tocada |

Ressalvas:

- a aplicacao vale apenas para o PostgreSQL local configurado;
- fixture local de cliente/profissional foi criada para validar fluxo;
- uma primeira tentativa de agendamento ficou bloqueada por horario fora do expediente local antes de criar agendamento; depois o horario foi corrigido para a janela valida.

## 5. Decisao CTO

Decisao: `LIBERADO COM RESSALVAS` para local/teste.

Decisao para producao: `BLOQUEADO`.

Esta sprint reduz risco real porque substitui criacao manual por mecanismo idempotente, detecta divergencia, preserva legado e prova que o fluxo funciona com IDs canonicos persistidos.

## 6. Correcao do nome Bucha Nudread

Busca no projeto por nomes antigos nao encontrou ocorrencias de:

- `Bucha para Dread`;
- `Bucha para dread`;
- `bucha para dread`;
- `Bucha Dread`;
- `Bucha para Nudread`.

O catalogo canonico usa `Bucha Nudread` com ID tecnico `canon-prd-bucha-nudread`. Foi adicionado teste nomeado para esse produto.

## 7. Dados canonicos de servicos

| ID | Nome | Preco | Duracao |
| --- | --- | ---: | ---: |
| `canon-svc-corte` | Corte | R$ 30,00 | 30 min |
| `canon-svc-barba` | Barba | R$ 20,00 | 30 min |
| `canon-svc-hidratacao` | Hidratacao | R$ 20,00 | 30 min |
| `canon-svc-luzes` | Luzes | R$ 50,00 | 60 min |
| `canon-svc-pigmentacao` | Pigmentacao | R$ 45,00 | 60 min |

`Corte + Barba` nao foi criado.

## 8. Dados canonicos de produtos

| ID | Nome | Venda | Custo | Estoque |
| --- | --- | ---: | ---: | ---: |
| `canon-prd-gel` | Gel | R$ 10,00 | R$ 5,50 | 30 |
| `canon-prd-pomada` | Pomada | R$ 25,00 | R$ 7,50 | 10 |
| `canon-prd-bucha-nudread` | Bucha Nudread | R$ 25,00 | R$ 12,50 | 3 |
| `canon-prd-oleo-barba` | Oleo para Barba | R$ 35,00 | R$ 13,00 | 4 |
| `canon-prd-shampoo` | Shampoo | R$ 25,00 | R$ 7,50 | 10 |
| `canon-prd-condicionador` | Condicionador | R$ 25,00 | R$ 7,50 | 10 |
| `canon-prd-mascara-hidratacao` | Mascara de Hidratacao | R$ 30,00 | R$ 7,50 | 10 |

## 9. Mecanismo escolhido

Mecanismo: script local/teste com logica testavel em modulo separado.

Arquivos:

- `src/application/canonical-catalog.ts`;
- `scripts/provision-canonicals-local.ts`;
- comandos `npm run canonicals:dry-run` e `npm run canonicals:apply:local`.

Regras implementadas:

- modo padrao conceitual `dry-run`;
- `apply` somente com `--apply`;
- `--target=local` explicito nos comandos versionados;
- bloqueia alvo declarado diferente de `local`/`test`;
- bloqueia alvo detectado diferente de `local`/`test`;
- nao imprime `DATABASE_URL` ou segredo;
- cria apenas IDs canonicos novos;
- valida canonicidade existente campo a campo;
- se houver divergencia, falha sem sobrescrever;
- nao roda seed;
- nao aplica migration;
- nao cria venda, financeiro, comissao ou movimento de estoque.

## 10. Aplicacao local/teste

Aplicacao executada no alvo `LOCAL`.

Nao houve producao, migration ou seed.

## 11. Resultado do dry-run

`npm run canonicals:dry-run`:

- `services_to_create=5`;
- `products_to_create=7`;
- `services_matching=0`;
- `products_matching=0`;
- `errors=0`;
- IDs listados exatamente como os canonicos esperados.

## 12. Resultado do apply local/teste

`npm run canonicals:apply:local`:

- criou 5 servicos canonicos;
- criou 7 produtos canonicos;
- `apply_result=ok`.

Consulta readonly posterior confirmou os servicos/produtos com nomes, precos, duracoes, custos, estoques e `active=true`.

## 13. Validacao de idempotencia

Segunda execucao de `npm run canonicals:apply:local`:

- `services_to_create=0`;
- `products_to_create=0`;
- `services_matching=5`;
- `products_matching=7`;
- `errors=0`;
- `apply_result=ok`.

Teste automatizado cobre tambem canonico divergente, bloqueando sem sobrescrever.

## 14. Validacao do fluxo de atendimento

Validado no PostgreSQL local com `PrismaOperationsService` e `canon-svc-corte`.

Resultado:

- cliente fixture criado;
- profissional fixture criado;
- vinculo profissional/servico criado;
- agendamento com `canon-svc-corte`;
- snapshot retornou `Corte`, `30`, `30 min`;
- cancelamento liberou slot;
- slot cancelado foi reutilizado;
- remarcacao usou duracao efetiva do atendimento; o termino ficou em `18:40Z` porque o ambiente local tem buffer operacional de 10 min;
- transicoes `CONFIRMED -> IN_SERVICE` funcionaram;
- tentativa `IN_SERVICE -> COMPLETED` via status generico ficou bloqueada com orientacao para checkout/conclusao;
- `FinancialEntry=0`;
- `CommissionEntry=0`.

## 15. Validacao de produtos/inventario

Consulta readonly posterior:

- 7 produtos canonicos ativos;
- `Bucha Nudread` presente com venda R$ 25,00, custo R$ 12,50 e estoque 3;
- margem potencial calculavel por `salePrice - costPrice`;
- `stockMovements=0` para produtos canonicos;
- `productSales=0` para produtos canonicos;
- `financialEntries=0` ligados aos canonicos;
- `commissionEntries=0` ligadas aos canonicos.

PDV foi validado apenas por coerencia de inventario/leitura. Nenhuma venda foi feita.

## 16. Separacao legado vs canonico

Legado preservado:

- `svc-corte`;
- `svc-barba`;
- `demo-svc-*`;
- `prd-*`;
- `demo-prd-*`;
- historico existente.

O mecanismo consulta e cria somente IDs `canon-*`. Registros antigos nao sao atualizados, renomeados, inativados ou apagados.

## 17. Testes adicionados/alterados

Adicionados:

- `tests/canonical-catalog.spec.ts`;
- `src/application/canonical-catalog.ts`;
- `scripts/provision-canonicals-local.ts`.

Alterado:

- `tests/api.spec.ts` com teste explicito de `Bucha Nudread`;
- `package.json` com scripts seguros.

## 18. Validacoes executadas

- `pwd`: `/root/software-barbearia`.
- `git status -sb`: `## main...origin/main` no pre-flight.
- `git log --oneline -15`: commits minimos e correcao `Bucha Nudread` presentes.
- `npx prisma migrate status --schema prisma/schema.prisma`: schema local atualizado.
- `rg` para nomes antigos da bucha: nenhuma ocorrencia antiga encontrada.
- `npx vitest run tests/canonical-catalog.spec.ts`: 4 testes passaram.
- `npm run canonicals:dry-run`: antes do apply, 5 servicos e 7 produtos a criar, zero erros.
- `npm run canonicals:apply:local`: criou 5 servicos e 7 produtos, `apply_result=ok`.
- Segunda execucao `npm run canonicals:apply:local`: 0 criacoes, 5 servicos e 7 produtos matching, zero erros.
- Consulta readonly dos canonicos: dados corretos, zero venda/financeiro/comissao/movimento para os canonicos.
- Fluxo persistente local com `canon-svc-corte`: passou, com bloqueio de conclusao generica e zero financeiro/comissao.
- `npx vitest run tests/api.spec.ts -t "canonicos"`: 2 testes passaram.
- `npx vitest run tests/api.spec.ts -t "Bucha Nudread"`: 1 teste passou.
- `npx vitest run tests/api.spec.ts -t "fluxo de atendimento controlado"`: 2 testes passaram.
- `npx vitest run tests/api.spec.ts -t "produto"`: 10 testes passaram.
- `npx vitest run tests/api.spec.ts -t "product"`: 1 teste passou.
- `npx vitest run tests/api.spec.ts -t "snapshot"`: 2 testes passaram.
- `npx tsc --noEmit`: passou.
- `npm test`: primeira execucao em paralelo teve timeout em teste antigo; reexecucao isolada passou com 9 arquivos, 136 testes e 19 skipped.
- `npm run build`: primeira execucao em paralelo foi morta pelo sistema; reexecucao isolada passou.
- `git diff --check`: passou.

`npm run test:db` nao foi executado por trava explicita.

## 19. Plano de producao futura

Producao segue bloqueada ate autorizacao explicita.

Pre-condicoes obrigatorias:

1. Autorizacao explicita do usuario para producao.
2. Confirmar alvo de producao sem expor segredo.
3. Git limpo em `main...origin/main`.
4. Confirmar migration `20260628_service_snapshot_appointments` aplicada em producao.
5. Garantir que nao ha migration pendente inesperada.
6. Backup PostgreSQL completo antes de qualquer mutacao.
7. Checksum SHA-256 do backup.
8. Comando de restore documentado e validado.
9. Janela sem uso real.
10. Rodar dry-run em producao com log readonly e sem aplicar.
11. Conferir contagem antes/depois esperada: +5 servicos, +7 produtos.
12. Apply unico e idempotente, preservando legado.
13. Smoke readonly depois.
14. Validacao manual controlada.
15. Plano de rollback por restore do backup.

IDs exatos a aplicar:

- servicos: `canon-svc-corte`, `canon-svc-barba`, `canon-svc-hidratacao`, `canon-svc-luzes`, `canon-svc-pigmentacao`;
- produtos: `canon-prd-gel`, `canon-prd-pomada`, `canon-prd-bucha-nudread`, `canon-prd-oleo-barba`, `canon-prd-shampoo`, `canon-prd-condicionador`, `canon-prd-mascara-hidratacao`.

Aplicacao em producao deve criar canonicos novos, preservar legado e nao apagar historico. Inativacao/bloqueio de demo/teste vem depois.

## 20. O que nao foi feito por seguranca

- Nao aplicou nada em producao.
- Nao alterou `.env`.
- Nao rodou seed.
- Nao aplicou migration.
- Nao fez deploy.
- Nao reiniciou PM2/Nginx.
- Nao apagou ou inativou legado.
- Nao renomeou registro antigo.
- Nao fez checkout real.
- Nao executou venda, pagamento, comissao, refund ou financeiro real.
- Nao criou movimento de estoque para os canonicos.

## 21. Riscos P0/P1/P2/P3

| Severidade | Risco | Status |
| --- | --- | --- |
| P0 | Criar canonicos em producao sem autorizacao | Mitigado: script bloqueia alvo fora de local/teste. |
| P0 | Sobrescrever legado com historico | Mitigado: script so cria IDs `canon-*` e falha em divergencia. |
| P1 | Estoque inicial sem movimento contabil | Aceito nesta sprint local: produto nasce com `stockQty`; producao deve decidir politica contabil antes de apply. |
| P1 | Fixture local persistente poluir base local | Aceito: alvo local/teste; IDs sao identificaveis por prefixo `canon-flow-*`. |
| P2 | Script atual nao e ferramenta final de producao | Intencional: producao exige autorizacao, backup e possivel flag/runbook proprio. |
| P3 | Nomes sem acento em alguns campos por padrao ASCII | Aceito; `Bucha Nudread` esta correto. |

## 22. Sprint 227 real pode ser liberada?

Parcialmente para preparacao tecnica local/teste: sim.

Para producao real: nao. Ainda falta autorizacao explicita, backup, checksum, restore e janela controlada.

## 23. Opiniao tecnica CTO

Esta etapa foi util, nao burocratica. Ela fecha a lacuna entre fixture em memoria e banco local, prova idempotencia e evita a tentacao perigosa de editar registros legados manualmente.

Respostas objetivas:

- nome `Bucha Nudread`: corrigido nos canonicos e testes;
- mecanismo escolhido: modulo testavel + script Prisma local/teste;
- idempotencia: validada por teste e segunda execucao real;
- canônicos aplicados: sim, no alvo local;
- risco de sobrescrever legado: baixo com o mecanismo atual;
- fluxo de atendimento: validado;
- inventario/PDV local: coerente em leitura, sem venda;
- legado: intocado;
- producao: bloqueada ate backup/autorizacao/restore.

## 24. Decisao final

`LIBERADO COM RESSALVAS` para local/teste.

`BLOQUEADO` para producao.

## 25. Proxima sprint recomendada

Preparar runbook de aplicacao real em producao com autorizacao explicita, backup, checksum SHA-256, restore testado, dry-run readonly, apply unico idempotente e smoke readonly. Depois disso, a Sprint 227 real pode criar a data de corte operacional e tratar ocultacao/inativacao gradual do legado.
