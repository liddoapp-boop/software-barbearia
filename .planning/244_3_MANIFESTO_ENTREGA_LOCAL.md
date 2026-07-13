# Macro 244.3 - Manifesto da entrega local pré-deploy

Data: 2026-07-13

## Decisão

`PRONTO PARA DEPLOY FUTURO CONTROLADO`.

Esta decisão consolida o ambiente local e não declara produção real. Nenhuma VPS, domínio, proxy, certificado, banco remoto ou processo de produção foi criado ou alterado.

## Baseline versionado

- Branch: `main`.
- HEAD funcional recebido pela Macro 244.3: `159159bccbfb3d2634b19fe287a583ca3d16a373`.
- Descrição: `feat: detalhar produtos no financeiro`.
- O commit documental da Macro 244.3 é posterior a esse baseline e deve ser identificado no relatório de fechamento.
- `.env`, `.env.pilot.local`, dumps, sessões, logs e credenciais permanecem fora do Git.

## Banco piloto pós-reset

Alvo validado: PostgreSQL local `barbearia_pilot`, backend Prisma.

- 0 clientes;
- 0 agendamentos e bloqueios;
- 0 vendas e itens de venda;
- 0 lançamentos financeiros e comissões;
- 0 checkouts e pagamentos;
- 0 estornos;
- 1 owner ativo, com acesso owner ativo e credencial preservada;
- 1 profissional ativo: Geovane Borges;
- 5 serviços ativos;
- 6 produtos ativos;
- 6 movimentos oficiais `IN` com `referenceType=INITIAL_STOCK`;
- ausência de dados operacionais antigos.

Estoque canônico total: `73`.

| Produto | Saldo |
| --- | ---: |
| Gel | 30 |
| Pomada | 10 |
| Bucha | 3 |
| Shampoo | 10 |
| Condicionador | 10 |
| Máscara | 10 |

### TeamMember canônico

O reset transacional deixa `TeamMember=0`. A primeira carga autenticada de configurações executa `ensureTeamMembers` e materializa exatamente um registro essencial:

- Geovane Borges;
- `role=OWNER`;
- `accessProfile=owner`;
- ativo;
- unidade `unit-geovane-borges`.

Portanto, o estado estabilizado pós-login é `TeamMember=1`. Esse registro representa equipe/perfil de acesso e é distinto do `Professional` usado em agenda e serviços. Não é dado operacional residual.

## Gates aprovados

- HEAD funcional conferido.
- Git limpo antes da documentação.
- Dry-run oficial do reset confirmou banco inalterado por leitura.
- Backend `/health` respondeu HTTP 200 com autenticação exigida.
- Login manual aprovado.
- Dashboard abriu sem dados antigos.
- Agenda vazia.
- Financeiro zerado.
- Estoque exibiu os seis saldos canônicos.
- Menu principal aprovado manualmente.
- Melhoria de produto e quantidade no financeiro coberta por testes de API, frontend e integração Prisma.

## Testes consolidados

- `npx prisma validate`: aprovado no gate pós-reset.
- `npm run test:db`: aprovado no banco isolado `barbearia_test`, 39 testes aprovados.
- `npm run build`: aprovado no gate pós-reset e reexecutado na Macro 244.3.
- `npm test`: aprovado no gate pós-reset e reexecutado na Macro 244.3.
- `git diff --check`: aprovado no gate pós-reset e reexecutado antes do commit documental.

Os testes persistidos usam somente banco local isolado com nome de teste. A Macro 244.3 não executa seed, reset, smoke mutável ou WhatsApp.

## Backups locais

Os dumps ficam fora do repositório em `C:\Projetos\backups-local\software-barbearia\` e devem ser tratados como dados sensíveis.

| Finalidade | Arquivo | Tamanho | SHA-256 |
| --- | --- | ---: | --- |
| Pré-reset inicial | `244_2A\barbearia_pilot_pre_reset_20260713_114736.dump` | 174646 bytes | `B0F41FC32F5C7776F7665D4F28C3CAF69BD883A51AC5C6DF633BE7395BAFC5D3` |
| Pré-reset oficial | `244_2A_1\barbearia_pilot_pre_reset_20260713_161839Z.dump` | 174646 bytes | `AF0A4A2D060D739549E18D865DA6E3A3A67D8AC73ECFE8DFCF03024B3807C9B6` |
| Pós-reset | `244_2A_1\barbearia_pilot_post_reset_20260713_162055Z.dump` | 156585 bytes | `8C4989F66DC567683A7028E344237DAAC6E19BA7988ED0182D0540ADBC938B2A` |

O reset oficial exige dump PostgreSQL não vazio reconhecido por `pg_restore --list`. Esses backups locais não substituem política de backup externo, snapshot do alvo nem teste de restore da futura VPS.

## WhatsApp e IA

- Evolution e webhook `MESSAGES_UPSERT` validados localmente.
- Owner autorizado por telefone confiável, inclusive no cenário `remoteJid @lid` com telefone em `remoteJidAlt`.
- Texto, áudio real, transcrição, parser, resolução de entidades e cancelamento seguro validados.
- Prévia é obrigatória; nenhuma mutação ocorre antes de `CONFIRMAR <codigo>`.
- `CANCELAR` foi validado sem efeitos comerciais.
- Venda real por WhatsApp com uma confirmação foi aprovada e depois removida pelo reset oficial.
- Agendamento com data/horário natural foi aprovado internamente.
- A confirmação real de agendamento por WhatsApp permanece pendente por falta de sessão capaz de enviar pelo owner final mascarado `452`.

## Limitações conhecidas

- Não existe produção real nem staging remoto nesta entrega.
- A VPS ainda não foi escolhida ou provisionada.
- `.env` do alvo, CORS, DNS, TLS, firewall, proxy e processo gerenciado não foram validados em servidor remoto.
- Backup externo e restore no alvo ainda precisam de política e teste próprios.
- Confirmações WhatsApp pendentes ficam em memória e expiram; restart as remove.
- O fluxo real de `CONFIRMAR` para agendamento WhatsApp ainda não tem evidência com a sessão owner final `452`.
- A carga de configurações cria o `TeamMember` owner quando ausente; essa materialização em uma leitura é comportamento conhecido e canônico no estado estabilizado.

## Pendências para futura VPS

1. Escolher e provisionar uma VPS Linux compatível com Node.js 22 e PostgreSQL.
2. Endurecer SSH e firewall.
3. Criar banco e usuário técnico com privilégio mínimo.
4. Definir `.env` real fora do Git e validar todos os guards de produção.
5. Definir backup externo, checksum, retenção e restore testado.
6. Aplicar migrations somente com backup e alvo confirmados.
7. Configurar processo gerenciado, proxy reverso, DNS e TLS.
8. Validar health, migrations, smoke readonly e checklist visual no alvo.
9. Configurar Evolution/WhatsApp do ambiente futuro sem reutilizar segredos ou sessões locais.
10. Concluir a confirmação real de agendamento WhatsApp com sessão autorizada adequada.

## Proibições mantidas

- Não tratar este manifesto como autorização de deploy.
- Não versionar `.env`, dumps, sessões, QR Codes, tokens ou credenciais.
- Não executar seed ou reset em banco remoto.
- Não usar `prisma migrate dev`, `prisma db push` ou `prisma migrate reset` no alvo.
- Não executar smoke mutável sem autorização explícita e plano de reversão.
