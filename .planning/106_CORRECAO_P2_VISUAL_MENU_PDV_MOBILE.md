# Fase 0.11.1 - Correcao P2 visual menu por perfil e PDV mobile

Data: 2026-06-13

## Objetivo da fase

Corrigir os dois P2 visuais herdados da Fase 0.11 sem alterar regra de negocio, sem mudar RBAC backend, sem implementar feature nova, sem deploy, sem seed e sem migration destrutiva.

## Baseline Git antes da fase

Comandos executados antes de alterar:

- `git status --short`: worktree ja estava sujo; `.env` nao apareceu.
- `git status -sb`: `## main...origin/main [ahead 6]`.
- `git diff --stat`: 16 arquivos modificados, `2194 insertions(+)`, `738 deletions(-)`.
- `git diff --name-only`: alteracoes ja existentes em docs `.planning`, `package-lock.json`, frontend publico, services application e `tests/api.spec.ts`.
- `git log --oneline -12`: HEAD `f777e82 docs: auditar alteracoes preexistentes do grupo e`.

Confirmacoes:

- Branch atual: `main`.
- Ahead/behind: `ahead 6`, sem behind indicado.
- `.env` no status: nao.
- Fase 0.11 pendente no worktree: sim, `.planning/105_CHECKLIST_VISUAL_HUMANO_DESKTOP_MOBILE.md` e `.planning/evidence/fase-105/` estavam untracked.
- `package-lock.json` segue alterado pelo `npm audit fix` sem `--force` da Fase 0.11.

## P2 herdados da Fase 0.11

1. Menu/carregamento visual por perfil divergia do RBAC backend:
   - recepcao e profissional ainda viam modulos sensiveis;
   - backend bloqueava corretamente com 403;
   - problema era visual/UX e carregamento eager no frontend.

2. PDV mobile:
   - botao flutuante `Ir para Venda` sobrepunha campos do carrinho;
   - carrinho ficava menos usavel em viewport mobile.

## Causa provavel

- `public/components/menu-config.js` estava hardcoded para retornar permissao de owner em `getAllowedModulesForRole()` e `filterMenuGroupsByRole()`, independentemente do perfil.
- `public/app.js` tambem usava owner hardcoded para menu e carregava modulos sensiveis em `loadAll()` para qualquer perfil.
- `public/components/sidebar.js` sempre exibia entrada de configuracoes no menu de conta.
- `public/styles/layout.css` mantinha o atalho mobile `#mobileOperationActions` como elemento fixo sobre a tela do PDV.

## Arquivos alterados nesta fase

- `public/components/menu-config.js`
- `public/components/sidebar.js`
- `public/app.js`
- `public/styles/layout.css`
- `tests/frontend-menu-config.spec.ts`
- `.planning/evidence/fase-106/p2-visual-check.spec.ts`
- `.planning/106_CORRECAO_P2_VISUAL_MENU_PDV_MOBILE.md`
- `.planning/105_CHECKLIST_VISUAL_HUMANO_DESKTOP_MOBILE.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

Observacao: `test-results/.last-run.json` foi gerado pelo Playwright como artefato local nao rastreado e nao deve entrar em commit.

## Correcao do menu por perfil

- `owner`: mantem acesso visual aos modulos administrativos existentes, incluindo Financeiro, Equipe, Servicos, Auditoria, WhatsApp, Link Agendamento e extras internos ja conhecidos.
- `recepcao`: menu visual limitado a `Agenda`, `PDV` e `Clientes`.
- `profissional`: menu visual limitado a `Agenda` e `Clientes`.
- O menu de conta nao mostra mais `Configuracoes`/`Usuario` para perfis sem permissao de `configuracoes`.
- `public/app.js` agora le o perfil real da sessao local (`sb.authSession`) e recalcula o modulo ativo se o modulo salvo nao for permitido.
- `loadAll()` deixou de chamar carregadores de modulos ocultos para o perfil atual, evitando requisicoes owner-only desnecessarias.

## Correcao do PDV mobile

- O atalho flutuante `#mobileOperationActions` passou a ficar oculto sempre.
- A acao real de cobranca continua no carrinho (`#saleCheckoutBtn`), dentro do fluxo do formulario.
- Campos `Cliente`, `Profissional`, `Total`, botao de cobranca e historico de vendas permanecem acessiveis no mobile.
- Desktop nao recebeu redesign.

## Tratamento de 403

- O backend continua sendo a fonte real de seguranca.
- O frontend continua usando `extractApiErrorMessage()` para transformar 403 em mensagem amigavel: `Voce nao tem permissao para executar esta acao.`
- O carregamento condicional reduz 403 visuais/console para modulos que o perfil nao deve acessar.
- Acesso manual a endpoint proibido continua retornando 403 pelo backend.

## Validacoes executadas

- `node --input-type=module --check < public/app.js`: passou.
- `node --input-type=module --check < public/components/menu-config.js`: passou.
- `node --input-type=module --check < public/components/sidebar.js`: passou.
- `npm test -- --run tests/frontend-menu-config.spec.ts`: passou (`3 passed`).
- `npm run build`: passou.
- `npm run test`: passou (`86 passed | 11 skipped`).
- `npm run test:db`: passou (`11 passed`).
- `npm audit`: passou (`0 vulnerabilities`).
- `npm audit --omit=dev`: passou (`0 vulnerabilities`).
- `git diff --check`: passou.
- `NODE_ENV=development DATA_BACKEND=memory SMOKE_BASE_URL=http://127.0.0.1:3335 npm run smoke:api`: passou.
- `NODE_PATH=/root/.npm/_npx/420ff84f11983ee5/node_modules npx -p @playwright/test playwright test .planning/evidence/fase-106/p2-visual-check.spec.ts --reporter=line`: passou (`2 passed`).

## Resultado por perfil

- Owner: ve modulos administrativos esperados no menu visual.
- Recepcao: ve apenas `Agenda`, `PDV` e `Clientes`; nao ve Auditoria, Configuracoes, Financeiro, Relatorios ou Comissoes.
- Profissional: ve apenas `Agenda` e `Clientes`; nao ve PDV, Auditoria, Configuracoes, Financeiro, Relatorios ou Comissoes.
- Backend RBAC nao foi alterado.

## Resultado mobile

- PDV mobile nao exibe mais o botao flutuante `Ir para Venda`.
- Campos do carrinho e botao de cobranca ficam acessiveis no fluxo normal do carrinho.
- Checagem Playwright em viewport `390x844` confirmou `#saleClientId`, `#saleProfessionalId`, `#saleCheckoutBtn` e `#saleRecentList` visiveis, com `#mobileOperationActions` oculto.

## Pendencias reais

- Falta validacao em dispositivo fisico real.
- `test-results/.last-run.json` e artefatos de evidencia nao devem ser incluidos em commit de produto, salvo decisao explicita de manter evidencia.
- O frontend ainda baixa modulos JS estaticos sensiveis porque a arquitetura atual usa imports estaticos em `public/app.js`; a correcao desta fase impede menu/acesso visual e chamadas de dados, nao implementa code splitting.
- Nao houve commit, push, deploy, seed ou migration.

## Decisao final

APROVADO COM RESSALVAS.

As correcoes principais dos P2 foram implementadas e validadas localmente. As ressalvas restantes sao validacao em dispositivo fisico real e organizacao de commit seletivo, sem `git add .`.

## Recomendacao de commit

Fazer commit seletivo da Fase 0.11.1 depois de revisar o diff:

- incluir `public/components/menu-config.js`, `public/components/sidebar.js`, `public/app.js`, `public/styles/layout.css`, `tests/frontend-menu-config.spec.ts` e docs `.planning` da fase;
- avaliar se `.planning/evidence/fase-106/p2-visual-check.spec.ts` deve entrar como evidencia;
- nao incluir `test-results/.last-run.json`;
- nao usar `git add .`;
- nao misturar com commits das fases anteriores ainda pendentes.
