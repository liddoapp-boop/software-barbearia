# Macro 234 - Fechamento do Release Candidate

Data: 2026-07-08
Branch: `main`
HEAD inicial: `7e42c7f7252e90924a20fe4499184445e4836dcf`
Remote: `origin` (`https://github.com/liddoapp-boop/software-barbearia.git`)

## Decisao

RELEASE CANDIDATE DE CODIGO APROVADO

Esta decisao encerra e publica o codigo da Macro 234. Ela nao libera o sistema para piloto real.

## Escopo concluido

- Simplificacao owner-only da navegacao.
- Identidade Liddo Barber com Barbearia Geovane Borges como estabelecimento atual.
- Remocao da aba Hoje.
- Agenda como pagina inicial e fallback para navegacao legada.
- Correcao de scroll global e responsividade.
- Booking publico ajustado, sem CDN de fontes/IMask e com textos publicos corrigidos.
- Navegacao desktop/mobile reduzida.
- Smoke script com idempotency key nas transicoes criticas.
- Testes focados para menu, Agenda, booking, overflow, login, navegacao e linguagem operacional.

## Evidencias consolidadas

- Suite comum da Fase 234.4: `274 passed`, `38 skipped`.
- `test:db` da Fase 234.4: `38 passed` contra `barbearia_test`.
- Smoke readonly em banco de teste: aprovado.
- Smoke mutavel em banco de teste: aprovado.
- Fluxo ponta a ponta: aprovado em ambiente de teste local.
- Responsividade observada em 1366x768, 1024x768, 768x1024, 430x932, 390x844 e 360x800.
- Zero overflow horizontal global nas medicoes registradas.
- Inventario seguro de dados de teste preservado como risco documentado.

As evidencias brutas locais da Fase 234.4 ficam em `.planning/evidence/234_4/`, ignoradas pelo Git quando forem logs, JSONs ou screenshots pesados.

## Correcoes da Fase 234.5

- Corrigidos textos publicos pontuais do booking: horario, horarios, servico, duracao, preco, mensagens de erro e e-mail valido.
- Corrigidos contratos de teste que continham mojibake legado antes desta fase.
- Adicionado teste para impedir reintroducao de caracteres UTF-8 mal interpretados, simbolo de substituicao Unicode e sequencias comuns de mojibake no booking publico.
- Documentada a migration responsavel por `AppointmentBlock`.

## Migration pendente

Migration responsavel por `AppointmentBlock`: `prisma/migrations/20260706_macro_233_owner_operations/migration.sql`.

Estado conhecido:

- Banco principal local `barbearia`: desatualizado para o codigo atual; `AppointmentBlock` ausente.
- Banco local de teste `barbearia_test`: validado com migrations aplicadas pelo fluxo seguro de teste.
- O codigo passou em `barbearia_test` porque o banco de teste recebeu o schema esperado antes da execucao de `test:db` e smokes.

Impacto:

- Codigo publicado nao implica banco preparado.
- O banco principal local continua inadequado para piloto.
- A proxima etapa deve comecar por backup, conferencia de migrations e dry-run antes de qualquer aplicacao.

## Bloqueios do piloto

PILOTO BLOQUEADO:
- schema do banco principal desatualizado;
- dados de teste pendentes de limpeza controlada.

Bloqueios detalhados:

- Migration pendente no banco principal.
- Dados de teste visiveis no ambiente local.
- Necessidade de backup verificado antes de qualquer mudanca de schema.
- Necessidade de dry-run e aprovacao explicita antes de limpeza destrutiva.

## Proxima macro

Macro 235 - Producao, seguranca, banco e recuperacao.

Primeira etapa recomendada: Macro 235.1 - Preparacao segura do banco e dos dados do piloto.
