# Fase 214 - Piloto real assistido do booking publico

Data: 2026-06-21

## Contexto

- Sprint 213 aprovada.
- Booking publico suporta profissional explicito e `Sem preferencia`.
- `/public/services/:serviceId/professionals` expoe apenas dados publicos seguros.
- `/public/slots` aceita `professionalId` opcional e retorna `professionalId` e `professionalName`.
- `POST /public/booking` grava o profissional escolhido ou resolvido.
- Auditoria publica `APPOINTMENT_CREATED` esta implementada.
- Commits base:
  - `1957eb0 fix: consolidar booking publico com profissional e auditoria`
  - `2d4da78 docs: registrar validacao do booking publico consolidado`

## Baseline

- `git status -sb`: `main...origin/main`.
- `git status --short`: limpo.
- `git log --oneline -8`: confirmou `2d4da78` e `1957eb0` no topo.
- `curl /health`: `{"ok":true,"authEnforced":true}`.
- `npm run smoke:api:readonly`: passou.
- `pm2 logs software-barbearia --lines 80 --nostream`: sem crash, sem loop, sem erro Prisma critico e sem 500 repetido.

## Monitoramento do piloto real

Foi feita consulta readonly de auditoria para eventos recentes de `APPOINTMENT_CREATED` em `/public/booking`.

- Janela inicial consultada: ultimas 6 horas.
- Resultado: apenas o agendamento controlado da Sprint 213 foi encontrado:
  - appointmentId: `26385f22-f589-4eb7-a0ba-8a3364fad25f`
  - status conhecido: cancelado na Sprint 213
  - origem: teste controlado, nao piloto real da Fase 214

Depois disso, foi aberta uma janela de monitoramento por 5 minutos para capturar novo `APPOINTMENT_CREATED` publico, excluindo o appointmentId controlado da Sprint 213.

- Tentativas: 30.
- Duracao: 300 segundos.
- Resultado: nenhum novo agendamento publico real foi registrado durante a janela.

## Execucao do piloto real

Nao houve execucao do piloto real assistido nesta rodada porque nenhum cliente real autorizado ou pessoa real assistida concluiu o fluxo publico durante a janela observada.

Consequentemente, nao ha dados reais a registrar para:

- servico escolhido;
- profissional escolhido;
- profissional gravado;
- horario real escolhido;
- appointmentId real;
- feedback do cliente;
- duvidas de uso;
- decisao de manter ou cancelar agendamento real.

Nenhum telefone completo, e-mail ou dado pessoal sensivel foi registrado.

## Agenda owner

Nao foi possivel validar um novo agendamento real na Agenda owner, pois nenhum novo appointment publico da Fase 214 foi criado.

## Auditoria

Nao foi possivel validar `APPOINTMENT_CREATED` de piloto real, pois nenhum novo appointment publico da Fase 214 foi criado.

Auditoria e logs confirmaram apenas consultas readonly e o historico do teste controlado anterior.

## Financeiro

Nao houve criacao de novo appointment real nesta rodada.

Confirmacoes:

- nao houve checkout;
- nao houve pagamento;
- nao houve venda;
- nao houve devolucao;
- nao houve financeiro relacionado a novo appointment da Fase 214.

## Logs finais

- `curl /health`: OK.
- `npm run smoke:api:readonly`: passou.
- `pm2 logs software-barbearia --lines 120 --nostream`: sem crash, sem loop, sem erro Prisma critico, sem 500 repetido e sem segredo exposto na documentacao.

## Bugs

- P0: nenhum observado.
- P1: nenhum observado.

## Pendencias

- P2: executar novamente a fase quando houver cliente real autorizado ou pessoa real assistida pronta para concluir o fluxo publico.
- P2: ao retomar, registrar apenas dados nao sensiveis do piloto e validar appointmentId, agenda, auditoria e financeiro.

## Decisao final

BLOQUEADO por ausencia da acao externa necessaria: nenhum cliente real autorizado ou pessoa real assistida concluiu o booking publico durante a janela monitorada.

O sistema permaneceu saudavel e pronto para o piloto real assistido.
