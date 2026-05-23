# MASTER PLAN ULTRA DETALHADO - REFATORACAO TOTAL DO DESIGN SYSTEM

Status: V2 completa (expandida por tela, componente, risco e QA).
Ultima atualizacao: 2026-05-20.
Escopo: 100% do frontend (interno + publico) com padronizacao visual total baseada no design system de referencia.

---

## 0. Objetivo Executivo
Refatorar TODO o sistema visual para um design system unico, limpo, profissional e consistente, cobrindo:
- todas as telas
- todos os componentes
- todos os estados
- todos os breakpoints
- tema claro e escuro
- motion padronizado
- rollout sem quebra de fluxo operacional

Resultado esperado:
1. Aparencia premium e consistente end-to-end.
2. Experiencia previsivel para usuario final e time interno.
3. Reducao forte de regressao visual e de custo de manutencao de UI.
4. Base escalavel para novas features sem virar "CSS legado" novamente.

---

## 1. Fontes Oficiais de Referencia

### 1.1 Design System de referencia (fonte da verdade visual)
- `/design system/DESIGN.md`
- `/design system/preview.html`
- `/design system/preview-dark.html`

### 1.2 Sistema atual (alvo da migracao)
- `/public/index.html`
- `/public/app.js`
- `/public/modules/*.js`
- `/public/components/*.js`
- `/public/styles/layout.css`
- `/public/styles.css`
- `/public/booking.html`
- `/public/login.html`

---

## 2. Decisao Arquitetural de Motion (Gate Obrigatorio)

Framer Motion exige React. Frontend atual e HTML/CSS/JS vanilla.

### Opcoes
1. Opcao A (recomendada para inicio imediato): Motion tokenizado em CSS + WAAPI/Motion One.
2. Opcao B (Framer Motion real): Migracao progressiva para React e adocao oficial de Framer Motion.

### Regra
Nenhuma fase de motion comeca sem aprovacao formal da opcao A ou B.

---

## 3. Escopo Absoluto de Cobertura (Nada fica fora)

### 3.1 Telas e modulos
1. `login.html`
2. `booking.html` (publico)
3. `dashboardSection`
4. `agendaSection`
5. `agendaListMode`
6. `scheduleDrawer`
7. `appointmentDrawerHost`
8. `operationSection` (PDV + estoque operacional)
9. `financeiroSection`
10. `estoqueSection`
11. `clientsSection`
12. `professionalsSection`
13. `servicesSection`
14. `commissionsSection`
15. `auditSection`
16. `fidelizacaoSection`
17. `automacoesSection`
18. `metasSection`
19. `settingsSection`
20. `reportsSection`
21. `whatsappSection`
22. `agendamento-linkSection`

### 3.2 Estruturas compartilhadas
- Sidebar
- Mobile tabs
- Header/page hero
- Filter bars
- Card system
- Table/list system
- Status chips
- Empty states
- Feedback banners
- Drawers/modals
- Form primitives
- CTA primitives

### 3.3 Estados obrigatorios para cada area
- loading
- empty
- error
- success
- disabled
- active/selected
- hover/focus/pressed
- overlay open/close
- variacao por role (owner/recepcao/profissional)
- tema light
- tema dark
- desktop
- tablet
- mobile

### 3.4 Matriz unica de navegacao e permissoes (obrigatoria)
Antes de refatorar qualquer dominio, manter matriz unica validada em CI com:
1. `sectionsByModule` (render real)
2. `MENU_GROUPS` (navegacao exibida)
3. `ROLE_ACCESS` (permissoes por role)
4. `SECONDARY_MODULE_IDS` e rotas secundarias

Regras:
1. nenhuma tela implementada pode ficar sem rota navegavel
2. nenhuma permissao de role pode apontar para modulo invisivel/inacessivel
3. divergencia bloqueia merge ate correção

---

## 4. Matriz de Rastreabilidade por Tela (arquivo + componentes + fluxos)

## 4.1 Login
- Arquivo: `/public/login.html`
- Objetos: formulario de auth, feedback de erro, estado de submit.
- Fluxos criticos: login valido/invalido, expiracao de sessao.

## 4.2 Booking Publico
- Arquivo: `/public/booking.html`
- Objetos: fluxo conversacional, cards de servico, slots, confirmacao.
- Fluxos criticos: escolher servico, escolher horario, validar horario comercial, criar booking.

## 4.3 Dashboard
- HTML: `dashboardSection`
- Modulo: `/public/modules/dashboard.js`
- Componentes: KPI cards, alert list, toplists, sugestoes, action cards.
- Fluxos criticos: render principal, acao de sugestao, tratamento de erro.

## 4.4 Agenda Operacional
- HTML: `agendaSection`, `agendaListMode`, `scheduleDrawer`, `appointmentDrawerHost`
- Modulos: `/public/modules/agenda.js`, `/public/modules/agendamento.js`, `/public/modules/agendamentos.js`
- Fluxos criticos: semana/lista, abrir detalhe, cancelar, criar novo, filtros, sincronizacao imediata.

## 4.5 Operacao/PDV
- HTML: `operationSection`
- Modulo: `/public/modules/pdv.js` + orquestracao em `/public/app.js`
- Fluxos criticos: adicionar item, fechar venda, limpar carrinho, vincular cliente/profissional.

## 4.6 Financeiro
- HTML: `financeiroSection`
- Modulo: `/public/modules/financeiro.js`
- Fluxos criticos: resumo, lista de lancamentos, criar/editar lancamento, filtros.

## 4.7 Estoque
- HTML: `estoqueSection`
- Modulo: `/public/modules/estoque.js`
- Fluxos criticos: tabela/lista mobile, detalhes produto, ajuste de estoque.

## 4.8 Clientes
- HTML: `clientsSection`
- Modulo: `/public/modules/clientes.js`
- Fluxos criticos: overview, fila de atencao, drawer de cliente.

## 4.9 Profissionais
- HTML: `professionalsSection`
- Modulo: `/public/modules/profissionais.js`
- Fluxos criticos: ranking, performance, detalhe profissional.

## 4.10 Servicos
- HTML: `servicesSection`
- Modulo: `/public/modules/servicos.js`
- Fluxos criticos: catalogo de servicos, consumo de estoque, detalhe.

## 4.11 Comissoes
- HTML: `commissionsSection`
- Modulo: `/public/modules/comissoes.js`
- Fluxos criticos: fila de pagamento, detalhe de comissao, acao de pagar.

## 4.12 Auditoria
- HTML: `auditSection`
- Modulo: `/public/modules/auditoria.js`
- Fluxos criticos: timeline, filtros, drawer de evento.

## 4.13 Fidelizacao
- HTML: `fidelizacaoSection`
- Modulo: `/public/modules/fidelizacao.js`
- Fluxos criticos: cards de plano/assinatura/indicadores.

## 4.14 Automações
- HTML: `automacoesSection`
- Modulo: `/public/modules/automacoes.js`
- Fluxos criticos: lista de automacoes, status, filtros de risco/provedor.

## 4.15 Metas
- HTML: `metasSection`
- Modulo: `/public/modules/metas.js`
- Fluxos criticos: resumo de metas, ranking, modal criar/editar meta.

## 4.16 Configuracoes
- HTML: `settingsSection`
- Modulo: `/public/modules/configuracoes.js`
- Fluxos criticos: hub de secoes, drawers por secao, salvar horarios, pagamentos, comissoes, equipe.

## 4.17 Relatorios
- HTML: `reportsSection`
- Modulo: `/public/modules/relatorios.js`
- Fluxos criticos: hub de relatorio, render por categoria, filtros e exportacao.

## 4.18 WhatsApp
- HTML: `whatsappSection`
- Componente: `/public/components/whatsapp.js`
- Fluxos criticos: status conexao, connect/disconnect, mensagens/estado.

## 4.19 Link de Agendamento
- HTML: `agendamento-linkSection`
- Fluxos criticos: exibir link, copiar, abrir.

---

## 5. Inventario Completo de Componentes (Padronizacao obrigatoria)

## 5.1 Componentes de infraestrutura
1. `renderPageHeader`
2. `renderPrimaryAction`
3. `renderFilterBar` + `bindFilterBars`
4. `renderEmptyState`
5. `renderStatusChip`
6. `renderTechnicalTrace`
7. `renderEntityDrawer` + `bindEntityDrawers`
8. Sidebar renderer
9. Mobile tabs renderer
10. Topbar renderer (`topbar.js`) com decisao explicita:
- incorporar no shell DS
- ou remover como componente orfao

## 5.2 Primitives visuais a consolidar
- Button family
- Input family
- Select family
- Textarea
- Date/time input
- Form row/label/helper/error
- Card family
- Badge/chip/status
- Table family
- Overlay family (drawer/modal)
- Feedback family (inline/banner/toast)
- Skeleton family

## 5.3 Contrato de cada componente (obrigatorio)
Cada componente padrao deve definir:
1. tokens aceitos
2. variantes suportadas
3. estados suportados
4. comportamento responsivo
5. comportamento em tema light/dark
6. comportamento de foco e teclado
7. exemplo de uso por modulo

---

## 6. Arquitetura-Alvo do Design System

## 6.1 Camada de tokens
Criar `/public/styles/tokens.css` com:
- `--ref-*` (primitivos)
- `--sys-*` (semanticos)
- `--cmp-*` (componentes)

### 6.1.1 Tokens minimos
- color: surfaces, text, border, semantic
- typography: family, size, line-height, weight
- spacing: escala unica
- radius: escala unica
- shadow: escala unica
- z-index: escala unica
- motion: duration/easing/delay

### 6.1.2 Regras
1. nenhuma cor hardcoded fora de tokens
2. nenhuma fonte avulsa fora de tokens
3. nenhum spacing avulso em componentes core

### 6.1.3 Governanca de tokens (enterprise)
1. fonte da verdade unica de tokens (arquivo fonte + outputs gerados)
2. ownership formal por papel:
- Design System Owner
- Frontend Owner
- QA A11y Owner
3. versionamento semantico de tokens (MAJOR/MINOR/PATCH) com changelog por release
4. politica de deprecacao:
- token marcado como `deprecated` por 2 releases antes da remocao
5. CI gates obrigatorios:
- bloquear hardcode de cor/tipografia/spacing em componentes core
- bloquear token inexistente ou fora do namespace permitido
- bloquear uso direto de `--ref-*` fora da camada semantica
6. toda mudanca breaking em token exige plano de migracao + rollback

### 6.1.4 Naming semantico (obrigatorio)
1. padrao global: `--sys-{categoria}-{papel}-{estado}`
2. padrao de componente: `--cmp-{componente}-{slot}-{estado}`
3. proibido naming por valor visual na camada semantica (`--blue-500`, `--large-radius`)
4. proibido naming por contexto de tela (token deve ser reutilizavel)
5. glossario unico pt-BR negocio + termos tecnicos para evitar sinonimos

## 6.2 Theming
- `:root[data-theme="light"]`
- `:root[data-theme="dark"]`
- aliases legados temporarios durante migracao
- persistencia de tema no cliente

## 6.3 Tipografia
- tokens para display/title/body/caption
- padronizar h1/h2/h3, labels, tabelas, botoes

## 6.4 Layout e grid
- container widths
- spacing vertical por secao
- regras de breakpoints unificadas

## 6.5 Motion
- padrao de entrada/saida de overlay
- padrao hover/focus/press
- reduced motion
- limitar animacoes core a `transform` e `opacity`
- vedar animacao continua de propriedades custosas (`width`, `height`, `top`, `left`, `box-shadow`)
- tokens por intencao: `emphasized`, `productive`, `subtle`, `none`
- budget de jank por fluxo critico (sem quedas perceptiveis)

## 6.6 Acessibilidade (WCAG 2.2 AA)
1. meta formal: conformidade WCAG 2.2 AA para telas internas e publicas
2. contraste minimo:
- texto normal 4.5:1
- texto grande 3:1
- componentes/estados visuais 3:1
3. navegacao por teclado completa (sem trap de foco)
4. foco visivel persistente (inclusive overlays e sticky headers)
5. alvo de toque consistente com WCAG 2.2
6. semantica nativa/ARIA correta em componentes interativos
7. mensagens de erro/sucesso legiveis por tecnologia assistiva
8. gate de QA com automacao + checklist manual

## 6.7 i18n/l10n (pt-BR first)
1. locale default `pt-BR`
2. fallback controlado para `en` apenas em copy tecnica
3. proibido hardcode de strings em componentes core e modulos migrados
4. formatacao de data/hora/moeda/numero via `Intl` (`pt-BR` + timezone da conta)
5. padrao de chaves por dominio (`{dominio}.{componente}.{mensagem}`)
6. pseudo-locale para QA de truncamento/overflow

## 6.8 Performance Budget de UI
1. budget por release:
- CSS global
- JS por rota
- imagens criticas
- fontes web
2. limites de CWV por fluxo principal:
- LCP
- INP
- CLS
3. budget especifico de motion
4. gate de CI bloqueando release acima do budget
5. registro formal de excecao quando houver quebra temporaria

---

## 7. Plano de Execucao por Fase (Muito detalhado)

## Fase 0 - Baseline, Governanca e Anti-Quebra
1. Capturar baseline visual por tela/estado/dispositivo.
2. Mapear todos os seletores criticos do DOM.
3. Congelar contratos de API usados na UI.
4. Criar matriz de risco por dominio.
5. Definir criteria de rollback por release.
6. Definir baseline WCAG 2.2 AA por fluxo critico.
7. Definir performance budget inicial e metodo de medicao.
8. Definir glossario de naming semantico + i18n.
9. Definir metodo de score de risco: `Probabilidade x Impacto x Detectabilidade`.

Entregaveis:
- baseline screenshots
- mapa DOM critico
- contrato API v1 congelado
- matriz de risco
- baseline a11y (WCAG 2.2 AA)
- baseline performance (CWV + peso de assets)
- contrato de governanca de tokens
- score de risco por modulo com owner

## Fase 1 - Foundation DS
1. Criar `tokens.css`.
2. Implementar tema light/dark global.
3. Introduzir aliases legados para compatibilidade.
4. Aplicar foundation no shell global.
5. Implementar lint/gates de tokens e hardcode.
6. Publicar guia de naming semantico.
7. Definir owners de tokens e ciclo de vida de deprecacao.

Entregaveis:
- tokens ativos
- theme switch ativo
- shell padronizado

## Fase 2 - Biblioteca de componentes base
1. Buttons
2. Inputs/selects/time
3. Cards e KPI cards
4. Badges/chips/status
5. Empty/error/loading states
6. Filter bars
7. Drawers/modals
8. Tables + fallback mobile

Entregaveis:
- catalogo componentizado
- substituicao dos padroes mais duplicados

## Fase 3 - Migracao por dominios (ordem obrigatoria)
1. Agenda (modulo mais sensivel)
2. Configuracoes
3. Dashboard
4. Operacao/PDV
5. Financeiro
6. Estoque
7. Clientes
8. Profissionais
9. Servicos
10. Comissoes
11. Relatorios
12. Auditoria
13. Fidelizacao
14. Automacoes
15. Metas
16. WhatsApp
17. Agendamento-link
18. Login
19. Booking publico

Entregaveis:
- checklist de cada dominio assinado

## Fase 4 - Responsividade total
1. validar todos os breakpoints
2. ajustar tabelas para fallback mobile
3. corrigir overflows horizontais
4. otimizar toque e espacamento

## Fase 5 - Motion e polimento
1. aplicar motion system
2. ajustar perfis de animacao por contexto
3. reduced motion
4. validar budget de motion nos dispositivos alvo

## Fase 6 - QA final e cleanup
1. regressao visual completa
2. regressao funcional completa
3. remover CSS legado obsoleto
4. release final com plano de rollback
5. auditoria WCAG 2.2 AA assinada
6. auditoria de performance budget assinada
7. handoff operacional do design system para o time

---

## 8. Plano Detalhado por Tela (Execucao e QA)

## 8.1 login.html
### Escopo
- padronizar formulario, erro, submit/loading
### Refatorar
- hierarchy tipografica
- espacamento padrao
- botoes e inputs no core
### QA
- erro credencial
- submit duplo bloqueado
- foco teclado
- dark/light
- mobile

## 8.2 booking.html
### Escopo
- migrar para tokens DS sem perder identidade conversacional
### Refatorar
- bubble/chat primitives
- cards de servico
- lista de horarios
- confirmacao
### QA
- fluxo completo sem quebra
- horario fora expediente com feedback correto
- dark/light
- mobile first

## 8.3 dashboardSection
### Escopo
- unificar KPI cards, strips e listas
### Refatorar
- card family unica
- headings e metric labels
- feedback loading/empty/error
### QA
- dashboard com dados
- sem dados
- erro parcial
- ações de sugestao

## 8.4 agendaSection + lista + drawers
### Escopo
- semana/lista/detalhe/novo agendamento
- checkout de atendimento
- estorno de atendimento
- transicao de status com feedback imediato
### Refatorar
- calendario semanal padronizado
- cards de agendamento padrao
- filtros padrao
- drawer e detalhe padrao
### QA
- cancelar atualiza instantaneo
- vaga liberada em booking
- filtros
- mobile vs desktop
- estados vazio/erro
- checkout com sucesso e com erro
- estorno com sucesso e com erro
- idempotencia visual (duplo clique nao duplica acao)

## 8.5 operationSection (PDV)
### Escopo
- tabs venda/estoque operacional
- devolucao de produto
### Refatorar
- formularios PDV
- carrinho
- feedback de venda
### QA
- add/remove item
- clear cart
- finalizar venda
- erro API
- devolucao parcial/total
- erro de estoque insuficiente

## 8.6 financeiroSection
### Escopo
- resumo financeiro, lista e modal de lancamento
- drawer transacional e exclusao de lancamento
### Refatorar
- cards de resumo
- tabela/lista responsiva
- modal padronizado
### QA
- create/update lancamento
- delete lancamento
- filtros periodo/tipo
- loading/empty/error
- confirmacao de exclusao + rollback visual em erro

## 8.7 estoqueSection
### Escopo
- resumo, lista, detalhe e CRUD completo de produto
### Refatorar
- tabela -> fallback mobile
- chips de estoque critico
### QA
- criar produto
- editar produto
- excluir produto com confirmacao
- ajuste de estoque
- visual de criticidade
- overflow mobile
- movimentacoes IN/OUT/ADJUSTMENT

## 8.8 clientsSection
### Escopo
- cards/lista de clientes + drawer + criacao
### Refatorar
- card de cliente padronizado
- chips de tag/status
### QA
- fila de atencao
- drawer cliente
- empty/error
- criar cliente com validacao de telefone
- acao WhatsApp (telefone valido/invalido)
- atalho para agendamento do cliente

## 8.9 professionalsSection
### Escopo
- ranking/performance + detalhe
### Refatorar
- kpis e list cards
- historico associado
### QA
- filtro por periodo
- drawer com dados cruzados

## 8.10 servicesSection
### Escopo
- catalogo de servicos + detalhes
### Refatorar
- service card family
- painel de consumo de estoque
### QA
- servico ativo/inativo
- detalhe completo

## 8.11 commissionsSection
### Escopo
- fila de comissoes + detalhe
### Refatorar
- status chips financeiros
- acoes de pagar com feedback consistente
### QA
- pagar comissao
- erro de pagamento
- visual de pendencia

## 8.12 auditSection
### Escopo
- timeline e detalhes tecnicos
### Refatorar
- timeline components
- drawer auditoria padrao
### QA
- filtros
- payloads longos
- legibilidade

## 8.13 fidelizacaoSection
### Escopo
- resumo de fidelizacao + operacoes transacionais
### Refatorar
- cards padronizados
- hierarchy tipografica
### QA
- dados ausentes
- cards densos em mobile
- ajuste de pontos
- compra de pacote
- ativacao de assinatura
- validacao de cliente selecionado

## 8.14 automacoesSection
### Escopo
- lista/risco/provedor/execucao + ciclo de vida de regra
### Refatorar
- estados de automacao
- feedback de execucao
### QA
- filtros combinados
- erro parcial
- criar regra
- editar regra
- ativar/desativar regra
- reprocessamento com erro/sucesso

## 8.15 metasSection
### Escopo
- dashboard de metas + modal
### Refatorar
- cards de progresso
- rankings
- modal padrao
### QA
- criar/editar meta
- validacao campo

## 8.16 settingsSection
### Escopo
- hub + drawers por secao (horarios, equipe, pagamentos, comissoes...)
### Refatorar
- hub cards padrao
- formularios por secao padronizados
- tabela/lista mobile
### QA
- salvar horarios
- refletir no booking/agenda
- toggles e defaults

## 8.17 reportsSection
### Escopo
- hub de relatorios + views por tipo
### Refatorar
- cards de resumo
- tabelas/listas responsivas
### QA
- troca de relatorio
- filtros/periodo

## 8.18 whatsappSection
### Escopo
- status de conexao e acoes
### Refatorar
- status card
- acoes connect/disconnect
### QA
- estados de conexao
- erro de integracao

## 8.19 agendamento-linkSection
### Escopo
- exibir/copiar/abrir link publico
### Refatorar
- CTA e feedback de copia
### QA
- copy feedback
- abrir link

---

## 9. Checklist de Regressao Visual (Obrigatorio por Release)

Para cada tela:
1. Before/after desktop.
2. Before/after mobile.
3. before/after dark.
4. before/after light.
5. before/after overlay aberto.
6. before/after loading.
7. before/after empty.
8. before/after error.

### 9.1 Matriz de permissoes por tela/acao (obrigatoria)
Para cada dominio, manter tabela `acao -> roles permitidos` e validar em QA:
1. owner
2. recepcao
3. profissional

Regras:
1. nenhuma acao critica sem teste por role
2. nenhuma acao invisivel para role permitida
3. acao bloqueada deve exibir feedback consistente

---

## 10. Testes Funcionais Criticos (E2E minimos)

1. Criar agendamento -> cancelar -> conferir status imediato na tela.
2. Conferir slot cancelado disponivel no `booking.html`.
3. Fechar atendimento com checkout.
4. Estorno de atendimento.
5. Venda de produto e impacto no estoque.
6. Lancamento financeiro e impacto no resumo.
7. Alterar horarios em configuracoes e validar regra no booking.
8. Navegacao por teclado completa nos fluxos criticos (sem trap de foco).
9. Validar anuncios de erro/sucesso em leitores de tela.
10. Validar formatacao `pt-BR` (data/hora/moeda/numero) em agenda, financeiro e relatorios.
11. Validar budgets de performance e motion no CI antes de promover release.
12. Executar malha minima de CI para cada dominio alterado:
- E2E por role
- regressao visual por modulo
- a11y automatizada baseline
- contrato DOM/API nas telas criticas

---

## 11. Riscos Criticos + Mitigacao (Consolidado)

## 11.1 Acoplamento em `public/app.js` (ALTO)
Mitigacao:
- fatiar por dominio
- contrato mount/unmount/refresh
- smoke test por dominio

## 11.2 Dependencia de IDs e markup (ALTO)
Mitigacao:
- criar camada de seletores estaveis
- teste de integridade DOM

## 11.3 Contratos API sem tipagem de resposta (ALTO)
Mitigacao:
- schema de resposta
- adaptador view-model
- compatibilidade v1/v2

## 11.4 Politica de autorizacao dificil de manter (ALTO)
Mitigacao:
- policy declarativa por rota
- teste role x endpoint

## 11.5 Inconsistencia role x menu (ALTO)
Mitigacao:
- registry unico de modulos
- validador CI

## 11.6 Parse textual de erro (MEDIO)
Mitigacao:
- adotar `error.code`

## 11.7 Testes frontend insuficientes (MEDIO)
Mitigacao:
- e2e minimo por fluxo
- visual regression gate

---

## 12. Estrategia de Rollout Sem Quebra

## 12.1 Fase 0 - congelamento
- snapshot payloads atuais
- baseline de compatibilidade
- baseline visual e funcional por modulo

## 12.2 Fase 1 - camada anti-quebra
- adaptadores `mapApiToViewModel`
- front nao depende de payload cru
- separacao de load critico por modulo ativo vs pre-cargas opcionais

### 12.2.1 DAG de dependencias entre modulos (obrigatorio)
Definir matriz `modulo -> depende de` com gates de promocao. Exemplo:
1. `configuracoes` antes de `agenda` e `booking`
2. `operacao/pdv` antes de consolidacoes de `financeiro` e `comissoes`
3. `servicos` e `profissionais` antes de fluxos de `agenda`

Sem DAG aprovado, modulo nao entra em rollout.

## 12.3 Fase 2 - feature flags com lifecycle
- `agenda_v2`, `financeiro_v2`, etc
- cada flag deve ter: owner, escopo, kill-switch, data de expiração, criterio de remoção
- CI falha para flag vencida sem plano de remoção

## 12.4 Fase 3 - deploy paralelo e coorte
- backend entrega v1 + campos novos
- rollout por coorte: role, unidade e percentual de trafego
- burn-in minimo por modulo antes de promover
- observabilidade obrigatoria por modulo (SLIs):
1. erro JS
2. erro API
3. latencia p95
4. taxa de sucesso do fluxo principal
5. regressao de conversao (quando aplicavel)

## 12.5 Fase 4 - promocao gradual
- criterios de promocao:
1. SLO minimo atendido (erro JS, erro API, latencia p95, sucesso de fluxo, regressao de conversao)
2. smoke + e2e verdes
3. regressao visual sem bloqueador
- criterio automatico de abort:
1. erro acima do limite
2. queda de conversao acima do limite
3. falha de fluxo critico

## 12.6 Fase 5 - rollback executavel
Runbook padrao:
1. `T+0`: desligar flag do modulo afetado
2. `T+5`: restaurar bundle estavel e validar fluxo critico
3. `T+15`: purge de cache + revalidacao end-to-end + comunicacao interna

Obrigatorio:
- simulacao de rollback antes da Fase 3
- aprovador de rollback definido para dominios criticos (`agenda`, `operacao/pdv`, `booking`)

## 12.7 Fase 6 - cleanup final
- remover legado apos estabilidade
- remover flags antigas
- consolidar documentacao de decisao de rollout

### 12.8 Template obrigatorio de rollout por modulo
1. modulo\n2. owner técnico\n3. owner de produto\n4. coorte inicial\n5. percentual inicial\n6. burn-in planejado\n7. SLO minimo\n8. criterio de promoção\n9. criterio de abort\n10. runbook de rollback associado

---

## 13. Plano de Sprint (Executavel)

### 13.0 Controles transversais obrigatorios (S2 em diante)
1. Rodar smoke de `login.html` e `booking.html` em todas as sprints, mesmo antes da migracao final dessas telas.
2. Rodar suite minima de acessibilidade e responsividade por dominio alterado.
3. Validar matriz role x acao para qualquer fluxo tocado no sprint.

## Sprint 1
- Gate motion (A/B)
- tokens foundation
- theme engine
- shell global

## Sprint 2
- component library core
- agenda migrada
- configuracoes migrada

## Sprint 3
- dashboard
- operacao/pdv
- financeiro
- estoque

## Sprint 4
- clientes
- profissionais
- servicos
- comissoes

## Sprint 5
- relatorios
- auditoria
- fidelizacao
- automacoes
- metas

## Sprint 6
- whatsapp
- agendamento-link
- login
- booking
- QA final + cleanup

---

## 14. Governance de PR e Qualidade

1. PR pequena por dominio (sem mega PR unica).
2. Cada PR deve anexar:
- screenshots before/after
- checklist de estados
- checklist de responsividade
- checklist de tema light/dark
3. Nao misturar mudanca de negocio com visual sem justificativa.
4. Cada dominio so avanca com smoke/e2e verde.
5. PR com mudanca de token deve incluir changelog e impacto de migracao.
6. PR deve seguir naming semantico (`--sys-*` e `--cmp-*`), com gate de CI.
7. PR de UI deve anexar checklist WCAG 2.2 AA e i18n pt-BR.
8. PR de UI deve anexar evidencias de budget de performance/motion.

### 14.1 RACI minimo por dominio
1. DRI Frontend
2. Revisor Design System
3. Revisor QA
4. Revisor Backend (quando houver impacto de contrato)
5. Aprovador de release/rollback

### 14.2 Janela de release e freeze
1. Dominios criticos (`agenda`, `operacao/pdv`, `booking`) entram em janela controlada.
2. Freeze preventivo em periodos de pico operacional.
3. Rollback authority definido antes da promocao.

---

## 15. Criterios de Pronto Final

1. 100% telas cobertas.
2. 100% componentes core padronizados.
3. 100% estados obrigatorios validados.
4. 0 regressao funcional critica.
5. Light/Dark completos.
6. Responsividade aprovada.
7. A11y baseline aprovada.
8. Documentacao final do DS atualizada para contribuicao futura.
9. WCAG 2.2 AA validado nos fluxos criticos.
10. i18n/l10n pt-BR validado (sem hardcoded em modulos migrados).
11. performance budget dentro do limite acordado.
12. governanca de tokens operante (owner, versionamento, deprecacao e gates).

---

## 16. Documentacao Operacional para o Time

1. Playbook de contribuicao (tokens/componentes/variants).
2. Runbook de incidentes visuais (triagem, mitigacao, rollback, comunicacao).
3. Guia de onboarding para novos devs (arquitetura DS, naming, QA).
4. Calendario de release e rito de deprecacao.
5. Template de RFC curta para mudancas breaking.

---

## 17. Log de Gaps Corrigidos nesta Revisao

1. Gap de rollout sem regra operacional -> corrigido com template de rollout por modulo, coorte, burn-in, SLO e abort automatico.
2. Gap de rollback abstrato -> corrigido com runbook executavel `T+0/T+5/T+15` e aprovador definido.
3. Gap de governanca de tokens -> corrigido com ownership, versionamento, deprecacao e gates de CI.
4. Gap de naming semantico -> corrigido com gramatica obrigatoria `--sys-*` e `--cmp-*`.
5. Gap de acessibilidade -> corrigido com meta formal WCAG 2.2 AA e gates de validacao.
6. Gap de i18n/l10n -> corrigido com trilha pt-BR first, regras de Intl e anti-hardcode.
7. Gap de performance budget -> corrigido com limites de CWV, budget de assets/motion e gate de CI.
8. Gap de matriz de permissoes -> corrigido com exigencia role x acao por dominio.
9. Gap de navegacao inconsistente -> corrigido com matriz unica de navegacao/permissao e validador CI.
10. Gap de dependencias entre modulos -> corrigido com exigencia de DAG e gates de promocao.
11. Gap de cobertura de fluxos transacionais (agenda/pdv/financeiro/estoque/clientes/fidelizacao/automacoes) -> corrigido no plano por tela com QA especifico.
12. Gap de componente orfao (`topbar.js`) -> corrigido com decisao obrigatoria de incorporar/remover.

---

## 18. Observacoes Finais

Este plano foi escrito para maximizar cobertura e minimizar risco de quebra. Ele e deliberadamente completo e rastreavel, com trilha de execucao por tela, por componente e por risco arquitetural.

Nenhuma tela ou componente deve ser considerada fora de escopo durante a migracao.
