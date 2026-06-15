# Fase 1.1.4 - Backup PostgreSQL pre-hardening

Data: 2026-06-15
Horario: 12:28 UTC

## Objetivo
Criar backup real e verificavel do banco PostgreSQL local da VPS antes de qualquer hardening de infraestrutura, certificado, firewall, deploy ou restart.

## Baseline operacional
Comandos executados antes do backup:
- `git status --short`
- `git status -sb`
- `pm2 status`
- `systemctl status postgresql --no-pager`
- `systemctl status nginx --no-pager`

Confirmacoes:
- Branch `main` alinhada com `origin/main`.
- `.env` nao apareceu no status.
- `test-results/` apareceu apenas como untracked.
- PM2 online, incluindo `software-barbearia`.
- PostgreSQL ativo.
- Nginx ativo.

## Banco identificado
Identificacao feita a partir do ambiente local, sem imprimir `DATABASE_URL` completa e sem exibir senha.

- Banco: `barbearia`
- Host: `127.0.0.1`
- Porta: `5432`
- Usuario: `barbearia`
- Senha: omitida

## Backup criado
Diretorio seguro:

```text
/root/software-barbearia-backups
```

Permissao do diretorio:

```text
drwx------ root:root
```

Arquivo gerado fora do repositorio:

```text
/root/software-barbearia-backups/barbearia_20260615_122852.sql
```

Comando de backup usado, sem senha exposta:

```text
pg_dump -h 127.0.0.1 -p 5432 -U barbearia -d barbearia --no-owner --no-privileges -f /root/software-barbearia-backups/barbearia_20260615_122852.sql
```

A senha foi passada apenas pelo ambiente do processo `pg_dump` e nao foi impressa.

## Validacao do backup
- Caminho: `/root/software-barbearia-backups/barbearia_20260615_122852.sql`
- Tamanho: `1445896` bytes
- Linhas: `7142`
- SHA-256: `b3d000747e8e5ac4982be9c0cbb190c612b862b24442a0df7b0fd707c78b2082`
- Permissoes do arquivo: `-rw------- root:root`

O arquivo existe, esta fora do repositorio e possui tamanho maior que zero.

## Restore documentado
Nao executar sem decisao explicita.

Comando de restore documentado para rollback controlado ou ambiente de teste:

```text
psql -h 127.0.0.1 -p 5432 -U barbearia -d barbearia -f /root/software-barbearia-backups/barbearia_20260615_122852.sql
```

Observacoes:
- Esse backup e ponto de rollback antes de certificado, firewall, alteracao de porta `3333`, deploy ou restart.
- Restore em producao deve ser usado apenas em caso de falha grave e apos confirmacao humana.
- Preferir validar restore em ambiente de teste antes de qualquer restauracao destrutiva.

## Acoes nao executadas
- Deploy nao executado.
- PM2 nao reiniciado.
- Firewall nao alterado.
- Certificado nao emitido.
- Nginx nao alterado.
- Porta `3333` nao bloqueada.
- Migration nao executada.
- Seed nao executado.
- Codigo nao alterado.
- Backup nao foi colocado no repositorio.
- Nenhum `git add`, commit ou push foi executado nesta fase.

## Decisao final
APROVADO.

Motivos:
- backup real criado fora do repo;
- arquivo existe;
- tamanho maior que zero;
- checksum SHA-256 registrado;
- comando de restore documentado, sem execucao;
- `.env`, senha e `DATABASE_URL` completa nao foram expostos.

## Proxima etapa recomendada
Prosseguir para hardening controlado da VPS, priorizando mitigacao segura da porta `3333` e certificado real somente apos revisao das portas essenciais e plano de rollback.
