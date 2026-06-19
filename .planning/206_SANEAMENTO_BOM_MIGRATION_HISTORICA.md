# 206 - Saneamento BOM em migration historica

Data: 2026-06-18

Escopo: Fase 2.3.4 - remover somente o BOM UTF-8 inicial da migration historica `20260428_goals_performance_module`, validar checksum e reexecutar `prisma migrate deploy` em banco vazio isolado.

## 1. Resumo executivo

O BOM UTF-8 inicial foi removido de `prisma/migrations/20260428_goals_performance_module/migration.sql`.

Resultado: **APROVADO COM RESSALVAS**.

O objetivo principal da fase foi concluido:

- apenas 3 bytes foram removidos do inicio do arquivo;
- o arquivo deixou de iniciar com `ef bb bf`;
- o checksum final ficou exatamente igual ao checksum esperado do conteudo sem BOM;
- `npx prisma migrate deploy` passou em banco PostgreSQL vazio isolado `barbearia_test_migrate_bom_fixed`;
- o banco temporario foi removido apos a validacao.

Ressalvas:

- `npm run test` falhou em 3 testes por timeout, sem relacao direta com a migration saneada.
- `npm audit` e `npm audit --omit=dev` falharam por uma vulnerabilidade alta reportada em `nodemailer <=9.0.0`.

Nao houve deploy, restart PM2, firewall, certificado, seed, alteracao de `.env`, alteracao do banco operacional, `git add`, commit ou push. Nenhuma URL completa, senha, token, hash, chave privada ou backup SQL foi impresso.

## 2. Baseline antes da fase

| Validacao | Resultado |
| --- | --- |
| `git status --short` | apenas documentos pendentes da Fase 2.3.3 |
| `git status -sb` | `main...origin/main` |
| `git log --oneline -10` | HEAD em `c2cf297 docs: registrar validacao test db isolada` |
| Health publico | `{"ok":true,"authEnforced":true}` |

Confirmacoes:

- Branch local alinhada com `origin/main`.
- Pendencias iniciais limitadas a documentos `.planning` da Fase 2.3.3.
- Health publico OK.

## 3. Estado inicial da migration

Arquivo:

- `prisma/migrations/20260428_goals_performance_module/migration.sql`

Inspecao antes:

- `file`: `Unicode text, UTF-8 (with BOM) text`
- primeiros bytes: `ef bb bf 2d 2d 20 43 72 65 61 74 65 54 61 62 6c`
- tamanho: `935` bytes
- `starts_with_bom_before`: `True`

Checksums:

| Conteudo | SHA-256 |
| --- | --- |
| arquivo antes, com BOM | `b28af79c7cd00baed50c9292c6ea94dfa11a28acbf3eb4196c261e061c971161` |
| preview sem BOM antes da alteracao | `cfbacf969dc090577a6168c47290c6e9012c43ff794164fac15a0fb46b410e63` |

O preview sem BOM bateu exatamente com o checksum esperado, portanto a fase prosseguiu.

## 4. Alteracao aplicada

Alteracao:

- removidos somente os bytes iniciais `ef bb bf`;
- nenhum SQL foi reescrito;
- nenhuma outra migration foi alterada;
- `schema.prisma` e codigo da aplicacao nao foram alterados.

Inspecao depois:

- `file`: `ASCII text`
- primeiros bytes: `2d 2d 20 43 72 65 61 74 65 54 61 62 6c 65 0a 43`
- tamanho: `932` bytes
- `starts_with_bom_after`: `False`

Checksum final:

| Conteudo | SHA-256 |
| --- | --- |
| arquivo depois, sem BOM | `cfbacf969dc090577a6168c47290c6e9012c43ff794164fac15a0fb46b410e63` |

## 5. Confirmacao de diff minimo

`git diff --word-diff` mostrou somente a remocao do caractere invisivel antes de `-- CreateTable`.

Evidencia complementar:

- tamanho antes: `935` bytes;
- tamanho depois: `932` bytes;
- delta: `3` bytes;
- checksum final esperado confirmado.

Conclusao: a alteracao foi limitada ao BOM inicial.

## 6. Banco isolado e migrate deploy

Banco temporario criado:

- `barbearia_test_migrate_bom_fixed`
- owner: `barbearia`
- nome contem marcador `test`
- separado do banco operacional `barbearia`

Execucao:

- `DATABASE_URL` temporaria apontando para `barbearia_test_migrate_bom_fixed`;
- URL completa nao foi impressa;
- `npx prisma migrate deploy`.

Resultado:

- Prisma encontrou 16 migrations.
- Todas as 16 migrations foram aplicadas com sucesso.
- A migration `20260428_goals_performance_module` nao falhou mais.
- Nenhuma migration posterior falhou.

O banco temporario `barbearia_test_migrate_bom_fixed` foi removido apos as validacoes.

## 7. Validacoes complementares

| Validacao | Resultado |
| --- | --- |
| `npm run build` | passou |
| `npm run test` | falhou: 3 timeouts (`tests/api.spec.ts` e `tests/frontend-mobile-overflow.spec.ts`) |
| `npm run test:db` com `NODE_ENV=test` e banco isolado | passou: 1 arquivo; 14 testes |
| `npm audit` | falhou: 1 vulnerabilidade alta em `nodemailer <=9.0.0` |
| `npm audit --omit=dev` | falhou: 1 vulnerabilidade alta em `nodemailer <=9.0.0` |
| `git diff --check` | passou |
| Health publico final | `{"ok":true,"authEnforced":true}` |

Observacoes:

- A primeira execucao de `npm run test:db` com ambiente local carregado falhou por hardening: `AUTH_ENFORCED=false nao e permitido em producao`.
- A suite DB foi reexecutada com `NODE_ENV=test`, `DATABASE_URL` temporaria para `barbearia_test_migrate_bom_fixed` e passou 14/14.
- As falhas de `npm run test` e `npm audit` nao foram introduzidas por alteracao de SQL; nenhum codigo da aplicacao ou dependencia foi alterado nesta fase.

## 8. Riscos residuais

### P0

Nenhum P0 confirmado.

### P1

1. `npm audit` e `npm audit --omit=dev` reportam vulnerabilidade alta em `nodemailer <=9.0.0`; a correcao sugerida pelo npm envolve `nodemailer@9.0.1` com potencial breaking change.

### P2

1. `npm run test` falhou por timeouts em 3 testes. Requer revalidacao em fase propria ou investigacao ambiental/teste especifica.

### P3

1. Considerar baseline/reorganizacao ampla de migrations apenas antes de novo ambiente produtivo do zero, se necessario.

## 9. Decisao final

**APROVADO COM RESSALVAS.**

Criterios atendidos:

- apenas o BOM foi removido;
- checksum final bate com `cfbacf969dc090577a6168c47290c6e9012c43ff794164fac15a0fb46b410e63`;
- `prisma migrate deploy` passou em banco isolado vazio;
- `test:db` passou contra banco isolado;
- `npm run build`, `git diff --check` e health publico passaram;
- banco operacional nao foi alterado;
- nenhum segredo foi exposto;
- documentacao criada.

Ressalvas:

- suite geral e audits npm nao passaram nesta rodada por achados nao relacionados ao saneamento do BOM.

## 10. Proxima etapa recomendada

1. Revisar seletivamente o diff desta fase.
2. Tratar a vulnerabilidade de `nodemailer` em fase propria, avaliando impacto de upgrade para `9.0.1`.
3. Reexecutar ou investigar os 3 timeouts de `npm run test`.
4. Quando autorizado, commitar seletivamente a migration saneada e os documentos das Fases 2.3.3/2.3.4, sem `git add .`.
