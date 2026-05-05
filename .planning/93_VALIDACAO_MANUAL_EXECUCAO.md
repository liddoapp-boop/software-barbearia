# 93 - Execucao da validacao manual no navegador

Data da execucao: 2026-05-04 23:08 -03:00
Fase: 0.8
Status: EXECUCAO PARCIAL COM CORRECAO LOCALIZADA

## Objetivo
Executar a validacao real dos fluxos criticos antes da producao controlada, registrar evidencias, classificar bugs e decidir a proxima etapa.

## Ambiente usado
- Maquina local Windows em `C:\Users\joaov\OneDrive\Desktop\Projetos\Software Barbearia`.
- Node conforme projeto, requisito `>=22`.
- URL local prevista: `http://localhost:3333/index.html`.
- API Fastify servindo `public/` com `fastifyStatic` em `/`.
- Smoke API usando `http://127.0.0.1:3333`.

## Backend usado
- Validacao automatizada/smoke: `DATA_BACKEND=prisma` via `npm.cmd run dev:api`, iniciado pelo `scripts/smoke-api-flow.ps1`.
- Build/sintaxe: codigo local atual.
- Browser visual real: nao executado nesta sessao por indisponibilidade de automacao de navegador in-app/Node REPL no ambiente da ferramenta.

## Como rodar localmente

### Com backend Prisma
```powershell
npm.cmd run db:up
npm.cmd run db:push
npm.cmd run dev:api
```

Abrir:
```text
http://localhost:3333/index.html
```

### Com backend memory/dev
```powershell
npm.cmd run dev
```

Abrir:
```text
http://localhost:3333/index.html
```

## Usuarios esperados
- `owner@barbearia.local` / `owner123`
- `recepcao@barbearia.local` / `recepcao123`
- `profissional@barbearia.local` / `profissional123`

## Observacao sobre perfis no frontend
Antes desta fase, o seletor visual de perfil alterava apenas menus/UX e mantinha a sessao HTTP autenticada como owner. Isso impedia validar recepcao/profissional com token real no navegador.

Correcao aplicada nesta fase:
- o frontend agora mapeia credenciais dev por perfil;
- a sessao em `localStorage` e invalidada ao trocar o seletor;
- `ensureAuthSession()` renova o login quando a role da sessao nao corresponde a role visual.

Limitacao restante:
- ainda nao existe tela de login manual completa;
- os usuarios dev continuam hardcoded para validacao local controlada;
- para validar permissao real, trocar o seletor `Perfil` para Dono/Recepcao/Profissional e aguardar recarregamento dos dados.

## Checklist executado

Legenda:
- PASSOU: validado nesta rodada por teste automatizado, smoke operacional ou inspecao objetiva do codigo.
- FALHOU: bug confirmado e ainda aberto.
- PARCIAL: fluxo coberto parcialmente ou corrigido, mas sem evidencia visual completa no navegador.
- NAO TESTADO: depende de interacao visual/browser real nao disponivel nesta sessao.

### A) Autenticacao
| Item | Status | Evidencia/resultado |
| --- | --- | --- |
| Login owner | PASSOU | `smoke:api`, `test` e `test:db` autenticaram owner. |
| Login recepcao | PASSOU | Testes de permissao cobrem token recepcao; frontend agora renova sessao por perfil. |
| Login profissional | PASSOU | Testes de permissao cobrem token profissional; frontend agora renova sessao por perfil. |
| Usuario inativo | PASSOU | `test:db` valida usuario inativo com bloqueio de login. |
| `activeUnitId` autorizado | PASSOU | Smoke usa `unit-01`; testes validam unidade autorizada. |
| `activeUnitId` nao autorizado | PASSOU | Testes retornam `403` para unidade fora do token. |
| Troca visual de perfil com token real | PARCIAL | Bug P1 encontrado e corrigido; falta evidencia visual em navegador real. |

### B) Permissoes
| Item | Status | Evidencia/resultado |
| --- | --- | --- |
| Owner ve Auditoria, Financeiro, Comissoes e Configuracoes | PASSOU | `menu-config.js` permite todos os modulos para owner. |
| Recepcao nao ve modulos bloqueados | PASSOU | `ROLE_ACCESS.recepcao` remove Auditoria, Financeiro, Comissoes e Configuracoes. |
| Profissional ve apenas Agenda/Dashboard | PASSOU | `ROLE_ACCESS.profissional` contem somente `agenda` e `dashboard`. |
| Acesso direto a Auditoria como recepcao | PASSOU | Testes/API retornam `403` para rotas bloqueadas. |
| Acesso direto a Financeiro como profissional | PASSOU | Testes/API retornam `403`. |
| Pagar comissao como recepcao/profissional | PASSOU | Testes validam bloqueio; smoke valida consulta e pagamento owner. |
| Mensagem amigavel na UI | PARCIAL | Normalizacao de 403 existe; falta evidencia visual em browser real. |

### C) Agenda
| Item | Status | Evidencia/resultado |
| --- | --- | --- |
| Criar agendamento | PASSOU | `smoke:api` criou `3edbed61-a931-4b95-9528-22672491a18b`. |
| Validar conflito de horario | PASSOU | Suite automatizada cobre conflito e bordas. |
| Confirmar agendamento | PASSOU | `smoke:api` confirmou atendimento. |
| Iniciar atendimento | PASSOU | `smoke:api` iniciou atendimento. |
| Finalizar/checkout | PASSOU | `smoke:api` executou checkout com receita `75`. |
| Validar receita no financeiro | PASSOU | `smoke:api` consultou financeiro com movimentacoes. |
| Validar auditoria | PASSOU | `smoke:api` consultou auditoria com eventos. |
| Executar fluxo clicando no navegador | NAO TESTADO | Automacao visual nao disponivel nesta sessao. |

### D) PDV
| Item | Status | Evidencia/resultado |
| --- | --- | --- |
| Vender produto | PASSOU | `smoke:api` criou venda `746a3c9d-6f41-447b-8f6a-b4211d119d03`. |
| Baixa de estoque | PASSOU | Coberta pelo smoke e testes de estoque/movimento. |
| Consultar historico de vendas | PASSOU | `smoke:api` consultou historico e encontrou a venda. |
| Devolver produto antigo | PASSOU | `smoke:api` devolveu a venda pelo historico. |
| Validar estoque IN | PASSOU | Coberto por smoke/testes de devolucao. |
| Validar financeiro reverso | PASSOU | Refund gerou `financialEntry`; smoke validou valor positivo. |
| Validar auditoria | PASSOU | Smoke e testes DB consultaram auditoria de refund. |
| Executar fluxo clicando no navegador | NAO TESTADO | Automacao visual nao disponivel nesta sessao. |

### E) Financeiro
| Item | Status | Evidencia/resultado |
| --- | --- | --- |
| Consultar transacoes | PASSOU | `smoke:api` consultou `/financial/transactions`. |
| Receita de servico | PASSOU | Checkout gerou receita de servico. |
| Receita de produto | PASSOU | Venda de produto gerou receita. |
| Despesa de comissao | PASSOU | Testes validam pagamento de comissao como despesa reconciliavel. |
| Estorno/devolucao | PASSOU | Refund de produto gerou financeiro reverso. |
| Criar lancamento manual | PASSOU | Suite automatizada cobre lancamento manual idempotente. |
| Filtros/periodo | PARCIAL | API e UI possuem filtros; falta evidencia visual completa. |

### F) Comissoes
| Item | Status | Evidencia/resultado |
| --- | --- | --- |
| Visualizar comissao pendente | PASSOU | `smoke:api` consultou 2 comissoes. |
| Pagar comissao como owner | PASSOU | Testes automatizados cobrem pagamento owner e despesa. |
| Validar despesa financeira | PASSOU | Testes DB validam despesa e auditoria do pagamento. |
| Bloqueio recepcao/profissional | PASSOU | Testes retornam `403`. |
| Validar auditoria | PASSOU | Testes DB validam `FINANCIAL_COMMISSION_MARKED_PAID`. |
| Executar clique no navegador | NAO TESTADO | Automacao visual nao disponivel nesta sessao. |

### G) Estoque
| Item | Status | Evidencia/resultado |
| --- | --- | --- |
| Listar produtos | PASSOU | Catalogo/smoke carregou produto com estoque. |
| Ajustar estoque manual | PASSOU | Suite automatizada cobre endpoint de movimentacao manual. |
| Validar baixo estoque | PARCIAL | API/UI possuem overview; falta evidencia visual. |
| Movimento de venda OUT | PASSOU | Smoke/testes validam baixa em venda. |
| Movimento de devolucao IN | PASSOU | Smoke/testes validam entrada em refund. |

### H) Auditoria
| Item | Status | Evidencia/resultado |
| --- | --- | --- |
| Abrir tela como owner | NAO TESTADO | Browser visual nao executado. |
| Filtrar por entidade/acao | PARCIAL | Endpoint e UI possuem filtros; falta evidencia visual. |
| Validar actor | PASSOU | Testes/smoke registram actor em fluxos autenticados. |
| Validar requestId/correlation-id | PASSOU | Smoke envia `x-correlation-id`; auditoria consultada. |
| Validar idempotencyKey | PASSOU | Checkout/venda/refund usam idempotencyKey; testes DB cobrem. |
| Bloqueio recepcao/profissional | PASSOU | Policy owner-only e testes/API validam `403`. |

### I) Mobile/responsivo
| Item | Status | Evidencia/resultado |
| --- | --- | --- |
| Abrir em largura mobile | NAO TESTADO | Browser visual nao executado. |
| Testar menu mobile | NAO TESTADO | Browser visual nao executado. |
| Testar Agenda | NAO TESTADO | Browser visual nao executado. |
| Testar PDV | NAO TESTADO | Browser visual nao executado. |
| Testar modais | NAO TESTADO | Browser visual nao executado. |
| Testar Financeiro | NAO TESTADO | Browser visual nao executado. |
| Testar Auditoria | NAO TESTADO | Browser visual nao executado. |

## Bugs encontrados

### P1 - Seletor visual de perfil nao trocava a sessao real
- Severidade: P1, porque quebrava a validacao critica de permissoes reais no navegador.
- Sintoma: mudar o seletor para recepcao/profissional escondia menus, mas as chamadas HTTP continuavam com token owner salvo em `localStorage`.
- Impacto: permissao visual podia parecer correta enquanto backend recebia owner.
- Correcao: `public/app.js` agora usa credenciais por role, invalida sessao ao trocar perfil e rejeita cache de auth quando `session.user.role !== state.role`.
- Status: CORRIGIDO.

## Correcoes feitas
- `public/app.js`: adicionada matriz de credenciais dev por perfil.
- `public/app.js`: `isAuthSessionValid()` agora valida role da sessao contra `state.role`.
- `public/app.js`: troca do seletor `Perfil` limpa `sb.authSession` antes de recarregar dados.

## Comandos executados
| Comando | Resultado |
| --- | --- |
| `Get-Content -Raw public/app.js \| node --input-type=module --check` | PASSOU |
| `npm.cmd run build` | PASSOU |
| `npm.cmd run smoke:api` | FALHOU no sandbox por verificacao/download da engine Prisma |
| `npm.cmd run smoke:api` fora do sandbox | PASSOU |
| `npm.cmd run test` | FALHOU no sandbox por `spawn EPERM` do Vite/Rolldown |
| `npm.cmd run test` fora do sandbox | PASSOU: 63 passed, 10 skipped |
| `npm.cmd run test:db` | FALHOU no sandbox por `spawn EPERM` do Vite/Rolldown |
| `npm.cmd run test:db` fora do sandbox | PASSOU: 10 passed |

## Evidencias do smoke
- Agendamento testado: `3edbed61-a931-4b95-9528-22672491a18b`.
- Checkout gerado: `75`.
- Venda testada: `746a3c9d-6f41-447b-8f6a-b4211d119d03`.
- Refund testado: `55f6e3ca-bab0-4d72-8d6f-4614f937b3cb`.
- Comissoes consultadas: `2`.

## Decisao final
Decisao: APROVADO COM RESSALVAS.

Justificativa:
- Nao ha bug P0/P1 aberto apos a correcao localizada.
- Build, smoke API, testes unitarios e testes DB passaram fora do sandbox.
- Fluxos financeiros criticos seguem preservados e nao tiveram regra alterada.
- A evidencia visual real em navegador, especialmente mobile/responsivo e clique em modais, ainda precisa ser concluida manualmente em ambiente local, porque nao foi possivel operar o navegador nesta sessao.

## Proxima etapa recomendada
Proxima prioridade: Fase 0.9 - Deploy/producao controlada, condicionada a uma ultima passada visual humana no navegador usando este arquivo como roteiro de evidencia.

Se a passada visual encontrar bug P0/P1, abrir Fase 0.8.1 - Correcoes pos-validacao manual antes de deploy.
