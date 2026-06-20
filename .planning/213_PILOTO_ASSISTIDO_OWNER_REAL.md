# Fase 212.2 — Piloto assistido owner-only com usuário real

Data: 2026-06-20

## Decisão

PILOTO CONTROLADO DE AGENDA EXECUTADO COM RESSALVA.

O agendamento controlado foi criado pelo fluxo publico real, apareceu uma unica vez na Agenda owner, foi validado em detalhe e foi cancelado com seguranca. O slot voltou a ficar disponivel e nao houve checkout, pagamento, venda, devolucao ou lancamento financeiro relacionado ao teste.

Ressalva bloqueante para avancar a checkout/piloto real: o profissional retornado no detalhe foi `Rafael Andrade`, enquanto o plano aprovado esperava `Geovane Borges`. Por prudencia, o fluxo foi interrompido antes de qualquer checkout ou impacto financeiro.

Confirmacao humana recebida para esta escrita controlada:

- criar e cancelar agendamento de teste para `CLIENTE TESTE CONTROLADO - FASE 212.2`;
- usar telefone `00000021222`;
- usar servico `Barba Terapia` (`svc-barba`);
- usar horario `2026-06-22T12:00:00.000Z`;
- nao executar checkout, pagamento, venda ou devolucao.

## Ambiente e baseline

- Ambiente: producao em `https://barbearia.76-13-161-250.nip.io`.
- App: `software-barbearia`.
- Branch: `main`.
- Estado git: `main...origin/main`.
- Arvore de trabalho antes da documentacao: limpa.
- Commit atual: `42848a7 wip: salvar handoff para retomada`.
- Health publico: `{"ok":true,"authEnforced":true}`.
- PM2: `software-barbearia` online, uptime aproximado de 3h no pre-check, 3 restarts acumulados.
- Nginx/PostgreSQL: considerados operacionais pelo ponto oficial recebido; nao houve alteracao de infraestrutura nesta fase.
- Usuario/perfil previsto para o piloto: owner real, sem registrar credenciais neste documento.

## Leituras realizadas

- `.planning/.continue-here.md`.
- `.planning/HANDOFF.json`.
- `.planning/212_PILOTO_SINTETICO_AGENDAMENTO.md`.
- `.planning/211_VALIDACAO_FLUXO_OPERACIONAL.md`, pois o handoff a lista como leitura obrigatoria para retomada.

## Pre-check tecnico readonly

Comandos executados:

- `git status --short`: sem saida, arvore limpa antes desta documentacao.
- `git status -sb`: `## main...origin/main`.
- `git log --oneline -5`:
  - `42848a7 wip: salvar handoff para retomada`
  - `1cc25a1 docs: registrar piloto sintetico de agendamento`
  - `a08fd36 test: validar fluxo operacional principal`
  - `385845a docs: registrar deploy da blindagem da agenda`
  - `db9b10d fix: blindar remarcacao concorrente na agenda`
- `curl -fsS https://barbearia.76-13-161-250.nip.io/health`: `{"ok":true,"authEnforced":true}`.
- `pm2 status`: processo `software-barbearia` online.
- `pm2 logs software-barbearia --lines 120 --nostream`: sem crash, sem loop de restart, sem 500 critico recente e sem erro Prisma critico observado.

Observacoes dos logs:

- Logs recentes incluem eventos esperados da Fase 212.1, incluindo agendamento sintetico e cancelamento controlado do ID `c9580676-c068-4729-b57d-0177794ba2f0`.
- Foi observado `GET /dashboard` com 401 por ausencia de token; comportamento esperado para rota protegida.
- Requisicoes readonly autenticadas recentes para Agenda, Clientes, Catalogo, Financeiro, Servicos, Auditoria, Configuracoes e Relatorios retornaram 200.
- Nao foram transcritos tokens, senhas, `DATABASE_URL`, hashes, chaves privadas ou credenciais.

## Contexto herdado

- Fase 211 decidiu `PRONTO PARA PILOTO OPERACIONAL`.
- Fase 212.1 decidiu `PILOTO SINTETICO APROVADO`.
- Agendamento sintetico criado e cancelado na Fase 212.1: `c9580676-c068-4729-b57d-0177794ba2f0`.
- O piloto sintetico nao executou checkout, venda, devolucao ou financeiro.
- Ressalva conhecida: criacao publica ainda nao registra auditoria propria `APPOINTMENT_CREATED`.
- Cliente sintetico permanece como dado de teste rastreavel.

## Roteiro assistido proposto

1. Owner acessa o sistema em producao.
2. Owner abre a Agenda.
3. Owner localiza proximos atendimentos.
4. Owner escolhe um atendimento real existente ou solicita criacao/uso de atendimento controlado, somente com autorizacao humana explicita.
5. Owner abre os detalhes do atendimento.
6. Owner valida cliente, servico, profissional, horario e status.
7. Owner avalia clareza da tela, densidade visual, botoes, termos e fluxo esperado.
8. Se houver autorizacao explicita, acompanhar avanco operacional controlado:
   - iniciar atendimento, se a acao existir;
   - concluir atendimento;
   - abrir checkout;
   - registrar pagamento;
   - validar financeiro.
9. Se nao houver autorizacao, manter apenas leitura e observacao.
10. Validar Auditoria apos as acoes permitidas.
11. Validar logs apos as acoes permitidas.
12. Registrar achados por severidade.

## Proposta de escopo real antes de qualquer escrita

O que sera validado:

- Ergonomia real da Agenda para o owner.
- Clareza do detalhe do atendimento.
- Entendimento do fluxo de atendimento e checkout.
- Rastreabilidade em Auditoria.
- Criacao de impacto financeiro somente quando uma acao autorizada justificar.
- Ausencia de erro critico em producao.

Acoes readonly:

- Acessar telas como owner.
- Consultar Agenda.
- Consultar detalhe de atendimento.
- Consultar Financeiro.
- Consultar Auditoria.
- Consultar logs recentes.
- Registrar percepcoes do operador humano.

Acoes que alteram dados e exigem confirmacao explicita:

- Criar agendamento controlado.
- Usar cliente real em atendimento.
- Iniciar atendimento.
- Concluir atendimento.
- Fazer checkout.
- Registrar pagamento.
- Cancelar ou remarcar atendimento.
- Criar venda.
- Criar devolucao.
- Alterar status.

Cliente/agendamento a usar:

- Preferencia operacional: atendimento real escolhido pelo owner durante o piloto, somente se o owner confirmar que pode ser usado.
- Alternativa controlada: criar/usar atendimento de teste identificado como teste, somente com autorizacao explicita e com escopo de reversao definido antes da criacao.
- Nao inventar cliente real e nao usar cliente real sem confirmacao.

Reversao ou marcacao como teste:

- Para dado controlado, registrar nome/telefone claramente identificados como teste.
- Se o roteiro incluir cancelamento/remarcacao para limpeza, essa acao tambem exige confirmacao explicita.
- Se houver checkout real, nao tratar como reversivel automaticamente; validar antes se a operacao e uma venda real aceita pelo negocio.

Riscos:

- Gerar receita/despesa financeira indevida.
- Gerar comissao indevida.
- Alterar status de atendimento real por engano.
- Duplicar acao operacional se o owner repetir clique.
- Registrar auditoria/financeiro com entidade errada.
- Confundir dado real com dado de teste.

Criterios de aprovacao:

- Owner consegue localizar e entender os atendimentos na Agenda sem orientacao excessiva.
- Detalhe exibe cliente, servico, profissional, horario e status corretamente.
- Checkout, se autorizado, gera financeiro correto e sem duplicidade.
- Auditoria, se houver escrita autenticada, registra ator owner, entidade, rota/metodo e acao coerentes.
- Logs pos-acao nao mostram 500 critico, crash, loop ou erro Prisma critico.
- Nenhum P0/P1 fica aberto.

## Mini-plano aprovado

- Cliente: `CLIENTE TESTE CONTROLADO - FASE 212.2`.
- Telefone: `00000021222`.
- Servico: `Barba Terapia` (`svc-barba`), valor `55`, duracao `35 min`.
- Profissional esperado pelo plano: `Geovane Borges`.
- Horario: `2026-06-22 09:00` horario local, enviado como `2026-06-22T12:00:00.000Z`.
- Acoes autorizadas: criar agendamento publico, autenticar owner com `SMOKE_*`, validar Agenda, validar detalhe, validar ausencia de financeiro, cancelar ao final, validar auditoria do cancelamento e logs PM2.
- Acoes nao autorizadas: checkout, pagamento, venda, devolucao, atendimento real, cliente real, migration, seed, deploy, restart PM2, commit e push.

## Execucao nesta etapa

Acoes readonly executadas:

- Pre-check de git, health, PM2 e logs.
- Leitura dos documentos de retomada e fases anteriores.
- Preparacao deste roteiro e escopo assistido.
- Consulta publica de slots antes da criacao.
- Consulta autenticada de Agenda, detalhe, Financeiro, Auditoria e logs apos a escrita controlada.

Acoes de escrita executadas:

- Criacao publica do agendamento controlado de teste.
- Cancelamento autenticado do mesmo agendamento com motivo `Cancelamento do piloto controlado 212.2`.
- Atualizacao deste documento em `.planning/213_PILOTO_ASSISTIDO_OWNER_REAL.md`.

Acoes de negocio executadas:

- Criacao de agendamento controlado de teste.
- Cancelamento do agendamento controlado de teste.
- Nao houve checkout.
- Nao houve pagamento.
- Nao houve venda.
- Nao houve devolucao.
- Nao houve atendimento real.

IDs envolvidos:

- `c9580676-c068-4729-b57d-0177794ba2f0`: referencia historica da Fase 212.1, nao reutilizada nesta etapa.
- `d3e8e8db-0e53-4281-9e1a-162a0f2b62a2`: agendamento controlado criado e cancelado nesta fase.
- `a7e01681-1701-4485-8965-65c9e1271689`: evento de auditoria do cancelamento.
- Correlation id de criacao/validacao inicial: `piloto-controlado-212-2-ca88caad-4864-4e1f-a900-e2daa7240eef`.
- Correlation id de cancelamento/validacao final: `piloto-controlado-212-2-cancel-cb0ed9de-2890-40ed-bff5-30714b1c3ea9`.

## Resultados por area

Agenda:

- Slot `2026-06-22 09:00` estava disponivel antes da criacao.
- `POST /public/booking` retornou 201.
- Agendamento apareceu uma unica vez na Agenda owner.
- Agenda exibiu cliente `CLIENTE TESTE CONTROLADO - FASE 212.2`.
- Agenda exibiu servico `Barba Terapia`.
- Agenda exibiu status inicial `SCHEDULED`.
- Agenda exibiu horario `2026-06-22T12:00:00.000Z`.
- Apos cancelamento, detalhe confirmou status `CANCELLED`.
- Slot `2026-06-22 09:00` voltou a ficar disponivel.

Detalhe do atendimento:

- `GET /appointments/d3e8e8db-0e53-4281-9e1a-162a0f2b62a2` retornou 200.
- Cliente exibido: `CLIENTE TESTE CONTROLADO - FASE 212.2`.
- Servico exibido: `Barba Terapia`.
- Status inicial exibido: `SCHEDULED`.
- Horario exibido: `2026-06-22T12:00:00.000Z`.
- Profissional exibido: `Rafael Andrade`.
- Profissional esperado no plano: `Geovane Borges`.
- Resultado: detalhe valido exceto pela divergencia de profissional.

Checkout:

- Nao executado nesta etapa.
- Bloqueado por prudencia apos divergencia de profissional.
- Nenhum pagamento foi registrado.

Financeiro:

- `GET /financial/transactions` para `2026-06-22` retornou 200.
- Nenhum lancamento financeiro relacionado ao agendamento, cliente ou telefone de teste foi encontrado antes/depois do cancelamento.
- Nao houve receita, despesa, comissao ou pagamento relacionado ao teste.

Auditoria:

- Criacao publica segue sem auditoria propria `APPOINTMENT_CREATED`, conforme ressalva ja conhecida.
- Cancelamento autenticado registrou `APPOINTMENT_STATUS_UPDATED`.
- Evento encontrado: `a7e01681-1701-4485-8965-65c9e1271689`.
- Entidade: `appointment`.
- Entity ID: `d3e8e8db-0e53-4281-9e1a-162a0f2b62a2`.
- Rota/metodo: `PATCH /appointments/:id/status`.
- Ator: owner autenticado; credenciais e token nao foram registrados.

Logs:

- `pm2 logs software-barbearia --lines 160 --nostream` apos o piloto nao mostrou crash, loop, 500 critico ou erro Prisma critico.
- Logs confirmaram `POST /public/booking` 201, consultas owner 200, `PATCH /appointments/:id/status` 200, auditoria gravada e consultas de Financeiro/Auditoria 200.

## Achados

P0: nenhum.

P1:

- Divergencia de profissional no agendamento controlado: esperado `Geovane Borges`, mas o detalhe retornou `Rafael Andrade`. Isso bloqueia avanco para checkout/piloto real ate esclarecer se o plano estava desatualizado ou se a atribuicao automatica do fluxo publico esta escolhendo profissional inesperado.

P2:

- Checkout nao foi exercitado nesta fase porque a divergencia de profissional foi detectada antes de qualquer impacto financeiro.
- Cliente de teste pode permanecer como dado rastreavel pelo nome `CLIENTE TESTE CONTROLADO - FASE 212.2` e telefone `00000021222`.

P3:

- Mantida ressalva da Fase 212.1: criacao publica ainda nao registra auditoria propria `APPOINTMENT_CREATED`.

## Proximo passo

Investigar a divergencia de profissional para `svc-barba` antes de qualquer checkout ou piloto com atendimento real. Somente apos esclarecer/corrigir a atribuicao do profissional, pedir nova confirmacao explicita para uma nova escrita controlada que avance ate checkout.
