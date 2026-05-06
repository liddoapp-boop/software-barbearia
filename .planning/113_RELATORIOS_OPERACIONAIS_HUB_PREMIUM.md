# Fase 1.13 - Relatorios operacionais em hub premium

Data: 2026-05-05
Decisao final: aprovado com ressalvas

## Resumo executivo

A aba Relatorios deixou de ser placeholder e virou um hub premium de consultas gerenciais por periodo. A implementacao e prioritariamente frontend/UX, reaproveita endpoints existentes e nao altera backend, Prisma, regras financeiras, agenda, venda, estoque, comissao, auditoria, permissoes, tenant guard ou idempotencia.

## Objetivo da fase

Separar a leitura historica/fechada por periodo da decisao rapida do Dashboard. O fluxo criado segue: escolher tipo de relatorio, escolher periodo, ver resumo, ver detalhes e baixar CSV simples quando ha linhas renderizadas.

## Dashboard vs Relatorios

- Dashboard: decisao rapida do dia, prioridades e sinais imediatos.
- Relatorios: conferencia por periodo, historico operacional, resumo gerencial e base para exportacao futura.

## Relatorios criados

- Financeiro.
- Atendimentos.
- Vendas de produtos.
- Estoque.
- Clientes.
- Comissoes.
- Profissionais.
- Auditoria.

## Dados usados por relatorio

- Financeiro: `/financial/summary`, `/financial/transactions`, `/financial/commissions`, `/financial/reports` e `/financial/management/overview`.
- Atendimentos: `/appointments`.
- Vendas de produtos: `/sales/products`.
- Estoque: `/inventory` com estado atual, sugestoes e movimentacoes recentes quando disponiveis.
- Clientes: `/clients/overview`.
- Comissoes: `/financial/commissions`.
- Profissionais: `/professionals/performance`.
- Auditoria: `/audit/events`.

## Relatorios completos

- Financeiro: entradas, saidas, saldo, resultado, receita de servicos, receita de produtos, comissoes pagas, estornos/devolucoes e lancamentos manuais.
- Atendimentos: total, status principais, servicos mais realizados e profissionais com mais atendimentos quando a lista de agendamentos responde.
- Vendas de produtos: receita, quantidade de vendas, devolucoes, ticket medio e produtos mais vendidos.
- Clientes: ativos, risco, inativos, VIPs, potencial de reativacao, ticket medio e clientes para acao comercial.
- Comissoes: pendente, pago no periodo, total por profissional, comissoes antigas e impacto financeiro do pagamento.

## Relatorios parciais

- Estoque: parcial porque o endpoint atual e mais forte para estado atual do estoque do que para historico fechado por periodo.
- Profissionais: parcial porque ocupacao, ticket e comissao pendente dependem dos campos ja retornados pelo endpoint de desempenho.
- Auditoria: parcial por desenho; a superficie mostra somente resumo, mantendo o detalhe tecnico completo na tela Auditoria.

## Limitacoes conhecidas

- Nao ha endpoint dedicado de relatorios agregados; o frontend compoe o hub a partir de endpoints existentes.
- Estoque nao possui recorte historico completo por periodo na superficie atual.
- Exportacao e CSV simples frontend, nao PDF/Excel.
- Se uma fonte falhar, a tela mostra estado parcial honesto em vez de inventar dados.

## Comportamento mobile

- Cards do hub empilham.
- Filtro de periodo permanece simples.
- Resumos viram cards.
- Detalhes ficam em `details` recolhiveis.
- Linhas de detalhe viram cards em uma coluna.

## Exportacao

Foi implementada exportacao CSV simples no frontend para o relatorio aberto quando ha linhas renderizadas. O CSV evita IDs tecnicos e exporta apenas titulo, descricao, valor e observacao operacional.

## Arquivos alterados

- `public/index.html`
- `public/app.js`
- `public/styles/layout.css`
- `public/modules/relatorios.js`
- `.planning/113_RELATORIOS_OPERACIONAIS_HUB_PREMIUM.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Riscos

- `public/app.js` segue grande e o bundle de relatorios aumenta a responsabilidade central desse arquivo.
- Relatorios compostos no frontend podem divergir de um futuro motor oficial de BI se o backend evoluir sem contrato dedicado.
- Alguns endpoints podem retornar formatos opcionais; o modulo trata ausencias com fallback parcial.

## Criterios de aceite

- Aba Relatorios abre modulo real.
- Hub premium com oito cards de relatorio.
- Filtro global com Hoje, Semana, Mes e Periodo personalizado.
- Financeiro, Atendimentos, Estoque, Clientes e Comissoes exibem dados uteis ou estados parciais honestos.
- IDs tecnicos, JSON, `idempotencyKey`, `referenceId` e payloads nao aparecem na superficie principal.
- Visual segue a Fase 1.12.
- Mobile nao depende de tabela gigante.
- Build e testes obrigatorios executados.

## Validacoes executadas

- `npm.cmd run build`: passou.
- `npm.cmd run test`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox (`63 passed | 10 skipped`).
- `npm.cmd run smoke:api`: passou.
- `npm.cmd run test:db`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox (`10 passed`).
- Sintaxe ES module dos arquivos alterados: passou com `Get-Content ... | node --input-type=module --check` para `public/app.js` e `public/modules/relatorios.js`.
- Abertura da aba Relatorios no menu: validada por codigo em `menu-config.js`, `index.html` e `sectionsByModule`.
- Troca entre tipos de relatorio: validada por codigo via `[data-report-open]` e estado `activeReportId`.
- Filtro de periodo: validado por codigo via `reportsPeriod`, datas customizadas e `loadReportsBundle`.
- Responsividade basica: validada por CSS em breakpoints `1024px` e `720px`; validacao visual humana/browser ainda recomendada.

## Proxima fase recomendada

Fase 1.14 - Contrato backend de relatorios gerenciais e exportacao profissional. Criar endpoint dedicado para agregacoes por periodo, historico de estoque filtravel, auditoria resumida por severidade e exportacao server-side quando houver necessidade real de PDF/Excel.
