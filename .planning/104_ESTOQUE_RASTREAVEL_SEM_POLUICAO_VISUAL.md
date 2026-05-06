# 104 - Estoque Rastreavel Sem Poluicao Visual

Data: 2026-05-05
Fase: 1.4
Status: IMPLEMENTADA

## Resumo executivo
A Fase 1.4 aplicou o funil operacional premium ao Estoque. A tela principal agora mostra primeiro produtos sem estoque, criticos, com estoque baixo e com necessidade de reposicao, mantendo busca simples, filtros essenciais e uma acao clara.

Movimentacoes, ficha economica, origem de baixa/entrada, referencias e IDs tecnicos foram movidos para detalhe progressivo em `EntityDrawer` e `TechnicalTrace`, sem alterar backend, dominio, financeiro, auditoria, permissoes, tenant guard, idempotencia, schema Prisma ou regras de estoque.

## Objetivo da fase
- Transformar Estoque em uma fila de decisao operacional.
- Priorizar ruptura, criticidade e reposicao.
- Manter a superficie principal limpa e compreensivel para usuario comum.
- Preservar rastreabilidade tecnica para suporte, auditoria e investigacao.
- Melhorar ajuste de estoque sem expor IDs tecnicos.

## Antes/depois conceitual
Antes:
- Estoque abria como tabela administrativa com resumo, filtros e muitos botoes por linha.
- Preco/custo competiam com quantidade e status.
- Movimentacoes ficavam longe da leitura do produto.
- Status e acoes eram locais do modulo.

Depois:
- Estoque abre com `PageHeader`, acao "Novo produto" e filtros em `FilterBar`.
- Produtos sao ordenados por atencao: sem estoque, criticos, baixo estoque e normais.
- A lista principal mostra produto, categoria, quantidade atual, minimo, status, sugestao e acoes curtas.
- O detalhe do produto abre em `EntityDrawer`.
- Movimentacoes foram humanizadas.
- `productId`, `stockMovementId`, `referenceType` e `referenceId` ficam em `TechnicalTrace` recolhido.

## Componentes usados da Fase 1.1
- `renderPageHeader`
- `renderPrimaryAction`
- `renderFilterBar`
- `bindFilterBars`
- `renderStatusChip`
- `renderEmptyState`
- `renderEntityDrawer`
- `bindEntityDrawers`
- `renderTechnicalTrace`

## Mudancas feitas no Estoque
- `public/index.html` recebeu mounts para header, filtros operacionais e drawer de produto.
- `public/app.js` passou a montar o header do Estoque com `renderPageHeader`.
- A acao principal passou a ser `renderPrimaryAction` com "Novo produto".
- Busca e status ficam visiveis; categoria ficou em filtro avancado recolhido.
- `public/modules/estoque.js` foi reorganizado para renderizar uma fila operacional em vez de uma tabela poluida.
- A lista desktop e mobile passou a usar `renderStatusChip`.
- O estado vazio passou a usar `renderEmptyState`.
- O detalhe do produto passou a usar `EntityDrawer`.
- `TechnicalTrace` foi ampliado para aceitar `productId` e `stockMovementId`.

## Como a tela evita poluicao visual
A superficie principal nao mostra `productId`, `stockMovementId`, `referenceType`, `referenceId`, payload tecnico, idempotencia ou auditoria. Ela mostra apenas:
- nome do produto;
- categoria;
- quantidade atual;
- estoque minimo;
- status;
- sugestao de acao;
- preco de venda como informacao secundaria;
- acoes "Ver detalhes" e "Ajustar estoque".

## Como produtos criticos sao priorizados
A ordenacao visual e feita no frontend sem mudar regra de negocio:
1. `OUT_OF_STOCK` / quantidade zero.
2. `CRITICAL` / quantidade ate metade do minimo.
3. `LOW_STOCK` / quantidade abaixo ou igual ao minimo.
4. `IN_STOCK` / produtos normais.

Os cards de atencao mostram sem estoque, criticos, estoque baixo, reposicao sugerida e valor estimado. Produtos normais continuam acessiveis, mas nao competem com os alertas.

## Detalhe progressivo
O drawer de produto organiza:
1. Resumo: produto, categoria, quantidade atual, estoque minimo, preco, custo, valor em estoque e sugestao.
2. Acoes: registrar entrada, registrar saida, editar produto e inativar produto.
3. Movimentacoes: historico recente humanizado.
4. Rastreabilidade tecnica: `productId`, `stockMovementId`, `referenceType`, `referenceId` e auditoria relacionada quando disponivel.

## Movimentacoes humanizadas
As origens tecnicas foram traduzidas para linguagem operacional:
- `PRODUCT_SALE`: "Saida por venda de produto".
- `PRODUCT_REFUND`: "Entrada por devolucao".
- `ADJUSTMENT`: "Ajuste manual".
- `INTERNAL`: "Consumo interno" ou "Perda".
- `SERVICE_CONSUMPTION`: "Consumo por servico".

O drawer tambem explica a origem:
- "Este produto saiu do estoque por uma venda."
- "Este produto voltou ao estoque por uma devolucao."
- "Este movimento foi feito manualmente."

## Rastreabilidade tecnica escondida
O bloco tecnico aparece apenas dentro do drawer, recolhido por padrao em `TechnicalTrace`. A Auditoria continua sendo a tela owner-only para investigacao completa.

## Comportamento mobile
No mobile, Estoque fica tarefa-primeiro:
- header e acao principal empilhados;
- alertas primeiro;
- busca/status antes de filtros avancados;
- lista em cards;
- ajuste rapido por botao;
- detalhe em drawer responsivo/bottom sheet;
- rastreabilidade tecnica recolhida.

## Arquivos alterados
- `public/index.html`
- `public/app.js`
- `public/components/operational-ui.js`
- `public/modules/estoque.js`
- `public/styles/layout.css`
- `.planning/104_ESTOQUE_RASTREAVEL_SEM_POLUICAO_VISUAL.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Riscos
- `public/app.js` segue grande; a extracao gradual de orquestracao por modulo ainda e recomendada.
- O endpoint `/inventory` entrega movimentacoes recentes limitadas; produtos sem movimento recente podem abrir drawer sem historico completo.
- O status `CRITICAL` e uma camada visual derivada de quantidade/minimo; o backend continua retornando `OUT_OF_STOCK`, `LOW_STOCK` e `IN_STOCK`.
- Validacao visual humana em navegador real/mobile ainda deve ser feita antes de release.
- Testes e smoke fora do sandbox nao puderam ser executados nesta rodada por limite de aprovacao automatica.

## Criterios de aceite
- Estoque usa componentes da Fase 1.1 onde faz sentido.
- Produtos criticos aparecem com prioridade.
- Lista principal fica simples e clara.
- Detalhe do produto usa drawer progressivo.
- Movimentacoes ficam humanizadas.
- Informacoes tecnicas ficam recolhidas.
- Status ficam padronizados com `StatusChip`.
- EmptyState aparece quando nao houver produtos.
- Mobile continua funcional por CSS responsivo.
- Nenhum fluxo critico foi removido.
- Nenhuma regra de negocio ou schema Prisma foi alterado.

## Validacoes executadas
- Sintaxe ES module de `public/app.js`, `public/modules/estoque.js` e `public/components/operational-ui.js`: PASSOU com `vm.SourceTextModule`.
- `npm.cmd run build`: PASSOU.
- `npm.cmd run test`: FALHOU no sandbox por `spawn EPERM` do Vitest/Rolldown ao carregar `vitest.config.ts`.
- Tentativa de rodar `npm.cmd run test` fora do sandbox: BLOQUEADA pela aprovacao automatica por limite de uso, sem execucao.
- `npm.cmd run smoke:api`: FALHOU no sandbox porque Prisma tentou acessar `binaries.prisma.sh` para verificar/baixar engine.
- Tentativa de rodar `npm.cmd run smoke:api` fora do sandbox: BLOQUEADA pela aprovacao automatica por limite de uso, sem execucao.

## Proxima fase recomendada
Fase 1.5 - Financeiro conciliado e limpo.

Escopo sugerido:
1. Aplicar `PageHeader`, `PrimaryAction`, `FilterBar`, `EntityDrawer`, `StatusChip`, `EmptyState` e `TechnicalTrace` no Financeiro.
2. Mover `source`, `referenceType`, `referenceId`, `professionalId` e rastreabilidade para detalhe.
3. Manter conciliacao visual com PDV, checkout, devolucao e comissoes.
4. Preservar regras financeiras, auditoria, permissoes, idempotencia e tenant guard.
