# Sprint 228.1 + 228.2 - Complete, checkout, RBAC e Prisma local

## 1. Objetivo

Eliminar a ambiguidade entre conclusao simples e checkout financeiro, alinhar RBAC do checkout, validar o contrato em memory e Prisma/PostgreSQL local isolado, e registrar a comparacao tecnica sem tocar em producao.

## 2. Estado inicial

- Pasta: `C:\Projetos\software-barbearia`.
- Branch: `main`.
- Estado inicial: `main...origin/main`, limpo.
- HEAD inicial: `8b85613 docs: registrar validacao local do checkout`.
- Node: `v24.14.1`.
- npm: `11.11.0`.

## 3. Decisao sobre `/complete`

Decisao CTO: Opcao A. Checkout e o unico caminho oficial de conclusao de atendimento pago.

Antes da correcao, `POST /appointments/:id/complete` concluia atendimento, criava receita, comissao, auditoria e consumo de estoque, exigia `IN_SERVICE`, mas permitia uma rota paralela ao contrato de checkout e nao exigia metodo de pagamento/idempotencia do fluxo oficial.

Agora `POST /appointments/:id/complete` permanece apenas como rota legada bloqueada, retornando `410`, sem alterar status, financeiro ou comissoes.

## 4. Fluxo oficial de conclusao

O fluxo oficial e:

1. Agendamento chega a `IN_SERVICE`.
2. `POST /appointments/:id/checkout`.
3. Backend calcula o valor.
4. `expectedTotal` e somente conferencia.
5. Snapshot do servico e preferido.
6. Financeiro, comissao, estoque e auditoria sao produzidos pelo checkout.

Alteracao direta de status para `COMPLETED` a partir de `IN_SERVICE` continua bloqueada com mensagem explicita para usar checkout.

## 5. Decisao de RBAC do checkout

Checkout ficou restrito a `owner` e `recepcao`.

`profissional` pode operar atendimento, mas nao cobrar nem gerar receita/comissao propria. Essa e a decisao conservadora de menor privilegio ate existir um caso operacional formal para permitir cobranca pelo profissional.

## 6. Uso no frontend

Nao foi encontrada chamada frontend para `/complete`.

O frontend ja direcionava acoes `COMPLETE`/`PAYMENT` para o modal de checkout. A UI foi ajustada para exibir a acao de checkout em atendimentos `IN_SERVICE` somente quando `state.role` for `owner` ou `recepcao`. Para `profissional`, a acao de checkout fica oculta; o backend segue como barreira definitiva.

## 7. Estado do PostgreSQL local

Classificacao: `POSTGRES LOCAL DISPONIVEL`.

- `psql` nao esta no `PATH`.
- Cliente encontrado em `C:\Program Files\PostgreSQL\18\bin\psql.exe`.
- Servico `postgresql-x64-18` estava `Running`.
- Host validado: `localhost`.
- Porta validada: `5432`.

## 8. Banco isolado utilizado, sem segredo

Banco local descartavel criado/confirmado:

`barbearia_codex_test_20260702_1325`

Validacoes antes do Prisma:

- protocolo PostgreSQL;
- host `localhost`;
- nome do banco contendo `test`;
- `NODE_ENV=test`;
- `DATA_BACKEND=prisma`;
- `RUN_DB_TESTS=1`;
- senha nao impressa.

## 9. Migrations aplicadas no banco de teste

Executado:

```powershell
npx.cmd prisma migrate deploy --schema prisma/schema.prisma
npm.cmd run db:generate
npx.cmd prisma migrate status --schema prisma/schema.prisma
```

Resultado: 17 migrations aplicadas com sucesso e schema atualizado, incluindo `20260628_service_snapshot_appointments`.

## 10. Testes Prisma executados

Executado contra `barbearia_codex_test_20260702_1325`:

```powershell
npm.cmd run test:db
```

Resultado: `1 passed`, `21 passed`.

## 11. Comparacao memory vs Prisma

| Garantia | Memory | Prisma |
| --- | --- | --- |
| exige IN_SERVICE | Passou | Passou |
| preco pelo snapshot | Passou | Passou |
| expectedTotal conferido | Passou | Passou |
| status final | Passou | Passou |
| financeiro atomico | Passou com rollback em memoria | Passou em transacao |
| comissao atomica | Passou com rollback em memoria | Passou em transacao |
| estoque atomico | Passou com rollback em memoria | Passou em transacao |
| auditoria atomica | Passou com rollback em memoria | Passou em transacao |
| idempotencia | Passou | Passou |
| rollback em falha | Passou | Passou por transacao |
| complete sem bypass | Passou, rota 410 | Passou, rota 410 |
| RBAC | Passou | Passou |

## 12. Atomicidade

Memory ja tinha rollback para efeitos parciais do checkout. Prisma usa transacao no fluxo persistente. A suite validou que falhas controladas nao deixam status concluido, financeiro parcial, comissao parcial, estoque parcial ou auditoria orfa nos cenarios cobertos.

## 13. Idempotencia

Replay idempotente do checkout e refund segue sem duplicar efeitos. A suite Prisma tambem cobre concorrencia de checkout sem duplicar receita.

## 14. Financeiro

Somente checkout cria receita de atendimento no contrato HTTP oficial. `/complete` legado bloqueado nao cria `FinancialEntry`.

## 15. Comissao

Comissao e criada pelo checkout quando ha regra aplicavel. `/complete` bloqueado nao cria `CommissionEntry`. Profissional nao pode acionar checkout.

## 16. Auditoria

Checkout registra `APPOINTMENT_CHECKOUT_COMPLETED` em `appointment_checkout`. A rota legada bloqueada nao registra conclusao falsa de atendimento.

## 17. Refund

Refund permanece permitido somente apos checkout valido. A suite Prisma validou cancelamento de comissao pendente, idempotencia e rastreabilidade financeira/auditoria.

## 18. Bugs encontrados

1. `/complete` ainda era rota funcional paralela ao checkout.
2. RBAC permitia `profissional` no checkout.
3. A UI nao expressava claramente o checkout como acao de conclusao para `IN_SERVICE` com recorte por papel.

## 19. Correcoes feitas

1. `/complete` passou a retornar `410`.
2. Policy de `/appointments/:id/checkout` passou a aceitar apenas `owner` e `recepcao`.
3. Mensagem de bloqueio de status para `COMPLETED` passou a citar somente checkout.
4. Testes memory foram migrados para checkout oficial onde ainda usavam `/complete`.
5. Testes memory e Prisma cobrem `/complete` bloqueado.
6. Testes memory e Prisma cobrem `profissional` bloqueado no checkout.
7. Frontend mostra checkout para `owner`/`recepcao` e oculta para `profissional`.

## 20. Limitacoes

- Nao foi feito teste visual em navegador por restricao da sprint.
- O banco de teste local nao foi removido, para preservar evidencia e evitar operacao destrutiva.
- `psql` existe, mas nao esta no `PATH`.
- A primeira tentativa manual de `CREATE DATABASE` teve erro de aspas no PowerShell; a criacao foi repetida com SQL simples e confirmada.

## 21. Riscos P0/P1/P2/P3

- P0: nenhum encontrado nesta sprint.
- P1: nenhum encontrado apos testes memory e Prisma.
- P2: banco local de teste permanece criado e deve ser limpo manualmente quando nao for mais necessario.
- P3: `psql` fora do `PATH` aumenta atrito operacional em novas validacoes.

## 22. Opiniao CTO

Comecar e manter a conclusao financeira exclusivamente por checkout e a escolha correta. Duas rotas que concluem atendimento e geram financeiro criam risco operacional, auditoria ambigua e bugs de idempotencia. Profissional fora do checkout tambem e a decisao prudente ate existir desenho formal de caixa por profissional.

## 23. Decisao final

Ambiente e codigo: `PRONTO PARA TESTE LOCAL CONTROLADO`.

Checkout e o contrato oficial. `/complete` e legado bloqueado. Memory e Prisma obedecem ao mesmo contrato nos testes executados.

## 24. Proxima etapa recomendada

Rodar um teste visual manual no navegador local, com perfis `owner`, `recepcao` e `profissional`, confirmando que a UI mostra checkout apenas para quem pode cobrar e que o fluxo agenda -> atendimento -> checkout -> financeiro aparece corretamente.
