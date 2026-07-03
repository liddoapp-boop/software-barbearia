import "dotenv/config";
import { mkdtempSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const NEW_MIGRATION = "20260702_appointment_service_items_contract";

function parseBaseUrl() {
  const raw = process.env.TEST_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!raw) throw new Error("DATABASE_URL ou TEST_DATABASE_URL ausente");
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!LOCAL_HOSTS.has(url.hostname)) throw new Error("Migration 229.0 exige PostgreSQL local");
  if (/prod|production|render|railway/i.test(raw)) throw new Error("URL recusada por indicio de producao");
  if (!database || ["barbearia", "barbearia_visual_test_20260702", "barbearia_test"].includes(database)) {
    throw new Error("Banco base recusado para derivar teste 229.0");
  }
  return url;
}

function testUrl(base: URL, database: string) {
  const url = new URL(base.toString());
  url.pathname = `/${encodeURIComponent(database)}`;
  return url;
}

async function createDatabase(base: URL, database: string) {
  if (!/test/i.test(database)) throw new Error("Nome do banco isolado deve conter test");
  const maintenance = testUrl(base, "postgres");
  const prisma = new PrismaClient({ datasources: { db: { url: maintenance.toString() } } });
  try {
    const exists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
      database,
    );
    if (exists[0]?.exists) throw new Error(`Banco isolado ja existe: ${database}`);
    await prisma.$executeRawUnsafe(`CREATE DATABASE "${database.replace(/"/g, '""')}"`);
  } finally {
    await prisma.$disconnect();
  }
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv, cwd = process.cwd()) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Comando falhou: ${command} ${args.join(" ")}`);
}

function prepareOldPrismaFolder() {
  const dir = mkdtempSync(join(tmpdir(), "barbearia-2290-old-"));
  cpSync("prisma/schema.prisma", join(dir, "schema.prisma"));
  cpSync("prisma/migrations", join(dir, "migrations"), { recursive: true });
  rmSync(join(dir, "migrations", NEW_MIGRATION), { recursive: true, force: true });
  return dir;
}

async function insertLegacyFixture(url: URL) {
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    const statements = [
      `INSERT INTO "Unit" ("id", "name", "timezone", "createdAt", "updatedAt")
       VALUES ('unit-2290-test', 'Unidade Migration 2290', 'America/Sao_Paulo', now(), now())`,
      `INSERT INTO "Service" ("id", "businessId", "name", "price", "durationMin", "defaultCommissionRate", "costEstimate", "active", "createdAt", "updatedAt")
       VALUES ('svc-2290-corte', 'unit-2290-test', 'Corte Legacy', 30.00, 30, 0, 0, true, now(), now())`,
      `INSERT INTO "Professional" ("id", "businessId", "name", "active", "createdAt", "updatedAt")
       VALUES ('pro-2290', 'unit-2290-test', 'Profissional Legacy', true, now(), now())`,
      `INSERT INTO "ServiceProfessional" ("id", "serviceId", "professionalId", "createdAt", "updatedAt")
       VALUES ('sp-2290', 'svc-2290-corte', 'pro-2290', now(), now())`,
      `INSERT INTO "Client" ("id", "businessId", "fullName", "tags", "createdAt", "updatedAt")
       VALUES ('cli-2290', 'unit-2290-test', 'Cliente Legacy', ARRAY['NEW'], now(), now())`,
      `INSERT INTO "Appointment" (
        "id", "unitId", "clientId", "professionalId", "serviceId", "startsAt", "endsAt",
        "status", "isFitting", "serviceNameSnapshot", "servicePriceSnapshot",
        "serviceDurationMinSnapshot", "createdAt", "updatedAt"
      )
      VALUES (
        'apt-2290-legacy', 'unit-2290-test', 'cli-2290', 'pro-2290', 'svc-2290-corte',
        '2026-07-02T10:00:00.000Z', '2026-07-02T10:30:00.000Z',
        'SCHEDULED', false, 'Corte Snapshot', 31.00, 30, now(), now()
      )`,
      `INSERT INTO "AppointmentHistory" ("id", "appointmentId", "changedAt", "changedBy", "action")
       VALUES ('hist-2290-created', 'apt-2290-legacy', '2026-07-02T09:59:00.000Z', 'legacy', 'CREATED')`,
    ];
    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function validateBackfill(url: URL) {
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        items: bigint;
        total: string;
        effective: number;
        mode: string;
        status: string;
        history: bigint;
        financial: bigint;
        commissions: bigint;
      }>
    >(`
      SELECT
        (SELECT count(*) FROM "AppointmentServiceItem" WHERE "appointmentId" = 'apt-2290-legacy') AS items,
        a."totalPriceSnapshot"::text AS total,
        a."effectiveDurationMinSnapshot" AS effective,
        a."durationCalculationMode"::text AS mode,
        a."status"::text AS status,
        (SELECT count(*) FROM "AppointmentHistory" WHERE "appointmentId" = a."id") AS history,
        (SELECT count(*) FROM "FinancialEntry") AS financial,
        (SELECT count(*) FROM "CommissionEntry") AS commissions
      FROM "Appointment" a
      WHERE a."id" = 'apt-2290-legacy'
    `);
    const row = rows[0];
    if (!row) throw new Error("Fixture legado nao encontrado apos migration");
    if (Number(row.items) !== 1) throw new Error(`Backfill criou ${row.items} itens`);
    if (Number(row.total) !== 31) throw new Error(`Total snapshot inesperado: ${row.total}`);
    if (row.effective !== 30 || row.mode !== "SUM") throw new Error("Duracao/mode de backfill inesperado");
    if (row.status !== "SCHEDULED" || Number(row.history) !== 1) throw new Error("Status/historico alterado");
    if (Number(row.financial) !== 0 || Number(row.commissions) !== 0) {
      throw new Error("Backfill gerou financeiro ou comissao indevidos");
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const base = parseBaseUrl();
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const upgradeDb = `barbearia_2290_migration_test_${stamp}`;
  const cleanDb = `barbearia_2290_migration_clean_test_${stamp}`;
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";

  console.log(`[migration-2290] upgrade_database=${upgradeDb}`);
  await createDatabase(base, upgradeDb);
  const upgradeUrl = testUrl(base, upgradeDb);
  const oldPrisma = prepareOldPrismaFolder();
  run(npx, ["prisma", "migrate", "deploy", "--schema", join(oldPrisma, "schema.prisma")], {
    ...process.env,
    DATABASE_URL: upgradeUrl.toString(),
  });
  await insertLegacyFixture(upgradeUrl);
  run(npx, ["prisma", "migrate", "deploy"], { ...process.env, DATABASE_URL: upgradeUrl.toString() });
  await validateBackfill(upgradeUrl);

  console.log(`[migration-2290] clean_database=${cleanDb}`);
  await createDatabase(base, cleanDb);
  run(npx, ["prisma", "migrate", "deploy"], {
    ...process.env,
    DATABASE_URL: testUrl(base, cleanDb).toString(),
  });
  console.log("[migration-2290] result=ok");
}

main().catch((error) => {
  console.error(`[migration-2290] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
