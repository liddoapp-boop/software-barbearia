# Fase 0.11 - Checklist visual humano desktop/mobile

Data: 2026-06-13

## Objetivo

Executar e registrar validacao visual/manual assistida do sistema no navegador, em desktop e mobile, sem criar feature nova, sem deploy, sem seed, sem migration destrutiva, sem commit e sem push.

## Ambiente usado

- Branch: `main`.
- Remoto: `main...origin/main [ahead 6]`, confirmado `0 behind / 6 ahead`.
- Backend: `NODE_ENV=development DATA_BACKEND=memory`.
- URL testada: `http://127.0.0.1:3335/`.
- Booking publico: `http://127.0.0.1:3335/booking.html`.
- Navegador: Chromium headless via Playwright CLI temporario (`npx playwright`, Chromium cache local).
- Data/hora da validacao: 2026-06-13, UTC.
- Perfis testados: `owner`, `recepcao`, `profissional`.

## Baseline Git antes de alteracao

Comandos executados antes de documentar a fase:

- `git status --short`: arquivos do Grupo E e docs ainda modificados; `.env` nao apareceu.
- `git status -sb`: `## main...origin/main [ahead 6]`.
- `git log --oneline -12`: HEAD `f777e82 docs: auditar alteracoes preexistentes do grupo e`; commits locais 0.9.4 a 0.9.9 ainda nao enviados.
- `git diff --stat`: 15 arquivos modificados antes desta fase, `2025 insertions(+)`, `603 deletions(-)`.
- `git diff --name-only`: alteracoes em docs `.planning`, frontend publico, services application e `tests/api.spec.ts`.

Confirmacoes:

- Branch atual: `main`.
- Commits locais nao enviados: sim, 6 commits ahead.
- Arquivos modificados: sim.
- `.env` no status: nao.
- Fase 0.10: documentada em `.planning/104_VALIDACAO_CORRECAO_GRUPO_E.md`, mas ainda pendente no working tree, sem commit proprio.

## Pre-flight de erro critico

Antes de iniciar a validacao visual, foi identificado um bloqueio de release em `npm audit`:

- `npm audit --omit=dev`: passou com 0 vulnerabilidades.
- `npm audit`: falhou com 2 vulnerabilidades high em dependencia de desenvolvimento (`tsx` -> `esbuild`).
- Correcao aplicada: `npm audit fix` sem `--force`.
- Resultado: `package-lock.json` atualizou `tsx` para `4.22.4` e `esbuild` para `0.28.1`; `npm audit` passou com 0 vulnerabilidades.
- Classificacao: P2 de higiene de release, nao P0/P1 de produto/producao, pois `--omit=dev` ja passava.

## Evidencias

Screenshots salvos em `.planning/evidence/fase-105/screenshots/`:

- `owner-financeiro-desktop.png`
- `owner-agenda-desktop.png`
- `owner-operacao-desktop.png`
- `owner-auditoria-desktop.png`
- `owner-configuracoes-desktop.png`
- `owner-agendamento-link-desktop.png`
- `owner-financeiro-mobile.png`
- `owner-agenda-mobile.png`
- `owner-operacao-mobile.png`
- `owner-configuracoes-mobile.png`
- `owner-agendamento-link-mobile.png`
- `booking-public-mobile.png`
- `recepcao-auditoria-desktop.png`
- `profissional-auditoria-desktop.png`

Console/HTTP check:

- Script: `.planning/evidence/fase-105/cdp-console-check.mjs`.
- Resultado JSON: `.planning/evidence/fase-105/console-check.json`.
- Estados temporarios de navegador com JWT foram removidos apos uso para nao deixar token persistido em arquivo.

## Resultado por modulo

| Modulo | Desktop | Mobile | Observacoes |
|---|---|---|---|
| Financeiro owner | PASSOU | PASSOU | Sem tela quebrada; owner sem console/HTTP error no CDP. |
| Agenda owner | PASSOU | PASSOU | Layout mobile abre e calendario fica usavel; sem erro owner no CDP. |
| PDV owner | PARCIAL | PARCIAL | Mobile tem sobreposicao do botao fixo `Ir para Venda` sobre campos do carrinho. |
| Auditoria owner | PASSOU | NAO TESTADO | Tela abre para owner. |
| Configuracoes owner | PASSOU | PASSOU | Formulario mobile abre sem corte critico. |
| WhatsApp visual | NAO TESTADO | NAO TESTADO | Nao foi implementado WhatsApp real; permanece UI/placeholder. |
| Link de agendamento owner | PASSOU | PASSOU | Tela abre; copiar link depende de interacao manual real. |
| Booking publico/chat | PARCIAL | PASSOU abertura | Chat abre no mobile e `/favicon.ico` nao retorna 401; fluxo completo de dois agendamentos nao foi executado no browser headless. |

## Resultado por perfil

### Owner

Status: PASSOU COM RESSALVAS.

- Financeiro, Agenda, PDV, Auditoria, Configuracoes e Link de Agendamento abriram.
- `cdp-console-check`: 0 console errors e 0 HTTP errors para owner nos modulos testados.
- Smoke API cobriu fluxo operacional completo com sucesso.
- Ressalva: PDV mobile possui sobreposicao visual no carrinho.

### Recepcao

Status: PARCIAL.

- Backend bloqueia corretamente rotas sensiveis:
  - `/audit/events`: 403.
  - `/settings`: 403.
  - `/reports/management/summary`: 403.
- UI ainda mostra itens sensiveis de menu como Auditoria/Financeiro/Configuracoes/Relatorios por causa de helpers visuais hardcoded para owner.
- Ao abrir Auditoria como recepcao, a tela mostra mensagem amigavel, mas o console registra 403 de varios endpoints carregados pelo frontend.
- Classificacao: P2 de UX/RBAC visual. Backend esta correto; menu visual e carregamento eager precisam fase propria.

### Profissional

Status: PARCIAL.

- Backend bloqueia corretamente rotas sensiveis:
  - `/audit/events`: 403.
  - `/settings`: 403.
  - `/reports/management/summary`: 403.
- UI ainda mostra modulos sensiveis e dispara chamadas proibidas.
- `cdp-console-check` registrou 23 HTTP 403 ao abrir Auditoria como profissional.
- Classificacao: P2 de UX/RBAC visual.

## Fluxos obrigatorios

| Fluxo | Status | Evidencia |
|---|---|---|
| Booking publico/chat | PARCIAL | Abertura mobile validada; `/favicon.ico` retornou 204, nao 401. Fluxo manual completo de dois agendamentos nao foi executado no browser. |
| Agenda interna | PASSOU via smoke | Smoke criou, confirmou, iniciou e concluiu atendimento via checkout. |
| Conflito real de agenda | PASSOU via testes/smoke | Suite API cobre conflito de horario para mesmo profissional. |
| PDV | PASSOU via smoke, PARCIAL visual | Smoke registrou venda e devolucao; mobile tem sobreposicao visual no carrinho. |
| Devolucao | PASSOU via smoke | Smoke validou venda, devolucao, financeiro e auditoria. |
| Comissao | PASSOU via testes | `npm run test` e `test:db` cobrem pagamento/controles; tentativa visual por perfil nao foi executada. |
| Financeiro | PASSOU owner, PARCIAL perfis | Owner abre sem erro; recepcao/profissional disparam 403 por menu/carregamento visual indevido. |
| Auditoria | PASSOU backend, PARCIAL visual por perfil | Owner acessa; perfis nao-owner recebem 403 correto, mas menu visual ainda induz acesso. |
| XSS simples | PASSOU automatizado | `tests/frontend-sanitize.spec.ts` passou; teste manual em formulario real nao foi executado nesta rodada. |

## Bugs encontrados

### P2 - Menu visual por perfil diverge do RBAC backend

Arquivos relacionados ja conhecidos:

- `public/components/menu-config.js`
- `public/app.js`

Evidencia:

- `recepcao-auditoria-desktop.png` mostra Auditoria visivel para recepcao.
- `profissional-auditoria-desktop.png` mostra Auditoria visivel para profissional.
- `console-check.json` registra chamadas 403 para endpoints financeiros, settings, auditoria, relatorios e automacoes em perfis nao-owner.

Impacto:

- Backend protege dados sensiveis.
- UX fica enganosa e gera erros vermelhos de console quando perfil nao-owner abre modulo proibido.
- Nao ha vazamento confirmado, mas a experiencia viola o criterio de menu por perfil.

Recomendacao:

- Criar fase pequena para corrigir `state.role`, `getAllowedModulesForRole()` e carregamento lazy/condicional por role.
- Nao mexer no RBAC backend nesta fase.

### P2 - Sobreposicao no PDV mobile

Evidencia:

- `owner-operacao-mobile.png`.

Impacto:

- Botao fixo `Ir para Venda` fica sobre campos do carrinho em viewport 390x844.
- Operacao parece contornavel, mas a usabilidade fica prejudicada.

Recomendacao:

- Ajustar espacamento/posicionamento sticky do atalho no PDV mobile em fase de correcao visual.

### P3 - `renderTechnicalTrace()` continua no-op

Decisao:

- Manter no-op por enquanto.

Racional:

- Auditoria backend persistida continua existindo.
- Restaurar trace agora exigiria decisao de exposicao por perfil.
- Recomendacao futura: restaurar apenas para owner/admin ou criar modo tecnico explicito.

## Validacoes automatizadas

- `git diff --check`: passou.
- `npm run build`: passou.
- `npm run test`: passou (`83 passed | 11 skipped`).
- `npm run test:db`: passou (`11 passed`).
- `npm audit`: passou apos `npm audit fix` sem `--force`.
- `npm audit --omit=dev`: passou.
- `NODE_ENV=development DATA_BACKEND=memory SMOKE_BASE_URL=http://127.0.0.1:3335 npm run smoke:api`: passou.
- `curl -i http://127.0.0.1:3335/favicon.ico`: retornou `204 No Content`, nao 401.

## Decisao final

APROVADO COM RESSALVAS.

Nao ha P0/P1 confirmado apos build, testes, test:db, audit, smoke e validacao visual assistida. A release visual ainda nao deve ser considerada limpa por causa de dois P2:

1. Menu/carregamento visual por perfil diverge do RBAC backend e gera 403 no console para recepcao/profissional.
2. PDV mobile tem sobreposicao de controle no carrinho.

## Proxima etapa recomendada

1. Corrigir menu visual por perfil e carregamento condicional de modulos sensiveis no frontend.
2. Corrigir sobreposicao do PDV mobile.
3. Reexecutar checklist visual 0.11 em desktop/mobile.
4. Depois disso, fazer commit seletivo das fases pendentes; nao usar `git add .`.
5. Somente depois considerar ambiente alvo real / deploy controlado.

## Atualizacao apos Fase 0.11.1

Documento: `.planning/106_CORRECAO_P2_VISUAL_MENU_PDV_MOBILE.md`.

Status dos P2:

- Menu visual por perfil: corrigido localmente. Recepcao ve `Agenda`, `PDV` e `Clientes`; profissional ve `Agenda` e `Clientes`; owner mantem modulos administrativos.
- Carregamento condicional: `loadAll()` nao chama mais loaders de modulos ocultos para o perfil atual.
- PDV mobile: botao flutuante `Ir para Venda` foi ocultado; acao de cobranca permanece no carrinho.
- Validacoes passaram: build, test, test:db, audit, audit omit dev, diff check, smoke dev isolado e Playwright DOM/mobile.

Decisao da Fase 0.11.1: aprovado com ressalvas por falta de dispositivo fisico real e necessidade de commit seletivo.
