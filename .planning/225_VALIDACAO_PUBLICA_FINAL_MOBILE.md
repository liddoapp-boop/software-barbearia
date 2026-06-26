# Sprint 225 - Validacao publica final mobile

Data: 2026-06-26 UTC
Decisao final: APROVADO COM RESSALVAS
Bloco A: FECHADO COM RESSALVAS

## 1. Objetivo

Validar o booking publico em condicao final para piloto controlado, com foco no cliente no celular, sem criar agendamento real por API/script e sem executar operacoes de checkout, pagamento, venda, comissao, cancelamento ou refund.

## 2. Contexto do Bloco A

O Bloco A concentrou a preparacao do booking publico para exposicao controlada: catalogo publico, textos finais, seguranca dos contratos publicos, validacao mobile e desbloqueio operacional do dominio.

A Sprint 225 foi inicialmente bloqueada porque o dominio publico ainda retornava servicos demo/teste/TG em `/public/services`. A Sprint 225.0 confirmou que o codigo e o `dist` em disco estavam corretos, mas o processo PM2 antigo ainda servia codigo em memoria anterior ao build atual.

## 3. Relacao com as Sprints 222, 223, 224 e 225.0

- Sprint 222: blindou o catalogo publico contra servicos de teste, demo, TG, db e inativos.
- Sprint 223: revisou o catalogo publico real e recomendou manter apenas corte/barba visiveis ate confirmacao operacional com Geovane.
- Sprint 224: ajustou textos finais do `public/booking.html` e corrigiu falso positivo de filtro de ID contendo `db` em UUID legitimo.
- Sprint 225.0: diagnosticou o bloqueio de producao e confirmou a necessidade de restart controlado do PM2.

## 4. Decisao de CTO

A Sprint 225 fica aprovada com ressalvas. A validacao tecnica, readonly e manual mobile passou para o escopo de piloto controlado.

O Bloco A tambem fica fechado com ressalvas, porque o booking publico esta funcional e nao expoe mais catalogo demo/teste/TG/db, mas ainda existem pendencias operacionais que nao devem ser confundidas com bloqueio tecnico:

- confirmar 100% dos servicos reais, nomes, valores e duracoes com Geovane;
- revisar produtos e servicos variaveis antes de uso amplo;
- formalizar rotina de deploy/restart/smoke para evitar novo desalinhamento PM2.

## 5. Resultado do restart/desbloqueio

O restart controlado autorizado foi executado na Sprint 225.0:

```bash
pm2 restart software-barbearia --update-env
```

Resultado:

- PM2 antes: PID `331011`, uptime `4D`, restarts `8`.
- PM2 depois: PID `618594`, uptime novo, restarts `9`, status `online`.
- Script path confirmado: `/root/software-barbearia/dist/src/server.js`.
- Exec cwd confirmado: `/root/software-barbearia`.
- Sem restart loop ou erro imediato.

O restart resolveu o desalinhamento entre o processo PM2 em memoria e o `dist` atual em disco.

## 6. Checklist automatizado

Comandos executados antes desta documentacao final:

| Comando | Resultado |
| --- | --- |
| `npx vitest run tests/api.spec.ts -t "public/services"` | Passou; 1 passed, 82 skipped |
| `npx vitest run tests/api.spec.ts -t "public/slots"` | Passou; 1 passed, 82 skipped |
| `npx vitest run tests/frontend-booking-public.spec.ts` | Passou; 14 passed |
| `npm test` | Passou; 8 files passed, 1 skipped; 127 passed, 19 skipped |
| `npx tsc --noEmit` | Passou |
| `npm run build` | Passou |
| `git diff --check` | Passou |

`npm run test:db` nao foi executado por seguranca, para evitar tocar PostgreSQL real com suite de integracao.

## 7. Checklist publico readonly

URL validada:

`https://barbearia.76-13-161-250.nip.io/agendamento?unitId=unit-01`

Resultado:

- Pagina publica respondeu `200`.
- HTML do booking publico carregou.
- Assets externos basicos responderam `200`:
  - `https://unpkg.com/imask@7.6.1/dist/imask.min.js`
  - `https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&display=swap`
- `/public/business?unitId=unit-01` respondeu `{"name":"Barbearia","segment":"barbearia"}`.
- `/public/working-hours?unitId=unit-01` respondeu horarios publicos sem dados sensiveis.
- `/public/services?unitId=unit-01` respondeu apenas servicos publicos validos.
- `/public/services/svc-barba/professionals?unitId=unit-01` respondeu apenas dados publicos do profissional.
- `/public/slots` respondeu agenda publica sem telefone, e-mail, financeiro, comissao ou auditoria interna.

## 8. Checklist frontend

Validado pelo teste automatizado `tests/frontend-booking-public.spec.ts` e pela validacao manual mobile humana:

- Textos finais aparecem no fluxo publico.
- Nao ha catalogo ficticio se API falhar; a UI mostra mensagem de indisponibilidade.
- E-mail e opcional.
- E-mail invalido e tratado antes de envio.
- Double tap no botao final nao cria multiplos POSTs no harness.
- Estado antigo do booking fica travado apos sucesso no harness.
- Servicos demo/teste/TG/db nao aparecem no catalogo publico.

## 9. Roteiro manual mobile

Roteiro enviado para validacao humana:

1. Abrir `https://barbearia.76-13-161-250.nip.io/agendamento?unitId=unit-01` no celular.
2. Conferir carregamento da pagina.
3. Conferir textos profissionais.
4. Confirmar ausencia de servico teste/demo/TG/db.
5. Confirmar exibicao de `Profissional: Geovane Borges`.
6. Conferir carregamento de servicos, datas e horarios.
7. Testar e-mail vazio.
8. Testar e-mail invalido, se possivel.
9. Escolher servico/data/horario e parar antes de confirmar agendamento.

## 10. Resultado da validacao manual

Confirmacao humana recebida:

- A pagina carregou corretamente no celular.
- O fluxo aparentou estar conforme.
- Nao deu erro.
- Nao apareceu servico teste/demo/TG/db.
- O e-mail exibido era apenas o e-mail digitado pelo proprio cliente no formulario/resumo, comportamento esperado.
- Nao foi identificado vazamento de e-mail interno, usuario/admin, cliente de terceiro, financeiro, comissao ou dado sensivel.

## 11. Criacao de agendamento

Nao houve criacao de agendamento durante a validacao final.

Consulta readonly executada apos retorno humano, considerando o periodo desde o restart (`2026-06-26T00:14:31.000Z`):

```json
{
  "appointmentCount": 0,
  "publicBookingAuditCount": 0,
  "appointments": [],
  "audits": []
}
```

Como nao houve agendamento, nao houve cancelamento, checkout, venda, financeiro, comissao, refund ou estorno.

## 12. Evidencias sem dados sensiveis

Catalogo publico final:

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

Profissional publico:

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

Slots publicos expuseram apenas:

- `time`
- `available`
- `professionalId`, quando aplicavel
- `professionalName`, quando aplicavel

## 13. Logs

Logs PM2 recentes apos restart mostraram:

- start do processo com PID `618594`;
- `/health` local e dominio com `200`;
- `/public/services` local e dominio com `200`;
- `/public/services/:serviceId/professionals` com `200`;
- `/public/slots` com `200`;
- `/agendamento?unitId=unit-01` com `200`;
- `/public/business` e `/public/working-hours` com `200`.

Nao foi observado:

- crash;
- restart loop;
- erro Prisma critico novo;
- erro de bind/porta;
- erro de env;
- 500 critico novo.

Observacao: requisicoes de navegador para `apple-touch-icon*.png` retornaram `401` por auth em asset nao-publico. Isso nao bloqueia o booking publico nem indica exposicao de dados sensiveis.

## 14. Comandos executados

Principais comandos relacionados a Sprint 225 e ao fechamento:

- `pm2 restart software-barbearia --update-env`
- `pm2 list`
- `pm2 describe software-barbearia`
- `curl -sS -i http://127.0.0.1:3333/health`
- `curl -sS -i https://barbearia.76-13-161-250.nip.io/health`
- `curl -sS http://127.0.0.1:3333/public/services?unitId=unit-01`
- `curl -sS https://barbearia.76-13-161-250.nip.io/public/services?unitId=unit-01`
- `curl -sS http://127.0.0.1:3333/public/services/svc-barba/professionals?unitId=unit-01`
- `curl -sS https://barbearia.76-13-161-250.nip.io/public/services/svc-barba/professionals?unitId=unit-01`
- `curl -sS "https://barbearia.76-13-161-250.nip.io/public/slots?unitId=unit-01&serviceId=svc-barba&professionalId=pro-01&weekStart=2026-06-22"`
- `curl -sS -i "https://barbearia.76-13-161-250.nip.io/agendamento?unitId=unit-01"`
- `pm2 logs software-barbearia --lines 80 --nostream`
- consulta readonly via `psql` para contar agendamentos e auditorias de `/public/booking` desde o restart.

## 15. Resultado dos testes

Todos os testes e validacoes tecnicas exigidas passaram antes da validacao manual:

- API publica de servicos: passou.
- API publica de slots: passou.
- Harness frontend do booking publico: passou.
- Suite completa: passou.
- TypeScript: passou.
- Build: passou.
- `git diff --check`: passou.

## 16. O que nao foi feito por seguranca

- Nao foi criado agendamento real por API/script.
- Nao foi confirmado agendamento no fluxo manual.
- Nao houve cancelamento.
- Nao houve checkout.
- Nao houve venda.
- Nao houve pagamento.
- Nao houve comissao.
- Nao houve refund/estorno.
- Nao houve migration.
- Nao houve seed.
- Nao houve alteracao de `.env`.
- Nao houve alteracao manual no banco.
- Nao houve alteracao de servicos, precos, duracoes ou produtos.
- Nao houve alteracao de Nginx, firewall ou certificado.
- Nao houve deploy adicional alem do restart PM2 autorizado.
- Nao houve avanco para Bloco B.

## 17. Opiniao tecnica CTO

O restart resolveu o desalinhamento operacional. O dominio publico agora esta alinhado com o `main/dist` que contem a blindagem atual.

`/public/services` esta seguro para o escopo atual: nao retornou `demo-svc-*`, nao retornou `Servico Teste Comissao TG` e retornou apenas `Barba Terapia` e `Corte Premium`.

O booking publico esta pronto para piloto controlado, nao para uso amplo irrestrito. O uso amplo ainda depende de revisao operacional com Geovane sobre catalogo real, valores, duracoes, produtos e regras especificas de agenda.

Existe risco tecnico residual de o problema PM2/deploy voltar se nao houver rotina padrao de build, restart/reload e smoke readonly. Recomendo documentar essa rotina antes de expandir operacao.

Existe risco visual/UX residual baixo para piloto controlado, porque a validacao humana mobile passou, mas ainda nao substitui uma rodada formal com multiplos aparelhos, navegadores e tamanhos de tela.

Discordo de avancar para operacao interna ampla ou Bloco B como se o produto estivesse completamente homologado. O correto e fechar o Bloco A com ressalvas, estabilizar a rotina operacional e tratar as pendencias de catalogo/dados como proximo bloco planejado.

## 18. Decisao final do Bloco A

Bloco A fechado com ressalvas.

O criterio minimo foi atingido:

- dominio publico limpo;
- catalogo publico sem demo/teste/TG/db;
- profissionais e slots sem dados sensiveis;
- frontend mobile validado por humano;
- sem criacao de agendamento na validacao final;
- testes tecnicos passaram;
- logs sem erro critico novo.

## 19. Riscos restantes

- Catalogo atual ainda precisa revisao completa com Geovane.
- Valores e duracoes de servicos publicos precisam confirmacao operacional.
- Produtos e servicos variaveis nao devem entrar no publico sem regra clara.
- A blindagem de catalogo ainda e heuristica textual; o ideal e campo formal de publicacao publica.
- Rotina de deploy/restart/smoke precisa ser documentada para evitar desalinhamento em memoria.
- Validacao visual foi humana em celular, mas ainda pode ser ampliada para matriz de dispositivos.

## 20. Proximo bloco recomendado

Nao avancar para Bloco B nesta execucao.

Proximo bloco recomendado:

1. Documentar rotina padrao de deploy/restart/smoke readonly.
2. Revisar catalogo completo com Geovane: servicos reais, nomes, valores, duracoes e produtos.
3. Planejar campo formal de visibilidade publica do servico, substituindo heuristica textual por allowlist operacional.
4. Depois disso, iniciar Bloco B com escopo fechado e criterios de aceite proprios.
