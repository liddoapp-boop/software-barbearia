-- Etapa 2: ciclo idempotente e outbox de alertas de estoque.
CREATE TYPE "StockAlertType" AS ENUM ('LOW_STOCK', 'OUT_OF_STOCK');
CREATE TYPE "StockAlertDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

ALTER TABLE "Product"
  ADD COLUMN "stockAlertCycle" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stockAlertCycleActive" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "StockAlert" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "alertType" "StockAlertType" NOT NULL,
  "cycle" INTEGER NOT NULL,
  "status" "StockAlertDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "quantity" INTEGER NOT NULL,
  "minimumStock" INTEGER NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "nextAttemptAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockAlert_unitId_productId_alertType_cycle_key"
  ON "StockAlert"("unitId", "productId", "alertType", "cycle");
CREATE INDEX "StockAlert_status_nextAttemptAt_createdAt_idx"
  ON "StockAlert"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "StockAlert_unitId_productId_cycle_idx"
  ON "StockAlert"("unitId", "productId", "cycle");

ALTER TABLE "StockAlert"
  ADD CONSTRAINT "StockAlert_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockAlert_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
