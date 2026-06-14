# Fase 0.10 - Validacao, correcao e decisao do Grupo E

Data: 2026-06-08

## Objetivo

Validar as alteracoes preexistentes do Grupo E, corrigir apenas bugs pequenos comprovados, decidir o destino de `renderTechnicalTrace()` e confirmar a coerencia do resumo financeiro aditivo entre backend memory e Prisma.

## Contexto

Esta fase parte das fases criticas ja separadas e commitadas localmente: 0.9.4 RBAC/permissoes, 0.9.5 hardening de producao, 0.9.6 test:db/smoke isolado, 0.9.7 XSS/localStorage, 0.9.8 reconciliacao e 0.9.9 auditoria do Grupo E.

Nao foram feitos seed, migration destrutiva, push, commit, `git add .`, `git add -A`, revert ou alteracao de RBAC backend.

## Estado Git inicial

- `git status --short`: 12 arquivos modificados, todos do Grupo E; `.env` ausente.
- `git status -sb`: `main...origin/main [ahead 6]`.
- Divergencia confirmada: `0 behind / 6 ahead`.
- `git diff --stat`: 12 arquivos, 1965 insercoes e 603 remocoes.
- `git diff --name-only`: somente arquivos do Grupo E.
- `git log --oneline -12`: HEAD `f777e82 docs: auditar alteracoes preexistentes do grupo e`; commits locais recentes incluem 0.9.4 a 0.9.9.
- `git diff -- .planning/README.md`: sem diff.

## Arquivos auditados

- `public/app.js`
- `public/booking.html`
- `public/components/operational-ui.js`
- `public/components/sidebar.js`
- `public/components/whatsapp.js`
- `public/index.html`
- `public/modules/agendamentos.js`
- `public/modules/configuracoes.js`
- `public/modules/financeiro.js`
- `public/styles/layout.css`
- `src/application/operations-service.ts`
- `src/application/prisma-operations-service.ts`

## Analise por arquivo

### `public/app.js`

Mudancas principais: date picker financeiro, sidebar mobile com backdrop/hamburger, ajustes em historico PDV, fallback de clipboard do link publico, agenda responsiva, seletor de tema via `select`, escapes adicionais e adaptacao de filtros financeiros.

Conclusao: alteracao funcional de frontend moderada. Endpoints usados continuam existentes. Nao foi encontrado handler quebrado em leitura estatica, nem chamada nova para endpoint inexistente. Mantem necessidade de validacao manual desktop/mobile em Agenda, PDV e Financeiro.

### `public/booking.html`

Mudancas principais: fluxo de novo agendamento com `bookingRunId`, protecao contra duplo submit, reset de estado, botao "Novo agendamento", chamadas publicas sem bearer token, favicon inline e nome da empresa via `/public/business`.

Conclusao: o bug do segundo agendamento no mesmo chat segue tratado pelo reset de estado e pelo `runId`; cards antigos ficam inertes quando o fluxo atual muda. `/favicon.ico` deixa de ser necessario por favicon data URI. As rotas `/public/services`, `/public/slots`, `/public/booking`, `/public/working-hours` e `/public/business` existem no backend.

### `public/components/operational-ui.js`

Mudancas principais: `NOT_REFUNDED` passa de `success` para `muted`; `renderTechnicalTrace()` vira no-op.

Decisao: manter o no-op nesta fase e documentar a perda de rastreabilidade tecnica visual. A auditoria persistida backend continua existindo e a tela de Auditoria segue como fonte principal. Recomendacao futura: restaurar trace por perfil owner/admin ou criar modo tecnico explicito.

### `public/components/sidebar.js`

Mudancas principais: textos acentuados e labels de usuario/conta. Nao altera a filtragem de menus.

Conclusao: componente em si nao contradiz RBAC, mas a filtragem visual efetiva ainda depende de `public/components/menu-config.js` e `public/app.js`, que continuam hardcoded para owner fora deste diff do Grupo E. Backend bloqueia rotas sensiveis; menu visual por perfil permanece pendencia de produto/UX fora desta fase.

### `public/components/whatsapp.js`

Mudancas principais: reorganizacao visual dos cards de templates e textarea menor.

Conclusao: o componente ainda tenta endpoints `/whatsapp/status`, `/whatsapp/connect` e `/whatsapp/disconnect` quando acionado, mas nenhuma integracao real foi implementada nesta fase. Deve ser tratado como UI/placeholder e validado manualmente para nao prometer envio real automatico.

### `public/index.html`

Mudancas principais: backdrop de sidebar mobile, ajustes de controles de agenda, reposicionamento do filtro financeiro, botao de copiar link e icones SVG nas dicas.

Conclusao: imports/scripts continuam na mesma ordem critica; nao ha duplicidade nova de script. Requer validacao manual responsiva.

### `public/modules/agendamentos.js`

Mudancas principais: escapes adicionais em mensagens, cliente, servico, profissional, telefone, origem, observacoes e historico.

Conclusao: melhora sanitizacao sem mudar status, checkout, estorno ou chamadas de endpoint. Fluxo mobile precisa validacao visual.

### `public/modules/configuracoes.js`

Mudancas principais: textos acentuados, sidebar interna reestruturada, lista plana de secoes, seletor de tema substitui botoes customizados.

Conclusao: formularios seguem no mesmo modulo e tratamento de erro permanece em `public/app.js`. Nao foi alterado RBAC backend; configuracoes continuam protegidas no backend. Acessibilidade/mobile da nova sidebar precisa validacao manual.

### `public/modules/financeiro.js`

Mudancas principais: novos KPIs (`paidCommissionsTotal`, `refundsTotal`, `operationalExpenses`), resultado projetado, lista paginada com "Ver mais" e remocao de trace tecnico no drawer financeiro.

Conclusao: apresentacao financeira esta coerente com os campos novos do backend. Nao duplica receita/despesa; separa saidas operacionais, comissoes pagas e estornos. Tratamento de 403 permanece via fluxo de erro de carregamento existente.

### `public/styles/layout.css`

Mudancas principais: grande bloco visual/responsivo para drawers, PDV, Financeiro, WhatsApp, link de booking, Configuracoes, agenda mobile e sidebar mobile.

Conclusao: alto volume visual sem erro de whitespace. Por ser CSS amplo, release deve depender de checklist manual em desktop e mobile.

### `src/application/operations-service.ts`

Mudancas principais: resumo financeiro memory calcula `paidCommissionsTotal`, `refundsTotal`, `operationalExpenses` e expoe os campos em `/financial/summary`.

Conclusao: mudanca aditiva. Nao altera persistencia, checkout, venda, refund, idempotencia, tenant guard ou auditoria. Usa `unitId` e o periodo atual.

### `src/application/prisma-operations-service.ts`

Mudancas principais: resumo financeiro Prisma calcula os mesmos campos via agregacoes em `FinancialEntry` filtradas por `unitId`, `kind`, `source` e periodo.

Conclusao: paridade com memory confirmada em leitura de codigo. As consultas respeitam `unitId`; nao alteram persistencia critica.

## Correcoes feitas

Foi adicionada cobertura focada em `tests/api.spec.ts`:

- refund de atendimento agora valida `summary.refundsTotal`, `summary.paidCommissionsTotal` e `summary.operationalExpenses`;
- pagamento de comissao agora valida `summary.paidCommissionsTotal`, `summary.refundsTotal` e `summary.operationalExpenses`.

Nenhum codigo de produto foi alterado nesta fase alem do teste.

## Decisao sobre `renderTechnicalTrace()`

Decisao desta fase: manter `renderTechnicalTrace()` como no-op no Grupo E e registrar ressalva.

Racional:
- auditoria persistida backend continua existente;
- a tela Auditoria segue disponivel para detalhe tecnico;
- restaurar trace agora adicionaria nova decisao de exposicao visual por perfil em uma fase que nao deve mexer em RBAC;
- a perda e de rastreabilidade visual em drawers, classificada como ressalva P2/P3, nao como perda de auditoria persistida.

Pendencia recomendada: fase futura para restaurar trace apenas para owner/admin ou criar modo tecnico explicito.

## Validacao do resumo financeiro

Memory:
- `paidCommissionsTotal`: soma despesas `source === "COMMISSION"`;
- `refundsTotal`: soma despesas `source === "REFUND"`;
- `operationalExpenses`: `expenses - paidCommissionsTotal - refundsTotal`;
- `estimatedProfit`: `income - expenses - pendingCommissions`.

Prisma:
- usa agregacoes em `financialEntry` com `unitId`, `kind`, `source` e periodo;
- usa `commissionEntry` pendente com `unitId` e periodo;
- retorna os mesmos campos expostos pelo backend memory.

Teste focado passou cobrindo refund e comissao no backend memory; `npm run test:db` passou validando a suite Prisma existente.

## Resultado dos comandos

- `npm run build`: passou.
- `npm run test`: passou (`83 passed | 11 skipped`).
- `npm run test:db`: passou (`11 passed`).
- `npm audit`: passou, `0 vulnerabilities`.
- `npm audit --omit=dev`: passou, `0 vulnerabilities`.
- `git diff --check`: passou.
- `NODE_ENV=development DATA_BACKEND=memory SMOKE_BASE_URL=http://127.0.0.1:3334 npm run smoke:api`: passou.
- Porta `3334`: fechada apos smoke.
- Syntax checks ES module via `node --input-type=module --check < arquivo`: passaram para `public/app.js`, `public/modules/financeiro.js`, `public/modules/configuracoes.js`, `public/modules/agendamentos.js` e `public/components/operational-ui.js`.

## Checklist manual necessario

- Dashboard.
- Agenda desktop e mobile.
- Booking publico.
- Segundo agendamento no mesmo chat.
- PDV historico, checkout e devolucao.
- Financeiro date picker, KPIs, lista e 403 para nao-owner.
- Configuracoes e sidebar interna em mobile.
- Sidebar mobile/hamburger.
- Modais mobile.
- WhatsApp visual/placeholder.
- Auditoria/rastreabilidade visual considerando o no-op.

## Pendencias reais

- Validacao visual humana desktop/mobile ainda nao executada.
- Menu visual por perfil segue pendente fora do diff do Grupo E, pois os helpers atuais ainda usam owner como referencia visual; backend RBAC permanece bloqueando rotas sensiveis.
- `renderTechnicalTrace()` sem visual tecnico nos drawers deve ser aceito explicitamente no commit ou separado para fase futura.
- WhatsApp continua UI/placeholder, nao integracao real.

## Decisao final

APROVADO COM RESSALVAS.

Nao ha P0/P1 confirmado nos arquivos do Grupo E apos build, testes, test:db, audit, diff check e smoke. As ressalvas sao validacao visual humana, trace tecnico no-op e menu visual por perfil fora do escopo direto do Grupo E.

## Recomendacao de commit

Commitar em fase propria, com staging seletivo, sem `git add .`:

- arquivos do Grupo E auditados;
- `tests/api.spec.ts`;
- `.planning/104_VALIDACAO_CORRECAO_GRUPO_E.md`;
- atualizacoes de `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md` e `.planning/24_NEXT_PRIORITIES.md`.

Mensagem sugerida:

```text
chore: validar grupo e e cobrir resumo financeiro
```

Nao deixar fora do commit do Grupo E se a decisao for promover a fase: nenhum arquivo pendente do Grupo E. Deixar para fase futura: menu visual por perfil e restauracao role-gated de `renderTechnicalTrace()`.
