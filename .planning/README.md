# Planejamento

Este diretório preserva a memória operacional do Software Barbearia. Documentos antigos continuam úteis como histórico, mas não devem ser interpretados isoladamente como estado atual.

## Estado atual

- Atualizado em: 2026-07-13.
- Macro atual: `246.5 - Fechamento local definitivo e RC.3`.
- Decisão: **APROVADO COM RESSALVAS COMO RC LOCAL**.
- Produção real: **não executada**.
- HEAD aprovado: `93557ed369ee07e97941a81211c8219b909da7ba`.
- `v1.0.0-rc.1` foi bloqueada por dois P1, corrigidos pela Macro 245.1: RBAC de estorno de atendimento e `updateProfessional` Prisma.
- Banco piloto: resetado e validado no estado canônico pós-login.
- Gate final local: aprovado, incluindo validação técnica e manual.
- RC.3: WhatsApp textual funcional; Gemini opcional; áudio local experimental e desligado por padrão. O áudio não faz parte do aceite funcional.

Fonte de verdade para retomada:

1. [244_3_MANIFESTO_ENTREGA_LOCAL.md](./244_3_MANIFESTO_ENTREGA_LOCAL.md)
2. [HANDOFF.json](./HANDOFF.json)
3. [.continue-here.md](./.continue-here.md)
4. [README principal](../README.md)
5. [WhatsApp e IA](../WHATSAPP_IA.md)
6. [Manifesto de entrega local](./244_3_MANIFESTO_ENTREGA_LOCAL.md)
7. [Fechamento RC.3](../docs/MACRO_246_5_RC3_CLOSURE.md)
8. [Revisão do worktree RC.3](../docs/MACRO_246_5_WORKTREE_REVIEW.md)

## Estado canônico local

- 0 clientes, agendamentos, vendas, financeiros e checkouts.
- 6 produtos ativos e estoque total 73.
- 5 serviços ativos.
- Owner e profissional Geovane ativos.
- `TeamMember=1` após a primeira carga autenticada de configurações; é o owner canônico de equipe, não dado residual.
- Backend health HTTP 200.
- Login, dashboard, agenda, financeiro, estoque e menu validados manualmente.

Detalhes do reset: [244_2A_RESET_OFICIAL_GEOVANE_PILOT.md](./244_2A_RESET_OFICIAL_GEOVANE_PILOT.md).

## Documentos recentes ativos

### Entrega, banco e financeiro

- [244_3_MANIFESTO_ENTREGA_LOCAL.md](./244_3_MANIFESTO_ENTREGA_LOCAL.md)
- [244_2A_RESET_OFICIAL_GEOVANE_PILOT.md](./244_2A_RESET_OFICIAL_GEOVANE_PILOT.md)
- [244_2C_FINANCEIRO_PRODUTO_QUANTIDADE.md](./244_2C_FINANCEIRO_PRODUTO_QUANTIDADE.md)
- [238_MODO_LOCAL_PILOTO.md](./238_MODO_LOCAL_PILOTO.md)
- [235_2_PACOTE_FUTURA_VPS.md](./235_2_PACOTE_FUTURA_VPS.md)

### WhatsApp e IA

- [242_ATENDENTE_IA_WHATSAPP_FIRST.md](./242_ATENDENTE_IA_WHATSAPP_FIRST.md)
- [243_3_5_IDENTIDADE_LID_AUDIO_CANCELAMENTO_SEGURO.md](./243_3_5_IDENTIDADE_LID_AUDIO_CANCELAMENTO_SEGURO.md)
- [244_1B_CONFIRMAR_CONTROLADO_VENDA_WHATSAPP.md](./244_1B_CONFIRMAR_CONTROLADO_VENDA_WHATSAPP.md)
- [244_1C_3_DATA_HORARIO_NATURAL_WHATSAPP.md](./244_1C_3_DATA_HORARIO_NATURAL_WHATSAPP.md)

## Pendência principal

O fluxo real de venda por WhatsApp com `CONFIRMAR` foi aprovado. O fluxo real de agendamento com `CONFIRMAR <codigo>` ainda precisa ser validado quando existir uma sessão autenticada capaz de enviar pelo owner final mascarado `452`. Parser, data, horário, áudio simulado e prévia estão cobertos; a pendência é operacional. Áudio local segue experimental, desligado por padrão e fora do aceite funcional RC.3.

## Ressalvas do RC local

- Não há rate limiting HTTP global.
- O compose local da Evolution ainda usa imagens `latest`.
- A CSP ainda contém `unsafe-inline`.
- A validação visual humana não foi repetida na auditoria RC.2.

## Próxima etapa

Planejar a VPS apenas em nova macro e com autorização explícita. A aprovação local não autoriza provisionamento, deploy, migration remota, restore, configuração de Evolution ou qualquer escrita em ambiente externo. O projeto permanece congelado até VPS, TCC ou correção P0/P1 autorizada.

Antes de liberar um alvo futuro, seguir [235_2_PACOTE_FUTURA_VPS.md](./235_2_PACOTE_FUTURA_VPS.md) e exigir `.env` próprio, backup externo, restore testado, migrations conferidas, processo gerenciado, proxy, TLS, firewall, health, smoke readonly e aceite visual.

## Histórico

Os documentos das fases anteriores registram decisões válidas em seu contexto, inclusive estados como “piloto bloqueado” ou “pronto para piloto”. Essas classificações foram superadas pelo reset e pelo gate final da Macro 244.2. Para decisões atuais, prevalecem o manifesto 244.3 e os handoffs atualizados.
