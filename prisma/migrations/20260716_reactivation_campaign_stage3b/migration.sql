-- CreateEnum
CREATE TYPE "ReactivationCampaignStatus" AS ENUM ('DRAFT', 'SENDING', 'COMPLETED', 'PARTIAL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReactivationRecipientStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'UNCERTAIN', 'SKIPPED');

-- CreateTable
CREATE TABLE "ReactivationCampaign" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "ReactivationCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "analyzedClients" INTEGER NOT NULL,
    "eligibleClients" INTEGER NOT NULL,
    "selectedCount" INTEGER NOT NULL,
    "segmentCounts" JSONB NOT NULL,
    "exclusions" JSONB NOT NULL,
    "maxRecipients" INTEGER NOT NULL DEFAULT 20,
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReactivationCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReactivationCampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "phoneSnapshot" TEXT NOT NULL,
    "phoneMasked" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "delayDays" INTEGER NOT NULL,
    "status" "ReactivationRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "openClientKey" TEXT,
    "skipReason" TEXT,
    "errorCode" TEXT,
    "claimedAt" TIMESTAMP(3),
    "providerCallStartedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReactivationCampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReactivationRecipientAudit" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "campaignId" TEXT,
    "recipientId" TEXT,
    "attemptId" TEXT,
    "event" TEXT NOT NULL,
    "state" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReactivationRecipientAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReactivationCampaign_unitId_ownerId_status_createdAt_idx" ON "ReactivationCampaign"("unitId", "ownerId", "status", "createdAt");
CREATE UNIQUE INDEX "ReactivationCampaign_one_open_per_owner_unit" ON "ReactivationCampaign"("unitId", "ownerId") WHERE "status" IN ('DRAFT', 'SENDING');
CREATE UNIQUE INDEX "ReactivationCampaignRecipient_idempotencyKey_key" ON "ReactivationCampaignRecipient"("idempotencyKey");
CREATE UNIQUE INDEX "ReactivationCampaignRecipient_attemptId_key" ON "ReactivationCampaignRecipient"("attemptId");
CREATE UNIQUE INDEX "ReactivationCampaignRecipient_openClientKey_key" ON "ReactivationCampaignRecipient"("openClientKey");
CREATE UNIQUE INDEX "ReactivationCampaignRecipient_campaignId_clientId_key" ON "ReactivationCampaignRecipient"("campaignId", "clientId");
CREATE INDEX "ReactivationCampaignRecipient_campaignId_status_idx" ON "ReactivationCampaignRecipient"("campaignId", "status");
CREATE INDEX "ReactivationCampaignRecipient_campaignId_status_claimedAt_idx" ON "ReactivationCampaignRecipient"("campaignId", "status", "claimedAt");
CREATE INDEX "ReactivationCampaignRecipient_clientId_status_sentAt_idx" ON "ReactivationCampaignRecipient"("clientId", "status", "sentAt");
CREATE UNIQUE INDEX "ReactivationRecipientAudit_eventKey_key" ON "ReactivationRecipientAudit"("eventKey");
CREATE INDEX "ReactivationRecipientAudit_unitId_createdAt_idx" ON "ReactivationRecipientAudit"("unitId", "createdAt");
CREATE INDEX "ReactivationRecipientAudit_campaignId_recipientId_createdAt_idx" ON "ReactivationRecipientAudit"("campaignId", "recipientId", "createdAt");
CREATE INDEX "ReactivationRecipientAudit_attemptId_idx" ON "ReactivationRecipientAudit"("attemptId");
CREATE INDEX "ReactivationRecipientAudit_event_createdAt_idx" ON "ReactivationRecipientAudit"("event", "createdAt");

ALTER TABLE "ReactivationCampaign" ADD CONSTRAINT "ReactivationCampaign_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReactivationCampaignRecipient" ADD CONSTRAINT "ReactivationCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ReactivationCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReactivationCampaignRecipient" ADD CONSTRAINT "ReactivationCampaignRecipient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReactivationRecipientAudit" ADD CONSTRAINT "ReactivationRecipientAudit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReactivationRecipientAudit" ADD CONSTRAINT "ReactivationRecipientAudit_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ReactivationCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReactivationRecipientAudit" ADD CONSTRAINT "ReactivationRecipientAudit_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "ReactivationCampaignRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
