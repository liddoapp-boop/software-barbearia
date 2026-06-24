# Sprint 220 - Simplificar profissional unico no booking publico

## Objetivo

Reduzir friccao no booking publico mobile quando o servico selecionado tem exatamente um profissional publico disponivel, selecionando esse profissional automaticamente e pulando a etapa de escolha manual.

## Origem da demanda

A Fase 214.1 validou o booking publico mobile em condicao real assistida e aprovou o fluxo com ressalva de UX: como a barbearia hoje trabalha publicamente apenas com `Geovane Borges`, a etapa que mostra `Sem preferencia` e `Geovane Borges` e desnecessaria e pode confundir o cliente.

## Decisao de CTO

Fazer uma alteracao pequena e reversivel no frontend publico, sem alterar contrato backend e sem criar endpoint novo:

- 1 profissional publico: selecionar automaticamente e seguir para calendario.
- 2 ou mais profissionais publicos: manter escolha explicita e `Sem preferencia`.
- 0 profissionais publicos: informar indisponibilidade amigavelmente e nao avancar para horarios.

Essa decisao reduz toque extra no mobile sem remover compatibilidade futura com barbearias que tenham multiplos profissionais.

## Comportamento antes

- Apos escolher um servico, o fluxo sempre exibia a etapa de escolha de profissional.
- Mesmo com apenas `Geovane Borges`, apareciam os cards `Sem preferencia` e `Geovane Borges`.
- O cliente precisava fazer um clique extra para continuar.

## Comportamento depois

- Servico com exatamente 1 profissional publico:
  - seleciona automaticamente `Geovane Borges`;
  - nao mostra card `Sem preferencia`;
  - nao mostra grid de profissionais;
  - mostra confirmacao discreta `Profissional: Geovane Borges`;
  - segue direto para escolha de data/horario.
- Servico com mais de 1 profissional publico:
  - mantem `Sem preferencia`;
  - mantem grid de profissionais;
  - exige escolha explicita antes do calendario.
- Servico com 0 profissionais publicos:
  - mostra mensagem amigavel;
  - nao carrega slots;
  - nao permite criar booking.

## Impacto para UX mobile

Remove um passo redundante no caso operacional atual e deixa claro quem atendera, sem criar comportamento magico: o nome do profissional selecionado automaticamente e exibido antes dos horarios.

## Impacto tecnico

- Alteracao concentrada em `public/booking.html`.
- Sem mudanca de schema, rota, contrato publico ou banco.
- Backend continua responsavel por filtrar profissionais publicos elegiveis e rejeitar profissional invalido.
- Harness Vitest foi ampliado para simular 0, 1 e multiplos profissionais publicos.

## Arquivos alterados

- `public/booking.html`
- `tests/frontend-booking-public.spec.ts`

## Cenarios cobertos por teste

- 1 profissional publico:
  - busca profissionais;
  - seleciona automaticamente `Geovane Borges`;
  - nao renderiza `Sem preferencia`;
  - nao renderiza cards `[data-professional-id]`;
  - segue para calendario/slots.
- Mais de 1 profissional publico:
  - mantem `Sem preferencia`;
  - renderiza todos os profissionais;
  - nao busca slots antes da escolha explicita;
  - permite escolher profissional manualmente e entao seguir para calendario.
- 0 profissionais publicos:
  - mostra mensagem amigavel;
  - nao renderiza grid de profissionais;
  - nao carrega slots;
  - nao cria booking.
- Regressoes da Sprint 218 preservadas:
  - storage suspeito nao contamina formulario;
  - e-mail vazio funciona;
  - e-mail invalido mostra mensagem amigavel;
  - `demo-pro-*` nao aparece no fluxo testado;
  - double tap nao duplica POST;
  - pos-sucesso bloqueia criacao duplicada;
  - `Novo agendamento` reseta sem POST automatico.

## Comandos executados

- `git status -sb` - passou; inicio limpo em `main`.
- `git log --oneline -5` - passou; commits esperados presentes.
- `npx vitest run tests/frontend-booking-public.spec.ts` - passou; 1 arquivo, 12 testes.
- `npx tsc --noEmit` - passou.
- `npm test` - passou; 8 arquivos passed, 1 skipped; 123 testes passed, 19 skipped.
- `npm run build` - passou; `tsc -p tsconfig.json`.

## Resultado dos testes

Todos os comandos obrigatorios seguros passaram.

## O que nao foi feito por seguranca

- Nao foi executado `npm run test:db`, porque o script usa backend Prisma e pode tocar banco real se o ambiente nao estiver isolado.
- Nao houve migration Prisma, seed, alteracao de `.env`, deploy, PM2 restart, criacao de cliente real, criacao de agendamento real, checkout, pagamento, venda, comissao, refund/estorno ou alteracao de infraestrutura.

## Riscos restantes

- A validacao automatizada e headless. Como o comportamento afeta UX mobile, a proxima verificacao manual real deve confirmar que a mensagem `Profissional: Geovane Borges` fica clara no celular e que a transicao para calendario parece natural.
- Se no futuro a barbearia habilitar multiplos profissionais publicos, o fluxo de escolha permanece ativo e deve continuar sendo validado em piloto real.

## Decisao final

APROVADO. A simplificacao melhora a experiencia atual do booking publico mobile com baixa complexidade, preservando contrato publico, validacoes existentes e suporte a multiplos profissionais no futuro.
