# Simulação operacional — Etapa 1

Data da execução: 2026-07-15 (America/Sao_Paulo)

Revisão validada: `0e3196ea21754aea6387aed0e1f2aabe3678747a` (`v1.0.0-rc.5`)

Seed determinística: `20260715`

Resultado: **SIMULADOR OPERACIONAL VALIDADO — PRONTO PARA SIMULAÇÃO COMPLETA DE 30 DIAS**

Os resultados decorrem de uma simulação operacional controlada com dados fictícios e não representam faturamento, desempenho ou comportamento real da Barbearia Geovane Borges.

## Escopo e isolamento

A validação foi executada exclusivamente em PostgreSQL local, em banco descartável chamado `barbearia_operational_simulation_test_20260715_153702`. O nome passou por guarda exata e continha o marcador obrigatório `_operational_simulation_test_`. O simulador também exigiu `ALLOW_OPERATIONAL_SIMULATION=true`, recusou `NODE_ENV=production`, `barbearia_pilot`, nomes com aparência de produção e hosts PostgreSQL não locais.

O runtime normal já existente na porta 3333 não foi reiniciado, substituído nem usado para gravar dados. Não houve deploy, alteração de código do produto, migration nova, seed no piloto, alteração de `.env`, dependência, commit, push ou tag. Credenciais e segredos foram efêmeros e permaneceram somente no processo; este relatório não os registra.

O banco descartável recebeu as 21 migrations oficiais, de `20260422_init` a `20260706_operational_hours_and_zero_buffer`. Não houve migration improvisada. Todas as pessoas, unidades, serviços, produtos e operações criados para a simulação são fictícios.

## Arquitetura do simulador

O simulador temporário executou o servidor Fastify em memória por `createApp()` e chamou as rotas HTTP oficiais com autenticação, RBAC, tenant, cabeçalhos de correlação e chaves de idempotência. Fixtures estritamente estruturais foram criadas via Prisma: duas unidades isoladas, horários, métodos de pagamento, serviços, profissionais, elegibilidade, regras de comissão, clientes, produtos e usuários.

Toda operação comercial passou pelas rotas oficiais: abertura de estoque, agendamentos e transições de estado, checkout, venda de produto, pagamento de comissão, estorno e webhook da IA. As transações e constraints Prisma do produto permaneceram responsáveis por persistência e consistência.

Configuração curta usada para validar o mecanismo antes dos 30 dias: 2 dias fictícios, média observada de 2,5 agendamentos/dia, taxa de cancelamento de 20%, 0% de no-show nesta janela, probabilidade configurada de venda de produto de 40% e 6 comandos/eventos de IA. A grade de ocupação teórica adotou um profissional, 9 horas/dia por 2 dias.

## Cenários executados

- 5 agendamentos criados pelas rotas oficiais: 1 concluído, 1 cancelado, 1 em atendimento e 2 agendados ao final.
- Confirmação e início de atendimento executados; tentativa de conflito de horário recusada.
- Endpoint legado de conclusão recusado; conclusão comercial ocorreu somente pelo checkout oficial.
- 1 checkout concluído; tentativa do perfil profissional recusada por RBAC.
- 2 vendas: uma vinculada a cliente e uma sem cliente; 3 itens vendidos em quantidade bruta.
- Tentativa de venda com estoque insuficiente recusada.
- 1 estorno parcial de produto; 1 item devolvido e reposto.
- Pagamento de comissão executado pela rota financeira oficial.
- Replays de checkout, venda, comissão e estorno exercitados sem duplicidade comercial.
- Acesso entre tenants recusado e perfil inválido impedido de obter uma sessão utilizável.
- Webhook da IA: prévia sem mutação, replay deduplicado, cancelamento, confirmação após cancelamento recusada e prévia expirada recusada.
- Nenhum provedor externo de IA, áudio ou mensageria foi chamado.

## KPIs da execução curta

| Indicador | Resultado |
|---|---:|
| Ocupação teórica | 15,74% |
| Receita bruta de serviços | R$ 60,00 |
| Receita bruta de produtos | R$ 105,00 |
| Receita bruta total | R$ 165,00 |
| Estornos | R$ 40,00 |
| Comissão paga/registrada como despesa | R$ 24,00 |
| Receita líquida após estorno e comissão paga | R$ 101,00 |
| Ticket médio bruto (1 checkout + 2 vendas) | R$ 55,00 |
| Produtos vendidos — bruto/líquido | 3 / 2 |
| Comissões geradas/pagas | R$ 34,50 / R$ 24,00 |

Esses números validam o encadeamento e a reconciliação; não constituem projeção de produção por cobrirem somente dois dias fictícios.

## Reconciliação financeira e de estoque

Foram persistidos 5 lançamentos financeiros: 1 receita de serviço de R$ 60,00, 2 receitas de produto que somam R$ 105,00, 1 despesa de estorno de R$ 40,00 e 1 despesa de comissão de R$ 24,00. A validação encontrou 0 referências órfãs, 0 lançamentos duplicados e 0 comissões duplicadas por origem.

O estoque fictício abriu com 70 unidades e 6 movimentos de entrada. Terminou com 68 unidades e 9 movimentos totais: as saídas líquidas foram 2 unidades. Cada saldo foi recalculado a partir dos movimentos e conciliou exatamente; não houve estoque negativo.

| Produto fictício | Inicial | Final |
|---|---:|---:|
| Bucha | 5 | 5 |
| Condicionador | 12 | 12 |
| Gel | 20 | 19 |
| Máscara | 8 | 8 |
| Pomada | 10 | 9 |
| Shampoo | 15 | 15 |

## Idempotência, RBAC, tenant e auditoria

Foram encontrados 21 registros de idempotência: 16 operações comerciais encerradas como `SUCCEEDED` e 5 claims do webhook da IA no estado contratual `CLAIMED`. Os replays testados não criaram checkout, venda, despesa, estorno ou mutação de IA duplicados.

RBAC recusou a operação comercial do perfil profissional. A tentativa cross-tenant foi recusada. O perfil inválido não conseguiu obter uma sessão utilizável. O isolamento entre as duas unidades fictícias foi preservado.

Foram gerados 66 eventos de auditoria para mutações. Todos continham ator, perfil, unidade, ação, entidade, rota, método e request/correlation id; todos tinham estado posterior e 21 continham chave de idempotência. Cinco eventos continham também estado anterior. A ausência de `beforeJson` nos demais eventos é uma limitação observada do contrato atual, não uma quebra de reconciliação.

## IA e confirmação humana

A IA foi exercitada apenas pelo webhook oficial e com transporte externo substituído por resposta local controlada. Prévia, replay, cancelamento e expiração não alteraram agendamentos, vendas, financeiro ou estoque. A contagem de mutações antes de confirmação foi zero. Não houve envio externo de mensagem nem chamada a Gemini, transcrição ou outro provedor.

## Problemas e limitações encontrados

- O runner temporário precisou ser encapsulado em uma função assíncrona porque `tsx` tratou a extensão inicial como CommonJS. Isso afetava somente o artefato descartável de validação.
- O endpoint de login devolve erro de cliente para perfil persistido inválido, mas não necessariamente status 401. A checagem foi alinhada ao contrato efetivo: resposta 4xx e ausência de sessão utilizável.
- Claims de deduplicação do webhook permanecem em `CLAIMED`, enquanto operações comerciais ficam em `SUCCEEDED`. A reconciliação passou a validar os dois contratos separadamente.
- O replay intencional do webhook produz um log Prisma de unique constraint antes de ser reconhecido e tratado como duplicata. O resultado HTTP e o banco confirmaram a deduplicação esperada.
- No-show não foi executado porque o relógio real ainda era anterior aos horários fictícios. O estado oficial `NO_SHOW` e sua tolerância de 15 minutos serão cobertos pelos testes focados; esta lacuna curta é P2 e deve virar cenário explícito na simulação completa.
- A taxa de ocupação é teórica para a grade curta e não representa previsão operacional.

Não foi identificado achado P0 ou P1. As limitações acima não invalidam o mecanismo; o cenário de no-show deve ser incluído na Etapa 2.

## Limpeza, baseline e qualidade

Limpeza concluída:

- o processo interno do simulador e a conexão Prisma foram encerrados normalmente;
- o banco `barbearia_operational_simulation_test_20260715_153702` foi destruído após confirmação de zero conexões ativas;
- a busca final encontrou zero bancos com o marcador `_operational_simulation_test_`;
- o arquivo temporário do simulador foi removido; não foram gerados dump, mídia ou log persistente;
- o runtime Node normal permaneceu em `LISTEN` na porta 3333.

Baseline piloto antes e depois da simulação: clientes 0, agendamentos 0, vendas 0, financeiro 0, checkouts 0, produtos 6, movimentos 6 e estoque total 73. Os saldos finais consultados em transação PostgreSQL `READ ONLY` foram: Bucha 3, Condicionador 10, Gel 30, Máscara 10, Pomada 10 e Shampoo 10. O fingerprint antes e depois permaneceu exatamente:

`26263d16778d68dd88180d29794a0ad50c0bd79eb0468a76ed9d10001b77bccc`

Qualidade concluída:

- testes focados: 5 arquivos e 58 testes aprovados, cobrindo máquina de estados, serviços de agendamento, hardening e tolerância de no-show, IA owner e operações owner;
- o teste focado confirmou `NO_SHOW` somente após os 15 minutos de tolerância e bloqueio de repetição;
- `npm run build`: aprovado;
- `git diff --check`: aprovado;
- Git status final esperado: somente este relatório Markdown não rastreado; nenhum arquivo de produto modificado.

O único artefato permanente criado é este relatório Markdown.

## Recomendação para a Etapa 2

Prosseguir com a simulação completa de 30 dias usando o mesmo desenho: novo banco local descartável com marcador e timestamp, seed determinística registrada, migrations oficiais, fixtures estruturais via Prisma e todas as operações comerciais por HTTP oficial. Incluir no relógio simulado pelo menos um caso explícito de no-show após a tolerância e manter a validação separada dos estados de idempotência comercial (`SUCCEEDED`) e do claim de webhook (`CLAIMED`). Repetir obrigatoriamente a destruição do banco e o fingerprint do piloto ao final.
