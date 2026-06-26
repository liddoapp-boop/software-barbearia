# Sprint 225.1 - Runbook de deploy, restart e smoke de producao

Data: 2026-06-26 UTC
Tipo: documentacao operacional

## 1. Objetivo

Definir uma rotina simples, repetivel e segura para garantir que producao esteja rodando o codigo correto depois de alteracoes em `main`, build ou `dist`.

Este runbook existe para evitar a repeticao do incidente observado na Sprint 225: o codigo e o `dist` estavam corretos em disco, mas o processo PM2 `software-barbearia` continuava servindo uma versao antiga em memoria.

## 2. Contexto do incidente da Sprint 225

Durante a validacao publica final mobile, o dominio publico ainda retornava servicos `demo-svc-*` e `Servico Teste Comissao TG` em:

```bash
/public/services?unitId=unit-01
```

A Sprint 225.0 confirmou que:

- o repositorio estava em `/root/software-barbearia`;
- o PM2 apontava para `/root/software-barbearia/dist/src/server.js`;
- o `dist` em disco ja filtrava corretamente os dados demo/teste/TG/db;
- o processo PM2 em memoria tinha sido iniciado antes do build atual;
- apos restart controlado autorizado, localhost e dominio passaram a retornar apenas `Barba Terapia` e `Corte Premium`.

Falha operacional: faltou uma rotina padrao que obrigasse a alinhar Git, build, processo PM2 em memoria e smoke publico antes de considerar producao validada.

## 3. Quando usar este runbook

Use este runbook antes de qualquer uma destas situacoes:

- depois de merge ou push em `main` que altere codigo executado em producao;
- depois de gerar novo `dist`;
- antes de validar booking publico com humano;
- antes de declarar Sprint, bloco ou release como concluido;
- quando `/health` responder, mas algum endpoint publico parecer desatualizado;
- quando houver suspeita de desalinhamento entre codigo em disco e runtime PM2.

Nao use este runbook para migration, seed, limpeza de banco, alteracao de `.env`, financeiro, agenda real, venda, checkout, comissao, refund ou operacao manual de dados.

## 4. Pre-check obrigatorio

Execute e registre as evidencias antes de qualquer build, restart/reload ou smoke:

```bash
pwd
git status -sb
git log --oneline -10
git rev-parse HEAD
git rev-parse origin/main
pm2 list
pm2 describe software-barbearia
```

Criterios esperados:

- diretorio correto: `/root/software-barbearia`;
- branch correta: `main`;
- Git limpo: `git status -sb` sem arquivos modificados inesperados;
- HEAD e `origin/main` alinhados quando a intencao for validar producao atual;
- processo PM2 correto: `software-barbearia`;
- `script path`: `/root/software-barbearia/dist/src/server.js`;
- `exec cwd`: `/root/software-barbearia`;
- status PM2 `online`, sem restart loop;
- backup recente confirmado quando a acao envolver risco de banco, migration, seed ou alteracao operacional sensivel.

Se HEAD e `origin/main` estiverem divergentes, pare. Nao faca build, deploy ou restart ate decidir explicitamente qual revisao deve ir para producao.

## 5. Build

Rode build quando houver alteracao de codigo TypeScript, rotas, frontend publico, scripts publicos, Prisma Client ou qualquer dependencia que afete `dist`.

Comando esperado:

```bash
npm run build
```

Como validar que passou:

- o comando termina com exit code `0`;
- nao ha erro TypeScript;
- `dist/src/server.js` existe e foi atualizado quando esperado;
- se o build fizer parte de deploy, registre horario, HEAD e resultado.

Observacao importante: nao rode `npm run build` em producao sem autorizacao explicita quando o escopo da sprint for somente documentacao ou diagnostico. Build em si nao reinicia Node, mas altera artefatos em disco e pode ser confundido com deploy parcial.

## 6. Restart/reload PM2

O processo atual roda em `fork_mode`, conforme `pm2 describe software-barbearia`. Para este formato, o comando padrao recomendado para carregar o `dist` atual e:

```bash
pm2 restart software-barbearia --update-env
```

Use restart/reload PM2 quando:

- houve novo build e o processo precisa carregar os arquivos gerados;
- a aplicacao em memoria esta desalinhada com o `dist`;
- `pm2 describe` mostra uptime anterior ao build que deve estar em producao;
- um smoke mostra comportamento antigo apesar do codigo correto em disco.

Riscos:

- indisponibilidade curta durante restart;
- carregar `.env` ou variaveis divergentes se o ambiente estiver incorreto;
- mascarar bug real se o smoke pos-restart nao for executado;
- causar loop se o build estiver quebrado ou dependencias estiverem inconsistentes.

Regra de seguranca: restart ou reload PM2 sempre exige autorizacao explicita. Nao execute em sprint documental, revisao ou diagnostico sem permissao direta.

## 7. Smoke pos-restart

Depois do restart autorizado, valide localhost e dominio publico. A base local esperada e:

```bash
http://127.0.0.1:3333
```

Valide `/health`:

```bash
curl -sS -i http://127.0.0.1:3333/health
curl -sS -i https://barbearia.76-13-161-250.nip.io/health
```

Esperado:

```json
{"ok":true,"authEnforced":true}
```

Valide catalogo publico:

```bash
curl -sS http://127.0.0.1:3333/public/services?unitId=unit-01
curl -sS https://barbearia.76-13-161-250.nip.io/public/services?unitId=unit-01
```

Esperado no escopo atual:

- `svc-barba` / `Barba Terapia`;
- `svc-corte` / `Corte Premium`;
- nenhum `demo-svc-*`;
- nenhum `Servico Teste Comissao TG`;
- nenhum marcador `teste`, `demo`, `tg` ou `db` em dados publicos.

Valide profissionais do servico:

```bash
curl -sS http://127.0.0.1:3333/public/services/svc-barba/professionals?unitId=unit-01
curl -sS https://barbearia.76-13-161-250.nip.io/public/services/svc-barba/professionals?unitId=unit-01
```

Esperado:

- servico `svc-barba`;
- profissional publico `pro-01` / `Geovane Borges`;
- sem telefone;
- sem e-mail;
- sem financeiro;
- sem comissao;
- sem dados internos de auditoria.

Valide slots publicos com parametros seguros:

```bash
curl -sS "http://127.0.0.1:3333/public/slots?unitId=unit-01&serviceId=svc-barba&professionalId=pro-01&weekStart=2026-06-22"
curl -sS "https://barbearia.76-13-161-250.nip.io/public/slots?unitId=unit-01&serviceId=svc-barba&professionalId=pro-01&weekStart=2026-06-22"
```

Esperado:

- resposta `200`;
- itens com `time` e `available`;
- `professionalId` e `professionalName` quando aplicavel;
- sem cliente, telefone, e-mail, financeiro, comissao ou auditoria interna.

Valide logs recentes:

```bash
pm2 logs software-barbearia --lines 120 --nostream
```

Procure evidencias de:

- start do processo novo;
- `/health` com `200`;
- `/public/services` com `200`;
- `/public/services/:serviceId/professionals` com `200`;
- `/public/slots` com `200`;
- ausencia de crash, restart loop, erro Prisma critico, erro de bind, erro de env ou `500` critico.

## 8. Criterios de bloqueio

Pare e nao avance se qualquer item abaixo ocorrer:

- PM2 offline;
- PM2 em restart loop;
- `pm2 describe software-barbearia` aponta para outro diretorio ou script;
- `/health` falha em localhost ou dominio;
- localhost e dominio retornam respostas diferentes sem explicacao;
- `/public/services` retorna `demo-svc-*`;
- `/public/services` retorna `Servico Teste Comissao TG`;
- qualquer dado publico contem marcador `teste`, `demo`, `tg` ou `db` indevido;
- endpoint publico expoe telefone, e-mail interno, financeiro, comissao, auditoria ou dado sensivel;
- erro Prisma critico novo aparece nos logs;
- erro `500` critico novo aparece nos endpoints publicos;
- HEAD, `origin/main`, `dist` e PM2 nao conseguem ser correlacionados.

Se o runtime publico estiver desalinhado, nao avance para validacao humana, piloto ou bloco seguinte. Primeiro alinhe o runtime ou trate como incidente.

## 9. Como registrar evidencias

Apos deploy/restart/smoke, registre em `.planning`:

- data e timezone;
- comando autorizado executado;
- `pwd`;
- `git status -sb`;
- `git log --oneline -10`;
- HEAD e `origin/main`;
- `pm2 list`;
- `pm2 describe software-barbearia`;
- resultado de `/health` local e dominio;
- resumo de `/public/services` local e dominio;
- resumo de profissionais publicos;
- resumo de slots publicos;
- trecho relevante dos logs PM2;
- decisao final: aprovado, aprovado com ressalvas ou bloqueado;
- o que nao foi feito por seguranca.

Nao registre tokens, secrets, dados pessoais, telefone de cliente, e-mail interno, payload financeiro ou conteudo sensivel de banco.

## 10. O que nunca fazer sem autorizacao

Nunca execute sem autorizacao explicita:

- `pm2 restart`;
- `pm2 reload`;
- deploy;
- `git pull`;
- `npm run build` em producao;
- migration;
- seed;
- alteracao de `.env`;
- alteracao manual no banco;
- Nginx, firewall ou certificado;
- apagar dados;
- reset, rebase ou force-push;
- checkout, pagamento, venda, comissao, refund ou estorno;
- criar, confirmar ou cancelar agendamento real.

## 11. Checklist rapido para copiar

```bash
# Pre-check readonly
pwd
git status -sb
git log --oneline -10
git rev-parse HEAD
git rev-parse origin/main
pm2 list
pm2 describe software-barbearia

# Build, somente se autorizado e necessario
npm run build

# Restart, somente se autorizado explicitamente
pm2 restart software-barbearia --update-env

# Smoke
curl -sS -i http://127.0.0.1:3333/health
curl -sS -i https://barbearia.76-13-161-250.nip.io/health
curl -sS http://127.0.0.1:3333/public/services?unitId=unit-01
curl -sS https://barbearia.76-13-161-250.nip.io/public/services?unitId=unit-01
curl -sS http://127.0.0.1:3333/public/services/svc-barba/professionals?unitId=unit-01
curl -sS https://barbearia.76-13-161-250.nip.io/public/services/svc-barba/professionals?unitId=unit-01
curl -sS "http://127.0.0.1:3333/public/slots?unitId=unit-01&serviceId=svc-barba&professionalId=pro-01&weekStart=2026-06-22"
curl -sS "https://barbearia.76-13-161-250.nip.io/public/slots?unitId=unit-01&serviceId=svc-barba&professionalId=pro-01&weekStart=2026-06-22"
pm2 logs software-barbearia --lines 120 --nostream
```

Checklist de aprovacao:

- Git limpo e branch correta;
- HEAD e `origin/main` alinhados;
- PM2 `online`, sem loop;
- script path e cwd corretos;
- `/health` local e dominio `200`;
- `/public/services` limpo;
- profissionais sem dados sensiveis;
- slots sem dados sensiveis;
- logs sem erro critico novo;
- evidencias registradas.

## 12. Opiniao tecnica CTO

### Qual foi a falha operacional que quase passou?

A falha foi considerar que codigo correto em disco equivalia a codigo correto em producao. Em Node/PM2, o processo carrega o codigo na inicializacao. Se `dist` muda e o processo nao reinicia, producao continua servindo a versao antiga em memoria.

### O runbook reduz esse risco?

Sim. Ele cria gates objetivos entre Git, build, PM2 e smoke publico. O ponto mais importante e tornar obrigatoria a prova de runtime, nao apenas a prova de repositorio.

### Ainda existe risco de producao rodar codigo antigo?

Sim, enquanto o processo depender de acao manual. O risco cai bastante com este runbook, mas so desaparece de forma robusta quando deploy, restart e smoke forem automatizados com bloqueio em caso de falha.

### O que recomendo automatizar futuramente?

Recomendo automatizar:

- build em pipeline;
- registro do commit em artefato ou endpoint interno de versao;
- restart/reload PM2 padronizado;
- smoke readonly pos-deploy;
- bloqueio automatico se `/public/services` retornar demo/teste/TG/db;
- captura de evidencias em arquivo de release.

### Devemos criar um smoke script futuramente?

Sim. Ja existem scripts `smoke:api` e `smoke:api:readonly` no `package.json`, mas o incidente pede um smoke publico especifico para producao, com assercoes sobre `/health`, `/public/services`, profissionais, slots e ausencia de dados sensiveis. Esse script deve falhar com exit code diferente de zero se o dominio publico estiver desalinhado.

### E seguro avancar para Bloco B depois desta documentacao?

Sim, com ressalvas: e seguro iniciar o planejamento/execucao do Bloco B depois desta documentacao porque o Bloco A foi fechado com ressalvas e a rotina operacional agora esta formalizada. Nao e seguro tratar o produto como homologado para uso amplo sem antes confirmar catalogo, valores, duracoes e produtos com Geovane.

### O que nao devemos fazer agora?

Nao devemos executar restart PM2, deploy, build em producao, migration, seed, alteracao de banco, alteracao de `.env`, mudanca de Nginx/firewall/certificado, agenda real, venda, checkout, pagamento, comissao ou refund nesta sprint documental.

## 13. Proxima etapa recomendada

Encerrar a Sprint 225.1 como documentacao operacional.

Depois, recomendo:

1. criar um smoke script publico readonly dedicado;
2. revisar 100% dos servicos reais, valores, duracoes e produtos com Geovane;
3. planejar campo formal de visibilidade publica do servico, substituindo a heuristica textual por allowlist operacional;
4. iniciar Bloco B / Sprint 226 somente com escopo fechado e criterios de aceite proprios.
