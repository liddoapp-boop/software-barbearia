ALTER TABLE "public"."Appointment"
  ADD COLUMN "serviceNameSnapshot" TEXT,
  ADD COLUMN "servicePriceSnapshot" DECIMAL(10,2),
  ADD COLUMN "serviceDurationMinSnapshot" INTEGER;
