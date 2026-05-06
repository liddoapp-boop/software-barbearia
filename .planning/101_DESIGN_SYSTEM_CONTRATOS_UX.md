# 101 - Design System Operacional e Contratos UX

Data: 2026-05-05
Fase: 1.1
Status: IMPLEMENTADA
Escopo: base reutilizavel de UI/UX para evoluir telas sem reescrever o frontend.

## Resumo executivo
A Fase 1.1 criou a primeira camada formal de design system operacional para o frontend HTML/JS atual. O objetivo foi preparar contratos de superficie, detalhe progressivo e rastreabilidade tecnica sem redesenhar Agenda, PDV, Financeiro, Auditoria, Estoque ou Clientes nesta etapa.

O backend continua intacto. Idempotencia, auditoria, tenant guard, permissoes, financeiro, estoque, devolucoes, historico e rastreabilidade foram preservados. A mudanca fica na camada visual: criar componentes pequenos, importaveis por modulo, que ajudam a esconder complexidade tecnica da superficie principal.

## Objetivo da fase
- Definir componentes minimos para uma experiencia premium, limpa e orientada a proxima acao.
- Evitar que IDs, chaves de idempotencia, referencias internas e payloads vazem para telas operacionais.
- Preparar a Fase 1.2 para refatorar Agenda e Checkout com menor risco.
- Manter compatibilidade com a SPA estatica atual em `public/index.html`, `public/app.js`, `public/modules/*` e `public/components/*`.

## Principios visuais
1. Mostrar primeiro a decisao operacional.
2. Ter uma acao primaria dominante por tela.
3. Limitar KPIs ao que muda uma decisao imediata.
4. Usar detalhes progressivos para historico, composicao e auditoria.
5. Manter filtros essenciais visiveis e avancados recolhidos.
6. Nunca exibir rastreabilidade tecnica na superficie principal.
7. No mobile, priorizar bottom sheet/drawer e controles empilhados.
8. Ser reaproveitavel em barbearias, clinicas, esteticas, saloes, pet shops e consultorios.

## Regra de nao poluicao visual
A tela principal nao deve exibir `id`, `referenceType`, `referenceId`, `idempotencyKey`, `correlationId`, `requestId`, payload JSON, before/after, nomes internos de entidade ou action tecnica.

Excecoes permitidas:
- `TechnicalTrace` dentro de drawer/detalhe.
- Tela de Auditoria owner-only.
- Diagnostico de suporte quando necessario.
- Exportacao tecnica controlada.

Pergunta de corte: se o dado nao ajuda o usuario a decidir a proxima acao da tela, ele nao entra na superficie principal.

## Funil aplicado ao design system
Camada 1: `PageHeader` e `PrimaryAction` respondem "onde estou e o que faco agora".

Camada 2: `FilterBar`, `StatusChip` e listas/cards mostram apenas o essencial para operar.

Camada 3: `EntityDrawer` abre resumo, detalhes operacionais e historico sob demanda.

Camada 4: `TechnicalTrace` preserva precisao tecnica sem poluir a experiencia principal.

## Componentes criados/organizados
Arquivo criado:
- `public/components/operational-ui.js`

Estilos adicionados:
- `public/styles/layout.css`

Componentes obrigatorios disponiveis:
- `PageHeader`: `renderPageHeader`
- `PrimaryAction`: `renderPrimaryAction`
- `FilterBar`: `renderFilterBar` + `bindFilterBars`
- `EntityDrawer`: `renderEntityDrawer` + `bindEntityDrawers`
- `TechnicalTrace`: `renderTechnicalTrace`
- `EmptyState`: `renderEmptyState`
- `StatusChip`: `renderStatusChip`

Componentes adicionais avaliados:
- `MetricCard`: nao criado agora; ja existem `ux-kpi` e padroes de resumo nos modulos.
- `SectionCard`: nao criado agora; ja existe `ux-card`.
- `ActionList`: nao criado agora; as acoes ainda variam muito por modulo.
- `ConfirmationModal`: nao criado agora; o frontend ja tem modais especificos e a migracao precisa ser gradual.
- `LoadingState`: nao criado agora; cada modulo ja possui loading dedicado.
- `PermissionGate`: nao criado agora; a permissao atual combina menu por role e backend como fonte de verdade.

## Contratos de uso
### PageHeader
Objetivo: abrir a tela com titulo, subtitulo curto, contexto e acao principal opcional.

Quando usar: inicio de qualquer modulo operacional ou administrativo.

Quando nao usar: dentro de cards, drawers, modais ou secoes pequenas.

Dados esperados: `title`, `subtitle`, `context`, `action`.

Exemplo:
```js
renderPageHeader({
  context: "Operacao",
  title: "Agenda",
  subtitle: "Atendimentos de hoje e proxima acao da recepcao.",
  action: renderPrimaryAction({ label: "Novo agendamento", id: "agendaNewAppointmentBtn" }),
});
```

Como evita poluicao: impede que o topo vire painel de KPIs ou acumulador de botoes.

Mobile: empilha titulo e acao, mantendo o botao com largura total.

Reuso setorial: em clinicas vira "Agenda medica"; em pet shops, "Agenda de banhos"; em consultorios, "Consultas".

### PrimaryAction
Objetivo: representar a proxima acao mais importante da tela.

Quando usar: criar agendamento, finalizar atendimento, cobrar venda, registrar despesa, adicionar produto.

Quando nao usar: para acoes secundarias, filtros, exportacao, detalhes ou links administrativos.

Dados esperados: `label`, `id`, `type`, `href`, `disabled`, `attrs`.

Exemplo:
```js
renderPrimaryAction({ label: "Cobrar venda", id: "saleCheckoutBtn", attrs: { "data-sale-checkout": true } });
```

Como evita poluicao: limita concorrencia visual entre muitos botoes fortes.

Mobile: largura total quando dentro do `PageHeader`.

Reuso setorial: "Nova consulta", "Finalizar procedimento", "Cobrar pacote", "Registrar vacina".

### FilterBar
Objetivo: agrupar filtros essenciais e manter filtros avancados recolhidos.

Quando usar: listas de agenda, vendas, financeiro, estoque, clientes, auditoria.

Quando nao usar: telas sem consulta/listagem ou fluxos de checkout.

Dados esperados: arrays de HTML `essential` e `advanced`, `id`, `expanded`, `advancedLabel`.

Exemplo:
```js
renderFilterBar({
  id: "financialFilters",
  essential: [periodSelectHtml, typeSelectHtml],
  advanced: [referenceTypeHtml, referenceIdHtml],
});
bindFilterBars();
```

Como evita poluicao: separa o que e usado todo dia do que e investigativo.

Mobile: controles empilham e avancados se comportam como painel recolhivel.

Reuso setorial: periodo, profissional, status e busca sao comuns a clinicas, saloes, pet shops e consultorios.

### EntityDrawer
Objetivo: detalhe progressivo de entidade sem trocar de tela.

Quando usar: agendamento, venda, cliente, produto, lancamento financeiro, comissao, auditoria.

Quando nao usar: formularios longos de criacao que ja possuem modal dedicado ou telas full-page de configuracao.

Dados esperados: `id`, `title`, `subtitle`, `status`, `summary`, `details`, `history`, `technicalTrace`, `actions`, `open`.

Exemplo:
```js
renderEntityDrawer({
  id: "saleDrawer",
  title: "Venda #128",
  status: "PAID",
  summary: saleSummaryHtml,
  details: saleItemsHtml,
  history: refundHistoryHtml,
  technicalTrace: renderTechnicalTrace(saleTrace),
});
```

Como evita poluicao: a lista principal mostra so a entidade e a proxima acao; composicao, historico e tecnica ficam no drawer.

Mobile: vira painel inferior com altura maxima, preservando contexto.

Reuso setorial: funciona para consulta, procedimento, pacote, produto, tutor/paciente e lancamento.

### TechnicalTrace
Objetivo: preservar rastreabilidade tecnica com linguagem legivel.

Quando usar: dentro de drawer, detalhe tecnico ou tela de Auditoria.

Quando nao usar: cards principais, tabelas operacionais, headers e empty states.

Dados esperados: `id`, `referenceType`, `referenceId`, `idempotencyKey`, `correlationId`/`requestId`, `auditEntity`, `auditAction`/`event`.

Exemplo:
```js
renderTechnicalTrace({
  id: transaction.id,
  referenceType: transaction.referenceType,
  referenceId: transaction.referenceId,
  idempotencyKey: transaction.idempotencyKey,
  correlationId: transaction.requestId,
  auditEntity: "FinancialEntry",
  auditAction: "COMMISSION_PAID",
});
```

Como evita poluicao: renderiza recolhido por padrao em `details`.

Mobile: continua recolhido e quebra valores longos com `overflow-wrap`.

Reuso setorial: atende compliance, suporte e rastreabilidade em qualquer segmento SaaS.

### EmptyState
Objetivo: explicar estado vazio e sugerir uma acao clara.

Quando usar: listas sem resultado, filtros sem retorno, historicos vazios, estoque sem produtos.

Quando nao usar: erros de API ou loading.

Dados esperados: `title`, `description`, `action`.

Exemplo:
```js
renderEmptyState({
  title: "Nenhuma venda encontrada neste periodo.",
  description: "Ajuste os filtros ou registre uma nova venda.",
  action: renderPrimaryAction({ label: "Registrar venda" }),
});
```

Como evita poluicao: texto curto e uma unica direcao.

Mobile: centralizado e com acao tocavel.

Reuso setorial: "Nenhuma consulta", "Nenhum procedimento", "Nenhum tutor", "Nenhum lancamento".

### StatusChip
Objetivo: padronizar status visuais sem criar ruido.

Quando usar: cards/listas/drawers de agendamento, pagamento, estoque, cliente e comissao.

Quando nao usar: como KPI, como botao ou para mensagens longas.

Dados esperados: status bruto e opcionalmente `label`.

Status cobertos: agendado, confirmado, em atendimento, concluido, cancelado, pago, pendente, devolvido, parcialmente devolvido, estoque baixo, estoque critico, bloqueado, ativo, inativo, VIP, em risco.

Exemplo:
```js
renderStatusChip("PARTIALLY_REFUNDED");
```

Como evita poluicao: converte codigos internos em linguagem operacional.

Mobile: usa `white-space: nowrap` e tamanho compacto.

Reuso setorial: status universais de atendimento, pagamento, estoque e relacionamento.

## Exemplos de aplicacao por modulo
- Agenda: `PageHeader` com "Novo agendamento"; `FilterBar` com profissional/periodo essenciais; `EntityDrawer` para atendimento; `TechnicalTrace` oculto.
- Checkout: `PrimaryAction` "Finalizar atendimento"; `EntityDrawer` para recibo e rastreabilidade apos conclusao.
- PDV: carrinho como foco; historico de vendas em `EntityDrawer`; devolucao como acao contextual.
- Financeiro: resumo do periodo na superficie; referencias internas em `TechnicalTrace`.
- Estoque: status por `StatusChip`; ficha tecnica e movimentos no drawer.
- Clientes: lista orientada a acao; historico e sinais preditivos no drawer.
- Auditoria: timeline amigavel primeiro; payloads e IDs em blocos recolhidos.

## Como lidar com informacao tecnica
Informacao tecnica deve existir para suporte, auditoria e investigacao, mas deve entrar apenas em `TechnicalTrace` ou em telas owner-only. A linguagem deve ser precisa, porem explicavel: "Evento relacionado" e "Entidade de auditoria" antes de payload cru.

## Drawer e detalhe progressivo
O drawer padrao separa:
1. resumo;
2. detalhes operacionais;
3. historico;
4. rastreabilidade tecnica.

O bloco tecnico nao abre por padrao. A lista principal deve apenas chamar o drawer com "Ver detalhes" ou acao equivalente.

## Compatibilidade mobile
- `PageHeader` empilha conteudo.
- `PrimaryAction` ocupa largura total quando necessario.
- `FilterBar` empilha campos e recolhe avancados.
- `EntityDrawer` vira bottom sheet.
- `TechnicalTrace` quebra IDs longos sem estourar layout.

## Reuso para outros segmentos
A base evita termos exclusivos de barbearia. Os componentes falam em entidade, status, acao primaria, filtros, detalhe e rastreabilidade. Isso permite usar a mesma arquitetura para clinicas medicas, esteticas, saloes, pet shops e consultorios com troca de labels e payloads.

## Arquivos analisados
- `public/index.html`
- `public/app.js`
- `public/styles/layout.css`
- `public/components/menu-config.js`
- `public/components/sidebar.js`
- `public/components/topbar.js`
- `public/components/mobile-tabs.js`
- `public/modules/agenda.js`
- `public/modules/agendamento.js`
- `public/modules/agendamentos.js`
- `public/modules/pdv.js`
- `public/modules/financeiro.js`
- `public/modules/estoque.js`
- `public/modules/clientes.js`
- `public/modules/profissionais.js`
- `public/modules/servicos.js`
- `public/modules/comissoes.js`
- `public/modules/auditoria.js`
- `public/modules/configuracoes.js`
- `public/modules/fidelizacao.js`
- `public/modules/automacoes.js`
- `public/modules/metas.js`
- `.planning/100_MAPEAMENTO_FRONTEND_BACKEND_FUNIL_UX.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Arquivos alterados
- `public/components/operational-ui.js`
- `public/styles/layout.css`
- `.planning/101_DESIGN_SYSTEM_CONTRATOS_UX.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Riscos identificados
- `public/app.js` segue grande e centralizado; a migracao deve ser incremental por modulo.
- Agenda, Financeiro, Auditoria, Automacoes e Fidelizacao ainda exibem densidade alta em alguns pontos.
- Alguns modulos ainda possuem status locais duplicados; `StatusChip` deve substituir aos poucos.
- Testes TypeScript nao validam automaticamente os modulos JS do `public`; foi feita checagem sintatica adicional.
- O ambiente Windows/OneDrive ja possui historico de `spawn EPERM` em Vitest/Vite e engine Prisma.

## Criterios de aceite
- Documento `.planning/101_DESIGN_SYSTEM_CONTRATOS_UX.md` criado.
- Componentes obrigatorios criados em `public/components/operational-ui.js`.
- Contratos de uso documentados para cada componente.
- Frontend mantido na stack atual HTML/JS modular.
- Nenhuma regra de negocio alterada.
- Nenhuma tela critica removida.
- Nenhuma rastreabilidade apagada.
- IDs tecnicos continuam fora do contrato de superficie principal.
- Fase 1.2 pode usar a base para Agenda e Checkout.

## Validacoes executadas
- Checagem sintatica ES module de `public/components/operational-ui.js`: PASSOU.
- `npm.cmd run build`: PASSOU.
- `npm.cmd run test`: falhou no sandbox por `spawn EPERM` do Vitest/Vite ao carregar `vitest.config.ts`; PASSOU fora do sandbox com `63 passed | 10 skipped`.
- `npm.cmd run smoke:api`: falhou no sandbox por acesso/verificacao do binario Prisma em `binaries.prisma.sh`; PASSOU fora do sandbox.

Resultado do smoke fora do sandbox:
- Health/autenticacao/catalogo passaram.
- Agenda -> confirmar -> iniciar -> checkout passou.
- PDV -> venda de produto -> historico -> devolucao passou.
- Financeiro, comissoes, dashboard e auditoria passaram.

## Proxima fase recomendada
Fase 1.2 - Agenda e Checkout em funil operacional premium.

Escopo sugerido:
1. Aplicar `PageHeader`, `PrimaryAction`, `FilterBar`, `EntityDrawer`, `EmptyState` e `StatusChip` primeiro na Agenda.
2. Transformar checkout em fluxo guiado com uma acao dominante.
3. Mover rastreabilidade de checkout para `TechnicalTrace`.
4. Preservar endpoints, idempotencia, auditoria e permissoes.
