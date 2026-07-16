# Etapa 1 — Entrada de estoque pelo WhatsApp

## Decisão final

Implementar interpretação determinística de texto após a normalização comum do webhook. Áudio usa somente Whisper local e entrega a transcrição ao mesmo orquestrador. A interpretação nunca escreve no banco. Uma prévia persistida e vinculada a tenant, owner e telefone é obrigatória. A confirmação consome a prévia e aplica estoque, movimento, financeiro opcional, auditoria e idempotência na mesma transação.

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
  -> claim da prévia + estoque + movimento + despesa opcional + auditoria
     + resposta idempotente, atomicamente
```

O pipeline existente de agendamento e venda permanece intacto. A feature entra depois que texto e áudio convergem e antes do parser genérico de comandos do owner.

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

Motivo: evita despesa e custo de compra incorretos.

Riscos: frases curtas como “10 pomadas por 100 reais” exigem uma resposta adicional.

Consequências futuras: nenhuma mudança de modelo altera esta regra.

### Vínculo financeiro

Problema: nem toda entrada física deve gerar despesa e nenhuma despesa pode ser implícita de modo inseguro.

Alternativa A: sempre criar despesa quando houver custo.

Alternativa B: guardar decisão booleana na prévia; linguagem explícita de compra/pagamento marca `Sim`, negação explícita marca `Não`, e ambiguidade mantém um contexto curto que aceita somente `sim` ou `não` isolado antes de criar a prévia completa.

Decisão: alternativa B.

Motivo: separa custo da compra de reconhecimento financeiro e mantém controle humano.

Riscos: uma formulação contraditória é rejeitada para esclarecimento. Uma prévia completa nunca é alterada por uma resposta financeira posterior.

Consequências futuras: forma de pagamento e fornecedor podem ser campos adicionais, sem mudar a atomicidade.

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

Se o sistema tiver perguntado especificamente pela decisão financeira após detectar uma formulação contraditória, somente `sim` ou `não` isolado completa esse campo. A resposta cria uma prévia completa e ainda exige `CONFIRMAR`; mensagens com produto, quantidade, custo, data ou nova intenção não complementam nem substituem uma prévia pendente.

## Uso responsável de IA

O único componente probabilístico desta etapa é o Whisper local para áudio. Um parser determinístico não converte áudio em texto; o ganho operacional é permitir registro falado. Se a transcrição falhar, divergir entre passes ou deixar campos críticos ambíguos, o sistema pede texto ou esclarecimento. Produto, quantidade, moeda, custo, aritmética, data, tenant, autorização, prazo e idempotência são validados deterministicamente. Testes usam um transcritor mock e passam exatamente pelo mesmo `commandText`, sem iniciar Whisper ou Evolution. Regressões são cobertas por uma matriz fixa de frases e payloads, independente do modelo de transcrição.

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
| Ocultar operação financeira | M | A | decisão `Sim/Não` visível na prévia e auditada | com/sem financeiro | B |
| Confirmação simultânea | M | A | claim condicional da preview dentro da transação | `Promise.all` | B |
| Webhook duplicado | A | M | unique persistente existente | mesmo message ID | B |
| Retry após timeout | M | A | resultado fica na preview; confirmação repete resposta | confirmação repetida | B |
| Operação parcialmente gravada | B | A | uma transação para todos os efeitos | falha injetada | B |
| Auditoria sem estoque | B | A | auditoria crítica na mesma transação | rollback | B |
| Estoque sem movimento | B | A | incremento e movimento na mesma transação | rollback/contagens | B |
| Despesa duplicada | M | A | claim da preview e chave/referência única | replay/concorrência | B |
| Prévia expirada reutilizada | M | A | `expiresAt` validado no claim | preview expirada | B |
| Teste aponta para `barbearia_pilot` | M | A | guard explícito rejeita nome piloto/sensível | teste do database guard | B |
| Seed acidental | B | A | nenhum seed/reset/db push no fluxo; scripts de teste derivam banco com `test` | inspeção de scripts | B |
| Migration no banco errado | B | A | migration é somente preparada; validação roda em banco descartável | URL guard + relatório | B |
| Variável sobrescrita | M | A | launcher piloto fixa modo/host/porta e valida DB | server environment guard | B |
| Segredo em log | M | A | logs estruturados usam hashes/máscaras e audit sanitizer | inspeção/testes de sanitização | B |
| Whisper indisponível | M | M | falha fechada para áudio, texto permanece disponível | mock indisponível | B |
| Evolution timeout no envio | M | M | efeito só ocorre após confirmação; delivery é observado e retry não reaplica | gate de resposta + idempotência | M |

## Observabilidade e métricas

Eventos existentes do pipeline cobrem recebimento, deduplicação, transcrição, falha, preview, cancelamento e estado final. Esta etapa acrescenta eventos estruturados para intenção de entrada, rejeição/esclarecimento, produto resolvido/ambíguo, preview persistida/expirada/cancelada, confirmação/replay/conflito, transação concluída/rollback e despesa criada. Logs carregam correlation/request ID, unidade, origem, fingerprints, duração, preview ID e operation ID sem mensagem, áudio ou payload integral.

As contagens podem ser derivadas de `AuditLog.action` e os tempos de `createdAt`/metadados. Não é introduzido um stack de métricas nesta etapa.
