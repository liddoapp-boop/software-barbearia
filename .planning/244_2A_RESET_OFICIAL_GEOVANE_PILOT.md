# Macro 244.2A - Reset oficial do banco piloto Geovane

## Quando usar

Use este procedimento somente para devolver o banco local `barbearia_pilot` ao estado inicial canonico da Barbearia Geovane Borges, depois de testes operacionais controlados. O script preserva o owner e seu hash de senha atual e recria unidade, profissional, horarios, servicos, regra Corte + Barba, formas de pagamento, produtos e o estoque inicial informado pelo Geovane.

## Quando nao usar

Nao use em producao, em banco remoto, em banco diferente de `barbearia_pilot`, com backend diferente de Prisma, como migration, como seed generico ou para corrigir dados pontuais. O reset remove permanentemente clientes, agenda, checkouts, vendas, financeiro, estoque operacional, auditoria e os demais dados do banco piloto.

O alvo e o backend sao carregados exclusivamente de `.env.pilot.local`, sem alterar o arquivo. `NODE_ENV=production` e recusado tanto quando estiver no processo quanto no arquivo. O script recusa:

- `NODE_ENV=production`;
- host diferente de `localhost` ou `127.0.0.1`;
- banco diferente de `barbearia_pilot`;
- `DATA_BACKEND` diferente de `prisma`;
- modo real sem a confirmacao literal exigida;
- modo real sem um dump PostgreSQL existente, nao vazio e reconhecido por `pg_restore --list`.

O validador procura `pg_restore` em `PG_RESTORE_PATH`, no `PATH` e nas instalacoes padrao do PostgreSQL no Windows. Se a ferramenta estiver em outro local, defina `PG_RESTORE_PATH` somente no processo que executara o reset.

## Dry-run

O comando npm e seguro por padrao: sem `--execute`, o script sempre usa dry-run.

```powershell
npm run db:reset:geovane-pilot
```

Tambem e possivel chamar o arquivo diretamente:

```powershell
node scripts/reset-geovane-pilot.mjs --dry-run
```

O dry-run abre somente leituras, lista a quantidade atual em cada modelo e o estado que seria recriado. Antes e depois da simulacao, calcula SHA-256 deterministico de todo o estado logico acessivel pelo Prisma e falha se os hashes divergirem.

## Reset real

Antes do reset, gere e valide um backup fora do repositorio. O modo real exige simultaneamente `--execute`, a flag literal de confirmacao e o caminho do backup:

```powershell
npm run db:reset:geovane-pilot -- --execute --confirm-reset-geovane-pilot --backup="C:\caminho\barbearia_pilot_YYYYMMDD_HHMMSS.dump"
```

O script valida o dump com `pg_restore --list`, registra no terminal o caminho absoluto, tamanho e hash SHA-256 e somente depois inicia uma transacao serializavel. A limpeza e a recriacao canonica acontecem na mesma transacao; qualquer erro reverte o conjunto inteiro.

## Estado esperado depois de um reset real

- 1 unidade `Barbearia Geovane Borges`;
- 1 owner ativo e 1 acesso owner, com credencial preservada;
- 1 profissional `Geovane Borges`;
- 5 servicos, 1 regra de combinacao e os vinculos do profissional;
- 2 metodos de pagamento: Dinheiro e Pix;
- 6 produtos com estoque inicial canonico total igual a 73: Gel 30, Pomada 10, Bucha 3, Shampoo 10, Condicionador 10 e Mascara 10;
- 0 clientes;
- 0 agendamentos e bloqueios;
- 0 checkouts e pagamentos de checkout;
- 0 vendas e estornos;
- 0 lancamentos financeiros, comissoes ou fechamentos;
- 6 movimentos oficiais de entrada do estoque inicial, um por produto, com `movementType=IN` e `referenceType=INITIAL_STOCK`;
- 0 contagens ou outros movimentos operacionais de estoque;
- 0 dados de demonstracao.

## Estado estabilizado depois do primeiro login

O reset transacional deixa `TeamMember=0`. Esse contador muda de forma esperada na primeira carga autenticada de configuracoes: `getSettingsOverview` chama `ensureTeamMembers` e cria o cadastro essencial de equipe do owner quando a unidade ainda nao possui membros.

Depois dessa carga, o estado canonico e:

- `TeamMember=1`;
- nome `Geovane Borges`;
- `role=OWNER`;
- `accessProfile=owner`;
- ativo e vinculado a `unit-geovane-borges`.

Esse registro e distinto do `Professional` usado na agenda e nos servicos. Ele nao representa cliente, agendamento, venda, financeiro, checkout ou dado de demonstracao residual.

## Riscos e recuperacao

O reset real e destrutivo e nao possui desfazer. Um caminho incorreto, um backup antigo ou um dump que nao corresponda ao estado desejado pode causar perda de dados do piloto. Confirme manualmente banco, host, data, tamanho e SHA-256 do backup antes de usar a flag real. Em caso de erro apos o commit da transacao, pare a aplicacao e restaure o dump validado com o procedimento oficial de restore; nao improvise SQL nem rode seed generico.

Nunca execute o reset com a API gravando no mesmo banco. A validacao serializavel reduz corridas durante a transacao, mas nao substitui uma janela operacional exclusiva.
