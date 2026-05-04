# Auditoria Pre IA/WhatsApp

Data: 2026-04-29  
Escopo: validacao do fluxo manual ponta a ponta antes de automacao IA/WhatsApp.

## Resumo executivo
- Resultado geral: **NAO pronto para conectar IA/WhatsApp**.
- Motivo: o core operacional funciona (agenda, conclusao, financeiro/estoque/comissao), mas ainda existem lacunas P0 em integracao de fluxo (principalmente fechamento de atendimento + venda de produto no mesmo fluxo) e CRUDs essenciais incompletos.
- Evidencia de estabilidade: `npm test` executado com sucesso em 2026-04-29, com **39 testes passando** (`tests/api.spec.ts`, `tests/engine.spec.ts`, `tests/db.integration.spec.ts`).

## Matriz de auditoria
| Item analisado | Status | Evidencia no codigo | Arquivos relacionados | Impacto no produto | Prioridade | Recomendacao CTO |
|---|---|---|---|---|---|---|
| Agenda: criar agendamento | pronto | Endpoint `POST /appointments` + testes de criacao e conflito | `src/http/app.ts`, `tests/api.spec.ts` | Fluxo base operacional disponivel | P0 | Manter como ponto de entrada unico da operacao |
| Agenda: confirmar/iniciar/finalizar | pronto | `PATCH /appointments/:id/status` (CONFIRMED/IN_SERVICE) e `POST /appointments/:id/complete` cobertos em testes | `src/http/app.ts`, `src/application/*operations-service.ts`, `tests/api.spec.ts` | Atendimento manual ponta a ponta funciona | P0 | Preservar regra de transicao valida de status |
| Agenda: remarcar/cancelar/no-show | parcial | Remarcar: `PATCH /appointments/:id/reschedule` com teste; cancelar/no-show via `PATCH /appointments/:id/status` com estados permitidos | `src/http/app.ts`, `public/app.js`, `tests/api.spec.ts` | Funciona tecnicamente, mas sem teste dedicado para todos os cenarios de cancel/no-show com efeitos financeiros | P0 | Adicionar casos de teste explicitos de cancelamento/no-show e impactos esperados |
| Fechamento automatico: status concluido + receita + comissao + historico + consumo estoque | pronto | `complete()` grava `financialEntry`, `commissionEntry`, `appointment.history`, `stockMovement` e decrementa estoque | `src/application/operations-service.ts`, `src/application/prisma-operations-service.ts`, `tests/api.spec.ts` | Base consistente para automacao posterior | P0 | Manter como transacao atomica e idempotente |
| Fechamento com produtos vendidos no mesmo fluxo do atendimento | faltando | Fechamento recebe apenas `changedBy/completedAt`; venda de produto existe separada em `/sales/products` | `src/http/app.ts`, `src/application/*operations-service.ts` | Recepcao precisa operar em duas etapas; maior friccao e risco de divergencia | P0 | Criar fechamento composto (servico + itens de produto + pagamentos) em uma unica operacao |
| PDV: venda isolada de produto | pronto | `POST /sales/products` com impacto em receita/estoque/comissao e testes | `src/http/app.ts`, `tests/api.spec.ts`, `public/modules/pdv.js` | PDV operacional | P0 | Manter validacao de estoque antes do commit |
| PDV integrado ao atendimento | faltando | Nao existe endpoint/contrato unico para fechar atendimento com itens de produto | `src/http/app.ts`, `public/app.js` | Sem unificacao de ticket e fechamento unico | P0 | Introduzir contrato de "closing" unificado |
| CRUD clientes | parcial | Existe `GET /clients` e `POST /clients`; sem `PATCH/DELETE` de cliente | `src/http/app.ts`, `tests/api.spec.ts` | Base de CRM incompleta para saneamento de cadastro | P0 | Implementar update/archive de cliente com regras de seguranca |
| CRUD servicos | pronto | `GET/POST/PATCH/DELETE /services` + status + resumo com testes | `src/http/app.ts`, `tests/api.spec.ts` | Dominio de servicos maduro | P1 | Apenas reforcar testes de regressao |
| CRUD produtos/estoque | pronto | `GET/POST/PATCH/DELETE /inventory` + `PATCH /inventory/:id/stock` + movimentos manuais | `src/http/app.ts`, `tests/api.spec.ts` | Operacao de estoque consistente | P0 | Manter trilha de movimentacoes obrigatoria |
| CRUD profissionais | faltando | Existe visao de performance (`/professionals/performance`), mas nao CRUD de profissional no modulo principal | `src/http/app.ts`, `tests/api.spec.ts` | Dificulta onboarding/offboarding operacional | P0 | Implementar CRUD de profissionais (ou explicitar fonte unica externa) |
| CRUD metodos de pagamento | parcial | `GET/POST/PATCH /settings/payment-methods`; sem exclusao dedicada | `src/http/app.ts`, `tests/api.spec.ts` | Governanca razoavel, mas sem ciclo completo de manutencao | P1 | Adicionar archive/delete com regra de metodo padrao |
| Financeiro como fonte de verdade | parcial | Servico concluido e venda de produto entram no financeiro; lancamento manual e despesa tambem; comissao fica em modulo proprio e pagamento de comissao nao gera despesa explicita no financeiro | `src/http/app.ts`, `src/application/*operations-service.ts`, `tests/api.spec.ts` | Possivel diferenca entre caixa e obrigacoes de comissao | P0 | Definir politica contabil (provisao/pagamento de comissao como despesa financeira) |
| Estoque integrado | pronto | Venda baixa estoque, ajuste manual funciona, bloqueio de saldo negativo e registro de movimentacoes | `src/domain/rules.ts`, `src/http/app.ts`, `tests/api.spec.ts` | Controle de estoque confiavel | P0 | Sem ajustes criticos imediatos |
| Comissoes | pronto | Geracao por atendimento/venda, status `PENDING/PAID/CANCELED`, endpoint de pagamento e extrato | `src/application/*operations-service.ts`, `src/http/app.ts`, `tests/api.spec.ts` | Regra de incentivo operacional ativa | P1 | Garantir politica de conciliacao com financeiro |
| Historico do cliente (ultima visita/LTV/ticket/frequencia) | parcial | Metricas de clientes 360 existem; faltas/recorrencia dependem de interpretacao indireta (dias sem retorno/risco), sem contrato explicito de "faltas" por cliente | `src/application/*operations-service.ts`, `public/modules/clientes.js`, `tests/api.spec.ts` | Boa visao analitica, mas incompleta para automacao de relacionamento por regra objetiva | P1 | Expor campos diretos de faltas e recorrencia no payload de clientes |
| Estados de erro/vazio | parcial | Existem mensagens e fallback; ha `placeholderSection` e mensagem de modulo indisponivel para central de agendamentos | `public/app.js`, `public/index.html`, `public/modules/*.js` | UX pode confundir usuario em falhas/parcialidades | P2 | Padronizar estados vazios e remover placeholders genericos em modulos criticos |
| Permissoes por perfil (Dono/Profissional/Recepcao) | parcial | RBAC em backend por rota + filtro de menu no frontend; porem faltam testes de autorizacao por perfil para todos modulos operacionais | `src/http/security.ts`, `src/http/app.ts`, `public/components/menu-config.js`, `tests/api.spec.ts` | Risco de brecha funcional em mudancas futuras | P0 | Criar matriz de autorizacao testada por papel e por endpoint |

## Classificacao final solicitada
1. Pronto
- Agenda (criar/confirmar/iniciar/finalizar)
- Fechamento automatico base (status, receita, comissao, historico, consumo de estoque)
- PDV isolado
- CRUD de servicos
- CRUD de produtos/estoque
- Estoque integrado
- Comissoes (geracao e pagamento)

2. Parcialmente pronto
- Agenda para cancel/no-show (sem cobertura completa de cenarios de negocio)
- CRUD de clientes
- CRUD de metodos de pagamento
- Financeiro como fonte unica (gap de tratamento contabil de comissao)
- Historico do cliente (faltas/recorrencia explicitas)
- Estados de erro/vazio
- Permissoes por perfil (boa base, cobertura de testes incompleta)

3. Faltando
- Fechamento unificado de atendimento com venda de produto no mesmo fluxo
- CRUD completo de profissionais

4. Quebrado
- Nao foi identificado item estruturalmente quebrado na suite atual (39 testes passando).  
- Risco principal e de **incompletude de fluxo**, nao de falha tecnica imediata.

5. Proxima implementacao recomendada
- Implementar **Fechamento Unificado** (atendimento + itens de produto + pagamento + efeitos em financeiro/estoque/comissao em transacao unica).

6. Preparado para IA/WhatsApp?
- **Nao, ainda nao.**
- Antes da IA/WhatsApp, fechar os P0 desta auditoria para garantir previsibilidade operacional e evitar automacao sobre fluxo manual incompleto.
