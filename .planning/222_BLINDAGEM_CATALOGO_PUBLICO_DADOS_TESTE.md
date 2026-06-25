# Sprint 222 - Blindagem do catalogo publico contra dados de teste

Data: 2026-06-25 UTC
Decisao final: APROVADO COM RESSALVAS

## 1. Objetivo

Finalizar a blindagem do catalogo publico do agendamento online para impedir que clientes vejam ou usem servicos de teste, TG, demo, db ou inativos.

Escopo fechado nesta sprint: somente protecao do catalogo publico e regressao do booking publico. Nao avancou para as Sprints 223, 224 ou 225.

## 2. Contexto vindo da Sprint 221

A Sprint 221 diagnosticou que o banco local contem mistura de dados operacionais, seed/demo e sujeira de teste. O risco mais direto para o cliente era `/public/services` retornar todo `Service` ativo da unidade, sem flag de visibilidade publica.

Exemplos encontrados no diagnostico:

- `demo-svc-*`
- `Servico Teste Comissao TG`
- categorias como `TESTE_TG`
- dados com origem `db` ou demo

Tambem foi confirmado que o schema atual de `Service` possui `active`, `name`, `description`, `category` e `notes`, mas nao possui campo dedicado de publicacao como `isPublic`, `publicVisible` ou status de publicacao.

## 3. Decisao de CTO

Aplicar uma contencao pequena e reversivel no backend publico, usando apenas campos existentes e sem migration.

A protecao principal deve ficar no backend. O frontend pode repetir o filtro como defesa adicional, mas nao pode ser a unica barreira.

Esta decisao e deliberadamente temporaria: filtro textual por marcadores e aceitavel para reduzir risco imediato antes de limpar/catalogar dados reais, mas nao substitui uma modelagem formal de visibilidade publica.

## 4. Estado parcial apos queda da VPS/VS Code

Na retomada havia alteracoes nao commitadas em:

- `public/booking.html`
- `src/http/app.ts`
- `tests/api.spec.ts`
- `tests/frontend-booking-public.spec.ts`

As alteracoes ja apontavam para a blindagem de servicos e profissionais publicos por marcadores `teste`, `tg`, `demo` e `db`, com testes parciais passando. Ainda nao havia commit nem documentacao da Sprint 222.

## 5. Comportamento antes

- `/public/services` retornava servicos ativos da unidade sem distinguir catalogo publico de dados demo/teste.
- Um servico ativo contendo `Teste`, `TG`, `demo` ou `db` poderia aparecer no booking publico.
- O frontend tinha fallback local com catalogo ficticio se a API de servicos falhasse.
- Profissionais demo ja tinham filtro parcial por `demo-pro-*`, mas a regra era estreita.

## 6. Comportamento depois

- `/public/services` filtra servicos ativos e remove itens com marcadores de teste/demo/TG/db.
- O mesmo filtro e aplicado na resolucao de servico usada por:
  - `/public/services/:serviceId/professionals`
  - `/public/slots`
  - `POST /public/booking`
- Servico real ativo como `Barba Terapia` continua visivel.
- Servico inativo nao aparece.
- O frontend do booking publico tambem filtra a lista recebida.
- Se a API publica de servicos falhar, o frontend nao exibe mais catalogo ficticio; mostra mensagem de indisponibilidade.
- Profissionais publicos tambem passam pelo filtro de marcadores em `id` e `name`.

## 7. Regra de filtro publico

Normalizacao:

- converte para string;
- remove acentos via `normalize("NFD")`;
- remove diacriticos;
- converte para minusculas.

Marcadores bloqueados:

- `teste`
- `tg`
- `demo`
- `db`

Campos avaliados em servicos:

- `id`
- `name`
- `description`
- `category`
- `notes`
- `active` / `isActive`

Campos avaliados em profissionais:

- `id`
- `name`

## 8. Motivo para proteger no backend

O frontend e facil de contornar: qualquer cliente pode chamar `/public/services` diretamente ou usar uma versao antiga/cacheada da pagina. Por isso, a regra precisa existir no backend antes de devolver dados publicos e antes de permitir slots, profissionais e booking para um servico bloqueado.

O filtro no frontend foi mantido como defesa em profundidade para evitar renderizacao caso algum endpoint intermediario, cache ou mock entregue item indevido.

## 9. Arquivos alterados

- `src/http/app.ts`
  - criou normalizacao e filtro publico;
  - aplicou filtro em servicos publicos;
  - aplicou filtro na resolucao de servico usada por profissionais, slots e booking;
  - ampliou filtro de profissional publico para marcadores alem de `demo-pro-*`;
  - ajustou texto publico de horario fora do expediente para linguagem menos interna.
- `public/booking.html`
  - filtrou servicos recebidos no booking publico;
  - removeu fallback com catalogo ficticio;
  - adicionou mensagem quando servicos publicos nao carregam.
- `tests/api.spec.ts`
  - adicionou cobertura para `/public/services` esconder teste/demo/TG/db/inativos;
  - reforcou filtro de profissionais publicos;
  - reforcou que slots/booking publicos nao vazam dados sensiveis.
- `tests/frontend-booking-public.spec.ts`
  - permitiu mockar lista/status de servicos;
  - adicionou cobertura para nao renderizar servicos de teste/demo/TG/db;
  - adicionou cobertura para nao usar catalogo ficticio em falha da API;
  - preservou regressao do fluxo mobile, double tap e pos-sucesso.

## 10. Testes adicionados ou alterados

API:

- `blinda /public/services contra servicos de teste, demo, TG, db e inativos`
- `lista somente dados publicos seguros dos profissionais elegiveis por servico`
- ajustes em contrato de profissionais demo e slots publicos.

Frontend:

- `nao renderiza servicos publicos com marcadores de teste, TG, demo ou db`
- `nao usa catalogo ficticio quando a API publica de servicos falha`
- preservacao dos contratos publicos ja validados.

## 11. Comandos executados e resultados

- `git status -sb`: branch `main...origin/main`, inicialmente com 4 arquivos modificados.
- `git log --oneline -10`: ultimo commit antes da sprint era `7fd1d43 docs: diagnosticar dados reais e horarios da barbearia`.
- `git diff --stat`: 4 arquivos modificados antes da documentacao.
- `git diff`: revisado integralmente.
- `rg`/leitura de `prisma/schema.prisma`: confirmado que `Service` nao tem campo publico/visibilidade.
- `git diff --check`: passou.
- `npx vitest run tests/api.spec.ts -t "public/services"`: passou, 1 teste executado, 81 skipped.
- `npx vitest run tests/api.spec.ts -t "public/slots"`: passou, 1 teste executado, 81 skipped.
- `npx vitest run tests/frontend-booking-public.spec.ts`: passou, 14 testes.
- `npm test`: primeira tentativa em paralelo com typecheck/build falhou por timeouts e o typecheck paralelo foi morto; repetido isolado passou, 8 arquivos passed, 1 skipped, 126 testes passed, 19 skipped.
- `npx tsc --noEmit`: primeira tentativa paralela foi morta pelo sistema; repetido isolado passou.
- `npm run build`: passou isolado.

## 12. O que nao foi feito por seguranca

- Nao houve migration Prisma.
- Nao houve seed.
- Nao houve alteracao de `.env`.
- Nao houve alteracao manual no banco.
- Nao houve limpeza de unidades, profissionais, servicos, produtos ou pagamentos.
- Nao houve criacao/cancelamento de cliente ou agendamento real.
- Nao houve checkout, venda, pagamento, comissao, refund ou estorno.
- Nao houve deploy.
- Nao houve PM2 restart.
- Nao houve alteracao de Nginx, firewall ou certificado.
- `npm run test:db` nao foi executado porque pode tocar PostgreSQL real dependendo de `DATABASE_URL`; para esta sprint bastava validar backend em memoria, frontend, typecheck e build.

## 13. Riscos restantes

- Filtro textual pode esconder servico real por falso positivo se o nome/descricao/categoria contiver `teste`, `tg`, `demo` ou `db` legitimamente.
- Filtro textual pode deixar passar sujeira que nao contenha esses marcadores.
- A regra fica duplicada entre backend e frontend; isso e aceitavel como defesa adicional, mas aumenta manutencao.
- Sem campo formal de publicacao, `active=true` continua misturando "ativo internamente" com "visivel ao cliente".
- Dados reais ainda precisam ser confirmados com Geovane antes de ajustar nomes, precos e duracoes.

## 14. Opiniao tecnica Codex/CTO

O escopo da Sprint 222 esta correto: antes de revisar servicos reais, horarios ou pagamentos, era necessario impedir exposicao publica de sujeira obvia.

A solucao atual e segura como contencao curta, mas tem cheiro de paliativo. Nao e uma gambiarra perigosa porque a regra esta no backend, e pequena, testada e reversivel. Ainda assim, nao deve virar desenho definitivo do produto.

O filtro `teste`/`tg`/`demo`/`db` e suficiente temporariamente para os dados diagnosticados na Sprint 221. Ele nao e suficiente como politica de catalogo publico de longo prazo.

A solucao melhor e adicionar modelagem explicita, por exemplo:

- `publicVisible Boolean @default(false)`;
- ou `publicationStatus` com `PUBLIC`, `INTERNAL`, `BUDGET_ONLY`, `HIDDEN`;
- ou tabela/politica de canais de venda se o produto crescer.

Essa solucao melhor exige migration, decisao de produto e saneamento de dados, portanto nao foi executada nesta sprint.

O frontend duplicar a regra nao e o desenho ideal, mas aqui funciona como camada extra. A fonte de verdade deve continuar sendo o backend.

Estamos pulando de proposito a limpeza real do banco, porque limpar por inferencia sem confirmacao pode quebrar historico, relatorios e demonstracao.

## 15. Recomendacao para Sprint 223

Sprint 223 deve revisar o catalogo publico real com Geovane antes de alterar dados reais:

- confirmar quais servicos aparecem no booking publico;
- confirmar nomes comerciais;
- confirmar duracao publica;
- confirmar preco;
- confirmar se sobrancelha, feminino e quimicas entram no publico ou ficam manual/orcamento;
- decidir se a solucao temporaria por filtro textual continua ate existir campo de publicacao;
- se autorizado, planejar migration de visibilidade publica ou status de publicacao em uma sprint separada.

## 16. Recomendacao do que nao fazer agora

- Nao limpar banco automaticamente.
- Nao desativar servicos/profissionais/produtos reais por inferencia.
- Nao migrar schema sem decisao explicita.
- Nao fazer deploy antes de fechar commit, push e revisar ambiente alvo.
- Nao executar `test:db` sem confirmar banco isolado.
- Nao avancar para Sprints 223, 224 ou 225 dentro desta execucao.

## 17. Decisao final

APROVADO COM RESSALVAS.

A Sprint 222 foi fechada como blindagem temporaria e segura do catalogo publico. A protecao reduz risco imediato para cliente, mas a arquitetura correta ainda exige campo/status formal de publicacao e revisao humana do catalogo real.
