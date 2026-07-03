-- Sprint 229.0: additive multi-service appointment persistence foundation.
-- Appointment.serviceId remains the legacy compatibility pointer during transition.

CREATE TYPE "AppointmentDurationCalculationMode" AS ENUM ('SUM', 'COMBINATION_RULE');

ALTER TABLE "Appointment"
  ADD COLUMN "totalPriceSnapshot" DECIMAL(10,2),
  ADD COLUMN "effectiveDurationMinSnapshot" INTEGER,
  ADD COLUMN "durationCalculationMode" "AppointmentDurationCalculationMode",
  ADD COLUMN "durationRuleIdSnapshot" TEXT,
  ADD COLUMN "durationRuleLabelSnapshot" TEXT;

CREATE TABLE "AppointmentServiceItem" (
  "id" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "serviceNameSnapshot" TEXT NOT NULL,
  "servicePriceSnapshot" DECIMAL(10,2) NOT NULL,
  "serviceDurationMinSnapshot" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AppointmentServiceItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceCombinationRule" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "serviceSetKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "effectiveDurationMin" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceCombinationRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceCombinationRuleItem" (
  "id" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "position" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ServiceCombinationRuleItem_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AppointmentServiceItem" (
  "id",
  "appointmentId",
  "serviceId",
  "position",
  "serviceNameSnapshot",
  "servicePriceSnapshot",
  "serviceDurationMinSnapshot",
  "createdAt",
  "updatedAt"
)
SELECT
  'asi-backfill-' || a."id",
  a."id",
  a."serviceId",
  0,
  COALESCE(a."serviceNameSnapshot", s."name"),
  COALESCE(a."servicePriceSnapshot", s."price"),
  COALESCE(a."serviceDurationMinSnapshot", s."durationMin"),
  a."createdAt",
  a."updatedAt"
FROM "Appointment" a
JOIN "Service" s ON s."id" = a."serviceId"
WHERE NOT EXISTS (
  SELECT 1
  FROM "AppointmentServiceItem" asi
  WHERE asi."appointmentId" = a."id"
);

UPDATE "Appointment" a
SET
  "totalPriceSnapshot" = COALESCE(a."servicePriceSnapshot", s."price"),
  "effectiveDurationMinSnapshot" = GREATEST(
    1,
    COALESCE(
      a."serviceDurationMinSnapshot",
      s."durationMin",
      ROUND(EXTRACT(EPOCH FROM (a."endsAt" - a."startsAt")) / 60)::integer
    )
  ),
  "durationCalculationMode" = 'SUM'
FROM "Service" s
WHERE s."id" = a."serviceId";

ALTER TABLE "Appointment"
  ALTER COLUMN "totalPriceSnapshot" SET NOT NULL,
  ALTER COLUMN "effectiveDurationMinSnapshot" SET NOT NULL,
  ALTER COLUMN "durationCalculationMode" SET NOT NULL;

CREATE UNIQUE INDEX "AppointmentServiceItem_appointmentId_position_key"
  ON "AppointmentServiceItem"("appointmentId", "position");
CREATE UNIQUE INDEX "AppointmentServiceItem_appointmentId_serviceId_key"
  ON "AppointmentServiceItem"("appointmentId", "serviceId");
CREATE INDEX "AppointmentServiceItem_appointmentId_idx"
  ON "AppointmentServiceItem"("appointmentId");
CREATE INDEX "AppointmentServiceItem_serviceId_idx"
  ON "AppointmentServiceItem"("serviceId");

CREATE UNIQUE INDEX "ServiceCombinationRule_unitId_serviceSetKey_key"
  ON "ServiceCombinationRule"("unitId", "serviceSetKey");
CREATE INDEX "ServiceCombinationRule_unitId_active_idx"
  ON "ServiceCombinationRule"("unitId", "active");

CREATE UNIQUE INDEX "ServiceCombinationRuleItem_ruleId_serviceId_key"
  ON "ServiceCombinationRuleItem"("ruleId", "serviceId");
CREATE INDEX "ServiceCombinationRuleItem_serviceId_idx"
  ON "ServiceCombinationRuleItem"("serviceId");

ALTER TABLE "AppointmentServiceItem"
  ADD CONSTRAINT "AppointmentServiceItem_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AppointmentServiceItem_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AppointmentServiceItem_position_check"
  CHECK ("position" >= 0),
  ADD CONSTRAINT "AppointmentServiceItem_price_check"
  CHECK ("servicePriceSnapshot" >= 0),
  ADD CONSTRAINT "AppointmentServiceItem_duration_check"
  CHECK ("serviceDurationMinSnapshot" > 0);

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_totalPriceSnapshot_check"
  CHECK ("totalPriceSnapshot" >= 0),
  ADD CONSTRAINT "Appointment_effectiveDurationMinSnapshot_check"
  CHECK ("effectiveDurationMinSnapshot" > 0);

ALTER TABLE "ServiceCombinationRule"
  ADD CONSTRAINT "ServiceCombinationRule_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ServiceCombinationRule_effectiveDurationMin_check"
  CHECK ("effectiveDurationMin" > 0);

ALTER TABLE "ServiceCombinationRuleItem"
  ADD CONSTRAINT "ServiceCombinationRuleItem_ruleId_fkey"
  FOREIGN KEY ("ruleId") REFERENCES "ServiceCombinationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ServiceCombinationRuleItem_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ServiceCombinationRuleItem_position_check"
  CHECK ("position" IS NULL OR "position" >= 0);
