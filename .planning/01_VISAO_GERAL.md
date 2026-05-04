# 01 - Visao Geral

## 1. Visao geral do modulo
Plataforma SaaS para barbearia com backend Fastify + TypeScript (`src/http/app.ts`) e dois modos de dados: memoria (`OperationsService`) e Prisma/Postgres (`PrismaOperationsService`). Frontend SPA em JS puro (`public/app.js` + `public/modules/*`).

## 2. O que ja esta implementado (baseado no codigo)
- Core operacional completo por API: agenda, atendimento, checkout unificado, financeiro, estoque, comissao.
- Modulos de gestao e avancado expostos por endpoint: metas/performance, fidelizacao, automacoes, retencao, integracoes e conciliacao de billing.
- Autenticacao JWT simples com RBAC por rota (`src/http/security.ts`, `getPolicyForRoute`).
- Persistencia robusta via Prisma com schema amplo e migracoes recentes (`prisma/schema.prisma`).
- Suite de testes significativa cobrindo fluxo ponta a ponta, permissao e integracoes (`tests/api.spec.ts`).

## 3. O que esta incompleto
- Falta CRUD dedicado de profissionais no backend (ha performance, mas nao create/update/deactivate em modulo principal).
- CRUD de clientes incompleto (sem update/archive).
- Permissoes existem, mas cobertura de teste por perfil ainda nao e total para todos endpoints sensiveis.

## 4. Problemas identificados
- `public/app.js` esta muito monolitico (alto acoplamento de estado, UI e chamadas HTTP).
- Duplicidade conceitual de agenda/agendamento/agendamentos no frontend (nomes diferentes para responsabilidades conectadas).
- Inconsistencia de modelagem entre dominio TypeScript e schema Prisma em alguns campos opcionais/semantica.

## 5. Dependencias com outros modulos
- Agenda depende de servicos, profissionais e clientes.
- Checkout depende de financeiro, estoque e comissoes.
- Automacoes/retencao dependem do historico de atendimentos e clientes.
- Relatorios e metas dependem da qualidade do financeiro e fechamento operacional.

## 6. Impacto no fluxo principal
A base operacional do funil principal esta implementada e funcional. O maior risco atual nao e falta de funcionalidade core, e sim maturidade de governanca (CRUDs faltantes, controle de permissao e manutencao do frontend monolitico).
