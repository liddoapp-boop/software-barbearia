# Deploy real em VPS — auditoria e runbook

Data da auditoria: 2026-07-26

Baseline auditado: `a58fec3f7a204259f7f37033d04f6efcd5b08b62`

Branch: `main`

Este documento prepara um deploy futuro. Ele não autoriza nem executa provisionamento, migration, seed, alteração de banco, conexão de WhatsApp, tag ou deploy.

## Decisão executiva

**Decisão: PRONTO PARA HOMOLOGAÇÃO CONTROLADA EM VPS, sem autorização de deploy neste documento.**

Os bloqueios objetivos encontrados na auditoria inicial foram resolvidos no repositório:

1. `src/server-environment.ts` possui modo explícito `production`, exige `NODE_ENV=production`, PostgreSQL real, backend Prisma, banco fora de teste, autenticação, segredo forte, CORS HTTPS e URL pública coerente. Qualquer configuração crítica inválida falha antes do listener.
2. `npm run bootstrap:production-owner` cria de forma manual, transacional, idempotente e auditada a primeira unidade e o primeiro owner. O comando não usa seed, não roda no startup e passa pelo mesmo guard que recusa bancos de teste.
3. `infra/evolution-production/docker-compose.yml` fixa Evolution, PostgreSQL e Redis por versão e digest, com volumes, healthchecks, restart policy e apenas a API em loopback.
4. O áudio continua não aprovado por qualidade e agora possui o gate adicional `AI_AUDIO_PRODUCTION_ENABLED`. Seu default de produção é desligado; texto e demais recursos permanecem disponíveis.

Não contornar os gates usando `NODE_ENV=development`, `SERVER_MODE=test` ou `ALLOW_NON_PILOT_SERVER=true`: isso desabilitaria proteções de produção como cookie `Secure`, HSTS e guards de autenticação/CORS.

O deploy ainda depende dos valores reais da VPS, domínio, credenciais, banco, backup e canários descritos abaixo.

## 1. Requisitos da VPS

### 1.1 Sistema operacional

Recomendado: **Ubuntu Server 24.04 LTS x86_64**.

Motivos:

- suporte padrão até 2029;
- base madura para Node.js, PostgreSQL, Nginx, Docker e drivers NVIDIA;
- menor risco de incompatibilidade do Whisper/CUDA que uma LTS recém-lançada.

Ubuntu 26.04 LTS já é suportado por Ubuntu, Nginx e Docker, mas deve ser usado somente depois de homologar Node, Docker, driver NVIDIA, CUDA, FFmpeg e `whisper.cpp` no provedor escolhido.

### 1.2 Dimensionamento

| Perfil | CPU | RAM | Disco SSD/NVMe | GPU | Swap |
| --- | ---: | ---: | ---: | --- | ---: |
| Mínimo sem áudio local | 2 vCPU | 4 GB | 60 GB | não | 2 GB |
| Recomendado sem áudio local | 4 vCPU | 8 GB | 120 GB | não | 4 GB |
| Mínimo para homologar Whisper | 6 vCPU | 16 GB | 160 GB | NVIDIA com 6 GB VRAM | 4 GB |
| Recomendado para aplicação + Evolution + Whisper | 8 vCPU | 16–32 GB | 200 GB NVMe | NVIDIA com 8 GB VRAM ou mais | 4–8 GB |

O último hardware documentado no repositório tinha 6 threads, 16 GB RAM e GTX 1660 SUPER com 6 GB VRAM. Isso é referência de cabimento, não aprovação de qualidade. Swap protege contra pico de memória, mas não substitui RAM nem VRAM. Configurar `vm.swappiness` conservador e monitorar uso; swap constante é sinal de redimensionamento.

Reservar disco separadamente para:

- releases e `node_modules`;
- dados PostgreSQL;
- volumes Docker da Evolution;
- modelos Whisper/VAD;
- logs;
- dumps locais temporários;
- margem mínima de 25% livre.

### 1.3 Versões

| Componente | Versão recomendada/obrigatória |
| --- | --- |
| Node.js | linha **22 LTS**, último patch de segurança disponível e fixado no registro do deploy; o projeto exige `>=22` |
| npm | versão entregue com o Node 22 escolhido; usar `npm ci` com `package-lock.json` v3 |
| PostgreSQL principal | **16**, último minor suportado; em 2026-07 a linha oficial é 16.14 |
| Prisma CLI/Client | **6.19.3**, fixado no lockfile |
| TypeScript | **6.0.3**, somente build |
| Fastify | **5.8.5** |
| Nginx | pacote stable suportado para Ubuntu 24.04; registrar versão instalada |
| PM2 | versão estável aprovada e fixada no registro do deploy; não atualizar automaticamente junto com a aplicação |
| Docker Engine/Compose | pacote oficial Docker CE + Compose plugin, versão estável homologada e registrada |
| Evolution API | **2.3.7**, imagem de produção `software-barbearia/evolution-api:2.3.7-production.1` |
| Base Evolution | digest `sha256:1bd8afc4a6cf48822e6cf02469aeae7bd35a12a6b616eacd1291926307f4d339` |
| Baileys | **7.0.0-rc.9**, conforme `image-lock.json` |
| PostgreSQL da Evolution | `postgres:15.18-alpine3.24` no digest `sha256:3d0f7584ed7d04e27fa050d6683a74746608faf21f202be78460d679cc56461f` |
| Redis da Evolution | `redis:7.4.9-alpine3.21` no digest `sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99` |
| FFmpeg | versão do repositório Ubuntu homologada com OGG/Opus e WAV PCM 16 kHz |
| whisper.cpp | build CUDA homologado; versão/commit e checksum ainda precisam ser definidos |
| modelo Whisper | `ggml-large-v3-turbo-q5_0.bin`; checksum precisa ser aprovado e registrado |
| modelo VAD | `ggml-silero-v6.2.0.bin`; checksum precisa ser aprovado e registrado |

Não atualizar major de Node, PostgreSQL, Prisma, Evolution, Baileys ou modelo durante o primeiro deploy.

### 1.4 Portas

| Porta | Exposição | Uso |
| --- | --- | --- |
| `22/tcp` | pública, restrita por IP/VPN | SSH por chave |
| `80/tcp` | pública | desafio ACME e redirecionamento para HTTPS |
| `443/tcp` | pública | sistema e, se necessário, Evolution |
| `3333/tcp` | somente `127.0.0.1` | aplicação Fastify |
| `5432/tcp` | somente loopback/rede privada | PostgreSQL principal |
| `8080/tcp` | somente `127.0.0.1` | Evolution API |
| `5432/tcp` no Docker | somente rede Docker | PostgreSQL da Evolution |
| `6379/tcp` no Docker | somente rede Docker | Redis da Evolution |
| `11435/tcp` | somente `127.0.0.1`, opcional | `llama-server`; desabilitado no baseline recomendado |

Não publicar `3333`, `5432`, `6379`, `8080` ou `11435` no IP público. Revisar a cadeia `DOCKER-USER`, pois portas publicadas pelo Docker podem contornar regras simples do UFW.

### 1.5 Serviços

- `nginx.service`;
- `postgresql.service` para o banco principal;
- processo PM2 da aplicação, em modo **fork, uma instância**;
- `docker.service`;
- Compose Evolution: API, PostgreSQL próprio e Redis próprio;
- timer de backup;
- rotação de logs;
- agente de monitoramento;
- FFmpeg e `whisper-cli` executados sob demanda pelo processo Node;
- opcionalmente `llama-server`, somente após uma homologação separada.

## 2. Arquitetura de produção

### 2.1 Escolha: PM2 para a aplicação; Docker somente para Evolution

Escolha recomendada para o processo principal: **PM2, uma instância em modo fork**.

Justificativa:

- o repositório possui `npm start` para `node dist/src/server.js`;
- não existe Dockerfile, compose ou healthcheck de produção para a aplicação;
- o Whisper usa binários e modelos absolutos do host;
- rate limit, revogação de sessão e prévias de confirmação possuem partes em memória, portanto cluster horizontal teria semântica divergente;
- PM2 reduz a mudança de infraestrutura necessária para o primeiro deploy;
- Evolution já possui uma imagem customizada e volumes Docker, portanto deve permanecer em Docker.

Não usar `pm2 -i max`, cluster ou duas réplicas no primeiro deploy.

### 2.2 Mapa

```text
Internet
  |
  +-- HTTPS [DOMINIO_APP]
  |      |
  |    Nginx
  |      |
  |    127.0.0.1:3333
  |      |
  |    Fastify/Node via PM2 (1 processo)
  |      +-- PostgreSQL principal 127.0.0.1:5432
  |      +-- Evolution API 127.0.0.1:8080
  |      +-- FFmpeg -> whisper-cli -> modelos locais
  |      +-- SMTP/Gemini somente se deliberadamente habilitados
  |
  +-- HTTPS [DOMINIO_EVOLUTION] (somente se realmente necessário)
         |
       Nginx
         |
       127.0.0.1:8080

Evolution Docker network
  +-- Evolution API 2.3.7-production.1
  +-- PostgreSQL 15 próprio
  +-- Redis 7 próprio
  +-- volume de instância/sessão WhatsApp

Evolution -> HTTPS [DOMINIO_APP]/webhooks/evolution/whatsapp
  header x-evolution-webhook-secret
  evento MESSAGES_UPSERT
```

### 2.3 Comunicação

- navegador e agendamento público usam somente `https://[DOMINIO_APP]`;
- Nginx encerra TLS e encaminha para `127.0.0.1:3333`;
- Node usa `DATABASE_URL` com usuário runtime de privilégio mínimo;
- Node envia mensagens e baixa mídia pela Evolution em `http://127.0.0.1:8080`;
- Evolution chama o webhook HTTPS público da aplicação com segredo próprio;
- áudio não é uploadado pelo navegador: o backend baixa a mídia da Evolution, limita tamanho/duração, processa em temporário e remove em `finally`;
- PostgreSQL principal e PostgreSQL da Evolution são bancos separados;
- Redis da Evolution não é usado pela aplicação principal.

### 2.4 Persistência

Persistir e incluir no plano de backup:

- PostgreSQL principal;
- volume `barbearia_evolution_postgres`;
- volume `barbearia_evolution_instances`;
- volume `barbearia_evolution_redis`;
- `.env` da aplicação e da Evolution em cofre/backup criptografado, nunca no Git;
- certificados em `/etc/letsencrypt`;
- modelos, checksums e binários Whisper fora do repositório;
- configuração Nginx;
- lista PM2 salva;
- releases anterior e atual;
- logs dentro da retenção definida.

A aplicação não possui diretório permanente de uploads. Áudios e arquivos de trabalho do ASR são temporários.

## 3. Variáveis de ambiente

### 3.1 Legenda

- **Obrigatória**: o deploy completo não deve iniciar sem valor válido.
- **Opcional**: possui default seguro ou só é necessária quando a integração é usada.
- **Gerada no deploy**: segredo, credencial ou caminho produzido no host; também pode ser obrigatório.
- **Somente desenvolvimento**: não colocar no `.env` permanente da produção.

### 3.2 Aplicação, banco e autenticação

| Variável | Classe | Uso em produção |
| --- | --- | --- |
| `NODE_ENV` | Obrigatória | `production` |
| `SERVER_MODE` | Obrigatória | `production`; outros modos são recusados para o runtime real |
| `PORT` | Obrigatória | porta loopback da aplicação; usar `3333` |
| `HOST` | Obrigatória | `127.0.0.1` atrás do Nginx |
| `DATA_BACKEND` | Obrigatória | `prisma` |
| `DATABASE_URL` | Gerada no deploy | conexão do usuário runtime; segredo, `schema=public` |
| `AUTH_ENFORCED` | Obrigatória | `true` |
| `AUTH_SECRET` | Gerada no deploy | mínimo 32 caracteres aleatórios; preservar entre releases |
| `AUTH_SESSION_TTL_SEC` | Opcional | 300–28800 s; default 1800 s |
| `TRUST_PROXY` | Obrigatória | somente IP/CIDR do Nginx local, por exemplo loopback; nunca `true` ou `*` |
| `CORS_ORIGIN` | Obrigatória | origem HTTPS exata de `[DOMINIO_APP]`; nunca `*` |
| `PUBLIC_BOOKING_UNIT_ID` | Obrigatória | ID real da unidade pública |
| `PUBLIC_BOOKING_URL` | Obrigatória | URL HTTPS completa `/agendamento?unitId=...`; exigida para reativação |
| `AUTH_USERS_JSON` | Somente desenvolvimento | fallback não deve ser usado; produção Prisma autentica usuário persistente |
| `FIREBASE_PROJECT_ID` | Somente desenvolvimento | não é consumida pelo runtime atual |
| `FIREBASE_USERS_JSON` | Somente desenvolvimento | não é consumida; removida do exemplo para não sugerir autenticação inexistente |
| `BARBER_NAME` | Opcional | nome usado em notificações; default `Barbearia` |

`AUTH_USERS_JSON` não resolve o bootstrap de um banco vazio em produção: `authenticateLogin` exige usuário persistente quando `DATA_BACKEND=prisma`.

Não habilitar Firebase no primeiro deploy. A rota atual cria owner/unidade para um token válido do projeto, enquanto `FIREBASE_USERS_JSON` não é usada como allowlist.

### 3.3 HTTP, logs e limites

| Variável | Classe | Uso em produção |
| --- | --- | --- |
| `HTTP_LOG_ENABLED` | Obrigatória | `true` |
| `LOG_LEVEL` | Obrigatória | iniciar em `info`; reduzir somente após observar o piloto |
| `HTTP_BODY_LIMIT_BYTES` | Opcional | default 1048576; alinhar com Nginx |
| `RATE_LIMIT_LOGIN_MAX` | Opcional | default 10/15 min |
| `RATE_LIMIT_PUBLIC_READ_MAX` | Opcional | default 60/min |
| `RATE_LIMIT_PUBLIC_WRITE_MAX` | Opcional | default 20/10 min |
| `RATE_LIMIT_AUTHENTICATED_MAX` | Opcional | default 600/min |
| `RATE_LIMIT_REPORTS_MAX` | Opcional | default 60/min |
| `RATE_LIMIT_WHATSAPP_MAX` | Opcional | default 120/min |
| `RATE_LIMIT_AUDIO_MAX` | Opcional | default 12/min |

Os contadores são locais ao processo. Isso reforça o requisito de uma única instância PM2.

### 3.4 Billing e e-mail

| Variável | Classe | Uso em produção |
| --- | --- | --- |
| `BILLING_WEBHOOK_SECRET` | Gerada no deploy | obrigatória somente se qualquer webhook de billing for habilitado |
| `BILLING_WEBHOOK_SECRET_STRIPE` | Gerada no deploy | somente se provider Stripe for usado |
| `BILLING_WEBHOOK_SECRET_MERCADO_PAGO` | Gerada no deploy | somente se provider Mercado Pago for usado |
| `GMAIL_USER` | Opcional | somente se envio SMTP for usado |
| `GMAIL_APP_PASSWORD` | Gerada no deploy | somente se envio SMTP for usado |

Sem billing, não expor/configurar webhooks de provider. Sem SMTP, manter ambos os campos Gmail ausentes.

### 3.5 Evolution, WhatsApp e reativação

| Variável | Classe | Uso em produção |
| --- | --- | --- |
| `AI_WHATSAPP_ENABLED` | Obrigatória | `true` para o escopo WhatsApp |
| `EVOLUTION_API_URL` | Obrigatória | preferir `http://127.0.0.1:8080` |
| `EVOLUTION_API_KEY` | Gerada no deploy | deve coincidir com `AUTHENTICATION_API_KEY` da Evolution |
| `EVOLUTION_INSTANCE_NAME` | Gerada no deploy | nome estável da instância real |
| `EVOLUTION_WEBHOOK_SECRET` | Gerada no deploy | segredo distinto da API key e do `AUTH_SECRET` |
| `AI_WHATSAPP_OWNER_PHONE` | Gerada no deploy | telefone autorizado com DDI, guardado como segredo operacional |
| `AI_WHATSAPP_UNIT_ID` | Obrigatória | unidade real do owner |
| `AI_WHATSAPP_WEBHOOK_DEDUP_TTL_MS` | Opcional | default 604800000 |
| `AI_WHATSAPP_SEND_TIMEOUT_MS` | Opcional | default 10000 |
| `AI_WHATSAPP_AUDIO_DOWNLOAD_TIMEOUT_MS` | Opcional | default 8000 |
| `AI_WHATSAPP_PENDING_TTL_MS` | Opcional | default 600000; documentada no `.env.example` |
| `EVOLUTION_MEDIA_DOWNLOAD_URL` | Opcional | endpoint interno de mídia, quando diferente de `EVOLUTION_API_URL`; documentado no exemplo |
| `REACTIVATION_DEFAULT_RETURN_DAYS` | Opcional | default 45 |
| `REACTIVATION_COOLDOWN_DAYS` | Opcional | default 30 |
| `REACTIVATION_RECIPIENT_CLAIM_TIMEOUT_MS` | Opcional | default 300000 |
| `ISOLATED_WHATSAPP_OUTBOUND_MODE` | Somente desenvolvimento | exclusivo de `SERVER_MODE=isolated` |
| `ISOLATED_WHATSAPP_OUTBOUND_ALLOWLIST` | Somente desenvolvimento | exclusivo do canário isolado |

### 3.6 Áudio e Whisper

| Variável | Classe | Uso em produção |
| --- | --- | --- |
| `AI_AUDIO_PRODUCTION_ENABLED` | Obrigatória | iniciar `false`; terceiro gate, habilitado somente após canário aprovado |
| `AI_WHATSAPP_AUDIO_ENABLED` | Obrigatória | `true` somente após aprovação do gate de áudio |
| `AI_AUDIO_TRANSCRIPTION_ENABLED` | Obrigatória | `true` para áudio |
| `ASR_PROVIDER` | Obrigatória | o único caminho aceito fora de teste é `local_whisper` |
| `LOCAL_WHISPER_FFMPEG_PATH` | Gerada no deploy | caminho absoluto e executável |
| `LOCAL_WHISPER_CLI_PATH` | Gerada no deploy | caminho absoluto e executável |
| `LOCAL_WHISPER_MODEL_PATH` | Gerada no deploy | caminho absoluto para modelo aprovado |
| `LOCAL_WHISPER_VAD_MODEL_PATH` | Gerada no deploy | caminho absoluto para VAD aprovado |
| `LOCAL_WHISPER_GPU_ENABLED` | Obrigatória | deve ser `true`; não há fallback CPU aprovado |
| `LOCAL_WHISPER_PROMPT` | Opcional | prompt operacional, sem dados sensíveis |
| `LOCAL_WHISPER_TIMEOUT_MS` | Opcional | default 45000, aceito entre 20000 e 120000 |
| `LOCAL_WHISPER_WARMUP_TIMEOUT_MS` | Opcional | default 90000 |
| `AI_AUDIO_MAX_BYTES` | Opcional | default 8388608 |
| `AI_AUDIO_MAX_DURATION_SECONDS` | Opcional | default 120 |
| `AI_AUDIO_MAX_CONCURRENT` | Opcional | default HTTP 2; o provider local ainda serializa uma execução |
| `AI_AUDIO_TRANSCRIPTION_PROVIDER` | Somente desenvolvimento | alias legado; preferir `ASR_PROVIDER` |
| `AI_AUDIO_TRANSCRIPTION_API_KEY` | Somente desenvolvimento | Gemini de áudio não é aceito pelo gate da aplicação fora de teste |
| `AI_AUDIO_TRANSCRIPTION_MODEL` | Somente desenvolvimento | idem |
| `AI_AUDIO_TRANSCRIPTION_TIMEOUT_MS` | Somente desenvolvimento | idem para Gemini; local usa `LOCAL_WHISPER_TIMEOUT_MS` |
| `AI_AUDIO_TRANSCRIPTION_TOTAL_BUDGET_MS` | Somente desenvolvimento | Gemini |
| `AI_AUDIO_TRANSCRIPTION_MAX_RETRIES` | Somente desenvolvimento | Gemini |
| `AI_AUDIO_TRANSCRIPTION_MODEL_FALLBACK_ENABLED` | Somente desenvolvimento | Gemini |
| `AI_AUDIO_TRANSCRIPTION_FALLBACK_MODEL` | Somente desenvolvimento | Gemini |
| `AI_AUDIO_TRANSCRIPTION_CIRCUIT_429_THRESHOLD` | Somente desenvolvimento | Gemini |
| `AI_AUDIO_TRANSCRIPTION_CIRCUIT_COOLDOWN_MS` | Somente desenvolvimento | Gemini |

No primeiro deploy, manter `AI_AUDIO_PRODUCTION_ENABLED=false`. Isso impede a criação e o warm-up do transcritor sem desativar comandos de texto, webhook, agendamento ou demais funções. Para ativar: instalar e validar FFmpeg/Whisper/GPU/modelos, passar o doctor local, definir as três flags de áudio, reiniciar de forma controlada, confirmar `/health/ready` e executar canário humano com nomes, valores, datas e horários. O readiness retorna 503 se o áudio estiver habilitado mas o warm-up falhar.

### 3.7 Provedor semântico

| Variável | Classe | Uso em produção |
| --- | --- | --- |
| `SEMANTIC_PROVIDER` | Obrigatória | usar explicitamente `deterministic` no primeiro deploy |
| `LOCAL_LLAMA_URL` | Opcional | somente após homologação; loopback |
| `LOCAL_LLAMA_MODEL` | Opcional | somente após homologação |
| `LOCAL_LLAMA_MODEL_SHA256` | Opcional | obrigatório se `local_llama` for ativado |
| `LOCAL_LLAMA_TIMEOUT_MS` | Opcional | default 15000 |

O `.env.example` não lista `LOCAL_LLAMA_SERVER_PATH` nem `LOCAL_LLAMA_MODEL_PATH`, usados pelos scripts locais. Não ativar `local_llama` no primeiro deploy: o fechamento RC.3 registra reprovação de latência.

Variáveis Gemini de entendimento (`GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS`, `GEMINI_TOTAL_BUDGET_MS`, `GEMINI_MAX_RETRIES`, `GEMINI_FALLBACK_MODEL`, `GEMINI_MODEL_FALLBACK_ENABLED`, `GEMINI_CIRCUIT_429_THRESHOLD`, `GEMINI_CIRCUIT_COOLDOWN_MS`) existem no runtime e agora estão documentadas no `.env.example`. São opcionais e podem permanecer ausentes no baseline determinístico.

### 3.8 Smoke, seed e testes

| Variável | Classe | Uso |
| --- | --- | --- |
| `SMOKE_BASE_URL` | Opcional | somente na sessão do smoke; não persistir no `.env` da aplicação |
| `SMOKE_UNIT_ID` | Opcional | somente smoke |
| `SMOKE_OWNER_EMAIL` | Opcional | somente smoke, via canal seguro |
| `SMOKE_OWNER_PASSWORD` | Gerada no deploy | somente sessão do smoke; nunca linha de comando/histórico |
| `RUN_DB_TESTS` | Somente desenvolvimento | nunca na produção |
| `ALLOW_DESTRUCTIVE_SEED` | Somente desenvolvimento | nunca na produção |
| `BOOTSTRAP_PRODUCTION_CONFIRM` | Gerada no deploy | valor exato `CREATE_INITIAL_OWNER`, somente durante o comando manual |
| `BOOTSTRAP_UNIT_ID` | Gerada no deploy | ID da primeira unidade |
| `BOOTSTRAP_UNIT_NAME` | Gerada no deploy | nome da primeira unidade |
| `BOOTSTRAP_UNIT_TIMEZONE` | Opcional | default `America/Sao_Paulo` |
| `BOOTSTRAP_OWNER_EMAIL` | Gerada no deploy | e-mail do primeiro owner |
| `BOOTSTRAP_OWNER_NAME` | Gerada no deploy | nome do primeiro owner |
| `BOOTSTRAP_OWNER_PASSWORD` | Gerada no deploy | senha forte temporária; remover do ambiente imediatamente após o comando |

`SEED_OWNER_*` foi removida do exemplo de produção porque o seed recusa `NODE_ENV=production`. `AI_ASSISTANT_PANEL_ENABLED` também não é variável do processo: o frontend lê `globalThis.AI_ASSISTANT_PANEL_ENABLED` e não há injeção pelo backend. Não tratá-la como configuração de VPS.

### 3.9 Variáveis da infraestrutura Evolution

Arquivo separado, fora do Git: `infra/evolution-production/.env`, criado a partir de `.env.example`.

| Variável | Classe | Uso |
| --- | --- | --- |
| `EVOLUTION_API_PORT` | Obrigatória | `8080`, publicado somente em loopback |
| `SERVER_URL` | Obrigatória | URL HTTPS real da Evolution, se exposta |
| `AUTHENTICATION_API_KEY` | Gerada no deploy | mesma credencial consumida como `EVOLUTION_API_KEY` |
| `EVOLUTION_INSTANCE_NAME` | Gerada no deploy | instância estável |
| `POSTGRES_DATABASE` | Gerada no deploy | banco exclusivo da Evolution |
| `POSTGRES_USERNAME` | Gerada no deploy | usuário exclusivo da Evolution |
| `POSTGRES_PASSWORD` | Gerada no deploy | senha exclusiva |
| `EVOLUTION_AUTO_RECOVER_ENABLED` | Opcional | iniciar `false` |
| `EVOLUTION_RECOVERY_COOLDOWN_MS` | Opcional | default 600000 |
| `EVOLUTION_ISOLATED_BACKEND_PORT` | Somente desenvolvimento | scripts atuais assumem backend isolado 3334 |
| `EVOLUTION_MANAGER_PORT` | Somente desenvolvimento | aparece no exemplo, mas não há serviço manager no compose atual |

`EVOLUTION_EXPECTED_WEBHOOK_URL` é lida pelo doctor, mas não aparece no exemplo. Os scripts `evolution:doctor` e `evolution:recover` têm nomes de containers e expectativas locais; precisam de adaptação/configuração antes de serem usados como automação de produção.

### 3.10 Decisões explícitas do `.env.example`

- `SERVER_MODE=production` é o único modo do runtime real;
- `EVOLUTION_MEDIA_DOWNLOAD_URL`, `AI_WHATSAPP_PENDING_TTL_MS` e variáveis Gemini consumidas estão documentadas;
- `FIREBASE_USERS_JSON` foi removida porque não é consumida;
- `AI_ASSISTANT_PANEL_ENABLED` está documentada como flag global de frontend, não variável Node;
- `SEED_OWNER_*` foi substituída pelas variáveis efêmeras do bootstrap seguro;
- `AI_AUDIO_PRODUCTION_ENABLED=false` é o baseline obrigatório;
- não existe `PUBLIC_BASE_URL`/`APP_BASE_URL` no runtime; a URL pública é representada por `CORS_ORIGIN` e `PUBLIC_BOOKING_URL`;
- `BLOCK_COMMERCIAL_REFUNDS` existe como kill switch de runtime, mas não está documentada no exemplo; manter ausente/`false` salvo incidente aprovado.

## 4. Banco de produção

### 4.1 Princípios

- PostgreSQL principal separado do banco da Evolution;
- schema `public`;
- 27 diretórios de migration no baseline auditado;
- migrations somente com `npx prisma migrate deploy`;
- nunca `db push`, `migrate dev`, `migrate reset` ou seed;
- migrations aplicadas por usuário migrator;
- runtime usa usuário sem DDL;
- backup e restore testado antes de liberar uso.

### 4.2 Criação com privilégio mínimo

Executar como administrador PostgreSQL, substituindo todos os campos entre colchetes:

```sql
CREATE ROLE [ROLE_MIGRATOR] LOGIN PASSWORD '[SEGREDO_MIGRATOR]'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

CREATE ROLE [ROLE_APP] LOGIN PASSWORD '[SEGREDO_APP]'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

CREATE DATABASE [BANCO_APP]
  OWNER [ROLE_MIGRATOR]
  ENCODING 'UTF8'
  TEMPLATE template0;
```

Conectado ao banco:

```sql
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE [BANCO_APP] FROM PUBLIC;
GRANT CONNECT ON DATABASE [BANCO_APP] TO [ROLE_APP];
GRANT USAGE ON SCHEMA public TO [ROLE_APP];

ALTER DEFAULT PRIVILEGES FOR ROLE [ROLE_MIGRATOR] IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO [ROLE_APP];
ALTER DEFAULT PRIVILEGES FOR ROLE [ROLE_MIGRATOR] IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO [ROLE_APP];
```

Depois de aplicar migrations:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO [ROLE_APP];
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO [ROLE_APP];
```

O `DATABASE_URL` permanente da aplicação usa `[ROLE_APP]`. A credencial `[ROLE_MIGRATOR]` deve existir apenas no cofre e na sessão controlada de migration.

### 4.3 Aplicação das migrations

1. confirmar commit e checksum do release;
2. confirmar nome, host, porta e schema sem imprimir senha;
3. impedir tráfego de escrita durante a janela;
4. criar dump pre-deploy, mesmo no primeiro ciclo;
5. validar `pg_restore --list` e SHA-256 do dump;
6. carregar temporariamente `DATABASE_URL` do migrator por canal seguro;
7. executar:

```bash
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status
```

8. confirmar que todas as 27 migrations estão aplicadas;
9. aplicar grants ao usuário runtime;
10. remover a credencial migrator da sessão;
11. iniciar aplicação com `DATABASE_URL` runtime;
12. confirmar `/health/ready`.

O comando `npm run deploy` não deve ser usado no primeiro deploy: ele acopla build, generate e migration sem impor backup, revisão do alvo ou smoke entre fases.

### 4.4 Dados iniciais e owner

Um banco apenas migrado não permite login. Depois das migrations, use uma das opções:

1. restaurar um dump aprovado em banco novo e validar migrations/dados; ou
2. executar uma única vez o bootstrap mínimo versionado:

```bash
export BOOTSTRAP_PRODUCTION_CONFIRM=CREATE_INITIAL_OWNER
export BOOTSTRAP_UNIT_ID='[UNIT_ID_REAL]'
export BOOTSTRAP_UNIT_NAME='[NOME_REAL]'
export BOOTSTRAP_UNIT_TIMEZONE='America/Sao_Paulo'
export BOOTSTRAP_OWNER_EMAIL='[EMAIL_OWNER]'
read -s -p 'Senha inicial do owner: ' BOOTSTRAP_OWNER_PASSWORD
export BOOTSTRAP_OWNER_PASSWORD
npm run bootstrap:production-owner
unset BOOTSTRAP_PRODUCTION_CONFIRM BOOTSTRAP_UNIT_ID BOOTSTRAP_UNIT_NAME
unset BOOTSTRAP_UNIT_TIMEZONE BOOTSTRAP_OWNER_EMAIL BOOTSTRAP_OWNER_PASSWORD
```

O comando exige o ambiente de produção completo, recusa banco cujo nome indique teste, usa transação serializável com advisory lock, procura qualquer owner antes de criar dados, aplica o hash de senha atual e registra `PRODUCTION_BOOTSTRAP_COMPLETED` em `AuditLog`. Uma segunda execução retorna `already_initialized` sem duplicar. Ele não imprime senha e nunca roda no startup.

Não executar `prisma/seed.ts`, `demo-seed.ts`, `provision-pilot-owner.mjs`, `provision-geovane-pilot.mjs` ou `reset-geovane-pilot.mjs` contra produção. Não usar Firebase como atalho de bootstrap.

### 4.5 Backup

Política inicial recomendada, sujeita a RPO/RTO do negócio:

- dump custom diário do banco principal;
- dump imediatamente antes de toda migration;
- 7 diários, 4 semanais e 12 mensais;
- cópia criptografada fora da VPS;
- SHA-256 e `pg_restore --list` para cada dump;
- backup separado do PostgreSQL da Evolution e volumes da instância;
- alerta se backup estiver atrasado, vazio ou sem cópia externa.

Exemplo de formato:

```bash
pg_dump --format=custom --no-owner --no-acl --file "[ARQUIVO_TEMPORARIO]" "[BANCO_APP]"
sha256sum "[ARQUIVO_TEMPORARIO]" > "[ARQUIVO_TEMPORARIO].sha256"
pg_restore --list "[ARQUIVO_TEMPORARIO]" > /dev/null
```

Credenciais devem vir de `.pgpass` com permissão `0600` ou cofre; não usar senha na linha de comando.

### 4.6 Restore testado

Mensalmente e antes do primeiro go-live, executar uma restauração testada:

1. criar banco isolado `[BANCO_RESTORE_TEST]`;
2. restaurar o último dump;
3. validar checksum, migrations, contagens e invariantes de financeiro/estoque;
4. iniciar uma instância temporária da aplicação em porta privada;
5. executar smoke readonly;
6. destruir apenas o banco de restore depois de registrar a evidência.

Nunca testar restore sobre o banco operacional.

### 4.7 Rollback

- falha somente de código: voltar o symlink `current` para o release anterior e reiniciar PM2;
- falha após migration compatível: manter schema, voltar código somente se o release anterior for comprovadamente compatível;
- falha de schema/dados: parar escrita, restaurar o dump pre-deploy em **banco novo**, validar, trocar `DATABASE_URL` e reiniciar;
- Prisma não fornece down migration automática; não editar `_prisma_migrations` nem executar SQL reverso improvisado.

## 5. Domínio e HTTPS

### 5.1 Valores a definir

- `[DOMINIO_APP]`: domínio principal do sistema;
- URL do sistema: `https://[DOMINIO_APP]`;
- URL pública: `https://[DOMINIO_APP]/agendamento?unitId=[UNIT_ID_REAL]`;
- `[DOMINIO_EVOLUTION]`: opcional; só criar se a API/manager precisar ser acessada externamente;
- `[IP_VPS]`: endereço do host;
- e-mail ACME e contato operacional.

Não usar IP HTTP como origem final.

### 5.2 Nginx

Configuração lógica:

```nginx
server {
    listen 80;
    server_name [DOMINIO_APP];
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name [DOMINIO_APP];

    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:3333;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
```

O corpo Fastify tem limite padrão de 1 MiB. O áudio não atravessa Nginx como upload: ele é baixado da Evolution, com limite separado de 8 MiB. Se um webhook real exceder 1 MiB, medir o payload, manter `base64=false` na Evolution e alterar Nginx e `HTTP_BODY_LIMIT_BYTES` juntos.

### 5.3 TLS

- emitir certificado somente depois de DNS apontar para a VPS;
- usar Certbot/Nginx ou ACME equivalente;
- ativar timer de renovação;
- executar `certbot renew --dry-run`;
- monitorar expiração;
- restringir chave privada;
- não ativar HSTS antes de confirmar HTTPS em todos os subdomínios relevantes.

A aplicação já emite CSP, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` e HSTS em produção. Nginx deve complementar, não criar valores conflitantes.

## 6. Operação

### 6.1 Inicialização e reboot

Aplicação:

```bash
cd /srv/software-barbearia/current
pm2 start npm --name software-barbearia --time --max-memory-restart 1G -- start
pm2 save
pm2 startup systemd -u [USUARIO_DEPLOY] --hp /home/[USUARIO_DEPLOY]
```

Usar exatamente o comando gerado por `pm2 startup`. Após atualizar Node, regenerar o startup script.

Evolution:

- `restart: unless-stopped` nos containers;
- `systemctl enable docker`;
- nunca `docker compose down -v`;
- reinício preservando volumes;
- QR Code somente quando a API comprovar sessão ausente/deslogada.

### 6.2 Health checks

| Endpoint | Significado |
| --- | --- |
| `/health/live` | processo HTTP vivo |
| `/health/ready` | banco, autenticação e áudio prontos; usar para disponibilidade |
| `/health` | alias legado de liveness; não valida banco |

Monitoramento externo deve usar `/health/ready`, com alerta em 503. Usar `/health/live` apenas para distinguir processo morto de dependência indisponível.

### 6.3 Logs

- Fastify em JSON com `HTTP_LOG_ENABLED=true`;
- PM2 com timestamps;
- `pm2-logrotate` ou logrotate do sistema;
- retenção local inicial de 14 dias e limite por tamanho;
- Docker com driver `json-file` limitado por `max-size`/`max-file`;
- Nginx access/error rotacionados;
- PostgreSQL com rotação do próprio serviço;
- nunca registrar senha, token, API key, QR, sessão, telefone completo, base64, áudio ou transcrição integral.

### 6.4 Monitoramento

Alertar no mínimo:

- `/health/ready` indisponível;
- reinícios PM2;
- memória > 85% sustentada;
- swap em crescimento;
- load acima da capacidade de CPU;
- disco > 80% e crítico > 90%;
- crescimento anormal do PostgreSQL e volumes Docker;
- backup atrasado/falho;
- certificado a menos de 30 dias da expiração;
- Evolution não `open`;
- fila offline conhecida;
- warm-up/falha do Whisper;
- latência e timeout de mídia;
- PostgreSQL sem aceitar conexão.

### 6.5 Reinício controlado

1. confirmar backup recente;
2. suspender novas operações na janela;
3. verificar pendências WhatsApp: prévias em memória são perdidas no restart;
4. executar `pm2 restart software-barbearia --update-env`;
5. aguardar `/health/ready`;
6. executar smoke readonly;
7. liberar tráfego.

O código não registra handler explícito de `SIGTERM`/`SIGINT` para fechamento gracioso do Fastify/Prisma. PM2 deve usar timeout conservador; adicionar shutdown gracioso é melhoria futura.

### 6.6 Evolution e WhatsApp

- validar imagem, base digest, patch e versões;
- validar API/PostgreSQL/Redis healthy;
- validar instância `open`;
- validar webhook habilitado, `base64=false`, evento único `MESSAGES_UPSERT`;
- validar URL HTTPS e header `x-evolution-webhook-secret`;
- validar que o owner real é o remetente autorizado;
- em falha conhecida, usar restart da instância, nunca logout/delete;
- confirmar volumes e backup antes de qualquer intervenção.

Os scripts atuais de doctor/recover são locais. Não automatizá-los em produção antes de remover pressupostos de porta 3334, nomes `*-local` e `host.docker.internal`.

### 6.7 Whisper

- confirmar GPU, driver, CUDA e execução do build `whisper.cpp`;
- validar checksums dos binários/modelos;
- confirmar permissões do usuário PM2;
- confirmar FFmpeg OGG/Opus;
- observar evento `audio.transcription.warmup.completed`;
- exigir `/health/ready=200`;
- executar canário com áudio real e entidades críticas;
- manter texto funcional quando áudio estiver desabilitado.

### 6.8 Rollback operacional

- releases imutáveis em `/srv/software-barbearia/releases/[COMMIT]`;
- symlink `/srv/software-barbearia/current`;
- manter ao menos release atual e anterior;
- registrar commit, migration status, horário e operador;
- rollback de código por troca atômica do symlink;
- rollback de banco conforme seção 4.7.

## 7. Deploy passo a passo

Os passos abaixo começam somente em uma janela autorizada, com os valores reais e backups definidos. A correção do repositório não substitui esses gates operacionais.

### Fase 0 — inputs obrigatórios

Definir sem placeholders:

- `[IP_VPS]`;
- `[DOMINIO_APP]`;
- `[DOMINIO_EVOLUTION]` ou decisão de não expor;
- `[UNIT_ID_REAL]`;
- fonte aprovada dos dados iniciais/owner;
- credenciais geradas;
- provedor de backup externo;
- perfil com ou sem GPU;
- áudio inicialmente desativado e janela separada para eventual canário;
- janela, operador e commit de rollback.

### Fase 1 — host vazio

1. instalar Ubuntu Server 24.04 LTS;
2. criar usuário de deploy sem login root cotidiano;
3. instalar chave SSH e desabilitar autenticação por senha após teste;
4. atualizar pacotes;
5. configurar timezone/chrony;
6. configurar firewall para SSH restrito, HTTP e HTTPS;
7. instalar Nginx, PostgreSQL 16, Node 22 LTS, Git e utilitários de backup;
8. instalar Docker CE/Compose pelo repositório oficial; não usar script de conveniência;
9. instalar driver NVIDIA/CUDA apenas no perfil Whisper;
10. criar swap e monitoramento.

### Fase 2 — usuários, diretórios e segredos

1. criar `/srv/software-barbearia/releases`, `/srv/software-barbearia/shared` e diretórios de backup;
2. proprietário `[USUARIO_DEPLOY]`, sem permissão global de escrita;
3. criar `.env` em `shared` com modo `0600`;
4. gerar segredos independentes;
5. armazenar cópia criptografada em cofre;
6. não colocar segredos no histórico do shell.

### Fase 3 — PostgreSQL

1. criar migrator, runtime e banco conforme seção 4;
2. restringir `listen_addresses` e `pg_hba.conf`;
3. testar conexão local de cada papel sem imprimir senha;
4. configurar backup/timer;
5. produzir e validar backup inicial.

### Fase 4 — release

```bash
git clone [URL_REPOSITORIO] /srv/software-barbearia/releases/[COMMIT]
cd /srv/software-barbearia/releases/[COMMIT]
git checkout --detach [COMMIT]
test "$(git rev-parse HEAD)" = "[COMMIT]"
npm ci
npx prisma generate
npm run build
```

Vincular `.env` de `shared` ao release sem copiá-lo para o Git. Confirmar que `public/` acompanha `dist/`, pois Fastify serve os arquivos estáticos a partir do diretório de trabalho.

### Fase 5 — migrations e dados

1. impedir subida do processo;
2. apontar sessão temporária ao migrator;
3. executar `npx prisma migrate status`;
4. executar `npx prisma migrate deploy`;
5. executar `npx prisma migrate status`;
6. aplicar grants runtime;
7. remover credencial migrator;
8. restaurar dados aprovados ou carregar temporariamente as variáveis `BOOTSTRAP_*` e executar `npm run bootstrap:production-owner`;
9. validar owner/unidade sem seed;
10. remover todas as variáveis `BOOTSTRAP_*` da sessão e do ambiente persistente;
11. confirmar a auditoria `PRODUCTION_BOOTSTRAP_COMPLETED`, quando o bootstrap tiver sido usado;
12. criar backup pós-migration/pré-go-live.

### Fase 6 — aplicação

1. confirmar `NODE_ENV=production`, `SERVER_MODE=production`, `DATA_BACKEND=prisma` e `AI_AUDIO_PRODUCTION_ENABLED=false`;
2. iniciar PM2 em uma instância;
3. validar `curl http://127.0.0.1:3333/health/live`;
4. validar `curl http://127.0.0.1:3333/health/ready`;
5. salvar processo e instalar startup systemd;
6. reiniciar uma vez de forma controlada para testar ressurreição.

### Fase 7 — Nginx, DNS e TLS

1. publicar DNS;
2. configurar proxy;
3. validar `nginx -t`;
4. emitir certificado;
5. validar redirecionamento HTTP→HTTPS;
6. validar headers e cookies `Secure`;
7. validar renovação automática.

### Fase 8 — Evolution e WhatsApp

1. copiar `infra/evolution-production/.env.example` para `.env` somente na VPS;
2. preencher os segredos e URLs reais sem versioná-los;
3. revisar as versões/digests fixados no manifesto e registrar seus checksums;
4. confirmar bind da API somente em loopback e banco/Redis somente na rede interna;
5. criar política de backup dos volumes;
6. executar `docker compose -f infra/evolution-production/docker-compose.yml config` e revisar a saída sem publicá-la;
7. subir containers e aguardar os três healthchecks;
8. criar/reusar instância real sem apagar sessão existente;
9. conectar WhatsApp por QR somente se necessário;
10. configurar webhook HTTPS, header secreto, `base64=false` e `MESSAGES_UPSERT`;
11. validar texto recebido, prévia, cancelamento e confirmação controlada.

### Fase 9 — Whisper

Esta fase é separada do go-live. Até sua aprovação, `AI_AUDIO_PRODUCTION_ENABLED=false`.

1. instalar FFmpeg, driver, CUDA e build aprovado;
2. copiar modelos com checksum;
3. configurar caminhos absolutos;
4. executar diagnóstico sem efeito comercial;
5. habilitar `AI_WHATSAPP_AUDIO_ENABLED`, `AI_AUDIO_TRANSCRIPTION_ENABLED` e, por último, `AI_AUDIO_PRODUCTION_ENABLED`;
6. reiniciar Node e validar warm-up/readiness;
7. executar canário humano de áudio;
8. desabilitar áudio imediatamente se nomes, valores, datas ou horários divergirem.

### Fase 10 — backup e smoke

1. executar backup completo;
2. validar checksum e catálogo;
3. copiar para destino externo;
4. executar smoke readonly;
5. executar smoke mutável apenas em janela e com registros controlados;
6. validar todos os itens da seção 8;
7. testar reboot;
8. testar restore em banco isolado;
9. registrar aceite ou rollback.

## 8. Smoke test pós-deploy

### Infraestrutura

- [ ] `GET /health/live` retorna 200;
- [ ] `GET /health/ready` retorna 200;
- [ ] `GET /health` retorna 200, lembrando que é apenas liveness;
- [ ] HTTPS válido e HTTP redireciona;
- [ ] aplicação, PostgreSQL, Nginx, Docker e containers reiniciam após reboot;
- [ ] nenhuma porta interna está pública;
- [ ] logs não contêm segredos;
- [ ] backup atual existe fora da VPS.

### Autenticação e RBAC

- [ ] login owner;
- [ ] cookie `sb_session` é `HttpOnly`, `Secure`, `SameSite=Strict`;
- [ ] sessão permanece válida no tempo configurado;
- [ ] logout invalida a sessão;
- [ ] recepção acessa apenas o permitido;
- [ ] profissional acessa apenas o permitido;
- [ ] usuário de outra unidade não acessa dados;
- [ ] rotas sem sessão retornam 401/403.

### Fluxos do sistema

- [ ] Agenda carrega;
- [ ] novo agendamento interno;
- [ ] confirmação, início e conclusão;
- [ ] agendamento público lista catálogo/horários e cria registro;
- [ ] bloqueio de conflito funciona;
- [ ] checkout pago;
- [ ] Financeiro reconcilia receita/despesa/resultado;
- [ ] ticket médio e origem das receitas permanecem coerentes;
- [ ] venda de produto atualiza Estoque e Financeiro uma vez;
- [ ] alerta de estoque é criado/enviado conforme regra;
- [ ] auditoria registra operações críticas;
- [ ] confirmação e cancelamento não duplicam efeitos.

### WhatsApp texto

- [ ] Evolution `open`;
- [ ] webhook com segredo aceita evento válido e rejeita segredo inválido;
- [ ] somente owner autorizado emite comando;
- [ ] comando de texto gera prévia sem mutação;
- [ ] `CANCELAR` não altera dados;
- [ ] `CONFIRMAR <codigo>` executa exatamente uma vez;
- [ ] replay do mesmo evento não duplica resposta/efeito;
- [ ] campanha de reativação usa `PUBLIC_BOOKING_URL` real;
- [ ] opt-out `SAIR` funciona;
- [ ] alerta de estoque chega ao destinatário correto.

### WhatsApp áudio

- [ ] warm-up Whisper aprovado;
- [ ] mídia dentro do limite é baixada;
- [ ] áudio maior/mais longo é recusado;
- [ ] nome de cliente/produto preservado;
- [ ] data e horário preservados;
- [ ] valor e quantidade preservados;
- [ ] transcrição ambígua pede esclarecimento e não executa;
- [ ] confirmação continua obrigatória;
- [ ] indisponibilidade do Whisper falha fechada e texto continua funcionando.

### Backup, rollback e reboot

- [ ] dump custom não vazio;
- [ ] SHA-256 registrado;
- [ ] `pg_restore --list` aprovado;
- [ ] cópia externa confirmada;
- [ ] restore em banco isolado aprovado;
- [ ] smoke readonly no restore aprovado;
- [ ] rollback para release anterior ensaiado;
- [ ] reboot da VPS preserva PM2, PostgreSQL, Evolution e sessão WhatsApp.

O script `npm run smoke:api:readonly` cobre health, autenticação, agenda, clientes, catálogo, financeiro, serviços, auditoria, configurações e relatórios sem mutação. Os fluxos mutáveis e WhatsApp exigem canário controlado.

## 9. Riscos e bloqueios reais

### 9.1 Bloqueia deploy

**Nenhum bloqueio objetivo de código permanece para homologar o núcleo com áudio desativado.**

O deploy continua proibido até que os itens externos da seção 9.2 sejam fornecidos e validados na VPS. A qualidade do áudio bloqueia somente sua ativação; o gate `AI_AUDIO_PRODUCTION_ENABLED=false` preserva o restante do sistema.

### 9.2 Precisa ser configurado na VPS

- VPS, domínio, IP, DNS e TLS;
- usuário SSH/deploy e firewall;
- Node, PostgreSQL, Nginx, PM2, Docker;
- `.env` real e cofre de segredos;
- banco, papéis e grants;
- dados reais do primeiro owner/unidade para o bootstrap ou dump aprovado;
- proxy e `TRUST_PROXY`;
- backup externo, retenção e alertas;
- `.env` da Evolution, volumes, API key, instância e webhook;
- telefone owner e unidade;
- GPU, FFmpeg, Whisper, VAD e checksums, se áudio for autorizado;
- monitoramento, logrotate e reboot.

### 9.3 Pode ser validado no piloto

- smoke owner/recepção/profissional;
- agendamento público com domínio real;
- fluxo WhatsApp de agendamento confirmado pelo owner real;
- reconexão Evolution sem perder sessão;
- qualidade de áudio com nomes, datas, horários, quantidades e valores reais controlados;
- alerta de estoque;
- reativação e opt-out;
- restart durante ausência de pendências;
- backup e restore em alvo isolado;
- rollback do symlink.

### 9.4 Melhoria futura

- persistir prévias/clarificações WhatsApp hoje mantidas em memória;
- store compartilhado para rate limit e revogação se houver mais de uma instância;
- shutdown gracioso de Fastify/Prisma;
- `ecosystem.config` de produção versionado, se a operação deixar de usar comando PM2 explícito;
- separar build de testes/seeds no `tsconfig`;
- tornar doctor/recover da Evolution configuráveis para produção;
- implementar allowlist real antes de habilitar Firebase;
- reduzir `style-src 'unsafe-inline'` da CSP em evolução futura.

## 10. Validação local da prontidão implementada

Executado sem acessar banco:

| Comando/inspeção | Resultado |
| --- | --- |
| estado inicial Git | `main`, HEAD `a58fec3f7a204259f7f37033d04f6efcd5b08b62`, `0/0`; somente este runbook estava sem rastreamento |
| guard, bootstrap, configuração e hardening | 4 arquivos, 63 testes aprovados |
| IA texto com áudio desativado | suítes de owner command, orquestração semântica e webhook aprovadas |
| áudio | suíte integral aprovada, incluindo o novo gate de produção |
| `npm test` | aprovado no rerun final sem concorrência: 64 arquivos e 1172 testes coletados/executados |
| `npm run build` | aprovado |
| `npx prisma validate` | aprovado; schema válido |
| `git diff --check` | aprovado |
| scripts de inicialização | `npm start` aponta para `dist/src/server.js`; `SERVER_MODE=production` passa somente com a configuração segura completa |
| bootstrap | comando dedicado testado com store mock; não foi executado contra banco |
| scripts Prisma | `db:deploy` correto; `db:push`, `db:migrate` e seeds proibidos no alvo |
| script agregado `deploy` | não recomendado no primeiro deploy por acoplar migration |
| Evolution | Compose de produção estático validado; Evolution, PostgreSQL e Redis fixados por versão/digest |
| smoke | readonly remoto disponível; smoke mutável exige autorização |
| migrations | 27 diretórios reconhecidos no repositório |

Nenhuma migration, seed, `db push`, conexão de banco, tag ou deploy foi executado.

## Referências oficiais consultadas

- Ubuntu LTS: <https://ubuntu.com/about>
- Ciclo do Node.js: <https://nodejs.org/en/about/previous-releases>
- Versionamento PostgreSQL: <https://www.postgresql.org/support/versioning/>
- Prisma Migrate em produção: <https://docs.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production>
- Docker Engine no Ubuntu: <https://docs.docker.com/engine/install/ubuntu/>
- PM2 startup: <https://pm2.keymetrics.io/docs/usage/startup/>
- Nginx para Ubuntu: <https://nginx.org/en/linux_packages.html>
- Certbot: <https://eff-certbot.readthedocs.io/>
