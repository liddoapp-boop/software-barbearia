# Sprint 226.5 - Catalogo real do Geovane e plano de saneamento de servicos

Data: 2026-06-26

Responsavel tecnico: CTO tecnico do Projeto Software Barbearia

Escopo: registrar a resposta real do Geovane sobre catalogo/precos, comparar com os servicos atuais e definir plano seguro de saneamento futuro. Nenhum banco foi alterado.

## 1. Objetivo

Transformar a resposta do Geovane em decisao tecnica de catalogo e saneamento de servicos, sem inventar duracao e sem corromper historico de agenda, checkout, financeiro, comissao ou booking publico.

Esta sprint executou somente leitura, analise e documentacao. Nao criou, renomeou, atualizou, inativou ou removeu servico real.

## 2. Contexto

O Bloco A foi fechado com ressalvas: o booking publico funciona para piloto controlado, mas o catalogo ainda era minimo e parcialmente baseado em dados seed/demo.

A Sprint 226.4 validou smoke interno owner em modo readonly:

- login owner validado;
- 24 endpoints internos readonly autenticados responderam 2xx;
- nenhum 500 nos endpoints avaliados;
- recepcao/profissional seguem sem smoke externo real;
- Sprint 227 continua bloqueada por dados internos nao saneados.

Sprints recentes relevantes:

| Sprint | Resultado util para esta sprint |
| --- | --- |
| 223 | Catalogo publico atual tem 7 servicos ativos, mas so 2 aparecem no publico por filtro anti-demo/teste. |
| 225 | Booking publico foi validado no mobile com catalogo minimo. |
| 226.2 | Todos os 7 servicos tem agenda e financeiro/comissao relacionados. |
| 226.3 | Saneamento real exige backup, data de corte, dry-run atualizado e autorizacao explicita. |
| 226.4 | Endpoints internos readonly estao tecnicamente saudaveis, mas dados seguem contaminados. |

## 3. Resposta do Geovane

Resposta recebida em 2026-06-26:

> Bom dia joao Aqui aonde eu moro e barato o corte
> Corte 30
> Barba 20
> Hidratacao 20
> Luzes 50
> Pigmentacao 45

Interpretacao de negocio:

| Servico confirmado | Preco confirmado |
| --- | ---: |
| Corte | R$ 30,00 |
| Barba | R$ 20,00 |
| Hidratacao | R$ 20,00 |
| Luzes | R$ 50,00 |
| Pigmentacao | R$ 45,00 |

Geovane confirmou catalogo e preco inicial. Ele nao confirmou duracao, horarios definitivos, produtos, estoque, profissionais alem dele, comissao, financeiro historico, clientes reais nem data de corte.

## 4. Decisao do pre-flight CTO

Decisao: LIBERADO COM RESSALVAS.

| Checagem | Resultado |
| --- | --- |
| Diretorio | `/root/software-barbearia` |
| Branch/status inicial | `## main...origin/main` |
| HEAD esperado | `65b8850 docs: registrar smoke autenticado interno readonly` |
| Worktree inicial | Limpa |
| Ultimo commit esperado presente | Sim |
| Pode ler `.planning`, schema e rotas? | Sim |
| Pode consultar banco readonly? | Sim |
| Pode alterar banco? | Nao |
| Pode criar/renomear/inativar servico real? | Nao |
| Risco historico | Alto se alterar preco/nome/duracao diretamente |
| Risco PII | Baixo nesta sprint, porque nao houve listagem de clientes |
| Valor da etapa | Alto, porque existe resposta real do dono |

Ressalvas:

1. A resposta destrava catalogo e preco, mas nao destrava duracao.
2. Servicos atuais possuem historico; qualquer mutacao direta pode afetar relatorios antigos que leem `Service.price` atual.
3. Sem backup, lista exata, contagem antes/depois e autorizacao explicita, nao ha mutacao segura.

## 5. Decisao de CTO

Decisao: nao atualizar registros historicos agora.

A estrategia mais segura e preparar servicos canonicos novos para o catalogo real confirmado e manter/inativar futuramente os registros antigos apenas depois de:

1. duracoes confirmadas;
2. backup PostgreSQL recente com checksum;
3. dry-run readonly atualizado;
4. lista exata de registros afetados;
5. contagem antes/depois;
6. decisao sobre historico e data de corte;
7. aprovacao explicita para mutacao.

Enquanto isso, o booking publico deve continuar limitado temporariamente. Nao recomendo publicar Hidratacao, Luzes ou Pigmentacao sem duracao, porque isso cria slots errados e pode quebrar a operacao real.

## 6. Catalogo real confirmado

Catalogo real inicial confirmado pelo Geovane:

| Servico canonico | Preco | Status tecnico |
| --- | ---: | --- |
| Corte | R$ 30,00 | Confirmado, depende de duracao. |
| Barba | R$ 20,00 | Confirmado, depende de duracao. |
| Hidratacao | R$ 20,00 | Confirmado, depende de duracao e decisao de publicacao. |
| Luzes | R$ 50,00 | Confirmado, depende de duracao e decisao de publicacao. |
| Pigmentacao | R$ 45,00 | Confirmado, depende de duracao e decisao de publicacao. |

## 7. Pendencias de informacao

Ainda pendente:

- duracao media de cada servico;
- se todos entram no agendamento online;
- horarios definitivos;
- produtos reais consumidos por servico;
- estoque fisico;
- profissionais reais alem do Geovane;
- regras de comissao;
- destino do financeiro historico;
- clientes reais;
- data de corte para separar legado/teste de operacao real.

## 8. Schema e impacto historico

Achados no schema:

| Area | Achado |
| --- | --- |
| `Service` | Guarda `price`, `durationMin`, `name`, `category`, `active`; nao tem `publicVisible` nem `publicationStatus`. |
| `Appointment` | Guarda `serviceId`, `startsAt`, `endsAt`; nao guarda snapshot de `serviceName`, `servicePrice` ou `durationMin`. |
| Checkout/conclusao | Calcula receita e comissao usando `Service.price` no momento da conclusao/checkout. |
| `FinancialEntry` | Guarda `amount` proprio e referencia o agendamento por `referenceType/referenceId`; isso preserva o valor financeiro ja gerado. |
| `CommissionEntry` | Guarda `baseAmount`, `commissionRate` e `commissionAmount`; isso preserva comissao ja gerada. |
| Relatorios | Parte dos relatorios usa `FinancialEntry.amount`, mas outros rankings/agenda/performance recalculam receita historica via `appointment.service.price`. |
| Delete | `Appointment.serviceId` usa `onDelete: Restrict`; servico com agendamento nao deve ser removido. |
| Vinculos | `ServiceProfessional` usa cascade ao deletar servico; deletar servico apagaria vinculos operacionais. |
| Estoque por servico | `ServiceStockConsumption.serviceId` usa `Restrict`; servico com consumo nao deve ser apagado. |

Resposta CTO:

| Pergunta | Resposta |
| --- | --- |
| Agendamento guarda snapshot de preco? | Nao. |
| Checkout/financeiro guarda valor proprio? | Sim, `FinancialEntry.amount`. |
| Comissao guarda valor proprio? | Sim, `CommissionEntry.baseAmount` e `commissionAmount`. |
| Relatorios recalculam usando preco atual? | Sim, alguns relatorios e indicadores usam `appointment.service.price`. |
| Alterar preco diretamente e seguro? | Nao sem recorte/backup, porque pode reescrever leitura historica em relatorios que usam o preco atual. |
| Alterar nome diretamente e seguro? | Nao como verdade historica, porque agendamentos antigos exibem o nome via relacao atual. |
| Inativar servico antigo preserva historico? | Em geral sim, desde que nao remova e que fluxos internos aceitem historico inativo. Exige teste e autorizacao. |
| Remover servico com historico e seguro? | Nao. |
| Criar servicos canonicos e mais seguro? | Sim, porque separa operacao nova do legado contaminado. |

## 9. Comparacao com servicos atuais

Consulta readonly em `unit-01` encontrou 7 servicos. Todos estao ativos e todos tem historico de agendamento, financeiro e comissao.

| ID | Nome atual | Preco atual | Duracao atual | Publico hoje | Historico | Comparacao com catalogo confirmado | Classificacao CTO |
| --- | --- | ---: | ---: | --- | ---: | --- | --- |
| `svc-corte` | Corte Premium | R$ 75,00 | 45 min | Sim | 22 agend., 11 financ., 11 com. | Corresponde a Corte, mas nome/preco/duracao divergem. | Nao atualizar agora; manter por historico; criar Corte canonico futuro. |
| `svc-barba` | Barba Terapia | R$ 55,00 | 35 min | Sim | 42 agend., 14 financ., 14 com., 2 refunds | Corresponde a Barba, mas nome/preco/duracao divergem. | Nao atualizar agora; manter por historico; criar Barba canonica futura. |
| `demo-svc-hidratacao` | Hidratacao Capilar | R$ 65,00 | 40 min | Nao | 21 agend., 12 financ., 12 com. | Corresponde parcialmente a Hidratacao, mas origem demo e preco divergem. | Manter fora do publico; nao reaproveitar sem decisao; preferir canonico novo. |
| `demo-svc-degrade` | Degrade Navalhado | R$ 85,00 | 50 min | Nao | 20 agend., 12 financ., 12 com. | Pode ser tipo de corte, mas Geovane confirmou apenas Corte generico. | Manter fora do publico; depende de decisao; nao executar. |
| `demo-svc-combo` | Combo Cabelo + Barba | R$ 115,00 | 75 min | Nao | 23 agend., 11 financ., 11 com. | Nao foi confirmado nesta resposta. | Manter fora do publico; futuro inativar/legado se Geovane negar. |
| `demo-svc-sobrancelha` | Design de Sobrancelha | R$ 35,00 | 20 min | Nao | 21 agend., 10 financ., 10 com. | Nao foi confirmado nesta resposta. | Manter fora do publico; futuro inativar/legado se nao fizer parte do piloto. |
| `a1ea4294-e3a9-42b5-b5e5-3ca719f5b483` | Servico Teste Comissao TG | R$ 100,00 | 30 min | Nao | 1 agend., 1 financ., 1 com. | Nao corresponde a catalogo real. | Candidato forte a inativar futuramente; nunca remover por historico. |

Divergencias de preco:

| Servico confirmado | Registro atual mais proximo | Preco atual | Preco confirmado | Divergencia |
| --- | --- | ---: | ---: | ---: |
| Corte | `svc-corte` | R$ 75,00 | R$ 30,00 | -R$ 45,00 |
| Barba | `svc-barba` | R$ 55,00 | R$ 20,00 | -R$ 35,00 |
| Hidratacao | `demo-svc-hidratacao` | R$ 65,00 | R$ 20,00 | -R$ 45,00 |
| Luzes | Nenhum registro atual direto | N/A | R$ 50,00 | Criacao futura |
| Pigmentacao | Nenhum registro atual direto | N/A | R$ 45,00 | Criacao futura |

## 10. Estrategia recomendada

Estrategia recomendada: Opcao B com contencao da Opcao C.

1. Nao atualizar diretamente `svc-corte`, `svc-barba` ou `demo-svc-hidratacao` agora.
2. Preparar criacao futura de servicos canonicos novos:
   - Corte, R$ 30, duracao pendente;
   - Barba, R$ 20, duracao pendente;
   - Hidratacao, R$ 20, duracao pendente;
   - Luzes, R$ 50, duracao pendente;
   - Pigmentacao, R$ 45, duracao pendente.
3. Depois de criados e validados, inativar/ocultar os servicos antigos para uso futuro, preservando historico.
4. Manter booking publico temporariamente limitado ate duracoes serem confirmadas.
5. Se for necessario expor algo antes do saneamento, expor no maximo Corte/Barba somente depois de confirmar duracao e com aprovacao explicita.

Justificativa: como `Appointment` nao tem snapshot de preco/nome e parte dos relatorios le o servico atual, alterar registros historicos mistura legado com operacao nova.

## 11. Plano exato de saneamento futuro

| Acao sugerida | Servico atual | Novo nome | Novo preco | Duracao atual | Duracao pendente | Impacto historico | Risco | Pre-condicao | Status |
| --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- |
| Criar canonico novo | N/A | Corte | R$ 30,00 | N/A | Sim | Nenhum historico antigo afetado se for novo ID. | P1 se publicar sem duracao. | Confirmar duracao, backup, autorizacao. | Depende de duracao |
| Criar canonico novo | N/A | Barba | R$ 20,00 | N/A | Sim | Nenhum historico antigo afetado se for novo ID. | P1 se publicar sem duracao. | Confirmar duracao, backup, autorizacao. | Depende de duracao |
| Criar canonico novo | N/A | Hidratacao | R$ 20,00 | N/A | Sim | Nenhum historico antigo afetado se for novo ID. | P1/P2 por tempo/produto indefinido. | Confirmar duracao e se entra no online. | Depende de duracao |
| Criar canonico novo | N/A | Luzes | R$ 50,00 | N/A | Sim | Nenhum historico antigo afetado se for novo ID. | P1/P2 por quimica/tempo variavel. | Confirmar duracao e se entra no online. | Depende de duracao/decisao |
| Criar canonico novo | N/A | Pigmentacao | R$ 45,00 | N/A | Sim | Nenhum historico antigo afetado se for novo ID. | P1/P2 por produto/tempo variavel. | Confirmar duracao e se entra no online. | Depende de duracao/decisao |
| Manter legado/inativar futuro | `svc-corte` | N/A | N/A | 45 min | N/A | Tem 22 agendamentos e financeiro/comissao; nao remover. | P0 se alterar preco/nome direto sem recorte. | Backup, dry-run atualizado, testes de historico. | Manter por historico |
| Manter legado/inativar futuro | `svc-barba` | N/A | N/A | 35 min | N/A | Tem 42 agendamentos, financeiro/comissao e refunds; nao remover. | P0 se alterar preco/nome direto sem recorte. | Backup, dry-run atualizado, testes de historico. | Manter por historico |
| Manter fora do publico | `demo-svc-hidratacao` | N/A | N/A | 40 min | N/A | Tem 21 agendamentos e financeiro/comissao; origem demo. | P1 se reaproveitar como real sem decisao. | Confirmar se legado sera inativo. | Manter por historico |
| Manter fora do publico | `demo-svc-degrade` | N/A | N/A | 50 min | N/A | Tem 20 agendamentos e financeiro/comissao. | P2 por ambiguidade de corte. | Decisao do Geovane. | Depende de decisao |
| Manter fora do publico | `demo-svc-combo` | N/A | N/A | 75 min | N/A | Tem 23 agendamentos e financeiro/comissao. | P2 por nao estar no catalogo confirmado. | Decisao do Geovane. | Depende de decisao |
| Manter fora do publico | `demo-svc-sobrancelha` | N/A | N/A | 20 min | N/A | Tem 21 agendamentos e financeiro/comissao. | P2 por nao estar no catalogo confirmado atual. | Decisao do Geovane. | Depende de decisao |
| Inativar futuro | `Servico Teste Comissao TG` | N/A | N/A | 30 min | N/A | Tem 1 agendamento/financeiro/comissao; nao remover. | P1 se continuar ativo internamente. | Backup, autorizacao, teste de historico. | Pode executar apos backup/autorizacao |

## 12. O que pode ser feito agora

Pode ser feito agora, sem mutacao de banco:

- registrar catalogo confirmado;
- registrar divergencias de preco;
- registrar que duracoes seguem pendentes;
- manter booking publico temporariamente limitado;
- preparar roteiro de saneamento futuro;
- preparar pergunta curta ao Geovane;
- rodar validacoes de documentacao/Git.

Nao deve ser feito agora:

- alterar preco de `svc-corte`, `svc-barba` ou `demo-svc-hidratacao`;
- renomear registros historicos;
- criar servicos reais sem duracao;
- inativar servico sem backup/autorizacao;
- liberar Hidratacao/Luzes/Pigmentacao no booking sem duracao.

## 13. O que nao pode ser feito sem duracao

Nao pode ser feito sem duracao:

- publicar qualquer servico novo no booking online;
- criar slot automatico confiavel para Hidratacao, Luzes ou Pigmentacao;
- calcular disponibilidade real;
- validar agenda publica com duracao correta;
- substituir Corte/Barba atuais por canonicos definitivos;
- treinar recepcao para fluxo real completo.

Duracao e dado operacional, nao detalhe cosmetico. Sem ela, o sistema pode vender horario impossivel.

## 14. O que nao pode ser feito sem backup/autorizacao

Nao pode ser feito sem backup PostgreSQL recente, checksum, dry-run atualizado, lista exata de registros, contagem antes/depois e aprovacao explicita:

- criar servico real no banco;
- renomear servico real;
- alterar preco real;
- alterar duracao real;
- inativar servico;
- remover vinculo `ServiceProfessional`;
- alterar consumo de estoque por servico;
- alterar checkout, financeiro, comissao ou relatorios;
- alterar seed/migration para dados operacionais;
- executar limpeza de servicos demo/teste.

## 15. Riscos P0/P1/P2/P3

| Severidade | Risco | Mitigacao |
| --- | --- | --- |
| P0 | Alterar preco/nome de servico historico e distorcer relatorios antigos que leem `Service.price` atual. | Nao atualizar direto; criar canonicos novos; preservar legado. |
| P0 | Apagar servico com agendamento/financeiro/comissao. | Nunca remover servico com historico; usar inativacao/ocultacao futura. |
| P1 | Publicar servico sem duracao e gerar agenda impossivel. | Aguardar duracao confirmada antes de publicar. |
| P1 | Usar dados demo como verdade operacional. | Manter `demo-svc-*` fora do publico ate decisao formal. |
| P1 | Inativar servico e quebrar telas internas que esperam historico ativo. | Testar fluxo de historico antes de inativar. |
| P2 | Geovane confirmar servico, mas nao confirmar se e online ou WhatsApp. | Perguntar explicitamente publicacao online vs WhatsApp. |
| P2 | Produtos/estoque por servico ficarem inconsistentes. | Adiar consumo de produto ate confirmar estoque fisico. |
| P3 | Documento ficar defasado apos novas respostas. | Reexecutar dry-run antes de qualquer sprint mutacional. |

## 16. Perguntas objetivas restantes para Geovane

Mensagem curta sugerida:

```text
Geovane, para eu liberar o catalogo certinho no agendamento online, falta so confirmar o tempo medio de cada servico:

1. Corte dura quantos minutos?
2. Barba dura quantos minutos?
3. Hidratacao dura quantos minutos?
4. Luzes dura quantos minutos?
5. Pigmentacao dura quantos minutos?

E esses 5 podem aparecer para o cliente agendar online ou algum deve ficar so pelo WhatsApp?
```

## 17. Opiniao tecnica CTO

| Pergunta | Opiniao CTO |
| --- | --- |
| Esta etapa foi util ou burocratica? | Util. Agora existe resposta real do dono sobre catalogo e preco. |
| O que a resposta destravou? | Destravou os 5 servicos canonicos e os precos iniciais. |
| O que ainda impede execucao real? | Falta duracao, decisao de publicacao online, backup, data de corte e autorizacao de mutacao. |
| E seguro alterar os servicos agora? | Nao. Os registros atuais tem historico e parte dos relatorios le nome/preco atuais. |
| E seguro alterar precos agora? | Nao sem recorte/backup/autorizacao. |
| Atualizar antigos ou criar canonicos? | Criar canonicos novos e manter antigos como legado e mais seguro. |
| Booking publico deve mudar agora? | Nao. Deve continuar limitado ate duracao confirmada. |
| Sprint 227 continua bloqueada? | Sim. Catalogo/preco ajudaram, mas fluxo completo depende de saneamento e duracoes. |
| Proxima acao mais importante | Obter duracao/publicacao dos 5 servicos e entao preparar sprint mutacional controlada. |

## 18. Decisao final

Decisao final: Sprint 226.5 APROVADA COM RESSALVAS.

O catalogo real inicial foi confirmado pelo Geovane, mas somente nome/preco. A execucao segura nesta sprint foi documentar, comparar e definir estrategia. Nao ha autorizacao tecnica para alterar banco agora.

## 19. Proxima sprint recomendada

Recomendacao: Sprint 226.6 - Confirmar duracoes e preparar catalogo canonico controlado.

Escopo recomendado:

1. Registrar resposta do Geovane sobre duracao e publicacao online/WhatsApp.
2. Reexecutar dry-run readonly dos servicos imediatamente antes de qualquer mutacao.
3. Preparar backup PostgreSQL com checksum.
4. Definir IDs canonicos, nomes, precos e duracoes.
5. Preparar lista exata de servicos/vinculos afetados.
6. Pedir aprovacao explicita para criar canonicos/inativar legado.
7. So entao executar mutacao controlada, se todos os criterios forem cumpridos.

Sprint 227 permanece bloqueada ate catalogo, duracoes, saneamento minimo, financeiro/comissoes e fluxo operacional estarem seguros.

## 20. Validacoes executadas

| Comando/acao | Resultado |
| --- | --- |
| `pwd` | `/root/software-barbearia` |
| `git status -sb` | `## main...origin/main` no inicio |
| `git log --oneline -10` | HEAD `65b8850 docs: registrar smoke autenticado interno readonly` |
| Leitura de `.planning/223_REVISAO_SERVICOS_PUBLICOS_REAIS.md` | Concluida |
| Leitura de `.planning/225_VALIDACAO_PUBLICA_FINAL_MOBILE.md` | Concluida |
| Leitura de `.planning/226_2_DRY_RUN_SANEAMENTO_DADOS_INTERNOS.md` | Concluida |
| Leitura de `.planning/226_3_PLANO_TECNICO_SANEAMENTO_CONTROLADO.md` | Concluida |
| Leitura de `.planning/226_4_SMOKE_AUTENTICADO_INTERNO_READONLY.md` | Concluida |
| Inspecao de `prisma/schema.prisma` | Concluida |
| Inspecao de rotas de servicos/booking | Concluida |
| Consulta readonly de servicos | 7 servicos, todos com historico |
| `git diff --check` | Passou |
| `git diff --cached --check` | Passou sem staged changes no momento da verificacao |

Nao foi executado teste automatizado porque nao houve alteracao de codigo, teste, schema, seed ou rota.
