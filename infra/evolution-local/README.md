# Evolution API local estabilizada

Infraestrutura Docker isolada da Evolution. Ela nao usa o banco operacional da barbearia e nao deve ser iniciada com uma tag mutavel.

## Imagem bloqueada

- runtime: `software-barbearia/evolution-api:2.3.7-local.1`
- base: `evoapicloud/evolution-api:v2.3.7`
- digest da base: registrado em `image-lock.json`
- Baileys: `7.0.0-rc.9`
- patch: `software-barbearia-offline-queue-v1`

O Dockerfile verifica os hashes dos arquivos upstream antes de aplicar o patch. O build falha se a base mudar, se o parser inseguro nao aparecer exatamente cinco vezes ou se a implementacao conhecida da fila nao estiver presente.

O patch:

1. descarta individualmente `messageStubParameters` que nao sejam JSON valido;
2. captura erro por no offline para que o evento seguinte continue;
3. restaura `isProcessing=false` em `finally`;
4. nao registra payload, telefone, LID ou credencial.

## Preparar

```powershell
Copy-Item infra/evolution-local/.env.example infra/evolution-local/.env
npm run evolution:build
npm run evolution:up
```

Preencha os segredos apenas no `.env` ignorado pelo Git. Nunca versionar API key, senha, token, QR Code ou sessao.

## Diagnosticar

```powershell
npm run evolution:doctor
```

O doctor verifica containers, saude, versoes, image ID, digest da base, instancia, backend 3334, webhook, `MESSAGES_UPSERT`, conectividade e o erro conhecido da fila desde o ultimo inicio. Ele informa a ultima recepcao persistida e o ultimo webhook inferido pelo fluxo `MESSAGES_UPSERT`.

`open` isoladamente nao prova que callbacks estao chegando. Da mesma forma, ausencia de mensagens durante algum periodo nao prova travamento e nunca dispara recuperacao.

## Recuperar sem destruir a sessao

```powershell
npm run evolution:recover
```

Esse comando usa somente `POST /instance/restart/{instance}`. Antes e depois, ele valida estado, webhook, backend e o fingerprint anonimizado da mesma sessao. Ha lock de concorrencia, cooldown de dez minutos e limite de uma tentativa por incidente.

Ele nunca chama logout/delete, nunca apaga banco, Redis ou volume e nunca solicita QR Code.

Recuperacao automatica fica desabilitada por padrao:

```dotenv
EVOLUTION_AUTO_RECOVER_ENABLED=false
EVOLUTION_RECOVERY_COOLDOWN_MS=600000
```

Quando habilitada, ela aceita somente o erro conhecido da fila desde o inicio atual, executa no maximo uma reconexao por incidente e respeita o mesmo lock/cooldown. Inatividade simples nao e gatilho.

## Iniciar o backend isolado

```powershell
npm run dev:isolated
```

Quando WhatsApp esta habilitado, o bootstrap bloqueia `latest`, imagem/digest divergente, webhook incorreto, erro conhecido ou estado essencial inconsistente. Ele nao recria sessao automaticamente.

## Quando QR Code seria necessario

QR Code so deve ser considerado quando a API comprovar sessao ausente/deslogada e a reconexao oficial, preservando credenciais, nao for segura ou retornar uma razao explicita de autenticacao. `registered=false`, `open` isolado ou inatividade nao bastam.

## Operacoes proibidas neste ambiente persistente

- `docker compose down -v`;
- remover volumes;
- apagar PostgreSQL ou Redis;
- excluir/recriar instancia;
- logout ou novo QR Code como tentativa de diagnostico;
- trocar versao/digest sem atualizar o lock e repetir toda a validacao.

Para parar sem remover dados:

```powershell
docker compose -f infra/evolution-local/docker-compose.yml stop
```
