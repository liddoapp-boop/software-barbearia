-- AlterTable
ALTER TABLE "public"."Client"
ADD COLUMN "businessId" TEXT NOT NULL DEFAULT 'unit-01',
ADD COLUMN "email" TEXT,
ADD COLUMN "birthDate" TIMESTAMP(3),
ADD COLUMN "notes" TEXT;

-- CreateIndex
CREATE INDEX "Client_businessId_fullName_idx" ON "public"."Client"("businessId", "fullName");

-- CreateIndex
CREATE INDEX "Client_businessId_phone_idx" ON "public"."Client"("businessId", "phone");

-- AddForeignKey
ALTER TABLE "public"."Client"
ADD CONSTRAINT "Client_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
