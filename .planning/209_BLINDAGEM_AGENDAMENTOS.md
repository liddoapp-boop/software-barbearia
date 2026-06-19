# Sprint 209 - Blindagem da Agenda

Data: 2026-06-19
Status: aprovado

## Escopo executado

Auditoria e correcoes P1 no fluxo de agendamentos:

- criacao de agendamento;
- reagendamento;
- conflito por profissional e cliente;
- buffer entre atendimentos;
- horario comercial, dia fechado, intervalo e antecedencia minima;
- consistencia de unidade para servico/profissional;
- filtro de status invalido;
- concorrencia no backend Prisma;
- smoke readonly de API.

Nao houve alteracao em producao, migracao, seed de producao, `.env`, secrets, WhatsApp ou IA.

## Problemas confirmados

- A validacao central de agenda nao aplicava horario comercial, dia fechado, intervalo, passado e antecedencia minima no fluxo interno de agendamentos.
- O reagendamento calculava `endsAt` apenas com a duracao do servico, ignorando o buffer.
- A checagem de conflito considerava apenas profissional, permitindo duplicidade simultanea para o mesmo cliente.
- Sugestoes de horario podiam ignorar regras de horario comercial e buffer.
- O backend em memoria aceitava servico/profissional de outra unidade em alguns caminhos.
- `GET /appointments?status=...` filtrava status invalido silenciosamente.
- A criacao Prisma dependia de prechecagem de conflito; sob concorrencia, precisava de protecao transacional explicita.

## Problemas descartados

- Nao foi confirmada quebra estrutural visivel no HTML da tela de agenda dentro do escopo desta sprint.
- Nao foi necessaria migracao de banco.
- O smoke readonly de API ja estava saudavel antes e continuou saudavel apos as correcoes.

## Correcoes aplicadas

- `src/domain/rules.ts`
  - adicionada `validateAppointmentSchedulingWindow`;
  - conflito agora considera profissional ou cliente;
  - validacao de horario comercial usa timezone da unidade, com fallback `America/Sao_Paulo`;
  - aplica dia fechado, faixa de funcionamento, intervalo, passado, antecedencia minima e duracao minima com buffer.

- `src/application/barbershop-engine.ts`
  - criacao e reagendamento passam a aceitar configuracoes de agenda;
  - `endsAt` de reagendamento inclui buffer;
  - conflito recebe `clientId`;
  - `allowOverbooking` continua respeitado.

- `src/application/operations-service.ts`
  - criacao, atualizacao, reagendamento e sugestoes usam a regra central;
  - servico e profissional precisam pertencer a unidade;
  - buffer padrao vem de `businessSettings`;
  - conflito considera profissional e cliente.

- `src/application/prisma-operations-service.ts`
  - criacao valida janela antes da escrita;
  - criacao roda em transacao serializable;
  - locks transacionais por unidade/profissional/cliente via `pg_advisory_xact_lock`;
  - conflito e rechecagem transacional consideram profissional e cliente;
  - settings padrao usam `upsert` para evitar corrida de criacao.

- `src/http/app.ts`
  - status invalido em listagem de agendamentos agora retorna erro;
  - erros operacionais de agenda retornam conflito apropriado.

- `src/infrastructure/in-memory-store.ts`
  - fixtures de horario padrao foram ajustadas para nao mascarar testes legados.

## Testes adicionados ou ajustados

- `tests/appointment-hardening.spec.ts`
  - cobre horario comercial valido;
  - fora do expediente;
  - dia fechado;
  - intervalo;
  - passado e antecedencia minima;
  - buffer na criacao e no reagendamento;
  - servico de outra unidade;
  - status invalido.

- `tests/db.integration.spec.ts`
  - adiciona teste concorrente com duas criacoes simultaneas no mesmo horario;
  - valida resultado esperado `200` e `409`;
  - valida que somente um agendamento ativo sobreposto fica persistido.

- `tests/api.spec.ts`
  - datas estabilizadas com fake timers;
  - expectativas ajustadas para buffer padrao de 10 minutos.

## Validacao final

- `npm run build`: passou.
- `npm test`: passou, 7 arquivos, 99 testes, 15 ignorados.
- `npm run test:db`: passou, 1 arquivo, 15 testes.
- `node --check scripts/smoke-api-readonly.mjs`: passou.
- `npm run smoke:api:readonly`: passou.
- `git diff --check`: passou.
- Busca por padroes comuns de secrets no diff: sem achados.

## Estado operacional

- Producao: nao alterada.
- Migracoes: nenhuma criada ou executada.
- Seeds de producao: nenhuma executada.
- `.env` e secrets: nao alterados.
- Git add: somente arquivos explicitos.
