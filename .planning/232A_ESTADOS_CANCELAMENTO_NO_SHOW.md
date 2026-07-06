# Fase 232A - Fechamento: estados, agenda, catalogo e disponibilidade

## Objetivo

Encerrar a Fase 232A sem iniciar a 232B. A fase consolidou regras de estado de appointment, cancelamento, NO_SHOW, atraso idempotente, remarcacao segura, catalogo operacional canonico, disponibilidade por BusinessHour, calendario semanal 08h-20h e scroll mobile global do painel.

## Maquina de estados

Fonte de verdade: `src/domain/appointment-state-machine.ts`.

Estados cobertos:

- `SCHEDULED`
- `CONFIRMED`
- `IN_SERVICE`
- `COMPLETED`
- `CANCELLED`
- `NO_SHOW`
- `BLOCKED`

Estados terminais:

- `COMPLETED`
- `CANCELLED`
- `NO_SHOW`

Appointments terminais nao podem receber transicoes operacionais, remarcacao, alteracao de horario ou alteracao de servicos.

## Cancelamento

Cancelamento usa a rota de status com `status: "CANCELLED"`.

Regras finais:

- permitido em `SCHEDULED`;
- permitido em `CONFIRMED`;
- bloqueado em `IN_SERVICE`;
- bloqueado em `COMPLETED`, `CANCELLED` e `NO_SHOW`;
- bloqueado apos checkout;
- motivo opcional;
- libera slot porque `CANCELLED` nao participa dos conflitos ativos;
- nao gera financeiro, estoque, venda ou comissao;
- exige idempotencia;
- registra auditoria `APPOINTMENT_CANCELLED`.

## NO_SHOW

NO_SHOW e acao explicita via status `NO_SHOW`.

Regras finais:

- permitido apenas em `SCHEDULED` ou `CONFIRMED`;
- exige tolerancia de 15 minutos apos `startsAt`;
- antes do limite retorna mensagem amigavel;
- bloqueado em `IN_SERVICE`;
- bloqueado em estados terminais;
- nao gera receita, checkout, estoque ou punicao automatica;
- exige idempotencia;
- registra auditoria `APPOINTMENT_NO_SHOW`.

## Atraso

Rota: `POST /appointments/:id/delay`.

Regras finais:

- registra minutos de atraso e motivo opcional;
- exige idempotencia;
- registra historico `DELAY_RECORDED`;
- registra auditoria `APPOINTMENT_DELAY_RECORDED`;
- nao altera `startsAt`;
- nao altera `endsAt`;
- nao desloca agenda;
- nao muda status;
- nao remarca;
- nao cancela.

## Idempotencia

Mutacoes criticas de appointment exigem `idempotencyKey`:

- confirmar;
- iniciar atendimento;
- cancelar;
- marcar `NO_SHOW`;
- registrar atraso;
- remarcar;
- confirmar pelo atalho legado de `PATCH /appointments/:id` com `confirmation: true`.

Contrato:

- mesma chave e mesmo payload retornam replay seguro;
- mesma chave com payload diferente retorna conflito;
- efeitos, historico e auditoria nao duplicam;
- Prisma persiste em `IdempotencyRecord`;
- memoria usa mecanismo equivalente em testes.

## Remarcacao e pos-checkout

`PATCH /appointments/:id/reschedule`:

- exige idempotencia;
- bloqueia `COMPLETED`, `CANCELLED` e `NO_SHOW`;
- valida BusinessHour e conflitos antes de gravar;
- preserva historico;
- no Prisma roda com trava/transacao para concorrencia.

Apos checkout, appointment fica `COMPLETED` e nao pode ser cancelado, remarcado, reaberto, marcado como falta ou ter horario/servicos alterados.

## Agenda interna

Agenda e listas exibem acoes por estado:

- `SCHEDULED`: confirmar, cancelar, atraso e NO_SHOW quando elegivel;
- `CONFIRMED`: iniciar, cancelar, atraso e NO_SHOW quando elegivel;
- `IN_SERVICE`: concluir e atraso; sem cancelar e sem NO_SHOW;
- `COMPLETED`, `CANCELLED`, `NO_SHOW`: sem acoes operacionais indevidas.

Filtros e visualizacoes:

- filtros da Agenda preservados;
- persistencia de Semana/Lista em storage local;
- clique no calendario abre detalhe sem forcar troca permanente indevida.

## Calendario semanal

Estado aprovado:

- expediente visual completo de 08h ate 20h;
- marcas 19h e 20h visiveis;
- linhas, horarios e cards alinhados;
- densidade responsiva desktop em zoom 100%;
- `minuteToY()` alimenta linhas, labels, cards e indicador atual;
- cards semanais compactos mantem horario e cliente visiveis.

## Scroll mobile global

Contrato final:

- no mobile, o proprietario do scroll vertical e o documento/pagina;
- `html` e `body` usam `overflow-y: auto`;
- `#appShell`, `#appMain` e `#appContent` crescem naturalmente;
- `#appContent` nao vira container vertical de scroll;
- Agenda semanal mantem scroll horizontal interno quando necessario;
- menu mobile pode bloquear fundo apenas enquanto aberto e restaura ao fechar;
- modais/drawers podem ter scroll interno proprio.

Validacao manual informada:

- desktop: aprovado;
- Safari/iPhone: aprovado;
- Agenda, Financeiro e demais modulos principais: scroll aprovado;
- Agenda mobile: scroll horizontal aprovado.

## Catalogo canonico

Catalogo operacional final da unidade `unit-01`:

- Corte - R$ 30,00 - 30 min;
- Barba - R$ 20,00 - 30 min;
- Hidratacao - R$ 20,00 - 30 min;
- Luzes - R$ 50,00 - 60 min;
- Pigmentacao - R$ 45,00 - 60 min;
- Corte + Barba - R$ 50,00 - 45 min.

Auditoria local em 2026-07-06 confirmou:

- exatamente seis servicos ativos com `notes = catalogo-operacional-canonico`;
- todos vinculados ao profissional real `pro-geovane-borges`;
- Geovane Borges ativo e sem regras de comissao;
- `Corte Manual 232A` preservado e inativo para novos agendamentos;
- fixtures de teste antigas podem existir no banco local, mas nao compoem o catalogo operacional canonico.

## BusinessHour

Contrato persistido:

- domingo: fechado;
- segunda a sexta: 08:00-20:00;
- sabado: 08:00-14:00;
- uma linha por dia/unidade;
- buffer atual de `unit-01`: `0`;
- `allowOverbooking = false`;
- `allowOutOfHoursAppointments = false`.

Agenda visual, modal interno, sugestoes, criacao interna e booking publico devem consultar a mesma fonte persistida.

## Contrato final do buffer

Campo: `BusinessSettings.bufferBetweenAppointmentsMinutes`.

Contrato aprovado nesta auditoria:

- `startsAt` e `endsAt` do appointment representam apenas a duracao efetiva dos servicos;
- o buffer nao infla `endsAt`;
- com buffer `0`, um servico de 30 min iniciado 13:15 termina 13:45 e o proximo pode iniciar 13:45;
- com buffer `10`, o mesmo appointment continua 13:15-13:45, mas o proximo inicio permitido passa a 13:55;
- conflitos, sugestoes, criacao interna, remarcacao, update de appointment e booking publico usam o buffer para a janela ocupada;
- fechamento do expediente considera duracao + buffer operacional;
- nao ha fallback silencioso de 10 minutos quando o banco possui buffer `0`.

Os dois asserts antigos que esperavam `13:55` e `12:55` em `endsAt` usavam a regra obsoleta de inflar o horario final com buffer.

## Eventos de atraso do fixture manual

Fixture auditado: `manual-232a-delay-retest-20260710-1100`.

Historico local contem dois eventos `DELAY_RECORDED`:

- `2026-07-06T02:44:59.008Z`, ator `usr-owner`, motivo `10 minutos de atraso`;
- `2026-07-06T14:22:02.560Z`, ator `usr-owner`, motivo `10 minutos de atraso`.

Os registros de idempotencia auditados mostram chaves diferentes para tentativas distintas, incluindo a segunda chave `appointment-delay-1cb84b2f-58d9-4034-956a-028d6ffb8c5c`. Nao ha evidencia de que a mesma chave tenha criado mais de um evento. O historico nao foi editado.

## Evidencias automatizadas

Focados executados nesta auditoria:

- `npx vitest run tests/api.spec.ts -t "buffer fora do endsAt|limites finais de expediente|multiplos servicos pelo contrato interno|mantem fluxo de atendimento controlado"`: verde;
- `npx vitest run tests/frontend-mobile-overflow.spec.ts`: verde em Windows com Chrome local, 3 testes;
- `npx vitest run tests/appointment-hardening.spec.ts -t "respeita buffer configurado"`: verde.

Suites finais executadas em 2026-07-06:

- `npm test`: verde, 18 arquivos passaram, 235 testes passaram, 35 skipped;
- `npm run test:db`: verde, migrações aplicadas no banco local de teste e 35 testes Prisma passaram;
- `npx tsc -p tsconfig.json --noEmit`: verde;
- `npm run build`: verde;
- `git diff --check`: verde, apenas avisos LF/CRLF do Windows;
- `npm run canonicals:dry-run`: `services_to_create=0`, `services_to_update=0`, `services_matching=6`, `errors=0`;
- `npm run canonicals:apply:local` executado duas vezes: ambas com `apply_result=ok`, sem criar ou atualizar registros.

Observacao: a primeira tentativa de `npm run test:db` falhou por `EPERM` no `prisma generate`, causado por processo `src/server.ts` remanescente do teste mobile segurando a DLL do Prisma no Windows. O teste mobile foi corrigido para matar a arvore de processos com `taskkill /t /f`; a porta `3338` ficou livre apos o teste e o `test:db` passou em seguida.

## Arquivos principais

Implementacao:

- `src/domain/rules.ts`;
- `src/application/barbershop-engine.ts`;
- `src/application/operations-service.ts`;
- `src/application/prisma-operations-service.ts`;
- `src/http/app.ts`;
- `src/domain/appointment-state-machine.ts`;
- `public/app.js`;
- `public/styles/layout.css`;
- `public/modules/agenda.js`;
- `public/modules/agendamentos.js`;
- `public/modules/configuracoes.js`;
- `src/application/canonical-catalog.ts`;
- `scripts/provision-canonicals-local.ts`;
- `prisma/schema.prisma`;
- `prisma/migrations/20260706_operational_hours_and_zero_buffer/migration.sql`.

Testes:

- `tests/api.spec.ts`;
- `tests/db.integration.spec.ts`;
- `tests/appointment-hardening.spec.ts`;
- `tests/appointment-state-machine.spec.ts`;
- `tests/canonical-catalog.spec.ts`;
- `tests/frontend-agenda-delay.spec.ts`;
- `tests/frontend-agenda-week.spec.ts`;
- `tests/frontend-mobile-overflow.spec.ts`;
- `tests/frontend-schedule-validation.spec.ts`.

## Riscos residuais

- O banco local contem muitas fixtures de testes de fases anteriores; elas nao devem ser interpretadas como catalogo operacional real.
- `tests/db.integration.spec.ts` depende do harness `npm run test:db`.
- Antes de publicar, todas as suites finais devem estar verdes e o worktree deve ser revisado contra segredos, logs e arquivos temporarios.

## Decisao

Fase 232A validada manualmente em desktop e Safari/iPhone. Suites finais, build, TypeScript, diff check, auditoria local e canonicals idempotentes ficaram verdes. A publicacao depende apenas da revisao Git final, commit e push.
