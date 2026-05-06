# Fase 1.17 - Preparacao de release visual/controlado dos Relatorios e saneamento de ressalvas finais

Data: 2026-05-06
Decisao final: aprovado com ressalvas

## Resumo executivo

A fase fechou as ressalvas finais de Relatorios com escopo curto e orientado a release. Nao houve redesign amplo, migration, schema Prisma novo, regra financeira nova, regra de comissao nova ou afrouxamento de permissao. Foram saneados: decisao conservadora sobre Tailwind CDN, politica de evidencias da Fase 1.16, linguagem honesta para ocupacao de Profissionais e inclusao simples do CSV backend de Clientes com colunas humanas.

## Objetivo da fase

Preparar Relatorios para release visual/controlado, preservando o que foi validado nas Fases 1.13 a 1.16 e tratando somente riscos pequenos de producao controlada.

## Ressalvas herdadas da Fase 1.16

- Tailwind CDN emitia warning no console.
- Ocupacao de profissionais seguia parcial por falta de grade historica fechada.
- Clientes aparecia no hub, mas nao tinha CSV backend gerencial.
- Evidencias brutas em `.planning/evidence/fase-116/` precisavam de decisao de versionamento.
- Uma regressao visual curta era recomendada antes do release controlado.

## Decisao sobre Tailwind CDN

Decisao: mitigado e documentado, sem remocao nesta fase.

Motivo: `public/index.html`, `public/app.js` e modulos ainda usam muitas classes utilitarias Tailwind (`grid`, `rounded-*`, `text-*`, `bg-*`, `sm:*`, `xl:*`, espacamentos e breakpoints). `public/styles/layout.css` cobre a camada premium e sobrescreve o tema escuro, mas ainda nao substitui a base utilitaria completa. Remover o CDN agora teria risco real de regressao visual maior do que o warning.

Risco aceito: release controlado interno pode seguir com warning conhecido. Producao real/publica exige pipeline CSS buildado, Tailwind CLI/PostCSS ou substituicao integral por CSS proprio antes de publicar.

## Decisao sobre evidencias `.planning/evidence/fase-116/`

Decisao: manter apenas manifest versionavel; deixar screenshots, JSONs e CSVs brutos locais/ignorados.

Revisao:
- 30 arquivos revisados.
- Tamanho aproximado: 15.8 MB.
- Screenshots sao uteis para auditoria visual local.
- CSVs e auditoria contem dados identificaveis de demonstracao, como nomes e e-mail operacional `owner@barbearia.local`.
- Nenhum token ou senha foi encontrado nos artefatos revisados.

Correcao aplicada:
- Criado `.planning/evidence/fase-116/MANIFEST.md`.
- `.gitignore` passou a ignorar PNGs, JSONs de browser e diretórios `downloads/` de evidencias.

## Decisao sobre Clientes no CSV

Decisao: implementar agora, por ser simples e seguro.

Implementacao:
- `ReportExportType` ganhou `clients`.
- `/reports/management/export.csv` aceita `type=clients`.
- O payload usa `getClientsOverview` existente em memory e Prisma.
- CSV usa cabecalhos humanos e nao exporta IDs tecnicos, telefone ou e-mail.
- Frontend habilita `Baixar CSV` no card Clientes e mapeia `clientes` para `clients`.
- Teste API cobre cabecalhos e ausencia de `clientId`/`cli-`.

Colunas:
- Cliente.
- Status.
- Visitas no periodo.
- Receita no periodo.
- LTV.
- Ticket medio.
- Ultima visita.
- Acao recomendada.

## Decisao sobre ocupacao de Profissionais

Decisao: manter calculo parcial sem inventar regra nova, deixando linguagem explicita.

Correcoes:
- Frontend mostra `Ocupacao estimada`.
- Relatorio mostra aviso: baseada nos atendimentos disponiveis no periodo.
- Documentado que calculo completo depende de grade historica de disponibilidade.
- Backend ja retorna `completeness.status=partial` para Profissionais.

## Correcoes feitas

- Inclusao conservadora do CSV backend de Clientes.
- Mapeamento frontend do CSV de Clientes.
- Ajuste de texto de ocupacao em Relatorios/Profissionais.
- Manifest textual das evidencias da Fase 1.16.
- `.gitignore` para manter evidencias brutas fora do pacote versionavel.
- Teste API pequeno para CSV de Clientes.

## Validacao visual curta

Executada por revisao de codigo/CSS e reaproveitamento das evidencias reais da Fase 1.16.

Checklist:
- Hub inicial: sem mudanca estrutural.
- Financeiro: sem mudanca estrutural.
- Atendimentos: sem mudanca estrutural.
- Vendas de produtos: sem mudanca estrutural.
- Estoque: segue em `BACKEND_EXPORT_REPORTS`.
- Profissionais: texto de ocupacao ficou explicitamente estimado.
- Comissoes: sem mudanca estrutural.
- Auditoria owner: sem mudanca estrutural.
- Mobile hub: CSS responsivo preservado.
- Filtro customizado: sem mudanca de handlers.
- Botao CSV: agora tambem habilitado para Clientes.

Ressalva: nesta fase nao foi executada nova sessao de Chrome/CDP. A ultima evidencia real segue sendo a Fase 1.16.

## Validacao operacional curta

Comandos executados nesta fase:

- `npm.cmd run build`: passou.
- `npm.cmd run test`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox (`67 passed | 11 skipped`).
- `npm.cmd run smoke:api`: passou.
- `npm.cmd run test:db`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox (`11 passed`).

Contratos validados por teste/smoke:
- CSV financeiro.
- CSV estoque no smoke/contratos existentes.
- CSV auditoria owner-only por testes existentes.
- Export operacional de appointments para profissional por teste existente.
- Cross-unit 403 por teste existente.
- CSV Clientes com cabecalhos humanos e sem IDs tecnicos por teste novo.

## Release readiness

Status: pronto para release controlado.

Justificativa:
- Hub funciona e foi validado em navegador real na Fase 1.16.
- Backend gerencial funciona.
- CSV backend funciona, incluindo Estoque e Clientes.
- Permissoes sensiveis seguem cobertas por testes.
- Build, testes, smoke e test DB passaram.
- Tailwind CDN segue como risco aceito somente para ambiente controlado.
- Evidencias foram revisadas e saneadas para versionamento.
- Limitacoes conhecidas estao documentadas.

## Arquivos alterados

- `.gitignore`
- `.planning/117_RELEASE_VISUAL_RELATORIOS_RESSALVAS_FINAIS.md`
- `.planning/evidence/fase-116/MANIFEST.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`
- `public/app.js`
- `public/modules/relatorios.js`
- `src/domain/types.ts`
- `src/http/app.ts`
- `src/application/operations-service.ts`
- `src/application/prisma-operations-service.ts`
- `tests/api.spec.ts`

## Riscos restantes

- Tailwind CDN precisa ser substituido por pipeline CSS antes de producao real/publica.
- Ocupacao de profissionais ainda nao e calculo completo de agenda/capacidade.
- Evidencias brutas ficam locais; se a equipe precisar delas fora do ambiente, deve publicar pacote separado e revisado.
- `public/app.js` segue grande e deve ser reduzido gradualmente, sem reescrita.
- Excel/PDF continuam fora do escopo.

## Criterios de aceite

- Tailwind CDN tem decisao clara: mitigado/documentado.
- Evidencias tem decisao clara: manifest versionavel e brutos ignorados.
- Ocupacao de profissionais esta documentada como parcial/estimada.
- Clientes CSV tem decisao clara: implementado.
- Regressao visual curta registrada.
- Build passou.
- Testes passaram.
- Smoke passou.
- `test:db` passou.
- Documentacao da fase criada.
- Implementation log e next priorities atualizados.

## Validacoes executadas

- `npm.cmd run build`: passou.
- `npm.cmd run test`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox (`67 passed | 11 skipped`).
- `npm.cmd run smoke:api`: passou.
- `npm.cmd run test:db`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox (`11 passed`).
- Revisao de evidencias locais da Fase 1.16: concluida.
- Revisao de dependencias Tailwind: concluida.
- Revisao de texto/CSV de Relatorios: concluida.

## Proxima fase recomendada

Fase 1.18 - Release controlado dos Relatorios em ambiente alvo interno: configurar ambiente alvo, confirmar `CORS_ORIGIN`, rodar smoke remoto, fazer uma passada visual humana curta no host real e coletar feedback operacional antes de qualquer producao publica.
