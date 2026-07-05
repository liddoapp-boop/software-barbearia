# Fase 230 - Booking publico multi-servico

## Decisao

PRONTO PARA VALIDACAO AUTOMATIZADA E TESTE MANUAL DO BOOKING PUBLICO MULTI-SERVICO.

## Fluxo publico

O booking publico segue as etapas:

1. Nome
2. Telefone
3. E-mail opcional
4. Servicos
5. Data
6. Horario
7. Revisao
8. Confirmacao

O cliente pode selecionar de 1 a 6 servicos, sem duplicidade e preservando a ordem de selecao.

## Identificacao

A identificacao publica coleta nome, telefone normalizado e e-mail opcional antes da escolha dos servicos. O frontend sanitiza dados vindos de armazenamento local e o backend usa telefone normalizado para reaproveitar cliente existente sem duplicar cadastro.

## Servicos

Os servicos sao carregados de `/public/services`. O frontend nao cria catalogo ficticio e nao hardcoda preco, total ou duracao efetiva.

O estado local usa `selectedServices`. A selecao permite adicionar, remover e limpar servicos.

## Geovane unico

A interface publica nao oferece seletor de profissional. Ela mostra apenas:

`Atendimento com Geovane Borges`

O frontend nao envia `professionalId`. O backend rejeita `professionalId` no POST publico e resolve o profissional elegivel para os servicos na unidade.

## Preview

Ao alterar a selecao, o frontend consulta `/public/services/preview` com `serviceIds`.

O preview retorna:

- itens de servico;
- total;
- duracao efetiva;
- regra aplicada, quando houver.

Respostas antigas sao ignoradas por contador incremental e `AbortController`.

## Disponibilidade

O calendario consulta `/public/slots` com `serviceIds`, nao `serviceId`.

Mudancas em servicos ou data limpam o horario selecionado e invalidam respostas antigas.

## Payload

O POST novo envia:

```json
{
  "clientName": "Cliente",
  "clientPhone": "11999999999",
  "clientEmail": "opcional@email.com",
  "serviceIds": ["svc-corte", "svc-barba"],
  "startsAt": "2026-07-10T17:00:00.000Z",
  "idempotencyKey": "..."
}
```

O frontend nao envia:

- `serviceId`;
- `professionalId`;
- preco;
- duracao;
- total;
- nome do servico como fonte confiavel.

## Idempotencia e concorrencia

O botao de confirmacao desabilita durante envio e usa a mesma `idempotencyKey` no retry do mesmo payload.

O backend grava replay de sucesso para a chave publica. Payload divergente com a mesma chave retorna conflito.

Se o horario for ocupado antes da confirmacao, o cliente ve:

`Esse horario acabou de ser reservado. Escolha outro horario.`

O fluxo mantem cliente e servicos, limpa o horario e recarrega disponibilidade.

## Mobile e acessibilidade

O resumo de servicos tem contencao responsiva, botoes grandes, `aria-live` e estados claros de calculo, erro e selecao vazia.

## Seguranca publica

O booking publico:

- nao expoe clientes existentes;
- nao expoe usuarios;
- nao expoe financeiro;
- nao expoe estoque;
- nao aceita `professionalId` arbitrario no POST publico;
- ignora preco, total e duracao enviados pelo cliente;
- valida unidade pelo contrato existente;
- preserva sanitizacao e headers existentes.

## Testes

Arquivos relevantes:

- `tests/frontend-booking-multi-service.spec.ts`
- `tests/frontend-booking-public.spec.ts`
- `tests/api.spec.ts`
- `tests/db.integration.spec.ts`

Cobertura adicionada ou ajustada:

- selecao ordenada de servicos;
- duplicidade, remocao e limpeza;
- preview via backend;
- payload com `serviceIds`;
- ausencia de `serviceId` e `professionalId` no frontend novo;
- rejeicao de `professionalId` publico;
- replay de idempotencia publica;
- persistencia Prisma de Corte + Barba com total 50 e duracao 45;
- preservacao da ordem recebida em `serviceIds` no `AppointmentServiceItem.position`;
- replay idempotente preservando a mesma ordem de servicos.

## Limitacoes fora da fase

Nao foram implementados nesta fase:

- cancelamento publico;
- remarcacao publica;
- falta;
- atraso;
- encaixe;
- IA;
- WhatsApp.

## Roteiro manual

1. Abrir o booking publico em 375 px.
2. Informar nome e telefone.
3. Selecionar Corte.
4. Confirmar R$30 e 30 min.
5. Adicionar Barba.
6. Confirmar R$50 e 45 min.
7. Confirmar `Atendimento com Geovane Borges`.
8. Selecionar data.
9. Selecionar horario.
10. Revisar.
11. Confirmar uma unica vez.
12. Confirmar sucesso.
13. Abrir Agenda interna.
14. Confirmar que o atendimento apareceu.
15. Atualizar a pagina.
16. Confirmar persistencia.
17. Iniciar novo booking com o mesmo telefone.
18. Confirmar que nao duplicou cliente.
19. Verificar 320 px.

Executar somente um agendamento real na validacao manual.
## Validação manual humana

Validacao humana executada em Safari no iPhone via acesso LAN ao servidor manual da Fase 230.

Evidencias humanas confirmadas:

- acesso publico pelo iPhone sem abrir navegador automatizado;
- selecao de Corte com total R$30 e 30 min;
- selecao de Corte + Barba com total R$50 e duracao efetiva de 45 min;
- catalogo com tres servicos visiveis sem overflow no mobile;
- atendimento exibido somente com Geovane Borges;
- escolha de data e horario;
- revisao antes da confirmacao;
- confirmacao concluida sem erro tecnico visivel;
- agendamento aparecendo na agenda interna;
- persistencia visual apos Ctrl+F5;
- persistencia visual apos restart do servidor;
- novo booking com o mesmo telefone reutilizando o cliente;
- sem duplicidade visual de cliente ou segundo agendamento;
- decisao humana: aprovado para UX e fluxo publico.

O registro manual antigo com `endsAt` 55 min apos `startsAt` permanece apenas como evidencia historica pre-correcao. A causa foi corrigida para o booking publico salvar com `bufferAfterMin: 0`.

## Revalidacao focada do endsAt

Banco isolado utilizado:

`barbearia_manual_test_230_recheck_20260705_0112`

O banco focado foi provisionado intencionalmente apenas com Corte e Barba para reduzir ruido na revalidacao do `endsAt`. Os cinco servicos oficiais ja haviam sido aprovados no ambiente manual anterior.

Configuracao relevante:

- buffer operacional configurado em 10 minutos;
- booking publico usando `bufferAfterMin: 0`;
- Corte + Barba visualmente confirmado no iPhone com total R$50 e 45 minutos;
- profissional Geovane Borges;
- idempotencia `SUCCEEDED`;
- zero financeiro, venda, estoque, comissao, refund e checkout.

Evidencia principal aprovada:

- appointment: `8a548df2-4d3d-47bc-b9b3-8c851d45b440`;
- `startsAt`: `2026-07-06T12:00:00.000Z`;
- `endsAt`: `2026-07-06T12:45:00.000Z`;
- diferenca exata: 45 minutos.

O `endsAt` ficou exatamente 45 minutos apos o `startsAt`; o buffer operacional de 10 minutos nao foi aplicado ao intervalo persistido.

## Ajuste final de ordem

A auditoria final identificou que um agendamento manual havia sido enviado com `serviceIds` em ordem Barba + Corte. Preco, duracao efetiva e `endsAt` ja estavam corretos; o detalhe restante era logico/visual na ordem exibida pelos itens persistidos.

O backend passou a centralizar a reordenacao dos servicos retornados por `findMany` para acompanhar sempre o array recebido em `serviceIds` antes de criar `AppointmentServiceItem.position`.

Cobertura automatizada final:

- `["Corte", "Barba"]` persiste Corte na position 0 e Barba na position 1;
- `["Barba", "Corte"]` persiste Barba na position 0 e Corte na position 1;
- total permanece R$50;
- duracao permanece 45 minutos;
- `endsAt` permanece `startsAt + 45 minutos`;
- replay idempotente preserva a ordem.

Nao foi necessaria nova validacao manual porque o ajuste nao altera preco, duracao, `endsAt`, checkout ou financeiro.

Decisao: Fase 230 aprovada.
