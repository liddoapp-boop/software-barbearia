# Sprint 213 - Consolidacao do booking publico com profissional e auditoria

Data: 2026-06-21

## Estado real do Git

- Branch inicial: `main...origin/main`.
- Worktree inicial: limpo.
- Ultimos commits reais incluam trabalho posterior ao marco citado no pedido:
  - `6d232ed docs: registrar validacao da politica de comissao em estorno`
  - `6aeef90 fix: cancelar comissao pendente em estorno de atendimento`
  - `de249bb docs: registrar deploy da correcao de profissional no booking`
  - `fb0429e fix: tornar profissional deterministico no booking publico`
  - `1cc25a1 docs: registrar piloto sintetico de agendamento`
- Nao havia documentos nao rastreados em `.planning`.

## Problema

O booking publico ja tinha contrato de profissional explicito e "Sem preferencia" em grande parte do codigo, mas a criacao publica ainda nao registrava auditoria propria `APPOINTMENT_CREATED`.

## Contrato final do booking publico

- `GET /public/services` retorna servicos ativos publicos.
- `GET /public/services/:serviceId/professionals` retorna profissionais elegiveis do servico com dados publicos seguros:
  - `id`
  - `name`
  - `displayName`
- O endpoint publico de profissionais nao retorna e-mail, telefone, documento, comissao ou campos internos.
- `GET /public/slots` aceita `serviceId`, `weekStart`, `unitId` opcional e `professionalId` opcional.
- `POST /public/booking` aceita `professionalId` opcional.

## Profissional explicito

Quando `professionalId` e enviado:

- o backend valida servico ativo na unidade;
- valida profissional ativo e vinculado ao servico;
- valida disponibilidade do profissional para o horario;
- grava o agendamento com o profissional escolhido;
- retorna `professionalId` e `professionalName`.

## Sem preferencia

Quando `professionalId` nao e enviado:

- o backend usa os profissionais elegiveis do servico;
- ordena por `name` e depois `id`;
- escolhe o primeiro profissional disponivel para o horario;
- grava o mesmo profissional resolvido.

A regra evita `serviceProfessional.findFirst(...)` sem `orderBy` no caminho critico do booking publico.

## Slots publicos

`/public/slots` retorna, em cada slot:

- `time`
- `available`
- `professionalId`
- `professionalName`

Para "Sem preferencia", cada horario disponivel recebe o primeiro profissional disponivel pela ordem deterministica. Para profissional explicito, os slots sao calculados apenas para aquele profissional.

## Booking publico

`POST /public/booking` resolve o profissional pela mesma regra usada pelos slots antes de criar o cliente/agendamento. Se nenhum profissional elegivel estiver disponivel, responde `409`.

## Auditoria

Foi adicionada auditoria no caminho `POST /public/booking`:

- action: `APPOINTMENT_CREATED`
- entity: `appointment`
- entityId: appointmentId
- route: `/public/booking`
- method: `POST`
- actor: `anonymous`
- metadata: `{ source: "public" }`
- afterJson registra origem publica, appointmentId, clientId, serviceId/serviceName, professionalId/professionalName, startsAt e endsAt.

Telefone e e-mail do cliente nao sao gravados no payload de auditoria publica.

## Arquivos alterados

- `src/http/app.ts`
- `tests/api.spec.ts`
- `.planning/213_CONSOLIDACAO_BOOKING_PUBLICO_PROFISSIONAL_AUDITORIA.md`

## Testes criados/alterados

- Novo teste: lista somente dados publicos seguros dos profissionais elegiveis por servico.
- Novo teste: registra auditoria ao criar agendamento pelo booking publico.
- Testes existentes confirmam:
  - booking publico com profissional explicito grava o profissional escolhido;
  - profissional nao vinculado ao servico falha;
  - booking sem preferencia usa atribuicao deterministica;
  - `/public/slots` explicito e sem preferencia retornam profissional resolvido;
  - slot retornado e booking criado nao divergem;
  - contrato estatico nao usa `serviceProfessional.findFirst` no booking publico.

## Validacoes locais

- `npm run build`: passou.
- `npm test`: passou, 7 arquivos passados, 1 skipped; 109 testes passados, 19 skipped.
- `npm run test:db`: passou, 1 arquivo passado; 19 testes passados.
- `node --check scripts/smoke-api-readonly.mjs`: passou.
- `git diff --check`: passou.
- `npm run smoke:api:readonly`: passou.

## Riscos restantes

- A criacao publica e a auditoria sao operacoes sequenciais no handler publico. Se a gravacao de auditoria falhar depois da criacao do agendamento, a requisicao falhara apos o agendamento ja existir. Nao foi introduzida migration nem refatoracao transacional nesta sprint para manter o escopo controlado.
- Falta registrar nesta mesma documentacao os resultados de deploy e piloto controlado em producao.

## Decisao pre-deploy

APROVADO para commit, push, deploy controlado e smoke pos-deploy, pois build, testes, test:db, checks e smoke readonly passaram localmente.
