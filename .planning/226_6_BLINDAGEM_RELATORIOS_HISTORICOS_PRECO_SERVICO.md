# Sprint 226.6 - Blindagem de relatorios historicos contra preco atual de servico

Data: 2026-06-28

Responsavel tecnico: CTO tecnico do Projeto Software Barbearia

Escopo: auditar e corrigir leituras historicas que recalculavam receita de atendimento com `Service.price` atual. Nenhuma migration, seed, snapshot, saneamento, catalogo real, checkout real, venda real, pagamento real, comissao real, deploy, PM2 ou Nginx foi executado.

## 1. Objetivo

Proteger relatorios, KPIs e rankings historicos contra mudancas futuras no preco atual do servico.

A regra aplicada foi conservadora: quando existe `FinancialEntry` de receita de servico vinculada ao agendamento, ela e a fonte de verdade para receita historica. Quando nao existe valor persistido, o sistema mantem fallback para `Service.price` e a limitacao fica documentada.

## 2. Contexto vindo da Sprint 226.5

A Sprint 226.5 registrou que Geovane confirmou precos reais diferentes dos registros atuais:

| Servico | Preco real confirmado |
| --- | ---: |
| Corte | R$ 30,00 |
| Barba | R$ 20,00 |
| Hidratacao | R$ 20,00 |
| Luzes | R$ 50,00 |
| Pigmentacao | R$ 45,00 |

Tambem confirmou um risco tecnico: `Appointment` guarda `serviceId`, mas nao guarda snapshot de nome, preco ou duracao. Como parte do sistema lia `appointment.service.price`, uma mudanca em `Service.price` poderia distorcer relatorios antigos.

## 3. Decisao do pre-flight CTO

Decisao: LIBERADO COM RESSALVAS.

| Checagem | Resultado |
| --- | --- |
| Diretorio | `/root/software-barbearia` |
| Branch/status inicial | `## main...origin/main` |
| HEAD esperado | `4fbe926 docs: planejar catalogo real com resposta do geovane` |
| Worktree inicial | Limpa |
| HEAD alinhado com `origin/main` | Sim |
| Risco de alterar banco | Nao executado |
| Risco de migration | Nao executado |
| Risco de alterar dado financeiro real | Nao executado |
| Risco de quebrar frontend | Baixo; contratos foram preservados |
| Risco de mascarar problema | Mitigado por fallback documentado e teste de regressao |
| Risco de teste depender de producao | Nao; teste usa `DATA_BACKEND=memory` |

## 4. Decisao de CTO

Decisao: corrigir agora os calculos historicos que ja tinham valor persistido melhor.

Discordancia tecnica: nao faria sentido esperar a duracao final do Geovane para esta blindagem. O risco existe independentemente do catalogo canonico. Tambem nao faria sentido criar snapshot agora, porque preencher snapshot retroativo a partir do preco atual poderia cristalizar uma leitura ja contaminada.

## 5. Achado tecnico original

Achado herdado da 226.5:

- `Service.price`, `Service.name` e `Service.durationMin` sao dados vivos de catalogo.
- `Appointment` referencia `Service`, mas nao congela nome/preco/duracao.
- `FinancialEntry.amount` congela a receita ja gerada.
- `CommissionEntry.baseAmount` e `CommissionEntry.commissionAmount` congelam base e valor de comissao.
- Relatorios/KPIs de agenda, performance, clientes e financeiro podiam recalcular receita historica por `Service.price`.

## 6. Analise do schema

| Entidade | Snapshot existente | Observacao |
| --- | --- | --- |
| `Service` | Nao e snapshot; e catalogo vivo | `price`, `name`, `durationMin`, `costEstimate` mudam com o catalogo. |
| `Appointment` | Nao | Guarda `serviceId`, `startsAt`, `endsAt`, `status`; nao guarda `servicePriceSnapshot`. |
| `FinancialEntry` | Sim, para valor financeiro | `amount` preserva receita/despesa persistida e referencia `APPOINTMENT`/`PRODUCT_SALE`. |
| `CommissionEntry` | Sim, para comissao | `baseAmount` e `commissionAmount` preservam calculo gravado. |
| `ProductSale` | Sim, para venda | `grossAmount` preserva total da venda. |
| `ProductSaleItem` | Sim, para item vendido | `unitPrice` e `unitCost` preservam preco/custo do item. |

## 7. Mapeamento de usos de `service.price` e `service.name`

| Area | Uso encontrado | Classificacao |
| --- | --- | --- |
| Catalogo/servicos internos | Exibir e editar nome/preco/margem atual | Seguro: catalogo atual. |
| Booking publico | Exibir preco/duracao atual e montar slot futuro | Seguro: oferta atual/futura. |
| Checkout/conclusao | Calcular receita no momento da conclusao antes de gravar `FinancialEntry` | Seguro: grava valor persistido em seguida. |
| Relatorio financeiro antigo `revenueByService` | Somava agendamentos concluidos por `service.price` | Perigoso; corrigido para `FinancialEntry.amount`. |
| Relatorio gerencial de atendimentos | `realizedRevenue`, top servicos/profissionais e linha concluida usavam preco vivo | Perigoso; corrigido para `FinancialEntry.amount` quando concluido. |
| Relatorio gerencial de profissionais | Dependia do overview financeiro que usava preco vivo | Perigoso; corrigido. |
| Performance por profissionais/servicos | Receita historica por atendimento concluido usava preco vivo | Perigoso; corrigido. |
| Clientes/retencao | Receita historica por cliente usava preco vivo | Perigoso; corrigido. |
| Dashboard | Top profissionais, top servicos, performance e top clientes usavam preco vivo | Perigoso; corrigido para concluidos com financeiro persistido. |
| Estimativas futuras/canceladas/no-show | Usa preco atual para oportunidade ou perda estimada | Seguro com ressalva: e estimativa, nao historico financeiro. |
| Nome do servico em agenda/listas | Usa `service.name` vivo | Limitacao restante; exige snapshot futuro para verdade historica textual. |

## 8. Usos seguros

Usos mantidos como seguros:

- catalogo atual em `/services` e modulo de servicos;
- booking publico e slots futuros;
- checkout/conclusao antes de persistir `FinancialEntry`;
- estimativas futuras, forecast e receita perdida estimada de cancelados/no-show;
- margem/custo de catalogo atual em servicos.

## 9. Usos perigosos encontrados

Foram encontrados usos perigosos em:

- `getFinancialReports`;
- `getManagementAppointmentsReport`;
- `getManagementProfessionalsReport` via `getFinancialManagementOverview`;
- `getPerformanceProfessionals`;
- `getPerformanceServices`;
- `getProfessionalsPerformance`;
- `getPerformanceSummary`;
- `getClientsOverview`;
- `getDashboard`;
- resumo de uso de servicos no modulo de gestao.

## 10. Correcoes feitas

Correcoes implementadas em `src/application/operations-service.ts` e `src/application/prisma-operations-service.ts`:

- criado helper para mapear receita persistida de atendimento por `FinancialEntry` com `kind=INCOME`, `source=SERVICE`, `referenceType=APPOINTMENT` e `referenceId=appointment.id`;
- rankings de receita por servico passaram a usar `FinancialEntry.amount`;
- relatorio gerencial de atendimentos usa valor persistido para atendimentos concluidos;
- relatorio gerencial de profissionais usa overview financeiro blindado;
- performance por profissionais/servicos e resumo de metas usam receita persistida;
- dashboard e clientes usam receita persistida para atendimentos concluidos;
- quando nao existe `FinancialEntry` correspondente, o fallback legado continua sendo `Service.price`.

## 11. Testes adicionados/alterados

Teste alterado em `tests/api.spec.ts`:

- o teste de contratos gerenciais agora cria atendimento, executa checkout em backend memory, confirma receita de servico de R$ 75, altera o preco atual de `svc-corte` para R$ 999 e valida que:
  - relatorio financeiro continua com `serviceRevenue = 75`;
  - relatorio de atendimentos continua com `realizedRevenue = 75`;
  - linha do atendimento concluido continua com `price = 75`;
  - relatorio de profissionais continua com `serviceRevenue = 75`;
  - performance por servico continua com receita de R$ 75.

## 12. Limitacoes restantes

Limitacoes mantidas de proposito:

- se um atendimento concluido antigo nao tiver `FinancialEntry` de servico, o fallback ainda usa `Service.price`;
- `service.name` historico ainda vem da relacao viva em algumas telas/listas;
- `durationMin` historico ainda vem da relacao viva quando exibido;
- `costEstimate` historico tambem e dado vivo, entao margem/custo historico ainda nao e contabilidade fechada;
- nao ha snapshot textual confiavel de nome do servico/profissional no `Appointment`.

## 13. Por que nao criar snapshot agora

Snapshot retroativo agora seria perigoso porque o unico dado facilmente disponivel para preencher `servicePriceSnapshot` em agendamentos antigos seria o preco atual do servico. Se esse preco ja diverge do passado, a migration transformaria dado contaminado em verdade oficial.

Criar `serviceNameSnapshot`, `servicePriceSnapshot` ou `serviceDurationSnapshot` exige uma estrategia de corte, fonte confiavel e possivelmente reconciliacao com financeiro/auditoria. Essa sprint nao tinha autorizacao nem base suficiente para isso.

## 14. Necessidade futura de snapshot

Snapshot futuro ainda e desejavel para:

- nome historico do servico;
- preco ofertado no momento do agendamento;
- duracao usada para montar o slot;
- nome do profissional exibido historicamente;
- custo/margem, se relatorios de margem forem tratados como historico fechado.

Abordagem segura futura: criar campos de snapshot apenas para novos agendamentos, preencher no momento de criacao/confirmacao/checkout, e tratar historico antigo por data de corte sem backfill automatico cego.

## 15. Impacto sobre catalogo canonico

Esta blindagem reduz risco para criar catalogo canonico depois, porque relatorios financeiros que possuem `FinancialEntry` deixam de depender diretamente de `Service.price` atual.

Ainda nao libera mutacao de catalogo real sem backup/autorizacao. Ela apenas diminui o dano esperado se novos servicos canonicos forem criados e servicos antigos forem inativados/ocultados depois.

## 16. O que nao foi feito por seguranca

Nao foi feito:

- migration;
- snapshot;
- seed;
- alteracao de `.env`;
- alteracao de banco real;
- alteracao de preco real;
- criacao/renomeacao/inativacao/remocao de servico real;
- saneamento;
- catalogo canonico;
- checkout real;
- venda real;
- pagamento real;
- comissao real;
- refund/estorno real;
- estoque;
- deploy;
- PM2/Nginx;
- avanco para Sprint 227.

## 17. Riscos P0/P1/P2/P3

| Severidade | Risco | Status |
| --- | --- | --- |
| P0 | Relatorio financeiro historico recalcular receita por preco atual | Mitigado quando ha `FinancialEntry`. |
| P0 | Migration de snapshot cristalizar preco atual errado | Evitado; nao houve migration. |
| P1 | Atendimentos sem `FinancialEntry` ainda dependerem de `Service.price` | Limitacao documentada. |
| P1 | Nome/duracao historicos mudarem com catalogo vivo | Limitacao documentada; exige snapshot futuro. |
| P2 | Margem/custo historico depender de `costEstimate` vivo | Limitacao documentada. |
| P2 | Teste cobrir so memory e nao banco Prisma real | Mitigado parcialmente por `tsc`; teste DB nao foi executado por trava. |
| P3 | Mais pontos de UI exibirem nome vivo | Aceito ate sprint futura de snapshot textual. |

## 18. Opiniao tecnica CTO

| Pergunta | Opiniao CTO |
| --- | --- |
| Esta etapa foi util ou burocratica? | Util. Corrigiu risco real antes de mexer em catalogo. |
| Quais relatorios/KPIs estavam em risco? | Financeiro por servico, atendimentos, profissionais, performance, clientes e dashboard. |
| Algum historico era recalculado com preco atual? | Sim. Varios pontos somavam atendimento concluido usando `Service.price`. |
| O que foi corrigido? | Receita historica de atendimentos concluidos passou a preferir `FinancialEntry.amount`. |
| O que ainda depende de snapshot futuro? | Nome, duracao, preco de atendimentos sem financeiro e historico textual. |
| Por que snapshot agora seria perigoso? | Porque backfill poderia usar preco atual e oficializar dado errado. |
| Essa correcao ajuda o catalogo canonico? | Sim, reduz acoplamento entre relatorio financeiro historico e preco vivo. |
| E mais seguro criar servicos canonicos depois disso? | Sim, mas ainda exige backup, dry-run, duracao, data de corte e aprovacao. |
| A Sprint 227 continua bloqueada? | Sim. Esta sprint nao saneia dados nem libera fluxo real completo. |
| Qual proxima acao util enquanto Geovane nao responde? | Preparar smoke/teste readonly por perfil e roteiro de snapshot futuro sem mutacao. |

## 19. Decisao final

Decisao final: Sprint 226.6 APROVADA COM RESSALVAS.

A blindagem foi util e reduziu risco real. Ela nao transforma historico contaminado em verdade operacional, nao autoriza alteracao de catalogo real e nao desbloqueia a Sprint 227.

## 20. Proxima sprint recomendada

Recomendacao: Sprint 226.7 - Smoke readonly por perfil e plano de snapshot futuro.

Escopo recomendado:

1. Validar owner/recepcao/profissional em endpoints readonly com credenciais seguras ou fixtures aprovadas.
2. Documentar contrato futuro de snapshots para novos agendamentos.
3. Definir quais campos entram em snapshot e em qual evento sao congelados.
4. Manter catalogo real bloqueado ate Geovane confirmar duracao/publicacao e ate haver backup/autorizacao.

Sprint 227 permanece bloqueada.
