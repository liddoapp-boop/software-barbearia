# Macro 239.3 - Correcao P1 de encoding WhatsApp

Data: 2026-07-10 21:40:13 -03:00

## Contexto

- Evolution API local conectada.
- Instancia usada: `geovane-local`.
- Estado antes da validacao de encoding: `open`.
- Numero usado apenas como teste autorizado e registrado mascarado: `5519***18`.
- Envio via booking nao foi testado nesta etapa.

## Causa encontrada

- A mensagem direta anterior que chegou como `integra??o` foi enviada por um comando PowerShell direto para a Evolution API, fora do caminho normal do backend.
- O PowerShell/Invoke-WebRequest em Windows pode codificar corpo string com charset implicito quando `Content-Type` nao declara `charset`.
- Isso e compativel com o sintoma: bytes de acentos enviados fora de UTF-8 e interpretados pela Evolution/WhatsApp como UTF-8 invalido.
- Os templates do backend em `src/notifications/index.ts` foram conferidos com Node e estavam salvos em UTF-8 valido, com acentos corretos em `Ola`, `Servico`, `Horario`, `duvida` e textos de booking.

## Correcao aplicada

- `sendWhatsAppMessage(...)` agora serializa o payload uma unica vez.
- O corpo HTTP e enviado explicitamente como bytes UTF-8.
- O header passou a declarar `Content-Type: application/json; charset=utf-8`.
- Foi criado teste focado para garantir:
  - header com `charset=utf-8`;
  - payload JSON preservando `integracao`, `confirmacao`, `horario` e `servico` com acentos;
  - mensagem de booking sem caractere de substituicao e sem mojibake.

## Validacao controlada

- Foi feito exatamente 1 novo envio direto controlado apos a correcao.
- Caminho usado: `sendWhatsAppMessage(...)` atualizado.
- Destinatario: numero de teste conectado, registrado apenas como `5519***18`.
- Mensagem logica: `Teste interno Liddo Barber: integra\u00e7\u00e3o, confirma\u00e7\u00e3o, hor\u00e1rio e servi\u00e7o.`
- A mensagem foi enviada no script com escapes Unicode para evitar dependencia do encoding do terminal.
- Resultado tecnico: envio concluiu sem erro.
- Confirmacao visual dos acentos no celular: acentos corretos confirmados.

## Logs e seguranca

- Logs recentes nao mostraram API key.
- Logs recentes nao mostraram payload de QR.
- Logs recentes nao mostraram o texto da mensagem de teste.
- Logs locais da Evolution continuam registrando identificador completo do numero conectado; esses logs sao sensiveis e nao foram versionados.
- Nenhum QR Code, token, sessao, API key, log ou numero completo foi versionado.

## Proximos passos

1. Seguir para booking controlado com WhatsApp automatico.
2. Manter os logs locais da Evolution fora do Git e tratados como sensiveis.
