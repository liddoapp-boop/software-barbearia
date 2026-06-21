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

Pendente neste ponto da sprint. Apos deploy, registrar:

- health/PM2/smoke readonly;
- lista publica de profissionais do servico `svc-barba`;
- agendamento fake controlado sem e-mail;
- presenca unica na agenda;
- auditoria `APPOINTMENT_CREATED`;
- cancelamento do agendamento fake;
- ausencia de impacto financeiro.
