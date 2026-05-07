# Manifesto de Evidencias - Fase 1.26

Data: 2026-05-06
Fase: Mobile-first operacional premium

## Escopo implementado
- Repriorizacao mobile para Dashboard, Agenda e PDV.
- Colapso de blocos secundarios no mobile.
- Compactacao visual de cards e filtros em telas operacionais.

## Evidencias tecnicas
- Alteracoes em `public/index.html` (paines progressivos mobile).
- Alteracoes em `public/app.js` (modo inicial da Agenda no mobile + sincronizacao de paineis).
- Alteracoes em `public/modules/agenda.js` (acao primaria por status + acoes secundarias recolhiveis).
- Alteracoes em `public/styles/layout.css` (regras mobile-first de densidade e toque).

## Validacoes obrigatorias
- `npm.cmd run build`: OK
- `npm.cmd run test`: OK (fora do sandbox apos EPERM no sandbox)
- `npm.cmd run smoke:api`: OK
- `git diff --check`: OK

## Observacao de seguranca
- `test:db` nao executado nesta fase por ausencia de comprovacao explicita de banco isolado.
