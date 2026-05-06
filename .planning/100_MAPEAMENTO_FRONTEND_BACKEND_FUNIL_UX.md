# 100 - Mapeamento frontend x backend + arquitetura de funil UX

Data: 2026-05-05
Fase: 1.0
Status: PLANEJADA / MAPEADA
Escopo: macrofase frontend/UX sem implementacao de telas.

## 1. Resumo executivo
O backend do Software Barbearia ja opera como um core SaaS maduro: agenda, checkout, PDV, financeiro, estoque, devolucoes, comissoes, auditoria, permissoes, usuarios persistentes, tenant guard, PostgreSQL real e idempotencia estao cobertos por contratos e testes.

O frontend acompanha boa parte desse core, mas ainda mistura camadas de informacao. Em algumas telas, dados tecnicos que deveriam existir apenas em detalhe/auditoria aparecem na leitura operacional principal. O produto precisa evoluir para um funil: primeiro mostrar a decisao ou acao mais importante, depois permitir aprofundamento progressivo, sem perder rastreabilidade.

A direcao recomendada e manter a SPA estatica atual, preservar endpoints e regras, e reorganizar a experiencia em uma arquitetura de superficies: resumo executivo, fila operacional, detalhe contextual, trilha tecnica e auditoria. Essa arquitetura e reaproveitavel para clinicas, esteticas, saloes, pet shops e consultorios, pois o dominio comum e agenda + cliente + servico + financeiro + estoque/insumos + rastreabilidade.

## 2. Diagnostico geral
- Backend: amplo, auditavel e com contratos granulares. Rotas sensiveis tem auth/role, `unitId`, idempotency e auditoria.
- Frontend: modular por arquivo em `public/modules`, mas orquestrado por um `public/app.js` grande. A estrutura atual e funcional, porem tem acoplamento operacional alto.
- UI: ja existem componentes `ux-card`, `ux-kpi`, `ux-table`, modais e mobile tabs, mas o uso ainda e irregular.
- Produto: a navegacao atual tem base boa, com grupos Operacao, Gestao, Administracao e Avancado. O risco e virar "painel de tudo", especialmente se toda nova capacidade tecnica ganhar bloco visivel.
- Mobile: existe intencao de mobile-first em operacao, mas algumas telas seguem densas demais para uso rapido.

## 3. Principios de UX do produto
1. Uma tela, uma pergunta principal.
2. Uma acao primaria por modulo, claramente dominante.
3. Dados tecnicos nao entram na superficie principal.
4. Listas devem ser filas de decisao, nao tabelas administrativas por padrao.
5. Filtros devem comecar minimos e revelar filtros avancados sob demanda.
6. Detalhes vivem em drawer, modal, painel lateral ou aba secundaria.
7. Auditoria deve ser acessivel, mas nunca invasiva.
8. O usuario deve entender "o que fazer agora" em ate 5 segundos.
9. KPIs so entram se mudarem uma decisao imediata.
10. A UI deve proteger o usuario da complexidade do backend, nao expor a modelagem interna.

## 4. Regra de nao poluicao visual
A tela principal nao deve exibir IDs tecnicos, `referenceId`, `requestId`, `idempotencyKey`, `source`, `referenceType`, payload JSON, before/after/metadata, locks, nomes internos de action/entity ou campos equivalentes.

Excecoes:
- Detalhe tecnico expandido.
- Drawer de rastreabilidade.
- Tela de Auditoria.
- Exportacao/relatorio tecnico para owner.
- Mensagem de suporte/diagnostico quando houver erro operacional.

Todo dado deve passar por uma pergunta: "isto ajuda o usuario a decidir a proxima acao nesta tela?". Se nao ajuda, vai para camada secundaria ou tecnica.

## 5. Conceito de funil operacional
Cada modulo deve seguir quatro camadas:

1. Visao principal: estado atual e proxima acao.
2. Operacao: lista curta, cards ou fila com acoes frequentes.
3. Detalhe sob demanda: drawer/modal/abas para contexto, historico, composicao e ajustes.
4. Tecnico/auditoria: rastreabilidade completa, IDs, payloads, request, idempotency e before/after.

O funil padrao:
- Entrada: "qual assunto exige minha atencao?"
- Acao: "qual botao resolve isso?"
- Confirmacao: "o que aconteceu?"
- Rastreabilidade: "como provo/depuro isso se necessario?"

## 6. Matriz frontend x backend
| Modulo UX | Arquivos frontend | Backend/contratos principais | O que ja aparece | Observacao UX |
| --- | --- | --- | --- | --- |
| Shell/menu/auth | `public/app.js`, `public/components/menu-config.js`, `sidebar.js`, `topbar.js`, `mobile-tabs.js` | `/auth/login`, `/auth/me`, policies em `src/http/app.ts`, usuarios em `src/http/security.ts` e Prisma | Role visual, sessao, menus por perfil | Boa base SaaS; precisa separar role visual/dev de sessao real em linguagem menos tecnica. |
| Dashboard | `public/modules/dashboard.js`, `dashboardSection` | `/dashboard`, `/dashboard/suggestions/:id/telemetry`, agregados de financeiro, agenda, estoque, clientes, automacoes | KPIs, meta, alertas, sugestoes e alguns blocos escondidos | Deve virar cockpit de decisao com no maximo 4 sinais e 1 proxima acao. |
| Agenda operacional | `agenda.js`, `agendamento.js`, `agendaSection` | `/agenda/day`, `/agenda/range`, `/appointments`, `/appointments/suggestions` | Criacao, filtros, cards/lista, sugestoes, fila, baixo estoque | Mistura agenda, cadastro e assistencias. Precisa funil: dia > proximo atendimento > criar/remarcar. |
| Central de agendamentos/historico | `agendamentos.js`, `agendaListMode` | `/appointments`, `/appointments/:id`, status, checkout, refund | Muitos KPIs, filtros, tabela/cards, detalhe lateral | Esta e a area com maior risco de poluicao por quantidade de resumo. Deve ser "historico filtravel", nao dashboard paralelo. |
| Checkout atendimento | `app.js` modais/handlers, `pdv.js` feedback | `/appointments/:id/checkout`, `/appointments/:id/complete`, financeiro, estoque de consumo | Finalizacao, pagamento, idempotency gerada no front | O checkout deve ser um fluxo guiado e compacto, com rastreabilidade oculta. |
| PDV produtos | `pdv.js`, `operationSection` | `/sales/products`, `/sales/products/:id/refund`, `/inventory`, `/catalog` | Carrinho, historico de vendas, devolucao | Bom candidato a experiencia premium: busca rapida, carrinho fixo, historico em drawer. |
| Historico de vendas | `app.js` + render em PDV | `GET /sales/products` | Filtros por periodo/busca, devolucao | Precisa ser subcamada do PDV ou tela propria simples; evitar concorrer com Financeiro. |
| Financeiro | `financeiro.js`, `financeiroSection` | `/financial/summary`, `/financial/transactions`, `/financial/entries`, `/financial/management/overview`, `/financial/commissions`, `/financial/reports` | KPIs, fluxo, transacoes, lancamentos manuais, campos tecnicos | Hoje expõe `source`, `referenceType`, `referenceId`, `professionalId` na superficie. Deve migrar isso para detalhe tecnico. |
| Estoque | `estoque.js`, `estoqueSection` | `/inventory`, `/stock/overview`, `/inventory/:id/stock`, `/stock/movements/manual` | Resumo, busca, filtros, tabela/cards, modais de produto/ajuste | Boa estrutura. Precisa separar "comprar agora", "ajustar cadastro" e "movimentacoes tecnicas". |
| Comissoes | `comissoes.js`, `commissionsSection` | `/commissions/statement`, `/financial/commissions`, `/financial/commissions/:id/pay` | Resumo, lista, status, pagar, referencia financeira | Deve virar fila de pagamento/fechamento; referencia financeira no detalhe, nao no card principal. |
| Clientes | `clientes.js`, modal clientes | `/clients`, `/clients/overview`, retention/scoring indiretamente | Resumo, reativacao, sinais de automacao, lista/cards, WhatsApp | Bom caminho, mas deve priorizar "clientes que precisam de acao" em vez de todos os dados preditivos. |
| Servicos | `servicos.js`, modal servicos, detail panel | `/services`, `/services/summary`, `/services/:id`, `/services/:id/stock-consumption` | Catalogo, filtros, tabela/cards, detalhe de uso/custo | Reaproveitavel para clinicas como catalogo de procedimentos; ficha tecnica deve ficar em detalhe. |
| Profissionais | `profissionais.js` | `/professionals/performance`, `/performance/professionals` | Desempenho e lista | Deve ser leitura gerencial simples, com detalhe por profissional. |
| Fidelizacao | `fidelizacao.js` | `/loyalty/*`, `/packages/*`, `/subscriptions/*`, `/retention/cases`, `/multiunit/*` | Pacotes, assinaturas, retencao, multiunidade | Modulo denso. Precisa ser quebrado em cards de "programas", "clientes em risco", "assinaturas". |
| Automacoes | `automacoes.js` | `/automations/*`, `/retention/scoring/*`, `/integrations/webhooks/*` | Regras, execucoes, scoring, logs de webhook | Muito tecnico para uso diario. Deve ficar como configuracao avancada com logs recolhidos. |
| Auditoria | `auditoria.js`, `auditSection` | `/audit/events`, `AuditLog`, `AuditRecorder` | Action, entity, entityId, actor, requestId, idempotency, before/after/metadata | Correta como tela tecnica owner-only, mas precisa camada inicial amigavel antes dos payloads. |
| Configuracoes | `configuracoes.js`, `settingsSection` | `/settings/*`, `/users` | Negocio, horarios, equipe, regras, pagamentos, aparencia, seguranca | Boa area para reaproveitamento SaaS; deve virar abas/sections com edicao progressiva. |
| Mobile | `mobile-tabs.js`, CSS layout, listas mobile por modulo | Mesmo backend | Tabs Inicio/Agenda/PDV/Mais, cards mobile | Mobile deve priorizar operacao: agenda do dia, novo agendamento, checkout e venda rapida. |

## 7. Matriz de camadas de informacao
| Modulo | Informacao principal | Informacao secundaria | Detalhe sob demanda | Tecnica/auditoria |
| --- | --- | --- | --- | --- |
| Dashboard | Receita hoje, ocupacao, meta, risco principal | Top profissional/servico, clientes em risco | Insights e playbooks em details/drawer | Telemetria de sugestao, tuning, payloads de automacao |
| Agenda | Proximo atendimento e agenda de hoje | Status, profissional, telefone, encaixes | Historico do cliente, observacoes, remarcacao | IDs do appointment, origem, history bruto |
| Checkout | Total, metodo, confirmar recebimento | Produtos adicionais, observacao | Composicao do atendimento e recibo | Idempotency, financialEntry, audit event |
| PDV | Carrinho e finalizar venda | Cliente/profissional opcionais, estoque disponivel | Historico/devolucao, detalhes da venda | ProductSaleId, refundId, movements |
| Historico vendas | Venda, cliente, valor, status de devolucao | Produtos e periodo | Drawer de itens/refunds | IDs, referencias financeiras, auditoria |
| Estoque | Produtos criticos e acao de comprar/ajustar | Quantidade, minimo, categoria | Movimentos, custo, ficha tecnica | StockMovement IDs, referenceType/referenceId |
| Financeiro | Resultado, entradas, saidas, saldo | Categorias, metodo, periodo | Composicao por origem e transacao | source, referenceType, referenceId, professionalId |
| Comissoes | A pagar, pago, proxima folha | Profissional, periodo, origem amigavel | Regra aplicada e composicao | ruleId, financialEntryId, appointmentId/productSaleId |
| Clientes | Clientes para reativar/agendar | Segmento, telefone, status | Historico, LTV, preferencias | scoring modelVersion, event IDs |
| Auditoria | Linha do tempo de eventos relevantes | Ator, entidade amigavel, quando | Before/after/metadata recolhiveis | Tudo tecnico, mas dentro do modulo owner-only |
| Configuracoes | Estado da operacao e botao salvar | Horarios, pagamentos, equipe | Regras avancadas e seguranca | User IDs, access records, logs |
| Mobile | Proxima tarefa e botoes rapidos | Alertas essenciais | Detalhe em bottom sheet | Tecnico oculto |

## 8. Diagnostico por modulo e funil ideal
### Dashboard
Diagnostico: bom esforco de cockpit, mas o payload do backend e muito rico. Ja ha elementos escondidos, sinalizando que existe excesso potencial.

Funil ideal:
- Principal: 4 cards maximos: hoje, mes, ocupacao, risco.
- Acao primaria: executar recomendacao mais importante.
- Filtros: nenhum no primeiro nivel; periodo vira controle discreto futuramente.
- Detalhes: insights em drawer ou details.
- Tecnico: telemetria e tuning apenas em Auditoria/Avancado.

### Agenda
Diagnostico: e o hub operacional, mas mistura criacao, lista, KPIs, filtros, fila e estoque. A tela deve orientar recepcao, nao virar analitico.

Funil ideal:
- Principal: agenda de hoje por hora, com proximo atendimento em destaque.
- Acao primaria: novo agendamento.
- Filtros minimos: profissional e periodo.
- Detalhes: drawer do atendimento com cliente, historico resumido, remarcar/cancelar.
- Tecnico: origem, IDs e history bruto ocultos.

### Checkout
Diagnostico: backend e robusto, frontend deve reduzir ansiedade no momento critico.

Funil ideal:
- Principal: cliente, servico, total e metodo de pagamento.
- Acao primaria: finalizar e receber.
- Filtros: nenhum.
- Detalhes: produtos adicionais e observacoes.
- Tecnico: idempotency, financeiro gerado e estoque consumido ficam em recibo tecnico/auditoria.

### PDV
Diagnostico: funcional, com carrinho e historico. Pode ficar premium se a busca e o carrinho forem o centro visual.

Funil ideal:
- Principal: adicionar produto ao carrinho e finalizar venda.
- Acao primaria: cobrar venda.
- Filtros minimos: busca por produto/categoria.
- Detalhes: cliente/profissional opcionais, historico em drawer.
- Tecnico: productSaleId/refundId ocultos.

### Historico de vendas
Diagnostico: agora existe backend de historico real. A UI deve evitar virar extrato financeiro duplicado.

Funil ideal:
- Principal: lista de vendas com status de devolucao.
- Acao primaria: devolver venda selecionada ou ver detalhes.
- Filtros minimos: periodo e busca.
- Detalhes: itens, quantidades devolviveis, recibos.
- Tecnico: referencias e audit trail em aba tecnica.

### Estoque
Diagnostico: tem boa base de resumo, tabela/cards e modais. O risco e mostrar custo, movimentacao e ficha tecnica cedo demais.

Funil ideal:
- Principal: produtos criticos e sugestoes de reposicao.
- Acao primaria: ajustar estoque ou adicionar produto, dependendo do estado.
- Filtros minimos: busca e status.
- Detalhes: drawer do produto com movimentos, custos e consumo.
- Tecnico: `StockMovement`, `referenceType`, `referenceId`.

### Financeiro
Diagnostico: e a tela mais exposta a complexidade tecnica. `source`, `referenceType`, `referenceId` e `Professional ID` aparecem nos cards/listas principais.

Funil ideal:
- Principal: resultado do periodo, entradas, saidas, saldo.
- Acao primaria: adicionar lancamento manual.
- Filtros minimos: periodo, tipo e busca.
- Detalhes: abrir transacao para ver composicao, origem amigavel e vinculos.
- Tecnico: IDs e tipos internos em bloco "Rastreabilidade" recolhido.

### Comissoes
Diagnostico: boa regra de permissao e pagamento, mas referencia financeira aparece cedo.

Funil ideal:
- Principal: total a pagar e profissionais pendentes.
- Acao primaria: pagar comissao selecionada.
- Filtros minimos: profissional e periodo.
- Detalhes: regra aplicada, vendas/servicos que compuseram o valor.
- Tecnico: `ruleId`, `financialEntryId`, appointment/product sale IDs.

### Clientes
Diagnostico: tem excelente potencial de CRM operacional. O risco e transformar preditivo em tabela de score.

Funil ideal:
- Principal: clientes que precisam de acao hoje.
- Acao primaria: chamar no WhatsApp / criar agendamento.
- Filtros minimos: busca e status.
- Detalhes: historico, LTV, preferencias, pacotes, notas.
- Tecnico: scoring, modelVersion e eventos de retencao.

### Auditoria
Diagnostico: cumpre objetivo tecnico owner-only. Ainda assim, a primeira leitura pode ser mais amigavel.

Funil ideal:
- Principal: linha do tempo com evento, ator, horario e entidade amigavel.
- Acao primaria: filtrar/investigar.
- Filtros minimos: periodo, entidade, ator; avancados recolhidos.
- Detalhes: before/after/metadata em accordions.
- Tecnico: tudo disponivel, mas restrito ao modulo.

### Configuracoes
Diagnostico: concentra settings, equipe, horarios, pagamentos, regras e aparencia. Deve ser modularizada por abas.

Funil ideal:
- Principal: status da configuracao essencial.
- Acao primaria: salvar alteracoes da aba atual.
- Filtros: nao aplicavel.
- Detalhes: regras de comissao, seguranca e equipe em abas.
- Tecnico: user/access IDs e permissoes brutas ocultas.

### Mobile
Diagnostico: existe navegacao mobile, mas a experiencia deve ser redesenhada por tarefas rapidas.

Funil ideal:
- Principal: Inicio, Agenda, PDV, Mais.
- Acao primaria: Novo agendamento ou cobrar, conforme tab.
- Filtros minimos: chips e bottom sheets.
- Detalhes: drawers/bottom sheets.
- Tecnico: nunca na superficie mobile, exceto Auditoria owner em leitura compacta.

## 9. Telas poluidas, confusas ou tecnicas demais
1. Financeiro: mostra `Source`, `Reference type`, `Reference ID` e `Professional ID` em cards operacionais.
2. Auditoria: tecnicamente correta, mas com `entityId`, `requestId` e `idempotencyKey` muito presentes no primeiro nivel.
3. Central de agendamentos: excesso de cards de resumo, alguns com baixa prioridade para acao imediata.
4. Comissoes: mensagem com referencia financeira tecnica aparece no feedback/lista.
5. Automacoes: regras, scoring, execucoes e webhook logs competem na mesma tela.
6. Fidelizacao: pacotes, assinaturas, retencao e multiunidade aparecem como bloco unico.
7. Configuracoes: muitas secoes longas sem tabs/drawers formais.

## 10. Onde o frontend expoe complexidade demais
- Financeiro expoe modelagem interna de rastreabilidade.
- Auditoria expoe todos os campos tecnicos no card antes de uma camada de interpretacao.
- Automacoes expoe webhook/log/scoring em experiencia parecida com console tecnico.
- Agenda historica tenta ser painel, lista e detalhe ao mesmo tempo.
- `public/app.js` centraliza muito estado e muitos handlers, dificultando evolucao cuidadosa da UX.

## 11. Onde faltam padroes de UI
- Drawers para detalhes de agenda, venda, transacao financeira, produto, cliente e comissao.
- Abas em Configuracoes, Fidelizacao e Automacoes.
- Filtros avancados recolhidos em Financeiro, Auditoria, Historico de vendas e Agenda historica.
- Estados vazios orientados a acao, especialmente para historico, comissoes e auditoria filtrada.
- Resumos compactos em Auditoria e Automacoes antes dos logs.
- Bottom sheets mobile para filtros e detalhes.
- Chips inteligentes para filtros comuns: Hoje, Esta semana, Pendentes, Criticos, A pagar.

## 12. Lacunas criticas
1. Definir contrato visual de camadas para impedir que novos campos tecnicos vazem para telas principais.
2. Reorganizar Financeiro para esconder rastreabilidade em detalhe.
3. Reduzir Central de agendamentos para consulta operacional, sem competir com Dashboard.
4. Separar Automacoes e Auditoria como areas tecnicas/avancadas, nao operacao diaria.
5. Criar padrao de drawer/detalhe reutilizavel antes de implementar novas telas.

## 13. Lacunas medias
1. Padronizar filtros minimos e avancados por modulo.
2. Padronizar empty states com proxima acao.
3. Criar linguagem de status amigavel para todos os `source`, `referenceType`, actions e entities.
4. Melhorar densidade mobile em Financeiro, Auditoria e Configuracoes.
5. Separar historico de vendas do PDV sem duplicar Financeiro.

## 14. Oportunidades de simplificacao
- Trocar tabelas principais por filas/cards quando a decisao e operacional.
- Usar drawers para detalhes, reduzindo mudanca de contexto.
- Agrupar KPIs em "essenciais" e "ver mais".
- Transformar filtros em chips de jornada: Hoje, Pendentes, Criticos, A pagar.
- Criar helpers de rotulos amigaveis para entidades tecnicas.
- Unificar feedbacks de sucesso/erro em uma camada consistente por modulo.

## 15. Oportunidades de beleza/premium UI
- Shell mais calmo, com menos bordas fortes e hierarquia tipografica mais consistente.
- Cards de decisao com pouco texto, bons espacos e status visuais discretos.
- Drawers laterais em desktop e bottom sheets em mobile.
- Microcopy com tom executivo: "A receber", "Precisa de acao", "Pronto para finalizar".
- Visual de calendario mais sofisticado para Agenda.
- PDV com carrinho fixo e busca fluida.
- Auditoria com linha do tempo elegante e tags sem parecer log cru.

## 16. Riscos de excesso de informacao
- Dashboard virar acumulador de todas as metricas disponiveis.
- Financeiro virar tela de banco de dados.
- Auditoria contaminar telas operacionais com IDs.
- Agenda historica virar BI paralelo.
- Mobile ficar inviavel por excesso de filtros.
- "Premium" ser confundido com mais cards; premium aqui significa menos ruido e mais clareza.

## 17. Proposta de arquitetura SaaS reaproveitavel
Criar uma camada conceitual de UX por capacidades, nao por barbearia:

| Capacidade SaaS | Barbearia | Clinica/estetica/pet/consultorio |
| --- | --- | --- |
| Agenda | Atendimento/corte | Consulta/procedimento/banho/servico |
| Cliente | Cliente recorrente | Paciente/cliente/tutor |
| Profissional | Barbeiro | Medico/profissional/terapeuta/veterinario |
| Servico | Corte/barba/produto associado | Procedimento/consulta/pacote |
| PDV | Produto vendido | Produto, medicamento, cosmetico, taxa |
| Estoque | Produtos e insumos | Insumos, materiais, medicamentos, cosmesticos |
| Financeiro | Caixa e comissoes | Receitas, despesas, repasses, convenios futuros |
| Auditoria | Eventos operacionais | Compliance, prontuario operacional, rastreabilidade |
| Automacoes | Reativacao/WhatsApp | Retorno, lembrete, pos-atendimento |
| Configuracoes | Unidade/barbearia | Unidade/clinica/empresa |

Arquitetura visual recomendada:
- `OperationalHome`: proxima acao e fila do dia.
- `EntityList`: lista compacta com filtros minimos.
- `EntityDrawer`: detalhe progressivo.
- `TechnicalTrace`: componente recolhido para IDs e auditoria contextual.
- `AuditTimeline`: modulo tecnico owner-only.
- `SettingsTabs`: configuracao por abas reutilizaveis.
- `MobileTaskTabs`: mobile por tarefas, nao por organograma.

## 18. Proximas fases recomendadas
1. Fase 1.1 - Design system e contratos de camada: definir componentes `PageHeader`, `PrimaryAction`, `FilterBar`, `EntityDrawer`, `TechnicalTrace`, `EmptyState`, `StatusChip`.
2. Fase 1.2 - Financeiro limpo: esconder rastreabilidade tecnica e criar drawer de transacao.
3. Fase 1.3 - Agenda funil operacional: separar agenda do dia, criacao e historico.
4. Fase 1.4 - PDV premium + historico em drawer.
5. Fase 1.5 - Auditoria owner com timeline amigavel e filtros avancados recolhidos.
6. Fase 1.6 - Mobile task-first para Agenda/PDV/Dashboard.
7. Fase 1.7 - Configuracoes/Automacoes/Fidelizacao em tabs e camadas avancadas.

## 19. Criterios de aceite
- Documento criado com matriz frontend x backend e matriz de camadas.
- Diagnostico por modulo cobre Dashboard, Agenda, Checkout, PDV, Historico de vendas, Estoque, Financeiro, Comissoes, Clientes, Auditoria, Configuracoes e Mobile.
- Nenhuma tela implementada nesta fase.
- Nenhuma rota, regra financeira, auditoria, idempotencia, permissao ou tenant guard alterada.
- Arquivos `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md` e `.planning/24_NEXT_PRIORITIES.md` atualizados.
- `npm run build` executado.
- `npm run test` executado.
- `npm run smoke:api` executado se o ambiente local permitir.

## 20. Arquivos analisados
- `package.json`
- `src/http/app.ts`
- `src/http/security.ts`
- `src/domain/types.ts`
- `src/domain/rules.ts`
- `src/application/operations-service.ts`
- `src/application/prisma-operations-service.ts`
- `src/application/audit-service.ts`
- `src/application/idempotency.ts`
- `src/application/dashboard-telemetry.ts`
- `src/application/client-predictive.ts`
- `src/application/stock-consumption.ts`
- `prisma/schema.prisma`
- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `public/styles/layout.css`
- `public/components/menu-config.js`
- `public/components/sidebar.js`
- `public/components/topbar.js`
- `public/components/mobile-tabs.js`
- `public/modules/dashboard.js`
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
- `.planning/60_UI_UX_REFACTOR.md`
- `.planning/70_AUDITORIA_CAIXA_PRETA.md`
- `.planning/89_FRONTEND_FLUXOS_CRITICOS.md`
- `.planning/90_TENANT_GUARD_HISTORICO_VENDAS.md`
- `.planning/91_OUTBOX_AUDITORIA_TRANSACIONAL.md`
- `.planning/92_VALIDACAO_MANUAL_PRODUCAO_CONTROLADA.md`
- `.planning/93_VALIDACAO_MANUAL_EXECUCAO.md`
- `.planning/94_DEPLOY_PRODUCAO_CONTROLADA.md`
- `.planning/95_CHECKLIST_VISUAL_PRE_DEPLOY.md`
- `.planning/96_CORRECOES_PRE_DEPLOY.md`
- `.planning/97_EXECUCAO_CHECKLIST_AMBIENTE_ALVO.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## 21. Validacoes executadas
As validacoes obrigatorias desta fase devem ser registradas apos a execucao:
- `npm.cmd run build`: PASSOU.
- `npm.cmd run test`: falhou no sandbox por `spawn EPERM` do Vitest/Vite; PASSOU fora do sandbox com `63 passed | 10 skipped`.
- `npm.cmd run smoke:api`: falhou no sandbox por acesso/verificacao de engine Prisma em `binaries.prisma.sh`; PASSOU fora do sandbox.

Resultado nesta rodada:
- Build TypeScript sem erros.
- Testes automatizados passaram fora do sandbox.
- Smoke local concluiu agenda -> checkout, PDV -> venda -> devolucao, financeiro, comissoes, dashboard e auditoria.
