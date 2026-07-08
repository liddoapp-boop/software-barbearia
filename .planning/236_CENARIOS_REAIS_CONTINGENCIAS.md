# Macro 236 - Cenarios reais, excecoes e contingencias operacionais

Data: 2026-07-08

## Decisao

APROVADO PARA PROVISIONAMENTO FINAL E PILOTO CONTROLADO.

Foram analisados os 15 grupos obrigatorios em banco/testes isolados. Nao houve uso do `barbearia_pilot` para dados de teste. Foi encontrada e corrigida uma falha P1: a API permitia cancelamento sem motivo. Tambem foi adicionada regressao explicita para replay de checkout, garantindo que refresh/duplo clique devolve os mesmos IDs de checkout, pagamentos e receita.

Na revisao de fechamento da Macro 237, foi encontrada e corrigida outra falha P1: o fechamento diario podia ser criado com atendimento `IN_SERVICE` ou checkout aberto/pagamento pendente no dia. A regra agora bloqueia o fechamento e informa resumidamente as pendencias.

Ressalvas:

- Algumas regras dependem de politica operacional do Geovane, principalmente tolerancia de falta, cancelamento em cima da hora, pagamento parcial/dividido e estorno comercial.
- Falhas tecnicas de interface foram avaliadas por mensagens/respostas HTTP e testes automatizados existentes; nao houve redesign de UI nesta macro.

## Escopo e ambiente

- Branch inicial: `main`
- HEAD inicial: `db519c2`
- Banco de piloto: nao usado para dados de teste
- Banco antigo `barbearia`: nao alterado
- Banco limpo `barbearia_pilot`: nao contaminado
- Backend dos novos testes: `DATA_BACKEND=memory`
- Sem VPS, producao, deploy, migration, seed ou alteracao permanente de `.env`
- Commit: realizado na Macro 237
- Push: realizado na Macro 237

## Correcoes realizadas

### P1 - Cancelamento sem motivo

Comportamento encontrado:

- `PATCH /appointments/:id/status` aceitava `status = CANCELLED` sem `reason`.

Comportamento esperado:

- Cancelamento exige motivo nao vazio para preservar historico operacional.

Alteracao:

- `src/http/app.ts`: `statusSchema` passou a trimar `reason` e rejeitar `CANCELLED` sem motivo.

Teste:

- `tests/appointment-hardening.spec.ts`: cobre cancelamento sem motivo, cancelamento com motivo, liberacao do slot e bloqueio de cancelamento em atendimento iniciado.

### P2 pequeno - Regressao explicita de replay no checkout

Comportamento esperado:

- Duplo clique, refresh ou replay com mesma idempotency key nao pode duplicar checkout, pagamentos ou receita.

Alteracao:

- `tests/macro-233-owner-operations.spec.ts`: adicionada assertiva de replay do checkout pago, comparando IDs de appointment, checkout, pagamentos e receita.

### P1 - Fechamento diario com pendencias

Comportamento encontrado:

- `POST /financial/daily-closing` podia fechar o dia mesmo com atendimento `IN_SERVICE` ou checkout `OPEN`.

Comportamento esperado:

- Fechamento diario deve bloquear pendencias operacionais para nao esconder atendimento em andamento, checkout parcial ou pagamento pendente.

Alteracao:

- `src/domain/rules.ts`: adicionada montagem padronizada da mensagem de pendencias.
- `src/application/operations-service.ts`: fechamento em memoria conta atendimentos em andamento e checkouts abertos do dia antes de gerar o fechamento.
- `src/application/prisma-operations-service.ts`: fechamento Prisma aplica a mesma regra usando contagens no banco.

Teste:

- `tests/macro-233-owner-operations.spec.ts`: cobre fechamento bloqueado com checkout aberto.
- `tests/db.integration.spec.ts`: cobre fechamento bloqueado no PostgreSQL com checkout parcial.

## Matriz de cenarios

| # | Situacao | Comportamento atual | Comportamento esperado | Agenda | Financeiro | Estoque | Auditoria | Interface | Teste | Severidade | Resultado |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Cancelamento em cima da hora | Antes aceitava sem motivo; apos correcao exige motivo. Status terminal libera slot. | Motivo, horario, responsavel e historico preservados; sem receita/estoque; slot reutilizavel. | Horario liberado. | Nenhuma receita. | Nenhum consumo. | `APPOINTMENT_CANCELLED` com motivo. | Erro claro se faltar motivo. | Automatizado. | P1 corrigido | Corrigido |
| 2 | Cliente nao comparece | `NO_SHOW` distinto de `CANCELLED`, terminal e owner-only com tolerancia atual de 15 min. | Falta distinta de cancelamento, sem receita/estoque, historico preservado. | Slot deixa de conflitar para novos encaixes apos terminal. | Nenhuma receita. | Nenhum consumo. | `APPOINTMENT_NO_SHOW`. | Erro antes da tolerancia atual. | Automatizado. | P2 | Passou; tolerancia depende do Geovane |
| 3 | Cliente chega atrasado | `POST /appointments/:id/delay` registra atraso sem mover horario/status e com replay idempotente. | Registrar atraso e conflito visivel; nao deslocar automaticamente. | Horario original preservado. | Sem impacto. | Sem impacto. | `APPOINTMENT_DELAY_RECORDED`. | Mensagem `Atraso registrado.` | Automatizado. | P2 | Passou |
| 4 | Remarcacao | Remarca mesmo/dia/outro dia via novo horario, bloqueia terminal, conflito com agenda e bloqueio. Historico `RESCHEDULED`. | Nao duplicar atendimento, preservar historico anterior e respeitar conflitos. | Novo horario substitui sem duplicar. | Sem receita ate checkout. | Sem consumo ate checkout. | `APPOINTMENT_RESCHEDULED`. | Erros de conflito/terminal. | Automatizado. | P2 | Passou |
| 5 | Profissional indisponivel | Bloqueios de periodo/dia impedem novos agendamentos e nao cancelam em lote automaticamente. | Bloquear agenda sem cancelar existentes sem confirmacao. | Bloqueio visivel; existentes preservados. | Sem impacto automatico. | Sem impacto. | Eventos de block/cancel block. | Conflito claro. | Automatizado/manual. | P2 | Passou; politica de falta/folga depende do Geovane |
| 6 | Atendimento ultrapassa horario | Alteracao de servico em atendimento detecta conflito; pode exigir confirmacao de risco. | Proximos atendimentos preservados; sem deslocamento automatico. | Conflito visivel. | Recalculo somente no checkout. | Consumo somente no checkout. | Mudanca de servicos auditada. | Erro/confirmacao de risco. | Automatizado. | P2 | Passou |
| 7 | Encaixe e sem agendamento | Walk-in owner-only; fora do expediente exige confirmacao; fitting conflituoso exige confirmacao. | Permitir encaixe controlado e auditar risco. | Pode aparecer como `IN_SERVICE`; conflitos aceitos registrados. | Checkout normal. | Estoque via checkout. | `WALK_IN_APPOINTMENT_CREATED`. | Mensagem de confirmacao fora do expediente/conflito. | Automatizado. | P2 | Passou |
| 8 | Concorrencia e duplicidade | Idempotency obrigatoria em operacoes criticas; replay retorna mesmo resultado; conflitos bloqueados. | Sem duplicar agendamento, pagamento, consumo ou venda. | Sem slots duplicados. | Checkout replay sem duplicar receita/pagamentos. | Movimento manual replay sem duplicar. | Replay auditado como skip. | Repeticao segura. | Automatizado. | P2 | Passou |
| 9 | Alteracoes durante atendimento | Permite trocar/adicionar servicos em atendimento com recalculo e conflito visivel; terminal bloqueia alteracoes. | Evitar estado invalido e preservar historico. | Duracao recalculada; proximos preservados. | Total recalculado para checkout. | Produto no checkout valida estoque. | Mudanca auditada. | Erro em conflito sem confirmacao. | Automatizado. | P2 | Passou |
| 10 | Falhas de pagamento | Pagamento `FAILED` mantem checkout `OPEN` e atendimento `IN_SERVICE`; dividido/troco/correcao administrativa cobertos. | Financeiro nao duplica; pagamento parcial nao conclui. | Atendimento segue aberto se nao pago. | Receita so com pagamento confirmado total. | Sem consumo em falha. | Checkout/correcao auditados. | Erro/estado aberto claro. | Automatizado. | P2 | Passou; politica de parcial/estorno depende do Geovane |
| 11 | Estoque | Movimento manual e inventario possuem idempotencia; checkout/venda validam produto e saldo; consumo de servico so no checkout pago. | Bloquear saldo insuficiente, sem movimento parcial nem financeiro inconsistente. | Sem impacto direto. | Produto gera receita quando pago. | Saldo nunca fica negativo sem regra explicita. | Movimento/inventario auditados. | Erro em saldo/produto invalido. | Automatizado/DB existente. | P2 | Passou; politica comercial de excecao depende do Geovane |
| 12 | Fechamento diario | Fechamento usa chave unica por unidade/data e idempotency; bloqueia atendimento `IN_SERVICE` e checkout `OPEN`; reabertura auditada. | Nao duplicar fechamento; nao ocultar pendencias; tratar estorno posterior/reabertura. | Bloqueia se houver atendimento em andamento. | Bloqueia checkout aberto/pagamento pendente. | Sem impacto. | `DAILY_CLOSING_CLOSED` e `DAILY_CLOSING_REOPENED`. | Erro lista pendencias. | Automatizado e DB. | P1 corrigido | Corrigido |
| 13 | Falhas tecnicas | Rotas criticas exigem idempotency key; erros retornam mensagem; replay reduz risco de duplicacao. | UI deve indicar salvo/nao salvo e se pode tentar novamente. | Sem duplicar se replay. | Sem duplicar se replay. | Sem duplicar se replay. | Request id/auditoria quando aplicavel. | Mensagens HTTP seguras; UI final ainda depende de fluxo visual. | Automatizado/manual. | P2 | Passou com ressalva UI |
| 14 | Clientes e dados incorretos | Telefone normalizado reutiliza cliente em walk-in; cliente de outra unidade bloqueado; historico impede operacoes terminais indevidas. | Evitar duplicidade e acesso cruzado. | Agendamento com cliente correto. | Historico preserva retorno. | Sem impacto. | Criacao/alteracao auditaveis. | Erro de cliente/unidade. | Automatizado. | P2 | Passou |
| 15 | Seguranca e permissoes | Auth enforced bloqueia rotas owner-only e acesso por papel; unidade ativa limita escopo. | Menu oculto nao autoriza acao direta. | Acesso cruzado bloqueado. | Operacoes financeiras owner-only. | Estoque/inventario owner-only. | Acoes criticas auditadas. | 401/403 claros. | Automatizado. | P2 | Passou |

## P0, P1 e P2

P0:

- Nenhum aberto.

P1:

- Cancelamento sem motivo obrigatorio: corrigido.
- Fechamento diario com atendimento em andamento ou checkout aberto: corrigido.

P2:

- Tolerancia atual de `NO_SHOW` e de cancelamento em cima da hora precisa ser confirmada pelo Geovane.
- Politica de pagamento parcial/dividido e estorno comercial precisa ser confirmada.
- Politica comercial de excecao para estoque negativo precisa ser confirmada; comportamento seguro atual bloqueia saldo insuficiente.
- Tratamento comercial de estorno posterior ao fechamento precisa ser confirmado; comportamento seguro atual bloqueia pendencias antes do fechamento.
- Falhas tecnicas possuem mensagens e idempotencia no backend; validacao visual completa deve acompanhar piloto controlado.

## Evidencias de teste

Executados durante a macro:

- `npm test -- tests/appointment-hardening.spec.ts tests/appointment-state-machine.spec.ts tests/schedule-conflicts.spec.ts`: passou, 24 testes.
- `npm test -- tests/macro-233-owner-operations.spec.ts`: passou, 7 testes.
- `npm test -- tests/appointment-state-machine.spec.ts tests/appointment-hardening.spec.ts`: passou, 20 testes.
- `npm run test:db`: passou em `barbearia_test`; 38 testes passed, incluindo fechamento bloqueado com checkout parcial.

Testes finais obrigatorios:

- `npm test`: passou; 22 arquivos passed, 1 skipped; 276 testes passed, 38 skipped.
- `npm run test:db`: passou em `barbearia_test`; 38 testes passed.
- `npx tsc --noEmit`: passou.
- `npm run build`: passou.
- `git diff --check`: passou; apenas avisos de CRLF do Git, sem erro.

Conferencia adicional:

- `barbearia_pilot` continuou com zero registros nas tabelas de negocio exigidas.

## Decisoes pendentes do Geovane

1. Qual a tolerancia oficial para marcar falta.
2. Se cancelamento em cima da hora tem regra propria, taxa, bloqueio ou apenas historico.
3. Quando atraso deve virar remarcacao, cancelamento ou encaixe.
4. Quem pode confirmar encaixe com conflito ou fora do expediente.
5. Quais pagamentos serao aceitos: dinheiro, Pix, debito, credito, dividido e parcial.
6. Se estorno comercial sera permitido ou somente correcao administrativa auditada.
7. Se estoque negativo sera proibido sempre ou permitido por excecao.
8. Como tratar fechamento com atendimento aberto, pagamento pendente ou estorno posterior.
9. Mensagens finais da interface para falha de internet/API.

## Arquivos alterados

- `src/http/app.ts`
- `src/domain/appointment-state-machine.ts`
- `src/domain/rules.ts`
- `src/application/operations-service.ts`
- `src/application/prisma-operations-service.ts`
- `tests/api.spec.ts`
- `tests/appointment-hardening.spec.ts`
- `tests/appointment-state-machine.spec.ts`
- `tests/db.integration.spec.ts`
- `tests/macro-233-owner-operations.spec.ts`
- `.planning/236_CENARIOS_REAIS_CONTINGENCIAS.md`

## Proxima etapa

`Macro 237 - Provisionamento final dos dados reais e preparacao do piloto`

Nao iniciar automaticamente.
