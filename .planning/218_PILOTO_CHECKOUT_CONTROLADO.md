# Fase 218 - Piloto checkout controlado

Data da execucao: 2026-06-21 UTC
Ambiente: producao controlada em `https://barbearia.76-13-161-250.nip.io`
Decisao final: `APROVADO COM RESSALVAS`

## Escopo

Executar um piloto controlado de agendamento publico com profissional explicito, atendimento, checkout, financeiro, comissao, auditoria, smoke antes/depois e logs, usando somente dados de teste.

## Dados de teste

- Cliente: `CLIENTE TESTE CHECKOUT CONTROLADO - FASE 218`
- Telefone: `00000021800`
- Servico: `Barba Terapia`
- Profissional esperado: `Geovane Borges`
- Profissional gravado: `Geovane Borges`
- Unidade: `unit-01`
- Agendamento: `6543a83a-f2d1-45a0-996f-59cadabb0a25`
- Cliente criado/reutilizado: `cd25db0e-99ad-4171-9f10-7474c6f5caf9`
- Profissional gravado: `pro-01`
- Servico gravado: `svc-barba`
- Horario agendado: `2026-06-22T12:00:00.000Z`
- Pagamento de teste: `TESTE_CONTROLADO_INTERNO`

## Baseline

Comandos executados:

```bash
git status -sb
git status --short
git log --oneline -8
curl -sS https://barbearia.76-13-161-250.nip.io/health
npm run smoke:api:readonly
pm2 logs software-barbearia --lines 80 --nostream
```

Resultados:

- Git inicial: limpo e alinhado com `origin/main`.
- Ultimo commit inicial: `e553aa5 docs: registrar piloto owner agenda com profissional explicito`.
- Health inicial: `{"ok":true,"authEnforced":true}`.
- Smoke readonly inicial: passou.
- Logs iniciais: sem crash, sem loop, sem erro Prisma critico e sem 500 repetido. Houve `401` esperado no teste de dashboard sem token.

## Fluxo executado

1. Login owner via `/auth/login`.
2. Consulta de catalogo via `/catalog`.
3. Consulta de slots publicos via `/public/slots` com `serviceId=svc-barba` e `professionalId=pro-01`.
4. Criacao do agendamento via `/public/booking`.
5. Validacao de detalhe via `/appointments/:id`.
6. Validacao da Agenda owner via `/agenda/range`.
7. Validacao de ausencia de financeiro antes do checkout.
8. Confirmacao via `/appointments/:id/status`.
9. Inicio via `/appointments/:id/status`.
10. Checkout via `/appointments/:id/checkout`.
11. Validacao financeira via `/financial/transactions`.
12. Validacao de comissao via `/financial/commissions` e `/commissions/statement`.
13. Validacao de auditoria via `/audit/events`.
14. Estorno seguro do atendimento de teste via `/appointments/:id/refund`.
15. Smoke e logs finais.

## Validacoes do agendamento

- Agendamento criado: sim.
- ID capturado: `6543a83a-f2d1-45a0-996f-59cadabb0a25`.
- Apareceu exatamente uma vez na Agenda owner: sim.
- Profissional gravado: `Geovane Borges`.
- Status inicial: `SCHEDULED`.
- Financeiro antes do checkout: nenhum lancamento relacionado ao agendamento.

Status percorridos:

```text
SCHEDULED -> CONFIRMED -> IN_SERVICE -> COMPLETED
```

## Checkout e financeiro

Checkout executado: sim.

Receita gerada:

- Lancamento: `91e19abd-deb2-45bc-af3f-8ae54682c987`
- Tipo: `INCOME`
- Fonte: `SERVICE`
- Categoria: `SERVICO`
- Descricao: `Receita de servico: Barba Terapia`
- Valor: `55`
- Metodo: `TESTE_CONTROLADO_INTERNO`
- Agendamento: `6543a83a-f2d1-45a0-996f-59cadabb0a25`
- Profissional: `pro-01` / `Geovane Borges`
- Cliente: `cd25db0e-99ad-4171-9f10-7474c6f5caf9`
- Data do lancamento: `2026-06-21T00:22:02.072Z`

Conclusoes:

- Financeiro do checkout foi gerado uma unica vez.
- Nao houve duplicidade de receita de servico para o agendamento.
- Valor do servico validado: `55`.
- Origem do lancamento validada: `SERVICE`.
- Profissional vinculado corretamente: `Geovane Borges`.

## Comissao

Comissao gerada:

- Lancamento: `058c3d9c-3c0a-4364-8ad7-29e95df646ac`
- Profissional: `pro-01` / `Geovane Borges`
- Agendamento: `6543a83a-f2d1-45a0-996f-59cadabb0a25`
- Base: `55`
- Taxa: `40%`
- Valor: `22`
- Status: `PENDING`
- Fonte: `SERVICE`
- Criacao: `2026-06-21T00:22:02.125Z`

Conclusoes:

- Comissao foi ligada ao profissional correto.
- Comissao foi gerada uma unica vez para o atendimento.
- Valor calculado: `22`.

## Auditoria

Eventos encontrados:

- `APPOINTMENT_STATUS_UPDATED` para `CONFIRMED`: `7785fe24-273e-44f2-82c3-bff89df70b91`
- `APPOINTMENT_STATUS_UPDATED` para `IN_SERVICE`: `8dfd8c54-2939-4e8b-bac4-a6a4918c27af`
- `APPOINTMENT_CHECKOUT_COMPLETED`: `535f8887-cfc4-4f4a-9e68-87693d9001a7`
- `APPOINTMENT_REFUNDED`: `b19b607c-870d-4149-b391-780270d3f49f`

Conclusao: a acao critica de checkout foi registrada em auditoria.

## Compensacao

Endpoint seguro usado: `/appointments/:id/refund`.

Estorno aplicado:

- Refund: `b8172ee1-e217-4379-8b38-6aa0baa2b1bb`
- Lancamento financeiro: `2bf735cc-3d18-4383-b10f-65d180bfb829`
- Tipo: `EXPENSE`
- Fonte: `REFUND`
- Categoria: `ESTORNO_SERVICO`
- Valor: `55`
- Profissional: `pro-01` / `Geovane Borges`
- Cliente: `cd25db0e-99ad-4171-9f10-7474c6f5caf9`
- Data: `2026-06-21T00:22:45.964Z`

Ressalva:

- O estorno financeiro foi gerado corretamente e auditado.
- A comissao de servico do atendimento permaneceu `PENDING` apos o estorno.
- Nao foi identificado endpoint seguro para cancelar essa comissao sem alteracao manual no banco.
- Nenhuma alteracao manual em banco foi feita.

## Smoke e logs finais

Comandos executados:

```bash
curl -sS https://barbearia.76-13-161-250.nip.io/health
npm run smoke:api:readonly
pm2 logs software-barbearia --lines 120 --nostream
```

Resultados:

- Health final: `{"ok":true,"authEnforced":true}`.
- Smoke readonly final: passou.
- Logs finais: sem crash, sem loop, sem erro Prisma critico e sem 500 repetido.
- O `401` observado em `/dashboard` sem token e esperado pelo smoke readonly.

## Bugs e pendencias

P0/P1:

- Nenhum bug P0/P1 confirmado no fluxo principal de agendamento, checkout, financeiro, comissao e auditoria.

P2/P3:

- Avaliar regra de negocio do estorno de atendimento: o refund de servico cria despesa e auditoria, mas nao cancela automaticamente a comissao `PENDING` associada ao atendimento estornado.

## Garantias de escopo

Nao houve:

- migration;
- seed;
- alteracao de `.env`;
- impressao de segredo;
- deploy;
- restart de PM2;
- alteracao manual em banco;
- uso de cliente real;
- venda real de produto;
- devolucao real de produto;
- force push;
- rebase;
- `git reset --hard`.

## Decisao final

`APROVADO COM RESSALVAS`

Motivo: o piloto de checkout controlado passou de ponta a ponta, com profissional correto, financeiro unico, comissao correta e auditoria critica. A ressalva e restrita ao comportamento de compensacao: o estorno financeiro do atendimento nao cancelou a comissao pendente associada.

## Proxima etapa recomendada

Criar fase pequena para definir e implementar a politica de comissao em estornos de atendimento:

- se o atendimento estornado deve cancelar comissao pendente;
- se deve criar auditoria propria de cancelamento de comissao;
- se deve bloquear pagamento de comissao vinculada a atendimento estornado;
- se deve existir endpoint seguro especifico para regularizacao operacional.
