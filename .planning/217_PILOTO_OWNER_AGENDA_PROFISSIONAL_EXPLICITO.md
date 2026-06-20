# Fase 212.3 — Piloto owner/agenda com profissional explícito validado

Data: 2026-06-20
Horario UTC: 2026-06-20T23:57:20Z

## Decisão

PILOTO OWNER/AGENDA APROVADO.

O fluxo público com profissional explícito foi validado em produção com a correção P1 ativa. O agendamento controlado apareceu exatamente uma vez na Agenda owner com o profissional escolhido, foi cancelado com sucesso, o horário voltou a ficar disponível e não houve lançamento financeiro.

## Contexto

- Correção P1 implantada: `fb0429e fix: tornar profissional deterministico no booking publico`.
- Documentação final de deploy: `dbcf8d8 docs: atualizar diagnostico do deploy do booking`.
- Estado inicial do Git: `main...origin/main`, árvore limpa.
- PM2 `software-barbearia`: online.
- Health inicial: `{"ok":true,"authEnforced":true}`.
- Smoke readonly inicial: passou.

## Dados do piloto

- Cliente de teste: `CLIENTE TESTE OWNER AGENDA - FASE 212.3`.
- Telefone fictício: `00000021230`.
- Serviço: `Barba Terapia` (`svc-barba`).
- Profissional escolhido: `Geovane Borges`.
- `professionalId` escolhido: `pro-01`.
- Horário local: `2026-06-22 09:00`.
- Horário UTC: `2026-06-22T12:00:00.000Z`.
- Agendamento criado: `015eab2f-57ee-46ca-aa75-2649b73495ba`.

## Validação pública

Profissionais elegíveis para `svc-barba`:

- Total retornado: `4`.
- `Geovane Borges`: presente.
- `Rafael Andrade`: presente.

Slots com `professionalId = pro-01`:

- Slot disponível encontrado em `2026-06-22 09:00`.
- Retornou `professionalId = pro-01`.
- Retornou `professionalName = Geovane Borges`.

Slots sem preferência:

- Mesmo horário retornou profissional determinístico.
- `professionalId = pro-01`.
- `professionalName = Geovane Borges`.

Criação pública:

- `POST /public/booking`: HTTP `201`.
- Profissional esperado: `Geovane Borges`.
- Profissional gravado: `Geovane Borges`.
- `professionalId` gravado: `pro-01`.

## Validação Agenda owner

Consulta: `GET /agenda/range` no dia do agendamento.

Resultado:

- Apareceu exatamente uma vez.
- Cliente: `CLIENTE TESTE OWNER AGENDA - FASE 212.3`.
- Serviço: `Barba Terapia`.
- Profissional: `Geovane Borges`.
- Horário: `2026-06-22T12:00:00.000Z`.
- Status antes do cancelamento: `SCHEDULED`.

## Cancelamento

Endpoint usado:

- `PATCH /appointments/015eab2f-57ee-46ca-aa75-2649b73495ba/status`.

Payload operacional:

- `status = CANCELLED`.
- Motivo: `Cancelamento do piloto owner agenda 212.3`.

Resultado:

- Cancelamento: passou.
- Status final: `CANCELLED`.
- Detalhe autenticado pós-cancelamento confirmou `CANCELLED`.
- Horário voltou a ficar disponível para `Geovane Borges`.
- Auditoria de cancelamento encontrada com ação `APPOINTMENT_STATUS_UPDATED`.

## Financeiro

Consulta de financeiro pelo cliente de teste:

- Antes do agendamento: `0` transações.
- Depois do cancelamento: `0` transações.
- Alteração financeira: `false`.

Não houve:

- Checkout.
- Pagamento.
- Venda.
- Devolução.
- Lançamento financeiro.

## Smoke e logs

Smoke readonly antes do piloto:

- Passou.

Smoke readonly depois do piloto:

- Passou.
- Health público OK.
- Página pública OK.
- Proteção sem token OK.
- Login owner OK.
- `/auth/me` OK.
- Agenda OK.
- Clientes OK.
- Catálogo/PDV OK.
- Financeiro OK.
- Serviços OK.
- Auditoria OK.
- Configurações OK.
- Relatórios OK.

Health final:

```json
{"ok":true,"authEnforced":true}
```

PM2 logs:

- Sem crash.
- Sem loop de restart.
- Sem erro Prisma crítico.
- Sem HTTP 500 repetido.
- Houve `401` esperado no teste de proteção sem token do smoke readonly.
- Rotas do piloto apareceram com sucesso:
  - `GET /public/services/:serviceId/professionals`: `200`.
  - `GET /public/slots`: `200`.
  - `POST /public/booking`: `201`.
  - `GET /agenda/range`: `200`.
  - `PATCH /appointments/:id/status`: `200`.
  - `GET /appointments/:id`: `200`.
  - `GET /financial/transactions`: `200`.
  - `GET /audit/events`: `200`.

## Restrições respeitadas

- Não foi feito checkout.
- Não foi gerado pagamento.
- Não foi feita venda.
- Não foi feita devolução.
- Não foi usado cliente real.
- Não houve alteração manual no banco.
- Não foi rodada migration.
- Não foi rodado seed.
- Não foi alterado `.env`.
- Não foi feito deploy.
- Não foi reiniciado PM2 nesta fase.
- Não foi alterado Nginx, firewall ou certificado.
- Não foi usado `git reset`, rebase ou force push.
- Não foi usado `git add .` nem `git add -A`.
- Não foram expostos `.env`, `DATABASE_URL`, senha, token, hash ou segredo.

## Conclusão

O fluxo público corrigido está coerente com a Agenda owner:

- Profissional escolhido: `Geovane Borges`.
- Profissional gravado: `Geovane Borges`.
- Agenda owner refletiu o atendimento corretamente.
- Cancelamento liberou o horário.
- Financeiro permaneceu sem impacto.

Próxima etapa recomendada: avançar para piloto real assistido com escopo explícito e autorização separada, mantendo bloqueio para checkout/pagamento real até nova aprovação.
