## Atualizacao 2026-05-06 (Fase 1.29 - Homologacao final assistida para release controlado interno)
- Criado `.planning/129_HOMOLOGACAO_FINAL_RELEASE_CONTROLADO_INTERNO.md`.
- Criado `.planning/evidence/fase-129/MANIFEST.md`.
- Decisao final: BLOQUEADO.
- Validacoes locais continuam saudaveis (`build`, `test` fora do sandbox, `smoke:api`).
- Gate de `test:db` permaneceu fechado por seguranca: sem comprovacao objetiva de banco isolado/descartavel.
- Nao houve evidencia de smartphone fisico real, VPS/host real, `.env` real forte, backup/restore real e smoke remoto com URL real.
- Release controlado interno NAO pode ser aprovado sem fechar os gates criticos.

Prioridade imediata:
1. Executar janela assistida com smartphone fisico real na mesma rede e checklist completo por fluxo.
2. Comprovar banco de teste isolado (nome, URL, isolamento e descarte) e somente entao rodar `npm.cmd run test:db`.
3. Validar VPS/host real: acesso, runtime, processo (PM2/Docker/servico), porta, firewall, proxy e acesso externo.
4. Validar `.env` real forte sem expor segredos: `DATA_BACKEND=prisma`, `AUTH_SECRET` forte, `CORS_ORIGIN`, `NODE_ENV`, `PORT`, `LOG_LEVEL`, estrategia de usuarios reais.
5. Comprovar backup e restore de PostgreSQL em banco separado.
6. Executar smoke remoto completo com `SMOKE_BASE_URL` real e registrar evidencia.
7. Reavaliar decisao de release controlado interno somente apos fechamento de todos os gates.

Nao priorizar agora:
1. Novas features.
2. Redesign.
3. Mudancas de contrato/API/regra de negocio sem incidente critico.
4. Alteracoes em Prisma/migrations fora de necessidade objetiva de release.
## Atualizacao 2026-05-06 (Fase 1.28 - Homologacao fisica mobile operacional + microajustes finais)
- Criado `.planning/128_HOMOLOGACAO_FISICA_MOBILE_OPERACIONAL.md`.
- Criado `.planning/evidence/fase-128/MANIFEST.md`.
- Decisao final: aprovado com ressalvas.
- Fluxos mobile principais permanecem operacionais sem regressao tecnica em build/test/smoke.
- Nao houve mudanca de backend, banco, contratos ou arquitetura.
- Rodada fisica completa em smartphone real nao foi concluida nesta sessao, mantendo ressalva obrigatoria.
- `test:db` segue pendente por seguranca ate comprovacao explicita de base isolada/descartavel.

Prioridade imediata:
1. Fase 1.29 - homologacao assistida em celular fisico real na rede local (Android e/ou iOS), com checklist por fluxo.
2. Validar teclado mobile real, conforto de toque e scroll em Agenda, Novo Agendamento, PDV, Dashboard e modais.
3. Aplicar apenas microajustes finais de spacing/touch/contraste/alinhamento se surgirem no teste fisico.
4. Preservar escopo: sem redesign, sem novos blocos e sem alteracoes de backend.
5. Executar `npm.cmd run test:db` somente apos evidencia de banco de teste isolado.

Nao priorizar agora:
1. Mudancas de regras de negocio.
2. Novos modulos ou KPIs.
3. Refactor estrutural amplo.
4. Alteracoes em Prisma, migrations ou contratos de API.
## Atualizacao 2026-05-06 (Fase 1.25 - Homologacao visual real completa + correcoes frontend premium)
- Criado `.planning/125_HOMOLOGACAO_VISUAL_REAL_FRONTEND_PREMIUM.md`.
- Criada evidencia `.planning/evidence/fase-125/MANIFEST.md`.
- Decisao final: bloqueado.
- Frontend recebeu hardening visual controlado em `public/styles/layout.css` (responsividade, filtros, tabelas, modais e ajuste mobile).
- `build`, `test` (fora do sandbox) e `smoke:api` passaram; `/`, `/app.js`, `/styles/layout.css` e `/health` responderam `200`.
- Bloqueios remanescentes: homologacao visual humana/browser completa desktop+mobile por tela e comprovacao de banco isolado para `test:db`.

Prioridade imediata:
1. Fase 1.26 - Executar homologacao visual humana/browser completa por modulo (desktop 1366+ e mobile ~390).
2. Registrar checklist por tela com classificacao objetiva (`aprovado`, `aprovado com ressalvas`, `ajuste leve`, `bloqueante`).
3. Provisionar banco de teste dedicado/descartavel (nome e credenciais exclusivas de teste) para liberar `npm.cmd run test:db` com seguranca.
4. Reexecutar `test:db` somente apos evidencia objetiva do isolamento.

Nao priorizar agora:
1. Mudancas de backend, Prisma ou contratos.
2. Refactor arquitetural amplo.
3. Novas features.
## Atualizacao 2026-05-06 (Fase 1.24 - Validacao visual assistida e test:db em banco isolado)
- Criado `.planning/124_VALIDACAO_VISUAL_PREMIUM_TESTDB_ISOLADO.md`.
- Criado `.planning/evidence/fase-124/MANIFEST.md`.
- Decisao final: bloqueado.
- `build`, `test` (fora do sandbox) e `smoke:api` passaram; servidor/assets responderam `200`.
- Bloqueios remanescentes: validacao visual humana desktop/mobile completa pendente e `test:db` nao executado por falta de comprovacao de banco isolado/safe.

Prioridade imediata:
1. Fase 1.25 - Homologacao visual real completa por tela (desktop + mobile) com evidencias.
2. Definir banco de teste dedicado e descartavel para `test:db` (ex.: nome `*_test`, acesso restrito e sem dados reais).
3. Executar `npm.cmd run test:db` somente apos comprovacao objetiva de isolamento.
4. Registrar classificacao visual por tela: aprovado, aprovado com ressalvas, ajuste leve, redesign futuro, bloqueante.
5. Consolidar decisao final de polimento premium com base na passada visual real.

Nao priorizar agora:
1. Novas features.
2. Redesign amplo.
3. Mudancas de backend/schema.
## Atualizacao 2026-05-06 (Fase 1.22 - Execucao assistida no host interno real)
- Criado `.planning/122_EXECUCAO_ASSISTIDA_HOST_INTERNO_REAL.md`.
- Decisao final: bloqueado para release controlado interno real.
- Validacao tecnica local passou em `build` e `smoke:api`; `test` passou fora do sandbox (`70 passed | 11 skipped`).
- `test:db` segue pendente para evidencia final em ambiente isolado explicitamente validado, pois a reexecucao fora do sandbox foi barrada por risco de escrita em banco nao comprovadamente de teste.
- Bloqueios P0 permanecem: host interno real nao informado, `.env` real forte nao validado no alvo, PostgreSQL alvo e backup/restore nao comprovados, smoke remoto sem `SMOKE_BASE_URL` real e checklist visual desktop/mobile no host real nao executado.

Prioridade imediata:
1. Fase 1.23 - Homologacao assistida no host interno real (janela controlada).
2. Informar URL/protocolo/host/porta e tipo do ambiente alvo (LAN/VPS/servidor interno/tunel).
3. Validar `.env` real no host sem expor segredos (`DATA_BACKEND=prisma`, `DATABASE_URL`, `AUTH_SECRET` forte, `AUTH_ENFORCED=true`, `CORS_ORIGIN` restrito, `NODE_ENV`, `PORT`).
4. Comprovar backup + restore do PostgreSQL alvo antes de alteracao estrutural.
5. Rodar smoke remoto com `SMOKE_BASE_URL` real.
6. Executar checklist visual desktop/mobile por perfil (owner, recepcao, profissional).
7. Reavaliar decisao de release com criterio P0: aprovado, aprovado com ressalvas ou bloqueado.

Nao priorizar agora:
1. IA/WhatsApp.
2. Multi-segmento.
3. Excel/PDF.
4. Redesign grande.
5. Refactor amplo de `public/app.js`.
# Next Priorities

## Atualizacao 2026-05-06 (Fase 1.21 - Ambiente interno e release candidate operacional)
- Criado `.planning/121_AMBIENTE_INTERNO_RELEASE_CANDIDATE_OPERACIONAL.md`.
- Decisao final: bloqueado para release controlado interno real.
- Hardening de fase concluido no pacote: `dotenv` sem override, CORS restritivo via `CORS_ORIGIN`, guard de `AUTH_SECRET` em producao, smoke com `401/403` basicos e alerta de seed destrutivo.
- `.env.example` revisado para reduzir ambiguidade operacional sem expor segredo real.
- Falta o principal bloqueio P0: ambiente alvo interno real com URL/host definido, `.env` forte validado no alvo, PostgreSQL alvo com backup/restore comprovado, smoke remoto e checklist visual desktop/mobile no host real.

Prioridade imediata:
1. Fase 1.22 - Execucao assistida no host interno real (sem expandir escopo de feature).
2. Definir URL/protocolo/porta do host interno e responsavel operacional.
3. Validar `.env` real no host (sem revelar valores) com `DATA_BACKEND=prisma`, `AUTH_ENFORCED=true`, `AUTH_SECRET` forte, `CORS_ORIGIN` restrito e `DATABASE_URL` valida.
4. Confirmar backup/restore do PostgreSQL alvo antes do release.
5. Rodar smoke remoto completo com `SMOKE_BASE_URL` e registrar evidencias.
6. Executar checklist visual desktop/mobile por perfil (owner/recepcao/profissional).
7. Reavaliar decisao de release: aprovado, aprovado com ressalvas ou bloqueado.

Nao priorizar agora:
1. IA/WhatsApp real.
2. Novas features comerciais.
3. Multi-segmento amplo.
4. Excel/PDF.
5. Redesign grande.

## Atualizacao 2026-05-06 (Fase 1.20 - Analise completa de maturidade e roadmap)
- Criado `.planning/120_ANALISE_COMPLETA_MATURIDADE_PROJETO_ROADMAP.md`.
- Decisao final: aprovado para continuar evolucao local e validacao interna assistida quando houver ambiente; bloqueado para release controlado real; nao pronto comercialmente.
- Classificacao de maturidade: beta interno. O produto esta acima de MVP operacional, mas abaixo de release controlado/comercial por bloqueios de ambiente, release, seguranca operacional e consolidacao frontend.
- Core forte: agenda, checkout, financeiro, estoque, comissoes, auditoria, idempotencia, tenant guard, permissoes e relatorios locais.
- Fragilidades principais: ambiente alvo ausente, `.env` real nao validado, PostgreSQL alvo/backup indefinidos, Tailwind CDN, `public/app.js` grande, services/backend muito extensos e documentacao superfragmentada.
- Validacoes: `build` passou; `test` e `test:db` falharam no sandbox por `spawn EPERM` e passaram fora do sandbox; `smoke:api` passou; `git diff --check` passou com warnings LF/CRLF.

Prioridade imediata:
1. Fase 1.21 - Ambiente interno real e release candidate operacional: definir host/URL, PostgreSQL alvo, backup/restore, `.env` forte, CORS restrito e smoke remoto.
2. Fase 1.22 - Saneamento frontend de release: remover Tailwind CDN e iniciar extracao incremental de `public/app.js` sem redesenhar telas.
3. Fase 1.23 - Fechamento operacional financeiro/comissoes/estoque: fechamento mensal, regra para estorno apos comissao paga, compras/fornecedores/inventario minimo.

Nao priorizar agora:
1. IA/WhatsApp real antes de ambiente e release interno.
2. Multi-segmento amplo antes de validar barbearia em uso real.
3. Excel/PDF antes de feedback real do CSV backend.
4. Redesign grande antes de estabilizar deploy, CSS e modularizacao incremental.


## Atualizacao 2026-05-06 (Fase 1.19 - Provisionamento e validacao real do ambiente interno)
- Criado `.planning/119_PROVISIONAMENTO_VALIDACAO_AMBIENTE_INTERNO.md`.
- Decisao final: bloqueado para release controlado dos Relatorios em ambiente interno.
- Nao houve URL alvo real informada; portanto nao foi possivel validar host interno, protocolo, porta, frontend real, CORS real, banco alvo ou backup.
- `.env` local existe e esta fora do Git, mas continua dev: `DATA_BACKEND=memory`, `NODE_ENV=development`, `AUTH_SECRET` fraco para release e `CORS_ORIGIN` ausente.
- `db:generate` reproduziu EPERM no Prisma Client; foi saneado encerrando somente o listener local da porta `3333` e limpando temporarios do Prisma dentro do workspace.
- Build, `db:generate`, testes, `test:db` e smoke atualizado passaram fora do sandbox.
- Smoke atualizado passou em `SMOKE_BASE_URL=http://127.0.0.1:3334`, incluindo CSV `type=clients`.
- Nenhuma feature, regra, schema, permissao ou UI foi alterada nesta fase.

Prioridade imediata:
1. Fase 1.20 - Execucao assistida no host interno definido.
2. Informar URL alvo real, porta, protocolo, natureza do host e quem acessa.
3. Configurar `.env` do alvo fora do Git com `DATA_BACKEND=prisma`, `DATABASE_URL` correta, `AUTH_SECRET` forte, `CORS_ORIGIN` restrito e `NODE_ENV` coerente.
4. Confirmar banco PostgreSQL alvo, migrations aplicadas por procedimento seguro e backup antes de qualquer uso real.
5. Rodar `$env:SMOKE_BASE_URL="<URL_ALVO>"; npm.cmd run smoke:api` no host real.
6. Validar CSVs, permissoes owner/recepcao/profissional e desktop/mobile no host real.


## Atualizacao 2026-05-06 (Fase 1.18 - Release controlado de Relatorios em ambiente alvo interno)
- Criado `.planning/118_RELEASE_CONTROLADO_RELATORIOS_AMBIENTE_ALVO.md`.
- Decisao final: bloqueado para release controlado no ambiente alvo interno.
- O ambiente alvo interno real nao foi definido/confirmado; as validacoes foram locais em `http://127.0.0.1:3333` e porta alternativa `http://127.0.0.1:3334`.
- `.env` local esta fora do Git, mas e dev: `DATA_BACKEND=memory`, `NODE_ENV=development`, `AUTH_SECRET` nao forte para release e `CORS_ORIGIN` ausente.
- Banco alvo e backup nao foram confirmados; `test:db` passou, mas `db:generate` falhou por `EPERM` no client Prisma em Windows/OneDrive.
- A API ativa em `127.0.0.1:3333` respondeu endpoints gerenciais, mas rejeitou CSV `type=clients`, indicando processo/deploy defasado.
- `scripts/smoke-api-flow.ps1` foi endurecido para validar CSV de Clientes, cabecalho humano e ausencia de `clientId`.
- Smoke atualizado passou em `SMOKE_BASE_URL=http://127.0.0.1:3334`, iniciando o codigo atual em porta alternativa.

Prioridade imediata:
1. Fase 1.19 - Provisionamento e validacao real do ambiente interno.
2. Definir URL alvo, porta, protocolo, banco PostgreSQL alvo e responsavel pelo backup.
3. Configurar `.env` alvo com `DATA_BACKEND=prisma`, `AUTH_SECRET` forte, `CORS_ORIGIN` restrito, `DATABASE_URL` correto e `NODE_ENV` coerente.
4. Reiniciar/deployar a API atual no alvo e confirmar que `type=clients` passa no CSV.
5. Rodar `$env:SMOKE_BASE_URL="<URL_ALVO>"; npm.cmd run smoke:api` no host real.
6. Fazer passada visual curta desktop/mobile no host real antes de liberar Relatorios.
7. Saneamento operacional: resolver `db:generate`/arquivos `.tmp*` do Prisma em `node_modules/.prisma/client` e empacotar commits pequenos sem evidencias brutas.


## Atualizacao 2026-05-06 (Fase 1.17 - Release visual/controlado de Relatorios)
- Criado `.planning/117_RELEASE_VISUAL_RELATORIOS_RESSALVAS_FINAIS.md`.
- Decisao final: aprovado com ressalvas.
- Relatorios foi classificado como pronto para release controlado.
- Tailwind CDN foi mitigado/documentado: nao removido agora porque o HTML/app ainda depende de classes utilitarias; producao real/publica exige pipeline CSS buildado.
- Evidencias da Fase 1.16 foram revisadas; brutos ficam locais/ignorados e o repositorio passa a manter apenas `.planning/evidence/fase-116/MANIFEST.md`.
- CSV backend de Clientes foi implementado com `type=clients`, cabecalhos humanos e sem IDs tecnicos, telefone ou e-mail.
- Frontend habilita `Baixar CSV` em Clientes e preserva Estoque com CSV backend.
- Profissionais passou a explicitar `Ocupacao estimada`, baseada nos atendimentos disponiveis no periodo, com calculo completo dependente de grade historica.
- `npm.cmd run build` e `npm.cmd run smoke:api` passaram no sandbox; `npm.cmd run test` e `npm.cmd run test:db` passaram fora do sandbox apos `spawn EPERM` conhecido.

Prioridade imediata:
1. Fase 1.18 - Release controlado dos Relatorios em ambiente alvo interno.
2. Rodar smoke remoto no host alvo com `SMOKE_BASE_URL`.
3. Fazer passada visual humana curta no host real: hub, mobile, filtro customizado e CSV.
4. Confirmar `CORS_ORIGIN`, `.env` forte, banco alvo e backup antes de qualquer producao publica.
5. Planejar migracao Tailwind CDN -> CSS buildado antes de release publico.



## Atualizacao 2026-05-06 (Fase 1.16 - Validacao visual real de Relatorios)
- Criado `.planning/116_VALIDACAO_VISUAL_RELATORIOS_DESKTOP_MOBILE_CSV.md`.
- Decisao final: aprovado com ressalvas.
- Relatorios foi validado em Chrome real via CDP, desktop `1440x1100` e mobile `390x844`.
- Screenshots, JSONs de evidencia e CSVs baixados foram gerados em `.planning/evidence/fase-116/`.
- Hub abriu sem placeholder antigo, com header unico, cards premium, filtro global e troca entre Financeiro, Atendimentos, Vendas, Estoque, Profissionais, Comissoes e Auditoria.
- Filtros Hoje, Semana, Mes e Periodo personalizado foram testados no navegador.
- CSV foi baixado pelo clique do frontend para `financial`, `appointments`, `product-sales`, `stock`, `professionals`, `commissions` e `audit`.
- Corrigido `scripts/smoke-api-flow.ps1` com `-UseBasicParsing` no CSV gerencial.
- Corrigido `public/modules/relatorios.js` para habilitar exportacao quando existe CSV backend suportado, inclusive Estoque.
- Owner ve Relatorios; recepcao/profissional nao recebem promessa visual de Relatorios, Financeiro, Comissoes ou Auditoria.
- Console sem erro JS critico; ha warning nao bloqueante do Tailwind CDN.

Prioridade imediata:
1. Fase 1.17 - Preparacao de release visual/controlado.
2. Remover dependencia de `cdn.tailwindcss.com` para ambiente de producao.
3. Revisar artefatos de evidencia antes de versionamento final.
4. Executar checklist final de regressao visual nos modulos principais.
5. Manter Excel/PDF fora do escopo ate CSV backend estabilizar em uso real.

## Atualizacao 2026-05-06 (Fase 1.15 - Validacao operacional e visual dos Relatorios)
- Criado `.planning/115_VALIDACAO_RELATORIOS_BACKEND_CSV_SMOKE.md`.
- Decisao final: aprovado com ressalvas.
- `dotenv.config({ override: true })` foi removido de `src/server.ts`; `PORT` externo agora prevalece sobre `.env`.
- Smoke passou a validar se a API em uso expoe `/reports/management/summary`, evitando aceitar servidor antigo apenas por `/health`.
- `npm.cmd run smoke:api` passou fora do sandbox contra a API atual.
- Smoke em porta alternativa passou fora do sandbox com `powershell -ExecutionPolicy Bypass -File scripts/smoke-api-flow.ps1 -BaseUrl http://127.0.0.1:3334`.
- `npm.cmd run test:db` passou fora do sandbox com o novo teste Prisma (`11 passed`).
- CSV backend foi validado para `financial`, `appointments`, `product-sales`, `stock`, `professionals`, `commissions` e `audit`.
- Permissoes sensiveis foram revisadas: `summary`, financeiro, comissoes e auditoria permanecem owner-only quando carregam dados financeiros/sensiveis; cross-unit retorna `403`.
- Frontend Relatorios foi validado por codigo/CSS: endpoints novos sao preferidos, CSV backend e preferido, fallback local permanece apenas para erro.
- Ressalva: validacao visual real desktop/mobile em navegador ainda nao foi executada.

Prioridade imediata:
1. Fase 1.16 - Validacao visual real assistida em navegador desktop/mobile da aba Relatorios.
2. Capturar screenshots desktop/mobile, testar clique de troca de relatorio, filtro customizado e download CSV pelo browser.
3. Corrigir apenas polimentos visuais pequenos encontrados nessa passada.
4. Manter Excel/PDF fora do escopo ate uso real do CSV backend estabilizar.
5. Continuar reducao gradual de `public/app.js` sem reescrever o frontend inteiro.

## Atualizacao 2026-05-06 (Fase 1.14 - Contrato backend de relatorios gerenciais e exportacao profissional)
- Criado `.planning/114_CONTRATO_BACKEND_RELATORIOS_GERENCIAIS_EXPORTACAO.md`.
- Decisao final: aprovado com ressalvas.
- Criado namespace `/reports/management/*` com summary, financeiro, atendimentos, vendas de produtos, estoque, profissionais, auditoria e exportacao CSV.
- Relatorios agora tem contratos backend por periodo, compatibilidade memory/Prisma e CSV server-side com cabecalhos humanos.
- Frontend passou a preferir os novos endpoints e manter CSV local como fallback.
- Estoque, Profissionais e Auditoria deixam de ser placeholders vagos e passam a ter contratos claros; ocupacao profissional segue parcial por falta de grade historica fechada.
- `npm.cmd run build` passou.
- `npm.cmd run test` passou fora do sandbox (`66 passed | 10 skipped`).
- `npm.cmd run test:db` passou fora do sandbox antes do teste DB novo; reexecucao apos o teste novo foi bloqueada por limite da aprovacao automatica.
- `npm.cmd run smoke:api` foi atualizado, mas precisa ser reexecutado com API atual; a tentativa local bateu em servidor antigo/porta ocupada e `dotenv override`.

Prioridade imediata:
1. Fase 1.15 - Validacao operacional/visual de Relatorios com backend atual em desktop/mobile.
2. Corrigir ou flexibilizar `dotenv.config({ override: true })`/smoke para permitir porta alternativa sem brigar com `.env`.
3. Reexecutar `npm.cmd run test:db` fora do sandbox para validar o novo teste Prisma.
4. Avaliar summary filtrado por role para recepcao/profissional, sem vazar financeiro.
5. Planejar exportacao Excel/PDF somente apos validar uso real do CSV backend.

## Atualizacao 2026-05-05 (Fase 1.13 - Relatorios operacionais em hub premium)
- Criado `.planning/113_RELATORIOS_OPERACIONAIS_HUB_PREMIUM.md`.
- Decisao final: aprovado com ressalvas.
- Relatorios deixou de ser placeholder e virou hub premium com oito tipos: Financeiro, Atendimentos, Vendas de produtos, Estoque, Clientes, Comissoes, Profissionais e Auditoria.
- Filtro global de periodo cobre Hoje, Semana, Mes e Periodo personalizado.
- Financeiro, Atendimentos, Vendas, Clientes e Comissoes exibem resumos e detalhes operacionais a partir dos endpoints existentes.
- Estoque, Profissionais e Auditoria ficam honestamente parciais quando faltam dados historicos completos.
- Exportacao CSV simples foi implementada no frontend para o relatorio aberto, sem expor IDs tecnicos.
- Nenhum backend, schema, migration, regra de negocio, permissao, tenant guard ou idempotencia foi alterado.
- `npm.cmd run build`, `npm.cmd run test`, `npm.cmd run smoke:api` e `npm.cmd run test:db` passaram; testes Vitest/DB exigiram execucao fora do sandbox por `spawn EPERM`.

Prioridade imediata:
1. Fazer passada visual humana em Relatorios desktop/mobile: hub, troca de relatorio, filtro de periodo personalizado e CSV.
2. Fase 1.14 - Criar contrato backend dedicado para relatorios gerenciais, principalmente historico de estoque e agregacoes consolidadas.
3. Planejar exportacao profissional server-side somente quando houver contrato estavel de relatorios.
4. Continuar reducao gradual de `public/app.js` sem reescrever o frontend inteiro.

## Atualizacao 2026-05-05 (Fase 1.12 - Polimento visual premium, headers e contraste)
- Criado `.planning/112_POLIMENTO_VISUAL_PREMIUM_HEADERS_CONTRASTE.md`.
- Decisao final: aprovado com ressalvas.
- `Topbar` deixou de duplicar titulo/breadcrumb de tela; `PageHeader` virou fonte principal de titulo, descricao e acao.
- Dashboard, Metas, Automacoes e Fidelizacao receberam header/filtro/base visual premium.
- Paleta visual foi consolidada em navy/charcoal, slate, indigo/violet, emerald, amber e rose.
- Azul claro/sky visivel foi substituido ou remapeado para indigo/violet premium.
- Botoes, cards, filtros, drawers, tabelas/listas, sidebar, mobile tabs e estados de foco/hover receberam camada CSS premium transversal.
- `npm.cmd run build`, `npm.cmd run test`, `npm.cmd run smoke:api` e `npm.cmd run test:db` passaram fora das limitacoes conhecidas de sandbox.
- API local ficou disponivel em `http://localhost:3333`; browser in-app nao foi validado porque a ferramenta Node REPL do plugin de navegador nao estava disponivel.

Prioridade imediata:
1. Fase 1.13 - Validacao visual humana assistida desktop/mobile e screenshots comparativos.
2. Revisar em navegador real: Dashboard, Agenda, PDV, Clientes, Servicos, Estoque, Financeiro, Profissionais, Auditoria, Comissoes, Configuracoes, Metas, Automacoes e Fidelizacao.
3. Corrigir apenas polimentos visuais restantes: contraste fino, quebras mobile, densidade de formularios/drawers e cards ainda muito parecidos.
4. Redesenhar conteudo interno de Automacoes e Fidelizacao sem criar funcionalidades novas.
5. Planejar reducao gradual de `public/app.js` somente depois da validacao visual.

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


## Atualizacao 2026-05-06 (Fase 1.23 - Polimento visual premium, consistencia UI e experiencia SaaS)
- Criado `.planning/123_FRONTEND_POLIMENTO_VISUAL_PREMIUM.md`.
- Polimento visual transversal aplicado em frontend com foco em percepcao premium, consistencia, hierarquia e responsividade.
- Sidebar, topbar, cards, filtros, tabelas e mobile tabs receberam reforco visual sem alterar regras de negocio.
- Nenhum backend/Prisma/endpoint/contrato foi alterado.
- Fechamento da decisao final depende da bateria obrigatoria: `build`, `test`, `test:db`, `smoke:api`, `git diff --check`, `git status --short`.

Prioridade imediata:
1. Concluir validacoes obrigatorias da fase e registrar resultado final (aprovado, aprovado com ressalvas ou bloqueado).
2. Executar passada visual assistida em host interno real para Desktop e Mobile em Dashboard, Agenda, PDV, Clientes, Financeiro e Relatorios.
3. Consolidar pequenos ajustes finais de densidade e legibilidade apenas se surgirem na validacao visual.
4. Planejar fase de modularizacao incremental de `public/index.html` e `public/app.js` sem reescrever arquitetura nem alterar fluxos.


## Atualizacao 2026-05-06 (Fase 1.26 - Redesign visual perceptivel controlado do frontend premium)
- Criado `.planning/126_REDESIGN_VISUAL_PERCEPTIVEL_FRONTEND_PREMIUM.md`.
- Criada evidencia `.planning/evidence/fase-126/MANIFEST.md`.
- Decisao final: aprovado com ressalvas.
- Redesign visual ficou perceptivel com foco em simplicidade: chrome (sidebar/topbar), dashboard, superficies, tabelas, formularios, modais e mobile refinados sem aumentar informacao.
- `build`, `test` (fora do sandbox) e `smoke:api` passaram.
- `test:db` continua pendente por seguranca, aguardando evidencia objetiva de base de teste isolada.

Prioridade imediata:
1. Fase 1.27 - Homologacao visual assistida por browser (desktop e mobile) com checklist por modulo e comparativo antes/depois.
2. Validar especificamente Dashboard, Agenda, PDV, Clientes, Servicos, Estoque, Financeiro, Sidebar, Topbar, Modais e Tabs mobile em viewport real.
3. Aplicar apenas ajustes visuais finos de contraste/espacamento que surgirem na homologacao, sem aumentar densidade informacional.
4. Executar `npm.cmd run test:db` somente apos comprovacao de banco dedicado de teste (isolado/descartavel).

Nao priorizar agora:
1. Mudancas de backend/Prisma/contratos.
2. Features novas.
3. Refactor estrutural amplo do app.

## Atualizacao 2026-05-06 (Fase 1.26 - Mobile-first operacional premium)
- Criado `.planning/126_MOBILE_FIRST_OPERACIONAL_PREMIUM.md`.
- Criada evidencia `.planning/evidence/fase-126/MANIFEST.md`.
- Mobile foi reorganizado para priorizar acao rapida: menos densidade inicial e mais conteudo progressivo.
- Agenda recebeu CTA primaria por status em cada card e acoes secundarias em "Mais acoes".
- Dashboard mobile prioriza KPIs essenciais e recolhe insights secundarios.
- PDV mobile prioriza venda/carrinho/total e recolhe historico.
- Build, test e smoke passaram; `test:db` segue pendente por seguranca (sem isolamento explicitamente comprovado).

Prioridade imediata:
1. Fase 1.27 - Homologacao visual mobile em viewport real com checklist de tempo ate acao principal.
2. Ajustes finos de espacamento, toque e legibilidade com base na homologacao.
3. Manter desktop estavel enquanto evolui navegacao operacional mobile.
4. Executar `npm.cmd run test:db` somente apos comprovacao de base de teste dedicada e isolada.

## Atualizacao 2026-05-06 (Fase 1.27 - Homologacao visual mobile operacional real)
- Criado `.planning/127_HOMOLOGACAO_VISUAL_MOBILE_OPERACIONAL.md`.
- Criado `.planning/evidence/fase-127/MANIFEST.md`.
- Ajuste fino aplicado: Agenda mobile voltou a abrir em cards por padrao para reduzir densidade inicial e scroll.
- Ajuste fino aplicado: summaries mobile e "Mais acoes" com alvo de toque mais confortavel.
- Build, test e smoke passaram (test fora do sandbox por limitacao EPERM no sandbox).
- `test:db` permanece pendente por seguranca ate comprovacao explicita de base isolada.

Prioridade imediata:
1. Fase 1.28 - homologacao assistida em smartphone fisico (iOS/Android) para fechamento sem ressalvas.
2. Executar apenas microajustes de toque, teclado e espacamento se surgirem no teste fisico.
3. Preservar o contrato mobile-first operacional sem novo redesign amplo.
4. Nao executar `test:db` sem isolamento comprovado de base de testes.