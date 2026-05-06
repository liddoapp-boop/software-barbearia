# 106 - Auditoria em Timeline Legivel

Data: 2026-05-05
Fase: 1.6
Status: IMPLEMENTADA

## Resumo executivo
A Fase 1.6 transformou a tela de Auditoria de uma superficie tecnica em uma timeline operacional para o owner. A lista principal agora responde quem fez, o que fez, quando fez, em qual modulo, qual foi o impacto, se a operacao foi sensivel e onde abrir o detalhe.

Payloads, IDs, rota, metodo, before/after e metadata continuam preservados, mas sairam da superficie principal e foram movidos para `EntityDrawer` e `TechnicalTrace` recolhido.

Nenhum backend, schema Prisma, regra financeira, checkout, PDV, estoque, comissao, permissao, idempotencia ou tenant guard foi alterado.

## Objetivo da fase
- Refatorar Auditoria para leitura owner-friendly.
- Agrupar eventos por dia em linha do tempo.
- Humanizar actions tecnicas sem perder o action original.
- Separar filtros essenciais de filtros investigativos.
- Preservar rastreabilidade completa em detalhe progressivo.
- Manter Auditoria owner-only pela permissao existente.

## Antes/depois conceitual
Antes:
- Auditoria abria como lista tecnica.
- A superficie exibia action, entity, entityId, route, method, requestId, idempotencyKey e payloads.
- before/after/metadata apareciam muito cedo para um owner operacional.
- Nao havia agrupamento por dia nem resumo de impacto.

Depois:
- Auditoria abre com `PageHeader`, `FilterBar` e timeline.
- Eventos aparecem agrupados por Hoje, Ontem ou data.
- Cada evento mostra horario, ator, perfil, acao humanizada, modulo, impacto e sensibilidade.
- O botao "Ver detalhes" abre drawer com resumo, contexto, antes/depois e `TechnicalTrace`.
- Dados tecnicos ficam recolhidos por padrao.

## Componentes usados da Fase 1.1
- `renderPageHeader`
- `renderFilterBar`
- `bindFilterBars`
- `renderStatusChip`
- `renderEmptyState`
- `renderEntityDrawer`
- `bindEntityDrawers`
- `renderTechnicalTrace`

## Mudancas feitas na Auditoria
- `public/index.html` recebeu mounts para header, filtros, lista e drawer da Auditoria.
- `public/app.js` passou a montar a Auditoria com componentes operacionais.
- Filtros essenciais e avancados foram separados.
- Filtros avancados de `requestId`, `idempotencyKey`, `entityId`, rota, metodo e limite ficaram recolhidos.
- `public/modules/auditoria.js` foi reescrito para renderizar timeline agrupada por data.
- O clique em "Ver detalhes" abre `EntityDrawer`.
- `public/components/operational-ui.js` foi ampliado para `TechnicalTrace` aceitar campos de auditoria e JSONs recolhidos.
- `public/styles/layout.css` recebeu estilos de timeline, cards, mudancas e JSON tecnico recolhido.

## Como a timeline foi organizada
Os eventos sao ordenados do mais recente para o mais antigo e agrupados por dia:
- Hoje
- Ontem
- data no formato local, como 03/05/2026

Dentro de cada grupo, cada card mostra:
- data/hora;
- ator;
- perfil;
- acao humanizada;
- modulo;
- resumo de impacto;
- badge de sensibilidade quando aplicavel;
- botao "Ver detalhes".

## Como acoes foram humanizadas
Mapeamentos principais:
- `APPOINTMENT_CHECKOUT` / `APPOINTMENT_CHECKOUT_COMPLETED` / `CHECKOUT`: "Atendimento finalizado".
- `APPOINTMENT_REFUND` / `APPOINTMENT_REFUNDED`: "Estorno de atendimento".
- `PRODUCT_SALE_CREATED`: "Venda de produto registrada".
- `PRODUCT_SALE_REFUND` / `PRODUCT_SALE_REFUNDED`: "Devolucao de produto registrada".
- `FINANCIAL_MANUAL_ENTRY` / `FINANCIAL_MANUAL_ENTRY_REGISTERED`: "Lancamento financeiro manual".
- `COMMISSION_PAID`: "Comissao paga".
- `STOCK_ADJUSTMENT` / `STOCK_ADJUSTED`: "Estoque ajustado".
- `SETTINGS_UPDATED`: "Configuracao alterada".
- `USER_LOGIN` / `AUTH_LOGIN`: "Login realizado".
- `PERMISSION_DENIED`: "Acesso bloqueado".

Fallback conservador:
- actions com `CHECKOUT`, `REFUND`, `COMMISSION`, `STOCK`, `SETTING`, `LOGIN`, `DENIED`, `CREATED`, `UPDATED` ou `DELETED` sao convertidas para linguagem operacional.
- actions desconhecidas viram titulo legivel a partir do token tecnico, sem quebrar o evento original.

## Como filtros foram simplificados
Filtros essenciais visiveis:
- inicio;
- fim;
- modulo/entidade;
- ator;
- acao.

Filtros avancados recolhidos:
- `requestId`;
- `idempotencyKey`;
- `entityId`;
- rota;
- metodo;
- limite.

Observacao: o backend atual aceita `entity`, `action`, `actorId`, periodo e limite. Nesta fase, periodo e limite continuam indo ao endpoint; os demais filtros sao aplicados no frontend sobre os eventos retornados para permitir busca por linguagem humana e campos tecnicos recolhidos, sem alterar backend.

## Como before/after foram tratados
No drawer, a camada "Historico" compara `beforeJson` e `afterJson` de forma rasa e destaca ate oito campos alterados com:
- nome legivel do campo;
- valor anterior;
- valor posterior.

Quando o comparativo existe mas nao e simples, a tela informa que o conteudo completo esta preservado em rastreabilidade tecnica. JSON bruto nao abre por padrao.

## Como rastreabilidade tecnica foi escondida
`TechnicalTrace` fica recolhido dentro do drawer e preserva:
- `auditLogId`;
- `entity`;
- `entityId`;
- `action`;
- `route`;
- `method`;
- `requestId`;
- `correlationId`;
- `idempotencyKey`;
- `beforeJson`;
- `afterJson`;
- `metadataJson`.

A superficie principal nao mostra `eventId`, `entityId`, `requestId`, `correlationId`, `idempotencyKey`, rota, metodo, before/after, metadata nem payload tecnico.

## Comportamento mobile
No mobile:
- filtros empilham e avancados permanecem recolhidos;
- timeline vira cards sem linha lateral;
- badges e acoes quebram para a esquerda;
- drawer vira bottom sheet responsivo;
- rastreabilidade tecnica continua recolhida.

## Permissoes mantidas
A Auditoria continua owner-only pelo contrato existente de menu e backend. Nenhuma permissao foi afrouxada e nenhum endpoint foi alterado.

## Arquivos alterados
- `public/index.html`
- `public/app.js`
- `public/components/operational-ui.js`
- `public/modules/auditoria.js`
- `public/styles/layout.css`
- `.planning/106_AUDITORIA_TIMELINE_LEGIVEL.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Riscos
- Os filtros avancados extras sao client-side porque o endpoint ainda nao aceita `requestId`, `idempotencyKey`, `entityId`, rota e metodo.
- O resumo de before/after e raso; objetos complexos ficam preservados no `TechnicalTrace`.
- Validacao visual humana desktop/mobile ainda e recomendada antes de release.
- `public/app.js` segue grande e centralizado; a modularizacao gradual continua recomendada.

## Criterios de aceite
- Auditoria usa componentes da Fase 1.1 onde faz sentido.
- Timeline fica legivel para owner nao tecnico.
- Eventos sao agrupados por data.
- Acoes tecnicas sao humanizadas.
- Filtros avancados ficam recolhidos.
- Detalhe do evento usa drawer progressivo.
- `TechnicalTrace` preserva rastreabilidade completa.
- Informacoes tecnicas ficam recolhidas.
- `EmptyState` aparece quando nao houver eventos.
- Mobile continua funcional por CSS responsivo.
- Auditoria continua owner-only.
- Nenhum fluxo critico foi removido.
- Build passou.
- Testes passaram fora do sandbox.
- Smoke API passou fora do sandbox.

## Validacoes executadas
- Sintaxe ES module de `public/app.js`, `public/modules/auditoria.js` e `public/components/operational-ui.js`: PASSOU com `vm.SourceTextModule`.
- `npm.cmd run build`: PASSOU no sandbox.
- `npm.cmd run test`: FALHOU no sandbox por `spawn EPERM` do Vitest/Rolldown ao carregar `vitest.config.ts`.
- `npm.cmd run test` fora do sandbox: PASSOU com `63 passed | 10 skipped`.
- `npm.cmd run smoke:api`: FALHOU no sandbox porque Prisma tentou acessar `binaries.prisma.sh` para verificar/baixar engine.
- `npm.cmd run smoke:api` fora do sandbox: PASSOU.

Resultado do smoke fora do sandbox:
- Health/autenticacao/catalogo passaram.
- Agenda -> confirmar -> iniciar -> checkout passou.
- PDV -> venda de produto -> historico -> devolucao passou.
- Financeiro, comissoes, dashboard e auditoria passaram.

## Proxima fase recomendada
Fase 1.7 - Comissoes em funil operacional limpo.

Escopo sugerido:
1. Mostrar comissoes por decisao operacional: pendentes, pagas, total e profissional.
2. Esconder IDs, referencias e trilha financeira em drawer/`TechnicalTrace`.
3. Humanizar pagamento de comissao e vinculo com financeiro.
4. Manter owner-only para pagamento e preservar consulta por perfil conforme permissao atual.
