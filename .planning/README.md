# Planejamento

Este diretorio e a memoria operacional do projeto Software Barbearia. Use este README como ponto de entrada antes de abrir documentos especificos.

## Status do README
- Atualizado em: 2026-05-04.
- Estado: pronto como indice e resumo executivo da pasta `.planning`.
- Fonte de verdade para proximas tarefas: [24_NEXT_PRIORITIES.md](./24_NEXT_PRIORITIES.md).
- Checklist de validacao manual/producao controlada: [92_VALIDACAO_MANUAL_PRODUCAO_CONTROLADA.md](./92_VALIDACAO_MANUAL_PRODUCAO_CONTROLADA.md).

## Decisao estrategica vigente
O produto foi reorganizado em quatro blocos para simplificar onboarding, uso diario e venda:
1. Operacao
2. Gestao
3. Administracao
4. Avancado

Regra de ouro: se a navegacao parecer cheia ou confusa, a arquitetura deve ser revista antes de adicionar novos modulos no menu principal.

## Gate atual antes de IA/WhatsApp
Nao implementar IA/WhatsApp mutante antes de concluir e validar os fluxos operacionais criticos.

Estado atual:
- Idempotencia obrigatoria em rotas criticas implementada e validada.
- Checkout unificado de atendimento implementado.
- Devolucoes/estornos rastreaveis implementados.
- Financeiro profissional com lancamentos automaticos protegidos e reversoes rastreaveis implementado.
- Auditoria persistente append-only implementada.
- Auditoria transacional para fluxos financeiros criticos implementada no backend Prisma.
- Historico operacional de vendas de produto implementado.
- Tenant guard aprofundado em rotas de produto/estoque/venda/devolucao implementado.
- Checklist de validacao manual e producao controlada criado, ainda pendente de execucao completa.

Referencia oficial do gate:
- [50_AUDITORIA_PRE_IA_WHATSAPP.md](./50_AUDITORIA_PRE_IA_WHATSAPP.md)
- [79_ROADMAP_PROFISSIONALIZACAO.md](./79_ROADMAP_PROFISSIONALIZACAO.md)
- [92_VALIDACAO_MANUAL_PRODUCAO_CONTROLADA.md](./92_VALIDACAO_MANUAL_PRODUCAO_CONTROLADA.md)

## Documentos ativos principais

### Execucao e proximas prioridades
- [24_NEXT_PRIORITIES.md](./24_NEXT_PRIORITIES.md)
- [23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md](./23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md)
- [92_VALIDACAO_MANUAL_PRODUCAO_CONTROLADA.md](./92_VALIDACAO_MANUAL_PRODUCAO_CONTROLADA.md)

### Auditorias, riscos e roadmap
- [50_AUDITORIA_PRE_IA_WHATSAPP.md](./50_AUDITORIA_PRE_IA_WHATSAPP.md)
- [70_AUDITORIA_CAIXA_PRETA.md](./70_AUDITORIA_CAIXA_PRETA.md)
- [78_RISCOS_CRITICOS_ATUAIS.md](./78_RISCOS_CRITICOS_ATUAIS.md)
- [79_ROADMAP_PROFISSIONALIZACAO.md](./79_ROADMAP_PROFISSIONALIZACAO.md)
- [81_AUDITORIA_POS_IDEMPOTENCIA.md](./81_AUDITORIA_POS_IDEMPOTENCIA.md)

### Fluxos, dados e rastreabilidade
- [51_CHECKOUT_UNIFICADO.md](./51_CHECKOUT_UNIFICADO.md)
- [71_MODELO_DE_DADOS_E_IDS.md](./71_MODELO_DE_DADOS_E_IDS.md)
- [72_RASTREABILIDADE_DOS_FLUXOS.md](./72_RASTREABILIDADE_DOS_FLUXOS.md)
- [73_POLITICA_ESTOQUE.md](./73_POLITICA_ESTOQUE.md)
- [74_POLITICA_FINANCEIRA.md](./74_POLITICA_FINANCEIRA.md)
- [75_DEVOLUCOES_E_ESTORNOS.md](./75_DEVOLUCOES_E_ESTORNOS.md)
- [76_AUDITORIA_E_LOGS.md](./76_AUDITORIA_E_LOGS.md)
- [77_PERMISSOES_E_SEGURANCA.md](./77_PERMISSOES_E_SEGURANCA.md)

### Implementacoes recentes
- [80_IMPLEMENTACAO_IDEMPOTENCIA_E_CONSTRAINTS.md](./80_IMPLEMENTACAO_IDEMPOTENCIA_E_CONSTRAINTS.md)
- [82_IDEMPOTENCIA_OBRIGATORIA.md](./82_IDEMPOTENCIA_OBRIGATORIA.md)
- [83_FINANCEIRO_AUDITORIA_PLANO.md](./83_FINANCEIRO_AUDITORIA_PLANO.md)
- [84_COMISSAO_DESPESA_RECONCILIAVEL.md](./84_COMISSAO_DESPESA_RECONCILIAVEL.md)
- [85_ESTORNOS_DEVOLUCOES_RASTREAVEIS.md](./85_ESTORNOS_DEVOLUCOES_RASTREAVEIS.md)
- [86_AUDITORIA_PERSISTENTE_APPEND_ONLY.md](./86_AUDITORIA_PERSISTENTE_APPEND_ONLY.md)
- [87_VALIDACAO_POSTGRES_ROBUSTEZ.md](./87_VALIDACAO_POSTGRES_ROBUSTEZ.md)
- [88_USUARIOS_PERSISTENTES_PERMISSOES.md](./88_USUARIOS_PERSISTENTES_PERMISSOES.md)
- [89_FRONTEND_FLUXOS_CRITICOS.md](./89_FRONTEND_FLUXOS_CRITICOS.md)
- [90_TENANT_GUARD_HISTORICO_VENDAS.md](./90_TENANT_GUARD_HISTORICO_VENDAS.md)
- [91_OUTBOX_AUDITORIA_TRANSACIONAL.md](./91_OUTBOX_AUDITORIA_TRANSACIONAL.md)

### UX/UI e produto
- [48_REORGANIZACAO_MENUS_E_PRODUTO.md](./48_REORGANIZACAO_MENUS_E_PRODUTO.md)
- [60_UI_UX_REFACTOR.md](./60_UI_UX_REFACTOR.md)

## Documentos base e historicos
Os documentos `01` a `22` registram a visao inicial, arquitetura, modulo a modulo, endpoints, entidades, permissoes, testes e observabilidade.

Eles ainda sao uteis para contexto, mas podem estar desatualizados diante das fases `80` a `92`. Para decisao atual, priorize:
- documentos mais recentes;
- implementation log;
- next priorities;
- checklist de validacao manual.

## Estado tecnico resumido
- Backend suporta `DATA_BACKEND=memory` para desenvolvimento rapido e `DATA_BACKEND=prisma` para validacao robusta.
- Rotas criticas exigem `idempotencyKey`.
- Fluxos financeiros automaticos devem ser revertidos por estorno/devolucao, nao por edicao/destruicao direta.
- Auditoria deve preservar actor, role, rota, metodo, requestId, idempotencyKey e metadados relevantes.
- Em Prisma, fluxos financeiros criticos gravam auditoria dentro da mesma transacao de negocio.
- A SPA ainda usa `unit-01` como baseline operacional; seguranca real deve vir do backend/token.

## Proxima acao recomendada
Executar a validacao manual do documento [92_VALIDACAO_MANUAL_PRODUCAO_CONTROLADA.md](./92_VALIDACAO_MANUAL_PRODUCAO_CONTROLADA.md) em ambiente controlado com:
- `AUTH_ENFORCED=true`;
- `DATA_BACKEND=prisma`;
- PostgreSQL real;
- usuarios persistentes;
- evidencias de sucesso/falha por fluxo.

Somente depois disso decidir entre:
- producao controlada;
- refinamento mobile/UX;
- CRUD operacional de usuarios/equipe;
- vinculo formal `User -> Professional`;
- retomada do plano de IA/WhatsApp.
