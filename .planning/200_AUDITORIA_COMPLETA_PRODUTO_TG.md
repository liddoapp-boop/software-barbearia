# 200 - Auditoria completa do produto e escopo restante do TG

Data: 2026-06-16

## 1. Resumo executivo

A Fase 2.0 auditou o estado atual do Software Barbearia sem criar feature, sem alterar regra de negocio, sem migration, sem seed, sem deploy, sem restart PM2 e sem expor segredo. O produto esta operacional em ambiente publico HTTPS e possui core forte para piloto owner-only: autenticacao, dashboard, agenda interna, checkout, PDV, estoque, financeiro, servicos, equipe, comissoes, auditoria, relatorios e configuracoes respondem como owner.

O sistema esta acima de um MVP tecnico simples e ja sustenta demonstracao real do fluxo principal do TG. A entrega ainda nao deve ser vendida como produto completo de mercado porque WhatsApp real, IA generativa, Google Calendar, validacao manual/mobile final e documentacao academica ainda estao parciais ou ausentes.

Atualizacao da reexecucao em 2026-06-16: a arvore Git iniciou limpa, mas a branch local **nao esta alinhada** com `origin/main`; `git status -sb` retornou `main...origin/main [ahead 1]`. Nenhum push, commit ou staging foi feito nesta auditoria.

Decisao da fase: **APROVADO COM RESSALVAS PARA PROXIMA FASE DE FECHAMENTO DO TG**.

## 2. Validacoes base executadas

| Validacao | Resultado |
| --- | --- |
| `git status --short` | limpo antes da auditoria documental |
| `git status -sb` | `main...origin/main [ahead 1]`; branch local nao alinhada com `origin/main` |
| `git log --oneline -10` | historico recente inclui validacao owner-only, `.gitignore` de `test-results/`, hardening de producao, seguranca e owner-only |
| `npm run build` | passou |
| `npm run test` | passou: 6 arquivos, 1 skipped; 88 testes, 11 skipped |
| `npm run test:db` | passou: 1 arquivo; 11 testes |
| `npm audit` | 0 vulnerabilidades |
| `npm audit --omit=dev` | 0 vulnerabilidades |
| `curl /health` publico HTTPS | `{"ok":true,"authEnforced":true}` |
| `pm2 status` | `software-barbearia` online |
| `systemctl status nginx --no-pager` | ativo |
| `systemctl status postgresql --no-pager` | ativo |
| `ufw status verbose` | ativo; 80/443/22 permitidos; 3333 negado |
| `ss -tulpn` | app em `127.0.0.1:3333`; sem `0.0.0.0:3333` |
| GETs autenticados owner | validacao registrada na Fase 2.1: `/auth/me`, Dashboard, Agenda, Clientes, PDV, Estoque, Financeiro, Servicos, Equipe, Comissoes, Auditoria, Configuracoes, Relatorios e WhatsApp status retornaram 200 |
| Booking publico | `/agendamento`, `/public/services` e `/public/business` retornaram 200 |
| Mobile/overflow automatizado | `tests/frontend-mobile-overflow.spec.ts` passou: 2 testes |

Observacao operacional: `npm run test:db` executa fluxo Prisma e cria dados de teste com prefixos de teste no banco configurado. Passou, mas deve ser tratado como comando de ambiente controlado; para rotina de producao, preferir banco isolado de teste ou janela explicitamente autorizada.

Confirmacoes objetivas desta reexecucao:
- arvore Git limpa antes da edicao documental;
- branch local nao alinhada, `ahead 1`;
- app escutando em `127.0.0.1:3333`;
- sem listener `0.0.0.0:3333`;
- health publico HTTPS OK com `{"ok":true,"authEnforced":true}`;
- Nginx ativo, PostgreSQL ativo, PM2 online e UFW ativo com `3333/tcp` negado.

## 3. Estado geral do projeto

O backend concentra contratos em `src/http/app.ts`, regras e servicos em `src/application/*`, tipos em `src/domain/types.ts` e persistencia em Prisma/PostgreSQL. O frontend interno usa shell em `public/app.js` com modulos em `public/modules/*`, componentes compartilhados em `public/components/*` e estilos em `public/styles.css` e `public/styles/layout.css`.

O banco cobre entidades principais: unidade, usuario, acesso por unidade, clientes, profissionais, servicos, agenda, historico, produtos, estoque, vendas, financeiro, comissoes, estornos, auditoria, metas, fidelidade, pacotes, assinaturas, retencao, automacoes, webhooks e reconciliacao.

O ambiente publico esta saudavel: HTTPS real, Nginx proxy, PM2 online, PostgreSQL local, UFW ativo e app Node restrito a loopback.

## 4. Matriz de modulos

| Modulo | Classificacao | Evidencia principal | Observacao |
| --- | --- | --- | --- |
| Dashboard | Pronto, precisa validacao real | `/dashboard` 200; KPIs e sugestoes por regra no Prisma | Dados reais, mas meta mensal default ainda aparece hardcoded no calculo do dashboard |
| Agenda interna | Pronto | CRUD parcial, remarcar, status, concluir, checkout e conflito testados | Falta validacao humana final do fluxo inteiro no navegador real |
| Booking publico/agendamento | Parcial | `/agendamento` e endpoints publicos 200; `/public/booking` implementado | Nao ha escolha explicita de profissional na UI; mensagem promete WhatsApp mesmo com conexao fechada |
| Clientes | Parcial | listagem, cadastro, overview, fila de reativacao e duplicidade por telefone testados | Edicao completa/reativacao/LGPD precisam fechamento de escopo |
| PDV/produtos | Pronto | venda, carrinho, historico, devolucao e idempotencia cobertos | Validar visualmente no celular com dados reais |
| Estoque | Pronto | cadastro, edicao, ajuste, baixa por venda, consumo por servico e saldo insuficiente cobertos | Historico gerencial por periodo ainda e parcial |
| Financeiro | Pronto com risco de conferencia | receitas, despesas, comissoes, estornos, relatorios e idempotencia cobertos | Marcar como P1 a validacao manual de reconciliacao antes da apresentacao |
| Servicos | Pronto | CRUD, status, preco, duracao, categoria, profissionais e ficha tecnica | Falta roteiro manual demonstravel |
| Equipe/profissionais | Parcial | criar/editar profissional; desempenho e vinculo com servicos | Gestao de usuario real da equipe esta fora do piloto owner-only |
| Comissoes | Pronto | geracao, extrato, pagamento e despesa reconciliavel testados | Conferencia financeira manual ainda recomendada |
| Auditoria | Pronto | `AuditLog` persistente, append-only e rotas sensiveis owner-only | Boa evidencia para TG |
| Configuracoes | Pronto | empresa, horarios, pagamentos, equipe e regras de comissao | Algumas configuracoes dependem de validacao operacional do dono |
| Autenticacao/owner-only | Pronto | login owner, `/auth/me`, JWT, role owner, active unit e RBAC validados | Tokens antigos continuam stateless ate expirarem |
| Seguranca/infra | Pronto com ressalva Git | HTTPS, UFW, Nginx, PM2, PostgreSQL, audits 0 vulnerabilidades | Branch local esta `ahead 1`; `script-src 'unsafe-inline'` e `style-src 'unsafe-inline'` sao aceitaveis para monolito estatico, mas nao ideais |
| Mobile/responsividade | Precisa validacao real | teste automatizado de overflow passou; Fase 2.1 coletou evidencias em viewport 390x844 | Falta, se exigido pela banca, validacao complementar em aparelho fisico real |
| WhatsApp | Parcial | endpoints owner-only e Evolution API implementados; estado atual `close` | WhatsApp real ainda nao comprovado conectado |
| IA | Ausente como IA generativa | nao ha dependencia OpenAI/LLM; ha sugestoes por regra | Tratar como inteligencia operacional por regra ou implementar fase controlada |
| Google Calendar | Ausente | nao ha OAuth, tokens, criacao de evento ou link dedicado | Recomendar link "Adicionar ao Google Calendar" se entrar no TG |
| Documentacao TG | Parcial | muita evidencia tecnica em `.planning` | Falta consolidar texto academico final e prints/roteiro |
| Manual de uso | Parcial | fluxos existem, mas nao ha manual final do Geovane | Criar manual curto owner-only |
| Evidencias e apresentacao | Parcial | logs, testes e docs existem | Faltam prints finais, video/roteiro e validacao mobile humana |

## 5. Agenda interna

Estado atual:
- Criar agendamento: existe em `POST /appointments` e UI interna.
- Editar agendamento: existe em `PATCH /appointments/:id`.
- Remarcar: existe em `PATCH /appointments/:id/reschedule`.
- Cancelar, confirmar, iniciar atendimento e no-show: existem via `PATCH /appointments/:id/status`.
- Concluir: existe em `POST /appointments/:id/complete`.
- Checkout: existe em `POST /appointments/:id/checkout`, com pagamento, produtos, idempotencia, financeiro, estoque, comissao e auditoria.
- Conflito de horario: validado por regra de sobreposicao.
- Servico inativo, profissional inativo e cliente inexistente: backend bloqueia.
- Reflexo financeiro: checkout gera receita de servico/produto e comissao.
- Mobile: teste automatizado passou; falta validacao humana final.

Riscos:
- P1: executar roteiro manual owner-only completo no dominio publico antes da entrega.
- P2: documentar claramente que recorrencia, bloqueios ricos de calendario e integracao externa ficam fora do escopo.

## 6. Booking publico

Estado atual:
- `/agendamento` carrega.
- Lista servicos ativos via `/public/services`.
- Calcula slots via `/public/slots`.
- Valida expediente, passado minimo e conflito.
- Coleta nome, telefone e e-mail opcional.
- Cria cliente por telefone quando necessario.
- Cria agendamento em `SCHEDULED`.
- Tenta WhatsApp e e-mail assincronamente.

Faltas ou ressalvas:
- P1: se WhatsApp estiver desconectado, a mensagem "Voce recebera uma confirmacao no WhatsApp" pode ser falsa.
- P2: nao ha escolha explicita de profissional no fluxo publico; o backend seleciona profissional ativo vinculado ao servico.
- P2: falta prova manual de confirmacao ponta a ponta em navegador/celular com dado descartavel planejado.

## 7. Clientes

Estado atual:
- Cadastro manual existe e bloqueia duplicidade por telefone no mesmo negocio.
- Listagem, busca e overview 360 existem.
- Telefone e tags sao usados para perfil operacional.
- Historico e fila de reativacao aparecem por dados de agenda/financeiro.
- WhatsApp manual/assistido existe como link/atalho e componente.

Faltas ou riscos:
- P1: definir escopo LGPD basico para TG: finalidade, minimizacao, exclusao/anonimizacao como trabalho futuro ou implementacao simples documentada.
- P2: edicao completa de cliente e reativacao formal precisam roteiro claro ou proxima fase.
- P2: registrar contato/resultado de WhatsApp assistido ainda e parcial.

## 8. PDV, produtos e estoque

Estado atual:
- Produto: cadastro, listagem, edicao, arquivamento e ajuste de estoque existem.
- Carrinho e venda existem.
- Baixa de estoque ocorre em venda e checkout com produto.
- Estoque insuficiente e bloqueado.
- Historico de venda e devolucao existem.
- Devolucao gera financeiro reverso e entrada de estoque.
- Integra com cliente, profissional, comissao e auditoria.

Riscos:
- P1: validar manualmente o fluxo financeiro/estoque com pequeno conjunto de dados de teste planejado, porque erro aqui impacta dinheiro e saldo.
- P2: relatorio historico de estoque por periodo ainda nao e tao forte quanto estado atual e movimentacoes.

## 9. Financeiro

Estado atual:
- Receitas de servico/produto, despesas manuais, comissoes pagas, estornos e devolucoes existem.
- Filtros por periodo, transacoes, resumo, overview gerencial e relatorios existem.
- Idempotencia cobre checkout, venda, devolucao, lancamento manual e pagamento de comissao.
- Auditoria financeira existe para acoes sensiveis.

Riscos:
- P1: conferencia manual de fechamento entre Agenda, PDV, Estoque, Comissoes e Financeiro antes da banca.
- P1: documentar criterio de reconciliacao e exemplos no TG.
- P2: conciliacao bancaria/gateway/TEF nao existe e deve ficar fora do escopo ou trabalho futuro.

## 10. Servicos e equipe

Estado atual:
- Servico ativo/inativo, preco, duracao, categoria, custo estimado, comissao default e profissionais habilitados existem.
- Profissional ativo/inativo e vinculo ao servico impactam agenda e booking.
- Regras de comissao por profissional/servico existem em configuracoes.

Faltas:
- P2: no piloto owner-only, equipe como usuario autenticavel nao esta ativa; profissionais existem como entidade operacional.
- P2: manual deve explicar diferenca entre "profissional da agenda" e "usuario do sistema".

## 11. Dashboard/KPIs

Estado atual:
- KPIs sao calculados por dados reais: agenda, financeiro, vendas, estoque, comissoes, clientes e historico.
- Ha previsoes e alertas por regra: queda de forecast, ociosidade, reativacao, estoque baixo e upsell.
- Ha telemetria de sugestoes do dashboard.

Classificacao:
- Confiavel para demonstracao operacional.
- Precisa validacao manual de numeros com uma base pequena conhecida.
- Nao e IA generativa.

Risco:
- P2: `goalMonth` no dashboard aparece como valor fixo interno; metas formais existem em modulo separado. Para TG, rotular como referencia operacional ou ajustar em fase futura.

## 12. WhatsApp

Estado atual:
- Existe componente frontend de gerenciamento WhatsApp.
- Existem templates de mensagem de booking e lembrete.
- Existem endpoints owner-only: status, conectar e desconectar.
- Existe envio via Evolution API quando `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` estao configurados.
- Estado atual verificado: `close`, sem QR code.

Conclusao:
**WhatsApp real esta parcial.** Ha base tecnica e assistida, mas conexao real/API oficial nao foi comprovada nesta auditoria.

Menor escopo seguro para o TG:
- Botao/atalho WhatsApp por cliente.
- Templates de mensagem sugerida.
- Registro manual de contato/resultado.
- Sem prometer automacao real se Evolution nao estiver conectado.
- API real de WhatsApp/Evolution como trabalho futuro ou fase separada.

## 13. IA

Estado atual:
- Nao ha dependencia OpenAI/LLM nem endpoint de IA generativa.
- Existem sugestoes inteligentes por regra: dashboard, reativacao, ociosidade, upsell, scoring e automacoes.
- Ha fallback natural porque tudo e deterministico.

Conclusao:
**IA generativa real esta ausente. Inteligencia por regra existe e deve ser apresentada assim.**

Escopo recomendado se IA entrar no TG:
- Sugestao de mensagem para cliente, com revisao humana.
- Resumo diario/semanal para o dono.
- Sugestao de acao operacional.
- Sem IA alterando agenda, financeiro, estoque ou cliente automaticamente.

## 14. Google Calendar

Estado atual:
- Nao foi encontrada integracao real com Google Calendar.
- Nao ha OAuth, tokens persistidos, criacao de evento ou sincronizacao.
- Ha Firebase token verification via Google public certs, mas isso e autenticacao, nao Calendar.

Recomendacao:
- Para TG, implementar no maximo link "Adicionar ao Google Calendar" a partir do agendamento confirmado.
- Sincronizacao OAuth real deve ser trabalho futuro, salvo exigencia expressa e tempo dedicado.

## 15. Seguranca e operacao

Pontos fortes:
- Owner-only consolidado.
- Login owner e `/auth/me` validados.
- JWT com expiracao.
- `AUTH_SECRET`, `DATA_BACKEND`, `AUTH_ENFORCED` e `CORS_ORIGIN` tem guards de producao.
- CORS restrito e CSP existem.
- Rotas sensiveis exigem owner.
- UFW ativo; porta 3333 negada externamente.
- App em `127.0.0.1:3333`.
- HTTPS real.
- PM2, Nginx e PostgreSQL saudaveis.
- `npm audit` limpo.
- `.env` e segredos fora do Git.

Riscos:
- P1: tokens JWT sao stateless; revogacao imediata de token antigo nao existe.
- P2: CSP usa `unsafe-inline`, aceitavel no frontend estatico atual, mas nao ideal.
- P2: rate limit especifico de login nao foi confirmado no codigo auditado.
- P2: manter procedimento de backup/restore e smoke antes de qualquer deploy futuro.

## 16. Mobile/UX

Estado atual:
- Shell mobile, menu, tabs e contecao de overflow foram trabalhados em fases anteriores.
- Teste automatizado de overflow mobile passou.
- Booking publico e app interno carregam em rotas publicas/protegidas.

Pendencias:
- P1: validacao humana em celular real para login, menu, agenda, PDV/carrinho, clientes, financeiro, servicos, equipe, configuracoes e booking.
- P2: coletar prints finais para TG.
- P2: confirmar modais/drawers longos em telas pequenas com dados reais.

## 17. Documentacao TG

Ainda precisa ser escrito ou consolidado:
- problema;
- justificativa;
- objetivo geral;
- objetivos especificos;
- escopo;
- fora do escopo;
- requisitos funcionais;
- requisitos nao funcionais;
- tecnologias;
- arquitetura;
- banco de dados;
- seguranca;
- fluxos;
- testes;
- validacao;
- resultados;
- limitacoes;
- trabalhos futuros;
- conclusao.

Evidencias a coletar:
- prints de login, dashboard, agenda, booking, PDV, estoque, financeiro, clientes, servicos, equipe, configuracoes e auditoria;
- prints mobile;
- logs resumidos de health/HTTPS;
- saida resumida de build/test/audit;
- evidencia de certificado HTTPS;
- matriz de modulos;
- roteiro de demonstracao;
- video curto opcional do fluxo principal.

## 18. Bugs e riscos priorizados

### P0

Nenhum P0 confirmado nesta auditoria. O sistema publico permaneceu saudavel e os testes base passaram.

### P1

1. Conferir manualmente financeiro/estoque/comissoes com base pequena conhecida.
2. Alinhar decisao Git antes do handoff: revisar o commit local `ahead 1` e decidir se sera enviado ou mantido apenas como artefato local.
3. Corrigir ou ajustar texto do booking quando WhatsApp estiver desconectado.
4. Definir LGPD basica no escopo do TG.
5. Coletar evidencias mobile em aparelho fisico se a banca exigir alem da viewport 390x844 da Fase 2.1.
6. Evitar `test:db` contra banco operacional sem isolamento explicito.

### P2

1. Escolha explicita de profissional no booking publico.
2. Registro de contato WhatsApp assistido por cliente.
3. Link "Adicionar ao Google Calendar".
4. Manual owner-only curto.
5. Revogacao de token/sessao em caso de troca de senha.
6. Rate limit especifico para login.
7. Dashboard usar meta mensal configurada em vez de valor fixo interno.

### P3

1. IA generativa controlada.
2. WhatsApp API real com webhook e lembretes automaticos.
3. Sincronizacao Google Calendar via OAuth.
4. Gateway/TEF/conciliacao bancaria.
5. Multiusuario operacional completo para recepcao/profissional.

## 19. O que esta pronto

- Infra publica com HTTPS, Nginx, PM2, PostgreSQL e UFW.
- Autenticacao owner-only.
- Core agenda -> atendimento -> checkout.
- PDV e estoque.
- Financeiro, comissoes, estornos e relatorios.
- Auditoria persistente.
- Servicos, profissionais e configuracoes.
- Dashboard com KPIs reais e sugestoes por regra.
- Booking publico basico.

## 20. O que esta parcial

- Booking publico apresentavel.
- Clientes com LGPD/reativacao formal.
- WhatsApp assistido/real.
- Mobile validado em viewport realista, com aparelho fisico como evidencia complementar se exigido.
- Manual de uso.
- Documentacao academica final.
- Evidencias de apresentacao.

## 21. O que esta ausente

- IA generativa real.
- Google Calendar.
- WhatsApp real comprovado conectado.
- API oficial de WhatsApp/webhook/lembrete automatico comprovado.
- Conciliacao bancaria/gateway.
- Manual final do usuario.

## 22. Ordem recomendada das proximas fases

1. Fase 2.1 - Roteiro de validacao manual owner-only e evidencias reais.
2. Fase 2.2 - Ajustes minimos de apresentacao do booking e WhatsApp assistido.
3. Fase 2.3 - Manual de uso owner-only para Geovane.
4. Fase 2.4 - Documentacao academica TG e matriz RF/RNF.
5. Fase 2.5 - Pacote de apresentacao: prints, roteiro, resultados, limitacoes e trabalhos futuros.
6. Fase futura opcional - IA generativa controlada.
7. Fase futura opcional - WhatsApp real conectado.
8. Fase futura opcional - Google Calendar simples por link.

## 23. Decisao final

**APROVADO COM RESSALVAS.**

Criterios atendidos:
- auditoria completa gerada;
- nenhum segredo exposto;
- sistema publico seguiu saudavel;
- testes base passaram;
- Git estava com arvore limpa antes da criacao documental, porem branch local ja estava `ahead 1`;
- foi criada lista clara de proximos passos.

Ressalvas:
- esta fase gerou apenas documentos pendentes no working tree;
- branch local nao esta alinhada com `origin/main` e precisa decisao antes do handoff;
- nao houve validacao humana em aparelho fisico real durante esta auditoria;
- WhatsApp, IA e Google Calendar nao devem ser apresentados como prontos.

## 24. Atualizacao Fase 2.1 - Validacao manual owner-only

Data: 2026-06-16

Documento novo: `.planning/201_VALIDACAO_MANUAL_OWNER_ONLY_EVIDENCIAS.md`.

Resultado: **APROVADO COM RESSALVAS**.

Evidencias reais foram coletadas no dominio publico em `.planning/evidence/fase-201-validacao-owner-only/`:
- login owner pela tela passou, com e-mail apenas mascarado;
- desktop owner carregou login, painel inicial/Inicio, Agenda, Clientes, PDV, Financeiro, Servicos, Equipe, Auditoria e Configuracoes;
- booking publico foi validado ponta a ponta e criou o agendamento de teste `34f531e1-c50b-4f7b-a47a-4686ed7d06fd`;
- mobile foi validado por viewport realista 390x844 para login, Agenda, Clientes, PDV, Financeiro e booking publico;
- logs PM2 pos-validacao nao indicaram crash, loop de restart ou erro `500` critico;
- prints/logs foram sanitizados para nao expor telefone completo, senha, token completo, `.env` ou `DATABASE_URL`.

Ressalvas restantes:
- P1: financeiro/estoque/comissoes precisam de fase propria com base conhecida e reversao documentada;
- P1: consolidar LGPD basica no texto academico/manual;
- P2: booking publico nao permite escolha explicita de profissional;
- P3: print do menu mobile aberto e validacao em aparelho fisico podem complementar o pacote do TG.
