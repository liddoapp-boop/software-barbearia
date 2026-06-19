# 205 - Diagnostico BOM em migration historica

Data: 2026-06-18

Escopo: Fase 2.3.3 - diagnosticar e decidir formalmente sobre BOM em migration historica `20260428_goals_performance_module`, sem alterar migration nesta fase.

## 1. Resumo executivo

O BOM UTF-8 na migration `prisma/migrations/20260428_goals_performance_module/migration.sql` foi confirmado.

Resultado: **APROVADO**.

A falha de `prisma migrate deploy` em banco vazio foi reproduzida em banco isolado temporario `barbearia_test_migrate_bom`. O banco operacional `barbearia` nao foi alterado.

Decisao formal desta fase:

- nao alterar a migration historica nesta fase;
- manter o risco documentado como P2;
- recomendar uma fase propria para remover o BOM e validar `prisma migrate deploy` em banco vazio;
- manter `prisma db push --skip-generate` como procedimento aceitavel apenas para banco isolado de teste enquanto a migration historica nao for saneada.

## 2. Baseline

| Validacao | Resultado |
| --- | --- |
| `git status --short` | limpo |
| `git status -sb` | `main...origin/main` |
| `git log --oneline -10` | HEAD em `c2cf297 docs: registrar validacao test db isolada` |
| Health publico | `{"ok":true,"authEnforced":true}` |

Confirmacoes:

- Git limpo no inicio.
- Branch local alinhada com `origin/main`.
- Health publico OK.

## 3. Evidencia tecnica do BOM

Arquivo:

- `prisma/migrations/20260428_goals_performance_module/migration.sql`

Inspecao:

- `file`: `Unicode text, UTF-8 (with BOM) text`
- primeiros 16 bytes: `ef bb bf 2d 2d 20 43 72 65 61 74 65 54 61 62 6c`
- tamanho: `935` bytes
- `starts_with_utf8_bom`: `True`
- bytes de controle nos primeiros 256 bytes, excluindo tab/LF/CR: nenhum

Checksums calculados sem alterar arquivo:

| Conteudo | SHA-256 |
| --- | --- |
| arquivo atual, com BOM | `b28af79c7cd00baed50c9292c6ea94dfa11a28acbf3eb4196c261e061c971161` |
| conteudo equivalente sem BOM | `cfbacf969dc090577a6168c47290c6e9012c43ff794164fac15a0fb46b410e63` |

Conclusao: a causa da falha e o BOM UTF-8 no inicio do arquivo. O PostgreSQL recebe o caractere invisivel antes de `-- CreateTable` e falha com sintaxe invalida.

## 4. Reproducao em banco isolado

Banco temporario criado:

- `barbearia_test_migrate_bom`
- owner: `barbearia`
- nome contem marcador `test`
- separado do banco operacional `barbearia`

Comando executado de forma segura:

- `DATABASE_URL` temporaria apontando para `barbearia_test_migrate_bom`
- `npx prisma migrate deploy`
- URL completa nao foi impressa

Resultado:

- Prisma encontrou 16 migrations.
- Aplicou 9 migrations com sucesso.
- Falhou na migration `20260428_goals_performance_module`.
- Erro Prisma: `P3018`.
- Erro PostgreSQL: `42601`, `syntax error at or near "\uFEFF"`.
- `applied_steps_count` da migration falhada no banco temporario: `0`.
- Checksum gravado para a tentativa falhada: `b28af79c7cd00baed50c9292c6ea94dfa11a28acbf3eb4196c261e061c971161`.

O banco temporario `barbearia_test_migrate_bom` foi removido ao fim da reproducao.

## 5. Estado no banco operacional

Consulta somente leitura em `_prisma_migrations` do banco operacional `barbearia`.

Resultado para `20260428_goals_performance_module`:

| Estado | Checksum | finished_at | applied_steps_count | rolled_back_at |
| --- | --- | --- | --- | --- |
| tentativa falhada historica | `b28af79c7cd00baed50c9292c6ea94dfa11a28acbf3eb4196c261e061c971161` | vazio | `0` | preenchido |
| aplicacao finalizada | `cfbacf969dc090577a6168c47290c6e9012c43ff794164fac15a0fb46b410e63` | preenchido | `1` | vazio |

O banco operacional tem 16 migrations finalizadas.

Interpretacao:

- a migration ja foi aplicada no banco operacional;
- houve uma tentativa historica falhada com o arquivo contendo BOM;
- a aplicacao finalizada corresponde ao checksum do conteudo sem BOM;
- o arquivo atual do repositorio voltou/permaneceu com BOM e, portanto, nao corresponde ao checksum da aplicacao finalizada.

Nenhum dado operacional foi alterado.

## 6. Risco de alterar migration historica

Editar migration historica sempre tem risco de divergencia de historico. Neste caso, porem, a evidencia mostra uma particularidade importante:

- remover o BOM mudaria o checksum do arquivo de `b28af...` para `cfbacf...`;
- `cfbacf...` e exatamente o checksum da migration finalizada no banco operacional;
- portanto, remover o BOM tende a alinhar o repositorio com a aplicacao finalizada registrada no operacional;
- tambem tende a desbloquear `prisma migrate deploy` em banco vazio.

Mesmo assim, a alteracao deve ser feita em fase propria porque:

- e uma alteracao em migration historica;
- precisa de diff minimo e revisao explicita;
- precisa revalidar `prisma migrate deploy` em banco vazio;
- precisa confirmar que nenhum ambiente ainda depende do arquivo com BOM como estado final.

Sobre `prisma migrate deploy`:

- em producao, o comando aplica migrations pendentes;
- nao faz reset de banco e nao usa shadow database;
- a documentacao oficial do Prisma registra que ele nao detecta drift de schema em producao;
- Prisma Migrate usa `_prisma_migrations` e checksums para historico de migrations, portanto arquivo historico divergente segue sendo risco operacional para status, desenvolvimento e bootstrap.

## 7. Avaliacao das opcoes

### Opcao A - Nao alterar migration historica agora

Vantagens:

- menor risco nesta fase;
- respeita a restricao de nao alterar migration historica sem fase propria;
- nao impacta o banco operacional atual.

Desvantagens:

- banco vazio continua falhando em `prisma migrate deploy`;
- a inconsistencia entre arquivo atual e checksum finalizado continua documentada como P2.

Decisao: adotada nesta fase.

### Opcao B - Remover BOM da migration historica

Vantagens:

- deve corrigir o erro em banco vazio;
- deve alinhar o arquivo com o checksum finalizado no banco operacional;
- remove o risco P2 na origem.

Desvantagens:

- altera migration historica;
- exige fase propria, validacao em banco vazio e commit especifico.

Decisao: recomendada para proxima fase pequena, nao executada agora.

### Opcao C - Procedimento alternativo para banco novo/teste

Vantagens:

- `prisma db push --skip-generate` ja validou schema em banco isolado de teste;
- util para DBs descartaveis enquanto a migration nao for saneada.

Desvantagens:

- nao substitui migrations para producao nova;
- nao resolve bootstrap historico com `migrate deploy`.

Decisao: aceitavel apenas para banco isolado de teste.

### Opcao D - Baseline/reestruturacao futura de migrations

Vantagens:

- pode limpar historico antes de SaaS/producao nova.

Desvantagens:

- escopo maior;
- desnecessario para fechar a correcao financeira e o TG atual.

Decisao: adiar; considerar antes de novo ambiente produtivo do zero.

## 8. Impacto

### Deploy da correcao financeira

Sem impacto imediato.

A correcao financeira ja esta commitada. O banco operacional atual ja possui todas as migrations finalizadas e o deploy da fase atual nao depende de recriar banco vazio.

### Banco vazio/futuro

Impacto P2 confirmado.

Enquanto o BOM permanecer no arquivo, `prisma migrate deploy` falha em banco vazio ao chegar em `20260428_goals_performance_module`.

### Ambiente de teste

Para banco isolado de teste, `prisma db push --skip-generate` continua sendo alternativa operacional temporaria.

## 9. Classificacao de risco

### P0

Nenhum P0 confirmado.

### P1

Nenhum P1 confirmado para o banco operacional atual ou para a correcao financeira ja commitada.

### P2

1. `prisma migrate deploy` falha em banco vazio por BOM na migration historica.
2. Arquivo atual com BOM nao corresponde ao checksum da aplicacao finalizada no banco operacional.

### P3

1. Avaliar futuramente baseline/reestruturacao de migrations antes de SaaS multiambiente.

## 10. Decisao final

**APROVADO.**

Criterios atendidos:

- BOM confirmado tecnicamente;
- falha reproduzida em banco isolado;
- `_prisma_migrations` operacional consultada somente em leitura;
- banco operacional nao foi alterado;
- migration historica nao foi alterada;
- nenhum segredo foi exposto;
- health publico permaneceu OK;
- decisao formal registrada.

## 11. Proxima etapa recomendada

Fase 2.3.4 - Saneamento controlado da migration historica:

1. remover somente o BOM inicial de `prisma/migrations/20260428_goals_performance_module/migration.sql`;
2. confirmar que o checksum do arquivo passa a ser `cfbacf969dc090577a6168c47290c6e9012c43ff794164fac15a0fb46b410e63`;
3. recriar banco isolado vazio;
4. executar `npx prisma migrate deploy` contra esse banco isolado;
5. se passar, documentar e commitar apenas a migration e os documentos da fase.

## 12. Atualizacao da Fase 2.3.4

Data: 2026-06-18

A Fase 2.3.4 executou o saneamento recomendado:

- o BOM inicial foi removido de `prisma/migrations/20260428_goals_performance_module/migration.sql`;
- o arquivo passou de `935` para `932` bytes;
- o checksum final ficou `cfbacf969dc090577a6168c47290c6e9012c43ff794164fac15a0fb46b410e63`;
- `npx prisma migrate deploy` passou em banco vazio isolado `barbearia_test_migrate_bom_fixed`;
- o banco temporario foi removido apos a validacao.

Registro completo: `.planning/206_SANEAMENTO_BOM_MIGRATION_HISTORICA.md`.
