import "dotenv/config";
import { PrismaClient } from "@prisma/client";

type Mode = "dry-run" | "apply";
type Target = "local" | "test" | "unknown" | "production";

const CANONICAL_UNIT_ID = "unit-01";
const GEOVANE_ID = "pro-geovane-borges";
const GEOVANE_NAME = "Geovane Borges";
const CANONICAL_SERVICE_IDS = [
  "canon-svc-corte",
  "canon-svc-barba",
  "canon-svc-hidratacao",
  "canon-svc-luzes",
  "canon-svc-pigmentacao",
  "canon-svc-corte-barba",
];

const prisma = new PrismaClient();

function parseMode(argv: string[]): Mode {
  if (argv.includes("--apply")) return "apply";
  return "dry-run";
}

function classifyDatabaseUrl(): Target {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return "unknown";
  const decoded = decodeURIComponent(raw).toLowerCase();
  if (/(prod|production|render|railway)/.test(decoded)) return "production";
  try {
    const url = new URL(raw);
    const database = decodeURIComponent(url.pathname.replace(/^\//, "")).toLowerCase();
    if (["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase())) return "local";
    if (/test|local|dev/.test(database)) return "test";
  } catch {
    return "unknown";
  }
  return "unknown";
}

function assertSafeLocalTarget() {
  const target = classifyDatabaseUrl();
  if (target !== "local" && target !== "test") {
    throw new Error(`cleanup bloqueado para alvo detectado: ${target}`);
  }
}

async function buildPlan() {
  const geovane = await prisma.professional.findFirst({
    where: {
      businessId: CANONICAL_UNIT_ID,
      OR: [{ id: GEOVANE_ID }, { name: GEOVANE_NAME }],
    },
    orderBy: [{ id: "asc" }],
    select: { id: true, name: true, active: true },
  });
  if (!geovane) throw new Error("Geovane Borges nao encontrado na unidade canonica");

  const contaminantProfessionals = await prisma.professional.findMany({
    where: {
      businessId: CANONICAL_UNIT_ID,
      active: true,
      id: { not: geovane.id },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          appointments: true,
          productSales: true,
          commissions: true,
        },
      },
    },
  });

  const nonGeovaneCanonicalLinks = await prisma.serviceProfessional.findMany({
    where: {
      serviceId: { in: CANONICAL_SERVICE_IDS },
      professionalId: { not: geovane.id },
    },
    select: { id: true, serviceId: true, professionalId: true },
  });

  const geovaneInactiveServiceLinks = await prisma.serviceProfessional.findMany({
    where: {
      professionalId: geovane.id,
      service: { businessId: CANONICAL_UNIT_ID, active: false },
    },
    select: { id: true, serviceId: true, professionalId: true },
  });

  const crossUnitLinks = await prisma.serviceProfessional.findMany({
    where: {
      professional: { businessId: CANONICAL_UNIT_ID },
      service: { businessId: { not: CANONICAL_UNIT_ID } },
    },
    select: { id: true, serviceId: true, professionalId: true },
  });

  return {
    geovane,
    contaminantProfessionals,
    nonGeovaneCanonicalLinks,
    geovaneInactiveServiceLinks,
    crossUnitLinks,
  };
}

async function applyPlan(plan: Awaited<ReturnType<typeof buildPlan>>) {
  await prisma.$transaction(async (tx) => {
    await tx.professional.updateMany({
      where: {
        id: { in: plan.contaminantProfessionals.map((item) => item.id) },
        businessId: CANONICAL_UNIT_ID,
        active: true,
      },
      data: { active: false },
    });
    await tx.serviceProfessional.deleteMany({
      where: {
        id: {
          in: [
            ...plan.nonGeovaneCanonicalLinks,
            ...plan.geovaneInactiveServiceLinks,
            ...plan.crossUnitLinks,
          ].map((item) => item.id),
        },
      },
    });
  });
}

function printPlan(mode: Mode, plan: Awaited<ReturnType<typeof buildPlan>>) {
  const referenced = plan.contaminantProfessionals.filter(
    (item) =>
      item._count.appointments ||
      item._count.productSales ||
      item._count.commissions,
  );
  console.log(`mode=${mode}`);
  console.log(`target=${classifyDatabaseUrl()}`);
  console.log(`geovane_id=${plan.geovane.id}`);
  console.log(`professionals_to_inactivate=${plan.contaminantProfessionals.length}`);
  console.log(`referenced_professionals_preserved=${referenced.length}`);
  console.log(`canonical_links_to_remove=${plan.nonGeovaneCanonicalLinks.length}`);
  console.log(`inactive_service_links_to_remove=${plan.geovaneInactiveServiceLinks.length}`);
  console.log(`cross_unit_links_to_remove=${plan.crossUnitLinks.length}`);
  const byName = plan.contaminantProfessionals.reduce<Record<string, number>>((acc, item) => {
    acc[item.name] = (acc[item.name] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`professionals_by_name=${JSON.stringify(byName)}`);
}

async function main() {
  assertSafeLocalTarget();
  const mode = parseMode(process.argv.slice(2));
  const plan = await buildPlan();
  printPlan(mode, plan);
  if (mode === "apply") {
    await applyPlan(plan);
    const after = await buildPlan();
    printPlan("dry-run", after);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
