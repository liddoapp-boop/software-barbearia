# Fase 211 — Validação acelerada do fluxo operacional principal

Data: 2026-06-20

## Decisão

PRONTO PARA PILOTO OPERACIONAL.

Escopo validado como fluxo operacional principal:

1. Login owner.
2. Dashboard.
3. Clientes.
4. Agenda e listagem/detalhe de agendamentos.
5. Status de atendimento.
6. Checkout.
7. Financeiro gerado pelo checkout.
8. Comissão quando aplicável.
9. Auditoria do fluxo.
10. Mobile básico sem quebra horizontal geral.

## Baseline executada

- `git status -sb`: `main...origin/main`.
- `git status --short`: limpo.
- Commit atual: `385845a docs: registrar deploy da blindagem da agenda`.
- `node --check scripts/smoke-api-readonly.mjs`: passou.
- `npm run build`: passou.
- `npm test`: passou, 7 arquivos passed, 1 skipped; 100 testes passed, 16 skipped.
- `npm run test:db`: passou, 1 arquivo passed; 16 testes passed.

## Smoke readonly de produção

`npm run smoke:api:readonly` passou:

- health público 200;
- página pública 200;
- dashboard sem token 401;
- login owner 200;
- `/auth/me` 200;
- `/agenda/range` 200 com `appointments` array e `workingHours` object;
- clientes 200;
- catálogo/PDV 200;
- financeiro summary/transactions 200;
- serviços 200;
- auditoria 200;
- configurações 200;
- relatórios gerenciais 200.

## Mapa do fluxo no código

Backend principal:

- Login owner: `src/http/app.ts`, rota `POST /auth/login`.
- Auditoria: `src/http/app.ts`, rota `GET /audit/events`; gravação via `recordAudit` e `src/application/audit-service.ts`.
- Clientes: `src/http/app.ts`, rotas `GET /clients` e `POST /clients`.
- Agenda: `src/http/app.ts`, rota `GET /agenda/range`.
- Dashboard: `src/http/app.ts`, rota `GET /dashboard`.
- Agendamentos: `src/http/app.ts`, rotas `POST /appointments`, `GET /appointments`, `GET /appointments/:id`, `PATCH /appointments/:id`, `PATCH /appointments/:id/reschedule`, `PATCH /appointments/:id/status`.
- Atendimento/checkout: `src/http/app.ts`, rotas `POST /appointments/:id/complete` e `POST /appointments/:id/checkout`.
- Financeiro: `src/http/app.ts`, rotas `GET /financial/summary`, `GET /financial/transactions`, `GET /financial/commissions`, `PATCH /financial/commissions/:id/pay`.
- Persistência Prisma: `src/application/prisma-operations-service.ts`, criação transacional de receita do atendimento, comissão, estoque e pagamento de comissão.
- Regra de domínio: `src/application/barbershop-engine.ts` e `src/domain/rules.ts`.

Frontend principal:

- Agenda: `public/modules/agenda.js`, `public/modules/agendamentos.js`, chamadas em `public/app.js` para `/agenda/range`.
- Dashboard: `public/modules/dashboard.js`, chamada em `public/app.js` para `/dashboard`.
- Clientes: `public/modules/clientes.js`.
- Financeiro: `public/modules/financeiro.js`.
- Auditoria: `public/modules/auditoria.js`.
- Comissões: `public/modules/comissoes.js`.
- Menu/mobile: `public/components/menu-config.js`, `public/components/mobile-tabs.js`, `public/styles.css`.

## Cobertura automatizada encontrada

Existe cobertura ponta a ponta suficiente para a fase:

- `tests/api.spec.ts`: checkout unificado cobre criação de agendamento, status `CONFIRMED` e `IN_SERVICE`, `POST /appointments/:id/checkout`, receita de serviço, receita de produto, comissão, métricas de cliente e estoque.
- `tests/api.spec.ts`: retry/concorrência de checkout valida não duplicar financeiro, comissão ou estoque.
- `tests/api.spec.ts`: auditoria persistente de pagamento de comissão valida evento `FINANCIAL_COMMISSION_MARKED_PAID`, ator, rota, método e idempotency key.
- `tests/db.integration.spec.ts`: persiste agendamento e conclusão com receita em banco real de teste.
- `tests/db.integration.spec.ts`: pagamento concorrente de comissão não duplica despesa financeira e cria uma única auditoria.
- `tests/frontend-mobile-overflow.spec.ts`: valida dashboard, agenda, operação e financeiro no mobile básico sem scroll horizontal geral; valida agenda mobile com calendário de scroll interno.
- `scripts/smoke-api-readonly.mjs`: valida produção em modo leitura para login, dashboard protegido, agenda, clientes, financeiro, auditoria e relatórios.

Não foi criado teste novo porque a cobertura existente já valida o fluxo mínimo pedido em memória, banco de teste e smoke readonly de produção.

## Bugs encontrados

P0/P1: nenhum encontrado.

## Bugs corrigidos

Nenhum. Não houve alteração de código.

## Pendências P2/P3

- Executar piloto assistido com usuário real para avaliar ergonomia do fluxo em balcão.
- Fazer checklist manual em dispositivo físico para gestos e densidade visual, além da cobertura automatizada de overflow mobile.
- Avaliar, fora desta fase, refinamentos de UX em checkout/financeiro se o piloto apontar atrito operacional.

## Segurança operacional

Não houve:

- migration;
- seed;
- alteração manual em banco;
- alteração em `.env`;
- impressão de segredo;
- deploy;
- restart PM2;
- alteração em Nginx, firewall ou certificado.

## Próxima etapa recomendada

Abrir piloto operacional controlado owner-only por janela curta, monitorando Agenda, Checkout, Financeiro e Auditoria com coleta objetiva de incidentes e atritos de uso.
