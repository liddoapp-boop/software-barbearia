# Macro 244.1B - CONFIRMAR controlado de venda WhatsApp

Data: 2026-07-13

## Decisao

`CONFIRMAR CONTROLADO DE VENDA WHATSAPP APROVADO`.

Uma venda real de Pomada foi criada pelo fluxo oficial do WhatsApp depois de
uma unica confirmacao humana. A operacao gerou exatamente uma venda, uma
entrada financeira, uma saida de estoque e um cliente. Nao houve duplicacao.

## Ambiente validado

- Branch: `main`.
- HEAD anterior ao fechamento: `46ad1f9b81f44a591ddbd7e3e43bb8372e1fcbea`.
- Backend piloto saudavel.
- Evolution em estado `open`, identidade conectada final 918.
- Owner autorizado final 452 por `remoteJidAlt`.
- Webhook ativo com evento `MESSAGES_UPSERT`.
- Transcricao Gemini habilitada e disponivel.
- Nenhum segredo, numero completo ou arquivo de ambiente integra este registro.

## Ajuste operacional de timeout

A primeira tentativa, correlationId `req-3`, recebeu e baixou corretamente o
audio OGG/Opus, mas terminou em `audio_transcription_timeout` apos 20.017 ms.
Nenhuma previa ou mutacao comercial foi criada. O comando `CANCELAR`,
correlationId `req-4`, registrou `cancelled=false`, confirmando que nao havia
pendencia executavel.

A causa foi a ausencia de `AI_AUDIO_TRANSCRIPTION_TIMEOUT_MS` no ambiente
piloto. O processo usava o default de 20 segundos e o adapter limitava o valor
maximo a 30 segundos. O contrato passou a aceitar de 5 a 45 segundos, o exemplo
de ambiente foi documentado com 45 segundos e o piloto local carregou
`timeoutMs=45000`, `enabled=true` e `serviceAvailable=true`.

O arquivo `.env.pilot.local` permanece ignorado e nao deve ser versionado.

## Audio e previa aprovados

- CorrelationId: `req-5`.
- Audio: OGG/Opus, 5 segundos, processado somente em memoria.
- Transcricao Gemini: HTTP 200 em 29.997 ms.
- Parser: `deterministic`, `PARSED_COMPLETE`.
- Fronteira: `BOUNDARY_MATCHED`.
- Cliente: `cliente teste confirmar venda`.
- Produto: `Pomada`, resolucao `ENTITY_EXACT`.
- Quantidade: 1.
- Pagamento: `Pix`, resolucao `ENTITY_EXACT`.
- Valor: R$ 7,50.
- Decisao: `FINAL_PREVIEW`.
- Nenhuma mutacao ocorreu antes da confirmacao.

## Confirmacao e efeitos

Foi enviada uma unica confirmacao manual, correlationId `req-6`. Nenhuma
segunda confirmacao foi enviada.

- Venda: `e281cf7d-8284-4591-882d-d45a84c6bfc4`.
- Cliente: `b1eaf6d6-1d59-408b-8c15-2e26a940581f`.
- Entrada financeira: `48514ec4-bf11-447f-a33b-ecaa718f63ae`.
- Movimento de estoque OUT: `8b9fa512-708d-45ca-9021-f9bd6f9ee02b`.
- Produto: Pomada, quantidade 1, valor R$ 7,50.
- Pagamento: Pix.

## Reconciliacao antes e depois

| Item | Antes | Depois | Diferenca |
| --- | ---: | ---: | ---: |
| Vendas | 2 | 3 | +1 |
| Entradas financeiras | 2 | 3 | +1 |
| Estoque da Pomada | 8 | 7 | -1 |
| Movimentos da Pomada | 3 | 4 | +1 |
| Cliente-alvo | 0 | 1 | +1 |
| Auditorias WhatsApp | 101 | 116 | +15 |

Os registros de venda, financeiro e estoque apontam para a mesma venda. O
cliente-alvo possui exatamente um cadastro e uma venda.

## Auditoria e idempotencia

Foram confirmados os eventos:

- `AI_WHATSAPP_FINAL_DECISION` com `FINAL_PREVIEW`;
- `AI_WHATSAPP_COMMAND_PARSED`;
- `AI_OWNER_COMMAND_PRODUCT_SALE_CREATED` com `humanConfirmed=true` e canal
  `whatsapp`;
- `AI_WHATSAPP_COMMAND_CONFIRMED` com `executed=true`.

A operacao persistiu idempotencia `PRODUCT_SALE_CREATE` com status `SUCCEEDED`,
chave e hash de payload presentes e resolucao para a venda criada. Nao foi
provocada uma segunda confirmacao real; a protecao persistente e as contagens
confirmaram ausencia de duplicacao.

## Regressao final

- Testes de audio: 1 arquivo, 24 testes aprovados.
- Testes do webhook: 1 arquivo, 25 testes aprovados.
- Build TypeScript: aprovado.
- Suite completa: 31 arquivos aprovados e 1 ignorado; 391 testes aprovados e
  38 ignorados.
- `git diff --check`: aprovado.

## Git e seguranca

- Commit e push nao foram executados durante o teste real.
- `.env.pilot.local`, logs e credenciais permanecem fora do Git.
- O commit de fechamento deve conter somente o contrato de timeout, seu teste,
  o exemplo seguro de ambiente e este planning.
