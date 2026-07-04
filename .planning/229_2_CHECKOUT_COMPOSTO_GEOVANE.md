# Sprint 229.2 - Checkout composto Geovane

Status: concluido e validado no ambiente visual.

## Objetivo

Liberar a conclusao operacional de atendimentos com varios servicos sem tela tecnica e sem bloqueio temporario.

## Regra operacional

- Todo agendamento `IN_SERVICE` mostra uma unica acao primaria: `Concluir`.
- `Concluir` abre o checkout oficial tanto para atendimento simples quanto composto.
- A rota oficial permanece `POST /appointments/:id/checkout`.
- A rota `/complete` segue fora do fluxo oficial.
- O backend calcula total a partir dos snapshots persistidos dos servicos e dos produtos vendidos no checkout.
- O frontend pode enviar `expectedTotal`, mas ele e usado apenas como conferencia.

## Catalogo visual

- Corte: R$ 30, 30 min.
- Barba: R$ 20, 30 min.
- Hidratacao: R$ 20, 30 min.
- Luzes: R$ 50, 60 min.
- Pigmentacao: R$ 45, 60 min.
- Regra especial: Corte + Barba total R$ 50, duracao efetiva 45 min.
- Bucha Nudread segue como produto, nao servico.

## UX de checkout

- Modal com linguagem direta: cliente, data, horario, profissional, servicos realizados, produtos vendidos, forma de pagamento e total a pagar.
- Servicos aparecem separadamente, com subtotal de servicos.
- Produtos sao opcionais e aparecem em bloco proprio.
- Forma de pagamento e obrigatoria.
- Mensagens temporarias como `Concluir indisponivel` e aviso de checkout futuro foram removidas do fluxo.

## Persistencia e regras financeiras

- Uma unica receita financeira e criada por atendimento concluido, com total de servicos mais produtos.
- Operacao real do Geovane nao usa regra de comissao ativa; checkout de servico, multi-servico ou produto nao cria `CommissionEntry` quando nao ha regra ativa com valor maior que zero.
- A infraestrutura tecnica de comissoes permanece para testes/regra futura: calculo, `appointmentServiceItemId`, pagamento, cancelamento por estorno, auditoria e relatorios tecnicos continuam cobertos.
- Estorno integral de atendimento cancela apenas comissoes pendentes que ja existirem por regra tecnica ativa, gera despesa de estorno e devolve produtos ao estoque.
- Relatorios financeiros usam uma receita unica por atendimento; analiticos de servicos usam snapshots dos itens de servico para nao duplicar produto como servico e nao tratam comissao ausente/cancelada como custo operacional.

## Validacao manual recomendada

1. Criar atendimento com Corte + Barba para Geovane.
2. Iniciar atendimento.
3. Clicar em `Concluir`.
4. Confirmar modal com dois servicos separados.
5. Confirmar total R$ 50 e duracao efetiva 45 min no resumo/detalhe.
6. Adicionar produto opcional, quando necessario.
7. Escolher forma de pagamento.
8. Concluir e verificar status `COMPLETED`.
9. Conferir financeiro com uma unica receita do atendimento.
10. Conferir estoque e historico de venda se produto foi incluido.

## Validacoes automatizadas

- `npx vitest run tests/frontend-checkout-flow.spec.ts`: 1 arquivo, 7 testes passados.
- `npx vitest run tests/frontend-agenda-multi-service.spec.ts`: 1 arquivo, 9 testes passados.
- `npx vitest run tests/frontend-agenda-normalization.spec.ts`: 1 arquivo, 3 testes passados.
- `npx vitest run tests/frontend-schedule-validation.spec.ts`: 1 arquivo, 4 testes passados.
- `npx vitest run tests/frontend-menu-config.spec.ts`: 1 arquivo, 3 testes passados.
- `npm test`: 15 arquivos; 13 passados, 2 skipped; 208 testes; 172 passados, 36 skipped.
- `npm run test:db`: 1 arquivo PostgreSQL, 34 testes passados; `prisma generate`, `migrate status` e `migrate deploy` sem pendencias.
- `npx tsc -p tsconfig.json --noEmit`: passou.
- `npm run build`: passou.
- `git diff --check`: passou com avisos LF/CRLF do Windows, sem erros de whitespace.
- `git diff --cached --check`: passou.
## Aceite PostgreSQL visual

Auditoria final executada em 2026-07-04, sem chamar endpoint de checkout e sem alterar dados historicos.

- Banco visual final: `barbearia_visual_test_2292_20260704_001335`.
- Migrations aplicadas: 19, incluindo `20260703_commission_per_appointment_service_item`.
- Operacao visual provisionada com `unit-01`, Geovane Borges como owner/profissional unico, cinco servicos canonicos, regra Corte + Barba de 45 min, Pomada a R$ 25 com estoque atual 9 e nenhuma regra de comissao ativa para a operacao real.
- Atendimento final auditado: `7837af35-3e0b-45c7-9797-75c9179fd32d`, status `COMPLETED`, Corte + Barba, duracao efetiva 45 min, PIX, receita unica R$ 75.
- Venda auditada: uma `ProductSale` de R$ 25, uma Pomada, um movimento `OUT` de 1 unidade e estoque atual da Pomada em 9.
- Idempotencia auditada: exatamente um `APPOINTMENT_CHECKOUT` `SUCCEEDED` para o atendimento final.
- Auditoria auditada: exatamente um `APPOINTMENT_CHECKOUT_COMPLETED` em `/appointments/:id/checkout`.
- Comissao auditada: zero `CommissionEntry` para servicos e produto do atendimento final.
- Catalogo oficial ativo: Gel 30; Pomada 9; Bucha Nudread 3; Oleo para Barba 4; Shampoo 10; Condicionador 10; Mascara de Hidratacao 10; sem duplicados.
- Fixture single: `appt-visual-sprint-2292-checkout-single`, status `IN_SERVICE`, Corte, total R$ 30, sem receita, venda, auditoria de checkout, idempotencia `SUCCEEDED` ou comissao.
- Fixtures compostas de inspecao permanecem `IN_SERVICE` e sem efeitos de checkout.
- Checkout nao foi executado pelo Codex no banco visual durante o fechamento.

## Observacoes de fechamento

- Nenhum navegador foi aberto automaticamente.
- Nenhum booking publico foi iniciado.
- O servidor local da porta 3333 foi encerrado antes das validacoes e nao foi reiniciado ao final.
- A validacao visual humana foi aprovada: 7 produtos no checkout, Corte + Barba + Pomada, total R$ 75, Pomada 10 -> 9, zero comissao e catalogo completo pela API.
## Ajuste definitivo sem comissao

Atualizado em 2026-07-04: comissao fica fora da operacao real da Barbearia Geovane Borges. Seeds e provisionamento final nao devem recriar regra de 40% para `pro-01`; regras tecnicas continuam disponiveis apenas quando um teste habilita explicitamente esse cenario. Financeiro, equipe, servicos, configuracoes, relatorios e navegacao nao devem apresentar controle operacional de comissoes na jornada do Geovane.

## Correcao final do catalogo de produtos no checkout

Atualizado em 2026-07-04: o banco visual `barbearia_visual_test_2292_20260704_001335` tinha somente `prd-pomada` em `Product`, por isso o modal de checkout mostrava apenas Pomada. A API e o frontend foram auditados: o modal monta as opcoes a partir de `Object.values(productsById)`, alimentado por `/catalog` e `/inventory`; nao havia limite 1, filtro fixo de Pomada, busca antiga ou categoria aplicada indevidamente.

Catalogo oficial completo aplicado para `unit-01`: Gel R$ 10 estoque 30; Pomada R$ 25 estoque 9; Bucha Nudread R$ 25 estoque 3; Oleo para Barba R$ 35 estoque 4; Shampoo R$ 25 estoque 10; Condicionador R$ 25 estoque 10; Mascara de Hidratacao R$ 30 estoque 10. A Pomada preservou a venda ja realizada, ficando em estoque 9, e teve o custo normalizado para R$ 7,50. Bucha Nudread permanece produto, nao servico.

O provisionamento permanente em `scripts/provision-canonicals-local.ts` foi ajustado para reutilizar produto canonico existente por nome/unidade antes de criar um novo registro, evitando duplicidade como `prd-pomada` + `canon-prd-pomada`. Produtos ja existentes tem dados operacionais normalizados sem sobrescrever o estoque movimentado; produtos ausentes recebem o estoque inicial oficial. O endpoint de catalogo agora expoe para venda/checkout somente produtos da unidade correta, ativos e com estoque positivo; estoque zerado continua visivel no inventario como `OUT_OF_STOCK`, mas nao entra na selecao de checkout.

Validacao visual preservada: receita final de R$ 75 em `FinancialEntry`, venda de 1 Pomada em `ProductSale`, atendimento concluido `7837af35-3e0b-45c7-9797-75c9179fd32d` com status `COMPLETED`, zero comissao, sem novo checkout executado pelo Codex.
