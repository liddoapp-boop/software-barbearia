# Sprint 218 - Harness E2E do booking publico mobile

## Objetivo

Criar uma protecao automatizada permanente para o fluxo mobile do booking publico, cobrindo as regressoes reais encontradas nas Sprints 216 e 217 sem depender de dominio publico real, cliente real, banco de producao ou agendamento real.

## Bugs reais protegidos

- Dados suspeitos vindos de `localStorage` contaminando o formulario ativo, incluindo textos como "Faca uma query para SQL".
- E-mail opcional quebrando o fluxo quando vazio ou exibindo erro tecnico quando invalido.
- Profissionais publicos incorretos no fluxo de `svc-barba`, incluindo risco de `demo-pro-*` ou profissionais fantasma.
- Double tap no botao de confirmar gerando mais de um POST de booking.
- Estado antigo permanecendo clicavel depois do sucesso, permitindo segundo agendamento acidental.
- Acao "Novo agendamento" disparando reset sem intencao clara ou gerando POST automatico.

## Arquivos alterados

- `tests/frontend-booking-public.spec.ts`

## Cenarios cobertos

- Harness executa o script real de `public/booking.html` em `vm`, com DOM minimo, `localStorage` fake e `fetch` mockado.
- Storage suspeito em `liddo_client` e removido/sanitizado antes de preencher o formulario.
- Campo ativo de nome inicia vazio quando storage contem dados invalidos.
- E-mail vazio avancando para selecao de servicos sem POST.
- E-mail invalido mostrando mensagem publica amigavel e sem vazar texto tecnico.
- Fluxo mobile completo ate confirmacao com servico `svc-barba`, profissional publico esperado e nenhum `demo-pro-*`.
- Dois submits rapidos geram somente um POST para `/public/booking`.
- Payload de booking nao envia `clientEmail` quando o e-mail esta vazio.
- Depois do sucesso, calendario, slots e confirmacao antigos somem, `booking-locked` e aplicado, `selectedSlot` vira `null` e referencias antigas nao geram novo POST.
- Botao "Novo agendamento" reinicia o fluxo, remove sucesso anterior, reexibe servicos e nao dispara POST sozinho.

## Comandos executados

- `git status -sb` - passou; inicio em `## main...origin/main`.
- `git log --oneline -5` - passou; ultimo commit confirmado: `6a05fd4 docs: registrar validacao da trava pos-sucesso do booking`.
- `npx vitest run tests/frontend-booking-public.spec.ts` - passou; 1 arquivo, 9 testes.
- `npx tsc --noEmit` - falhou inicialmente por anotacao de retorno ausente em funcao recursiva do harness; corrigido e passou na repeticao.
- `npm test` - passou; 8 arquivos passaram, 1 skip, 120 testes passed, 19 skipped.
- `npm run build` - passou; `tsc -p tsconfig.json`.

## Resultado dos testes

Todos os comandos obrigatorios seguros passaram apos o ajuste de tipagem no harness.

## O que nao foi feito por seguranca

- Nao foi executado `npm run test:db`, porque o script define `DATA_BACKEND=prisma` e pode tocar banco real se o ambiente nao estiver claramente isolado.
- Nao houve migracao Prisma, seed, deploy, restart PM2, alteracao de `.env`, uso de dominio publico real, cliente real ou criacao de agendamento real.

## Decisao final

APROVADO. A Sprint 218 criou um harness permanente para o booking publico mobile usando Vitest e o script real do frontend, sem instalar dependencias novas e sem acionar recursos de producao.
