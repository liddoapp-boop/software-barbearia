ALTER TYPE "public"."RevenueSource" ADD VALUE IF NOT EXISTS 'REFUND';

CREATE TABLE "public"."Refund" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "productSaleId" TEXT,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "refundedAt" TIMESTAMP(3) NOT NULL,
    "changedBy" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."RefundItem" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "RefundItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Refund_unitId_idempotencyKey_key"
ON "public"."Refund"("unitId", "idempotencyKey");

CREATE UNIQUE INDEX "Refund_unitId_appointmentId_key"
ON "public"."Refund"("unitId", "appointmentId");

CREATE INDEX "Refund_unitId_refundedAt_idx"
ON "public"."Refund"("unitId", "refundedAt");

CREATE INDEX "Refund_appointmentId_idx"
ON "public"."Refund"("appointmentId");

CREATE INDEX "Refund_productSaleId_idx"
ON "public"."Refund"("productSaleId");

CREATE INDEX "RefundItem_refundId_idx"
ON "public"."RefundItem"("refundId");

CREATE INDEX "RefundItem_productId_idx"
ON "public"."RefundItem"("productId");

ALTER TABLE "public"."Refund"
ADD CONSTRAINT "Refund_unitId_fkey"
FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."Refund"
ADD CONSTRAINT "Refund_appointmentId_fkey"
FOREIGN KEY ("appointmentId") REFERENCES "public"."Appointment"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."Refund"
ADD CONSTRAINT "Refund_productSaleId_fkey"
FOREIGN KEY ("productSaleId") REFERENCES "public"."ProductSale"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."RefundItem"
ADD CONSTRAINT "RefundItem_refundId_fkey"
FOREIGN KEY ("refundId") REFERENCES "public"."Refund"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."RefundItem"
ADD CONSTRAINT "RefundItem_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "public"."Product"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
