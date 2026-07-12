# Macro 243.3.1 — Aliases explícitos para entidades WhatsApp

## Decisão

`APROVADO EM TESTES AUTOMATIZADOS — TESTE HUMANO PENDENTE`.

O número autorizado usado nas validações anteriores não está disponível. Esta macro não altera a topologia: o número conectado na Evolution não será usado como número owner autorizado. Um teste humano futuro exige dois números distintos e autorizados.

## Causa e correção

O resolvedor global aceitava uma correspondência parcial única. No WhatsApp, isso poderia associar uma entidade por similaridade sem um alias autorizado. O fluxo WhatsApp passou a usar uma resolução própria e estrita: nome exato, nome normalizado e, somente então, alias explícito versionado. O painel continua usando o resolvedor global existente.

Cada alias aponta para um nome canônico, não para um ID. O nome canônico é procurado novamente no catálogo ativo da unidade e só é aceito se retornar uma única entidade. Alias duplicado, alvo inexistente, alvo duplicado, correspondência parcial ou ambígua não geram prévia executável, código de confirmação ou pendência.

## Aliases iniciais

| Entidade | Alias | Nome canônico |
| --- | --- | --- |
| Produto | Pomada | Pomada Matte |
| Serviço | Corte | Corte Premium |
| Serviço | Corte masculino | Corte Premium |
| Pagamento | pix | Pix |
| Pagamento | credito; cartao credito | Cartao de credito |
| Pagamento | debito; cartao debito | Cartao de debito |

Clientes e profissionais não possuem aliases. Nome parcial para essas entidades pede o nome exato. Cliente ausente continua sendo uma proposta de novo cliente e só pode ser criado após confirmação; a confirmação WhatsApp repete a resolução estrita para impedir uma associação parcial tardia.

## Garantias

- Sem correspondência parcial genérica no WhatsApp.
- A IA não informa nem altera IDs: o backend resolve a entidade no catálogo da unidade.
- Incerteza devolve orientação sanitizada e não cria pendência executável.
- A confirmação, idempotência e auditoria existentes foram preservadas.
- Nenhuma migration, seed, dependência, timeout, modelo ou endpoint foi alterado.

## Evidências automatizadas

- Resolução: nome exato, normalizado, aliases de produto/serviço/pagamento, alias inexistente, duplicado, alvo parcial e clientes/profissionais parciais.
- Webhook: alias de produto e serviço gera apenas prévia; produto, cliente ou profissional incertos não geram código e não alteram estado comercial.
- Painel: regressão do fluxo global coberta por `owner-command-ai.spec.ts`.
- Não foi realizado teste humano nem confirmação comercial nesta macro.

## Verificações executadas

- `npx vitest run tests/owner-command-ai.spec.ts` — 23 aprovados.
- `npx vitest run tests/ai-whatsapp-audio.spec.ts` — 24 aprovados.
- `npx vitest run tests/ai-whatsapp-webhook.spec.ts` — 20 aprovados.
- `npx vitest run tests/whatsapp-entity-resolution.spec.ts` — 8 aprovados.
- `npm run build` — aprovado.
- `git diff --check` — aprovado.
- `npm test` — 30 arquivos aprovados, 1 ignorado; 368 testes aprovados, 38 ignorados.

## Risco residual e próximo passo

Os aliases são código versionado e precisam de curadoria quando o catálogo mudar. O teste humano continua pendente pela indisponibilidade do número autorizado; quando retomado, deverá usar um número conectado e outro número owner autorizado, distintos, sem confirmação comercial. Não adicionar aliases dinamicamente nem por inferência da IA.
