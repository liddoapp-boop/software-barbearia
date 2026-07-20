# WhatsApp e Atendente IA

## Escopo

O Atendente IA usa a Evolution API como ponte do WhatsApp para o backend. O fluxo textual local está funcional e sempre exige prévia antes de qualquer venda ou agendamento. Áudio é experimental e não integra o aceite funcional da RC.3.

Esta documentação descreve o comportamento existente. Ela não declara uma instância de produção nem autoriza novos testes reais de WhatsApp.

## Evolution e webhook

- Endpoint do backend: `POST /webhooks/evolution/whatsapp`.
- Evento esperado da Evolution: `MESSAGES_UPSERT`.
- A instância recebida deve coincidir com `EVOLUTION_INSTANCE_NAME`.
- O header `x-evolution-webhook-secret` deve coincidir com `EVOLUTION_WEBHOOK_SECRET`.
- Grupos, mensagens do próprio bot, payloads sem remetente confiável e remetentes não autorizados são rejeitados ou ignorados.
- A infraestrutura local de referência está em [infra/evolution-local](infra/evolution-local/README.md).

Variáveis da integração:

- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_INSTANCE_NAME`
- `EVOLUTION_WEBHOOK_SECRET`
- `AI_WHATSAPP_ENABLED`
- `AI_WHATSAPP_OWNER_PHONE`
- `AI_WHATSAPP_UNIT_ID`
- `AI_WHATSAPP_PENDING_TTL_MS` opcional
- `AI_WHATSAPP_WEBHOOK_DEDUP_TTL_MS` opcional; padrao de 7 dias

Valores reais, QR Codes, sessões, chaves e números completos são sensíveis e não devem entrar no Git ou nos logs de evidência.

## Saída fail-closed no ambiente isolado

`npm run dev:isolated` bloqueia toda mensagem de saída antes da chamada ao Evolution por padrão. A política fica na fronteira compartilhada `sendWhatsAppMessage`, portanto vale para campanhas, respostas do owner, opt-out, agendamentos e qualquer outro fluxo que use o envio comum.

Variáveis exclusivas de `SERVER_MODE=isolated`:

- `ISOLATED_WHATSAPP_OUTBOUND_MODE=disabled`: padrão quando ausente; bloqueia todos os destinatários.
- `ISOLATED_WHATSAPP_OUTBOUND_MODE=allowlist`: permite somente destinatários presentes na lista explícita.
- `ISOLATED_WHATSAPP_OUTBOUND_ALLOWLIST`: um ou mais números controlados, separados por vírgula, ponto e vírgula ou nova linha. Os números são normalizados com o mesmo contrato do payload enviado ao Evolution.

O launcher recusa modo inválido e recusa `allowlist` ausente, vazia ou com entrada inválida. As variáveis são lidas do ambiente explícito que inicia `dev:isolated`, não de `.env.pilot.local`. Fora do modo isolado elas são ignoradas e o comportamento operacional existente é preservado.

Inicialização segura padrão no PowerShell:

```powershell
Remove-Item Env:ISOLATED_WHATSAPP_OUTBOUND_MODE -ErrorAction SilentlyContinue
Remove-Item Env:ISOLATED_WHATSAPP_OUTBOUND_ALLOWLIST -ErrorAction SilentlyContinue
npm run dev:isolated
```

Habilitação explícita de um canário controlado:

```powershell
$env:ISOLATED_WHATSAPP_OUTBOUND_MODE='allowlist'
$env:ISOLATED_WHATSAPP_OUTBOUND_ALLOWLIST='<numero-controlado-com-ddi>'
npm run dev:isolated
```

Um bloqueio não chama `fetch` nem o Evolution, retorna erro determinístico e registra `whatsapp.outbound.blocked` apenas com o telefone mascarado.

## Entrega recuperável da campanha de reativação

O texto da campanha usa `PUBLIC_BOOKING_URL` como link oficial. A criação do rascunho falha de forma fechada se a URL estiver ausente ou não usar HTTPS, se apontar para host local/interno, se contiver credenciais, se não usar a rota pública `/agendamento` ou se o `unitId` não corresponder à unidade da campanha. O nome exibido usa `displayName`, depois `businessName` e por fim o nome da unidade. A prévia persiste exatamente o mesmo texto enviado e todas as mensagens incluem a instrução `SAIR`.

A rota pública `/agendamento` já existe na aplicação. O valor real de `PUBLIC_BOOKING_URL` não fica versionado: ele será configurado na VPS com HTTPS e com o `unitId` da unidade correta. O canário final, já com o texto e o link definitivos, deve ser executado somente após o deploy e a validação dessa configuração na VPS.

O fechamento técnico está dividido no mesmo escopo: a Etapa 3B entrega campanha, prévia estrita, confirmação e opt-out; a 3B.1 adiciona o guard isolado e a allowlist controlada; a 3B.2 cobre persistência recuperável, auditoria, idempotência e concorrência.

Cada destinatário da campanha recebe um `attemptId` interno e estável antes do claim. O envio persiste separadamente o claim e o instante em que a chamada ao provedor começou. Claims antigos sem início de chamada podem voltar para `PENDING`; claims antigos com chamada iniciada tornam-se `UNCERTAIN`, exigem reconciliação manual e nunca são reenviados automaticamente.

Na Evolution API `2.3.7` fixada por digest neste repositório, o DTO e o JSON Schema oficiais de `sendText` não expõem chave de idempotência. Por isso o backend não inventa header ou campo para transportar o `attemptId`; timeouts e falhas ambíguas depois do início da chamada são tratados de forma conservadora como entrega incerta.

`REACTIVATION_RECIPIENT_CLAIM_TIMEOUT_MS` controla quando um claim em processamento pode ser recuperado; o padrão é 300000 ms.

Existe somente uma campanha aberta (`DRAFT` ou `SENDING`) por owner e unidade. A criação é serializada por unidade no PostgreSQL; um `DRAFT` pode ser substituído, mas `SENDING` nunca é cancelado ou substituído automaticamente. Cada destinatário mantém ainda uma reserva única `openClientKey`, impedindo o mesmo cliente de participar de duas campanhas abertas do mesmo tenant. A reserva é liberada somente quando a campanha termina ou é cancelada.

O opt-out compara o telefone pelo mesmo contrato normalizado do envio. Uma frase exata aceita marca todos os cadastros daquele telefone no tenant, ignora cadastros de outros tenants e retira de campanhas abertas os destinatários cuja chamada ao provedor ainda não começou. A análise também herda o opt-out entre cadastros duplicados do mesmo tenant, mesmo quando somente um deles já estava marcado.

Cada transição por destinatário persiste auditoria sanitizada com tenant, `campaignId`, `recipientId`, `attemptId`, estado e motivo seguro. São cobertos claim, início do provedor, sucesso, falha, `UNCERTAIN`, skip, bloqueio do guard, recuperação de claim e opt-out. Telefone completo, mensagem, token e credencial não entram nessa tabela. No PostgreSQL, a mudança principal e sua auditoria usam a mesma transação. Se a auditoria falhar antes da chamada, a transição é revertida e o provedor não é chamado; se falhar depois de uma chamada potencialmente aceita, o registro permanece recuperável como `SENDING` com `providerCallStartedAt` e depois vira `UNCERTAIN`, nunca elegível para reenvio automático.

## Owner autorizado e identidade LID

Somente o telefone configurado em `AI_WHATSAPP_OWNER_PHONE` pode emitir comandos.

Cada `messageId` (ou `eventId` quando fornecido) e reivindicado antes do processamento. Em Prisma, a reivindicacao usa a restricao unica de `IdempotencyRecord`, portanto retries concorrentes e processos diferentes nao podem enviar uma segunda previa ou mensagem de erro. Falha ao registrar a deduplicacao interrompe o fluxo sem resposta nem mutacao.

A Evolution pode entregar conversas com `remoteJid` terminado em `@lid`. Nesse caso:

1. o LID é preservado como identidade de chat, mas nunca é comparado ao telefone autorizado;
2. o telefone do remetente é obtido exclusivamente de `key.remoteJidAlt` quando ele termina em `@s.whatsapp.net`;
3. a resposta usa o destino telefônico confiável;
4. se `remoteJidAlt` não fornecer um telefone válido, o comando não é autorizado.

Em conversas telefônicas tradicionais, o telefone vem de `remoteJid` com sufixo `@s.whatsapp.net`.

## Texto, áudio e transcrição

Somente comandos canônicos completos e inequívocos usam o caminho determinístico direto. Linguagem cotidiana, ordem flexível, pontuação inesperada, pausas e hesitações podem seguir para o provedor semântico selecionado por `SEMANTIC_PROVIDER`.

Para agendamentos semânticos, a chamada ao Gemini exige structured output por JSON Schema. Cada campo retorna valor, evidência e confiança individual; data e horário também preservam a expressão original e o período do dia. O backend rejeita baixa confiança, evidência sem grounding, cliente com introdutor/hesitação/fragmento, entidade fora do tenant, data inválida, horário ambíguo e divergência entre interpretação semântica e validação determinística. O determinístico funciona como validador nesse caminho, não como vencedor automático.

Quando a resposta pede esclarecimento, somente campos já aceitos e com diagnóstico confiável ficam em um contexto temporário separado da pendência executável. O turno seguinte pode completar os campos ausentes; valores rejeitados ou ambíguos nunca são herdados. `CANCELAR`, conclusão da prévia ou expiração do TTL removem esse contexto.

Notas de voz:

1. são identificadas e validadas por tipo, tamanho e duração;
2. a mídia é baixada da Evolution somente para processamento em memória;
3. a transcrição usa o provider configurado, com adapters para whisper.cpp local e Gemini opcional;
4. o texto transcrito percorre o mesmo parser e as mesmas fronteiras de segurança do texto digitado;
5. falha, timeout, limite, replay ou circuito aberto não executam ação comercial.

Variáveis de áudio/transcrição:

- `AI_AUDIO_TRANSCRIPTION_ENABLED`
- `ASR_PROVIDER` (`local_whisper` recomendado apenas para experimentação nesta etapa)
- `AI_AUDIO_TRANSCRIPTION_PROVIDER`
- `AI_AUDIO_TRANSCRIPTION_API_KEY`
- `AI_AUDIO_TRANSCRIPTION_MODEL`
- `AI_AUDIO_TRANSCRIPTION_TIMEOUT_MS`
- `AI_AUDIO_TRANSCRIPTION_CIRCUIT_429_THRESHOLD`
- `AI_AUDIO_TRANSCRIPTION_CIRCUIT_COOLDOWN_MS`
- `AI_AUDIO_MAX_BYTES`
- `AI_AUDIO_MAX_DURATION_SECONDS`
- `AI_WHATSAPP_AUDIO_DOWNLOAD_TIMEOUT_MS` opcional
- `EVOLUTION_MEDIA_DOWNLOAD_URL` opcional

O adapter `local_whisper` exige `LOCAL_WHISPER_FFMPEG_PATH`, `LOCAL_WHISPER_CLI_PATH`, `LOCAL_WHISPER_MODEL_PATH` e `LOCAL_WHISPER_VAD_MODEL_PATH`. O OGG/Opus é convertido por pipe para WAV mono 16 kHz, sem persistir o áudio, e o processo tem timeout máximo de 20 segundos e concorrência 1. Nesta macro o ASR local permaneceu **desativado por padrão**: o benchmark não preservou nomes e horários críticos com qualidade suficiente. Ele só pode ser ativado explicitamente por flags locais após nova base humana ou VPS adequada.

O adapter semântico `local_llama` usa llama-server somente em `127.0.0.1`, contexto 4096, concorrência 1, structured output estrito e thinking desativado por requisição. Ele exige `LOCAL_LLAMA_URL`, `LOCAL_LLAMA_MODEL` e timeout de no máximo 15 segundos. Como o Qwen3-4B Q4_K_M não atingiu o gate de latência nesta máquina, `SEMANTIC_PROVIDER=deterministic` permanece o default seguro. Gemini requer seleção explícita, é opcional e pode estar sujeito à cota gratuita; nenhuma chave é obrigatória no startup, health ou fluxo textual determinístico. Nenhuma IA paga é utilizada nesta release.

O ASR Gemini trata `429` de capacidade/rate limit como transitório: faz no máximo dois retries na mesma sequência, respeita `Retry-After` ou `google.rpc.RetryInfo`, aplica backoff exponencial com jitter e encerra toda a sequência em até 45 segundos. Cota diária, limite zero ou falha explícita de plano/billing não recebe retry. Nenhuma tentativa intermediária envia mensagem ao WhatsApp; o fluxo envia somente a prévia final após recuperação ou uma única resposta amigável após falha definitiva.

As auditorias de transcrição registram apenas diagnóstico sanitizado: status/código/mensagem do provedor, headers de retry permitidos, classificação temporária ou cota, endpoint, modelo, quantidade de tentativas e chamadas recentes. Corpo bruto, áudio, chave e número completo não são persistidos.

## Prévia e confirmação humana

Nenhum comando mutável é executado diretamente a partir da mensagem inicial.

O fluxo é:

1. autenticar instância, webhook e owner;
2. interpretar intenção e resolver cliente, produto, serviço, profissional, data, horário e pagamento;
3. gerar uma prévia final com resumo da operação;
4. armazenar uma pendência temporária em memória;
5. responder com `CONFIRMAR <codigo>` e `CANCELAR`;
6. executar somente após receber exatamente o código válido, dentro do TTL e do mesmo owner.

`CANCELAR` invalida a pendência e confirma que nada foi alterado. Confirmações ausentes, expiradas, reutilizadas ou inválidas não executam. As pendências duram dez minutos por padrão e são perdidas em restart; persistência dessas pendências é uma decisão futura para ambiente de produção.

## Estado das validações reais

### Venda de produto

O fluxo real de venda foi aprovado com uma única confirmação humana:

- prévia de uma Pomada, quantidade 1, pagamento Pix;
- nenhuma mutação antes do `CONFIRMAR`;
- exatamente uma venda, um lançamento financeiro, uma saída de estoque e um cliente após a confirmação;
- vínculos e idempotência reconciliados;
- ausência de duplicação.

O banco piloto foi resetado depois dessas validações; esses registros de teste não permanecem no estado final.

### Agendamento

Parser, áudio simulado e prévia de agendamento estão cobertos. A frase natural com data totalmente falada e horário `11:30` foi interpretada sem Gemini e sem campos ausentes.

A validação real mais recente de `CONFIRMAR <codigo>` para agendamento continua **pendente** porque não existe uma sessão autenticada capaz de enviar pelo número owner com final mascarado `452`. A sessão conectada da Evolution não deve ser usada como substituta do remetente autorizado.

Essa pendência é operacional e não indica falha conhecida do parser, mas deve ser concluída antes de declarar o fluxo real de agendamento WhatsApp aprovado em um ambiente futuro.

## Auditoria e privacidade

O pipeline registra eventos de recebimento, parser, resolução, decisão final, confirmação, cancelamento e rejeição. Logs devem manter telefone mascarado e não devem guardar chave, token, senha, QR Code, sessão, áudio bruto ou mensagem completa sensível.

Referências detalhadas:

- [Atendente WhatsApp-first](.planning/242_ATENDENTE_IA_WHATSAPP_FIRST.md)
- [Identidade LID e cancelamento seguro](.planning/243_3_5_IDENTIDADE_LID_AUDIO_CANCELAMENTO_SEGURO.md)
- [Venda real confirmada](.planning/244_1B_CONFIRMAR_CONTROLADO_VENDA_WHATSAPP.md)
- [Data e horário natural](.planning/244_1C_3_DATA_HORARIO_NATURAL_WHATSAPP.md)
