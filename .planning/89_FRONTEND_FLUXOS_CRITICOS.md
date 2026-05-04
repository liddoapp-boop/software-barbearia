# 89 - Frontend operacional dos fluxos criticos

Data: 2026-05-03
Fase: 0.4
Status: IMPLEMENTADA

## Objetivo da fase
Criar uma camada frontend operacional para fluxos criticos ja existentes no backend, sem trocar stack, sem recriar a SPA estatica e sem alterar regras de negocio principais.

## Telas/areas alteradas
- Menu e shell: novo modulo `Auditoria` owner-only e remocao visual de financeiro para `recepcao`.
- Agenda/Central de agendamentos: acao de estorno em atendimentos `COMPLETED`.
- PDV de produtos: acao de devolucao em vendas recentes da sessao.
- Financeiro: extrato com origem mais rastreavel por `source`, `referenceType`, `referenceId`, `professionalId`, categoria, descricao e observacoes.
- Comissoes: status visual de comissao paga/pendente e acao owner-only para pagar comissao.

## Fluxos frontend implementados
1. Auditoria operacional:
- Consome `GET /audit/events?unitId=unit-01`.
- Lista eventos em ordem recebida do backend, que ja retorna `createdAt desc`.
- Exibe data/hora, ator, role, action, entity, entityId, rota/metodo, requestId, idempotencyKey e blocos recolhiveis para before/after/metadata.
- Filtros: entity, action, actorId, inicio, fim e limit.
- Mensagem amigavel para erro `403`.

2. Estorno de atendimento:
- Botao `Estornar atendimento` aparece apenas para appointment `COMPLETED`.
- Modal exige motivo e data do estorno, com padrao agora.
- Envia `POST /appointments/:id/refund`.
- Recarrega agenda/financeiro apos sucesso.

3. Devolucao de produto:
- Vendas recentes do PDV ganharam botao `Devolver produto`.
- Modal lista os itens da venda e permite informar quantidade por item.
- Bloqueia envio sem quantidade positiva, quantidade menor que zero e quantidade acima da venda registrada na interface.
- Envia `POST /sales/products/:id/refund`.
- Recarrega catalogo/estoque/financeiro apos sucesso.

4. Comissoes:
- Listagem passa a usar `GET /financial/commissions` para obter `status`.
- Comissoes `PAID` mostram status claro; se `financialEntryId` vier no payload, ele e exibido. Se nao vier, a UI informa que a referencia financeira nao veio nesse payload.
- Acao de pagar comissao permanece enviando `idempotencyKey`.

## Endpoints consumidos
- `GET /audit/events`
- `POST /appointments/:id/refund`
- `POST /sales/products/:id/refund`
- `GET /financial/transactions`
- `GET /financial/commissions`
- `PATCH /financial/commissions/:id/pay`

## IdempotencyKey
- Estorno de atendimento: `buildOperationIdempotencyKey("appointment-refund")`.
- Devolucao de produto: `buildOperationIdempotencyKey("product-refund")`.
- Pagamento de comissao: `buildOperationIdempotencyKey("commission-pay")`.
- Checkout segue com `buildOperationIdempotencyKey("appointment-checkout")`.
- A chave e enviada no body, mantendo compatibilidade com o contrato atual do backend.

## Permissoes visuais por role
- `owner`: ve Auditoria, Financeiro, Comissoes e Configuracoes.
- `recepcao`: ve operacao, agenda, clientes, servicos, estoque e dashboard; nao ve Auditoria, Financeiro, Comissoes ou Configuracoes.
- `profissional`: ve Agenda e Dashboard; nao ve Auditoria, Financeiro, Comissoes, Configuracoes ou pagar comissao.

Observacao: isto e UX. A seguranca real continua no backend.

## Mobile
- Auditoria renderiza em cards/lista, sem tabela larga obrigatoria.
- Modais de estorno/devolucao usam layout `items-end` no mobile e inputs com altura minima de toque.
- Acoes novas usam botoes de pelo menos 40/44px.

## Limitacoes reais
- A lista de vendas recentes do PDV e local a sessao atual; nao foi criado historico completo de vendas antigas.
- Devolucao de produto pela UI usa os itens conhecidos da venda recem-registrada; a API continua sendo a fonte de verdade para excesso de devolucao.
- A tela de Auditoria filtra `actorId`; busca por email livre nao existe no backend atual.
- A auditoria persistente ainda nao e transacional/outbox, conforme limite da Fase 0.2.3.
- O seletor visual de role nao troca a sessao autenticada real; ele valida UX de menu/acoes.

## Comandos executados
- `Get-Content -Raw ...` para leitura dos planning docs e arquivos solicitados.
- `rg --files public/modules public/components public/styles src/http tests scripts`
- `rg -n ...` para confirmar contratos e pontos de integracao.
- `Get-Content -Raw public/app.js | node --input-type=module --check`: passou.
- `Get-Content -Raw public/modules/auditoria.js | node --input-type=module --check`: passou.
- `Get-Content -Raw public/modules/comissoes.js | node --input-type=module --check`: passou.
- `npm.cmd run test`: falhou no sandbox por `spawn EPERM` do Vitest/Vite; passou fora do sandbox (`59 passed | 10 skipped`).
- `npm.cmd run build`: passou.
- `npm.cmd run smoke:api`: falhou no sandbox por verificacao/download de engine Prisma; passou fora do sandbox.
- `npm.cmd run test:db`: falhou no sandbox por `spawn EPERM` do Vitest/Vite; passou fora do sandbox (`10 passed`).

## Validacao manual recomendada
- Nao executada em navegador nesta rodada; os fluxos abaixo ficaram documentados para smoke manual por nao haver teste automatizado de browser nesta SPA estatica.
- Abrir Auditoria como owner.
- Trocar role visual para recepcao/profissional e confirmar menu oculto.
- Estornar atendimento concluido.
- Devolver produto vendido no PDV.
- Verificar Financeiro/Estoque apos as acoes.

## Proxima etapa recomendada
Hardening de produto/estoque por path e revisao futura de historico operacional de vendas para permitir devolucao de vendas antigas pela UI.
