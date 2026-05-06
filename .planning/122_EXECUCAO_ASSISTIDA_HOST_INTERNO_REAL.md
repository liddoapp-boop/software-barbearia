# Fase 1.22 - Execucao assistida no host interno real

Data: 2026-05-06
Decisao final: bloqueado

## 1. Resumo executivo

A fase consolidou a validacao tecnica local e o pacote segue estavel para continuidade, mas a liberacao para release controlado interno real permanece bloqueada por ausencia de ambiente alvo real informado/validado e por falta de comprovacao de backup/restore no PostgreSQL alvo.

## 2. Ambiente alvo interno real

Status: bloqueado por ausencia de dados do alvo.

- URL/base real: nao informada.
- Protocolo: nao informado.
- Host: nao informado.
- Porta: nao informada.
- Tipo de alvo (LAN, VPS, servidor interno, tunel): nao informado.

Sem esses dados, a fase nao pode classificar smoke como remoto real.

## 3. Validacao de `.env` (sem exposicao de segredo)

Checklist no ambiente desta execucao:

- `DATA_BACKEND`: presente.
- `DATABASE_URL`: presente.
- `AUTH_SECRET`: presente, porem fraco para release (`len=20`).
- `AUTH_ENFORCED`: presente.
- `CORS_ORIGIN`: ausente.
- `NODE_ENV`: presente.
- `PORT`: presente.

Controles de seguranca:

- Nenhum valor sensivel foi impresso.
- `.env` permanece ignorado no Git (`.gitignore` contem `.env`).
- `.env` nao foi commitado.

Conclusao: configuracao local nao atende requisitos de release interno real forte.

## 4. PostgreSQL alvo e backup/restore

Status: bloqueado para release real.

- Nao houve confirmacao de PostgreSQL alvo real.
- Nao houve comprovacao de backup/restore no alvo real.
- Nao foi executado seed destrutivo em base real.

Comandos de referencia (documentais) para operacao assistida:

- Backup: `pg_dump --format=custom --no-owner --no-privileges --file=<backup>.dump <DATABASE_URL>`
- Restore: `pg_restore --clean --if-exists --no-owner --no-privileges --dbname=<DATABASE_URL_DESTINO> <backup>.dump`

## 5. Smoke remoto

Status: nao executado em host real (bloqueado).

- `npm.cmd run smoke:api`: passou localmente no ambiente atual.
- `SMOKE_BASE_URL` real de host interno: nao informado.
- Classificacao desta rodada: validacao local, nao release real.

Cobertura validada localmente:

- health/login
- agenda
- checkout
- venda de produto
- devolucao
- financeiro
- comissoes
- auditoria
- relatorios gerenciais
- CSV (incluindo clients)
- `401` sem token
- `403` cross-unit/role

## 6. Checklist visual desktop/mobile no host real

Status: bloqueado.

Nao foi possivel executar validacao visual em host real para:

- login/sessao
- menu por perfil (owner, recepcao, profissional)
- dashboard
- agenda
- checkout
- PDV
- financeiro
- estoque
- comissoes
- auditoria
- relatorios
- exportacao CSV
- estados vazios/erro/permissoes

## 7. Validacoes obrigatorias da fase

- `npm.cmd run build`: passou.
- `npm.cmd run test`: falhou no sandbox por `spawn EPERM`; passou fora do sandbox (`70 passed | 11 skipped`).
- `npm.cmd run test:db`: falhou no sandbox por `spawn EPERM`; reexecucao fora do sandbox foi bloqueada por seguranca automatica devido risco de escrita em banco nao isolado.
- `npm.cmd run smoke:api`: passou localmente.
- `git diff --check`: passou com warnings LF/CRLF.
- `git status --short`: executado; worktree permanece com alteracoes pre-existentes + fase atual.

## 8. Bloqueios reais (P0)

1. Host interno real nao definido.
2. `.env` real do alvo nao validado.
3. `AUTH_SECRET` local fraco e `CORS_ORIGIN` ausente para padrao de release.
4. PostgreSQL alvo real nao comprovado.
5. Backup/restore nao comprovados no alvo real.
6. Smoke remoto com `SMOKE_BASE_URL` real nao executado.
7. Checklist visual desktop/mobile no host real nao executado.
8. `test:db` sem reexecucao assistida em banco explicitamente isolado.

## 9. Decisao final

Bloqueado para release controlado interno real.

## 10. Proxima fase recomendada

Fase 1.23 - Janela assistida de homologacao no host interno real:

1. Informar URL/protocolo/host/porta e tipo de ambiente alvo.
2. Validar `.env` real forte no alvo (`DATA_BACKEND=prisma`, `AUTH_ENFORCED=true`, `AUTH_SECRET` forte, `CORS_ORIGIN` restrito).
3. Confirmar e evidenciar backup/restore do PostgreSQL alvo antes de qualquer alteracao estrutural.
4. Rodar smoke remoto com `SMOKE_BASE_URL` real.
5. Executar checklist visual desktop/mobile no host real por perfil.
6. Reavaliar decisao: aprovado, aprovado com ressalvas ou bloqueado.
