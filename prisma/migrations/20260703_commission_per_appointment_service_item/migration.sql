-- Enable one service commission per appointment service item while preserving legacy service commissions.

ALTER TABLE "CommissionEntry"
ADD COLUMN "appointmentServiceItemId" TEXT;

ALTER TABLE "ProductSale"
ADD COLUMN "appointmentId" TEXT;

UPDATE "CommissionEntry" AS commission
SET "appointmentServiceItemId" = service_item."id"
FROM (
  SELECT
    "appointmentId",
    MIN("id") AS "id",
    COUNT(*) AS "itemCount"
  FROM "AppointmentServiceItem"
  GROUP BY "appointmentId"
) AS service_item
WHERE commission."source" = 'SERVICE'
  AND commission."appointmentId" = service_item."appointmentId"
  AND service_item."itemCount" = 1
  AND commission."appointmentServiceItemId" IS NULL;

CREATE UNIQUE INDEX "CommissionEntry_unitId_source_appointmentServiceItemId_key"
ON "CommissionEntry"("unitId", "source", "appointmentServiceItemId");

CREATE INDEX "CommissionEntry_appointmentServiceItemId_idx"
ON "CommissionEntry"("appointmentServiceItemId");

ALTER TABLE "CommissionEntry"
ADD CONSTRAINT "CommissionEntry_appointmentServiceItemId_fkey"
FOREIGN KEY ("appointmentServiceItemId")
REFERENCES "AppointmentServiceItem"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX "ProductSale_appointmentId_idx"
ON "ProductSale"("appointmentId");

ALTER TABLE "ProductSale"
ADD CONSTRAINT "ProductSale_appointmentId_fkey"
FOREIGN KEY ("appointmentId")
REFERENCES "Appointment"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

DROP INDEX IF EXISTS "CommissionEntry_unitId_source_appointmentId_key";
