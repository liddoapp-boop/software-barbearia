# 107 - Comissoes em Funil Operacional Limpo

Data: 2026-05-05
Fase: 1.7
Status: IMPLEMENTADA COM VALIDACAO PARCIAL NO SANDBOX

## Resumo executivo
A Fase 1.7 transformou Comissoes de um extrato tecnico em uma fila operacional para o owner decidir quem precisa receber, quanto esta pendente, o que ja foi pago e onde abrir o detalhe.

A superficie principal deixou de expor IDs e referencias tecnicas. `commissionId`, `professionalId`, `appointmentId`, `productSaleId`, `ruleId`, `source`, `status` cru, `idempotencyKey` e rastros financeiros ficam no `EntityDrawer` e no `TechnicalTrace` recolhido.

Nenhuma regra de negocio, backend, schema Prisma, permissao, checkout, PDV, estoque, Financeiro ou Auditoria foi alterada.

## Objetivo da fase
- Fazer Comissoes responder primeiro decisao e acao.
- Mostrar total pendente, total pago no periodo, profissionais com pendencia e comissoes antigas.
- Organizar a fila por profissional, destacando maior valor pendente.
- Humanizar origem e status.
- Manter pagamento owner-only e idempotente.
- Preservar conciliacao com Financeiro e rastreabilidade tecnica no detalhe.

## Antes/depois conceitual
Antes:
- Tela parecia extrato tecnico.
- Cards mostravam origem/ref tecnica como `APPOINTMENT`, `PRODUCT_SALE` e referencia interna.
- Pagamento retornava mensagem com ID financeiro.
- Nao havia detalhe progressivo para separar calculo, vinculo operacional e rastreabilidade.

Depois:
- Tela abre com `PageHeader`, `FilterBar`, resumo operacional e fila por profissional.
- A lista mostra profissional, origem humanizada, base, regra resumida, valor, status, data e acoes.
- IDs e payload tecnico sairam da superficie principal.
- Detalhe abre em drawer com resumo, calculo, vinculo operacional, impacto financeiro e `TechnicalTrace`.

## Componentes usados da Fase 1.1
- `renderPageHeader`
- `renderFilterBar`
- `bindFilterBars`
- `renderStatusChip`
- `renderEmptyState`
- `renderEntityDrawer`
- `bindEntityDrawers`
- `renderTechnicalTrace`
- `renderPrimaryAction`

## Mudancas feitas em Comissoes
- `public/index.html` recebeu mounts operacionais para header, filtros, lista e drawer.
- `public/app.js` passou a montar header/filtros da tela usando os componentes operacionais.
- `public/modules/comissoes.js` foi refeito para renderizar funil operacional.
- `public/styles/layout.css` recebeu estilos de fila, grupos por profissional, prioridade e mobile.
- `public/components/operational-ui.js` ganhou status e campos tecnicos adicionais para comissoes.

## Como a fila operacional foi organizada
A tela principal mostra quatro indicadores enxutos:
- pendente;
- pago no periodo;
- profissionais com pendencia;
- antigas ou vencidas.

Em seguida, mostra a prioridade operacional: profissional com maior valor pendente.

A fila e agrupada por profissional e cada grupo mostra:
- total pendente;
- total pago;
- comissoes individuais com origem, data, base, regra resumida, valor, status e acoes.

## Como origem/status foram humanizados
Origens:
- `SERVICE` / `APPOINTMENT`: "Atendimento finalizado".
- `PRODUCT` / `PRODUCT_SALE`: "Venda de produto".
- `MANUAL`: "Ajuste manual".
- fallback: "Comissao operacional".

Status:
- `PENDING`: "Pendente".
- `PAID`: "Paga".
- `CANCELED` / `CANCELLED`: "Cancelada".

`renderStatusChip` foi usado na superficie e no drawer. `operational-ui.js` tambem passou a reconhecer `INFO`, `WARNING`, `CANCELED` e `PAID` como "Paga".

## Como o pagamento foi tratado
O fluxo atual foi preservado:
- mesma rota `PATCH /financial/commissions/:id/pay`;
- `idempotencyKey` continua sendo gerada e enviada;
- pagamento continua bloqueado para nao-owner;
- botao "Pagar" aparece apenas quando `state.role === "owner"` e status e `PENDING`;
- confirmacao humana antes de pagar;
- apos sucesso, a lista e recarregada e o drawer e fechado.

Mensagens aplicadas:
- "Comissao paga com sucesso."
- "Esta comissao ja foi paga."
- "Esta operacao ja foi processada. Atualize a tela para conferir o resultado."
- "Voce nao tem permissao para pagar comissoes."
- "Nao foi possivel pagar a comissao. Confira os dados e tente novamente."

## Como a conciliacao com Financeiro foi preservada
Comissoes nao virou uma tela financeira. A superficie mostra apenas pendente/pago e a fila de pagamento.

No detalhe, a camada de impacto explica:
- "Esta comissao nasceu de um atendimento finalizado."
- "Esta comissao nasceu de uma venda de produto."
- "O pagamento desta comissao gerou uma saida no financeiro."
- "Esta comissao ainda esta pendente de pagamento."

Quando houver `financialEntryId` no payload, o drawer mostra que existe despesa financeira gerada e oferece acao para ir ao Financeiro. O ID fica apenas no `TechnicalTrace`.

## Como rastreabilidade tecnica foi escondida
A superficie principal nao mostra:
- `commissionId`;
- `professionalId`;
- `appointmentId`;
- `productSaleId`;
- `ruleId`;
- `source`;
- `referenceType`;
- `referenceId`;
- `idempotencyKey`;
- `financialEntryId`;
- `auditLogId`;
- JSON ou payload tecnico.

O `TechnicalTrace` recolhido preserva:
- `commissionId`;
- `professionalId`;
- `appointmentId`;
- `productSaleId`;
- `ruleId`;
- `source`;
- `status`;
- `idempotencyKey`;
- `financialEntryId`;
- `auditLogId`.

## Comportamento mobile
No mobile:
- filtros ficam empilhados e avancados recolhidos;
- resumo continua em cards;
- grupos por profissional viram cards empilhados;
- acoes "Ver detalhes" e "Pagar" ocupam largura confortavel;
- drawer vira bottom sheet responsivo;
- rastreabilidade tecnica permanece recolhida.

## Permissoes mantidas
- Pagamento de comissao continua owner-only no frontend e no backend.
- Recepcao/profissional nao recebem botao "Pagar".
- Se uma acao for disparada sem role owner, a UI mostra mensagem de permissao e nao chama o endpoint.
- Nenhuma policy, tenant guard ou autorizacao do backend foi afrouxada.

## Arquivos alterados
- `public/index.html`
- `public/app.js`
- `public/components/operational-ui.js`
- `public/modules/comissoes.js`
- `public/styles/layout.css`
- `.planning/107_COMISSOES_FUNIL_OPERACIONAL_LIMPO.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Riscos
- O endpoint atual de comissoes nao retorna todos os vinculos ricos desejados, como cliente, servico/produto, `productSaleId`, `ruleId`, `financialEntryId` e `auditLogId` em todos os cenarios. O drawer ja esta preparado para exibir esses campos se vierem no payload futuro.
- A navegacao "Ver financeiro relacionado" leva ao modulo Financeiro quando existe `financialEntryId`, mas nao abre automaticamente o lancamento porque o contrato de listagem nao garante esse vinculo na resposta atual.
- A validacao visual humana desktop/mobile ainda e recomendada.
- `public/app.js` segue grande e centralizado; modularizacao gradual continua recomendada.

## Criterios de aceite
- Comissoes usa componentes da Fase 1.1 onde faz sentido.
- Tela principal funciona como fila operacional.
- Origem da comissao fica humanizada.
- Status ficam padronizados.
- Pagamento continua owner-only.
- Detalhe da comissao usa drawer progressivo.
- `TechnicalTrace` preserva rastreabilidade completa disponivel no payload.
- Informacoes tecnicas ficam recolhidas.
- `EmptyState` aparece quando nao houver comissoes.
- Mobile continua funcional por CSS responsivo.
- Nenhum fluxo critico foi removido.
- Build passou.
- Testes e smoke precisam ser reexecutados fora do sandbox por bloqueio de aprovacao nesta sessao.

## Validacoes executadas
- Sintaxe ES module de `public/app.js`, `public/modules/comissoes.js` e `public/components/operational-ui.js`: PASSOU via `Get-Content -Raw ... | node --input-type=module --check`.
- Tentativa com `vm.SourceTextModule`: FALHOU porque o Node desta sessao nao expoe `vm.SourceTextModule` como construtor sem flag.
- Tentativa com `node --check arquivo.js`: FALHOU porque o `package.json` e CommonJS e `node --check` tentou interpretar os arquivos publicos como CJS.
- `npm.cmd run build`: PASSOU no sandbox.
- `npm.cmd run test`: FALHOU no sandbox por `spawn EPERM` do Vitest/Rolldown ao carregar `vitest.config.ts`.
- `npm.cmd run test` fora do sandbox: NAO EXECUTADO; solicitacao de escalacao foi bloqueada por limite da aprovacao automatica da sessao.
- `npm.cmd run smoke:api`: FALHOU no sandbox porque Prisma tentou acessar `binaries.prisma.sh` para verificar/baixar engine.
- `npm.cmd run smoke:api` fora do sandbox: NAO EXECUTADO; solicitacao de escalacao foi bloqueada por limite da aprovacao automatica da sessao.

## Proxima fase recomendada
Fase 1.8 - Clientes em historico progressivo e acao comercial limpa.

Escopo sugerido:
1. Transformar Clientes em carteira operacional com historico progressivo.
2. Mostrar proxima acao comercial, risco, recorrencia e ultimo contato sem expor tecnica.
3. Mover IDs, automacoes, score bruto e payloads para drawer/`TechnicalTrace`.
4. Manter WhatsApp, fidelizacao e automacoes como acoes contextuais, sem poluir a lista principal.
