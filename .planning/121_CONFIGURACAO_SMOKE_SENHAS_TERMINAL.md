# Fase 1.2.3 - Configuracao SMOKE com senhas digitadas no terminal

Data: 2026-06-15

## Objetivo
Prosseguir com provisionamento seguro de senhas fortes para os usuarios smoke de producao:
- `owner@barbearia.local` - `owner`
- `recepcao@barbearia.local` - `recepcao`
- `profissional@barbearia.local` - `profissional`

As senhas deveriam ser digitadas pelo operador humano diretamente no terminal da VPS, sem eco, sem imprimir, sem salvar no historico e sem colocar no chat.

## Regras aplicadas
Nao foi feito:
- uso de senhas padrao;
- uso das senhas fracas citadas anteriormente;
- impressao de senha;
- impressao de hash;
- impressao de token;
- impressao de `.env`;
- impressao de `DATABASE_URL`;
- seed;
- migration;
- commit;
- push;
- `git add`.

## Baseline
Comandos executados:
- `git status --short`
- `git status -sb`
- `pm2 status`
- `systemctl status nginx --no-pager`
- `systemctl status postgresql --no-pager`
- `ufw status verbose`
- `curl https://barbearia.76-13-161-250.nip.io/health`

Resultados:
- `.env` nao apareceu no Git status.
- `test-results/` apareceu apenas como untracked.
- PM2 online.
- Nginx ativo.
- PostgreSQL ativo.
- UFW ativo.
- Health publico respondeu `{"ok":true,"authEnforced":true}`.

## Script temporario seguro
Criado script temporario fora do repositorio:
- `/root/software-barbearia-secure/provision-smoke-users.cjs`

Permissoes:
- diretorio `/root/software-barbearia-secure`: `700`
- script: `700`

Caracteristicas:
- sem senhas hardcoded;
- coleta senha e confirmacao com entrada oculta;
- valida minimo de 14 caracteres;
- exige maiuscula, minuscula, numero e simbolo;
- rejeita senhas padrao fracas conhecidas;
- exige senhas diferentes por perfil;
- importa `hashPassword` do build do proprio app;
- atualiza apenas os tres usuarios especificados;
- cria backup timestampado do `.env` antes de gravar;
- configura `SMOKE_*` no `.env` ignorado pelo Git;
- nao imprime senha, hash, token, `.env` nem `DATABASE_URL`.

## Execucao
O script foi iniciado em TTY e aguardou:
```text
Digite a nova senha forte para owner:
```

Nao houve entrada no TTY durante a janela de espera da sessao. Para evitar processo pendurado, o prompt foi encerrado.

## Confirmacao de nao aplicacao parcial
Apos encerrar o prompt:
- `SMOKE_BASE_URL`: ausente
- `SMOKE_UNIT_ID`: ausente
- `SMOKE_OWNER_EMAIL`: ausente
- `SMOKE_OWNER_PASSWORD`: ausente
- `SMOKE_RECEPTION_EMAIL`: ausente
- `SMOKE_RECEPTION_PASSWORD`: ausente
- `SMOKE_PROFESSIONAL_EMAIL`: ausente
- `SMOKE_PROFESSIONAL_PASSWORD`: ausente

Usuarios continuam presentes e ativos:
- `owner@barbearia.local`, role `owner`, `unit-01`, ativo
- `recepcao@barbearia.local`, role `recepcao`, `unit-01`, ativo
- `profissional@barbearia.local`, role `profissional`, `unit-01`, ativo

Health publico continuou OK:
- `{"ok":true,"authEnforced":true}`

## Validacoes nao executadas
Nao foi possivel executar:
- login owner;
- `/auth/me` owner;
- login recepcao;
- `/auth/me` recepcao;
- login profissional;
- `/auth/me` profissional;
- RBAC remoto;
- smoke remoto.

Motivo:
- as senhas fortes nao foram digitadas no TTY acessivel pela execucao desta sessao;
- `SMOKE_*` continuam ausentes.

## Como retomar manualmente no terminal real da VPS
Executar diretamente na VPS, fora do chat:
```text
/root/software-barbearia-secure/provision-smoke-users.cjs
```

Depois, confirmar apenas presenca das variaveis, sem valores:
```text
cd /root/software-barbearia
node -e "require('dotenv').config({quiet:true}); for (const n of ['SMOKE_BASE_URL','SMOKE_UNIT_ID','SMOKE_OWNER_EMAIL','SMOKE_OWNER_PASSWORD','SMOKE_RECEPTION_EMAIL','SMOKE_RECEPTION_PASSWORD','SMOKE_PROFESSIONAL_EMAIL','SMOKE_PROFESSIONAL_PASSWORD']) console.log(n+': '+((process.env[n]||'').trim()?'set':'missing'))"
```

Em seguida, executar a validacao autenticada e RBAC remoto.

## Decisao final
BLOQUEADO.

Motivo:
- nao houve canal interativo acessivel para o operador digitar as senhas fortes ocultas nesta sessao;
- por seguranca, nao foram usadas senhas padrao, senhas fracas, nem senhas enviadas pelo chat.

## Proxima etapa recomendada
Operador humano deve executar o script temporario diretamente no terminal real da VPS, digitar as tres senhas fortes com echo desativado e entao solicitar a reexecucao da validacao autenticada.
