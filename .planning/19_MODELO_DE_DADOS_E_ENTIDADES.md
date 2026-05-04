# 19 - Modelo de Dados e Entidades

## Visao geral
Consolidacao da modelagem Prisma (`prisma/schema.prisma`) orientada a dominio SaaS da barbearia.

## Implementado
- Entidades core: `Appointment`, `Client`, `Service`, `Professional`, `Product`.
- Financeiro/Comissao/Estoque: `FinancialEntry`, `CommissionEntry`, `StockMovement`, `ProductSale`.
- Config/Admin: `BusinessSettings`, `BusinessHour`, `PaymentMethod`, `TeamMember`.
- Avancado: `Loyalty*`, `ServicePackage/ClientPackage`, `Subscription*`, `Retention*`, `Automation*`, `IntegrationWebhookLog`, `BillingSubscriptionEvent`.
- Multiunidade: `Unit` como pivô.

## Incompleto
- Falta governanca documental de evolucao de schema por modulo (ADR de dados).

## Problemas
- Alta abrangencia de schema sem dicionario de dados central pode gerar onboarding lento.

## Dependencias
Quase todas as regras de `PrismaOperationsService` dependem desta modelagem.

## Impacto no funil
Modelagem atual suporta o funil completo; inconsistencias de dados aqui comprometem todos os modulos.
