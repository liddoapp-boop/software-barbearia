# Sprint 229.1A - API, disponibilidade e seguranca para multiplos servicos

## Estado inicial

- Branch inicial: `main`.
- Base local e remota antes da implementacao: `c6ef84e0c6ae0d6b37a9d8ced8ef2cba6c2319ef`.
- Working tree inicial limpa.
- Sprint 229.0 ja publicada com `AppointmentServiceItem`, regras de combinacao, snapshots agregados e compatibilidade com `Appointment.serviceId`.

## Rotas alteradas

- `POST /appointments`
- `PATCH /appointments/:id`
- `GET /appointments`
- `PATCH /appointments/:id/reschedule`
- `POST /appointments/:id/checkout`
- `GET /public/slots`
- `POST /public/booking`

## Contrato `serviceId`

- Continua aceito como contrato legado para clientes antigos.
- Gera um unico `AppointmentServiceItem`.
- Mantem `Appointment.serviceId` apontando para o servico principal legado.
- Nao pode ser enviado junto com `serviceIds`.

## Contrato `serviceIds`

- Aceita de 1 a 6 servicos.
- Preserva a ordem recebida nas posicoes dos itens.
- Rejeita lista vazia, duplicados e valores vazios.
- Rejeita servicos inexistentes, inativos ou fora da unidade.
- Rejeita envio simultaneo de `serviceId` e `serviceIds`.
- O primeiro item da lista alimenta `Appointment.serviceId` para compatibilidade.

## Validacao e normalizacao

- A normalizacao central fica em `normalizeServiceIds`.
- A duracao efetiva usa `resolveEffectiveAppointmentDuration`.
- O total usa `calculateAppointmentServicesTotal`.
- A chave de conjunto usa `buildServiceSetKey`, independente da ordem para encontrar regras.
- A regra Corte + Barba usa o conjunto canonico e retorna 45 minutos.

## Criacao memory

- `OperationsService.schedule` carrega todos os servicos, valida profissional, calcula snapshots, total e duracao antes de persistir.
- O store em memoria recebeu a regra canonica Corte + Barba = 45 minutos para manter paridade de contrato.
- Conflitos usam a duracao efetiva calculada no backend.

## Criacao Prisma

- `PrismaOperationsService.schedule` usa transacao para criar `Appointment`, historico e todos os `AppointmentServiceItem`.
- A disponibilidade e os conflitos sao revalidados com locks por profissional/cliente.
- Falhas antes ou durante a transacao nao deixam `Appointment` parcial nem itens orfaos.

## Edicao

- `PATCH /appointments/:id` permite trocar um servico por varios e varios por um.
- Ao alterar servicos, os itens antigos sao substituidos atomicamente no Prisma.
- Snapshots, total, duracao efetiva, modo de calculo, regra e `endsAt` sao recalculados.
- Falhas de validacao preservam o estado anterior.

## Remarcacao

- A remarcacao usa `effectiveDurationMinSnapshot` do agendamento.
- Nao usa silenciosamente a duracao atual do catalogo.
- Mantem `serviceItems` e snapshots intactos.
- Recalcula `endsAt` a partir do novo inicio e revalida conflito.

## Disponibilidade e conflitos

- Criacao, edicao e booking publico usam duracao efetiva calculada pelo backend.
- Conflitos bloqueiam sobreposicao por profissional ou cliente.
- Horarios adjacentes continuam permitidos.

## Profissional habilitado

- O profissional precisa estar vinculado a todos os servicos do agendamento.
- A validacao ocorre na criacao, edicao, troca de profissional e booking publico.
- O tenant guard por unidade permanece ativo.

## Booking publico

- `GET /public/slots` aceita `serviceId` legado ou `serviceIds`.
- `POST /public/booking` aceita `serviceId` legado ou `serviceIds`.
- O endpoint publico calcula total e duracao no backend e ignora campos manipulados pelo cliente.
- A intersecao de profissionais elegiveis exige habilitacao para todos os servicos.
- A interface publica visual nao foi alterada.

## Compatibilidade das respostas

- As respostas continuam expondo campos legados agregados.
- Leituras de agendamento incluem `serviceItems`.
- Filtros por `serviceId` localizam tanto o campo legado quanto itens do agendamento.

## Protecao temporaria do checkout

- `POST /appointments/:id/checkout` recusa agendamento com mais de um item.
- Erro: `MULTI_SERVICE_CHECKOUT_NOT_AVAILABLE`.
- Mensagem: `O checkout de atendimentos com varios servicos ainda nao esta disponivel.`
- Status HTTP: 409.
- A recusa ocorre antes de idempotencia de sucesso e antes de qualquer transacao financeira.
- Status, receita, comissao, estoque e auditoria de checkout concluido permanecem inalterados.
- Checkout composto ainda nao foi implementado.

## Resultados de validacao

- `npx prisma format`: passou; sem diff real em `prisma/schema.prisma`.
- `npx prisma validate`: passou.
- `npx prisma generate`: passou.
- `npx vitest run tests/api.spec.ts -t "multiplos servicos|multi-servico"`: 3 passed, 91 skipped.
- `npx vitest run tests/api.spec.ts`: 94 passed.
- `npm test`: 12 files passed, 2 skipped; 160 passed, 30 skipped.
- `npm run test:db`: banco local `barbearia_test`; 28 passed.
- `npx tsc -p tsconfig.json --noEmit`: passou.
- `npm run build`: passou.
- `git diff --check`: passou com avisos LF/CRLF.
- `git diff --cached --check`: passou.

## Testes PostgreSQL adicionados

- Criacao multi-servico com regra Corte + Barba = 45 minutos.
- Ordem inversa preservada com regra encontrada independentemente da ordem.
- Conjunto sem regra usando soma de duracoes e total.
- Profissional incompativel rejeitado sem persistencia parcial.
- Conflito por duracao efetiva e horario adjacente permitido.
- Edicao atomica de um para varios, de varios para um e falha preservando estado anterior.
- Remarcacao usando snapshot mesmo apos alteracao do catalogo.
- Checkout multi-servico bloqueado sem efeitos financeiros, estoque, auditoria concluida ou idempotencia `SUCCEEDED`.
- Checkout single-service com receita, comissao e replay idempotente preservados.
- Booking publico legado e multi-servico com validacao de profissional, conflito, total e duracao pelo backend.

## Limitacoes

- O checkout composto ainda nao existe.
- Comissao por item nao foi alterada.
- Relatorios por item nao foram alterados.
- Reembolso parcial por item nao foi implementado.

## Adiado para 229.1B

- Multiselect visual na Agenda.
- Ajustes de interface para selecao de varios servicos.
- Comunicacao visual de multiplos servicos para usuarios finais.

## Adiado para 229.2

- Checkout composto.
- Comissao por item.
- Relatorios por item.
- Reembolso parcial.

## Confirmacoes

- Nenhuma migration nova foi criada.
- `prisma db push` nao foi usado.
- Frontend nao foi alterado.
- A interface publica nao foi modificada.
- Sprint 229.1B nao foi iniciada.
