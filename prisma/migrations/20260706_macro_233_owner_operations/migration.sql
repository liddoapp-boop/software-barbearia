CREATE TYPE "AppointmentBlockStatus" AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE "CheckoutStatus" AS ENUM ('OPEN', 'PAID', 'CANCELLED');
CREATE TYPE "CheckoutPaymentMethod" AS ENUM ('CASH', 'PIX', 'DEBIT', 'CREDIT');
CREATE TYPE "CheckoutPaymentStatus" AS ENUM ('CONFIRMED', 'FAILED', 'REVERSED');
CREATE TYPE "StockInventoryCountStatus" AS ENUM ('RECORDED', 'APPLIED');
CREATE TYPE "DailyClosingStatus" AS ENUM ('CLOSED', 'REOPENED');

CREATE TABLE "AppointmentBlock" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "professionalId" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "isFullDay" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT NOT NULL,
  "status" "AppointmentBlockStatus" NOT NULL DEFAULT 'ACTIVE',
  "cancelledAt" TIMESTAMP(3),
  "cancelledBy" TEXT,
  "cancelReason" TEXT,
  "createdBy" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppointmentBlock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppointmentCheckout" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "status" "CheckoutStatus" NOT NULL DEFAULT 'OPEN',
  "totalAmount" DECIMAL(10,2) NOT NULL,
  "serviceAmount" DECIMAL(10,2) NOT NULL,
  "productAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "changeAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "openedAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "changedBy" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppointmentCheckout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CheckoutPayment" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "checkoutId" TEXT NOT NULL,
  "method" "CheckoutPaymentMethod" NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "receivedAmount" DECIMAL(10,2),
  "changeAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "paidAt" TIMESTAMP(3) NOT NULL,
  "responsible" TEXT NOT NULL,
  "reference" TEXT,
  "status" "CheckoutPaymentStatus" NOT NULL DEFAULT 'CONFIRMED',
  "failureReason" TEXT,
  "reversedPaymentId" TEXT,
  "reversalReason" TEXT,
  "idempotencyKey" TEXT,
  "financialEntryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CheckoutPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockInventoryCount" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "expectedQty" INTEGER NOT NULL,
  "countedQty" INTEGER NOT NULL,
  "differenceQty" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "responsible" TEXT NOT NULL,
  "countedAt" TIMESTAMP(3) NOT NULL,
  "status" "StockInventoryCountStatus" NOT NULL DEFAULT 'RECORDED',
  "movementId" TEXT,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockInventoryCount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyClosing" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "businessDate" TIMESTAMP(3) NOT NULL,
  "status" "DailyClosingStatus" NOT NULL DEFAULT 'CLOSED',
  "cashExpected" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "pixExpected" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "debitExpected" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "creditExpected" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "servicesTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "productsTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "expensesTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "correctionsTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "expectedTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "informedCash" DECIMAL(10,2),
  "informedPix" DECIMAL(10,2),
  "informedDebit" DECIMAL(10,2),
  "informedCredit" DECIMAL(10,2),
  "divergence" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "responsible" TEXT NOT NULL,
  "closedAt" TIMESTAMP(3) NOT NULL,
  "reopenedAt" TIMESTAMP(3),
  "reopenedBy" TEXT,
  "reopenReason" TEXT,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyClosing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppointmentBlock_unitId_idempotencyKey_key" ON "AppointmentBlock"("unitId", "idempotencyKey");
CREATE INDEX "AppointmentBlock_unitId_startsAt_idx" ON "AppointmentBlock"("unitId", "startsAt");
CREATE INDEX "AppointmentBlock_unitId_status_startsAt_idx" ON "AppointmentBlock"("unitId", "status", "startsAt");
CREATE INDEX "AppointmentBlock_professionalId_startsAt_idx" ON "AppointmentBlock"("professionalId", "startsAt");
CREATE UNIQUE INDEX "AppointmentCheckout_appointmentId_key" ON "AppointmentCheckout"("appointmentId");
CREATE UNIQUE INDEX "AppointmentCheckout_unitId_idempotencyKey_key" ON "AppointmentCheckout"("unitId", "idempotencyKey");
CREATE INDEX "AppointmentCheckout_unitId_status_openedAt_idx" ON "AppointmentCheckout"("unitId", "status", "openedAt");
CREATE UNIQUE INDEX "CheckoutPayment_unitId_idempotencyKey_key" ON "CheckoutPayment"("unitId", "idempotencyKey");
CREATE INDEX "CheckoutPayment_checkoutId_status_idx" ON "CheckoutPayment"("checkoutId", "status");
CREATE INDEX "CheckoutPayment_unitId_paidAt_idx" ON "CheckoutPayment"("unitId", "paidAt");
CREATE UNIQUE INDEX "StockInventoryCount_unitId_idempotencyKey_key" ON "StockInventoryCount"("unitId", "idempotencyKey");
CREATE INDEX "StockInventoryCount_unitId_countedAt_idx" ON "StockInventoryCount"("unitId", "countedAt");
CREATE INDEX "StockInventoryCount_productId_countedAt_idx" ON "StockInventoryCount"("productId", "countedAt");
CREATE UNIQUE INDEX "DailyClosing_unitId_businessDate_key" ON "DailyClosing"("unitId", "businessDate");
CREATE UNIQUE INDEX "DailyClosing_unitId_idempotencyKey_key" ON "DailyClosing"("unitId", "idempotencyKey");
CREATE INDEX "DailyClosing_unitId_status_businessDate_idx" ON "DailyClosing"("unitId", "status", "businessDate");

ALTER TABLE "AppointmentBlock" ADD CONSTRAINT "AppointmentBlock_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppointmentBlock" ADD CONSTRAINT "AppointmentBlock_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AppointmentCheckout" ADD CONSTRAINT "AppointmentCheckout_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppointmentCheckout" ADD CONSTRAINT "AppointmentCheckout_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CheckoutPayment" ADD CONSTRAINT "CheckoutPayment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CheckoutPayment" ADD CONSTRAINT "CheckoutPayment_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "AppointmentCheckout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CheckoutPayment" ADD CONSTRAINT "CheckoutPayment_reversedPaymentId_fkey" FOREIGN KEY ("reversedPaymentId") REFERENCES "CheckoutPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockInventoryCount" ADD CONSTRAINT "StockInventoryCount_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockInventoryCount" ADD CONSTRAINT "StockInventoryCount_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyClosing" ADD CONSTRAINT "DailyClosing_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
