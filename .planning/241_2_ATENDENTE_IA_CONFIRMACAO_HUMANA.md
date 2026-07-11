# Macro 241.2 - Atendente IA: Confirmacao Humana e Execucao Segura

## Objetivo

Criar a base de confirmacao humana para o Atendente IA.

## Entregue

- Novo endpoint owner-only `POST /ai/owner-command/confirm`.
- A rota `POST /ai/owner-command/parse` continua retornando previa estruturada e `executed: false`.
- Para `schedule_appointment`, o backend valida campos obrigatorios, resolve cliente, servico e profissional por nome, e libera `confirm_execute` somente quando a previa esta completa.
- A execucao real liberada nesta macro e apenas criacao de agendamento.
- A criacao confirmada usa `operations.schedule`, a regra oficial do sistema para agendamentos.
- A execucao confirmada registra auditoria com origem `atendente_ia`.
- Outras intencoes continuam bloqueadas com a mensagem: `Execucao desta acao sera liberada em uma proxima etapa.`
- A tela `Atendente IA` habilita o botao `Confirmar acao` somente quando o backend retornar token de confirmacao e permissao `confirm_execute`.

## Garantias

- A IA nao executa sozinha.
- Sem clique explicito em `Confirmar acao`, nenhuma alteracao e aplicada.
- Checkout, venda de produto, baixa de estoque, financeiro, cancelamento, alteracao de preco, senha, WhatsApp manual e exclusoes seguem sem execucao.
- Se faltar cliente, servico, data ou horario, a confirmacao nao e liberada.
- O token de confirmacao e assinado pelo backend e vinculado ao owner, unidade, intencao e draft validado.

## Testes previstos

- Backend: `tests/owner-command-ai.spec.ts`.
- Frontend: `tests/frontend-atendente-ia.spec.ts`.
- Regressao API e build antes do commit.

