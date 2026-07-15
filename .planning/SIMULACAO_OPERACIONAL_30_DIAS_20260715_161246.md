# DADOS DE SIMULAÇÃO OPERACIONAL CONTROLADA

## 1. Objetivo e decisão executiva

Este documento registra uma simulação determinística de 30 dias do Software Barbearia na release `v1.0.0-rc.5`, commit `0e3196ea21754aea6387aed0e1f2aabe3678747a`, branch `main`.

**Resultado: SIMULAÇÃO OPERACIONAL DE 30 DIAS APROVADA — SEM P0/P1 CONHECIDOS.**

“Os resultados apresentados decorrem de uma simulação operacional controlada, realizada com dados fictícios. Portanto, não representam faturamento, desempenho ou comportamento real da Barbearia Geovane Borges.”

Os resultados decorrem de uma simulação operacional controlada com dados fictícios e não representam faturamento, desempenho ou comportamento real da Barbearia Geovane Borges.

## 2. Metodologia e natureza fictícia

Foi usado exclusivamente PostgreSQL local em banco descartável protegido por marcador, duas unidades fictícias, usuários fictícios, 126 clientes fictícios, quatro serviços fictícios equivalentes e seis produtos fictícios. Fixtures estruturais foram inseridas por Prisma; agenda, status, checkout, venda, refund, comissão, estoque, auditoria e IA textual passaram pelas rotas ou handlers oficiais da aplicação.

O relógio da aplicação foi controlado pelo harness temporário. A data inicial foi calculada como a primeira segunda-feira situada pelo menos sete dias à frente da data da execução. A seed foi `2026071530`. Nenhum provedor externo de IA, áudio, WhatsApp ou mensageria foi chamado; o envio de resposta usou adapter falso local.

## 3. Período e configuração da rotina

- período simulado: 27/07/2026 a 25/08/2026, 30 dias corridos;
- 26 dias abertos e 4 domingos fechados;
- horário: 09:00–18:00, intervalo 12:00–13:00;
- timezone: `America/Sao_Paulo`;
- capacidade: 480 minutos por dia aberto, 12.480 minutos totais;
- um profissional principal; domingo com capacidade, agenda e faturamento iguais a zero;
- ocupação-alvo variável por perfil de dia, sempre limitada à capacidade.

## 4. Isolamento, migrations e módulos usados

O banco usado foi `barbearia_operational_30d_simulation_test_20260715_170500`. O nome passou pelas guardas de marcador, exclusão de `barbearia_pilot`, exclusão de nomes de produção, host local, ambiente não produtivo e `ALLOW_OPERATIONAL_SIMULATION=true`. Foram aplicadas as 21 migrations oficiais, sem migration nova e sem alteração de schema.

Módulos exercitados: autenticação, RBAC, tenant, catálogo, clientes, agenda, máquina de estados, checkout, pagamentos, vendas, estoque, financeiro, refunds, comissões, auditoria, relatórios de abertura, sugestões de agenda e IA textual simulada do WhatsApp.

## 5. Volume operacional

| Indicador fictício | Resultado |
|---|---:|
| Agendamentos no período | 279 |
| Primeiras visitas / recorrentes | 97 / 182 |
| Atendimentos concluídos | 238 |
| Cancelamentos | 28 |
| No-shows | 13 |
| Remarcações | 14 |
| Checkouts / pagamentos | 238 / 238 |
| Vendas de produto | 48, sendo 14 avulsas |
| Refunds | 5 |
| Comissões geradas | 286 |
| Eventos de auditoria | 2.486 |
| Registros de idempotência | 1.198 |
| Requisições medidas | 2.401 |

O mix de clientes foi 34,77% de primeiras visitas e 65,23% de visitas recorrentes. A IA textual iniciou 56 agendamentos, equivalentes a 20,07% do total.

## 6. KPIs de agenda

| KPI fictício | Resultado |
|---|---:|
| Capacidade | 12.480 min |
| Ocupação computada | 8.170 min |
| Taxa de ocupação | 65,46% |
| Taxa de cancelamento | 10,04% |
| Taxa de no-show sobre não cancelados | 5,18% |
| Conflitos explícitos bloqueados | 1 + corrida concorrente |
| Fora do expediente bloqueado | 1 |
| Slots ativos sobrepostos | 0 |

Cancelamentos liberaram o slot; 14 remarcações preservaram histórico e moveram o compromisso para slot liberado. No-show foi registrado no status oficial somente após a tolerância. Conclusão ocorreu somente por checkout; a rota legada permaneceu fora do fluxo.

## 7. KPIs financeiros

| KPI fictício | Resultado |
|---|---:|
| Faturamento bruto de serviços | R$ 12.695,00 |
| Produtos em checkout | R$ 1.162,00 |
| Vendas avulsas de produto | R$ 601,00 |
| Faturamento bruto de produtos | R$ 1.763,00 |
| Faturamento bruto total | R$ 14.458,00 |
| Refunds | R$ 245,00 |
| Despesas de comissão | R$ 4.566,75 |
| Resultado líquido simulado | R$ 9.646,25 |
| Ticket médio de serviço | R$ 53,34 |
| Ticket médio geral, 238 checkouts + 14 vendas avulsas | R$ 57,37 |

Distribuição financeira por forma de pagamento: Pix, 128 lançamentos e R$ 7.408,00; dinheiro, 71 lançamentos e R$ 3.884,00; crédito, 53 lançamentos e R$ 3.166,00. Não houve receita órfã, lançamento duplicado nem diferença de centavos. O contrato atual grava o total combinado do checkout como receita de checkout; a separação acadêmica entre serviço e produto foi reconstruída pelos campos `serviceAmount` e `productAmount` do próprio checkout.

## 8. Serviços

| Serviço fictício | Concluídos | Participação | Receita própria |
|---|---:|---:|---:|
| Corte | 119 | 50,00% | R$ 5.950,00 |
| Barba | 43 | 18,07% | R$ 1.505,00 |
| Corte e Barba | 62 | 26,05% | R$ 4.960,00 |
| Serviço adicional | 14 | 5,88% | R$ 280,00 |

O serviço mais utilizado foi Corte; Corte também gerou a maior receita própria.

## 9. Produtos e estoque

| Produto fictício | Unidades brutas/líquidas | Receita bruta | Inicial | Final |
|---|---:|---:|---:|---:|
| Bucha | 1 / 1 | R$ 8,00 | 1 | 0 |
| Condicionador | 3 / 3 | R$ 120,00 | 14 | 11 |
| Gel | 21 / 20 | R$ 588,00 | 44 | 24 |
| Máscara | 3 / 2 | R$ 135,00 | 9 | 7 |
| Pomada | 19 / 18 | R$ 798,00 | 36 | 18 |
| Shampoo | 3 / 3 | R$ 114,00 | 20 | 17 |

O estoque total passou de 124 para 77 unidades, com 57 movimentos. Houve uma tentativa explícita de ruptura e uma corrida sobre a única Bucha disponível; somente uma venda venceu. Bucha terminou em estoque baixo/zero. Todos os seis saldos reconciliaram com as entradas, saídas e devoluções; estoque negativo e movimento órfão foram zero.

## 10. Comissões

Foram geradas 286 comissões no valor de R$ 4.619,55. Os ciclos simulados aos sábados e no fechamento final pagaram 282, totalizando R$ 4.566,75; quatro foram canceladas por refund e o saldo pendente terminou em R$ 0,00. Cinco replays de pagamento foram absorvidos sem nova despesa. Origem, profissional, regra, valor, status, `paidAt` e despesa financeira foram conciliados.

## 11. IA simulada por texto

Estas métricas descrevem handlers internos e transporte falso; não medem áudio nem WhatsApp real.

| KPI fictício | Resultado |
|---|---:|
| Mensagens/comandos processados | 127 |
| Comandos válidos | 56 |
| Prévias | 59 |
| Correções | 1 |
| Confirmações | 56 |
| Cancelamentos de prévia | 1 |
| Mensagens casuais | 3 |
| Ambiguidades | 1 |
| Duplicidades bloqueadas | 4 |
| Replays bloqueados | 1 |
| Mutações sem confirmação | 0 |
| Chamadas a provedor externo | 0 |

`sim`, `ok` e `beleza` não executaram; `CANCELAR` não executou; “corrige ... e confirma” gerou correção sem confirmação na mesma mensagem; payload de unidade não foi confiado; usuário sem papel owner foi recusado; confirmação concorrente teve um único efeito.

## 12. RBAC, tenant e segurança

Foram bloqueadas com estado comercial inalterado 31 tentativas negativas, das quais 16 relacionadas a token/RBAC e 4 explicitamente cross-tenant. Foram cobertos token ausente, token adulterado, papel desconhecido, recepção/profissional em rota financeira, profissional no checkout, usuário da unidade secundária, cliente/produto de outra unidade e unidade injetada no payload. Não houve leitura ou escrita cross-tenant observada.

## 13. Concorrência e idempotência

| Corrida controlada | Efeito persistido | Resultado |
|---|---:|---|
| Dois agendamentos no mesmo slot | 1 | seguro, HTTP 200/409 |
| Dois checkouts | 1 | seguro, respostas idempotentes |
| Duas vendas sobre estoque 1 | 1 | seguro, saldo 1→0 |
| Duas confirmações da mesma prévia | 1 | seguro |
| Dois pagamentos da mesma comissão | 1 despesa | seguro |
| Dois refunds da mesma origem | 1 | seguro |

Também foram exercitados dez replays de checkout, quatro de venda e cinco de comissão. Duplicidades comerciais, estoque negativo e mutações parciais terminaram em zero. Logs Prisma de unique constraint e um conflito serializável apareceram durante corridas intencionais; as respostas e o estado final demonstraram tratamento seguro.

## 14. Auditoria

Os 2.486 eventos tinham ator, perfil, unidade, rota, método, request id e estado posterior. Houve eventos de criação, alteração, cancelamento, checkout, venda, estoque, financeiro, comissão, refund, IA e bloqueios relevantes. A cardinalidade comercial conciliou com auditoria e idempotência.

## 15. Resultados semanais

| Semana | Período | Agendamentos | Concluídos | Bruto | Refunds | Comissões pagas | Líquido |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 27/07–02/08 | 65 | 54 | R$ 3.246,00 | R$ 137,00 | R$ 1.003,85 | R$ 2.105,15 |
| 2 | 03/08–09/08 | 64 | 56 | R$ 3.600,00 | R$ 80,00 | R$ 1.114,50 | R$ 2.405,50 |
| 3 | 10/08–16/08 | 68 | 58 | R$ 3.473,00 | R$ 0,00 | R$ 1.117,30 | R$ 2.355,70 |
| 4 | 17/08–23/08 | 62 | 52 | R$ 3.204,00 | R$ 28,00 | R$ 1.031,35 | R$ 2.144,65 |
| 5 | 24/08–25/08 | 20 | 18 | R$ 935,00 | R$ 0,00 | R$ 299,75 | R$ 635,25 |

## 16. Resultados diários

O resumo diário completo, sem PII, está no CSV associado. Os quatro domingos — 02, 09, 16 e 23 de agosto — registram explicitamente fechado, capacidade zero, zero agendamentos e zero faturamento. As despesas semanais de comissão são reconhecidas no sábado, o que explica resultado diário negativo nesses dias sem representar prejuízo operacional real.

## 17. Reconciliação final e qualidade dos dados

- financeiro: receitas de serviço + produto − refunds − comissões = R$ 9.646,25;
- estoque: seis de seis produtos conciliados;
- comissões: origem e pagamento conciliados, pendência zero;
- órfãos financeiros: 0; órfãos de estoque: 0;
- lançamentos financeiros duplicados: 0;
- slots ativos sobrepostos: 0;
- estoque negativo: 0;
- mutações parciais: 0;
- registros cross-tenant: 0.

## 18. Desempenho moderado

O runner concluiu em 115,47 s e mediu 2.401 requisições: 2.368 aprovadas e 33 rejeitadas intencionalmente, sem erro inesperado. Latência global: p50 26,78 ms, p95 101,44 ms e máximo 271,13 ms. Rotas principais: checkout p50/p95 28,45/53,50 ms; status 13,15/21,46 ms; venda 16,35/35,84 ms; webhook simulado 60,42/98,98 ms.

A memória RSS passou de 120,50 MiB para 223,11 MiB; havia 11 conexões PostgreSQL do pool/processos de medição no instante da amostra. Não houve retry do harness. Essa amostra moderada não demonstra ausência de vazamento. O tamanho dos mapas internos de contexto não possui métrica pública; 124 claims do webhook foram persistidos e o app foi encerrado ao final. Essa observabilidade incompleta é classificada P2.

## 19. Problemas encontrados e classificação

- P0: nenhum.
- P1: nenhum.
- P2-01: o arquivo focado do webhook teve 3 falhas de contrato em 97 testes: a resposta de três caminhos de prévia segura omite `mode: "preview_only"`, embora retorne `ok`, `intent`, `executed:false`, preserve a prévia e não faça mutação. A falha foi reproduzida isoladamente e não foi corrigida silenciosamente.
- P2-02: limitação de observabilidade — tamanho interno das estruturas de contexto não exposto; não foi inferida ausência de vazamento.
- P3: o harness temporário precisou (a) criar o profissional inelegível após as prévias em massa, (b) renovar JWTs conforme o relógio avançava, (c) usar o relógio controlado nos timestamps comerciais e (d) executar ciclos semanais no sábado, pois domingo é fechado. Nenhum ajuste tocou `src/`, `public/`, schema ou migration.

## 20. Testes de controle

- estado, serviços, hardening, conflitos, operações owner e parser determinístico: 6 arquivos, 73/73 testes aprovados;
- integração Prisma/PostgreSQL: 1 arquivo, 42/42 testes aprovados no banco descartável, incluindo refund, agendamento e remarcação concorrentes;
- webhook de IA simulado: 94/97 aprovados e 3 falhas P2 pelo mesmo campo ausente `mode: "preview_only"`; a reprodução filtrada falhou pelo mesmo motivo;
- `npm run build`: aprovado;
- CSV: 30 linhas de dados, 17 colunas, zero linha inválida e zero conteúdo proibido detectado;
- `git diff --check`: aprovado.

No total focado, 209 testes foram aprovados e 3 falharam pelo único achado de contrato P2. Nenhum teste apontou duplicidade comercial, mutação sem confirmação, quebra de tenant, estoque negativo ou divergência financeira.

## 21. Limitações metodológicas

A execução ocorreu em processo único local, com um profissional, uma grade operacional e dados sintéticos. O transporte WhatsApp, o áudio e os provedores semânticos externos foram deliberadamente substituídos; portanto, latência de rede, qualidade de transcrição, disponibilidade de terceiros e comportamento humano não foram medidos. Datas operacionais foram controladas na aplicação, enquanto timestamps automáticos do PostgreSQL representam o momento técnico da execução. Os indicadores não constituem previsão de demanda, impacto real, satisfação do usuário ou resultado econômico da Barbearia Geovane Borges.

## 22. Aplicabilidade ao TCC — subseção acadêmica

Adotou-se um desenho de simulação determinística de eventos discretos, com horizonte de trinta dias corridos, seed fixa, calendário operacional explícito e isolamento em banco descartável. Os critérios de controle abrangeram capacidade temporal, transições de estado, reconciliação contábil, conservação de estoque, autorização, isolamento por unidade, idempotência, concorrência e rastreabilidade.

Foram empregados exclusivamente dados fictícios, de modo a evitar associação entre os resultados e pessoas ou operações reais. O uso de seed, relógio controlado, rotas oficiais e reconciliações independentes favorece repetibilidade e auditabilidade. Como limitações metodológicas, destacam-se a ausência de usuários reais, de carga distribuída, de infraestrutura de produção e de provedores externos.

A contribuição da simulação para a validação técnica consiste em demonstrar, no recorte ensaiado, a integração coerente entre módulos e a reação segura a cenários negativos e concorrentes. Não se infere impacto real, adoção, satisfação, produtividade ou retorno financeiro.

## 23. Limpeza

Limpeza concluída após relatórios, reconciliações e testes: o app do runner estava encerrado; o harness, JSON intermediário, stdout/stderr temporários e demais arquivos efêmeros foram removidos; o banco `barbearia_operational_30d_simulation_test_20260715_170500` foi destruído pela guarda exata. A verificação final encontrou zero bancos e zero conexões com `_operational_30d_simulation_test_`. O runtime normal permaneceu escutando a porta 3333 e `/health` retornou `ok=true`. O relatório da Etapa 1 e os dois novos artefatos foram preservados.

## 24. Baseline piloto

Baseline inicial consultada em transação PostgreSQL `READ ONLY`: clientes 0, agendamentos 0, vendas 0, financeiro 0, checkouts 0, produtos 6, movimentos 6, estoque total 73; Bucha 3, Condicionador 10, Gel 30, Máscara 10, Pomada 10 e Shampoo 10. Fingerprint inicial: `26263d16778d68dd88180d29794a0ad50c0bd79eb0468a76ed9d10001b77bccc`.

Baseline final consultada novamente em transação PostgreSQL `READ ONLY`: clientes 0, agendamentos 0, vendas 0, financeiro 0, checkouts 0, produtos 6, movimentos 6 e estoque total 73. Saldos: Bucha 3, Condicionador 10, Gel 30, Máscara 10, Pomada 10 e Shampoo 10. O fingerprint final permaneceu exatamente `26263d16778d68dd88180d29794a0ad50c0bd79eb0468a76ed9d10001b77bccc`. Não houve divergência P0.

## 25. Estado Git

Estado inicial sanitizado: branch `main`, HEAD `0e3196ea21754aea6387aed0e1f2aabe3678747a`, tag `v1.0.0-rc.5`; somente o relatório da Etapa 1 estava não rastreado.

Estado final sanitizado: mesma branch, HEAD e tag; apenas três arquivos não rastreados — relatório da Etapa 1, este Markdown e o CSV associado. Não há código, arquivo de produção, `.env`, schema ou migration modificado. `git diff --check` foi aprovado. Não houve commit, push, tag ou deploy.
