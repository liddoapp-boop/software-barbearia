# Sprint 228.3 - Fechamento local do checkout UX

Data: 2026-07-02

Decisao: APROVADO PARA FECHAMENTO LOCAL DA SPRINT 228.3

Escopo: validar e fechar localmente a integracao visual do checkout do atendimento, sem producao, VPS, push ou inicio da Sprint 229.

## Itens entregues

- Agenda Semana/Lista corrigida para manter periodo semanal sincronizado.
- Lista da Agenda passou a expor a progressao operacional `SCHEDULED -> CONFIRMED -> IN_SERVICE`.
- Checkout UX centralizado em um fluxo oficial, sem auto conclusao por status.
- Acao de checkout restrita no frontend a `owner` e `recepcao`.
- Detalhe/drawer do atendimento fecha antes do modal oficial de checkout abrir.
- Modal de checkout permanece na Agenda e nao navega automaticamente para Financeiro.
- Texto final do pagamento: `Confirmar pagamento e concluir`.
- Metodo de pagamento obrigatorio.
- Fechamento do modal somente apos resposta da API com `appointment.status = COMPLETED`.
- Protecao contra submit repetido.
- Normalizacao de cliente, servico, profissional, preco e duracao a partir de payloads aninhados da API.
- Protecao contra resposta antiga em `loadAll`.
- Contencao de overflow mobile no app autenticado.
- Mensagem amigavel ao agendar com texto digitado sem cliente selecionado.

## Banco visual

Banco local usado para evidencia manual/controlada:

`barbearia_visual_test_20260702`

Nenhuma URL completa, senha ou token foi registrado.

## Evidencia owner

Appointment validado:

`appt-visual-sprint-2283-owner-checkout`

Resultado:

- status final: `COMPLETED`;
- receita de servico: 1 registro, R$ 30, metodo `PIX`;
- comissao de servico: 1 registro, R$ 12;
- idempotencia: 1 registro `APPOINTMENT_CHECKOUT` com status `SUCCEEDED`;
- auditoria: 1 registro `APPOINTMENT_CHECKOUT_COMPLETED`;
- sem duplicidade de receita, comissao ou auditoria.

O reteste visual owner tambem confirmou:

- detalhe fecha antes do checkout;
- checkout abre na frente;
- servico e valor aparecem corretamente;
- produtos podem ser adicionados/removidos;
- total atualiza;
- atendimento fica concluido;
- persistencia apos reload;
- botao `Concluir` nao reaparece;
- nao houve navegacao automatica para Financeiro.

## Evidencia recepcao

Fixture:

`appt-visual-sprint-2283-recepcao-checkout`

Antes do checkout:

- status: `IN_SERVICE`;
- receitas: 0;
- comissoes: 0;
- idempotencias: 0;
- auditorias de checkout: 0.

Autenticacao real:

- `/auth/login` como `recepcao`;
- `/auth/me` confirmou `role = recepcao`.

Resultado:

- `POST /appointments/:id/checkout`: HTTP 200;
- replay com mesma chave idempotente: HTTP 200;
- status final: `COMPLETED`;
- receita de servico: 1 registro, R$ 30, metodo `PIX`;
- comissao de servico: 1 registro, R$ 12;
- idempotencia: `APPOINTMENT_CHECKOUT` com status `SUCCEEDED`;
- auditoria: `APPOINTMENT_CHECKOUT_COMPLETED`;
- replay retornou os mesmos IDs de receita e comissao;
- sem duplicidade.

## Evidencia profissional

Fixture:

`appt-visual-sprint-2283-profissional-blocked`

Antes das tentativas:

- status: `IN_SERVICE`;
- receitas: 0;
- comissoes: 0;
- idempotencias: 0;
- auditorias de checkout: 0.

Autenticacao real:

- `/auth/login` como `profissional`;
- `/auth/me` confirmou `role = profissional`.

Resultado:

- botao de checkout nao renderiza quando `canCheckout=false`;
- `PATCH /appointments/:id/status` para `COMPLETED`: HTTP 400;
- `POST /appointments/:id/checkout`: HTTP 403;
- chamada direta profissional a `/complete`: HTTP 403 por RBAC;
- contrato legado `/complete` confirmado como owner: HTTP 410;
- status permaneceu `IN_SERVICE`;
- receitas permaneceram 0;
- comissoes permaneceram 0;
- idempotencias de sucesso permaneceram 0.

## Mensagem amigavel de cliente

Problema corrigido:

Ao digitar texto no campo Cliente sem selecionar um cliente cadastrado, o frontend podia enviar `clientId = ""` e exibir erro tecnico bruto de validacao.

Comportamento atual:

- submit bloqueia antes de chamar a API se nao houver `clientId` real;
- mensagem exibida: `Selecione um cliente cadastrado antes de confirmar o agendamento.`;
- foco retorna para o campo Cliente;
- campos permanecem preenchidos;
- editar o texto apos selecionar um cliente limpa o `clientId`;
- selecionar cliente valido remove o bloqueio;
- JSON/Zod bruto nao e renderizado para o operador.

## Testes executados

- `npx vitest run tests/frontend-checkout-flow.spec.ts`: passou, 5 testes.
- `npx vitest run tests/frontend-agenda-normalization.spec.ts`: passou, 3 testes.
- `npx vitest run tests/frontend-schedule-validation.spec.ts`: passou, 4 testes.
- `npm test`: passou, 13 arquivos, 11 passed, 2 skipped; 171 testes, 148 passed, 23 skipped.
- `npm run test:db`: passou, 21 testes DB.
- `npx tsc -p tsconfig.json --noEmit`: passou.
- `npm run build`: passou.
- `git diff --check`: passou com avisos LF/CRLF existentes.
- `git diff --cached --check`: passou.

Observacao: o primeiro `npm run test:db` falhou por `EPERM` no `prisma generate` porque um servidor Node local mantinha o Prisma Client carregado. O processo local do workspace foi encerrado e o comando passou em seguida.

## Limitacoes conhecidas

- Validacao visual multi-perfil via navegador nao foi aberta automaticamente; a validacao de recepcao/profissional foi controlada por API in-process e banco local.
- Producao nao foi validada nem alterada nesta sprint.
- Sprint 229 nao foi iniciada.

## Resultado

Sprint 228.3 aprovada para fechamento local.

Nao declarar producao pronta a partir deste documento.
