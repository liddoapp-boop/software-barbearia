# Etapa 2 — alertas automáticos de estoque pelo WhatsApp

## Fonte de verdade

O estoque mínimo continua sendo `Product.minStockAlert`, configurado exclusivamente pelo dashboard e exposto pela API como `minimumStock`. O WhatsApp não possui comando para criar produto, inferir ou alterar estoque mínimo.

Nenhuma IA generativa participa da classificação ou da redação. As mensagens são templates determinísticos.

## Classificação

- `OUT_OF_STOCK`: quantidade menor ou igual a zero.
- `LOW_STOCK`: quantidade maior que zero e menor ou igual ao mínimo, desde que o mínimo seja maior que zero.
- `IN_STOCK`: quantidade maior que o mínimo; com mínimo zero, toda quantidade positiva pertence a esta situação.

## Transições e ciclo

Um ciclo crítico começa quando o produto sai de `IN_STOCK` para `LOW_STOCK` ou `OUT_OF_STOCK`.

| Transição | Resultado |
| --- | --- |
| `IN_STOCK → LOW_STOCK` | cria alerta baixo e inicia ciclo |
| `IN_STOCK → OUT_OF_STOCK` | cria alerta zerado e inicia ciclo |
| `LOW_STOCK → LOW_STOCK` | deduplica |
| `LOW_STOCK → OUT_OF_STOCK` | cria alerta zerado no mesmo ciclo |
| `OUT_OF_STOCK → OUT_OF_STOCK` | deduplica |
| `OUT_OF_STOCK → LOW_STOCK` | permanece no ciclo sem novo alerta |
| crítico → `IN_STOCK` | encerra o ciclo, sem mensagem de recuperação |

Uma nova queda depois da recuperação incrementa o ciclo e permite novos alertas. A chave idempotente persistente é formada por unidade, produto, tipo e número do ciclo.

## Ponto compartilhado

`stock-alerts.ts` contém a classificação, avaliação de transição e templates. `stock-alert-outbox.ts` registra a intenção na mesma proteção transacional da movimentação e implementa entrega.

As operações em memória e Prisma chamam essa avaliação depois de obter o saldo final. Checkout composto agrega venda e consumo antes de avaliar, evitando alertas para estados intermediários. Replays idempotentes retornam antes de criar nova intenção. Rollback da operação restaura ou desfaz também ciclo, outbox e auditoria.

## Persistência e concorrência

`Product.stockAlertCycle` e `Product.stockAlertCycleActive` guardam o ciclo atual. `StockAlert` funciona como outbox com estados `PENDING`, `SENDING`, `SENT` e `FAILED`.

- Há índice único para `(unitId, productId, alertType, cycle)`.
- A avaliação Prisma usa advisory lock transacional por produto.
- O claim de entrega usa comparação atômica de estado e tentativa.
- Duas instâncias podem disputar o mesmo registro, mas somente uma o move para `SENDING`.
- Claims abandonados há cinco minutos tornam-se elegíveis novamente.

## Entrega e falhas

O dispatcher roda depois da resposta/commit e usa apenas `AI_WHATSAPP_OWNER_PHONE` quando a unidade coincide com `AI_WHATSAPP_UNIT_ID`. Nenhum outro destinatário é resolvido.

O envio tem três tentativas por padrão e backoff exponencial simples a partir de 30 segundos. Uma falha marca `FAILED` sem desfazer venda, checkout, consumo, ajuste, entrada ou devolução. O retry reutiliza o mesmo registro; depois do limite não há novo agendamento nem loop infinito. Falha isolada não executa reconexão da Evolution.

Não há alerta recorrente por tempo nem mensagem automática de recuperação. Uma requisição posterior aciona a drenagem das intenções já elegíveis.

## Auditoria e privacidade

São registrados eventos sanitizados:

- `STOCK_ALERT_CREATED`;
- `STOCK_ALERT_SENT`;
- `STOCK_ALERT_FAILED`;
- `STOCK_ALERT_RETRY_SUCCEEDED`;
- `STOCK_ALERT_DEDUPLICATED`;
- `STOCK_ALERT_CYCLE_RESET`.

Os eventos contêm somente IDs internos, tipo, ciclo, quantidade, mínimo, tentativas e código controlado de falha. Telefone, LID, token, segredo, payload da Evolution e corpo integral de erro não são persistidos nem registrados.

## Limitações conhecidas

- A Etapa 2 possui um único owner/unidade autorizados pelas configurações locais atuais.
- O dispatcher é acionado pelo tráfego da aplicação; não foi criado worker ou cron paralelo.
- Não existe tela nova para a outbox.
- Não há pedido automático a fornecedor, alteração financeira ou mudança de preço/custo.
