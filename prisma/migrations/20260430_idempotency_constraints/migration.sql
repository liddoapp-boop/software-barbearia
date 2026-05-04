-- Fase 0.1: idempotencia e constraints para operacoes financeiras criticas.

ALTER TABLE "public"."FinancialEntry"
ADD COLUMN "idempotencyKey" TEXT;

ALTER TABLE "public"."CommissionEntry"
ADD COLUMN "idempotencyKey" TEXT;

ALTER TABLE "public"."ProductSale"
ADD COLUMN "idempotencyKey" TEXT;

CREATE TABLE "public"."IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "responseJson" JSONB,
    "resolution" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdempotencyRecord_unitId_action_idempotencyKey_key"
ON "public"."IdempotencyRecord"("unitId", "action", "idempotencyKey");

CREATE INDEX "IdempotencyRecord_unitId_action_status_createdAt_idx"
ON "public"."IdempotencyRecord"("unitId", "action", "status", "createdAt");

CREATE INDEX "IdempotencyRecord_expiresAt_idx"
ON "public"."IdempotencyRecord"("expiresAt");

CREATE UNIQUE INDEX "FinancialEntry_unitId_idempotencyKey_key"
ON "public"."FinancialEntry"("unitId", "idempotencyKey");

CREATE UNIQUE INDEX "FinancialEntry_unitId_referenceType_referenceId_source_key"
ON "public"."FinancialEntry"("unitId", "referenceType", "referenceId", "source");

CREATE UNIQUE INDEX "CommissionEntry_unitId_idempotencyKey_key"
ON "public"."CommissionEntry"("unitId", "idempotencyKey");

CREATE UNIQUE INDEX "CommissionEntry_unitId_source_appointmentId_key"
ON "public"."CommissionEntry"("unitId", "source", "appointmentId");

CREATE UNIQUE INDEX "CommissionEntry_unitId_source_productSaleId_key"
ON "public"."CommissionEntry"("unitId", "source", "productSaleId");

CREATE UNIQUE INDEX "ProductSale_unitId_idempotencyKey_key"
ON "public"."ProductSale"("unitId", "idempotencyKey");

CREATE INDEX "ProductSale_unitId_soldAt_idx"
ON "public"."ProductSale"("unitId", "soldAt");

CREATE UNIQUE INDEX "StockMovement_unitId_productId_referenceType_referenceId_movementType_key"
ON "public"."StockMovement"("unitId", "productId", "referenceType", "referenceId", "movementType");

ALTER TABLE "public"."IdempotencyRecord"
ADD CONSTRAINT "IdempotencyRecord_unitId_fkey"
FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
