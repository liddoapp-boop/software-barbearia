# Fase 212.1 — Piloto sintético controlado de agendamento

Data: 2026-06-20

## Decisão

PILOTO SINTETICO APROVADO.

O fluxo público real de agendamento criou 1 agendamento sintético, a Agenda owner exibiu o registro esperado, o cancelamento por endpoint seguro funcionou e o horário voltou a ficar disponível. Não houve checkout, venda, devolução ou lançamento financeiro relacionado ao agendamento de teste.

## Baseline

- `git status -sb`: `main...origin/main`.
- `git status --short`: limpo.
- Commit inicial da fase: `a08fd36 test: validar fluxo operacional principal`.
- `GET /health`: `{"ok":true,"authEnforced":true}`.
- `npm run smoke:api:readonly`: passou antes do piloto.

## Contrato público identificado

- Página pública: `GET /agendamento`.
- Serviços públicos: `GET /public/services?unitId=...`.
- Dados públicos do negócio: `GET /public/business?unitId=...`.
- Expediente público: `GET /public/working-hours?unitId=...`.
- Slots públicos: `GET /public/slots?unitId=...&serviceId=...&weekStart=YYYY-MM-DD`.
- Criação pública: `POST /public/booking?unitId=...`.

Payload real de criação:

```json
{
  "unitId": "unit-01",
  "clientName": "CLIENTE TESTE AUTOMATICO - PILOTO SINTETICO",
  "clientPhone": "00000000000",
  "serviceId": "svc-barba",
  "startsAt": "2026-06-20T12:00:00.000Z"
}
```

O endpoint público cria cliente por telefone quando necessário e cria o agendamento como `SCHEDULED`. O profissional é resolvido pelo vínculo ativo do serviço.

## Execução do piloto

- Página pública `/agendamento`: 200.
- Login owner: 200.
- `/auth/me`: 200.
- Serviços públicos ativos encontrados: 7.
- Serviço escolhido: `Barba Terapia`.
- Profissional habilitado identificado por endpoint autenticado de serviço: `Geovane Borges`.
- Horário escolhido: `2026-06-20T12:00:00.000Z`.
- Nome de teste: `CLIENTE TESTE AUTOMATICO - PILOTO SINTETICO`.
- Telefone de teste: `00000000000`.
- E-mail: não informado, para evitar envio externo desnecessário.

Resultado da criação:

- `POST /public/booking`: 201.
- ID do agendamento: `c9580676-c068-4729-b57d-0177794ba2f0`.
- Status inicial validado na Agenda owner: `SCHEDULED`.
- Ocorrências encontradas na Agenda owner por ID: 1.

## Cancelamento e validações

- Endpoint usado: `PATCH /appointments/:id/status`.
- Status enviado: `CANCELLED`.
- Cancelamento retornou 200.
- Detalhe autenticado do agendamento confirmou `CANCELLED`.
- `GET /public/slots` após cancelamento confirmou que o mesmo horário voltou a ficar disponível.
- Não houve checkout.
- Não houve venda.
- Não houve devolução.
- Não houve financeiro relacionado ao ID do agendamento.
- A consulta de auditoria encontrou 1 evento relacionado ao agendamento, gerado pelo cancelamento (`APPOINTMENT_STATUS_UPDATED`).
- O cliente sintético foi criado automaticamente pelo fluxo público e permanece como dado de teste claramente identificado; nenhum cliente real foi alterado.

## Pós-validação

- `npm run smoke:api:readonly`: passou após o piloto.
- Agenda readonly continuou carregando.
- Financeiro readonly continuou carregando.
- Auditoria readonly continuou carregando.
- Logs recentes do PM2 não indicaram crash, loop de restart, erro 500 repetido, erro Prisma crítico ou falha de bind.

## Bugs encontrados

P0/P1: nenhum.

P2/P3:

- O fluxo público de criação não registra auditoria explícita de `APPOINTMENT_CREATED`; a auditoria observada nesta fase foi gerada pelo cancelamento autenticado. Avaliar se a criação pública deve gerar evento auditável próprio em fase futura.
- Não há nesta fase endpoint de limpeza do cliente sintético. O dado permanece rastreável pelo nome/telefone de teste.

## Segurança operacional

Não houve:

- migration;
- seed;
- alteração em `.env`;
- alteração manual em banco;
- checkout;
- venda;
- devolução;
- financeiro relacionado ao agendamento de teste;
- deploy;
- restart PM2;
- alteração em Nginx, firewall ou certificado;
- impressão de token, senha, `DATABASE_URL` ou conteúdo de `.env`.

## Próxima etapa recomendada

Executar piloto assistido owner-only com uma pessoa usando o fluxo de balcão completo, mantendo a regra de não concluir atendimento/checkout sem validação operacional explícita.
