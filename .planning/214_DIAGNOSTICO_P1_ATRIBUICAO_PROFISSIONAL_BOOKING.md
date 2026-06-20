# Fase 212.2.1 — Diagnóstico P1 de atribuição de profissional no booking público

Data: 2026-06-20
Horario UTC: 2026-06-20T04:57:02Z

## Decisão

APROVADO PARA CORRECAO.

A causa provável foi identificada sem alteração de código, banco ou produção. O booking público não permite escolher profissional, o endpoint de slots não retorna profissional, e a criação pública escolhe um vínculo `ServiceProfessional` por `findFirst` sem `orderBy`. Como `svc-barba` possui múltiplos profissionais ativos vinculados, o profissional gravado pode não corresponder à expectativa assumida no piloto.

## Contexto

- Fase anterior: 212.2 — piloto controlado de Agenda.
- Agendamento testado: `d3e8e8db-0e53-4281-9e1a-162a0f2b62a2`.
- Cliente: `CLIENTE TESTE CONTROLADO - FASE 212.2`.
- Telefone: `00000021222`.
- Serviço: `Barba Terapia` / `svc-barba`.
- Horário: `2026-06-22T12:00:00.000Z`.
- Profissional esperado no plano: `Geovane Borges`.
- Profissional retornado no detalhe: `Rafael Andrade`.
- Resultado operacional: agendamento cancelado, slot liberado, sem checkout, sem pagamento, sem venda, sem devolução e sem financeiro.

## Preservação de evidência

- `git status --short`: `?? .planning/213_PILOTO_ASSISTIDO_OWNER_REAL.md`.
- `git status -sb`: `## main...origin/main` e o arquivo acima não rastreado.
- `.planning/213_PILOTO_ASSISTIDO_OWNER_REAL.md` foi preservado.
- Não houve `git add`, commit ou push.

## Documentação lida

- `.planning/213_PILOTO_ASSISTIDO_OWNER_REAL.md`.
- `.planning/212_PILOTO_SINTETICO_AGENDAMENTO.md`.
- `.planning/.continue-here.md`.
- `.planning/HANDOFF.json`.

## Consultas readonly feitas

Consultas executadas sem imprimir credenciais, tokens, `DATABASE_URL` ou conteúdo de `.env`:

- Serviço `svc-barba`.
- Vínculos `ServiceProfessional` de `svc-barba`.
- Profissionais ativos da unidade.
- Detalhe do agendamento `d3e8e8db-0e53-4281-9e1a-162a0f2b62a2`.
- Detalhe do agendamento sintético da Fase 212.1: `c9580676-c068-4729-b57d-0177794ba2f0`.
- Agenda/disponibilidade do horário `2026-06-22T12:00:00.000Z`.
- Expediente da unidade.
- Endpoint público `/public/slots`.
- Endpoint autenticado `/services/svc-barba`.
- Logs PM2 recentes filtrados para as rotas do piloto.

## Dados atuais encontrados

Serviço `svc-barba`:

- Nome: `Barba Terapia`.
- Unidade: `unit-01`.
- Ativo: `true`.
- Duração: `35` minutos.
- Valor: `55`.

Profissionais vinculados a `svc-barba`:

- `pro-01` — `Geovane Borges` — ativo.
- `demo-pro-02` — `Rafael Andrade` — ativo.
- `demo-pro-03` — `Lucas Ferreira` — ativo.
- `demo-pro-04` — `Matheus Souza` — ativo.

Consulta autenticada de serviço:

- `enabledProfessionalIds`: `pro-01`, `demo-pro-02`, `demo-pro-03`, `demo-pro-04`.
- Profissionais habilitados exibidos pela API de gestão: Geovane, Lucas, Matheus e Rafael.

Agendamento da Fase 212.2:

- ID: `d3e8e8db-0e53-4281-9e1a-162a0f2b62a2`.
- Status atual: `CANCELLED`.
- Serviço: `Barba Terapia`.
- Profissional gravado: `Rafael Andrade` (`demo-pro-02`).
- Cliente: `CLIENTE TESTE CONTROLADO - FASE 212.2`.
- Horário: `2026-06-22T12:00:00.000Z` a `2026-06-22T12:35:00.000Z`.

Agendamento sintético da Fase 212.1:

- ID: `c9580676-c068-4729-b57d-0177794ba2f0`.
- Status atual: `CANCELLED`.
- Serviço: `Barba Terapia`.
- Profissional gravado: `Rafael Andrade` (`demo-pro-02`).
- Conclusão: a Fase 212.1 assumiu `Geovane Borges` por consulta/expectativa de vínculo, mas o appointment gravado também ficou com `Rafael Andrade`.

Disponibilidade/agenda:

- `/public/slots` para `svc-barba` retorna slots no formato `{ "time": "...", "available": true|false }`.
- O slot não contém `professionalId`, `professionalName` nem identificador de recurso.
- O horário `2026-06-22 09:00` voltou a aparecer como disponível após o cancelamento.
- Não há tabela dedicada de escala por profissional no schema atual; a disponibilidade pública usa `BusinessHour` da unidade e conflitos de `Appointment`.

## Código inspecionado

- `src/http/app.ts`
  - `GET /public/services`.
  - `GET /public/slots`.
  - `POST /public/booking`.
  - `GET /services/:id`.
  - `GET /appointments/:id`.
- `public/booking.html`
  - carregamento de serviços.
  - carregamento de slots.
  - confirmação pública.
  - payload enviado para `/public/booking`.
- `src/application/prisma-operations-service.ts`
  - `getServiceProfessionalIds`.
  - `buildServiceManagementView`.
  - `getServiceById`.
- `src/application/operations-service.ts`
  - versão em memória dos vínculos e detalhe de serviço.
- `prisma/schema.prisma`
  - `Service`, `Professional`, `ServiceProfessional`, `Appointment`, `BusinessHour`.
- `prisma/seed.ts` e `prisma/demo-seed.ts`
  - origem histórica dos profissionais e vínculos.
- `tests/api.spec.ts`
  - cobertura do fluxo público sem login.

## Respostas às perguntas

1. `svc-barba` está vinculado a quais profissionais?

Geovane Borges, Rafael Andrade, Lucas Ferreira e Matheus Souza.

2. `Geovane Borges` está realmente habilitado para `svc-barba`?

Sim. `pro-01` está vinculado a `svc-barba` e ativo.

3. `Rafael Andrade` está habilitado para `svc-barba`?

Sim. `demo-pro-02` está vinculado a `svc-barba` e ativo.

4. O fluxo público permite escolher profissional explicitamente?

Não. A UI pública permite escolher serviço, data e horário. Ela não exibe seletor de profissional.

5. Se não permite escolher profissional, qual regra escolhe o profissional?

No backend Prisma, `POST /public/booking` executa `prisma.serviceProfessional.findFirst({ where: { serviceId, service: { businessId } }, include: { professional } })`, sem `orderBy`, e usa o primeiro profissional ativo retornado por essa consulta.

6. O endpoint de slots retorna profissional junto com o horário?

Não. Retorna apenas `time` e `available`.

7. O endpoint de criação respeita o profissional retornado no slot?

Não há profissional retornado no slot para respeitar. A criação recalcula/resolve o profissional de forma independente via `findFirst`.

8. Existe fallback para “primeiro profissional disponível”?

Existe uma regra equivalente a “primeiro vínculo ativo retornado pelo banco”. Ela não valida todos os profissionais habilitados nem escolhe explicitamente o primeiro disponível por agenda. No backend em memória também há fallback para o primeiro vínculo/primeiro profissional ativo.

9. Existe diferença entre o que a UI mostra e o que o backend grava?

Sim. A UI pública não mostra profissional; o backend grava um profissional escolhido implicitamente. Portanto o usuário/operador não tem previsibilidade visual sobre quem será atribuído.

10. A Fase 212.1 assumiu Geovane por inferência incorreta ou o comportamento mudou?

A evidência atual indica inferência incorreta. O agendamento da Fase 212.1 também está gravado com `Rafael Andrade`, embora a documentação tenha registrado que `Geovane Borges` foi identificado por endpoint autenticado de serviço.

## Causa provável

Classificação principal: B. Regra de negócio.

O booking público escolhe implicitamente um profissional habilitado para o serviço, sem permitir escolha explícita e sem contrato de qual profissional será selecionado.

Classificação secundária: C. Bug de backend / contrato inconsistente.

Há inconsistência entre disponibilidade e criação: `/public/slots` calcula disponibilidade por serviço e conflitos globais de agendamentos, sem retornar profissional; `/public/booking` seleciona um profissional via `findFirst` sem `orderBy`. Isso torna a atribuição não determinística do ponto de vista do contrato público e pode divergir da expectativa operacional.

Classificação complementar: E. Bug de documentação/teste.

O esperado `Geovane Borges` estava incorreto para o contrato atual, porque o contrato público nunca garantiu Geovane e o agendamento da Fase 212.1 também foi gravado com Rafael.

## Evidências principais

- `svc-barba` possui quatro profissionais ativos vinculados.
- `findFirst` sem `orderBy` retornou `Rafael Andrade` em consulta readonly reproduzindo a regra de `POST /public/booking`.
- `GET /public/slots` retorna apenas `time` e `available`.
- `public/booking.html` envia payload com `unitId`, `clientName`, `clientPhone`, `serviceId`, `startsAt` e opcionalmente `clientEmail`; não envia `professionalId`.
- O agendamento `d3e8e8db-0e53-4281-9e1a-162a0f2b62a2` foi gravado com `Rafael Andrade`.
- O agendamento `c9580676-c068-4729-b57d-0177794ba2f0` da Fase 212.1 também está gravado com `Rafael Andrade`.
- Logs PM2 confirmam criação 201, detalhe 200, cancelamento 200 e auditoria de cancelamento, sem erro crítico.

## Impacto

- Piloto real/checkout deve continuar bloqueado até a atribuição de profissional ficar previsível.
- Um checkout sobre atendimento atribuído a profissional inesperado pode afetar comissão, relatórios por profissional, agenda operacional e rastreabilidade.
- Cliente público não vê qual profissional atenderá.
- Owner pode assumir profissional errado se o roteiro/teste usar apenas serviço/horário.
- A disponibilidade pública pode ficar pessimista ou imprecisa em cenários com múltiplos profissionais, porque considera conflitos de appointments da unidade/serviço sem expor recurso profissional.

## Recomendação de correção

Definir primeiro o contrato de produto:

1. Se o booking público deve permitir escolher profissional:
   - `/public/slots` deve retornar slots por profissional ou incluir `professionalId`/`professionalName`.
   - `public/booking.html` deve enviar `professionalId`.
   - `POST /public/booking` deve validar que o profissional enviado está ativo, vinculado ao serviço, pertence à unidade e está livre no horário.

2. Se o booking público deve escolher automaticamente:
   - implementar regra determinística e documentada, por exemplo menor carga no dia, round-robin auditável ou primeiro disponível ordenado por prioridade/configuração.
   - `/public/booking` deve avaliar disponibilidade por profissional habilitado, não apenas `findFirst`.
   - `/public/slots` deve refletir a mesma regra usada na criação ou retornar capacidade por horário.

3. Em qualquer opção:
   - remover `findFirst` sem `orderBy` da regra de atribuição.
   - adicionar testes cobrindo múltiplos profissionais vinculados ao mesmo serviço.
   - atualizar documentação do booking público.
   - considerar auditoria explícita `APPOINTMENT_CREATED` para criação pública.

## Riscos

- Alterar a regra sem decisão de produto pode mudar a experiência pública e a distribuição de atendimentos.
- Tornar a escolha explícita exige ajuste de UI e pode expor nomes de profissionais ao cliente.
- Escolha automática por carga/round-robin precisa ser transacional para evitar corrida em horários concorrentes.
- Correção parcial apenas com `orderBy` estabiliza o resultado, mas não resolve previsibilidade da UI nem capacidade por múltiplos profissionais.

## Segurança operacional

Não houve:

- alteração de código;
- alteração manual em banco;
- migration;
- seed;
- deploy;
- restart PM2;
- criação de novo agendamento;
- checkout;
- venda;
- devolução;
- alteração de status;
- uso de cliente real;
- exposição de `.env`, senha, token, `DATABASE_URL`, hash ou segredo;
- `git add`;
- commit;
- push.

## Próxima etapa recomendada

Abrir fase de correção com decisão explícita de produto:

- recomendado: contrato público com escolha explícita de profissional ou atribuição automática determinística exibida/confirmada;
- mínimo técnico aceitável: backend escolher profissional disponível de forma ordenada e estável, com testes para múltiplos profissionais, e documentação deixando claro que o cliente não escolhe profissional.
