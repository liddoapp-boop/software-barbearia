# 204 - Validacao test DB isolado

Data: 2026-06-18

Escopo: Fase 2.3.1 - validar `npm run test:db` em banco PostgreSQL isolado confirmado, sem tocar o banco operacional.

## 1. Resumo executivo

A fase criou e validou um banco PostgreSQL isolado para execucao de `npm run test:db`.

Resultado: **APROVADO**.

O comando `npm run test:db` passou contra o banco `barbearia_test_fase_231`, separado do banco operacional `barbearia`, com nome contendo marcador explicito `test`.

Nao houve deploy, restart PM2, firewall, certificado, seed, alteracao do `.env` de producao, alteracao manual de dados do banco operacional, `git add`, commit ou push. Nenhuma URL completa, senha, token, hash, chave privada ou backup SQL foi impresso.

## 2. Baseline antes da fase

| Validacao | Resultado |
| --- | --- |
| `git status --short` | limpo |
| `git status -sb` | `main...origin/main` |
| `git log --oneline -10` | HEAD em `72510ad fix: corrigir escala de comissao e cancelamento em devolucao` |
| Health publico | `{"ok":true,"authEnforced":true}` |
| PM2 | `software-barbearia` online |
| PostgreSQL | ativo |

Confirmacoes:

- Git limpo no inicio.
- Branch local alinhada com `origin/main`.
- HEAD no commit esperado da Fase 2.3.
- Health publico OK.
- PostgreSQL ativo.

## 3. Diagnostico de `test:db`

Script:

- `package.json`: `test:db` executa `cross-env RUN_DB_TESTS=1 DATA_BACKEND=prisma vitest run tests/db.integration.spec.ts`.
- `prisma/schema.prisma`: usa `env("DATABASE_URL")`.
- `tests/db.integration.spec.ts`: exige `RUN_DB_TESTS=1` e `DATABASE_URL`; recusa alguns padroes obvios de producao.

Suite DB:

- cria sua propria massa com IDs de teste (`unit-db-*`, `svc-db-*`, `pro-db-*`, `cli-db-*`, `prd-db-*`, `usr-db-*`);
- nao depende de `prisma/seed.ts`;
- nao executa limpeza global destrutiva;
- por isso exige banco isolado e descartavel/recorrente de teste.

Diagnostico seguro da `.env`:

- `DATABASE_URL` existe.
- Host: `127.0.0.1`.
- Porta: `5432`.
- Banco: `barbearia`.
- Usuario: mascarado no log operacional.
- O banco padrao da `.env` nao contem marcador `test`.

Conclusao: a `.env` aponta para o banco operacional `barbearia`; portanto `npm run test:db` nao foi executado com essa URL.

## 4. Banco isolado criado

Nao havia banco local com `test` no nome antes da fase.

Foi criado:

- Banco: `barbearia_test_fase_231`
- Owner: `barbearia`
- Host: `127.0.0.1`
- Porta: `5432`
- Marcador de teste no nome: sim

O banco operacional `barbearia` nao foi alterado.

## 5. Preparacao do schema

Primeira tentativa:

- Comando: `npx prisma migrate deploy`
- Alvo: `barbearia_test_fase_231`
- Resultado: falhou no banco de teste durante a migration `20260428_goals_performance_module`.
- Causa: erro de sintaxe no inicio do arquivo SQL por caractere BOM (`U+FEFF`) antes de `-- CreateTable`.

Decisao tecnica:

- Nao alterar migration historica nesta fase.
- Recriar apenas o banco de teste.
- Preparar o schema via `npx prisma db push --skip-generate`, comando adequado para banco isolado/descartavel de teste.

Resultado:

- `prisma db push --skip-generate`: passou.
- Prisma confirmou datasource `barbearia_test_fase_231`, schema `public`, em `127.0.0.1:5432`.

## 6. Resultado de `npm run test:db`

Executado com `DATABASE_URL` temporaria apontando para `barbearia_test_fase_231`.

Resultado:

| Comando | Resultado |
| --- | --- |
| `npm run test:db` | passou: 1 arquivo; 14 testes |

Cobertura relevante exercitada:

- normalizacao Prisma de `defaultCommissionRate`;
- rejeicao de percentual invalido;
- login persistente Prisma;
- tenant guard Prisma;
- agendamento, checkout e receita;
- pagamento de comissao concorrente sem duplicar despesa;
- replay/refund idempotente;
- cancelamento de comissao de produto pendente em devolucao total;
- preservacao de comissao de produto ja paga;
- relatorios gerenciais e CSV com dados reais do Prisma.

## 7. Validacoes complementares

| Validacao | Resultado |
| --- | --- |
| `npm run build` | passou |
| `npm run test` | passou: 6 arquivos, 1 skipped; 91 testes, 14 skipped |
| `npm audit` | 0 vulnerabilidades |
| `npm audit --omit=dev` | 0 vulnerabilidades |
| `git diff --check` | passou |
| Health publico | `{"ok":true,"authEnforced":true}` |

## 8. Manutencao do banco de teste

Decisao: manter o banco `barbearia_test_fase_231` como ambiente local recorrente para validacoes DB.

Justificativa:

- evita reusar o banco operacional `barbearia`;
- deixa um alvo explicito com marcador `test`;
- permite reexecutar `npm run test:db` sem criar massa no banco operacional.

Cuidados:

- nenhuma senha foi gravada em arquivo versionado;
- `.env` de producao nao foi alterado;
- qualquer execucao futura deve continuar sobrescrevendo `DATABASE_URL` temporariamente para o banco de teste;
- se o banco for removido no futuro, remover apenas `barbearia_test_fase_231`, nunca `barbearia`.

## 9. Riscos residuais

### P0

Nenhum P0 confirmado.

### P1

Nenhum P1 funcional confirmado apos `test:db`, build, suite geral, audits, diff check e health publico.

### P2

1. `prisma migrate deploy` em banco vazio falhou por BOM em migration historica (`20260428_goals_performance_module`). O teste DB foi validado com `prisma db push`, mas uma fase futura deve decidir se corrige a migration historica com avaliacao de checksum/ambientes ja migrados.
2. Devolucao parcial segue sem recalculo proporcional de comissao; a regra atual cancela apenas quando a venda fica totalmente devolvida.
3. Comissao de produto ja paga em venda devolvida continua preservada como `PAID`; tratamento financeiro de estorno deve ser definido em fase propria se necessario.

Atualizacao 2026-06-18:

- A Fase 2.3.3 confirmou tecnicamente o BOM UTF-8 no arquivo `prisma/migrations/20260428_goals_performance_module/migration.sql`.
- `prisma migrate deploy` foi reproduzido em banco isolado temporario e falhou novamente nessa migration.
- O banco operacional possui uma tentativa historica com checksum do arquivo com BOM marcada como rolled back e uma aplicacao finalizada com checksum do conteudo sem BOM.
- A decisao formal foi nao alterar a migration nesta fase e recomendar saneamento controlado em fase propria.
- Registro completo: `.planning/205_DIAGNOSTICO_BOM_MIGRATION_HISTORICA.md`.

Atualizacao 2026-06-18 - Fase 2.3.4:

- O BOM inicial foi removido da migration historica `20260428_goals_performance_module`.
- O checksum final do arquivo passou a ser `cfbacf969dc090577a6168c47290c6e9012c43ff794164fac15a0fb46b410e63`.
- `npx prisma migrate deploy` passou em banco isolado vazio `barbearia_test_migrate_bom_fixed`.
- `npm run test:db` tambem passou contra esse banco isolado com `NODE_ENV=test`.
- O banco temporario `barbearia_test_migrate_bom_fixed` foi removido.
- Registro completo: `.planning/206_SANEAMENTO_BOM_MIGRATION_HISTORICA.md`.

### P3

1. Expor na UI a informacao de comissao cancelada por devolucao.
2. Criar relatorio de reconciliacao por venda ligando venda, refund, estoque, financeiro, comissao e auditoria.

## 10. Decisao final

**APROVADO.**

Criterios atendidos:

- banco isolado criado;
- nome do banco contem `test`;
- banco isolado e diferente de `barbearia`;
- `npm run test:db` rodou contra o banco isolado;
- `npm run test:db` passou;
- build, suite geral, audits, diff check e health publico passaram;
- nenhum segredo foi exposto;
- documentacao criada.

Proxima etapa recomendada:

- revisar seletivamente apenas os documentos desta fase e, se aprovado pelo operador, commitar a documentacao da Fase 2.3.1.
