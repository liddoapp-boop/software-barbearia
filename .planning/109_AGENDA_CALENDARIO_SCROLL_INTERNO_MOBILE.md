# Fase 0.12.2 - Agenda mobile com calendario rolando internamente

Data: 2026-06-14
Status: APROVADO

## Objetivo

Complementar a Fase 0.12.1 garantindo explicitamente a Opcao A para a Agenda mobile:

- manter a visualizacao de calendario/grade semanal;
- manter a visualizacao em lista existente;
- permitir rolagem horizontal apenas dentro do container do calendario quando a grade semanal for larga;
- impedir overflow horizontal geral em `body`, `document` e app shell;
- nao criar uma nova lista;
- nao transformar a Agenda em lista obrigatoria no mobile;
- nao remover calendario;
- nao fazer redesign.

## Investigacao

A Agenda ja possui alternancia entre:
- Calendario: `#agendaCalendarMode`, `#weekCalContainer.wc-outer`, `.wc-header-row`, `.wc-body-inner`;
- Lista: `#agendaListMode`;
- Toggle existente: `#viewGridBtn` e `#viewListBtn`.

A regra correta e manter `.wc-header-row` e `.wc-body-inner` largos quando necessario, mas contidos por `.wc-outer` com `overflow-x: auto`. A pagina inteira nao pode herdar esse overflow.

## Correcao/garantia aplicada

Nao foi criada nova UX nem nova visualizacao.

Foi reforcado o teste automatizado `tests/frontend-mobile-overflow.spec.ts` para validar:
- Agenda abre em calendario sem overflow horizontal geral;
- `.wc-outer` tem scroll horizontal interno quando a grade e mais larga que o container;
- `#viewListBtn` alterna para a lista existente;
- lista existente aparece sem overflow horizontal geral;
- `#viewGridBtn` volta para o calendario;
- calendario continua disponivel apos voltar da lista;
- `document.documentElement.scrollWidth <= window.innerWidth + 2` em todos os estados testados.

## Validacao

Comando executado:

```bash
npm test -- --run tests/frontend-mobile-overflow.spec.ts
```

Resultado:

```text
Test Files  1 passed (1)
Tests  2 passed (2)
```

## Resultado por criterio

1. Pagina inteira da Agenda nao arrasta lateralmente: validado por teste CDP em viewport `390x844`.
2. Area vazia lateral nao aparece no documento: validado por `scrollWidth <= viewport + 2`.
3. Calendario largo rola dentro do proprio bloco: validado por `.wc-outer.scrollWidth > .wc-outer.clientWidth` e `overflow-x: auto/scroll`.
4. Visualizacao em lista existente continua funcionando: validado por clique em `#viewListBtn`.
5. Dashboard, PDV, Financeiro e Booking nao foram alterados nesta fase complementar.

## Pendencias

- Validacao fisica refeita pelo usuario em celular real: aprovada.
- Rodar suite completa no fechamento de commits/push.
- Validar ambiente alvo real/deploy controlado apos o push.

## Decisao final

APROVADO.

Motivo: comportamento esperado da Agenda foi travado em teste automatizado mobile, preservando calendario e lista existentes. O usuario confirmou em celular fisico real que a Agenda esta correta e que o calendario rola dentro do proprio bloco sem arrastar a pagina inteira lateralmente.
