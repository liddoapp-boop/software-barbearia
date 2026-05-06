# Fase 1.14 - Contrato backend de relatorios gerenciais e exportacao profissional

Data: 2026-05-06
Decisao final: aprovado com ressalvas

## Resumo executivo

A fase criou uma base backend dedicada para relatorios gerenciais por periodo, com endpoints sob `/reports/management`, contratos humanizados e exportacao CSV server-side. O frontend de Relatorios passa a preferir os novos contratos, mantendo o CSV simples local como fallback. Nao houve migration, schema Prisma novo, PDF, Excel nem alteracao de regra financeira, estoque, comissao ou agenda.

## Objetivo da fase

Transformar Relatorios em uma camada confiavel para analise historica, conferencia, fechamento e exportacao, separada do Dashboard. Dashboard continua sendo decisao rapida; Relatorios passa a ser recorte por periodo com rastreabilidade e contratos explicitos.

## Por que backend dedicado

Na Fase 1.13 o frontend compunha relatorios a partir de muitos endpoints operacionais. Isso funcionava para uma primeira camada, mas deixava Estoque, Profissionais e Auditoria vagos/parciais, dificultava exportacao padronizada e aumentava risco de divergencia entre UI, CSV e fechamento. A Fase 1.14 centraliza agregacoes sem duplicar regras de negocio criticas.

## Mapeamento do estado anterior

- Financeiro consumia `/financial/summary`, `/financial/transactions`, `/financial/commissions`, `/financial/reports` e `/financial/management/overview`.
- Atendimentos consumia `/appointments`.
- Vendas consumia `/sales/products`.
- Estoque consumia `/inventory`, sem recorte historico forte por periodo na UI.
- Clientes consumia `/clients/overview`.
- Comissoes consumia `/financial/commissions`.
- Profissionais consumia `/professionals/performance`.
- Auditoria consumia `/audit/events`.
- Estoque precisava de contrato historico de movimentos por periodo.
- Profissionais precisava juntar atendimentos, receitas e comissoes por periodo.
- Auditoria precisava de resumo gerencial owner-only sem expor JSON bruto.

## Endpoints criados

- `GET /reports/management/summary`
- `GET /reports/management/financial`
- `GET /reports/management/appointments`
- `GET /reports/management/product-sales`
- `GET /reports/management/stock`
- `GET /reports/management/professionals`
- `GET /reports/management/audit`
- `GET /reports/management/export.csv`

## Filtros suportados

Todos os endpoints aceitam:

- `unitId`
- `start`
- `end`

Filtros adicionais:

- `limit` nos relatorios com listas/exportacao.
- `professionalId` em atendimentos, vendas e profissionais.
- `productId` em vendas.
- `type` em `/reports/management/export.csv`.

## Contratos por relatorio

Financeiro retorna periodo, completude, resumo de entradas/saidas/saldo/resultado, receita de servicos, receita de produtos, comissoes pagas, estornos/devolucoes, lancamentos manuais, breakdown por categoria, breakdown por origem e linhas detalhadas humanizadas.

Atendimentos retorna total, concluidos, confirmados, em atendimento, cancelados, faltas, bloqueados, receita estimada/realizada, servicos mais realizados, profissionais com mais atendimentos, volume por dia e lista resumida.

Vendas de produtos retorna total vendido, quantidade de vendas, receita liquida simples de produtos, ticket medio, devolucoes, valor devolvido, produtos mais vendidos e lista resumida de vendas.

Estoque retorna produtos sem estoque, criticos, abaixo do minimo, movimentacoes do periodo, entradas, saidas, perdas, consumo interno, consumo por servico, entradas por devolucao quando identificaveis, saidas por venda, ajustes manuais, reposicao sugerida, produtos com maior saida e produtos sem movimento.

Profissionais retorna ranking por receita, atendimentos concluidos, receita de servicos, receita de produtos vinculada, receita total, ticket medio, comissoes pendentes, pagas e totais. Ocupacao fica parcial porque depende de grade historica fechada.

Auditoria retorna total de eventos, eventos criticos/sensiveis, estornos/devolucoes, pagamentos de comissao, lancamentos manuais, alteracoes de configuracao, acoes por ator, acoes por entidade e eventos recentes sem JSON bruto.

Summary retorna cards/resumos por relatorio, status de completude, indicadores principais, `hasData` e mensagens de limitacao.

## Permissoes

- Owner acessa todos os relatorios.
- Auditoria e exportacao de auditoria sao owner-only.
- Financeiro, resumo geral e comissoes continuam sensiveis.
- Vendas de produtos segue politica operacional de owner/recepcao.
- Atendimentos, estoque e profissionais seguem permissao operacional existente.
- Tenant guard por `unitId` permanece centralizado no `preHandler` e bloqueia cross-unit quando autenticado.

## Exportacao CSV

`GET /reports/management/export.csv` aceita tipos:

- `financial`
- `appointments`
- `product-sales`
- `stock`
- `professionals`
- `commissions`
- `audit`

O CSV retorna `Content-Type: text/csv; charset=utf-8`, `Content-Disposition` com filename claro, BOM UTF-8, separador `;`, cabecalhos humanos, valores monetarios numericos normalizados e sem JSON bruto. IDs tecnicos so permanecem quando necessarios para rastreabilidade interna do contrato, nao como coluna principal.

PDF/Excel nao foram implementados. A estrutura atual prepara essa evolucao, mas evita dependencia pesada e promessa prematura.

## Impacto no frontend

`public/modules/relatorios.js` agora prefere `managementFinancial`, `managementAppointments`, `managementProductSales`, `managementStock`, `managementProfessionals` e `managementAudit`. `public/app.js` passou a carregar `/reports/management/*` e baixar CSV backend antes de acionar o CSV local. O visual premium da Fase 1.13 foi preservado.

## Compatibilidade memory e Prisma

Os agregadores foram implementados em `OperationsService` e `PrismaOperationsService`. No memory, a auditoria usa o array em memoria; no Prisma, usa `AuditLog`. Estoque e vendas usam os movimentos/vendas existentes em cada backend. Nao houve migration.

## Dados completos

- Financeiro consolidado por periodo.
- Atendimentos por periodo.
- Vendas/produtos por periodo com devolucoes.
- Estoque com movimentacoes historicas disponiveis no periodo.
- Auditoria resumida por periodo.
- Exportacao CSV server-side.

## Dados ainda parciais

- Ocupacao de profissionais continua parcial por falta de grade historica fechada de disponibilidade/capacidade.
- Estoque depende da qualidade de `referenceType` nos movimentos antigos; quando a origem nao e determinavel, o contrato usa fallback honesto.
- Auditoria e resumo gerencial nao substituem a tela Auditoria tecnica.

## Impacto no smoke/testes

O smoke foi ampliado para consultar summary, financial, product-sales, stock e export CSV. Testes API cobrem contratos principais, CSV, auditoria owner-only e tenant guard. Teste DB Prisma foi adicionado para relatorios gerenciais e CSV com dados persistidos, mas nao foi reexecutado apos a inclusao por limite da aprovacao automatica.

## Riscos

- `public/app.js` segue grande e acumulando orquestracao.
- Summary ficou owner-only para evitar vazamento financeiro em card consolidado.
- O smoke local pode bater em servidor antigo se a porta padrao ja estiver ocupada.
- `src/server.ts` usa `dotenv.config({ override: true })`, o que dificultou subir smoke em porta alternativa quando `.env` define `PORT=3333`.

## Criterios de aceite

- Endpoints dedicados existem.
- Summary existe.
- CSV backend existe para os tipos principais.
- Frontend consome novos contratos e mantem fallback local.
- Estoque, Profissionais e Auditoria ganharam contratos claros.
- Permissoes e tenant guard foram preservados.
- Testes API foram adicionados.
- Build passa.
- Teste geral passou fora do sandbox.
- Smoke atualizado, com falha justificada por ambiente/servidor antigo.

## Validacoes executadas

- `npm.cmd run build`: passou.
- `npm.cmd run test -- --runInBand`: falhou porque Vitest nao aceita `--runInBand`; comando invalido, sem testar codigo.
- `npm.cmd run test`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox (`2 passed | 1 skipped`, `66 passed | 10 skipped`).
- `npm.cmd run smoke:api`: falhou contra API ja rodando em `3333` sem as novas rotas, retornando `404` em `/reports/management/summary`.
- `SMOKE_BASE_URL=http://127.0.0.1:3334 npm.cmd run smoke:api`: falhou no sandbox por tentativa de acesso a `binaries.prisma.sh`; fora do sandbox falhou porque `dotenv override` fez o servidor tentar usar `3333`, ja ocupado.
- `npm.cmd run test:db`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox antes do teste DB novo (`10 passed`). A reexecucao apos adicionar o teste DB novo foi recusada por limite da aprovacao automatica.

## Proxima fase recomendada

Fase 1.15 - Validacao operacional/visual de Relatorios com backend real: subir API atual, validar Relatorios em desktop/mobile, resolver o problema de smoke em porta alternativa, e revisar permissao do summary para perfis nao-owner com resposta filtrada em vez de bloqueio total se o produto exigir.
