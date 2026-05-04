# 17 - Proximas Etapas

## 1. Visao geral do modulo
Roadmap tecnico recomendado para elevar o sistema de funcional para escalavel/auditavel.

## 2. O que ja esta implementado (baseado no codigo)
- Base necessaria para evolucao rapida ja existe: checkout unificado, financeiro operacional, estoque integrado, testes e schema maduro.

## 3. O que esta incompleto
- CRUD profissionais/clientes completo.
- Harden de permissao, auditoria persistente e reconciliacao contabil de comissao.

## 4. Problemas identificados
- Sem modularizacao do frontend, toda evolucao aumenta risco de manutencao.
- Falta de observabilidade orientada a incidente no funil core.

## 5. Dependencias com outros modulos
- Proximas etapas exigem coordenacao de backend, frontend, dados e seguranca.

## 6. Impacto no fluxo principal
Evoluir esses pontos estabiliza o funil para crescimento e prepara terreno para automacoes e IA com menor risco.

## Prioridade recomendada (ordem CTO)
1. Entregar CRUD de profissionais e update/archive de clientes.
2. Implementar auditoria persistente (eventos sensiveis) e trilha por operador.
3. Fechar politica contabil de comissao (provisao -> pagamento -> conciliacao).
4. Expandir testes de autorizacao por perfil para endpoints criticos.
5. Iniciar fatiamento de `public/app.js` por dominio funcional.
6. Implantar observabilidade operacional de funil (erros de checkout, conflitos, falhas de estoque).
