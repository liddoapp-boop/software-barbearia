# 12 - Profissionais

## 1. Visao geral do modulo
Gestao de equipe operacional e performance individual.

## 2. O que ja esta implementado (baseado no codigo)
- Leitura de performance: `GET /professionals/performance`.
- Relacao com agenda, comissoes, vendas e regras de comissao.
- Gestão de membros de equipe via `settings/team-members` (visao administrativa).

## 3. O que esta incompleto
- Falta CRUD principal de profissionais (create/update/deactivate dedicado) como modulo de operacao.
- Dependencia indireta de `settings` para partes de manutencao de equipe.

## 4. Problemas identificados
- Boundary entre `Professional` e `TeamMember` pode gerar confusao de responsabilidade.
- Onboarding/offboarding tecnico de profissional nao esta consolidado em fluxo unico.

## 5. Dependencias com outros modulos
- Agenda, servicos, comissoes, financeiro e permissoes.

## 6. Impacto no fluxo principal
Sem gestao madura de profissionais, escala operacional e controle de acesso ficam comprometidos.
