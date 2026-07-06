-- Align new business settings with the operational scheduling contract.
ALTER TABLE "BusinessSettings"
ALTER COLUMN "bufferBetweenAppointmentsMinutes" SET DEFAULT 0;
