# Fase 0.12.1 - Correcao de overflow mobile no painel interno

Data: 2026-06-14
Status: APROVADO

## Objetivo

Corrigir a tela mobile do painel interno/dashboard do barbeiro para remover o overflow horizontal geral da pagina. A tela deve ficar ajustada a largura do celular, sem permitir arrastar para uma area vazia lateral.

Esta etapa nao deve remover codigo pronto. A correcao deve ser incremental, preservando funcionalidades existentes e alterando apenas o necessario para adaptar o layout mobile.

## Problema observado

Na validacao em celular, o painel interno permite arrastar a tela para o lado e mostra uma area vazia sem informacao. A sensacao e que parte do painel esta com largura de desktop dentro da viewport mobile.

Escopo confirmado:
- painel interno/dashboard autenticado;
- menu/sidebar mobile;
- modulos internos que participam do layout do painel.

Fora do escopo:
- chat/booking publico de agendamento, exceto se for comprovadamente afetado por CSS global;
- IA;
- WhatsApp real;
- novas features;
- regras financeiras;
- RBAC backend;
- hardening de producao;
- deploy.

## Regras de preservacao

- Nao apagar arquivos.
- Nao remover codigo pronto que ja funciona.
- Nao fazer redesign completo.
- Nao alterar endpoint, regra financeira, seed, migration ou permissao backend.
- Nao usar `git add .`.
- Nao fazer commit, push ou deploy nesta etapa.
- Nao commitar `.env` nem `test-results/.last-run.json`.

## Baseline obrigatorio antes de alterar

Executar e registrar na conclusao da fase:

```bash
git status --short
git status -sb
git diff --stat
git diff --name-only
git log --oneline -12
```

Confirmar:
- branch atual;
- ahead/behind;
- arquivos modificados;
- se `.env` aparece no status;
- se `test-results/.last-run.json` aparece no status;
- quais fases continuam pendentes no working tree.

## Investigacao tecnica

Verificar principalmente:
- `public/styles/layout.css`;
- `public/index.html`;
- `public/app.js`;
- `public/components/sidebar.js`;
- `public/components/menu-config.js`;
- `public/modules/agendamentos.js`;
- `public/modules/financeiro.js`;
- `public/modules/configuracoes.js`;
- telas internas com grids, cards, tabelas, filtros, carrinho, toolbar ou modais.

Procurar:
- `width` fixo maior que a viewport;
- `min-width` incompatibilidade com mobile;
- uso de `100vw` combinado com padding/margem;
- grid sem quebra em mobile;
- flex sem `flex-wrap`;
- cards ou tabelas forçando largura da pagina;
- sidebar/menu mobile criando faixa lateral;
- modal, drawer, filtro ou toolbar passando da largura.

## Diretriz de correcao

Nao resolver apenas com:

```css
body { overflow-x: hidden; }
```

`overflow-x: hidden` so pode entrar como protecao final se a causa principal tambem for corrigida.

A solucao deve priorizar:
- containers com `max-width: 100%`;
- grids quebrando ou empilhando no mobile;
- filtros e botoes com wrap;
- tabelas largas dentro de wrapper com `overflow-x: auto`;
- cards sem `min-width` que force a pagina;
- sidebar mobile sem largura fantasma fora da viewport;
- modais limitados a largura da tela;
- desktop preservado sem regressao.

## Teste esperado

Adicionar ou ajustar um teste simples de overflow mobile no painel interno, se viavel no fluxo atual.

Viewport sugerida: `390x844`.

Validar:
- dashboard/painel inicial;
- Agenda;
- PDV;
- Financeiro como owner, se viavel;
- menu/sidebar aberto e fechado.

Criterio minimo:

```js
document.documentElement.scrollWidth <= window.innerWidth + 2
```

Tabelas largas podem ter scroll interno no proprio container, mas a pagina inteira nao deve ter scroll horizontal.

## Validacao obrigatoria

Rodar:

```bash
npm run build
npm run test
npm run test:db
npm audit
npm audit --omit=dev
git diff --check
```

Se possivel, rodar smoke API em ambiente dev isolado.

Validacao manual esperada:
- abrir painel interno em viewport mobile;
- confirmar que a pagina nao arrasta lateralmente;
- abrir e fechar menu mobile;
- abrir Dashboard;
- abrir Agenda;
- abrir PDV;
- abrir Financeiro;
- abrir Configuracoes/Auditoria como owner;
- confirmar que booking publico nao foi afetado.

## Entrega esperada ao concluir

Atualizar este documento com:
- causa encontrada;
- arquivos alterados;
- correcoes aplicadas;
- telas verificadas;
- resultado do teste de overflow;
- pendencias reais;
- decisao final.

Decisao final:
- `APROVADO`: overflow horizontal geral removido, menu mobile correto, modulos principais usaveis e testes passando.
- `APROVADO COM RESSALVAS`: overflow principal corrigido, restando apenas pequenos P3 visuais ou falta de validacao em mais de um aparelho fisico.
- `BLOQUEADO`: tela ainda arrasta para area vazia, modulo principal ficou inutilizavel, PDV voltou a sobrepor campos ou teste falha por bug real.

## Execucao da fase

Data da execucao: 2026-06-14

### Baseline Git registrado antes das alteracoes

Comandos executados antes de alterar:

```bash
git status --short
git status -sb
git diff --stat
git diff --name-only
git log --oneline -12
```

Resumo:
- Branch atual: `main`.
- Tracking: `main...origin/main [ahead 6]`.
- Behind: nenhum indicador de behind no `git status -sb`.
- `.env`: nao apareceu no status.
- `test-results/.last-run.json`: presente via diretorio untracked `test-results/`; nao foi incluido.
- Fases pendentes no working tree antes desta fase: 0.10, 0.11, 0.11.1 e 0.12 ainda sem commit proprio, alem dos documentos/evidencias untracked ja existentes.

Arquivos modificados antes desta fase:

```text
.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md
.planning/24_NEXT_PRIORITIES.md
package-lock.json
public/app.js
public/booking.html
public/components/menu-config.js
public/components/operational-ui.js
public/components/sidebar.js
public/components/whatsapp.js
public/index.html
public/modules/agendamentos.js
public/modules/configuracoes.js
public/modules/financeiro.js
public/styles/layout.css
src/application/operations-service.ts
src/application/prisma-operations-service.ts
tests/api.spec.ts
```

Arquivos/diretorios untracked antes desta fase:

```text
.planning/104_VALIDACAO_CORRECAO_GRUPO_E.md
.planning/105_CHECKLIST_VISUAL_HUMANO_DESKTOP_MOBILE.md
.planning/106_CORRECAO_P2_VISUAL_MENU_PDV_MOBILE.md
.planning/107_VALIDACAO_DISPOSITIVO_FISICO_REAL.md
.planning/108_CORRECAO_OVERFLOW_MOBILE_PAINEL_INTERNO.md
.planning/evidence/fase-105/
.planning/evidence/fase-106/
test-results/
tests/frontend-menu-config.spec.ts
```

Ultimos commits no baseline:

```text
f777e82 docs: auditar alteracoes preexistentes do grupo e
84854a3 fix: mitigar xss e reduzir payload em localstorage
7667725 test: isolar test db e smoke api
6496d91 fix: endurecer ambiente de producao e dependencias
2f31868 docs: reconciliar worktree e plano de commits
7407bd1 fix: aplicar rbac e corrigir permissoes criticas
e70a140 mock db
f7fc202 login
1cede31 Simplifica usuarios e isola dados por unidade
35ff774 Inclui seed no typecheck
118fb66 Migra preferencia de tema legada
5378a25 Remove auto login e usa tema do sistema
```

## Causa encontrada

A origem principal do risco de overflow horizontal estava no shell mobile do painel interno, nao no booking publico.

Pontos confirmados:
- `public/styles/layout.css` tinha varias camadas tardias de override para `#appShell` e `#appShell.sidebar-collapsed` usando `calc(100vw - Npx)`, alem de componentes internos sem uma regra final consistente de `max-width: 100%` e `min-width: 0`.
- O drawer interno de novo agendamento (`.sched-drawer-panel`) ficava fechado com `transform: translateX(100%)` dentro de uma camada fixed sem clipping explicito. Em navegadores mobile isso pode gerar uma faixa lateral arrastavel mesmo quando o body tenta esconder overflow.
- A agenda semanal usa uma grade larga por natureza (`.wc-header-row` e `.wc-body-inner` com `min-width` alto). Essa largura deve rolar dentro de `.wc-outer`, nunca na pagina inteira.
- PDV e Financeiro tinham layouts com flex/grid e larguras minimas que precisavam de contenção final para mobile.

## Arquivos alterados nesta fase

- `public/styles/layout.css`
- `tests/frontend-mobile-overflow.spec.ts`
- `.planning/evidence/fase-108/overflow-mobile-check.mjs`
- `.planning/evidence/fase-108/overflow-mobile-check.json`
- `.planning/108_CORRECAO_OVERFLOW_MOBILE_PAINEL_INTERNO.md`
- `.planning/107_VALIDACAO_DISPOSITIVO_FISICO_REAL.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Correcao aplicada

Em `public/styles/layout.css`, foi adicionada uma camada final da Fase 0.12.1 para:
- conter `#appShell`, `#appMain`, `#appContent` e seções internas em `max-width: 100%`/`min-width: 0`;
- limitar o shell mobile a `calc(100vw - 16px)` em tablet/mobile e `calc(100vw - 12px)` em celular;
- aplicar `overflow-x: clip` apenas no shell autenticado como contenção final, depois de corrigir containers e componentes;
- clipar `.sched-drawer` e limitar `.sched-drawer-panel` a `100vw`, removendo a faixa lateral do drawer fechado;
- manter a agenda semanal larga rolando dentro de `.wc-outer` com `overflow-x: auto` e `overscroll-behavior-x: contain`;
- reforçar contenção de PDV (`.pdv-mkt-*`) e Financeiro (`.fn-*`) para evitar que filtros, carrinho, linhas ou gráficos forcem a largura da pagina;
- empilhar a linha de campos do drawer de agendamento em celular estreito.

Nao houve alteracao em:
- booking/chat publico;
- regra financeira;
- RBAC backend;
- endpoints;
- seed;
- migration;
- deploy.

## Teste de overflow

Criado `tests/frontend-mobile-overflow.spec.ts`.

O teste:
- sobe API local isolada com `DATA_BACKEND=memory`;
- abre Chromium headless via CDP;
- injeta sessão owner em `localStorage`;
- usa viewport mobile `390x844`;
- valida `document.documentElement.scrollWidth <= window.innerWidth + 2`;
- cobre dashboard, Agenda, PDV, Financeiro e dashboard com menu mobile aberto.

Evidencia auxiliar:
- `.planning/evidence/fase-108/overflow-mobile-check.mjs`
- `.planning/evidence/fase-108/overflow-mobile-check.json`

Resultado da evidencia CDP:

```text
dashboard: viewport=390 scrollWidth=390 overflow=0
agenda: viewport=390 scrollWidth=390 overflow=0
operacao: viewport=390 scrollWidth=390 overflow=0
financeiro: viewport=390 scrollWidth=390 overflow=0
dashboard/menu: viewport=390 scrollWidth=390 overflow=0
```

## Validacoes executadas

```bash
npm test -- --run tests/frontend-mobile-overflow.spec.ts
npm run build
npm run test
npm run test:db
npm audit
npm audit --omit=dev
git diff --check
NODE_ENV=development DATA_BACKEND=memory SMOKE_BASE_URL=http://127.0.0.1:3336 npm run smoke:api
```

Resultados:
- Teste focado de overflow mobile: passou (`1 passed`).
- `npm run build`: passou.
- `npm run test`: passou (`87 passed | 11 skipped`, `6 passed | 1 skipped` arquivos).
- `npm run test:db`: passou (`11 passed`).
- `npm audit`: passou com 0 vulnerabilidades.
- `npm audit --omit=dev`: passou com 0 vulnerabilidades.
- `git diff --check`: passou.
- Smoke API dev isolado: passou.

Smoke:

```text
SMOKE TEST CONCLUIDO COM SUCESSO
Agendamento testado: dd4f155c-6cdb-454e-8b02-d8e21e824ca9
Venda testada: f78b4282-6b0a-48da-803c-9ef9f837dd70
Refund testado: e9ab6ee0-7749-435e-ab1d-e744f5da0c04
```

## Telas verificadas

Verificacao automatizada em viewport `390x844`:
- Dashboard: sem overflow horizontal geral.
- Agenda: sem overflow horizontal geral; grade semanal larga permanece com scroll interno em `.wc-outer`.
- PDV: sem overflow horizontal geral; botao flutuante `Ir para Venda` continua oculto e checkout real permanece no carrinho.
- Financeiro: sem overflow horizontal geral.
- Menu mobile aberto: sem overflow horizontal geral.

Booking publico:
- Nenhum arquivo do booking publico foi alterado nesta fase.
- A correcao foi limitada ao shell autenticado e componentes internos.

## Pendencias reais

- Validacao fisica refeita pelo usuario em celular real: aprovada.
- Fazer commit/push seletivo de fechamento, sem `git add .` e sem incluir `test-results/.last-run.json`.
- Validar o ambiente alvo real/deploy controlado apos o push.

## Decisao final

Decisao: APROVADO.

Motivo: o overflow horizontal geral do painel interno foi corrigido nas medicoes automatizadas de Dashboard, Agenda, PDV, Financeiro e menu mobile aberto. As validacoes obrigatorias passaram e o usuario confirmou em celular fisico real que a tela nao fica mais solta.
