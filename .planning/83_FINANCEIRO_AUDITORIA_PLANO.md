# 83 - Financeiro Profissional e Auditoria Persistente

Data: 2026-05-02
Fase: 0.2 - planejamento tecnico
Status: PLANO, sem implementacao de regra de negocio nesta etapa

## Objetivo
Transformar o financeiro na fonte confiavel da verdade operacional, com:
- comissoes pagas refletidas como despesas reconciliaveis;
- estornos/devolucoes rastreaveis sem apagar a venda original;
- auditoria persistente append-only para acoes criticas;
- validacao final em PostgreSQL real.

## Estado atual analisado

### Appointment checkout
- Rota: `POST /appointments/:id/checkout` em `src/http/app.ts:1784`.
- Servico Prisma: `checkoutAppointment` em `src/application/prisma-operations-service.ts:2802`.
- Efeitos atuais:
  - atualiza appointment para `COMPLETED`;
  - cria `AppointmentHistory`;
  - cria receita de servico em `FinancialEntry` com `referenceType=APPOINTMENT`;
  - cria `CommissionEntry` de servico quando aplicavel;
  - se houver produtos, cria `ProductSale`, `ProductSaleItem`, receita de produto, `StockMovement OUT` e comissao de produto;
  - atualiza metricas derivadas do cliente na resposta.
- Protecoes atuais:
  - `idempotencyKey` obrigatoria na rota;
  - `IdempotencyRecord` transacional;
  - `appointment.updateMany` com status ainda nao completo;
  - constraints de origem em financeiro, comissao, venda e estoque.
- Lacuna:
  - nao existe estorno de atendimento concluido;
  - receita automatica nao deve ser editada/destruida, mas ainda falta fluxo oficial de reversao.

### Product sale
- Rota: `POST /sales/products` em `src/http/app.ts:1819`.
- Servico Prisma: `registerProductSale` em `src/application/prisma-operations-service.ts:2600`.
- Efeitos atuais:
  - cria venda e itens;
  - cria receita financeira `PRODUCT_SALE`;
  - cria movimentos de estoque `OUT`;
  - decrementa estoque com defesa contra saldo insuficiente;
  - cria comissao de produto quando ha profissional/regra.
- Protecoes atuais:
  - `idempotencyKey` obrigatoria;
  - unique de `ProductSale.unitId + idempotencyKey`;
  - unique de `FinancialEntry.unitId + referenceType + referenceId + source`;
  - unique de `StockMovement.unitId + productId + referenceType + referenceId + movementType`.
- Lacuna:
  - nao existe devolucao parcial/total;
  - nao existe entidade `Refund`/`RefundItem`;
  - nao existe movimento reverso de estoque com origem propria `REFUND`;
  - comissao de venda devolvida nao e ajustada por fluxo controlado.

### Financial transactions
- Rotas:
  - `GET /financial/transactions` em `src/http/app.ts:1881`;
  - `POST /financial/transactions` em `src/http/app.ts:1898`;
  - `PATCH /financial/transactions/:id` em `src/http/app.ts:1933`;
  - `DELETE /financial/transactions/:id` em `src/http/app.ts:1964`.
- Modelo: `FinancialEntry` em `prisma/schema.prisma:405`.
- Servico Prisma: `createFinancialTransaction` em `src/application/prisma-operations-service.ts:3562`.
- Efeitos atuais:
  - entradas e saidas usam `kind=INCOME|EXPENSE`;
  - origem de dominio aceita `SERVICE` e `PRODUCT`; manual fica com `source=null`;
  - `referenceType` atual e texto livre, usado como `APPOINTMENT`, `PRODUCT_SALE` ou `MANUAL`;
  - criacao manual exige valor positivo.
- Protecoes atuais:
  - criacao exige `idempotencyKey`;
  - apenas lancamentos `MANUAL` podem ser editados ou excluidos.
- Lacunas:
  - nao ha `status` financeiro;
  - nao ha `createdBy` persistido no financeiro;
  - nao ha referencia formal para `commissionId` ou `refundId`;
  - nao ha fluxo de estorno proprio;
  - exclusao de manual ainda remove linha em vez de gerar cancelamento/auditoria append-only.

### Manual entry
- Rota simplificada: `POST /financial/manual-entry` em `src/http/app.ts:1844`.
- Servico Prisma: `registerManualFinancialEntry` em `src/application/prisma-operations-service.ts:3193`.
- Efeito atual:
  - delega para `createFinancialTransaction` com categoria padrao `OPERACIONAL` ou `RECEITA_MANUAL` e `source=MANUAL`.
- Protecao atual:
  - `idempotencyKey` obrigatoria;
  - replay/conflito cobertos por teste.
- Lacunas:
  - sem `createdBy` persistente;
  - sem status;
  - sem motivo padronizado para edicao/exclusao posterior;
  - exclusao ainda e destrutiva para manual.

### Commission pay
- Rota: `PATCH /financial/commissions/:id/pay` em `src/http/app.ts:2025`.
- Servico Prisma: `markFinancialCommissionAsPaid` em `src/application/prisma-operations-service.ts:3838`.
- Modelo: `CommissionEntry` em `prisma/schema.prisma:430`.
- Efeito atual:
  - valida comissao existente;
  - bloqueia pagamento se `status=CANCELED`;
  - marca `status=PAID`;
  - grava `paidAt`;
  - persiste replay por `IdempotencyRecord`.
- Lacuna critica:
  - nao cria `FinancialEntry EXPENSE`;
  - pagamento de comissao nao reduz caixa;
  - nao existe vinculo financeiro entre despesa e comissao;
  - nao ha lote de pagamento para pagar varias comissoes em uma saida unica.

### Stock movements
- Modelo: `StockMovement` em `prisma/schema.prisma:490`.
- Movimentos de venda: gerados por `buildStockMovementsFromSale` em `src/domain/rules.ts:188`.
- Movimento manual: `POST /stock/movements/manual` em `src/http/app.ts:2391`, com servico em `src/application/prisma-operations-service.ts:3219`.
- Efeitos atuais:
  - venda gera `OUT` com `referenceType=PRODUCT_SALE`;
  - consumo de servico usa `SERVICE_CONSUMPTION`;
  - manual permite `ADJUSTMENT` ou `INTERNAL`;
  - atualiza saldo de produto na mesma transacao do movimento Prisma.
- Lacunas:
  - ajuste manual de estoque nao exige `idempotencyKey`;
  - ajuste manual nao exige motivo;
  - nao ha `REFUND` como origem de movimento;
  - constraint com `referenceId` nulo nao deduplica todos os ajustes manuais em PostgreSQL.

### Audit events atuais
- Tipo em memoria: `AuditEvent` em `src/http/app.ts:39`.
- Array em memoria: `auditEvents` em `src/http/app.ts:199`.
- Funcao: `recordAudit` em `src/http/app.ts:1217`.
- Consulta: `GET /audit/events` em `src/http/app.ts:1292`.
- Acoes auditadas:
  - clientes;
  - agendamentos;
  - checkout;
  - vendas;
  - financeiro;
  - pagamento de comissao;
  - estoque;
  - servicos;
  - configuracoes;
  - automacoes.
- Lacunas:
  - auditoria e volatil e perdida no restart;
  - limite de 5000 eventos em memoria;
  - maioria dos eventos tem apenas `after`;
  - `reason` nao e campo padrao;
  - auditoria e gravada depois da operacao, fora da transacao de negocio.

## Respostas objetivas das lacunas
- Comissao paga gera despesa? Nao. Hoje apenas muda `CommissionEntry.status` e `paidAt`.
- Financeiro rastreia origem de cada entrada/saida? Parcialmente. Receitas de servico/produto e manuais tem `referenceType/referenceId`, mas sem FKs formais, sem `commissionId/refundId`, e manual/source ficam pouco expressivos.
- Existe estorno de atendimento? Nao. Atendimento concluido nao possui fluxo de reversao financeira/comissao/estoque.
- Existe devolucao de venda de produto? Nao. Nao ha `Refund`, rota, financeiro negativo, retorno ao estoque ou ajuste de comissao.
- Auditoria atual e persistida? Parcialmente apenas em historicos especificos. A auditoria geral de `/audit/events` e memoria.
- Quais acoes criticas ainda deixam rastro insuficiente?
  - pagamento de comissao;
  - devolucao/estorno futuro;
  - edicao/exclusao de lancamento manual;
  - ajuste manual de estoque;
  - cancelamento/no-show com impacto financeiro futuro;
  - alteracao de regras de comissao, preco de servico e preco/custo de produto;
  - mudancas de metodo de pagamento e configuracoes financeiras.

## Decisoes tecnicas propostas

### 1. Financeiro como ledger operacional
`FinancialEntry` deve ser o extrato financeiro operacional, nao apenas um resumo. Toda movimentacao de caixa deve ter:
- `kind`;
- `amount` positivo;
- `status`;
- origem tipada;
- referencia rastreavel;
- ator;
- data de competencia/ocorrencia;
- trilha de auditoria.

Para estorno, preferir nova linha reversa em vez de editar/apagar a original:
- receita original permanece;
- estorno entra como `EXPENSE` ou como tipo/origem controlada de refund, conforme decisao contabil;
- relatorios filtram por status/origem;
- auditoria preserva antes/depois e motivo.

### 2. Comissao: provisao versus liquidacao
Separar dois conceitos:
- `CommissionEntry`: obrigacao/provisao operacional gerada por venda/servico;
- `FinancialEntry`: saida de caixa quando a comissao e paga.

Politica recomendada para a primeira entrega:
- pagamento individual de comissao cria uma despesa financeira atomica;
- `referenceType=COMMISSION`;
- `referenceId=commissionEntry.id`;
- `category=COMISSAO`;
- `kind=EXPENSE`;
- `amount=commissionAmount`;
- `professionalId` preenchido;
- `paymentMethod` informado ou padrao explicito;
- unique por `unitId + referenceType + referenceId + source/category` ou campo dedicado de `commissionId`.

Nao criar lote de comissoes na 0.2.1, a menos que a UI/operacao ja exija pagamento em massa. O lote pode ser uma evolucao posterior.

### 3. Devolucao/estorno: modelo imutavel
Criar uma entidade propria de reversao:
- `Refund`: cabecalho, motivo, status, valor total, origem, ator e datas;
- `RefundItem`: itens de produto devolvidos ou componentes do checkout;
- movimentos financeiros e de estoque apontam para `Refund`;
- venda/appointment original nao e apagado;
- status de venda pode ser derivado por soma de refunds.

Para atendimento sem produto, usar `AppointmentRefund` ou `Refund` com `appointmentId` e sem itens de produto. A decisao de schema deve evitar dois fluxos paralelos se a logica financeira for a mesma.

### 4. Auditoria persistente append-only
Criar `AuditLog` com append-only de aplicacao:
- sem update/delete por rotas comuns;
- inserts em acoes criticas;
- consultas paginadas por unidade, periodo, entidade, ator e acao;
- `beforeJson`, `afterJson`, `reason`, `requestId`, `ipHash`, `userAgent`.

Onde possivel, gravar o audit log dentro da mesma transacao do negocio. Onde isso acoplar demais a camada HTTP, usar helper/outbox transacional chamado pelo servico de aplicacao.

## Plano de execucao

### Fase 0.2.1 - Pagamento de comissao como despesa reconciliavel
Objetivo: ao pagar comissao, financeiro deve registrar a saida de caixa de forma idempotente e rastreavel.

Escopo tecnico:
1. Definir contrato de pagamento com `paymentMethod`, `paidAt`, `changedBy`, `idempotencyKey`.
2. Estender referencia financeira para aceitar `COMMISSION`.
3. Criar despesa `FinancialEntry EXPENSE` na mesma transacao que marca a comissao como paga.
4. Garantir unique contra duplicidade de despesa por comissao.
5. Retornar no endpoint o `financialEntryId` da despesa gerada.
6. Ajustar listagem/relatorio financeiro para exibir origem `COMMISSION`/categoria `COMISSAO`.
7. Manter replay idempotente retornando a mesma comissao paga e a mesma despesa.

Cuidados:
- Se a comissao ja estiver `PAID`, o retry com mesma chave deve fazer replay; chamada nova sem mesma chave deve retornar estado atual ou erro controlado, nunca criar segunda despesa.
- Se a criacao da despesa falhar, a comissao nao pode ficar `PAID`.
- Nao misturar pagamento de comissao com ajuste/reversao de comissao nesta fase.

Testes minimos:
- pagar comissao cria exatamente uma despesa;
- retry com mesma chave nao duplica despesa;
- payload divergente com mesma chave retorna 409;
- comissao cancelada nao cria despesa;
- dashboard/summary passa a refletir saida de caixa;
- teste DB real valida unique em PostgreSQL.

### Fase 0.2.2 - Estorno/devolucao rastreavel
Objetivo: permitir corrigir venda/checkout sem apagar o fato original.

Escopo tecnico:
1. Criar modelo `Refund` e `RefundItem`.
2. Criar rota idempotente para devolucao de venda de produto, por exemplo `POST /sales/:id/refunds`.
3. Avaliar rota de estorno de atendimento, por exemplo `POST /appointments/:id/refunds`, ou rota unificada `POST /refunds`.
4. Validar saldo devolvivel acumulado por item/venda.
5. Criar financeiro reverso vinculado ao refund.
6. Criar `StockMovement IN` quando `returnToStock=true`.
7. Ajustar ou cancelar comissao por ledger negativo/ajuste vinculado ao refund.
8. Exigir motivo estruturado e texto livre curto.
9. Expor consulta de refunds por venda/appointment.

Cuidados:
- Venda original e receita original permanecem imutaveis.
- Quantidade devolvida acumulada nao pode superar quantidade vendida.
- Devolucao parcial deve preservar item remanescente.
- Produto consumivel de servico nao deve voltar ao estoque automaticamente no estorno de atendimento sem politica explicita.
- Se a comissao ja foi paga, gerar ajuste financeiro/pendencia em vez de apagar pagamento.

Testes minimos:
- devolucao total de produto cria refund, financeiro reverso e estoque `IN`;
- devolucao parcial permite nova devolucao apenas do saldo restante;
- devolucao acima do vendido falha sem efeito colateral;
- refund com mesma chave e payload igual faz replay;
- refund com payload divergente retorna 409;
- comissao pendente e comissao paga tem politica coberta por teste;
- relatorios financeiros e estoque refletem o refund.

### Fase 0.2.3 - Auditoria persistente append-only
Objetivo: substituir a trilha geral em memoria por persistencia consultavel e resistente a restart.

Escopo tecnico:
1. Criar modelo `AuditLog`.
2. Criar helper de auditoria persistente.
3. Migrar `recordAudit` para escrever em banco quando `DATA_BACKEND=prisma`.
4. Manter fallback em memoria apenas para backend `memory`/testes unitarios.
5. Atualizar `GET /audit/events` para ler de `AuditLog` no backend Prisma.
6. Padronizar `reason` para acoes sensiveis.
7. Capturar `beforeJson` e `afterJson` para financeiro manual, estoque manual, regras de comissao e configuracoes financeiras.
8. Impedir update/delete de audit por API.

Acoes P0 para auditar persistentemente:
- checkout de appointment;
- venda de produto;
- pagamento de comissao;
- criacao/edicao/exclusao/cancelamento de financeiro manual;
- ajuste manual de estoque;
- refund/estorno;
- alteracao de preco/custo de produto;
- alteracao de preco/custo/comissao de servico;
- alteracao de regra de comissao;
- alteracao de metodo de pagamento.

Testes minimos:
- evento permanece apos recriar app com backend Prisma;
- filtros por unidade/periodo/acao funcionam;
- acao critica grava `requestId`, actor, role, entity e reason quando obrigatorio;
- operacao de negocio e audit log sao atomicos nos fluxos escolhidos;
- backend memory continua funcional.

### Fase 0.2.4 - Testes e validacao com PostgreSQL real
Objetivo: provar que constraints, transacoes e concorrencia funcionam fora do backend em memoria.

Escopo tecnico:
1. Rodar `npm.cmd run test`.
2. Rodar `npm.cmd run build`.
3. Rodar `npm.cmd run smoke:api`.
4. Rodar `npm.cmd run test:db` com `DATA_BACKEND=prisma`, `RUN_DB_TESTS=1` e `DATABASE_URL` real.
5. Adicionar testes DB especificos para:
   - pagamento de comissao concorrente;
   - refund concorrente sobre o mesmo item;
   - unique de despesa por comissao;
   - unique de refund por idempotency;
   - persistencia de audit log depois de restart.

Critérios de aceite:
- nenhuma duplicidade financeira com retry ou concorrencia;
- estoque nao fica negativo por refund/venda concorrente;
- pagamento de comissao sempre fecha com despesa financeira unica;
- auditoria persiste apos restart;
- relatorios financeiros batem com ledger operacional.

## Ordem recomendada
1. 0.2.1 primeiro, porque fecha o maior buraco de caixa atual sem introduzir fluxo novo de devolucao.
2. 0.2.2 depois, porque depende da politica financeira e de comissao ficar clara.
3. 0.2.3 em seguida, para persistir eventos ja estabilizados e o novo refund.
4. 0.2.4 como validacao obrigatoria de cada subfase e consolidacao final.

## Fora de escopo nesta etapa
- Usuarios persistentes e senha hash.
- Lote de pagamento de comissao.
- Conciliacao bancaria real.
- Emissao fiscal.
- Automacoes de IA/WhatsApp que executem transacoes.
- Refatoracao ampla de frontend.

## Riscos e mitigacoes
- Risco: duplicar despesa de comissao em retry.
  Mitigacao: idempotencia obrigatoria + unique por origem `COMMISSION`.
- Risco: refund parcial quebrar estoque.
  Mitigacao: validar quantidade devolvida acumulada dentro da transacao.
- Risco: comissao paga e depois venda devolvida.
  Mitigacao: criar ajuste negativo/pendencia vinculada ao refund; nunca apagar pagamento passado.
- Risco: auditoria fora da transacao ficar incompleta.
  Mitigacao: inserir `AuditLog` dentro da transacao ou via outbox transacional.
- Risco: schema com `referenceType` livre continuar fragil.
  Mitigacao: introduzir enums ou campos FK opcionais por origem ao longo das subfases.

## Checklist antes de implementar
- Confirmar politica contabil de refund: `EXPENSE` de estorno versus tipo dedicado de reversao nos relatorios.
- Confirmar se estorno de atendimento pode devolver dinheiro sem reabrir agenda.
- Confirmar comportamento de comissao ja paga em caso de refund.
- Confirmar campos obrigatorios de motivo por acao.
- Confirmar se pagamento de comissao exige `paymentMethod`.

## Conclusao CTO
O core esta forte em idempotencia e transacao para o fluxo feliz. A Fase 0.2 deve agora trocar "operacao que funciona" por "operacao explicavel, reconciliavel e contestavel". O primeiro passo seguro e fazer comissao paga aparecer no financeiro como despesa unica e rastreavel; depois entram refunds; por fim a auditoria persistente fecha a capacidade de prova.
