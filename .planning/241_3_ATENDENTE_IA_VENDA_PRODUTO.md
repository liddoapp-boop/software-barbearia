# Macro 241.3 - Venda de Produto pelo Atendente IA

## Objetivo

Liberar a segunda acao executavel do Atendente IA: registrar venda de produto com confirmacao humana explicita.

A IA continua sem executar nada sozinha. Ela interpreta a mensagem, monta uma previa e somente executa quando o owner confirma a acao com um token assinado.

## Por que venda de produto

Venda de produto foi a segunda acao liberada porque usa uma regra oficial ja existente no sistema: `registerProductSale`. Esse fluxo ja centraliza criacao da venda, baixa de estoque, financeiro, comissao quando aplicavel e idempotencia.

## Endpoint usado

- `POST /ai/owner-command/parse`: interpreta e gera previa.
- `POST /ai/owner-command/confirm`: confirma e executa somente `schedule_appointment` e `sell_product`.

O endpoint de confirmacao usa a unidade ativa autenticada (`request.auth.activeUnitId`) e ignora qualquer `unitId` vindo do body.

## Regras de seguranca

- Owner-only.
- Confirmacao humana obrigatoria.
- Token assinado com unidade, actor, intent e draft normalizado.
- Produto resolvido por nome dentro da unidade.
- Cliente novo criado somente depois da confirmacao.
- Pagamento validado contra metodos ativos da unidade.
- Estoque suficiente obrigatorio.
- Quantidade deve ser inteira entre 1 e 99.
- Valor informado pelo owner e tratado como aviso; a venda usa sempre o preco oficial.
- Duplo clique usa idempotencia derivada do token de confirmacao.
- Checkout, cancelamento, financeiro manual, estoque manual, WhatsApp e exclusoes seguem bloqueados.

## Validacao

Comando esperado:

`Vendi uma pomada para CLIENTE TESTE IA VENDA PRODUTO, ele pagou no Pix.`

Previa esperada:

- cliente identificado;
- produto resolvido pelo catalogo real;
- quantidade 1;
- pagamento Pix;
- valor oficial do produto;
- botao `Confirmar venda`.

Confirmacao esperada:

- exatamente 1 venda;
- estoque reduzido uma vez;
- financeiro criado pelo fluxo oficial;
- auditoria `AI_OWNER_COMMAND_PRODUCT_SALE_CREATED`;
- nenhum checkout de servico;
- nenhum agendamento;
- nenhum WhatsApp manual.

## Testes

Cobertura adicionada:

- confirmacao de venda pelo owner;
- bloqueio sem token de confirmacao;
- recepcao/profissional bloqueados pelo owner-only existente;
- produto inexistente;
- estoque insuficiente;
- pagamento inexistente;
- quantidade invalida;
- `unitId` adulterado ignorado;
- duplo clique sem duplicar venda, estoque, financeiro ou auditoria;
- financeiro gerado pelo fluxo oficial;
- checkout de servico ainda bloqueado;
- frontend com botao apenas para venda valida.

## Limitacoes

- Esta macro libera apenas venda avulsa de um produto por comando.
- Venda multiproduto por IA fica para etapa futura.
- A IA nao altera preco oficial; divergencia de valor informado vira aviso.
- Estorno/devolucao por IA nao esta liberado.

## Proximos passos

- Avaliar venda multiproduto com confirmacao humana.
- Avaliar associacao opcional a profissional quando o owner informar.
- Criar smoke read-only/confirmado em ambiente controlado antes de publicar.
