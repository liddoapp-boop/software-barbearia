-- CreateEnum
CREATE TYPE "public"."AutomationExecutionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."IntegrationWebhookDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "public"."IntegrationWebhookStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "public"."AutomationRule" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "messageTemplate" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AutomationExecution" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "ruleId" TEXT,
    "clientId" TEXT,
    "campaignType" TEXT NOT NULL,
    "status" "public"."AutomationExecutionStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT NOT NULL,
    "errorMessage" TEXT,
    "payload" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetentionScoreSnapshot" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "riskScore" DECIMAL(5,2) NOT NULL,
    "riskLevel" "public"."RetentionRiskLevel" NOT NULL,
    "returnProbability" DECIMAL(5,2) NOT NULL,
    "reasons" JSONB NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "scoredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IntegrationWebhookLog" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "direction" "public"."IntegrationWebhookDirection" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "status" "public"."IntegrationWebhookStatus" NOT NULL,
    "httpStatus" INTEGER,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "correlationId" TEXT NOT NULL,
    "payload" JSONB,
    "responseBody" JSONB,
    "errorMessage" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationWebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BillingSubscriptionEvent" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "externalSubscriptionId" TEXT,
    "eventType" TEXT NOT NULL,
    "amount" DECIMAL(10,2),
    "status" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingSubscriptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationRule_unitId_isActive_idx" ON "public"."AutomationRule"("unitId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationExecution_unitId_idempotencyKey_key" ON "public"."AutomationExecution"("unitId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AutomationExecution_unitId_status_startedAt_idx" ON "public"."AutomationExecution"("unitId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "RetentionScoreSnapshot_unitId_scoredAt_idx" ON "public"."RetentionScoreSnapshot"("unitId", "scoredAt");

-- CreateIndex
CREATE INDEX "RetentionScoreSnapshot_unitId_riskLevel_scoredAt_idx" ON "public"."RetentionScoreSnapshot"("unitId", "riskLevel", "scoredAt");

-- CreateIndex
CREATE INDEX "IntegrationWebhookLog_unitId_provider_status_occurredAt_idx" ON "public"."IntegrationWebhookLog"("unitId", "provider", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "BillingSubscriptionEvent_unitId_status_occurredAt_idx" ON "public"."BillingSubscriptionEvent"("unitId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "BillingSubscriptionEvent_subscriptionId_occurredAt_idx" ON "public"."BillingSubscriptionEvent"("subscriptionId", "occurredAt");

-- AddForeignKey
ALTER TABLE "public"."AutomationRule" ADD CONSTRAINT "AutomationRule_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AutomationExecution" ADD CONSTRAINT "AutomationExecution_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AutomationExecution" ADD CONSTRAINT "AutomationExecution_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "public"."AutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AutomationExecution" ADD CONSTRAINT "AutomationExecution_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetentionScoreSnapshot" ADD CONSTRAINT "RetentionScoreSnapshot_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetentionScoreSnapshot" ADD CONSTRAINT "RetentionScoreSnapshot_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IntegrationWebhookLog" ADD CONSTRAINT "IntegrationWebhookLog_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingSubscriptionEvent" ADD CONSTRAINT "BillingSubscriptionEvent_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingSubscriptionEvent" ADD CONSTRAINT "BillingSubscriptionEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "public"."ClientSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
