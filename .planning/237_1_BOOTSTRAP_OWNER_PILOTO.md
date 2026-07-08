# Macro 237.1 - Bootstrap owner do piloto

Data: 2026-07-08

## Escopo

- Banco utilizado: `barbearia_pilot`.
- Host confirmado: local/loopback.
- Banco `barbearia`: nao alterado nesta macro.
- Unidade: `Barbearia Geovane Borges`.
- E-mail mascarado: `b***5@gmail.com`.

## Owner

- Owner criado: sim.
- Usuario ativo: sim.
- Role: `owner`.
- Vinculo criado: sim.
- Unidade vinculada: `Barbearia Geovane Borges`.
- Estado final: `users=1` e `UserUnitAccess=1`.
- Usuarios ficticios/dev encontrados: 0.

## Validacao

- Login manual aprovado pelo owner.
- `/auth/me`: validado com role `owner` e unidade `Barbearia Geovane Borges`.
- Agenda: validado.
- Clientes: validado.
- Financeiro: validado.
- Estoque: validado.
- Configuracoes: validado.
- Servicos: validado.
- Auditoria: validado.
- Rota protegida sem token: 401 validado.

## Produtos

- Causa do desaparecimento/zeramento: a carga anterior do piloto havia deixado os produtos com `stockQty=0` por tratar o estoque fisico como ausente; alem disso, o login web enviava `activeUnitId` fixo para `unit-01`, o que nao correspondia a unidade do piloto.
- Correcao realizada: o login web deixou de enviar `unit-01` fixo e o estoque canonico do piloto local foi restaurado pela API oficial de estoque com movimentacoes `IN` auditadas.
- Confirmacao apos reiniciar a API: problema nao retornou; o estoque permaneceu correto.
- Produtos ativos confirmados: 6.
- Estoque minimo confirmado: 0 para todos os produtos.
- Placeholders encontrados: 0.

| Produto | Categoria | Quantidade | Minimo | Preco |
| --- | --- | ---: | ---: | ---: |
| Bucha | Acessorio | 3 | 0 | R$ 12,50 |
| Condicionador | Cabelo | 10 | 0 | R$ 7,50 |
| Gel | Finalizacao | 30 | 0 | R$ 5,50 |
| Mascara | Tratamento | 10 | 0 | R$ 7,50 |
| Pomada | Finalizacao | 10 | 0 | R$ 7,50 |
| Shampoo | Cabelo | 10 | 0 | R$ 7,50 |

## Testes

- Validacao HTTP local: passou (`/auth/me`, Agenda, Clientes, Financeiro, Estoque, Configuracoes, Servicos, Auditoria e rota sem token).
- Testes focados auth/RBAC/produtos: passaram (`3` arquivos, `24` testes executados).
- `npm test`: passou (`23` arquivos, `277` testes; `1` arquivo e `38` testes skipped).
- `npm run build`: passou.
- `git diff --check`: passou.

## Backup

- Criado fora do repositorio:
  - `C:\Projetos\backups\barbearia_pilot_owner_ready_20260708_131739.dump`
  - Tamanho: 157587 bytes
  - SHA-256: `1F3DB0F2E45AD2F1845323F7D7FF18CA9B5770A9BBA7BBB9D7065F8747FD62DC`
  - `pg_restore --list`: `C:\Projetos\backups\barbearia_pilot_owner_ready_20260708_131739.dump.list`
  - Linhas na listagem: 367

## Decisao

ACESSO OWNER CONFIGURADO - PILOTO LOCAL LIBERADO.
