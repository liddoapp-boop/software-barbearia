# Planejamento

Este diretório preserva a memória operacional do Software Barbearia. Documentos antigos continuam úteis como histórico, mas não devem ser interpretados isoladamente como estado atual.

## Estado atual

- Atualizado em: 2026-07-13.
- Macro atual: `244.3 - Documentação final e manifesto de entrega local`.
- Decisão: **PRONTO PARA DEPLOY FUTURO CONTROLADO**.
- Produção real: **não executada**.
- Baseline funcional anterior ao commit documental: `159159bccbfb3d2634b19fe287a583ca3d16a373`.
- Banco piloto: resetado e validado no estado canônico pós-login.
- Gate final local: aprovado, incluindo validação técnica e manual.

Fonte de verdade para retomada:

1. [244_3_MANIFESTO_ENTREGA_LOCAL.md](./244_3_MANIFESTO_ENTREGA_LOCAL.md)
2. [HANDOFF.json](./HANDOFF.json)
3. [.continue-here.md](./.continue-here.md)
4. [README principal](../README.md)
5. [WhatsApp e IA](../WHATSAPP_IA.md)

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

O fluxo real de venda por WhatsApp com `CONFIRMAR` foi aprovado. O fluxo real de agendamento com `CONFIRMAR <codigo>` ainda precisa ser validado quando existir uma sessão autenticada capaz de enviar pelo owner final mascarado `452`. Parser, data, horário, áudio simulado e prévia estão cobertos; a pendência é operacional.

## Próxima etapa

Planejar a VPS apenas em nova macro e com autorização explícita. A aprovação local não autoriza provisionamento, deploy, migration remota, restore, configuração de Evolution ou qualquer escrita em ambiente externo.

Antes de liberar um alvo futuro, seguir [235_2_PACOTE_FUTURA_VPS.md](./235_2_PACOTE_FUTURA_VPS.md) e exigir `.env` próprio, backup externo, restore testado, migrations conferidas, processo gerenciado, proxy, TLS, firewall, health, smoke readonly e aceite visual.

## Histórico

Os documentos das fases anteriores registram decisões válidas em seu contexto, inclusive estados como “piloto bloqueado” ou “pronto para piloto”. Essas classificações foram superadas pelo reset e pelo gate final da Macro 244.2. Para decisões atuais, prevalecem o manifesto 244.3 e os handoffs atualizados.
