import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.resolve(process.cwd(), "prisma/migrations/20260716_reactivation_campaign_stage3b/migration.sql"),
  "utf8",
);

describe("migration da campanha de reativacao 3B", () => {
  it("garante uma campanha aberta por owner/unidade e uma reserva aberta por cliente/tenant", () => {
    expect(migration).toContain(
      "CREATE UNIQUE INDEX \"ReactivationCampaign_one_open_per_owner_unit\" ON \"ReactivationCampaign\"(\"unitId\", \"ownerId\") WHERE \"status\" IN ('DRAFT', 'SENDING')",
    );
    expect(migration).toContain(
      "CREATE UNIQUE INDEX \"ReactivationCampaignRecipient_openClientKey_key\" ON \"ReactivationCampaignRecipient\"(\"openClientKey\")",
    );
  });

  it("persiste attemptId, inicio do provedor, UNCERTAIN e auditoria individual idempotente", () => {
    expect(migration).toContain("'UNCERTAIN'");
    expect(migration).toContain("\"attemptId\" TEXT NOT NULL");
    expect(migration).toContain("\"providerCallStartedAt\" TIMESTAMP(3)");
    expect(migration).toContain("CREATE TABLE \"ReactivationRecipientAudit\"");
    expect(migration).toContain(
      "CREATE UNIQUE INDEX \"ReactivationRecipientAudit_eventKey_key\" ON \"ReactivationRecipientAudit\"(\"eventKey\")",
    );
  });
});
