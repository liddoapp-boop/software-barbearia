# Fase 0.12 - Validacao visual em dispositivo fisico real

Data: 2026-06-14
Responsabilidade: CTO, QA Engineer, Product Engineer e Release Manager
Status: BLOQUEADO PARA APROVACAO FISICA

## Atualizacao posterior - Fase 0.12.1

Data: 2026-06-14

Durante a execucao da Fase 0.12.1, foi corrigido o overflow horizontal geral do painel interno mobile identificado na validacao em celular real.

Resumo da correcao:
- Documento da fase: `.planning/108_CORRECAO_OVERFLOW_MOBILE_PAINEL_INTERNO.md`.
- Escopo: painel interno/dashboard autenticado, incluindo Dashboard, Agenda, PDV, Financeiro e menu mobile.
- Booking publico: nao foi alterado.
- Causa tecnica tratada: shell mobile e componentes internos sem contenção final consistente, drawer de agendamento fechado traduzido para fora da viewport sem clipping explicito e agenda semanal larga precisando rolar apenas dentro do proprio container.
- Resultado CDP em viewport `390x844`: `scrollWidth=390` em Dashboard, Agenda, PDV, Financeiro e Dashboard com menu mobile aberto.
- Validacoes obrigatorias da Fase 0.12.1 passaram: build, test, test:db, audits, diff check e smoke dev isolado.

Esta atualizacao nao substitui a validacao fisica real. O checklist abaixo continua necessario no aparelho onde o problema foi observado, agora focando confirmar que o painel interno nao arrasta mais lateralmente.

## Objetivo

Validar o produto em celular fisico real antes de qualquer decisao de release/deploy, cobrindo fluxos publicos e autenticados depois das correcoes da Fase 0.11.1.

Esta fase nao implementa feature, nao altera regra financeira, nao muda RBAC backend, nao executa seed, nao executa migration destrutiva, nao faz deploy, nao faz commit e nao faz push.

## Baseline Git inicial

Comandos obrigatorios executados antes da fase:

```bash
git status --short
git status -sb
git log --oneline -12
git diff --stat
git diff --name-only
```

Resumo:

- Branch: `main`.
- Tracking: `main...origin/main [ahead 6]`.
- Behind: nenhum indicador de behind no `git status -sb`.
- `.env`: nao apareceu no status.
- `test-results/.last-run.json`: presente por meio do diretorio untracked `test-results/`; nao deve ser commitado.
- Fase 0.11.1: pendente no working tree, com `.planning/106_CORRECAO_P2_VISUAL_MENU_PDV_MOBILE.md` untracked e alteracoes de codigo/documentacao ainda nao commitadas.

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
.planning/evidence/fase-105/
.planning/evidence/fase-106/
test-results/
tests/frontend-menu-config.spec.ts
```

Ultimos commits locais:

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

## Escopo validado tecnicamente

Servidor dev isolado iniciado para preparar o acesso por celular:

```bash
PORT=3335 NODE_ENV=development DATA_BACKEND=memory npx tsx src/server.ts
```

URLs candidatas para abrir no dispositivo fisico:

```text
http://76.13.161.250:3335/
http://76.13.161.250:3335/booking.html
```

Health checks executados do ambiente atual:

```text
http://127.0.0.1:3335/health -> HTTP 200
http://76.13.161.250:3335/health -> HTTP 200
```

Observacao: o HTTP 200 no IP publico/local confirma que o processo respondeu a partir deste ambiente, mas nao substitui teste em celular fisico real com toque, teclado virtual, viewport real e rede do aparelho.

## Checklist fisico real

Resultado geral: NAO EXECUTADO neste ambiente. A sessao nao tem acesso a um celular fisico, camera, navegador movel real, toque real ou DevTools remoto do aparelho. Portanto, nenhum item abaixo pode ser marcado como aprovado por mim.

### Booking publico

- Abrir `/booking.html` no celular fisico: NAO TESTADO.
- Verificar carregamento inicial sem layout quebrado: NAO TESTADO.
- Selecionar servico, profissional, data e horario: NAO TESTADO.
- Preencher nome/telefone/observacao com teclado virtual: NAO TESTADO.
- Criar agendamento completo: NAO TESTADO.
- Testar payload XSS em campos textuais e confirmar que nao renderiza HTML/script: NAO TESTADO.
- Confirmar ausencia de erro visivel e console limpo no dispositivo: NAO TESTADO.

### Login e perfis

- Login owner/admin em celular fisico: NAO TESTADO.
- Login recepcao em celular fisico: NAO TESTADO.
- Login profissional em celular fisico: NAO TESTADO.
- Troca de perfil/sessao sem vazamento de menu anterior: NAO TESTADO.
- Teclado virtual sem cobrir botoes de login: NAO TESTADO.

### Agenda

- Abrir Agenda como owner/admin: NAO TESTADO.
- Abrir Agenda como recepcao: NAO TESTADO.
- Abrir Agenda como profissional: NAO TESTADO.
- Navegar datas e filtros no viewport real: NAO TESTADO.
- Criar/alterar status de atendimento: NAO TESTADO.
- Confirmar que elementos clicaveis nao ficam sobrepostos: NAO TESTADO.

### PDV

- Abrir PDV em celular fisico: NAO TESTADO.
- Adicionar produto/servico ao carrinho: NAO TESTADO.
- Confirmar que o atalho flutuante removido nao cobre o carrinho: NAO TESTADO.
- Finalizar venda pelo botao real do carrinho: NAO TESTADO.
- Testar estorno/devolucao quando aplicavel: NAO TESTADO.
- Confirmar totalizacao e campos sem corte visual: NAO TESTADO.

### Financeiro

- Abrir Financeiro como owner/admin: NAO TESTADO.
- Confirmar bloqueio visual/ausencia de menu para perfis sem permissao: NAO TESTADO.
- Navegar filtros, cards, tabelas e exportacao em tela pequena: NAO TESTADO.
- Confirmar que valores nao ficam cortados ou sobrepostos: NAO TESTADO.

### Configuracoes

- Abrir Configuracoes como owner/admin: NAO TESTADO.
- Confirmar ausencia de Configuracoes no menu de recepcao/profissional: NAO TESTADO.
- Editar campos sem teclado virtual quebrar layout: NAO TESTADO.
- Verificar botoes, tabs e formularios em tela real: NAO TESTADO.

### Auditoria

- Abrir Auditoria/relatorios gerenciais como owner/admin: NAO TESTADO.
- Confirmar bloqueio para recepcao/profissional: NAO TESTADO.
- Verificar filtros e tabela em mobile real: NAO TESTADO.
- Confirmar exportacao/acao sem erro visual: NAO TESTADO.

### Sidebar e menu

- Abrir/fechar sidebar por toque: NAO TESTADO.
- Confirmar matriz visual da Fase 0.11.1 no celular real: NAO TESTADO.
- Confirmar area de toque dos itens: NAO TESTADO.
- Confirmar menu de conta sem itens indevidos por perfil: NAO TESTADO.
- Confirmar que nao existe scroll lateral indevido: NAO TESTADO.

### XSS, localStorage e console

- Testar strings XSS nos campos publicos/autenticados: NAO TESTADO.
- Confirmar que conteudo e escapado no DOM em celular real: NAO TESTADO.
- Confirmar que console do navegador movel nao tem erros: NAO TESTADO.
- Confirmar comportamento de logout/limpeza de sessao em celular real: NAO TESTADO.

## Validacao automatizada executada

Comandos executados apos a preparacao da fase:

```bash
npm run build
npm run test
npm run test:db
npm audit
npm audit --omit=dev
git diff --check
NODE_ENV=development DATA_BACKEND=memory SMOKE_BASE_URL=http://127.0.0.1:3335 npm run smoke:api
```

Resultados:

- `npm run build`: passou.
- `npm run test`: passou (`5 passed | 1 skipped`, `86 passed | 11 skipped`).
- `npm run test:db`: passou (`1 passed`, `11 passed`).
- `npm audit`: passou com 0 vulnerabilidades.
- `npm audit --omit=dev`: passou com 0 vulnerabilidades.
- `git diff --check`: passou.
- Smoke API dev isolado: passou.

Smoke API:

```text
SMOKE TEST CONCLUIDO COM SUCESSO
Agendamento testado: 622584b0-85a6-4842-b758-a67d7df39bd5
Venda testada: 1aeecd4d-e91d-4ae7-a280-4d871ea5787b
Refund testado: cc29307d-c333-4bc0-ba37-aba0865d1b74
```

## Bugs criticos encontrados

Nenhum P0/P1 novo foi confirmado por validacao automatizada nesta fase.

Entretanto, a validacao fisica real nao foi executada. Logo, nao existe evidencia suficiente para declarar release visual aprovado em celular fisico.

## Decisao de release

Decisao: BLOQUEADO PARA APROVACAO FISICA.

Motivo: o ambiente atual conseguiu preparar o servidor, confirmar health check e executar validacoes automatizadas, mas nao consegue operar um dispositivo fisico real. Aprovar esta fase sem evidencia do aparelho seria uma falsa validacao.

## Proxima acao obrigatoria

Em um celular fisico real, abrir:

```text
http://76.13.161.250:3335/
http://76.13.161.250:3335/booking.html
```

Executar o checklist acima, registrar modelo do aparelho, navegador, rede, prints/evidencias e resultado por perfil. Depois disso, atualizar este documento para `APROVADO`, `APROVADO COM RESSALVAS` ou `BLOQUEADO` com base nas evidencias reais.
