# 23 - Riscos Tecnicos e de Escala (V2)

## Visao geral
Atualizacao de riscos estruturais prioritarios para escala SaaS.

## Implementado
- Base funcional robusta do core e schema amplo para evolucao.

## Incompleto
- Modularizacao frontend ainda pendente.
- Processamento assinc real para automacoes nao implementado.

## Problemas
- `public/app.js` monolitico e principal risco de velocidade/qualidade.
- Duplicidade parcial de regra em services memory/prisma aumenta custo de manutencao.
- Modelo de auth ainda simples para padrao enterprise.

## Dependencias
Riscos afetam todos modulos, principalmente agenda/checkout/financeiro.

## Impacto no funil
Escala sem tratar esses riscos eleva chance de regressao no fluxo principal.
