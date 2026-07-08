# Macro 234 - Release Candidate owner-only

## 1. Objetivo

Consolidar o sistema em um produto simples para a Barbearia Geovane Borges, com Geovane como owner e unico profissional real. A entrega reduz a superficie visivel, padroniza linguagem operacional, organiza acoes por estado e prepara evidencias para conferencia visual curta.

## 2. Escopo

- Uma unidade.
- Owner-only para a operacao real.
- PostgreSQL como fonte oficial.
- Sem SaaS generico, billing, multiunidade avancada, comissoes para Geovane, WhatsApp operacional ou IA nesta macro.

## 3. Modulos visiveis

- Agenda.
- Clientes.
- Financeiro.
- Estoque.
- Configuracoes.
- Servicos.
- Auditoria administrativa.

## 4. Modulos ocultos

Ficam fora da sidebar e do menu mobile: PDV legado, Equipe, Comissoes, Metas, Fidelizacao, Automacoes, Relatorios, WhatsApp e Link Agendamento. O backend e as secoes legadas nao foram apagados; apenas deixaram de poluir a navegacao principal.

## 5. Acoes por estado

- Agendado: principal Confirmar; secundarias Remarcar e Cancelar.
- Confirmado: principal Iniciar atendimento; secundarias Registrar atraso, Remarcar, Cancelar e Marcar falta quando valida.
- Em atendimento: principal Ir para checkout; secundaria Alterar servicos.
- Concluido: principal Ver detalhes.
- Cancelado: principal Ver historico.
- Falta: principal Ver historico.

## 6. Linguagem operacional

Criado `public/modules/operational-language.js` como fonte central para status e acoes visiveis. O chip operacional reutiliza este mapa para evitar expor enums como `IN_SERVICE`, `NO_SHOW`, `WALK_IN` e `APPOINTMENT_BLOCK` como texto de interface.

## 7. Agenda

A Lista, a Semana e a central de agendamentos foram alinhadas para mostrar uma unica acao principal e agrupar excecoes em `Mais opcoes`. Bloqueios continuam visiveis como Horario bloqueado ou Dia bloqueado.

## 8. Checkout

Fluxo preservado. A acao de checkout aparece apenas para atendimento em andamento. Pagamento dividido, dinheiro com troco e venda de produto continuam cobertos pelos testes existentes da macro 233.

## 9. Financeiro

Permanece como modulo principal de gestao. Correcoes administrativas seguem separadas do fluxo comercial normal. Comissao nao foi promovida para navegacao principal.

## 10. Estoque

Promovido para navegacao principal, substituindo o PDV legado como entrada operacional para produtos e estoque.

## 11. Clientes

Permanece na navegacao principal e no menu mobile.

## 12. Configuracoes

Promovido para a navegacao principal. Continua agrupando dados da barbearia, horarios, servicos, usuarios/seguranca e auditoria administrativa conforme estrutura existente.

## 13. Booking publico

Removida dependencia de CDN do `IMask`; o booking ja possui fallback para telefone sem a biblioteca. Multiplo servico, preco/duracao vindos do backend e idempotencia continuam cobertos pelos testes focados.

## 14. Desktop

Validado por testes de DOM/contrato. Conferencia visual humana ainda e necessaria para 1920x900 e 1366x768.

## 15. Mobile

Menu mobile reduzido para Agenda, Clientes e Mais. Conferencia humana ainda deve checar iPhone/Android visualmente.

## 16. Acessibilidade

Acoes secundarias usam `details/summary` com rotulo `Mais opcoes` e `aria-label` contextual. Mantidos botao principal textual, labels existentes e fechamento de camadas validado por testes anteriores.

## 17. Modularizacao

Sem reescrita. Foi extraido apenas o mapa de linguagem operacional. As regras de acao foram ajustadas nos pontos ja existentes: `app.js`, `modules/agenda.js` e `modules/agendamentos.js`.

## 18. Dependencias externas

Removidas fontes Google do app principal, booking e login. Removido CDN `unpkg` do booking. Permanece dependencia Firebase versionada no login (`gstatic/firebasejs/10.14.1`) por ser parte do fluxo de autenticacao atual.

## 19. KPIs

Fontes atuais: `/dashboard`, `/reports/management/*`, `/financial/reports`, agenda, checkout, estoque e auditoria.

- Total de agendamentos: contagem de appointments no periodo.
- Atendimentos concluidos: status Concluido no periodo.
- Cancelamentos: status Cancelado no periodo.
- Faltas: status Falta no periodo.
- Ocupacao: minutos ocupados / minutos disponiveis do expediente.
- Horarios mais procurados: agrupamento por faixa de hora.
- Servicos mais vendidos: agrupamento por service items/servico snapshot.
- Faturamento: pagamentos confirmados menos correcoes/reversoes.
- Ticket medio: faturamento / atendimentos pagos.
- Vendas de produtos: product sales confirmadas.
- Formas de pagamento: agrupamento dos pagamentos confirmados.
- Clientes novos/recorrentes: primeira visita vs visitas repetidas no periodo.
- Agendamentos publicos: origem publica quando disponivel.
- Walk-ins: origem Atendimento sem agendamento.
- Bloqueios: appointment blocks ativos/criados.
- Encaixes: flag de encaixe.
- Tempo entre agendamento e atendimento: startsAt - createdAt.
- Divergencia de estoque: movimentos de inventario e ajuste.
- Fechamento diario: daily closing.
- Correcoes administrativas: eventos de correcao/reversao.
- Horarios vagos: slots disponiveis sem agendamento/bloqueio.
- Ocupacao por faixa: ocupacao agrupada por hora.

Linha de base manual com Geovane: tempo organizando Agenda, anotacoes manuais, dificuldade para localizar clientes, percepcao de controle financeiro, percepcao de estoque, satisfacao geral, facilidade de uso, tempo registrando walk-ins, marcacoes boca a boca e horarios vagos percebidos.

## 20. Jornada ponta a ponta

Cobertura automatica existente valida booking, confirmacao, atraso, atendimento, alteracao de servicos, checkout, pagamento dividido, troco, venda de produto, estoque, financeiro, fechamento, auditoria, walk-in, bloqueios, encaixe, cancelamento, falta, remarcacao, correcao administrativa e inventario. A jornada local completa ainda deve ser repetida visualmente no servidor final desta macro.

## 21. Evidencias automaticas

- Testes focados executados: 84 passed.
- Cobrindo menu, acoes por estado, linguagem, agenda, booking publico, multiplo servico e checkout.

## 22. Itens para conferencia humana

1. Sidebar.
2. Agenda.
3. Checkout.
4. Financeiro.
5. Estoque.
6. Booking publico.
7. Mobile.

## 23. Riscos residuais

- Login ainda depende de Firebase externo versionado.
- Validacao visual humana ainda nao foi realizada.
- O PDV legado existe no DOM/codigo, mas nao fica na navegacao principal.

## 24. Itens fora do escopo

SaaS generico, multiunidade avancada, billing, WhatsApp operacional, IA, fidelidade avancada, pacotes, assinaturas, automacoes complexas e comissao para Geovane.

## 25. Roteiro visual curto

Abrir o servidor local, entrar como owner, conferir: sidebar limpa; Agenda Semana/Lista com uma acao principal; checkout com total/pagamentos/troco; Financeiro; Estoque; booking publico com servico unico e Corte + Barba; mobile entre 390 e 430px.

## 26. Decisao final

RELEASE CANDIDATE DE CODIGO APROVADO, condicionado aos bloqueios do piloto registrados em `.planning/234_FECHAMENTO_RELEASE_CANDIDATE.md`.

PILOTO BLOQUEADO:
- schema do banco principal desatualizado;
- dados de teste pendentes de limpeza controlada.

## 27. Macro 234 - redesign premium

Diagnostico visual antes da implementacao:

- Tokens e paleta estavam dispersos entre `layout.css`, `login.html` e `booking.html`.
- O painel interno podia cair em light mode, contrariando a direcao premium executiva.
- Laranja e verdes antigos criavam leitura generica e pouco sofisticada.
- Havia muitas superficies com aparencia de card administrativo pronto.
- Tipografia, raio, foco, borda e estados de botao variavam por modulo.
- Booking publico usava dark/light por preferencia do sistema, com risco de ficar pesado para cliente externo.
- Login estava isolado do restante da identidade.

Tres direcoes consideradas:

- Atelier grafite editorial: painel escuro fosco, linhas finas, bronze raro, informacao com mais hierarquia.
- Studio claro minimalista: superficies claras em todo o produto, contraste suave e foco em atendimento.
- Cockpit operacional escuro: alta densidade, comandos compactos e visual mais tecnico.

Direcao escolhida: Atelier grafite editorial para painel interno e login, com booking publico em light premium minimalista.

Motivo da escolha:

- Combina barbearia contemporanea com software maduro sem recorrer a cliches visuais.
- Mantem Agenda como cockpit rapido, mas com acabamento mais autoral.
- Preserva clareza para o cliente externo no booking publico.
- Evita parecer SaaS generico ou dashboard de template.

Assinatura visual adotada:

- Linha vertical bronze como marcador editorial em marca, headers e estados importantes.
- Bronze usado como acento raro, nao como cor dominante.
- Superficies grafite foscas com bordas finas e sombras reduzidas.
- Numeros e valores com peso proprio e tipografia limpa.
- Booking publico claro, quente e minimalista, compartilhando acento, raio e ritmo do painel.

Riscos evitados:

- Nao foram alteradas regras de negocio, API, Prisma, banco, autenticacao ou RBAC.
- Nao houve reescrita de frontend nem migracao de framework.
- Mudancas locais anteriores da Macro 234 foram preservadas.
- Nao houve commit, push, acesso a VPS, producao ou `.env`.
