# Macro 234 - Redesenho visual estrutural premium

Data: 2026-07-07
Branch inicial: main
HEAD inicial: 7e42c7f7252e90924a20fe4499184445e4836dcf

## 1. Diagnostico encontrado no codigo

- Ha trabalho local nao commitado anterior da Macro 234 em `public/app.js`, `public/booking.html`, `public/components/*`, `public/modules/*`, `public/styles/layout.css`, `public/styles/design-system.css` e testes.
- O frontend e vanilla HTML/CSS/JS, com shell em `public/index.html`, orquestracao em `public/app.js` e modulos em `public/modules`.
- A navegacao owner-only ja foi parcialmente reduzida para Hoje, Agenda, Clientes, Financeiro, Estoque, Configuracoes, Servicos e Auditoria.
- A camada `public/styles/design-system.css` ja iniciou tokens dark premium, booking light premium e login institucional.
- Ainda existem sinais de dashboard generico: topbar com texto institucional fraco, header de Hoje chamado "Dashboard", cards repetidos no inicio e textos como "Painel executivo" e "Performance".
- A marca Liddo ja aparece, mas a sidebar nao destaca claramente a operacao atual "Barbearia Geovane Borges".
- Configuracoes ja tem shell proprio, mas o brand interno ainda carrega `aria-label="LIDDO BARBER"` em `public/modules/configuracoes.js`.
- Alguns textos continuam tecnicos ou pouco humanos, especialmente "owner", enums preservados em filtros e textos de apoio herdados.
- Ha CSS legado extenso em `public/styles/layout.css`; a estrategia segura e sobrepor tokens/componentes sem remocao destrutiva nesta passagem.

## 2. Problemas por tela

- Shell: topbar repete informacao obvia e nao reforca produto/estabelecimento; sidebar precisa mostrar produto e operacao atual.
- Hoje: estrutura ainda remete a BI, com KPI grid e cards de meta/alertas/performance/insights.
- Agenda Semana: base funcional forte; precisa refinamento de contraste, chips, status e controles.
- Agenda Lista: ja recebeu hierarquia de acao principal e "Mais opcoes"; precisa manter leitura mobile sem tabela larga.
- Clientes: filtros e modal existem; ainda ha microcopy e badges de cadastro com tom administrativo.
- Financeiro: filtros e fluxo preservados; visual precisa parecer periodo/caixa, nao painel generico.
- Estoque: operacional, mas ainda muito cadastro/tabela em alguns pontos.
- Configuracoes: ja ha hub, mas precisa pertencer ao mesmo shell visual e remover marca antiga.
- Servicos: formularios mantem campos avancados; necessidade e esconder complexidade visualmente sem apagar funcionalidade.
- Auditoria: ja humaniza parte dos eventos; detalhes tecnicos devem continuar em expansao/painel.
- Checkout: fluxo oficial preservado; precisa acabamento visual via componentes globais sem mexer contrato.
- Booking: ja usa light premium e sem CDN IMask; precisa manter prioridade da barbearia e assinatura Liddo discreta.
- Login: ja institucionalizado; precisa evitar marca antiga e manter dark premium.

## 3. Arquivos envolvidos

- `public/index.html`
- `public/app.js`
- `public/components/menu-config.js`
- `public/components/sidebar.js`
- `public/components/topbar.js`
- `public/components/operational-ui.js`
- `public/modules/dashboard.js`
- `public/modules/agenda.js`
- `public/modules/agendamentos.js`
- `public/modules/configuracoes.js`
- `public/modules/auditoria.js`
- `public/booking.html`
- `public/login.html`
- `public/styles/layout.css`
- `public/styles/design-system.css`
- `tests/frontend-macro-234-ui.spec.ts`
- `tests/frontend-menu-config.spec.ts`

## 4. Riscos de regressao

- IDs em `index.html` sao consumidos por `app.js`; evitar renomear ou remover mounts.
- Classes e `data-*` acionam listeners de agenda, checkout, configuracoes, estoque e filtros.
- Booking possui fluxo publico com estado conversacional; alterar DOM principal pode quebrar testes.
- Checkout, financeiro, estoque e auditoria dependem de contratos de API e dados normalizados; nao alterar backend.
- CSS com `!important` ja existe em camada de redesign; reduzir somente onde seguro, sem limpeza ampla sem inventario.

## 5. Dependencias

- Sem novas dependencias externas.
- Sem CDN de fontes.
- Sem migracao de framework.
- Sem seed, migration, reset de banco, deploy, commit ou push.
- Testes via `vitest`, `tsc`, `npm run build` e `git diff --check`.

## 6. Estrategia de implementacao

1. Preservar o trabalho local existente e aplicar ajustes incrementais.
2. Reforcar arquitetura de marca: Liddo como produto; Barbearia Geovane Borges como operacao atual.
3. Trocar topbar generica por contexto operacional discreto.
4. Reescrever microcopy de headers principais para "Hoje", "Agenda", "Clientes", "Financeiro", "Estoque", "Configuracoes", "Servicos" e "Auditoria".
5. Transformar Hoje em mesa de trabalho visual: agora, resumo do dia, agenda restante e atencao, sem remover mounts usados por JS.
6. Ajustar Design System com componentes editoriais, listas/tabelas mobile, botoes, foco, status e chips.
7. Corrigir marcas antigas restantes e textos tecnicos mais evidentes.
8. Atualizar testes focados para travar identidade, navegacao e ausencia de dependencias externas frageis.
9. Executar validacoes disponiveis sem banco destrutivo.

## 7. Criterios de aceite

- Liddo aparece como produto; Barbearia Geovane Borges aparece como operacao/cliente.
- `LIDDO BARBER` e `Barbearia Premium` nao aparecem como marca ativa.
- Navegacao principal segue owner-only.
- Hoje deixa de usar "Dashboard" como titulo visual.
- Booking prioriza a barbearia e assina "Tecnologia Liddo".
- Login prioriza Liddo.
- Sem alteracao de backend, Prisma, migrations, seed ou `.env`.
- Build e testes focados passam ou falhas ficam documentadas.
- Nenhum commit ou push e realizado.

## 8. Plano de rollback

- Como as alteracoes sao frontend e planejamento, rollback seguro por arquivo via Git para os arquivos alterados nesta passagem.
- Manter `public/styles/design-system.css` como camada isolada facilita desativar o acabamento visual removendo o link do CSS ou revertendo o arquivo.
- Caso teste de fluxo quebre, reverter primeiro mudancas em JS estrutural (`app.js`, `sidebar.js`, `configuracoes.js`) e manter apenas CSS.

## 9. Checklist desktop

- 1920x1080: validar shell, Hoje, Agenda, Clientes, Financeiro, Estoque, Configuracoes, Servicos, Auditoria, Checkout, Login e Booking.
- 1920x900: validar altura de Agenda e modais.
- 1366x768: validar densidade, sidebar, headers e agenda.
- 1024x768: validar tablet, filtros e navegacao.

## 10. Checklist mobile

- 768x1024: validar tablet vertical.
- 430px, 390px e 360px: validar menu mobile, Agenda Lista, Clientes, Checkout, Booking, Login e modais.
- Confirmar ausencia de overflow horizontal no documento.
- Confirmar touch targets e foco visivel.

## 11. Pendencias reais antes da implementacao

- Validacao visual headless ainda nao executada.
- Nao ha evidencia de ambiente de banco isolado para `npm run test:db`; comando deve ser evitado se depender de banco real.
- A camada visual ainda depende de seletor global e CSS legado; limpeza destrutiva fica fora desta passagem.

## 12. Execucao realizada

- Sidebar principal e sidebar de Configuracoes passaram a mostrar Liddo como produto e a operacao atual com fallback para `Barbearia Geovane Borges`.
- Headers operacionais foram reescritos para remover o tom de dashboard generico.
- A tela Hoje foi reorganizada em `today-summary-grid`, `today-workbench` e `today-actions-strip`, preservando os IDs consumidos pelo JavaScript.
- O modulo `dashboard.js` reduziu ranking/BI visivel e passou a priorizar receita do dia, atendimentos, ocupacao, pendencias, ritmo do dia e acoes sugeridas.
- Booking publico abre com `Barbearia Geovane Borges`, `Agende seu horario` e assinatura discreta `Tecnologia Liddo`.
- Login passou a exibir `LIDDO` com descriptor `Sistema de gestao`.
- `design-system.css` recebeu ajustes de sidebar, headers editoriais, composicao Hoje, booking light premium e responsividade mobile.
- Teste focado da Macro 234 foi ampliado para validar arquitetura de marca.

## 13. Validacoes executadas

- `npm test -- tests/frontend-macro-234-ui.spec.ts tests/frontend-menu-config.spec.ts tests/frontend-agenda-week.spec.ts tests/frontend-booking-public.spec.ts tests/frontend-checkout-flow.spec.ts`: 62 testes passaram.
- `npx tsc --noEmit`: passou sem erros.
- `npm run build`: passou.
- `git diff --check`: passou; exibiu apenas avisos de conversao LF/CRLF do Git no Windows.
- `npm test`: 272 testes passaram e 38 ficaram skipped em 23 arquivos.
- `npm run test:db`: bloqueado em `npx prisma generate` por `EPERM` ao renomear `query_engine-windows.dll.node`; gate de seguranca confirmou `localhost` e banco `barbearia_test` antes da falha.

## 14. Evidencias e limitacoes

- Playwright nao esta instalado (`npm ls playwright` retornou arvore vazia), entao nao foram gerados screenshots headless.
- Nao houve abertura automatica de navegador.
- Nao houve seed, migration manual, reset, commit, push, deploy ou alteracao de `.env`.
- Busca no frontend nao encontrou `LIDDO BARBER`, `Barbearia Premium`, `Top profissional`, `Painel executivo`, `title: "Dashboard"`, `Agendamento online` ou `LIDDO SYSTEM` como interface ativa. Restam apenas ocorrencias em teste legado e regex de teste.

## Fase 234.2 - Correcao P0 e tela Hoje como gabarito visual

### Diagnostico

- Branch inicial: `main`.
- HEAD inicial: `7e42c7f7252e90924a20fe4499184445e4836dcf`.
- Working tree ja continha alteracoes locais da Macro 234 em shell, sidebar, topbar, dashboard, login, CSS e testes. Essas alteracoes foram preservadas como base preexistente.
- A tela Hoje ainda estava organizada por `today-summary-grid`, `today-workbench` e `today-actions-strip`, com foco em receita, meta mensal, ritmo e acoes sugeridas. Ainda nao respondia primeiro qual era o proximo atendimento.
- A marca ativa ainda estava como `LIDDO` + `Sistema de gestao` na sidebar, sidebar de Configuracoes e login.

### Causa do scroll

- O bloqueio vinha da arquitetura de shell herdada em `public/styles/layout.css`: `.sidebar-wrap` possuia `min-height/max-height: calc(100vh - 24px)` e `overflow: hidden`, enquanto overrides mobile tambem fixavam `#appSidebar` e `.sidebar-wrap` em `height/min-height/max-height: 100vh` com `overflow: hidden`.
- A regra nao travava o documento sozinha em todos os viewports, mas criava um shell de altura fixa e transferia a rolagem para areas internas. Em combinacao com `#appShell` limitado por largura mobile e com modais/drawers fixos, isso tornava a rolagem vertical global instavel.
- O design-system anterior nao declarava um contrato desktop explicito de `html/body/#appShell/#appMain/#appContent` com altura auto e overflow vertical visivel.

### Arquivos envolvidos

- `public/index.html`
- `public/app.js`
- `public/components/sidebar.js`
- `public/modules/configuracoes.js`
- `public/modules/dashboard.js`
- `public/login.html`
- `public/styles/design-system.css`
- `tests/frontend-macro-234-ui.spec.ts`
- `tests/frontend-agenda-week.spec.ts`

### Estrategia

1. Travar o contrato global: documento rola verticalmente, shell e conteudo nao cortam eixo Y, sidebar permanece fixa/sticky no desktop e possui scroll proprio apenas para navegacao.
2. Ajustar modais para max-height em `100dvh` e scroll proprio sem depender de body lock permanente.
3. Trocar a marca visivel para `Liddo Barber` na sidebar, Configuracoes e login, sem subtitulo.
4. Deixar `Barbearia Geovane Borges` separada da marca e discreta no contexto.
5. Refazer Hoje usando dados reais ja carregados: `currentAppointments/currentAgenda` para proximo atendimento e agenda restante; payload `/dashboard` para situacao do dia, caixa, ocupacao, pendencias e meta compacta.
6. Nao alterar Agenda, Clientes, Financeiro, Estoque, Configuracoes, Servicos, Auditoria, Checkout ou Booking estruturalmente fora dos efeitos globais de shell.

### Riscos

- `currentAppointments` depende do filtro de periodo atual; como a inicializacao ja usa Hoje, a tela Hoje fica fiel ao periodo carregado. Se o usuario trocar filtros da central, a tela pode refletir o conjunto atual ate novo carregamento.
- A API `/dashboard` nao traz discriminacao confiavel por forma de pagamento; o movimento financeiro fica limitado ao total confirmado.
- Playwright pode nao estar instalado; capturas dependerao de Chrome/Edge headless ou ficarao bloqueadas com roteiro manual.

### Criterios de aceite

- `html`, `body`, `#appShell`, `#appMain`, `#appContent` nao bloqueiam rolagem vertical global.
- Sidebar mostra `Liddo Barber`; login mostra apenas `Liddo Barber`.
- `Sistema de gestao` nao aparece na sidebar/login.
- Hoje inicia por proximo atendimento e situacao do dia, sem quatro cards gigantes iguais.
- Agenda restante usa lista/timeline compacta com dados reais.
- Movimento do dia mostra total apenas uma vez.
- Pendencias mostram alertas reais ou estado vazio util.
- Meta mensal aparece somente como faixa compacta secundaria.
- Testes focados protegem scroll, marca, acao principal e estrutura da tela Hoje.

### Rollback

- Reverter os arquivos desta fase pelo diff local, priorizando `public/modules/dashboard.js`, `public/index.html` e `public/styles/design-system.css`.
- Caso a nova composicao de Hoje falhe, manter o contrato de scroll e reverter apenas a estrutura dos mounts do dashboard.
- Sem migrations, seed, commit, push ou alteracao de `.env`.

### Validacao executada na Fase 234.2

- `npm test`: 22 arquivos passaram, 1 skipped; 274 testes passaram, 38 skipped.
- `npx tsc --noEmit`: passou sem erros.
- `npm run build`: passou.
- `git diff --check`: passou; apenas avisos LF/CRLF do Git no Windows.
- Capturas reais salvas em `.planning/evidence/234_2/`: `hoje-1366x768.png`, `sidebar-1366x768.png`, `hoje-scroll-bottom-1366x768.png`, `hoje-390x844.png`, `hoje-430x932.png`, `hoje-360x800.png`, `login-1366x768.png`.
- Medicao desktop: `scrollHeight=802`, `clientHeight=768`, `scrollY=34`, sem overflow horizontal.
- Medicao mobile: 390, 430 e 360px sem overflow horizontal; sidebar fechada fora da viewport por transform.
- Nao foi gerada captura anterior limpa da Fase 234.2 porque as alteracoes locais da Macro 234 ja existiam antes desta intervencao.

## Fase 234.3 - Remocao da aba Hoje

### Decisao de produto

- A aba `Hoje` deixou de existir como tela propria.
- `Agenda` passa a ser a tela inicial do sistema para owner, recepcao e profissional.
- A remocao deve simplificar a operacao sem criar outro dashboard dentro da Agenda.

### Diagnostico antes da alteracao

- Branch inicial da fase: `main`.
- HEAD inicial da fase: `7e42c7f7252e90924a20fe4499184445e4836dcf`.
- Working tree ja continha alteracoes locais das fases 234 e 234.2; elas foram preservadas como base.
- Referencias ativas encontradas:
  - `public/components/menu-config.js`: item `dashboard`/`Hoje`, permissao owner/recepcao, default owner e tab mobile.
  - `public/index.html`: `dashboardSection`, mounts `dashboardHeaderMount`, `dashboardNextAppointment`, `kpiGrid`, `goalBlock`, `topProfessionalsList`, `alertsList`, `actionSuggestionsList` e paineis auxiliares.
  - `public/app.js`: import de `public/modules/dashboard.js`, header Hoje, refs DOM, `dashboardElements`, `sectionsByModule.dashboard`, `restoreActiveModule`, `navigate`, `loadDashboard`, render/loading/error, playbook/sugestoes e listeners `data-dashboard-*`.
  - `public/modules/dashboard.js`: renderizacao completa da tela Hoje.
  - `public/styles/design-system.css`: estilos `.today-*`.
  - `public/styles/layout.css`: seletores compartilhados `#dashboardSection`.
  - Testes frontend: expectativas de `dashboard` no menu, mobile tabs e overflow mobile.
- Consumidores do endpoint `/dashboard` encontrados fora da UI:
  - `tests/api.spec.ts`, `tests/db.integration.spec.ts`, smokes e historico de planning.
  - Backend/servicos de sugestoes e telemetria continuam existindo.

### Arquivos envolvidos

- `public/components/menu-config.js`
- `public/components/sidebar.js`
- `public/index.html`
- `public/app.js`
- `public/modules/dashboard.js`
- `public/styles/design-system.css`
- `public/styles/layout.css`
- `tests/frontend-menu-config.spec.ts`
- `tests/frontend-macro-234-ui.spec.ts`
- `tests/frontend-mobile-overflow.spec.ts`

### Estrategia

1. Remover `dashboard` do menu, RBAC visual e mobile tabs.
2. Tornar `Agenda` o default por perfil e fallback seguro.
3. Converter `dashboard` legado salvo em `localStorage` ou passado para `navigate` em `agenda`.
4. Remover a section HTML, imports, refs DOM, load, renderizacao e listeners exclusivos da tela Hoje.
5. Remover `public/modules/dashboard.js` porque, sem a tela Hoje, nao ha consumidor frontend ativo.
6. Preservar `/dashboard` backend e testes de API para auditoria posterior.
7. Preservar a correcao P0 de scroll e a arquitetura de marca `Liddo Barber` / `Barbearia Geovane Borges`.

### Riscos de regressao

- Usuarios com `sb.activeModule=dashboard` em storage precisam cair em Agenda; tratado em `restoreActiveModule`.
- Chamadas internas antigas para `navigate("dashboard")` precisam cair em Agenda; tratado no normalizador de navegacao.
- O backend `/dashboard` fica potencialmente sem consumidor visual, mas ainda coberto por testes e smokes; limpeza deve ser fase separada.
- Textos `Hoje` permanecem em filtros de periodo, nao como aba.

### Criterios de aceite

- Sidebar e mobile tabs nao exibem `Hoje`.
- `Agenda` e o primeiro item visual e o modulo inicial.
- A section `dashboardSection` nao existe no HTML ativo.
- Nao existe import de `./modules/dashboard.js`.
- Nao existem listeners `data-dashboard-*` ativos.
- `Novo agendamento` continua acessivel pela Agenda.
- Scroll global permanece sem `overflow: hidden` reintroduzido.
- Backend `/dashboard` nao foi removido.
- Testes, TypeScript, build e `git diff --check` devem passar.

### Validacao executada na Fase 234.3

- `npm test`: 22 arquivos passaram, 1 skipped; 274 testes passaram, 38 skipped.
- `npm test -- tests/frontend-menu-config.spec.ts tests/frontend-macro-234-ui.spec.ts tests/frontend-agenda-week.spec.ts tests/frontend-agenda-normalization.spec.ts tests/frontend-agenda-delay.spec.ts tests/frontend-mobile-overflow.spec.ts tests/frontend-booking-public.spec.ts tests/frontend-schedule-validation.spec.ts`: 8 arquivos passaram; 83 testes passaram.
- `npx tsc --noEmit`: passou sem erros.
- `npm run build`: passou.
- `git diff --check`: passou; apenas avisos LF/CRLF do Git no Windows.
- `test:db` nao foi executado nesta fase por nao ser necessario para a remocao visual e por ja haver historico de bloqueio de ambiente.

## Fase 234.4 - Auditoria final do Release Candidate

### Estado inicial

- Data local: 2026-07-08.
- Branch inicial: `main`.
- HEAD inicial: `7e42c7f7252e90924a20fe4499184445e4836dcf`.
- `git status --short` inicial:
  - Modificados: `public/app.js`, `public/booking.html`, `public/components/menu-config.js`, `public/components/operational-ui.js`, `public/components/sidebar.js`, `public/components/topbar.js`, `public/index.html`, `public/login.html`, `public/modules/agenda.js`, `public/modules/agendamentos.js`, `public/modules/auditoria.js`, `public/modules/automacoes.js`, `public/modules/configuracoes.js`, `public/styles/layout.css`, `tests/frontend-menu-config.spec.ts`, `tests/frontend-mobile-overflow.spec.ts`.
  - Removido: `public/modules/dashboard.js`.
  - Novos nao rastreados: `.planning/234_REDENHO_VISUAL_ESTRUTURAL_PREMIUM.md`, `.planning/234_RELEASE_CANDIDATE_OWNER_ONLY.md`, `public/modules/operational-language.js`, `public/styles/design-system.css`, `tests/frontend-macro-234-ui.spec.ts`.
- `git diff --stat` inicial: 17 arquivos rastreados, 354 insercoes e 1103 remocoes.
- `git diff --name-status` inicial confirma os mesmos arquivos rastreados, com `D public/modules/dashboard.js`.

### Separacao das alteracoes acumuladas

- Simplificacao inicial da Macro 234: `public/components/menu-config.js`, `tests/frontend-menu-config.spec.ts`, ajustes de menu e escopo owner-only.
- Redesign visual congelado: `public/components/operational-ui.js`, `public/components/topbar.js`, `public/modules/agenda.js`, `public/modules/agendamentos.js`, `public/modules/auditoria.js`, `public/modules/automacoes.js`, `public/booking.html`, `public/styles/layout.css`, `public/styles/design-system.css`.
- Correcao P0 de scroll: `public/styles/design-system.css`, ajustes relacionados em `public/styles/layout.css`.
- Marca Liddo Barber: `public/components/sidebar.js`, `public/modules/configuracoes.js`, `public/login.html`, `public/index.html`.
- Remocao da aba Hoje: `public/components/menu-config.js`, `public/index.html`, `public/app.js`, `public/modules/dashboard.js`, `public/styles/design-system.css`, `public/styles/layout.css`, `tests/frontend-menu-config.spec.ts`, `tests/frontend-macro-234-ui.spec.ts`, `tests/frontend-mobile-overflow.spec.ts`.
- Testes: `tests/frontend-menu-config.spec.ts`, `tests/frontend-mobile-overflow.spec.ts`, `tests/frontend-macro-234-ui.spec.ts`.
- Planning: `.planning/234_REDENHO_VISUAL_ESTRUTURAL_PREMIUM.md`, `.planning/234_RELEASE_CANDIDATE_OWNER_ONLY.md`.

### Diretriz da auditoria

- Visual em congelamento provisorio.
- Corrigir somente P0/P1 comprovado ou P2 pequeno e objetivo.
- Nao executar reset, restore, stash, rebase, clean, migration, seed, deploy, commit ou push.

### Achados e correcoes da auditoria

- P2 corrigido: booking publico exibiu `Unidade Padrao` na marca por vir do payload local de configuracoes. Impacto: texto de seed visivel para cliente final. Correcao: `public/booking.html` normaliza esse placeholder para `Barbearia Geovane Borges`. Validacao: screenshot `booking-390x844-after-fix.png`, teste focado de booking, TypeScript, build, suite comum e `diff --check`.
- P2 corrigido: `scripts/smoke-api-flow.mjs` usava transicoes de status sem `idempotency-key`, mas o contrato atual exige idempotencia em operacoes criticas. Impacto: smoke mutavel falso-negativo. Correcao: adicionar chaves de idempotencia nas transicoes `CONFIRMED` e `IN_SERVICE`. Validacao: smoke mutavel no banco local de teste passou.
- Risco documentado: banco local principal `barbearia` esta com schema desatualizado para o codigo atual (`AppointmentBlock` ausente), por isso o smoke readonly contra `127.0.0.1:3333` falhou em `/agenda/range`. Nenhuma migration/db push foi executada nesta fase. O banco local de teste `barbearia_test` foi migrado pelo fluxo seguro de `test:db` e passou nos smokes.
- Bloqueio Prisma diagnosticado: `npx prisma generate` falhou com `EPERM` no rename de `query_engine-windows.dll.node` enquanto servidores Node do proprio projeto estavam ativos. Foram encerrados somente PIDs identificados do projeto (`src/server.ts`/`dist/src/server.js`), preservando kernels Codex. Depois disso, `prisma generate` e `npm run test:db` passaram.

### Validacao executada na Fase 234.4

- `npm test`: 22 arquivos passaram, 1 skipped; 274 testes passaram, 38 skipped.
- `npm run test:db`: 1 arquivo passou; 38 testes passaram; gate confirmou `host=localhost`, `database=barbearia_test`.
- `npx tsc --noEmit`: passou sem erros.
- `npm run build`: passou.
- `git diff --check`: passou; apenas avisos LF/CRLF do Git no Windows.
- `npm run smoke:api:readonly` contra banco principal local: falhou por schema local desatualizado (`AppointmentBlock` ausente).
- `npm run smoke:api:readonly` contra banco local de teste migrado: passou.
- `npm run smoke:api` contra banco local de teste migrado: passou apos ajuste do script de idempotencia. IDs controlados registrados no log: agendamento `b9b8bb35-8518-414e-a607-ca4f6c29c07b`, venda `90624f05-1b31-49aa-964f-8705d3640bc2`, refund `bfa44eeb-bebd-4cd7-b87a-240c1382c91a`.
- Validacao visual headless: 29 medicoes em 1366x768, 1024x768, 768x1024, 430x932, 390x844 e 360x800; zero overflow horizontal global; zero ocorrencias de `Hoje` na navegacao; zero `dashboardSection`.
- Inventario de dados de teste salvo em `.planning/evidence/234_4/test-data-inventory.json`: 11 registros suspeitos no banco principal local e 48 no banco local de teste.

### Evidencias da Fase 234.4

- Logs: `.planning/evidence/234_4/*.log`.
- Metricas visuais: `.planning/evidence/234_4/visual-metrics.json`.
- Screenshots: `.planning/evidence/234_4/screenshots/`.
- Inventario de dados: `.planning/evidence/234_4/test-data-inventory.json`.

### Riscos restantes

- Banco local principal `barbearia` nao esta pronto para smoke sem aplicar migrations pendentes; isso deve ser tratado na etapa de preparacao controlada do ambiente/piloto, nao por `db push` ad hoc.
- Ha dados locais de teste/smoke/seed visiveis; a limpeza real deve ser dry-run e revisada por dependencias antes de qualquer exclusao.
- O arquivo `booking.html` ainda tem mojibake legado em comentarios/textos internos; nao foi corrigido amplamente por congelamento visual e risco de churn.
