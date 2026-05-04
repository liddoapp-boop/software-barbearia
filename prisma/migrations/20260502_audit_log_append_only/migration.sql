CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "route" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_unitId_createdAt_idx"
ON "public"."AuditLog"("unitId", "createdAt");

CREATE INDEX "AuditLog_unitId_entity_createdAt_idx"
ON "public"."AuditLog"("unitId", "entity", "createdAt");

CREATE INDEX "AuditLog_unitId_action_createdAt_idx"
ON "public"."AuditLog"("unitId", "action", "createdAt");

CREATE INDEX "AuditLog_unitId_actorId_createdAt_idx"
ON "public"."AuditLog"("unitId", "actorId", "createdAt");

CREATE INDEX "AuditLog_requestId_idx"
ON "public"."AuditLog"("requestId");

CREATE INDEX "AuditLog_idempotencyKey_idx"
ON "public"."AuditLog"("idempotencyKey");

ALTER TABLE "public"."AuditLog"
ADD CONSTRAINT "AuditLog_unitId_fkey"
FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
