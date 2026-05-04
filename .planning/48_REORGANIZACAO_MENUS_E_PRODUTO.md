# Reorganizacao de Menus e Produto

Data: 2026-04-29
Responsavel: CTO/PM (execucao assistida)

## Objetivo
Simplificar o sistema para ser entendivel em menos de 30 segundos, sem perder funcionalidades criticas.

## Auditoria Atual (antes do ajuste)
- Menu estava desbalanceado: `Operacao` tinha apenas Agenda e PDV, enquanto itens operacionais (Clientes/Servicos/Estoque) estavam espalhados.
- `Dashboard` nao estava no menu principal mesmo com tela pronta.
- `Configuracoes` existia como modulo completo, mas fora da arquitetura de produto proposta.
- Modulos avancados coexistiam com modulos core no codigo, sem separacao clara de maturidade.
- Duplicidade percebida no dominio de agenda: arquivos `agenda.js`, `agendamento.js` e `agendamentos.js` com responsabilidades complementares, mas nomenclatura confusa.

## Auditoria de Rotas e Paginas
Frontend (secoes implementadas em `public/index.html`):
- Dashboard, Agenda, PDV/Operacao, Financeiro, Estoque, Clientes, Profissionais, Servicos, Comissoes, Fidelizacao, Automacoes, Metas, Configuracoes.

Backend (rotas em `src/http/app.ts`):
- Core operacional: agenda, appointments, sales/catalog/inventory, clients, services.
- Gestao: dashboard, financial, professionals, commissions, goals/performance, settings.
- Avancado: loyalty, packages, subscriptions, automations, retention, integrations, billing, multiunit.

Conclusao: backend continua suportando todos os blocos sem necessidade de remocao.

## Duplicidades Identificadas
- Agenda vs Agendamentos: existe duplicidade de nomenclatura, nao de regra de negocio.
- Decisao: manter uma entrada unica no menu chamada `Agenda`, concentrando criacao e acompanhamento de atendimentos.
- Acao futura recomendada: renomear internamente os arquivos para padrao unico (`agenda-*`) sem alterar comportamento.

## Nova Arquitetura de Produto (aplicada no menu)
### OPERACAO
- Agenda
- PDV (Produtos)
- Clientes
- Servicos
- Estoque

### GESTAO
- Dashboard
- Financeiro
- Profissionais
- Comissoes

### ADMINISTRACAO
- Configuracoes

### AVANCADO
- Fidelizacao
- Automacoes
- Relatorios (placeholder para fase futura)

## Decisoes de UX/Produto
- Menu principal exibe apenas essencial por grupo e linguagem direta.
- Dashboard permanece simples e de decisao rapida (KPIs + alertas + insights).
- PDV mantido explicitamente para venda de produtos.
- Financeiro mantido como visao consolidada gerencial.
- Funcionalidades avancadas ficam agrupadas em `Avancado`.

## Mudancas Tecnicas Realizadas
Arquivo ajustado:
- `public/components/menu-config.js`

Principais mudancas:
- Reestruturacao de `MENU_GROUPS` para 4 blocos (Operacao, Gestao, Administracao, Avancado).
- Inclusao de `dashboard` e `configuracoes` no fluxo principal.
- Inclusao de `relatorios` no grupo Avancado como modulo de fase futura (fallback em placeholder).
- Ajuste de abas mobile para linguagem mais objetiva (`PDV`).
- Reorganizacao de `SECONDARY_MODULE_IDS` para refletir priorizacao mobile.

## Risco e Mitigacao
- Risco: modulo `relatorios` ainda sem secao dedicada.
- Mitigacao: sistema usa `placeholderSection` automaticamente, sem quebrar navegacao.

## Criterio de sucesso
- Usuario novo identifica em <30 segundos:
  - Onde atender (Agenda)
  - Onde vender produto (PDV)
  - Onde ver numeros (Dashboard/Financeiro)
  - Onde configurar negocio (Configuracoes)
  - Onde ficam recursos avancados (Avancado)
