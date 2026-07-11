# Macro 242.1 - Estabilizacao anti-silencio da IA WhatsApp-first

## Problema consolidado

A Macro 242 identificou que uma resposta HTTP 429 do Gemini podia fazer o parser terminar com erro. Sem uma resposta controlada, a Evolution recebia erro do webhook e o WhatsApp parecia silencioso. A integracao externa pode continuar indisponivel; o backend nao deve transformar isso em silencio.

## Contrato aplicado

Para uma mensagem autorizada com texto, o webhook agora sempre devolve resultado HTTP controlado e tenta uma das saidas: previa, confirmacao, cancelamento, rejeicao segura, orientacao de formato ou aviso temporario. Falhas de auditoria ou de envio pela Evolution tambem nao propagam erro ao webhook.

## Protecoes

- O parser Gemini possui timeout explicito (`GEMINI_TIMEOUT_MS`, padrao de 8 segundos).
- Falhas 429, 5xx, timeout, JSON invalido, schema invalido e erro interno recebem classificacao segura, sem texto bruto do provedor.
- Venda e agendamento nos formatos ja validados usam fallback deterministico e continuam apenas como previa, sempre exigindo `CONFIRMAR`.
- Dois 429 dentro da janela curta abrem circuit breaker local por 60 segundos (configuravel por ambiente). Durante a abertura, a chamada Gemini e evitada; o fallback e usado quando possivel.
- Comando desconhecido e payload textual incompleto recebem orientacao curta com formatos suportados.
- Falha da Evolution ao enviar a resposta cria `AI_WHATSAPP_RESPONSE_FAILED`, preservando retorno controlado para a Evolution.
- Confirmacoes expiradas, canceladas, invalidas ou repetidas continuam sem executar operacoes duplicadas.

## Auditoria segura

Eventos adicionais usam somente motivo classificado, intent e telefone mascarado:

- `AI_WHATSAPP_AI_FAILURE`
- `AI_WHATSAPP_FALLBACK_USED`
- `AI_WHATSAPP_RESPONSE_FAILED`

Nao sao gravados payload bruto, numero completo, API key, segredo de webhook, token, QR Code ou sessao.

## Validacao automatizada

`tests/ai-whatsapp-webhook.spec.ts` cobre 429, timeout, JSON/schema invalidos, circuito de quota, comando desconhecido, fallback de venda/agendamento, payload incompleto, cancelamento seguido de novo comando, confirmacao duplicada/expirada e falha de envio da Evolution. Os cenarios mantem venda, agendamento, financeiro e estoque inalterados ate a confirmacao valida.

## Limites e proxima etapa

O circuit breaker e em memoria e reinicia com o processo; ele reduz tentativas repetidas, mas nao substitui monitoramento ou quota valida do Gemini. Audio e transcricao permanecem fora de escopo ate que esta camada de texto esteja consolidada em operacao controlada.
