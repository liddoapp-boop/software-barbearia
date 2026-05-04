# 02 - Arquitetura

## 1. Visao geral do modulo
Arquitetura em camadas:
- HTTP/API: `src/http/app.ts`
- Aplicacao: `src/application/*`
- Dominio: `src/domain/*`
- Infra: Prisma (`src/infrastructure/database/prisma.ts`) e store em memoria.
- Frontend: SPA em `public/`.

## 2. O que ja esta implementado (baseado no codigo)
- Padrao service dual: memoria para dev/teste rapido e Prisma para persistencia real.
- Validacao de entrada com Zod em praticamente todos endpoints.
- Politica de acesso por rota/metodo com papel (`owner`, `recepcao`, `profissional`).
- Auditoria em memoria para eventos sensiveis (`/audit/events`).
- Prisma schema com entidades multi-modulo: agenda, financeiro, estoque, CRM, automacao e billing.

## 3. O que esta incompleto
- Nao existe separacao por modulos fisicos no frontend (tudo orquestrado por um `app.js` extenso).
- Auditoria nao persiste em banco (somente em memoria do processo).
- Nao ha camada de fila/worker para automacoes reais (execucao simulada/sincrona no service).

## 4. Problemas identificados
- Risco de regressao alto por centralizacao de logica de tela no `public/app.js`.
- Parte das regras aparece duplicada em `OperationsService` e `PrismaOperationsService`.
- Dependencia forte de `unit-01` no frontend (constante fixa), limitando multiunidade real na UI.

## 5. Dependencias com outros modulos
- Arquitetura de API sustenta todos os modulos de negocio.
- Dominio (`rules.ts`) e base para conflito de agenda, transicao de status, comissao, receita e estoque.

## 6. Impacto no fluxo principal
A arquitetura atual suporta o funil end-to-end. Porem, sem modularizacao adicional do frontend e sem auditoria persistente, a escalabilidade operacional e de compliance fica limitada.
