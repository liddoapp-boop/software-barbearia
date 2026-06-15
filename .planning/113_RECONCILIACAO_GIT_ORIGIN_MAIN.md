# Fase 1.1.2 - Reconciliacao segura do Git com origin/main

Data: 2026-06-15

## Objetivo
Reconciliar a divergencia entre a branch local `main` da VPS e `origin/main` no repositorio correto `git@github.com:liddoapp-boop/software-barbearia.git`, preservando os commits locais e evitando sobrescrever o sistema maduro.

## Estado inicial
Comandos executados antes de qualquer merge/rebase:
- `git status --short`
- `git status -sb`
- `git remote -v`
- `git log --oneline --decorate --graph --all -40`
- `git show --stat --name-status origin/main`
- `git show --stat --name-status 9269836`
- `git diff --stat HEAD..origin/main`
- `git diff --name-status HEAD..origin/main`
- `git diff --stat origin/main..HEAD`
- `git diff --name-status origin/main..HEAD`

Resultado:
- Branch atual: `main`.
- Estado: `main...origin/main [ahead 23, behind 1]`.
- Remote: `git@github.com:liddoapp-boop/software-barbearia.git`.
- `.env` nao apareceu no status.
- `test-results/` apareceu como untracked e permaneceu fora do staging.
- Nao havia arquivos modificados no worktree alem de `test-results/`.

## Origem da divergencia
O remote correto recebeu um forced update:

```text
+ e70a140...9269836 main -> origin/main (forced update)
```

O commit remoto ausente localmente e:

```text
9269836 feat: scaffold dashboard and agenda modules with mobile-first layout and navigation shell
```

O historico local possui 23 commits que nao estao no remoto correto.

## Branch de seguranca
Criada branch local de backup antes de qualquer reconciliacao:

```text
backup/pre-reconcile-origin-main-20260615-121401
```

A branch nao foi enviada para o remoto.

## Commit remoto analisado
Commit:

```text
9269836 feat: scaffold dashboard and agenda modules with mobile-first layout and navigation shell
```

Arquivos tocados diretamente pelo commit remoto:
- `.planning/124_VALIDACAO_VISUAL_PREMIUM_TESTDB_ISOLADO.md`
- `.planning/125_HOMOLOGACAO_VISUAL_REAL_FRONTEND_PREMIUM.md`
- `.planning/126_MOBILE_FIRST_OPERACIONAL_PREMIUM.md`
- `.planning/126_REDESIGN_VISUAL_PERCEPTIVEL_FRONTEND_PREMIUM.md`
- `.planning/127_HOMOLOGACAO_VISUAL_MOBILE_OPERACIONAL.md`
- `.planning/128_HOMOLOGACAO_FISICA_MOBILE_OPERACIONAL.md`
- `.planning/129_HOMOLOGACAO_FINAL_RELEASE_CONTROLADO_INTERNO.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`
- `.planning/evidence/fase-124/MANIFEST.md`
- `.planning/evidence/fase-125/MANIFEST.md`
- `.planning/evidence/fase-126/MANIFEST.md`
- `.planning/evidence/fase-127/MANIFEST.md`
- `.planning/evidence/fase-128/MANIFEST.md`
- `.planning/evidence/fase-129/MANIFEST.md`
- `public/app.js`
- `public/components/sidebar.js`
- `public/components/topbar.js`
- `public/index.html`
- `public/modules/agenda.js`
- `public/modules/dashboard.js`
- `public/styles/layout.css`

## Analise de risco
O commit remoto parece ser um scaffold visual/mobile posterior ao ancestral comum, mas o historico local evoluiu muito alem dele. A comparacao `HEAD..origin/main` mostra risco alto de regressao:
- removeria documentos de hardening e reconciliacao recentes;
- removeria evidencias de validacao visual e testes;
- removeria ou reduziria arquivos de frontend relevantes;
- alteraria `package.json`, `package-lock.json`, Prisma, backend HTTP, seguranca, testes e modulos publicos;
- reduziria drasticamente `public/app.js` e `public/styles/layout.css`;
- removeria arquivos ligados a sanitizacao, mobile overflow, smoke API e frontend tests.

A simulacao de merge sem alterar o worktree indicou conflitos de conteudo em:
- `.planning/24_NEXT_PRIORITIES.md`
- `public/app.js`
- `public/components/sidebar.js`
- `public/components/topbar.js`
- `public/index.html`
- `public/modules/agenda.js`
- `public/modules/dashboard.js`
- `public/styles/layout.css`

Esses arquivos incluem areas criticas de frontend, agenda, dashboard, mobile e layout visual. O risco de sobrescrever a versao local madura e alto.

## Estrategia escolhida
Opcao D - Bloquear e pedir decisao humana.

Motivos:
- o remote sofreu forced update;
- `origin/main` nao e ancestral de `HEAD`;
- `HEAD` tambem nao e ancestral de `origin/main`;
- o push normal nao seria fast-forward;
- a simulacao de merge encontrou conflitos em arquivos centrais;
- a comparacao indica que aceitar `origin/main` inteiro pode regredir frontend, dashboard, agenda, mobile, seguranca, testes e documentacao recente;
- rebase sobre o commit remoto antigo/scaffold teria risco alto e muitos conflitos.

## Merge/rebase
Nao executado.

Comando de simulacao executado:

```text
git merge-tree --write-tree --name-only HEAD origin/main
```

Resultado: conflitos previstos nos arquivos listados acima.

## Testes executados
Nao executados nesta fase.

Motivo:
- nenhum merge, rebase ou alteracao de codigo de aplicacao foi aplicada;
- a fase foi bloqueada antes da reconciliacao para evitar regressao;
- testes completos devem ser executados apos uma estrategia humana de reconciliacao ser escolhida e aplicada em branch controlada.

## Decisao final
BLOQUEADO.

Nao esta seguro fazer `git push origin main` agora, porque a branch segue divergente e o push normal exigiria reconciliacao previa. Tambem nao esta autorizado nem recomendado usar force push.

## Proxima etapa recomendada
Decidir humanamente entre:
1. criar uma branch de integracao e fazer merge controlado preservando explicitamente a versao local madura nos conflitos;
2. cherry-pick parcial do que for util de `9269836`, se houver algo ainda relevante;
3. confirmar que `9269836` e scaffold obsoleto e planejar uma estrategia de publicacao que nao sobrescreva o sistema maduro, sem force push ate haver aprovacao explicita de manutencao de historico.
