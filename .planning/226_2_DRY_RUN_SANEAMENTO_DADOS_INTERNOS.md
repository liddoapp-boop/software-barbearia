# Sprint 226.2 - Dry-run tecnico de saneamento dos dados internos

Data: 2026-06-26

Responsavel tecnico: CTO tecnico do Projeto Software Barbearia

Escopo: diagnostico tecnico de impacto para futuro saneamento controlado. Nenhum dado foi alterado.

## 1. Objetivo

Mapear o impacto de um saneamento futuro em servicos, produtos, profissionais, clientes, agenda, PDV, estoque, financeiro, comissoes e auditoria.

Esta sprint nao saneia dados. Ela identifica o que parece manter, ocultar, inativar futuramente, preservar por historico ou confirmar com Geovane.

## 2. Contexto vindo das Sprints 226 e 226.1

A Sprint 226 validou que o painel interno pode ser demonstrado em modo guiado/read-only, mas bloqueou fluxo real por dados internos contaminados e acoes transacionais sensiveis.

A Sprint 226.1 registrou a matriz de saneamento e manteve a Sprint 227 bloqueada:

| Area | Estado herdado |
| --- | --- |
| Servicos | 7 ativos, 5 demo/teste/TG, 2 candidatos reais |
| Produtos | 9 ativos, 7 demo/teste/TG, 2 candidatos reais |
| Profissionais | 44 ativos, somente `pro-01` sem marcador |
| Clientes | 28 agregados, 11 com marcador demo/teste/TG |
| Financeiro | 101 lancamentos, 82 comissoes pendentes |
| Estoque/PDV | 9 produtos, 14 vendas historicas, 9 movimentos de estoque |
| Decisao anterior | Piloto interno guiado/read-only; Sprint 227 bloqueada |

## 3. Decisao do pre-flight CTO

Decisao: LIBERADO PARA EXECUTAR.

Justificativa:

| Checagem | Resultado |
| --- | --- |
| Diretorio | `/root/software-barbearia` |
| Branch/status | `## main...origin/main` |
| HEAD esperado | `4e62855 docs: criar matriz de saneamento do piloto interno` |
| Worktree | Limpa no inicio |
| Sprint 226 | Documento encontrado |
| Sprint 226.1 | Documento encontrado |
| Matriz de saneamento | Encontrada |
| Pode ser readonly? | Sim |
| Risco de PII | Existe, mitigado por agregacao de clientes |
| Risco financeiro | Existe, mitigado por contagens sem mutacao |
| Valor da etapa | Alto: evita saneamento destrutivo e revela dependencias |

Ressalva: o dry-run so e valido como fotografia tecnica de 2026-06-26. Qualquer saneamento futuro precisa de backup e nova leitura imediatamente antes da execucao.

Consultas e leituras readonly usadas:

| Fonte | Uso |
| --- | --- |
| `pwd`, `git status -sb`, `git log --oneline -10` | Confirmar diretorio, branch, worktree e HEAD |
| `.planning/226_VALIDACAO_PAINEL_INTERNO_GEOVANE.md` | Contexto de bloqueio do painel interno |
| `.planning/226_1_MATRIZ_SANEAMENTO_ROTEIRO_PILOTO_INTERNO.md` | Matriz anterior e decisoes de bloqueio |
| `.planning/223_REVISAO_SERVICOS_PUBLICOS_REAIS.md` | Contexto do catalogo publico real |
| `.planning/225_VALIDACAO_PUBLICA_FINAL_MOBILE.md` | Contexto do fechamento do Bloco A |
| `prisma/schema.prisma` | Relacoes e regras de FK/onDelete |
| `src/http/app.ts` | Regra de visibilidade publica e filtros de marcador |
| Prisma `findMany`, `count`, `groupBy` | Inventario e dependencias de servicos, produtos, profissionais, clientes, agenda, vendas, financeiro, comissoes, estoque, refunds e auditoria |

Nenhuma consulta usou `create`, `update`, `delete`, endpoint transacional, migration, seed ou teste DB.

## 4. Decisao de CTO

Decisao: nao avancar para Sprint 227 e nao sanear ainda.

A proxima acao tecnica recomendada nao e fluxo real. E preparar um saneamento controlado com backup, data de corte, confirmacao de Geovane e plano especifico para financeiro/comissoes.

Minha leitura CTO: esta etapa nao e burocratica. Ela evita o erro mais caro agora, que seria inativar, apagar ou pagar registros sem entender historico e dependencias.

## 5. Criterios de classificacao

| Classe | Criterio aplicado |
| --- | --- |
| Real provavel | Registro ativo sem marcador de `demo`, `teste`, `TG` ou `DB` e coerente com operacao |
| Geovane | `pro-01` ou nome Geovane Borges |
| Demo | ID ou texto com `demo` |
| Teste/TG | ID, nome ou categoria com `teste` ou `TG` |
| DB | ID/nome `pro-db-*`, `svc-db-*`, `unit-db-*` ou texto DB tecnico |
| Duvida | Nome plausivel, mas origem demo/teste ou ausencia de confirmacao humana |
| Manter historico | Registro com agenda, venda, financeiro, comissao, estoque, refund ou auditoria vinculada |
| Candidato a ocultar/inativar | Registro com marcador tecnico que nao deve entrar em fluxo real |
| Nao remover | Qualquer registro com historico ou dependencia restritiva |

Visibilidade publica de servicos/profissionais seguiu a regra em `src/http/app.ts`: ativo e sem marcador publico em ID, nome, descricao, categoria ou notas.

## 6. Relacoes importantes do schema

| Entidade | Relacoes relevantes | Impacto no saneamento |
| --- | --- | --- |
| `Service` | `Appointment.serviceId` com `Restrict`; `ServiceProfessional` com `Cascade`; `ServiceStockConsumption` com `Restrict`; `BusinessCommissionRule` com `SetNull` | Servico com agendamento nao deve ser deletado; no maximo ocultar/inativar com historico preservado |
| `Professional` | `Appointment.professionalId` com `Restrict`; `CommissionEntry.professionalId` com `Restrict`; `ProductSale.professionalId` com `SetNull`; `ServiceProfessional` com `Cascade`; `CommissionRule` com `Cascade` | Profissional com agenda/comissao nao pode ser removido no chute |
| `Product` | `ProductSaleItem.productId`, `StockMovement.productId`, `RefundItem.productId` e `ServiceStockConsumption.productId` com `Restrict` | Produto com venda/estoque/refund/consumo nao deve ser deletado |
| `Client` | `Appointment.clientId` com `Restrict`; `ProductSale.clientId` com `SetNull`; relacoes de fidelizacao/retencao/automacao | Cliente pode conter PII; tratar apenas por agregados e preservar historico |
| `FinancialEntry` | Referencia por `referenceType`/`referenceId`, sem FK explicita para venda/agendamento | Nao deletar/zerar por inferencia; risco de quebrar conciliacao |
| `CommissionEntry` | `professionalId` com `Restrict`; refs opcionais para appointment/productSale com `SetNull` | Comissao exige plano separado, principalmente pendentes |
| `AuditLog` | `entity`/`entityId` sem FK explicita | Auditoria e trilha evidencial; nao usar como fonte unica, mas considerar impacto |

Achado adicional: existem 64 vinculos `ServiceProfessional` para profissionais de `unit-01`; 25 apontam para servicos da propria `unit-01` e 39 apontam para servicos `svc-db-*` em unidades `unit-db-*`. Isso e contaminacao de teste/cross-tenant e deve ser tratado antes de qualquer limpeza automatica.

## 7. Dry-run de servicos

Resumo:

| Metrica | Valor |
| --- | ---: |
| Servicos analisados | 7 |
| Publicos hoje | 2 |
| Ocultos pela regra publica | 5 |
| Com agendamentos | 7 |
| Com financeiro via agendamento | 7 |
| Com comissoes via agendamento | 7 |
| Com refund via agendamento | 1 |

| ID | Nome | Preco | Duracao | Ativo | Marcador | Publico hoje | Dependencias | Recomendacao futura |
| --- | --- | ---: | ---: | --- | --- | --- | --- | --- |
| `svc-barba` | Barba Terapia | 55 | 35 | Sim | real provavel | Sim | 42 agend., 14 financ., 14 com., 2 refunds, 4 prof., 1 estoque | Manter como candidato; confirmar nome/preco/duracao; nao remover por historico |
| `svc-corte` | Corte Premium | 75 | 45 | Sim | real provavel | Sim | 22 agend., 11 financ., 11 com., 4 prof., 1 estoque | Manter como candidato; confirmar nome/preco/duracao; nao remover por historico |
| `demo-svc-combo` | Combo Cabelo + Barba | 115 | 75 | Sim | demo/duvida | Nao | 23 agend., 11 financ., 11 com., 4 prof. | Confirmar com Geovane; ocultar/inativar futuramente se nao real; nao remover por historico |
| `demo-svc-degrade` | Degrade Navalhado | 85 | 50 | Sim | demo/duvida | Nao | 20 agend., 12 financ., 12 com., 4 prof. | Confirmar; pode ser servico real com origem demo; nao remover por historico |
| `demo-svc-sobrancelha` | Design de Sobrancelha | 35 | 20 | Sim | demo/duvida | Nao | 21 agend., 10 financ., 10 com., 4 prof. | Confirmar; ocultar do fluxo real ate validacao |
| `demo-svc-hidratacao` | Hidratacao Capilar | 65 | 40 | Sim | demo/duvida | Nao | 21 agend., 12 financ., 12 com., 4 prof. | Confirmar; nao usar em booking/fluxo real agora |
| `a1ea4294-e3a9-42b5-b5e5-3ca719f5b483` | Servico Teste Comissao TG | 100 | 30 | Sim | teste/TG | Nao | 1 agend., 1 financ., 1 com., 1 prof., 1 auditoria | Candidato forte a inativar futuramente; nao deletar por historico |

Status de agenda por servico reforca que nenhum servico deve ser removido no chute: todos possuem pelo menos um agendamento vinculado.

## 8. Dry-run de produtos/estoque/PDV

Resumo:

| Metrica | Valor |
| --- | ---: |
| Produtos analisados | 9 |
| Real provavel | 2 |
| Demo/teste/TG | 7 |
| Produtos com itens de venda | 9 |
| Produtos com financeiro via venda | 9 |
| Produtos com movimentos de estoque | 7 |
| Produtos com consumo por servico | 2 |
| Produtos com refund item | 1 |

| ID | Nome | Categoria | Venda | Custo | Estoque | Marcador | Dependencias | Recomendacao futura |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| `prd-pomada` | Pomada Matte | Finalizacao | 59 | 24 | 22 | real provavel | 4 itens venda, 4 financ., 3 com., 1 mov. IN, 1 consumo | Manter candidato; confirmar estoque fisico, preco e custo |
| `prd-oleo-barba` | Oleo para Barba | Barba | 39 | 14 | 18 | real provavel | 2 itens venda, 2 financ., 2 com., 1 mov. IN, 1 consumo | Manter candidato; confirmar estoque fisico, preco e custo |
| `demo-prd-cond` | Condicionador Reparador | Cabelo | 45 | 17 | 28 | demo | 2 itens venda, 2 financ., 2 com., 1 mov. IN | Ocultar/bloquear venda futura ate decisao; nao remover |
| `demo-prd-kit` | Kit Cuidado Completo | Kits | 159 | 72 | 8 | demo | 2 itens venda, 2 financ., 2 com. | Ocultar/bloquear venda futura; nao remover |
| `demo-prd-lamina` | Lamina Profissional (pacote) | Acessorio | 22 | 8 | 65 | demo | 1 item venda, 1 financ., 1 com., 1 mov. IN | Ocultar/bloquear venda futura; nao remover |
| `demo-prd-perfume` | Perfume Tradicional 100ml | Perfumaria | 89 | 38 | 12 | demo | 2 itens venda, 2 financ., 2 com. | Ocultar/bloquear venda futura; nao remover |
| `demo-prd-shampoo` | Shampoo Anticaspa Premium | Cabelo | 49 | 19 | 30 | demo | 3 itens venda, 3 financ., 3 com., 1 mov. IN | Ocultar/bloquear venda futura; nao remover |
| `demo-prd-talco` | Talco Pos-Barba | Barba | 29 | 9 | 40 | demo | 2 itens venda, 2 financ., 2 com., 1 mov. IN | Ocultar/bloquear venda futura; nao remover |
| `63e543a2-5430-457b-a9d1-919c101ad967` | Produto Teste Estoque TG | TESTE TG | 20 | 5 | 10 | teste/TG | 1 item venda, 1 financ., 1 com., 3 mov., 1 refund item, 1 auditoria | Candidato forte a inativar futuramente; nao deletar por historico |

Conclusao PDV: nenhum produto deve ser removido. Todos possuem historico de venda; saneamento seguro deve ser ocultar/inativar venda futura, nao apagar passado.

## 9. Dry-run de profissionais

Resumo:

| Metrica | Valor |
| --- | ---: |
| Profissionais analisados | 44 |
| Geovane/real provavel | 1 |
| `demo-pro-*` com historico | 3 |
| `Profissional Teste Comissao TG` | 1 |
| `pro-db-*` | 39 |
| Vinculos `ServiceProfessional` para profissionais de `unit-01` | 64 |
| Vinculos para servicos da mesma unidade | 25 |
| Vinculos cross-tenant para `unit-db-*` | 39 |

| Grupo/ID | Nome | Ativo | Marcador | Publico hoje | Dependencias | Recomendacao futura |
| --- | --- | --- | --- | --- | --- | --- |
| `pro-01` | Geovane Borges | Sim | Geovane | Sim | 6 serv., 48 agend., 4 vendas, 22 com., 25 financ., 2 regras comissao | Manter; confirmar regras e identidade operacional |
| `demo-pro-02` | Rafael Andrade | Sim | demo/duvida | Nao | 7 serv., 40 agend., 4 vendas, 22 com., 24 financ., 2 regras | Confirmar se existe; se nao, ocultar/inativar futuro; nao remover por historico |
| `demo-pro-03` | Lucas Ferreira | Sim | demo/duvida | Nao | 6 serv., 31 agend., 3 vendas, 20 com., 20 financ., 2 regras | Confirmar; nao remover por historico |
| `demo-pro-04` | Matheus Souza | Sim | demo/duvida | Nao | 6 serv., 31 agend., 3 vendas, 20 com., 20 financ., 2 regras | Confirmar; nao remover por historico |
| `6a063462-e0cb-4d02-a3cb-f91e26b2901a` | Profissional Teste Comissao TG | Sim | teste/TG | Nao | 0 agend., 0 vendas, 0 com., 1 auditoria | Candidato a inativar futuramente; preservar auditoria |
| `pro-db-*` (39 registros) | Profissional DB | Sim | DB | Nao | 0 agend., 0 vendas, 0 com.; 39 vinculos cross-tenant com `svc-db-*`; cada um tem 2 regras de comissao | Candidato forte a saneamento, mas primeiro limpar plano cross-tenant e regras; nao deletar no chute |

IDs `pro-db-*` afetados no dry-run:

`pro-db-1751e565-69c6-422e-906b-118a05042d71`, `pro-db-2035eef0-c90a-4c88-a304-932ea3869f90`, `pro-db-223cce8f-28f6-4a96-9913-7679e740dc9d`, `pro-db-25a5b36a-b419-4ffe-a7e1-41036ca083f1`, `pro-db-28f4d6bc-77b6-4ab8-bdfb-52e7c09b67b0`, `pro-db-30df9d9d-8650-48c8-a029-57982840ec1e`, `pro-db-379ecbe7-24bf-41dc-ab47-8c4653624392`, `pro-db-3a1c71bb-40b1-4aad-a35d-dbf057aa48f7`, `pro-db-3bd03f7d-0c17-45a7-ab5a-1210d416d0f9`, `pro-db-3bf9160d-36ee-4aa6-afc5-da54a4d64b29`, `pro-db-410710d6-87a3-4f39-ac1f-99e6c0e80695`, `pro-db-477fc5a9-f77e-48c8-bd8f-75e831614f52`, `pro-db-4c5ec4db-6c9c-47c6-84fd-6fd76df0c426`, `pro-db-4ce43008-7cfc-477d-9298-6dc928b1ccd2`, `pro-db-6078498f-7868-47dc-89d9-b68fdef9000d`, `pro-db-61cc4243-2a62-4a2c-9730-b731b6649f13`, `pro-db-6fd9d54e-f2c1-47fa-80d3-124935d2f09e`, `pro-db-7495d9e1-7f54-4f06-bc42-3a10e33a7e8c`, `pro-db-7a78ada4-7ef7-45ee-84d4-aeb2c6e31828`, `pro-db-7d2b63a4-ec9c-4c6c-85a5-5745af8a39dc`, `pro-db-7dce4da5-be54-422b-9573-3e45c0612fad`, `pro-db-8223f1ae-d9fe-47c9-8028-d833b651b6a7`, `pro-db-8f3b84a0-87fe-4188-9043-1701166b3cb0`, `pro-db-98312fcf-6742-4331-b807-ea74229d531f`, `pro-db-abe75b4c-8565-41d7-9611-1ee50e1158ed`, `pro-db-aefca5df-9781-458a-a432-653a58d1f11b`, `pro-db-baaec5a1-9ba8-4403-ba71-ea676a5d3d5c`, `pro-db-be0f1372-b9f1-4ff4-bb2a-93cbcb77c195`, `pro-db-bf327837-446a-4d90-ab60-c5e90734aa8b`, `pro-db-d4026ab9-ebb6-4576-bd80-094a8d831750`, `pro-db-d55fa2c8-7687-4f6f-b467-ad801d675aae`, `pro-db-d75a344c-7dcd-4048-9e6f-5405d0bf3547`, `pro-db-d9e5f2dd-ee21-4e60-b955-78ba781087d0`, `pro-db-dc340b8e-fbe6-44a9-b3bd-2a9ad74b9bad`, `pro-db-e03c1412-77e3-4386-9123-88e2e2e6f504`, `pro-db-e6b212b5-b470-496d-b58b-a226fc16649f`, `pro-db-eaae81af-1ba2-4a3f-bfce-9d7dee4eae84`, `pro-db-f07b051e-05f0-4cd1-bd8d-06ca9e6d1636`, `pro-db-f79ebbc2-c8c9-4e97-91e0-218cb5b9d3b6`.

## 10. Resumo agregado de clientes sem PII

Nenhum nome, telefone, email, documento ou nota individual de cliente foi listado.

| Metrica agregada | Valor |
| --- | ---: |
| Total de clientes | 28 |
| Com marcador demo/teste/TG em nome ou notas | 11 |
| Sem marcador | 17 |
| Com agendamento | 19 |
| Com venda de produto | 13 |
| Com `customerId` em financeiro | 16 |

Recomendacao futura:

1. Tratar os 17 sem marcador como possivelmente reais.
2. Nao expor PII em documento ou reuniao aberta.
3. Clientes de teste com historico devem ser preservados ou ocultados, nao apagados.
4. Definir data de corte antes de relatorios reais.

## 11. Resumo agregado financeiro/comissoes

| Metrica | Valor |
| --- | ---: |
| Lancamentos financeiros | 101 |
| Receitas | 85 |
| Despesas | 16 |
| Fonte `SERVICE` | 71 |
| Fonte `PRODUCT` | 14 |
| Fonte `COMMISSION` | 1 |
| Fonte `REFUND` | 3 |
| Fonte nula/manual | 12 |
| Referencia `APPOINTMENT` | 71 |
| Referencia `PRODUCT_SALE` | 14 |
| Referencias de refund | 3 |
| Referencia `MANUAL` | 12 |
| Comissoes totais | 84 |
| Comissoes pendentes | 82 |
| Comissoes pagas | 1 |
| Comissoes canceladas | 1 |
| Vendas de produto | 14 |
| Itens de venda | 19 |
| Refunds | 3 |
| Movimentos de estoque | 9 |
| Auditorias | 43 |

Sinais em textos financeiros: 90 lancamentos com marcador `demo` e 5 com marcador `teste` pela heuristica readonly. Isso nao autoriza exclusao; autoriza apenas classificar o historico como contaminado ate revisao.

Recomendacao financeira: definir data de corte e manter historico anterior como teste/legado, sem pagar comissao antiga, sem zerar saldo e sem usar saldo atual como verdade operacional.

## 12. Dependencias encontradas

| Dependencia | Impacto |
| --- | --- |
| Todos os servicos tem agendamento e financeiro/comissao relacionados | Nenhum servico deve ser removido; so ocultar/inativar futuramente |
| Todos os produtos tem venda/financeiro relacionados | Nenhum produto deve ser removido; bloquear venda futura se necessario |
| `demo-pro-*` tem agenda, vendas, financeiro e comissoes | Nao remover; confirmar se sao pessoas reais ou historico demo |
| `pro-db-*` tem vinculos cross-tenant e regras de comissao | Exige saneamento tecnico separado antes de inativar/deletar |
| Clientes tem PII e historico | Nao listar nem apagar; tratar por agregados |
| `FinancialEntry` nao tem FK explicita para referencias | Qualquer saneamento financeiro exige reconciliacao por `referenceType/referenceId` |
| Auditoria existe para eventos sensiveis | Preservar como trilha, mesmo se dado operacional for ocultado |

## 13. Registros que parecem seguros para manter

Seguros para manter como candidatos, nao como verdade final:

| Categoria | Registros |
| --- | --- |
| Servicos | `svc-barba`, `svc-corte` |
| Produtos | `prd-pomada`, `prd-oleo-barba` |
| Profissional | `pro-01` Geovane Borges |
| Clientes | 17 sem marcador, tratados como possivelmente reais e protegidos |

Ressalva CTO: manter nao significa liberar fluxo real. Preco, duracao, estoque, regras de comissao e carteira de clientes ainda dependem de confirmacao.

## 14. Registros que parecem candidatos a saneamento futuro

| Categoria | Registros | Acao futura mais segura |
| --- | --- | --- |
| Servico teste | `Servico Teste Comissao TG` | Inativar/ocultar, preservando historico |
| Servicos demo | `demo-svc-*` | Confirmar com Geovane; se nao reais, inativar/ocultar |
| Produto teste | `Produto Teste Estoque TG` | Inativar/bloquear venda futura, preservando venda/refund/estoque |
| Produtos demo | `demo-prd-*` | Confirmar; se nao reais, inativar/bloquear venda futura |
| Profissional TG | `Profissional Teste Comissao TG` | Inativar futuramente apos preservar auditoria |
| Profissionais DB | 39 `pro-db-*` | Resolver cross-tenant e regras de comissao antes de qualquer delete/inativacao |
| Clientes marcados | 11 agregados com demo/teste/TG | Ocultar/arquivar com preservacao de historico |
| Financeiro marcado | Lancamentos com sinais demo/teste | Separar por data de corte; nao apagar |

## 15. Registros que exigem confirmacao do Geovane

| Categoria | Confirmacao necessaria |
| --- | --- |
| `svc-barba` | Nome real, preco, duracao, custo, consumo de estoque, comissao |
| `svc-corte` | Nome real, preco, duracao, custo, consumo de estoque, comissao |
| `demo-svc-combo` | Se existe como servico real e qual duracao/preco |
| `demo-svc-degrade` | Se existe como servico real |
| `demo-svc-sobrancelha` | Se Geovane atende e se entra no publico |
| `demo-svc-hidratacao` | Se existe, se e feminino/manual, se deve ficar oculto |
| `prd-pomada` e `prd-oleo-barba` | Estoque fisico, preco, custo e venda real |
| `demo-prd-*` | Se algum produto e real apesar da origem demo |
| `demo-pro-02/03/04` | Se Rafael, Lucas e Matheus existem na operacao |
| Clientes sem marcador | Se sao clientes reais e se devem permanecer |
| Financeiro/comissoes | Se historico deve ser ignorado, arquivado ou reconciliado |

## 16. Registros que nao devem ser removidos por historico

Nao remover em saneamento automatico:

| Tipo | Motivo |
| --- | --- |
| Todos os 7 servicos | Todos tem agendamentos e lancamentos/comissoes via agendamento |
| Todos os 9 produtos | Todos tem itens de venda e lancamentos financeiros via venda |
| `demo-pro-02`, `demo-pro-03`, `demo-pro-04` | Agenda, vendas, financeiro e comissoes |
| `pro-01` | Profissional real provavel e historico operacional |
| Clientes com agendamento/venda/financeiro | PII e historico operacional |
| Lancamentos financeiros | Historico contabil/operacional contaminado, mas ainda historico |
| Comissoes | 82 pendentes, 1 paga, 1 cancelada; exige politica |
| Auditorias | Trilha de eventos sensiveis |

## 17. Ordem segura de saneamento futuro

1. Fazer backup obrigatorio do banco.
2. Congelar acoes reais de agenda, checkout, venda, pagamento, refund, financeiro e comissao.
3. Definir data de corte para separar legado/teste de operacao real.
4. Confirmar Geovane sobre servicos, produtos, profissionais, clientes, horarios e comissoes.
5. Corrigir/limpar vinculos cross-tenant `pro-db-*` x `svc-db-*` em plano tecnico separado.
6. Inativar/ocultar profissionais demo sem historico critico; para `demo-pro-*`, preservar historico.
7. Inativar/ocultar servicos demo/teste sem uso real, sempre preservando historico.
8. Inativar/ocultar produtos demo/teste sem uso real e bloquear venda futura.
9. Tratar clientes teste por agregados, sem expor PII e preservando historico.
10. Tratar financeiro/comissoes historicas com politica de data de corte.
11. Rodar smoke readonly.
12. Validar painel interno com dados saneados.
13. So entao avaliar liberacao da Sprint 227.

## 18. Criterios de bloqueio

Nao sanear ainda quando:

| Bloqueio | Motivo |
| --- | --- |
| Sem backup | Sem reversao confiavel |
| Sem resposta de Geovane | Risco de remover dado real |
| Sem data de corte | Relatorios e financeiro ficam ambigueis |
| Sem impacto financeiro conhecido | Risco de pagar/zerar valor errado |
| Registro tem agendamento/venda/comissao/refund | Deve preservar historico |
| Registro contem PII | Exige privacidade e tratamento agregado |
| Registro tem vinculo cross-tenant | Exige plano tecnico antes de mutacao |
| Duvida entre real e demo | Confirmar antes de agir |

## 19. O que nao foi feito por seguranca

Nao foi feito:

| Item | Status |
| --- | --- |
| Alteracao de banco | Nao executada |
| Inativacao ou exclusao | Nao executada |
| Alteracao de servico/produto/profissional/cliente | Nao executada |
| Alteracao de preco/duracao/estoque | Nao executada |
| Checkout, venda ou pagamento | Nao executado |
| Comissao, baixa, refund ou estorno | Nao executado |
| Migration ou seed | Nao executada |
| Alteracao em `.env` | Nao executada |
| Deploy, PM2, Nginx, firewall ou certificado | Nao executado |
| `npm run test:db` | Nao executado |
| Exposicao de PII de clientes | Nao executada |
| Avanco para Sprint 227 | Nao executado |

## 20. Opiniao tecnica CTO

| Pergunta | Opiniao CTO |
| --- | --- |
| Esta etapa foi util ou burocratica? | Util. Ela revelou dependencias concretas e um achado cross-tenant em `ServiceProfessional`. |
| O que ela destrava? | Um saneamento futuro com ordem segura, criterios de bloqueio e lista de registros que nao podem ser removidos no chute. |
| Da para sanear sem resposta do Geovane? | So itens inequivocamente tecnicos poderiam ser preparados; ainda assim eu exigiria backup. Para servicos/produtos/profissionais plausiveis, nao. |
| Quais dados parecem mais perigosos? | Financeiro/comissoes, clientes com PII, produtos com estoque/venda, e profissionais demo com comissoes. |
| Qual seria o maior erro agora? | Deletar ou pagar/baixar registros antigos tratando historico contaminado como verdade operacional. |
| Qual seria o saneamento mais seguro? | Ocultar/inativar futuro com historico preservado, data de corte, backup e validacao de Geovane. |
| Da para avancar para Sprint 227? | Nao. Ainda ha dados mistos, financeiro contaminado e dependencias perigosas. |
| O que ainda depende do Geovane? | Servicos reais, precos, duracoes, produtos fisicos, estoque, profissionais reais, horarios, comissoes e destino do historico. |
| O que nao devemos fazer agora? | Nao apagar, nao inativar, nao alterar financeiro/estoque, nao pagar comissao, nao usar saldo atual como verdade e nao abrir fluxo real. |

## 21. Decisao final

Decisao final: Sprint 227 permanece BLOQUEADA.

Sprint 226.2 aprovada como dry-run tecnico. O projeto deve seguir para um plano de saneamento controlado, nao para execucao real.

## 22. Proxima sprint recomendada

Recomendacao: Sprint 226.3 - Plano tecnico de saneamento controlado com backup, data de corte e estrategia de rollback.

Escopo sugerido da Sprint 226.3:

1. Definir backup e restauracao testavel.
2. Definir data de corte.
3. Produzir comandos de saneamento em modo dry-run e depois modo executavel, separados.
4. Resolver primeiro a contaminacao cross-tenant de `ServiceProfessional`.
5. Preparar saneamento por camadas: profissionais, servicos, produtos, clientes, financeiro.
6. Exigir aprovacao explicita antes de qualquer mutacao.

Minha recomendacao pratica: nao esperar indefinidamente Geovane para preparar o plano tecnico, mas nao executar saneamento de dados plausiveis sem a confirmacao dele.
