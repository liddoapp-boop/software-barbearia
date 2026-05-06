# Next Priorities



## Atualizacao 2026-05-05 (Fase 1.11 - Validacao completa do produto)
- Criado `.planning/111_VALIDACAO_COMPLETA_PRODUTO_FRONTEND_LACUNAS.md`.
- Decisao final: aprovado com ressalvas.
- Backend, testes, smoke API, idempotencia, auditoria, permissoes e fluxos criticos estao consistentes para continuidade controlada.
- Frontend refatorado existe e esta conectado em Agenda, Checkout, PDV, Historico de Vendas, Estoque, Financeiro, Auditoria, Comissoes, Clientes, Servicos, Profissionais e Configuracoes.
- O produto ainda nao parece premium de forma homogenea: Dashboard, Automacoes, Fidelizacao e Metas seguem fora do contrato visual principal.
- Metas existia no HTML/app/modulo, mas estava invisivel no menu; foi conectada ao menu owner e ao mobile "Mais".
- A percepcao de que "nao mudou" provavelmente vem de mudancas mais estruturais que esteticas, tema escuro global, cache/servidor antigo possivel e telas iniciais ainda antigas.
- `npm.cmd run build`, `npm.cmd run smoke:api`, `npm.cmd run test` fora do sandbox e `npm.cmd run test:db` fora do sandbox passaram.

Prioridade imediata:
1. Fase 1.12 - Checklist visual real desktop/mobile e correcao de percepcao premium.
2. Executar inspecao humana com screenshots em Dashboard, Agenda, PDV, Estoque, Financeiro, Auditoria, Clientes, Configuracoes, Automacoes, Fidelizacao e Metas.
3. Corrigir somente problemas visuais pequenos que impedem a percepcao de produto premium: contraste, espacamento, excesso de card, botoes inconsistentes, modais densos e filtros tecnicos expostos.
4. Fase 1.13 - Levar Dashboard, Metas, Automacoes e Fidelizacao para o contrato operacional da Fase 1.1.
5. Fase 1.14 - Reduzir `public/app.js` gradualmente, extraindo modais/handlers por modulo sem reescrever o frontend inteiro.
6. Manter release/deploy controlado dependente de checklist visual real, `.env` alvo forte, PostgreSQL alvo e smoke remoto.

## Atualizacao 2026-05-05 (Fase 1.10 - Configuracoes em hub limpo e reaproveitavel)
- Criado `.planning/110_CONFIGURACOES_HUB_LIMPO_REAPROVEITAVEL.md`.
- Configuracoes virou hub por temas com `PageHeader`, `StatusChip`, `EmptyState`, `EntityDrawer`, `TechnicalTrace` e `PrimaryAction`.
- A superficie principal mostra Empresa, Horarios, Pagamentos, Equipe, Comissoes, Agenda, Seguranca, Aparencia e Parametros sem formulario gigante.
- Edicao e revisao detalhada foram movidas para drawer, mantendo os formularios e endpoints existentes.
- IDs tecnicos, timestamps e payloads ficam recolhidos em `TechnicalTrace`.
- Pagamentos, Equipe e Comissoes usam linguagem operacional e status humanizado.
- Seguranca nao promete troca de senha: informa que a funcionalidade ainda nao esta disponivel quando o backend nao suporta.
- Build passou; testes falharam no sandbox por `spawn EPERM` e passaram fora do sandbox; smoke API passou.

Prioridade imediata:
1. Fase 1.11 - Auditoria visual real do frontend renderizado e polimento premium.
2. Executar navegador real desktop/mobile para Agenda, PDV, Estoque, Financeiro, Auditoria, Comissoes, Clientes, Servicos, Profissionais e Configuracoes.
3. Corrigir sobreposicoes, textos quebrados, excesso de densidade e estados vazios que aparecerem no render real.
4. Revisar telas ainda densas: Automacoes, Fidelizacao, Metas e qualquer placeholder residual.
5. Manter backend/schema congelados ate a auditoria visual concluir.

## Atualizacao 2026-05-05 (Fase 1.9 - Servicos e Profissionais em catalogo operacional limpo)
- Criado `.planning/109_SERVICOS_PROFISSIONAIS_CATALOGO_OPERACIONAL.md`.
- Servicos virou catalogo operacional com `PageHeader`, `PrimaryAction`, `FilterBar`, `StatusChip`, `EmptyState`, `EntityDrawer` e `TechnicalTrace`.
- A superficie de Servicos mostra nome, categoria, preco, duracao, status, custo/margem resumidos, profissionais habilitados e acoes, sem tabela tecnica.
- Profissionais virou catalogo de capacidade/producao com `PageHeader`, `FilterBar`, `StatusChip`, `EmptyState`, `EntityDrawer` e `TechnicalTrace`.
- A superficie de Profissionais mostra nome, status, servicos que pode atender, producao, ticket, ocupacao e comissao pendente, sem expor `professionalId`.
- Relacao servico-profissional passou a ser apresentada por nomes e capacidade operacional; IDs crus ficam recolhidos.
- `TechnicalTrace` foi ampliado para `serviceId`, `enabledProfessionalIds`, `userId`, `commissionRuleIds` e `serviceIds`.
- Build passou; testes falharam no sandbox por `spawn EPERM` e passaram fora do sandbox; smoke API passou.

Prioridade imediata:
1. Fase 1.10 - Configuracoes em hub limpo e reaproveitavel.
2. Transformar Configuracoes em hub por blocos operacionais: empresa/unidade, agenda, financeiro/comissoes, usuarios/perfis e integracoes.
3. Esconder chaves, IDs, payloads e rastros em detalhe/`TechnicalTrace`.
4. Manter configuracoes perigosas com confirmacao, linguagem humana e permissao atual.
5. Executar checklist visual humano desktop/mobile de Clientes, Servicos, Profissionais, Comissoes, Auditoria, Financeiro, Estoque, PDV e Agenda antes de release.

## Atualizacao 2026-05-05 (Fase 1.8 - Clientes em historico progressivo e acao comercial limpa)
- Criado `.planning/108_CLIENTES_HISTORICO_PROGRESSIVO_ACAO_COMERCIAL.md`.
- Clientes passou a usar `PageHeader`, `PrimaryAction`, `FilterBar`, `StatusChip`, `EmptyState`, `EntityDrawer` e `TechnicalTrace`.
- A superficie principal virou central de relacionamento: ativos, em risco, inativos, VIP, ticket medio, potencial de reativacao e decisao sugerida.
- Cards mostram nome, telefone/WhatsApp, status humanizado, ultima visita, valor resumido, sinal comercial, proxima acao e "Ver detalhes".
- Historico completo ficou no drawer por camadas: resumo, historico operacional, relacionamento, acoes e rastreabilidade tecnica.
- IDs tecnicos, score bruto, payload, JSON e dados de auditoria ficaram fora da tela principal.
- WhatsApp foi mantido como acao manual; nenhuma automacao real ou disparo automatico foi criado.
- Build passou; testes falharam no sandbox por `spawn EPERM` e passaram fora do sandbox; smoke API passou.

Prioridade imediata:
1. Fase 1.9 - Servicos e Profissionais em catalogo operacional limpo.
2. Transformar Servicos em catalogo operacional com preco, duracao, status, comissao e profissionais habilitados sem expor tecnica.
3. Transformar Profissionais em visao de capacidade, agenda, desempenho e elegibilidade comercial.
4. Usar drawer progressivo para regras, historico, vinculos e `TechnicalTrace`.
5. Executar checklist visual humano desktop/mobile de Clientes, Comissoes, Auditoria, Financeiro, Estoque, PDV e Agenda antes de release.

## Atualizacao 2026-05-05 (Fase 1.7 - Comissoes em funil operacional limpo)
- Criado `.planning/107_COMISSOES_FUNIL_OPERACIONAL_LIMPO.md`.
- Comissoes passou a usar `PageHeader`, `FilterBar`, `StatusChip`, `EmptyState`, `EntityDrawer`, `TechnicalTrace` e `PrimaryAction`.
- A superficie principal agora mostra pendente, pago no periodo, profissionais pendentes, antigas/vencidas e fila por profissional.
- Origem/status foram humanizados: atendimento finalizado, venda de produto, ajuste manual, pendente, paga e cancelada.
- IDs, referencias, `source` cru, `idempotencyKey`, payload tecnico e vinculos financeiros sairam da lista principal.
- Pagamento continua owner-only, com mesma rota, `idempotencyKey`, confirmacao e mensagens humanas.
- Build passou; testes e smoke falharam no sandbox por bloqueios conhecidos e nao puderam ser reexecutados fora do sandbox por limite da aprovacao automatica.

Prioridade imediata:
1. Fase 1.8 - Clientes em historico progressivo e acao comercial limpa.
2. Transformar Clientes em carteira operacional: ultimo atendimento, recorrencia, risco, oportunidade e proxima acao.
3. Mover IDs, score bruto, automacoes e rastreabilidade para drawer/`TechnicalTrace`.
4. Reexecutar `npm.cmd run test` e `npm.cmd run smoke:api` fora do sandbox quando a aprovacao estiver disponivel.
5. Executar checklist visual humano desktop/mobile de Agenda, PDV, Estoque, Financeiro, Auditoria e Comissoes antes de release.

## Atualizacao 2026-05-04 (Fase 0.9.3 execucao checklist/ambiente alvo)
- Criado `.planning/97_EXECUCAO_CHECKLIST_AMBIENTE_ALVO.md` com decisao final `BLOQUEADO`.
- Build, testes, smoke local e testes DB passaram fora das limitacoes conhecidas do sandbox.
- Smoke local passou com `SMOKE_BASE_URL=http://127.0.0.1:3333`, cobrindo agenda, checkout, venda, historico, devolucao, financeiro, comissoes consultaveis, dashboard e auditoria.
- `.env` segue fora do Git, mas o `.env` local atual nao representa alvo real pronto: falta perfil completo de producao controlada.
- CORS esta implementado/documentado, mas `CORS_ORIGIN` no ambiente alvo ainda nao foi confirmado.
- Backup do banco alvo real e smoke remoto ainda nao foram executados.
- Checklist visual humano desktop/mobile ainda nao foi executado.
- Worktree segue sujo e branch `main` esta ahead de `origin/main` por 1 commit.

Prioridade imediata:
1. Preparar ambiente alvo real: URL, banco PostgreSQL, `.env` de producao controlada, `CORS_ORIGIN` restrito e owner persistente.
2. Confirmar backup do banco alvo com data/hora, responsavel e local seguro antes de schema change.
3. Rodar smoke remoto com `SMOKE_BASE_URL` do alvo.
4. Executar checklist visual humano desktop/mobile.
5. Revisar worktree e criar commits pequenos sem `git add .`; depois executar `git push`.
6. Se qualquer P0/P1 aparecer, abrir Fase 0.9.4 - Correcoes bloqueadoras de release.

## Atualizacao 2026-05-04 (Fase 0.9.2 correcoes/preparacao pre-deploy)
- Criado `.planning/96_CORRECOES_PRE_DEPLOY.md` com a decisao conservadora da Fase 0.9.2.
- CORS foi revalidado: `.env.example` documenta `CORS_ORIGIN`, `src/http/app.ts` restringe quando a variavel existe e mantem dev/local permissivo quando ausente.
- Smoke remoto esta tecnicamente preparado porque `scripts/smoke-api-flow.ps1` aceita `SMOKE_BASE_URL`, unidade e credenciais por variaveis de ambiente.
- `.env` segue ignorado pelo Git e nao aparece no status, mas o `.env` local atual nao representa alvo real pronto: ainda falta perfil completo de producao controlada.
- Checklist visual humano desktop/mobile, backup do banco alvo real e smoke contra o alvo real continuam sem evidencia final.
- Worktree segue com alteracoes nao commitadas; release limpa ainda exige revisao/commit sem segredos.

Prioridade imediata:
1. Executar checklist visual humano desktop/mobile em browser real e registrar resultados no `.planning/96_CORRECOES_PRE_DEPLOY.md`.
2. Validar `.env` no host alvo com `NODE_ENV=production`, `DATA_BACKEND=prisma`, `AUTH_ENFORCED=true`, `AUTH_SECRET` forte, `DATABASE_URL` correta e `CORS_ORIGIN` restrito.
3. Confirmar backup do banco alvo real antes de qualquer `db:push`/migration.
4. Rodar `npm.cmd run smoke:api` contra `SMOKE_BASE_URL` do ambiente alvo.
5. Revisar worktree, commitar somente arquivos permitidos e manter `.env`/segredos fora do Git.

## Atualizacao 2026-05-04 (Fase 0.9.1 checklist visual/pre-deploy)
- Criado `.planning/95_CHECKLIST_VISUAL_PRE_DEPLOY.md` com checklist de desktop, mobile, fluxos operacionais, pre-deploy tecnico, riscos, comandos e decisao.
- CORS foi revisado e deixou de ficar fixo em `origin: true`: `src/http/app.ts` agora aceita `CORS_ORIGIN` opcional para restringir homologacao/producao controlada.
- `.env.example` documenta `CORS_ORIGIN` sem incluir segredo real.
- `.env` real foi confirmado como ignorado pelo Git, sem leitura de valores sensiveis.
- `prisma/seed.ts` foi confirmado como destrutivo e segue proibido em base real.
- `npm.cmd run build`, `npm.cmd run test`, `npm.cmd run smoke:api` e `npm.cmd run test:db` passaram fora do sandbox quando necessario.
- A passada visual humana desktop/mobile nao foi executada nesta rodada; backup do banco alvo real e smoke contra alvo real tambem nao foram confirmados.

Prioridade imediata:
1. Fase 0.9.2 - Correcoes/preparacao pre-deploy: executar evidencia visual humana desktop/mobile, configurar `CORS_ORIGIN`, confirmar backup e rodar smoke contra o ambiente alvo.
2. Liberar deploy controlado real somente depois de checklist visual PASSOU/PARCIAL sem P0/P1, backup confirmado, `.env` real validado fora do Git e smoke remoto aprovado.
3. Se a passada visual encontrar bug P0/P1, corrigir antes de qualquer deploy real.
4. Depois da estabilizacao, priorizar CRUD operacional de usuarios/equipe e vinculo `User -> Professional`.
5. IA/WhatsApp continuam fora da fila ate producao controlada estabilizada.

## Atualizacao 2026-05-04 (Fase 0.9 deploy/producao controlada)
- Criado `.planning/94_DEPLOY_PRODUCAO_CONTROLADA.md` com checklist completo de ambiente, seguranca, banco, build, smoke, visual final, rollback e criterios de bloqueio.
- `.env.example` foi revisado para orientar producao controlada com `DATA_BACKEND=prisma`, `AUTH_ENFORCED=true`, `AUTH_SECRET` forte e sem segredos reais versionados.
- `scripts/smoke-api-flow.ps1` agora aceita URL, unidade e credenciais owner por variaveis `SMOKE_*`, permitindo smoke local ou pos-deploy sem alterar o script.
- `src/http/security.ts` bloqueia `AUTH_SECRET` fraco/dev em `NODE_ENV=production`; webhook de billing tambem bloqueia segredo dev em producao quando usado.
- `prisma/seed.ts` permanece local/dev e deve ser evitado em base real porque limpa dados operacionais.
- `docker-compose.yml` nao existe no workspace atual, embora existam scripts `db:up`/`db:down`.

Prioridade imediata:
1. Executar a ultima passada visual humana desktop/mobile da Fase 0.8.
2. Executar deploy controlado real somente com backup, `.env` real fora do Git, smoke no alvo e confirmacao humana.
3. Se houver bug pos-checklist/deploy, abrir Fase 0.9.1 - Correcoes pos-checklist/deploy.
4. Depois da estabilizacao, priorizar CRUD operacional de usuarios/equipe, vinculo `User -> Professional` e refinamento mobile/UX.
5. IA/WhatsApp continuam fora da fila ate producao controlada estabilizada.

## Atualizacao 2026-05-04 (Fase 0.8 validacao executada parcialmente)
- Criado `.planning/93_VALIDACAO_MANUAL_EXECUCAO.md` com checklist de execucao, evidencias, bugs, severidade e decisao final.
- Encontrado bug P1 no frontend: seletor visual de perfil nao renovava a sessao autenticada real e mantinha token owner.
- Bug P1 corrigido em `public/app.js`: credenciais dev por role, invalidacao de `sb.authSession` ao trocar perfil e validacao de role no cache de auth.
- Smoke operacional passou fora do sandbox cobrindo agenda, checkout, venda de produto, historico, devolucao, financeiro, comissoes consultaveis e auditoria.
- `npm.cmd run build`, `npm.cmd run test` e `npm.cmd run test:db` passaram fora do sandbox; falhas no sandbox permanecem restritas a engine Prisma/rede e `spawn EPERM` do Vite/Rolldown.
- Evidencia visual real de navegador/mobile ainda precisa de ultima passada humana antes do deploy.

Prioridade imediata:
1. Fase 0.9 - Deploy/producao controlada, se a passada visual humana final nao revelar bug P0/P1.
2. Se a passada visual final revelar P0/P1, abrir Fase 0.8.1 - Correcoes pos-validacao manual.
3. Depois da producao controlada, priorizar CRUD operacional de usuarios/equipe e vinculo `User -> Professional`.
4. IA/WhatsApp somente depois da producao controlada estabilizada.

Data: 2026-04-29
Origem: Auditoria pre IA/WhatsApp (`50_AUDITORIA_PRE_IA_WHATSAPP.md`)

## Atualizacao 2026-05-04 (Fase 0.6 implementada)
- Fluxos financeiros criticos no backend Prisma passaram a gravar `AuditLog` dentro da mesma transacao do fato financeiro.
- Foi adotada auditoria transacional direta, sem criar outbox, fila externa ou migration nova.
- Replay idempotente continua sem duplicar efeito de negocio nem evento de auditoria de execucao real.
- Backend memory permanece compativel com auditoria em array.

Prioridade imediata:
1. Validacao manual no navegador dos fluxos criticos com usuario owner/recepcao.
2. Deploy/producao controlada com checklist de ambiente, backup e smoke.
3. CRUD operacional de usuarios/equipe.
4. Vinculo `User -> Professional` para escopo real do perfil profissional.

## Atualizacao 2026-05-04 (Fase 0.7 checklist criado)
- Criado `.planning/92_VALIDACAO_MANUAL_PRODUCAO_CONTROLADA.md` com checklist manual por area: autenticacao, permissoes, agenda, PDV, financeiro, comissoes, estoque, auditoria, mobile e smoke operacional completo.
- Adicionado checklist de producao controlada cobrindo ambiente, banco, seguranca, operacao e observabilidade.
- Smoke API revisado para exercitar checkout real, venda de produto, historico de vendas, devolucao, financeiro, comissoes consultaveis e auditoria.
- Frontend recebeu ajustes pequenos de mensagens operacionais para permissao, idempotencia, devolucao acima do vendido e estorno invalido.

Prioridade imediata:
1. Executar validacao manual real no navegador com owner, recepcao e profissional.
2. Se nao houver bug P0/P1, preparar deploy/producao controlada.
3. Se a validacao mobile revelar friccao, priorizar refinamento mobile/UX pontual.
4. Em seguida, CRUD operacional de usuarios/equipe e vinculo `User -> Professional`.
5. IA/WhatsApp somente depois da producao controlada estabilizada.

## P0 - Obrigatorio antes da IA
1. Devolucao/estorno rastreavel
- Criar refund parcial/total preservando venda original, financeiro negativo, movimento reverso de estoque e ajuste de comissao.

2. Endurecer financeiro como fonte de verdade
- Definir e implementar tratamento contabil de comissao (provisao/pagamento) de forma reconciliavel no financeiro.

3. Auditoria persistente
- Migrar eventos de auditoria de memoria para tabela append-only.

4. Usuarios e seguranca SaaS minima
- Criar usuarios persistentes, hash de senha, status e governanca de acesso.

5. CRUD completo de profissionais
- Criar, editar, inativar e listar com regras de permissao.

6. Completar CRUD de clientes
- Adicionar update/archive e trilha de auditoria.

7. Matriz de permissao por perfil com testes automatizados
- Cobrir Dono, Recepcao e Profissional por endpoint sensivel.

## P1 - Importante antes da IA
1. Completar CRUD de metodos de pagamento
- Adicionar archive/delete seguro preservando metodo padrao valido.

2. Fortalecer historico do cliente para automacao
- Expor explicitamente faltas, recorrencia e frequencia no contrato de cliente.

3. Expandir testes de agenda para cancel/no-show
- Validar efeitos colaterais de negocio e relatorios.

## P2 - Pode ficar para depois
1. Padronizar estados de erro e vazio
- Remover placeholders genericos e normalizar mensagens de indisponibilidade.

2. Melhorar consistencia visual dos estados de fallback
- Tornar feedback operacional mais claro para recepcao.

## P3 - Melhoria futura
1. Otimizacoes de UX e observabilidade
- Dashboards operacionais de excecoes e health-check de fluxo.

## Atualizacao 2026-04-29 (pos checkout unificado)
- P0 item `Fechamento unificado de atendimento` foi implementado e endurecido com validacoes de pagamento obrigatorio, total consistente e estoque no fluxo da Agenda.
- Proximo foco recomendado: endurecer trilha contabil de comissoes pagas (provisao -> pagamento -> conciliacao) e ampliar cobertura de testes de autorizacao/perfil nos endpoints novos.

## Atualizacao 2026-04-29 (incidente conflito de horario)
- Reincidencia de falso conflito na Agenda foi tratada com consolidacao da regra de sobreposicao real no backend.
- Prioridade imediata sugerida:
1. Executar smoke diario com cenarios de agenda em `DATA_BACKEND=memory` e `DATA_BACKEND=prisma`.
2. Padronizar nomenclatura de status operacional (`IN_SERVICE` vs `IN_PROGRESS`) no roadmap de compatibilidade para reduzir risco de integracao futura.

## Atualizacao 2026-04-29 (financeiro operacional)
- Entregue a visualizacao detalhada de lancamentos na aba Financeiro, removendo placeholder generico.
- `GET /financial/transactions` agora aceita `businessId` como alias de `unitId` para reduzir risco de retorno vazio por divergencia de contrato entre clientes.
- Proximas prioridades recomendadas:
1. Adicionar filtro por origem (`SERVICE`, `PRODUCT`, `MANUAL`) na UI do Financeiro sem alterar endpoint.
2. Exibir agrupamento opcional diario/semanal para leitura executiva rapida do caixa.

## Atualizacao 2026-05-01 (Fase 0.1 idempotencia)
- Implementada idempotencia transacional em checkout, venda de produto, lancamento financeiro manual e pagamento de comissao.
- Criadas constraints de banco para financeiro, comissoes, vendas e movimentos de estoque por origem critica.
- Proximas prioridades recomendadas:
1. Fase 0.2: devolucao/estorno rastreavel.
2. Fase 0.3: pagamento de comissao gerando despesa financeira reconciliavel.
3. Fase 0.4: auditoria persistente append-only.

## Atualizacao 2026-05-01 (auditoria pos-idempotencia)
- Parecer da auditoria: APROVADO COM RESSALVAS.
- Antes de avancar para Fase 0.2, tratar riscos operacionais:
1. Tornar `idempotencyKey` obrigatoria nas rotas criticas ou garantir geracao automatica confiavel no frontend/API client.
2. Adicionar teste dedicado para idempotencia de `POST /financial/manual-entry`.
3. Resolver o `EPERM` do `prisma generate` em Windows/OneDrive e limpar arquivos temporarios `.tmp*` do client Prisma.
4. Executar `npm.cmd run test:db` com PostgreSQL real para validar constraints e concorrencia fora do backend em memoria.

## Atualizacao 2026-05-02 (ressalvas de idempotencia resolvidas)
- `idempotencyKey` agora e obrigatoria em checkout, venda de produto, transacao financeira, lancamento manual e pagamento de comissao.
- Frontend gera chave por tentativa de operacao critica.
- `/financial/manual-entry` tem teste dedicado de replay idempotente e conflito 409 por payload divergente.
- `npm.cmd run test`, `npm.cmd run build`, `npm.cmd run smoke:api` e `npm.cmd run test:db` passaram.
- EPERM em Windows/OneDrive fica como risco operacional local documentado, nao como bloqueio de maturidade.

Prioridade imediata apos validacao final da Fase 0.1.1:
1. Financeiro profissional: pagamento de comissao gerando despesa reconciliavel, estornos/devolucoes rastreaveis e conciliacao operacional.
2. Auditoria persistente append-only para substituir a trilha em memoria nos eventos sensiveis.
3. Usuarios persistentes e governanca de acesso SaaS minima somente depois de estabilizar financeiro/auditoria.

## Atualizacao 2026-05-02 (planejamento Fase 0.2)
- Criado o plano tecnico `.planning/83_FINANCEIRO_AUDITORIA_PLANO.md`.
- Nenhuma regra de negocio foi alterada nesta etapa.
- Ordem recomendada para execucao:
1. Fase 0.2.1: pagamento de comissao como despesa financeira reconciliavel.
2. Fase 0.2.2: estorno/devolucao rastreavel para atendimento e venda de produto.
3. Fase 0.2.3: auditoria persistente append-only.
4. Fase 0.2.4: testes, concorrencia e validacao com PostgreSQL real.

Prioridade imediata:
1. Implementar primeiro a despesa financeira atomica no pagamento de comissao.
2. Em seguida, criar o modelo de refund/estorno sem apagar venda ou receita original.
3. Depois, persistir `AuditLog` e migrar `/audit/events` para leitura em banco no backend Prisma.

## Atualizacao 2026-05-02 (Fase 0.2.1 implementada)
- Pagamento de comissao agora cria despesa financeira reconciliavel.
- A despesa fica rastreavel por `referenceType=COMMISSION`, `referenceId=<commissionId>` e `source=COMMISSION`.
- Replay idempotente nao duplica despesa e payload divergente com a mesma chave permanece retornando `409`.
- `npm.cmd run test`, `npm.cmd run build`, `npm.cmd run smoke:api` e `npm.cmd run test:db` passaram.

Prioridade imediata:
1. Fase 0.2.2 - Estornos/devolucoes rastreaveis.
2. Fase 0.2.3 - Auditoria persistente append-only.
3. Fase 0.2.4 - Validacao de concorrencia e constraints em PostgreSQL real para os novos fluxos.

## Atualizacao 2026-05-02 (Fase 0.2.2 implementada)
- Estorno de atendimento concluido agora cria `Refund` e `FinancialEntry EXPENSE` com `source=REFUND`.
- Devolucao de produto agora cria `Refund`, `RefundItem`, despesa reversa e `StockMovement IN`.
- Receitas, vendas e movimentos originais nao sao apagados.
- Replay idempotente nao duplica financeiro nem estoque; payload divergente com mesma chave retorna `409`.
- `npm.cmd run test`, `npm.cmd run build`, `npm.cmd run smoke:api` e `npm.cmd run test:db` passaram.

Prioridade imediata:
1. Fase 0.2.3 - Auditoria persistente append-only.
2. Fase 0.2.4 - Validacao ampliada de concorrencia e constraints em PostgreSQL real.
3. Usuarios persistentes e governanca de acesso SaaS minima somente depois de estabilizar auditoria.

## Atualizacao 2026-05-02 (Fase 0.2.3 implementada)
- Criado `AuditLog` persistente append-only no Prisma.
- Criado `AuditRecorder` central com escrita em Prisma ou memoria.
- Eventos de acoes criticas agora carregam actor, role, email, unidade, rota, metodo, requestId/correlation-id, idempotencyKey, before/after e metadata quando informado.
- `GET /audit/events` consulta eventos por unidade, e fica restrito a owner.
- Replay idempotente nao duplica evento principal para a mesma acao/entidade.
- `npm.cmd run db:generate`, `npm.cmd run test`, `npm.cmd run build`, `npm.cmd run smoke:api` e `npm.cmd run test:db` passaram.

Prioridade imediata:
1. Fase 0.2.4 - Validacao PostgreSQL real/robustez para constraints, concorrencia e replays.
2. Evoluir auditoria transacional/outbox para fluxos financeiros criticos.
3. Usuarios persistentes e permissoes refinadas apos estabilizar a robustez do core.

## Atualizacao 2026-05-03 (Fase 0.2.4 implementada)
- PostgreSQL real validado com `DATA_BACKEND=prisma` e `RUN_DB_TESTS=1`.
- `db:push` confirmou banco local `barbearia` sincronizado com `schema.prisma`.
- Testes DB agora cobrem comissao concorrente, replay idempotente simultaneo, payload divergente, refund concorrente, checkout concorrente e auditoria persistente.
- Refund concorrente de produto foi endurecido com lock `FOR UPDATE` na venda antes de calcular saldo devolvivel.
- Auditoria idempotente no Prisma foi endurecida com advisory lock para evitar evento duplicado em replay simultaneo.
- `npm.cmd run db:generate`, `npm.cmd run db:push`, `npm.cmd run test`, `npm.cmd run build`, `npm.cmd run smoke:api` e `npm.cmd run test:db` passaram fora do sandbox quando necessario.

Prioridade imediata:
1. Usuarios persistentes e permissoes refinadas.
2. Outbox/auditoria transacional para fluxos financeiros criticos.
3. Tenant guard produto/estoque como hardening complementar.

## Atualizacao 2026-05-03 (Fase 0.3 implementada)
- Criados usuarios persistentes no Prisma com `User` e `UserUnitAccess`.
- Login com `DATA_BACKEND=prisma` passa a validar usuario ativo, hash de senha, unidades autorizadas e `activeUnitId`.
- Seed cria `owner@barbearia.local`, `recepcao@barbearia.local` e `profissional@barbearia.local` com `passwordHash`.
- Mantido fallback dev/memory para nao quebrar fluxo local e smoke.
- Financeiro global e pagamento de comissao ficaram restritos a owner.
- Tenant guard por query/body foi validado em PostgreSQL real.
- `npm.cmd run db:generate`, `npm.cmd run db:push`, `npm.cmd run test`, `npm.cmd run build`, `npm.cmd run smoke:api` e `npm.cmd run test:db` passaram fora do sandbox quando necessario.

Prioridade imediata:
1. Frontend operacional dos fluxos criticos.
2. Tenant guard produto/estoque mais profundo.
3. Outbox/auditoria transacional para fluxos financeiros criticos.
4. Deploy/producao controlada.

## Atualizacao 2026-05-03 (Fase 0.4 implementada)
- Frontend operacional criado para auditoria, estorno de atendimento, devolucao de produto, financeiro rastreavel e comissoes.
- Auditoria entrou no menu como owner-only e consome `GET /audit/events`.
- Agenda/Central de agendamentos agora expõe estorno para appointment `COMPLETED` com `idempotencyKey`.
- PDV permite devolucao dos produtos vendidos na sessao com `idempotencyKey`.
- Financeiro exibe origem tecnica dos lancamentos e destaca comissao/refund.
- Comissoes exibem status e pagamento owner-only.
- Recepcao/profissional tiveram menus sensiveis ocultados visualmente.

Prioridade imediata:
1. Hardening de tenant guard em produto/estoque por path.
2. Historico/listagem operacional de vendas antigas para permitir devolucao fora da sessao atual.
3. Outbox/auditoria transacional para fluxos financeiros criticos.
4. Validacao manual mobile/browser dos novos fluxos em ambiente com dados reais.

## Atualizacao 2026-05-05 (Fase 1.0 - UX/frontend iniciada)
- Criado `.planning/100_MAPEAMENTO_FRONTEND_BACKEND_FUNIL_UX.md`.
- A macrofase frontend/UX deve evoluir o produto por camadas, sem transformar o sistema em dashboard poluido.
- Regra principal: tela operacional mostra decisao e proxima acao; rastreabilidade tecnica fica em detalhe, drawer tecnico ou Auditoria.
- Principais riscos atuais: Financeiro expondo `source/referenceType/referenceId`, Auditoria iniciando tecnica demais, Central de agendamentos com excesso de KPIs, Automacoes/Fidelizacao densas e mobile ainda muito dependente de listas/filtros.

Prioridade imediata:
1. Fase 1.1 - Design system e contratos de camada: `PageHeader`, `PrimaryAction`, `FilterBar`, `EntityDrawer`, `TechnicalTrace`, `EmptyState`, `StatusChip`.
2. Fase 1.2 - Financeiro limpo: mover rastreabilidade para detalhe sob demanda.
3. Fase 1.3 - Agenda funil operacional: agenda do dia, proximo atendimento e historico separados por camada.
4. Fase 1.4 - PDV premium com historico/devolucao em drawer.
5. Fase 1.5 - Auditoria owner como timeline amigavel com filtros avancados recolhidos.

## Atualizacao 2026-05-04 (Fase 0.5 implementada)
- Criado `GET /sales/products` para historico operacional de vendas de produto por unidade.
- PDV agora consome o historico e permite devolucao de venda antiga, fora da sessao atual.
- Tenant guard por path foi reforcado em devolucao de produto, estoque manual, overview de estoque e ficha tecnica de consumo.
- Corrigido vazamento de totais/produtos de estoque entre unidades no overview.
- `npm.cmd run test`, `npm.cmd run build`, `npm.cmd run smoke:api` e `npm.cmd run test:db` passaram fora do sandbox quando necessario.

Prioridade imediata:
1. Outbox/auditoria transacional para fluxos financeiros criticos.
2. CRUD operacional de usuarios/equipe.
3. Deploy/producao controlada com checklist de smoke manual.

## Atualizacao 2026-05-05 (Fase 1.1 - Design System Operacional e Contratos UX)
- Criado `.planning/101_DESIGN_SYSTEM_CONTRATOS_UX.md` com contratos de uso, regra de funil operacional, mobile, rastreabilidade tecnica e reuso SaaS por segmento.
- Criado `public/components/operational-ui.js` com `PageHeader`, `PrimaryAction`, `FilterBar`, `EntityDrawer`, `TechnicalTrace`, `EmptyState` e `StatusChip`.
- Adicionados estilos responsivos em `public/styles/layout.css` para a nova camada operacional.
- Nenhuma tela critica foi removida, nenhuma regra de negocio foi alterada e a rastreabilidade tecnica foi preservada.
- Componentes adicionais foram avaliados e adiados para evitar base generica demais nesta etapa.

Prioridade imediata:
1. Fase 1.2 - Agenda e Checkout em funil operacional premium.
2. Aplicar primeiro `PageHeader`, `PrimaryAction`, `FilterBar`, `EntityDrawer`, `EmptyState` e `StatusChip` na Agenda sem alterar endpoints.
3. Transformar Checkout em fluxo guiado com uma acao dominante e `TechnicalTrace` oculto para idempotencia/financeiro/auditoria.
4. Depois, evoluir Financeiro para esconder `source/referenceType/referenceId` em detalhe sob demanda.
5. Manter deploy/producao controlada bloqueado ate checklist visual humano, backup alvo, `.env` alvo e smoke remoto.

## Atualizacao 2026-05-05 (Fase 1.2 - Agenda e Checkout em funil operacional premium)
- Criado `.planning/102_AGENDA_CHECKOUT_FUNIL_PREMIUM.md`.
- Agenda passou a usar contratos da Fase 1.1: `PageHeader`, `PrimaryAction`, `FilterBar`, `StatusChip`, `EmptyState`, `EntityDrawer` e `TechnicalTrace`.
- Filtros essenciais da Agenda ficaram visiveis; filtros avancados foram recolhidos.
- Cards/listas agora priorizam horario, cliente, servico, profissional, status, valor e proxima acao.
- Detalhe do agendamento foi movido para drawer progressivo com resumo, acoes, historico e rastreabilidade tecnica recolhida.
- Checkout foi reorganizado com total em destaque, metodo de pagamento, produtos adicionais recolhiveis e acao primaria "Finalizar atendimento".
- `idempotencyKey` segue sendo enviada nas operacoes criticas, sem aparecer para o usuario comum.
- Nenhuma regra de negocio, dominio, schema Prisma, financeiro, estoque, comissao, auditoria, permissoes ou tenant guard foi alterada.

Prioridade imediata:
1. Fase 1.3 - PDV, Historico de Vendas e Devolucoes em funil operacional premium.
2. Aplicar drawer progressivo para vendas antigas e devolucoes, mantendo rastreabilidade tecnica recolhida.
3. Depois, evoluir Financeiro para esconder `source/referenceType/referenceId` em detalhe sob demanda.
4. Executar checklist visual humano desktop/mobile antes de qualquer release.
5. Manter deploy/producao controlada bloqueado ate backup alvo, `.env` alvo e smoke remoto.

## Atualizacao 2026-05-05 (Fase 1.3 - PDV, Historico de Vendas e Devolucoes em funil operacional premium)
- Criado `.planning/103_PDV_HISTORICO_DEVOLUCOES_FUNIL_PREMIUM.md`.
- PDV passou a ser tarefa-primeiro: produto, quantidade, carrinho, total e acao "Cobrar venda".
- Historico de vendas ficou compacto, com data, cliente, total, status e acoes "Ver detalhes" / "Devolver".
- Detalhe da venda passou para `EntityDrawer`, com resumo, itens, impactos financeiro/estoque e `TechnicalTrace` recolhido.
- Devolucao de produto ficou guiada por quantidade vendida, devolvida e disponivel, sem expor ID tecnico na superficie.
- `idempotencyKey` segue enviada em venda e devolucao, sem aparecer para usuario comum.
- Build passou; testes e smoke passaram fora do sandbox apos falhas conhecidas de `spawn EPERM`/Prisma no sandbox.

Prioridade imediata:
1. Fase 1.4 - Estoque rastreavel sem poluicao visual.
2. Aplicar drawer progressivo para produto, ficha tecnica, movimentos, referencias e auditoria.
3. Manter a tela principal do Estoque focada em busca, status, quantidade e acoes operacionais.
4. Depois, evoluir Financeiro para esconder `source/referenceType/referenceId` em detalhe sob demanda.
5. Executar checklist visual humano desktop/mobile antes de qualquer release.

## Atualizacao 2026-05-05 (Fase 1.4 - Estoque rastreavel sem poluicao visual)
- Criado `.planning/104_ESTOQUE_RASTREAVEL_SEM_POLUICAO_VISUAL.md`.
- Estoque passou a usar `PageHeader`, `PrimaryAction`, `FilterBar`, `StatusChip`, `EmptyState`, `EntityDrawer` e `TechnicalTrace`.
- Produtos sem estoque, criticos e com estoque baixo passaram a aparecer primeiro.
- A lista principal ficou limpa: produto, categoria, quantidade atual, minimo, status, sugestao e acoes.
- Movimentacoes ficaram humanizadas para venda, devolucao, ajuste manual, perda, consumo interno e consumo por servico.
- `productId`, `stockMovementId`, `referenceType` e `referenceId` foram movidos para `TechnicalTrace` recolhido.
- Ajuste de estoque ficou mais explicito para entrada, saida e ajuste de saldo final.
- Build passou; testes e smoke falharam no sandbox por bloqueios conhecidos (`spawn EPERM` e Prisma/binaries) e nao puderam ser reexecutados fora do sandbox por limite de aprovacao automatica.

Prioridade imediata:
1. Fase 1.5 - Financeiro conciliado e limpo.
2. Esconder `source`, `referenceType`, `referenceId`, `professionalId` e rastreabilidade financeira em `TechnicalTrace`.
3. Manter conciliacao visual com checkout, PDV, devolucao e comissoes sem transformar Financeiro em tela tecnica.
4. Executar validacao visual humana desktop/mobile de Agenda, PDV e Estoque antes de release.
5. Reexecutar `npm.cmd run test` e `npm.cmd run smoke:api` fora do sandbox quando a aprovacao estiver disponivel.

## Atualizacao 2026-05-05 (Fase 1.5 - Financeiro conciliado e limpo)
- Criado `.planning/105_FINANCEIRO_CONCILIADO_LIMPO.md`.
- Financeiro passou a usar `PageHeader`, `PrimaryAction`, `FilterBar`, `StatusChip`, `EmptyState`, `EntityDrawer` e `TechnicalTrace`.
- A superficie principal agora prioriza Entradas, Saidas, Saldo, Resultado, principais origens e lista resumida.
- Origens financeiras foram humanizadas para atendimento finalizado, venda de produto, comissao paga, estorno, devolucao e lancamento manual.
- `source`, `referenceType`, `referenceId`, `professionalId`, `customerId`, `appointmentId`, `productSaleId` e `idempotencyKey` ficaram fora da lista principal.
- Detalhe do lancamento passou a mostrar resumo, vinculos operacionais, impacto conciliado e rastreabilidade tecnica recolhida.
- Lancamento manual manteve idempotencia e recebeu mensagens humanas.
- Build passou; testes e smoke falharam no sandbox por bloqueios conhecidos e passaram fora do sandbox.

Prioridade imediata:
1. Fase 1.6 - Auditoria em timeline legivel e nao tecnica.
2. Transformar eventos tecnicos em linha do tempo com labels humanos, ator, horario e entidade amigavel.
3. Manter payloads, before/after, requestId, entityId e idempotencyKey recolhidos.
4. Aplicar filtros essenciais e avancados recolhidos na Auditoria.
5. Executar checklist visual humano desktop/mobile de Agenda, PDV, Estoque e Financeiro antes de release.

## Atualizacao 2026-05-05 (Fase 1.6 - Auditoria em timeline legivel e nao tecnica)
- Criado `.planning/106_AUDITORIA_TIMELINE_LEGIVEL.md`.
- Auditoria passou a usar `PageHeader`, `FilterBar`, `StatusChip`, `EmptyState`, `EntityDrawer` e `TechnicalTrace`.
- A superficie principal virou timeline agrupada por Hoje, Ontem e data, ordenada do evento mais recente para o mais antigo.
- Actions tecnicas foram humanizadas para linguagem operacional com fallback conservador.
- Cards mostram ator, perfil, acao, modulo, impacto, sensibilidade e "Ver detalhes".
- IDs, rota, metodo, requestId, idempotencyKey, before/after e metadata ficaram fora da superficie principal.
- O drawer do evento organiza resumo, contexto operacional, antes/depois e rastreabilidade tecnica recolhida.
- Build passou; testes e smoke falharam no sandbox por bloqueios conhecidos e passaram fora do sandbox.

Prioridade imediata:
1. Fase 1.7 - Comissoes em funil operacional limpo.
2. Mostrar pendencias, pagamentos e impacto financeiro de comissoes sem expor IDs/referencias na superficie.
3. Usar drawer para detalhe da comissao, vinculo com atendimento/venda/profissional e `TechnicalTrace`.
4. Manter pagamento de comissao owner-only e preservar permissao atual por perfil.
5. Executar checklist visual humano desktop/mobile de Agenda, PDV, Estoque, Financeiro e Auditoria antes de release.

