# Macro 239.4 - Booking controlado com WhatsApp automatico

Data: 2026-07-11

## Ambiente

- Ambiente: local/piloto.
- Branch inicial: `main`.
- `HEAD == origin/main` no inicio.
- Ahead/behind inicial: `0 0`.
- Worktree inicial: limpa.
- Servidor piloto: `http://localhost:3333`.
- Banco validado: `barbearia_pilot`.
- Evolution local: `http://localhost:8080`, versao `2.3.7`.
- Instancia WhatsApp: `geovane-local`.
- Estado WhatsApp antes do booking: `open`.
- Numero conectado mascarado: `5519***18`.
- `.env.pilot.local` ignorado pelo Git e nao rastreado.

## Booking executado

- Cliente de teste: `CLIENTE TESTE WHATSAPP AUTOMATICO`.
- Unidade publica: `unit-geovane-borges`.
- Servico: `Corte`.
- Servico ID: `svc-geovane-corte`.
- Profissional resolvido: `Geovane Borges`.
- Inicio: `2026-07-13T12:00:00.000Z` (`2026-07-13 09:00`, America/Sao_Paulo).
- Fim: `2026-07-13T12:30:00.000Z`.
- ID do agendamento: `2ca887df-de8c-4b91-a10f-2cd5605e328b`.
- Endpoint publico respondeu `HTTP 201`.
- Idempotency key usada: `macro-239-4-booking-whatsapp-20260713-0900`.

## Validacao no banco/backend

- Cliente de teste encontrado no agendamento criado.
- Agendamento criado no slot esperado.
- Servico correto: `Corte`.
- Profissional correto: `Geovane Borges`.
- Total de agendamentos para o cliente de teste no slot: `1`.
- Total de agendamentos no slot: `1`.
- Duplicacao: nao detectada.

## WhatsApp automatico

- O fluxo real de `/public/booking` cria `bookingData` e chama `sendWhatsAppMessage(...)` de forma assincrona apos o agendamento.
- Logs recentes indicaram atividade de envio na Evolution apos o booking.
- Recebimento visual no celular de teste: confirmado.
- Acentos na mensagem recebida: corretos.
- Conteudo geral esperado da mensagem: confirmacao de agendamento da Barbearia Geovane Borges, com cliente de teste, servico Corte, data, horario e profissional.
- Numero completo nao foi documentado.

## Logs e seguranca

- Logs recentes nao mostraram API key.
- Logs recentes nao mostraram QR Code ou payload de QR.
- Logs recentes nao mostraram token.
- Logs recentes nao mostraram o nome do cliente de teste.
- Logs locais da Evolution continuam registrando identificador completo do numero conectado; esses logs sao sensiveis e nao foram versionados.
- Nenhum QR Code, sessao, token, API key, log ou numero completo foi versionado.

## Riscos

- A notificacao WhatsApp do booking e assincrona e nao bloqueia a resposta do agendamento; falhas de envio nao desfazem o booking.
- Logs locais da Evolution devem continuar fora do Git por conterem identificador completo do numero.
- Proximas validacoes devem manter idempotency key unica e telefone autorizado.

## Proximos passos

1. Confirmar visualmente o recebimento da mensagem no celular de teste.
2. Se confirmado, publicar apenas a documentacao segura desta macro.
3. Planejar endurecimento futuro para observabilidade sanitizada de notificacoes automaticas.
