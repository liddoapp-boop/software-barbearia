# Fase 231 - Politicas operacionais, excecoes e preparacao para a Fase 232

## 1. Objetivo

Consolidar as decisoes operacionais aprovadas por Geovane para cancelamentos, faltas, atrasos, indisponibilidade, encaixes, atendimento avulso, alteracoes durante atendimento, pagamentos, correcoes financeiras, estornos e produtos.

Esta fase e somente analitica e documental. Nao altera codigo, schema, migrations, banco, seeds, fixtures, frontend, backend ou testes.

## 2. Escopo real da operacao

- Geovane Borges e o owner e unico profissional real.
- Nao existe recepcao real.
- Nao existe segundo profissional real.
- Nao existe comissao operacional para Geovane.
- Usuarios, profissionais extras e perfis como recepcao/profissional podem existir em testes isolados de RBAC, mas nao devem aparecer como opcao operacional real.
- PostgreSQL permanece como fonte de verdade.
- IA, WhatsApp e Google Calendar, quando usados no futuro, devem operar por APIs do sistema, sem acesso direto ao banco.

## 3. Estado atual do sistema

### Modulos existentes

- Booking publico multi-servico.
- Agenda interna e agenda por dia/faixa.
- Criacao, atualizacao, remarcacao e status de appointments.
- Checkout unificado de atendimento com servicos e produtos.
- Vendas avulsas de produtos.
- Financeiro, estoque, clientes, dashboard, relatorios gerenciais e auditoria.
- Idempotencia persistente no PostgreSQL para operacoes criticas.

### Rotas e servicos principais

- `POST /public/booking`: cria agendamento publico, aceita `serviceId` legado ou `serviceIds`, bloqueia `professionalId`, resolve Geovane automaticamente conforme compatibilidade/disponibilidade, usa idempotencia opcional se a chave for enviada.
- `POST /appointments`: cria appointment interno.
- `PATCH /appointments/:id`: atualiza dados, horario, profissional, servicos, notas e encaixe.
- `PATCH /appointments/:id/reschedule`: remarca data/hora mantendo os servicos atuais.
- `PATCH /appointments/:id/status`: altera status pela maquina de estados.
- `POST /appointments/:id/checkout`: finaliza atendimento, gera financeiro, baixa estoque de produtos/ficha tecnica, registra comissoes quando houver regra e exige idempotency key.
- `POST /appointments/:id/refund`: existe tecnicamente, mas nao deve aparecer como estorno comercial operacional para Geovane.
- `POST /sales/products`: registra venda de produto, exige idempotency key.
- `POST /sales/products/:id/refund`: existe tecnicamente, mas nao deve aparecer como devolucao operacional para Geovane sem decisao futura.
- `GET /reports/management/*`, `/dashboard`, `/financial/*`, `/stock/overview`, `/audit/events`: consolidam efeitos persistidos.

### Autorizacao atual

- Appointments: owner, recepcao e profissional em rotas gerais; checkout apenas owner e recepcao.
- Financeiro, relatorios gerenciais sensiveis, auditoria, usuarios e configuracoes: owner.
- Vendas e devolucoes de produto: owner e recepcao.
- Public booking: publico, mas sem escolha de profissional no payload.

Para a operacao real, a interface deve expor somente Geovane/owner.

### Protecoes atuais relevantes

- Conflito de agenda usa statuses ativos `SCHEDULED`, `CONFIRMED`, `IN_SERVICE`.
- `CANCELLED`, `NO_SHOW` e `COMPLETED` liberam conflito de horario.
- Criacao e remarcacao validam passado, antecedencia minima, expediente, intervalo, dia fechado, buffer e overbooking conforme configuracao.
- PostgreSQL usa transacoes, isolamento serializable e lock por profissional/cliente em criacao/remarcacao.
- Checkout usa idempotencia persistente com rejeicao de payload divergente.
- Checkout concorrente nao duplica financeiro/estoque/comissao; uma tentativa vence e outra falha/replay conforme chave.
- Refunds existentes usam lancamento reverso e auditoria, mas devem ser tratados como infraestrutura tecnica, nao como operacao comercial liberada.
- Auditoria e append-only por API; patch/delete de auditoria nao existem.

### Ausencias importantes

- Status change nao exige idempotency key.
- Remarcacao nao exige idempotency key.
- Nao existe bloqueio operacional explicito para impedir cancelamento de appointment `IN_SERVICE`.
- Nao existe recurso dedicado para bloqueio de horario ou dia inteiro.
- Nao ha remarcacao publica pelo cliente.
- Nao ha medicao de tempo real de atendimento versus tempo previsto.
- Nao ha historico rico before/after em `AppointmentHistory`; a auditoria guarda after e alguns metadados, mas nem sempre before completo.
- Nao ha pagamento dividido, controle de troco ou correcao administrativa auditada com lancamento inverso dedicada ao erro de pagamento.

## Politicas oficiais aprovadas por Geovane

### Cancelamento

- Cancelamento normal e permitido ate 30 minutos antes do horario.
- Cancelamento no mesmo dia libera o horario imediatamente.
- Situacoes especiais podem ser decididas manualmente por Geovane.
- Motivo obrigatorio ainda nao foi solicitado.
- O sistema nao deve criar taxa, punicao automatica ou bloqueio automatico do cliente por cancelamento.

### Cliente sem agendamento

- Cliente pode chegar sem agendamento.
- Geovane deve conseguir colocar o cliente diretamente em `IN_SERVICE`.
- Telefone e obrigatorio.
- O fluxo deve ser simples e rapido.
- O sistema deve considerar que muitos clientes mais velhos nao usam aplicativo e pagam presencialmente.

### Falta e atraso

- Apos 15 minutos de atraso, o cliente pode ser considerado falta.
- Mesmo apos o atraso, Geovane pode tentar encaixar o cliente para corte.
- Nao deve haver punicao automatica.
- Nao deve haver bloqueio automatico do cliente.
- Geovane decide manualmente cada caso.

### Indisponibilidade do Geovane

- Se Geovane ficar doente ou precisar fechar, a preferencia operacional e remarcar os clientes.
- O sistema deve permitir bloquear um horario especifico.
- O sistema deve permitir bloquear o dia inteiro.

### Encaixe

- Encaixes sao permitidos.
- Se houver risco de atrasar o proximo cliente, o sistema deve apenas avisar.
- Geovane decide se prossegue.
- O sistema nao deve bloquear automaticamente o encaixe apenas por risco operacional avisado.

### Alteracao durante atendimento

Depois de `IN_SERVICE`, Geovane pode:

- adicionar servico;
- remover servico;
- trocar servico.

O sistema deve recalcular automaticamente:

- servicos;
- valor;
- duracao;
- `endsAt`;
- impacto no checkout.

Depois do checkout, alteracoes diretas devem ser proibidas.

### Pagamentos

Formas aceitas:

- dinheiro;
- PIX;
- cartao de debito;
- cartao de credito.

Politica aprovada:

- Pagamento dividido entre formas deve existir.
- Quitacao total e obrigatoria no momento do checkout.
- Dinheiro deve ter controle de troco.
- Nao existe fiado.
- Nao existe saldo pendente.
- O sistema nao pode concluir checkout com valor menor que o total.
- "Pagamento parcial" significa apenas dividir entre formas e quitar tudo na hora.

### Falha de pagamento

Se PIX ou cartao falhar:

- o checkout nao deve ser concluido;
- Geovane escolhe outra forma;
- o atendimento so pode ser concluido quando o total estiver integralmente pago.

### Correcao de pagamento errado ou duplicado

Esta regra trata erro administrativo, nao estorno comercial ao cliente.

- Nunca apagar o lancamento original.
- Somente owner pode corrigir.
- Exigir motivo.
- Criar lancamento inverso auditado.
- Vincular a correcao ao lancamento original.
- Registrar before/after, ator, data, requestId e idempotencyKey.
- Impedir correcao duplicada.
- Permitir registrar o pagamento correto depois da correcao.

### Estorno de atendimento

- Geovane nao aceita estorno total.
- Geovane nao aceita estorno parcial.
- O sistema nao deve oferecer estorno comercial normal no fluxo operacional.
- Correcao de erro administrativo continua permitida conforme regra de correcao de pagamento.

### Produtos

- Geovane nao aceita devolucao de produto.
- Produto vendido nao volta ao estoque por devolucao.
- Nao existe devolucao parcial.
- O sistema nao deve criar fluxo operacional de devolucao para uso real.
- A infraestrutura tecnica existente pode permanecer para compatibilidade e testes, mas nao deve aparecer como operacao disponivel para Geovane sem futura decisao.

## Protecoes tecnicas obrigatorias

### P0

- Bloquear alteracao de appointment apos checkout.
- Bloquear remarcacao de estados terminais.
- Exigir idempotencia em mudancas de status.
- Garantir correcao auditada de pagamento.
- Impedir checkout com valor pendente.
- Impedir duplicidade financeira.

### P1

- Cancelamento com liberacao imediata do slot.
- `NO_SHOW` apos 15 minutos.
- Atendimento avulso direto em `IN_SERVICE`.
- Bloqueio por horario e por dia.
- Remarcacao por indisponibilidade do Geovane.
- Encaixe com aviso.
- Alteracao de servicos durante `IN_SERVICE`.

### P2

- Indicadores de faltas e atrasos.
- Historico de encaixes.
- Metricas de tempo real versus previsto.
- Melhorias de UX e relatorios.

### Regras transversais

- Operacoes que alteram status, agenda, checkout, financeiro, estoque ou auditoria devem ter idempotencia quando houver risco de repeticao por falha de rede ou clique duplo.
- Estados terminais (`COMPLETED`, `CANCELLED`, `NO_SHOW`) nao podem ser reabertos por remarcacao ou atualizacao comum.
- Checkout deve ser atomico: ou registra pagamento integral e efeitos derivados, ou nao conclui.
- Lancamentos financeiros originais sao append-only para fins de auditoria.
- Correcoes financeiras devem ser feitas por lancamento inverso vinculado, nunca por edicao destrutiva.
- A interface operacional real deve expor apenas acoes compativeis com as decisoes comerciais de Geovane.

## Decisoes comerciais versus protecoes tecnicas

### Decisoes comerciais de Geovane

- Cancelamento normal ate 30 minutos antes.
- Cancelamento no mesmo dia libera horario.
- Sem punicao automatica por falta, atraso ou cancelamento.
- Cliente avulso pode entrar direto em atendimento.
- Geovane decide manualmente casos especiais.
- Indisponibilidade deve priorizar remarcacao.
- Encaixe e permitido com aviso quando houver risco.
- Servicos podem mudar durante `IN_SERVICE`.
- Checkout exige quitacao integral.
- Pagamento dividido e permitido apenas como quitacao total na hora.
- Fiado, saldo pendente, estorno comercial e devolucao de produto nao sao aceitos.

### Protecoes tecnicas obrigatorias

- Idempotencia em transicoes sensiveis.
- Bloqueio de alteracao apos checkout.
- Bloqueio de remarcacao de status terminal.
- Correcao financeira auditada, reversa e vinculada ao lancamento original.
- Prevencao de duplicidade financeira.
- Auditoria com before/after, ator, data, requestId e idempotencyKey onde houver correcao ou impacto operacional relevante.

### Comportamentos ainda manuais

- Avaliar situacoes especiais de cancelamento.
- Decidir se atende cliente atrasado apos 15 minutos.
- Decidir se encaixa cliente mesmo com risco de atraso do proximo.
- Remarcar clientes quando Geovane ficar indisponivel.
- Escolher outra forma de pagamento quando PIX ou cartao falhar.
- Registrar pagamento correto apos uma correcao administrativa.

## Escopo aprovado para a Fase 232

A proxima fase deve implementar, em um macrobloco, as politicas operacionais de agenda e estados:

- Maquina de estados endurecida.
- Idempotencia de transicoes.
- Cancelamento.
- Falta (`NO_SHOW`).
- Atraso.
- Bloqueio por horario.
- Bloqueio por dia.
- Indisponibilidade do Geovane.
- Atendimento avulso.
- Encaixe com aviso.
- Remarcacao interna segura.
- Proibicao de alteracoes apos checkout.

### Nao implementar na Fase 232

- Pagamento dividido.
- Troco.
- Correcao financeira.
- Alteracao de servicos durante atendimento.
- IA.
- WhatsApp.
- Google Calendar.

Esses itens ficam para blocos seguintes.

## Funcionalidades posteriores

### Bloco financeiro posterior

- Pagamento dividido entre formas.
- Controle de troco.
- Falha de PIX/cartao sem conclusao do checkout.
- Correcao administrativa auditada de pagamento errado ou duplicado.
- Prevencao de correcao duplicada.
- Registro do pagamento correto apos correcao.

### Bloco de atendimento posterior

- Alteracao de servicos durante `IN_SERVICE`.
- Recalculo automatico de servicos, valor, duracao, `endsAt` e checkout.
- Aviso de impacto no proximo cliente quando a duracao mudar.
- Historico before/after especifico de servicos, valor e duracao.

### Bloco de indicadores e UX posterior

- Indicadores de faltas e atrasos.
- Historico de encaixes.
- Metricas de tempo real versus previsto.
- Relatorios operacionais refinados.
- Melhorias de UX para fluxos rapidos de cliente avulso e pagamento presencial.

### Bloco de integracoes futuras

- IA.
- WhatsApp.
- Google Calendar.

IA, WhatsApp e Google Calendar devem usar APIs do sistema, com confirmacao explicita para escrita, idempotencia e auditoria. PostgreSQL continua sendo a fonte de verdade.

## Pendencias reais apos as respostas de Geovane

- Definir se motivo sera obrigatorio em cancelamento, falta, bloqueio e remarcacao.
- Definir se havera remarcacao publica pelo cliente no futuro.
- Definir se atraso recorrente deve aparecer como alerta visual no cadastro do cliente.
- Definir se a implementacao de bloqueio sera uma entidade dedicada ou reaproveitara `Appointment` com status `BLOCKED`.
- Definir padroes de relatorio para receita perdida, faltas, atrasos, encaixes e tempo real versus previsto.
- Definir quando IA, WhatsApp e Google Calendar entram no roadmap de implementacao.

## Consistencia entre modulos

- Cancelamento nao gera receita.
- Falta nao vira atendimento concluido.
- `CANCELLED`, `NO_SHOW` e `COMPLETED` continuam liberando conflito de horario.
- Remarcacao deve liberar slot antigo e ocupar novo slot somente quando o appointment nao estiver em status terminal.
- Atendimento avulso deve criar registro rastreavel, com telefone obrigatorio, e iniciar em `IN_SERVICE`.
- Encaixe deve aparecer na agenda e em historico/relatorios quando esses relatarios forem implementados.
- Checkout so pode concluir com pagamento integral.
- Estorno comercial e devolucao operacional nao devem aparecer para Geovane.
- Correcoes administrativas devem preservar rastreabilidade financeira e auditoria.

## Decisao da Fase 231

FASE 231 CONCLUIDA E PRONTA PARA PUBLICACAO
