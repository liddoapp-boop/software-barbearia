# 108 - Clientes em Historico Progressivo e Acao Comercial Limpa

Data: 2026-05-05
Fase: 1.8
Status: IMPLEMENTADA E VALIDADA

## Resumo executivo
A Fase 1.8 transformou Clientes de lista/cadastro em central operacional de relacionamento. A tela agora mostra primeiro quem esta ativo, em risco, inativo ou VIP, qual cliente merece contato primeiro e qual acao comercial manual faz sentido.

A superficie principal nao expõe `clientId`, `customerId`, `businessId`, IDs tecnicos, score bruto, payload, JSON ou historico completo. O detalhe progressivo fica no `EntityDrawer`; rastreabilidade tecnica fica recolhida em `TechnicalTrace`.

Nenhuma regra de negocio, backend, schema Prisma, agenda, checkout, PDV, financeiro, auditoria, permissao, idempotencia ou tenant guard foi alterado.

## Objetivo da fase
- Fazer Clientes responder primeiro quem precisa de atencao e qual acao tomar.
- Separar carteira operacional, acao comercial e historico de longo prazo.
- Humanizar status, segmentos e sinais comerciais.
- Preservar rastreabilidade tecnica sem poluir a tela principal.
- Manter WhatsApp como atalho manual, sem automacao real nova.

## Antes/depois conceitual
Antes:
- Clientes funcionava como lista de carteira com resumo, fila de reativacao e sinais de automacao em blocos separados.
- O detalhe completo nao tinha uma camada progressiva dedicada.
- Acao comercial aparecia como texto preditivo, sem uma superficie clara de decisao.

Depois:
- A tela abre com `PageHeader`, `PrimaryAction`, `FilterBar`, KPIs relacionais e decisao sugerida.
- Cards por cliente mostram nome, telefone, status, ultimo atendimento, valor resumido, sinal comercial, proxima acao e WhatsApp manual.
- O drawer organiza resumo, historico operacional, relacionamento, acoes e `TechnicalTrace`.
- Sinais de automacao ficaram recolhidos e explicam que nao disparam mensagem automaticamente.

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

## Mudancas feitas em Clientes
- `public/index.html` recebeu mounts para header, filtros e drawer de Clientes.
- `public/app.js` passou a montar header/filtros via componentes operacionais, armazenar o payload atual de Clientes e abrir o drawer do cliente selecionado.
- `public/modules/clientes.js` foi refeito para renderizar carteira operacional, acao comercial e drawer progressivo.
- `public/components/operational-ui.js` passou a reconhecer `NEW` e `RECURRING`, alem de campos tecnicos de cliente no `TechnicalTrace`.
- `public/styles/layout.css` recebeu estilos para cards, fila comercial, WhatsApp manual, paineis progressivos e mobile.

## Como a tela virou central de relacionamento
A superficie principal agora mostra:
- ativos;
- em risco;
- inativos;
- VIPs;
- ticket medio;
- potencial de reativacao;
- decisao sugerida;
- fila comercial prioritaria.

Cada card de cliente mostra apenas informacao operacional:
- nome;
- telefone/WhatsApp;
- status humanizado;
- ultimo atendimento;
- valor gerado/ticket;
- sinal de risco, recorrencia ou VIP;
- proxima acao recomendada;
- "Ver detalhes".

## Como status/segmentos foram humanizados
Status:
- `ACTIVE`: "Ativo"
- `AT_RISK`: "Em risco"
- `INACTIVE`: "Inativo"
- `VIP`: "VIP"
- `NEW`: "Novo"
- `RECURRING`: "Recorrente"

Segmentos:
- `VALUE_HIGH`: "Maior valor"
- `VALUE_MEDIUM`: "Valor medio"
- `VALUE_LOW`: "Valor baixo"

`renderStatusChip` e usado tanto na superficie principal quanto no drawer.

## Como acoes comerciais foram organizadas
A acao comercial e manual e visual:
- "Chamar no WhatsApp";
- "Agendar retorno";
- "Reativar cliente";
- "Oferecer combo";
- "Manter relacionamento";
- "Atualizar cadastro" quando falta telefone.

O WhatsApp apenas abre conversa manual quando o telefone e valido. Nao ha envio automatico, IA, campanha ou disparo novo.

O drawer oferece:
- chamar no WhatsApp;
- criar agendamento;
- atualizar cadastro desabilitado quando nao ha fluxo completo de edicao;
- ver historico financeiro navegando para Financeiro.

## Como historico progressivo foi estruturado
Camada 1 - Resumo:
- nome;
- telefone;
- e-mail quando vier no payload;
- status;
- tags;
- ultima visita;
- valor total;
- proxima acao.

Camada 2 - Historico operacional:
- leitura operacional em linguagem humana;
- agendamentos e servicos recentes quando disponiveis no contexto carregado;
- produtos comprados e devolucoes quando disponiveis no historico de vendas carregado.

Camada 3 - Relacionamento:
- recorrencia;
- risco;
- preferencias;
- profissional preferido;
- observacoes;
- tags comerciais.

Camada 4 - Acoes:
- WhatsApp manual;
- criar agendamento;
- atualizar cadastro, sem inventar update nesta fase;
- ver historico financeiro.

Camada 5 - Rastreabilidade tecnica:
- `clientId`;
- `businessId`;
- `unitId`;
- `customerId`;
- `preferredProfessionalId`;
- tags cruas;
- timestamps quando o payload trouxer;
- auditoria relacionada quando existir.

## Como rastreabilidade tecnica foi escondida
A superficie principal nao mostra IDs, payload, JSON, score bruto, `reactivationScore` ou dados tecnicos de automacao.

O `TechnicalTrace` recolhido preserva campos tecnicos disponiveis no payload. Isso mantem suporte, auditoria e debug sem transformar a tela principal em painel tecnico.

## Comportamento mobile
No mobile:
- clientes viram cards empilhados;
- busca/status/periodo ficam simples;
- segmento fica em filtros avancados recolhidos;
- WhatsApp e "Ver detalhes" ocupam largura confortavel;
- drawer vira bottom sheet responsivo;
- historico operacional fica recolhido por secoes.

## Arquivos alterados
- `public/index.html`
- `public/app.js`
- `public/components/operational-ui.js`
- `public/modules/clientes.js`
- `public/styles/layout.css`
- `.planning/108_CLIENTES_HISTORICO_PROGRESSIVO_ACAO_COMERCIAL.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Riscos
- O endpoint atual de overview de Clientes nao retorna historico completo de servicos/produtos/devolucoes por cliente. O drawer usa o contexto ja carregado de Agenda e historico de vendas quando disponivel.
- Edicao completa de cliente nao foi criada porque a fase proibiu alterar backend/regras; o botao de atualizar cadastro fica desabilitado no drawer.
- Alguns campos do `TechnicalTrace`, como `businessId`, `customerId`, timestamps e auditoria relacionada, so aparecem se o payload futuro trouxer.
- Validacao visual humana desktop/mobile ainda e recomendada antes de release.
- `public/app.js` segue grande e centralizado; modularizacao gradual continua recomendada.

## Criterios de aceite
- Clientes usa componentes da Fase 1.1 onde faz sentido.
- Tela principal virou central de relacionamento limpa.
- Status e segmentos ficaram humanizados.
- Acoes comerciais ficaram claras e manuais.
- Detalhe do cliente usa drawer progressivo.
- Historico fica organizado por camadas.
- `TechnicalTrace` preserva rastreabilidade quando ha dados.
- Informacoes tecnicas ficam recolhidas.
- `EmptyState` aparece quando nao ha clientes.
- Mobile continua funcional por CSS responsivo.
- Nenhum fluxo critico foi removido.
- Build passou.
- Testes passaram fora do sandbox.
- Smoke API passou.

## Validacoes executadas
- Sintaxe ES module de `public/modules/clientes.js`: PASSOU via `Get-Content -Raw ... | node --input-type=module --check`.
- Sintaxe ES module de `public/components/operational-ui.js`: PASSOU via `Get-Content -Raw ... | node --input-type=module --check`.
- Sintaxe ES module de `public/app.js`: PASSOU via `Get-Content -Raw ... | node --input-type=module --check`.
- Tentativa com `node --input-type=module --check arquivo.js`: FALHOU porque Node v24 aceita `--input-type` apenas com stdin/eval/print.
- `npm.cmd run build`: PASSOU no sandbox.
- `npm.cmd run test`: FALHOU no sandbox por `spawn EPERM` do Vitest/Rolldown ao carregar `vitest.config.ts`.
- `npm.cmd run test` fora do sandbox: PASSOU (`63 passed | 10 skipped`).
- `npm.cmd run smoke:api`: PASSOU no sandbox.

## Proxima fase recomendada
Fase 1.9 - Servicos e Profissionais em catalogo operacional limpo.

Escopo sugerido:
1. Transformar Servicos em catalogo operacional com status, preco, duracao, comissao e profissionais habilitados sem excesso tecnico.
2. Transformar Profissionais em visao operacional de capacidade, agenda, performance e elegibilidade.
3. Usar drawer progressivo para detalhes, regras, historico, vinculos e `TechnicalTrace`.
4. Manter schema/backend intactos, salvo fase futura dedicada a CRUD completo.
