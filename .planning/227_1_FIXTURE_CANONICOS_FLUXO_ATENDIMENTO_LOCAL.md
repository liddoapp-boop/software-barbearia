# Sprint 227.1 - Fixture canonica local e fluxo de atendimento sem financeiro real

Data: 2026-06-28

Responsavel tecnico: CTO tecnico do Projeto Software Barbearia

Escopo: criar fixture local/teste com dados canonicos reais do Geovane, validar fluxo de atendimento em backend `memory` e bloquear conclusao por status generico sem financeiro. Nenhum banco de producao, migration, seed, deploy, PM2, estoque real, venda real, pagamento real, comissao real ou checkout real foi executado.

## 1. Objetivo

Provar que o sistema consegue operar em teste com os servicos e produtos reais pretendidos antes de qualquer mutacao persistente em producao.

## 2. Contexto vindo da Sprint 227.0

A Sprint 227.0 concluiu que os registros atuais nao devem ser reaproveitados nem renomeados: todos os 7 servicos e todos os 9 produtos atuais tem historico, e parte relevante carrega marcador demo/teste/TG. A estrategia tecnica permanece criar canonicos novos no futuro, com backup, autorizacao e execucao controlada.

## 3. Decisao do pre-flight CTO

Decisao: `LIBERADO COM RESSALVAS`.

Pre-flight executado:

- `pwd`: `/root/software-barbearia`
- `git status -sb`: `## main...origin/main`
- `git log --oneline -10`: commits `481d034` e `9b7da02` presentes no topo.
- Worktree inicial: limpa.
- Alvo de execucao: local/teste, backend `memory` nos testes.

Ressalvas:

- fixture local/teste nao e seed;
- nenhuma migration poderia ser aplicada;
- nenhum dado persistente real poderia ser alterado;
- conclusao de atendimento sem caminho financeiro precisava ser tratada como risco.

## 4. Decisao CTO

Decisao: `LIBERADO COM RESSALVAS`.

Foi seguro criar fixture em teste e ajustar um bug claro: o status generico agora bloqueia `IN_SERVICE -> COMPLETED`, obrigando finalizacao por `/complete` ou `/checkout`, que sao os caminhos que geram financeiro. Essa correcao evita atendimento concluido sem receita/comissao por atalho operacional.

## 5. Servicos canonicos de fixture

IDs usados apenas em teste:

| Servico | ID de fixture | Preco | Duracao |
| --- | --- | ---: | ---: |
| Corte | `fixture-canonico-servico-corte` | R$ 30,00 | 30 min |
| Barba | `fixture-canonico-servico-barba` | R$ 20,00 | 30 min |
| Hidratacao | `fixture-canonico-servico-hidratacao` | R$ 20,00 | 30 min |
| Luzes | `fixture-canonico-servico-luzes` | R$ 50,00 | 60 min |
| Pigmentacao | `fixture-canonico-servico-pigmentacao` | R$ 45,00 | 60 min |

`Corte + Barba` nao foi criado.

## 6. Produtos canonicos de fixture

IDs usados apenas em teste:

| Produto | ID de fixture | Venda | Custo | Estoque |
| --- | --- | ---: | ---: | ---: |
| Gel | `fixture-canonico-produto-gel` | R$ 10,00 | R$ 5,50 | 30 |
| Pomada | `fixture-canonico-produto-pomada` | R$ 25,00 | R$ 7,50 | 10 |
| Bucha Nudread | `fixture-canonico-produto-bucha-nudread` | R$ 25,00 | R$ 12,50 | 3 |
| Oleo para Barba | `fixture-canonico-produto-oleo-barba` | R$ 35,00 | R$ 13,00 | 4 |
| Shampoo | `fixture-canonico-produto-shampoo` | R$ 25,00 | R$ 7,50 | 10 |
| Condicionador | `fixture-canonico-produto-condicionador` | R$ 25,00 | R$ 7,50 | 10 |
| Mascara de Hidratacao | `fixture-canonico-produto-mascara-hidratacao` | R$ 30,00 | R$ 7,50 | 10 |

## 7. Fluxo de atendimento validado

Validado em `tests/api.spec.ts` com `InMemoryStore` e `OperationsService` diretos:

- cliente controlado `cli-01`;
- profissional controlado `pro-01`;
- agendamento com `Corte` canonico de fixture;
- slot ocupado apos agendamento;
- cancelamento liberando slot;
- remarcacao;
- `CONFIRMED -> IN_SERVICE`;
- tentativa de finalizar por status generico bloqueada.

## 8. Snapshot validado

O teste cria o agendamento com `Corte` a R$ 30 e 30 min, altera o catalogo vivo do mesmo servico para nome/preco/duracao divergentes e confirma que a leitura do agendamento continua usando:

- `serviceNameSnapshot = Corte`;
- `servicePriceSnapshot = 30`;
- `serviceDurationMinSnapshot = 30`.

## 9. Remarcacao/cancelamento/status

Remarcacao usou duracao efetiva do snapshot: agendamento remarcado para `2026-07-11T13:00:00.000Z` terminou em `2026-07-11T13:30:00.000Z`, apesar do catalogo vivo ter sido alterado para 90 min.

Cancelamento liberou o slot de `2026-07-11T10:00:00.000Z`.

Status `CONFIRMED -> IN_SERVICE` funcionou. Status generico `IN_SERVICE -> COMPLETED` ficou bloqueado para evitar conclusao sem financeiro.

## 10. Financeiro/comissao ausentes sem checkout

Sem chamar `/complete`, `/checkout` ou venda de produto:

- `financialEntries`: 0;
- `commissionEntries`: 0;
- `productSales`: 0;
- `stockMovements`: 0.

## 11. Produtos/estoque em fixture

Produtos canonicos aparecem como ativos em inventario local/teste, com venda/custo/estoque esperados e quantidade nao negativa. Nenhum movimento de estoque foi criado porque nao houve venda, consumo ou ajuste.

## 12. Separacao legado vs canonico

A fixture usa IDs novos `fixture-canonico-*` e nao depende de:

- `svc-corte`;
- `svc-barba`;
- `demo-svc-*`;
- `prd-pomada`;
- `prd-oleo-barba`;
- `demo-prd-*`.

Legado permaneceu intocado. Nao houve tentativa de renomear registros antigos.

## 13. Testes adicionados/alterados

Alterado:

- `tests/api.spec.ts`

Adicionado:

- fixtures locais `CANONICAL_REAL_SERVICE_FIXTURES` e `CANONICAL_REAL_PRODUCT_FIXTURES`;
- teste `valida fluxo de atendimento controlado com canonicos reais e product fixtures sem checkout financeiro`.

Corrigido:

- `OperationsService.updateStatus`;
- `PrismaOperationsService.updateStatus`;
- bloqueio de `IN_SERVICE -> COMPLETED` via status generico.

## 14. O que nao foi feito por seguranca

- Nao criou servico/produto em producao.
- Nao aplicou catalogo canonico em banco persistente.
- Nao executou checkout real.
- Nao criou venda, pagamento, comissao, refund ou lancamento financeiro real.
- Nao alterou estoque real.
- Nao rodou seed.
- Nao aplicou migration.
- Nao alterou `.env`.
- Nao fez deploy.
- Nao reiniciou PM2/Nginx.

## 15. Limitacoes restantes

- Fixture cobre backend `memory`; nao executa `test:db` por trava da sprint.
- Producao ainda precisa de backup, checksum, restore documentado e autorizacao explicita.
- Duracoes de Luzes/Pigmentacao ainda sao proposta operacional para validacao, nao verdade final de producao.
- Produtos existem apenas em fixture; nao ha politica aprovada de estoque inicial persistente.

## 16. Riscos P0/P1/P2/P3

| Severidade | Risco | Status |
| --- | --- | --- |
| P0 | Concluir atendimento por status sem financeiro | Mitigado: `IN_SERVICE -> COMPLETED` via status generico bloqueado. |
| P0 | Criar canonicos em producao por fixture | Evitado: fixture vive em teste, sem seed/migration. |
| P1 | Aplicar canonicidade sem backup/autorizacao | Continua bloqueado. |
| P1 | Usar legado demo/teste como real | Continua proibido; fixture usa IDs novos. |
| P2 | Cobertura sem Prisma persistente | Aceito nesta sprint; `test:db` estava bloqueado. |
| P3 | Nomes sem acento nas fixtures por padrao ASCII do repo | Aceito; sem impacto funcional. |

## 17. Sprint 227 real pode ser liberada?

Nao. A Sprint 227 real continua bloqueada para producao.

O que foi parcialmente liberado: base tecnica local/teste para operar com dados canonicos reais e caminho seguro para impedir conclusao por status sem financeiro.

## 18. Proxima sprint recomendada

Sprint 227.2 ou 230.1: aplicacao controlada futura dos canonicos, com:

- backup PostgreSQL;
- checksum SHA-256;
- comando de restore testado/documentado;
- confirmacao do alvo;
- migration de snapshot aplicada no alvo correto antes do deploy;
- criacao de canonicos reais com IDs novos;
- inativacao/bloqueio gradual do legado;
- smoke readonly;
- validacao manual controlada;
- plano de rollback.

## 19. Opiniao tecnica CTO

Esta etapa foi util, nao burocratica. Ela validou a 227 com dados reais sem tocar producao e ainda revelou um risco importante: finalizar por status generico poderia deixar atendimento concluido sem financeiro. Corrigir isso agora reduz risco antes de qualquer operacao real.

Respostas objetivas:

- fluxo 227 local/teste com dados canonicos: funcionou;
- snapshot: funcionou;
- remarcacao/cancelamento/status: funcionaram;
- financeiro/comissao indevidos: nao foram criados sem checkout;
- produtos canonicos em fixture: coerentes;
- legado: intocado;
- Sprint 227 real: ainda nao liberada;
- bloqueio de producao: falta backup, autorizacao, plano de restore, criacao controlada e decisao operacional final.

## 20. Decisao final

`LIBERADO COM RESSALVAS` para fixture/teste local.

`BLOQUEADO` para Sprint 227 real em producao.

Proxima acao realmente util: preparar a sprint de aplicacao controlada com backup/restore/checksum e lista exata de canonicos novos, sem reaproveitar registros historicos.

## Validacoes executadas

- `npx vitest run tests/api.spec.ts -t "canonicos reais"`: passou, 1 teste.
- `npx vitest run tests/api.spec.ts -t "fluxo de atendimento controlado"`: passou, 2 testes.
- `npx vitest run tests/api.spec.ts -t "agendamento"`: passou, 10 testes.
- `npx vitest run tests/api.spec.ts -t "snapshot"`: passou, 2 testes.
- `npx vitest run tests/api.spec.ts -t "checkout"`: passou, 6 testes.
- `npx vitest run tests/api.spec.ts -t "produto"`: passou, 9 testes.
- `npx vitest run tests/api.spec.ts -t "product"`: primeiro nao encontrou teste; apos ajuste do nome do teste novo, passou, 1 teste.
- `npm test`: passou, 8 arquivos, 131 testes, 19 skipped.
- `npx tsc --noEmit`: passou.
- `npm run build`: passou.
- `git diff --check`: passou.
- `git diff --cached --check`: passou.

`npm run test:db` nao foi executado por trava explicita.
