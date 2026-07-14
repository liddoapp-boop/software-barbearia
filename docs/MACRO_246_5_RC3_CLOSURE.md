# Macro 246.5 — Fechamento local definitivo e RC.3

## Decisão

`PROJETO PRONTO — ÁUDIO EXPERIMENTAL`.

O WhatsApp textual integra o aceite funcional da RC.3. Gemini é opcional e não é requisito de startup, health ou operações do sistema. O áudio local permanece experimental, desligado por padrão e fora do aceite funcional.

## Estado seguro

- `AI_AUDIO_TRANSCRIPTION_ENABLED` permanece `false` por padrão.
- `local_whisper` só é criado quando áudio está habilitado e todos os caminhos locais são fornecidos por flags.
- `local_llama` só é criado por `SEMANTIC_PROVIDER=local_llama`; o default é determinístico.
- Sem chave Gemini, health, agenda, vendas, financeiro, estoque e texto determinístico continuam operando.
- Falha ou ausência de processo local retorna falha fechada no fluxo de áudio, sem executar operação comercial.
- Nenhum modelo, binário, áudio, transcrição ou relatório local com dados pessoais pertence ao Git.

## Motivo do congelamento de áudio

O melhor ASR local atingiu a latência, mas falhou nomes e horários críticos. O Qwen3-4B local não passou o gate semântico de latência. Não serão feitos novos benchmarks, ajustes de modelo ou alterações de NLP nesta RC.

## Evidências e artefatos locais

Os artefatos de benchmark e manifestos sanitizados ficam fora do repositório, sob diretórios locais isolados. Não devem ser apagados automaticamente. A remoção, se desejada, é manual após encerrar processos locais de ASR ou llama-server.

## Gates RC.3

- Build, auditoria de dependências e verificação de diff aprovados.
- Suíte serial: 497 testes aprovados; 42 testes DB permanecem fora da suíte comum.
- Banco de teste local oficial já migrado: 42 testes de integração aprovados sem executar migration, seed ou reset nesta macro.
- Piloto consultado somente em leitura: 0 clientes, agendamentos, checkouts, financeiros e vendas; 6 produtos, 6 movimentos, estoque total 73 e fingerprint inalterado.

## Retomada

O projeto fica congelado até uma macro de VPS, TCC ou correção P0/P1 autorizada. A retomada do áudio requer nova base humana referenciada ou hardware/modelos adequados e um novo gate completo.
