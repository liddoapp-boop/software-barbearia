ALTER TABLE "Professional"
ADD COLUMN "businessId" TEXT NOT NULL DEFAULT 'unit-01';

INSERT INTO "Unit" ("id", "name", "timezone", "createdAt", "updatedAt")
VALUES ('unit-01', 'Unidade Padrao', 'America/Sao_Paulo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

CREATE INDEX "Professional_businessId_active_idx" ON "Professional"("businessId", "active");

ALTER TABLE "Professional"
ADD CONSTRAINT "Professional_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
