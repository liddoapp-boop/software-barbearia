# Macro 243.2.2 - Correcao do extrator Gemini

Data: 2026-07-12.

## Evidencia que motivou a correcao

O audio real anterior chegou ao webhook, foi baixado somente em memoria e
alcancou o provider antes do timeout de 30 segundos. A auditoria sanitizada
registrou `audio_transcription_empty`; nao houve transcript, parser, previa,
confirmacao ou efeito comercial. A consulta posterior confirmou estoque de
Pomada inalterado e nenhuma nova venda, financeiro, agendamento ou checkout.

O payload do provider nao foi persistido, corretamente. Portanto a variante
exata de schema nao pode ser afirmada. A causa de codigo, contudo, era
confirmada: o extrator aceitava `output_text` e o formato `candidates`, mas nao
as respostas REST `outputs` e `steps` da Interactions API.

## Correcao minima aplicada

Sem alterar timeout, transporte, MIME, modelo, endpoint, dependencias ou regras
de confirmacao, o extrator agora tenta nesta ordem:

1. `output_text`;
2. `outputs[].text`;
3. `steps[]` de tipo `model_output`, usando somente partes `content[]` de tipo
   `text`;
4. `candidates[].content.parts[].text` para compatibilidade existente.

Valores nao textuais, espacos e formatos invalidos sao ignorados sem excecao.
O resultado so fica vazio quando nao existe texto valido.

O diagnostico de transcricao passou a preservar `httpStatus` em resposta HTTP
valida sem texto e inclui somente fingerprint estrutural: chaves superiores,
quantidades de `outputs` e `steps`, tipos de etapas e partes, presenca de
`output_text` e correlationId. Nenhum transcript, payload, audio, base64, URL,
telefone, chave, token ou header e auditado.

## Regressao e seguranca

Os testes cobrem `output_text`, `outputs`, `steps/model_output`, multiplas
partes, etapas nao textuais, `candidates`, prioridade de formatos, payload vazio,
espacos, tipos invalidos, fingerprint sanitizado e preservacao de HTTP 200 no
caso vazio. O fluxo de audio REST continua gerando somente previa e confirma que
nenhuma venda e criada antes de `CONFIRMAR`.

Foram executados com sucesso:

- `npx vitest run tests/ai-whatsapp-audio.spec.ts` (24 aprovados);
- `npx vitest run tests/ai-whatsapp-webhook.spec.ts` (16 aprovados);
- `npm run build`;
- `git diff --check`;
- `npm test`.

## Decisao

APROVADO PARA NOVO TESTE HUMANO, limitado ao roteiro controlado: receber a
previa e responder apenas `CANCELAR`; nunca enviar `CONFIRMAR`. Esta aprovacao
automatizada nao substitui a nova validacao real do audio nem afirma que o
provider retornara a mesma variante de schema em toda chamada.

## Validacao humana controlada

O teste humano posterior confirmou a correcao em producao local: a transcricao
foi concluida com HTTP 200 em aproximadamente 9.048 ms e o fingerprint indicou
`steps` com `thought` e `model_output`, incluindo uma parte textual. Nenhum
texto transcrito ou payload foi persistido.

O comando resultou em previa de venda e foi cancelado pelo owner. Houve um
timeout no parser Gemini textual, mas o fallback controlado classificou
`sell_product`; nenhuma confirmacao, venda, financeiro, agendamento, checkout ou
alteracao de estoque ocorreu. O snapshot permaneceu em vendas 2, financeiro 2,
agendamentos 5, checkouts 0 e Pomada 8; seis auditorias WhatsApp novas registram
o fluxo tecnico e o cancelamento.

Decisao consolidada da Macro 243.2: **APROVADO COM RESSALVAS**. A fidelidade de
nomes transcritos e a resiliencia do parser Gemini textual devem ser tratadas em
macro separada. Esta correcao nao altera timeout, modelo, endpoint, transporte ou
dependencias.
