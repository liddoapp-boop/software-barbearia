# Revisão do worktree — Macro 246.5 / RC.3

Base revisada: `main` em `d6dd0ceac636dd7ee12c5545e16644a441a26638` antes do commit RC.3.

## A. Correções necessárias — Macros 245.2–246.4

| Arquivo | Origem provável | Diff resumido | Destino RC.3 |
| --- | --- | --- | --- |
| `src/application/audio-transcription.ts` | 246.x | Adapter resiliente Gemini, diagnósticos sanitizados e adapter local opt-in/falha fechada | incluir |
| `src/application/owner-command-ai.ts` | 246.x | contrato estruturado, grounding, data/hora natural e providers semânticos opt-in | incluir |
| `src/application/whatsapp-entity-resolution.ts` | 246.x | resolução segura de cliente novo/ambíguo | incluir |
| `src/application/audit-service.ts` | 246.x | sanitização central de auditoria | incluir |
| `src/application/ai-whatsapp-pipeline.ts` | 246.x | estados tipados e trava de resposta única | incluir |
| `src/application/resilient-provider.ts` | 246.x | retry, timeout e diagnóstico por tentativa sem segredo | incluir |
| `src/http/app.ts` | 246.x | deduplicação, preview seguro, contexto de esclarecimento e flags locais | incluir |
| `src/notifications/index.ts` | 246.x | erro de entrega WhatsApp sanitizado/timeout | incluir |
| `.env.example` | 246.4 | defaults seguros para ASR e semântico local | incluir |
| `.gitignore` + remoção de `.claude/settings.json` do índice | 246.5 | impede versionar configuração pessoal do assistente; arquivo local é preservado | incluir |

## B. Documentação

| Arquivo | Origem provável | Diff resumido | Destino RC.3 |
| --- | --- | --- | --- |
| `README.md` | 246.5 | status RC.3, texto funcional e áudio experimental | incluir |
| `WHATSAPP_IA.md` | 246.1–246.5 | flags, privacidade, Gemini opcional e áudio desligado | incluir |
| `.planning/244_3_MANIFESTO_ENTREGA_LOCAL.md` | 246.5 | adendo de fechamento RC.3 e congelamento | incluir |
| `.planning/HANDOFF.json` e `.planning/.continue-here.md` | 246.5 | próximo estado de retomada e decisão oficial | incluir |
| `.planning/README.md` | 246.5 | índice e estado atual | incluir |
| `.planning/93_VALIDACAO_MANUAL_EXECUCAO.md`, `95_CHECKLIST_VISUAL_PRE_DEPLOY.md`, `97_EXECUCAO_CHECKLIST_AMBIENTE_ALVO.md` | preexistente, corrigido em 246.5 | remove caminhos pessoais históricos | incluir |
| `docs/MACRO_246_0_PHASE1_AUDIT.md` | 246.0 | auditoria arquitetural de origem | incluir |
| `docs/MACRO_246_5_RC3_CLOSURE.md` e este arquivo | 246.5 | decisão, gates e rastreabilidade de fechamento | incluir |

## C. Testes

| Arquivos | Origem provável | Diff resumido | Destino RC.3 |
| --- | --- | --- | --- |
| `tests/ai-whatsapp-audio.spec.ts`, `ai-whatsapp-webhook.spec.ts` | 246.x | áudio, webhook, deduplicação, preview, timeout e resposta única | incluir |
| `tests/owner-command-ai.spec.ts`, `owner-command-parser.spec.ts`, `whatsapp-entity-resolution.spec.ts` | 246.x | schema, grounding, ambiguidades e entidades | incluir |
| `tests/ai-whatsapp-semantic-orchestration.spec.ts`, `local-ai-providers.spec.ts`, `resilient-provider.spec.ts` | 246.x | orquestração semântica, defaults seguros e resiliência | incluir |

## D. Fora do Git

| Arquivo | Origem provável | Motivo |
| --- | --- | --- |
| `scripts/capture-ai-pilot-baseline.ts` | 246.4 | utilitário local read-only de evidência; não é runtime da aplicação |
| `scripts/probe-ai-providers.ts` | 246.4 | probe manual de provedor; não é necessário para a RC.3 e não deve incentivar ativação de áudio |
| artefatos externos de ASR/Qwen | 246.3–246.4 | modelos, binários, cache e resultados sanitizados ficam fora do repositório |

## E. Alteração preexistente sem relação comprovada

`.claude/settings.json` era configuração local preexistente com caminhos pessoais de outra máquina. Não foi apagada do disco; foi removida somente do índice e passou a ser ignorada. Nenhuma outra alteração pendente foi descartada automaticamente: o conteúdo restante foi associado às Macros 246.x pelo escopo, imports, testes e documentação correspondentes.
