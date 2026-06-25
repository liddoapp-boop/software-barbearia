# Sprint 223 - Revisao dos servicos publicos reais

Data: 2026-06-25 UTC
Decisao final: APROVADO COM RESSALVAS

## 1. Objetivo

Auditar o catalogo atual de servicos da `unit-01` e transformar os dados do banco, a blindagem da Sprint 222 e os audios do Geovane em uma proposta clara de catalogo publico real.

Esta sprint e exclusivamente auditoria, documentacao e proposta de produto. Nenhum servico foi criado, alterado, ativado, inativado ou removido.

## 2. Contexto vindo das Sprints 221 e 222

A Sprint 221 mostrou que o banco local contem uma mistura de dados operacionais, seed/demo e sujeira de teste. O catalogo de servicos de `unit-01` tem 7 servicos ativos, mas varios possuem ID `demo-*` ou marcadores de teste.

A Sprint 222 blindou o booking publico contra exposicao obvia de dados de teste/demo. A regra atual esconde servicos com marcadores `teste`, `tg`, `demo`, `db` e servicos inativos. Essa blindagem e segura como contencao, mas ainda e heuristica textual.

O schema atual de `Service` possui `active`, `name`, `description`, `category`, `notes`, `price` e `durationMin`, mas nao possui campo formal de publicacao como `isPublic`, `publicVisible` ou `publicationStatus`.

## 3. Decisao de CTO

Nao transformar o catalogo atual em verdade operacional sem confirmacao do Geovane.

Para piloto publico, a decisao tecnica recomendada e trabalhar com catalogo pequeno, claro e conservador:

- manter publicos apenas servicos simples e confirmados;
- deixar servicos longos, quimicos, femininos ou ambiguos como manual/orcamento ate existir regra operacional;
- nao alterar preco, duracao ou nome nesta sprint;
- nao limpar dados demo/teste por inferencia;
- planejar uma solucao formal de visibilidade publica em fase futura.

## 4. Catalogo atual no banco

Consulta readonly via Prisma em `unit-01` encontrou 7 servicos:

| ID | Nome | Categoria | Preco | Duracao | Ativo | Viculo com Geovane | Filtro Sprint 222 |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| `svc-barba` | Barba Terapia | BARBA | R$ 55,00 | 35 min | Sim | Sim | Visivel |
| `svc-corte` | Corte Premium | CORTE | R$ 75,00 | 45 min | Sim | Sim | Visivel |
| `demo-svc-combo` | Combo Cabelo + Barba | COMBO | R$ 115,00 | 75 min | Sim | Sim | Oculto por `demo` |
| `demo-svc-degrade` | Degrade Navalhado | CORTE | R$ 85,00 | 50 min | Sim | Sim | Oculto por `demo` |
| `demo-svc-sobrancelha` | Design de Sobrancelha | SOBRANCELHA | R$ 35,00 | 20 min | Sim | Sim | Oculto por `demo` |
| `demo-svc-hidratacao` | Hidratacao Capilar | TRATAMENTO | R$ 65,00 | 40 min | Sim | Sim | Oculto por `demo` |
| `a1ea4294-e3a9-42b5-b5e5-3ca719f5b483` | Servico Teste Comissao TG | TESTE_TG | R$ 100,00 | 30 min | Sim | Nao | Oculto por `teste`/`tg` |

Todos os servicos listados estao ativos no banco. A visibilidade publica atual nao vem de um campo do banco; vem da heuristica implementada na Sprint 222.

## 5. Catalogo visivel no publico hoje

Pelo filtro publico atual, aparecem hoje:

- `Barba Terapia`, R$ 55,00, 35 min.
- `Corte Premium`, R$ 75,00, 45 min.

Ficam ocultos hoje:

- `Combo Cabelo + Barba`, por ID `demo-svc-combo`.
- `Degrade Navalhado`, por ID `demo-svc-degrade`.
- `Design de Sobrancelha`, por ID `demo-svc-sobrancelha`.
- `Hidratacao Capilar`, por ID `demo-svc-hidratacao`.
- `Servico Teste Comissao TG`, por nome/categoria de teste.

Observacao: os servicos demo ocultos podem representar servicos reais provaveis, mas a origem `demo-*` impede tratá-los como catalogo publico confiavel sem revisao humana.

## 6. Dados confirmados pelos audios do Geovane

Audios recebidos indicam:

- Corte masculino: agenda de 30 em 30 minutos; em uma hora atende dois cortes; alguns cortes podem durar 15 minutos.
- Barba: demora cerca de 45 minutos.
- Corte com barba: pode variar de 30 a 45 minutos.
- Masculino: faz corte de cabelo, barba, sobrancelha, luzes, progressiva e pigmentacao.
- Feminino: faz corte feminino; tambem menciona corte, hidratacao e coloracao em um dia mais fraco, como quarta-feira.
- Feminino/quimica: ha ambiguidade; ele diz que nao faz mais quimica no feminino, mas menciona coloracao.

## 7. Servicos classificados por categoria

### Publico direto

| Servico proposto | Base | Ressalva |
| --- | --- | --- |
| Corte masculino | Confirmado nos audios; servico essencial | Duracao/preco atuais precisam confirmacao, pois banco tem `Corte Premium` 45 min e Geovane fala em agenda de 30 min |
| Barba | Confirmado nos audios; servico essencial | Banco tem 35 min, audio indica cerca de 45 min |

### Publico com ressalva

| Servico proposto | Base | Ressalva |
| --- | --- | --- |
| Corte + barba | Confirmado indiretamente; Geovane falou em 30 a 45 min | Banco tem `Combo Cabelo + Barba` demo com 75 min, claramente longo contra a fala |
| Sobrancelha | Geovane confirmou que faz sobrancelha masculino | Banco tem item demo com preco/duracao, precisa confirmar se deve ser publico |

### Manual/orcamento

| Servico | Motivo |
| --- | --- |
| Luzes masculina | Quimica costuma exigir avaliacao, tempo variavel e preco sob consulta |
| Progressiva masculina | Quimica com duracao/preco variaveis; risco de agenda publica errada |
| Pigmentacao masculina | Pode exigir avaliacao e escolha de produto/tempo |
| Coloracao feminina | Audio tem ambiguidade e regra por dia; melhor manual ate confirmacao |
| Hidratacao feminina | Pode ser real, mas o banco tem origem demo e regra de dia ainda nao existe |

### Interno

| Servico | Motivo |
| --- | --- |
| Atendimento feminino em dia especifico | Enquanto nao houver regra por dia da semana no sistema, pode ser operacionalmente interno/manual |
| Servicos longos ou variaveis | Sem duracao/preco confirmados, podem quebrar a disponibilidade real |

### Teste/demo

| Servico | Motivo |
| --- | --- |
| Servico Teste Comissao TG | Nome/categoria indicam teste; sem vinculo com Geovane; deve continuar oculto |
| IDs `demo-svc-*` | Origem demo seed; podem representar servicos reais, mas nao devem ser tratados como confiaveis sem revisao |

### Precisa confirmacao

- Nome publico desejado para corte masculino.
- Se `Corte Premium` e nome real ou nome de seed/demo.
- Se `Barba Terapia` e nome real ou nome comercial temporario.
- Preco real de corte masculino.
- Preco real de barba.
- Preco real de corte + barba.
- Preco real de sobrancelha.
- Duracao publica de corte masculino.
- Duracao publica de barba.
- Duracao publica de corte + barba.
- Se sobrancelha entra no booking publico.
- Se feminino aparece no booking publico ou fica manual.
- Se quimicas entram no publico ou apenas orcamento.

## 8. Conflitos encontrados

- Corte: banco esta em 45 min, mas Geovane descreve grade de 30 minutos e ate cortes de 15 minutos.
- Barba: banco esta em 35 min, mas Geovane fala em cerca de 45 minutos.
- Corte + barba: banco tem 75 min em item demo; Geovane fala de 30 a 45 minutos.
- Sobrancelha: banco tem 20 min e R$ 35,00 em item demo; Geovane confirmou o servico, mas nao preco/duracao/publicacao.
- Hidratacao: banco tem 40 min e R$ 65,00 em item demo; audio sugere atendimento feminino, mas com regra de dia e sem confirmacao publica.
- Feminino: o sistema nao possui regra por dia da semana por servico, mas Geovane quer concentrar feminino em dia especifico, como quarta-feira.
- Quimicas masculinas: existem na fala, mas nao existem como catalogo claro no banco.
- O catalogo visivel hoje tem apenas corte e barba; isso e seguro, mas incompleto para o que Geovane disse fazer.

## 9. Perguntas pendentes para Geovane

1. Quais nomes voce quer que aparecam para o cliente no app?
2. Corte masculino deve aparecer como `Corte masculino`, `Corte Premium` ou outro nome?
3. Qual preco real do corte masculino?
4. Corte masculino deve bloquear 30 minutos na agenda publica?
5. Qual preco real da barba?
6. Barba deve bloquear 45 minutos na agenda publica?
7. Qual preco real de corte + barba?
8. Corte + barba deve bloquear 45 minutos?
9. Sobrancelha deve aparecer no agendamento publico?
10. Qual preco e duracao da sobrancelha?
11. Feminino deve aparecer para cliente agendar sozinho ou deve ser manual pelo barbeiro?
12. Se feminino aparecer, deve ser apenas quarta-feira?
13. Hidratação e coloracao feminina devem aparecer no app ou ficar por contato/orcamento?
14. Luzes, progressiva e pigmentacao masculina devem aparecer no app ou ficar por orcamento?
15. Existe algum servico atual do banco que voce nao usa mais?

## 10. Proposta de catalogo publico inicial

Proposta conservadora para piloto:

| Nome publico proposto | Duracao candidata | Publicacao | Motivo |
| --- | ---: | --- | --- |
| Corte masculino | 30 min | Publico direto | Servico principal; bate com grade de meia hora |
| Barba | 45 min | Publico direto | Confirmado; duracao candidata vem do audio |
| Corte + barba | 45 min | Publico com ressalva | Confirmado por fala, mas precisa preco e nome |
| Sobrancelha | 20 ou 30 min | Publico com ressalva | Confirmado, mas faltam preco/duracao/publicacao |

Nao publicar no primeiro momento:

| Servico | Tratamento recomendado |
| --- | --- |
| Luzes masculina | Manual/orcamento |
| Progressiva masculina | Manual/orcamento |
| Pigmentacao masculina | Manual/orcamento |
| Corte feminino | Manual ate existir regra por dia ou decisao clara |
| Hidratacao feminina | Manual/orcamento |
| Coloracao feminina | Manual/orcamento |
| Servico Teste Comissao TG | Oculto/teste |

Como CTO, eu nao publicaria quimicas nem feminino no booking automatico ate o sistema suportar regra por dia/agenda ou ate Geovane aceitar operar isso manualmente.

## 11. O que pode ser feito sem migration

Se Geovane confirmar os dados, pode ser feito sem migration:

- ajustar nomes, precos e duracoes dos servicos existentes;
- manter ocultos os IDs `demo-*` ate decidir se serao reaproveitados ou substituidos;
- desativar servicos evidentemente de teste, com backup/roteiro e autorizacao;
- remover vinculos publicos indevidos via `ServiceProfessional`, com cautela;
- documentar regra operacional manual para feminino/quimicas;
- manter catalogo publico pequeno enquanto a modelagem formal nao existe.

Nada disso foi executado nesta sprint.

## 12. O que exigiria migration ou decisao maior

- Campo `Service.publicVisible`, `Service.isPublic` ou `publicationStatus`.
- Separar ativo interno de publicado no booking publico.
- Regra de servico por dia da semana.
- Agenda/horario especifico por profissional.
- Bloqueios manuais, folgas e feriados formais.
- Antecedencia maxima configuravel.
- Fluxo de orcamento para quimicas.
- Politica de saneamento dos registros `demo-*` com backup e rastreabilidade.

## 13. Opiniao tecnica do Codex/CTO

O catalogo atual nao esta bom como catalogo real de piloto, mas esta aceitavel como catalogo publico minimo apos a Sprint 222 porque so deixa passar corte e barba. Ele e seguro, porem pobre e ainda desalinhado com as duracoes faladas pelo Geovane.

Eu deixaria publicos agora apenas corte masculino e barba. Eu so liberaria corte + barba e sobrancelha depois de confirmar preco, duracao e nome. Eu manteria quimicas e feminino como manual/orcamento.

Seria perigoso liberar hidratacao/coloracao feminina ou quimicas masculinas automaticamente agora, porque o sistema nao tem regra por dia da semana, nao tem orcamento, nao tem duracao confirmada e pode criar slots que o barbeiro nao quer atender.

Vale criar `isPublic` ou, melhor, `publicationStatus` futuramente. Tambem vale permitir servico por dia da semana futuramente, especialmente se feminino for requisito real. Ainda assim, a melhor estrategia de produto e comecar com catalogo pequeno e ampliar depois de medir uso e confirmar a operacao.

Minha recomendacao e nao gastar arquitetura agora para todos os casos. Primeiro confirmar catalogo e operar piloto com poucos servicos. Depois modelar publicacao, dias especiais e orcamento quando houver decisao real.

## 14. O que nao foi feito por seguranca

- Nao houve migration.
- Nao houve seed.
- Nao houve alteracao em `.env`.
- Nao houve alteracao manual no banco.
- Nao houve alteracao de nome, preco ou duracao de servico.
- Nao houve ativacao ou inativacao de servico.
- Nao houve limpeza de servicos demo/teste.
- Nao houve criacao de cliente ou agendamento real.
- Nao houve checkout, venda, pagamento, comissao ou estorno.
- Nao houve deploy.
- Nao houve PM2 restart.
- Nao houve alteracao de Nginx, firewall ou certificado.
- Nao foi executado `npm run test:db`, porque pode tocar PostgreSQL real se `DATABASE_URL` apontar para ambiente operacional.

## 15. Validacoes executadas

- `git status -sb`: passou; branch `main` limpa e alinhada com `origin/main` no inicio.
- `git log --oneline -10`: passou; commits esperados presentes no topo.
- Leitura de `.planning/221_DIAGNOSTICO_DADOS_REAIS_HORARIOS_SERVICOS.md`: concluida.
- Leitura de `.planning/222_BLINDAGEM_CATALOGO_PUBLICO_DADOS_TESTE.md`: concluida.
- Inspecao de `prisma/schema.prisma`: confirmou ausencia de campo formal de visibilidade publica em `Service`.
- Inspecao de `src/http/app.ts`: confirmou filtro publico por marcadores e aplicacao em `/public/services`.
- Consulta readonly via Prisma ao banco local: passou; encontrou 7 servicos em `unit-01`.
- `npx vitest run tests/api.spec.ts -t "public/services"`: passou; 1 teste executado, 81 skipped.

## 16. Proxima fase recomendada

Proxima fase recomendada: Sprint 224 - Ajustar textos finais do agendamento publico.

Antes de qualquer ajuste real no banco, recomenda-se obter respostas do Geovane para preco, duracao, nomes publicos e decisao sobre feminino/quimicas. Se a proxima fase decidir alterar dados reais, ela deve ter autorizacao explicita, backup/roteiro e escopo separado.

## 17. Decisao final

APROVADO COM RESSALVAS.

A Sprint 223 produziu uma classificacao tecnica e de produto para o catalogo publico real. O catalogo publico atual esta protegido contra teste/demo e seguro para exposicao minima, mas ainda precisa de confirmacao humana antes de virar catalogo operacional definitivo.
