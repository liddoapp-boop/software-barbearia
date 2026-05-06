# 103 - PDV, Historico de Vendas e Devolucoes em Funil Premium

Data: 2026-05-05
Fase: 1.3
Status: IMPLEMENTADA

## Resumo executivo
A Fase 1.3 aplicou a camada operacional premium ao PDV, historico de vendas e devolucao de produto. A tela principal agora e tarefa-primeiro: buscar produto, montar carrinho, selecionar cliente/profissional quando fizer sentido, conferir total e cobrar venda.

Historico, devolucao, impacto financeiro, impacto em estoque, IDs tecnicos e rastreabilidade foram movidos para detalhe progressivo, drawer ou `TechnicalTrace`, sem alterar backend, regras de negocio, schema Prisma, estoque, financeiro, comissao, auditoria, permissoes, tenant guard ou idempotencia.

## Objetivo da fase
- Reduzir poluicao visual do PDV.
- Manter carrinho e total como centro da experiencia.
- Fazer historico servir ao operador sem dominar a tela.
- Guiar devolucoes com quantidades vendidas, devolvidas e disponiveis.
- Preservar rastreabilidade tecnica para suporte/auditoria sem expor ao usuario comum.

## Antes/depois conceitual
Antes:
- PDV e historico dividiam peso visual parecido.
- Historico mostrava itens e devolucoes direto na superficie.
- Modal de devolucao expunha o ID da venda.
- Status de devolucao usavam classes locais.

Depois:
- PDV abre com `PageHeader` e carrinho em destaque.
- A acao primaria "Cobrar venda" usa `PrimaryAction`.
- Historico mostra data, cliente, total, status e acoes.
- Detalhe de venda abre em `EntityDrawer` com resumo, itens, impactos e rastreabilidade recolhida.
- Devolucao mostra produto, vendido, devolvido, disponivel e quantidade a devolver sem ID tecnico na superficie.

## Componentes usados da Fase 1.1
- `renderPageHeader`
- `renderPrimaryAction`
- `renderFilterBar`
- `bindFilterBars`
- `renderEntityDrawer`
- `bindEntityDrawers`
- `renderTechnicalTrace`
- `renderEmptyState`
- `renderStatusChip`

## Mudancas feitas no PDV
- `public/index.html` recebeu mounts para header do PDV, acao primaria, filtros de historico e drawer de venda.
- `public/app.js` passou a montar o header do PDV com `renderPageHeader`.
- O botao de submissao da venda passou a ser renderizado com `renderPrimaryAction` como "Cobrar venda".
- A venda continua aceitando cliente e profissional opcionais quando o backend permite venda avulsa.
- O carrinho foi simplificado para produto, quantidade, subtotal, remocao/ajuste e total final.
- `idempotencyKey` continua sendo gerada e enviada em venda de produto, mas nao aparece para usuario comum.

## Mudancas feitas no historico de vendas
- A superficie do historico foi reduzida para data, cliente, total, status e acoes.
- Status de devolucao usam `renderStatusChip` para `NOT_REFUNDED`, `PARTIALLY_REFUNDED` e `REFUNDED`.
- Estado vazio usa `renderEmptyState`.
- Filtros usam `renderFilterBar`; busca e atualizar ficam essenciais, periodo fica recolhido.
- A acao "Ver detalhes" abre drawer progressivo da venda.

## Mudancas feitas no fluxo de devolucao
- A devolucao continua usando o endpoint `POST /sales/products/:id/refund`.
- `idempotencyKey` continua sendo gerada e enviada em devolucao de produto.
- O modal deixou de mostrar o ID da venda na superficie.
- Itens mostram produto vendido, quantidade vendida, quantidade ja devolvida, quantidade disponivel e campo de quantidade.
- Mensagens foram humanizadas:
  - "Produto devolvido com sucesso."
  - "A quantidade informada e maior do que a quantidade disponivel para devolucao."
  - "Esta operacao ja foi processada. Atualize a tela para conferir o resultado."

## Como a tela evita poluicao visual
- A superficie principal nao mostra `saleId`, `productSaleId`, `referenceId`, `idempotencyKey`, detalhes financeiros tecnicos ou detalhes tecnicos de estoque.
- O historico nao lista toda composicao da venda antes do clique em "Ver detalhes".
- Impactos financeiro/estoque aparecem no drawer, em secoes recolhiveis.
- Rastreabilidade fica em `TechnicalTrace` recolhido por padrao.

## Detalhe progressivo
O drawer de venda organiza:
1. Resumo: data, cliente, profissional, total, status e quantidade de itens.
2. Itens: produto, quantidade vendida, devolvida, devolvivel e subtotal.
3. Acoes/impactos: devolver produto, ver impacto financeiro e ver impacto no estoque.
4. Rastreabilidade tecnica: `saleId`, `productSaleId`, `referenceType`, `referenceId`, `idempotencyKey` quando disponivel e entidade/evento de auditoria.

## Rastreabilidade tecnica escondida
- `renderTechnicalTrace` foi ampliado para aceitar `saleId`, `productSaleId`, `productSaleItemId` e `refundId`.
- Esses campos aparecem somente dentro do drawer e recolhidos por padrao.
- Auditoria permanece como tela owner-only para investigacao tecnica completa.

## Comportamento mobile
- `PageHeader` empilha titulo e contexto.
- O PDV prioriza produto, quantidade, carrinho, total e cobrar venda.
- Historico fica abaixo do fluxo principal.
- Filtros de periodo ficam recolhidos.
- `EntityDrawer` segue como bottom sheet responsivo.

## Arquivos alterados
- `public/index.html`
- `public/app.js`
- `public/components/operational-ui.js`
- `public/modules/pdv.js`
- `public/styles/layout.css`
- `.planning/103_PDV_HISTORICO_DEVOLUCOES_FUNIL_PREMIUM.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Riscos
- `public/app.js` continua centralizado e grande; a extracao gradual do PDV para modulo dedicado ainda e recomendada.
- A validacao visual humana em navegador real/mobile ainda deve ser executada antes de release.
- Historico de vendas depende do contrato atual de `GET /sales/products`; `refundId` so aparece no trace se o payload futuro passar a expor esse dado.
- A mensagem de idempotencia exibida e generica de operacao ja processada, mantendo coerencia com checkout e devolucao.

## Criterios de aceite
- PDV usa componentes da Fase 1.1 onde faz sentido.
- Carrinho fica simples e claro.
- Historico de vendas nao domina a tela principal.
- Devolucao fica guiada e compreensivel.
- Detalhe da venda usa drawer progressivo.
- Informacoes tecnicas ficam recolhidas.
- Status ficam padronizados com `StatusChip`.
- `EmptyState` aparece sem vendas/historico.
- Mobile continua funcional por CSS responsivo.
- Nenhum fluxo critico foi removido.
- Build passa.
- Testes nao regredem fora da limitacao conhecida do sandbox.
- Smoke API passa fora da limitacao conhecida do sandbox.

## Validacoes executadas
- Sintaxe ES module de `public/app.js`, `public/modules/pdv.js` e `public/components/operational-ui.js`: PASSOU com `node --experimental-vm-modules --input-type=module` e `vm.SourceTextModule`.
- `node --check public/*.js`: FALHOU por `package.json` estar em `type=commonjs`; os arquivos do `public` usam ESM de navegador. Nao indica erro de sintaxe real do modulo.
- `npm.cmd run build`: PASSOU no sandbox.
- `npm.cmd run test`: FALHOU no sandbox por `spawn EPERM` do Vitest/Rolldown ao carregar `vitest.config.ts`; PASSOU fora do sandbox com `63 passed | 10 skipped`.
- `npm.cmd run smoke:api`: FALHOU no sandbox por acesso/verificacao do binario Prisma em `binaries.prisma.sh`; PASSOU fora do sandbox.

Resultado do smoke fora do sandbox:
- Health/autenticacao/catalogo passaram.
- Agenda -> confirmar -> iniciar -> checkout passou.
- Venda de produto, historico e devolucao passaram.
- Financeiro, comissoes, dashboard e auditoria passaram.

## Proxima fase recomendada
Fase 1.4 - Estoque rastreavel sem poluicao visual.

Escopo recomendado:
- Aplicar `PageHeader`, `FilterBar`, `EntityDrawer`, `StatusChip`, `EmptyState` e `TechnicalTrace` no Estoque.
- Manter tela principal focada em produto, quantidade, status e acao.
- Mover ficha tecnica, movimentos, referencias e auditoria para drawer/detalhe progressivo.
