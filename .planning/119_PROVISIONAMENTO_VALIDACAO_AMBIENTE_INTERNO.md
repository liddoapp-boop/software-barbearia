# Fase 1.19 - Provisionamento e validacao real do ambiente interno

Data: 2026-05-06
Decisao final: bloqueado

## Resumo executivo

A tentativa de provisionamento real do ambiente interno nao pode ser aprovada porque ainda nao existe URL alvo real informada ou confirmada. O pacote atual foi revalidado localmente e esta saudavel para nova tentativa: build, `db:generate`, testes, `test:db` e smoke atualizado passaram apos saneamento do EPERM do Prisma. Mesmo assim, Relatorios nao deve ser liberado em ambiente interno enquanto nao houver host real, `.env` forte, PostgreSQL alvo, backup, CORS restrito, smoke remoto e validacao visual desktop/mobile no proprio host.

Esta fase nao criou feature nova, nao redesenhou UI, nao alterou regra de negocio, nao alterou schema Prisma e nao afrouxou permissoes.

## Objetivo da fase

Preparar e validar um ambiente interno real para release controlado dos Relatorios, com URL alvo, PostgreSQL real, `.env` forte, CORS restrito, backup confirmado, API atual rodando, smoke remoto atualizado e passada visual desktop/mobile no host real.

## Bloqueios herdados da Fase 1.18

| Item | Classificacao | Status nesta fase | Observacao |
| --- | --- | --- | --- |
| URL alvo ausente | bloqueante | nao resolvido | Nenhum host interno real foi informado. |
| `.env` fraco/incompleto | bloqueante | nao resolvido | `.env` local existe, mas e dev. |
| `DATA_BACKEND=memory` | bloqueante | nao resolvido no alvo | Local segue `memory`; alvo real nao existe. |
| CORS permissivo/ausente | bloqueante | nao resolvido no alvo | `CORS_ORIGIN` local ausente. |
| Banco alvo nao confirmado | bloqueante | nao resolvido | Apenas PostgreSQL local/teste foi exercitado por `test:db`. |
| Backup nao confirmado | bloqueante | nao resolvido | Nenhuma evidencia de backup alvo. |
| Smoke remoto nao executado | bloqueante | nao resolvido | Sem URL alvo real para `SMOKE_BASE_URL`. |
| API 3333 defasada | bloqueante operacional | resolvido localmente | Listener antigo em `3333` foi encerrado; smoke rodou em `3334` com codigo atual. |
| `db:generate` com EPERM | bloqueante operacional | resolvido nesta fase | Listener em `3333` encerrado e temporarios do Prisma limpos. |
| Desktop/mobile no host real nao validado | bloqueante | nao resolvido | Sem host real. |
| Tailwind CDN | aceito com ressalva | mantido | Aceito somente para release interno/controlado. |
| Ocupacao de Profissionais parcial | aceito com ressalva | mantido | Evolucao futura depende de grade historica. |
| `public/app.js` grande | evolucao futura | mantido | Sem refactor amplo nesta fase. |

## Ambiente alvo definido

Ambiente alvo interno real: nao definido.

Validacao executada apenas em ambiente local:

- URL local do smoke atualizado: `http://127.0.0.1:3334`.
- Porta: `3334`.
- Protocolo: HTTP.
- Natureza: desenvolvimento local, nao staging/interno real.
- Backend local do `.env`: `DATA_BACKEND=memory`.
- Uso: somente validacao tecnica local do pacote atual.

Conclusao: a fase fica bloqueada para release real porque nao ha URL alvo, protocolo, porta, responsavel, perfil de acesso, banco alvo nem janela de validacao definidos.

## `.env` validado sem expor segredos

`.env` local:

- Existe: sim.
- Fora do Git: sim, ignorado por `.gitignore:8`.
- `NODE_ENV`: presente, `development`.
- `PORT`: presente, `3333`.
- `DATA_BACKEND`: presente, `memory`.
- `DATABASE_URL`: presente, formato PostgreSQL, mas nao confirmado como banco alvo interno.
- `AUTH_SECRET`: presente, fraco para release controlado; comprimento observado 20; valor nao impresso.
- `CORS_ORIGIN`: ausente.
- `SMOKE_BASE_URL`: ausente.

Conclusao: `.env` local e adequado para desenvolvimento, mas bloqueia release controlado. O alvo deve ter `.env` proprio, fora do Git, com `DATA_BACKEND=prisma`, `DATABASE_URL` do PostgreSQL alvo, `AUTH_SECRET` forte e nao default, `CORS_ORIGIN` restrito e `NODE_ENV` coerente.

## `.env.example`

Validado:

- Documenta `NODE_ENV`.
- Documenta `PORT`.
- Documenta `DATA_BACKEND`.
- Documenta `DATABASE_URL`.
- Documenta `AUTH_SECRET`.
- Documenta `CORS_ORIGIN`.
- Documenta `SMOKE_BASE_URL`.
- Nao contem segredo real.

## CORS_ORIGIN

- `src/http/app.ts` le `CORS_ORIGIN`.
- Sem `CORS_ORIGIN`, `getAllowedCorsOrigins()` retorna permissivo para desenvolvimento.
- Com `CORS_ORIGIN`, aceita origem unica ou lista separada por virgula.
- Ambiente local: `CORS_ORIGIN` ausente, bloqueante para release real.
- Ambiente alvo: nao validado por ausencia de host real.

## Banco alvo e backup

Banco alvo interno real: nao confirmado.

Validacoes locais:

- `npm.cmd run test:db`: passou fora do sandbox, `11 passed`.
- `npm.cmd run db:generate`: passou apos saneamento de EPERM.

Migrations:

- Existem migrations versionadas em `prisma/migrations`.
- `npm.cmd run db:migrate` usa `prisma migrate dev`; nao foi executado contra alvo real por ser inadequado sem confirmacao explicita, banco alvo e backup.
- Procedimento seguro recomendado para alvo real: confirmar backup, confirmar `DATABASE_URL`, gerar Prisma Client, aplicar migrations de forma controlada conforme politica do ambiente e nao executar `migrate dev` em base real sem decisao explicita.

Backup:

- Nao confirmado.
- Sem data/hora, responsavel, local de armazenamento, comando/processo ou teste de restauracao.
- Bloqueante para release real.

## EPERM Prisma

Ocorrencia:

- Primeira execucao fora do sandbox de `npm.cmd run db:generate` falhou com `EPERM` ao renomear `node_modules/.prisma/client/query_engine-windows.dll.node.tmp11560` para `query_engine-windows.dll.node`.
- Havia listener Node em `0.0.0.0:3333`, PID `2756`.
- Existiam arquivos temporarios `query_engine-windows.dll.node.tmp*`.

Saneamento aplicado:

- Encerrado apenas o listener local especifico da porta `3333`, PID `2756`.
- Confirmado que o diretorio do Prisma Client estava dentro do workspace.
- Removidos somente temporarios do Prisma Client dentro de `node_modules/.prisma/client`.
- Reexecutado `npm.cmd run db:generate` fora do sandbox.

Resultado:

- `npm.cmd run db:generate`: passou.

Workaround recomendado:

1. Fechar API/dev server antes de `prisma generate`.
2. Evitar gerar client enquanto OneDrive estiver sincronizando.
3. Limpar apenas temporarios do Prisma Client dentro do workspace se o EPERM repetir.
4. Se persistir, usar terminal elevado ou workspace fora do OneDrive.

## API atual e smoke

Ambiente alvo real: nao validado.

Validacao local:

- Smoke iniciou a API atual em `http://127.0.0.1:3334`.
- `/health`: validado pelo smoke.
- `/reports/management/summary`: validado pelo smoke.
- CSV `type=clients`: validado pelo smoke.
- API iniciada pelo smoke foi encerrada ao final.

Smoke remoto real:

- Nao executado por ausencia de URL alvo real.

Smoke local atualizado:

- Comando: `$env:SMOKE_BASE_URL='http://127.0.0.1:3334'; npm.cmd run smoke:api`.
- Resultado: passou fora do sandbox.
- Cobertura: `/health`, autenticacao, catalogo, agenda, checkout, venda, devolucao, financeiro, summary, financial, product-sales, stock, CSV financeiro, CSV de Clientes, comissoes, dashboard e auditoria.

## Endpoints Relatorios e CSVs

No codigo atual/local, via testes e smoke:

- `GET /reports/management/summary`: coberto.
- `GET /reports/management/financial`: coberto.
- `GET /reports/management/appointments`: coberto.
- `GET /reports/management/product-sales`: coberto.
- `GET /reports/management/stock`: coberto.
- `GET /reports/management/professionals`: coberto.
- `GET /reports/management/audit`: coberto.
- `GET /reports/management/export.csv?type=financial`: coberto.
- `GET /reports/management/export.csv?type=clients`: coberto.
- `GET /reports/management/export.csv?type=audit`: coberto por permissao/teste.

Tipos CSV suportados pelo contrato atual:

- `financial`.
- `appointments`.
- `product-sales`.
- `stock`.
- `professionals`.
- `clients`.
- `commissions`.
- `audit`.

No host real:

- Nao validado.
- Todos os endpoints e CSVs devem ser repetidos no alvo com owner, sem token, perfis nao autorizados e cross-unit.

## Permissoes

Localmente por testes:

- Owner acessa endpoints gerenciais sensiveis.
- Sem token retorna `401` quando autenticacao esta ativa.
- Recepcao nao acessa `summary` nem `audit`.
- Profissional nao exporta `financial`.
- Export audit e audit report sao owner-only.
- Cross-unit retorna `403`.
- Export operacional de `appointments` para profissional permanece permitido conforme contrato existente.

No navegador/host real:

- Nao validado.
- Bloqueante para release ate testar owner, recepcao e profissional no host real.

## Desktop/mobile no host real

Nao executado porque nao ha URL alvo real.

Evidencia local herdada:

- Fase 1.16 validou Chrome real em desktop `1440x1100` e mobile `390x844` contra `http://127.0.0.1:3333`.

Classificacao:

- Evidencia historica local: aceita como contexto.
- Evidencia de release interno: bloqueante ausente.

## Tailwind CDN

- Tailwind CDN aceito apenas para release interno/controlado.
- Producao publica exige pipeline CSS buildado ou remocao/substituicao segura.
- Nao remover agora, porque ha risco de regressao visual maior que o warning.

## Git/worktree

Comandos executados:

- `git status --short --branch`.
- `git log --oneline -5`.
- `git check-ignore -v .env ...`.
- `git diff --check`.

Resultado:

- Branch: `main...origin/main`.
- Ultimos commits: `2f85aca`, `9f5a195`, `fff8156`, `3511da0`.
- Worktree possui alteracoes pendentes e arquivos `.planning` nao rastreados das fases anteriores.
- `.env` esta ignorado.
- Evidencias brutas `.png`, `.json` e `downloads/` da pasta de evidencias estao ignoradas.
- `git diff --check` passou; houve apenas warnings de normalizacao LF/CRLF no Windows.

## Validacoes executadas

- `npm.cmd run build`: passou.
- `npm.cmd run db:generate`: falhou inicialmente por EPERM; passou apos saneamento.
- `npm.cmd run test`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox, `67 passed | 11 skipped`.
- `npm.cmd run test:db`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox, `11 passed`.
- `$env:SMOKE_BASE_URL='http://127.0.0.1:3334'; npm.cmd run smoke:api`: falhou no sandbox por verificacao/download de binario Prisma; passou fora do sandbox.
- `.env` local validado sem imprimir segredos.
- `.env.example` revisado.
- `.gitignore` confirmado para `.env` e evidencias brutas.

## Riscos resolvidos

- EPERM do `db:generate` foi saneado localmente.
- API defasada na porta `3333` deixou de ser usada na validacao local.
- Smoke atualizado com CSV de Clientes passou no codigo atual.
- Pacote atual continua passando build/test/test:db/smoke local.

## Riscos restantes

- Sem URL alvo real.
- Sem `.env` alvo forte validado.
- Sem `DATA_BACKEND=prisma` no alvo.
- Sem `DATABASE_URL` do banco alvo confirmada.
- Sem backup confirmado.
- Sem `CORS_ORIGIN` restrito no alvo.
- Sem smoke remoto em host real.
- Sem validacao de CSVs no host real.
- Sem validacao visual desktop/mobile no host real.
- Sem validacao visual por perfil no host real.
- Worktree ainda precisa de empacotamento/commit intencional.
- Tailwind CDN continua aceito apenas para ambiente interno/controlado.

## Rollback recomendado

1. Manter Relatorios bloqueado no ambiente interno.
2. Reverter deploy do alvo para ultimo pacote funcional conhecido se a proxima tentativa falhar.
3. Restaurar backup do banco somente se houve migration/escrita indevida.
4. Reiniciar a API do alvo para eliminar processo antigo em porta ocupada.
5. Reexecutar `$env:SMOKE_BASE_URL='<URL_ALVO>'; npm.cmd run smoke:api`.
6. Preservar logs, sem versionar dados sensiveis.

## Decisao final

Bloqueado para release controlado dos Relatorios em ambiente interno.

O codigo atual esta apto para nova tentativa tecnica, mas o ambiente ainda nao esta confiavel. O release so deve avancar quando a proxima tentativa trouxer URL alvo real, `.env` forte, PostgreSQL alvo, backup, CORS restrito, API atual no alvo, smoke remoto e validacao visual desktop/mobile no host real.

## Proxima fase recomendada

Fase 1.20 - Execucao assistida no host interno definido: receber URL alvo e dados nao sensiveis do ambiente, validar `.env` sem expor segredos, confirmar PostgreSQL/backup, subir API atual, rodar smoke remoto com `SMOKE_BASE_URL`, validar CORS, CSVs, permissoes e desktop/mobile no host real.
