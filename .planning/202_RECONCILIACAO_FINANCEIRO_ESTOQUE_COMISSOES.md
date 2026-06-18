# 202 - Reconciliacao financeiro, estoque e comissoes

Data: 2026-06-17

Escopo: Fase 2.2 - reconciliacao de PDV/produtos, estoque, financeiro e comissoes com massa conhecida, backup previo e reversao documentada.

## 1. Resumo executivo

A fase validou, no ambiente publico atual, os fluxos integrados de venda de produto, baixa e retorno de estoque, lancamentos financeiros, checkout de servico, geracao de comissao e pagamento de comissao. Nao houve deploy, restart PM2, firewall, certificado, migration, seed, alteracao de codigo, alteracao de regra de negocio, `git add`, commit ou push.

O fluxo principal passou: estoque baixou e voltou pelo caminho oficial de devolucao, financeiro gerou receitas e despesas esperadas, checkout gerou comissao de servico correta, pagamento de comissao gerou despesa unica e os replays com a mesma chave de idempotencia retornaram o mesmo efeito.

Decisao da fase: **APROVADO COM RESSALVAS**.

## 2. Validacoes base

| Validacao | Resultado |
| --- | --- |
| `git status --short` | limpo antes da fase |
| `git status -sb` | `main...origin/main` |
| Health publico | `{"ok":true,"authEnforced":true}` |
| PM2 | `software-barbearia` online |
| Nginx | ativo |
| PostgreSQL | ativo |
| UFW | ativo; 80/443/22 permitidos; 3333 negado |
| Sockets | app em `127.0.0.1:3333`; sem `0.0.0.0:3333` |

## 3. Backup previo

Backup PostgreSQL criado antes dos testes:

- Arquivo: `/root/software-barbearia-backups/barbearia_pre_finance_stock_commission_20260617_222020.sql`
- Tamanho: `1904947` bytes
- SHA-256: `cc2f7f746f5272c45179834a83b221b4822bd5bd5120dceaa2f0eb5226643aed`
- Permissao: `-rw------- root:root`

Duas tentativas anteriores geraram arquivos vazios por incompatibilidade do `pg_dump` com parametro de URL Prisma e carregamento de ambiente. Esses arquivos vazios foram removidos antes da execucao valida. Nenhum valor de `.env`, senha, token, hash ou `DATABASE_URL` foi impresso ou registrado.

## 4. Massa conhecida

Run ID: `fase22-20260617222630`

IDs principais:

| Entidade | ID |
| --- | --- |
| Cliente de teste | `c563fcf3-2ffd-47c3-8856-e58bcb11c03e` |
| Produto de teste | `63e543a2-5430-457b-a9d1-919c101ad967` |
| Profissional de teste criado | `6a063462-e0cb-4d02-a3cb-f91e26b2901a` |
| Profissional usado na comissao | `demo-pro-02` |
| Servico de teste | `a1ea4294-e3a9-42b5-b5e5-3ca719f5b483` |
| Venda de produto | `085e215b-7c65-4904-b6aa-fa395d3c20df` |
| Devolucao de produto | `5d72da56-e30a-414e-9331-329db2b844ec` |
| Agendamento/checkout | `cb0d7450-df1b-4c00-a89a-0185f5f1f5b0` |
| Comissao de servico paga | `8a2154d3-a9b2-4e95-a4e1-4472e9fcb700` |

Observacao: foi criado um profissional de teste, mas a validacao de comissao usou o profissional existente `demo-pro-02`, pois ele ja possuia regra persistida de comissao de servico. Essa escolha evitou criar regra nova ou alterar regra de negocio.

## 5. Cenario A - venda de produto, estoque e financeiro

Resultado: **passou**.

- Chave de idempotencia: `fase22-20260617222630-sale`
- Quantidade vendida: `2`
- Estoque antes: `10`
- Estoque apos venda: `8`
- Receita gerada: `04e000bf-1c3d-484e-aa92-fb865db42913`
- Valor da receita: `40`
- Replay com a mesma chave retornou a mesma venda, sem duplicar efeito.
- Auditoria encontrada para a acao.

Conclusao: a venda baixa estoque, gera receita financeira e respeita idempotencia.

## 6. Cenario B - devolucao de produto

Resultado: **passou com ressalva**.

- Chave de idempotencia: `fase22-20260617222630-refund`
- Devolucao: `5d72da56-e30a-414e-9331-329db2b844ec`
- Estoque apos devolucao: `10`
- Despesa gerada: `b6ffea68-de53-417d-a229-4ee4e5617b4a`
- Valor da despesa: `40`
- Movimento de estoque gerado: `1a1d3625-9e9e-4aeb-8fd2-78f63a9488bf`
- Replay com a mesma chave retornou a mesma devolucao, sem duplicar efeito.
- Auditoria encontrada para a acao.

Ressalvas:
- O campo exposto de valor da devolucao apareceu como `0`, embora a despesa financeira correta de `40` tenha sido gerada.
- O status direto de refund na venda apareceu `null` na leitura de banco usada para evidencia.
- A comissao de produto da venda permaneceu `PENDING` mesmo apos devolucao total.

Conclusao: estoque e financeiro foram reconciliados, mas a semantica de devolucao e o impacto em comissao de produto precisam correcao ou decisao documentada antes da entrega final.

## 7. Cenario C - agendamento, checkout, financeiro e comissao

Resultado: **passou**.

- Agendamento: `cb0d7450-df1b-4c00-a89a-0185f5f1f5b0`
- Chave de idempotencia: `fase22-20260617222630-checkout`
- Status final do agendamento: `COMPLETED`
- Receita de servico: `1917e476-4c42-4ed2-bbea-81324aea03f0`
- Valor da receita de servico: `100`
- Comissao de servico: `8a2154d3-a9b2-4e95-a4e1-4472e9fcb700`
- Taxa aplicada: `0.4`
- Valor esperado da comissao: `40`
- Valor gerado da comissao: `40`
- Replay com a mesma chave retornou o mesmo lancamento financeiro, sem duplicar efeito.
- Auditoria encontrada para criacao, checkout e efeitos relacionados.

Conclusao: checkout de servico esta reconciliando receita, status do atendimento, comissao e idempotencia.

## 8. Cenario D - pagamento de comissao

Resultado: **passou**.

- Comissao paga: `8a2154d3-a9b2-4e95-a4e1-4472e9fcb700`
- Chave de idempotencia: `fase22-20260617222630-commission-pay`
- Status final: `PAID`
- Despesa de comissao: `97b08563-d414-4310-ba44-40afb3f4f7db`
- Valor da despesa: `40`
- Quantidade de despesas para essa comissao: `1`
- Replay com a mesma chave retornou a mesma despesa, sem duplicar pagamento.
- Auditoria encontrada para a acao.

Conclusao: pagamento de comissao esta idempotente e gera despesa financeira unica.

## 9. Saldos e reconciliacao

| Item | Resultado |
| --- | --- |
| Estoque inicial do produto | `10` |
| Estoque final do produto | `10` |
| Delta de estoque | `0` |
| Receita venda produto | `40` |
| Despesa devolucao produto | `40` |
| Receita servico | `100` |
| Despesa pagamento comissao | `40` |
| Delta financeiro liquido esperado | `+60` |
| Delta financeiro liquido observado nas entradas da fase | `+60` |
| Delta bruto observado na soma simples de valores | `+220` |

A soma bruta de valores financeiros sobe `220` porque soma receitas e despesas em modulo absoluto. Para reconciliacao de caixa/resultado, o calculo correto desta fase e liquido: `40 - 40 + 100 - 40 = 60`.

Comissoes criadas na fase:

| Origem | ID | Valor | Status |
| --- | --- | --- | --- |
| Produto | `3cac61e8-5141-4536-bea8-ae1ae8fd9602` | `4` | `PENDING` |
| Servico | `8a2154d3-a9b2-4e95-a4e1-4472e9fcb700` | `40` | `PAID` |

A comissao de produto pendente apos devolucao total e um achado funcional relevante.

## 10. Auditoria e logs

Auditoria de negocio foi encontrada para venda, devolucao, checkout e pagamento de comissao. Logs PM2 pos-fase nao indicaram crash, loop de restart ou erro `500` critico.

Foi observado um erro Prisma tratado como resposta HTTP `400` durante tentativa de criar servico com `defaultCommissionRate=30`. O erro foi usado como evidencia de bug de validacao/modelo e nao gerou indisponibilidade do servico.

## 11. Cleanup e reversao

Decisao: **Opcao A - manter dados `TESTE TG` como evidencia rastreavel**.

Justificativa:
- A venda de produto foi revertida por devolucao oficial, restaurando estoque e criando despesa financeira correspondente.
- O checkout de servico, a comissao de servico e o pagamento da comissao foram mantidos como evidencia auditavel.
- Nao foi executado `DELETE` manual.
- Nao foi usado rollback de banco.

Dados que permanecem para evidencia:
- cliente/produto/servico/profissional de teste;
- venda e devolucao;
- agendamento concluido;
- comissao de servico paga;
- comissao de produto pendente, registrada como achado.

## 12. Bugs e riscos

### P0

Nenhum P0 confirmado. O sistema publico permaneceu saudavel, o health continuou OK e os fluxos principais nao quebraram o ambiente.

### P1

1. Resolvido na Fase 2.3: `defaultCommissionRate=30` agora e normalizado no backend para `0.3` antes de persistir.
2. Resolvido para novas operacoes na Fase 2.3: devolucao total de produto cancela comissao de produto pendente vinculada a venda usando status `CANCELED`.

Observacao: a comissao pendente historica da massa desta Fase 2.2 nao foi alterada manualmente no banco, conforme restricao operacional da Fase 2.3.

### P2

1. Valor/status expostos da devolucao precisam revisao: a despesa financeira correta foi gerada, mas a leitura de evidencia mostrou `refundAmount=0` e `refundStatus=null`.
2. A soma financeira bruta pode confundir demonstracao se apresentada sem distinguir receita, despesa e liquido.
3. O profissional de teste criado na preparacao ficou sem regra de comissao usada no cenario; para novos testes, criar ou escolher massa com regra documentada previamente.

### P3

1. Criar tela/relatorio de reconciliacao operacional por periodo ligando venda, devolucao, estoque, financeiro, comissao e auditoria.
2. Criar rotina de limpeza ou marcacao de dados `TESTE TG` para ambientes de demonstracao.

## 13. Arquivos de evidencia

Evidencia local gerada:

- `.planning/evidence/fase-202-reconciliacao/reconciliation-result.json`

O arquivo contem IDs tecnicos e valores de teste. Nao contem senha, token, hash, `.env`, `DATABASE_URL`, chave privada ou backup SQL.

## 14. Decisao final

**APROVADO COM RESSALVAS.**

Criterios atendidos:
- backup previo criado e validado;
- massa conhecida registrada;
- cenarios A, B, C e D executados;
- idempotencia validada nos fluxos criticos;
- estoque final reconciliado;
- financeiro liquido reconciliado;
- auditoria encontrada;
- servicos seguiram saudaveis;
- nenhum segredo foi exposto;
- nenhuma alteracao de codigo, banco estrutural, deploy, migration, seed, stage, commit ou push foi executada.

Ressalvas para fechar antes do TG:
- corrigir ou documentar o bug de escala de `defaultCommissionRate`;
- corrigir ou documentar o comportamento de comissao de produto apos devolucao;
- ajustar evidencia/UX de devolucao para nao mostrar valor/status ambiguos;
- explicar no TG a diferenca entre total bruto de lancamentos e resultado liquido.

## 15. Proxima etapa recomendada

Fase 2.3.1: validar `test:db` em banco isolado confirmado e commitar seletivamente a correcao dos P1. Depois, consolidar manual owner-only e texto academico.
