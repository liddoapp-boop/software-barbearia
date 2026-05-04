-- CreateTable
CREATE TABLE "public"."BusinessSettings" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "document" TEXT,
    "displayName" TEXT,
    "primaryColor" TEXT,
    "themeMode" TEXT NOT NULL DEFAULT 'light',
    "defaultAppointmentDuration" INTEGER NOT NULL DEFAULT 45,
    "minimumAdvanceMinutes" INTEGER NOT NULL DEFAULT 30,
    "bufferBetweenAppointmentsMinutes" INTEGER NOT NULL DEFAULT 10,
    "reminderLeadMinutes" INTEGER NOT NULL DEFAULT 60,
    "sendAppointmentReminders" BOOLEAN NOT NULL DEFAULT true,
    "inactiveCustomerDays" INTEGER NOT NULL DEFAULT 60,
    "atRiskCustomerDays" INTEGER NOT NULL DEFAULT 30,
    "allowWalkIns" BOOLEAN NOT NULL DEFAULT true,
    "allowOutOfHoursAppointments" BOOLEAN NOT NULL DEFAULT false,
    "allowOverbooking" BOOLEAN NOT NULL DEFAULT false,
    "houseCommissionType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "houseCommissionValue" DECIMAL(10,2) NOT NULL DEFAULT 40,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BusinessHour" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "opensAt" TEXT,
    "closesAt" TEXT,
    "breakStart" TEXT,
    "breakEnd" TEXT,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessHour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PaymentMethod" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BusinessCommissionRule" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "professionalId" TEXT,
    "serviceId" TEXT,
    "type" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessCommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TeamMember" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "accessProfile" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessSettings_unitId_key" ON "public"."BusinessSettings"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessHour_unitId_dayOfWeek_key" ON "public"."BusinessHour"("unitId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "BusinessHour_unitId_idx" ON "public"."BusinessHour"("unitId");

-- CreateIndex
CREATE INDEX "PaymentMethod_unitId_isActive_idx" ON "public"."PaymentMethod"("unitId", "isActive");

-- CreateIndex
CREATE INDEX "BusinessCommissionRule_unitId_isActive_idx" ON "public"."BusinessCommissionRule"("unitId", "isActive");

-- CreateIndex
CREATE INDEX "BusinessCommissionRule_professionalId_idx" ON "public"."BusinessCommissionRule"("professionalId");

-- CreateIndex
CREATE INDEX "BusinessCommissionRule_serviceId_idx" ON "public"."BusinessCommissionRule"("serviceId");

-- CreateIndex
CREATE INDEX "TeamMember_unitId_isActive_idx" ON "public"."TeamMember"("unitId", "isActive");

-- AddForeignKey
ALTER TABLE "public"."BusinessSettings"
ADD CONSTRAINT "BusinessSettings_unitId_fkey"
FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BusinessHour"
ADD CONSTRAINT "BusinessHour_unitId_fkey"
FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentMethod"
ADD CONSTRAINT "PaymentMethod_unitId_fkey"
FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BusinessCommissionRule"
ADD CONSTRAINT "BusinessCommissionRule_unitId_fkey"
FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BusinessCommissionRule"
ADD CONSTRAINT "BusinessCommissionRule_professionalId_fkey"
FOREIGN KEY ("professionalId") REFERENCES "public"."Professional"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BusinessCommissionRule"
ADD CONSTRAINT "BusinessCommissionRule_serviceId_fkey"
FOREIGN KEY ("serviceId") REFERENCES "public"."Service"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeamMember"
ADD CONSTRAINT "TeamMember_unitId_fkey"
FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
