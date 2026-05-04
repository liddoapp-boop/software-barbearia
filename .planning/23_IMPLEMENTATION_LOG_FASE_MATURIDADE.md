# Implementation Log - Fase Maturidade

Data: 2026-05-04
Escopo: Fase 0.7 - validacao manual no navegador e checklist de producao controlada.

## Entregas executadas
1. Criado checklist manual completo para validacao no navegador por perfil e area operacional.
2. Criado checklist de producao controlada cobrindo ambiente, banco, seguranca, operacao e observabilidade.
3. Revisado frontend para mensagens operacionais mais claras em permissoes, idempotencia, devolucao acima do vendido e estorno invalido.
4. Revisado `scripts/smoke-api-flow.ps1` para usar o fluxo real de checkout e incluir venda de produto, historico, devolucao, financeiro, comissoes consultaveis e auditoria.
5. Mantido escopo sem feature grande, sem redesign e sem mudanca de regra financeira validada.

## Arquivos alterados
- `public/app.js`
- `scripts/smoke-api-flow.ps1`
- `.planning/92_VALIDACAO_MANUAL_PRODUCAO_CONTROLADA.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Validacao
- Checagem de sintaxe ES module de `public/app.js`: passou.
- Checagem de sintaxe ES module de `public/modules/*.js`: passou.
- Checagem de sintaxe ES module de `public/components/*.js`: passou.
- Checagem sintatica de `scripts/smoke-api-flow.ps1`: passou.
- `npm.cmd run test`: falhou no sandbox por `spawn EPERM` do Vite/Rolldown; passou fora do sandbox (`63 passed | 10 skipped`).
- `npm.cmd run build`: passou.
- `npm.cmd run smoke:api`: falhou no sandbox porque o servidor nao conseguiu verificar/baixar engine Prisma; passou fora do sandbox.
- `npm.cmd run test:db`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox (`10 passed`).
- Sem alteracao de Prisma; `db:generate` e `db:push` nao foram necessarios.

## Resultado esperado
- Checklist manual fica pronto para execucao real no navegador.
- Smoke automatizado cobre o caminho minimo operacional mais representativo da maturidade atual.
- Proxima fase recomendada apos validacao: deploy/producao controlada, salvo se a validacao manual revelar bug P0/P1 ou necessidade de refinamento mobile/UX.

Documento: `.planning/92_VALIDACAO_MANUAL_PRODUCAO_CONTROLADA.md`.

---

Data: 2026-05-04
Escopo: Fase 0.6 - outbox/auditoria transacional para fluxos financeiros criticos.

## Entregas executadas
1. Adotada auditoria transacional direta, sem outbox e sem migration nova.
2. `AuditRecorder` passou a expor escrita Prisma reutilizavel com `Prisma.TransactionClient`.
3. Fluxos financeiros criticos no backend Prisma passaram a criar `AuditLog` dentro da mesma transacao do fato de negocio.
4. Preservada deduplicacao idempotente por advisory lock em auditoria.
5. Backend memory continuou usando auditoria em array pos-operacao, sem simular transacao real.
6. Testes DB foram ampliados para validar auditoria em pagamento de comissao e devolucao de produto.
7. Documentada a fase em `.planning/91_OUTBOX_AUDITORIA_TRANSACIONAL.md`.

## Arquivos alterados
- `src/application/audit-service.ts`
- `src/application/prisma-operations-service.ts`
- `src/application/operations-service.ts`
- `src/http/app.ts`
- `tests/db.integration.spec.ts`
- `.planning/91_OUTBOX_AUDITORIA_TRANSACIONAL.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Validacao
- `npm.cmd run build`: passou.
- `npm.cmd run db:generate`: falhou no sandbox por engine Prisma; passou fora do sandbox.
- `npm.cmd run test`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox (`63 passed | 10 skipped`).
- `npm.cmd run build`: rerodado e passou.
- `npm.cmd run smoke:api`: falhou no sandbox por engine Prisma; passou fora do sandbox.
- `npm.cmd run test:db`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox (`10 passed`).
- Sem migration nova; `db:push` nao foi necessario.

## Resultado
- Operacoes financeiras criticas confirmadas no Prisma passam a carregar rastro auditavel na mesma transacao.
- Replay idempotente nao cria novo `AuditLog` de execucao real.
- Proxima fase recomendada: validacao manual no navegador e deploy/producao controlada, ou CRUD operacional de usuarios/equipe conforme prioridade de produto.

Documento: `.planning/91_OUTBOX_AUDITORIA_TRANSACIONAL.md`.

---

Data: 2026-05-04
Escopo: Fase 0.5 - hardening de tenant guard e historico operacional de vendas.

## Entregas executadas
1. Criado `GET /sales/products` para listar historico operacional de vendas de produto por unidade.
2. Historico retorna itens, cliente/profissional quando disponiveis, valores, quantidades devolvidas e status calculado de devolucao.
3. PDV passou a exibir `Vendas recentes e historico`, com busca simples, periodo e devolucao a partir de venda antiga.
4. Reaproveitada a modal de devolucao de produto, agora usando quantidade devolvivel calculada pelo backend.
5. Tenant guard por path reforcado em venda/devolucao de produto, movimentacao manual de estoque, overview de estoque e ficha tecnica de consumo.
6. Corrigido vazamento de agregacao de estoque por unidade em `getStockOverview`.
7. Adicionados testes de historico, devolucao antiga e bloqueios multiunidade por path.
8. Documentada a fase em `.planning/90_TENANT_GUARD_HISTORICO_VENDAS.md`.

## Arquivos alterados
- `src/http/app.ts`
- `src/domain/types.ts`
- `src/application/operations-service.ts`
- `src/application/prisma-operations-service.ts`
- `public/index.html`
- `public/app.js`
- `tests/api.spec.ts`
- `.planning/90_TENANT_GUARD_HISTORICO_VENDAS.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Validacao
- Checagem de sintaxe ES module de `public/app.js`: passou.
- `npm.cmd run build`: passou.
- `npm.cmd run test`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox (`63 passed | 10 skipped`).
- `npm.cmd run smoke:api`: falhou no sandbox por engine Prisma/rede; passou fora do sandbox.
- `npm.cmd run test:db`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox (`10 passed`).

## Resultado
- Existe historico de vendas de produtos consumivel pela UI.
- A UI consegue devolver venda antiga, nao apenas venda da sessao atual.
- Tenant guard por path impede operacao cruzada de venda/produto/estoque.
- Refund segue idempotente, auditado e consistente com financeiro/estoque.
- Proxima fase recomendada: outbox/auditoria transacional para fluxos financeiros criticos.

Documento: `.planning/90_TENANT_GUARD_HISTORICO_VENDAS.md`.

---

Data: 2026-05-03
Escopo: Fase 0.4 - frontend operacional dos fluxos criticos.

## Entregas executadas
1. Criado modulo frontend `Auditoria`, owner-only, consumindo `GET /audit/events`.
2. Adicionada acao de estorno de atendimento concluido na Agenda/Central de agendamentos.
3. Adicionada devolucao de produto a partir das vendas recentes do PDV.
4. Financeiro passou a exibir melhor origem dos lancamentos: `source`, `referenceType`, `referenceId`, `professionalId`, categoria, descricao e observacoes.
5. Comissoes passaram a exibir status pago/pendente e acao owner-only de pagamento com `idempotencyKey`.
6. Menu/acoes visuais foram ajustados por role: owner ve auditoria/financeiro/comissoes/configuracoes; recepcao e profissional nao.
7. Documentada a fase em `.planning/89_FRONTEND_FLUXOS_CRITICOS.md`.

## Arquivos alterados
- `public/index.html`
- `public/app.js`
- `public/components/menu-config.js`
- `public/modules/auditoria.js`
- `public/modules/agenda.js`
- `public/modules/agendamentos.js`
- `public/modules/comissoes.js`
- `public/modules/financeiro.js`
- `.planning/89_FRONTEND_FLUXOS_CRITICOS.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Validacao
- Checagem de sintaxe ES module de `public/app.js`: passou.
- Checagem de sintaxe ES module de `public/modules/auditoria.js`: passou.
- Checagem de sintaxe ES module de `public/modules/comissoes.js`: passou.
- `npm.cmd run test`: passou fora do sandbox (`59 passed | 10 skipped`).
- `npm.cmd run build`: passou.
- `npm.cmd run smoke:api`: passou fora do sandbox.
- `npm.cmd run test:db`: passou fora do sandbox (`10 passed`).
- No sandbox, `test`/`test:db` falharam por `spawn EPERM` do Vitest/Vite e `smoke:api` falhou ao verificar/baixar engine Prisma, mantendo o padrao operacional ja documentado.

## Resultado
- Owner tem tela operacional de auditoria.
- Estorno de atendimento e devolucao de produto foram expostos na UI com `idempotencyKey`.
- Financeiro e comissoes ficaram mais rastreaveis sem criar regra financeira nova.
- Proxima fase recomendada: hardening de produto/estoque por path e historico UI de vendas para devolucoes antigas.

Documento: `.planning/89_FRONTEND_FLUXOS_CRITICOS.md`.

---

Data: 2026-05-03
Escopo: Fase 0.3 - usuarios persistentes e permissoes refinadas.

## Entregas executadas
1. Criados modelos Prisma `User` e `UserUnitAccess`.
2. Adicionado hash de senha com `crypto.pbkdf2Sync`, sem dependencia externa.
3. `/auth/login` passou a consultar usuarios persistentes quando `DATA_BACKEND=prisma`.
4. Mantido fallback dev/memory para `DEFAULT_USERS`, inclusive compatibilidade com `owner@barbearia.local / owner123`.
5. `prisma/seed.ts` passou a criar owner, recepcao e profissional persistentes com acessos por unidade.
6. Refinada policy de acesso para restringir financeiro global e pagamento de comissao ao owner.
7. Adicionado `GET /users` owner-only como listagem minima por unidade.
8. Testes cobrem login Prisma, usuario inativo, `activeUnitId` nao autorizado, tenant guard query/body e permissoes financeiras.

## Arquivos alterados
- `src/http/security.ts`
- `src/http/app.ts`
- `prisma/schema.prisma`
- `prisma/seed.ts`
- `prisma/migrations/20260503_persistent_users_permissions/migration.sql`
- `tests/api.spec.ts`
- `tests/db.integration.spec.ts`
- `.planning/88_USUARIOS_PERSISTENTES_PERMISSOES.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Validacao
- `npm.cmd run db:generate`: passou fora do sandbox.
- `npm.cmd run db:push`: passou fora do sandbox.
- `npm.cmd run test`: passou (`59 passed | 10 skipped`).
- `npm.cmd run build`: passou.
- `npm.cmd run smoke:api`: passou.
- `npm.cmd run test:db`: passou (`10 passed`).

## Resultado
- Criterios de aceite da Fase 0.3 atendidos.
- Proxima fase recomendada: frontend operacional dos fluxos criticos, com tenant guard produto/estoque profundo e outbox/auditoria transacional como proximas trilhas tecnicas.

Documento: `.planning/88_USUARIOS_PERSISTENTES_PERMISSOES.md`.

---

Data: 2026-05-03
Escopo: Fase 0.2.4 - validacao PostgreSQL real e robustez.

## Entregas executadas
1. Ampliada a suite `tests/db.integration.spec.ts` para validar PostgreSQL real com `DATA_BACKEND=prisma`.
2. Adicionados testes DB para comissao concorrente, replay idempotente simultaneo, payload divergente, refund concorrente, checkout concorrente e auditoria persistente.
3. Corrigida lacuna de concorrencia em `refundProductSale` com lock `FOR UPDATE` na venda antes de calcular saldo devolvivel.
4. Endurecida deduplicacao de auditoria idempotente no Prisma com advisory lock transacional por evento logico.
5. Smoke test passou a consultar `/audit/events`.
6. Verificadas constraints criticas de idempotencia, financeiro, refund, estoque e auditoria.

## Arquivos alterados
- `src/application/prisma-operations-service.ts`
- `src/application/audit-service.ts`
- `tests/db.integration.spec.ts`
- `scripts/smoke-api-flow.ps1`
- `.planning/87_VALIDACAO_POSTGRES_ROBUSTEZ.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Validacao
- `npm.cmd run db:generate`: passou fora do sandbox.
- `npm.cmd run db:push`: passou fora do sandbox; banco ja estava sincronizado.
- `npm.cmd run test`: passou (`58 passed | 7 skipped`).
- `npm.cmd run build`: passou.
- `npm.cmd run smoke:api`: passou.
- `npm.cmd run test:db`: passou (`7 passed`).

## Resultado
- Criterios de aceite da Fase 0.2.4 atendidos.
- Proxima fase recomendada: usuarios persistentes e permissoes refinadas, mantendo outbox/auditoria transacional como evolucao tecnica logo depois.

Documento: `.planning/87_VALIDACAO_POSTGRES_ROBUSTEZ.md`.

---

Data: 2026-05-02
Escopo: Fase 0.2.3 - auditoria persistente append-only.

## Entregas executadas
1. Criado modelo Prisma `AuditLog` para trilha persistente append-only.
2. Criado `AuditRecorder` central para gravar em Prisma ou memoria conforme `DATA_BACKEND`.
3. Migrado `recordAudit` do array local para helper persistente com actor, rota, metodo, requestId/correlation-id e idempotencyKey.
4. `GET /audit/events` agora le do `AuditLog` no backend Prisma e do store em memoria no backend memory.
5. Endpoint de auditoria ficou restrito a owner e passou a exigir `unitId`.
6. Adicionados filtros simples por `entity`, `action`, `actorId`, `start`, `end` e `limit`.
7. Replay idempotente nao cria evento principal duplicado para a mesma acao/entidade.
8. Nao foram criadas rotas de update/delete para auditoria.

## Arquivos alterados
- `src/application/audit-service.ts`
- `src/domain/types.ts`
- `src/infrastructure/in-memory-store.ts`
- `src/http/app.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260502_audit_log_append_only/migration.sql`
- `tests/api.spec.ts`
- `.planning/86_AUDITORIA_PERSISTENTE_APPEND_ONLY.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Validacao
- `npm.cmd run db:generate`: passou apos permissao de rede/sandbox.
- `npm.cmd run test`: passou apos permissao de sandbox (`58 passed | 1 skipped`).
- `npm.cmd run build`: passou.
- `npm.cmd run smoke:api`: passou apos permissao de rede/sandbox.
- `npm.cmd run test:db`: passou apos permissao de sandbox (`1 passed`).
- Apos ajuste final no filtro Prisma do `AuditRecorder`, `npm.cmd run build` foi rerodado e passou. Uma nova rerodada completa de `npm.cmd run test` foi bloqueada pelo limite de uso da ferramenta; a suite ja havia passado antes desse ajuste.

## Resultado
- Criterios de aceite da Fase 0.2.3 atendidos.
- Proxima fase recomendada: Fase 0.2.4 - validacao PostgreSQL real/robustez.

Documento: `.planning/86_AUDITORIA_PERSISTENTE_APPEND_ONLY.md`.

---

Data: 2026-05-02
Escopo: Fase 0.2.2 - estornos/devolucoes rastreaveis.

## Entregas executadas
1. Criados `Refund` e `RefundItem` para registrar reversoes sem apagar fatos originais.
2. Criado `POST /appointments/:id/refund` para estorno financeiro de atendimento concluido.
3. Criado `POST /sales/products/:id/refund` para devolucao parcial/total de venda de produto.
4. Estornos/devolucoes geram `FinancialEntry EXPENSE` com `source=REFUND`.
5. Devolucao de produto gera `StockMovement IN` com `referenceType=PRODUCT_REFUND`.
6. Registros originais de receita, venda e estoque permanecem intactos.
7. Novos endpoints exigem `idempotencyKey`, com replay seguro e conflito `409` para payload divergente.
8. Backend em memoria e backend Prisma foram mantidos compativeis.

## Arquivos alterados
- `src/domain/types.ts`
- `src/domain/rules.ts`
- `src/application/operations-service.ts`
- `src/application/prisma-operations-service.ts`
- `src/infrastructure/in-memory-store.ts`
- `src/http/app.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260502_refunds_traceable/migration.sql`
- `tests/api.spec.ts`
- `.planning/85_ESTORNOS_DEVOLUCOES_RASTREAVEIS.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Validacao
- `npm.cmd run db:generate`: passou apos permissao de rede/sandbox.
- `npm.cmd run test`: passou (`56 passed | 1 skipped`).
- `npm.cmd run build`: passou.
- `npm.cmd run smoke:api`: passou apos permissao de rede/sandbox.
- `npm.cmd run test:db`: passou (`1 passed`).

## Resultado
- Criterios de aceite da Fase 0.2.2 atendidos.
- Proxima fase recomendada: Fase 0.2.3 - auditoria persistente append-only.

Documento: `.planning/85_ESTORNOS_DEVOLUCOES_RASTREAVEIS.md`.

---

Data: 2026-05-02
Escopo: Fase 0.2.1 - comissao paga como despesa reconciliavel.

## Entregas executadas
1. Pagamento de comissao passou a criar `FinancialEntry EXPENSE` vinculada a `CommissionEntry`.
2. Despesa usa `source=COMMISSION`, `category=COMISSAO`, `referenceType=COMMISSION` e `referenceId=<commissionId>`.
3. Backend em memoria e backend Prisma foram mantidos compativeis.
4. Prisma passou a aceitar `RevenueSource.COMMISSION` para deduplicar pela constraint existente de origem financeira.
5. Replay idempotente retorna a mesma resposta e nao duplica despesa.
6. Comissao ja paga nao gera nova despesa; retorna o vinculo financeiro existente.
7. Resumo financeiro passa a reconhecer a despesa paga e evita dupla contagem de comissao paga no lucro estimado.

## Arquivos alterados
- `src/domain/types.ts`
- `src/domain/rules.ts`
- `src/application/operations-service.ts`
- `src/application/prisma-operations-service.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260502_commission_expense_source/migration.sql`
- `tests/api.spec.ts`
- `.planning/84_COMISSAO_DESPESA_RECONCILIAVEL.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Validacao
- `npm.cmd run db:generate`: passou.
- `npm.cmd run test`: passou.
- `npm.cmd run build`: passou.
- `npm.cmd run smoke:api`: passou.
- `npm.cmd run test:db`: passou.

## Resultado
- Criterios de aceite da Fase 0.2.1 atendidos.
- Proxima fase recomendada: Fase 0.2.2 - estornos/devolucoes rastreaveis.

Documento: `.planning/84_COMISSAO_DESPESA_RECONCILIAVEL.md`.

---

Data: 2026-05-02
Escopo: planejamento da Fase 0.2 - financeiro profissional e auditoria persistente.

## Entregas executadas
1. Analisado o fluxo atual de checkout, venda de produto, financeiro, lancamento manual, pagamento de comissao, estoque e auditoria.
2. Confirmado que pagamento de comissao ainda nao gera despesa financeira reconciliavel.
3. Confirmado que nao ha estorno de atendimento nem devolucao de produto implementados.
4. Confirmado que a auditoria geral de `/audit/events` permanece em memoria, com persistencia apenas em historicos especificos.
5. Definido plano incremental para:
- Fase 0.2.1: pagamento de comissao como despesa reconciliavel.
- Fase 0.2.2: estorno/devolucao rastreavel.
- Fase 0.2.3: auditoria persistente append-only.
- Fase 0.2.4: testes e validacao com PostgreSQL real.

## Arquivos alterados
- `.planning/83_FINANCEIRO_AUDITORIA_PLANO.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`

## Resultado
- Nenhuma regra de negocio foi alterada nesta etapa.
- O plano tecnico da Fase 0.2 esta documentado com diagnostico, lacunas, fases pequenas, riscos e criterios de aceite.

Documento: `.planning/83_FINANCEIRO_AUDITORIA_PLANO.md`.

---

Data: 2026-05-01
Escopo: auditoria pos-implementacao da Fase 0.1.

## Entregas executadas
1. Auditada a coerencia entre `prisma/schema.prisma` e `prisma/migrations/20260430_idempotency_constraints/migration.sql`.
2. Validado o fluxo de `IdempotencyRecord`: hash canonico, status `IN_PROGRESS`/`SUCCEEDED`, replay por `responseJson` e conflito 409 por payload divergente.
3. Revisadas as rotas criticas: checkout, venda de produto, transacao financeira, lancamento manual e pagamento de comissao.
4. Revisadas as constraints contra duplicidade em financeiro, comissoes, vendas, estoque e idempotencia.
5. Validada a cobertura de testes de retry, replay, conflito e nao duplicacao de efeitos colaterais.
6. Investigado o EPERM do Prisma no Windows/OneDrive.

## Resultado da auditoria
- Parecer: APROVADO COM RESSALVAS.
- `npm.cmd test`: passou com `51 passed | 1 skipped`.
- `npm.cmd run build`: passou.
- `npm.cmd run db:generate`: falhou por `EPERM` no rename de `query_engine-windows.dll.node`, consistente com arquivo travado em Windows/OneDrive; o client Prisma gerado contem os novos modelos/campos e o build passou.

## Ressalvas registradas
- `idempotencyKey` ainda e opcional nas rotas criticas; sem chave, venda avulsa e lancamentos manuais ainda podem duplicar por regra de negocio.
- `/financial/manual-entry` delega ao fluxo idempotente de transacao financeira, mas nao tem teste dedicado de idempotencia.
- A concorrencia real em PostgreSQL nao foi exercitada porque `tests/db.integration.spec.ts` depende de `RUN_DB_TESTS=1` e `DATABASE_URL`.

Documento de auditoria: `.planning/81_AUDITORIA_POS_IDEMPOTENCIA.md`.

---

Data: 2026-05-01
Escopo: Fase 0.1 - idempotencia e constraints para operacoes criticas.

## Entregas executadas
1. Criado modelo `IdempotencyRecord` com hash de payload, status e resposta persistida.
2. Adicionada aceitacao de `idempotencyKey` por body ou header nas rotas criticas.
3. Protegido checkout com idempotencia transacional, update condicional de appointment e constraints de origem.
4. Protegida venda de produto com idempotencia transacional, venda/financeiro/estoque/comissao atomicos e baixa de estoque condicional.
5. Protegido lancamento financeiro manual com idempotencia persistida.
6. Protegido pagamento de comissao com resposta idempotente.
7. Criadas constraints unicas em financeiro, comissoes, vendas, estoque e idempotencia.
8. Adicionados testes de retry, conflito de payload e concorrencia simulada.

## Arquivos alterados
- `prisma/schema.prisma`
- `prisma/migrations/20260430_idempotency_constraints/migration.sql`
- `src/application/idempotency.ts`
- `src/application/prisma-operations-service.ts`
- `src/application/operations-service.ts`
- `src/http/app.ts`
- `tests/api.spec.ts`
- `.planning/80_IMPLEMENTACAO_IDEMPOTENCIA_E_CONSTRAINTS.md`

## Resultado de produto
- Retry HTTP, clique duplo e concorrencia com mesma chave nao duplicam receita, venda, estoque ou comissao.
- Reuso da mesma chave com payload diferente retorna conflito.
- Banco passa a ser a ultima linha de defesa para origens criticas.

---

Data: 2026-04-29
Escopo: reorganizacao de navegacao e posicionamento de produto sem recriacao do sistema.

## Entregas executadas
1. Auditoria de menus e navegacao frontend.
2. Auditoria de secoes existentes no `index.html`.
3. Auditoria de rotas backend no `src/http/app.ts`.
4. Reorganizacao do menu em 4 niveis de maturidade.
5. Preservacao de backend e logica operacional existente.
6. Documentacao estrategica da decisao em `.planning`.

## Mudanca aplicada
- `public/components/menu-config.js`

## Resultado de produto
- Core operacional ficou explicito.
- Gestao ficou separada de operacao.
- Administracao ficou isolada.
- Avancado foi desacoplado do fluxo principal.

## O que NAO foi removido
- Nenhum endpoint backend foi apagado.
- Nenhuma tela implementada foi deletada.
- Nao houve perda de funcionalidades de fidelizacao, automacoes, assinaturas ou integracoes.

## Proximo passo recomendado (fase posterior)
- Refatorar nomenclatura interna de agenda/agendamento/agendamentos para reduzir ambiguidade tecnica, mantendo os mesmos contratos.

---

Data: 2026-04-29
Escopo: contato rapido por WhatsApp na aba Clientes.

## Entregas executadas
1. Criado helper reutilizavel para normalizacao de telefone e montagem de link `wa.me`.
2. Adicionado botao de WhatsApp em cada card/listagem de cliente (desktop e mobile).
3. Integrado feedback amigavel para telefone invalido sem abrir link quebrado.
4. Reaproveitada a mesma regra de telefone no fluxo de agendamentos (acao WhatsApp) e validacao de cadastro.

## Arquivos alterados
- `public/modules/phone.js` (novo)
- `public/modules/clientes.js`
- `public/app.js`

## Regra de formatacao de telefone para WhatsApp
- Remove todos os caracteres nao numericos (espacos, parenteses, tracos e simbolos).
- Se ja vier com DDI `55`, valida se restam 10 ou 11 digitos nacionais (DDD + numero).
- Se vier sem DDI e tiver 10 ou 11 digitos, adiciona `55` automaticamente.
- Gera URL final no formato `https://wa.me/NUMERO_FORMATADO`.
- Exemplo: `(19) 98717-0918` -> `https://wa.me/5519987170918`.

## Comportamento para telefone ausente ou invalido
- Sem telefone: botao de WhatsApp fica desabilitado com tooltip `Cliente sem telefone cadastrado`.
- Telefone invalido: nao abre link, e exibe feedback amigavel ao usuario para revisar o cadastro.

---

Data: 2026-04-29
Escopo: fechamento unificado de atendimento.

## Entregas executadas
1. Criado endpoint transacional `POST /appointments/:id/checkout`.
2. Consolidado fluxo unico de servico + produtos + pagamento + financeiro + estoque + comissao.
3. Adicionado bloqueio de dupla finalizacao e validacao de estoque negativo.
4. Adicionado calculo/retorno de metricas do cliente no checkout (`lastVisitAt`, `totalSpent`, `frequency90d`).
5. Adicionado modal de fechamento no frontend da agenda/central de agendamentos.
6. Atualizacao automatica da agenda apos sucesso.
7. Endurecido contrato com `paymentMethod` obrigatorio.
8. Validacao de total no backend com `expectedTotal`.
9. Validacao de quantidade x estoque no modal antes do submit.

## Arquivos alterados
- `src/application/prisma-operations-service.ts`
- `src/application/operations-service.ts`
- `src/http/app.ts`
- `public/app.js`
- `tests/api.spec.ts`
- `.planning/51_CHECKOUT_UNIFICADO.md`

## Resultado de produto
- Atendimento pode ser encerrado ponta a ponta sem trocar de tela.
- Fluxo de fechamento reduziu fragmentacao operacional.
- Integracoes criticas (financeiro, estoque, comissao, agenda e cliente) ficaram sincronizadas no mesmo comando.
- Validacoes criticas de pagamento, estoque e total ficaram no fluxo de checkout.

---

Data: 2026-04-29
Escopo: correcao de falso conflito de horario na Agenda.

## Entregas executadas
1. Auditoria da regra de conflito no dominio (`hasScheduleConflict`) e dos fluxos de criacao/edicao/remarcacao/sugestao.
2. Ajuste da regra de conflito para considerar apenas status ativos de agenda: `SCHEDULED`, `CONFIRMED`, `IN_SERVICE`.
3. Padronizacao dos filtros backend para usar apenas status ativos na busca de sobreposicoes (Prisma e memoria).
4. Garantia de escopo correto por unidade no backend Prisma para `service` e `client` na criacao/edicao.
5. Ajuste do pre-check local no frontend para a mesma regra de status ativos.
6. Adicao de testes cobrindo horario livre, sobreposicao, bordas de intervalo, ignorar cancelado/concluido/no-show e profissional diferente.

## Arquivos alterados
- `src/domain/rules.ts`
- `src/application/prisma-operations-service.ts`
- `src/application/operations-service.ts`
- `public/modules/agendamento.js`
- `tests/api.spec.ts`
- `tests/engine.spec.ts`

## Resultado de produto
- A agenda passa a detectar conflito somente quando existe sobreposicao real (`startA < endB && endA > startB`) no mesmo profissional e com status ativos.
- Agendamentos `COMPLETED`, `CANCELLED` e `NO_SHOW` nao bloqueiam novos horarios.
- Pre-check do frontend e validacao backend ficam consistentes.

---

Data: 2026-04-29
Escopo: correcao definitiva de conflito falso de horario na Agenda (incidente reaberto).

## Diagnostico obrigatorio (causa raiz e verificacoes)
1. Onde a validacao e feita:
- Dominio: `src/domain/rules.ts` em `hasAppointmentConflict` (alias legado `hasScheduleConflict`).
- Fluxos backend: `operations-service` (memory) e `prisma-operations-service` (prisma), incluindo criar, remarcar, editar e sugerir horarios.

2. Query que busca agendamentos existentes:
- Prisma: `appointment.findMany` com filtros de sobreposicao (`startsAt < newEnd` e `endsAt > newStart`) + unidade + profissional + status ativo.
- Memory: filtro equivalente no array em memoria com os mesmos limites de intervalo.

3. Status que entram no conflito:
- Ativos: `SCHEDULED`, `CONFIRMED`, `IN_SERVICE`.
- Nao bloqueiam: `COMPLETED`, `CANCELLED`, `NO_SHOW`, `BLOCKED`.

4. Como `startAt/endAt` sao calculados:
- `startAt` vem do payload (`startsAt` ISO) convertido com `new Date(...)`.
- `endAt` e calculado no backend por `startAt + durationMin` (e `bufferAfterMin` quando aplicavel em criacao).

5. Uso de `durationMinutes`:
- Front envia `serviceId`; backend resolve o servico e usa `durationMin` persistido para calcular `endAt`.
- Front local pre-check tambem considera duracao do servico carregada no catalogo.

6. Se comparava apenas o dia inteiro:
- Nao. A comparacao correta e por intervalo real (`start < otherEnd && end > otherStart`).
- O risco identificado era dispersao da regra em multiplos pontos; foi consolidado para evitar regressao.

7. Timezone:
- Front envia `startsAt` em ISO (`toISOString`), backend parseia para `Date`.
- Mantida comparacao temporal por timestamp absoluto; sem logica por "dia fechado".

8. Payload do frontend:
- Validado no submit da agenda.
- Adicionados logs tecnicos (`console.info/warn`) com: `selectedDateTime`, `startsAt`, `serviceDurationMinutes`, `professionalId` e resposta do backend.

## Implementacao aplicada
1. Criada/centralizada funcao de conflito:
- `hasAppointmentConflict({ businessId?, professionalId, startsAt, endsAt, excludeAppointmentId?, existingAppointments })`.

2. Regra de overlap real aplicada:
- `existing.startsAt < newEnd && existing.endsAt > newStart`.

3. EndAt garantido por duracao:
- Backend calcula `endAt` usando duracao do servico em todos os fluxos (criar/editar/remarcar).

4. Filtros obrigatorios garantidos:
- Escopo por unidade (`businessId`/`unitId`) + profissional + status ativo.

5. Consolidacao Prisma:
- Criado helper interno `findOverlappingActiveAppointments(...)` para evitar divergencia de query entre fluxos.

## Testes adicionados/ajustados
1. Reproducao do caso real:
- Existente `23:06`, novo `05:13` (mesmo dia) -> permitido.

2. Cobertura complementar:
- Mesmo horario com outro profissional -> permitido.
- Mesmo profissional em outro dia -> permitido.

Observacao: os cenarios de sobreposicao, borda de intervalo e ignorar `COMPLETED/CANCELLED/NO_SHOW` ja estavam cobertos e foram mantidos.

---

Data: 2026-04-29
Escopo: detalhamento operacional da aba Financeiro com lista real de movimentacoes.

## Entregas executadas
1. Substituida mensagem generica da secao `Lancamentos financeiros` por lista real de transacoes carregadas do endpoint.
2. Implementada exibicao completa por movimentacao: data, tipo, categoria, descricao, valor, metodo, origem, cliente, profissional e observacao.
3. Aplicado destaque visual por tipo:
- Entrada em verde.
- Saida em vermelho.
4. Implementado estado vazio especifico: `Nenhuma movimentacao financeira encontrada neste periodo.`.
5. Endurecido contrato HTTP para `GET /financial/transactions` aceitando `businessId` como alias de `unitId` (compatibilidade sem quebrar clientes atuais).
6. Adicionado teste automatizado para validar listagem financeira via `businessId`.

## Arquivos alterados
- `public/modules/financeiro.js`
- `src/http/app.ts`
- `tests/api.spec.ts`

## Resultado de produto
- A aba Financeiro deixa de ser apenas resumo e passa a mostrar o extrato operacional do periodo.
- O dono consegue identificar claramente o que entrou, o que saiu, origem e contexto de cada movimentacao.

---

Data: 2026-04-29
Escopo: refatoracao visual SaaS (UX/UI) com foco operacional em agenda, financeiro, clientes e estoque.

## Entregas executadas
1. Padronizacao de design system dark em `public/styles/layout.css` com tokens de cor, espaco, tipografia e componentes visuais reutilizaveis.
2. Implementacao de componentes base reutilizaveis de UI (`ux-card`, `ux-kpi`, `ux-btn`, `ux-badge`, `ux-table`, `ux-modal`).
3. Refatoracao da Agenda para fluxo orientado a acao, incluindo destaque da acao principal `Finalizar atendimento`.
4. Refatoracao de Financeiro com sumario padronizado e tabela clara de entradas/saidas para leitura executiva.
5. Refatoracao de Clientes com cards simplificados e foco em nome, telefone, status e atalho WhatsApp.
6. Refatoracao de Estoque com melhor leitura de quantidade atual, status e acoes.
7. Otimizacao de performance via debounce em filtros de digitacao para reduzir chamadas repetidas de API (`loadAll`).

## Arquivos alterados
- `public/styles/layout.css`
- `public/modules/agenda.js`
- `public/modules/financeiro.js`
- `public/modules/clientes.js`
- `public/modules/estoque.js`
- `public/index.html`
- `public/app.js`
- `.planning/60_UI_UX_REFACTOR.md`

## Resultado de produto
- Interface mais simples de escanear.
- Maior clareza sobre "o que fazer agora" em cada tela.
- Acoes primarias mais evidentes e com menor carga cognitiva.
- Melhor consistencia visual entre modulos sem alterar regra de negocio.

---

Data: 2026-05-02
Escopo: Fase 0.1.1 - Idempotencia obrigatoria nas operacoes criticas.

Esta etapa corrige as ressalvas da auditoria pos-idempotencia e transforma `idempotencyKey` em contrato obrigatorio para operacoes criticas com risco de duplicidade.

## Entregas executadas
1. Tornada obrigatoria a `idempotencyKey` nas rotas criticas:
- `POST /appointments/:id/checkout`
- `POST /sales/products`
- `POST /financial/transactions`
- `POST /financial/manual-entry`
- `PATCH /financial/commissions/:id/pay`

2. Definido contrato de erro unico:
- `400 Bad Request`
- `idempotencyKey é obrigatória para esta operação`

3. Garantido que as rotas protegidas validam a chave antes de acionar efeitos colaterais.

4. Frontend atualizado para gerar chave por tentativa em:
- finalizar atendimento
- vender produto
- criar lancamento financeiro manual
- pagar comissao

5. `tests/db.integration.spec.ts` ajustado para desabilitar auth no teste transacional de DB, preservando foco em Prisma/PostgreSQL.

## Testes adicionados/ajustados
- Sem chave em rota critica retorna 400.
- Checkout sem chave nao finaliza atendimento.
- Venda sem chave nao cria receita de produto.
- Manual financeiro sem chave nao cria lancamento.
- Pagamento de comissao sem chave nao altera status.
- `/financial/manual-entry` cobre replay seguro e conflito 409 por payload divergente.
- Testes existentes de fluxo feliz receberam chaves idempotentes validas.

## Validacao
- `npm.cmd run test`: passou.
- `npm.cmd run build`: passou.
- `npm.cmd run smoke:api`: passou.
- `npm.cmd run test:db`: passou contra backend Prisma/PostgreSQL.

## Observacao operacional
- Em PowerShell, `npm run ...` pode falhar por Execution Policy (`npm.ps1`); usar `npm.cmd run ...`.
- EPERM em Windows/OneDrive permanece documentado como risco operacional local. Procedimento: fechar dev server/processos Node/watchers, remover `node_modules/.prisma` se necessario, rodar `npm.cmd run db:generate` e mover o projeto para fora do OneDrive se persistir.
