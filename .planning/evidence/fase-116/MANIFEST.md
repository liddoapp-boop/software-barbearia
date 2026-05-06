# Manifest de evidencias - Fase 1.16

Data da revisao: 2026-05-06
Decisao Fase 1.17: manter este manifest versionavel e deixar artefatos brutos locais/ignorados.

## Resumo

A validacao visual real da Fase 1.16 gerou screenshots, JSONs de navegacao/network e CSVs baixados pelo browser em `.planning/evidence/fase-116/`.

Total revisado: 30 arquivos, aproximadamente 15.8 MB.

## Motivo da decisao

- Screenshots e CSVs sao uteis como evidencia local de auditoria visual.
- Os CSVs contem dados operacionais de demonstracao, incluindo nomes de cliente/profissional e e-mail de owner em auditoria.
- Os arquivos binarios pesam mais do que a documentacao textual da fase.
- Para release controlado, o repositorio deve carregar a prova textual e nao os artefatos brutos da sessao.

## Politica aplicada

- Versionar este manifest e os documentos `.planning/*.md`.
- Manter screenshots, JSONs de browser e downloads CSV apenas no ambiente local.
- Ignorar os artefatos brutos por `.gitignore`.
- Se for preciso publicar evidencias para auditoria externa, gerar pacote separado e revisar dados sensiveis antes do envio.

## Artefatos gerados localmente

- `browser-validation.json`
- `browser-csv-after-smoke.json`
- `browser-stock-export-fixed.json`
- `desktop-01-hub-inicial.png`
- `desktop-02-financeiro.png`
- `desktop-03-atendimentos.png`
- `desktop-04-vendas-produtos.png`
- `desktop-05-estoque.png`
- `desktop-06-profissionais.png`
- `desktop-07-auditoria-owner.png`
- `desktop-08-comissoes.png`
- `desktop-09-pos-export-csv.png`
- `desktop-10-permissao-recepcao.png`
- `desktop-10-permissao-profissional.png`
- `desktop-11-today-financeiro-com-dados.png`
- `desktop-12-today-atendimentos-com-dados.png`
- `desktop-13-today-vendas-com-dados.png`
- `desktop-14-today-estoque-com-dados.png`
- `desktop-15-today-profissionais-com-dados.png`
- `desktop-16-today-comissoes-com-dados.png`
- `desktop-17-today-auditoria-com-dados.png`
- `desktop-18-stock-export-fixed.png`
- `mobile-01-hub-relatorios.png`
- `mobile-02-vendas.png`
- `mobile-03-periodo-customizado.png`
- `downloads/relatorio-financial-unit-01-2026-05-06-2026-05-07.csv`
- `downloads/relatorio-appointments-unit-01-2026-05-06-2026-05-07.csv`
- `downloads/relatorio-product-sales-unit-01-2026-05-06-2026-05-07.csv`
- `downloads/relatorio-stock-unit-01-2026-05-06-2026-05-07.csv`
- `downloads/relatorio-professionals-unit-01-2026-05-06-2026-05-07.csv`
- `downloads/relatorio-commissions-unit-01-2026-05-06-2026-05-07.csv`
- `downloads/relatorio-audit-unit-01-2026-05-06-2026-05-07.csv`

## Observacao de privacidade

Os dados observados parecem ser de desenvolvimento/smoke, mas ainda representam dados operacionais identificaveis. Por isso, permanecem fora do pacote versionavel por padrao.
