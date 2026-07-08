# Macro 237 - Provisionamento e preparacao do piloto

Data: 2026-07-08

## Decisao

PILOTO LOCAL PREPARADO - ACESSO OWNER PENDENTE.

O `barbearia_pilot` foi provisionado localmente com os dados reais confirmados para a Barbearia Geovane Borges. Nenhum owner ficticio, e-mail `@barbearia.local` ou senha padrao foi criado.

## Fechamento da Macro 236

Commits publicados em `origin/main`:

- `4da3860 fix: endurecer contingencias operacionais da agenda e checkout`
- `769de00 docs: registrar banco limpo e cenarios reais da operacao`

Validacoes antes do push:

- `npm test`: passou, 276 testes passed e 38 skipped.
- `npm run test:db`: passou em `barbearia_test`, 38 testes passed.
- `npx tsc --noEmit`: passou.
- `npm run build`: passou.
- `git diff --check`: passou, apenas avisos de CRLF do Git.

## Salvaguardas

| Salvaguarda | Resultado |
| --- | --- |
| Estoque negativo | Bloqueado em venda, checkout e saida manual quando nao ha saldo suficiente. Nao cria movimento parcial nem financeiro inconsistente. |
| Fechamento com pendencias | Corrigido: fechamento diario bloqueia atendimento `IN_SERVICE` e checkout `OPEN`/pagamento pendente. |
| Mensagens criticas | Respostas HTTP permanecem humanas para conflito, saldo insuficiente, permissao/sessao e API indisponivel. Nao houve redesign. |

## Matriz canonica curta

| Entidade | Valor | Fonte | Situacao |
| --- | --- | --- | --- |
| Unidade | Barbearia Geovane Borges | Macro 237 | CONFIRMADO |
| Timezone | America/Sao_Paulo | Macro 237 | CONFIRMADO |
| Owner/profissional | Geovane Borges, unico owner e unico profissional | Macro 237; `.planning/229_1B1...` | CONFIRMADO |
| Recepcionista | Nao ha | Macro 237; `.planning/229_1B1...` | CONFIRMADO |
| Horario seg-sex | 09:00-19:00, pausa 12:00-13:00 | Macro 237 | CONFIRMADO |
| Horario sabado | 09:00-14:00 | Macro 237 | CONFIRMADO |
| Domingo | Fechado | Macro 237 | CONFIRMADO |
| Blocos de agenda | 30 minutos | Macro 237 | CONFIRMADO |
| Corte | R$ 30,00 / 30 min | `.planning/227_0...`, `.planning/229_1B1...` | CONFIRMADO |
| Barba | R$ 20,00 / 30 min | `.planning/227_0...`, `.planning/229_1B1...` | CONFIRMADO |
| Hidratacao | R$ 20,00 / 30 min | `.planning/227_0...`, `.planning/229_1B1...` | CONFIRMADO |
| Luzes | R$ 50,00 / 60 min | `.planning/227_0...`, `.planning/229_1B1...` | CONFIRMADO |
| Pigmentacao | R$ 45,00 / 60 min | `.planning/227_0...`, `.planning/229_1B1...` | CONFIRMADO |
| Corte + Barba | Regra de combinacao R$ 50,00 / 45 min | `.planning/229_1B1...` | CONFIRMADO |
| Produtos | Gel 5,50; Pomada 7,50; Bucha 12,50; Shampoo 7,50; Condicionador 7,50; Mascara 7,50 | Macro 237 | CONFIRMADO |
| Estoque inicial real | Quantidades reais nao localizadas como confirmadas | Macro 237; auditoria `.planning` | AUSENTE |
| Pagamentos | Dinheiro e Pix | Macro 237; cash explicitado para idosos, Pix ja validado no fluxo | CONFIRMADO |
| Cartoes | Debito/credito aparecem em seed/config antigas, sem confirmacao atual | `.planning/235_3...` | AUSENTE |
| Setor feminino | Somente quartas | Macro 237 | CONFIRMADO como politica; AUSENTE como campo estruturado no schema |
| E-mail/credencial owner | Nao encontrado em fonte confiavel | Busca em `.planning` e anexos | AUSENTE |

## Provisionamento

Script criado:

- `scripts/provision-geovane-pilot.mjs`

Caracteristicas:

- aceita somente `localhost`/`127.0.0.1`/`::1`;
- exige banco `barbearia_pilot`;
- recusa `barbearia`;
- verifica 21 migrations aplicadas e nenhuma falha;
- recusa placeholders, usuarios seed/dev e clientes de smoke/teste;
- usa transacao e IDs deterministicos;
- idempotente;
- nao imprime senha ou token.

Dados aplicados:

- `Unit`: `unit-geovane-borges`
- `Professional`: `pro-geovane-borges`
- `BusinessSettings`: nome, segmento, duracao padrao 30, walk-in permitido, fora de expediente e overbooking bloqueados.
- `BusinessHour`: 7 linhas, com pausa de segunda a sexta.
- `Service`: 5 servicos confirmados.
- `ServiceProfessional`: Geovane vinculado aos 5 servicos.
- `ServiceCombinationRule`: Corte + Barba, 45 min.
- `Product`: 6 produtos com preco confirmado.
- `PaymentMethod`: Dinheiro e Pix.

Estoque:

- Como o estoque inicial real nao foi confirmado, os produtos ficaram com `stockQty = 0` e `minStockAlert = 0`.
- Essa escolha impede venda indevida ate a contagem fisica inicial ser informada.

Owner:

- Nao criado.
- Acesso final depende de e-mail e credencial real.

## Validacao do piloto

Banco `barbearia_pilot` apos provisionamento:

- unidades: 1;
- usuarios: 0;
- clientes: 0;
- agendamentos: 0;
- audit logs: 0;
- movimentos de estoque: 0;
- financeiro: 0;
- profissional: 1;
- horarios: 7;
- servicos: 5;
- regra de combo: 1;
- produtos: 6;
- placeholders: 0;
- clientes de smoke/teste: 0.

Smoke readonly publico apontado para `barbearia_pilot`:

- `GET /health`: OK;
- `GET /public/business`: Barbearia Geovane Borges;
- `GET /public/services`: 5 servicos;
- `GET /public/services/svc-geovane-corte/professionals`: 1 profissional;
- `GET /public/working-hours`: 7 dias, timezone `America/Sao_Paulo`;
- `POST /public/services/preview`: Corte + Barba retorna R$ 50 e 45 min.

Smoke readonly autenticado:

- Nao executado porque nao ha owner real provisionado.
- Criar credencial temporaria ou seed violaria a regra da macro.

## Testes finais

Executados apos provisionamento:

- `npm test`: passou, 276 testes passed e 38 skipped.
- `npm run test:db`: passou, 38 testes passed.
- `npx tsc --noEmit`: passou.
- `npm run build`: passou.
- `git diff --check`: passou.

Observacao: uma tentativa paralela de `npm run test:db` falhou em `prisma generate` por lock de arquivo no Windows; reexecutado isoladamente e passou.

## Backup

Backup fora do repositorio:

- Arquivo: `C:\Projetos\backups-local\software-barbearia\237\barbearia_pilot_ready_20260708_115104.dump`
- Tamanho: 156336 bytes
- SHA-256: `42ACD93398152B7E92CC2862C1CD3CF15D0439D9B32C0845F45382BCDA15E9F0`
- `pg_restore --list`: 367 linhas

Restore validado em banco temporario:

```json
{"migrations":21,"units":1,"professionals":1,"businessHours":7,"services":5,"comboRules":1,"products":6,"productStockSum":0,"users":0,"clients":0,"fakeClients":0,"placeholders":0}
```

O banco temporario de restore foi removido.

## Riscos e pendencias

P0:

- Nenhum aberto.

P1:

- Nenhum aberto.

P2:

- E-mail e credencial final do owner pendentes.
- Estoque fisico inicial pendente.
- Cartoes e outras formas de pagamento precisam confirmacao antes de ativar.
- Setor feminino somente quartas esta registrado como politica, mas nao ha campo estruturado especifico no schema atual.
- Politicas comerciais definitivas de atraso, cancelamento, estorno e excecoes de estoque devem ser confirmadas no piloto.

## Decisao operacional

`barbearia_pilot` esta pronto para validacao humana curta, com acesso owner pendente.

Proxima etapa:

`Macro 238 - Piloto local controlado com o Geovane`

Nao iniciar automaticamente.
