# Sprint 226.4 - Smoke autenticado interno readonly

Data: 2026-06-26

Responsavel tecnico: CTO tecnico do Projeto Software Barbearia

Escopo: validacao tecnica de acesso interno, RBAC e endpoints internos em modo somente leitura. Nenhum banco foi alterado por esta sprint, nenhum usuario foi criado, nenhum agendamento real foi criado/cancelado, nenhum checkout, venda, pagamento, comissao, estorno, ajuste de estoque, deploy, PM2, Nginx, migration ou seed foi executado.

## 1. Objetivo

Validar se o acesso interno owner de smoke funciona e se os principais endpoints internos readonly respondem sem erro 500, enquanto Sprint 227 permanece bloqueada por dados nao saneados e pendencias do Geovane.

Esta sprint nao substitui saneamento, nao valida fluxo real de atendimento e nao autoriza operacao real.

## 2. Contexto vindo das Sprints 226-226.3

A Sprint 226 concluiu que o painel interno esta navegavel para demonstracao guiada/read-only, mas bloqueado para fluxo real por dados demo/teste misturados e acoes transacionais sensiveis.

A Sprint 226.1 documentou matriz de saneamento e roteiro seguro de piloto interno.

A Sprint 226.2 fez dry-run tecnico e mostrou dependencias perigosas: todos os 7 servicos e 9 produtos tem historico, ha 44 profissionais ativos, 101 lancamentos financeiros, 84 comissoes, 43 auditorias e 39 vinculos cross-tenant entre `pro-db-*` e `svc-db-*`.

A Sprint 226.3 criou plano tecnico de saneamento controlado e manteve a Sprint 227 bloqueada ate haver confirmacao do Geovane, backup, data de corte, rollback e aprovacao explicita.

Como Geovane ainda nao respondeu, nao faz sentido executar saneamento real nem criar uma sprint apenas para coletar decisoes inexistentes. Faz sentido validar tecnicamente acesso interno e RBAC em modo readonly para manter o projeto andando sem tocar dados reais.

## 3. Decisao do pre-flight CTO

Decisao: LIBERADO COM RESSALVAS.

| Checagem | Resultado |
| --- | --- |
| Diretorio | `/root/software-barbearia` |
| Branch/status inicial | `## main...origin/main` |
| HEAD esperado | `a0e346e docs: planejar saneamento controlado interno` |
| Worktree inicial | Limpa |
| Ultimo commit esperado presente | Sim |
| `SMOKE_BASE_URL` | Presente em `.env` |
| `SMOKE_OWNER_EMAIL` | Presente em `.env` |
| `SMOKE_OWNER_PASSWORD` | Presente em `.env` |
| Credenciais de recepcao | Ausentes |
| Credenciais de profissional | Ausentes |
| Risco de segredo | Existe; mitigado por nao imprimir valores, senhas ou token |
| Risco de PII | Existe em endpoints de clientes/auditoria; mitigado por registrar somente contagens |
| Risco de mutacao | Controlado: smoke externo chamou somente GET e login |

Ressalvas:

1. Login owner foi validado com credenciais `SMOKE_*`, mas recepcao/profissional nao foram validados em smoke externo por falta de variaveis seguras.
2. Testes automatizados cobrem RBAC de recepcao/profissional em ambiente de teste, mas isso nao equivale a credenciais reais/provisionadas para smoke operacional.
3. Endpoints readonly podem retornar PII no payload; o relatorio registra apenas status e contagens agregadas.
4. `npm test` e filtros de API executam mutacoes apenas no ambiente de teste/in-memory para montar cenarios; isso nao e smoke em banco real.

## 4. Decisao de CTO

Decisao: validar tecnicamente acesso owner e endpoints readonly agora; manter Sprint 227 bloqueada.

Minha opiniao: esta etapa e util, nao burocratica. Ela nao depende do Geovane e reduz risco tecnico antes de qualquer operacao real. O limite e claro: RBAC e disponibilidade readonly podem ser validados, mas catalogo real, estoque, comissoes e financeiro historico continuam sem decisao de negocio.

## 5. Variaveis `SMOKE_*`

Somente presenca foi verificada. Nenhum valor foi exibido.

| Variavel | Status |
| --- | --- |
| `SMOKE_BASE_URL` | Presente |
| `SMOKE_OWNER_EMAIL` | Presente |
| `SMOKE_OWNER_PASSWORD` | Presente |
| `SMOKE_RECEPCAO_EMAIL` | Ausente |
| `SMOKE_RECEPCAO_PASSWORD` | Ausente |
| `SMOKE_RECEPTION_EMAIL` | Ausente |
| `SMOKE_RECEPTION_PASSWORD` | Ausente |
| `SMOKE_PROFISSIONAL_EMAIL` | Ausente |
| `SMOKE_PROFISSIONAL_PASSWORD` | Ausente |
| `SMOKE_PROFESSIONAL_EMAIL` | Ausente |
| `SMOKE_PROFESSIONAL_PASSWORD` | Ausente |

Pendencia: provisionar credenciais seguras de smoke para recepcao e profissional, ou documentar formalmente que esses perfis serao validados apenas por testes automatizados ate a fase de piloto.

## 6. Endpoints readonly avaliados

Smoke owner autenticado:

| Endpoint | Metodo | Status | Observacao |
| --- | --- | ---: | --- |
| `/health` | GET | 200 | `authEnforced=true` |
| `/auth/login` | POST | 200 | Login owner; token nao registrado |
| `/auth/me` | GET | 200 | Role `owner` confirmada |
| `/dashboard` | GET | 200 | Retornou arrays agregados do painel |
| `/agenda/range` | GET | 200 | 44 agendamentos no periodo consultado |
| `/appointments` | GET | 200 | 44 agendamentos no periodo consultado |
| `/clients` | GET | 200 | 10 clientes retornados no limite consultado; PII nao registrada |
| `/clients/overview` | GET | 200 | 28 clientes agregados no resumo |
| `/catalog` | GET | 200 | 7 servicos, 44 profissionais, 28 clientes, 9 produtos |
| `/services/summary` | GET | 200 | Resumo de servicos OK |
| `/services` | GET | 200 | 7 servicos, 6 categorias |
| `/inventory` | GET | 200 | 9 produtos, 9 movimentos, 0 baixo estoque |
| `/sales/products` | GET | 200 | 1 venda no periodo consultado |
| `/financial/summary` | GET | 200 | Resumo financeiro respondeu; valores nao devem ser tratados como reais |
| `/financial/transactions` | GET | 200 | 8 transacoes no periodo consultado |
| `/financial/commissions` | GET | 200 | 4 entradas no periodo consultado |
| `/financial/reports` | GET | 200 | Relatorios financeiros readonly OK |
| `/reports/management/summary` | GET | 200 | 6 relatorios agregados |
| `/reports/management/financial` | GET | 200 | Relatorio gerencial financeiro OK |
| `/reports/management/appointments` | GET | 200 | 44 agendamentos agregados |
| `/reports/management/product-sales` | GET | 200 | 1 venda agregada |
| `/reports/management/stock` | GET | 200 | Estoque gerencial OK |
| `/reports/management/professionals` | GET | 200 | 2 profissionais em resumo gerencial do periodo |
| `/professionals/performance` | GET | 200 | 44 profissionais retornados |
| `/settings` | GET | 200 | Business hours, payment methods, rules e team members retornados |
| `/audit/events` | GET | 200 | 10 eventos no limite consultado; payload nao registrado |

Resumo do smoke owner:

| Metrica | Resultado |
| --- | ---: |
| Endpoints internos readonly autenticados | 24 |
| HTTP 2xx | 24 |
| HTTP 4xx | 0 |
| HTTP 5xx | 0 |
| Mutacoes executadas pelo smoke externo | 0 |

Observacao: houve uma tentativa inicial do script inline que falhou antes de autenticar por formato Node (`require` com top-level `await`). Ela nao fez chamada externa, nao emitiu token e nao alterou dados. A execucao corrigida passou.

## 7. Resultado do smoke owner

Resultado: APROVADO COM RESSALVAS.

O login owner de smoke esta funcionando. O health respondeu `200` com autenticacao habilitada. O token foi usado apenas em memoria e nao foi impresso. Os endpoints readonly principais responderam sem 500.

Ressalva CTO: endpoint responder 200 nao significa dado confiavel para operacao. O painel ainda retorna dados contaminados por demo/teste, especialmente profissionais, catalogo, financeiro e comissoes.

## 8. Resultado recepcao/profissional

Resultado: PARCIAL.

Nao existem variaveis `SMOKE_*` de recepcao/profissional configuradas, entao nao foi possivel executar smoke autenticado externo desses perfis.

O que foi validado:

- leitura de politicas de rota em `src/http/app.ts`;
- testes automatizados de auth/RBAC em `tests/api.spec.ts`;
- testes de menu por perfil em `tests/frontend-menu-config.spec.ts`.

Achados:

| Perfil | Estado |
| --- | --- |
| `owner` | Smoke externo validado |
| `recepcao` | Validado por testes automatizados; sem credencial `SMOKE_*` externa |
| `profissional` | Validado por testes automatizados; sem credencial `SMOKE_*` externa |

RBAC observado nos testes:

- `/auth/me` preserva perfis `owner`, `recepcao` e `profissional`;
- recepcao/profissional nao acessam relatorios gerenciais sensiveis;
- profissional nao acessa usuarios, auditoria e settings;
- recepcao/profissional nao pagam comissao;
- tenant guard bloqueia acesso a unidade divergente.

Frontend/menu:

- owner mantem modulos administrativos;
- recepcao fica limitada a operacao sem modulos sensiveis;
- profissional fica limitado a agenda e clientes.

## 9. Pendencias de credenciais

Pendencias:

1. Criar/provisionar credenciais seguras de smoke para recepcao.
2. Criar/provisionar credenciais seguras de smoke para profissional.
3. Registrar apenas nomes de variaveis e presenca, nunca valores.
4. Reexecutar smoke externo de RBAC com esses perfis depois do provisionamento.

Nao foi criado usuario nesta sprint porque isso seria mutacao e exigiria autorizacao explicita.

## 10. Testes executados

| Comando | Resultado |
| --- | --- |
| `npx vitest run tests/api.spec.ts -t "auth"` | Passou; 1 arquivo, 2 testes executados, 81 skipped |
| `npx vitest run tests/api.spec.ts -t "reports"` | Filtro nao encontrou teste executavel; 1 arquivo skipped, 83 skipped |
| `npx vitest run tests/api.spec.ts -t "financial"` | Passou; 1 arquivo, 1 teste executado, 82 skipped |
| `npx vitest run tests/api.spec.ts -t "relatorios"` | Alternativa coerente; passou, 1 arquivo, 2 testes executados, 81 skipped |
| `npx vitest run tests/frontend-menu-config.spec.ts` | Passou; 3 testes |
| `npm test` | Passou; 8 arquivos passed, 1 skipped; 127 passed, 19 skipped |
| `npx tsc --noEmit` | Passou |
| `npm run build` | Passou |
| `git diff --check` | Passou |

`npm run test:db` nao foi executado.

## 11. O que nao foi feito por seguranca

Nao foi feito:

| Item | Status |
| --- | --- |
| Exposicao de senha/token/segredo | Nao executada |
| Impressao de valores `SMOKE_*` | Nao executada |
| Criacao ou alteracao de usuario | Nao executada |
| Alteracao de `.env` | Nao executada |
| Migration ou seed | Nao executada |
| Alteracao manual no banco | Nao executada |
| Apagar ou inativar dados | Nao executado |
| Criar cliente real | Nao executado |
| Criar/cancelar agendamento real | Nao executado |
| Checkout, pagamento ou venda real | Nao executado |
| Comissao, refund ou estorno real | Nao executado |
| Lancamento financeiro real | Nao executado |
| Alteracao de estoque | Nao executada |
| Deploy ou restart/reload PM2 | Nao executado |
| Nginx, firewall ou certificado | Nao executado |
| `git clean`, `git restore`, `git stash`, reset, rebase ou force-push | Nao executado |
| IA WhatsApp | Nao executada |
| Avanco para Sprint 227 | Nao executado |

## 12. Riscos restantes

| Risco | Impacto | Status |
| --- | --- | --- |
| Recepcao/profissional sem smoke externo | RBAC real de credenciais operacionais nao comprovado | Pendente |
| Endpoints readonly retornam PII no payload | Relatorio ou log descuidado poderia expor dados | Mitigado nesta sprint por contagens |
| Owner tem acesso amplo | Qualquer clique real pode acionar fluxo sensivel | Exige roteiro e treinamento |
| Dados internos contaminados | Dashboard, financeiro, estoque e comissoes podem parecer reais | Sprint 227 bloqueada |
| Financeiro/comissoes historicos | Risco de pagamento/baixa indevida | Bloqueado para mutacao |
| Recepcao com PDV no menu | Pode ser correto, mas precisa decisao operacional | Depende do Geovane |
| Smoke 200 nao valida negocio | Disponibilidade tecnica nao saneia dados | Ressalva explicita |

## 13. Opiniao tecnica CTO

| Pergunta | Opiniao CTO |
| --- | --- |
| Esta etapa foi util ou burocratica? | Util. Ela valida acesso, RBAC automatizado e saude readonly sem depender da resposta do Geovane. |
| O que ela destrava? | Destrava confianca tecnica para continuar trabalhando em validacoes internas e preparar smoke por perfil, sem tocar dados reais. |
| E seguro continuar trabalhando enquanto Geovane nao responde? | Sim, desde que o trabalho seja readonly, documentacao, testes, automacao de smoke ou preparacao sem mutacao. |
| O acesso interno owner esta confiavel? | Tecnicamente sim: login owner e 24 endpoints readonly responderam sem 500. Operacionalmente ainda exige cuidado por causa dos dados contaminados. |
| Recepcao/profissional estao validados? | Parcialmente. Testes automatizados validam RBAC e menu, mas faltam credenciais `SMOKE_*` externas para smoke real desses perfis. |
| O que ainda impede fluxo real? | Falta resposta do Geovane, saneamento controlado, data de corte, politica financeira/comissoes, estoque fisico confirmado e credenciais por perfil. |
| Da para avancar para Sprint 227? | Nao. Acesso readonly funcionando nao libera checkout, agenda real, financeiro ou comissao. |
| O que nao devemos fazer agora? | Nao criar usuarios reais, nao pagar comissao, nao vender, nao fazer checkout, nao alterar estoque, nao sanear sem Geovane e nao expor PII. |
| Qual proxima acao realmente importante? | Provisionar credenciais seguras de smoke para recepcao/profissional ou criar um smoke automatizado readonly por perfil com usuarios aprovados. |

## 14. Decisao final

Decisao final: Sprint 226.4 APROVADA COM RESSALVAS.

O smoke owner readonly passou e o backend/menu seguem cobertos por testes de RBAC. A validacao externa de recepcao/profissional fica pendente por falta de credenciais seguras. Sprint 227 permanece BLOQUEADA.

## 15. Proxima sprint recomendada

Recomendacao: Sprint 226.5 - Provisionamento seguro e smoke readonly por perfil.

Escopo recomendado:

1. Definir se recepcao/profissional terao usuarios de smoke reais ou apenas usuarios de teste automatizado.
2. Provisionar credenciais de smoke com autorizacao explicita, sem expor valores.
3. Criar ou documentar smoke readonly por perfil.
4. Validar owner, recepcao e profissional contra endpoints permitidos e proibidos.
5. Registrar somente status HTTP e contagens agregadas.

Essa proxima sprint ainda nao deve executar saneamento, checkout, venda, pagamento, comissao, estoque ou Sprint 227.
