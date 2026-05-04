# 10 - Clientes

## 1. Visao geral do modulo
Base de CRM operacional com cadastro, segmentacao, historico e sinais preditivos.

## 2. O que ja esta implementado (baseado no codigo)
- Listagem e criacao: `GET /clients`, `POST /clients`.
- Visao analitica: `GET /clients/overview` com status preditivo, segmentos, fila de reativacao e impacto estimado.
- Integra WhatsApp no frontend com normalizacao/validacao de telefone (`public/modules/phone.js`).

## 3. O que esta incompleto
- Sem endpoint de update/archive de cliente.
- Sem contrato dedicado de historico detalhado por cliente (faltas/recorrencia explicita por recurso centralizado).

## 4. Problemas identificados
- Sem CRUD completo, saneamento cadastral vira gargalo.
- Qualidade do telefone ainda depende muito da entrada manual.

## 5. Dependencias com outros modulos
- Agenda, fidelizacao, automacoes, retencao, financeiro e assinaturas.

## 6. Impacto no fluxo principal
Cliente e entidade transversal do funil inteiro. Gap de CRUD reduz qualidade dos dados em todas as etapas.
