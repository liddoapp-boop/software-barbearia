# Macro 239.2 - WhatsApp QR Code e envio controlado

Data: 2026-07-10 20:59:42 -03:00

## Ambiente

- Ambiente: local/piloto.
- Branch inicial: `main`.
- `HEAD`: `2e5ed31add1fdd07e4f29a80e19c088bdeb2f86f`.
- `origin/main...HEAD`: `0 0`.
- Worktree inicial: limpa.
- Evolution API local: `http://localhost:8080`.
- Servidor piloto: `npm run dev:pilot`, iniciado em `http://localhost:3333`.
- Banco validado pelo script piloto: `barbearia_pilot` em host loopback.
- Instancia Evolution usada: `geovane-local`.

## Execucao

- Containers Evolution locais estavam rodando: API, Postgres e Redis.
- API Evolution respondeu `HTTP 200`.
- `.env.pilot.local` possui variaveis Evolution esperadas e esta ignorado pelo Git.
- Login owner local de teste funcionou.
- Painel WhatsApp existe no codigo, mas nao ficou acessivel pela navegacao owner atual porque o modulo `whatsapp` esta fora da lista de modulos permitidos/visiveis do owner.
- Foi usada a rota/endpoint local equivalente de integracao, sem imprimir segredo.

## QR Code e conexao

- Instancia `geovane-local` nao existia no inicio da execucao.
- Instancia `geovane-local` criada com sucesso na Evolution local.
- QR Code foi gerado e exibido a partir de arquivo temporario em `%TEMP%`.
- O QR Code nao foi salvo no repositorio.
- Status apos duas janelas de polling: `connecting`.
- Numero conectado mascarado: indisponivel, pois a instancia nao chegou a `open`.

## Envio direto

- Mensagem prevista: `Teste interno Liddo Barber: integracao WhatsApp local conectada com sucesso.`
- Envio direto nao executado porque a instancia nao conectou.
- Nenhuma mensagem real foi enviada.
- Nenhum cliente real foi usado.
- Nenhum envio em massa foi executado.

## Booking

- Envio via booking nao executado.
- Motivo: a regra da macro condiciona o booking a conexao previa segura; a instancia permaneceu `connecting`.
- Nenhum agendamento controlado foi criado nesta execucao.
- Banco, financeiro, estoque, agenda e checkout nao foram alterados por esta validacao.

## Validacoes

- Backend `/whatsapp/status` owner-only respondeu `HTTP 200` com `state=connecting`.
- Logs recentes checados sem presenca da API key.
- Logs recentes checados sem payload de QR persistido.
- `git status --short` inicial estava limpo.
- Nenhum segredo foi versionado.

## Riscos

- QR Code pode expirar antes do scan humano.
- O modulo WhatsApp existe no frontend, mas esta oculto/bloqueado para owner pela configuracao atual de menu/permissao.
- Enquanto a instancia permanecer `connecting`, qualquer envio real deve continuar bloqueado.

## Proximos passos

1. Confirmar com humano o scan do QR usando apenas numero de teste autorizado.
2. Reconsultar `connectionState` ate `open`.
3. Registrar numero conectado apenas mascarado.
4. Fazer exatamente um envio direto para numero de teste autorizado.
5. Somente depois, avaliar booking controlado com cliente explicitamente de teste.
6. Decidir se o modulo WhatsApp deve voltar a ser visivel para owner ou se o acesso deve seguir por ferramenta/admin local.

## Atualizacao Macro 239.3 - Renovacao e conexao concluida

Data: 2026-07-10 21:24:32 -03:00

### Estado inicial

- Branch: `main`, com 1 commit local seguro pendente de push da macro anterior.
- Worktree inicial da macro 239.3: limpa.
- Containers Evolution locais rodando: API, Postgres e Redis.
- API Evolution local respondeu `HTTP 200`, versao `2.3.7`.
- Servidor piloto respondeu `/health` com `HTTP 200`.
- `/whatsapp/status` owner-only respondeu `HTTP 200`.
- Estado inicial da instancia: `close`.

### Sessao anterior

- A sessao anterior nao precisou ser removida.
- A instancia `geovane-local` estava presente e nao estava mais presa em `connecting`.
- Nenhum volume Docker foi apagado.
- Nenhum reset, migration, seed ou deploy foi executado.

### QR Code renovado

- QR Code novo gerado via rota owner-only `/whatsapp/connect`.
- QR Code salvo somente em arquivo temporario fora do repositorio.
- QR Code exibido para scan com numero de teste autorizado.
- Apos polling, a instancia chegou a `open`.

### Conexao

- Estado final apos scan: `open`.
- Numero conectado mascarado: `5519***18`.
- Status apos envio direto: `open`.

### Envio direto controlado

- Envio direto executado exatamente uma vez.
- Destinatario: numero de teste conectado, registrado apenas como `5519***18`.
- Mensagem enviada: `Teste interno Liddo Barber: integracao WhatsApp local conectada com sucesso.`
- API da Evolution respondeu `HTTP 201` com identificador de mensagem presente.
- Recebimento no celular: pendente de confirmacao humana visual.
- Envio via booking nao foi executado.
- Nenhum agendamento foi criado.

### Logs e seguranca

- Logs recentes nao mostraram API key.
- Logs recentes nao mostraram payload de QR.
- Logs recentes nao mostraram o texto da mensagem de teste.
- Logs locais da Evolution registraram identificador completo do numero conectado; esse dado nao foi versionado, mas deve ser tratado como sensivel na operacao.
- Nenhum segredo foi versionado.

### Proximos passos

1. Confirmar visualmente no celular de teste se a mensagem chegou.
2. Manter proibido envio via booking ate a confirmacao humana do recebimento.
3. Se confirmado, planejar um teste de booking controlado com cliente explicitamente de teste e telefone autorizado.
4. Avaliar reducao/sanitizacao dos logs locais da Evolution antes de qualquer validacao mais ampla.
