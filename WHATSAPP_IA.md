# WhatsApp e Atendente IA

## Escopo

O Atendente IA usa a Evolution API como ponte do WhatsApp para o backend. A integração local foi validada para texto e áudio, sempre com prévia obrigatória antes de qualquer venda ou agendamento.

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

Valores reais, QR Codes, sessões, chaves e números completos são sensíveis e não devem entrar no Git ou nos logs de evidência.

## Owner autorizado e identidade LID

Somente o telefone configurado em `AI_WHATSAPP_OWNER_PHONE` pode emitir comandos.

A Evolution pode entregar conversas com `remoteJid` terminado em `@lid`. Nesse caso:

1. o LID é preservado como identidade de chat, mas nunca é comparado ao telefone autorizado;
2. o telefone do remetente é obtido exclusivamente de `key.remoteJidAlt` quando ele termina em `@s.whatsapp.net`;
3. a resposta usa o destino telefônico confiável;
4. se `remoteJidAlt` não fornecer um telefone válido, o comando não é autorizado.

Em conversas telefônicas tradicionais, o telefone vem de `remoteJid` com sufixo `@s.whatsapp.net`.

## Texto, áudio e transcrição

Mensagens de texto seguem primeiro o parser determinístico. Gemini é fallback para casos que realmente precisam de interpretação adicional.

Notas de voz:

1. são identificadas e validadas por tipo, tamanho e duração;
2. a mídia é baixada da Evolution somente para processamento em memória;
3. a transcrição usa o provider configurado, atualmente compatível com Gemini;
4. o texto transcrito percorre o mesmo parser e as mesmas fronteiras de segurança do texto digitado;
5. falha, timeout, limite, replay ou circuito aberto não executam ação comercial.

Variáveis de áudio/transcrição:

- `AI_AUDIO_TRANSCRIPTION_ENABLED`
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
