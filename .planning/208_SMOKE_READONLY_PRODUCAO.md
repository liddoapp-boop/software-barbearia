# 208 - Smoke readonly de producao

Data: 2026-06-19

Escopo: criar um smoke autenticado seguro para producao, sem criacao, alteracao ou exclusao de dados reais.

## 1. Motivo

O script existente `npm run smoke:api` continua util para ambiente local ou controlado, mas nao e adequado para producao porque executa fluxo operacional mutavel:

- cria agendamento;
- altera status de atendimento;
- executa checkout;
- registra venda de produto;
- registra devolucao;
- gera efeitos financeiros e auditoria de operacoes.

Para producao, foi criado `npm run smoke:api:readonly`, que valida autenticacao, autorizacao e modulos criticos somente por leituras autenticadas, com excecao do `POST /auth/login` necessario para obter token de sessao.

## 2. Arquivos criados ou alterados

- `scripts/smoke-api-readonly.mjs`
- `package.json`
- `.planning/208_SMOKE_READONLY_PRODUCAO.md`

## 3. Comando

```bash
npm run smoke:api:readonly
```

## 4. Variaveis necessarias

O script exige as seguintes variaveis, sem imprimir seus valores:

- `SMOKE_BASE_URL`
- `SMOKE_OWNER_EMAIL`
- `SMOKE_OWNER_PASSWORD`
- `SMOKE_UNIT_ID`

Variavel opcional:

- `SMOKE_REQUEST_TIMEOUT_MS`

Se alguma variavel obrigatoria estiver ausente, o script falha antes de fazer login e informa somente os nomes das chaves ausentes.

## 5. Garantia de nao mutacao

O smoke readonly nao executa:

- criacao de agendamento;
- alteracao de status;
- checkout;
- venda;
- devolucao;
- lancamento financeiro;
- seed;
- migration;
- restart PM2;
- alteracao manual em banco.

Chamadas HTTP previstas:

- `GET /health`
- `GET /`
- `GET /dashboard?...` sem token, esperando `401` ou `403`
- `POST /auth/login`
- `GET /auth/me`
- `GET /agenda/range?...`
- `GET /clients?...`
- `GET /catalog?...`
- `GET /financial/summary?...`
- `GET /financial/transactions?...`
- `GET /services?...`
- `GET /audit/events?...`
- `GET /settings?...`
- `GET /reports/management/summary?...`

O unico `POST` e o login. Nao ha `PATCH`, `PUT` ou `DELETE`.

## 6. Modulos cobertos

- Health publico.
- Pagina publica inicial.
- Protecao de rota interna sem token.
- Login owner.
- Sessao autenticada em `/auth/me`.
- Agenda.
- Clientes.
- PDV/catalogo.
- Financeiro: resumo e transacoes.
- Servicos.
- Auditoria owner-only.
- Configuracoes.
- Relatorios gerenciais.

## 7. Contrato de sucesso

O smoke aceita listas vazias como sucesso quando o contrato HTTP e de payload esta correto. Exemplos:

- agenda sem agendamentos no periodo;
- financeiro sem transacoes;
- auditoria sem eventos recentes;
- clientes sem resultado no limite consultado.

O smoke falha quando ocorre:

- HTTP status inesperado;
- JSON invalido em endpoint que deve retornar JSON;
- erro `500`;
- falha de login owner;
- rota protegida sem token retorna sucesso;
- `/auth/me` nao identifica owner ou unidade ativa esperada;
- payload fora do contrato minimo esperado.

## 8. Seguranca de logs

O script nao imprime:

- senha;
- token;
- `DATABASE_URL`;
- conteudo de `.env`;
- valores das variaveis `SMOKE_*`.

As mensagens de terminal exibem apenas etapa, endpoint relativo, status HTTP e resumo estrutural de payload.

## 9. Criterios de decisao

**APROVADO** quando:

- `node --check scripts/smoke-api-readonly.mjs` passa;
- `npm run build` passa;
- `npm run smoke:api:readonly` passa em producao;
- `git diff --check` passa;
- nao ha segredo no diff;
- commit seletivo e push sao concluidos.

**APROVADO COM RESSALVAS** quando:

- o script e seguro e sem mutacao;
- mas algum modulo nao pode ser validado por ausencia de endpoint/contrato;
- ou o smoke passa parcialmente sem risco para producao.

**BLOQUEADO** quando:

- o script contem mutacao indevida;
- token ou senha aparece em log ou diff;
- login owner falha;
- rota protegida vaza dados sem token;
- financeiro ou auditoria falha com erro critico;
- arquivo sensivel aparece no Git;
- banco e alterado indevidamente.

## 10. Resultado da etapa

Resultado: **APROVADO**.

Validacoes executadas:

- `node --check scripts/smoke-api-readonly.mjs`: passou.
- `npm run build`: passou.
- `npm run smoke:api:readonly`: passou em producao.

Resultado do smoke readonly em producao:

- `GET /health`: `200`.
- `GET /`: `200`.
- `GET /dashboard` sem token: `401`.
- `POST /auth/login`: `200`.
- `GET /auth/me`: `200`.
- `GET /agenda/range`: `200`.
- `GET /clients`: `200`.
- `GET /catalog`: `200`.
- `GET /financial/summary`: `200`.
- `GET /financial/transactions`: `200`.
- `GET /services`: `200`.
- `GET /audit/events`: `200`.
- `GET /settings`: `200`.
- `GET /reports/management/summary`: `200`.

Garantias confirmadas:

- nao houve chamada de checkout;
- nao houve chamada de venda;
- nao houve chamada de devolucao;
- nao houve chamada de lancamento financeiro;
- nao houve alteracao de status;
- nao houve `PATCH`, `PUT` ou `DELETE`;
- o unico `POST` foi `/auth/login`;
- nenhum token, senha, `DATABASE_URL` ou conteudo de `.env` foi impresso.
