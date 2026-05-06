# Fase 1.15 - Validacao operacional e visual dos Relatorios com backend atual, CSV real e correcao do smoke/porta alternativa

Data: 2026-05-06
Decisao final: aprovado com ressalvas

## Resumo executivo

A fase fechou as principais ressalvas tecnicas da Fase 1.14. O smoke voltou a rodar contra a API atual, inclusive em porta alternativa; `test:db` foi reexecutado com o novo teste Prisma; os endpoints `/reports/management/*` e os CSVs backend foram validados com autenticacao, tenant guard e permissoes sensiveis. A validacao visual foi feita por inspecao de codigo/CSS, nao em navegador real.

## Objetivo da fase

Validar que Relatorios funciona com o backend atual, exporta CSV utilizavel, respeita perfil/unidade/periodo e que o smoke nao depende de uma API antiga na porta `3333`.

## Ressalvas herdadas da Fase 1.14

- Reexecutar smoke contra a API atual.
- Reexecutar `test:db` com o novo teste Prisma.
- Corrigir friccao do `dotenv`/porta alternativa.
- Validar CSV real.
- Validar visual desktop/mobile da aba Relatorios.
- Avaliar vazamento financeiro em `summary` para perfis nao-owner.

## Correcoes aplicadas

- `src/server.ts`: removido `dotenv.config({ override: true })`; agora variaveis externas como `PORT` prevalecem sobre `.env`.
- `scripts/smoke-api-flow.ps1`: o smoke verifica se uma API saudavel tambem expoe `/reports/management/summary`; se detectar API antiga em processo Node, reinicia o listener antes de seguir.
- `tests/api.spec.ts`: ampliada cobertura de permissao para `summary`, export financeiro/auditoria e export operacional por perfil.
- `.env.example`: documentado uso de `SMOKE_BASE_URL` para porta alternativa.

## Smoke e porta alternativa

Fluxo resolvido:

- `SMOKE_BASE_URL` segue com prioridade no script.
- Quando o script precisa subir servidor local, ele deriva `PORT` da URL informada.
- `dotenv.config()` sem `override` permite que `PORT` externo sobreponha `PORT=3333` do `.env`.
- API antiga com `/health` mas sem `/reports/management/summary` deixa de ser aceita silenciosamente.

Comandos executados:

- `npm.cmd run smoke:api`: falhou no sandbox por tentativa de verificar `binaries.prisma.sh`; passou fora do sandbox.
- `powershell -ExecutionPolicy Bypass -File scripts/smoke-api-flow.ps1 -BaseUrl http://127.0.0.1:3334`: falhou no sandbox pelo mesmo motivo; passou fora do sandbox.

## Endpoints validados

Validados por contrato HTTP via build gerado e por smoke:

- `GET /reports/management/summary`
- `GET /reports/management/financial`
- `GET /reports/management/appointments`
- `GET /reports/management/product-sales`
- `GET /reports/management/stock`
- `GET /reports/management/professionals`
- `GET /reports/management/audit`
- `GET /reports/management/export.csv`

Todos retornaram `200` para owner autenticado, com `period.unitId=unit-01`. Cross-unit retornou `403`. Sem token retornou `401` em rota protegida.

## CSV validado

Tipos validados:

- `financial`
- `appointments`
- `product-sales`
- `stock`
- `professionals`
- `commissions`
- `audit`

Resultado:

- `Content-Type: text/csv; charset=utf-8`.
- `Content-Disposition` com filename `relatorio-<tipo>-<unitId>-<inicio>-<fim>.csv`.
- BOM UTF-8 presente.
- Separador `;`.
- Cabecalhos humanos.
- Sem JSON bruto na exportacao.
- Audit export bloqueado para recepcao (`403`) e liberado para owner.

## Frontend Relatorios

Validado por codigo:

- `public/index.html` tem `reportsSection`, `reportsHeaderMount`, `reportsFilterMount`, `reportsFeedback` e `reportsRoot`; nao ha placeholder residual para a aba.
- `public/app.js` carrega os endpoints novos: summary, financeiro, atendimentos, vendas, estoque, profissionais e auditoria.
- `public/app.js` prefere `/reports/management/export.csv` no botao de exportacao e so chama `exportReportCsv` local se o backend falhar.
- `public/modules/relatorios.js` renderiza hub, cards, relatorio ativo, mensagens parciais honestas e linhas humanizadas.
- IDs tecnicos nao aparecem na superficie principal renderizada pelo modulo.

## Validacao desktop/mobile

Validacao realizada por analise de CSS/codigo, nao por navegador real.

Desktop:

- Header unico via `PageHeader`.
- Hub em grid de cards.
- Filtro global de periodo claro.
- Botao CSV no painel do relatorio ativo.
- Resumo antes dos detalhes.
- Sem tabela gigante como superficie principal.

Mobile:

- `.reports-hub-grid`, `.reports-kpi-grid`, `.reports-period-strip` e `.reports-split` viram uma coluna em `max-width: 720px`.
- Acoes do painel ativo ocupam largura total.
- Linhas de detalhe deixam de usar layout lado a lado.
- Sem quebra horizontal grave identificada por CSS.

Ressalva: nao houve clique real/screenshot desktop-mobile nesta sessao.

## Permissoes e vazamento de dados

Resultado:

- Owner acessa todos os relatorios.
- `summary` e `financial` sao owner-only.
- `audit` e export `audit` sao owner-only.
- Export `financial` e `commissions` bloqueiam profissional/recepcao por `assertManagementReportAccess`.
- Export operacional de `appointments` foi validado para profissional (`200`).
- `product-sales` permite recepcao e bloqueia profissional.
- Tenant guard bloqueia `unitId` de outra unidade.

Conclusao: `summary` nao vaza financeiro para nao-owner porque a rota esta owner-only.

## Test DB

`npm.cmd run test:db`:

- Sandbox: falhou por `spawn EPERM` do Vitest/Rolldown.
- Fora do sandbox: passou com `1 passed`, `11 passed`.
- O novo teste Prisma de relatorios gerenciais e CSV com dados persistidos foi executado.

## Validacoes executadas

- `npm.cmd run build`: passou.
- `npm.cmd run test`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox (`2 passed | 1 skipped`, `66 passed | 11 skipped`).
- `npm.cmd run test:db`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox (`1 passed`, `11 passed`).
- `npm.cmd run smoke:api`: falhou no sandbox por acesso/verificacao de engine Prisma; passou fora do sandbox.
- `powershell -ExecutionPolicy Bypass -File scripts/smoke-api-flow.ps1 -BaseUrl http://127.0.0.1:3334`: falhou no sandbox pelo mesmo motivo; passou fora do sandbox.
- Sintaxe JS publica relevante: passou com `tsc --allowJs --noEmit`.
- Endpoints e CSVs validados por `app.inject` sobre `dist`.

## Problemas encontrados

- Sandbox local bloqueia Vitest/Rolldown com `spawn EPERM`.
- Sandbox bloqueia/verifica engine Prisma via `binaries.prisma.sh` ao subir `dev:api`.
- Browser real/in-app nao foi usado para screenshots ou clique visual.

## Problemas corrigidos

- `dotenv override` impedia porta alternativa.
- Smoke aceitava API antiga apenas porque `/health` respondia.
- Cobertura de teste nao explicitava bloqueio de `summary` para nao-owner.

## Problemas que permanecem

- Validacao visual real desktop/mobile ainda precisa de passada humana ou browser automation.
- `public/app.js` continua grande e acumulando orquestracao.
- Ocupacao de profissionais segue parcial por falta de grade historica fechada.

## Riscos restantes

- Regressao visual so sera detectada de forma completa com navegador real.
- CSV esta adequado para uso operacional, mas Excel/PDF profissional seguem fora de escopo.
- Se houver processo nao-Node ocupando a porta do smoke, o script para com mensagem clara e nao tenta derrubar.

## Criterios de aceite

- Smoke contra API atual: atendido fora do sandbox.
- Smoke em porta alternativa: atendido fora do sandbox.
- `test:db` com teste Prisma novo: atendido fora do sandbox.
- CSV backend real: atendido por contrato HTTP.
- Frontend consome endpoints atuais: atendido por codigo.
- Aba Relatorios sem placeholder: atendido por codigo.
- Permissoes sensiveis revisadas: atendido.
- `summary` sem vazamento financeiro: atendido por owner-only.
- Documentacao da fase criada: atendido.
- Implementation log e next priorities atualizados: atendido nesta fase.
- Build: passou.
- Testes: passaram fora do sandbox.

## Proxima fase recomendada

Fase 1.16 - Validacao visual real assistida em navegador desktop/mobile, com screenshots e pequenos polimentos de Relatorios, sem backend novo e sem redesign amplo.
