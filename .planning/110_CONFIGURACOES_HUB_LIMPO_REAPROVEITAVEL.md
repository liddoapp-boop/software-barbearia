# 110 - Configuracoes em Hub Limpo e Reaproveitavel

Data: 2026-05-05
Fase: 1.10
Status: IMPLEMENTADA E VALIDADA

## Resumo executivo
A tela de Configuracoes deixou de ser um formulario longo com todas as areas abertas e virou um hub operacional por temas. A superficie principal agora apresenta blocos de decisao: Empresa, Horarios, Pagamentos, Equipe, Comissoes, Agenda, Seguranca, Aparencia e Parametros.

IDs tecnicos, chaves internas, timestamps e payloads ficam recolhidos em `TechnicalTrace` dentro do `EntityDrawer`. A tela principal mostra apenas linguagem operacional, status humanizado, avisos importantes e acoes claras para editar/revisar.

Nenhuma regra de backend, dominio, Prisma, permissoes, auditoria, idempotencia, tenant guard, financeiro, comissoes, agenda, checkout ou PDV foi alterada.

## Objetivo da fase
- Transformar Configuracoes em hub limpo e navegavel.
- Evitar que a tela pareca um formulario gigante.
- Organizar configuracoes por temas reutilizaveis em SaaS de servicos.
- Proteger dados tecnicos/sensiveis na superficie principal.
- Manter todos os fluxos existentes de salvar empresa, horarios, pagamentos, equipe, comissoes, agenda e aparencia.

## Antes/depois conceitual
Antes:
- O modulo renderizava oito secoes abertas em sequencia.
- Formularios de empresa, horarios, equipe, comissoes, pagamentos, operacao, aparencia e seguranca ficavam todos na mesma rolagem.
- IDs e dados tecnicos podiam aparecer como parte da leitura operacional, especialmente em seguranca e listas auxiliares.

Depois:
- A superficie principal e um hub de cards por tema.
- Cada bloco mostra resumo curto, status e acao "Editar e revisar".
- Edicao e listas detalhadas abrem em `EntityDrawer`.
- Dados tecnicos ficam recolhidos em `TechnicalTrace`.
- Empty states aparecem para pagamentos, equipe e regras de comissao sem dados.

## Componentes usados da Fase 1.1
- `renderPageHeader`
- `renderPrimaryAction`
- `renderStatusChip`
- `renderEmptyState`
- `renderEntityDrawer`
- `bindEntityDrawers`
- `renderTechnicalTrace`

`renderFilterBar` nao foi usado porque Configuracoes nao tem uma busca/lista operacional principal nesta fase; o padrao adequado e navegacao por blocos.

## Mudancas feitas em Configuracoes
- `public/modules/configuracoes.js` foi refatorado para separar hub, cards, drawers, formularios curtos e listas compactas.
- `public/app.js` passou a abrir o drawer do bloco escolhido com `renderSettingsSectionDrawer`.
- `public/index.html` removeu o card externo antigo da tela para evitar card dentro de card.
- `public/styles/layout.css` recebeu estilos para hub, cards, formularios curtos, listas compactas, horarios e mobile.
- `public/components/operational-ui.js` ampliou `TechnicalTrace` para `businessSettingsId`, `paymentMethodId`, `teamMemberId` e `commissionRuleId`.

## Como o hub foi organizado
- Empresa: nome, segmento e contato principal.
- Horarios: dias abertos e resumos de domingo/segunda na superficie; semana completa no drawer.
- Pagamentos: metodos ativos, metodo padrao e total cadastrado.
- Equipe: membros ativos, perfis e total cadastrado.
- Comissoes: regra da casa, regras ativas e total.
- Agenda: duracao padrao, antecedencia, intervalo e encaixes.
- Seguranca: usuario, perfil e disponibilidade real de alteracao de senha.
- Aparencia: nome exibido, tema e cor principal.
- Parametros: lembretes, cliente em risco, cliente inativo e sobreposicao.

## Dados sensiveis e tecnicos escondidos
A superficie principal nao mostra:
- `unitId`
- `businessId`
- `businessSettingsId`
- `paymentMethodId`
- `teamMemberId`
- `commissionRuleId`
- `ruleId`
- payloads
- JSON
- timestamps tecnicos

Esses campos ficam no drawer, recolhidos em `TechnicalTrace`, preservando rastreabilidade para auditoria/suporte sem poluir a operacao.

## Formularios mais claros
- Empresa ficou em um formulario curto dentro do drawer.
- Horarios aparecem como linhas por dia, com aberto/fechado, abre/fecha e pausa.
- Pagamentos separa criacao de metodo da lista de metodos existentes.
- Equipe separa adicionar membro da lista de membros.
- Comissoes separa regra da casa, nova regra especifica e lista atual.
- Agenda/Parametros usam o mesmo contrato existente de preferencias, sem criar novos endpoints.
- Aparencia usa apenas campos ja existentes: nome exibido, cor principal e tema.

## Horarios, pagamentos, equipe e comissoes
Horarios:
- Dias da semana aparecem em linguagem humana.
- Aberto/fechado e pausas ficam legiveis.
- Sem tabela larga; mobile empilha linhas.

Pagamentos:
- Nome, ativo/inativo e padrao usam `StatusChip`.
- Acoes de ativar/desativar e definir padrao foram preservadas.

Equipe:
- Nome, funcao, perfil de acesso, contato quando existir e ativo/inativo.
- IDs de membros ficam apenas em `TechnicalTrace`.

Comissoes:
- "Comissao percentual" e "Comissao fixa" substituem tipo cru.
- "Regra geral", "Regra por profissional" e "Regra por servico" explicam escopo.
- Ativar/inativar regras continua usando o fluxo existente.

## Seguranca
Nao foi criado fluxo novo de senha. Como o backend informa `passwordChangeSupported: false`, a interface mostra:

`Alteracao de senha ainda nao esta disponivel nesta versao.`

Isso evita promessa de funcionalidade inexistente.

## Mobile
- Hub vira cards empilhados.
- Drawer usa o comportamento responsivo ja existente.
- Formularios quebram para uma coluna.
- Horarios deixam de depender de tabela larga.
- Acoes ocupam largura confortavel.

## Reaproveitamento SaaS
A arquitetura visual ficou generica para:
- barbearia;
- salao;
- clinica medica;
- clinica estetica;
- pet shop;
- consultorio.

Nao houve troca de nome do produto. O reaproveitamento vem da separacao entre identidade, agenda, pagamentos, equipe, comissoes, seguranca, aparencia e parametros.

## Arquivos alterados
- `public/index.html`
- `public/app.js`
- `public/components/operational-ui.js`
- `public/modules/configuracoes.js`
- `public/styles/layout.css`
- `.planning/110_CONFIGURACOES_HUB_LIMPO_REAPROVEITAVEL.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Riscos
- Validacao visual humana desktop/mobile ainda e recomendada antes de release.
- O bloco Equipe continua limitado ao contrato atual de team members; nao cria CRUD completo de usuarios reais.
- Seguranca mostra apenas sessao atual e indisponibilidade de troca de senha, porque nao ha endpoint dedicado.
- Agenda e Parametros compartilham o mesmo formulario de preferencias operacionais para preservar o backend atual.
- Como a worktree ja estava suja com fases anteriores, a revisao de commit deve separar escopo com cuidado.

## Criterios de aceite
- Configuracoes usa componentes da Fase 1.1 onde faz sentido.
- Tela principal virou hub organizado por temas.
- Formularios ficaram em drawers/secoes curtas.
- IDs tecnicos ficam recolhidos.
- Dados sensiveis nao ficam espalhados na superficie.
- EmptyState aparece quando necessario.
- Status foram humanizados.
- Mobile continua funcional.
- Nenhum fluxo critico foi removido.
- Build passa.
- Testes nao regrediram fora do sandbox.
- Smoke API passou.

## Validacoes executadas
- Sintaxe ES module dos arquivos alterados: passou com `node_modules\.bin\tsc.cmd --ignoreConfig --allowJs --checkJs false --noEmit --module esnext --target es2022 --skipLibCheck public\app.js public\modules\configuracoes.js public\components\operational-ui.js`.
- `npm.cmd run build`: passou no sandbox.
- `npm.cmd run test`: falhou no sandbox por `spawn EPERM` do Vitest/Rolldown ao carregar `vitest.config.ts`; passou fora do sandbox com aprovacao (`63 passed | 10 skipped`).
- `npm.cmd run smoke:api`: passou no sandbox.

## Proxima fase recomendada
Fase 1.11 - Auditoria visual real do frontend renderizado e polimento premium.
