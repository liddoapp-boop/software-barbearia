# Macro 243 — Áudio via WhatsApp para o Atendente IA

## Objetivo

Aceitar mensagens de áudio enviadas pelo owner no WhatsApp e convertê-las para o mesmo fluxo de comando textual já validado. Áudio nunca executa uma ação diretamente: o resultado é sempre uma prévia e a operação oficial exige `CONFIRMAR <codigo>`; `CANCELAR` continua removendo a pendência.

## Arquitetura

1. O webhook da Evolution reconhece `audioMessage`, PTT/voice note, `mediaMessage`, tipos de mensagem de áudio e mimetypes de áudio permitidos.
2. Metadados são validados antes do download: mimetype, tamanho declarado e duração declarada.
3. O adapter de mídia chama o endpoint de base64 da Evolution apenas em memória. O áudio não é salvo em disco, banco, repositório ou auditoria.
4. `AudioTranscriptionService` isola a transcrição. Nesta macro o único adapter disponível é `mock`, ativado explicitamente por `AI_WHATSAPP_AUDIO_TRANSCRIPTION_MODE=mock`; sem essa configuração a resposta é segura e nenhuma ação é criada.
5. O texto transcrito entra em `parseOwnerCommandPreview`, a mesma função usada para texto do WhatsApp. Venda e agendamento, confirmação, idempotência e execução oficial são os mesmos fluxos existentes.

## Limites e segurança

- Mimetypes aceitos: formatos `audio/*` conhecidos, incluindo ogg/opus, mpeg/mp3, mp4/m4a, aac, webm e wav.
- Limite padrão: 8 MiB e 120 segundos; ambos são configuráveis por ambiente seguro.
- Download tem timeout explícito de 8 segundos por padrão.
- URLs de mídia, base64, bytes de áudio, payload bruto, tokens, segredos e números completos não são registrados.
- Auditoria usa número mascarado e um identificador derivado do id da mensagem; transcript não é persistido em auditoria.
- Replay do mesmo id de áudio é ignorado durante o TTL da pendência, portanto não gera uma segunda prévia nem uma execução.

## Contrato operacional

Quando a transcrição funciona, a resposta informa a interpretação resumida do áudio e envia a prévia com `CONFIRMAR <codigo>` e `CANCELAR`. Nenhuma venda ou agendamento ocorre antes da confirmação humana.

Em áudio incompleto, grande, longo, de tipo inesperado ou com download indisponível, o owner recebe orientação para reenviar ou usar texto. Falhas de transcrição — inclusive retorno vazio, sem fala, 429, 5xx e timeout quando implementados pelo provider — também retornam orientação controlada e não deixam exceção escapar ao webhook. Falha ao enviar a resposta pela Evolution segue o tratamento controlado já existente.

## Auditoria

Eventos adicionados: `AI_WHATSAPP_AUDIO_RECEIVED`, `AI_WHATSAPP_AUDIO_REJECTED`, `AI_WHATSAPP_AUDIO_TRANSCRIPTION_STARTED`, `AI_WHATSAPP_AUDIO_TRANSCRIPTION_COMPLETED`, `AI_WHATSAPP_AUDIO_TRANSCRIPTION_FAILED` e `AI_WHATSAPP_AUDIO_REPLAY_IGNORED`. A geração de prévia, confirmação e cancelamento usam os eventos existentes do comando WhatsApp.

## Testes

`tests/ai-whatsapp-audio.spec.ts` cobre reconhecimento, download mockado, transcrição mockada, prévia de venda, prévia de agendamento, confirmação posterior, mídia inválida/grande, falhas de transcrição, falhas da Evolution, replay e sanitização de auditoria. Os testes existentes do webhook continuam cobrindo confirmação duplicada, cancelamento e o fluxo textual compartilhado.

## Pendência de integração real

Nenhum provedor real de transcrição foi ativado nesta macro. A integração futura deve fornecer um adapter próprio para `AudioTranscriptionService`, com credenciais segregadas, timeout, 429/5xx, circuito de proteção e revisão de privacidade antes de ser habilitada. A validação manual com celular não foi realizada; a macro foi validada apenas por payloads simulados e testes automatizados.
