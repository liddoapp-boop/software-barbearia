# Sprint 224 - Textos finais do agendamento publico

Data: 2026-06-25 UTC
Decisao final: APROVADO

## 1. Objetivo

Ajustar a microcopy final do agendamento publico antes da validacao mobile final, sem alterar regra de negocio, catalogo, preco, duracao, seed, migration, deploy ou configuracao global de testes.

## 2. Contexto

A Sprint 222 blindou o catalogo publico contra dados de teste, demo, TG e db.

A Sprint 223 revisou os servicos publicos reais e manteve a recomendacao de catalogo publico pequeno, conservador e sem alteracao automatica de dados operacionais.

Esta Sprint 224 focou apenas na clareza dos textos exibidos ao cliente no `public/booking.html`.

## 3. Decisao de CTO

A alteracao e tecnicamente adequada para seguir para a Sprint 225.

O bloqueio inicial do `npm test` foi investigado antes de commitar. A causa confirmada nao era microcopy da Sprint 224, mas um bug real no filtro publico criado na Sprint 222: o marcador `db` era aplicado por substring tambem em IDs. Como UUIDs validos podem conter `db` por acaso, um profissional real como Rafael podia ser removido da resposta publica se o UUID terminasse ou contivesse esse trecho.

A correcao manteve a blindagem contra IDs explicitamente marcados como `demo-*`, `*-db-*`, `db-*`, `teste` e `tg`, mas deixou de tratar `db` acidental dentro de UUID como dado de teste.

## 4. Alteracoes realizadas

Arquivo alterado: `public/booking.html`.

- Troca do subtitulo `chat` por `Agendamento online`.
- Padronizacao de `Meus Agendamentos` para `Meus agendamentos`.
- Troca de prompts com tom conversacional excessivo por comandos mais claros:
  - `Escolha o serviço`.
  - `Informe seu WhatsApp com DDD.`
  - `Informe seu e-mail, se quiser receber a confirmação.`
  - `Escolha uma data`.
  - `Escolha o profissional`.
- Mensagem de falha de servicos alterada para `Não conseguimos carregar os serviços agora. Tente novamente em instantes.`
- Mensagem de servico sem profissional alterada para `Este serviço não tem profissional disponível no momento. Escolha outro serviço ou tente novamente em instantes.`
- Mensagem de horarios vazios alterada para `Não há horários disponíveis para esta data.`
- Falha de carregamento de horarios agora mostra `Não conseguimos carregar os horários agora. Tente novamente em instantes.`
- Botao final ajustado para `Confirmar agendamento`.
- Estado de envio ajustado para `Confirmando…`.
- Retry ajustado para `Tentar novamente`.
- Mensagem de erro generico de booking ajustada para `Não conseguimos concluir seu agendamento agora. Confira os dados e tente novamente.`
- Mensagem de sucesso mantem `Agendamento confirmado!`, com resumo em formato mais natural: data antes do horario.
- Saudacao de cliente recorrente removeu emoji.

Arquivo alterado: `tests/frontend-booking-public.spec.ts`.

- Atualizadas as expectativas de microcopy para os novos textos publicos.
- Mantidos os contratos ja cobertos de catalogo publico, profissionais publicos, e-mail opcional, double tap e bloqueio de estado antigo apos sucesso.

Arquivo alterado: `src/http/app.ts`.

- Extraido o filtro publico de IDs para predicado testavel.
- Mantida a regra ampla para texto publico (`name`, `description`, `category`, `notes`).
- Refinada a regra de IDs para nao bloquear UUID legitimo contendo `db` por acaso.
- Preservado bloqueio de IDs estruturados de teste/demo/db, como `demo-pro-02` e `svc-db-import`.

Arquivo alterado: `tests/api.spec.ts`.

- Adicionado teste de regressao para UUID legitimo contendo `db` acidental.
- Atualizada assercao estatica do contrato de profissionais publicos para os novos predicados de filtro.

## 5. O que nao foi alterado

- Nenhum servico, preco, duracao ou profissional foi alterado.
- Nenhuma migration foi criada.
- Nenhum seed foi executado.
- Nenhum deploy ou PM2 foi executado.
- Nenhuma configuracao global de teste foi alterada.
- `npm run test:db` nao foi executado, conforme restricao da sprint.

## 6. Validacoes executadas

Comandos executados de forma isolada:

| Comando | Resultado |
| --- | --- |
| `git status -sb` | Passou; alterados apenas `public/booking.html` e `tests/frontend-booking-public.spec.ts` no momento inicial da validacao |
| `git log --oneline -10` | Passou; topo era `db74f6e docs: revisar servicos publicos reais` |
| `npx vitest run tests/frontend-booking-public.spec.ts` | Passou; 14 testes |
| `npx vitest run tests/api.spec.ts -t "public/services"` | Passou; 1 teste, 81 skipped |
| `npx vitest run tests/api.spec.ts -t "public/slots"` | Passou; 1 teste, 81 skipped |
| `npm test` inicial | Falhou; 1 teste falhou, 125 passaram, 19 skipped |
| `npx vitest run tests/api.spec.ts -t "lista somente dados publicos seguros dos profissionais elegiveis por servico"` | Passou isolado; 1 teste, 81 skipped |
| `npx vitest --help` | Passou; confirmou opcoes como `--maxConcurrency` e `--no-file-parallelism` |
| `npx vitest run tests/api.spec.ts` apos correcao | Passou; 83 testes |
| `npx vitest run tests/api.spec.ts --maxConcurrency 1` | Passou; 83 testes |
| `npx vitest run tests/frontend-booking-public.spec.ts` apos correcao | Passou; 14 testes |
| `npm test` apos correcao | Passou; 127 testes, 19 skipped |
| `npx tsc --noEmit` | Passou |
| `npm run build` | Passou |
| `git diff --check` | Passou |

## 7. Falha exata e diagnostico

Teste que falhou:

`tests/api.spec.ts > API MVP > lista somente dados publicos seguros dos profissionais elegiveis por servico`

Erro:

```text
AssertionError: expected [ { id: 'pro-01', ...(2) } ] to deeply equal [ { id: 'pro-01', ...(2) }, { ...(3) } ]
```

Local:

```text
tests/api.spec.ts:4510:48
```

Resumo do esperado versus recebido:

- Esperado: `Geovane Borges` e `Rafael Andrade`.
- Recebido: apenas `Geovane Borges`.

Diagnostico confirmado:

- O ID gerado para Rafael no run que falhou era `8efbcffa-b8d2-42a7-85f1-a0adccf877db`.
- Esse ID e um UUID valido, mas contem `db` no final.
- O filtro publico tratava qualquer ocorrencia de `db` em ID como marcador de teste.
- O endpoint removeu Rafael por falso positivo, deixando apenas Geovane.
- O teste passar isolado foi coincidencia: naquele run o UUID gerado nao continha o trecho `db`.

Classificacao tecnica: bug real de regra de filtro publico herdado da Sprint 222, revelado pela suite. Nao era regressao de microcopy da Sprint 224.

## 8. Opiniao tecnica sobre a suite

A suite completa esta pesada e ruidosa para a VPS. O volume de logs HTTP/auditoria aumenta custo e dificulta leitura, mas neste caso a falha nao era apenas contencao: era um falso positivo real causado por dado aleatorio.

Recomendacao futura, sem alterar agora:

- separar jobs de CI por camada: frontend DOM, API publica, API administrativa, financeiro/relatorios;
- reduzir concorrencia dos testes que compartilham banco ou fixtures globais;
- reduzir aleatoriedade em fixtures que validam regras de filtro;
- reduzir ou silenciar logs de request durante teste, sem esconder falhas;
- manter validacoes criticas de release em comandos pequenos e deterministas antes de rodar a suite completa.

## 9. Recomendacao para Sprint 225

Antes da validacao publica final mobile:

- abrir o booking em viewport mobile real ou Playwright mobile;
- verificar se os textos cabem nos botoes e cards;
- validar caminho feliz completo com os servicos publicos reais;
- validar falha de servicos, falha de horarios e horario indisponivel;
- validar retorno de cliente com dados salvos;
- validar agenda com unico profissional e, se aplicavel, multiplos profissionais;
- manter atencao aos filtros textuais temporarios da Sprint 222 ate existir campo formal de publicacao publica.
