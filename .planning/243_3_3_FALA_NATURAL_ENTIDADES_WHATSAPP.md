# Macro 243.3.3 — Delimitação de entidades em fala natural

## Decisão

`APROVADO EM TESTES AUTOMATIZADOS E ÁUDIO REAL`.

## Causa raiz

O extrator de cliente de venda parava em `ele pagou`, mas capturava conectivos imediatamente anteriores. Por isso, fala sem pontuação podia produzir nomes terminados em `e` ou `aí`.

## Regra implementada

A entidade extraída após `para`, `pra` ou `pro` é delimitada somente por início contextual de outro campo: pontuação, pagamento, agenda, marcador temporal ou profissional. As fronteiras incluem `e ele pagou`, `aí ele pagou`, `pagou no`, `foi no`, `com pagamento em`, `recebi em`, `e marcou`, `para amanhã` e `com o profissional`.

Não há remoção global de palavras. Assim, conectivos internos a nomes permanecem válidos. Os aliases explícitos de pagamento também são reconhecidos deterministicamente e resolvidos para o nome canônico ativo.

## Exemplos

| Entrada | Cliente delimitado | Pagamento |
| --- | --- | --- |
| `para João e ele pagou no Pix` | João | Pix |
| `para João aí ele pagou no Pix` | João | Pix |
| `para João e foi no débito` | João | Cartão de débito |
| `para João e Maria Barbearia e ele pagou no Pix` | João e Maria Barbearia | Pix |
| `para Antônio de Almeida e ele pagou no Pix` | Antônio de Almeida | Pix |
| `para João do Carmo e ele pagou no Pix` | João do Carmo | Pix |

As duas transcrições reais observadas foram cobertas apenas como texto sanitizado, sem áudio, telefone ou identificadores: uma termina antes de `e ele pagou`; a outra preserva `ao WhatsApp real` antes da pontuação.

## Ambiguidade e segurança

Fronteira sem marcador de operação não é removida por heurística. Se o resultado permanecer parcial, ambíguo ou incompleto, a resolução WhatsApp pede esclarecimento, não associa cliente existente por similaridade e não emite código de confirmação. Confirmação, cancelamento, auditoria, idempotência e aliases de produto/serviço permanecem inalterados.

## Evidências automatizadas

- Pontuação, ausência de pontuação, `e`, `aí`, pagamento, débito e dinheiro.
- Nomes com `e`, `de`, `da` e `do` preservados.
- Venda sem pagamento continua incompleta, sem campo inventado.
- Alias `Pomada` continua resolvido pelo fluxo WhatsApp.
- Cliente parcial após delimitação é bloqueado e não cria prévia executável ou alteração comercial.
- Cancelamento permanece coberto pela regressão do webhook.

## Validação real consolidada — Macro 243.3.5

A transcrição real `Vendi uma pomada para o cliente teste áudio natural e ele pagou no Pix.` produziu `BOUNDARY_MATCHED` e preservou exatamente o cliente `cliente teste áudio natural`. Produto `Pomada` e pagamento `Pix` foram resolvidos como `ENTITY_EXACT`; a prévia exibiu quantidade 1 e valor `R$ 7,50`. O cliente permaneceu apenas como candidato novo até eventual confirmação, que não ocorreu.
