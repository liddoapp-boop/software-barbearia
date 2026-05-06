# Fase 1.20 - Analise completa do projeto, maturidade real e proximos passos estrategicos

Data: 2026-05-06

Decisao final: aprovado para continuar evolucao local e validacao interna assistida; bloqueado para release controlado real ate existir ambiente alvo definido, `.env` forte, PostgreSQL alvo com backup, CORS restrito e validacao visual/operacional no host real.

## Resumo executivo

O Software Barbearia hoje e um produto operacional bastante avancado para gestao de barbearias. Ele cobre agenda, atendimento, checkout, PDV, financeiro, estoque, comissoes, clientes, servicos, profissionais, auditoria, configuracoes, metas, fidelizacao, automacoes e relatorios. O core de dominio deixou de ser prototipo: ha regras reais, idempotencia nas rotas criticas, auditoria persistente, tenant guard, permissoes por perfil e testes automatizados relevantes.

A maturidade real, porem, nao e comercial. O sistema esta mais proximo de um beta interno forte / release controlado local do que de um SaaS vendavel. O motivo nao e falta de funcionalidade de core, mas falta de consolidacao operacional: ambiente alvo real ausente, frontend ainda pesado em `public/app.js`, Tailwind CDN em runtime, credenciais/dev defaults ainda documentados para local, processo de backup/rollback nao validado no alvo e documentacao muito extensa sem uma fonte unica consolidada.

Classificacao de maturidade: beta interno.

Justificativa: o produto ja executa fluxo operacional completo com rastreabilidade e testes, mas ainda depende de validacao em ambiente interno real, hardening de deploy, saneamento frontend e governanca de documentacao antes de release controlado. Nao esta pronto comercialmente.

## Estado real do projeto

Pronto:
- Core Agenda -> Checkout -> Financeiro -> Estoque -> Comissoes -> Auditoria funciona localmente.
- Rotas criticas usam idempotencyKey obrigatoria.
- Prisma/PostgreSQL tem modelos, relacoes e constraints importantes.
- Testes API, DB e smoke cobrem cenarios criticos.
- Relatorios gerenciais locais e CSV backend existem.

Aprovado com ressalvas:
- UX premium esta bem encaminhada, mas nao homogenea.
- Permissoes estao coerentes para o escopo atual, mas ainda usam autenticacao propria simples.
- Auditoria resolve grande parte do problema de caixa preta, mas nao cobre tudo transacionalmente.
- SaaS multiunidade existe em parte, mas ainda nao e multi-segmento maduro.

Parcial:
- Automacoes, fidelizacao, billing, retencao e metas parecem mais fundacao/prototipo operacional do que modulo comercial fechado.
- Estoque tem rastreio e consumo por servico, mas nao tem compras, fornecedores ou inventario fisico.
- Relatorios tem CSV e contratos, mas nao tem ambiente real nem pipeline publico.

Bloqueado:
- Release controlado real por ausencia de ambiente interno definido.
- Producao publica por Tailwind CDN, `.env` alvo indefinido, backup/rollback nao validado e auth/dev posture ainda local.

Evolucao futura:
- IA, WhatsApp real, automacoes avancadas, multi-segmento e billing comercial devem esperar estabilizacao operacional.

## Analise executiva do produto

O produto resolve a operacao diaria de uma barbearia: organizar agenda, executar atendimento, cobrar, registrar receita, baixar estoque, calcular comissao, manter historico do cliente, auditar eventos e gerar relatorios gerenciais.

Fluxo operacional principal:
Agenda -> Confirmacao -> Inicio do atendimento -> Checkout -> Pagamento -> Financeiro -> Comissao -> Estoque -> Historico do cliente -> Auditoria -> Relatorios.

Modulos existentes:
- Dashboard
- Agenda e central de agendamentos
- Checkout
- PDV e historico de vendas
- Estoque
- Financeiro
- Auditoria
- Comissoes
- Clientes
- Servicos
- Profissionais
- Configuracoes
- Relatorios
- Metas
- Fidelizacao
- Automacoes
- Billing/integracoes
- Retencao/scoring

Modulos maduros:
- Agenda, checkout, financeiro operacional, PDV, devolucoes, comissoes basicas, auditoria, relatorios locais, configuracoes basicas.

Modulos bons, mas ainda com ressalvas:
- Estoque, clientes, servicos, profissionais, dashboard e metas.

Modulos ainda com cara de prototipo/fundacao:
- Automacoes, fidelizacao, retencao/scoring, billing/reconciliacao e multiunidade analitico.

O sistema ja parece produto em varias telas, mas ainda parece projeto em construcao pela densidade tecnica restante, pelo `app.js` grande, pela dependencia de CDN e pela ausencia de ambiente alvo. Esta acima de MVP tecnico e acima de MVP operacional simples, mas abaixo de release controlado real.

## Analise do fluxo principal

| Etapa | Existe | Funciona | Testado | Dependencia frontend | Dependencia backend | Incompleto | Risco | Prioridade |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Agenda | Sim | Sim | API, smoke | Alta | Alta | agenda avancada, recorrencia, bloqueios ricos | Medio | P1 |
| Confirmacao | Sim | Sim | API | Media | Alta | notificacao real | Baixo | P2 |
| Inicio atendimento | Sim | Sim | API/smoke | Media | Alta | fluxo guiado visual ainda simples | Baixo | P2 |
| Checkout | Sim | Sim | API, DB, smoke | Alta | Alta | meios de pagamento reais/conciliacao externa | Medio | P1 |
| Pagamento | Parcial | Registro interno | API/smoke | Media | Alta | gateway/TEF/recebimento real | Medio | P2 |
| Financeiro | Sim | Sim | API, DB, smoke | Alta | Alta | fechamento mensal, exportacao contabil | Alto | P1 |
| Comissao | Sim | Sim | API, DB | Media | Alta | regras multiplas/fechamento periodo/estorno de paga | Alto | P1 |
| Estoque | Sim | Sim | API, DB, smoke | Alta | Alta | compras, fornecedores, inventario fisico | Alto | P1 |
| Historico cliente | Sim | Sim | API parcial | Alta | Media | CRM real, consentimento LGPD, campanhas reais | Medio | P2 |
| Auditoria | Sim | Sim | API, DB | Media | Alta | cobertura total e outbox transacional | Medio | P1 |
| Relatorios | Sim | Sim local | API, DB, smoke, browser anterior | Alta | Alta | ambiente alvo, Excel/PDF, fechamento contabilidade | Alto | P0/P1 |

## Analise backend

Classificacao geral: forte com pontos frageis.

Fortes:
- Separacao razoavel entre HTTP (`src/http/app.ts`), dominio (`src/domain/*`), aplicacao (`src/application/*`) e infraestrutura (`src/infrastructure/*`).
- Fastify + Zod fornecem contratos e validacao de entrada.
- `PrismaOperationsService` usa transacoes em fluxos criticos.
- Idempotencia com hash de payload e replay/conflito.
- Tenant guard no preHandler por query/body e em rotas por path importantes.
- Auditoria persistente append-only para eventos sensiveis.
- Financeiro registra origem operacional em checkout, vendas, refunds e comissoes.
- Testes cobrem agenda, financeiro, idempotencia, permissoes, tenant guard, relatorios e DB real.

Aceitaveis:
- `OperationsService` memory mantem compatibilidade local, mas duplica muita logica com Prisma.
- Erros sao humanos o bastante, mas ainda por string matching no error handler.
- Performance basica ok para volume pequeno/medio; agregacoes ainda sao em codigo em alguns pontos.

Frageis:
- `src/http/app.ts` tem 3510 linhas e concentra rotas, schemas, permissoes, CSV e helpers.
- `src/application/prisma-operations-service.ts` tem 9478 linhas; `operations-service.ts` tem 7391 linhas. Isso eleva risco de regressao e dificulta ownership.
- Politica de acesso e declaracao de rotas estao acopladas a strings.
- Alguns modulos avancados tem comportamento de fundacao/prototipo.

Critico antes de producao:
- Ambiente real, segredo forte, CORS, backup, observabilidade e pipeline de assets.
- Autenticacao propria precisa revisao se houver exposicao publica.

## Analise banco/Prisma/PostgreSQL

Classificacao: aceitavel para uso real controlado, nao pronto para comercial amplo.

Pontos fortes:
- Schema PostgreSQL explicito em `prisma/schema.prisma`.
- Entidades centrais possuem PKs, indices e relacoes: Unit, User, Appointment, FinancialEntry, ProductSale, Refund, StockMovement, AuditLog, IdempotencyRecord.
- Constraints importantes existem: idempotencia por unidade/acao/chave, financeiro por referencia, comissao por origem, movimento de estoque por referencia, refund por atendimento.
- Testes DB reais passaram com concorrencia, replay, payload divergente, tenant guard e relatorios.

Riscos de integridade:
- `FinancialEntry.referenceType/referenceId`, `StockMovement.referenceType/referenceId` e alguns `sourceId` seguem flexiveis demais. Isso e bom para rastreabilidade generica, mas abre risco de referencia quebrada.
- Muitos campos operacionais ainda sao `String` livre: roles, status de alguns modulos, tipo de regra, accessProfile, eventType.
- `Service.businessId`, `Client.businessId` e `Product.businessId` preservam nomenclatura antiga enquanto a arquitetura fala `unitId`.
- `Professional` nao pertence diretamente a `Unit`; isso pode complicar multiunidade real se o mesmo profissional nao for global.
- Dados sensiveis de cliente existem sem politica LGPD formal, mascaramento ou retencao.

Banco pronto para uso real controlado? Sim, se for PostgreSQL alvo com backup e acesso restrito. Nao para producao publica/comercial sem hardening.

Constraints faltantes recomendadas:
- FK ou constraints auxiliares para referencias operacionais criticas quando possivel.
- Normalizacao de `referenceType` e status livres em enums ou tabelas de dominio.
- Pertencimento explicito de `Professional` a unidade ou modelo N:N com unit.
- Indices por unidade em pontos de consulta recorrente conforme volume real.

## Analise de idempotencia

Classificacao geral: completo nas rotas criticas minimas, com risco residual operacional.

Rotas avaliadas:
- Checkout de atendimento: completo.
- Venda de produto: completo.
- Devolucao de produto: completo.
- Lancamento financeiro manual: completo.
- Pagamento de comissao: completo.
- Estorno de atendimento: completo.

Evidencias:
- Frontend gera `idempotencyKey` para checkout, venda, refund, lancamento financeiro e pagamento de comissao.
- Backend exige chave nas rotas criticas via `requireIdempotencyKey`.
- Prisma persiste `IdempotencyRecord`, compara hash de payload, faz replay de sucesso e retorna conflito em payload divergente.
- Testes DB validam replay simultaneo, divergencia e concorrencia.

Riscos restantes:
- Replays dependem do armazenamento de resposta JSON; mudancas futuras de shape podem exigir versao de payload.
- Fluxos nao classificados como criticos ainda podem gerar eventos duplicados se chamados repetidamente.
- Memory backend e util para dev, mas nao deve ser usado como garantia operacional.

## Analise financeiro

Classificacao: forte para operacao interna controlada; parcial para fechamento mensal real.

Fortes:
- Entradas de atendimento e produto.
- Saidas por refund/devolucao e comissao paga.
- Lancamento manual com idempotencia.
- Saldo, resumo, transacoes e relatorios gerenciais.
- Rastreabilidade por source, referenceType/referenceId, profissional e cliente.
- Edicao/exclusao bloqueada para lancamentos nao manuais.

Fragilidades:
- Fechamento mensal ainda nao e um processo fechado com conciliacao, travamento e revisao.
- Exportacao contabil futura ainda precisa plano de contas, categorias padronizadas e formato externo.
- `referenceType/referenceId` e notes ainda carregam parte da semantica.
- Pagamento real/gateway/conta bancaria nao existe.

Financeiro e fonte da verdade? Sim para eventos internos registrados pelo sistema. Ainda nao para caixa/banco real.

Falta para fechamento mensal real:
- Period close.
- Categorias controladas.
- Conferencia de caixa por forma de pagamento.
- Relatorio de divergencias.
- Exportacao CSV contabil padronizada.

## Analise estoque

Classificacao: aceitavel/forte no rastreio basico; parcial para operacao completa.

Fortes:
- Produtos com estoque, minimo, custo e preco.
- Venda baixa estoque.
- Devolucao retorna estoque.
- Movimentos historicos existem.
- Ajustes manuais existem.
- Consumo por servico existe como ficha tecnica inicial.
- Relatorio de estoque tem movimentos, alertas e sugestoes.

Fragilidades:
- Compras e fornecedores nao existem.
- Inventario fisico/ciclo de contagem nao existe.
- Lotes, validade e custo medio nao existem.
- Perdas/consumo interno existem no modelo/rotas, mas precisam consolidacao operacional e UX mais forte.

Estoque pronto para uso real? Sim para estoque simples de produtos de venda e consumo basico. Nao para controle completo de compras/inventario.

## Analise comissoes

Classificacao: aceitavel/forte para regra simples; parcial para cenarios complexos.

Fortes:
- Comissao gerada a partir de atendimento/venda.
- Pagamento owner-only.
- Pagamento vira despesa financeira reconciliavel.
- Idempotencia e teste de concorrencia.
- Tela em funil operacional e relatorio.

Fragilidades:
- Regras multiplas avancadas, metas por periodo e excecoes ainda sao limitadas.
- Fechamento por periodo nao trava competencia.
- Estorno apos comissao paga precisa regra explicita: gerar ajuste, bloquear, ou criar saldo negativo.

Comissoes maduras? Maduras para operacao simples. Nao para rede com politicas complexas.

## Analise auditoria

Classificacao: forte com ressalva transacional.

Fortes:
- `AuditLog` persistente.
- Actor, role, email, unidade, rota, metodo, requestId/correlationId, idempotencyKey, before/after e metadata.
- Owner-only.
- Timeline frontend humanizada.
- Testes DB validam persistencia e nao duplicidade em replay idempotente.

Fragilidades:
- Nem todos os eventos do sistema sao auditados com a mesma profundidade.
- No backend memory a auditoria segue em array, limitada.
- Eventos nao criticos gravados pos-operacao podem falhar sem reverter a operacao.
- Outbox/auditoria transacional nao cobre tudo.

Resolve caixa preta? Sim para fluxos criticos principais. Nao ainda como trilha forense completa de produto comercial.

## Analise permissoes e seguranca

Classificacao: aceitavel para dev/beta interno; fragil para producao publica.

Fortes:
- Auth enforced por default.
- Roles owner, recepcao e profissional.
- Backend bloqueia rotas sensiveis.
- Frontend tambem oculta modulos por role.
- Tenant guard por unidade em query/body e rotas por id importantes.
- `AUTH_SECRET` forte obrigatorio em `NODE_ENV=production`.
- `.env` ignorado no Git.
- CORS configuravel por `CORS_ORIGIN`.

Riscos:
- JWT/HMAC proprio e simples, sem refresh token, revogacao, MFA ou politicas comerciais.
- Credenciais dev e `AUTH_USERS_JSON` existem para local.
- `CORS_ORIGIN` ausente no `.env` local.
- Dados financeiros e de clientes exigem LGPD, backup, controle de acesso e logs de operacao real.
- Frontend contem credenciais dev para login automatico local.

Aceitavel em dev:
- `DATA_BACKEND=memory`, segredo fraco, usuarios dev, CORS permissivo.

Bloqueia producao real:
- Segredo fraco, CORS aberto, auth dev, ausencia de backup, ausencia de ambiente alvo, Tailwind CDN e falta de validacao host real.

Acoes minimas antes de release controlado:
- `DATA_BACKEND=prisma`.
- `AUTH_SECRET` forte.
- Usuarios persistentes reais.
- `CORS_ORIGIN` restrito.
- PostgreSQL alvo com backup.
- Smoke remoto.
- Passada visual no host real.

## Analise frontend

Classificacao: bom visualmente, fragil estruturalmente.

Fortes:
- Modulos foram extraidos para `public/modules/*`.
- Componentes operacionais existem: PageHeader, PrimaryAction, FilterBar, EntityDrawer, TechnicalTrace, EmptyState, StatusChip.
- Menu, sidebar, topbar e mobile tabs estao organizados.
- IdempotencyKey e Authorization sao enviados pelo frontend.
- Relatorios tem modulo dedicado robusto.

Fragilidades:
- `public/app.js` ainda tem 6088 linhas e muita orquestracao.
- `public/index.html` tem 795 linhas, mistura shell, formularios e modais globais.
- `public/styles/layout.css` tem 2968 linhas.
- Ainda ha muitos handlers, modais e fluxos concentrados no app.js.
- Duplicacao de helpers `toNumber`, `safeText`, renderPanelMessage e formatacoes entre modulos.
- Tailwind CDN em runtime.
- Role switching e credenciais dev no frontend sao convenientes para local, nao para release.

O frontend esta sustentavel? Parcialmente. Sustenta evolucao curta, mas nao uma esteira comercial sem saneamento incremental.

O que extrair do app.js:
- API client/auth/session.
- Registry de modulos e lifecycle.
- Handlers de checkout, PDV, financeiro, estoque, comissoes.
- Modais globais por modulo.
- Utils compartilhados.

## Analise UI/UX premium

| Modulo | Classificacao | Observacao |
| --- | --- | --- |
| Dashboard | Bom, mas precisa polimento | Tem sinais executivos, mas ainda pode ficar mais decisao-primeiro. |
| Agenda | Premium suficiente | Funil operacional claro, filtros e drawers. |
| Checkout | Bom, mas precisa polimento | Forte no core, pode ficar mais guiado visualmente. |
| PDV | Premium suficiente | Carrinho, total e historico estao claros. |
| Historico de vendas | Bom, mas precisa polimento | Drawer e devolucao ajudam; filtros podem melhorar. |
| Estoque | Bom, mas precisa polimento | Rastreavel, ainda falta compras/inventario. |
| Financeiro | Bom, mas precisa polimento | Limpo e conciliado, falta fechamento real. |
| Auditoria | Bom, mas precisa polimento | Timeline melhorou, filtros tecnicos ainda existem. |
| Comissoes | Bom, mas precisa polimento | Funil operacional ok, falta fechamento por periodo. |
| Clientes | Bom, mas precisa polimento | Historico progressivo bom; CRM real ainda futuro. |
| Servicos | Premium suficiente | Catalogo operacional claro. |
| Profissionais | Bom, mas precisa polimento | Ocupacao ainda parcial. |
| Configuracoes | Bom, mas precisa polimento | Hub limpo, seguranca ainda limitada. |
| Relatorios | Premium suficiente localmente | Hub e CSV bons; bloqueado por ambiente. |
| Automacoes | Funcional, mas simples | Mais fundacao do que produto fechado. |
| Fidelizacao | Funcional, mas simples | Precisa maturar oferta e regras. |
| Metas | Bom, mas precisa polimento | Melhorou visualmente, mas ainda auxiliar. |
| Mobile | Bom, mas precisa validacao continua | Ja houve evidencia em relatorios, mas nao suite visual total. |

Avaliacoes transversais:
- Headers: melhoraram muito apos Fase 1.12.
- Paleta/contraste: premium suficiente, com risco de tema escuro denso.
- Cards: muitos, mas mais organizados.
- Botoes/filtros/drawers/status chips: bons.
- Empty states: presentes, ainda inconsistentes em alguns modulos.
- Tabelas: reduzidas, mas ainda aparecem quando necessario.
- Mobile: viavel, precisa passada real antes de release.

## Analise de Relatorios

Classificacao: pronto localmente; bloqueado para release interno real por ambiente.

Fases 1.13 a 1.19:
- 1.13 criou hub premium.
- 1.14 criou backend `/reports/management/*` e CSV.
- 1.15 validou contratos/smoke e corrigiu servidor/porta.
- 1.16 validou visual desktop/mobile em Chrome real.
- 1.17 mitigou ressalvas e adicionou CSV clients.
- 1.18 bloqueou release por ausencia de ambiente alvo.
- 1.19 confirmou o bloqueio por ausencia de ambiente interno real.

Relatorios esta pronto localmente? Sim.

Esta pronto para release interno? Nao, porque release depende de host real, `.env`, banco, CORS, backup e smoke remoto.

Problema e codigo ou ambiente? Principalmente ambiente. Codigo ainda tem ressalvas como Tailwind CDN e ocupacao parcial de profissionais, mas o bloqueio imediato e ambiente alvo ausente.

## Analise testes e qualidade

Validacoes executadas nesta fase:
- `npm.cmd run build`: passou no sandbox.
- `npm.cmd run test`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox com 67 passed, 11 skipped.
- `npm.cmd run test:db`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox com 11 passed.
- `npm.cmd run smoke:api`: passou no sandbox.
- `git diff --check`: passou sem erros; apenas warnings LF -> CRLF.
- `git status`: worktree suja com alteracoes anteriores e novo relatorio desta fase.

Cobertura forte:
- API core.
- Idempotencia.
- Tenant guard.
- Permissoes financeiras/relatorios.
- DB concorrencia.
- CSV/relatorios.
- Smoke fim a fim.

Faltam testes:
- Frontend automatizado por navegador para todos os modulos.
- Visual regression.
- Fechamento financeiro mensal.
- Compras/inventario.
- Regras complexas de comissao.
- Segurança/auth hardening.
- Migrações em ambiente limpo de staging.

Testes suficientes? Suficientes para continuidade local e beta interno assistido. Insuficientes para comercial.

## Analise DevOps/release

Classificacao: bloqueado para release real.

Pontos bons:
- Scripts npm claros.
- `.env.example` documenta variaveis.
- `.env` fora do Git.
- `DATA_BACKEND` permite memory/prisma.
- Smoke API existe e cobre fluxo critico.
- `SMOKE_BASE_URL` permite validar API existente.

Bloqueios:
- Ambiente alvo real nao definido.
- `.env` local esta dev: `DATA_BACKEND=memory`, `NODE_ENV=development`, `AUTH_SECRET` fraco e CORS ausente.
- PostgreSQL alvo/backup/restore nao confirmado.
- Tailwind CDN em runtime.
- Sem checklist executado no host real.
- Sem estrategia validada de deploy, rollback e observabilidade.
- Worktree esta grande e suja; precisa empacotar commits antes de release.

Ambiente minimo realista:
- Uma VM ou host interno com Node 22, PostgreSQL, URL/porta fixa, TLS se acessado fora da maquina, `.env` forte, backup diario, logs persistentes e processo supervisionado.

Checklist minimo de release interno:
1. Definir URL alvo, dono e janela de validacao.
2. Configurar `.env` real fora do Git.
3. Aplicar migrations com backup previo.
4. Rodar `npm.cmd run build`, `npm.cmd run test`, `npm.cmd run test:db`.
5. Subir API atual.
6. Rodar `$env:SMOKE_BASE_URL="<URL_ALVO>"; npm.cmd run smoke:api`.
7. Validar desktop/mobile no host real.
8. Registrar evidencias e rollback.

## Analise documentacao .planning

Classificacao: rica demais e pouco consolidada.

Fortes:
- Historico detalhado por fase.
- Decisoes e ressalvas estao registradas.
- Boa cultura de aceite/validacao.
- Documentos 100 a 120 contam a evolucao UX/produto.

Frageis:
- `23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md` e `24_NEXT_PRIORITIES.md` ficaram muito longos.
- Existem documentos antigos 01-25, 70-97 e 100-119 com sobreposicao.
- Riscos se repetem em varias fases.
- Leitor novo pode nao saber qual documento e fonte da verdade.

Fontes da verdade recomendadas:
- `.planning/120_ANALISE_COMPLETA_MATURIDADE_PROJETO_ROADMAP.md` para maturidade atual.
- `.planning/24_NEXT_PRIORITIES.md` para proxima acao.
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md` para historico cronologico.
- `.planning/README.md` para indice.

Arquivar/consolidar depois:
- Docs 01-25 e 70-97 podem virar referencia historica.
- Docs 100-119 devem ser resumidos em um indice executivo.

## Analise SaaS reaproveitavel

O que ja e generico:
- Unit/business settings.
- Agenda, servicos, profissionais, clientes.
- Financeiro, estoque, comissoes, relatorios, auditoria.
- Segment em BusinessSettings.
- Layout de hub operacional.

Especifico demais de barbearia:
- Naming, copy, seed, categorias e algumas heuristicas.
- `BarbershopEngine`.
- Assumir servico + profissional + produto em formato de barbearia.
- Dashboard thresholds e mensagens focadas nesse segmento.

Para multi-segmento:
- Renomear engine para service-business engine.
- Criar taxonomia de segmento.
- Parametrizar labels, categorias, regras de duracao, comissao e estoque.
- Rever fluxo para clinica medica, pet shop e consultorio, onde consentimento, prontuario, agenda e estoque tem requisitos distintos.

O que deve esperar:
- Multi-segmento amplo deve ficar depois do release interno do segmento barbearia.

## Riscos P0/P1/P2/P3

| Prioridade | Risco | Impacto | Probabilidade | Modulo | Como resolver |
| --- | --- | --- | --- | --- | --- |
| P0 | Ambiente alvo ausente | Release impossivel | Alta | DevOps | Definir host, URL, DB, backup e smoke remoto |
| P0 | `.env` real nao configurado | Exposicao/instabilidade | Alta | DevOps/Security | DATA_BACKEND=prisma, segredo forte, CORS restrito |
| P0 | Sem backup/rollback validado | Perda de dados | Media | Banco/Ops | Backup antes de migrar e restore testado |
| P1 | Tailwind CDN | Fragilidade de producao | Alta | Frontend | Build CSS local ou substituir utilitarios |
| P1 | `app.js`/services gigantes | Regressao e baixa manutenibilidade | Alta | Frontend/Backend | Extracao incremental por modulo |
| P1 | Auth propria simples | Risco de seguranca | Media | Security | Hardening, revogacao, usuarios reais, politica senha |
| P1 | Comissao paga vs estorno | Inconsistencia financeira | Media | Comissoes/Financeiro | Definir regra de ajuste/credito/debito |
| P1 | Referencias genericas livres | Integridade parcial | Media | Banco/Financeiro/Estoque | Normalizar refs criticas e criar verificacoes |
| P2 | Compras/inventario ausentes | Estoque incompleto | Alta | Estoque | Modulo compras, fornecedor e contagem fisica |
| P2 | Fechamento mensal ausente | Financeiro incompleto | Alta | Financeiro | Period close e conciliacao |
| P2 | Automacoes/fidelizacao parciais | Promessa maior que entrega | Media | Produto | Reposicionar como beta ou concluir fluxo |
| P2 | Documentacao dispersa | Decisao lenta | Alta | Produto/Eng | Consolidar indice e fontes da verdade |
| P3 | Multi-segmento precoce | Dispersao de foco | Media | Produto | Adiar ate barbearia validar uso real |
| P3 | Excel/PDF antes de CSV real | Escopo desnecessario | Media | Relatorios | Esperar feedback do CSV |

## Lacunas criticas

- Ambiente interno real nao definido.
- `.env` de release inexistente/nao validado.
- PostgreSQL alvo e backup nao confirmados.
- Tailwind CDN ainda em producao se publicar hoje.
- Worktree grande sem empacotamento de release.

## Lacunas medias

- Saneamento incremental de `public/app.js`.
- Separacao de `src/http/app.ts` e services gigantes.
- Fechamento financeiro mensal.
- Compras/fornecedores/inventario.
- Regra de estorno afetando comissao paga.
- Auth/session hardening.
- Consolidacao de docs.

## Lacunas visuais

- Validacao visual completa de todos os modulos no host real.
- Automacoes, fidelizacao e metas ainda simples.
- Densidade de formularios/modais globais.
- Tema escuro pode parecer pesado em uso prolongado.

## Lacunas tecnicas

- Pipeline CSS sem CDN.
- Observabilidade e logs persistentes.
- Backup/restore.
- Testes E2E de browser.
- Refatoracao de orquestracao frontend.
- Constraints mais explicitas para referencias.

## Roadmap recomendado

Agora:
1. Fase 1.21 - Ambiente interno real e release candidate operacional.
2. Fase 1.22 - Saneamento de release frontend: remover Tailwind CDN e iniciar extracao do `app.js`.
3. Fase 1.23 - Fechamento operacional financeiro/comissoes/estoque para uso real: fechamento mensal, regra de estorno de comissao paga, compras/inventario minimo.

Depois:
- Observabilidade, backup/restore automatizado e runbook.
- Refatoracao backend por bounded contexts.
- Testes E2E browser.
- Consolidacao documental.
- Hardening de autenticacao.

Futuro:
- WhatsApp real.
- IA e playbooks de reativacao.
- Automacoes avancadas.
- Multi-segmento.
- Billing comercial completo.
- Relatorios avancados, Excel/PDF e contabilidade.

Fases nao recomendadas agora:
- IA/WhatsApp antes de ambiente e release interno.
- Multi-segmento amplo antes de validar barbearia.
- Excel/PDF antes de uso real do CSV.
- Redesign grande de tela antes de estabilizar deploy e app.js.
- Nova feature comercial grande sem fechar financeiro/estoque/comissoes.

## Decisao final de maturidade

Decisao: aprovado para continuar evolucao local e aprovado para validacao interna assistida quando o ambiente existir; bloqueado para release controlado real; nao pronto comercialmente.

Justificativa:
- O core operacional e forte e validado localmente.
- O banco e robusto o suficiente para piloto controlado.
- Testes importantes passaram.
- O bloqueio real esta em operacao/release, seguranca de ambiente, assets frontend e consolidacao.

## Criterios de aceite da Fase 1.20

- Relatorio completo criado: cumprido.
- Modulos principais analisados: cumprido.
- Backend, frontend, banco, seguranca, UX, testes e release avaliados: cumprido.
- Riscos classificados: cumprido.
- Roadmap proposto com prioridade: cumprido.
- Decisao final de maturidade dada: cumprido.
- Implementation log e next priorities atualizados: cumprido.
- Validacoes executadas ou falhas justificadas: cumprido.

## Arquivos analisados

Raiz/config:
- `package.json`
- `.env.example`
- `.gitignore`
- `tsconfig.json`
- `vitest.config.ts`
- `scripts/smoke-api-flow.ps1`

Backend:
- `src/server.ts`
- `src/http/app.ts`
- `src/http/security.ts`
- `src/application/*`
- `src/domain/*`
- `src/infrastructure/*`
- `prisma/schema.prisma`
- `prisma/migrations/*`
- `tests/api.spec.ts`
- `tests/db.integration.spec.ts`
- `tests/engine.spec.ts`

Frontend:
- `public/index.html`
- `public/app.js`
- `public/styles/layout.css`
- `public/styles.css`
- `public/components/*`
- `public/modules/*`

Planejamento:
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`
- `.planning/100_*` a `.planning/119_*`
- `.planning/README.md`
- documentos historicos relevantes em `.planning/01_*` a `.planning/97_*`

## Validacoes executadas

| Comando | Resultado | Observacao |
| --- | --- | --- |
| `npm.cmd run build` | Passou | Executado no sandbox. |
| `npm.cmd run test` | Falhou no sandbox; passou fora | Sandbox falhou por `spawn EPERM`; fora: 67 passed, 11 skipped. |
| `npm.cmd run test:db` | Falhou no sandbox; passou fora | Sandbox falhou por `spawn EPERM`; fora: 11 passed. |
| `npm.cmd run smoke:api` | Passou | Fluxo completo e CSV clients incluidos. |
| `git diff --check` | Passou | Apenas warnings LF -> CRLF. |
| `git status --short` | Executado | Worktree ja estava suja com alteracoes e arquivos novos anteriores. |

