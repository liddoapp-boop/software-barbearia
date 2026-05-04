# 11 - Servicos

## 1. Visao geral do modulo
Catalogo de servicos com preco, duracao, custo, comissao padrao e profissionais habilitados.

## 2. O que ja esta implementado (baseado no codigo)
- CRUD completo: `GET/POST/PATCH/DELETE /services`, `PATCH /services/:id/status`.
- Sumario e detalhe: `/services/summary`, `/services/:id`.
- Vinculo com consumo de estoque por servico (`/services/:id/stock-consumption`).
- UI rica com filtros, detalhe, ativacao/inativacao e duplicacao.

## 3. O que esta incompleto
- Sem governanca de versao de preco (historico de mudanca formal).
- Sem workflow de aprovacao para alteracoes sensiveis de margem/comissao.

## 4. Problemas identificados
- Erro de encoding visivel em trecho de string no frontend (`servicos.js`), indicando risco de padrao inconsistente.
- Duplicacao de logica visual entre desktop/mobile no modulo.

## 5. Dependencias com outros modulos
- Agenda, atendimento, comissoes, estoque, metas e performance.

## 6. Impacto no fluxo principal
Servico define duracao, receita e custo do atendimento. Qualquer ajuste incorreto impacta todo o funil.
