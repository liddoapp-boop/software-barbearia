# Sprint 226.3 - Plano tecnico de saneamento controlado

Data: 2026-06-26

Responsavel tecnico: CTO tecnico do Projeto Software Barbearia

Escopo: plano operacional para saneamento futuro. Nenhuma alteracao de banco, codigo de produto, seed, migration, checkout, venda, pagamento, comissao, estorno, estoque, deploy, PM2 ou Nginx foi executada.

## 1. Objetivo

Transformar o dry-run tecnico da Sprint 226.2 em um plano seguro para uma futura execucao de saneamento dos dados internos.

Esta sprint nao saneia dados. Ela define pre-condicoes, backup, rollback, ordem futura, criterios de abortar, pontos dependentes do Geovane e o formato minimo de uma sprint executavel posterior.

## 2. Contexto vindo das Sprints 226, 226.1 e 226.2

A Sprint 226 validou o painel interno em modo seguro e concluiu que ele esta navegavel para demonstracao guiada/read-only, mas bloqueado para operacao real por mistura de dados demo/teste com dados possivelmente reais.

A Sprint 226.1 criou a matriz de saneamento e confirmou que Sprint 227 nao deve avancar enquanto servicos, produtos, profissionais, clientes, financeiro, estoque e comissoes nao forem confirmados e saneados.

A Sprint 226.2 fez o dry-run tecnico e encontrou dependencias que tornam perigoso qualquer saneamento automatico:

| Area | Achado critico |
| --- | --- |
| Servicos | 7 servicos ativos, todos com agenda e financeiro/comissao relacionados |
| Produtos | 9 produtos ativos, todos com venda/financeiro relacionados |
| Profissionais | 44 profissionais ativos, 39 `pro-db-*` e 3 `demo-pro-*` com historico |
| Cross-tenant | 39 vinculos `pro-db-*` com `svc-db-*` de unidades `unit-db-*` |
| Clientes | 28 clientes agregados; 17 sem marcador tratados como possivelmente reais |
| Financeiro | 101 lancamentos; sinais demo/teste em muitos textos |
| Comissoes | 84 comissoes, sendo 82 pendentes |
| Auditoria | 43 auditorias que devem ser preservadas como trilha |

Candidatos a manter, ainda dependentes de confirmacao:

| Categoria | Registros |
| --- | --- |
| Servicos | `svc-barba`, `svc-corte` |
| Produtos | `prd-pomada`, `prd-oleo-barba` |
| Profissional | `pro-01` |
| Clientes | Sem marcador, tratados como possivelmente reais e protegidos como PII |

Candidatos a saneamento futuro:

| Categoria | Registros |
| --- | --- |
| Servicos | `demo-svc-*`, `Servico Teste Comissao TG` |
| Produtos | `demo-prd-*`, `Produto Teste Estoque TG` |
| Profissionais | `Profissional Teste Comissao TG`, 39 `pro-db-*`, possivelmente `demo-pro-*` se Geovane negar operacao real |
| Clientes | Clientes marcados como demo/teste/TG, sem exposicao individual |
| Financeiro | Historico com sinais demo/teste, separado por data de corte |

## 3. Decisao do pre-flight CTO

Decisao: LIBERADO COM RESSALVAS.

| Checagem | Resultado |
| --- | --- |
| Diretorio | `/root/software-barbearia` |
| Branch/status | `## main...origin/main` |
| HEAD esperado | `25278d4 docs: registrar dry-run de saneamento interno` |
| Worktree | Limpa no inicio |
| Sprint 226 | Documento encontrado |
| Sprint 226.1 | Documento encontrado |
| Sprint 226.2 | Documento encontrado |
| Dry-run tecnico | `.planning/226_2_DRY_RUN_SANEAMENTO_DADOS_INTERNOS.md` encontrado |
| Pode criar plano sem alterar banco? | Sim |
| Pontos dependentes do Geovane | Sim, varios |
| Risco de PII | Sim, principalmente clientes |
| Risco financeiro | Sim, principalmente financeiro/comissoes |

Ressalvas:

1. O plano e util apenas como preparacao; ele nao autoriza mutacao.
2. O dry-run e uma fotografia de 2026-06-26. Antes de saneamento real, deve ser reexecutado em modo readonly.
3. Sem confirmacao do Geovane, nao ha decisao segura sobre servicos/produtos/profissionais plausiveis, clientes sem marcador, estoque fisico, horarios, comissoes e historico financeiro.

## 4. Decisao de CTO

Decisao: nao sanear agora, nao avancar para Sprint 227 e preparar uma sprint futura executavel somente depois de confirmacao humana, backup, data de corte e aprovacao explicita.

Minha opiniao tecnica: a Sprint 226.3 e necessaria. O dry-run mostrou que quase todo registro candidato a limpeza tem historico, relacao financeira, comissao, venda, agenda ou auditoria. Executar limpeza sem plano seria risco de perda de historico, contaminacao financeira ou exposicao de PII.

## 5. Por que Sprint 227 segue bloqueada

Sprint 227 segue bloqueada porque ainda nao ha base confiavel para fluxo real completo.

Bloqueios objetivos:

| Bloqueio | Motivo |
| --- | --- |
| Servicos | Todos tem historico; nomes, valores e duracoes dependem do Geovane |
| Produtos/estoque | Todos tem venda; estoque atual pode ser artificial |
| Profissionais | 44 ativos, com excesso de demo/DB e 39 vinculos cross-tenant |
| Clientes | Ha PII e clientes sem marcador possivelmente reais |
| Financeiro | 101 lancamentos nao reconciliados com data de corte |
| Comissoes | 82 pendentes nao homologadas |
| Auditoria | Deve preservar trilha, nao apagar evidencia |
| Operacao | Checkout, venda, pagamento, refund e comissao podem consolidar dado incorreto |

## 6. Pre-condicoes obrigatorias

Saneamento futuro so pode acontecer com todos os itens abaixo cumpridos:

| Pre-condicao | Criterio minimo |
| --- | --- |
| Backup PostgreSQL recente | Dump completo criado imediatamente antes da execucao |
| Checksum do backup | Hash registrado no relatorio da sprint executavel |
| Restore documentado | Comando de restore definido antes de qualquer mutacao |
| Git limpo | `git status -sb` sem alteracoes inesperadas |
| HEAD conhecido | HEAD e `origin/main` alinhados ou divergencia explicitamente aprovada |
| Build/testes minimos | Validacao compativel com o escopo, sem `npm run test:db` se houver risco |
| Runtime conhecido | Estado PM2/runtime documentado se a execucao afetar producao |
| Janela de manutencao | Periodo definido, com responsavel e criterio de encerramento |
| Acoes reais congeladas | Agenda, checkout, venda, pagamento, refund, financeiro e comissao pausados |
| Data de corte | Data/hora que separa legado/teste de operacao real |
| Geovane confirmado | Respostas registradas sobre servicos, produtos, profissionais, estoque, horarios, comissoes e historico |
| Aprovacao explicita | Usuario aprova escopo e lista exata antes de rodar |
| Rollback preparado | Plano de reversao validado antes de iniciar |
| Dry-run atualizado | Contagens e IDs revalidados imediatamente antes da execucao |

## 7. Estrategia de backup

Backup futuro deve ser obrigatorio e anterior a qualquer mutacao.

Plano recomendado:

| Item | Definicao futura |
| --- | --- |
| Local | Diretorio operacional fora do repositorio, por exemplo `/root/backups/software-barbearia/` |
| Nome | `software-barbearia_PRE-SANEAMENTO_YYYYMMDD-HHMMSS_UTC.dump` |
| Formato | `pg_dump` em formato custom quando possivel, para permitir restore seletivo/controlado |
| Checksum | `sha256sum` salvo ao lado do dump e registrado em `.planning` |
| Validacao de existencia | Conferir tamanho maior que zero, permissao de leitura e checksum consistente |
| Retencao | Manter ate validacao pos-saneamento e decisao explicita de descarte |
| Conteudo sensivel | Tratar backup como dado sensivel; nao commitar, nao anexar em documento publico |

Exemplo documental, nao executado nesta sprint:

```bash
# Exemplo futuro, exige autorizacao explicita e ambiente correto
pg_dump --format=custom --file=/root/backups/software-barbearia/software-barbearia_PRE-SANEAMENTO_YYYYMMDD-HHMMSS_UTC.dump "$DATABASE_URL"
sha256sum /root/backups/software-barbearia/software-barbearia_PRE-SANEAMENTO_YYYYMMDD-HHMMSS_UTC.dump > /root/backups/software-barbearia/software-barbearia_PRE-SANEAMENTO_YYYYMMDD-HHMMSS_UTC.dump.sha256
```

Abortar antes de qualquer saneamento se:

- backup falhar;
- checksum nao bater;
- arquivo nao existir ou tiver tamanho inesperado;
- `DATABASE_URL` apontar para ambiente errado;
- nao houver espaco em disco;
- nao houver comando de restore definido.

## 8. Estrategia de rollback

Rollback precisa ser escolhido antes da execucao real. A estrategia primaria deve ser restaurar backup completo quando a mutacao afetar varias categorias ou financeiro/comissoes.

Plano recomendado:

| Situacao | Acao de rollback |
| --- | --- |
| Falha antes de commit da transacao | `ROLLBACK` da transacao |
| Falha apos mutacoes parciais em uma transacao | `ROLLBACK` se a transacao ainda estiver aberta |
| Falha apos commit com impacto amplo | Restaurar backup em ambiente controlado e decidir restore completo |
| Falha de contagem pos-saneamento | Parar, nao continuar categorias seguintes, comparar com dry-run |
| Exposicao de PII em relatorio | Remover relatorio sensivel, reemitir evidencias agregadas |
| Dano financeiro/comissao | Congelar operacao, restaurar backup ou aplicar compensacao somente com aprovacao explicita |

Regras:

1. Preferir transacoes por lote/categoria.
2. Nunca misturar saneamento financeiro com saneamento de cadastro no mesmo lote irreversivel.
3. Registrar antes/depois por contagem, nao por dados pessoais.
4. Manter relatorio de IDs afetados em arquivo sensivel apenas se necessario e aprovado.
5. Se o rollback exigir restore completo, parar a operacao real ate a validacao final.

## 9. Plano por categoria

### Profissionais

Decisao tecnica:

- nao deletar profissionais com agenda, venda, financeiro, comissao ou auditoria;
- preferir inativar/ocultar para fluxo futuro;
- manter `pro-01` como candidato real, ainda com confirmacao de regras e horarios;
- tratar `demo-pro-*` como duvida operacional ate Geovane confirmar se Rafael, Lucas e Matheus existem;
- tratar `Profissional Teste Comissao TG` como candidato forte a inativacao futura, preservando auditoria;
- tratar 39 `pro-db-*` como saneamento tecnico separado por causa dos vinculos cross-tenant com `svc-db-*` e regras de comissao.

Ordem futura para profissionais:

1. Confirmar equipe real com Geovane.
2. Reexecutar dry-run de profissionais e vinculos `ServiceProfessional`.
3. Resolver plano dos 39 vinculos cross-tenant antes de qualquer delete/inativacao ampla.
4. Inativar/ocultar somente registros aprovados.
5. Validar que agenda/booking publico mostram apenas profissionais esperados.

### Servicos

Decisao tecnica:

- nao deletar nenhum dos 7 servicos, pois todos tem agenda e financeiro/comissao relacionados;
- manter `svc-barba` e `svc-corte` como candidatos, nao como verdade final;
- confirmar nome publico, preco, duracao, categoria, consumo de estoque e regra de comissao;
- nao usar `demo-svc-*` em fluxo real enquanto Geovane nao confirmar;
- decidir destino de `Servico Teste Comissao TG` em saneamento futuro, com preservacao de historico.

Ordem futura para servicos:

1. Confirmar catalogo real com Geovane.
2. Definir se cada `demo-svc-*` vira real, oculto ou inativo.
3. Definir data de corte para historico antigo.
4. Inativar/ocultar para uso futuro sem apagar historico.
5. Validar `/public/services` e fluxo interno de agenda.

### Produtos/estoque

Decisao tecnica:

- nao deletar produtos com venda historica;
- preferir inativar, ocultar ou bloquear venda futura;
- manter `prd-pomada` e `prd-oleo-barba` como candidatos, dependentes de estoque fisico;
- confirmar preco, custo, estoque, minimo, categoria e se realmente existem na unidade;
- nao usar produto demo em venda real;
- nao ajustar estoque sem contagem fisica e aprovacao.

Ordem futura para produtos:

1. Conferir estoque fisico com Geovane.
2. Separar produtos reais, demo, teste e duvida.
3. Definir tratamento do historico de vendas antigo por data de corte.
4. Bloquear venda futura dos produtos nao reais.
5. Validar PDV em modo controlado, sem venda real ate liberacao.

### Clientes

Decisao tecnica:

- nao expor PII em documentos, logs ou reunioes abertas;
- nao deletar cliente com historico sem decisao explicita;
- tratar clientes sem marcador como possivelmente reais;
- classificar marcados como demo/teste/TG apenas por agregados;
- decidir politica para clientes antigos antes de qualquer fluxo de WhatsApp, agenda real ou checkout.

Ordem futura para clientes:

1. Obter decisao do Geovane sobre carteira real.
2. Rodar relatorio agregado sem nomes, telefones ou emails.
3. Definir se clientes marcados serao ocultados, arquivados ou preservados como teste legado.
4. Validar que demonstracoes nao abrem detalhes com PII.

### Financeiro/comissoes

Decisao tecnica:

- nao pagar comissao antiga sem confirmacao;
- nao tratar saldo atual como verdade operacional;
- definir data de corte obrigatoria;
- decidir se historico antigo vira "teste legado", sera arquivado, reconciliado ou ignorado em relatorios reais;
- decidir se comissoes pendentes antigas serao canceladas, ignoradas, mantidas ou marcadas;
- preservar auditoria e trilha de eventos;
- separar qualquer saneamento financeiro em plano proprio.

Ordem futura para financeiro/comissoes:

1. Definir data de corte com Geovane.
2. Congelar pagamentos, baixas, refunds e lancamentos manuais durante saneamento.
3. Gerar contagens por origem/status sem PII.
4. Definir politica para 82 comissoes pendentes.
5. Executar apenas mutacoes aprovadas, preferencialmente em transacao e por lote.
6. Validar relatorios pos-saneamento como operacionais somente depois de reconciliacao.

### Auditoria

Decisao tecnica:

- nao apagar logs de auditoria;
- usar auditoria como trilha evidencial;
- registrar toda acao futura de saneamento;
- nao usar auditoria como unica fonte de verdade para decidir exclusao;
- evitar expor payloads sensiveis em documentacao.

Ordem futura para auditoria:

1. Definir formato de evento para saneamento.
2. Registrar responsavel, data, categoria, contagens e motivo.
3. Preservar logs antigos.
4. Validar que a auditoria nao exponha PII desnecessaria no relatorio.

## 10. Ordem futura de execucao

Ordem recomendada para uma sprint executavel posterior:

1. Confirmar respostas de Geovane.
2. Definir data de corte.
3. Confirmar Git limpo, HEAD correto e runtime conhecido.
4. Gerar backup PostgreSQL e checksum.
5. Documentar comando de restore.
6. Rodar dry-run atualizado.
7. Comparar dry-run atualizado com a fotografia da Sprint 226.2.
8. Gerar plano final aprovado com lista exata de registros e contagens.
9. Congelar agenda, checkout, venda, pagamento, refund, financeiro e comissoes.
10. Aplicar saneamento em transacao quando possivel.
11. Inativar/ocultar/bloquear venda futura, nao deletar historico.
12. Registrar auditoria.
13. Rodar smoke readonly.
14. Rodar testes essenciais definidos para o escopo.
15. Validar painel interno com dados saneados.
16. Validar booking publico.
17. Registrar relatorio final.
18. So entao reavaliar Sprint 227.

Minha ressalva CTO: financeiro/comissoes deve ser o ultimo bloco de mutacao, ou uma sprint separada, porque o dano de consolidar saldo/comissao incorreta e maior que deixar dados legados ocultos.

## 11. Criterios de abortar

Abortar saneamento futuro se qualquer item ocorrer:

| Criterio | Motivo |
| --- | --- |
| Backup falha | Sem reversao confiavel |
| Checksum invalido | Backup nao confiavel |
| Git sujo | Risco de estado tecnico desconhecido |
| Producao desalinhada | Runtime pode nao refletir plano validado |
| Dados divergem do dry-run | Plano pode afetar registros inesperados |
| Geovane nao confirmou | Risco de ocultar dado real |
| PII aparece em relatorio | Risco de privacidade |
| Risco financeiro nao entendido | Pagamento, comissao ou saldo podem ser incorretos |
| Script afeta mais registros que o esperado | Possivel bug de filtro |
| Smoke readonly falha | Sistema nao esta consistente apos mudanca |
| Logs mostram erro critico | Possivel dano operacional |
| Cross-tenant reaparece fora do plano | Requer investigacao especifica |
| Usuario nao aprova explicitamente | Sem autorizacao de mutacao |

## 12. Formato da futura sprint executavel

Uma sprint futura de execucao deve conter, antes de rodar qualquer mutacao:

| Item | Obrigatorio |
| --- | --- |
| Objetivo fechado | Sim |
| Ambiente alvo | Sim |
| Data de corte | Sim |
| Backup + checksum | Sim |
| Restore documentado | Sim |
| Lista exata de registros | Sim |
| Contagem antes/depois esperada | Sim |
| Queries readonly de validacao | Sim |
| Transacao ou lotes com rollback | Sim |
| Idempotencia quando aplicavel | Sim |
| Auditoria | Sim |
| Plano de rollback | Sim |
| Criterios de abortar | Sim |
| Relatorio final | Sim |
| Aprovacao explicita antes de rodar | Sim |

Nao criar script unico que faca tudo sem checkpoints. O saneamento deve ser por categoria, com pausa entre lotes e validacao de contagens.

## 13. Consultas e pseudocodigo futuro sugeridos

Estas consultas sao modelos readonly para uma futura sprint. Nao foram executadas nesta sprint e nao devem conter `UPDATE`, `DELETE`, `INSERT`, `TRUNCATE`, `CREATE`, `DROP`, seed ou migration.

Inventario por categoria:

```sql
-- Exemplo readonly futuro: contagem de profissionais ativos por marcador tecnico
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE active = true) AS ativos,
  COUNT(*) FILTER (WHERE id LIKE 'pro-db-%') AS pro_db,
  COUNT(*) FILTER (WHERE id LIKE 'demo-pro-%') AS demo_pro
FROM "Professional"
WHERE "businessId" = 'unit-01';
```

Validacao de servicos com historico:

```sql
-- Exemplo readonly futuro: servicos com agendamentos
SELECT s.id, s.name, COUNT(a.id) AS agendamentos
FROM "Service" s
LEFT JOIN "Appointment" a ON a."serviceId" = s.id
WHERE s."businessId" = 'unit-01'
GROUP BY s.id, s.name
ORDER BY agendamentos DESC;
```

Validacao de produtos com venda:

```sql
-- Exemplo readonly futuro: produtos com itens de venda
SELECT p.id, p.name, COUNT(psi.id) AS itens_venda
FROM "Product" p
LEFT JOIN "ProductSaleItem" psi ON psi."productId" = p.id
WHERE p."businessId" = 'unit-01'
GROUP BY p.id, p.name
ORDER BY itens_venda DESC;
```

Validacao financeira agregada:

```sql
-- Exemplo readonly futuro: financeiro por origem/status sem PII
SELECT "source", "type", COUNT(*) AS total
FROM "FinancialEntry"
WHERE "unitId" = 'unit-01'
GROUP BY "source", "type"
ORDER BY total DESC;
```

Pseudocodigo de execucao futura:

```text
1. validar pre-condicoes
2. gerar backup e checksum
3. rodar dry-run atualizado
4. comparar contagens esperadas
5. abrir transacao por categoria
6. aplicar apenas IDs aprovados
7. registrar auditoria
8. validar contagens pos-lote
9. commitar se tudo bater; rollback se divergir
10. rodar smoke readonly e registrar relatorio
```

## 14. Pontos que dependem do Geovane

Dependem de confirmacao do Geovane:

| Area | Perguntas |
| --- | --- |
| Servicos reais | `svc-barba` e `svc-corte` sao reais? Nomes publicos estao corretos? |
| Valores | Preco de cada servico/produto esta correto? |
| Duracoes | Duracao real de cada servico esta correta? |
| Produtos | `prd-pomada` e `prd-oleo-barba` existem fisicamente? Algum `demo-prd-*` e real? |
| Estoque | Quantidade fisica, custo, estoque minimo e politica de ajuste |
| Profissionais | Quem trabalha de fato na unidade alem de `pro-01`? |
| Horarios | Agenda real, folgas, intervalos e capacidade |
| Comissoes | Regras reais por profissional, servico e produto |
| Financeiro historico | Ignorar, arquivar, reconciliar ou manter como teste legado |
| Clientes | Quais clientes sao reais e quais devem ser ocultados/arquivados |
| Demonstracao | Quais telas podem ser mostradas sem expor PII |

Sem essas respostas, saneamento real deve ficar bloqueado.

## 15. O que nao foi feito por seguranca

Nao foi feito:

| Item | Status |
| --- | --- |
| Alteracao de banco | Nao executada |
| Backup real | Nao executado, porque nao houve autorizacao explicita para esta sprint |
| Restore | Nao executado |
| Inativacao ou exclusao | Nao executada |
| Alteracao de servico/produto/profissional/cliente | Nao executada |
| Alteracao de preco/duracao/estoque | Nao executada |
| Checkout, venda ou pagamento | Nao executado |
| Comissao, baixa, refund ou estorno | Nao executado |
| Migration ou seed | Nao executada |
| Alteracao em `.env` | Nao executada |
| Deploy, build de producao ou PM2 | Nao executado |
| Nginx, firewall ou certificado | Nao executado |
| Script destrutivo | Nao criado |
| Exposicao de PII de clientes | Nao executada |
| Avanco para Sprint 227 | Nao executado |

## 16. Opiniao tecnica CTO

| Pergunta | Opiniao CTO |
| --- | --- |
| Esta etapa foi necessaria ou burocratica? | Necessaria. O dry-run revelou dependencias perigosas demais para uma limpeza improvisada. |
| O que ela destrava? | Destrava a preparacao de uma sprint executavel com backup, rollback, data de corte, ordem segura e criterios de abortar. |
| E possivel sanear agora sem Geovane? | Nao com seguranca. No maximo daria para preparar consultas e plano tecnico; mutacao real continua bloqueada. |
| Qual e o maior risco tecnico? | Quebrar relacoes historicas ou cross-tenant, principalmente nos `pro-db-*` com `svc-db-*`, agenda e comissoes. |
| Qual e o maior risco financeiro? | Pagar, cancelar, zerar ou validar 82 comissoes pendentes e 101 lancamentos contaminados como se fossem operacao real. |
| Qual e o maior risco de dados/PII? | Expor ou apagar clientes possivelmente reais, ou registrar nomes/telefones/emails em relatorios de saneamento. |
| Qual deve ser a proxima acao enquanto Geovane nao responde? | Preparar checklist objetivo de decisao e manter somente demonstracao guiada/read-only; nao sanear. |
| Da para avancar para Sprint 227? | Nao. A base ainda nao e confiavel para fluxo real. |
| Voce discorda de alguma parte do plano? | Eu discordo de tratar todos os dados demo como lixo automatico. Alguns nomes plausiveis podem representar operacao real ou historico que precisa ser preservado. |
| O que nao devemos fazer agora? | Nao apagar, inativar, alterar preco, ajustar estoque, pagar comissao, executar checkout, registrar venda, criar cliente real, fazer deploy/restart ou rodar script destrutivo. |

## 17. Decisao final

Decisao final: Sprint 226.3 aprovada como plano tecnico documental; Sprint 227 permanece BLOQUEADA.

Nao ha autorizacao tecnica para saneamento real nesta etapa. A autorizacao futura deve ser explicita, com lista exata de registros, backup verificado e respostas do Geovane.

## 18. Proxima sprint recomendada

Recomendacao: Sprint 226.4 - Coleta de decisoes do Geovane e checklist final de saneamento.

Objetivo sugerido:

1. Obter respostas de Geovane sobre servicos, valores, duracoes, produtos, estoque, profissionais, horarios, comissoes e financeiro historico.
2. Definir data de corte.
3. Fechar politica para clientes e PII.
4. Produzir plano executavel com IDs exatos, contagens antes/depois, transacoes, auditoria, backup e rollback.
5. Somente depois abrir sprint de execucao de saneamento controlado.

Enquanto Geovane nao responder, a acao correta e manter painel interno em demonstracao guiada/read-only e nao executar Sprint 227.
