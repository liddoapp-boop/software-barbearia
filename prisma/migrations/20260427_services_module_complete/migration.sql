-- AlterTable
ALTER TABLE "public"."Service"
ADD COLUMN "businessId" TEXT NOT NULL DEFAULT 'unit-01',
ADD COLUMN "description" TEXT,
ADD COLUMN "defaultCommissionRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
ADD COLUMN "notes" TEXT,
ALTER COLUMN "category" DROP NOT NULL;

-- CreateTable
CREATE TABLE "public"."ServiceProfessional" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceProfessional_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceProfessional_serviceId_professionalId_key"
ON "public"."ServiceProfessional"("serviceId", "professionalId");

-- CreateIndex
CREATE INDEX "ServiceProfessional_professionalId_idx"
ON "public"."ServiceProfessional"("professionalId");

-- CreateIndex
CREATE INDEX "Service_businessId_active_idx"
ON "public"."Service"("businessId", "active");

-- CreateIndex
CREATE INDEX "Service_businessId_category_idx"
ON "public"."Service"("businessId", "category");

-- AddForeignKey
ALTER TABLE "public"."ServiceProfessional"
ADD CONSTRAINT "ServiceProfessional_serviceId_fkey"
FOREIGN KEY ("serviceId") REFERENCES "public"."Service"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServiceProfessional"
ADD CONSTRAINT "ServiceProfessional_professionalId_fkey"
FOREIGN KEY ("professionalId") REFERENCES "public"."Professional"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
