# Macro 233 - Operacao ponta a ponta owner-only

## 1. Objetivo

Encerrar a Macro 233 com uma operacao ponta a ponta owner-only para uma unidade operacional: agenda, atendimento sem agendamento, encaixe, bloqueios, alteracao de servicos em atendimento, checkout oficial, pagamentos, estoque, inventario, fechamento diario, auditoria e idempotencia.

Nao faz parte desta macro iniciar nova funcionalidade, WhatsApp/IA, VPS/producao, fechamento mensal complexo ou qualquer proxima macro. Commit e push fazem parte apenas do rito de encerramento.

## 2. Escopo

Escopo entregue:

- atendimento sem agendamento;
- criacao/reuso de cliente por telefone normalizado;
- profissional unico Geovane Borges;
- vinculos com os seis servicos canonicos;
- walk-in imediato em `IN_SERVICE`;
- walk-in owner fora do expediente com confirmacao explicita;
- bloqueio de horario e bloqueio de dia inteiro;
- cancelamento/reabertura operacional de bloqueio por rota auditavel;
- encaixe controlado com aceite explicito de risco;
- alteracao de servicos durante `IN_SERVICE`;
- recalculo de preco, duracao e `endsAt`;
- checkout oficial em `POST /appointments/:id/checkout`;
- pagamento unico, dividido, dinheiro com troco, pagamento insuficiente e complementacao posterior;
- correcao administrativa de pagamento;
- bloqueio de refund/devolucao comercial quando a politica esta ativa;
- ausencia de comissao para Geovane;
- venda e movimentacoes de estoque;
- inventario fisico;
- fechamento diario e reabertura;
- auditoria;
- idempotencia;
- interface da Agenda, menu Mais opcoes, eventos de bloqueio em Semana/Lista e origem amigavel para walk-in/encaixe.

## 3. Modelagem

Migration revisada: `prisma/migrations/20260706_macro_233_owner_operations/migration.sql`.

Novos modelos Prisma:

- `AppointmentBlock`;
- `AppointmentCheckout`;
- `CheckoutPayment`;
- `StockInventoryCount`;
- `DailyClosing`.

Novos enums Prisma:

- `AppointmentBlockStatus`;
- `CheckoutStatus`;
- `CheckoutPaymentMethod`;
- `CheckoutPaymentStatus`;
- `StockInventoryCountStatus`;
- `DailyClosingStatus`.

A migration cria tipos, tabelas, indices e chaves estrangeiras sem `DROP`, sem `TRUNCATE` e sem dependencia de `prisma db push`. O formato e compativel com `prisma migrate deploy`.

## 4. Rotas

- `POST /appointments/walk-in`: atendimento sem agendamento.
- `POST /appointments/blocks`: bloqueio especifico ou dia inteiro.
- `POST /appointments/blocks/:id/cancel`: cancelamento auditavel de bloqueio.
- `POST /appointments/fitting`: encaixe controlado.
- `PATCH /appointments/:id/services`: alteracao de servicos em atendimento.
- `POST /appointments/:id/checkout`: checkout oficial.
- `POST /financial/checkout-payments/:id/correct`: correcao administrativa.
- `POST /stock/movements/manual`: entrada, saida, perda e uso interno.
- `POST /inventory/counts`: inventario fisico.
- `POST /financial/daily-closing`: fechamento diario.
- `POST /financial/daily-closing/:id/reopen`: reabertura de fechamento.

Rotas legadas e politicas:

- `POST /appointments/:id/complete` permanece legado e bloqueado com 410.
- `POST /appointments/:id/refund` e `POST /sales/products/:id/refund` retornam 410 quando `BLOCK_COMMERCIAL_REFUNDS=true`.

## 5. RBAC

As rotas sensiveis da Macro 233 estao owner-only. Os testes cobrem owner autorizado, recepcao bloqueada com 403 e rota protegida sem token com 401 quando `AUTH_ENFORCED=true`.

Nenhuma rota publica recebeu override de encaixe, fora do expediente ou selecao arbitraria de profissional. O booking publico continua sujeito a regras de expediente e resolve profissional elegivel no backend.

## 6. Idempotencia

Mutacoes novas aceitam `idempotencyKey` via header e/ou payload, registram hash do payload e retornam replay consistente quando a chave e o corpo coincidem. Reuso divergente da mesma chave e rejeitado antes de novo efeito colateral.

Cobertura incluida para walk-in, bloqueios, cancelamento de bloqueio, encaixe, alteracao de servicos, checkout, correcao administrativa, movimentacao manual, inventario e fechamento.

## 7. Auditoria

Fluxos novos registram auditoria append-only. No backend Prisma, os pontos transacionais usam contexto transacional para manter auditoria junto dos efeitos de negocio.

Eventos cobertos: walk-in, bloqueio, cancelamento de bloqueio, encaixe, alteracao de servicos, checkout aberto/pago, correcao administrativa, movimentacao manual, inventario, fechamento diario e reabertura.

## 8. Walk-in

O walk-in cria ou reutiliza cliente por telefone, aceita servicos multiplos, resolve total/duracao, nasce em `IN_SERVICE` e usa horario do servidor. O frontend deixou de enviar `startedAt` como horario operacional para evitar falso erro de passado.

Walk-in fora do expediente exige confirmacao explicita de owner. A tentativa inicial nao persiste atendimento; a confirmacao com a mesma idempotency key cria apenas um atendimento.

## 9. Bloqueios

Bloqueio de horario e dia inteiro usa `AppointmentBlock`, nao appointment falso e nao cliente ficticio. Bloqueios ativos entram em `/appointments`, `/appointments/range` e nos contratos normalizados como `blocks` e `blockEvents`.

Semana e Lista normalizam `blockEvents`; bloqueios cancelados deixam de entrar nas colecoes ativas.

## 10. Encaixe

O encaixe usa a rota `POST /appointments/fitting`, exige confirmacao quando ha conflito e registra o atendimento em `IN_SERVICE` com `isFitting=true`. Conflitos aceitos sao retornados para rastreabilidade.

## 11. Alteracao de servicos

`PATCH /appointments/:id/services` funciona durante `IN_SERVICE`, recalcula total, duracao efetiva e `endsAt`, preserva atomicidade e exige confirmacao quando a mudanca implica risco/conflito operacional.

## 12. Checkout

O checkout oficial continua em `POST /appointments/:id/checkout`. A rota aceita `paymentMethod` legado ou `payments[]`, mantem idempotencia, calcula servico/produtos, aplica consumo de estoque quando quitado e nao duplica efeitos no replay.

`POST /appointments/:id/complete` segue bloqueado como rota legada.

## 13. Pagamentos

Pagamentos cobertos:

- pagamento unico;
- pagamento dividido;
- dinheiro com `receivedAmount` e `changeAmount`;
- parcela falha;
- checkout aberto por insuficiencia;
- complementacao posterior no mesmo checkout;
- persistencia em `CheckoutPayment`.

## 14. Correcao administrativa

`POST /financial/checkout-payments/:id/correct` cria parcela reversa e lancamento financeiro inverso auditado, com motivo obrigatorio. A correcao administrativa nao reabre refund comercial e nao apaga o pagamento original.

## 15. Estoque

O checkout quitado aplica consumo de estoque por servico/produto. A rota `POST /stock/movements/manual` cobre entrada, saida, perda e uso interno com motivo, responsavel e idempotencia.

## 16. Inventario

`POST /inventory/counts` registra contagem fisica, saldo esperado, saldo contado, diferenca e movimento de ajuste quando aplicavel, com idempotencia.

## 17. Fechamento diario

`POST /financial/daily-closing` consolida valores esperados por metodo e totais do dia. `POST /financial/daily-closing/:id/reopen` reabre fechamento owner-only com motivo e auditoria.

Fechamento mensal permanece fora de escopo.

## 18. Ausencia de comissao

Geovane Borges nao gera `CommissionEntry` no fluxo operacional da Macro 233. Scripts de provisionamento removem regras de comissao dele na unidade canonica e `ENABLE_COMMISSION_TEST_RULES` fica desativado por padrao nos testes da macro.

## 19. UX

A Agenda passou a expor os fluxos owner da macro via menu Mais opcoes, mantendo uma acao principal por estado. Em `IN_SERVICE`, a acao principal e `Ir para checkout` e a secundaria e `Alterar servicos`.

Bloqueios aparecem como eventos operacionais em Semana/Lista, com labels amigaveis. Walk-in e encaixe tem origem amigavel e nao exibem enums tecnicas como texto de acao.

## 20. Defeitos encontrados e corrigidos

- Frontend nao expunha os fluxos da Macro 233.
- Walk-in/fitting Prisma criava cliente em transacao e agendava fora dela.
- Auditoria transacional ausente em fluxos Prisma.
- Checkout aberto nao aceitava complementacao posterior.
- Elegibilidade limitava consulta a 100 vinculos.
- Fixtures de profissionais contaminavam o banco de testes.
- Frontend enviava `startedAt` para walk-in e causava falso "passado".
- Walk-in fora do expediente precisava de override owner explicito.
- Aviso de fora do expediente aparecia duplicado.
- Frontend e backend divergiam na checagem de conflitos.
- `/agenda/range` nao retornava bloqueios.
- Semana/Lista nao normalizavam `blockEvents`.
- Bloqueios nao apareciam na Agenda.

## 21. Evidencias automatizadas

Suites informadas como verdes antes do fechamento:

- `npm test`: 262 testes;
- `npm run test:db`: 38 testes;
- TypeScript;
- build;
- `git diff --check`.

Arquivos de teste relevantes revisados:

- `tests/macro-233-owner-operations.spec.ts`: owner-only, 403 para recepcao, walk-in, reutilizacao de cliente, fora de expediente, bloqueios, cancelamento, `/appointments/range`, encaixe, alteracao de servicos, checkout dividido/troco/falha, correcao administrativa, refund comercial bloqueado, estoque, inventario e fechamento.
- `tests/db.integration.spec.ts`: transacoes Prisma, walk-in com cliente novo na mesma transacao, fora de expediente sem persistencia parcial, checkout complementar e rota legada `/complete` bloqueada.
- `tests/api.spec.ts`: 401 sem token, booking publico preservado, `/complete` legado bloqueado, estoque, comissoes e RBAC.
- `tests/schedule-conflicts.spec.ts`: conflitos por overlap estrito, estados operacionais e `AppointmentBlock`.
- `tests/frontend-macro-233-ui.spec.ts`: menu Mais opcoes, modais, handlers, confirmacao fora do expediente, loading, acoes em `IN_SERVICE` e mobile.
- `tests/frontend-agenda-normalization.spec.ts`: normalizacao de `blockEvents` e ignorar bloqueios cancelados.
- `tests/frontend-agenda-week.spec.ts`: bloqueio no horario correto na Semana, bloqueio de dia inteiro e Lista mantendo bloqueios ativos.
- `tests/appointment-hardening.spec.ts`: booking publico segue bloqueado fora do expediente apesar do walk-in owner confirmado.

## 22. Evidencias humanas

Validacao manual confirmada:

1. Menu Mais opcoes apareceu na Agenda.
2. Formulario Atendimento sem agendamento abriu.
3. Apenas Geovane Borges apareceu como profissional.
4. Nao apareceram Profissional DB ou Rafael.
5. Barba + Hidratacao foram aceitos.
6. Total exibido: R$ 40,00.
7. Duracao exibida: 60 minutos.
8. Modal ficou sem overflow horizontal relevante.
9. Walk-in fora do expediente mostrou confirmacao.
10. "Registrar mesmo assim" criou um unico atendimento.
11. Appointment nasceu Em atendimento.
12. Apareceram Ir para checkout e Alterar servicos.
13. Bloqueio 07/07/2026 16:00-17:00 foi criado.
14. Bloqueio apareceu visualmente na Semana no horario correto.

## 23. Itens nao validados manualmente

Nao ha evidencia humana para afirmar:

- exibicao visual do bloqueio na Lista;
- detalhe visual do bloqueio;
- desaparecimento visual apos cancelamento sem F5.

Esses pontos ficam cobertos por testes/API quando indicado em `tests/frontend-agenda-normalization.spec.ts`, `tests/frontend-agenda-week.spec.ts` e `tests/macro-233-owner-operations.spec.ts`.

## 24. Riscos residuais

- Tela dedicada de montagem avancada de `payments[]` pode evoluir; o backend ja aceita parcelas persistentes.
- Fechamento mensal sera consolidacao futura dos dias.
- Correcao administrativa ampla de estoque/financeiro deve continuar usando rotas especificas ja existentes.
- A validacao visual humana da Lista e do desaparecimento sem F5 nao foi afirmada.

## 25. Scripts locais controlados

Scripts revisados no escopo:

- `scripts/provision-canonicals-local.ts`;
- `scripts/cleanup-macro-233-local.ts`;
- `scripts/validate-macro-233-local.ts`.

`provision-canonicals-local.ts` exige alvo declarado `local` ou `test`, detecta `DATABASE_URL`, recusa producao/staging/unknown, tem dry-run por padrao e aplica alteracoes idempotentes via upsert/update/delete controlado de vinculos canonicos sem apagar historico de appointments, vendas ou auditoria.

`cleanup-macro-233-local.ts` detecta alvo local/test, recusa producao/unknown, usa dry-run por padrao, inativa profissionais contaminantes em vez de apagar registros referenciados e remove apenas vinculos canonicos indevidos.

`validate-macro-233-local.ts` executa validacao local por `app.inject` e nao altera banco exceto pelo walk-in de validacao com chave/telefone gerados.

## 26. Classificacao do worktree

Dominio/backend:

- `src/application/operations-service.ts`;
- `src/application/prisma-operations-service.ts`;
- `src/domain/rules.ts`;
- `src/domain/types.ts`;
- `src/http/app.ts`;
- `src/infrastructure/in-memory-store.ts`.

Prisma/migration:

- `prisma/schema.prisma`;
- `prisma/seed.ts`;
- `prisma/migrations/20260706_macro_233_owner_operations/migration.sql`.

Frontend:

- `public/app.js`;
- `public/index.html`;
- `public/modules/agenda.js`;
- `public/modules/agendamentos.js`;
- `public/styles/layout.css`.

Testes:

- `tests/api.spec.ts`;
- `tests/appointment-hardening.spec.ts`;
- `tests/db.integration.spec.ts`;
- `tests/frontend-agenda-normalization.spec.ts`;
- `tests/frontend-agenda-week.spec.ts`;
- `tests/frontend-macro-233-ui.spec.ts`;
- `tests/macro-233-owner-operations.spec.ts`;
- `tests/schedule-conflicts.spec.ts`.

Scripts locais controlados:

- `scripts/provision-canonicals-local.ts`;
- `scripts/cleanup-macro-233-local.ts`;
- `scripts/validate-macro-233-local.ts`.

Documentacao:

- `.planning/233_OPERACAO_PONTA_A_PONTA.md`.

Temporarios: nenhum arquivo temporario rastreavel identificado para inclusao.

Fora de escopo: nenhum arquivo fora de escopo identificado no worktree auditado.

## 27. Seguranca

Confirmacoes de encerramento:

- rotas owner-only protegidas por politica de rota;
- recepcao recebe 403 nos fluxos owner-only;
- sem token recebe 401 quando auth esta habilitada;
- Geovane nao gera `CommissionEntry`;
- `ENABLE_COMMISSION_TEST_RULES` fica desativado por padrao;
- `BLOCK_COMMERCIAL_REFUNDS` bloqueia refund/devolucao comercial quando ativo;
- rota legada `/complete` continua bloqueada;
- checkout oficial continua `/appointments/:id/checkout`;
- nenhum segredo novo foi identificado no diff;
- nenhuma rota publica recebeu override de encaixe ou fora do expediente.

## 28. Decisao final

Decisao esperada apos commit, push e verificacao final:

APROVADO E PUBLICADO - MACRO 233 ENCERRADA
