# 14 - Permissoes

## 1. Visao geral do modulo
Controle de autenticacao e autorizacao por papel e unidade (tenant).

## 2. O que ja esta implementado (baseado no codigo)
- JWT HMAC interno com exp, role, `unitIds`, `activeUnitId`.
- Rotas publicas/protegidas e matriz de acesso por padrao de rota (`getPolicyForRoute`).
- Validacao de tenant por `unitId` query/body e bloqueio de mismatch.
- Assinatura de webhook de billing com HMAC SHA-256.

## 3. O que esta incompleto
- Senhas/usuarios ainda em modelo simples de bootstrap (`DEFAULT_USERS` ou env JSON).
- Nao existe IAM externo nem rotacao de credencial automatizada.

## 4. Problemas identificados
- Segredo default de dev em fallback e risco se usado fora de ambiente controlado.
- Cobertura de testes de autorizacao ainda parcial frente ao numero de endpoints.

## 5. Dependencias com outros modulos
- Todos os modulos de negocio dependem de controle de acesso correto.

## 6. Impacto no fluxo principal
Permissoes mal calibradas comprometem seguranca do funil inteiro e podem gerar acesso indevido a dados financeiros/comerciais.
