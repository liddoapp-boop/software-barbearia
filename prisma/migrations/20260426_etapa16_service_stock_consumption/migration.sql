CREATE TABLE "public"."ServiceStockConsumption" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityPerService" DECIMAL(10,3) NOT NULL,
    "wastePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceStockConsumption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceStockConsumption_unitId_serviceId_productId_key"
ON "public"."ServiceStockConsumption"("unitId", "serviceId", "productId");

CREATE INDEX "ServiceStockConsumption_unitId_serviceId_idx"
ON "public"."ServiceStockConsumption"("unitId", "serviceId");

CREATE INDEX "ServiceStockConsumption_productId_idx"
ON "public"."ServiceStockConsumption"("productId");

ALTER TABLE "public"."ServiceStockConsumption"
ADD CONSTRAINT "ServiceStockConsumption_unitId_fkey"
FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."ServiceStockConsumption"
ADD CONSTRAINT "ServiceStockConsumption_serviceId_fkey"
FOREIGN KEY ("serviceId") REFERENCES "public"."Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."ServiceStockConsumption"
ADD CONSTRAINT "ServiceStockConsumption_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
