# Macro 244.2C - Produto e quantidade no financeiro

## Objetivo

Detalhar os lancamentos financeiros originados por venda direta de produto, mantendo o titulo financeiro existente e exibindo abaixo dele os produtos vendidos, suas quantidades e a forma de pagamento.

## Causa da limitacao

O lancamento financeiro ja guardava um vinculo seguro com a venda por meio de `FinancialEntry.referenceType=PRODUCT_SALE` e `FinancialEntry.referenceId=ProductSale.id`. Entretanto, o endpoint `GET /financial/transactions`, usado pela tela Financeiro, projetava apenas os dados do lancamento, profissional e cliente. Ele nao percorria os itens da venda e, por isso, o frontend recebia somente descricao, origem, categoria e forma de pagamento genericas.

## Vinculo utilizado

O enriquecimento e exclusivamente de leitura e usa o relacionamento existente:

```text
FinancialEntry.referenceId
  -> ProductSale.id
  -> ProductSaleItem.productSaleId
  -> ProductSaleItem.productId
  -> Product.id / Product.name
```

No adapter Prisma, somente as vendas referenciadas pelos lancamentos retornados sao consultadas e a busca e limitada pela mesma `unitId`. Nenhum campo, chave ou relacionamento novo foi criado.

## Novo payload

Lancamentos de venda de produto continuam retornando `productSaleId` e `paymentMethod` e passam a incluir `productItems`:

```json
{
  "productSaleId": "sale-id",
  "productItems": [
    {
      "productId": "product-pomada",
      "productName": "Pomada",
      "quantity": 1
    },
    {
      "productId": "product-gel",
      "productName": "Gel",
      "quantity": 2
    }
  ],
  "paymentMethod": "PIX"
}
```

Lancamentos sem origem em venda de produto, incluindo lancamentos manuais e estornos, retornam `productItems: []` e preservam o comportamento visual anterior.

## Comportamento visual

Venda com um produto:

```text
Receita de venda de produto
Pomada — qtd. 1
PIX
```

Venda com varios produtos:

```text
Receita de venda de produtos
Pomada x1, Gel x2
PIX
```

O mesmo resumo aparece nos detalhes do lancamento. Conteudo recebido da API continua passando pelo escape de HTML da tela.

## Testes executados

- testes focados da API para venda com um produto, venda com varios produtos, lancamento manual e estorno;
- teste frontend da lista financeira para um produto, varios produtos e fallback manual;
- integracao Prisma comprovando a projecao persistida `FinancialEntry -> ProductSale -> ProductSaleItem -> Product`;
- `npx prisma validate`;
- `npm run test:db`;
- `npm run build`;
- `npm test`;
- `git diff --check`.

## Garantias de escopo

- nenhum calculo financeiro foi alterado;
- nenhuma regra ou quantidade de estoque foi alterada;
- os fluxos de venda, checkout e refund nao foram alterados;
- nenhum schema ou migration foi criado ou modificado;
- nenhum arquivo `.env` foi modificado;
- nenhuma venda real foi executada no banco `barbearia_pilot`;
- os testes persistidos usam exclusivamente o banco local isolado `barbearia_test`;
- nao houve seed, reset ou criacao de dados no piloto durante esta macro.
