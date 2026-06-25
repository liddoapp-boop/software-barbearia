# Sprint 221 - Diagnostico dos dados reais, horarios e servicos

Data: 2026-06-25 UTC
Decisao final: APROVADO COM RESSALVAS

## 1. Objetivo

Auditar o estado atual dos dados operacionais da Barbearia Geovane Borges no banco local PostgreSQL e no codigo, separando dado confirmado, dado de seed/demo, sujeira de teste, conflito e pendencias de confirmacao.

Esta sprint e exclusivamente auditoria, documentacao e proposta tecnica. Nenhum dado real foi alterado.

## 2. Contexto da descoberta

A unidade usada pelo booking publico e `unit-01`, definida por `PUBLIC_BOOKING_UNIT_ID`.

Consulta readonly no PostgreSQL local via Prisma encontrou:

- `unit-01`: `Barbearia Premium - Unidade Centro`, timezone `America/Sao_Paulo`.
- Configuracao publica do negocio: `businessName=Barbearia`, `segment=barbearia`.
- 738 unidades no banco, sendo 735 com prefixo `unit-db-*`.
- `unit-02` existe, mas esta vazia.
- `unit-fb-1551296a2b9017fa311c` existe com horarios e pagamentos, mas sem servicos, produtos, profissionais, clientes ou agendamentos.
- `unit-01` tem 28 clientes, 150 agendamentos, 7 servicos, 9 produtos, 44 profissionais e 8 metodos de pagamento.

## 3. Decisao de CTO

Nao tratar os dados atuais do banco como verdade de negocio sem confirmacao do Geovane.

O banco contem uma mistura de dados operacionais, demo seed e sujeira de testes. A proxima fase deve confirmar horarios e catalogo real antes de qualquer configuracao de producao. A limpeza deve ser feita em fases controladas, com backup/log de evidencias, sem deletar registros por inferencia.

## 4. Dados encontrados no banco

### Unidade principal

- ID: `unit-01`
- Nome: `Barbearia Premium - Unidade Centro`
- Timezone: `America/Sao_Paulo`
- Nome de exibicao configurado: `Barbearia`
- Segmento: `barbearia`

### Configuracoes de agenda

- Duracao padrao: 45 min
- Antecedencia minima: 30 min
- Buffer entre agendamentos: 10 min
- Aceita encaixes: sim
- Permite fora do horario: nao
- Permite overbooking: nao
- Comissao da casa: `PERCENTAGE`, valor `40`

### Horarios em `unit-01`

- Domingo: fechado
- Segunda a sexta: `09:00` ate `19:00`
- Pausa segunda a sexta: `12:00` ate `13:00`
- Sabado: `09:00` ate `14:00`

### Servicos ativos em `unit-01`

- `svc-barba`: Barba Terapia, `R$ 55`, 35 min, categoria `BARBA`.
- `demo-svc-combo`: Combo Cabelo + Barba, `R$ 115`, 75 min, categoria `COMBO`.
- `svc-corte`: Corte Premium, `R$ 75`, 45 min, categoria `CORTE`.
- `demo-svc-degrade`: Degrade Navalhado, `R$ 85`, 50 min, categoria `CORTE`.
- `demo-svc-sobrancelha`: Design de Sobrancelha, `R$ 35`, 20 min, categoria `SOBRANCELHA`.
- `demo-svc-hidratacao`: Hidratacao Capilar, `R$ 65`, 40 min, categoria `TRATAMENTO`.
- `a1ea4294-e3a9-42b5-b5e5-3ca719f5b483`: Servico Teste Comissao TG, `R$ 100`, 30 min, categoria `TESTE_TG`.

### Produtos ativos em `unit-01`

- Condicionador Reparador, `R$ 45`, demo.
- Kit Cuidado Completo, `R$ 159`, demo.
- Lamina Profissional (pacote), `R$ 22`, demo.
- Perfume Tradicional 100ml, `R$ 89`, demo.
- Pomada Matte, `R$ 59`.
- Produto Teste Estoque TG, `R$ 20`, teste.
- Shampoo Anticaspa Premium, `R$ 49`, demo.
- Talco Pos-Barba, `R$ 29`, demo.
- Oleo para Barba, `R$ 39`.

### Profissionais em `unit-01`

- `pro-01`: Geovane Borges.
- `demo-pro-02`: Rafael Andrade.
- `demo-pro-03`: Lucas Ferreira.
- `demo-pro-04`: Matheus Souza.
- Varios `pro-db-*` com nome `Profissional DB`.
- Um `Profissional Teste Comissao TG`.

### Pagamentos

Ha duplicidade de nomes e defaults:

- `Pix` e `PIX`, ambos com default em registros diferentes.
- `Cartao de credito` e `Cartao de Credito`.
- `Cartao de debito` e `Cartao de Debito`.
- `Dinheiro` duplicado.

### Pacotes e assinaturas

- Pacote Barba 4 sessoes: `R$ 190`, validade 90 dias.
- Pacote Corte 4 sessoes: `R$ 260`, validade 90 dias.
- Assinatura Gold: `R$ 149/mes`, cobranca dia 5.
- Assinatura Black: `R$ 249/mes`, cobranca dia 5.

## 5. Dados confirmados pelo Geovane

Transcricoes recebidas:

- Audio 1: corte masculino e agendado de 30 em 30 minutos; em uma hora atende dois cortes; barba demora cerca de 45 minutos.
- Audio 2: no masculino faz corte de cabelo, barba, sobrancelha, luzes, progressiva e pigmentacao. No feminino faz apenas corte feminino. Tambem menciona coloracao, mas a frase tem ambiguidade.
- Audio 3: atendimento feminino fica preferencialmente em um dia especifico, como quarta-feira, por ser mais fraco. Faz atendimento feminino como corte, hidratacao ou coloracao; nao faz mais quimica no feminino.
- Audio 4: repeticao do audio 3, mantida como transcricao recebida.
- Audio 5: corte de cabelo pode demorar 15 minutos dependendo do corte; corte com barba demora 30 a 45 minutos.

## 6. Dados provavelmente reais

- Profissional publico real: `Geovane Borges`.
- Booking publico atual deve operar com profissional unico.
- Grade de slots em 30 minutos combina com a fala sobre corte masculino.
- Servicos reais provaveis: corte masculino, barba, sobrancelha, corte com barba, corte feminino, hidratacao feminina, coloracao feminina, luzes/progressiva/pigmentacao masculinas.

Esses itens ainda precisam ser transformados em catalogo operacional com nomes, duracoes, precos e visibilidade confirmados.

## 7. Dados nao confirmados

- Horario real de abertura/fechamento da barbearia.
- Existencia real da pausa `12:00-13:00`.
- Se sabado termina mesmo `14:00`.
- Precos reais dos servicos atuais.
- Precos reais dos produtos.
- Se pacotes e assinaturas existem na operacao real.
- Se pagamentos duplicados representam usos reais ou apenas registros antigos/demo.
- Se `Corte Premium`, `Barba Terapia` e nomes comerciais atuais devem ser mantidos.
- Se quimica masculina deve aparecer no booking publico ou apenas via contato/orcamento.
- Qual quarta-feira, regra e excecoes para atendimento feminino.

## 8. Dados provavelmente de teste

- Unidades `unit-db-*`: criadas por `tests/db.integration.spec.ts`, padrao evidente de teste.
- Profissionais `pro-db-*` / `Profissional DB`: registros de testes de integracao.
- Servico `Servico Teste Comissao TG`: contem `TESTE TG Fase 2.2` na descricao.
- Produto `Produto Teste Estoque TG`: categoria `TESTE TG`.
- IDs `demo-svc-*`, `demo-pro-*`, `demo-prd-*`: vieram do `prisma/demo-seed.ts`.
- Metodos de pagamento `demo-pm-*`: vieram do seed demo.
- `unit-02`: unidade vazia sem configuracao operacional.

Nada disso foi removido nesta sprint.

## 9. Conflitos entre banco e fala do Geovane

- Banco: `Corte Premium` esta em 45 min. Geovane: corte masculino e agendado de 30 em 30 minutos e pode levar 15 min dependendo do corte.
- Banco: `Barba Terapia` esta em 35 min. Geovane: barba demora cerca de 45 min.
- Banco: `Combo Cabelo + Barba` esta em 75 min. Geovane: corte com barba vai de 30 a 45 min; 45 min seria regra conservadora.
- Banco: `Design de Sobrancelha` 20 min; Geovane confirmou que faz sobrancelha, mas nao confirmou duracao/preco.
- Banco: `Hidratacao Capilar` 40 min; Geovane confirmou hidratacao feminina, mas nao confirmou duracao/preco nem se deve ser publica.
- Banco nao tem servicos de luzes, progressiva, pigmentacao, corte feminino ou coloracao feminina como catalogo claro.
- Banco tem multiplos profissionais ativos; Geovane confirmado publicamente e unico.

## 10. Como os slots sao gerados hoje

No booking publico:

- `GET /public/services` retorna todo `Service` ativo da unidade, sem flag especifica de visibilidade publica.
- `GET /public/services/:serviceId/professionals` busca vinculos `ServiceProfessional` com profissional ativo e filtra nomes/IDs de teste por codigo.
- `GET /public/slots`:
  - recebe `serviceId`, `weekStart`, `unitId` e `professionalId` opcional;
  - usa `durationMin` do servico;
  - le `BusinessHour` da unidade;
  - gera slots de 30 em 30 minutos;
  - considera agendamentos ativos (`SCHEDULED`, `CONFIRMED`, `IN_SERVICE`) como ocupados;
  - escolhe o primeiro profissional elegivel disponivel por ordem deterministica;
  - usa antecedencia fixa de 30 minutos no endpoint publico de slots.
- `POST /public/booking`:
  - valida o servico ativo;
  - calcula `endsAt` usando `durationMin`;
  - valida horario de funcionamento;
  - resolve profissional elegivel/disponivel;
  - cria cliente se telefone nao existir;
  - cria agendamento `SCHEDULED`;
  - registra auditoria `APPOINTMENT_CREATED`.

## 11. Quais regras o booking publico respeita hoje

Respeita:

- Unidade publica por `PUBLIC_BOOKING_UNIT_ID` ou `unitId` informado.
- Servico ativo.
- Profissional ativo vinculado ao servico.
- Filtro de profissionais publicos operacionais, excluindo `demo-pro-*` e `Profissional DB`.
- Conflito de agendamento por profissional.
- Dia fechado e horario de abertura/fechamento na criacao do booking.
- Antecedencia minima de 30 min nos slots publicos.

Ressalvas:

- `GET /public/slots` nao aplica `breakStart/breakEnd`; pode listar horario no intervalo. `POST /public/booking` valida expediente por `isWithinWorkingHours`, mas essa funcao tambem nao considera `breakStart/breakEnd`. A validacao completa de intervalo existe em `domain/rules.ts` para fluxos internos via engine, nao no helper publico.
- `GET /public/slots` usa antecedencia fixa de 30 min, nao o valor de `BusinessSettings.minimumAdvanceMinutes`.
- Nao existe antecedencia maxima.
- Nao existe regra por servico/dia da semana.
- Nao existe calendario de feriados.
- Nao existe horario por profissional.

## 12. Lacunas de funcionamento real

- Confirmar horario real da barbearia.
- Definir se ha pausa fixa, sem pausa, ou pausas variaveis.
- Definir se agenda publica deve abrir todos os dias uteis ou apenas dias especificos.
- Definir folgas, feriados e bloqueios manuais.
- Definir antecedencia maxima, por exemplo 15, 30 ou 60 dias.
- Definir regra de atendimento feminino em quarta-feira.
- Definir se slots publicos devem sempre ser de 30 min ou se a grade deve variar por servico.

## 13. Lacunas de catalogo de servicos

Catalogo real recomendado para confirmacao:

- Corte masculino: provavelmente publico, duracao candidata 30 min.
- Barba: publico, duracao candidata 45 min.
- Corte + barba: publico, duracao candidata 45 min por seguranca.
- Sobrancelha: confirmar preco/duracao e se publico.
- Corte feminino: confirmar se publico e restrito a quarta-feira.
- Hidratacao feminina: confirmar se publico e restrito a quarta-feira.
- Coloracao feminina: confirmar se publico, manual ou orcamento.
- Luzes masculina: provavelmente manual/orcamento.
- Progressiva masculina: provavelmente manual/orcamento.
- Pigmentacao masculina: provavelmente manual/orcamento.

O schema atual nao distingue servico publico, interno, manual ou orcamento.

## 14. Lacunas de profissionais

- O banco tem 44 profissionais em `unit-01`, mas o produto validado publicamente deve exibir apenas `Geovane Borges`.
- O backend publico filtra `demo-pro-*` e `Profissional DB`, mas isso e regra de codigo paliativa, nao saneamento de dados.
- Profissional fake ainda pode impactar telas internas, relatorios e cadastros.

## 15. Lacunas de pagamentos/produtos/pacotes

- Pagamentos duplicados podem causar escolha errada no checkout ou relatorio inconsistente.
- Produtos parecem majoritariamente demo, exceto talvez Pomada Matte e Oleo para Barba; precisam de inventario real.
- Pacotes e assinaturas existem no banco, mas nao ha confirmacao de uso real.
- Nao remover nada sem backup e validacao, porque produtos/pagamentos podem ter historico financeiro.

## 16. Riscos operacionais

- Cliente pode ver servico de teste em producao porque `/public/services` retorna todo servico ativo.
- Cliente pode ver duracoes/precos que nao batem com a operacao real.
- Slots podem aparecer durante pausa configurada.
- Horarios atuais podem nao refletir agenda real.
- Produtos e pagamentos demo podem poluir checkout/relatorios.
- Saneamento direto sem inventario pode quebrar historico financeiro ou auditoria.

## 17. Perguntas pendentes para Geovane

1. Qual horario real de atendimento em cada dia da semana?
2. Existe pausa fixa de almoco? Se sim, quais dias e horarios?
3. Sabado atende ate que horas?
4. Domingo e sempre fechado?
5. Com quantos dias de antecedencia o cliente pode agendar?
6. Corte masculino deve ter duracao publica de 30 min?
7. Barba deve ter duracao publica de 45 min?
8. Corte + barba deve ficar com 45 min?
9. Quais servicos devem aparecer para o cliente no booking publico?
10. Quais servicos devem ser apenas internos/manual/orcamento?
11. Feminino deve aparecer no booking publico? Se sim, somente quarta-feira?
12. Quais precos reais de corte, barba, sobrancelha, corte+barba, feminino e quimicas?
13. Quais produtos sao vendidos de verdade?
14. Quais formas de pagamento devem ficar ativas?
15. Pacotes e assinaturas existem ou devem ser desativados/escondidos?

## 18. Proposta de saneamento em fases

- Sprint 222: confirmar horarios reais com Geovane e configurar funcionamento real.
- Sprint 223: limpar catalogo publico de servicos, escondendo/desativando testes e ajustando duracoes/precos confirmados.
- Sprint 224: saneamento controlado de profissionais fake/demo, sem delete fisico antes de backup e analise de relacionamentos.
- Sprint 225: revisar pagamentos duplicados e definir um unico default.
- Sprint 226: decidir regra de feminino/quarta-feira e se precisa modelagem de servico por dia.
- Sprint 227: desenhar bloqueios manuais, folgas, feriados e antecedencia maxima.

## 19. O que pode ser feito sem migration

- Ajustar `BusinessHour` da unidade.
- Ajustar `BusinessSettings` existentes: antecedencia minima, buffer, overbooking, fora de horario.
- Desativar servicos ativos que sao teste/demo, se confirmado.
- Ajustar nome, preco, duracao, categoria e descricao de servicos existentes.
- Remover vinculos publicos via `ServiceProfessional` ou desativar profissionais, com cautela.
- Desativar produtos demo, se confirmado.
- Desativar metodos de pagamento duplicados, se confirmado.
- Documentar politica de atendimento feminino como regra operacional manual temporaria.

## 20. O que exigiria migration ou decisao maior

- Flag `Service.isPublic` ou status `PUBLIC/INTERNAL/BUDGET_ONLY`.
- Horario por profissional.
- Tabela de bloqueios manuais/folgas.
- Feriados por unidade.
- Regra de servico por dia da semana.
- Antecedencia maxima configuravel.
- Calendario especifico para feminino.
- Soft delete formal para unidades/profissionais/servicos/produtos, se a politica exigir preservacao historica melhor do que `active=false`.
- Normalizacao/constraint para impedir pagamentos duplicados por unidade.

## 21. O que nao foi feito por seguranca

- Nao foi executada migration.
- Nao foi executado seed.
- Nao houve alteracao em `.env`.
- Nao houve alteracao manual no banco.
- Nao houve criacao, cancelamento ou alteracao de cliente/agendamento real.
- Nao houve checkout, pagamento, venda, comissao, refund ou deploy.
- Nao houve PM2 restart, alteracao de Nginx, firewall ou certificado.
- Nao houve limpeza de unidades, profissionais, servicos, produtos ou pagamentos.
- Nao foi executado `npm run test:db`, porque pode tocar PostgreSQL real.

## 22. Decisao final

APROVADO COM RESSALVAS.

O sistema tem base suficiente para operar booking publico simples por unidade e profissional unico, mas os dados atuais nao devem ser tratados como verdade operacional. Antes de qualquer mudanca em producao, Geovane precisa confirmar horarios, catalogo, precos, duracoes, feminino/quarta-feira, produtos e pagamentos.

## Respostas objetivas as perguntas da sprint

1. `09:00-19:00`, pausa `12:00-13:00` e sabado `09:00-14:00` parecem dados gravados/alterados no banco, nao o default atual do codigo. Ainda nao sao confirmados como reais.
2. Sim. Ha `BusinessHour` por `unitId`.
3. Nao. Nao ha modelo de horario por profissional.
4. Parcialmente. Existe status `BLOCKED` em `AppointmentStatus`, mas nao ha fluxo/modelo dedicado de bloqueio manual por periodo.
5. Nao. Nao ha estrutura para limitar servico por dia da semana.
6. Nao. Nao ha tabela/modelo de feriados.
7. Nao. Existe antecedencia minima, nao maxima.
8. O buffer de 10 min pode gerar bloqueios adicionais e reduzir oferta; a grade publica e de 30 em 30 min. Para a fala do Geovane, corte de 30 min com buffer 10 bloquearia 40 min internamente se usado pela engine, o que conflita com "dois cortes por hora".
9. Parcialmente. Barba deveria estar mais perto de 45 min; corte esta longo para agenda publica de 30 min; combo esta longo contra a fala de 30-45 min.
10. Publicos provaveis: corte masculino, barba, corte+barba e talvez sobrancelha. Interno/manual/orcamento provaveis: luzes, progressiva, pigmentacao, coloracao/hidratacao feminina se exigirem avaliacao ou regra de quarta.
11. Publicamente, somente `Geovane Borges`.
12. `unit-db-*`, `Profissional DB`, `demo-*`, `Servico Teste Comissao TG`, `Produto Teste Estoque TG` e pagamentos duplicados/demo.
13. Exigiriam migration: visibilidade publica de servico, horario profissional, bloqueios manuais, feriados, regra por dia, antecedencia maxima e soft delete formal.
14. Sem migration: ajustar horarios, duracoes/precos, ativar/desativar servicos/produtos/pagamentos/profissionais e vinculos.
15. Precisam de confirmacao: horarios reais, pausa, sabado, antecedencia maxima, catalogo publico, precos, duracoes, regra feminina, quimicas, produtos, pagamentos, pacotes e assinaturas.

## Evidencias tecnicas

- `prisma/schema.prisma`: `Unit` tem `businessHours`; `BusinessSettings` tem duracao padrao, antecedencia minima, buffer, overbooking e fora de horario; `BusinessHour` e unico por `unitId/dayOfWeek`.
- `prisma/schema.prisma`: `Service`, `Professional` e `ServiceProfessional` nao possuem visibilidade publica, regra de dia da semana ou horario proprio.
- `src/http/app.ts`: `/public/services` retorna todo servico ativo.
- `src/http/app.ts`: `/public/slots` gera horarios de 30 em 30 minutos usando `durationMin`.
- `src/http/app.ts`: profissionais publicos sao filtrados por heuristica para excluir `demo-pro-*` e `Profissional DB`.
- `src/domain/rules.ts`: validacao interna respeita antecedencia minima, expediente e pausa, mas nao antecedencia maxima.
- `src/application/prisma-operations-service.ts`: defaults de horario quando nao existe configuracao sao `08:00-18:00` segunda a sexta, pausa `12:00-13:00`, sabado `08:00-14:00`.
- `prisma/demo-seed.ts`: demo seed cria servicos `demo-*` e horario `09:00-20:00` segunda a sexta, sabado `09:00-18:00`.

## Validacoes executadas

- `git status -sb`: passou; branch `main` limpa e alinhada com `origin/main` no inicio.
- `git log --oneline -10`: passou; commits esperados presentes no topo.
- Consulta readonly via Prisma ao PostgreSQL local: passou; dados resumidos neste documento.
- `npx vitest run tests/api.spec.ts -t "public/slots"`: passou; 1 teste executado, 80 skipped, backend em memoria.
- `npx vitest run tests/frontend-booking-public.spec.ts`: passou; 12 testes.

## Validacoes omitidas

- `npm run test:db`: omitido por seguranca, pois pode tocar banco Prisma/PostgreSQL real.
- Testes completos (`npm test`, build) nao eram necessarios para documentacao e foram omitidos para reduzir risco/tempo; os testes direcionados do booking passaram.
