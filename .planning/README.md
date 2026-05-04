# Planejamento

## Documentos ativos
- [82_IDEMPOTENCIA_OBRIGATORIA.md](./82_IDEMPOTENCIA_OBRIGATORIA.md)
- [81_AUDITORIA_POS_IDEMPOTENCIA.md](./81_AUDITORIA_POS_IDEMPOTENCIA.md)
- [80_IMPLEMENTACAO_IDEMPOTENCIA_E_CONSTRAINTS.md](./80_IMPLEMENTACAO_IDEMPOTENCIA_E_CONSTRAINTS.md)
- [79_ROADMAP_PROFISSIONALIZACAO.md](./79_ROADMAP_PROFISSIONALIZACAO.md)
- [78_RISCOS_CRITICOS_ATUAIS.md](./78_RISCOS_CRITICOS_ATUAIS.md)
- [72_RASTREABILIDADE_DOS_FLUXOS.md](./72_RASTREABILIDADE_DOS_FLUXOS.md)
- [71_MODELO_DE_DADOS_E_IDS.md](./71_MODELO_DE_DADOS_E_IDS.md)
- [70_AUDITORIA_CAIXA_PRETA.md](./70_AUDITORIA_CAIXA_PRETA.md)
- [50_AUDITORIA_PRE_IA_WHATSAPP.md](./50_AUDITORIA_PRE_IA_WHATSAPP.md)
- [51_CHECKOUT_UNIFICADO.md](./51_CHECKOUT_UNIFICADO.md)
- [24_NEXT_PRIORITIES.md](./24_NEXT_PRIORITIES.md)
- [48_REORGANIZACAO_MENUS_E_PRODUTO.md](./48_REORGANIZACAO_MENUS_E_PRODUTO.md)
- [23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md](./23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md)
- [60_UI_UX_REFACTOR.md](./60_UI_UX_REFACTOR.md)

## Decisao estrategica vigente (2026-04-29)
O produto foi reorganizado em quatro blocos para simplificar onboarding e venda:
1. Operacao
2. Gestao
3. Administracao
4. Avancado

Regra de ouro: se a navegacao parecer cheia ou confusa, a arquitetura deve ser revista antes de adicionar novos modulos no menu principal.

## Gate pre IA/WhatsApp
A referencia oficial para decisao de readiness e o documento:
- [50_AUDITORIA_PRE_IA_WHATSAPP.md](./50_AUDITORIA_PRE_IA_WHATSAPP.md)

As prioridades de execucao estao em:
- [24_NEXT_PRIORITIES.md](./24_NEXT_PRIORITIES.md)

## Status atual do P0 principal
- Fase 0.1 de idempotencia e constraints implementada para checkout, venda de produto, financeiro manual e pagamento de comissao.
- Ressalvas da auditoria pos-idempotencia resolvidas em 2026-05-02: `idempotencyKey` obrigatoria nas rotas criticas, frontend gerando chave por tentativa, testes dedicados e `test:db` verde.
- Fechamento Unificado de Atendimento implementado e ativo na Agenda.
- Referencia tecnica detalhada:
- [82_IDEMPOTENCIA_OBRIGATORIA.md](./82_IDEMPOTENCIA_OBRIGATORIA.md)
- [81_AUDITORIA_POS_IDEMPOTENCIA.md](./81_AUDITORIA_POS_IDEMPOTENCIA.md)
- [80_IMPLEMENTACAO_IDEMPOTENCIA_E_CONSTRAINTS.md](./80_IMPLEMENTACAO_IDEMPOTENCIA_E_CONSTRAINTS.md)
- [51_CHECKOUT_UNIFICADO.md](./51_CHECKOUT_UNIFICADO.md)

## Gate atual antes de IA/WhatsApp
- Nao implementar IA/WhatsApp mutante antes de concluir devolucao/estorno, financeiro profissional, auditoria persistente e seguranca SaaS minima.
- Idempotencia de operacoes criticas esta obrigatoria nas rotas protegidas e validada com testes unitarios/API, smoke e PostgreSQL real.

## Atualizacao de maturidade (2026-04-29)
- A aba Financeiro agora exibe lista operacional real de entradas e saidas no periodo (alem dos cards de resumo).
- Registro tecnico no log:
- [23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md](./23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md)

## Atualizacao UX/UI SaaS (2026-04-29)
- Refatoracao visual orientada a simplicidade operacional aplicada em Agenda, Financeiro, Clientes e Estoque.
- Design system dark padronizado com componentes reutilizaveis (`Card`, `Button`, `Badge`, `Table`, `Modal`).
- Registro tecnico:
- [60_UI_UX_REFACTOR.md](./60_UI_UX_REFACTOR.md)
