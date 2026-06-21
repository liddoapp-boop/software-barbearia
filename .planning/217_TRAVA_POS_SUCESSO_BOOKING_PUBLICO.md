# Sprint 217 - Trava pos-sucesso do booking publico

Data: 2026-06-21

## Objetivo

Impedir que o cliente faca outro agendamento acidentalmente no mesmo fluxo apos receber sucesso no booking publico.

## Problema observado

No teste mobile real, depois de confirmar um horario, a tela continuava com horarios antigos visiveis e clicaveis. O usuario conseguia tocar em outro horario, abrir nova confirmacao e confirmar outro agendamento sem clicar conscientemente em "Novo agendamento".

Risco classificado como P1 de UX do booking publico: duplicidade acidental de agenda para o mesmo cliente.

## Causa encontrada

- O frontend mantinha a grade de horarios no DOM apos o sucesso.
- O estado anterior (`bookingSubmitted`) era resetado ao selecionar outro dia ou horario.
- A selecao antiga (`selectedSlot`) continuava apta a gerar novo `POST /public/booking`.
- A confirmacao removia apenas o card anterior ja renderizado, mas chamadas assincronas antigas podiam empilhar novas confirmacoes.
- Havia bloqueio parcial contra duplo clique com `bookingSubmitting`, mas ele nao travava o fluxo concluido.

## Correcao aplicada

Arquivo alterado: `public/booking.html`.

- Criado estado explicito `bookingCompleted`.
- Criado helper `canMutateBookingFlow(runId)` para bloquear selecao, navegacao de calendario, render de confirmacao e submit em fluxo concluido.
- Criado `lockCompletedBookingUI()` para:
  - marcar `bookingCompleted = true`;
  - encerrar estado de submit;
  - adicionar classe visual `booking-locked`;
  - desabilitar botoes de confirmacao remanescentes;
  - remover calendario, confirmacao e cards de sucesso anteriores;
  - limpar `selectedSlot` e `selectedSlotProfessional`.
- Criado `renderBookingSuccess(summary)` para renderizar somente uma mensagem de sucesso e um card de resumo.
- O resumo de sucesso usa snapshot `submittedData`, garantindo que a tela mostre o appointment recem-criado, mesmo se algum estado mudar depois.
- Removidos resets que liberavam novo booking apos sucesso.

## Comportamento pos-sucesso

Apos resposta `201` de `POST /public/booking`:

- a grade de horarios antiga sai do DOM;
- o card de confirmacao antigo sai do DOM;
- o botao confirmar fica desabilitado antes da remocao;
- `selectedSlot` e `selectedSlotProfessional` sao limpos;
- `submitBooking` retorna imediatamente se `bookingCompleted = true`;
- selecao de dia/horario retorna imediatamente se `bookingCompleted = true`;
- fica visivel apenas a mensagem "Agendamento confirmado!", o resumo do agendamento e o botao "Novo agendamento".

## Novo agendamento

O botao "Novo agendamento" chama `beginNewBooking(true)`, que executa `resetBookingFlowState()` e:

- limpa sucesso anterior;
- limpa confirmacao e calendario antigos;
- limpa servico/profissional/data/horario selecionados;
- limpa loading/submitting;
- remove `booking-locked`;
- recarrega o fluxo publico desde a escolha de servico.

Assim, um segundo agendamento so ocorre por acao consciente de reiniciar o fluxo.

## Trava anti-duplo clique

- `submitBooking` retorna se `bookingSubmitting` ou `bookingCompleted`.
- Ao clicar em confirmar, `bookingSubmitting = true`.
- O botao correto e buscado por `#confirmWidgetWrap #btnConfirm`, desabilitado e alterado para "Enviando...".
- Em falha, `bookingSubmitting = false` e o botao ativo e reabilitado.
- Em sucesso, `lockCompletedBookingUI()` mantem o fluxo travado e nao libera novo submit.
- `confirmRenderSeq` invalida renderizacoes assincronas antigas para evitar empilhamento de cards.

## Testes criados

Arquivo criado: `tests/frontend-booking-public.spec.ts`.

Cobertura:

- estado explicito `bookingCompleted` e ausencia do antigo `bookingSubmitted`;
- handlers criticos protegidos por `canMutateBookingFlow`;
- remocao de calendario, confirmacao e sucesso anterior;
- render de um unico sucesso com resumo baseado em `submittedData`;
- bloqueio de double tap no confirmar;
- liberacao do submit apenas em falha;
- reset limpo via "Novo agendamento";
- preservacao dos contratos publicos: `professionalId`, e-mail opcional, `professionalName` e auditoria `APPOINTMENT_CREATED`.

Como nao havia estrutura simples de teste E2E/DOM completo para o HTML publico, a sprint adicionou teste estatico de contrato sobre o frontend e manteve os testes backend existentes passando.

## Validacao local

Baseline antes da alteracao:

- `npm run build`: passou.
- `npm test`: passou, 7 arquivos, 1 skipped, 111 testes, 19 skipped.
- `npm run test:db`: passou, 19 testes.
- `npm run smoke:api:readonly`: passou.
- `git diff --check`: passou.

Apos a alteracao:

- `npm test -- --run tests/frontend-booking-public.spec.ts tests/api.spec.ts`: passou, 2 arquivos, 86 testes.
- `npx tsc --noEmit`: passou.
- `npm run build`: passou.
- `npm test`: passou, 8 arquivos, 1 skipped, 116 testes, 19 skipped.
- `npm run test:db`: passou, 19 testes.
- `npm run smoke:api:readonly`: passou.
- `git diff --check`: passou.

## Riscos restantes

- A validacao automatizada do bloqueio pos-sucesso ficou como contrato estatico porque o booking publico ainda nao possui harness E2E dedicado.
- A blindagem backend contra duplicidade por idempotency key nao foi adicionada nesta sprint para evitar alteracao de contrato/schema fora do escopo.

## Deploy e validacao em producao

Executado em 2026-06-21 apos o commit `9487c87`.

### Deploy

- `git push origin main`: publicado em `main`.
- `git pull --ff-only origin main`: up to date no servidor.
- `npx prisma migrate status`: schema up to date, sem migration pendente.
- `npm run build`: passou.
- `pm2 restart software-barbearia --update-env`: processo reiniciado.
- `pm2 status software-barbearia`: `online`, pid `331011`.
- `curl https://barbearia.76-13-161-250.nip.io/health`: `{"ok":true,"authEnforced":true}`.
- `npm run smoke:api:readonly`: passou.

### Evidencia do HTML implantado

- Rota publica correta: `/agendamento`.
- `GET /agendamento`: 200.
- HTML implantado contem `bookingCompleted`, `lockCompletedBookingUI`, `canMutateBookingFlow` e `bookingSuccessWrap`.
- `/booking.html` redireciona para `/agendamento`; `/public/booking.html` nao e rota publica valida.

### Piloto fake controlado

Validacao executada por Chrome headless em viewport mobile `390x844`, simulando o fluxo publico real:

- Cliente fake: `CLIENTE TESTE TRAVA BOOKING - SPRINT 217`.
- Telefone fake: `00000021700`.
- E-mail: em branco.
- Servico: `Barba Terapia` (`svc-barba`).
- Profissional: `Geovane Borges` (`pro-01`).
- Horario escolhido: `2026-06-22 10:00` horario local.
- `startsAt` gravado: `2026-06-22T13:00:00.000Z`.
- Agendamento fake criado: `4837e726-4e06-460d-82d8-cac76336768e`.

Resultado UI pos-sucesso:

- Double tap no botao confirmar gerou exatamente `1` POST para `/public/booking`.
- `#bookingSuccessWrap`: `1`.
- `#bookingSuccessMessageWrap`: `1`.
- `#confirmWidgetWrap`: `0`.
- `#calWidgetWrap`: `0`.
- `.slot-btn` apos sucesso: `0`.
- `#btnConfirm` apos sucesso: `0`.
- `booking-locked`: `true`.
- `bookingCompleted`: `true`.
- `bookingSubmitting`: `false`.
- `selectedSlot`: `null`.
- Tentativa de clicar em slot/confirmar depois do sucesso manteve `posts=1` e `successCards=1`.
- Botao "Novo agendamento" removeu sucesso, removeu lock e deixou o fluxo apto a recomecar sem novo POST (`restartPosts=1`).

Resultado API/operacional:

- Agenda owner retornou exatamente `1` ocorrencia para o agendamento fake.
- Auditoria `APPOINTMENT_CREATED` encontrada para o appointment fake.
- Profissional gravado: `pro-01` / `Geovane Borges`.
- Cancelamento aplicado via `/appointments/:id/status`: `CANCELLED`.
- Slot `2026-06-22 10:00` voltou a ficar disponivel apos cancelamento.
- Financeiro relacionado ao teste: `0`.
- Contagem financeira global do mes permaneceu `8 -> 8`.

### Logs finais

- PM2 `error.log`: sem stack trace ou erro de aplicacao no trecho final.
- PM2 `out.log`: registrou `/agendamento` 200, `/public/booking` 201, auditoria `APPOINTMENT_CREATED`, `/appointments/:id/status` 200, `/public/slots` 200 apos cancelamento e `/financial/transactions` 200.
- Health final permaneceu `ok=true`.

## Decisao final

APROVADO.

Nao houve migration aplicada, seed, alteracao de `.env`, segredo exposto, alteracao manual em banco, cliente real, checkout, pagamento, venda real ou devolucao real.
