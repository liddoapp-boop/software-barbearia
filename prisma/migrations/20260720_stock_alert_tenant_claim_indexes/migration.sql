CREATE INDEX "StockAlert_unitId_status_nextAttemptAt_createdAt_idx"
ON "StockAlert"("unitId", "status", "nextAttemptAt", "createdAt");

CREATE INDEX "StockAlert_unitId_status_claimedAt_idx"
ON "StockAlert"("unitId", "status", "claimedAt");
