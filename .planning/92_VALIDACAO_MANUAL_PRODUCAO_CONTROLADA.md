# 92 - Validacao manual no navegador e producao controlada

Data: 2026-05-04
Fase: 0.7
Status: CHECKLIST CRIADO

## Objetivo
Validar o Software Barbearia como uma operacao real antes de producao controlada.

Esta fase nao cria modulo grande nem muda regra financeira ja validada. O foco e:
- testar fluxos criticos no navegador;
- encontrar quebras visuais/operacionais pequenas;
- confirmar permissoes por perfil;
- preparar checklist de ambiente, banco, seguranca, operacao e observabilidade.

## Premissas para a validacao manual
- API rodando com `AUTH_ENFORCED=true`.
- Preferencialmente validar tambem com `DATA_BACKEND=prisma` e PostgreSQL real.
- Usar unidade ativa `unit-01` como baseline da SPA atual.
- Usar dados controlados de teste, sem executar seed destrutivo em base real.
- Registrar evidencia minima: perfil usado, horario do teste, acao, resultado esperado, resultado obtido e screenshot quando houver falha visual.

## A) Autenticacao e sessao
- [ ] Login como owner com usuario persistente ou fallback controlado.
- [ ] Login como recepcao.
- [ ] Login como profissional.
- [ ] Validar que token/sessao permite carregar `/auth/me`.
- [ ] Validar expiracao de sessao quando aplicavel; se expirar, a UI deve orientar recarregar/autenticar novamente.
- [ ] Validar que usuario inativo nao entra.
- [ ] Validar `activeUnitId=unit-01`.
- [ ] Tentar login com `activeUnitId` sem acesso e confirmar bloqueio.
- [ ] Confirmar que troca visual de perfil no frontend nao substitui validacao real do token.

## B) Permissoes visuais e backend
- [ ] Owner ve Agenda, PDV, Clientes, Servicos, Estoque, Dashboard, Financeiro, Profissionais, Comissoes, Auditoria e Configuracoes.
- [ ] Recepcao nao ve Auditoria.
- [ ] Recepcao nao ve Financeiro global.
- [ ] Recepcao nao ve Comissoes.
- [ ] Recepcao nao ve Configuracoes.
- [ ] Profissional ve apenas Agenda e Dashboard no menu principal.
- [ ] Profissional nao ve Financeiro, Auditoria, Comissoes, Configuracoes, Estoque e PDV.
- [ ] Acessar `GET /audit/events?unitId=unit-01` como recepcao e confirmar `403`.
- [ ] Acessar `GET /financial/transactions?...` como profissional e confirmar `403`.
- [ ] Tentar pagar comissao como recepcao e confirmar `403`.
- [ ] Tentar acessar unidade diferente do token por query/body e confirmar `403`.
- [ ] Validar mensagem amigavel de permissao na UI: "Voce nao tem permissao para executar esta acao."

## C) Agenda
- [ ] Criar agendamento com cliente, profissional, servico e horario valido.
- [ ] Criar agendamento conflitante para mesmo profissional e horario e confirmar bloqueio.
- [ ] Criar agendamento no mesmo horario para outro profissional, se aplicavel, e confirmar permissao.
- [ ] Confirmar agendamento.
- [ ] Iniciar atendimento.
- [ ] Finalizar atendimento via checkout.
- [ ] Checkout deve exigir metodo de pagamento.
- [ ] Checkout deve validar total esperado quando informado.
- [ ] Checkout com produto deve validar estoque.
- [ ] Verificar se financeiro recebeu receita de servico.
- [ ] Verificar se comissao foi gerada quando regra aplicavel.
- [ ] Verificar se auditoria registrou checkout com actor, route, requestId e idempotencyKey.
- [ ] Estornar atendimento concluido.
- [ ] Tentar estornar atendimento nao concluido e confirmar erro amigavel.

## D) PDV e produtos
- [ ] Adicionar produto ao carrinho.
- [ ] Alterar quantidade no carrinho.
- [ ] Remover item do carrinho.
- [ ] Vender produto com estoque suficiente.
- [ ] Tentar vender quantidade maior que estoque e confirmar bloqueio.
- [ ] Validar baixa de estoque apos venda.
- [ ] Consultar historico de vendas.
- [ ] Filtrar historico por texto.
- [ ] Filtrar historico por periodo.
- [ ] Devolver produto de venda antiga pelo historico.
- [ ] Tentar devolver quantidade maior que a vendida e confirmar erro amigavel.
- [ ] Verificar entrada de estoque apos devolucao.
- [ ] Verificar lancamento financeiro reverso.
- [ ] Verificar auditoria da venda e da devolucao.

## E) Financeiro
- [ ] Abrir resumo financeiro como owner.
- [ ] Consultar transacoes do periodo atual.
- [ ] Filtrar por periodo dia/semana/mes.
- [ ] Usar periodo customizado.
- [ ] Filtrar por tipo entrada/saida.
- [ ] Buscar por descricao/origem quando aplicavel.
- [ ] Criar lancamento manual de receita.
- [ ] Criar lancamento manual de despesa.
- [ ] Editar lancamento manual.
- [ ] Excluir lancamento manual, se permitido pelo contrato atual.
- [ ] Verificar receitas de servico.
- [ ] Verificar receitas de produto.
- [ ] Verificar despesas de comissao.
- [ ] Verificar estornos/devolucoes.
- [ ] Confirmar que lancamentos automaticos nao sao editaveis/destruidos pela UI.
- [ ] Confirmar auditoria de criacao/edicao/exclusao de lancamento manual.

## F) Comissoes
- [ ] Verificar comissao pendente gerada por checkout ou venda.
- [ ] Pagar comissao como owner.
- [ ] Confirmar que despesa financeira foi criada com origem `COMMISSION`.
- [ ] Confirmar que a comissao mudou para `PAID`.
- [ ] Repetir acao com mesma chave quando possivel e confirmar que nao duplica despesa.
- [ ] Garantir que recepcao nao consegue pagar comissao.
- [ ] Garantir que profissional nao consegue pagar comissao.
- [ ] Verificar auditoria do pagamento de comissao.
- [ ] Verificar que comissao cancelada, se existir no dataset, nao pode ser paga.

## G) Estoque
- [ ] Abrir lista de produtos.
- [ ] Cadastrar produto em ambiente de teste.
- [ ] Editar produto em ambiente de teste.
- [ ] Ajustar estoque manualmente adicionando quantidade.
- [ ] Ajustar estoque manualmente removendo quantidade.
- [ ] Tentar remover quantidade maior que saldo e confirmar bloqueio.
- [ ] Validar tenant guard tentando alterar produto de outra unidade por path.
- [ ] Validar baixo estoque.
- [ ] Validar movimentos de venda como `OUT`.
- [ ] Validar movimentos de devolucao como `IN`.
- [ ] Validar motivo em ajuste manual.

## H) Auditoria
- [ ] Abrir tela de Auditoria como owner.
- [ ] Filtrar por `action`.
- [ ] Filtrar por `entity`.
- [ ] Filtrar por `actorId`.
- [ ] Filtrar por periodo.
- [ ] Alterar limite e confirmar comportamento.
- [ ] Verificar `requestId` ou `x-correlation-id`.
- [ ] Verificar `idempotencyKey` em operacoes criticas.
- [ ] Verificar actor email/role.
- [ ] Verificar before/after/metadata em eventos que possuem payload.
- [ ] Confirmar que recepcao nao acessa Auditoria.
- [ ] Confirmar que profissional nao acessa Auditoria.
- [ ] Reiniciar API com Prisma e confirmar que eventos persistem.

## I) Mobile/responsivo
- [ ] Abrir em largura mobile.
- [ ] Testar menu mobile e aba Mais.
- [ ] Testar navegacao para Agenda.
- [ ] Testar criacao de agendamento em mobile.
- [ ] Testar lista de agenda em mobile.
- [ ] Testar modal de checkout em mobile.
- [ ] Testar PDV e carrinho em mobile.
- [ ] Testar modal de devolucao de produto em mobile.
- [ ] Testar modal de estorno de atendimento em mobile.
- [ ] Testar Financeiro em layout compacto como owner.
- [ ] Testar Auditoria em layout compacto como owner.
- [ ] Confirmar que textos de botoes nao estouram o container.
- [ ] Confirmar que modais fecham por Fechar/Cancelar.

## J) Smoke operacional completo
- [ ] Login owner.
- [ ] Criar agendamento.
- [ ] Confirmar agendamento.
- [ ] Iniciar atendimento.
- [ ] Checkout do atendimento.
- [ ] Conferir receita de servico no financeiro.
- [ ] Registrar venda de produto.
- [ ] Conferir baixa de estoque.
- [ ] Consultar historico de vendas.
- [ ] Devolver produto.
- [ ] Conferir entrada de estoque.
- [ ] Conferir financeiro reverso.
- [ ] Consultar comissoes.
- [ ] Pagar comissao quando houver pendencia.
- [ ] Conferir despesa de comissao no financeiro.
- [ ] Abrir auditoria e confirmar rastros dos fluxos.

## Bugs pequenos corrigidos nesta fase
- [x] Mensagem de erro `403` no frontend normalizada para orientacao operacional.
- [x] Conflito de `idempotencyKey` no frontend normalizado para mensagem de idempotencia mais clara.
- [x] Erro de devolucao acima do vendido normalizado para mensagem de negocio.
- [x] Erro de estorno de atendimento nao concluido/ja estornado normalizado para mensagem de negocio.
- [x] Smoke API revisado para usar checkout real em vez de rota legada de conclusao simples.

## Revisao do smoke API
Arquivo revisado: `scripts/smoke-api-flow.ps1`.

Fluxo minimo esperado:
- [x] `/health`.
- [x] `/auth/login`.
- [x] catalogo operacional.
- [x] criacao de agendamento.
- [x] confirmacao e inicio do atendimento.
- [x] checkout com idempotencyKey.
- [x] venda de produto com idempotencyKey.
- [x] historico de vendas.
- [x] devolucao de produto com idempotencyKey.
- [x] financeiro.
- [x] comissoes consultaveis.
- [x] auditoria.

Observacao: pagamento de comissao no smoke deve ser mantido opcional enquanto o dataset local nao garantir regra de comissao pendente deterministica. A validacao manual deve cobrir pagamento de comissao com dados preparados.

## Checklist de producao controlada

### Ambiente
- [ ] Node >=22 instalado.
- [ ] `DATABASE_URL` configurada para PostgreSQL correto.
- [ ] `AUTH_SECRET` forte, unico e diferente de `dev-secret-change-me`.
- [ ] `DATA_BACKEND=prisma`.
- [ ] `AUTH_ENFORCED=true`.
- [ ] `PORT` configurada.
- [ ] CORS revisado para dominios reais.
- [ ] Dominio e HTTPS definidos.
- [ ] Logs habilitados com nivel adequado.
- [ ] Backup do banco antes de qualquer migracao.
- [ ] Migrations aplicadas ou `db push` validado conforme estrategia escolhida.
- [ ] Seed controlado e nao destrutivo.
- [ ] Usuario owner inicial criado.
- [ ] Senha inicial trocada.
- [ ] Variaveis de billing/webhook configuradas somente se o modulo for ativado.

### Banco
- [ ] PostgreSQL ativo.
- [ ] Banco/schema correto validado.
- [ ] `npm.cmd run db:generate` executado.
- [ ] `npm.cmd run db:push` ou migrations aplicadas e validadas.
- [ ] Backup testado com restore em ambiente separado.
- [ ] Politica definida para nao rodar seed destrutivo em producao.
- [ ] Confirmar constraints de idempotencia, financeiro, refund, estoque e auditoria.
- [ ] Confirmar timezone esperado para registros operacionais.

### Seguranca
- [ ] Nao usar `dev-secret-change-me`.
- [ ] Nao deixar `AUTH_USERS_JSON` inseguro em producao.
- [ ] Garantir HTTPS.
- [ ] Restringir CORS quando necessario.
- [ ] Revisar logs para nao expor senha/token.
- [ ] Validar permissoes owner/recepcao/profissional.
- [ ] Validar usuario inativo bloqueado.
- [ ] Validar `activeUnitId` e tenant guard.
- [ ] Validar secrets de webhook com valor forte se billing/integracoes estiverem ativos.

### Operacao
- [ ] Cadastrar/validar servicos.
- [ ] Cadastrar/validar produtos.
- [ ] Cadastrar/validar profissionais.
- [ ] Configurar horarios de funcionamento.
- [ ] Configurar formas de pagamento.
- [ ] Configurar regras de comissao.
- [ ] Validar estoque inicial.
- [ ] Validar fluxo completo antes de entregar ao primeiro usuario.
- [ ] Treinar owner/recepcao no fluxo de checkout, venda, devolucao e estorno.
- [ ] Definir quem pode executar estorno/devolucao em producao controlada.

### Observabilidade
- [ ] Logs de erro acessiveis.
- [ ] Smoke pos-deploy executado.
- [ ] Auditoria consultavel como owner.
- [ ] Plano de rollback documentado.
- [ ] Backup antes de migrations.
- [ ] Checklist de validacao manual preenchido.
- [ ] Canal de suporte para incidentes da producao controlada.
- [ ] Janela de acompanhamento definida para os primeiros dias.

## Criterios de aprovacao da Fase 0.7
- [ ] Checklist manual preenchido com evidencias.
- [ ] Smoke API passando no ambiente alvo.
- [ ] `npm.cmd run test` passando ou limitacao documentada.
- [ ] `npm.cmd run build` passando.
- [ ] `npm.cmd run test:db` passando com PostgreSQL real ou limitacao documentada.
- [ ] Nenhum bug P0/P1 aberto nos fluxos de agenda, checkout, PDV, financeiro, comissoes, estoque ou auditoria.
- [ ] Proxima etapa definida: producao controlada, refinamento mobile/UX, CRUD usuarios/equipe ou vinculo User -> Professional.

## Pendencias reais
- Validacao manual no navegador ainda precisa ser executada e marcada item a item.
- Profissional ainda nao tem escopo refinado por vinculo formal `User -> Professional`.
- CRUD completo de usuarios/equipe segue fora desta fase.
- Deploy real ainda nao foi executado.
- IA/WhatsApp continuam depois da producao controlada e dos ajustes operacionais prioritarios.

## Proxima etapa recomendada
Se os testes automatizados e o smoke passarem: iniciar preparacao de deploy/producao controlada usando este checklist.

Se a validacao manual ainda nao tiver sido feita no navegador: executar primeiro a validacao manual real com owner, recepcao e profissional.
