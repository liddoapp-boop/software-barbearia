# Fase 214.1 - Piloto real assistido do booking publico mobile

## Objetivo

Validar o booking publico mobile em condicao real assistida, com criacao manual pelo fluxo publico em celular/navegador, sem criar agendamento por API/script e sem tocar em checkout, pagamento, venda, comissao ou financeiro.

## Contexto

- Branch validada: `main`.
- Estado Git inicial: limpo.
- Commits esperados confirmados:
  - `e011969 docs: registrar harness mobile do booking publico`
  - `ea9f395 test: adicionar harness mobile do booking publico`
  - `6a05fd4 docs: registrar validacao da trava pos-sucesso do booking`
- URL usada no teste manual: `https://barbearia.76-13-161-250.nip.io/agendamento?unitId=unit-01`.
- Unidade: `unit-01`.
- Agendamento criado manualmente por pessoa assistida/controlada, nao por script.

## Checklist pre-teste

- `git status -sb`: `## main...origin/main`.
- `git log --oneline -5`: commits esperados presentes.
- `GET /health`: `200`, `ok=true`, `authEnforced=true`.
- `GET /agendamento?unitId=unit-01`: `200`.
- `GET /public/services?unitId=unit-01`: `Barba Terapia` presente como `svc-barba`.
- `GET /public/services/svc-barba/professionals?unitId=unit-01`: apenas `Geovane Borges` retornado para o servico.
- `npm run smoke:api:readonly`: passou.
- PM2: processo `software-barbearia` online.

## Roteiro manual orientado

1. Abrir a URL publica no celular.
2. Informar dados de cliente controlado/teste.
3. Deixar e-mail vazio.
4. Escolher o servico `Barba Terapia`.
5. Confirmar profissional `Geovane Borges`.
6. Escolher quinta-feira, 25 de junho de 2026, 11:30.
7. Confirmar uma unica vez.
8. Verificar que aparece o card de agendamento confirmado.
9. Nao executar checkout, pagamento, venda, comissao ou financeiro.

## Resultado pos-agendamento

APROVADO. O usuario reportou que o agendamento foi feito manualmente pelo fluxo publico mobile, com e-mail vazio, servico `Barba Terapia`, profissional `Geovane Borges`, horario 11:30 de quinta-feira, 25 de junho de 2026, e card de sucesso exibido apos a confirmacao.

Nao foi feito checkout, pagamento, venda, comissao ou financeiro.

## Dados mascarados

- Tipo: cliente controlado/teste.
- Nome mascarado na agenda: `J. V.`
- Telefone mascarado: `(**) *****-9945`
- E-mail: vazio.
- Agendamento: `fb26a45c...`
- Horario local informado: 25/06/2026 11:30.
- Horario persistido: `2026-06-25T14:30:00.000Z` ate `2026-06-25T15:05:00.000Z`.

## Validacao de agenda

Consulta readonly via API autenticada em `/agenda/range` para 25/06/2026:

- Total de agendamentos no dia: 1.
- Agendamentos correspondentes ao horario/ID: 1.
- Status inicial: `SCHEDULED`.
- Servico: `Barba Terapia` (`svc-barba`).
- Profissional: `Geovane Borges` (`pro-01`).
- Nao foi encontrada duplicidade para o horario validado.

## Validacao de auditoria

Consulta readonly em `/audit/events` para `entity=appointment` e `action=APPOINTMENT_CREATED`:

- Evento correspondente encontrado: 1.
- Rota: `/public/booking`.
- Metodo: `POST`.
- Origem: `public_booking`.
- Metadata: `source=public`.
- Servico registrado: `Barba Terapia`.
- Profissional registrado: `Geovane Borges`.
- Auditoria nao contem `clientPhone`.
- Auditoria nao contem `clientEmail`.

## Validacao de financeiro

Consulta readonly em `/financial/transactions` para junho de 2026:

- Total de transacoes retornadas no mes: 8.
- Transacoes referenciando o agendamento `fb26a45c...`: 0.
- Nao houve evidencia de lancamento financeiro relacionado ao booking publico validado.

## Validacao de logs

- `pm2 logs software-barbearia --lines 220 --nostream`: booking publico registrou `POST /public/booking` com `statusCode=201`.
- Nao foi observado crash, loop, erro 500 critico ou erro Prisma critico apos o booking validado.
- Existem linhas antigas de `prisma:error ... terminating connection due to administrator command` no historico do `out.log`; elas aparecem antes do evento validado e nao se repetem no trecho posterior ao agendamento. O arquivo `software-barbearia-error.log` esta vazio na checagem final.
- Requisicoes readonly de validacao (`/agenda/range`, `/audit/events`, `/financial/transactions`) retornaram `200`.

## Cancelamento

Nao houve cancelamento. O agendamento e de teste/controlado, mas nenhum cancelamento foi autorizado nesta fase.

## Riscos observados

- Melhoria visual registrada para proxima sprint: quando houver apenas um profissional publico disponivel, ocultar/remover a etapa de escolha de profissional e selecionar `Geovane Borges` automaticamente. Hoje aparecem `Sem preferencia` e `Geovane Borges`, o que e desnecessario para a barbearia atual e pode confundir.

## O que nao foi feito por seguranca

- Nenhum agendamento foi criado por API/script.
- Nenhum cliente foi criado por API/script.
- Nenhuma alteracao manual de banco foi feita.
- Nenhuma migration, seed, deploy, restart PM2, alteracao de `.env`, Nginx, firewall ou certificado foi feita.
- Nenhum checkout, pagamento, venda, comissao, refund/estorno ou cancelamento foi executado.

## Comandos/evidencias

- `git status -sb`
- `git log --oneline -5`
- `curl -fsS https://barbearia.76-13-161-250.nip.io/health`
- `curl -fsSI https://barbearia.76-13-161-250.nip.io/agendamento?unitId=unit-01`
- `curl -fsS https://barbearia.76-13-161-250.nip.io/public/services?unitId=unit-01`
- `curl -fsS https://barbearia.76-13-161-250.nip.io/public/services/svc-barba/professionals?unitId=unit-01`
- `npm run smoke:api:readonly`
- Consulta readonly autenticada de agenda/auditoria/financeiro.
- `pm2 list`
- `pm2 logs software-barbearia --lines 220 --nostream`

## Decisao final

APROVADO COM RESSALVA. O fluxo publico mobile criou um unico agendamento correto, com profissional correto, auditoria publica registrada e sem financeiro relacionado. A ressalva e apenas de UX: esconder a escolha de profissional quando existir somente um profissional publico disponivel.
