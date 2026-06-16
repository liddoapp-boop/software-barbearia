# 201 - Validacao manual owner-only com evidencias reais

Data/hora: 2026-06-16, 01:36-01:46 UTC  
Ambiente: producao publica HTTPS  
URL: `https://barbearia.76-13-161-250.nip.io`  
Usuario owner: `p***@gmail.com`  
Evidencias: `.planning/evidence/fase-201-validacao-owner-only/`

## 1. Decisao final

**APROVADO COM RESSALVAS.**

Motivo: health, infraestrutura, login owner real pela tela, modulos desktop owner, booking publico ponta a ponta, validacao mobile por viewport realista e logs PM2 passaram sem P0. A ressalva principal e que o fluxo financeiro/estoque/comissoes com base conhecida nao foi executado de ponta a ponta nesta fase para evitar alteracao operacional sem massa isolada planejada.

## 2. Baseline operacional antes dos testes

| Checagem | Resultado |
| --- | --- |
| `git status --short` | Apenas docs pendentes da Fase 2.0: `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`, `.planning/24_NEXT_PRIORITIES.md`, `.planning/200_AUDITORIA_COMPLETA_PRODUTO_TG.md` |
| `git status -sb` | `main...origin/main` com os mesmos docs pendentes |
| `curl /health` publico | `200 OK`, `{"ok":true,"authEnforced":true}` |
| `pm2 status` | `software-barbearia` online |
| `systemctl status nginx --no-pager` | `active (running)` |
| `systemctl status postgresql --no-pager` | service ativo; socket PostgreSQL em `127.0.0.1:5432` |
| `ufw status verbose` | ativo; 80/443/22 permitidos; `3333/tcp` negado |
| `ss -tulpn` | app em `127.0.0.1:3333`; nao ha `0.0.0.0:3333` |

Nao houve deploy, restart PM2, alteracao de firewall, certificado, migration, seed, regra financeira, `git add`, commit ou push.

## 3. Resultado desktop owner

Validacao executada em Chromium headless via CDP, viewport desktop 1440x1000, dominio publico HTTPS.

| Tela | Evidencia | Resultado |
| --- | --- | --- |
| Login owner | `01-login-owner.png`, `ui-login-result.json` | PASSOU. Submit real da tela redirecionou para `/`, criou sessao `owner` e nao exibiu erro. |
| Painel inicial / Inicio | `02-dashboard.png` | PASSOU COM OBSERVACAO. O app abriu o painel inicial financeiro/Inicio; a secao `dashboard` nao aparece como item primario de menu. |
| Agenda | `03-agenda.png` | PASSOU. Tela carregou sem erro visual grave. |
| Clientes | `04-clientes.png` | PASSOU. Tela carregou sem erro visual grave; prints usam mascaramento de telefone/e-mail. |
| PDV | `05-pdv.png` | PASSOU. Tela carregou sem erro visual grave. |
| Financeiro | `06-financeiro.png` | PASSOU. Tela carregou sem erro visual grave. |
| Servicos | `07-servicos.png` | PASSOU. Tela carregou sem erro visual grave. |
| Equipe | `08-equipe.png` | PASSOU. Tela carregou sem erro visual grave. |
| Auditoria | `09-auditoria.png` | PASSOU. Tela owner-only carregou sem erro visual grave. |
| Configuracoes | `10-configuracoes.png` | PASSOU. Tela carregou sem erro visual grave. |

Nao foi encontrado erro 500 critico durante a navegacao desktop.

## 4. Resultado booking publico

Fluxo validado no dominio publico:

1. Abertura de `/agendamento`.
2. Preenchimento com dados ficticios: `Cliente Teste TG`, telefone ficticio e e-mail descartavel.
3. Escolha de servico.
4. Escolha de data/hora.
5. Confirmacao do agendamento.
6. Conferencia posterior na agenda interna via consulta autenticada owner.

Resultado: **PASSOU**.

Agendamento de teste criado:

| Campo | Valor |
| --- | --- |
| ID | `34f531e1-c50b-4f7b-a47a-4686ed7d06fd` |
| Status | `SCHEDULED` |
| Inicio | `2026-06-16T12:00:00.000Z` |
| Cliente | `Cliente Teste TG` |
| Profissional | `Geovane Borges` |
| Servico | `Barba Terapia` |
| Observacao | `Agendamento online - Cliente Teste TG` |

Evidencia: `11-booking-publico.png`. O print nao expoe telefone completo nem e-mail.

Observacao: o booking publico nao oferece escolha explicita de profissional na UI; o sistema selecionou profissional elegivel automaticamente. Classificacao: P2 de UX/escopo, nao bloqueia o piloto owner-only.

## 5. Resultado mobile

Validacao executada em viewport mobile realista Chromium/CDP 390x844, deviceScaleFactor 2. Nao foi usado aparelho fisico nesta rodada.

| Tela | Evidencia | Resultado |
| --- | --- | --- |
| Login mobile | `12-mobile-login.png` | PASSOU. Tela legivel, sem overflow horizontal observado. |
| Agenda mobile | `13-mobile-agenda.png` | PASSOU. Tela legivel, sem overflow horizontal critico observado. |
| Clientes mobile | `13b-mobile-clientes.png` | PASSOU. Tela legivel; dados sensiveis mascarados quando aplicavel. |
| PDV mobile | `13c-mobile-pdv.png` | PASSOU. Tela legivel, sem overflow horizontal critico observado. |
| Financeiro mobile | `13d-mobile-financeiro.png` | PASSOU. Tela legivel, botoes grandes e sem overflow horizontal aparente. |
| Booking publico mobile | `14-mobile-booking.png`, `14-mobile-booking-state.json` | PASSOU. `/agendamento` abriu com chat e input; `viewport=390`, `scrollWidth=390`, `overflow=false`. |

O menu mobile aparece como botao hamburguer nas telas internas. A coleta automatizada nao salvou print especifico do menu aberto; recomenda-se print humano complementar se o TG exigir prova visual do menu expandido. Classificacao: P3.

## 6. Financeiro, estoque e comissoes

Resultado: **PARCIAL / P1 PENDENTE**.

O frontend owner de PDV e Financeiro carregou corretamente, e a Fase 2.0 ja confirmou cobertura tecnica por endpoints/testes. Nesta fase nao foi executada venda real, baixa de estoque, checkout concluido, pagamento de comissao ou estorno porque isso alteraria saldos financeiros/estoque sem uma massa isolada e criterios de reversao previamente aprovados.

Pendencia P1 recomendada:
- criar uma fase curta com base conhecida e roteiro atomico: produto teste, venda teste, baixa de estoque, receita, comissao, pagamento de comissao como despesa, estorno/devolucao e conferencia final;
- registrar IDs criados e reversoes, se houver.

## 7. LGPD basica

Resultado: **PASSOU COM RESSALVAS**.

Verificacoes:
- prints nao exibem senha, hash, token completo, `.env` ou `DATABASE_URL`;
- telefone/e-mail/CPF foram mascarados nos prints automatizados quando presentes;
- logs PM2 sanitizados foram salvos em `pm2-logs-sanitized.txt`;
- login real foi registrado apenas com e-mail mascarado;
- dado criado no booking e ficticio: `Cliente Teste TG`.

Ressalvas:
- P1: documentar no TG um texto minimo de responsabilidade sobre uso de dados de clientes, finalidade, minimizacao e tratamento de exclusao/anonimizacao;
- P2: implementar aviso/politica curta na UI publica se o escopo academico exigir exibicao ao cliente final.

## 8. Logs PM2 pos-validacao

Comando executado: `pm2 logs software-barbearia --lines 150 --nostream`.

Resultado:
- sem crash;
- sem loop de restart;
- sem `statusCode:500` critico identificado;
- `401` observado em `/robots.txt` por ausencia de token, explicavel por rota protegida;
- requisicoes principais de login, app, agenda, booking e assets responderam `200` ou `304`.

Evidencia sanitizada: `pm2-logs-sanitized.txt`.

## 9. Evidencias coletadas

Arquivos principais:
- `01-login-owner.png`
- `02-dashboard.png`
- `03-agenda.png`
- `04-clientes.png`
- `05-pdv.png`
- `06-financeiro.png`
- `07-servicos.png`
- `08-equipe.png`
- `09-auditoria.png`
- `10-configuracoes.png`
- `11-booking-publico.png`
- `12-mobile-login.png`
- `13-mobile-agenda.png`
- `13b-mobile-clientes.png`
- `13c-mobile-pdv.png`
- `13d-mobile-financeiro.png`
- `14-mobile-booking.png`
- `14-mobile-booking-state.json`
- `ui-login-result.json`
- `pm2-logs-sanitized.txt`
- `collect-evidence.mjs`

## 10. Achados por severidade

### P0

Nenhum.

### P1

1. Fluxo financeiro/estoque/comissoes completo ainda precisa fase propria com base conhecida e reversao documentada.
2. Falta consolidar LGPD basica no texto academico/manual: finalidade, minimizacao, responsabilidade e exclusao/anonimizacao como escopo ou trabalho futuro.

### P2

1. Booking publico nao permite escolha explicita de profissional; sistema escolhe automaticamente.
2. Painel inicial validado como Inicio/Financeiro; a secao `dashboard` nao aparece como item primario claro na navegacao owner atual.
3. Politica/aviso curto de privacidade ainda nao foi confirmado na UI publica.

### P3

1. Print do menu mobile aberto nao foi salvo; menu/botao foi observado nas telas, mas requer evidencia complementar se a banca pedir detalhe visual.
2. Validacao mobile foi em viewport realista automatizado, nao em aparelho fisico.

## 11. Arquivos alterados nesta fase

- `.planning/201_VALIDACAO_MANUAL_OWNER_ONLY_EVIDENCIAS.md`
- `.planning/200_AUDITORIA_COMPLETA_PRODUTO_TG.md`
- `.planning/23_IMPLEMENTATION_LOG_FASE_MATURIDADE.md`
- `.planning/24_NEXT_PRIORITIES.md`
- `.planning/evidence/fase-201-validacao-owner-only/*`

Nao foi feito `git add`, commit ou push.

## 12. Proxima etapa recomendada

Executar uma fase especifica P1 de reconciliacao financeira/estoque/comissoes com massa conhecida, e em paralelo preparar o pacote academico do TG com prints desta pasta, roteiro de apresentacao, limitacoes assumidas e trabalhos futuros.
