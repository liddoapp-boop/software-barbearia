# Fase 0.9.9 - Auditoria do Grupo E: alteracoes preexistentes

Data: 2026-06-08

## Objetivo

Auditar as alteracoes preexistentes classificadas como Grupo E na Fase 0.9.8, sem implementar feature nova, sem alterar regra de negocio, sem stage/commit/push/revert e sem executar seed ou migration destrutiva.

## Contexto

Fases criticas recentes concluidas e validadas:

- 0.9.4: RBAC, permissoes e relatorios sensiveis.
- 0.9.5: hardening de producao, ambiente e dependencias.
- 0.9.6: `test:db` e smoke isolado.
- 0.9.7: XSS, `localStorage` e sanitizacao frontend.
- 0.9.8: reconciliacao do worktree, commits e documentacao real.

Esta fase analisou mudancas antigas/preexistentes ainda no worktree para decidir se devem ser mantidas, separadas, corrigidas, descartadas apenas com autorizacao humana ou deixadas pendentes.

## Estado Git inicial

Comandos solicitados antes de qualquer edicao:

- `git status --short`: worktree com 26 arquivos modificados e 6 untracked. `.env` nao apareceu.
- `git status -sb`: `## main...origin/main [ahead 2]`.
- `git diff --stat`: 26 arquivos, `2611 insertions(+)`, `752 deletions(-)`.
- `git diff --name-only`: confirmou alteracoes em `.env.example`, trackers `.planning`, `package*`, `prisma/seed.ts`, frontend publico, servicos application, HTTP/security e testes.
- `git log --oneline -10`: HEAD `2f31868 docs: reconciliar worktree e plano de commits`; commit anterior `7407bd1 fix: aplicar rbac e corrigir permissoes criticas`.
- `git diff -- .planning/README.md`: sem saida.

Confirmacoes:

- Branch atual: `main`.
- Ahead/behind: `origin/main...HEAD = 0 behind / 2 ahead`.
- Commits locais nao enviados: `2f31868` e `7407bd1`.
- `.env` no status: nao.
- `.planning/README.md` com diff: nao.
- Arquivos pendentes das fases 0.9.5/0.9.6/0.9.7: sim, continuam no worktree (`.env.example`, `package*`, `prisma/seed.ts`, `src/http/*`, testes, `scripts/smoke-api-flow.mjs`, `public/modules/sanitize.js`, mudancas de sanitizacao).
- Fase 0.9.8: commit local `2f31868` existe e ainda nao foi enviado.

## Arquivos auditados

Grupo E principal:

- `public/components/sidebar.js`
- `public/components/whatsapp.js`
- `public/modules/agendamentos.js`
- `public/modules/configuracoes.js`
- `public/modules/financeiro.js`
- `public/styles/layout.css`
- `src/application/operations-service.ts`
- `src/application/prisma-operations-service.ts`
- `public/components/operational-ui.js`
- `public/index.html`
- `public/login.html`
- `public/app.js`
- `public/booking.html`
- `public/components/topbar.js`
- `public/modules/feedback.js`

Arquivos de fases recentes foram rechecados apenas para separar origem: `.env.example`, `package.json`, `package-lock.json`, `prisma/seed.ts`, `src/http/app.ts`, `src/http/security.ts`, testes e `scripts/smoke-api-flow.mjs`.

## Analise por arquivo

### `public/components/sidebar.js`

- O que mudou: textos sem acento viraram textos com acento em usuario, configuracoes e operacao.
- Tipo: visual/texto, P3.
- Relacao com fases recentes: nao essencial para hardening, embora mantenha `escapeHtml`.
- Impacto critico: nao altera rota, permissao, payload, RBAC ou handler.
- Risco: baixo; sem risco de seguranca novo.
- Teste: indireto por build; sem teste visual.
- Recomendacao: COMMITAR EM FASE PROPRIA ou manter junto com fase visual de frontend.

### `public/components/whatsapp.js`

- O que mudou: templates de confirmacao/lembrete foram reorganizados em grid, icones removidos, textarea de confirmacao reduzida de 11 para 8 linhas.
- Tipo: visual/layout, P3.
- Relacao com fases recentes: nao tem relacao com IA/WhatsApp real; nao muda endpoints nem payload.
- Impacto critico: pode afetar usabilidade da tela de automacoes, mas nao envio real.
- Risco: baixo; endpoints existentes continuam `/whatsapp/status`, `/whatsapp/connect`, `/whatsapp/disconnect`.
- Teste: build apenas; precisa validacao manual visual.
- Recomendacao: MANTER PENDENTE PARA TESTE MANUAL ou COMMITAR EM FASE PROPRIA.

### `public/modules/agendamentos.js`

- O que mudou: import de `escapeHtml` e escapes em mensagens de erro, resumo, tabela, cards mobile, detalhe de agendamento e historico.
- Tipo: seguranca/XSS, P2 positivo.
- Relacao com fases recentes: claramente coberto pela Fase 0.9.7.
- Impacto critico: nao altera criacao, conflito, status, checkout ou payload; apenas renderizacao.
- Risco: baixo; mitigacao de XSS.
- Teste: coberto indiretamente por `tests/frontend-sanitize.spec.ts` e suite principal.
- Recomendacao: JA COBERTO POR FASE ANTERIOR.

### `public/modules/configuracoes.js`

- O que mudou: muitos textos receberam acento; seletor de tema substituiu botoes customizados; sidebar interna de configuracoes foi reestruturada para reutilizar padrao visual da sidebar principal; menu agrupado virou lista plana.
- Tipo: visual/UX com pequena mudanca funcional de controle de tema, P2.
- Relacao com fases recentes: parte de escape/sanitizacao ja existia, mas a reestrutura visual e preexistente.
- Impacto critico: pode afetar navegacao de Configuracoes e escolha de tema; nao muda payload de settings salvo pelo backend.
- Risco de seguranca: baixo; continua usando `escapeHtml`.
- Teste: build/suite; sem teste visual/manual por secao.
- Recomendacao: MANTER PENDENTE PARA TESTE MANUAL; se aprovado, COMMITAR EM FASE PROPRIA de frontend/configuracoes.

### `public/modules/financeiro.js`

- O que mudou: resumo financeiro passou de 3 KPIs para 4 KPIs (`Saldo de caixa`, `Receitas`, `Saidas`, `Resultado projetado`); lista de transacoes ganhou paginacao local "Ver mais"; rastreabilidade tecnica foi removida do drawer financeiro.
- Tipo: funcional de apresentacao/UX financeiro, P2.
- Relacao com fases recentes: nao pertence a hardening; e Grupo E real.
- Impacto critico: nao altera transacao, comissao, refund, estoque ou auditoria backend; altera interpretacao visual do financeiro.
- Risco: medio-baixo. Pode confundir conciliacao se a semantica dos novos campos nao for validada manualmente; remocao da trace visual reduz capacidade de suporte.
- Teste: build/suite/test:db passam; nao ha teste especifico do novo layout/paginacao.
- Recomendacao: MANTER PENDENTE PARA TESTE MANUAL e COMMITAR EM FASE PROPRIA. Avaliar se `technicalTrace` deve voltar antes de commit.

### `public/styles/layout.css`

- O que mudou: grande conjunto de regras para drawer, PDV historico, financeiro, booking link, WhatsApp templates, settings sidebar, agenda responsiva e sidebar mobile hamburger.
- Tipo: visual/layout responsivo amplo, P2.
- Relacao com fases recentes: mistura ajustes antigos de UX com suporte ao novo layout mobile; nao e puramente 0.9.7.
- Impacto critico: pode afetar agenda, PDV, financeiro, configuracoes, booking e mobile.
- Risco: medio por amplitude e uso de muitos `!important`; precisa passada visual desktop/mobile.
- Teste: build nao valida layout; sem Playwright visual nesta fase.
- Recomendacao: MANTER PENDENTE PARA TESTE MANUAL; COMMITAR EM FASE PROPRIA de frontend responsivo se aprovado.

### `src/application/operations-service.ts`

- O que mudou: resumo financeiro em memory agora expoe `paidCommissionsTotal`, `refundsTotal`, `operationalExpenses`; remove duplicacao do calculo de comissoes pendentes.
- Tipo: API/relatorio financeiro aditivo, P2.
- Mudancas de regra revisadas: sem alteracao em conflito de agenda, criacao de agendamento, checkout, venda, baixa de estoque, devolucao, idempotencia, tenant guard, auditoria ou status.
- Impacto critico: altera shape aditivo e detalhamento de resumo financeiro; nao altera persistencia.
- Risco: baixo-medio por contrato financeiro; campos precisam ser documentados/testados se virarem fase propria.
- Teste: suite principal e smoke exercitam fluxo financeiro, mas nao ha assercao especifica dos novos campos.
- Recomendacao: COMMITAR EM FASE PROPRIA junto com frontend financeiro, preferencialmente com teste focado.

### `src/application/prisma-operations-service.ts`

- O que mudou: resumo Prisma calcula despesas de comissao pagas e refunds via `financialEntry`, expoe os mesmos campos do memory e mantem `estimatedProfit = income - expenses - pendingCommissions`.
- Tipo: API/relatorio financeiro aditivo, P2.
- Mudancas de regra revisadas: sem alteracao em agenda, checkout, vendas, baixa de estoque, refund, tenant guard, idempotencia, auditoria estrutural ou status.
- Impacto critico: pode impactar interpretacao de financeiro/relatorios; nao altera escrita.
- Risco: baixo-medio; precisa teste especifico para paridade memory/prisma dos novos campos.
- Teste: `npm run test:db` passou; sem assercao especifica desses novos campos.
- Recomendacao: COMMITAR EM FASE PROPRIA com teste focado de resumo financeiro.

### `public/components/operational-ui.js`

- O que mudou: importa/reexporta helpers de sanitizacao; `NOT_REFUNDED` mudou de `success` para `muted`; `renderTechnicalTrace` foi transformado em no-op que retorna string vazia.
- Tipo: seguranca/manutencao + mudanca visual de rastreabilidade, P2.
- Relacao com fases recentes: reexport de sanitize e parte da Fase 0.9.7; no-op de trace nao foi requisito de hardening e afeta modulos alem de Financeiro.
- Impacto critico: nao apaga auditoria backend, mas remove visualizacao tecnica em drawers de agendamentos, comissoes, configuracoes e vendas.
- Risco: medio para suporte/auditoria operacional. Pode ser intencional para reduzir poluicao visual, mas precisa decisao humana.
- Teste: build passa; sem teste de presenca/ausencia de trace.
- Recomendacao: PRECISA DECISAO ANTES DE COMMIT. Se a trace deve existir, corrigir antes; se a decisao de produto for esconder, commitar em fase propria documentada.

### `public/index.html`

- O que mudou: limpa `sb.authSession` quando token expirado; adiciona backdrop de sidebar mobile; altera controles da agenda; reorganiza secoes do financeiro; altera botao de copiar link e icones de dicas de booking.
- Tipo: seguranca/localStorage + visual/layout, P2.
- Relacao com fases recentes: limpeza de sessao pertence a 0.9.7; o restante e Grupo E visual.
- Impacto critico: pode afetar agenda mobile, financeiro e booking link visual; nao muda endpoints.
- Risco: medio por dependencia de CSS/JS mobile.
- Teste: build/smoke; sem validacao visual.
- Recomendacao: dividir mentalmente: JA COBERTO POR FASE ANTERIOR para limpeza de sessao; MANTER PENDENTE PARA TESTE MANUAL para visual/mobile.

### `public/login.html`

- O que mudou: `persistSession` grava payload de usuario reduzido no `localStorage`.
- Tipo: seguranca/minimizacao, P2 positivo.
- Relacao com fases recentes: Fase 0.9.7.
- Impacto critico: pode afetar frontend se algum ponto dependesse de campos extras do usuario; revisao indica uso principal de id/email/name/role/activeUnitId/unitIds.
- Risco: baixo.
- Teste: suite e smoke autenticado passam.
- Recomendacao: JA COBERTO POR FASE ANTERIOR.

### `public/app.js`

- O que mudou: sanitizacao adicional; novo date picker financeiro; sidebar mobile hamburger; alteracoes em historico/drawer de PDV; categorias "Todos"; fallback de copy-to-clipboard; ajustes de agenda responsiva; troca do seletor de tema para `select`.
- Tipo: misto: seguranca, UX e funcional de apresentacao, P2.
- Relacao com fases recentes: escapes pertencem a 0.9.7; picker financeiro/mobile/PDV sao Grupo E.
- Impacto critico: pode afetar agenda mobile, Financeiro e PDV. Nao altera endpoints de checkout/venda/refund; handlers de refund/detalhe ainda existem.
- Risco: medio por amplitude e por codigo legado morto: `financialPeriod` ainda e referenciado, mas agora fica `null` porque o select foi removido. Nao quebra por guards, mas deve ser limpo ou validado em fase propria.
- Teste: build/test/test:db/smoke passam; sem teste visual/picker.
- Recomendacao: MANTER PENDENTE PARA TESTE MANUAL; COMMITAR EM FASE PROPRIA apos validar Financeiro, Agenda mobile, PDV e Booking link.

### `public/booking.html`

- O que mudou: remove uso de token em chamadas publicas; escapa dados de usuario/servico/horario; carrega nome da empresa via `/public/business`; adiciona protecao contra duplo submit e corridas por `bookingRunId`; melhora restart de agendamento; trata 409 de horario indisponivel.
- Tipo: seguranca + bugfix/UX do booking publico, P2.
- Relacao com fases recentes: escapes pertencem a 0.9.7; controle de corrida/duplo submit e brand dinamico sao Grupo E.
- Impacto critico: pode afetar booking publico, mas de forma aparentemente positiva. Nao altera endpoint nem payload essencial.
- Risco: medio por fluxo publico sensivel e pouca cobertura automatica de frontend.
- Teste: smoke API cobre endpoint, nao UI do booking.
- Recomendacao: COMMITAR EM FASE PROPRIA com validacao manual do booking publico.

### `public/components/topbar.js`

- O que mudou: `moduleLabel` passa por `escapeHtml`.
- Tipo: seguranca/XSS, P3 positivo.
- Relacao com fases recentes: Fase 0.9.7.
- Impacto critico: nenhum.
- Teste: build/suite.
- Recomendacao: JA COBERTO POR FASE ANTERIOR.

### `public/modules/feedback.js`

- O que mudou: `feedbackPanel` escapa mensagem.
- Tipo: seguranca/XSS, P2 positivo.
- Relacao com fases recentes: Fase 0.9.7.
- Impacto critico: mensagens HTML intencionais deixariam de renderizar como HTML; uso atual indica texto simples.
- Teste: `tests/frontend-sanitize.spec.ts`.
- Recomendacao: JA COBERTO POR FASE ANTERIOR.

## Riscos encontrados

- P0: nenhum encontrado.
- P1: nenhum aberto confirmado.
- P2: alteracoes amplas em `public/app.js`, `public/styles/layout.css`, `public/modules/financeiro.js`, `public/modules/configuracoes.js`, `public/booking.html`, `src/application/*operations-service.ts` e `public/components/operational-ui.js` exigem fase propria ou validacao manual antes de commit.
- P3: textos/acento e ajustes visuais isolados em sidebar/WhatsApp/topbar.

Risco especifico: `renderTechnicalTrace()` virou no-op. Isso nao remove auditoria persistida, mas reduz rastreabilidade visual e deve ter decisao humana explicita.

## Mudancas funcionais detectadas

- Resumo financeiro ganhou campos aditivos (`paidCommissionsTotal`, `refundsTotal`, `operationalExpenses`) em memory e Prisma.
- Financeiro frontend usa novo date picker e paginacao local de transacoes.
- Booking publico remove headers de auth em endpoints publicos, evita duplo submit e trata conflito 409.
- PDV historico virou lista clicavel simplificada; o botao direto de devolucao saiu da linha e a devolucao fica via drawer.
- Sidebar mobile passou a abrir por hamburger/backdrop.

Nao foram detectadas mudancas em conflito de agenda, criacao de agendamento backend, checkout backend, venda backend, baixa de estoque, refund backend, comissao backend, idempotencia, tenant guard, auditoria persistida ou regras de status.

## Mudancas visuais detectadas

- Reorganizacao responsiva de Agenda, Financeiro, Configuracoes, PDV, Booking link e WhatsApp templates.
- Grande bloco CSS novo para mobile sidebar, agenda mobile e componentes de botoes.
- Ajustes de tipografia/peso/espacamento em drawers e listas.

## Mudancas de seguranca detectadas

- Positivas: escapes adicionais em agenda, app, booking, feedback, topbar; limpeza de `sb.authSession`; payload reduzido de usuario no login; headers de seguranca ja pertencentes a fase 0.9.7.
- Atencao: `localStorage` ainda guarda JWT; isso ja foi documentado como risco residual da 0.9.7.
- Nao houve exposicao de segredo; `.env` nao apareceu no status.

## Recomendacao por arquivo

| Arquivo | Severidade | Recomendacao |
| --- | --- | --- |
| `public/components/sidebar.js` | P3 | COMMITAR EM FASE PROPRIA |
| `public/components/whatsapp.js` | P3 | MANTER PENDENTE PARA TESTE MANUAL |
| `public/modules/agendamentos.js` | P2 positivo | JA COBERTO POR FASE ANTERIOR |
| `public/modules/configuracoes.js` | P2 | MANTER PENDENTE PARA TESTE MANUAL |
| `public/modules/financeiro.js` | P2 | COMMITAR EM FASE PROPRIA apos validacao manual |
| `public/styles/layout.css` | P2 | MANTER PENDENTE PARA TESTE MANUAL |
| `src/application/operations-service.ts` | P2 | COMMITAR EM FASE PROPRIA com teste focado |
| `src/application/prisma-operations-service.ts` | P2 | COMMITAR EM FASE PROPRIA com teste focado |
| `public/components/operational-ui.js` | P2 | PRECISA DECISAO ANTES DE COMMIT sobre trace |
| `public/index.html` | P2 | DIVIDIR: 0.9.7 + fase visual propria |
| `public/login.html` | P2 positivo | JA COBERTO POR FASE ANTERIOR |
| `public/app.js` | P2 | MANTER PENDENTE PARA TESTE MANUAL |
| `public/booking.html` | P2 | COMMITAR EM FASE PROPRIA com validacao manual |
| `public/components/topbar.js` | P3 positivo | JA COBERTO POR FASE ANTERIOR |
| `public/modules/feedback.js` | P2 positivo | JA COBERTO POR FASE ANTERIOR |

## Comandos executados e resultados

- `git status --short`: passou; `.env` ausente; Grupo E e fases recentes ainda pendentes.
- `git status -sb`: `main...origin/main [ahead 2]`.
- `git diff --stat`: passou; 26 arquivos, 2611 insercoes, 752 delecoes.
- `git diff --name-only`: passou.
- `git log --oneline -10`: passou; HEAD `2f31868`.
- `git diff -- .planning/README.md`: sem diff.
- `git rev-list --left-right --count origin/main...HEAD`: `0 2`.
- `git branch --show-current`: `main`.
- `git diff --check`: passou sem saida.
- `npm run build`: passou.
- `npm run test`: passou (`83 passed | 11 skipped`).
- `npm run test:db`: passou (`11 passed`).
- `npm audit`: passou (`found 0 vulnerabilities`).
- `npm audit --omit=dev`: passou (`found 0 vulnerabilities`).
- `NODE_ENV=development DATA_BACKEND=memory SMOKE_BASE_URL=http://127.0.0.1:3334 npm run smoke:api`: passou; smoke concluiu com sucesso.

## Decisao final

APROVADO COM RESSALVAS.

Justificativa:

- Todas as validacoes obrigatorias passaram.
- Nao ha `.env` no status e nao houve exposicao de segredo.
- Nao encontrei P0/P1 aberto confirmado.
- As mudancas do Grupo E foram entendidas o suficiente para separar origem e risco.
- Ha mudancas uteis, mas elas misturam frontend visual, booking publico, apresentacao financeira e rastreabilidade visual. Isso exige fase/commit proprio e validacao manual antes de entrar junto com hardening critico.

## Proxima etapa recomendada

1. Nao usar `git add .`.
2. Separar commits de 0.9.5, 0.9.6 e 0.9.7 dos arquivos Grupo E.
3. Criar fase propria para Grupo E visual/financeiro/booking, com checklist manual: Agenda desktop/mobile, Financeiro date picker/KPIs/lista, PDV historico/drawer/devolucao, Configuracoes, Booking publico e sidebar mobile.
4. Decidir explicitamente se `renderTechnicalTrace()` deve continuar oculto ou ser restaurado.
5. Adicionar teste focado para novos campos de resumo financeiro se `src/application/*operations-service.ts` for commitado.
