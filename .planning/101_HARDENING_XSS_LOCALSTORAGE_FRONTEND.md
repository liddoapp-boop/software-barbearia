# Fase 0.9.7 - Hardening XSS, localStorage e sanitizacao do frontend

Data: 2026-06-07

## Objetivo

Reduzir risco pratico de XSS no frontend sem redesenhar telas, sem trocar arquitetura de autenticacao e sem quebrar o fluxo de agendamento publico. A fase priorizou pontos em que dados de API, usuario ou mensagens de erro eram inseridos em `innerHTML`.

## Baseline Git antes da fase

- Branch: `main...origin/main [ahead 1]`.
- Worktree ja estava suja antes desta fase, com alteracoes em `.env.example`, `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`, `.planning/24_NEXT_PRIORITIES.md`, `package*.json`, `prisma/seed.ts`, varios arquivos em `public/`, `src/application/`, `src/http/` e testes.
- Arquivos ja nao rastreados antes desta fase: `.planning/99_HARDENING_PRODUCAO_AMBIENTE_DEPENDENCIAS.md`, `.planning/100_CORRECAO_TESTDB_SMOKE_ISOLADO.md`, `scripts/smoke-api-flow.mjs`.
- Commit recente no inicio: `7407bd1 fix: aplicar rbac e corrigir permissoes criticas`.

Nenhuma alteracao preexistente foi revertida.

## Inventario de risco

Alto:
- `public/modules/feedback.js`: mensagens de erro vindas de API eram renderizadas como HTML.
- `public/booking.html`: fluxo publico renderizava nome, servico, horarios, historico salvo e mensagens de erro em HTML.
- `public/app.js`: checkout, estornos, devolucoes, historico de venda, filtro de auditoria, busca de cliente e selects compartilhados recebiam dados dinamicos.
- `public/components/topbar.js`: label de modulo entrava direto em HTML.

Medio:
- Muitos modulos ja tinham helpers locais `escapeHtml`, mas havia duplicacao e risco de divergencia.
- Token JWT ainda fica em `localStorage`; qualquer XSS remanescente pode roubar sessao.
- CSP precisa manter `'unsafe-inline'` por causa dos scripts/styles inline atuais e dependencias CDN.

Baixo:
- `innerHTML` usado para skeletons, SVGs, layout estatico e templates controlados pelo proprio app.

## Alteracoes implementadas

1. Criado helper central `public/modules/sanitize.js`:
   - `escapeHtml`
   - `safeText`
   - `safeAttr`
   - `safeNumber`
   - `safeCurrency`
   - `safeDate`

2. `public/components/operational-ui.js` agora importa e reexporta o helper central, preservando o padrao de imports ja usado por varios modulos.

3. `public/modules/feedback.js` agora escapa mensagens antes de montar `panel-msg`, evitando render bruto de `error.message`.

4. `public/app.js` recebeu escapes em pontos de maior risco:
   - busca de cliente;
   - selects compartilhados;
   - checkout de atendimento;
   - modal de estorno de atendimento;
   - modal de devolucao de produto;
   - historico/drawer de vendas;
   - filtro de ator da auditoria;
   - feedback de erro de servico;
   - logout usando limpeza central de sessao.

5. `public/booking.html` recebeu escapes no fluxo publico:
   - mensagens do usuario em bolhas;
   - nome do cliente e empresa;
   - cards de servico;
   - horarios e slots;
   - confirmacao;
   - historico local de agendamentos;
   - mensagens de erro vindas do backend.

6. `public/components/topbar.js` agora escapa o label do modulo.

7. `public/login.html` passou a persistir uma versao menor de `user` em `sb.authSession`, mantendo apenas campos necessarios (`id`, `email`, `name`, `role`, `activeUnitId`, `unitIds`).

8. `public/index.html` limpa `authToken` e `sb.authSession` quando detecta token JWT expirado.

9. `src/http/app.ts` passou a enviar headers de seguranca:
   - `Content-Security-Policy`;
   - `X-Content-Type-Options: nosniff`;
   - `Referrer-Policy: strict-origin-when-cross-origin`.

## CSP aplicada

CSP compativel aplicada:

```text
default-src 'self';
script-src 'self' 'unsafe-inline' https://www.gstatic.com https://unpkg.com https://cdn.jsdelivr.net;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: https:;
connect-src 'self' https:;
object-src 'none';
base-uri 'self';
frame-ancestors 'self';
form-action 'self'
```

Nao foi aplicada CSP estrita sem inline porque o frontend atual ainda depende de scripts/styles inline e CDNs. A proxima evolucao deve remover inline scripts/styles e substituir CDNs por assets controlados para permitir CSP com nonce/hash ou sem `'unsafe-inline'`.

## localStorage

Decisao da fase:
- Nao migrar JWT para cookie httpOnly agora, pois isso exige mudanca de contrato de auth, CORS/cookies, CSRF e smoke.
- Documentar risco e reduzir payload persistido.
- Limpar sessao de forma mais consistente em logout e token expirado.

Risco remanescente:
- Enquanto `authToken` ficar em `localStorage`, qualquer XSS restante pode extrair o token. A mitigacao real e migrar auth para cookie httpOnly/SameSite com estrategia CSRF.

## Testes adicionados

- `tests/frontend-sanitize.spec.ts`: cobre escape de tags, aspas, ampersand e fallback seguro.
- `tests/api.spec.ts`: cobre headers minimos de seguranca em `/health`.

## Validacao

- `node --input-type=module --check` nos JS alterados e nos scripts inline alterados de HTML: passou.
- `npm test -- --run tests/frontend-sanitize.spec.ts tests/api.spec.ts -t "frontend sanitize helpers|headers minimos"`: passou (`3 passed | 66 skipped`).
- `npm run build`: passou.
- `npm run test`: passou (`83 passed | 11 skipped`).
- `npm audit --audit-level=moderate`: passou com `0 vulnerabilities`.
- `NODE_ENV=development DATA_BACKEND=memory node ... app.inject('/app.js')`: passou, confirmando CSP e `nosniff` tambem em asset estatico.
- `DATA_BACKEND=memory SMOKE_BASE_URL=http://127.0.0.1:3334 npm run smoke:api`: falhou cedo no ambiente atual porque `NODE_ENV` estava production-like e o smoke exige credenciais explicitas nesse caso. Comportamento esperado.
- `NODE_ENV=development DATA_BACKEND=memory SMOKE_BASE_URL=http://127.0.0.1:3334 npm run smoke:api`: passou.
- Verificado que a porta `3334` ficou fechada apos o smoke.

## Limites e pendencias

- Ainda existem `innerHTML` legitimos e varios renderizadores com helpers locais em modulos de tela. Esta fase tratou os pontos de maior risco, nao fez refatoracao completa do frontend.
- CSP ainda permite `'unsafe-inline'`.
- Token segue em `localStorage`.
- Recomenda-se proxima fase para:
  1. migrar autenticacao para cookie httpOnly/SameSite;
  2. remover inline scripts/styles e CDNs para endurecer CSP;
  3. centralizar o restante dos helpers locais de escape;
  4. adicionar testes DOM para garantir que mensagens de API maliciosas aparecem como texto.

## Decisao

Aprovado localmente para reducao de risco XSS/frontend. Release/deploy continua bloqueado ate smoke remoto autenticado, ambiente real validado e estrategia de token/cookie ser definida.
