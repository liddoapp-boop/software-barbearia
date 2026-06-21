# Sprint 216 - Correcao mobile real do booking publico

Data: 2026-06-21

## Objetivo

Corrigir tres problemas observados no booking publico em uso real mobile:

- campos de nome/telefone/e-mail reaproveitando texto indevido salvo/autopreenchido;
- falha de envio quando o e-mail opcional chegava invalido ao backend;
- lista publica de profissionais exibindo profissionais de demonstracao quando operacionalmente apenas profissionais reais devem ser ofertados.

## Alteracoes aplicadas

- `public/booking.html`
  - Normaliza `liddo_client` antes de usar dados salvos.
  - Remove valores suspeitos de localStorage, incluindo o texto real observado sobre query SQL/duplicidades.
  - Nao preenche automaticamente telefone/e-mail no fluxo ativo.
  - Configura `autocomplete`, `name` e `inputMode` por tipo de campo.
  - Permite prosseguir sem e-mail, omitindo `clientEmail` do payload.
  - Valida e-mail no cliente e mostra mensagem amigavel.
  - Esconde erros tecnicos do backend na UI publica.

- `src/http/app.ts`
  - Normaliza `clientEmail` opcional no schema publico.
  - Converte e-mail vazio em `undefined`.
  - Retorna erro 400 amigavel para e-mail invalido.
  - Filtra profissionais com ID `demo-pro-*` das rotas publicas de profissionais, slots e booking.

- `tests/api.spec.ts`
  - Adiciona cobertura para e-mail invalido com mensagem amigavel.
  - Adiciona contrato estatico para filtro de profissionais demo.
  - Reforca contrato estatico do booking mobile: sanitizacao, autocomplete e ausencia de prefill automatico de telefone/e-mail.

## Validacao local

- `npx tsc --noEmit`: passou.
- `npm test -- --run tests/api.spec.ts`: passou, 81 testes.
- `npm run build`: passou.
- `npm test`: passou, 7 arquivos, 1 skipped, 111 testes, 19 skipped.
- `npm run test:db`: passou, 19 testes.
- `npm run smoke:api:readonly`: passou.
- `git diff --check`: passou.

## Observacoes

- A correcao nao adiciona migracao nem seed.
- A regra publica usa o contrato existente dos dados de demo (`demo-pro-*`) porque o schema atual de `Professional` nao possui campo explicito de publicacao.
- Profissionais reais criados pela operacao continuam elegiveis se estiverem ativos e vinculados ao servico.

## Deploy e validacao em producao

Executado em 2026-06-21 apos o commit `e35b99a`.

### Deploy

- `git push origin main`: publicado em `main`.
- `git pull --ff-only origin main`: up to date no servidor.
- `npx prisma migrate status`: schema up to date, sem migration pendente.
- `npm run build`: passou.
- `pm2 restart software-barbearia --update-env`: processo reiniciado.
- `pm2 status software-barbearia`: `online`, pid `324498`.
- `curl http://127.0.0.1:3333/health`: `{"ok":true,"authEnforced":true}`.
- `npm run smoke:api:readonly`: passou.

### Piloto fake controlado

- Endpoint publico validado: `/public/services/svc-barba/professionals?unitId=unit-01`.
- Resultado publico: somente `Geovane Borges` (`pro-01`).
- Cliente fake: `CLIENTE TESTE MOBILE REAL - SPRINT 216 - f12d2329`.
- Agendamento fake criado sem `clientEmail`: `609c2009-3927-4d6d-a222-f45ca105e50f`.
- Horario criado: `2026-06-22T12:00:00.000Z`.
- Profissional gravado: `pro-01` / `Geovane Borges`.
- Agenda autenticada retornou exatamente 1 ocorrencia para o agendamento fake.
- Auditoria `APPOINTMENT_CREATED` encontrada para `/public/booking`.
- Cancelamento via status aplicado para o agendamento fake: `CANCELLED`.
- Slot ficou disponivel novamente apos o cancelamento.
- Financeiro sem efeito colateral: entradas relacionadas ao agendamento `0`; contagem global `101 -> 101`.

### Logs finais

- Logs do PM2 registraram `/public/booking` com status `201`.
- Logs do PM2 registraram auditoria `APPOINTMENT_CREATED`.
- Logs do PM2 registraram `/appointments/:id/status` com status `200` para cancelamento.
- Logs do PM2 registraram `/public/slots` com status `200` apos cancelamento.
- Health final permaneceu `ok=true`.
