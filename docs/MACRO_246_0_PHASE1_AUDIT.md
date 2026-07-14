# Macro 246.0 — auditoria arquitetural anterior às alterações

Data da auditoria: 2026-07-13. Escopo: fluxo real do webhook Evolution até resposta e auditoria. Nenhum código foi alterado antes da conclusão deste diagnóstico.

| Etapa | Função/arquivo | Entrada → saída | Timeout | Retry / fallback | Auditoria atual | Falha e resposta atual |
|---|---|---|---|---|---|---|
| Evolution/webhook | `app.post("/webhooks/evolution/whatsapp")`, `src/http/app.ts` | payload Evolution → mensagem normalizada | timeout global não explícito | nenhum | recebido/rejeitado | segredo inválido retorna 401; demais rejeições normalmente não respondem |
| Telefone/LID | `extractEvolutionWhatsappIdentity` | `remoteJid`, `remoteJidAlt` → telefone/reply target | n/a | aceita LID somente com `remoteJidAlt` telefônico | rejeição por telefone mascarado | não autorizado é ignorado sem resposta |
| Claim/deduplicação | `claimAiWhatsappWebhook` | chave por instance+telefone+messageId/eventId → claimed/duplicate | banco | unique/P2002; memória fora de Prisma | claimed, duplicate, failure | falha encerra sem provedor, resposta ou mutação |
| Download | `downloadEvolutionWhatsappAudio` | referência Evolution → `Buffer` | 8 s configurável | nenhum | sucesso só com tamanho; falha só com razão agregada | status/código/duração/Retry-After não eram preservados; mensagem de processamento |
| ASR | `GeminiAudioTranscriptionService.transcribe` | bytes+mimetype → transcrição | 20 s/tentativa; 45 s total | até 2 retries; backoff+jitter; Retry-After/RetryInfo | agregado final | não cobria exatamente a allowlist; rede não repetia e todo 5xx repetia; sem trilha por tentativa |
| Gemini semântico | `GeminiOwnerCommandParser.parseGemini` | texto+contexto → parse semântico | 15 s | nenhuma repetição nem fallback de modelo | sucesso observado depois do retorno | falha lançada perdia corpo sanitizado, Retry-After, modelo, endpoint e tentativa |
| Structured output/Zod | schemas em `owner-command-ai.ts` | JSON do modelo → tipo interno | dentro do timeout semântico | fallback determinístico em alguns casos | código agregado | schema era condicional e diferente do contrato da Macro; aceitava formatos legados |
| Confiança por campo | `sanitizeSemanticScheduleV2` | campos/evidências → accepted/rejected | n/a | nenhum | `fieldDiagnostics` no sucesso | robusto para agendamento V2, mas ausente nos formatos legados/genéricos |
| Normalização | recognizers/sanitizers em `owner-command-ai.ts` | expressões → data/hora/nome canônicos | n/a | divergência vira rejeição | parser observado | caminhos legados podem substituir dados sem a mesma evidência por campo |
| Grounding | `resolveAiWhatsappEntities`, `whatsapp-entity-resolution.ts` | nomes → entidades tenant | banco | aliases explícitos; sem fuzzy automático | entidades/candidatos | serviço/profissional ausente ou ambíguo impede prévia; cliente novo só é avisado |
| Multiturno | maps em `src/http/app.ts` | campos aceitos → contexto TTL | 10 min | memória local | stored/completed | perde contexto em restart ou múltiplas instâncias; não é claim distribuído |
| Prévia | `formatAiWhatsappPreview` e pending map | draft grounded → código/prévia | TTL 10 min | nenhum | decisão/parsed/response | pending é criado antes do envio; falha de envio deixa pending local |
| CONFIRMAR | branch `CONFIRMAR NNNN`, `executeOwnerCommand` | pending+token → execução | dependências internas | idempotency key derivada do token | confirmed/rejected | pending é marcado usado antes da execução; repetição não executa novamente |
| CANCELAR | branch `CANCELAR` | telefone → remoção de pending/contexto | n/a | idempotente por ausência | cancelled | responde uma vez e não executa operação comercial |
| Auditoria | `safeAudit`/`AuditRecorder` | metadados → AuditLog | banco | falha é absorvida | sem sanitização central | aceita qualquer JSON; disciplina depende de cada call site |
| Resposta WhatsApp | `safeSend`/`sendWhatsAppMessage` | texto → Evolution sendText | inexistente | nenhum | sent/failed | erro incluía corpo bruto no objeto Error; não havia trava para segunda chamada |

## Achados classificados

- **P0:** nenhum estado final tipado nem trava de resposta. O `catch` externo podia tentar uma segunda resposta caso uma exceção ocorresse depois de um envio.
- **P1:** Gemini semântico fazia uma tentativa única e ocultava a causa externa no caminho de erro. Esta é a camada comprovadamente responsável pela falha real anterior.
- **P1:** políticas ASR e semântica eram divergentes; não havia wrapper comum, allowlist exata, configuração uniforme ou fallback controlado.
- **P1:** não existia observação sanitizada de cada tentativa; status/código/duração/orçamento ficavam incompletos.
- **P1:** structured output era condicional, aceitava contratos legados e não correspondia ao contrato único solicitado.
- **P1:** pending/contexto multiturno eram locais ao processo, portanto não distribuídos.
- **P2:** download e envio Evolution colapsavam detalhes; envio não possuía timeout.
- **P2:** falha semântica podia cair em determinístico parcial e ocultar a indisponibilidade do modelo.
- **P2:** a suíte possuía 35 construções semânticas, não 50, e os testes de provedor usavam transporte mockado.
- **P2:** não havia probe real isolado de ASR nem de structured output usando a configuração de runtime.

## Conflitos de orçamento identificados

- download (8 s) + ASR (até 45 s) + semântica (15 s) já alcançavam 68 s, sem incluir grounding, auditoria e envio;
- o envio Evolution não tinha timeout;
- cada provedor gerenciava seu próprio retry, impossibilitando provar uma política uniforme por tentativa.
