import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  CANONICAL_REAL_PRODUCTS,
  CANONICAL_REAL_SERVICES,
  CANONICAL_SERVICE_COMBINATION_RULES,
  buildCanonicalProvisionPlan,
  canonicalProductIds,
  canonicalServiceCombinationRuleIds,
  canonicalServiceIds,
} from "../src/application/canonical-catalog";

type Target = "local" | "test" | "staging" | "production" | "unknown";

type Options = {
  mode: "dry-run" | "apply";
  target: Target;
};

const prisma = new PrismaClient();

function parseOptions(argv: string[]): Options {
  let mode: Options["mode"] = "dry-run";
  let target: Target = "unknown";

  for (const arg of argv) {
    if (arg === "--dry-run") mode = "dry-run";
    else if (arg === "--apply") mode = "apply";
    else if (arg.startsWith("--target=")) {
      const raw = arg.slice("--target=".length).trim().toLowerCase();
      if (["local", "test", "staging", "production", "unknown"].includes(raw)) {
        target = raw as Target;
      } else {
        throw new Error(`Alvo invalido: ${raw}`);
      }
    } else {
      throw new Error(`Argumento invalido: ${arg}`);
    }
  }

  return { mode, target };
}

function classifyDatabaseUrl(): Target {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return "unknown";

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const database = url.pathname.replace(/^\//, "").toLowerCase();
    const decoded = decodeURIComponent(raw).toLowerCase();

    if (/(prod|production)/.test(decoded)) return "production";
    if (/(stag|staging|homolog|hml)/.test(decoded)) return "staging";
    if (["localhost", "127.0.0.1", "::1"].includes(host)) return "local";
    if (/(test|local|dev)/.test(database)) return "test";
    return "unknown";
  } catch {
    return "unknown";
  }
}

function assertSafeTarget(options: Options) {
  const actualTarget = classifyDatabaseUrl();
  const allowedTargets: Target[] = ["local", "test"];

  if (!allowedTargets.includes(options.target)) {
    throw new Error(`Alvo declarado bloqueado para provisionamento: ${options.target}`);
  }
  if (!allowedTargets.includes(actualTarget)) {
    throw new Error(`Alvo detectado bloqueado para provisionamento: ${actualTarget}`);
  }
}

async function readExistingCanonicals() {
  const [services, products, serviceCombinationRules] = await Promise.all([
    prisma.service.findMany({
      where: { id: { in: canonicalServiceIds() } },
      select: {
        id: true,
        businessId: true,
        name: true,
        description: true,
        category: true,
        price: true,
        durationMin: true,
        defaultCommissionRate: true,
        costEstimate: true,
        notes: true,
        active: true,
      },
    }),
    prisma.product.findMany({
      where: { id: { in: canonicalProductIds() } },
      select: {
        id: true,
        businessId: true,
        name: true,
        category: true,
        salePrice: true,
        costPrice: true,
        stockQty: true,
        minStockAlert: true,
        notes: true,
        active: true,
      },
    }),
    prisma.serviceCombinationRule.findMany({
      where: { id: { in: canonicalServiceCombinationRuleIds() } },
      include: { items: true },
    }),
  ]);

  return {
    services: services.map((item) => ({
      ...item,
      price: Number(item.price),
      defaultCommissionRate: Number(item.defaultCommissionRate),
      costEstimate: Number(item.costEstimate),
      description: item.description ?? "",
      category: item.category ?? "",
      notes: item.notes ?? "",
    })),
    products: products.map((item) => ({
      ...item,
      salePrice: Number(item.salePrice),
      costPrice: Number(item.costPrice),
      notes: item.notes ?? "",
    })),
    serviceCombinationRules: serviceCombinationRules.map((item) => ({
      id: item.id,
      unitId: item.unitId,
      serviceSetKey: item.serviceSetKey,
      label: item.label,
      effectiveDurationMin: item.effectiveDurationMin,
      active: item.active,
      items: item.items.map((ruleItem) => ({
        id: ruleItem.id,
        serviceId: ruleItem.serviceId,
        position: ruleItem.position ?? 0,
      })),
    })),
  };
}

function printPlan(options: Options, plan: ReturnType<typeof buildCanonicalProvisionPlan>) {
  console.log(`mode=${options.mode}`);
  console.log(`target=${options.target}`);
  console.log(`services_to_create=${plan.servicesToCreate.length}`);
  console.log(`products_to_create=${plan.productsToCreate.length}`);
  console.log(`service_combination_rules_to_create=${plan.serviceCombinationRulesToCreate.length}`);
  console.log(`services_matching=${plan.matchingServiceIds.length}`);
  console.log(`products_matching=${plan.matchingProductIds.length}`);
  console.log(`service_combination_rules_matching=${plan.matchingServiceCombinationRuleIds.length}`);
  console.log(`errors=${plan.errors.length}`);
  if (plan.servicesToCreate.length) {
    console.log(`service_ids_to_create=${plan.servicesToCreate.map((item) => item.id).join(",")}`);
  }
  if (plan.productsToCreate.length) {
    console.log(`product_ids_to_create=${plan.productsToCreate.map((item) => item.id).join(",")}`);
  }
  if (plan.serviceCombinationRulesToCreate.length) {
    console.log(`service_combination_rule_ids_to_create=${plan.serviceCombinationRulesToCreate.map((item) => item.id).join(",")}`);
  }
}

async function applyPlan(plan: ReturnType<typeof buildCanonicalProvisionPlan>) {
  await prisma.$transaction(async (tx) => {
    for (const service of plan.servicesToCreate) {
      await tx.service.create({
        data: {
          id: service.id,
          businessId: service.businessId,
          name: service.name,
          description: service.description,
          category: service.category,
          price: new Prisma.Decimal(service.price),
          durationMin: service.durationMin,
          defaultCommissionRate: new Prisma.Decimal(service.defaultCommissionRate),
          costEstimate: new Prisma.Decimal(service.costEstimate),
          notes: service.notes,
          active: service.active,
        },
      });
    }

    for (const product of plan.productsToCreate) {
      await tx.product.create({
        data: {
          id: product.id,
          businessId: product.businessId,
          name: product.name,
          category: product.category,
          salePrice: new Prisma.Decimal(product.salePrice),
          costPrice: new Prisma.Decimal(product.costPrice),
          stockQty: product.stockQty,
          minStockAlert: product.minStockAlert,
          notes: product.notes,
          active: product.active,
        },
      });
    }

    for (const rule of plan.serviceCombinationRulesToCreate) {
      await tx.serviceCombinationRule.create({
        data: {
          id: rule.id,
          unitId: rule.unitId,
          serviceSetKey: rule.serviceSetKey,
          label: rule.label,
          effectiveDurationMin: rule.effectiveDurationMin,
          active: rule.active,
          items: {
            create: rule.items.map((item) => ({
              id: item.id,
              serviceId: item.serviceId,
              position: item.position,
            })),
          },
        },
      });
    }
  });
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  assertSafeTarget(options);

  const existing = await readExistingCanonicals();
  const plan = buildCanonicalProvisionPlan({
    existingServices: existing.services,
    existingProducts: existing.products,
    existingServiceCombinationRules: existing.serviceCombinationRules,
  });

  printPlan(options, plan);

  if (plan.errors.length) {
    for (const error of plan.errors) console.error(`divergence=${error}`);
    throw new Error("Canonico existente divergente; provisionamento bloqueado");
  }

  if (options.mode === "dry-run") return;

  await applyPlan(plan);

  const after = await readExistingCanonicals();
  const afterPlan = buildCanonicalProvisionPlan({
    existingServices: after.services,
    existingProducts: after.products,
    existingServiceCombinationRules: after.serviceCombinationRules,
  });
  if (
    afterPlan.errors.length ||
    afterPlan.servicesToCreate.length ||
    afterPlan.productsToCreate.length ||
    afterPlan.serviceCombinationRulesToCreate.length
  ) {
    throw new Error("Validacao pos-apply falhou");
  }

  console.log("apply_result=ok");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
