-- CreateEnum
CREATE TYPE "public"."LoyaltyType" AS ENUM ('POINTS', 'CASHBACK');

-- CreateEnum
CREATE TYPE "public"."LoyaltySourceType" AS ENUM ('SERVICE', 'PRODUCT', 'ADJUSTMENT', 'REDEEM');

-- CreateEnum
CREATE TYPE "public"."ClientPackageStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DEPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."ClientSubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."RetentionCaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "public"."RetentionRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "public"."LoyaltyProgram" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."LoyaltyType" NOT NULL,
    "conversionRate" DECIMAL(10,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LoyaltyLedger" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sourceType" "public"."LoyaltySourceType" NOT NULL,
    "sourceId" TEXT,
    "pointsDelta" DECIMAL(10,2) NOT NULL,
    "balanceAfter" DECIMAL(10,2) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ServicePackage" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "sessionsTotal" INTEGER NOT NULL,
    "sessionsByService" JSONB,
    "validityDays" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ClientPackage" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sessionsRemaining" INTEGER NOT NULL,
    "status" "public"."ClientPackageStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceMonthly" DECIMAL(10,2) NOT NULL,
    "billingDay" INTEGER NOT NULL,
    "benefits" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ClientSubscription" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "nextBillingAt" TIMESTAMP(3) NOT NULL,
    "status" "public"."ClientSubscriptionStatus" NOT NULL,
    "cycleCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetentionCase" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "public"."RetentionCaseStatus" NOT NULL,
    "riskLevel" "public"."RetentionRiskLevel" NOT NULL,
    "reason" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "lastVisitAt" TIMESTAMP(3),
    "daysWithoutReturn" INTEGER NOT NULL DEFAULT 0,
    "ownerUser" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetentionEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "outcome" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoyaltyProgram_unitId_isActive_idx" ON "public"."LoyaltyProgram"("unitId", "isActive");

-- CreateIndex
CREATE INDEX "LoyaltyLedger_unitId_clientId_occurredAt_idx" ON "public"."LoyaltyLedger"("unitId", "clientId", "occurredAt");

-- CreateIndex
CREATE INDEX "ServicePackage_unitId_isActive_idx" ON "public"."ServicePackage"("unitId", "isActive");

-- CreateIndex
CREATE INDEX "ClientPackage_unitId_clientId_status_idx" ON "public"."ClientPackage"("unitId", "clientId", "status");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_unitId_isActive_idx" ON "public"."SubscriptionPlan"("unitId", "isActive");

-- CreateIndex
CREATE INDEX "ClientSubscription_unitId_clientId_status_idx" ON "public"."ClientSubscription"("unitId", "clientId", "status");

-- CreateIndex
CREATE INDEX "RetentionCase_unitId_status_riskLevel_idx" ON "public"."RetentionCase"("unitId", "status", "riskLevel");

-- CreateIndex
CREATE INDEX "RetentionEvent_caseId_occurredAt_idx" ON "public"."RetentionEvent"("caseId", "occurredAt");

-- AddForeignKey
ALTER TABLE "public"."LoyaltyProgram" ADD CONSTRAINT "LoyaltyProgram_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LoyaltyLedger" ADD CONSTRAINT "LoyaltyLedger_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LoyaltyLedger" ADD CONSTRAINT "LoyaltyLedger_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServicePackage" ADD CONSTRAINT "ServicePackage_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClientPackage" ADD CONSTRAINT "ClientPackage_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClientPackage" ADD CONSTRAINT "ClientPackage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClientPackage" ADD CONSTRAINT "ClientPackage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "public"."ServicePackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SubscriptionPlan" ADD CONSTRAINT "SubscriptionPlan_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClientSubscription" ADD CONSTRAINT "ClientSubscription_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClientSubscription" ADD CONSTRAINT "ClientSubscription_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClientSubscription" ADD CONSTRAINT "ClientSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetentionCase" ADD CONSTRAINT "RetentionCase_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetentionCase" ADD CONSTRAINT "RetentionCase_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetentionEvent" ADD CONSTRAINT "RetentionEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."RetentionCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
