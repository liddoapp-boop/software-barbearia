# Macro 243.3.4 — Observabilidade do pipeline de áudio WhatsApp

## Decisão

`APROVADO EM DIAGNÓSTICO REAL CONTROLADO`.

## Mapa do pipeline

1. recebimento autorizado;
2. download de mídia em memória;
3. transcrição;
4. fingerprint do texto entregue ao parser;
5. parser determinístico/Gemini;
6. avaliação de fronteira;
7. resolução estrita de entidades;
8. decisão final;
9. envio da resposta WhatsApp.

## Eventos estruturados

- `AI_WHATSAPP_PIPELINE_RECEIVED`
- `AI_WHATSAPP_AUDIO_MEDIA_DOWNLOADED`
- eventos existentes de transcrição iniciada, concluída e falha
- `AI_WHATSAPP_PARSER_STARTED`
- `AI_WHATSAPP_PARSER_OBSERVED`
- `AI_WHATSAPP_BOUNDARY_EVALUATED`
- `AI_WHATSAPP_ENTITY_RESOLUTION_COMPLETED`
- `AI_WHATSAPP_GEMINI_STARTED`, `AI_WHATSAPP_GEMINI_COMPLETED` ou `AI_WHATSAPP_GEMINI_FAILED`
- `AI_WHATSAPP_PARSER_COMPLETED`
- `AI_WHATSAPP_FINAL_DECISION`

## Dados sanitizados

O texto recebe fingerprint SHA-256 truncado em 12 caracteres, quantidade de caracteres, palavras aproximadas e presença de pontuação. Auditorias usam apenas correlationId, estágio, duração, status HTTP, códigos tipados, intenção, nomes de campos e contagem de candidatos.

Não são registrados transcript, texto normalizado, áudio, mídia, base64, URL, telefone completo, payload, token, chave, sessão ou headers.

## Códigos

- Transcrição: `TRANSCRIPTION_SUCCESS`, `TRANSCRIPTION_EMPTY`, `TRANSCRIPTION_FAILED`.
- Fronteira: `BOUNDARY_MATCHED`, `BOUNDARY_NOT_MATCHED`.
- Entidades: `ENTITY_EXACT`, `ENTITY_ALIAS`, `ENTITY_AMBIGUOUS`, `ENTITY_NOT_FOUND`.
- Gemini: `GEMINI_SUCCESS`, `GEMINI_TIMEOUT`, `GEMINI_PROVIDER_ERROR`.
- Decisão: `FINAL_PREVIEW`, `FINAL_CLARIFICATION`, `FINAL_SAFE_FAILURE`.

## Limitação

Esta macro não altera interpretação, timeout, aliases, fallback, mensagens ou execução comercial. A telemetria é gravada em auditorias técnicas e pode aumentar a contagem de auditorias em um diagnóstico controlado.

## Validação automatizada

- `owner-command-parser.spec.ts`: aprovado.
- `ai-whatsapp-audio.spec.ts`: aprovado, incluindo ausência de transcript serializado nas auditorias.
- `ai-whatsapp-webhook.spec.ts` e `whatsapp-entity-resolution.spec.ts`: aprovados.
- Build, suíte completa e `git diff --check`: aprovados.

## Validação real consolidada — Macro 243.3.5

O áudio real gerou correlationId `req-2` e percorreu recebimento, download em memória, transcrição Gemini HTTP 200, parser determinístico, fronteira, entidades e decisão `FINAL_PREVIEW`. O comando `CANCELAR` chegou em correlationId `req-3` e registrou `AI_WHATSAPP_COMMAND_CANCELLED` com `cancelled=true`.

As auditorias permaneceram sanitizadas: telefone somente mascarado, texto apenas por fingerprint e nenhuma mídia, transcrição, chave, token, payload ou header persistido. O snapshot comercial terminou inalterado.
