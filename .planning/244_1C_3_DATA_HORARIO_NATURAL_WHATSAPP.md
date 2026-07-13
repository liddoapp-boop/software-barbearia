# Macro 244.1C.3 - Data e horario natural do agendamento WhatsApp

Data: 2026-07-13

## Decisao

`DATA E HORARIO NATURAL APROVADOS EM TESTE INTERNO`.

A validacao real pelo WhatsApp permanece pendente por bloqueio operacional: nao existe sessao capaz de enviar pelo numero com final 452. Esse bloqueio nao representa falha do parser.

## Escopo validado

- data falada robusta, com `dateRecognitionType` para data relativa, dia da semana, data numerica, mes nominal, data totalmente falada e mes numerico falado;
- horario natural robusto para formatos numericos, horas faladas, meia hora, periodos do dia, meio-dia, meia-noite e expressoes subtrativas como `quinze para as quatorze`;
- limites deterministas de hora entre 0 e 23 e de minutos entre 0 e 59;
- horario realmente ambiguo, como `quinze para as duas` sem periodo ou regra segura de expediente, retorna pedido de esclarecimento;
- lookahead da data falada aceita os formatos naturais de horario;
- Gemini textual permanece apenas como fallback e nao e chamado quando o caminho deterministico completa ou identifica ambiguidade real.

## Frase real validada internamente

Frase:

`Agendar corte para cliente teste confirmar agenda dia quatorze de julho de dois mil e vinte e seis as onze e trinta`

Resultado do parser e do teste textual interno:

- intencao: `schedule_appointment`;
- cliente: `cliente teste confirmar agenda`;
- servico: `Corte`;
- profissional: `Geovane Borges`;
- data: `2026-07-14`;
- `dateRecognitionType`: `fully_spoken`;
- horario: `11:30`;
- campos ausentes: nenhum;
- modo: `preview_only`;
- Gemini textual: nao chamado.

A validacao interna nao executou nem confirmou agendamento.

## Cobertura automatizada

- formatos `11:30`, `11h30`, `onze e trinta`, `onze horas e trinta` e `onze e meia`;
- horas inteiras e periodos: `as nove`, `nove da manha`, `duas da tarde` e `sete da noite`;
- casos especiais: `meio-dia` e `meia-noite`;
- expressoes subtrativas: `quinze para as quatorze` e `dez para as onze`;
- ambiguidade de `quinze para as duas` sem regra segura de expediente;
- data numerica e data totalmente falada combinadas com horario natural;
- data de calendario e horario invalidos;
- ausencia de chamada ao Gemini quando o parser deterministico completa;
- transcricao mock de audio passando pelo mesmo fluxo textual, sem envio de audio real.

## Validacao real WhatsApp pendente

- nao foi tentado novo envio;
- o backend/Evolution do final 918 nao foi usado como remetente;
- nenhum agendamento real foi confirmado;
- a validacao real continua bloqueada ate existir uma sessao autenticada capaz de enviar pelo final 452;
- pendencia explicita: `CONFIRMAR <codigo>` de agendamento real ainda nao foi validado.

## Regressao final

- parser: `47 passed`;
- webhook: `27 passed`;
- audio: `24 passed`;
- `npm run build`: aprovado;
- `npm test`: `31` arquivos aprovados e `1` ignorado; `422` testes aprovados e `38` ignorados;
- `git diff --check`: aprovado.

## Git e seguranca

- commit seletivo apenas de implementacao, configuracao documentada, testes e este planning;
- nenhum `.env` real, log ou artefato de runtime deve entrar no commit;
- push permanece proibido neste fechamento.
