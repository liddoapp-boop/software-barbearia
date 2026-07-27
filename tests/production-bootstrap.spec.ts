import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  PRODUCTION_BOOTSTRAP_CONFIRMATION,
  PRODUCTION_BOOTSTRAP_REFUSED_MESSAGE,
  bootstrapInitialProductionOwner,
  createPrismaProductionBootstrapStore,
  type ProductionBootstrapStore,
  type ProductionBootstrapTransaction,
} from "../src/application/production-bootstrap";
import { verifyPassword } from "../src/http/security";

const validInput = {
  confirmation: PRODUCTION_BOOTSTRAP_CONFIRMATION,
  unitId: "unit-production",
  unitName: "Barbearia Producao",
  unitTimezone: "America/Sao_Paulo",
  ownerEmail: "OWNER@EXAMPLE.COM",
  ownerName: "Owner Inicial",
  ownerPassword: "Senha-Forte-2026!",
};

function createTransaction(overrides: {
  existingOwner?: { id: string; role: string } | null;
  existingEmail?: { id: string; role: string } | null;
} = {}) {
  return {
    user: {
      findFirst: vi.fn().mockResolvedValue(overrides.existingOwner ?? null),
      findUnique: vi.fn().mockResolvedValue(overrides.existingEmail ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: data.id as string,
        role: data.role as string,
      })),
    },
    unit: {
      upsert: vi.fn().mockResolvedValue({ id: validInput.unitId }),
    },
    userUnitAccess: {
      create: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  } satisfies ProductionBootstrapTransaction;
}

function storeFor(tx: ProductionBootstrapTransaction) {
  const runExclusive = vi.fn(async (
    work: (transaction: ProductionBootstrapTransaction) => Promise<unknown>,
  ) => work(tx)) as unknown as ProductionBootstrapStore["runExclusive"];
  return {
    runExclusive,
  } satisfies ProductionBootstrapStore;
}

describe("bootstrap inicial de producao", () => {
  it("exige confirmacao explicita antes de abrir a transacao", async () => {
    const tx = createTransaction();
    const store = storeFor(tx);
    await expect(bootstrapInitialProductionOwner(store, {
      ...validInput,
      confirmation: "",
    })).rejects.toThrow(PRODUCTION_BOOTSTRAP_REFUSED_MESSAGE);
    expect(store.runExclusive).not.toHaveBeenCalled();
  });

  it("cria unidade, owner, acesso e auditoria uma unica vez sem expor a senha", async () => {
    const tx = createTransaction();
    const store = storeFor(tx);
    const result = await bootstrapInitialProductionOwner(store, validInput);

    expect(result).toMatchObject({
      status: "created",
      unitId: "unit-production",
    });
    expect(tx.unit.upsert).toHaveBeenCalledTimes(1);
    expect(tx.user.create).toHaveBeenCalledTimes(1);
    expect(tx.userUnitAccess.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);

    const userCreate = tx.user.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(userCreate.data.email).toBe("owner@example.com");
    expect(userCreate.data.passwordHash).not.toBe(validInput.ownerPassword);
    expect(verifyPassword(validInput.ownerPassword, String(userCreate.data.passwordHash))).toBe(true);

    const auditCreate = tx.auditLog.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(auditCreate.data).toMatchObject({
      actorRole: "owner",
      action: "PRODUCTION_BOOTSTRAP_COMPLETED",
      entity: "production_bootstrap",
      method: "CLI",
    });
    expect(JSON.stringify({ result, audit: auditCreate })).not.toContain(validInput.ownerPassword);
    expect(JSON.stringify(auditCreate)).not.toContain("passwordHash");
  });

  it("e idempotente quando qualquer owner ja existe", async () => {
    const tx = createTransaction({ existingOwner: { id: "owner-existing", role: "owner" } });
    const result = await bootstrapInitialProductionOwner(storeFor(tx), validInput);

    expect(result).toEqual({ status: "already_initialized", ownerId: "owner-existing" });
    expect(tx.user.findUnique).not.toHaveBeenCalled();
    expect(tx.unit.upsert).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.userUnitAccess.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("recusa reaproveitar email existente sem owner e nao cria dados parciais", async () => {
    const tx = createTransaction({ existingEmail: { id: "user-existing", role: "receptionist" } });
    await expect(bootstrapInitialProductionOwner(storeFor(tx), validInput)).rejects.toThrow(
      PRODUCTION_BOOTSTRAP_REFUSED_MESSAGE,
    );
    expect(tx.unit.upsert).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    ["senha fraca", { ownerPassword: "senha-fraca" }],
    ["email invalido", { ownerEmail: "owner-invalido" }],
    ["unidade invalida", { unitId: "../unit" }],
  ])("recusa %s antes da transacao", async (_label, override) => {
    const tx = createTransaction();
    const store = storeFor(tx);
    await expect(bootstrapInitialProductionOwner(store, {
      ...validInput,
      ...override,
    })).rejects.toThrow(PRODUCTION_BOOTSTRAP_REFUSED_MESSAGE);
    expect(store.runExclusive).not.toHaveBeenCalled();
  });

  it("usa transacao serializavel e advisory lock no adapter Prisma", async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const transaction = vi.fn(async (
      work: (tx: { $executeRaw: typeof executeRaw }) => Promise<unknown>,
      options: { isolationLevel: string },
    ) => {
      expect(options.isolationLevel).toBe("Serializable");
      return work({ $executeRaw: executeRaw });
    });
    const client = { $transaction: transaction } as unknown as PrismaClient;
    const store = createPrismaProductionBootstrapStore(client);
    const value = await store.runExclusive(async () => "ok");

    expect(value).toBe("ok");
    expect(executeRaw).toHaveBeenCalledTimes(1);
    const query = executeRaw.mock.calls[0][0] as { strings: string[]; values: unknown[] };
    expect(query.strings.join("?")).toContain("SELECT pg_advisory_xact_lock(?)");
    expect(query.values).toEqual([expect.any(Number)]);
  });

  it("expoe comando dedicado e nao reutiliza seed", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const source = readFileSync(join(process.cwd(), "scripts", "bootstrap-production-owner.ts"), "utf8");
    expect(packageJson.scripts["bootstrap:production-owner"]).toBe(
      "tsx scripts/bootstrap-production-owner.ts",
    );
    expect(source).toContain("assertSafeServerEnvironment");
    expect(source).not.toMatch(/seed|db push|migrate/i);
  });
});
