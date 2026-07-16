# Etapa 1.1 — Correções naturais em prévias pendentes

## Escopo

A Etapa 1.1 permite corrigir uma entrada de estoque somente enquanto sua prévia estiver com estado `PENDING`. A mensagem escrita ou a transcrição do Whisper percorre o mesmo `commandText`, o mesmo webhook Evolution e o mesmo interpretador determinístico.

Entradas confirmadas, movimentos históricos, estornos, operações compensatórias, preço cadastral e financeiro não são alterados por este fluxo.

## Campos corrigíveis

- produto existente e não ambíguo;
- quantidade inteira positiva;
- custo unitário de compra positivo;
- custo total positivo;
- data válida.

O preço de venda continua somente informativo. Ao trocar o produto, a prévia recarrega o preço atual do novo cadastro, mas não altera nenhum produto.

## Recalculo

- quantidade: preserva custo unitário e recalcula total;
- custo unitário: preserva quantidade e recalcula total;
- custo total: preserva quantidade e calcula custo unitário em centavos;
- quantidade e total: calcula custo unitário;
- quantidade e custo unitário: calcula total;
- produto: preserva quantidade e custos, salvo correções explícitas na mesma mensagem.

Valores incompatíveis ou que não permitem precisão de centavos são recusados, mantendo a prévia anterior intacta.

## Exemplos

```text
Me enganei, são 3 unidades.
O custo unitário correto é 6 reais.
O total correto é 12 reais.
Troca para Óleo para Barba.
A data correta foi ontem.
Na verdade são 3 unidades e o total foi 18 reais.
```

Depois de uma correção válida, o sistema responde com `Entrada de estoque atualizada` e reapresenta todos os campos. Uma nova decisão exata por `CONFIRMAR` ou `CANCELAR` continua obrigatória.

## Ambiguidades

`O valor correto é 12 reais` não informa se o valor é unitário ou total. O sistema pergunta:

```text
Os R$ 12,00 correspondem ao custo unitário ou ao custo total?
```

Respostas como `É o total` ou `É o valor unitário` aplicam o valor à mesma prévia. Produto com mais de uma correspondência também exige o nome exato. Perguntas de esclarecimento armazenam apenas o tipo da dúvida, o valor quando necessário, o ID anonimizado da prévia e o prazo; a prévia não é modificada até a resposta ser segura.

Na criação da prévia, um único valor de custo sem qualificador só deixa de ser ambíguo quando a quantidade é exatamente uma unidade, pois custo unitário e custo total são necessariamente iguais. Para quantidades maiores, o fluxo continua exigindo indicação segura de valor por unidade ou total.

Variações naturais de conjugação produzidas pelo Whisper usam o mesmo detector compartilhado com mensagens escritas. Verbos que também podem representar agendamento, como `colocar`, só identificam entrada quando a própria mensagem contém contexto explícito de estoque; na ausência desse contexto, o comando permanece no orquestrador original e não é convertido em entrada.

## Consistência e idempotência

A atualização usa comparação condicional do status, hash e ID da fotografia ativa. Quando a correção muda dados, uma nova fotografia substitui atomicamente o slot pendente; a fotografia anterior deixa de ser confirmável. Repetir a mesma correção reapresenta a fotografia atual sem criar movimento ou divergência.

O webhook continua deduplicado por instância, telefone e identificador da mensagem. Logs e auditoria registram somente IDs, fingerprints, campos alterados, resultado e motivo controlado, sem texto integral, telefone, áudio, URL de mídia, base64 ou segredo.

## Limitações

- uma única prévia ativa por tenant, owner e telefone;
- não cria produto nem usa correspondência probabilística;
- não corrige preço de venda, observação ou dados financeiros;
- não edita entrada confirmada;
- não usa Gemini, Qwen ou fallback pago;
- correções posteriores à confirmação exigirão uma operação compensatória auditável em etapa futura.
