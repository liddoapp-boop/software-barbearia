# Macro 243.3.5 — Identidade LID, áudio real e cancelamento seguro

## Decisão

`ÁUDIO WHATSAPP VALIDADO COM CANCELAMENTO SEGURO`.

## Identidade WhatsApp

O extrator agora separa `chatJid`, `senderPhone`, `senderLid`, `fromMe` e `replyTarget`. Em conversa cujo `remoteJid` termina em `@lid`, o telefone autorizado é obtido exclusivamente de `key.remoteJidAlt` quando este termina em `@s.whatsapp.net`. Em conversa telefônica tradicional, usa-se `key.remoteJid` com `@s.whatsapp.net`.

Um LID nunca é normalizado ou comparado com `AI_WHATSAPP_OWNER_PHONE`. A validação real recebeu `remoteJid` final 1744 em `@lid`, extraiu o telefone real final 0452 de `remoteJidAlt`, autorizou o owner e respondeu ao destino telefônico correto.

## Evolution e webhook

- Evolution API versão `2.3.7`, imagem `evoapicloud/evolution-api:latest` no digest observado durante o diagnóstico.
- Instância `geovane-local` em estado `open`, identidade conectada final 0918.
- Webhook regravado sem mudar URL, header ou eventos.
- Configuração efetiva: habilitado, `webhookByEvents=false`, `webhookBase64=false` e evento único `MESSAGES_UPSERT`.
- O evento real chegou ao backend e criou correlationId, confirmando a emissão do `MESSAGES_UPSERT`.

## Configuração de transcrição

A primeira nota de voz diagnosticou `feature_disabled`: as variáveis próprias do adaptador de áudio estavam ausentes do ambiente piloto, embora a credencial Gemini textual estivesse presente. A configuração local passou a habilitar transcrição, provider `gemini`, credencial própria carregada e modelo `gemini-3.5-flash`, sem mock ou stub. Após reinício normal pelo script piloto, o log confirmou `enabled=true` e `serviceAvailable=true`.

O arquivo `.env.pilot.local` permanece ignorado e não integra o commit.

## Validação real final

Uma única nota de voz do owner final 0452 para a Evolution final 0918 foi processada:

- correlationId do áudio: `req-2`;
- mídia OGG/Opus baixada somente em memória;
- transcrição Gemini concluída com HTTP 200;
- parser: estratégia `deterministic`, status `PARSED_COMPLETE`;
- fronteira: `BOUNDARY_MATCHED`;
- cliente preservado exatamente como `cliente teste áudio natural`;
- produto `Pomada`: `ENTITY_EXACT`;
- pagamento `Pix`: `ENTITY_EXACT`;
- quantidade 1 e valor `R$ 7,50`;
- Gemini textual não foi chamado;
- decisão final: `FINAL_PREVIEW`.

O owner respondeu `CANCELAR`. O webhook criou correlationId `req-3` e registrou `AI_WHATSAPP_COMMAND_CANCELLED` com `cancelled=true`. A resposta confirmou que nada foi alterado.

## Segurança comercial

O snapshot permaneceu em 5 agendamentos, 2 vendas, 2 lançamentos financeiros e 8 movimentos de estoque. Desde o início do diagnóstico foram criados 0 agendamentos, 0 vendas, 0 lançamentos financeiros e 0 movimentos/baixas de estoque.

Nenhuma confirmação foi executada. Não houve migration, seed ou alteração manual de banco.

## Regressão

O fechamento exige aprovação dos testes de webhook, áudio, parser e aliases, além de build, suíte completa e `git diff --check`. O commit deve conter somente código, testes e documentação das Macros 243.3.2 a 243.3.5, sem arquivos de ambiente, logs ou segredos.
