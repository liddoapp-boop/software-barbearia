-- Stock alert delivery hardening: ambiguous provider outcomes are terminal.
ALTER TYPE "StockAlertDeliveryStatus" ADD VALUE 'UNCERTAIN';

ALTER TABLE "StockAlert"
  ADD COLUMN "deliveryAttemptId" TEXT,
  ADD COLUMN "providerCallStartedAt" TIMESTAMP(3),
  ADD COLUMN "failedAt" TIMESTAMP(3),
  ADD COLUMN "uncertainAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "StockAlert_deliveryAttemptId_key"
  ON "StockAlert"("deliveryAttemptId");

CREATE INDEX "StockAlert_status_claimedAt_idx"
  ON "StockAlert"("status", "claimedAt");
