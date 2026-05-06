# 105 - Financeiro Conciliado e Limpo

Data: 2026-05-05
Fase: 1.5
Status: IMPLEMENTADA

## Resumo executivo
A Fase 1.5 aplicou o funil operacional ao Financeiro. A tela principal passou a abrir com resultado do periodo, entradas, saidas, saldo, movimento e principais origens financeiras em linguagem humana.

Campos tecnicos como `source`, `referenceType`, `referenceId`, `professionalId`, `customerId`, `appointmentId`, `productSaleId`, `idempotencyKey` e auditoria foram removidos da superficie principal e preservados no detalhe progressivo com `EntityDrawer` e `TechnicalTrace`.

Nenhuma regra financeira, checkout, venda, devolucao, comissao, estoque, auditoria, tenant guard, permissao, idempotencia, backend ou schema Prisma foi alterado.

## Objetivo da fase
- Tornar Financeiro claro, conciliado, rastreavel e limpo.
- Mostrar primeiro resultado, entradas, saidas, saldo e origens.
- Manter lancamentos financeiros resumidos para leitura rapida.
- Levar vinculos operacionais e rastreabilidade tecnica para drawer.
- Preservar lancamento manual com idempotencia sem expor a chave.

## Antes/depois conceitual
Antes:
- Financeiro exibia KPIs demais e blocos secundarios de comissoes/relatorios competindo com o extrato.
- Cards e tabela mostravam `source`, `referenceType`, `referenceId` e `professionalId` na superficie.
- A origem financeira aparecia em linguagem parcialmente tecnica.
- Nao havia detalhe progressivo para investigacao de um lancamento.

Depois:
- Financeiro usa `PageHeader` com acao primaria "Novo lancamento".
- Filtros essenciais ficam visiveis; periodo personalizado fica recolhido.
- O topo prioriza apenas Entradas, Saidas, Saldo e Resultado.
- Principais origens aparecem humanizadas.
- Lista principal mostra data, descricao, origem humana, categoria, metodo, valor e "Ver detalhes".
- Drawer organiza resumo, vinculo operacional, impacto e rastreabilidade tecnica recolhida.

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

## Mudancas feitas no Financeiro
- `public/index.html` recebeu mounts para header, filtros e drawer financeiro.
- O painel antigo de filtros foi substituido por `FilterBar`.
- O bloco de comissoes e relatorios saiu da superficie do Financeiro para evitar dashboard paralelo.
- `public/app.js` passou a montar header/filtros do Financeiro com os componentes operacionais.
- `public/modules/financeiro.js` foi reescrito como superficie de funil e detalhe progressivo.
- `TechnicalTrace` foi ampliado para campos financeiros.
- O fluxo de lancamento manual manteve POST/PATCH existentes, idempotencyKey e mensagens humanas.

## Como a tela evita poluicao visual
A superficie principal nao mostra:
- `source` cru;
- `referenceType` cru;
- `referenceId`;
- `professionalId`;
- `customerId`;
- `appointmentId`;
- `productSaleId`;
- `idempotencyKey`;
- payload tecnico;
- auditoria tecnica.

Ela mostra apenas:
- periodo;
- entradas;
- saidas;
- saldo;
- resultado/movimento;
- principais origens humanizadas;
- lista resumida de lancamentos;
- valor, data e acao "Ver detalhes".

## Como origens financeiras foram humanizadas
Mapeamentos principais:
- `SERVICE` / `APPOINTMENT`: "Atendimento finalizado".
- `PRODUCT` / `PRODUCT_SALE`: "Venda de produto".
- `COMMISSION`: "Comissao paga".
- `APPOINTMENT_REFUND`: "Estorno de atendimento".
- `PRODUCT_SALE_REFUND`: "Devolucao de produto".
- `MANUAL`: "Lancamento manual".
- `REFUND` sem detalhe: "Reverso financeiro".

Origens desconhecidas caem de forma conservadora para "Entrada operacional" ou "Despesa operacional".

## Como funciona o detalhe progressivo
O drawer do lancamento tem quatro camadas:

1. Resumo: tipo, valor, data, descricao, origem humanizada, categoria e metodo de pagamento.
2. Vinculo operacional: atendimento, venda, devolucao/estorno, profissional, cliente ou comissao quando disponivel.
3. Impacto: frase operacional explicando se veio de checkout, venda, devolucao, comissao ou lancamento manual.
4. Rastreabilidade tecnica: `TechnicalTrace` recolhido com IDs e referencias tecnicas.

## Como rastreabilidade tecnica foi escondida
`source`, `referenceType`, `referenceId`, `financialEntryId`, `appointmentId`, `productSaleId`, `commissionId`, `professionalId`, `customerId`, `idempotencyKey` e auditoria relacionada ficam apenas no drawer, dentro de `TechnicalTrace`, fechado por padrao.

## Conciliacao com outros modulos
- Agenda/Checkout: entradas de atendimento sao exibidas como "Atendimento finalizado".
- PDV: entradas de venda aparecem como "Venda de produto".
- Devolucoes/Estornos: saidas reversas aparecem como "Devolucao de produto" ou "Estorno de atendimento".
- Estoque: devolucao de produto continua conciliada pelo fluxo de PDV/estoque sem duplicar dados tecnicos no Financeiro.
- Comissoes: pagamento de comissao aparece como despesa "Comissao paga".
- Auditoria: eventos criticos permanecem no backend e na tela de Auditoria; o Financeiro so mostra referencia tecnica recolhida.

## Lançamento manual
O fluxo existente foi preservado:
- mesma rota de criacao/edicao;
- `idempotencyKey` continua sendo enviada no POST;
- modal diferencia entrada e despesa;
- mensagens foram humanizadas;
- chave idempotente nao aparece para usuario comum.

Mensagens aplicadas:
- "Lançamento registrado com sucesso."
- "Informe um valor válido."
- "Esta operação já foi processada. Atualize a tela para conferir o resultado."
- "Não foi possível registrar o lançamento. Confira os dados e tente novamente."

## Comportamento mobile
No mobile, Financeiro fica leitura-primeiro:
- header e acao principal empilhados;
- resumo do periodo antes da lista;
- filtros em `FilterBar` empilhado;
- periodo personalizado recolhido;
- lista em cards;
- detalhe em drawer/bottom sheet;
- rastreabilidade tecnica recolhida.

## Arquivos alterados
- `public/index.html`
- `public/app.js`
- `public/components/operational-ui.js`
- `public/modules/financeiro.js`
- `public/styles/layout.css`
- `.planning/105_FINANCEIRO_CONCILIADO_LIMPO.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Riscos
- `public/app.js` continua grande e centralizado; a modularizacao gradual ainda e recomendada.
- O endpoint de transacoes nao retorna `idempotencyKey` no GET atual; o campo ja esta preparado no `TechnicalTrace` se vier em payload futuro.
- O vinculo de refund com atendimento/venda depende de `notes` para alguns casos, porque o contrato atual retorna `referenceId` como refundId.
- Validacao visual humana desktop/mobile ainda deve ser executada antes de release.

## Criterios de aceite
- Financeiro usa componentes da Fase 1.1 onde faz sentido.
- Superficie principal mostra resultado e decisao, nao detalhes tecnicos.
- Origens financeiras ficam humanizadas.
- Lista principal fica simples e clara.
- Detalhe do lancamento usa drawer progressivo.
- Informacoes tecnicas ficam recolhidas.
- EmptyState aparece quando nao houver lancamentos.
- Mobile continua funcional por CSS responsivo.
- Nenhum fluxo critico foi removido.
- Nenhuma regra de negocio ou schema Prisma foi alterado.
- Build passou.
- Testes passaram fora do sandbox.
- Smoke API passou fora do sandbox.

## Validacoes executadas
- Sintaxe ES module de `public/app.js`, `public/modules/financeiro.js` e `public/components/operational-ui.js`: PASSOU com `vm.SourceTextModule`.
- `npm.cmd run build`: PASSOU no sandbox.
- `npm.cmd run test`: FALHOU no sandbox por `spawn EPERM` do Vitest/Rolldown ao carregar `vitest.config.ts`.
- `npm.cmd run test` fora do sandbox: PASSOU com `63 passed | 10 skipped`.
- `npm.cmd run smoke:api`: FALHOU no sandbox porque Prisma tentou acessar `binaries.prisma.sh` para verificar/baixar engine.
- `npm.cmd run smoke:api` fora do sandbox: PASSOU; cobriu agenda, checkout, venda de produto, historico, devolucao, financeiro, comissoes, dashboard e auditoria.

## Proxima fase recomendada
Fase 1.6 - Auditoria em timeline legivel e nao tecnica.

Escopo sugerido:
1. Transformar Auditoria em linha do tempo compreensivel.
2. Manter payloads, IDs, before/after, requestId e idempotencyKey recolhidos.
3. Aplicar filtros essenciais e avancados.
4. Preservar restricao owner-only e auditabilidade integral.
