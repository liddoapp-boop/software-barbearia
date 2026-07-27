import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { hashPassword } from "../http/security";

export const PRODUCTION_BOOTSTRAP_CONFIRMATION = "CREATE_INITIAL_OWNER";
export const PRODUCTION_BOOTSTRAP_REFUSED_MESSAGE =
  "Bootstrap de producao recusado: revise confirmacao e dados obrigatorios.";

export type ProductionBootstrapInput = {
  confirmation: string;
  unitId: string;
  unitName: string;
  unitTimezone?: string;
  ownerEmail: string;
  ownerName: string;
  ownerPassword: string;
};

export type ProductionBootstrapResult =
  | { status: "created"; unitId: string; ownerId: string }
  | { status: "already_initialized"; ownerId: string };

type ExistingUser = {
  id: string;
  role: string;
};

export type ProductionBootstrapTransaction = {
  user: {
    findFirst(args: unknown): Promise<ExistingUser | null>;
    findUnique(args: unknown): Promise<ExistingUser | null>;
    create(args: unknown): Promise<ExistingUser>;
  };
  unit: {
    upsert(args: unknown): Promise<{ id: string }>;
  };
  userUnitAccess: {
    create(args: unknown): Promise<unknown>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type ProductionBootstrapStore = {
  runExclusive<T>(work: (tx: ProductionBootstrapTransaction) => Promise<T>): Promise<T>;
};

function isValidPassword(password: string) {
  return (
    password.length >= 14 &&
    password.length <= 128 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function normalizeAndValidate(input: ProductionBootstrapInput) {
  const normalized = {
    confirmation: String(input.confirmation ?? "").trim(),
    unitId: String(input.unitId ?? "").trim(),
    unitName: String(input.unitName ?? "").trim(),
    unitTimezone: String(input.unitTimezone ?? "America/Sao_Paulo").trim(),
    ownerEmail: String(input.ownerEmail ?? "").trim().toLowerCase(),
    ownerName: String(input.ownerName ?? "").trim(),
    ownerPassword: String(input.ownerPassword ?? ""),
  };
  const valid =
    normalized.confirmation === PRODUCTION_BOOTSTRAP_CONFIRMATION &&
    /^[a-z0-9][a-z0-9_-]{2,63}$/i.test(normalized.unitId) &&
    normalized.unitName.length >= 2 &&
    normalized.unitName.length <= 120 &&
    normalized.unitTimezone.length >= 3 &&
    normalized.unitTimezone.length <= 80 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.ownerEmail) &&
    normalized.ownerName.length >= 2 &&
    normalized.ownerName.length <= 120 &&
    isValidPassword(normalized.ownerPassword);
  if (!valid) throw new Error(PRODUCTION_BOOTSTRAP_REFUSED_MESSAGE);
  return normalized;
}

export function createPrismaProductionBootstrapStore(client: PrismaClient): ProductionBootstrapStore {
  return {
    runExclusive: async <T>(work: (tx: ProductionBootstrapTransaction) => Promise<T>) =>
      client.$transaction(
        async (tx) => {
          await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${2_026_072_601})`);
          return work(tx as unknown as ProductionBootstrapTransaction);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
  };
}

export async function bootstrapInitialProductionOwner(
  store: ProductionBootstrapStore,
  input: ProductionBootstrapInput,
): Promise<ProductionBootstrapResult> {
  const data = normalizeAndValidate(input);
  return store.runExclusive(async (tx) => {
    const existingOwner = await tx.user.findFirst({
      where: { role: { equals: "owner", mode: "insensitive" } },
      select: { id: true, role: true },
    });
    if (existingOwner) {
      return { status: "already_initialized", ownerId: existingOwner.id };
    }

    const existingEmail = await tx.user.findUnique({
      where: { email: data.ownerEmail },
      select: { id: true, role: true },
    });
    if (existingEmail) throw new Error(PRODUCTION_BOOTSTRAP_REFUSED_MESSAGE);

    const ownerId = randomUUID();
    const unit = await tx.unit.upsert({
      where: { id: data.unitId },
      update: {},
      create: {
        id: data.unitId,
        name: data.unitName,
        timezone: data.unitTimezone,
      },
      select: { id: true },
    });
    await tx.user.create({
      data: {
        id: ownerId,
        email: data.ownerEmail,
        passwordHash: hashPassword(data.ownerPassword),
        name: data.ownerName,
        role: "owner",
        isActive: true,
      },
      select: { id: true, role: true },
    });
    await tx.userUnitAccess.create({
      data: {
        id: randomUUID(),
        userId: ownerId,
        unitId: unit.id,
        role: "owner",
        isActive: true,
      },
    });
    await tx.auditLog.create({
      data: {
        id: randomUUID(),
        unitId: unit.id,
        actorId: ownerId,
        actorEmail: data.ownerEmail,
        actorRole: "owner",
        action: "PRODUCTION_BOOTSTRAP_COMPLETED",
        entity: "production_bootstrap",
        entityId: ownerId,
        route: "cli:bootstrap-production-owner",
        method: "CLI",
        requestId: randomUUID(),
        afterJson: {
          ownerId,
          unitId: unit.id,
          role: "owner",
          bootstrap: "initial_owner",
        },
      },
    });
    return { status: "created", unitId: unit.id, ownerId };
  });
}
