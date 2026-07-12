# Macro 243.2 — Validação real de áudio via WhatsApp

Data da tentativa: 2026-07-12.

## Resultado

A validação manual com WhatsApp real não foi executada. A preparação local não
estava apta a receber ou transcrever áudio, portanto nenhum áudio foi enviado e
nenhuma confirmação foi respondida.

## Preparação verificada (sem valores)

- O banco configurado é o piloto local `barbearia_pilot`.
- A integração de WhatsApp, proprietário autorizado, unidade, credenciais da
  Evolution e segredo do webhook estão presentes, sem expor seus valores.
- `AI_AUDIO_TRANSCRIPTION_ENABLED`,
  `AI_AUDIO_TRANSCRIPTION_PROVIDER` e
  `AI_AUDIO_TRANSCRIPTION_API_KEY` estão ausentes em `.env.pilot.local`.
- Os limites de áudio `AI_AUDIO_MAX_BYTES` e
  `AI_AUDIO_MAX_DURATION_SECONDS` estão ausentes em `.env.pilot.local`.
- Não havia processo escutando na porta local esperada pelo webhook; por isso
  não foi possível confirmar o backend em `npm run dev:pilot`.
- A instância Evolution, seu estado `open`, o destino efetivo do webhook e a
  diferença entre os números conectado e autorizado não puderam ser
  confirmados sem um backend disponível. A topologia esperada permanece
  mascarada: Evolution → backend local → banco piloto → provider Gemini.

## Testes reais não executados

Os cenários de venda, agendamento e áudio inválido foram deliberadamente
interrompidos antes do envio. Consequentemente:

- não há chegada de áudio ao webhook, download de mídia, transcrição Gemini ou
  resposta/prévia real para registrar;
- não houve resposta `CONFIRMAR`, venda, agendamento, checkout, financeiro ou
  alteração de estoque;
- não houve resposta `CANCELAR`, pois nenhuma prévia real foi criada;
- Gemini não retornou 429 nesta tentativa: nenhuma chamada ao provider foi
  feita;
- não há auditoria real de áudio desta tentativa.

## Verificação do banco piloto

Consulta somente de leitura após a tentativa:

- 0 clientes de teste encontrados;
- 0 vendas, 0 lançamentos financeiros, 0 agendamentos e 0 checkouts
  relacionados aos clientes de teste;
- o produto Pomada existe e seu estoque atual é 8; como não houve execução,
  não ocorreu alteração por esta validação;
- 0 eventos de auditoria de áudio persistidos.

Nenhum segredo, número completo, áudio bruto, base64 ou URL de mídia foi
incluído neste registro. A ausência de auditoria real impede uma inspeção de
payload produzido em operação; os testes automatizados cobrem a sanitização.

## Testes automatizados

- `npx vitest run tests/ai-whatsapp-audio.spec.ts`: 10 aprovados.
- `npx vitest run tests/ai-whatsapp-webhook.spec.ts`: 16 aprovados.
- `npm test`: 342 aprovados, 38 ignorados.
- `npm run build`: aprovado.
- `git diff --check`: aprovado.

## Próximo passo seguro

Configurar as variáveis de transcrição reais e os limites em
`.env.pilot.local`, iniciar `npm run dev:pilot`, confirmar a conectividade da
Evolution sem revelar credenciais e então repetir os três cenários, respondendo
somente `CANCELAR` após cada prévia.

## Segunda tentativa: ambiente preparado, Evolution indisponível

Na segunda tentativa, os ambientes de transcrição foram configurados sem
registrar valores: flag habilitada, provider Gemini, chave de transcrição,
modelo, timeout e limites de tamanho e duração. A chave de transcrição usa o
mesmo credential local já configurado para o Gemini textual. A configuração de
WhatsApp, unidade autorizada, credenciais da Evolution e banco piloto também
estão presentes.

O backend foi iniciado com `npm run dev:pilot`; a porta local 3333 ficou ativa
e `/health` respondeu com sucesso. O banco continuou sendo
`barbearia_pilot`.

Apesar disso, a API da Evolution configurada recusou conexão. O status do
WhatsApp no backend permaneceu diferente de `open`; não há container Evolution
em execução visível pelo Docker local. Assim, não foi possível confirmar o
destino efetivo do webhook nem a conectividade do container para o backend.

Por essa razão, nenhum áudio real de venda, agendamento ou comando inválido foi
enviado. Não há transcrição, prévia, cancelamento, resposta 429 do Gemini ou
auditoria real adicional desta tentativa. Nenhuma venda, agendamento, checkout
ou lançamento financeiro foi executado sem `CONFIRMAR`.

Consulta somente de leitura após a preparação: 0 vendas, 0 financeiros, 0
agendamentos e 0 checkouts relacionados aos clientes de teste; o estoque de
Pomada continua em 8; auditorias reais de áudio continuam em 0. Não houve
segredos, números completos, áudio bruto, base64 ou URL sensível neste
registro.

Os testes finais foram repetidos com sucesso:

- `npx vitest run tests/ai-whatsapp-audio.spec.ts`: 10 aprovados.
- `npx vitest run tests/ai-whatsapp-webhook.spec.ts`: 16 aprovados.
- `npm test`: 342 aprovados, 38 ignorados.
- `npm run build`: aprovado.
- `git diff --check`: aprovado.

Para executar os testes reais, é necessário restaurar ou disponibilizar a
Evolution configurada, deixá-la em estado `open` e confirmar o webhook antes
de enviar os dois áudios do número autorizado.

## Diagnóstico do áudio real: MIME do WhatsApp

O último áudio real chegou ao webhook como `audio/ogg; codecs=opus`, sem
tamanho declarado e com duração de 5 segundos. A mídia foi obtida em memória
com sucesso (12.646 bytes) e a chamada de transcrição foi iniciada.

O Gemini foi alcançado, mas rejeitou a requisição de áudio antes de produzir
transcript. A configuração de modelo e credencial foi validada com uma chamada
de texto controlada; não houve 429, timeout, resposta vazia ou problema do
parser. O motivo é que a API Interactions aceita o MIME canônico `audio/ogg`,
enquanto o parâmetro `codecs=opus` enviado pela Evolution não pertence ao valor
aceito pelo provider. Como não houve transcript, nenhum texto chegou ao parser
e não existe transcript a registrar.

Foi aplicada a normalização do MIME antes da chamada ao Gemini, removendo
parâmetros como `codecs=opus` e preservando o tipo base. A auditoria do áudio
registrou o recebimento, o início da transcrição e a falha segura, sem áudio
bruto, base64, segredo, URL sensível ou número completo. O backend local foi
reiniciado depois da correção.

O teste de áudio passou a verificar explicitamente que um áudio OGG/Opus do
WhatsApp é enviado ao Gemini como `audio/ogg`. Os testes de áudio (10), webhook
(16), build e `git diff --check` passaram. A consulta somente de leitura após
a correção confirmou 0 vendas, 0 financeiros, 0 agendamentos e 0 checkouts
relacionados; Pomada permanece com estoque 8.

## Diagnóstico posterior: timeout do provider

Após a normalização de MIME, um novo áudio real chegou ao webhook. A cadeia
registrada confirmou recebimento de `audio/ogg; codecs=opus`, duração de 5
segundos e download em memória de 12.515 bytes. O provider recebe o tipo
normalizado `audio/ogg`; a normalização remove apenas parâmetros do conteúdo.

Não houve transcript nem texto para o parser. A auditoria terminou em
`audio_transcription_timeout`, sem 429, resposta vazia ou evidência de
transcrição ruim. A requisição do webhook levou aproximadamente 9,4 segundos,
enquanto o timeout de transcrição estava configurado em 8 segundos. Portanto,
a causa é o limite local de tempo, não a compatibilidade OGG/Opus após a
normalização.

O timeout local foi ajustado de 8 para 20 segundos e o backend foi reiniciado
com saúde confirmada. Não foi adicionada conversão para WAV ou MP3: ela seria
uma dependência e caminho de processamento adicionais sem evidência de erro de
decodificação, e não resolveria uma interrupção causada pelo timeout atual.

Após a tentativa, a consulta somente de leitura continua com 0 vendas, 0
financeiros, 0 agendamentos e 0 checkouts relacionados; Pomada permanece com
estoque 8. A auditoria contém somente metadados seguros, sem segredo, número
completo, áudio bruto, base64 ou URL sensível.
