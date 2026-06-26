# Sprint 226.1 - Matriz de saneamento e roteiro de piloto interno

Data: 2026-06-26

Responsavel tecnico: CTO tecnico do Projeto Software Barbearia

Escopo: auditoria, classificacao, matriz de decisao e roteiro seguro de piloto interno. Nenhuma alteracao de banco, deploy, restart, checkout, venda, pagamento, comissao, estorno ou lancamento financeiro foi executada.

## 1. Objetivo

Criar uma matriz tecnica de saneamento para separar dados reais provaveis, dados demonstrativos/teste e dados que exigem confirmacao com Geovane antes de qualquer fluxo real.

O objetivo secundario e definir um roteiro de piloto interno seguro, sem executar operacoes irreversiveis e sem expor dados pessoais de clientes.

## 2. Contexto vindo da Sprint 226

A Sprint 226 validou que o painel interno esta tecnicamente navegavel em modo guiado/read-only, mas tambem confirmou que a base ainda contem mistura relevante de dados reais provaveis com dados de demo/teste.

Resumo herdado da Sprint 226:

| Area | Resultado observado |
| --- | --- |
| Painel interno | OK para demonstracao guiada e leitura controlada |
| Fluxo real completo | Bloqueado |
| Clientes | 28 registros, com 11 marcadores de demo/teste/TG por nome ou notas |
| Servicos | 7 ativos, sendo 5 com marcador de demo/teste/TG e 2 candidatos sem marcador |
| Produtos | 9 ativos, sendo 7 com marcador de demo/teste/TG e 2 candidatos sem marcador |
| Profissionais | 44 ativos, sendo `pro-01` Geovane Borges o unico sem marcador tecnico |
| Financeiro | 101 lancamentos, 84 comissoes, 82 comissoes pendentes |
| Regras de seguranca | Proibido executar mutacoes reais ate saneamento |

Validacoes readonly executadas nesta Sprint 226.1:

| Validacao | Resultado |
| --- | --- |
| `pwd` | `/root/software-barbearia` |
| `git status -sb` inicial | `## main...origin/main` |
| `git log --oneline -10` | HEAD inicial `a3742aa docs: validar painel interno do geovane` |
| Leitura de `.planning` | Sprint 223, 225, 225.1 e 226 consultadas |
| Leitura de schema Prisma | `Service`, `Product`, `Professional`, `Client`, `FinancialEntry`, `CommissionEntry`, `ProductSale`, `Refund`, `StockMovement` |
| Consulta readonly de inventario | Prisma `findMany`, `count` e `groupBy`, sem `create`, `update`, `delete`, venda, pagamento ou estorno |

Observacao tecnica: duas tentativas readonly iniciais falharam por divergencia de campo/filtro em relacoes Prisma e foram corrigidas contra o schema. Essas tentativas nao retornaram inventario consolidado e nao alteraram dados.

## 3. Decisao de CTO

Decisao: NAO avancar para a Sprint 227 agora.

A Sprint 227, entendida como fluxo real com cliente, servico, agenda, pagamento, comissao, PDV ou financeiro, deve permanecer bloqueada ate saneamento minimo e confirmacao operacional com Geovane.

O que esta autorizado:

| Item | Decisao |
| --- | --- |
| Mostrar painel interno para Geovane | Permitido, em roteiro guiado e read-only |
| Mostrar servicos e produtos como inventario tecnico | Permitido, deixando claro que ha dados de demo/teste |
| Executar checkout, pagamento, venda, comissao ou estorno | Proibido |
| Inativar ou deletar dados agora | Proibido nesta Sprint 226.1 |
| Avancar para Sprint 227 | Bloqueado |

## 4. Criterios de classificacao

Os criterios abaixo foram aplicados somente para classificacao tecnica. Eles nao substituem confirmacao humana com Geovane.

| Classe | Criterio |
| --- | --- |
| Real provavel | Registro ativo sem marcador tecnico obvio de demo/teste/TG/DB e coerente com a operacao |
| Demo/teste | ID, nome, categoria ou notas contem marcador como `demo`, `teste`, `TG`, `DB` ou padrao equivalente |
| Duvida operacional | Registro com nome plausivel, mas ID/categoria/origem demonstra dado artificial, ou registro sem confirmacao humana |
| Manter por enquanto | Registro que pode representar operacao real, mas ainda precisa de confirmacao |
| Ocultar no piloto | Registro que nao deve aparecer como dado confiavel para validacao de negocio |
| Sanear depois | Registro candidato a inativacao, remocao logica, migracao ou ajuste apos confirmacao |

## 5. Inventario de servicos

Resumo:

| Metrica | Valor |
| --- | ---: |
| Total de servicos | 7 |
| Ativos | 7 |
| Com marcador demo/teste/TG | 5 |
| Candidatos sem marcador | 2 |

Inventario:

| ID | Nome | Categoria | Ativo | Preco | Duracao | Vinculos | Classificacao | Decisao |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |
| `svc-barba` | Barba Terapia | BARBA | Sim | 55 | 35 | 42 agend., 4 prof., 1 estoque | Real provavel | Manter apenas como candidato; confirmar nome, preco e duracao |
| `svc-corte` | Corte Premium | CORTE | Sim | 75 | 45 | 22 agend., 4 prof., 1 estoque | Real provavel | Manter apenas como candidato; confirmar nome, preco e duracao |
| `demo-svc-combo` | Combo Cabelo + Barba | COMBO | Sim | 115 | 75 | 23 agend., 4 prof. | Demo/teste ou duvida | Ocultar do piloto real; confirmar se existe como servico real |
| `demo-svc-degrade` | Degrade Navalhado | CORTE | Sim | 85 | 50 | 20 agend., 4 prof. | Demo/teste ou duvida | Ocultar do piloto real; confirmar se o servico existe |
| `demo-svc-sobrancelha` | Design de Sobrancelha | SOBRANCELHA | Sim | 35 | 20 | 21 agend., 4 prof. | Demo/teste ou duvida | Ocultar do piloto real; confirmar se Geovane atende |
| `demo-svc-hidratacao` | Hidratacao Capilar | TRATAMENTO | Sim | 65 | 40 | 21 agend., 4 prof. | Demo/teste ou duvida | Ocultar do piloto real; confirmar antes de manter |
| `a1ea4294-e3a9-42b5-b5e5-3ca719f5b483` | Servico Teste Comissao TG | TESTE_TG | Sim | 100 | 30 | 1 agend., 1 prof. | Teste tecnico | Sanear futuramente; nao usar em piloto |

Leitura CTO: os dois servicos sem marcador (`svc-corte`, `svc-barba`) ainda nao bastam para fluxo real porque os precos, duracoes, estoque consumido e comissoes precisam ser confirmados. Os demais nao devem aparecer como oferta confiavel.

## 6. Inventario de produtos

Resumo:

| Metrica | Valor |
| --- | ---: |
| Total de produtos | 9 |
| Ativos | 9 |
| Com marcador demo/teste/TG | 7 |
| Candidatos sem marcador | 2 |

Inventario:

| ID | Nome | Categoria | Ativo | Venda | Custo | Estoque | Vinculos | Classificacao | Decisao |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| `prd-pomada` | Pomada Matte | Finalizacao | Sim | 59 | 24 | 22 | 4 vendas, 1 mov., 1 consumo | Real provavel | Manter como candidato; confirmar estoque fisico e preco |
| `prd-oleo-barba` | Oleo para Barba | Barba | Sim | 39 | 14 | 18 | 2 vendas, 1 mov., 1 consumo | Real provavel | Manter como candidato; confirmar estoque fisico e preco |
| `demo-prd-cond` | Condicionador Reparador | Cabelo | Sim | 45 | 17 | 28 | 2 vendas, 1 mov. | Demo/teste | Ocultar do piloto real |
| `demo-prd-kit` | Kit Cuidado Completo | Kits | Sim | 159 | 72 | 8 | 2 vendas | Demo/teste | Ocultar do piloto real |
| `demo-prd-lamina` | Lamina Profissional (pacote) | Acessorio | Sim | 22 | 8 | 65 | 1 venda, 1 mov. | Demo/teste | Ocultar do piloto real |
| `demo-prd-perfume` | Perfume Tradicional 100ml | Perfumaria | Sim | 89 | 38 | 12 | 2 vendas | Demo/teste | Ocultar do piloto real |
| `demo-prd-shampoo` | Shampoo Anticaspa Premium | Cabelo | Sim | 49 | 19 | 30 | 3 vendas, 1 mov. | Demo/teste | Ocultar do piloto real |
| `demo-prd-talco` | Talco Pos-Barba | Barba | Sim | 29 | 9 | 40 | 2 vendas, 1 mov. | Demo/teste | Ocultar do piloto real |
| `63e543a2-5430-457b-a9d1-919c101ad967` | Produto Teste Estoque TG | TESTE TG | Sim | 20 | 5 | 10 | 1 venda, 3 mov. | Teste tecnico | Sanear futuramente; nao usar em piloto |

Leitura CTO: PDV real esta bloqueado. Existem dois produtos candidatos, mas o estoque atual ainda pode ser artificial. Antes de qualquer venda real, Geovane deve confirmar existencia fisica, preco, custo e estoque minimo.

## 7. Inventario de profissionais

Resumo:

| Metrica | Valor |
| --- | ---: |
| Total de profissionais | 44 |
| Ativos | 44 |
| Sem marcador tecnico | 1 |
| Com marcador demo/teste/DB/TG | 43 |

Inventario:

| ID | Nome | Ativo | Vinculos | Sinal | Classificacao | Decisao |
| --- | --- | --- | ---: | --- | --- | --- |
| `pro-01` | Geovane Borges | Sim | 6 serv., 48 agend., 4 vendas, 22 com. | Sem marcador | Real provavel | Manter; confirmar identidade operacional |
| `demo-pro-02` | Rafael Andrade | Sim | 7 serv., 40 agend., 4 vendas, 22 com. | ID `demo` | Demo/teste ou duvida | Ocultar; confirmar se existe na operacao |
| `demo-pro-03` | Lucas Ferreira | Sim | 6 serv., 31 agend., 3 vendas, 20 com. | ID `demo` | Demo/teste ou duvida | Ocultar; confirmar se existe na operacao |
| `demo-pro-04` | Matheus Souza | Sim | 6 serv., 31 agend., 3 vendas, 20 com. | ID `demo` | Demo/teste ou duvida | Ocultar; confirmar se existe na operacao |
| `6a063462-e0cb-4d02-a3cb-f91e26b2901a` | Profissional Teste Comissao TG | Sim | 0 serv., 0 agend., 0 vendas, 0 com. | Nome teste/TG | Teste tecnico | Sanear futuramente |
| `pro-db-3a1c71bb-40b1-4aad-a35d-dbf057aa48f7` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-d75a344c-7dcd-4048-9e6f-5405d0bf3547` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-aefca5df-9781-458a-a432-653a58d1f11b` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-eaae81af-1ba2-4a3f-bfce-9d7dee4eae84` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-4ce43008-7cfc-477d-9298-6dc928b1ccd2` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-7495d9e1-7f54-4f06-bc42-3a10e33a7e8c` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-477fc5a9-f77e-48c8-bd8f-75e831614f52` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-7d2b63a4-ec9c-4c6c-85a5-5745af8a39dc` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-f79ebbc2-c8c9-4e97-91e0-218cb5b9d3b6` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-d4026ab9-ebb6-4576-bd80-094a8d831750` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-61cc4243-2a62-4a2c-9730-b731b6649f13` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-baaec5a1-9ba8-4403-ba71-ea676a5d3d5c` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-be0f1372-b9f1-4ff4-bb2a-93cbcb77c195` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-e6b212b5-b470-496d-b58b-a226fc16649f` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-7dce4da5-be54-422b-9573-3e45c0612fad` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-dc340b8e-fbe6-44a9-b3bd-2a9ad74b9bad` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-d9e5f2dd-ee21-4e60-b955-78ba781087d0` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-bf327837-446a-4d90-ab60-c5e90734aa8b` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-7a78ada4-7ef7-45ee-84d4-aeb2c6e31828` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-98312fcf-6742-4331-b807-ea74229d531f` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-e03c1412-77e3-4386-9123-88e2e2e6f504` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-abe75b4c-8565-41d7-9611-1ee50e1158ed` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-8f3b84a0-87fe-4188-9043-1701166b3cb0` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-8223f1ae-d9fe-47c9-8028-d833b651b6a7` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-25a5b36a-b419-4ffe-a7e1-41036ca083f1` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-379ecbe7-24bf-41dc-ab47-8c4653624392` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-6fd9d54e-f2c1-47fa-80d3-124935d2f09e` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-410710d6-87a3-4f39-ac1f-99e6c0e80695` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-6078498f-7868-47dc-89d9-b68fdef9000d` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-1751e565-69c6-422e-906b-118a05042d71` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-4c5ec4db-6c9c-47c6-84fd-6fd76df0c426` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-28f4d6bc-77b6-4ab8-bdfb-52e7c09b67b0` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-f07b051e-05f0-4cd1-bd8d-06ca9e6d1636` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-3bf9160d-36ee-4aa6-afc5-da54a4d64b29` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-223cce8f-28f6-4a96-9913-7679e740dc9d` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-2035eef0-c90a-4c88-a304-932ea3869f90` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-30df9d9d-8650-48c8-a029-57982840ec1e` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-3bd03f7d-0c17-45a7-ab5a-1210d416d0f9` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |
| `pro-db-d55fa2c8-7687-4f6f-b467-ad801d675aae` | Profissional DB | Sim | 1 serv., 0 agend., 0 vendas, 0 com. | ID/nome DB | Demo/teste | Sanear futuramente |

Leitura CTO: manter `pro-01` como profissional real provavel. Todos os demais devem ficar fora do piloto real ate confirmacao, mesmo quando o nome parece plausivel.

## 8. Resumo de clientes sem dados pessoais

Nenhum nome, telefone, email, documento ou nota individual de cliente foi exposto neste documento.

| Metrica agregada | Valor |
| --- | ---: |
| Total de clientes | 28 |
| Clientes com marcador de demo/teste/TG em nome ou notas | 11 |
| Clientes sem marcador | 17 |

Leitura CTO: os 17 sem marcador devem ser tratados como possivelmente reais e protegidos como PII. Eles nao devem ser usados em demonstracao aberta nem em testes de checkout, agenda, pagamento ou comunicacao.

## 9. Resumo financeiro sem dados sensiveis

Nao foram registrados valores monetarios totais nesta matriz. A leitura ficou restrita a contagens por tipo, origem e status.

| Metrica | Valor |
| --- | ---: |
| Lancamentos financeiros totais | 101 |
| Lancamentos de receita | 85 |
| Lancamentos de despesa | 16 |
| Lancamentos de servico | 71 |
| Lancamentos de produto | 14 |
| Lancamentos de comissao | 1 |
| Lancamentos de estorno | 3 |
| Lancamentos manuais | 12 |
| Vendas de produto | 14 |
| Estornos | 3 |
| Comissoes totais | 84 |
| Comissoes pendentes | 82 |
| Comissoes pagas | 1 |
| Comissoes canceladas | 1 |

Risco financeiro atual: alto para fluxo real, porque ha 82 comissoes pendentes em base contaminada por registros demo/teste. Executar qualquer pagamento, baixa, estorno ou fechamento financeiro antes do saneamento pode consolidar dados artificiais como obrigacao operacional.

## 10. Resumo estoque/PDV

| Metrica | Valor |
| --- | ---: |
| Produtos ativos | 9 |
| Produtos candidatos sem marcador | 2 |
| Produtos demo/teste | 7 |
| Movimentos de estoque IN | 8 |
| Movimentos de estoque OUT | 1 |
| Vendas de produto | 14 |
| Produtos abaixo do minimo | 0 pela consulta atual |

Leitura CTO: estoque e PDV estao bons para demonstracao conceitual, mas nao para venda real. Os saldos podem refletir seed/demo e precisam de conferencia fisica.

## 11. Matriz de decisao

| Area | Estado atual | Pode mostrar? | Pode executar fluxo real? | Decisao |
| --- | --- | --- | --- | --- |
| Painel interno | Navegavel | Sim, guiado | Nao | Usar em piloto read-only |
| Servicos | 2 candidatos, 5 demo/teste | Sim, como inventario tecnico | Nao | Confirmar com Geovane antes de sanear |
| Produtos | 2 candidatos, 7 demo/teste | Sim, como inventario tecnico | Nao | Confirmar estoque fisico e precos |
| Profissionais | 1 real provavel, 43 demo/teste/duvida | Sim, com ressalva | Nao | Ocultar nao confirmados do piloto real |
| Clientes | 17 sem marcador e 11 marcados | Apenas agregados | Nao | Proteger PII; nao usar em demonstracao aberta |
| Financeiro | 101 lancamentos e 82 comissoes pendentes | Apenas agregado | Nao | Bloquear pagamentos/baixas/estornos |
| PDV/estoque | Dados ativos mistos | Sim, demonstracao conceitual | Nao | Conferir fisico antes de venda |

## 12. Pendencias para Geovane

Perguntas objetivas para a reuniao de validacao:

1. Confirmar se `Corte Premium` e `Barba Terapia` sao nomes reais ou nomes de demo.
2. Confirmar precos, duracoes e custos de `svc-corte` e `svc-barba`.
3. Confirmar se `Degrade Navalhado`, `Design de Sobrancelha`, `Combo Cabelo + Barba` e `Hidratacao Capilar` existem na operacao real.
4. Confirmar quais profissionais alem de Geovane existem de fato na unidade.
5. Confirmar se Rafael Andrade, Lucas Ferreira e Matheus Souza sao pessoas reais ou apenas seeds de demonstracao.
6. Confirmar quais produtos existem fisicamente.
7. Conferir estoque fisico de `prd-pomada` e `prd-oleo-barba`.
8. Definir se produtos demo devem ser inativados, removidos logicamente ou mantidos ocultos para treinamento.
9. Confirmar se os 17 clientes sem marcador sao reais e se podem permanecer na base.
10. Confirmar se lancamentos financeiros historicos devem ser preservados, arquivados, recalculados ou ignorados no piloto.
11. Confirmar regra real de comissao antes de qualquer pagamento ou baixa.
12. Confirmar quais telas podem ser mostradas em reuniao sem expor PII.

## 13. Roteiro seguro de piloto interno

Roteiro permitido antes do saneamento:

1. Abrir o painel com usuario owner de smoke ou ambiente autorizado.
2. Mostrar navegacao geral, menu e responsividade.
3. Mostrar agenda apenas como tela e explicar que os registros ainda nao sao confiaveis.
4. Mostrar servicos como inventario tecnico, destacando os 2 candidatos e os 5 registros demo/teste.
5. Mostrar produtos como inventario tecnico, destacando que estoque nao foi conferido fisicamente.
6. Mostrar profissionais sem executar cadastro, edicao, exclusao ou inativacao.
7. Mostrar financeiro apenas em agregados ou tela sem acionar baixa, pagamento, estorno ou exportacao sensivel.
8. Nao abrir detalhe de cliente com PII durante demonstracao aberta.
9. Registrar feedback de Geovane em documento de decisao.
10. Encerrar sem confirmar atendimento, sem venda, sem checkout e sem mutacao.

Resultado esperado do piloto: obter confirmacoes de negocio para permitir uma sprint de saneamento controlado.

## 14. Acoes proibidas ate saneamento

| Acao | Motivo |
| --- | --- |
| Criar atendimento real | Pode vincular cliente real a servico/profissional incorreto |
| Confirmar, concluir ou cancelar agendamento real | Pode alterar historico operacional |
| Executar checkout | Pode gerar financeiro/comissao contaminados |
| Registrar pagamento | Pode consolidar receita artificial |
| Pagar ou baixar comissao | Ha 82 comissoes pendentes nao saneadas |
| Registrar venda de produto | Estoque e produtos ainda nao foram confirmados |
| Registrar estorno | Pode gerar ajuste financeiro indevido |
| Inativar/deletar dados sem confirmacao | Pode remover dado real misturado |
| Deploy/restart por causa desta matriz | Fora do escopo da Sprint 226.1 |
| Rodar teste DB destrutivo ou pesado | Risco desnecessario para auditoria documental |

## 15. Riscos P0/P1/P2/P3

| Prioridade | Risco | Impacto | Mitigacao |
| --- | --- | --- | --- |
| P0 | Executar fluxo financeiro real em base contaminada | Pagamento, comissao, receita ou estorno incorreto | Bloquear Sprint 227; manter somente read-only |
| P0 | Expor PII de clientes em demonstracao aberta | Risco de privacidade e confianca | Usar apenas agregados; nao abrir detalhes de cliente |
| P1 | Sanear sem confirmacao com Geovane | Perda ou ocultacao de dado real | Reuniao de validacao antes de mutacao |
| P1 | Profissionais demo aparecerem como equipe real | Agenda e comissao em pessoa incorreta | Ocultar nao confirmados |
| P1 | Estoque artificial virar saldo operacional | Venda indevida e ruptura falsa | Conferencia fisica antes de PDV |
| P2 | Servicos com nome/preco/duracao incorretos | Experiencia ruim no piloto | Checklist de confirmacao de servicos |
| P2 | Relatorios misturarem historico demo com real | Decisoes gerenciais erradas | Separar/arquivar historico contaminado |
| P3 | Documento ficar desatualizado apos saneamento | Decisao antiga sendo usada como fonte | Criar sprint seguinte com checklist e data |

## 16. O que nao foi feito por seguranca

Nao foi feito:

| Item | Status |
| --- | --- |
| Alteracao de banco | Nao executada |
| Inativacao de servicos | Nao executada |
| Inativacao de produtos | Nao executada |
| Inativacao de profissionais | Nao executada |
| Checkout, venda ou pagamento | Nao executado |
| Comissao, baixa ou estorno | Nao executado |
| Deploy, restart ou smoke de producao | Nao executado |
| Teste pesado com DB | Nao executado |
| Exposicao de dados pessoais de clientes | Nao executada |

## 17. Opiniao tecnica CTO

Perguntas respondidas:

| Pergunta | Opiniao CTO |
| --- | --- |
| Da para avancar para Sprint 227 agora? | Nao. A base ainda mistura dados reais provaveis com demo/teste e tem risco financeiro ativo. |
| O que exatamente impede fluxo real? | Servicos, produtos, profissionais, clientes, financeiro e estoque ainda nao estao saneados nem confirmados por Geovane. |
| Quais dados devem ser tratados primeiro? | Primeiro profissionais e servicos; depois produtos/estoque; depois clientes; por ultimo financeiro/comissoes com historico congelado. |
| Qual risco financeiro existe hoje? | 101 lancamentos e 82 comissoes pendentes podem representar historico artificial. Pagamento ou baixa agora pode validar dado incorreto. |
| O que pode ser mostrado para Geovane sem risco? | Painel navegavel, menu, servicos/produtos/profissionais como inventario tecnico, e agregados financeiros sem PII nem mutacao. |
| O que nao deve ser mostrado/executado ainda? | Detalhe de cliente com PII, checkout, pagamento, venda, estorno, baixa de comissao, edicao/inativacao e relatorio financeiro como verdade operacional. |
| E melhor confirmar com Geovane antes de sanear? | Sim. Como ha dados plausiveis dentro de IDs demo, sanear antes de confirmar pode apagar ou esconder operacao real. |
| Recomenda saneamento ou reuniao validacao primeiro? | Reuniao de validacao primeiro, depois saneamento controlado e documentado. |
| Discorda de qualquer decisao tomada ate agora? | Nao discordo do bloqueio da Sprint 227. Concordo com o uso do painel apenas em demonstracao guiada. Minha unica recomendacao e nao tratar itens com nome plausivel como lixo ate Geovane confirmar. |

## 18. Decisao final

Decisao final: Sprint 227 BLOQUEADA.

A base esta apta para piloto interno guiado e read-only, mas nao esta apta para operacao real.

Condicoes minimas para desbloquear Sprint 227:

1. Confirmacao de servicos reais por Geovane.
2. Confirmacao de profissionais reais.
3. Confirmacao de produtos e estoque fisico.
4. Definicao de tratamento para clientes demo/teste e clientes sem marcador.
5. Politica explicita para historico financeiro contaminado.
6. Validacao de regras reais de comissao.
7. Execucao de saneamento em sprint propria, com rollback/logica de preservacao.
8. Smoke read-only e smoke operacional controlado depois do saneamento.

## 19. Proxima sprint recomendada

Recomendacao: Sprint 226.2 - Reuniao de validacao operacional com Geovane e checklist de saneamento aprovado.

Objetivo da Sprint 226.2:

1. Conduzir o roteiro seguro de piloto interno.
2. Capturar respostas de Geovane para servicos, produtos, profissionais, clientes e financeiro.
3. Gerar plano de saneamento com lista fechada de registros a manter, ocultar, inativar ou preservar como historico.
4. Somente depois disso abrir Sprint 226.3 para saneamento controlado.

Nao recomendo executar saneamento antes da validacao com Geovane, exceto se houver autorizacao explicita e escopo reduzido para itens inequivocamente tecnicos como `Servico Teste Comissao TG`, `Produto Teste Estoque TG` e registros `Profissional DB`.
