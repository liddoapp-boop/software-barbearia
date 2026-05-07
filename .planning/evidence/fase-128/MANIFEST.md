# Manifesto de Evidencias - Fase 1.28

Data: 2026-05-06
Fase: 1.28 - Homologacao fisica mobile operacional + microajustes finais
Decisao: APROVADO COM RESSALVAS

## Evidencias tecnicas
1. `git status --short` inicial registrado.
2. `npm.cmd run build` passou.
3. `npm.cmd run test` passou fora do sandbox (`70 passed | 11 skipped`) apos `spawn EPERM` no sandbox.
4. `npm.cmd run smoke:api` passou.
5. `git diff --check` executado.
6. `git status --short` final registrado.

## Evidencias funcionais/mobile
1. Checklist de fluxos mobile consolidado em `.planning/128_HOMOLOGACAO_FISICA_MOBILE_OPERACIONAL.md`.
2. Classificacao por fluxo registrada (Facil/Medio/Dificil/Bloqueado).
3. Registro explicito da ressalva por ausencia de rodada fisica completa nesta sessao.

## Pendencias
1. Rodar homologacao fisica em smartphone real na mesma rede local com URL/IP da maquina.
2. Validar teclado mobile e ergonomia final em aparelho real.
3. `test:db` segue pendente por seguranca ate comprovacao de banco isolado.
