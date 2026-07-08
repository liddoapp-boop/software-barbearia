# Macro 235.3 - Banco limpo e dados reais do piloto

Data: 2026-07-08

## Decisao

BANCO LIMPO CRIADO - AGUARDANDO DADOS DO GEOVANE.

O banco local `barbearia_pilot` foi criado em `localhost:5432`, recebeu as 21 migrations do repositorio e ficou sem registros de negocio nas tabelas exigidas. Nenhum seed generico foi executado.

Nao houve acesso a VPS, producao ou banco remoto. O banco antigo `barbearia` foi consultado somente em transacoes `READ ONLY` com `ROLLBACK`.

## Estado inicial

- Branch: `main`
- HEAD: `db519c2`
- Ahead/behind de `origin/main...HEAD`: `0 0`
- Worktree inicial: limpo
- Banco configurado no projeto: `localhost:5432/barbearia`
- Servidor observado: PostgreSQL 18.3 em `::1:5432`

## Banco do piloto

- Banco: `barbearia_pilot`
- Situacao inicial: inexistente
- Acao: criado localmente
- Aplicacao de schema: `npx prisma migrate deploy` com `DATABASE_URL` temporaria apontando para `barbearia_pilot`
- `.env`: nao alterado
- Seed generico: nao executado
- Smoke mutavel: nao executado

Migrations:

- Diretórios locais de migration: 21
- Migrations aplicadas em `_prisma_migrations`: 21
- Migrations falhas: 0
- `npx prisma migrate status`: schema em dia
- `AppointmentBlock`: presente

## Limpeza pos-migration no piloto

A migration `20260523_professional_unit_scope` criou o bootstrap legado:

| Entidade | ID | Nome | Motivo |
| --- | --- | --- | --- |
| Unit | `unit-01` | `Unidade Padrao` | Placeholder criado por migration antiga |

Como a macro exige banco limpo, proibe usar placeholders e pede `Unit` com zero registros de negocio, esse registro foi removido apenas do banco `barbearia_pilot`.

A remocao foi feita em transacao com travas logicas:

- recusava banco diferente de `barbearia_pilot`;
- exigia exatamente 1 registro em `Unit`;
- exigia que o registro fosse `id = unit-01` e `name = Unidade Padrao`;
- removeu 1 linha.

## Banco piloto vazio

Contagens finais:

| Entidade | Registros |
| --- | ---: |
| Unit | 0 |
| User | 0 |
| UserUnitAccess | 0 |
| Professional | 0 |
| Service | 0 |
| Client | 0 |
| Appointment | 0 |
| AppointmentBlock | 0 |
| Product | 0 |
| StockMovement | 0 |
| ProductSale | 0 |
| CheckoutPayment | 0 |
| FinancialEntry | 0 |
| AuditLog | 0 |

## Auditoria somente leitura do banco antigo

Banco consultado: `barbearia`.

Todas as consultas de auditoria foram executadas dentro de `BEGIN READ ONLY` e finalizadas com `ROLLBACK`.

Resumo dos achados:

| Entidade | ID | Nome | Status | Preco/duracao/valor | Possivel dado real | Motivo da duvida |
| --- | --- | --- | --- | --- | --- | --- |
| Professional | `pro-geovane-borges` | `Geovane Borges` | ativo | - | Sim | Nome bate com o profissional esperado, mas esta vinculado a `unit-01 / Unidade Teste`. |
| Unit | `unit-01` | `Unidade Teste` | - | timezone `America/Sao_Paulo` | Nao confirmado | Nome e contexto indicam placeholder/teste. A macro proibe usar `Unidade Teste`. |
| BusinessSettings | `2d2a6249-b6eb-4522-8117-4ba67785591e` | `Unidade Teste` | - | duracao padrao 45; antecedencia minima 30; buffer 0 | Nao confirmado | Configuracao institucional esta em unidade de teste, sem telefone, e-mail ou endereco preenchidos. |
| BusinessHour | `unit-01` | Horarios da unidade | ativo exceto domingo | seg-sex 08:00-20:00; sab 08:00-14:00; dom fechado | Duvidoso | Pode ser configuracao operacional, mas esta vinculada a `Unidade Teste` e precisa confirmacao. |
| PaymentMethod | varios | Dinheiro, Pix, Cartao de debito, Cartao de credito | ativos; Pix default | - | Duvidoso | Formas comuns, mas podem ser canonicas/teste. Precisa confirmacao. |
| Service | `canon-svc-barba` | Barba | ativo | 20.00 / 30 min | Duvidoso | Servico canonico vinculado ao Geovane, mas origem parece padrao/canonica. |
| Service | `canon-svc-corte` | Corte | ativo | 30.00 / 30 min | Duvidoso | Servico canonico vinculado ao Geovane, mas origem parece padrao/canonica. |
| Service | `canon-svc-corte-barba` | Corte + Barba | ativo | 50.00 / 45 min | Duvidoso | Servico canonico vinculado ao Geovane, mas origem parece padrao/canonica. |
| Service | `canon-svc-hidratacao` | Hidratacao | ativo | 20.00 / 30 min | Duvidoso | Servico canonico vinculado ao Geovane, mas origem parece padrao/canonica. |
| Service | `canon-svc-luzes` | Luzes | ativo | 50.00 / 60 min | Duvidoso | Servico canonico vinculado ao Geovane, mas origem parece padrao/canonica. |
| Service | `canon-svc-pigmentacao` | Pigmentacao | ativo | 45.00 / 60 min | Duvidoso | Servico canonico vinculado ao Geovane, mas origem parece padrao/canonica. |
| Service | `svc-corte` | Corte Manual 232A | inativo | 60.00 / 30 min | Nao | Nome indica dado de desenvolvimento/manual. |
| Product | `canon-prd-bucha-nudread` | Bucha Nudread | ativo | venda 25.00; estoque 3; minimo 0 | Duvidoso | Produto canonico/teste, precisa confirmacao antes de copiar. |
| Product | `canon-prd-condicionador` | Condicionador | ativo | venda 25.00; estoque 10; minimo 0 | Duvidoso | Produto canonico/teste, precisa confirmacao antes de copiar. |
| Product | `canon-prd-gel` | Gel | ativo | venda 10.00; estoque 30; minimo 0 | Duvidoso | Produto canonico/teste, precisa confirmacao antes de copiar. |
| Product | `canon-prd-mascara-hidratacao` | Mascara de Hidratacao | ativo | venda 30.00; estoque 10; minimo 0 | Duvidoso | Produto canonico/teste, precisa confirmacao antes de copiar. |
| Product | `canon-prd-oleo-barba` | Oleo para Barba | ativo | venda 35.00; estoque 4; minimo 0 | Duvidoso | Produto canonico/teste, precisa confirmacao antes de copiar. |
| Product | `canon-prd-pomada` | Pomada | ativo | venda 25.00; estoque 10; minimo 0 | Duvidoso | Produto canonico/teste, precisa confirmacao antes de copiar. |
| Product | `canon-prd-shampoo` | Shampoo | ativo | venda 25.00; estoque 10; minimo 0 | Duvidoso | Produto canonico/teste, precisa confirmacao antes de copiar. |

Achados adicionais:

- Nao ha `UserUnitAccess` para a unidade `unit-01`.
- Nao ha usuario com nome ou e-mail contendo `geovane` ou `borges`.
- Existem 23 usuarios com role `owner`, mas os e-mails seguem padrao gerado `owner-...@barbearia.local`; nenhum foi considerado confiavel para o piloto.
- Nao foram consultados ou expostos dados pessoais de clientes.
- Nenhuma senha, hash ou token foi registrado.

## Dados confirmados

Unico dado institucional confirmado:

- `Barbearia Geovane Borges`

Registro esperado, mas ainda nao confirmado:

- Profissional: Geovane, possivelmente relacionado ao registro `pro-geovane-borges`.

Nota posterior:

- A Macro 237 recebeu novos dados operacionais confirmados para o piloto e substitui esta secao para fins de provisionamento.
- Este documento permanece como evidencia de criacao do banco limpo e da auditoria inicial somente leitura.

## Dados pendentes

Perguntas para Joao/Geovane:

1. Estabelecimento: telefone publico, endereco exibido, timezone e dias/horarios de funcionamento.
2. Owner: nome, e-mail de acesso, forma segura de definir a senha e vinculo com a unidade.
3. Profissional: nome de exibicao, horarios, intervalos e folgas.
4. Servicos: para cada servico, nome, preco, duracao, disponibilidade no booking e status ativo/inativo.
5. Produtos: para cada produto, nome, preco, estoque inicial, estoque minimo e status ativo/inativo.
6. Pagamentos: confirmar dinheiro, Pix, cartao, pagamento dividido e pagamento parcial.
7. Booking: telefone publico, antecedencia minima, antecedencia maxima, servicos disponiveis, horarios e politica de cancelamento.

## Decisao operacional

Faltam dados essenciais para provisionar o piloto com seguranca. Portanto:

- `barbearia_pilot` permanece somente com schema;
- nenhuma unidade real foi criada;
- nenhum owner foi criado;
- nenhuma senha padrao foi definida;
- nenhum servico ou produto foi copiado automaticamente;
- nenhum smoke mutavel foi executado.

Proxima etapa, apos receber os dados:

`Macro 235.3.1 - Provisionamento controlado dos dados reais`

Nao iniciar automaticamente.

## Git

- Commit realizado: nao
- Push realizado: nao
- Arquivo criado: `.planning/235_3_BANCO_LIMPO_DADOS_PILOTO.md`
