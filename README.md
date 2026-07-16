# Software Barbearia

Plataforma local de gestão para a Barbearia Geovane Borges. O projeto reúne operação de agenda, clientes, serviços, estoque, vendas e financeiro em uma SPA servida por uma API Fastify, com persistência PostgreSQL por Prisma.

## Estado da entrega

O baseline funcional local está **pronto como RC.3 local**. Isso não significa que exista produção real: nenhuma VPS foi provisionada, nenhum domínio foi publicado e nenhum deploy foi executado nesta entrega.

## Status da RC.3

- WhatsApp textual: funcional, com prévia e confirmação obrigatórias.
- Áudio Gemini: opcional, sujeito à cota gratuita e nunca obrigatório para o sistema.
- Áudio local: experimental e desligado por padrão; não faz parte do aceite funcional da RC.3.
- O ASR local preservou latência aceitável, mas não entidades críticas; o Qwen local excedeu o gate semântico de latência. Não há IA paga prevista nesta release.
- O projeto fica congelado para novas funcionalidades até uma VPS, TCC ou correção P0/P1 autorizada.

O estado consolidado, os gates e as limitações estão no [manifesto da entrega local](.planning/244_3_MANIFESTO_ENTREGA_LOCAL.md).

## Módulos existentes

- Agenda interna, encaixes, bloqueios, estados do atendimento e checkout.
- Clientes e histórico operacional.
- Financeiro, vendas de produtos, estornos, comissões e fechamento.
- Estoque, movimentos, inventário e saldos por produto.
- Serviços, profissionais, horários e regras de combinação.
- Configurações, equipe, métodos de pagamento e permissões.
- Auditoria persistente e relatórios gerenciais.
- Agendamento público.
- Fidelização, automações e retenção como módulos auxiliares.
- Atendente IA integrado ao WhatsApp por Evolution, com prévia e confirmação humana.

O menu owner principal é deliberadamente reduzido a Agenda, Clientes, Financeiro, Estoque, Configurações, Serviços e Auditoria. O painel interno do Atendente IA fica oculto por padrão; o canal operacional esperado é o WhatsApp.

## Requisitos locais

- Node.js 22 ou superior.
- npm compatível com o `package-lock.json`.
- PostgreSQL local para `DATA_BACKEND=prisma`.
- Banco e migrations compatíveis com `prisma/schema.prisma`.

Instale as dependências:

```powershell
npm ci
```

## Como rodar localmente

### Piloto Geovane

O comando cotidiano e seguro para o banco piloto é:

```powershell
npm run dev
```

`npm run dev:pilot` é o alias explícito do mesmo modo. Ambos leem `.env.pilot.local`, exigem `DATA_BACKEND=prisma`, fixam o bind em `127.0.0.1:3333` e recusam bancos que não sejam `barbearia_pilot` em host local. O arquivo é local, ignorado pelo Git e nunca deve ser enviado ao repositório.

Para desenvolvimento técnico sem dados do piloto, use `npm run dev:isolated`. Esse comando usa memória, escuta em `127.0.0.1:3334` e informa claramente o modo no terminal. A execução direta de `src/server.ts` com `.env` genérico é bloqueada na porta 3333.

Depois do startup:

- aplicação e API: `http://127.0.0.1:3333/`;
- health check: `http://127.0.0.1:3333/health`;
- login: `http://127.0.0.1:3333/login`.

O owner do piloto é persistido no banco. A senha não é versionada e deve ser digitada ou fornecida por um canal local seguro. Não redefina a senha apenas para executar um smoke.

### Execução a partir do build

Com `.env` local corretamente configurado:

```powershell
npm run build
npm start
```

O modo isolado não executa `prisma db push`, seed ou migration. Mudanças de schema e testes com escrita devem usar exclusivamente o fluxo de banco descartável descrito abaixo.

## Variáveis de ambiente

Use [.env.example](.env.example) como referência de nomes e placeholders. Nunca versione valores reais.

Variáveis essenciais para o servidor com Prisma:

| Variável | Finalidade |
| --- | --- |
| `NODE_ENV` | Modo de execução; produção ativa guard rails adicionais. |
| `PORT` | Porta HTTP, normalmente `3333`. |
| `HOST` | Interface de bind; em produção o padrão é loopback. |
| `DATA_BACKEND` | Deve ser `prisma` no piloto e em um futuro deploy. |
| `DATABASE_URL` | Conexão PostgreSQL do ambiente. |
| `AUTH_ENFORCED` | Deve permanecer `true` fora de testes isolados. |
| `AUTH_SECRET` | Segredo forte para tokens; mínimo operacional de 32 caracteres em produção. |
| `PUBLIC_BOOKING_UNIT_ID` | Unidade exposta pelo agendamento público. |
| `CORS_ORIGIN` | Origem permitida; obrigatória e não curinga em produção. |

Integrações opcionais têm variáveis próprias para billing, Firebase, Gmail, Gemini, Evolution e transcrição. Gemini não é requisito de health, texto ou operações principais. Consulte [WhatsApp e IA](WHATSAPP_IA.md) para o conjunto da integração WhatsApp-first.

## Scripts principais

| Comando | Uso |
| --- | --- |
| `npm run dev` | Comando cotidiano; inicia o piloto local protegido. |
| `npm run dev:pilot` | Alias explícito do mesmo modo piloto. |
| `npm run dev:isolated` | Inicia backend em memória na porta 3334, sem acessar o piloto. |
| `npm run build` | Compila TypeScript em `dist/`. |
| `npm start` | Inicia o servidor compilado. |
| `npm test` | Executa a suíte Vitest comum. |
| `npm run test:db` | Executa integração Prisma no banco local isolado cujo nome contém `test`. |
| `npx prisma validate` | Valida schema e configuração Prisma. |
| `npx prisma migrate status` | Consulta o estado das migrations. |
| `npm run smoke:api:readonly` | Smoke autenticado somente leitura com variáveis `SMOKE_*`. |
| `npm run db:reset:geovane-pilot` | Dry-run do reset oficial; sem flags de execução não escreve. |

Scripts de seed, reset real, `db push` e smoke mutável podem alterar dados. Leia os guards e confirme o alvo antes de usá-los.

## Documentação operacional

- [Manifesto da entrega local](.planning/244_3_MANIFESTO_ENTREGA_LOCAL.md)
- [WhatsApp e IA](WHATSAPP_IA.md)
- [Modo local do piloto](.planning/238_MODO_LOCAL_PILOTO.md)
- [Reset oficial do piloto](.planning/244_2A_RESET_OFICIAL_GEOVANE_PILOT.md)
- [Pacote para futura VPS](.planning/235_2_PACOTE_FUTURA_VPS.md)
- [Índice de planejamento](.planning/README.md)

## VPS e produção

A VPS é uma etapa futura e separada. Antes de qualquer deploy real ainda será necessário provisionar e endurecer o host, preparar `.env` próprio, configurar PostgreSQL, proxy reverso, TLS, firewall, processo gerenciado, política de backup externo, restore testado, migrations, health e smoke no alvo.

Não trate a aprovação local como autorização para deploy.
