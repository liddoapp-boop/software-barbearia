# Núcleo semântico comercial local

## Escopo e invariantes

Texto e transcrição de áudio entram no mesmo pipeline. A camada semântica propõe entendimento; resolução de catálogo, números, estoque, RBAC, confirmação, idempotência, transação, financeiro e alertas permanecem determinísticos.

O modelo não recebe segredo, telefone, LID, áudio, base64, URL de mídia nem payload integral. O processo local escuta apenas em `127.0.0.1` e não acessa banco.

## Causa raiz comprovada

O fallback antigo agrupava falhas diferentes em uma única resposta. A falha sanitizada `Vendi 11 pomadas Matte por 649.` expôs quatro causas combinadas:

1. o parser reconhecia a venda, mas reduzia o produto a `Matte`;
2. `por 649` era tratado como preço unitário, não como total;
3. a forma de pagamento era obrigatória antes da resolução determinística do default;
4. áudio transcrito pelo Whisper local chamava o mesmo parser, mas com `disableSemanticProvider: true`.

O cliente `local_llama` também enviava o JSON Schema no campo incompatível `response_format.schema`; `llama.cpp` exige `response_format.json_schema.schema`. Assim, a restrição não era aplicada de fato.

## Origens anteriores do catch-all

- transcrição vazia ou sem fala;
- exceção do parser após áudio;
- intenção `unknown` após áudio;
- mensagem textual vazia;
- esclarecimento sem campo reconhecido.

Essas origens agora se separam em transcrição inaudível, operação não suportada, campo ausente, campo ambíguo, entidade não encontrada/ambígua, valor inconsistente e erro interno sanitizado. A mensagem antiga tem zero ocorrências no código e nos testes.

## Arquitetura

Antes:

`texto | Whisper → parser por encaixe → resolução → catch-all ou prévia`

Agora:

`texto | Whisper → commandText → contrato canônico → fast path determinístico → proposta semântica local quando necessária → validação determinística → esclarecimento específico | prévia → CONFIRMAR/CANCELAR → transação → auditoria/idempotência`

O contrato discriminado aceita `RESOLVED`, `NEEDS_CLARIFICATION`, `UNSUPPORTED` e `TRANSCRIPTION_FAILURE`. Comandos canônicos usam schemas estritos, rejeitam propriedades extras, quantidades inválidas, intenções inexistentes e comandos resolvidos incompletos.

## Números, valores e produtos

- números em algarismos e por extenso até milhares;
- marcadores de unitário: `cada`, `por unidade`, `N unidades a X`;
- marcadores de total: `total`, `deu`, `ficou`, `tudo`, `por X` após quantidade;
- validação de `quantidade × unitário = total` contra o preço oficial;
- singular/plural, caixa, acentos, prefixos seguros e pequena distância ortográfica;
- empate de catálogo nunca é escolhido silenciosamente;
- preço pode desempatar somente quando identifica exatamente um produto do catálogo.

## Matriz de respostas

| Classe | Resposta/ação |
|---|---|
| `TRANSCRIPTION_EMPTY` / `TRANSCRIPTION_UNUSABLE` | “Não consegui ouvir o áudio com clareza...” |
| intenção suportada parcial | pergunta apenas o campo ausente |
| papel do valor ambíguo | pergunta total ou unitário |
| produto ambíguo | informa que há mais de um candidato e pergunta qual |
| entidade não encontrada | informa catálogo não encontrado e pede nome cadastrado |
| operação não suportada | informa operações comerciais aceitas |
| falha interna/schema | mensagem sanitizada; nenhuma operação executada |
| modelo indisponível | fast path continua; parcial gera pergunta; nenhum efeito é executado |

## Hardware e benchmark

Host observado em 2026-07-16:

- Intel Core i5-9500, 6 núcleos/6 threads;
- 16 GB RAM;
- NVIDIA GTX 1660 SUPER, 6 GB VRAM (5,3 GB livres antes da carga);
- `llama.cpp b10048`, CUDA 12.4;
- processo Gemma residente: aproximadamente 2,71 GiB;
- o driver WDDM não expôs VRAM por processo.

Modelos isolados:

| Modelo | Arquivo | SHA-256 | Resultado inicial |
|---|---:|---|---:|
| Llama 3.2 3B Instruct Q4_K_M | 2.019.377.696 bytes | `6c1a2b41161032677be168d354123594c0e6e67d2b9227c84f296ad037c728ff` | 4/25; reprovado por invenção e confusão de intenção |
| Gemma 3 4B IT Q4_K_M | 2.489.758.112 bytes | `4996030242583a40aa151ff93f49ed787ac8c25e4120c3ae4588b2e2a7d1ae94` | 10/25 isolado; escolhido para fusão híbrida e submetido ao cliente real |

Benchmark final do cliente real, temperatura zero, schema restrito e validação determinística:

| Rodada | Casos | Acertos | Média | p95 | Falhas inseguras |
|---|---:|---:|---:|---:|---:|
| 1 | 10 | 10 | 7.562 ms | 8.362 ms | 0 |
| 2 | 10 | 10 | 7.840 ms | 8.837 ms | 0 |

O Gemma foi escolhido por superar o Llama nos testes brutos, suportar português/multilinguismo e caber integralmente no hardware. Ele só permanece habilitado porque a fusão final passou repetidamente; nenhum campo comercial é aceito sem validação local.

## Operação local

Variáveis:

```text
SEMANTIC_PROVIDER=local_llama
LOCAL_LLAMA_URL=http://127.0.0.1:11435
LOCAL_LLAMA_MODEL=google_gemma-3-4b-it-Q4_K_M.gguf
LOCAL_LLAMA_MODEL_SHA256=4996030242583a40aa151ff93f49ed787ac8c25e4120c3ae4588b2e2a7d1ae94
LOCAL_LLAMA_TIMEOUT_MS=15000
```

Diagnóstico e benchmark:

```text
npm run semantic:doctor
npm run semantic:benchmark
```

Os pesos e binários são artefatos locais externos ao repositório. Não devem ser adicionados ao Git.
