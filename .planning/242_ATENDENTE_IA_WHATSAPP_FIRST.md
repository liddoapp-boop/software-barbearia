# Macro 242 - Atendente IA WhatsApp-first

## Objetivo

Transformar o Atendente IA em uma experiencia WhatsApp-first para comandos de texto do owner, mantendo o painel como ferramenta interna/dev.

## Aba Atendente IA

A aba `Atendente IA` foi ocultada do menu normal por padrao. Ela continua no codigo e pode aparecer em dev/teste quando `AI_ASSISTANT_PANEL_ENABLED=true` for definido no ambiente/global do frontend.

## Variaveis

- `AI_ASSISTANT_PANEL_ENABLED`: mostra a aba interna quando `true`.
- `AI_WHATSAPP_ENABLED`: ativa o webhook WhatsApp-first quando `true`.
- `AI_WHATSAPP_OWNER_PHONE`: numero autorizado do owner, somente em arquivo local/seguro.
- `AI_WHATSAPP_UNIT_ID`: unidade usada pelo comando WhatsApp.
- `EVOLUTION_WEBHOOK_SECRET`: segredo local exigido no webhook.
- `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME`: integracao Evolution ja existente.

Valores reais nao devem ser versionados. `.env.example` contem apenas placeholders.

## Webhook

Endpoint:

`POST /webhooks/evolution/whatsapp`

O endpoint valida segredo por header `x-evolution-webhook-secret`, aceita apenas a instancia esperada, ignora grupos, ignora mensagens do proprio bot e aceita apenas o numero autorizado.

Logs e auditoria usam numero mascarado e nao registram a mensagem completa do owner.

## Fluxo de previa

1. Owner autorizado envia texto no WhatsApp.
2. Backend chama o mesmo motor do Atendente IA.
3. O sistema monta uma previa.
4. Nada e executado.
5. O WhatsApp recebe resumo e codigo curto, por exemplo `CONFIRMAR 4821`.

## Fluxo de confirmacao

`CONFIRMAR <codigo>` localiza a previa pendente, valida TTL e executa somente intents liberadas:

- `schedule_appointment`
- `sell_product`

`CANCELAR` remove a previa pendente e responde que nada foi alterado.

## Armazenamento em memoria

As confirmacoes pendentes ficam em memoria por 10 minutos. Se o servidor reiniciar, a confirmacao pendente expira. Producao futura pode exigir persistencia em banco. Nenhum segredo e armazenado na pendencia.

## Auditoria

Eventos seguros registrados:

- `AI_WHATSAPP_COMMAND_PARSED`
- `AI_WHATSAPP_COMMAND_CONFIRMED`
- `AI_WHATSAPP_COMMAND_CANCELLED`
- `AI_WHATSAPP_COMMAND_REJECTED`

Sem salvar API key, token, senha, hash, QR Code, sessao, numero completo ou prompt completo sensivel.

## Testes

Coberturas adicionadas:

- aba IA oculta por padrao;
- aba IA visivel com flag;
- numero nao autorizado bloqueado;
- grupo ignorado;
- venda por texto gera previa sem executar;
- agendamento por texto gera previa sem executar;
- confirmacao executa venda;
- confirmacao executa agendamento;
- cancelamento nao executa;
- expiracao nao executa;
- confirmacao duplicada nao duplica;
- intent nao liberada continua bloqueada;
- estoque/financeiro mudam somente na venda oficial;
- agenda muda somente no agendamento oficial.

## Validacao manual

Usar somente numero autorizado de teste.

1. Enviar `Vendi uma pomada para CLIENTE TESTE IA WPP, ele pagou no Pix.`
2. Confirmar que o WhatsApp responde uma previa e nada e executado.
3. Responder `CONFIRMAR <codigo>`.
4. Confirmar venda unica, baixa de estoque, financeiro criado pelo fluxo oficial e auditoria.
5. Enviar `Agenda CLIENTE TESTE IA WPP amanha as 11h para corte.`
6. Confirmar que o agendamento so e criado depois de `CONFIRMAR <codigo>`.

## Proximos passos

Implementar audio via WhatsApp na proxima macro.

## Validacao real Macro 242.1

Data local: 2026-07-11.

Preparacao concluida:

- `.env.pilot.local` contem as variaveis obrigatorias, sem valores versionados.
- `npm run dev:pilot` ficou ativo em `http://127.0.0.1:3333`.
- Evolution local ficou ativa em `http://localhost:8080`.
- Instancia WhatsApp consultada como `open`.
- Webhook configurado na Evolution para `http://host.docker.internal:3333/webhooks/evolution/whatsapp`.
- Webhook protegido por segredo local: chamada sem segredo retornou `401`.
- Conectividade container -> backend confirmada com `401` sem segredo.

Validacao real bloqueada:

- O backend nao registrou evento real `AI_WHATSAPP_COMMAND_PARSED`, `AI_WHATSAPP_COMMAND_CONFIRMED`, `AI_WHATSAPP_COMMAND_CANCELLED` ou `AI_WHATSAPP_COMMAND_REJECTED`.
- Logs sanitizados da Evolution indicaram atividade de mensagens, mas sem linhas de webhook e sem erro de entrega.
- Logs sanitizados do backend mostraram somente chamadas de diagnostico sem segredo, rejeitadas como esperado.

Impacto observado:

- Venda de teste criada: nenhuma.
- Agendamento de teste criado: nenhum.
- Estoque da Pomada permaneceu inalterado durante a tentativa.
- Financeiro permaneceu sem lancamento para `CLIENTE TESTE IA WPP REAL`.
- Agenda permaneceu sem agendamento para `CLIENTE TESTE IA WPP REAL`.

Risco aberto:

- A entrega real de eventos da Evolution para o webhook ainda precisa ser confirmada com uma mensagem recebida pela instancia conectada.
- Se a Evolution registrar numero completo ou conteudo de mensagem nos logs locais, esses logs devem ser tratados como sensiveis e nao versionados.

Proxima tentativa:

1. Confirmar pelo telefone autorizado que a mensagem foi enviada para a instancia WhatsApp conectada.
2. Repetir a mensagem de venda e aguardar auditoria `AI_WHATSAPP_COMMAND_PARSED`.
3. Validar `CANCELAR`.
4. Repetir venda, confirmar com `CONFIRMAR <codigo>` e conferir venda/estoque/financeiro/auditoria.
5. Repetir agendamento, confirmar com `CONFIRMAR <codigo>` e conferir agenda/auditoria.

## Diagnostico P1 - webhook real da Evolution

Data local: 2026-07-11.

Confirmacoes:

- Backend piloto ativo em `http://127.0.0.1:3333`.
- Banco do backend confirmado como `barbearia_pilot`.
- Endpoint `POST /webhooks/evolution/whatsapp` existe.
- Chamada sem segredo retornou `401`.
- Chamada controlada com segredo correto retornou `200` e foi ignorada com seguranca por payload vazio.
- Container da Evolution acessa `http://host.docker.internal:3333` e `/health`.
- Container da Evolution acessa o webhook e recebe `401` sem segredo, sem timeout.
- Instancia configurada e aberta: `geovane-local`.
- Webhook persistido na Evolution com URL `http://host.docker.internal:3333/webhooks/evolution/whatsapp`, `enabled=true`, header de segredo presente e evento `MESSAGES_UPSERT`.

Causa tecnica encontrada:

- A infraestrutura local da Evolution nao habilitava o toggle de evento `WEBHOOK_EVENTS_MESSAGES_UPSERT`.
- O compose tambem nao habilitava `WEBHOOK_EVENTS_ERRORS`, dificultando observar falhas de entrega.
- A documentacao da Evolution lista `WEBHOOK_EVENTS_MESSAGES_UPSERT=true` como evento de mensagem e recomenda checar se o evento especifico esta habilitado quando webhooks nao chegam.

Correcao aplicada:

- `infra/evolution-local/docker-compose.yml` passou a definir:
  - `WEBHOOK_EVENTS_MESSAGES_UPSERT: "true"`
  - `WEBHOOK_EVENTS_ERRORS: "true"`
- A API da Evolution foi recriada preservando volumes e sessao.
- A configuracao do webhook foi regravada no formato oficial com `byEvents=false`, `base64=false`, header customizado e `events=["MESSAGES_UPSERT"]`.

Resultado apos correcao:

- Instancia continuou `open`.
- Webhook continuou persistido.
- Container continuou acessando o backend.
- Durante a janela monitorada, nao apareceu novo `messages.upsert` nos logs sanitizados da Evolution.
- Durante a janela monitorada, o backend nao recebeu request real novo e nao criou auditoria `AI_WHATSAPP_*`.
- Nenhum payload real foi observado; portanto o parser atual nao precisou de ajuste nesta etapa.

Impacto:

- Venda real criada: nenhuma.
- Agendamento real criado: nenhum.
- Estoque da Pomada permaneceu inalterado.
- Financeiro permaneceu sem lancamento para `CLIENTE TESTE IA WPP REAL`.

Risco restante:

- Ainda falta confirmar uma mensagem inbound real chegando na instancia apos o toggle de evento. Se a mensagem for enviada pelo mesmo numero conectado na Evolution, ela pode aparecer como mensagem propria (`fromMe`) ou nao representar inbound do owner para o bot. A validacao WhatsApp-first deve usar um numero owner autorizado enviando mensagem para o numero conectado na Evolution.

## Teste real com dois numeros

Data local: 2026-07-11.

Topologia corrigida:

- Numero conectado na Evolution: mascarado como `***********5863`.
- Numero autorizado em `AI_WHATSAPP_OWNER_PHONE`: mascarado como `*********0918`.
- Numeros diferentes confirmados por leitura local sanitizada.

Confirmacoes de ambiente:

- `AI_WHATSAPP_ENABLED=true` confirmado sem imprimir valor sensivel.
- `AI_WHATSAPP_OWNER_PHONE` configurado sem imprimir numero completo.
- `AI_WHATSAPP_UNIT_ID=unit-geovane-borges`.
- `EVOLUTION_WEBHOOK_SECRET` configurado sem imprimir valor.
- Backend piloto respondeu em `http://localhost:3333/health`.
- Instancia Evolution `geovane-local` confirmou estado `open`.
- Webhook da instancia aponta para `http://host.docker.internal:3333/webhooks/evolution/whatsapp`, com header de segredo presente e evento `MESSAGES_UPSERT`.

Ajuste adicional seguro:

- A Evolution recebeu mensagem real, mas nao entregou webhook ao backend com `WEBHOOK_GLOBAL_ENABLED=false`.
- Para compatibilizar a imagem local, `infra/evolution-local/docker-compose.yml` passou a usar `WEBHOOK_GLOBAL_ENABLED: "true"`.
- A API da Evolution foi recriada preservando volumes e sessao.
- O webhook da instancia foi regravado depois do restart, mantendo URL, header de segredo e evento `MESSAGES_UPSERT`.

PING IA:

- A API da Evolution encontrou um `PING IA` armazenado como mensagem recebida (`fromMe=false`).
- Esse `PING IA` veio de numero mascarado como `**********1744`, diferente do owner autorizado `*********0918`.
- Apos o ajuste de `WEBHOOK_GLOBAL_ENABLED`, nao foi observado novo `PING IA` vindo do owner autorizado durante a janela monitorada.
- O backend nao recebeu webhook real novo e nao criou auditoria nova durante as janelas monitoradas.
- Nao foi possivel confirmar resposta do Atendente IA no WhatsApp nesta etapa.

Previa de venda:

- Nao foi validada com numero autorizado nesta etapa, porque o PING do owner autorizado ainda nao apareceu como inbound na Evolution/backend.
- Nenhum `CONFIRMAR <codigo>` foi enviado pelo Codex.

Impacto antes de confirmacao:

- Venda criada para `CLIENTE TESTE IA WPP REAL`: nenhuma.
- Agendamento criado para `CLIENTE TESTE IA WPP REAL`: nenhum.
- Estoque da Pomada permaneceu em `9`.
- Financeiro permaneceu sem lancamento para `CLIENTE TESTE IA WPP REAL`.

Proximo passo:

- Enviar `PING IA` do numero autorizado mascarado como `*********0918` para o numero conectado mascarado como `***********5863` e confirmar que a Evolution registra esse inbound antes de repetir a previa de venda.

## Diagnostico final do webhook - 2026-07-11

Estado Git e preservacao:

- Apos `git fetch origin`, o repositorio permaneceu com um commit local a frente de `origin/main` e nenhum commit atras.
- O fetch reportou uma referencia local `refs/codex/...` invalida e o remoto nao enviou todos os objetos requeridos. Nenhum push foi feito.
- Como medida de preservacao, foi criada a branch local `backup/macro-242-whatsapp-first-local` apontando para o commit da macro.

Topologia observada, sempre mascarada:

- Instancia consultada: `geovane-local`, em estado `open`.
- Identidade conectada na Evolution: `*********0918`.
- Owner configurado em `AI_WHATSAPP_OWNER_PHONE`: `*********0918`.
- O ultimo `PING IA` ja armazenado pela Evolution veio de `**********1744`; ele nao e o owner autorizado e deve ser ignorado pelo backend.
- A identidade conectada e o owner autorizado configurado coincidem. Assim, um envio por essa propria conta sera marcado `fromMe` e ignorado com seguranca; nao existe um inbound valido para esse mesmo numero. A topologia precisa ser decidida pelo responsavel antes do teste real: conectar um numero de atendimento distinto e manter `AI_WHATSAPP_OWNER_PHONE` no numero do owner, ou autorizar explicitamente outro numero de owner. O numero `**********1744` nao foi adotado como owner.

Provas de rede e configuracao real:

- Do container `barbearia-evolution-api-local`, `POST http://host.docker.internal:3333/webhooks/evolution/whatsapp` sem o header de segredo retornou `401`.
- A mesma chamada com o segredo local e payload controlado de instancia deliberadamente incorreta retornou `200` e foi ignorada antes de qualquer acao de negocio.
- A configuracao persistida por instancia esta habilitada, aponta para o endpoint acima, contem o header de segredo e declara explicitamente `events=["MESSAGES_UPSERT"]`.
- O Compose tambem mantem `WEBHOOK_GLOBAL_ENABLED=true` e `WEBHOOK_EVENTS_MESSAGES_UPSERT=true`; portanto nao depende apenas de configuracao global.

Conclusao e limite desta rodada:

- A causa da entrega ausente no estado anterior era a combinacao da configuracao global de eventos/webhook e a necessidade de persistir o webhook na instancia existente; ambas ja estavam corrigidas e foram confirmadas na configuracao efetiva.
- A conectividade, a autenticacao e a rota do backend estao funcionando agora. Nao houve novo inbound real do owner autorizado durante esta verificacao, por isso nao e possivel atribuir uma tentativa HTTP ou status da Evolution a uma mensagem autorizada nova.
- Nenhuma venda, agendamento, confirmacao, alteracao de estoque ou lancamento financeiro foi executado nesta rodada. A previa WhatsApp permanece pendente de um inbound real autorizado.

## Validacao real da confirmacao de venda - 2026-07-11

A previa WhatsApp foi recebida para `CLIENTE TESTE IA WPP REAL` e a confirmacao recebida pelo webhook foi executada pelo fluxo oficial de venda de produto.

Evidencias no banco piloto, em consulta somente leitura:

- Existe exatamente uma venda para a cliente de teste, no valor de R$ 7,50, sem vinculo a agendamento.
- O unico item e `Pomada`, quantidade 1, preco unitario de R$ 7,50.
- A movimentacao de estoque oficial e `OUT`, quantidade 1, com referencia `PRODUCT_SALE`; o estoque da Pomada passou de 9 para 8.
- Existe exatamente um lancamento financeiro vinculado a essa venda, com natureza `INCOME`, origem `PRODUCT`, categoria `PRODUTO`, pagamento `Pix` e valor R$ 7,50. Nao existe lancamento manual para a cliente.
- Nao existe agendamento nem checkout para `CLIENTE TESTE IA WPP REAL`.
- A auditoria registrou `PRODUCT_SALE_REGISTERED` na rota do webhook e, em seguida, `AI_WHATSAPP_COMMAND_CONFIRMED` com execucao bem-sucedida. O registro de confirmacao guarda apenas campos seguros, incluindo telefone mascarado, intent e resultado; nenhum segredo foi registrado.
- A venda tem chave de idempotencia e um unico registro `PRODUCT_SALE_CREATE` com estado `SUCCEEDED`. Ha uma unica venda e uma unica movimentacao/entrada financeira vinculada; repeticao do mesmo codigo nao pode criar uma segunda venda, cobertura tambem validada no teste automatizado do webhook.
## Diagnostico P1 - ausencia de resposta apos cancelamento - 2026-07-11

Estado confirmado antes da correcao:

- `npm run dev:pilot` estava rodando, a porta `3333` estava ativa e `GET /health` respondeu com sucesso.
- O modo piloto continuava apontando para `barbearia_pilot`; nao houve crash do processo.
- A Evolution estava com o container ativo e a instancia `geovane-local` em estado `open`.
- O webhook efetivo permaneceu habilitado em `http://host.docker.internal:3333/webhooks/evolution/whatsapp`, com `MESSAGES_UPSERT` e header de segredo presentes.
- Do container da Evolution, `GET http://host.docker.internal:3333/health` retornou `200`.
- Os logs da Evolution mostraram tentativas de entrega ao webhook que recebiam HTTP `400`; portanto as mensagens chegavam a Evolution e ela chamava o backend.

Causa real:

- O cancelamento anterior foi processado e auditado como `AI_WHATSAPP_COMMAND_CANCELLED`, com `cancelled=true`; nao havia pendencia travada nem bloqueio do numero para novos comandos.
- Os comandos posteriores chegaram ao backend, mas aguardaram aproximadamente o timeout de 8 segundos da IA e retornaram HTTP `400` para a Evolution.
- Uma sonda sanitizada confirmou HTTP `429` do Gemini (limite/quota). Para mensagens sem fallback deterministico, como `PING IA`, a excecao da IA escapava do handler do webhook; a Evolution recebia `400` e o WhatsApp nao recebia resposta humana.

Correcao aplicada:

- O handler WhatsApp agora captura indisponibilidade do parser, grava `AI_WHATSAPP_COMMAND_REJECTED` com o motivo seguro `parser_unavailable` e responde uma mensagem segura, sem executar operacao comercial.
- O parser deterministico passou a reconhecer `Agendar` e o formato `Agendar corte para <cliente> dia DD/MM/AAAA as HH:MM`, preservando o nome do cliente e permitindo gerar somente a previa mesmo durante indisponibilidade da IA.

Teste controlado apos recarregar o backend:

- `PING IA` retornou HTTP `200` ao webhook e acionou a resposta segura; nenhum agendamento, venda, checkout ou lancamento foi criado.
- `Agendar corte para CLIENTE TESTE IA WPP AGENDAMENTO dia 14/07/2026 as 11:00` retornou HTTP `200` e uma previa de `schedule_appointment`; nao houve confirmacao.
- `CANCELAR` retornou HTTP `200`, removeu a previa de teste e registrou `AI_WHATSAPP_COMMAND_CANCELLED`.
- A auditoria recente no banco piloto contem, nesta ordem, `AI_WHATSAPP_COMMAND_REJECTED` (`parser_unavailable`), `AI_WHATSAPP_COMMAND_PARSED` e `AI_WHATSAPP_COMMAND_CANCELLED`.
- A consulta de seguranca confirmou zero agendamentos na data de teste para a cliente de teste. Nenhum segredo, numero completo, token, QR Code ou sessao foi registrado neste documento.

Validacao automatizada:

- `npx vitest run tests/ai-whatsapp-webhook.spec.ts`: 11 testes aprovados.
- `npm run build`: aprovado.
- `git diff --check`: aprovado.
## Validacao real do agendamento via WhatsApp - 2026-07-11

Consulta somente leitura no banco `barbearia_pilot` confirmou o agendamento real do WhatsApp:

- Existe exatamente um agendamento para `CLIENTE TESTE IA WPP AGENDAMENTO` na unidade `unit-geovane-borges`.
- O registro esta no estado oficial `SCHEDULED`, para o servico `Corte`, profissional `Geovane Borges`, em `2026-07-14T14:00:00.000Z` (11:00 em America/Sao_Paulo).
- Nenhum checkout esta vinculado ao agendamento.
- Nao ha venda de produto para a cliente na data do agendamento, nem lancamento financeiro ou movimentacao de estoque vinculados ao agendamento.
- A auditoria registrou `AI_OWNER_COMMAND_APPOINTMENT_CREATED` no webhook e `AI_WHATSAPP_COMMAND_CONFIRMED` com `intent=schedule_appointment` e `executed=true`; telefones nos eventos WhatsApp permanecem mascarados.
- Ha somente um registro do agendamento e uma confirmacao WhatsApp bem-sucedida para ele. A repeticao do mesmo codigo e protegida pela remocao da pendencia apos o primeiro uso; a cobertura automatizada confirma que o replay nao cria segundo agendamento.
- O Gemini 429 e o fallback deterministico foram validados na rodada anterior sem expor segredos. O agendamento real confirmou que o fluxo voltou a concluir com os dados corretos e sem efeitos comerciais colaterais.

Nao foram registrados API keys, segredos de webhook, numeros completos, QR Code, sessao ou tokens.
