# Sprint 226 - Validacao do painel interno do Geovane

Data: 2026-06-26 UTC
Decisao final: BLOQUEADO para fluxo real / Sprint 227
Tipo: diagnostico, auditoria, UX e documentacao

## 1. Objetivo

Validar o painel interno do Geovane em modo seguro, sem alterar dados reais, para entender se a operacao interna esta pronta para proximas validacoes reais.

Esta sprint nao executou checkout, pagamento, venda, comissao, estoque, seed, migration, deploy, restart PM2 ou alteracao de banco.

## 2. Contexto pos-Bloco A

O Bloco A - Booking publico basico estava fechado com ressalvas antes desta sprint.

Estado vindo das Sprints 225 e 225.1:

- booking publico validado no celular;
- `/public/services` limpo apos restart controlado do PM2;
- nao houve criacao de agendamento na validacao final;
- nao houve checkout, venda, pagamento, comissao, financeiro, refund ou estorno;
- runbook operacional criado para evitar producao rodando codigo antigo;
- ressalvas restantes: confirmar catalogo real com Geovane, criar campo formal de visibilidade publica e automatizar smoke readonly.

## 3. Decisao de CTO

BLOQUEADO para avancar diretamente para Sprint 227 - Fluxo atendimento completo com uso real.

O painel interno esta suficiente para teste guiado/read-only com Geovane, mas nao esta pronto para piloto operacional real sem saneamento/roteiro. A base interna contem muitos dados demo/teste ativos, principalmente em profissionais, produtos, servicos e clientes. Alem disso, o owner enxerga acoes transacionais de alto impacto: novo agendamento, cobrar venda, lancamento financeiro, estoque, servico, cliente, meta, pagamento de comissao e estorno/devolucao.

Como CTO, eu nao liberaria atendimento completo ou checkout real antes de uma sprint especifica de preparacao operacional.

## 4. Estado inicial do Git

Comandos executados no inicio:

```bash
pwd
git status -sb
git log --oneline -10
```

Resultado:

- diretorio: `/root/software-barbearia`;
- branch: `main`;
- estado: `## main...origin/main`;
- ultimo commit: `f60c2b5 docs: registrar runbook de deploy restart e smoke`;
- sem trabalho pendente no inicio.

## 5. Mapa do painel interno

Tela principal:

- `/` serve `public/index.html`;
- `/login` serve `public/login.html`;
- o shell interno exige `authToken`/`sb.authSession` no `localStorage`;
- sessao expirada remove token e redireciona para `/login`.

Menu principal em `public/components/menu-config.js`:

- Operacao: Agenda, PDV, Clientes;
- Gestao: Financeiro, Equipe;
- Administracao: Servicos, Auditoria;
- Integracoes: WhatsApp, Link Agendamento;
- modulos secundarios owner: Configuracoes, Estoque, Comissoes, Metas, Fidelizacao, Automacoes, Relatorios.

Perfis visuais:

- `owner`: todos os modulos principais e secundarios sensiveis;
- `recepcao`: Agenda, PDV, Clientes;
- `profissional`: Agenda, Clientes;
- o modulo `estoque` tambem fica acessivel quando `operacao` e permitida, por acoplamento PDV/estoque no frontend.

Acoes principais visiveis no HTML/frontend:

- novo agendamento;
- confirmar agendamento;
- cobrar venda;
- novo lancamento financeiro;
- novo produto;
- ajuste de estoque;
- adicionar servico;
- novo profissional;
- novo cliente;
- salvar meta;
- abrir WhatsApp;
- estorno/devolucao em detalhes de venda/atendimento;
- pagamento de comissao em modulo financeiro/comissoes.

## 6. Validacao de autenticacao/perfis

Inspecao segura:

- variaveis `SMOKE_*`: owner configurado; recepcao e profissional ausentes;
- valores de credenciais nao foram exibidos;
- nao foi feito login manual com navegador visivel;
- nao foram usadas credenciais reais em fluxo manual.

Backend:

- `/auth/login` e `/auth/firebase` sao publicos;
- `/auth/me` exige `owner`, `recepcao` ou `profissional`;
- `/users`, `/audit/events`, `/settings`, `/reports/management/*`, `/financial/*`, `/commissions/*`, WhatsApp e automacoes sensiveis sao owner-only;
- `/sales/products` permite `owner` e `recepcao`;
- rotas de agenda e alguns endpoints operacionais permitem `owner`, `recepcao` e `profissional`;
- o preHandler injeta `unitId` da sessao e bloqueia mismatch de tenant.

Testes confirmaram:

- login e `/auth/me` preservam perfis;
- profissional nao acessa `/users`, auditoria, settings ou relatorio financeiro;
- recepcao/profissional nao acessam relatorios gerenciais sensiveis;
- recepcao/profissional nao pagam comissao;
- tenant guard bloqueia `unitId` divergente.

Risco: recepcao visualmente acessa PDV. Isso pode ser correto operacionalmente, mas e perigoso sem treinamento porque venda/refund alteram estoque e financeiro.

## 7. Validacao dashboard

O painel inicial real do shell restaura `dashboard` como `financeiro`, e `ROLE_DEFAULT_MODULE` aponta para `agenda`. Existe `dashboardSection` no HTML, mas o menu atual nao mostra Dashboard como item primario claro.

Avaliacoes:

- o frontend tem cards executivos, meta mensal, alertas, performance e insights;
- textos como "Painel executivo", "Menos ruido" e "Mais clareza" sao bons para produto, mas podem soar genericos;
- dashboard e inicio financeiro podem confundir o Geovane se ele esperar uma tela inicial unica;
- indicadores financeiros no inicio exigem base limpa para nao misturar demo/teste com operacao real.

Risco classificado: P2.

## 8. Validacao agenda

Frontend:

- agenda possui semana/lista, filtros, proximo atendimento, status, profissional, cliente, servico e valor;
- acoes visiveis incluem novo agendamento, confirmar, iniciar, finalizar, cancelar, falta, pagamento, vender produto e estornar atendimento dependendo do status/fluxo;
- status sao compreensiveis: Agendado, Confirmado, Em atendimento, Concluido, Cancelado, Nao compareceu, Bloqueado.

Banco readonly:

- ha atendimentos em `SCHEDULED`, `CONFIRMED`, `COMPLETED`, `CANCELLED` e `NO_SHOW`;
- nao foi criado, cancelado, confirmado ou finalizado nenhum agendamento nesta sprint.

Risco:

- P1 para uso real: agenda esta misturada com base historica/demo e muitos profissionais ativos de teste, o que pode levar o usuario a selecionar profissional errado;
- P2 para UX: acoes de atendimento/checkout aparecem perto da agenda e precisam de roteiro assistido.

## 9. Validacao clientes

Frontend:

- lista/cards de clientes mostram nome, telefone formatado, status, ultima visita, LTV, ticket medio e acao WhatsApp;
- ha fila de reativacao e sinais de automacao;
- ha botao "Novo cliente".

Banco readonly:

- total de clientes em `unit-01`: 28;
- clientes com marcador demo/teste/TG em nome/notas: 11;
- nenhum nome, telefone ou e-mail de cliente foi registrado neste documento.

Riscos:

- P1: clientes teste/demo misturados com carteira real bloqueiam piloto operacional sem saneamento;
- P2: LTV/ticket medio podem parecer reais e induzir decisao comercial errada se vierem de massa de teste;
- P2: WhatsApp e uma acao sensivel para dado real e deve ser usada somente com roteiro.

## 10. Validacao servicos

Frontend:

- catalogo interno mostra ativos/inativos, preco, duracao, categoria, profissionais habilitados, margem e historico;
- ha modal para adicionar/editar servico;
- ha informacao de margem e candidatos de ajuste.

Banco readonly:

- servicos totais: 7;
- ativos: 7;
- itens com marcador demo/teste/TG: 5;
- candidatos reais sem marcador: `svc-corte` e `svc-barba`.

Riscos:

- P1: servicos demo/teste seguem ativos internamente e podem ser selecionados em agenda/checkout;
- P1: valores/duracoes de corte e barba ainda precisam confirmacao com Geovane;
- P3: falta campo formal de visibilidade publica, ja registrado como ressalva do Bloco A.

## 11. Validacao produtos/estoque/PDV

Frontend:

- PDV mostra busca, categorias, grid de produtos, carrinho, cliente opcional, profissional e botao "Cobrar venda";
- estoque mostra produtos, quantidade atual, minimo, status, valor estimado e acoes de novo produto/ajuste;
- carrinho valida estoque insuficiente no frontend;
- venda/refund alteram estoque/financeiro quando executados.

Banco readonly:

- produtos totais: 9;
- ativos: 9;
- produtos com marcador demo/teste: 7;
- produtos abaixo do minimo: 0 na consulta atual;
- vendas de produto existentes: 14;
- movimentos de estoque existentes: 9.

Riscos:

- P1: PDV/estoque nao devem ir para uso real com produtos demo/teste ativos;
- P1: botao "Cobrar venda" e refund/devolucao sao perigosos sem base isolada e roteiro;
- P2: recepcao enxerga PDV por design; isso deve ser validado com Geovane antes de operar.

## 12. Validacao financeiro

Frontend/backend:

- financeiro carrega resumo, fluxo, transacoes, comissoes, relatorios e overview gerencial;
- modulo tem novo lancamento, exclusao de lancamento, pagamento de comissao e relatorios;
- backend restringe `/financial/*` a owner, exceto regras especificas de vendas/refund;
- testes in-memory cobrem idempotencia, permissao e relatorios.

Banco readonly:

- lancamentos financeiros: 101;
- comissoes pendentes: 82;
- comissoes pagas: 1;
- comissoes canceladas: 1.

Riscos:

- P0 se usado sem controle: lancamento financeiro, pagamento de comissao, checkout e estorno alteram saldo real;
- P1 para piloto real: financeiro nao deve ser validado com acao real enquanto a base tem demo/teste e comissoes pendentes nao homologadas;
- P2: dashboard financeiro pode confundir se os numeros atuais forem interpretados como verdade operacional.

## 13. Validacao equipe/profissionais

Frontend:

- equipe mostra profissionais, producao, ocupacao, comissoes e acoes para abrir detalhes/comissoes;
- existe modal de novo profissional.

Banco readonly:

- profissionais totais: 44;
- ativos: 44;
- `Geovane Borges` aparece como `pro-01`;
- ha muitos profissionais com IDs/nome de teste, incluindo `demo-pro-*`, `Profissional DB` e `Profissional Teste Comissao TG`.

Riscos:

- P1: equipe/profissionais bloqueia piloto operacional real porque a lista ativa esta contaminada;
- P1: selecionar profissional errado em agenda/checkout pode gerar dados financeiros/comissao incorretos;
- P2: tela pode parecer quebrada para Geovane por excesso de profissionais irreais.

## 14. Validacao responsiva basica

Nao foi aberto navegador visivel automaticamente.

Validacoes usadas:

- inspecao de `public/index.html`, `public/styles/layout.css`, `public/app.js` e componentes;
- teste headless `tests/frontend-mobile-overflow.spec.ts`: passou, 2 testes;
- teste `tests/frontend-menu-config.spec.ts`: passou, 3 testes.

Observacoes:

- o painel tem mobile sidebar e mobile tabs;
- o menu mobile existe, mas validacao visual humana do menu aberto nao foi feita nesta sprint;
- telas financeiras/PDV/estoque sao densas e exigem validacao assistida em celular antes de uso real.

## 15. Problemas encontrados

1. Base interna contaminada com dados demo/teste ativos em servicos, produtos, profissionais e clientes.
2. Equipe tem 44 profissionais ativos, com muitos `Profissional DB`/demo/teste.
3. Produtos do PDV/estoque tem maioria demo/teste ativa.
4. Servicos internos demo/teste ativos podem ser escolhidos em fluxos internos.
5. Financeiro/comissoes possuem volume de lancamentos e 82 comissoes pendentes sem homologacao operacional.
6. Dashboard/inicio nao e conceitualmente claro: `dashboard` existe, mas a navegacao default vai para agenda/financeiro.
7. Recepcao tem PDV visualmente liberado; pode ser correto, mas precisa decisao operacional.
8. Credenciais `SMOKE_*` de recepcao/profissional nao estao configuradas, limitando smoke autenticado real por perfil.

## 16. Riscos P0/P1/P2/P3

### P0

- Usar checkout, venda, pagamento de comissao, estorno, refund, lancamento financeiro ou ajuste de estoque em producao sem roteiro/backup/confirmacao pode causar perda financeira, baixa incorreta de estoque ou dado real errado.

### P1

- Dados internos demo/teste ativos bloqueiam piloto operacional real com Geovane.
- Lista de profissionais contaminada bloqueia agenda/checkout real.
- Produtos demo/teste ativos bloqueiam PDV/estoque real.
- Servicos demo/teste ativos bloqueiam atendimento completo real.
- Comissoes pendentes sem homologacao bloqueiam validacao financeira real.

### P2

- Inicio/dashboard pode confundir: dashboard existe, mas o app abre agenda/financeiro conforme role/storage.
- Geovane pode interpretar numeros de teste como metricas reais.
- Acoes perigosas estao visiveis para owner sem camada de "modo treinamento" ou confirmacao contextual.
- Recepcao com PDV precisa decisao de negocio.
- Mobile de telas densas precisa validacao humana assistida.

### P3

- Criar campo formal de visibilidade publica de servico.
- Automatizar smoke readonly publico e autenticado.
- Expor/registrar versao de commit do runtime.
- Melhorar labels de Inicio/Dashboard.
- Criar modo sandbox/treinamento para fluxo interno.

## 17. O que nao foi feito por seguranca

- Nao abri navegador visivel automaticamente.
- Nao usei credenciais reais em validacao manual.
- Nao criei cliente real.
- Nao criei, confirmei, cancelei ou finalizei agendamento real.
- Nao executei checkout.
- Nao executei pagamento.
- Nao executei venda.
- Nao paguei comissao.
- Nao fiz refund/estorno.
- Nao alterei estoque.
- Nao alterei servicos, precos ou duracoes.
- Nao rodei migration.
- Nao rodei seed.
- Nao alterei `.env`.
- Nao alterei banco manualmente.
- Nao fiz deploy.
- Nao reiniciei/recarreguei PM2.
- Nao alterei Nginx/firewall/certificado.
- Nao rodei `npm run test:db`.
- Nao avancei para Sprint 227.

## 18. Testes executados

| Comando | Resultado |
| --- | --- |
| `npx vitest run tests/api.spec.ts -t "auth"` | Passou; 1 arquivo, 2 testes executados, 81 skipped |
| `npx vitest run tests/api.spec.ts -t "reports"` | Filtro nao encontrou teste executavel; 1 arquivo skipped, 83 skipped |
| `npx vitest run tests/api.spec.ts -t "financial"` | Passou; 1 arquivo, 1 teste executado, 82 skipped |
| `npx vitest run tests/api.spec.ts -t "relatorios"` | Passou; 1 arquivo, 2 testes executados, 81 skipped |
| `npx vitest run tests/frontend-booking-public.spec.ts` | Passou; 14 testes |
| `npm test` | Passou; 8 arquivos passed, 1 skipped; 127 passed, 19 skipped |
| `npx tsc --noEmit` | Passou |
| `npm run build` | Passou |
| `npx vitest run tests/frontend-menu-config.spec.ts` | Passou; 3 testes |
| `npx vitest run tests/frontend-mobile-overflow.spec.ts` | Passou; 2 testes |
| `git diff --check` | Passou |

`npm run test:db` nao foi executado porque pode tocar PostgreSQL real.

## 19. Opiniao tecnica CTO

### O painel interno esta pronto para o Geovane testar?

Sim, para teste guiado/read-only e validacao de entendimento. Nao, para uso operacional real sem acompanhamento.

### O que impediria piloto interno?

Para piloto interno real, impedem: dados demo/teste ativos, lista de profissionais contaminada, produtos demo ativos, servicos demo ativos, comissoes pendentes sem homologacao e acoes transacionais perigosas sem roteiro.

### O que parece confuso para usuario real?

Inicio/dashboard, excesso de modulos, muitos profissionais irreais, numeros financeiros possivelmente de teste, nomes de servicos "Premium/Terapia" ainda nao confirmados e presenca de PDV/financeiro antes de treinamento.

### O que esta perigoso financeiramente?

Checkout, cobrar venda, pagamento de comissao, lancamento manual, exclusao de lancamento, refund/estorno e ajuste de estoque. Esses fluxos parecem tecnicamente protegidos por permissao, mas nao devem ser acionados em producao sem massa validada e roteiro.

### O que deve ser validado antes de checkout real?

Catalogo real, precos, duracoes, produtos vendaveis, estoque inicial, profissional correto, regra de comissao, formas de pagamento, politica de estorno, auditoria, idempotencia em ambiente real e plano de reversao.

### O que nao devemos mexer agora?

Nao devemos mexer agora em banco, financeiro, estoque, checkout, comissao, servicos reais, produtos reais, agenda real, migration, seed, deploy ou PM2. A proxima etapa deve ser preparada e autorizada separadamente.

### Voce recomenda avancar para Sprint 227 - Fluxo atendimento completo?

Nao recomendo avancar diretamente para atendimento completo real. Recomendo uma sprint intermediaria de saneamento/roteiro de piloto interno, ou uma Sprint 227 redefinida como piloto assistido sem transacao real ate aprovar dados.

### Voce discorda de avancar?

Sim, discordo de avancar como se o painel estivesse operacionalmente pronto. O risco nao e falta de tela: e a combinacao de dados contaminados com botoes que alteram financeiro, estoque, agenda e comissoes.

## 20. Decisao final

BLOQUEADO para Sprint 227 de fluxo atendimento completo real.

A Sprint 226 cumpriu o diagnostico e confirmou que o painel tem estrutura funcional e protecoes tecnicas relevantes, mas a operacao interna ainda nao esta pronta para uso real.

## 21. Proxima sprint recomendada

Recomendo abrir uma sprint especifica antes do atendimento completo:

1. saneamento readonly/planejado da base interna com proposta de quais dados manter, ocultar, inativar ou migrar;
2. checklist com Geovane para servicos, produtos, profissionais, precos, duracoes e comissoes;
3. roteiro de piloto interno assistido sem checkout real no primeiro passo;
4. depois, uma sprint separada para fluxo atendimento completo com massa validada, autorizacao explicita e plano de reversao.
