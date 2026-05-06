# 109 - Servicos e Profissionais em Catalogo Operacional

Data: 2026-05-05
Fase: 1.9
Status: IMPLEMENTADA E VALIDADA

## Resumo executivo
A Fase 1.9 transformou Servicos e Profissionais em catalogos operacionais limpos. A superficie principal agora mostra o que e vendavel, quem pode atender, preco, duracao, margem/custo resumido, producao e comissoes em linguagem de operacao.

IDs tecnicos, vinculos crus, payloads, JSON e rastreabilidade sairam da leitura principal. O detalhe fica em `EntityDrawer`; rastreabilidade fica recolhida em `TechnicalTrace`.

Nenhuma regra de backend, dominio, Prisma, agenda, checkout, financeiro, auditoria, comissoes, permissoes, idempotencia ou tenant guard foi alterada.

## Objetivo da fase
- Fazer Servicos responder rapidamente quais estao ativos, quais vendem mais e quais precisam de ajuste.
- Fazer Profissionais responder rapidamente quem esta ativo, quem executa quais servicos e qual producao/comissao aparece no periodo.
- Preservar a relacao servico-profissional sem expor IDs crus na superficie.
- Manter os fluxos existentes de novo servico, editar, duplicar e ativar/inativar.
- Organizar detalhes tecnicos em camadas progressivas.

## Antes/depois conceitual
Antes:
- Servicos aparecia como tabela tecnica densa com muitas colunas.
- Profissionais aparecia como lista de performance e expunha `professionalId` na superficie.
- Detalhes de servico ficavam em painel lateral antigo, nao em drawer padronizado.

Depois:
- Servicos virou lista de catalogo com nome, categoria, preco, duracao, status, margem, custo, executantes e acoes claras.
- Profissionais virou lista de capacidade/producao com status, servicos que pode atender, receita, atendimentos, ticket, ocupacao e comissao pendente.
- Servicos e Profissionais usam drawer para resumo, operacao, uso/performance, acoes e `TechnicalTrace`.

## Componentes usados da Fase 1.1
- `renderPageHeader`
- `renderPrimaryAction`
- `renderFilterBar`
- `bindFilterBars`
- `renderStatusChip`
- `renderEmptyState`
- `renderEntityDrawer`
- `bindEntityDrawers`
- `renderTechnicalTrace`

## Mudancas feitas em Servicos
- Header operacional via `renderPageHeader`.
- Acao principal "Novo servico" via `renderPrimaryAction`, preservando o modal existente.
- Filtros essenciais de busca, categoria e status via `renderFilterBar`.
- Filtros avancados recolhidos para faixa de preco.
- Tabela principal substituida por cards de catalogo.
- Status humanizado como "Servico ativo" e "Servico inativo".
- Empty state operacional com acao para adicionar o primeiro servico.
- Detalhe movido para `EntityDrawer`.
- `TechnicalTrace` passou a guardar `serviceId`, `businessId/unitId`, profissionais habilitados e payload operacional recolhido.

## Mudancas feitas em Profissionais
- Header operacional via `renderPageHeader`.
- Filtros essenciais de profissional e periodo via `renderFilterBar`.
- Filtro avancado recolhido para contexto de perfis/inativos dependentes do cadastro atual.
- Lista principal virou catalogo de capacidade e producao.
- `professionalId` saiu da superficie principal.
- Status humanizado como "Profissional ativo".
- Relacao com servicos aparece como "Pode atender" e resumo de servicos que executa.
- Detalhe movido para `EntityDrawer`.
- `TechnicalTrace` guarda `professionalId`, `userId`, `commissionRuleIds`, `serviceIds` e dados crus recolhidos quando existirem.

## Organizacao do catalogo operacional
Servicos:
- Resumo do catalogo: total, ativos, inativos, ticket medio, mais vendido e candidatos a ajuste.
- Card principal: nome, categoria, descricao curta, preco, duracao, executantes, custo, margem, uso no periodo e acoes.
- Drawer: resumo, operacao, uso/impacto, atendimentos recentes, acoes e rastreabilidade.

Profissionais:
- Resumo do periodo: producao, atendimentos concluidos, maior producao e maior ocupacao.
- Card principal: nome, status, servicos que pode atender, producao, atendimentos, ticket medio, ocupacao, comissao pendente e acoes.
- Drawer: resumo, operacao, agenda recente, performance, acoes e rastreabilidade.

## Preco, duracao, custo, margem e comissao
- Preco e duracao aparecem na superficie de Servicos porque sao decisoes comerciais imediatas.
- Custo estimado e margem estimada aparecem resumidos, sem detalhamento tecnico.
- Comissao padrao do servico fica no drawer, com contexto operacional.
- Em Profissionais, comissao aparece como pendencia resumida quando o extrato de comissoes do periodo esta disponivel.
- Detalhes crus, regras e IDs ficam recolhidos em `TechnicalTrace`.

## Vinculos servico-profissional
- Servicos mostra "Executado por" com nomes resumidos; quando nao ha vinculo explicito, usa "Todos os profissionais ativos".
- Profissionais calcula "Pode atender" usando o catalogo ja carregado no frontend: servicos ativos sem restricao explicita ou com o profissional habilitado.
- `enabledProfessionalIds`, `professionalId` e `serviceIds` nao aparecem como texto na superficie principal.

## Rastreabilidade tecnica
- Servicos guarda rastros no drawer via `TechnicalTrace`: `serviceId`, `businessId`, `unitId`, `enabledProfessionalIds`, timestamps e payload recolhido.
- Profissionais guarda rastros no drawer via `TechnicalTrace`: `professionalId`, `userId`, `commissionRuleIds`, `serviceIds` e payload recolhido.
- `TechnicalTrace` foi ampliado para novos campos sem alterar backend.

## Mobile
- A lista principal usa cards empilhados.
- Busca e filtros essenciais ficam simples.
- Filtros avancados ficam recolhidos.
- Drawer vira bottom sheet responsivo.
- Listas longas de profissionais/servicos e historico ficam em detalhes progressivos.
- Acoes principais continuam visiveis em botoes de largura confortavel.

## Reaproveitamento SaaS
O padrao visual foi mantido generico:
- Servico em barbearia pode virar procedimento em clinica.
- Profissional em barbearia pode virar medico, dentista, terapeuta, esteticista ou tecnico.
- A linguagem visual separa catalogo, capacidade, producao, detalhe operacional e rastreabilidade, sem depender do segmento.

Nao houve troca de nomes do produto nesta fase; apenas documentacao do principio de reaproveitamento.

## Arquivos alterados
- `public/index.html`
- `public/app.js`
- `public/components/operational-ui.js`
- `public/modules/servicos.js`
- `public/modules/profissionais.js`
- `public/styles/layout.css`
- `.planning/109_SERVICOS_PROFISSIONAIS_CATALOGO_OPERACIONAL.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Riscos
- O endpoint atual de Profissionais retorna apenas profissionais ativos; inativos/perfis completos dependem de fluxo de cadastro futuro.
- A relacao "Pode atender" em Profissionais e inferida no frontend a partir do catalogo de servicos carregado, sem novo endpoint.
- Validacao visual humana desktop/mobile ainda e recomendada antes de release.
- Como a worktree ja estava suja com fases anteriores, a revisao de commit deve separar escopo com cuidado.

## Criterios de aceite
- Servicos usa componentes da Fase 1.1 onde faz sentido.
- Profissionais usa componentes da Fase 1.1 onde faz sentido.
- Catalogo principal ficou limpo e operacional.
- Status foram humanizados.
- Relacao servico-profissional ficou compreensivel.
- Detalhes usam drawer/progressivo.
- `TechnicalTrace` preserva rastreabilidade.
- Informacoes tecnicas ficam recolhidas.
- Empty state aparece para ausencia de dados.
- Mobile segue funcional com cards e drawer.
- Nenhum fluxo critico foi removido.
- Backend, Prisma, dominio, agenda, checkout, financeiro, comissoes, auditoria, permissoes, idempotencia e tenant guard nao foram alterados.

## Validacoes executadas
- Sintaxe ES module dos arquivos alterados: passou com `node_modules\.bin\tsc.cmd --ignoreConfig --allowJs --checkJs false --noEmit --module esnext --target es2022 --skipLibCheck public/app.js public/modules/servicos.js public/modules/profissionais.js public/components/operational-ui.js`.
- Tentativa com `npx tsc`: falhou por `ExecutionPolicy` do PowerShell bloqueando `npx.ps1`; validacao foi repetida com o binario local `tsc.cmd`.
- `npm.cmd run build`: passou no sandbox.
- `npm.cmd run test`: falhou no sandbox por `spawn EPERM` do Vitest/Rolldown; passou fora do sandbox com aprovacao (`63 passed | 10 skipped`).
- `npm.cmd run smoke:api`: passou no sandbox.

## Proxima fase recomendada
Fase 1.10 - Configuracoes em hub limpo e reaproveitavel.
