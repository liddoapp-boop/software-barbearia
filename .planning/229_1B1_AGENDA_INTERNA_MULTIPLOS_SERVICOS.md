# Sprint 229.1B1 - Agenda interna multi-servico

Status: concluida e validada.

## Operacao real

- Owner: Geovane Borges.
- Profissional operacional ativo: Geovane Borges.
- Nao ha recepcao, segundo profissional ou profissional parcial no ambiente visual.
- Perfis extras seguem apenas nos testes automatizados isolados de RBAC.

## Catalogo visual

- Corte: R$ 30, 30 min.
- Barba: R$ 20, 30 min.
- Hidratacao: R$ 20, 30 min.
- Luzes: R$ 50, 60 min.
- Pigmentacao: R$ 45, 60 min.
- Regra ativa: Corte + Barba, total R$ 50, duracao efetiva 45 min, sem desconto.
- Bucha Nudread nao foi cadastrada como servico.

## UX final

O drawer segue a ordem: Cliente, Servicos, Profissional, Data e hora, Resumo, Confirmar agendamento.

Servicos disponiveis exibem nome, preco, duracao, acao Adicionar e estado Selecionado. Servicos selecionados exibem posicao, nome, preco, duracao e Remover. O resumo fica em bloco proprio com quantidade, total, duracao efetiva e regra aplicada.

Como ha exatamente um profissional operacional compativel, o campo Profissional mostra Geovane Borges automaticamente e mantem `professionalId` no payload. Se a API nao resolver exatamente um profissional compativel, o submit e bloqueado com erro operacional.

## Criacao e edicao

O frontend envia `serviceIds`, `professionalId`, `clientId`, `startsAt` e `changedBy`. Nao envia `serviceId`, preco, duracao, total ou regra como fonte de verdade.

A edicao carrega `serviceItems`, permite alternar entre um e varios servicos, recalcula preview/horario, preserva ordem e atualiza a Agenda apos sucesso.

## Semana, Lista e Detalhe

Semana e Lista usam labels compostos a partir de `serviceItems`, por exemplo `Corte + Barba`, sem fallback indevido para servico unico, R$ 0 ou `---`.

Detalhe lista cada servico com preco e duracao snapshot, total, duracao efetiva, regra aplicada, Geovane e status.

## Checkout

Atualizado pela Sprint 229.2: atendimentos em andamento, com um ou varios servicos, devem mostrar a acao `Concluir` e abrir o checkout oficial. O bloqueio temporario de checkout multi-servico foi removido.

## Mobile

Validado em headless a 375 px e 320 px: pagina sem overflow horizontal, cards legiveis, drawer com scroll vertical, Geovane visivel, resumo legivel e botao final presente.

## Validacoes de dados visuais

Banco: `barbearia_visual_test_2291b1_20260703_220531`.

- Catalogo via API retorna os cinco servicos.
- Profissionais via API retornam apenas Geovane Borges ativo.
- Corte: R$ 30, 30 min, elegivel Geovane.
- Corte + Barba: R$ 50, 45 min, regra `Corte + Barba`, elegivel Geovane.
- Corte + Barba + Hidratacao: R$ 70, 90 min, sem regra de 45 min.
- Luzes + Pigmentacao: R$ 95, 120 min.
- Dados visuais nao criaram financeiro nem comissao.

## Testes executados

- `npx vitest run tests/frontend-agenda-multi-service.spec.ts`: 1 arquivo, 9 testes passados.
- `npx vitest run tests/frontend-agenda-normalization.spec.ts`: 1 arquivo, 3 testes passados.
- `npx vitest run tests/frontend-schedule-validation.spec.ts`: 1 arquivo, 4 testes passados.
- `npx vitest run tests/frontend-checkout-flow.spec.ts`: 1 arquivo, 7 testes passados.
- `npx vitest run tests/frontend-menu-config.spec.ts`: 1 arquivo, 3 testes passados.
- `npm test`: 15 arquivos; 13 passados, 2 skipped; 208 testes; 172 passados, 36 skipped.
- `npm run test:db`: 1 arquivo PostgreSQL, 34 testes passados; migrations sem pendencias.
- `npx tsc -p tsconfig.json --noEmit`: passou.
- `npm run build`: passou.
- `git diff --check`: passou com avisos LF/CRLF, sem erro de whitespace.
- `git diff --cached --check`: passou.

Validacao visual humana aprovada: Semana, Lista, Detalhe, drawer desktop/mobile, selecao de 1 a 6 servicos e checkout integrado.

## Roteiro manual unico

1. Entrar como Geovane.
2. Abrir Novo agendamento.
3. Selecionar o cliente visual.
4. Selecionar Corte.
5. Confirmar R$30 e 30 minutos.
6. Adicionar Barba.
7. Confirmar R$50 e 45 minutos.
8. Confirmar Geovane selecionado.
9. Criar o agendamento.
10. Validar Semana.
11. Validar Lista.
12. Validar Detalhe.
13. Atualizar com Ctrl + F5.
14. Editar para apenas Barba.
15. Salvar e confirmar R$20 e 30 minutos.
16. Editar de volta para Corte + Barba.
17. Confirmar checkout de Corte + Barba com total R$ 50 e duracao efetiva 45 min.
18. Verificar rapidamente em 375 px.

## Fora de escopo

- Booking publico.
- Sprint 229.1B2.