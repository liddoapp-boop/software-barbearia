# Sprint 227.0 - Gate do fluxo de atendimento com dados reais do Geovane

Data: 2026-06-28

Responsavel tecnico: CTO tecnico do Projeto Software Barbearia

Escopo: consolidar dados reais confirmados por Geovane, comparar com o banco local atual em modo readonly, reforcar um teste local seguro do fluxo de atendimento sem checkout real e definir o gate para a Sprint 227 real. Nenhuma mutacao de banco real, seed, migration, deploy, PM2, checkout real, venda real, pagamento, comissao, refund ou estoque foi executada.

## 1. Objetivo

Responder se o projeto ja tem base tecnica e operacional suficiente para sair do bloco 226.x e preparar a Sprint 227 real sem contaminar agenda, catalogo, estoque, financeiro ou historico.

Esta sprint nao e a Sprint 227 real completa. Ela e o gate de transicao: organiza os dados reais, separa canonicidade futura de legado contaminado e define o minimo seguro para uma Sprint 227.1 pratica em ambiente local/teste.

## 2. Por que saimos do 226.x

O bloco 226.x existia porque faltavam dados reais e havia risco de operar sobre catalogo/estoque/financeiro contaminados.

Agora Geovane confirmou informacoes suficientes para sair da paralisia de catalogo:

- servicos reais e precos;
- duracoes operacionais sugeridas para proposta inicial;
- produtos reais, custos, precos e estoque inicial.

Isso ainda nao libera producao, mas muda a natureza do trabalho: o problema deixa de ser "falta de dados reais" e passa a ser "execucao controlada de canonicidade, fixture/local e depois mutacao autorizada".

## 3. Decisao do pre-flight CTO

Decisao: `LIBERADO COM RESSALVAS`.

| Checagem | Resultado |
| --- | --- |
| Diretorio | `/root/software-barbearia` |
| Branch/status | `## main...origin/main` |
| Worktree inicial | Limpa |
| HEAD | `d32b4e4 docs: registrar aplicacao controlada da migration de snapshot` |
| Commit `d32b4e4` presente | Sim, como HEAD |
| Ambiente de banco | `DATABASE_URL` aponta para PostgreSQL em `127.0.0.1`, banco `barbearia` |
| Classificacao do alvo consultado | `LOCAL` |
| Migration de snapshot no alvo local | Aplicada localmente em 2026-06-28T01:50:39.792Z |
| Producao assumida como atualizada | Nao |
| Comando de migration nesta sprint | Nao executado |
| Seed nesta sprint | Nao executado |
| Deploy/PM2/Nginx | Nao executado |
| Mutacao de catalogo/estoque/financeiro | Nao executada |

Ressalvas:

1. A fotografia readonly vale para o banco local consultado, nao para producao.
2. A producao nao deve ser assumida como tendo as colunas de snapshot.
3. Os registros atuais tem historico; qualquer mutacao futura exige backup, dry-run atualizado, lista exata, rollback e aprovacao explicita.
4. Dados demo/teste nao devem virar verdade real por reaproveitamento casual.

## 4. Decisao CTO

Decisao: sair do bloco 226.x, mas nao executar a Sprint 227 real ainda.

Minha recomendacao tecnica e criar canonicos novos em fixture/local na Sprint 227.1, validar fluxo completo sem financeiro real e so depois planejar uma execucao controlada em ambiente persistente. Atualizar registros atuais diretamente seria uma escolha pior: todos os servicos e produtos atuais possuem historico, e varios carregam marcador demo/teste.

## 5. Dados reais consolidados de servicos

### Confirmado por Geovane

| Servico | Preco confirmado |
| --- | ---: |
| Corte | R$ 30,00 |
| Barba | R$ 20,00 |
| Hidratacao | R$ 20,00 |
| Luzes | R$ 50,00 |
| Pigmentacao | R$ 45,00 |

### Interpretacao operacional inicial

Estes tempos sao proposta operacional inicial para teste/local. Nao aplicar em producao sem validacao final.

| Servico | Duracao operacional sugerida |
| --- | ---: |
| Corte | 30 min |
| Barba | 30 min |
| Corte + Barba | 45 min |
| Hidratacao | 30 min |
| Luzes | 60 min |
| Pigmentacao | 60 min |

### Pendencia

`Corte + Barba` deve permanecer como possivel combo operacional. Nao criar combo real sem decisao explicita. Se entrar na agenda, precisa ser decidido se sera um servico canonico separado ou apenas combinacao operacional de dois atendimentos.

## 6. Dados reais consolidados de produtos

### Confirmado por Geovane

| Produto | Preco venda | Custo compra | Estoque inicial |
| --- | ---: | ---: | ---: |
| Gel | R$ 10,00 | R$ 5,50 | 30 |
| Pomada | R$ 25,00 | R$ 7,50 | 10 |
| Bucha para Dread | R$ 25,00 | R$ 12,50 | 3 |
| Oleo para Barba | R$ 35,00 | R$ 13,00 | 4 |
| Shampoo | R$ 25,00 | R$ 7,50 | 10 |
| Condicionador | R$ 25,00 | R$ 7,50 | 10 |
| Mascara de Hidratacao | R$ 30,00 | R$ 7,50 | 10 |

## 7. Confirmado vs interpretacao operacional

Confirmado:

- nomes e precos dos cinco servicos principais;
- nomes, precos, custos e estoque inicial dos sete produtos.

Interpretacao operacional:

- duracoes sugeridas;
- `Corte + Barba` como possivel combo;
- uso de canonicos novos para separar operacao futura de historico contaminado.

Ainda pendente:

- confirmar se todos os servicos entram no online;
- confirmar se tecnicos como Luzes/Pigmentacao podem usar 60 min como agenda padrao;
- confirmar se produtos devem entrar no PDV real desde a primeira sprint;
- definir politica de estoque inicial em banco persistente;
- definir data de corte de operacao real.

## 8. Comparacao servicos reais vs banco atual

Consulta readonly local em `unit-01`:

| Metrica | Valor |
| --- | ---: |
| Servicos analisados | 7 |
| Servicos ativos | 7 |
| Servicos inativos | 0 |
| Com marcador demo/teste/TG | 5 |
| Candidatos publicos atuais sem marcador | 2 |
| Com historico | 7 |

| ID atual | Nome atual | Preco | Duracao | Marcador | Historico | Comparacao | Decisao |
| --- | --- | ---: | ---: | --- | --- | --- | --- |
| `svc-corte` | Corte Premium | R$ 75,00 | 45 min | sem marcador | 22 agend., 11 financ., 11 com. | Corresponde a Corte, mas nome/preco/duracao divergem. | Preservar como legado; preferir Corte canonico novo. |
| `svc-barba` | Barba Terapia | R$ 55,00 | 35 min | sem marcador | 42 agend., 14 financ., 14 com., 2 refunds | Corresponde a Barba, mas nome/preco/duracao divergem. | Preservar como legado; preferir Barba canonica nova. |
| `demo-svc-hidratacao` | Hidratacao Capilar | R$ 65,00 | 40 min | demo | 21 agend., 12 financ., 12 com. | Corresponde parcialmente a Hidratacao, mas origem e valores divergem. | Nao reaproveitar sem controle; preferir canonico novo. |
| `demo-svc-combo` | Combo Cabelo + Barba | R$ 115,00 | 75 min | demo | 23 agend., 11 financ., 11 com. | Parece combo, mas `Corte + Barba` ainda nao foi decidido como servico real. | Manter fora do real; decidir depois. |
| `demo-svc-degrade` | Degrade Navalhado | R$ 85,00 | 50 min | demo | 20 agend., 12 financ., 12 com. | Nao confirmado no catalogo real. | Legado/fora do catalogo real. |
| `demo-svc-sobrancelha` | Design de Sobrancelha | R$ 35,00 | 20 min | demo | 21 agend., 10 financ., 10 com. | Nao confirmado no catalogo real. | Legado/fora do catalogo real. |
| `a1ea4294-e3a9-42b5-b5e5-3ca719f5b483` | Servico Teste Comissao TG | R$ 100,00 | 30 min | teste/TG | 1 agend., 1 financ., 1 com. | Nao corresponde ao catalogo real. | Futuro inativar/ocultar com historico preservado. |

Servico real sem equivalente atual confiavel:

- Luzes;
- Pigmentacao.

Conclusao: nenhum servico atual deve ser apagado ou sobrescrito. Todos tem historico. Os canonicos reais devem ser novos registros em execucao controlada.

## 9. Comparacao produtos reais vs banco atual

Consulta readonly local em `unit-01`:

| Metrica | Valor |
| --- | ---: |
| Produtos analisados | 9 |
| Produtos ativos | 9 |
| Produtos inativos | 0 |
| Com marcador demo/teste/TG | 7 |
| Com historico de venda/estoque/financeiro/refund/consumo | 9 |

| Produto real | Equivalente atual | Venda atual | Custo atual | Estoque atual | Marcador | Historico | Decisao |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| Gel | Nenhum confiavel | N/A | N/A | N/A | N/A | N/A | Criar canonico futuro. |
| Pomada | `prd-pomada` Pomada Matte | R$ 59,00 | R$ 24,00 | 22 | sem marcador | 4 vendas, 4 financ., 3 com., 1 mov., 1 consumo | Preservar como legado; criar Pomada canonica. |
| Bucha para Dread | Nenhum confiavel | N/A | N/A | N/A | N/A | N/A | Criar canonico futuro. |
| Oleo para Barba | `prd-oleo-barba` Oleo para Barba | R$ 39,00 | R$ 14,00 | 18 | sem marcador | 2 vendas, 2 financ., 2 com., 1 mov., 1 consumo | Nome proximo, mas preco/custo/estoque divergem; preferir canonico novo. |
| Shampoo | `demo-prd-shampoo` Shampoo Anticaspa Premium | R$ 49,00 | R$ 19,00 | 30 | demo | 3 vendas, 3 financ., 3 com., 1 mov. | Nao reaproveitar; criar Shampoo canonico. |
| Condicionador | `demo-prd-cond` Condicionador Reparador | R$ 45,00 | R$ 17,00 | 28 | demo | 2 vendas, 2 financ., 2 com., 1 mov. | Nao reaproveitar; criar Condicionador canonico. |
| Mascara de Hidratacao | Nenhum confiavel | N/A | N/A | N/A | N/A | N/A | Criar canonico futuro. |

Produtos atuais fora do catalogo real confirmado:

| Produto atual | Marcador | Historico | Decisao |
| --- | --- | --- | --- |
| `demo-prd-kit` Kit Cuidado Completo | demo | 2 vendas, 2 financ., 2 com. | Legado; bloquear venda futura em execucao controlada. |
| `demo-prd-lamina` Lamina Profissional (pacote) | demo | 1 venda, 1 financ., 1 com., 1 mov. | Legado; bloquear venda futura em execucao controlada. |
| `demo-prd-perfume` Perfume Tradicional 100ml | demo | 2 vendas, 2 financ., 2 com. | Legado; bloquear venda futura em execucao controlada. |
| `demo-prd-talco` Talco Pos-Barba | demo | 2 vendas, 2 financ., 2 com., 1 mov. | Legado; bloquear venda futura em execucao controlada. |
| `63e543a2-5430-457b-a9d1-919c101ad967` Produto Teste Estoque TG | teste/TG | 1 venda, 1 financ., 1 com., 3 mov., 1 refund | Futuro inativar/bloquear com historico preservado. |

Conclusao: nenhum produto atual deve ser apagado ou sobrescrito. Todos tem historico. O catalogo de produtos reais deve nascer como canonicos novos, com estoque inicial aplicado apenas em ambiente autorizado.

## 10. Estrategia recomendada para canonicos

Estrategia: criar canonicos novos em execucao controlada, manter atuais como legado/historico.

Servicos canonicos futuros:

| Canonico | Preco | Duracao inicial proposta | Observacao |
| --- | ---: | ---: | --- |
| Corte | R$ 30,00 | 30 min | Confirmado; validar online. |
| Barba | R$ 20,00 | 30 min | Confirmado; validar online. |
| Hidratacao | R$ 20,00 | 30 min | Confirmado; validar duracao/publicacao. |
| Luzes | R$ 50,00 | 60 min | Confirmado; tecnico/variavel. |
| Pigmentacao | R$ 45,00 | 60 min | Confirmado; envolve preparacao de produto. |

Produto canonico futuro:

- Gel;
- Pomada;
- Bucha para Dread;
- Oleo para Barba;
- Shampoo;
- Condicionador;
- Mascara de Hidratacao.

Regra CTO:

1. Nao transformar registro demo/teste em real sem decisao explicita.
2. Nao alterar preco/estoque/duracao de registro com historico.
3. Nao apagar historico.
4. Usar data de corte para separar legado de operacao real.
5. Criar canonicos primeiro em fixture/local, depois em alvo persistente com backup e aprovacao.

## 11. Fluxo minimo da Sprint 227 real

A Sprint 227 real deve validar, em ordem:

1. Criar ou usar cliente controlado.
2. Criar agendamento controlado com servico canonico.
3. Ver snapshot do servico no agendamento.
4. Remarcar usando duracao efetiva do agendamento.
5. Marcar atendimento como `CONFIRMED`.
6. Marcar atendimento como `IN_SERVICE`.
7. Encerrar sem checkout financeiro real, ou executar checkout explicitamente simulado se a regra da sprint permitir.
8. Confirmar que nao gerou financeiro indevido.
9. Confirmar agenda/historico com dados corretos.
10. Confirmar auditoria.
11. Confirmar que cancelamento/remarcacao nao quebram slot.

Nao executar esse fluxo em producao nesta sprint.

## 12. Gates para liberar Sprint 227 real

A Sprint 227 real so pode ser liberada quando:

- servicos canonicos definidos;
- produtos canonicos definidos ou explicitamente fora do escopo;
- migration de snapshot aplicada no alvo correto antes do deploy/codigo dependente;
- backup/checksum feito se houver mutacao em producao;
- plano de restore documentado;
- dry-run readonly atualizado imediatamente antes da execucao;
- dados demo/teste nao aparecem no fluxo real;
- usuario/profissional real definido;
- agenda/horarios validados;
- checkout real bloqueado ou claramente simulado;
- financeiro/comissoes antigos tratados por data de corte;
- plano de rollback aprovado;
- aprovacao explicita do usuario para qualquer mutacao real.

## 13. O que pode ser validado local/teste agora

Pode validar em `DATA_BACKEND=memory` ou fixture local:

- criacao de agendamento com snapshot;
- leitura de detalhe e relatorio usando snapshot;
- remarcacao com duracao efetiva;
- cancelamento liberando slot;
- transicao `CONFIRMED` -> `IN_SERVICE`;
- ausencia de financeiro quando nao ha checkout;
- checkout simulado apenas em teste automatizado, se o caso exigir.

Nao validar em producao:

- criacao de cliente real;
- agendamento real;
- checkout real;
- venda real;
- estoque real;
- pagamento/comissao/refund real.

## 14. Testes adicionados/alterados

Teste adicionado em `tests/api.spec.ts`:

- `mantem fluxo de atendimento controlado sem checkout real nem financeiro indevido`.

O teste usa `DATA_BACKEND=memory` e valida:

- cancelamento libera o mesmo slot para outro agendamento;
- remarcacao mantem a duracao efetiva do fixture atual;
- transicao ate `IN_SERVICE` funciona;
- sem checkout, `/financial/transactions` permanece sem receita/despesa no periodo controlado.

Testes ja existentes continuam cobrindo:

- snapshot de servico em novos agendamentos apos alteracao de catalogo;
- fallback legado para agendamento sem snapshot;
- checkout usando snapshot;
- bloqueio de remarcacao em conflito;
- cancelados/concluidos/no-show ignorados para conflito de agenda.

## 15. O que nao foi feito por seguranca

Nao foi feito:

- criacao de servico real;
- alteracao de servico real;
- criacao de produto real;
- alteracao de produto real;
- alteracao de estoque;
- checkout real;
- venda real;
- pagamento real;
- comissao real;
- refund/estorno real;
- lancamento financeiro real;
- seed;
- migration;
- backfill;
- alteracao de `.env`;
- deploy;
- PM2 restart/reload;
- Nginx/firewall/certificado;
- limpeza de historico;
- producao.

## 16. Riscos P0/P1/P2/P3

| Severidade | Risco | Status/Mitigacao |
| --- | --- | --- |
| P0 | Usar dados demo/teste como reais e operar agenda/financeiro contaminados. | Mitigado por gate; Sprint 227 real ainda bloqueada. |
| P0 | Alterar preco/duracao/estoque de registros com historico e distorcer passado. | Nao executado; recomendar canonicos novos. |
| P0 | Rodar codigo dependente de snapshot em producao sem migration aplicada. | Bloqueado; producao nao assumida como atualizada. |
| P1 | Criar servicos tecnicos com duracao inadequada. | Usar duracao apenas como proposta local/teste; validar com Geovane. |
| P1 | Estoque inicial real divergir do banco. | Nao alterar estoque; criar em fixture/local primeiro. |
| P1 | `Corte + Barba` virar combo sem decisao. | Mantido como pendencia explicita. |
| P2 | Relatorios antigos sem financeiro persistido ainda dependerem de fallback. | Documentado desde 226.6/226.7. |
| P2 | Produtos reais ficarem fora do escopo e PDV continuar contaminado. | Gate exige decisao de escopo antes da Sprint 227 real. |
| P3 | Documento ficar defasado apos novas respostas. | Reexecutar readonly antes de qualquer mutacao. |

## 17. Por que Sprint 227 real ainda nao foi executada

Porque a base atual continua contaminada:

- todos os 7 servicos atuais possuem historico;
- 5 dos 7 servicos atuais tem marcador demo/teste/TG;
- todos os 9 produtos atuais possuem historico;
- 7 dos 9 produtos atuais tem marcador demo/teste/TG;
- produtos reais confirmados nao batem com preco/custo/estoque dos equivalentes atuais;
- producao ainda nao deve ser assumida como atualizada com a migration de snapshot;
- checkout real e financeiro real nao devem rodar sem data de corte e autorizacao.

Executar a Sprint 227 real agora consolidaria o risco que o bloco 226.x tentou evitar.

## 18. Opiniao tecnica CTO

| Pergunta | Resposta CTO |
| --- | --- |
| Esta etapa foi util ou burocratica? | Util. Ela transforma dados reais em plano acionavel e evita mutacao contaminada. |
| Ja temos dados suficientes para sair do 226.x? | Sim, para sair do diagnostico bloqueado e entrar em validacao local/teste. |
| Servicos atuais sao confiaveis? | Nao como canonicos. `svc-corte` e `svc-barba` sao candidatos legados, mas divergem de preco/duracao/nome. |
| Produtos atuais sao confiaveis? | Nao como canonicos. Ate os sem marcador divergem de preco/custo/estoque. |
| Criar canonicos novos ou atualizar existentes? | Criar canonicos novos. Atualizar existentes com historico e risco desnecessario. |
| O que impede Sprint 227 real? | Canonicos ainda nao criados em fluxo controlado, producao sem migration assumida, financeiro/estoque ainda sensiveis e falta autorizacao de mutacao. |
| Da para validar algo local/teste antes? | Sim; teste de fluxo sem checkout foi adicionado e passou. |
| Sprint 227 real pode ser liberada agora? | Nao. Liberar agora seria prematuro. |
| Proxima acao mais util | Sprint 227.1 local/teste com fixture de canonicos reais e fluxo completo sem financeiro real. |
| Discordancia tecnica | Discordo de tentar reaproveitar registros atuais para economizar trabalho. O custo de misturar legado com real e maior que criar canonicos limpos. |

## 19. Decisao final

Decisao final: Sprint 227.0 APROVADA COMO GATE DE TRANSICAO.

O projeto pode sair do bloco 226.x, mas a Sprint 227 real permanece bloqueada. A proxima sprint deve validar canonicos reais em fixture/local antes de qualquer mutacao persistente.

## 20. Proxima sprint recomendada

Recomendacao: Sprint 227.1 - Execucao controlada local/teste do fluxo de atendimento com dados canonicos.

Escopo recomendado:

1. Criar fixture local com servicos canonicos reais.
2. Criar fixture local com produtos canonicos reais, se PDV entrar no escopo.
3. Validar agendamento com snapshot.
4. Validar remarcacao e cancelamento.
5. Validar `CONFIRMED` e `IN_SERVICE`.
6. Validar fluxo sem checkout real.
7. Validar que financeiro permanece zerado quando checkout nao roda.
8. Validar checkout apenas simulado, se explicitamente incluido.
9. Nao tocar producao.
10. Preparar runbook da futura mutacao persistente com backup/rollback.

Sprint 227.1 deve ser pratica, local/teste e sem producao.

## 21. Validacoes executadas nesta sprint

| Comando/acao | Resultado |
| --- | --- |
| `pwd` | `/root/software-barbearia` |
| `git status -sb` | `## main...origin/main` no inicio |
| `git log --oneline -10` | HEAD `d32b4e4 docs: registrar aplicacao controlada da migration de snapshot` |
| Leitura `.planning/226_2_DRY_RUN_SANEAMENTO_DADOS_INTERNOS.md` | Concluida |
| Leitura `.planning/226_3_PLANO_TECNICO_SANEAMENTO_CONTROLADO.md` | Concluida |
| Leitura `.planning/226_5_CATALOGO_REAL_GEOVANE_PLANO_SANEAMENTO.md` | Concluida |
| Leitura `.planning/226_6_BLINDAGEM_RELATORIOS_HISTORICOS_PRECO_SERVICO.md` | Concluida |
| Leitura `.planning/226_7_SNAPSHOT_SERVICO_NOVOS_AGENDAMENTOS.md` | Concluida |
| Leitura `.planning/226_8_APLICACAO_CONTROLADA_MIGRATION_SNAPSHOT.md` | Concluida |
| Classificacao do `DATABASE_URL` | `LOCAL`, PostgreSQL `127.0.0.1`, banco `barbearia` |
| Consulta readonly de servicos/produtos/migration | Concluida, sem mutacao |
| `npx vitest run tests/api.spec.ts -t "fluxo de atendimento controlado"` | Passou |
| `npx vitest run tests/api.spec.ts -t "agendamento"` | Passou, 10 testes executados |
| `npx vitest run tests/api.spec.ts -t "snapshot"` | Passou, 2 testes executados |
| `npx vitest run tests/api.spec.ts -t "checkout"` | Passou, 5 testes executados |
| `npm test` | Passou em execucao isolada: 8 arquivos passaram, 1 skipped; 130 testes passaram, 19 skipped |
| `npx tsc --noEmit` | Passou |
| `npm run build` | Passou |
| `git diff --check` | Passou |
| `git diff --cached --check` | Passou |

Observacao de validacao: uma primeira tentativa de `npm test` em paralelo com `tsc` e `build` falhou por timeout em 3 testes de dashboard, e o build paralelo foi morto com codigo 137. A reexecucao isolada passou. A falha foi tratada como contencao de ambiente, nao como regressao funcional.
