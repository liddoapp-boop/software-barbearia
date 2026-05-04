# 88 - Usuarios persistentes e permissoes refinadas

Data: 2026-05-03
Fase: 0.3
Status: IMPLEMENTADA

## Objetivo da fase
Tornar a identidade do backend persistente em PostgreSQL/Prisma, mantendo compatibilidade de desenvolvimento e refinando permissoes criticas sem alterar as regras financeiras ja validadas.

## Diagnostico do modelo anterior
- Login consultava apenas `DEFAULT_USERS` ou `AUTH_USERS_JSON` em codigo/env.
- Senha de desenvolvimento era texto simples no fallback.
- Tokens ja carregavam `userId`, `email`, `role`, `unitIds` e `activeUnitId`, mas o `userId` nao vinha de uma tabela persistente.
- Auditoria persistente ja registrava actor, email e role, porem esse actor era textual e dependia do token atual.
- A policy de `/financial/*` ainda permitia perfis operacionais em rotas sensiveis.

## Modelo criado
Criados no Prisma:
- `User`: `id`, `email`, `passwordHash`, `name`, `role`, `isActive`, `createdAt`, `updatedAt`.
- `UserUnitAccess`: `id`, `userId`, `unitId`, `role`, `isActive`, `createdAt`.

`UserUnitAccess` permite escopo por unidade e deixa espaco para role por unidade. Nesta fase o token usa a role efetiva do usuario validado e as unidades ativas associadas.

## Login persistente
Quando `DATA_BACKEND=prisma`, `/auth/login` agora:
1. busca `User` pelo email;
2. exige `isActive=true`;
3. valida `passwordHash` com PBKDF2 nativo (`crypto`);
4. carrega acessos ativos em `UserUnitAccess`;
5. valida `activeUnitId` contra `unitIds`;
6. emite JWT/HMAC com `userId`, `email`, `role`, `unitIds` e `activeUnitId`.

Compatibilidade:
- backend `memory` continua usando `DEFAULT_USERS`/`AUTH_USERS_JSON`;
- em ambiente nao produtivo, se o banco Prisma nao tiver o usuario default persistido, o fallback dev ainda aceita `owner@barbearia.local / owner123`;
- `prisma/seed.ts` agora cria `owner`, `recepcao` e `profissional` com `passwordHash` e acessos de unidade.

## Permissoes refinadas
- `owner`: segue com acesso total aos fluxos sensiveis, incluindo auditoria, financeiro, configuracoes, comissoes, relatorios, metas e equipe.
- `recepcao`: preserva operacao de agenda, clientes, atendimento/checkout e venda de produto, mas nao paga comissao nem acessa auditoria/financeiro global.
- `profissional`: preserva acesso operacional basico ja existente em agenda/performance, mas nao acessa financeiro global, auditoria, configuracoes ou pagamento de comissao.
- `GET /users` foi adicionado como listagem minima owner-only para visualizar usuarios por unidade, sem CRUD administrativo amplo.

## Tenant guard
Mantido e validado o guard central:
- rotas com `unitId` em query/body sao comparadas ao `activeUnitId`;
- tentativa de acessar outra unidade retorna `403`;
- rotas por path que recebem `unitId` internamente continuam usando `req.auth.activeUnitId`, bloqueando recurso de outra unidade pelo servico.

Cobertura adicionada:
- query: `/dashboard?unitId=<outra-unidade>`;
- body: `POST /appointments` com `unitId` fora do token.

Lacuna real:
- ainda nao foi feita uma revisao profunda especifica de produto/estoque por path em todos os endpoints. A recomendacao continua sendo hardening dedicado de tenant guard produto/estoque.

## Auditoria
Com login Prisma, `actorId` passa a ser o `User.id` persistente no token, e `actorEmail`/`actorRole` continuam registrados no `AuditLog`.

Nao foi adicionada FK obrigatoria de `AuditLog.actorId -> User.id` nesta fase porque:
- auditoria ainda aceita `anonymous` quando auth esta desabilitada em testes/operacoes internas;
- ha fallback memory/dev;
- impor FK agora quebraria historicos e fluxos sem auth. A decisao foi manter `actorId` textual e documentar a evolucao futura.

## Testes adicionados
- Login persistente Prisma com token contendo `userId`, `email`, `role`, `unitIds` e `activeUnitId`.
- Usuario inativo nao autentica.
- `activeUnitId` nao autorizado retorna erro.
- Tenant guard por query e body com usuario sem acesso a outra unidade.
- Recepcao nao paga comissao.
- Profissional nao acessa financeiro global.
- Owner continua pagando comissao.

## Comandos executados
- `npm.cmd run db:generate`: falhou no sandbox por verificacao de engine Prisma; passou fora do sandbox.
- `npm.cmd run test`: falhou no sandbox por `spawn EPERM` do Vitest/Vite; passou fora do sandbox (`59 passed | 10 skipped`).
- `npm.cmd run build`: passou.
- `npm.cmd run db:push`: falhou no sandbox por verificacao de engine Prisma; passou fora do sandbox e sincronizou PostgreSQL local.
- `npm.cmd run smoke:api`: falhou no sandbox por engine Prisma; passou fora do sandbox.
- `npm.cmd run test:db`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox (`10 passed`).

## Limitacoes reais
- Nao ha CRUD completo de usuarios/equipe nesta fase.
- `User.role` e `UserUnitAccess.role` sao strings controladas pela aplicacao, nao enum Prisma.
- `AuditLog.actorId` permanece textual, sem FK obrigatoria.
- Profissional ainda nao tem escopo "somente minha agenda/minhas comissoes" em todos os endpoints; isso exige associacao formal entre `User` e `Professional`.
- Tenant guard profundo de produto/estoque por path ficou para hardening posterior.
- O seed existente limpa massa operacional; ele foi atualizado, mas nao executado durante esta fase para evitar impacto em dados locais.

## Proxima etapa recomendada
Proxima prioridade recomendada: Frontend operacional dos fluxos criticos, mantendo como trilhas tecnicas seguintes o tenant guard produto/estoque mais profundo e outbox/auditoria transacional.
