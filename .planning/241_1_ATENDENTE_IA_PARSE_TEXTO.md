# Macro 241.1 - Atendente IA Owner-Only: Interpretacao por Texto

## Objetivo

Criar a primeira versao do Atendente IA do Dono para interpretar mensagens de texto do owner e montar uma previa estruturada.

## Escopo Desta Macro

- Entrada por texto livre no painel owner-only.
- Interpretacao via Gemini API pelo backend.
- Resposta estruturada em modo `preview_only`.
- Nenhuma acao operacional executada nesta etapa.

Fora do escopo:

- Criar ou cancelar agendamento.
- Concluir atendimento ou fazer checkout.
- Vender produto ou alterar estoque.
- Lancar financeiro.
- Enviar WhatsApp.
- Alterar senha ou dados sensiveis.

## Variaveis De Ambiente

- `GEMINI_API_KEY`: chave local do Google AI Studio. Deve ficar apenas em arquivo ignorado pelo Git.
- `GEMINI_MODEL`: modelo usado pelo backend, por exemplo `gemini-3.5-flash`.
- `GEMINI_TIMEOUT_MS`: timeout opcional para chamada de IA.

Nenhum valor real de chave deve ser registrado em codigo, testes, logs, README, planning ou relatorio.

## Endpoint Criado

`POST /ai/owner-command/parse`

Rota owner-only com tenant guard por `unitId` no body. O backend reescreve o `unitId` com a unidade ativa do token.

Entrada:

```json
{
  "unitId": "unit-01",
  "message": "Fiz corte e barba no Joao, ele pagou 50 no Pix.",
  "screenContext": "atendente-ia"
}
```

Saida:

```json
{
  "ok": true,
  "mode": "preview_only",
  "intent": "checkout_service",
  "confidence": 0.85,
  "summary": "Atendimento de Corte para Joao com pagamento Pix.",
  "draft": {},
  "missingFields": [],
  "warnings": [],
  "allowedNextActions": ["confirm_later"],
  "executed": false
}
```

## Tela Criada

Modulo owner-only `Atendente IA`.

Componentes:

- Campo de texto.
- Botao `Interpretar`.
- Sugestoes rapidas.
- Area de previa estruturada.
- Aviso fixo: `A IA apenas prepara a acao. Nada e executado sem confirmacao.`
- Botao de confirmacao desabilitado com mensagem de que a execucao sera liberada na proxima etapa.

## Exemplos De Comandos

- `Fiz corte no Joao e ele pagou no Pix.`
- `Vendi uma pomada para o Lucas.`
- `Agenda o Pedro amanha as 10h para corte.`
- `Cancelei o horario do Carlos porque ele avisou que nao vem.`
- `Quanto vendi hoje?`

## Garantias De Nao Execucao

- O parser sempre normaliza `executed: false`.
- A rota nao chama comandos de escrita operacional.
- A tela nao possui acao de confirmacao habilitada.
- `allowedNextActions` fica limitado a `confirm_later` ou vazio.
- Falhas de IA retornam erro seguro e nao executam fallback operacional.

## Contexto Enviado Para IA

Somente contexto minimo da unidade ativa:

- Servicos ativos: nome, categoria, preco e duracao.
- Produtos ativos: nome, categoria, preco e estoque agregado.
- Metodos de pagamento ativos: nome e padrao.
- Profissionais ativos: nome.
- Data atual e timezone.
- Contexto de tela.

Nao enviar:

- Senhas, hashes, tokens ou chaves.
- `DATABASE_URL`.
- Logs.
- Dados de outras unidades.
- IDs internos.

## Testes

Testes adicionados:

- Owner consegue chamar `/ai/owner-command/parse`.
- Sem token retorna 401.
- Recepcao e profissional retornam 403.
- Sem `GEMINI_API_KEY` retorna erro seguro.
- Resposta sempre tem `executed: false`.
- Rota nao cria agendamento.
- Rota nao altera estoque.
- Rota nao cria financeiro.
- Prompt/contexto nao contem segredo nem IDs internos.
- Frontend renderiza estado sem chave.
- Frontend renderiza previa simulada.

## Riscos

- O modelo pode interpretar texto ambiguo com baixa confianca; por isso a resposta deve preencher `missingFields` e `warnings`.
- A execucao real precisa de uma etapa separada com confirmacao humana, idempotencia e validacoes por tipo de acao.
- O modelo Gemini configurado pode mudar disponibilidade no provedor; o backend retorna erro seguro em falha.

## Proximos Passos

Macro 241.2 - confirmacao humana e execucao segura.
