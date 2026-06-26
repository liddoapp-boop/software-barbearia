# Sprint 225.0 - Desbloqueio do catalogo publico em producao

Data: 2026-06-25

## 1. Objetivo

Descobrir por que `/public/services` no dominio publico ainda expunha servicos demo/teste/TG antes da Sprint 225 - Validacao publica final mobile, apesar das blindagens registradas nas Sprints 222 e 224 estarem em `main`.

## 2. Contexto do bloqueio da Sprint 225

A Sprint 225 foi bloqueada porque o dominio:

`https://barbearia.76-13-161-250.nip.io/agendamento?unitId=unit-01`

respondia `200`, mas o endpoint publico `/public/services?unitId=unit-01` ainda retornava itens que deveriam estar ocultos:

- `demo-svc-combo`
- `demo-svc-degrade`
- `demo-svc-sobrancelha`
- `demo-svc-hidratacao`
- `Servico Teste Comissao TG`

Isso viola a blindagem esperada para catalogo publico e impede validacao mobile final.

## 3. Evidencia da exposicao publica

Chamadas readonly executadas nesta fase:

- `curl -fsS http://127.0.0.1:3333/public/services?unitId=unit-01`
- `curl -fsS https://barbearia.76-13-161-250.nip.io/public/services?unitId=unit-01`

Resultado: localhost interno e dominio publico retornaram a mesma lista com 7 servicos, incluindo os IDs `demo-svc-*` e o servico `Servico Teste Comissao TG`.

## 4. Hipoteses investigadas

| Hipotese | Resultado |
| --- | --- |
| Producao esta rodando codigo antigo | Confirmada como causa mais provavel. |
| PM2 aponta para build/processo antigo | Confirmado: processo esta online ha 4 dias e carrega codigo em memoria anterior ao build atual. |
| Dominio usa outro diretorio | Nao confirmado; PM2 aponta para `/root/software-barbearia`. |
| Endpoint passa por outro caminho de codigo | Nao confirmado; dominio e localhost retornam igual. |
| Filtro existe mas nao aplica ao formato real | Nao confirmado; chamada in-process no `dist` atual com Prisma filtra corretamente. |
| Teste local cobre fixture diferente | Parcial: testes cobrem o contrato; banco real tem dados demo/teste ativos, mas o `dist` atual filtra corretamente esses dados. |
| Endpoint do dominio difere dos testes | Nao confirmado; rota e path sao os mesmos. |
| Frontend chama sem `unitId` | Nao confirmado; `public/booking.html` acrescenta `unitId` quando presente na URL. |

## 5. Resultado local

Estado local:

- `pwd`: `/root/software-barbearia`
- `git status -sb`: `## main...origin/main`
- `HEAD`: `c1fb8abc990675a01c85a0ed0cb25fc718b551ab`
- `origin/main`: `c1fb8abc990675a01c85a0ed0cb25fc718b551ab`
- `git diff --stat`: sem alteracoes antes da documentacao.

Codigo local em `src/http/app.ts` possui:

- `hasPublicDataTestMarker`: bloqueia `teste`, `tg`, `demo`, `db` em nome, descricao, categoria e notas.
- `hasPublicIdTestMarker`: bloqueia `teste`, `tg`, `demo` em IDs e bloqueia `db` apenas como marcador delimitado, preservando UUIDs legitimos que contenham as letras `db`.
- `isPublicOperationalService`: exige ativo e aplica os filtros de ID e texto.

`public/booking.html` usa `publicUrl(path)` e acrescenta `unitId` nas rotas publicas quando a URL possui `unitId`.

Chamada in-process contra o `dist` atual e banco Prisma:

```text
GET /public/services?unitId=unit-01 -> 200
Retornou apenas:
- svc-barba / Barba Terapia
- svc-corte / Corte Premium
```

## 6. Resultado no dominio publico

`https://barbearia.76-13-161-250.nip.io/health` retornou:

```json
{"ok":true,"authEnforced":true}
```

`https://barbearia.76-13-161-250.nip.io/public/services?unitId=unit-01` retornou 7 servicos e ainda expos:

- `demo-svc-combo`
- `demo-svc-degrade`
- `demo-svc-sobrancelha`
- `demo-svc-hidratacao`
- `Servico Teste Comissao TG`

O mesmo ocorreu em `http://127.0.0.1:3333/public/services?unitId=unit-01`, entao o problema nao esta no Nginx nem em roteamento do dominio.

## 7. Resultado PM2 readonly

`pm2 list`:

- processo `software-barbearia` online.
- pid `331011`.
- uptime aproximado: 4 dias.
- restarts: 8.

`pm2 describe software-barbearia`:

- script path: `/root/software-barbearia/dist/src/server.js`
- exec cwd: `/root/software-barbearia`
- interpreter: `node`
- node.js version: `22.22.2`
- created at: `2026-06-21T15:19:55.006Z`

Arquivos em disco:

- `dist/src/http/app.js`: `2026-06-25T19:33:10.379Z`
- `dist/src/server.js`: `2026-06-25T19:33:10.393Z`
- `src/http/app.ts`: `2026-06-25T13:59:20.326Z`

Conclusao: o PM2 esta apontando para o diretorio correto, mas o processo em memoria foi iniciado antes do `dist` atual. Como Node carrega o codigo na inicializacao, o processo precisa de restart/reload controlado para passar a servir a blindagem ja compilada.

## 8. Resultado banco readonly

Consulta readonly via Prisma em `Service` para `businessId=unit-01` encontrou 7 servicos ativos:

| ID | Nome | Ativo | Duracao | Preco | Categoria | Classificacao |
| --- | --- | --- | --- | --- | --- | --- |
| `svc-barba` | Barba Terapia | true | 35 | 55 | BARBA | publico valido |
| `svc-corte` | Corte Premium | true | 45 | 75 | CORTE | publico valido |
| `demo-svc-combo` | Combo Cabelo + Barba | true | 75 | 115 | COMBO | deve ser oculto por ID demo |
| `demo-svc-degrade` | Degrade Navalhado | true | 50 | 85 | CORTE | deve ser oculto por ID demo |
| `demo-svc-sobrancelha` | Design de Sobrancelha | true | 20 | 35 | SOBRANCELHA | deve ser oculto por ID demo |
| `demo-svc-hidratacao` | Hidratacao Capilar | true | 40 | 65 | TRATAMENTO | deve ser oculto por ID demo |
| `a1ea4294-e3a9-42b5-b5e5-3ca719f5b483` | Servico Teste Comissao TG | true | 30 | 100 | TESTE_TG | deve ser oculto por texto/categoria/notas |

Nao houve alteracao manual no banco.

## 9. Causa raiz ou causa mais provavel

Causa mais provavel: desalinhamento operacional entre o codigo compilado em disco e o processo PM2 em memoria.

O banco contem dados demo/teste ativos, mas isso por si so nao explica a exposicao depois da Sprint 222, porque o `dist` atual filtra corretamente esses dados em chamada in-process. O endpoint em producao continua expondo porque o processo `software-barbearia` nao foi reiniciado desde `2026-06-21`, antes do build atual de `2026-06-25`.

## 10. Correcao feita

Nenhuma correcao de codigo foi aplicada nesta fase. O codigo atual em `main` e o `dist` em disco ja contem a blindagem esperada.

Foi criada esta documentacao de diagnostico/desbloqueio.

## 11. Acao operacional necessaria

Executar restart/reload controlado do processo `software-barbearia` para carregar o `dist` atual, seguido de validacao readonly:

1. Confirmar `git status -sb`.
2. Confirmar `git rev-parse HEAD` igual a `origin/main`.
3. Executar `pm2 restart software-barbearia --update-env` ou procedimento operacional equivalente aprovado.
4. Validar `GET /health`.
5. Validar `GET /public/services?unitId=unit-01` em localhost e dominio.
6. Confirmar que apenas `Barba Terapia` e `Corte Premium` aparecem.
7. Ler logs recentes para crash, loop, 500 ou erro Prisma critico.

Esta acao nao foi executada porque restart/reload PM2 estava explicitamente bloqueado sem autorizacao.

## 12. Testes executados

Passaram:

- `npx vitest run tests/api.spec.ts -t "public/services"`: 1 passed, 82 skipped.
- `npx vitest run tests/api.spec.ts -t "public/slots"`: 1 passed, 82 skipped.
- `npx vitest run tests/frontend-booking-public.spec.ts`: 14 passed.
- `npx tsc --noEmit`: passou.
- `npm run build`: passou.
- `git diff --check`: passou.
- `npm test`: 8 arquivos passaram, 1 skipped, 127 tests passed, 19 skipped.

Observacao: em tentativa anterior da Sprint 225, `npm test` havia falhado por timeout em dois testes financeiros/comissao. Nesta Sprint 225.0, a suite completa passou.

## 13. O que nao foi feito por seguranca

- Nao avancei para Sprint 225.
- Nao executei validacao manual mobile.
- Nao fechei Bloco A.
- Nao criei agendamento real.
- Nao cancelei agendamento.
- Nao executei checkout, venda, pagamento, comissao, refund ou estorno.
- Nao rodei migration ou seed.
- Nao alterei `.env`.
- Nao alterei Nginx, firewall ou certificado.
- Nao reiniciei/recarreguei PM2.
- Nao alterei banco manualmente.
- Nao limpei servicos/profissionais/unidades/produtos.
- Nao alterei preco, duracao ou servico real.
- Nao fiz reset, rebase ou force-push.
- Nao acionei IA WhatsApp.

## 14. Opiniao tecnica CTO

A falha e operacional/deploy/PM2, com dado real como fator de risco residual. Nao parece ser bug de codigo no `main`: o filtro atual bloqueia os itens problematicos quando executado no `dist` atual.

O dominio publico ainda nao esta alinhado com `main` enquanto o processo PM2 nao for reiniciado/recarregado para carregar o build atual.

O endpoint `/public/services` nao esta seguro agora no processo em execucao, porque ainda expoe dados demo/teste. Ele deve ficar seguro apos restart/reload controlado, desde que a validacao readonly confirme a mesma resposta da chamada in-process.

E seguro retomar a Sprint 225 somente depois do restart/reload controlado e da confirmacao de que `/public/services` no dominio publico mostra apenas servicos reais.

Existe risco de dados demo/teste voltarem enquanto a regra depender apenas de marcadores textuais. Para a fase atual, o filtro textual e aceitavel como mitigacao temporaria, mas nao deve ser a arquitetura final. O ideal e adicionar um campo explicito de publicacao/visibilidade do servico, por exemplo `publicVisible` ou `bookingEnabled`, e migrar o catalogo publico para allowlist operacional.

Recomendo restart/deploy controlado porque a aplicacao em memoria esta atrasada em relacao ao `dist` atual. Nao recomendo saneamento manual do banco como primeiro passo para desbloquear a Sprint 225, porque a blindagem deveria proteger o publico mesmo na presenca de dados internos/teste. Depois da validacao mobile, recomendo uma fase separada de saneamento de dados para reduzir risco operacional e confusao administrativa.

Discordo de avancar para Bloco B antes de retomar e aprovar a Sprint 225. O Bloco A ainda tem um bloqueio publico observavel ate o processo em producao carregar o codigo certo.

## 15. Decisao final

BLOQUEADO para Sprint 225 neste momento.

O diagnostico da Sprint 225.0 esta aprovado como causa mais provavel e plano de desbloqueio: codigo atual correto, banco contem dados que devem ser ocultos, processo PM2 em memoria esta desalinhado com o build atual.

## 16. Proxima acao recomendada

Solicitar autorizacao explicita para restart/reload controlado do PM2 e executar a validacao readonly pos-restart. Se `/public/services` passar no dominio publico, retomar a Sprint 225. Se falhar mesmo apos restart, tratar como bug de codigo/runtime e abrir correcao antes de qualquer validacao mobile.

---

# Atualizacao pos-restart controlado

Data: 2026-06-26

## 17. Autorizacao recebida

Foi recebida autorizacao explicita para executar apenas o comando operacional:

```bash
pm2 restart software-barbearia --update-env
```

Nao foram autorizados deploy adicional, migration, seed, alteracao de `.env`, alteracao manual de banco, limpeza de dados, mudanca de Nginx/firewall/certificado ou qualquer operacao transacional de venda, checkout, pagamento, comissao, refund ou agendamento.

## 18. Pre-check antes do restart

Comandos readonly executados:

- `pwd`: `/root/software-barbearia`
- `git status -sb`: `## main...origin/main`
- `git log --oneline -10`: HEAD em `fca5375 docs: diagnosticar bloqueio do catalogo publico em producao`
- `git rev-parse HEAD`: `fca5375d102c476ee42ccb78d33436b3af28b130`
- `git rev-parse origin/main`: `fca5375d102c476ee42ccb78d33436b3af28b130`
- `pm2 list`
- `pm2 describe software-barbearia`

Confirmacoes:

- Branch: `main`.
- Git limpo e HEAD igual a `origin/main`.
- Processo `software-barbearia` existe.
- Script path: `/root/software-barbearia/dist/src/server.js`.
- Exec cwd: `/root/software-barbearia`.

Estado PM2 antes:

- Status: `online`.
- PID: `331011`.
- Uptime: `4D`.
- Restarts: `8`.
- Created at: `2026-06-21T15:19:55.006Z`.

## 19. Restart executado

Comando executado:

```bash
pm2 restart software-barbearia --update-env
```

Resultado imediato:

- Processo `software-barbearia` reiniciado com sucesso pelo PM2.
- Novo PID: `618594`.
- Status: `online`.
- Uptime inicial: `0s`.
- Restarts: `9`.

## 20. Pos-check PM2

`pm2 list` e `pm2 describe software-barbearia` apos o restart confirmaram:

- Status: `online`.
- Uptime novo observado: `13s` e depois `46s`.
- PID novo: `618594`.
- Restarts: `9`, sem incremento adicional depois do restart autorizado.
- Unstable restarts: `0`.
- Script path mantido em `/root/software-barbearia/dist/src/server.js`.
- Exec cwd mantido em `/root/software-barbearia`.
- Sem evidencia de restart loop ou erro imediato.

## 21. Health check

Localhost:

```text
GET http://127.0.0.1:3333/health -> 200
{"ok":true,"authEnforced":true}
```

Dominio publico:

```text
GET https://barbearia.76-13-161-250.nip.io/health -> 200
{"ok":true,"authEnforced":true}
```

## 22. Catalogo publico pos-restart

Localhost:

```text
GET http://127.0.0.1:3333/public/services?unitId=unit-01 -> 200
```

Resposta:

```json
[
  {
    "id": "svc-barba",
    "name": "Barba Terapia",
    "description": "Modelagem e hidratacao de barba com toalha quente.",
    "category": "BARBA",
    "price": 55,
    "durationMinutes": 35
  },
  {
    "id": "svc-corte",
    "name": "Corte Premium",
    "description": "Corte com acabamento premium e finalizacao personalizada.",
    "category": "CORTE",
    "price": 75,
    "durationMinutes": 45
  }
]
```

Dominio publico:

```text
GET https://barbearia.76-13-161-250.nip.io/public/services?unitId=unit-01 -> 200
```

Resposta equivalente ao localhost, contendo apenas:

- `svc-barba` / `Barba Terapia`
- `svc-corte` / `Corte Premium`

Confirmacoes:

- Nenhum `demo-svc-*` retornou.
- `Servico Teste Comissao TG` nao retornou.
- O dominio publico passou a servir o `dist` atual.

## 23. Profissionais publicos

Localhost e dominio publico:

```text
GET /public/services/svc-barba/professionals?unitId=unit-01 -> 200
```

Resposta:

```json
{
  "service": {
    "id": "svc-barba",
    "name": "Barba Terapia"
  },
  "professionals": [
    {
      "id": "pro-01",
      "name": "Geovane Borges",
      "displayName": "Geovane Borges"
    }
  ]
}
```

Contrato publico confirmado:

- Chaves expostas por profissional: `id`, `name`, `displayName`.
- Sem telefone.
- Sem e-mail.
- Sem financeiro.
- Sem comissao.
- Sem documento ou dados internos de auditoria.

## 24. Slots publicos

Localhost e dominio publico:

```text
GET /public/slots?unitId=unit-01&serviceId=svc-barba&professionalId=pro-01&weekStart=2026-06-22 -> 200
```

A resposta retornou disponibilidade por data, com itens no formato publico:

```json
{
  "time": "09:00",
  "available": true,
  "professionalId": "pro-01",
  "professionalName": "Geovane Borges"
}
```

Tambem ha slots indisponiveis somente com `time` e `available`, ou com `professionalId`/`professionalName` quando aplicavel.

Contrato publico confirmado:

- Sem telefone.
- Sem e-mail.
- Sem financeiro.
- Sem comissao.
- Sem cliente.
- Sem dados internos de auditoria.

## 25. Logs pos-restart

Comando readonly executado:

```bash
pm2 logs software-barbearia --lines 120 --nostream
```

Evidencias relevantes:

- Novo processo iniciou com PID `618594`.
- Log de start: `Server listening at http://127.0.0.1:3333`.
- Health local e dominio retornaram `200`.
- `/public/services` local e dominio retornaram `200`.
- `/public/services/:serviceId/professionals` local e dominio retornaram `200`.

Nao foi observada evidencia de:

- Crash.
- Restart loop.
- 500 critico novo.
- Erro Prisma critico novo.
- Erro de bind/porta.
- Erro de env.

Observacao: houve `401` para requisicoes de navegador a `apple-touch-icon*.png` antes do restart e tambem no periodo recente do dominio. Isso foi registrado como requisicao anonima bloqueada por auth em asset nao-publico, nao como falha critica do restart nem como exposicao do booking publico.

## 26. Decisao da Sprint 225.0 apos restart

APROVADO para desbloqueio da Sprint 225.

O restart controlado resolveu o desalinhamento entre o processo PM2 em memoria e o `dist` atual em disco. A evidencia decisiva e que, apos o restart, localhost e dominio publico passaram a retornar apenas `Barba Terapia` e `Corte Premium` em `/public/services?unitId=unit-01`.

Gates de avanco:

1. PM2 online com uptime novo: passou.
2. Health OK em localhost e dominio: passou.
3. `/public/services` localhost limpo: passou.
4. `/public/services` dominio limpo: passou.
5. Nenhum `demo-svc-*`: passou.
6. Nenhum `Servico Teste Comissao TG`: passou.
7. Profissionais publicos sem dados sensiveis: passou.
8. Slots publicos sem dados sensiveis: passou.
9. Logs sem erro critico novo: passou.
10. Git limpo antes desta atualizacao documental: passou.

## 27. Opiniao tecnica CTO pos-restart

O diagnostico da Sprint 225.0 estava correto: a causa operacional mais forte era o processo PM2 antigo em memoria. O codigo em `main` e o `dist` em disco ja estavam corretos; faltava o restart controlado para a producao realmente carregar a blindagem.

O risco principal remanescente nao e mais a exposicao imediata do catalogo, mas a disciplina operacional de deploy. Sem uma rotina padrao que inclua build, restart/reload controlado e smoke readonly do dominio, este tipo de desalinhamento pode voltar.

Recomendacao: documentar uma rotina padrao de deploy/restart com smoke obrigatorio para `/health`, `/public/services`, profissionais e slots antes de qualquer validacao humana ou piloto.
