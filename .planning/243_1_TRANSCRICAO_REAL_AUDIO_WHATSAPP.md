# Macro 243.1 — Transcrição real de áudio WhatsApp

## Provider e arquitetura

O provider real escolhido é Gemini, usando a API `Interactions` com áudio inline em memória. O adapter `GeminiAudioTranscriptionService` implementa a interface `AudioTranscriptionService`; portanto, após obter o transcript, o sistema reaproveita integralmente o fluxo textual de prévia, confirmação, cancelamento, idempotência e execução oficial.

O áudio limitado pela Macro 243 (8 MiB por padrão) fica abaixo do limite de requisição inline documentado pelo provider. Não há conversão de formato: o mimetype recebido e validado é enviado ao provider. Caso o provider exija conversão futura, ela deve ser introduzida somente com biblioteca segura e revisão específica.

## Configuração segura

O recurso é desativado por padrão. As variáveis de ambiente documentadas em `.env.example` são:

- `AI_AUDIO_TRANSCRIPTION_ENABLED=false`
- `AI_AUDIO_TRANSCRIPTION_PROVIDER=gemini`
- `AI_AUDIO_TRANSCRIPTION_API_KEY=...`
- `AI_AUDIO_TRANSCRIPTION_MODEL=gemini-3.5-flash`
- `AI_AUDIO_TRANSCRIPTION_TIMEOUT_MS=8000`
- `AI_AUDIO_TRANSCRIPTION_CIRCUIT_429_THRESHOLD=2`
- `AI_AUDIO_TRANSCRIPTION_CIRCUIT_COOLDOWN_MS=60000`
- `AI_AUDIO_MAX_BYTES=8388608`
- `AI_AUDIO_MAX_DURATION_SECONDS=120`

Quando a flag está desligada, o webhook não baixa a mídia e responde que a transcrição ainda não está ativa, orientando o comando por texto. Quando está ligada, mas o provider ou a chave não estão configurados, a falha continua controlada e não cria prévia nem execução.

## Tratamento de falhas e segurança

O adapter tem timeout explícito, mapeia 429, 5xx, resposta vazia, sem fala e resposta inválida para erros controlados. Dois 429 dentro da janela configurada abrem um circuito local temporário para não insistir no provider. Todas essas situações resultam em orientação segura no WhatsApp.

Áudio, base64, binário, URL de mídia, payload bruto, token e chave de API não são registrados. A auditoria usa apenas metadados mínimos, número mascarado e identificador derivado da mensagem. O transcript é usado somente para a prévia e para o fluxo textual em memória; não é incluído na auditoria.

O mock é aceito exclusivamente quando `NODE_ENV=test` e o provider é explicitamente `mock`. Ele não pode ser selecionado por acidente em produção.

## Testes e validação

`tests/ai-whatsapp-audio.spec.ts` cobre o provider Gemini mockado em sucesso, 429, 5xx, timeout e texto vazio, além de flag desligada, isolamento do mock, prévia de venda/agendamento, confirmação posterior, falhas da Evolution, replay e auditoria sanitizada.

Não houve validação manual com celular nesta macro. Ela permanece para a Macro 243.2 e não deve confirmar venda ou agendamento reais sem decisão explícita.
