# Macro 235.1 - Ensaio seguro do banco e preparacao dos dados do piloto

Data: 2026-07-08

## Decisao

APROVADO COM RESSALVAS.

O ensaio comprovou backup, restore, baseline controlado, aplicacao das migrations faltantes, validacao objetiva de `AppointmentBlock`, testes, smokes e recuperacao em bancos temporarios locais.

Ressalvas obrigatorias antes do ambiente-alvo:

- O banco principal local `barbearia` nao possui `_prisma_migrations`; `prisma migrate deploy` direto falha com `P3005`.
- A execucao controlada precisa incluir baseline explicito das 19 migrations ja presentes fisicamente antes do deploy.
- Os dados minimos do piloto ainda exigem correcao/confirmacao: unidade aparece como `Unidade Teste`, nao ha registro local com `Barbearia Geovane Borges`, e o vinculo formal `UserUnitAccess` para owner/unit precisa revisao.
- Nenhuma limpeza foi executada.

## Estado inicial

- Branch: `main`
- HEAD inicial: `527d1e5fe07f906a01e4c1e038794534be506c94`
- Ahead/behind: `0 0`
- Worktree inicial: limpo
- Node: `v24.14.1`
- npm: `11.11.0`
- Prisma CLI/client: `6.19.3`
- PostgreSQL tools: `18.3`
- `pg_dump`: `C:\Program Files\PostgreSQL\18\bin\pg_dump.exe`
- `pg_restore`: `C:\Program Files\PostgreSQL\18\bin\pg_restore.exe`
- `psql`: `C:\Program Files\PostgreSQL\18\bin\psql.exe`
- Host/porta: `localhost:5432`
- Usuario tecnico: mascarado

## Bancos locais

Bancos relevantes:

- `barbearia`: 17 MB, 43 tabelas, sem `_prisma_migrations`, sem `AppointmentBlock`.
- `barbearia_test`: 43 MB, 49 tabelas, `_prisma_migrations` com 22 linhas, `AppointmentBlock` presente.

Contagens iniciais de `barbearia`:

| Entidade | Contagem |
| --- | ---: |
| Client | 315 |
| Appointment | 99 |
| ProductSale | 111 |
| FinancialEntry | 327 |
| Product | 311 |
| StockMovement | 215 |
| AuditLog | 573 |
| User | 92 |
| Service | 332 |
| Professional | 306 |
| Unit | 326 |
| AppointmentBlock | ausente |
| _prisma_migrations | ausente |

## Inventario das migrations

Total: 21 migrations em `prisma/migrations`.

Migration mais recente:

- `20260706_operational_hours_and_zero_buffer`

Migration responsavel por `AppointmentBlock`:

- `20260706_macro_233_owner_operations`

Essa migration cria:

- enum `AppointmentBlockStatus`
- enum `CheckoutStatus`
- enum `CheckoutPaymentMethod`
- enum `CheckoutPaymentStatus`
- enum `StockInventoryCountStatus`
- enum `DailyClosingStatus`
- tabela `AppointmentBlock`
- tabela `AppointmentCheckout`
- tabela `CheckoutPayment`
- tabela `StockInventoryCount`
- tabela `DailyClosing`

Para `AppointmentBlock`, o SQL cria:

- PK: `AppointmentBlock_pkey`
- FK `unitId` para `Unit(id)` com delete restrict/update cascade
- FK `professionalId` para `Professional(id)` com delete set null/update cascade
- indices:
  - `AppointmentBlock_unitId_idempotencyKey_key`
  - `AppointmentBlock_unitId_startsAt_idx`
  - `AppointmentBlock_unitId_status_startsAt_idx`
  - `AppointmentBlock_professionalId_startsAt_idx`

Risco principal: o banco local principal tem schema fisico parcialmente avancado, mas nao tem historico Prisma. Por isso `migrate deploy` direto nao e seguro sem baseline.

## Status Prisma

`barbearia`:

- `npx prisma migrate status` encontrou 21 migrations pendentes no historico.
- Motivo: tabela `_prisma_migrations` ausente.
- Diagnostico fisico: estruturas ate 20260703 e o default operacional ja existem; estruturas da Macro 233 nao existem.

`barbearia_test`:

- `npx prisma migrate status`: schema em dia.
- `AppointmentBlock`: presente.

## Backup

Backup logico completo do banco `barbearia`:

- Arquivo: `C:\Projetos\backups-local\software-barbearia\235_1\barbearia_before_235_1_20260708_015848.dump`
- Formato: custom (`pg_dump --format=custom`)
- Tamanho: 499430 bytes
- SHA-256: `E46D820629BB2A9C6CECC8B5292BF6B65D7D8670C44624C741313983E0BD512E`
- Checksum repetido: igual
- Duracao: 485 ms
- Tabelas de origem: 43
- `pg_restore --list`: OK, 317 linhas de catalogo, 306 entradas TOC, schema e dados presentes.

O dump esta fora do repositorio e nao foi versionado.

## Restore e clone

Banco temporario de ensaio:

- `barbearia_rehearsal_235_1_20260708_015921`

Restore:

- Origem: dump pre-migration
- Duracao: 1034 ms
- Exit code: 0
- Warnings/erros: nenhum
- Tabelas restauradas: 43

Contagens pre-migration do clone bateram com `barbearia`:

| Entidade | Origem | Clone | Diferenca |
| --- | ---: | ---: | ---: |
| Client | 315 | 315 | 0 |
| Appointment | 99 | 99 | 0 |
| ProductSale | 111 | 111 | 0 |
| FinancialEntry | 327 | 327 | 0 |
| Product | 311 | 311 | 0 |
| StockMovement | 215 | 215 | 0 |
| AuditLog | 573 | 573 | 0 |
| User | 92 | 92 | 0 |
| Service | 332 | 332 | 0 |
| Professional | 306 | 306 | 0 |
| Unit | 326 | 326 | 0 |

## Aplicacao das migrations no clone

Primeira tentativa:

- Comando: `npx prisma migrate deploy`
- Banco: `barbearia_rehearsal_235_1_20260708_015921`
- Resultado: falhou com `P3005`
- Motivo: banco nao vazio e sem `_prisma_migrations`
- Duracao: 3558 ms

Ensaio seguro com baseline:

- Baseline controlado no clone: 19 migrations marcadas como aplicadas, de `20260422_init` ate `20260703_commission_per_appointment_service_item`.
- Em seguida: `npx prisma migrate deploy`
- Migrations aplicadas pelo deploy:
  - `20260706_macro_233_owner_operations`
  - `20260706_operational_hours_and_zero_buffer`
- Duracao do deploy: 3421 ms
- `npx prisma migrate status`: schema em dia.

Contagens apos migration e antes dos smokes:

| Entidade | Contagem |
| --- | ---: |
| Client | 315 |
| Appointment | 99 |
| ProductSale | 111 |
| FinancialEntry | 327 |
| Product | 311 |
| StockMovement | 215 |
| AuditLog | 573 |
| User | 92 |
| Service | 332 |
| Professional | 306 |
| Unit | 326 |
| AppointmentBlock | 0 |
| AppointmentCheckout | 0 |
| CheckoutPayment | 0 |
| StockInventoryCount | 0 |
| DailyClosing | 0 |
| _prisma_migrations | 21 |

## Validacao de AppointmentBlock

Tabela: presente.

Colunas:

- `id text not null`
- `unitId text not null`
- `professionalId text null`
- `startsAt timestamp not null`
- `endsAt timestamp not null`
- `isFullDay boolean not null default false`
- `reason text not null`
- `status AppointmentBlockStatus not null default ACTIVE`
- `cancelledAt timestamp null`
- `cancelledBy text null`
- `cancelReason text null`
- `createdBy text not null`
- `idempotencyKey text null`
- `createdAt timestamp not null default current_timestamp`
- `updatedAt timestamp not null`

Constraints e indices:

- PK: `AppointmentBlock_pkey`
- FKs:
  - `AppointmentBlock_unitId_fkey`
  - `AppointmentBlock_professionalId_fkey`
- Indices:
  - `AppointmentBlock_unitId_idempotencyKey_key`
  - `AppointmentBlock_unitId_startsAt_idx`
  - `AppointmentBlock_unitId_status_startsAt_idx`
  - `AppointmentBlock_professionalId_startsAt_idx`
- Enum: `ACTIVE,CANCELLED`

Validacao funcional:

- Criacao de bloqueio controlado: OK
- Replay idempotente: mesmo ID retornado
- Agendamento dentro do bloqueio: rejeitado com status 400
- Cancelamento de bloqueio: status `CANCELLED`

## Testes

Ambiente de teste DB:

- Clone adicional: `barbearia_rehearsal_235_1_test_20260708_020311`
- Criado a partir de dump pos-migration do clone principal.
- Dump pos-migration: `C:\Projetos\backups-local\software-barbearia\235_1\barbearia_rehearsal_235_1_20260708_015921_post_migration_20260708_020311.dump`
- SHA-256: `A462A08530C6060E905AEFE0E1FD3098F25D5CBE0CC58CEE3E5D7B579E964E86`
- Restore: 874 ms, 49 tabelas.

Resultados:

- `npm test`: 22 arquivos passed, 1 skipped; 275 testes passed, 38 skipped.
- `npm run test:db`: 1 arquivo passed; 38 testes passed; migrations em dia no clone de teste.
- `npx tsc --noEmit`: passou.
- `npm run build`: passou.
- `git diff --check`: passou.

Ressalva: `test:db` foi executado com `PRISMA_CLIENT_ENGINE_TYPE=binary` por lock conhecido do DLL do Prisma no Windows. A configuracao foi temporaria e nao foi persistida.

## Smokes

Banco utilizado:

- `barbearia_rehearsal_235_1_20260708_015921`

Servidor:

- Local temporario em `127.0.0.1:3335`
- `DATA_BACKEND=prisma`
- `AUTH_ENFORCED=true`
- Nenhum `.env` alterado.

Readonly:

- Health: OK
- Pagina publica: OK
- Protecao sem token: OK
- Login owner: OK
- Agenda: OK
- Clientes: OK
- Catalogo/PDV: OK
- Financeiro: OK
- Servicos: OK
- Auditoria owner-only: OK
- Configuracoes: OK
- Relatorios gerenciais: OK

Mutavel:

- Agendamento: `22a35659-07c4-4198-8848-ce8e529a414d`
- Venda: `ff21498e-9fb6-4de4-b7e9-c3165be628cf`
- Refund: `15a322bd-87fc-4f51-871c-f1fe3fb702a3`
- Resultado: OK

Bloqueio controlado:

- Block: `b70993a9-bd92-420c-9872-ebdd24702178`
- Replay: mesmo ID
- Conflito de agenda: HTTP 400 esperado
- Cancelamento: `CANCELLED`

## Integridade pos-smoke

Contagens do clone apos smokes:

| Entidade | Antes | Depois | Diferenca esperada |
| --- | ---: | ---: | ---: |
| Client | 315 | 315 | 0 |
| Appointment | 99 | 100 | +1 smoke |
| ProductSale | 111 | 112 | +1 smoke |
| FinancialEntry | 327 | 330 | +3 smoke |
| Product | 311 | 311 | 0 |
| StockMovement | 215 | 217 | +2 venda/refund |
| AuditLog | 573 | 579 | +6 smoke/bloqueio |
| User | 92 | 92 | 0 |
| Service | 332 | 332 | 0 |
| Professional | 306 | 306 | 0 |
| Unit | 326 | 326 | 0 |
| AppointmentBlock | 0 | 1 | +1 validacao |
| AppointmentCheckout | 0 | 1 | +1 checkout |
| CheckoutPayment | 0 | 1 | +1 pagamento |

Financeiro:

- Origem `barbearia`: `18025.00`
- Clone pos-smoke: `18095.00`
- Diferenca: `+70.00`, esperada pelo smoke mutavel.

Estoque:

- Origem `barbearia`: `374`
- Clone pos-smoke: `374`
- Diferenca: `0`, venda e refund compensaram.

Nao houve reducao inesperada de contagens.

## Inventario de dados de teste

Referencia local encontrada:

- `.planning/evidence/234_4/test-data-inventory.json`

Padroes buscados:

- `TESTE`
- `VALIDACAO`
- `VALIDAÇÃO`
- `MACRO`
- `SEED`
- `DEMO`
- `SMOKE`
- `CONTROLADO`

Suspeitos encontrados no clone:

| Entidade | Quantidade |
| --- | ---: |
| Client | 3 |
| Appointment | 1 |
| ProductSale | 1 |
| CheckoutPayment | 1 |
| FinancialEntry | 3 |
| Product | 0 |
| StockMovement | 0 |
| Service | 0 |
| AppointmentBlock | 1 |
| User | 0 |
| AuditLog | 5 |

Dry-run de limpeza:

Categoria A - seguro para remover no clone, apos revisao dos IDs controlados:

- Registros criados pelo smoke mutavel e pela validacao 235.1:
  - Appointment: 1
  - ProductSale: 1
  - CheckoutPayment: 1
  - FinancialEntry: 3
  - AppointmentBlock: 1
  - AuditLog relacionado: revisar/remover apenas se a politica permitir limpar auditoria de teste.

Categoria B - exige revisao humana:

- `cli-01`: possui 5 appointments e 5 lancamentos financeiros.
- Registro manual de reteste `manual-232a-delay-retest-20260710-1100-client`: possui 1 appointment.
- Cliente suspeito sem dependencias: revisar origem antes de remover.

Categoria C - nao remover:

- Usuarios, servicos, produtos, profissionais, unidades e configuracoes sem comprovacao de origem de teste.
- Qualquer movimento financeiro/estoque sem cadeia de teste totalmente identificada.

Ordem segura proposta, sem executar:

1. Exportar IDs aprovados.
2. Validar dependencias por entidade.
3. Em transacao, selecionar os registros por ID.
4. Remover dependentes controlados na ordem: pagamentos/checkout, financeiro, estoque/refund/vendas, agendamentos, bloqueios, clientes sem dependencias.
5. Preservar ou arquivar auditoria conforme decisao operacional.
6. Comparar contagens e somatorios.
7. Rollback se qualquer contagem nao esperada mudar.

Exemplo conceitual, NAO EXECUTAR:

```sql
BEGIN;
-- NAO EXECUTAR: substituir por IDs aprovados manualmente.
SELECT * FROM "Appointment" WHERE "id" IN ('ID_CONTROLADO');
-- DELETE somente depois de aprovacao humana e backup verificado.
ROLLBACK;
```

## Dados minimos do piloto

| Item | Status | Observacao |
| --- | --- | --- |
| Estabelecimento `Barbearia Geovane Borges` | AUSENTE | Nao encontrado no banco local restaurado. |
| Unidade `unit-01` | INCONSISTENTE | Nome atual: `Unidade Teste`. |
| Usuario owner | PRESENTE | Login owner funcionou no smoke; nao registrar email/senha. |
| Vinculo formal owner/unidade | PRECISA DE CONFIRMACAO | `UserUnitAccess` owner/unit nao apareceu na consulta normalizada. |
| Profissional Geovane | PRESENTE | 1 profissional ativo com nome Geovane. |
| Vinculo profissional/unidade | PRESENTE | Profissional ativo ligado a `unit-01`. |
| Horarios de funcionamento | PRESENTE | 7 registros. |
| Servicos reais | PRECISA DE CONFIRMACAO | 6 ativos, todos com preco/duracao, mas base ainda tem muitos dados de teste. |
| Formas de pagamento | PRESENTE | 4 ativas. |
| Produtos reais | PRECISA DE CONFIRMACAO | 7 ativos com estoque/minimo, mas origem real precisa validacao humana. |
| Estoque inicial/minimo | PRESENTE | Campos preenchidos nos produtos ativos. |
| Preferencias operacionais | PRESENTE | `BusinessSettings` existe para `unit-01`. |
| Politicas de cancelamento | PRECISA DE CONFIRMACAO | Nao validado como dado operacional final. |
| Timezone | PRESENTE | `America/Sao_Paulo`. |
| Dados publicos do booking | PRECISA DE CONFIRMACAO | Campos existem, mas marca/local ainda nao batem com Geovane. |

## Recuperacao

Validacoes realizadas:

1. Backup pre-migration de `barbearia` restaurado em clone temporario.
2. Backup pos-migration do clone restaurado em segundo clone temporario com `test` no nome.

Resultados:

- Restore 1: 1034 ms, 43 tabelas, OK.
- Restore 2: 874 ms, 49 tabelas, OK.
- Checksums gerados e registrados.
- Procedimento repetivel em ambiente local.

Limitacao:

- Os bancos temporarios foram mantidos para auditoria local. Eles nao substituem backup externo nem snapshot do ambiente-alvo.

## Achados

P0:

- Nenhum.

P1:

- `migrate deploy` direto falha em banco restaurado sem `_prisma_migrations` (`P3005`). Plano: baseline controlado das 19 migrations fisicamente presentes e deploy das migrations faltantes.
- Dados minimos do piloto nao estao prontos: nome da unidade/marca e dados publicos do booking precisam ajuste/confirmacao.
- Limpeza automatica nao e segura sem aprovacao humana: ha registros suspeitos com dependencias financeiras/agendamentos.

P2:

- Smokes imprimem credencial local padrao de teste no console; nao foi persistida em documento versionavel.
- Consultas PowerShell com aspas exigiram repeticao por stdin; sem impacto no banco.

## Runbook para ambiente-alvo

NAO EXECUTAR automaticamente.

Pre-condicoes:

1. Confirmar janela de manutencao.
2. Confirmar banco-alvo por host, porta e nome, sem expor senha.
3. Bloquear gravacoes da aplicacao.
4. Confirmar que nao ha jobs/background escrevendo no banco.
5. Capturar HEAD do codigo e versoes de ferramentas.

Backup:

```bash
pg_dump --format=custom --host <HOST> --port <PORT> --username <USER> --dbname <DB_ALVO> --file <CAMINHO_SEGURO>/before_235_2.dump
sha256sum <CAMINHO_SEGURO>/before_235_2.dump
pg_restore --list <CAMINHO_SEGURO>/before_235_2.dump
```

Diagnostico:

```bash
DATABASE_URL="<URL_ALVO_SEM_LOGAR>" npx prisma migrate status
```

Se `_prisma_migrations` estiver ausente, nao executar deploy direto. Primeiro validar fisicamente quais migrations ja existem. Para o caso ensaiado:

```bash
# Executar somente apos aprovacao humana e backup verificado.
DATABASE_URL="<URL_ALVO>" npx prisma migrate resolve --applied 20260422_init
# Repetir para as 19 migrations fisicamente presentes ate 20260703_commission_per_appointment_service_item.
```

Deploy:

```bash
DATABASE_URL="<URL_ALVO>" npx prisma migrate deploy
DATABASE_URL="<URL_ALVO>" npx prisma migrate status
```

Validacao objetiva:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'AppointmentBlock'
ORDER BY ordinal_position;
```

Aplicacao:

1. Iniciar aplicacao.
2. Rodar smoke readonly local/controlado.
3. Rodar smoke mutavel com prefixo de validacao aprovado.
4. Validar financeiro.
5. Validar estoque.
6. Validar auditoria.
7. Validar booking publico.

Limpeza:

1. Nao limpar antes de aprovacao humana.
2. Gerar dry-run por IDs.
3. Fazer novo backup antes de qualquer delete.
4. Executar em transacao.
5. Comparar contagens e somatorios.
6. Rollback se houver divergencia.

Rollback:

1. Parar aplicacao.
2. Restaurar backup validado em banco novo ou restaurar snapshot conforme politica.
3. Apontar aplicacao para banco restaurado somente apos validacao.
4. Registrar incidente e evidencias.

Comunicacao:

1. Informar inicio da janela.
2. Informar fim da migration.
3. Informar resultado dos smokes.
4. Liberar uso somente apos aceite operacional.

## Arquivos e artefatos

Criado no repositorio:

- `.planning/235_1_ENSAIO_BANCO_PILOTO.md`

Criados fora do repositorio:

- Dump pre-migration.
- Lista `pg_restore --list`.
- Dump pos-migration do clone.

Nao houve commit nem push.
