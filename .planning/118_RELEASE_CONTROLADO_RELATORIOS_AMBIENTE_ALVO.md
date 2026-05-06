# Fase 1.18 - Release controlado dos Relatorios em ambiente alvo interno

Data: 2026-05-06
Decisao final: bloqueado

## Resumo executivo

A preparacao tecnica local dos Relatorios segue consistente, mas a liberacao em ambiente alvo interno ficou bloqueada. Nao foi informado nem confirmado um host interno real com `.env` forte, PostgreSQL alvo, backup e `CORS_ORIGIN` restrito. Alem disso, a API ja ativa em `http://127.0.0.1:3333` respondeu aos endpoints gerenciais principais, mas rejeitou `type=clients` no CSV, indicando processo antigo/defasado na porta. O codigo atual foi validado em porta alternativa `http://127.0.0.1:3334` com smoke atualizado, incluindo CSV de Clientes, e passou.

Esta fase nao criou feature nova, nao redesenhou UI, nao alterou regra financeira, estoque, permissao ou schema Prisma. A unica correcao aplicada foi endurecer o smoke para validar tambem o CSV gerencial de Clientes.

## Objetivo da fase

Executar a preparacao e validacao de release controlado da aba Relatorios em ambiente alvo interno, confirmando ambiente, banco, seguranca, CORS, smoke remoto, CSV, permissoes e uma passada visual curta.

## Readiness herdado da Fase 1.17

Aceito para release controlado interno:

- Tailwind CDN permanece temporariamente, com warning conhecido.
- Ocupacao de Profissionais segue estimada/parcial.
- `public/app.js` segue grande.
- Evidencias brutas da Fase 1.16 ficam locais/ignoradas; apenas manifest textual e versionavel.

Bloqueante para producao publica:

- Tailwind CDN sem pipeline CSS buildado.
- Ausencia de validacao em ambiente publico/real.
- Ausencia de `.env` forte, CORS restrito, banco alvo e backup confirmados.

Bloqueante para release interno nesta fase:

- Ambiente alvo interno real nao definido.
- `.env` local nao representa release controlado.
- Banco alvo e backup nao confirmados.
- Smoke remoto contra host alvo real nao executado.
- Passada visual desktop/mobile no host real nao executada.
- API ativa em `127.0.0.1:3333` rejeita CSV `type=clients`, indicando alvo local defasado.

## Git/worktree

Comandos executados:

- `git status --short --branch`
- `git log --oneline -5`

Resultado:

- Branch atual: `main...origin/main`.
- Ultimos commits: `2f85aca`, `9f5a195`, `fff8156`, `3511da0`.
- Worktree possui muitas alteracoes pendentes das fases 1.12 a 1.18 e arquivos `.planning` ainda nao rastreados.
- `.env` nao aparece versionado e esta ignorado por `.gitignore:8`.
- Evidencias brutas da Fase 1.16 estao ignoradas por `.gitignore`.
- `.planning/evidence/fase-116/MANIFEST.md` existe como artefato textual versionavel, mas o pacote final ainda depende de selecao/commit intencional.

Risco: nao prosseguir para release real com worktree nessa forma sem empacotar commits pequenos e revisar `git diff`.

## Ambiente alvo usado

Ambiente alvo interno real: nao fornecido/nao confirmado.

Validacoes locais realizadas:

- URL ativa inicial: `http://127.0.0.1:3333`.
- Porta alternativa para codigo atual: `http://127.0.0.1:3334`.
- Protocolo: HTTP local.
- Backend local do `.env`: `DATA_BACKEND=memory`.
- Natureza: desenvolvimento local, nao staging/interno real.

Conclusao: o ambiente local ajuda a validar codigo, mas nao atende ao criterio de ambiente alvo interno de release.

## Validacao de `.env`

`.env.example`:

- Documenta `DATA_BACKEND`.
- Documenta `DATABASE_URL`.
- Documenta `AUTH_SECRET`.
- Documenta `CORS_ORIGIN`.
- Documenta `PORT`.
- Documenta `SMOKE_BASE_URL`.
- Nao contem segredo real; contem exemplos explicitamente inseguros para desenvolvimento.

`.env` local, sem expor segredos:

- Existe e esta fora do Git.
- `PORT=3333`.
- `DATA_BACKEND=memory`.
- `AUTH_ENFORCED=true`.
- `AUTH_SECRET`: existe, mas nao e forte para release controlado; comprimento observado: 20.
- `DATABASE_URL`: existe e tem formato PostgreSQL, mas nao foi confirmado como banco alvo interno.
- `NODE_ENV=development`.
- `CORS_ORIGIN`: ausente.

Conclusao: `.env` local e de desenvolvimento e bloqueia release controlado como ambiente alvo.

## Banco alvo e backup

Banco alvo interno real: nao confirmado.

Validacoes executadas:

- `npm.cmd run test:db`: passou fora do sandbox, `11 passed`.
- `npm.cmd run db:generate`: falhou por `EPERM` ao renomear `node_modules/.prisma/client/query_engine-windows.dll.node`, mesmo fora do sandbox.
- `npm.cmd run build`: passou.

Observacoes:

- A falha de `db:generate` e operacional local em Windows/OneDrive e deixou arquivos `.tmp*` em `node_modules/.prisma/client`.
- O Prisma client existente esta funcional o suficiente para `test:db`, mas a geracao limpa precisa ser saneada antes de empacotar ambiente.
- `npm.cmd run db:migrate` nao foi executado porque o script usa `prisma migrate dev`, inadequado para alvo real sem aprovacao e sem backup confirmado.
- `prisma/seed.ts` nao deve ser usado em base real sem revisao, por risco de limpar/criar dados de demonstracao.

Backup:

- Nao confirmado.
- Sem data/hora, responsavel ou local de armazenamento informado.

Conclusao: banco/backup bloqueiam release interno.

## CORS_ORIGIN

Codigo:

- `src/http/app.ts` usa `CORS_ORIGIN` quando definido.
- Sem `CORS_ORIGIN`, `getAllowedCorsOrigins()` retorna `true`, mantendo CORS permissivo para desenvolvimento.

Ambiente local:

- `CORS_ORIGIN` ausente.
- Preflight local com origem nao configurada retornou `204` e `Access-Control-Allow-Origin` refletindo a origem enviada.

Classificacao:

- Aceitavel somente para desenvolvimento local.
- Bloqueante para release interno real sem `CORS_ORIGIN` restrito ao host alvo.
- Bloqueante para producao publica.

## Smoke remoto com `SMOKE_BASE_URL`

Comando executado contra a API local ativa:

- `$env:SMOKE_BASE_URL="http://127.0.0.1:3333"; npm.cmd run smoke:api`

Resultado:

- Passou.
- Validou `/health`, login, catalogo, agenda, checkout, venda, devolucao, financeiro, summary, financial, product-sales, stock, CSV financeiro, comissoes, dashboard e auditoria.
- Nao validava `type=clients` antes desta fase.

Achado:

- Checagem direta em `http://127.0.0.1:3333` mostrou `CSV clients 400`, com lista de tipos aceitos sem `clients`.
- Isso indica servidor/processo defasado na porta ou alvo nao atualizado.

Correcao aplicada:

- `scripts/smoke-api-flow.ps1` passou a exportar e validar CSV `type=clients`, checando `Content-Type`, cabecalho humano e ausencia de `clientId`.

Comando executado contra codigo atual em porta alternativa:

- `$env:SMOKE_BASE_URL="http://127.0.0.1:3334"; npm.cmd run smoke:api`

Resultado:

- Passou.
- A API foi iniciada pelo smoke e encerrada ao final.
- Validou CSV financeiro e CSV de Clientes.

Conclusao:

- Smoke local atualizado passa no codigo atual.
- Smoke remoto contra ambiente alvo interno real ainda nao foi executado.

## Endpoints Relatorios validados

Em `http://127.0.0.1:3333`, com owner autenticado:

- `GET /reports/management/summary`: 200.
- `GET /reports/management/financial`: 200.
- `GET /reports/management/appointments`: 200.
- `GET /reports/management/product-sales`: 200.
- `GET /reports/management/stock`: 200.
- `GET /reports/management/professionals`: 200.
- `GET /reports/management/audit`: 200.
- `GET /reports/management/export.csv`: 200 para tipos existentes no processo ativo.

Permissoes por HTTP local:

- Sem token: `401`.
- Recepcao em summary/audit: bloqueio esperado por policy sensivel.
- Cross-unit: `403`.

Ressalva:

- CSV `type=clients` falhou em `3333`, indicando alvo local defasado.
- No codigo atual em `3334`, smoke atualizado validou `type=clients` com sucesso.

## CSVs validados

Em `http://127.0.0.1:3333`, owner:

- `financial`: 200, `text/csv`, separador `;`, filename claro.
- `appointments`: 200, `text/csv`, separador `;`, filename claro.
- `product-sales`: 200, `text/csv`, separador `;`, filename claro.
- `stock`: 200, `text/csv`, separador `;`, filename claro.
- `professionals`: 200, `text/csv`, separador `;`, filename claro.
- `commissions`: 200, `text/csv`, separador `;`, filename claro.
- `audit`: 200, `text/csv`, separador `;`, filename claro.
- `clients`: 400 no processo ativo em `3333`.

Em `http://127.0.0.1:3334`, codigo atual:

- `clients`: validado pelo smoke atualizado com `Content-Type` CSV, cabecalho humano e sem `clientId`.

Conclusao: pacote atual esta correto, mas o alvo ativo precisa ser atualizado/reiniciado antes de release.

## Permissoes

Validadas por testes automatizados:

- `npm.cmd run test`: passou fora do sandbox, `67 passed | 11 skipped`.
- Cobertura inclui bloqueio de `summary`, financeiro, auditoria/export audit para nao-owner, export operacional permitido quando politica autoriza e tenant guard cross-unit.

Validadas por HTTP local:

- Owner acessa endpoints gerenciais.
- Sem token retorna `401`.
- Cross-unit retorna `403`.
- Auditoria e export audit permanecem sensiveis/owner-only por testes.

Ressalva:

- A passada visual por perfil no host real nao foi executada nesta fase.

## Desktop/mobile no host real

Nao executado em ambiente alvo real porque a URL alvo interna nao foi fornecida/confirmada.

Evidencia herdada:

- Fase 1.16 validou Chrome real em desktop `1440x1100` e mobile `390x844` em `http://127.0.0.1:3333`.

Classificacao:

- Aceitavel como evidencia historica local.
- Bloqueante para liberar ambiente interno sem repetir no host alvo.

## Tailwind CDN

Decisao preservada da Fase 1.17:

- Tailwind CDN permanece aceito apenas para release controlado interno.
- Warning nao impede uso operacional local.
- Producao real/publica exige pipeline CSS buildado ou remocao/substituicao segura.

## Dados sensiveis e pacote versionavel

Confirmado:

- `.env` esta ignorado.
- Evidencias brutas `.png`, `.json` e diretórios `downloads/` de `.planning/evidence/*/` estao ignorados.
- CSVs baixados nao devem entrar no Git.
- Screenshots/logs com dados sensiveis nao devem entrar no Git.
- Apenas manifest/documentacao textual deve entrar.

Risco:

- Worktree tem muitos arquivos pendentes; revisar staging manualmente antes de commit.

## Arquivos alterados

- `.planning/118_RELEASE_CONTROLADO_RELATORIOS_AMBIENTE_ALVO.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`
- `scripts/smoke-api-flow.ps1`

## Validacoes executadas

- `git status --short --branch`: executado.
- `git log --oneline -5`: executado.
- `git check-ignore -v .env ...`: passou para `.env` e evidencias brutas.
- `.env` local validado sem expor segredos.
- `npm.cmd run build`: passou.
- `npm.cmd run test`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox (`67 passed | 11 skipped`).
- `npm.cmd run test:db`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox (`11 passed`).
- `npm.cmd run db:generate`: falhou fora do sandbox por `EPERM` ao renomear engine Prisma em `node_modules/.prisma/client`.
- `$env:SMOKE_BASE_URL="http://127.0.0.1:3333"; npm.cmd run smoke:api`: passou, mas antes do smoke validar `clients`.
- `$env:SMOKE_BASE_URL="http://127.0.0.1:3334"; npm.cmd run smoke:api`: passou com smoke atualizado e CSV de Clientes.
- Checagem HTTP local de endpoints/CSV/permissoes: executada.

## Riscos aceitos

- Tailwind CDN somente para ambiente interno/controlado.
- Ocupacao de Profissionais como estimada/parcial.
- `public/app.js` grande, sem refactor amplo nesta fase.
- Evidencias brutas locais/ignoradas, com manifest textual.

## Riscos bloqueantes

- Ambiente alvo interno real nao definido.
- `.env` alvo real nao validado; `.env` local e fraco/dev.
- `CORS_ORIGIN` ausente/permissivo no ambiente local.
- Banco alvo e backup nao confirmados.
- Smoke remoto no host interno real nao executado.
- Passada visual desktop/mobile no host real nao executada.
- API ativa em `127.0.0.1:3333` rejeita `type=clients`, indicando deploy/processo defasado.
- `db:generate` falha por `EPERM` local e precisa de saneamento operacional antes de pacote final.
- Worktree pendente precisa de revisao/commit intencional.

## Checklist de release controlado

- [ ] Ambiente alvo interno definido.
- [ ] URL alvo registrada.
- [ ] `.env` alvo com `DATA_BACKEND=prisma`.
- [ ] `AUTH_SECRET` forte, nao default e fora do Git.
- [ ] `CORS_ORIGIN` restrito ao host real.
- [ ] `DATABASE_URL` apontando para banco alvo correto.
- [ ] Backup confirmado antes de release.
- [ ] `npm.cmd run db:generate` passando no host/CI.
- [ ] Smoke remoto com `SMOKE_BASE_URL` do alvo passando, incluindo CSV de Clientes.
- [ ] Relatorios abrindo no host real.
- [ ] CSVs baixando pelo navegador no host real.
- [ ] Permissoes owner/recepcao/profissional verificadas no host real.
- [ ] Passada visual curta desktop/mobile concluida.
- [ ] Worktree empacotado em commits revisados.

## Rollback recomendado

Se o alvo interno for atualizado e falhar:

1. Reverter para o ultimo commit/deploy funcional antes da Fase 1.14/1.17 no host alvo.
2. Restaurar backup do banco somente se houve escrita/migration indevida; nesta fase nao houve migration.
3. Reiniciar o processo Node do alvo para eliminar servidor antigo em porta ocupada.
4. Reexecutar `$env:SMOKE_BASE_URL="<URL_ALVO>"; npm.cmd run smoke:api`.
5. Manter Relatorios fora do menu operacional do alvo se CSV/permissoes falharem.

## Decisao final

Bloqueado para release controlado em ambiente alvo interno.

O codigo atual esta apto para nova tentativa de validacao controlada apos configurar o alvo, mas nao ha evidencia suficiente para liberar Relatorios em ambiente interno real nesta fase.

## Proxima fase recomendada

Fase 1.19 - Provisionamento e validacao real do ambiente interno: definir URL alvo, configurar `.env` forte, PostgreSQL alvo com backup, restringir `CORS_ORIGIN`, reiniciar/deployar API atual, executar smoke remoto atualizado e fazer passada visual desktop/mobile no host real.
