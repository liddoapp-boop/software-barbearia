# Etapa 1 — Entrada de estoque pelo WhatsApp

## Decisão final

Implementar interpretação determinística de texto após a normalização comum do webhook. Áudio usa somente Whisper local e entrega a transcrição ao mesmo orquestrador. A interpretação nunca escreve no banco. Uma prévia persistida e vinculada a tenant, owner e telefone é obrigatória. A confirmação consome a prévia e aplica estoque, movimento, auditoria e idempotência na mesma transação.

Não há fallback para Gemini, Qwen, OpenAI ou outro provedor pago. Se o parser determinístico ou o Whisper local não produzirem dados seguros, o fluxo pede esclarecimento e não altera dados.

## Arquitetura encontrada e extensão

```text
Evolution autenticada + rate limit
  -> identidade owner + tenant guard
  -> deduplicação persistente do webhook
  -> texto OU download e Whisper local
  -> commandText comum
  -> parser determinístico de entrada de estoque
  -> resolução em produtos ativos do tenant
  -> validação de quantidade, moeda, custo, data e consistência
  -> prévia persistida em IdempotencyRecord
  -> CONFIRMAR/CANCELAR exatos pelo mesmo owner, telefone e tenant
  -> OperationsService | PrismaOperationsService
  -> claim da prévia + estoque + movimento + auditoria
     + resposta idempotente, atomicamente
```

O pipeline existente de agendamento e venda permanece intacto. A feature entra depois que texto e áudio convergem e antes do parser genérico de comandos do owner.

## Escopo concluído e forma de iniciar

A Etapa 1 está encerrada com entrada unitária de estoque por texto ou áudio, prévia obrigatória, confirmação estrita, cancelamento, idempotência e atualização atômica de estoque e movimento. O preço de venda é exibido somente para conferência e não é alterado; nenhum lançamento financeiro é criado.

Com Docker, FFmpeg, `whisper.cpp`, modelo e VAD locais preparados, o ambiente reproduzível é iniciado por:

```powershell
npm run evolution:build
npm run evolution:up
npm run evolution:doctor
npm run dev:isolated
```

O backend isolado usa memória e atende em `127.0.0.1:3334`. A Evolution usa PostgreSQL e Redis próprios em sua rede Docker; nenhum desses comandos aponta para o banco operacional da barbearia.

## Operação e recuperação da Evolution

- `npm run evolution:build`: constrói a imagem local sobre a base fixada por versão e digest;
- `npm run evolution:up`: inicia ou atualiza os containers preservando os volumes persistentes;
- `npm run evolution:doctor`: valida imagem, versões, containers, instância, webhook, `MESSAGES_UPSERT`, backend e o erro conhecido da fila;
- `npm run evolution:recover`: executa no máximo uma reinicialização oficial e não destrutiva por incidente, preservando o fingerprint da sessão.

Inatividade, `open` isolado ou `registered=false` isolado não autorizam recuperação. A recuperação automática permanece desabilitada por padrão e, se explicitamente habilitada, reage somente ao erro conhecido da fila, com lock e cooldown. Excluir instância, fazer logout, remover volumes ou gerar novo QR Code não faz parte desse procedimento.

## Decisões arquiteturais

### Movimento de estoque

Problema: preservar o custo real da compra junto à entrada.

Alternativa A: criar `StockEntry` e também `StockMovement`.

Alternativa B: ampliar `StockMovement` com custo unitário, custo total e observação opcionais.

Decisão: alternativa B.

Motivo: há uma única entrada por operação nesta etapa e o movimento já é o registro contábil do estoque. Um agregado adicional duplicaria vínculo, lifecycle e consultas.

Riscos: campos opcionais exigem validação por `referenceType` na aplicação.

Consequências futuras: se compras passarem a ter fornecedor, nota fiscal e vários itens, um agregado de compra poderá referenciar vários movimentos sem invalidar os dados desta etapa.

### Persistência de prévias

Problema: confirmação deve sobreviver a reinício e funcionar com duas instâncias.

Alternativa A: manter prévia em `Map` do processo.

Alternativa B: usar `IdempotencyRecord` como slot persistente por tenant/owner/telefone, com payload tipado, hash, status e expiração.

Decisão: alternativa B no Prisma; o adapter de memória mantém o mesmo contrato para testes.

Motivo: reutiliza persistência e chave única existentes sem criar tabela genérica ou infraestrutura adicional.

Riscos: a tabela passa a guardar estado curto de workflow; ações e schema do JSON devem permanecer explícitos e versionados.

Consequências futuras: uma tabela dedicada só será indicada se houver múltiplos workflows conversacionais consultáveis ou histórico de prévias como requisito de produto.

### Resolução de produtos

Problema: associar texto a um produto sem alterar o item errado.

Alternativa A: fuzzy matching ou modelo semântico.

Alternativa B: correspondência determinística exata/normalizada e correspondência parcial apenas quando houver um único candidato.

Decisão: alternativa B, limitada a produtos ativos do tenant.

Motivo: nomes semelhantes produzem esclarecimento, não uma aposta probabilística. Produto inexistente nunca é criado.

Riscos: o owner pode precisar informar o nome mais completo.

Consequências futuras: aliases explícitos e administráveis podem ser adicionados; matching externo não é necessário agora.

### Regra de custo

Problema: distinguir custo unitário de custo total e manter consistência matemática.

Alternativa A: inferir pelo contexto mesmo sem qualificadores.

Alternativa B: aceitar qualificadores explícitos (`cada`, `unitário`, `total`) e pedir esclarecimento quando ausentes; todos os cálculos são do sistema.

Decisão: alternativa B. Quando ambos forem informados, devem coincidir em centavos. Total dividido pela quantidade deve resultar em centavos inteiros.

Motivo: evita custo de compra incorreto.

Riscos: frases curtas como “10 pomadas por 100 reais” exigem uma resposta adicional.

Consequências futuras: nenhuma mudança de modelo altera esta regra.

### Preço de venda informativo

Problema: permitir ao owner conferir o preço atual sem confundir custo de compra com preço de venda.

Decisão: resolver o preço de venda junto com o produto e congelá-lo na prévia como dado exclusivamente informativo. A confirmação incrementa somente `stockQty`, preserva `salePrice` e `costPrice` e não cria lançamento financeiro.

Motivo: a entrada registra o custo real no movimento de estoque sem alterar o cadastro comercial do produto ou o financeiro.

Riscos: o preço exibido representa o valor capturado ao gerar a prévia; alterações cadastrais posteriores não são aplicadas por este fluxo.

Consequências futuras: qualquer comando de alteração de preço ou lançamento financeiro exige um fluxo separado e explícito.

### Chave de idempotência

Problema: bloquear webhook repetido, confirmação repetida e confirmação concorrente.

Alternativa A: hash do texto.

Alternativa B: webhook usa instance + telefone + message/event ID; confirmação usa preview ID aleatório e hash do payload, dentro do slot tenant/owner/telefone.

Decisão: alternativa B.

Motivo: mensagens iguais legítimas continuam possíveis, enquanto o mesmo evento e a mesma prévia não são reaplicados.

Riscos: evento sem message ID e event ID falha fechado para execução confiável.

Consequências futuras: funciona com várias instâncias desde que compartilhem o banco.

### Estado da conversa

Problema: preservar a prévia sem depender do último texto em memória.

Alternativa A: estado local por telefone.

Alternativa B: slot persistente escopado por tenant, owner e fingerprint do telefone, contendo preview ID, payload, hash, status e prazo.

Decisão: alternativa B.

Motivo: reinício e concorrência não mudam a autorização nem o conteúdo confirmado.

Riscos: somente uma prévia ativa por escopo. Enquanto ela estiver pendente, qualquer nova intenção de entrada é bloqueada e a prévia anterior permanece intacta até `CONFIRMAR` ou `CANCELAR` exato.

Consequências futuras: múltiplas conversas simultâneas exigiriam código de confirmação explícito, fora do escopo atual.

### Decisões de confirmação

Para entrada de estoque, somente o conteúdo `CONFIRMAR` ou `CANCELAR` é aceito, ignorando caixa e espaços externos. Variações conversacionais como `confirma`, `confirmado`, `pode confirmar`, `sim`, `ok`, `beleza` ou texto adicional não executam nem cancelam. Essa regra é local à entrada de estoque e não altera os demais fluxos comerciais existentes.

## Uso responsável de IA

O único componente probabilístico desta etapa é o Whisper local para áudio. Um parser determinístico não converte áudio em texto; o ganho operacional é permitir registro falado. Se a transcrição falhar, divergir entre passes ou deixar campos críticos ambíguos, o sistema pede texto ou esclarecimento. Produto, quantidade, moeda, custo, aritmética, data, tenant, autorização, prazo e idempotência são validados deterministicamente. Testes usam um transcritor mock e passam exatamente pelo mesmo `commandText`, sem iniciar Whisper ou Evolution. Regressões são cobertas por uma matriz fixa de frases e payloads, independente do modelo de transcrição.

### Pré-requisitos do Whisper local no modo isolado

O `npm run dev:isolated` lê de `.env.pilot.local` somente a allowlist da integração Evolution e do ASR local. Variáveis de provider remoto, chave ou modelo remoto não são carregadas nesse processo. São necessários:

- `AI_WHATSAPP_AUDIO_ENABLED=true`, `AI_AUDIO_TRANSCRIPTION_ENABLED=true` e `ASR_PROVIDER=local_whisper`;
- `LOCAL_WHISPER_GPU_ENABLED=true` e uma GPU/driver compatíveis com o build local do `whisper.cpp`;
- `LOCAL_WHISPER_FFMPEG_PATH` apontando para um executável FFmpeg local;
- `LOCAL_WHISPER_CLI_PATH` apontando para `whisper-cli` local;
- `LOCAL_WHISPER_MODEL_PATH` apontando para o modelo aprovado `ggml-large-v3-turbo-q5_0.bin`;
- `LOCAL_WHISPER_VAD_MODEL_PATH` apontando para o modelo Silero VAD local, atualmente `ggml-silero-v6.2.0.bin`.

O processo executa um warm-up real com FFmpeg, `whisper-cli`, modelo e VAD antes de disponibilizar áudio. `serviceAvailable` só fica verdadeiro após esse warm-up; em caso de falha, o HTTP continua disponível para texto, mas áudio falha fechado sem executar o orquestrador ou alterar estado. Cada mídia é limitada por tamanho e duração, processada por pipe e descartada do diretório temporário em `finally`. Logs registram somente metadados e fingerprints sanitizados, nunca bytes, base64, transcrição integral, telefone completo, segredo ou URL de mídia.

## Limitações conhecidas e evolução futura

- há somente uma prévia ativa por tenant, owner e telefone;
- produto inexistente ou ambíguo exige nova mensagem com nome suficiente e nunca é criado automaticamente;
- custo sem indicação segura de valor unitário ou total exige esclarecimento;
- somente `CONFIRMAR` ou `CANCELAR` exatos decidem uma prévia;
- áudio depende integralmente dos binários, modelos e GPU locais e não possui fallback remoto;
- recuperação da Evolution não substitui nova autenticação quando a própria API comprovar perda real da sessão.

A Etapa 1.1 fica registrada apenas como evolução futura. Correções conversacionais como “me enganei”, alteração posterior de campos, múltiplos itens na mesma compra, fornecedor, nota fiscal, alteração de preço e integração financeira não pertencem ao escopo encerrado da Etapa 1.

## Threat model resumido

Escala: probabilidade e impacto `B` (baixo), `M` (médio), `A` (alto). O risco residual considera as mitigações desta etapa.

| Risco | Prob. | Impacto | Mitigação | Teste/evidência | Residual |
| --- | --- | --- | --- | --- | --- |
| Número da Evolution falsificado | M | A | segredo do webhook, comparação constante, owner phone e RBAC persistente | webhook sem segredo/telefone divergente | B |
| Webhook sem assinatura | M | A | falha 401 antes de parsing | teste de secret ausente/inválido | B |
| Cliente externo envia `CONFIRMAR` | M | A | confirmação só após identidade owner + tenant + telefone | RBAC/telefone | B |
| Outro colaborador confirma prévia do owner | B | A | preview escopada por actor owner e fingerprint | actor divergente | B |
| Troca indevida de tenant | B | A | unit vem da configuração validada e todas as consultas incluem tenant | isolamento entre tenants | B |
| Replay de evento antigo | M | A | chave persistente por event/message ID e expiração | replay de webhook | B |
| Prompt injection | M | M | não há prompt/modelo semântico; texto é dado, não instrução | frase maliciosa vira desconhecida | B |
| Mensagem tenta alterar regras | M | A | allowlist de intenção/campos e schema tipado | comando conflitante/unsupported | B |
| Áudio com instrução maliciosa | M | A | transcrição passa pelo mesmo parser determinístico | equivalência texto/áudio | B |
| Transcrição incorreta | M | A | resolução restrita, custo qualificado, preview e confirmação | mock com campo ambíguo | M |
| Vários comandos conflitantes | M | A | múltiplos produtos/quantidades/custos divergentes são ambíguos | mensagens contraditórias | B |
| Criar produto inexistente | M | A | somente catálogo ativo do tenant; sem create | produto inexistente | B |
| Alterar preço de venda | B | A | update atômico incrementa apenas `stockQty` | snapshot antes/depois | B |
| Valor negativo | B | A | schema e limites positivos | custo negativo/zero | B |
| Confundir custo com preço de venda | M | A | ambos são rotulados separadamente; preço de venda é somente informativo | preview e snapshot antes/depois | B |
| Confirmação simultânea | M | A | claim condicional da preview dentro da transação | `Promise.all` | B |
| Webhook duplicado | A | M | unique persistente existente | mesmo message ID | B |
| Retry após timeout | M | A | resultado fica na preview; confirmação repete resposta | confirmação repetida | B |
| Operação parcialmente gravada | B | A | uma transação para todos os efeitos | falha injetada | B |
| Auditoria sem estoque | B | A | auditoria crítica na mesma transação | rollback | B |
| Estoque sem movimento | B | A | incremento e movimento na mesma transação | rollback/contagens | B |
| Prévia expirada reutilizada | M | A | `expiresAt` validado no claim | preview expirada | B |
| Teste aponta para `barbearia_pilot` | M | A | guard explícito rejeita nome piloto/sensível | teste do database guard | B |
| Seed acidental | B | A | nenhum seed/reset/db push no fluxo; scripts de teste derivam banco com `test` | inspeção de scripts | B |
| Migration no banco errado | B | A | migration é somente preparada; validação roda em banco descartável | URL guard + relatório | B |
| Variável sobrescrita | M | A | launcher piloto fixa modo/host/porta e valida DB | server environment guard | B |
| Segredo em log | M | A | logs estruturados usam hashes/máscaras e audit sanitizer | inspeção/testes de sanitização | B |
| Whisper indisponível | M | M | falha fechada para áudio, texto permanece disponível | mock indisponível | B |
| Evolution timeout no envio | M | M | efeito só ocorre após confirmação; delivery é observado e retry não reaplica | gate de resposta + idempotência | M |

## Observabilidade e métricas

Eventos existentes do pipeline cobrem recebimento, deduplicação, transcrição, falha, preview, cancelamento e estado final. Esta etapa acrescenta eventos estruturados para intenção de entrada, rejeição/esclarecimento, produto resolvido/ambíguo, preview persistida/expirada/cancelada, confirmação/replay/conflito e transação concluída/rollback. Logs carregam correlation/request ID, unidade, origem, fingerprints, duração, preview ID e operation ID sem mensagem, áudio ou payload integral.

As contagens podem ser derivadas de `AuditLog.action` e os tempos de `createdAt`/metadados. Não é introduzido um stack de métricas nesta etapa.
