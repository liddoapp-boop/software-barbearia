# Macro 243.3.2 — Robustez e timeout do parser Gemini textual

## Decisão

`APROVADO EM TESTES AUTOMATIZADOS E ÁUDIO REAL`.

## Causa do timeout

O parser textual Gemini possui um `AbortController` próprio e usa `GEMINI_TIMEOUT_MS`, com padrão de 8.000 ms. Na validação real anterior, a transcrição de áudio terminou, mas essa chamada textual atingiu o timeout local; o fallback determinístico classificou a venda e a prévia foi cancelada sem efeito comercial.

O timeout textual é independente da transcrição de áudio. Nenhum timeout, modelo, endpoint ou dependência foi alterado nesta macro.

## Arquitetura anterior e nova

Antes, `GeminiOwnerCommandParser.parse` chamava Gemini primeiro e só executava o parser determinístico quando Gemini falhava.

No fluxo WhatsApp, a ordem agora é:

1. parser determinístico;
2. normalização e resolução estrita de entidades, incluindo aliases explícitos;
3. Gemini somente se o resultado não puder gerar uma prévia segura;
4. se Gemini falhar, retorno do determinístico já reconhecido, porém incompleto, sem código de confirmação.

O painel mantém o comportamento Gemini-primeiro já existente. O método legado continua fazendo fallback determinístico para preservar compatibilidade fora do WhatsApp.

## Critério de resultado completo

Um comando determinístico evita Gemini somente quando possui intenção permitida, campos obrigatórios preenchidos, entidades resolvidas com segurança e ação `confirm_execute`. Nome parcial de cliente ou profissional, entidade ambígua, alias inexistente, estoque ou forma de pagamento incerta impedem esse resultado.

## Resultado e observabilidade

O parser expõe resultados tipados: `PARSED_COMPLETE`, `PARSED_INCOMPLETE`, `AMBIGUOUS`, `UNSUPPORTED`, `TIMEOUT`, `PROVIDER_ERROR` e `INVALID_RESPONSE`.

Auditoria WhatsApp registra somente estratégia, durações, status tipado, status HTTP quando existir, código seguro da falha, campos presentes/ausentes e correlationId. Não registra texto da mensagem, transcript, payload, telefone completo, áudio, base64, URL, token ou chave.

Falhas 429, HTTP 4xx/5xx, timeout, JSON inválido e resposta vazia são classificadas separadamente. Em todos os casos, campos inexistentes continuam ausentes: não há inferência ou criação de prévia executável com dados incertos.

## Evidências automatizadas

- Parser determinístico completo de venda e agendamento não chama Gemini no WhatsApp.
- Comando incompleto chama Gemini e pode preencher apenas o campo ausente.
- Timeout com comando incompleto pede esclarecimento sem código; o método legado preserva o resultado determinístico em timeout.
- 429, 4xx, 5xx, JSON inválido e resposta vazia são tipados.
- Aliases, bloqueio de nomes parciais, confirmação, cancelamento, idempotência e ausência de operação antes de `CONFIRMAR` permanecem cobertos.

## Riscos restantes

O determinístico cobre somente os formatos de venda e agendamento conhecidos. Comandos novos, incompletos ou ambíguos ainda dependem da disponibilidade do Gemini para tentar complemento e, se ele falhar, exigem esclarecimento humano.

## Validação real consolidada — Macro 243.3.5

Uma nota de voz real autorizada foi transcrita pelo Gemini com HTTP 200. O texto entregue ao parser foi classificado como `PARSED_COMPLETE` pela estratégia `deterministic`, sem chamada ao Gemini textual. A venda permaneceu em prévia e foi cancelada; nenhuma operação comercial foi executada.
