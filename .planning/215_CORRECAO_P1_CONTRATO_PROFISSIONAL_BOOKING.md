# Fase 212.2.2 — Correção P1 do contrato de profissional no booking público

Data: 2026-06-20
Horario UTC: 2026-06-20T05:15:45Z

## Decisão

APROVADO PARA DEPLOY.

A correção foi implementada e validada sem executar piloto em produção, sem criar agendamento real, sem checkout, sem venda, sem pagamento, sem migration, sem seed e sem alteração manual de banco.

## Problema tratado

O booking público escolhia profissional implicitamente no backend. Em serviços com múltiplos profissionais ativos, como `svc-barba`, a criação pública podia gravar profissional diferente do esperado, porque o contrato não permitia escolha explícita e usava seleção implícita sem regra determinística documentada.

## Contrato final

O contrato público passa a ser:

- Cliente escolhe serviço.
- Cliente escolhe profissional explicitamente ou escolhe `Sem preferência`.
- `GET /public/services/:serviceId/professionals` lista os profissionais ativos, vinculados ao serviço e à unidade.
- `GET /public/slots` aceita `professionalId` opcional e retorna slots com `professionalId` e `professionalName` quando há disponibilidade.
- `POST /public/booking` aceita `professionalId` opcional.
- Se `professionalId` for enviado, o backend valida que o profissional existe, está ativo, pertence à unidade, está vinculado ao serviço e está livre no horário.
- Se `professionalId` não for enviado, o backend usa atribuição automática determinística entre os profissionais elegíveis e disponíveis.

## Regra de sem preferência

`Sem preferência` não grava um profissional aleatório. O backend ordena profissionais elegíveis por `name` e depois por `id`, avalia conflitos no horário e escolhe o primeiro profissional disponível nessa ordem.

Essa mesma ordenação é usada para `/public/slots` e para `POST /public/booking`, mantendo o profissional sugerido no slot alinhado com o profissional efetivamente gravado, desde que não haja nova ocupação concorrente entre consulta e criação.

## Backend

Arquivos alterados:

- `src/http/app.ts`

Mudanças principais:

- Criado endpoint `GET /public/services/:serviceId/professionals`.
- Criada resolução compartilhada de serviço, profissionais elegíveis, slots ocupados e disponibilidade.
- `/public/slots` passou a validar serviço/profissional e retornar `professionalId`/`professionalName`.
- `/public/booking` passou a aceitar `professionalId`.
- Criação pública passou a validar profissional antes de criar/buscar cliente.
- Removido o uso de `serviceProfessional.findFirst` sem `orderBy` da regra crítica de criação pública.
- Conflito de agenda passou a ser calculado por profissional elegível.

## Frontend

Arquivo alterado:

- `public/booking.html`

Mudanças principais:

- Adicionada etapa de escolha de profissional após o serviço.
- Adicionada opção `Sem preferência`.
- A UI carrega profissionais via endpoint público do serviço.
- A consulta de slots envia `professionalId` quando há escolha explícita.
- A confirmação exibe o profissional escolhido ou `Sem preferência`.
- O payload de `/public/booking` envia `professionalId` somente quando há escolha explícita.
- O resumo local do agendamento passa a armazenar/exibir o profissional retornado pelo backend.

## Testes adicionados

Arquivo alterado:

- `tests/api.spec.ts`

Cobertura nova:

- Booking público grava o profissional escolhido explicitamente.
- Detalhe do atendimento preserva o profissional gravado.
- Profissional não vinculado ao serviço é rejeitado.
- `Sem preferência` usa atribuição determinística.
- `/public/slots` e `POST /public/booking` retornam/gravam o mesmo profissional para o slot automático.
- Check estático garante que a seção pública não usa `serviceProfessional.findFirst`.
- Check estático garante que a UI contém etapa de profissional e envia `professionalId` quando explícito.

## Validação executada

Comandos executados:

- `npm run build`
  - Resultado: passou.
- `npm test`
  - Resultado final: passou, 7 arquivos, 105 testes válidos e 16 skipped.
- `npm run test:db`
  - Resultado: passou, 16 testes.
- `npm test -- --run tests/api.spec.ts -t "booking publico|fluxo publico"`
  - Resultado: passou no recorte dos novos fluxos públicos.
- `npm test -- --run tests/api.spec.ts -t "contrato estatico"`
  - Resultado: passou após ajuste do recorte estático.

## Restrições respeitadas

- Não foi executado deploy.
- Não foi reiniciado PM2.
- Não foi executada migration.
- Não foi executado seed.
- Não houve alteração manual de banco.
- Não foi criado agendamento em produção.
- Não foi executado checkout.
- Não foi criada venda, devolução ou pagamento.
- Não foram expostos `.env`, senha, token, `DATABASE_URL`, hash ou segredo.
- Não foi usado `git add .` nem `git add -A`.

## Observações

Esta fase corrige a causa P1 identificada no diagnóstico anterior. Um novo piloto controlado em produção só deve ser executado depois de deploy aprovado, usando cliente e roteiro de teste claramente rastreáveis e sem checkout/pagamento real.
