# Sprint 226.7 - Snapshot de servico para novos agendamentos

## 1. Objetivo

Adicionar snapshot de servico em novos agendamentos para que mudancas futuras em `Service.name`, `Service.price` ou `Service.durationMin` nao alterem a leitura e o fechamento de agendamentos ja criados daqui para frente.

## 2. Contexto vindo da Sprint 226.6

A Sprint 226.6 blindou relatorios historicos para preferirem valores financeiros persistidos, especialmente `FinancialEntry.amount`, quando o atendimento ja gerou financeiro. Restava o risco anterior ao checkout: um agendamento novo ainda dependia do catalogo vivo para nome, preco e duracao do servico.

## 3. Decisao do pre-flight CTO

`LIBERADO COM RESSALVAS`.

Repositorio em `/root/software-barbearia`, branch `main`, estado `main...origin/main` e commits esperados presentes: `a1dadf8` e `9b982c3`. A ressalva foi banco/migration: era permitido criar migration versionada e rodar `npx prisma generate`, mas nao aplicar migration nem executar backfill.

## 4. Decisao de CTO

Executar agora era importante. Nao e burocracia: fecha uma lacuna real entre criacao do agendamento e financeiro persistido. A abordagem escolhida foi conservadora: campos nullable, preenchimento apenas em criacoes novas e fallback legado para registros sem snapshot.

## 5. Campos adicionados

No modelo `Appointment`:

- `serviceNameSnapshot String?`
- `servicePriceSnapshot Decimal? @db.Decimal(10, 2)`
- `serviceDurationMinSnapshot Int?`

No dominio em memoria, os mesmos campos foram adicionados como opcionais em `Appointment`.

## 6. Estrategia sem backfill

Nao houve `UPDATE` retroativo, seed, saneamento ou preenchimento de agendamentos antigos. Campos nullable evitam exigir backfill e preservam compatibilidade com historico existente.

## 7. Pontos de criacao de agendamento atualizados

- Motor de dominio `BarbershopEngine.scheduleAppointment`: grava snapshot a partir do `Service` validado.
- Agenda interna via `OperationsService.schedule` e `PrismaOperationsService.schedule`: persistem o objeto criado com snapshot.
- Booking publico em memoria e Prisma: grava snapshot a partir do servico resolvido pelo backend.
- Atualizacao manual que troca `serviceId`: passa a gravar snapshot do novo servico escolhido.

O frontend nao vira fonte de verdade para preco ou duracao.

## 8. Pontos de leitura atualizados

- Listagem/agenda e detalhe em memoria: `buildAppointmentView` prefere snapshot.
- Listagem/agenda e detalhe Prisma: `buildAppointmentView` prefere snapshot.
- Relatorio gerencial de atendimentos em memoria: receita estimada de agendamento nao concluido prefere `row.servicePrice`, que agora vem do snapshot quando existe.
- Checkout/conclusao em memoria e Prisma: usam um servico efetivo derivado de snapshot quando existir.
- Remarcacao em memoria e Prisma: usa duracao efetiva do agendamento para nao mudar o tamanho do atendimento quando o catalogo for alterado depois.

## 9. Regra de fallback legado

Regra unica:

- se snapshot existe, usar snapshot;
- se snapshot nao existe, usar `Service` atual como fallback legado.

Isso mantem os agendamentos antigos legiveis sem backfill.

## 10. Relacao com relatorios financeiros da Sprint 226.6

A Sprint 226.6 foi preservada. Relatorios financeiros fechados continuam preferindo valores persistidos como `FinancialEntry.amount`, `CommissionEntry.baseAmount` e `CommissionEntry.commissionAmount`. Snapshot de agendamento e fallback operacional, nao substituto de financeiro persistido.

## 11. Testes adicionados/alterados

Em `tests/api.spec.ts`:

- novo teste de snapshot: cria agendamento, altera nome/preco/duracao do servico, valida detalhe, relatorio de atendimentos e checkout usando dados congelados;
- novo teste de legado: simula agendamento antigo sem snapshot e valida fallback para `Service`.

O teste gerencial existente da Sprint 226.6 segue validando que relatorios financeiros usam valor persistido depois de mudanca de preco.

## 12. Migration criada e status de aplicacao

Migration criada:

`prisma/migrations/20260628_service_snapshot_appointments/migration.sql`

Status: versionada, nao aplicada. O SQL apenas adiciona colunas nullable. Nao houve `prisma migrate dev`, `prisma migrate deploy` ou aplicacao contra banco real.

## 13. O que nao foi feito por seguranca

- Nao houve backfill.
- Nao houve alteracao de dados antigos.
- Nao houve alteracao de catalogo real.
- Nao houve criacao de servico canonico.
- Nao houve saneamento.
- Nao houve checkout, venda, pagamento, comissao ou lancamento financeiro real.
- Nao houve deploy, PM2 ou Nginx.
- Nao houve liberacao da Sprint 227.

## 14. Riscos P0/P1/P2/P3

- P0: baixo, porque nao houve aplicacao de migration nem mutacao de dados reais.
- P1: migration pendente precisa ser aplicada com janela controlada antes de usar backend Prisma em ambiente persistente.
- P2: telas ou relatorios fora dos caminhos ajustados ainda podem exibir preco vivo se consultarem `Service` diretamente sem passar por `buildAppointmentView`.
- P3: nomes de campos aumentam superficie de contrato, mas sao opcionais e conservadores.

## 15. Limitacoes restantes

O snapshot nao corrige historico antigo. Para registros sem snapshot, o fallback ainda usa catalogo atual. Isso e intencional para evitar backfill agora.

## 16. Impacto sobre catalogo canonico

Ajuda a preparar catalogo canonico porque reduz o risco de mudar servicos no futuro: agendamentos novos passam a carregar o estado ofertado. Ainda assim, saneamento de catalogo real continua exigindo plano, backup e aprovacao.

## 17. Por que isso ainda nao libera Sprint 227

Nao libera sozinha. A Sprint 227 depende de fluxo atendimento completo, catalogo/saneamento controlado e criterios operacionais pendentes. Esta sprint apenas reduz risco de mutacao historica para novos agendamentos.

## 18. Opiniao tecnica CTO

Foi uma etapa util. Ela fecha a janela entre agendamento criado e financeiro persistido, que era o ponto descoberto apos a Sprint 226.6. O desenho correto e nao fazer backfill agora: campos nullable, snapshot daqui para frente e fallback legado sao suficientes para reduzir risco sem tocar historico.

## 19. Decisao final

Sprint executada com escopo conservador: snapshot para novos agendamentos, fallback legado, sem backfill e sem aplicacao de migration em banco real.

## 20. Proxima sprint recomendada

Manter Sprint 227 bloqueada. Proxima acao tecnica recomendada: validar plano de aplicacao da migration em ambiente controlado e, separadamente, continuar o plano de catalogo canonico/saneamento com backup, data de corte e aprovacao explicita.
