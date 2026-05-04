-- AlterTable
ALTER TABLE "public"."Product"
ADD COLUMN "businessId" TEXT NOT NULL DEFAULT 'unit-01',
ADD COLUMN "notes" TEXT;

-- CreateIndex
CREATE INDEX "Product_businessId_active_idx" ON "public"."Product"("businessId", "active");
