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
const CANONICAL_UNIT_ID = "unit-01";
const CANONICAL_BUSINESS_HOURS = [
  { dayOfWeek: 0, opensAt: null, closesAt: null, breakStart: null, breakEnd: null, isClosed: true },
  { dayOfWeek: 1, opensAt: "08:00", closesAt: "20:00", breakStart: null, breakEnd: null, isClosed: false },
  { dayOfWeek: 2, opensAt: "08:00", closesAt: "20:00", breakStart: null, breakEnd: null, isClosed: false },
  { dayOfWeek: 3, opensAt: "08:00", closesAt: "20:00", breakStart: null, breakEnd: null, isClosed: false },
  { dayOfWeek: 4, opensAt: "08:00", closesAt: "20:00", breakStart: null, breakEnd: null, isClosed: false },
  { dayOfWeek: 5, opensAt: "08:00", closesAt: "20:00", breakStart: null, breakEnd: null, isClosed: false },
  { dayOfWeek: 6, opensAt: "08:00", closesAt: "14:00", breakStart: null, breakEnd: null, isClosed: false },
] as const;

type ExistingProductRow = {
  id: string;
  businessId: string;
  name: string;
  category: string;
  salePrice: number;
  costPrice: number;
  stockQty: number;
  minStockAlert: number;
  notes: string;
  active: boolean;
};

type ProductProvisionUpdate = {
  id: string;
  canonicalId: string;
  data: Omit<(typeof CANONICAL_REAL_PRODUCTS)[number], "id" | "stockQty">;
  preservedStockQty: number;
};

type ProductProvisionPlan = {
  productsToCreate: typeof CANONICAL_REAL_PRODUCTS;
  productsToUpdate: ProductProvisionUpdate[];
  matchingProductIds: string[];
  errors: string[];
};

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
      where: {
        businessId: CANONICAL_UNIT_ID,
        OR: [
          { id: { in: canonicalProductIds() } },
          { name: { in: CANONICAL_REAL_PRODUCTS.map((item) => item.name) } },
        ],
      },
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

function normalizeProductName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function productValuesMatch(
  existing: ExistingProductRow,
  expected: (typeof CANONICAL_REAL_PRODUCTS)[number],
) {
  return (
    existing.businessId === expected.businessId &&
    existing.name === expected.name &&
    existing.category === expected.category &&
    Number(existing.salePrice) === expected.salePrice &&
    Number(existing.costPrice) === expected.costPrice &&
    Number(existing.minStockAlert) === expected.minStockAlert &&
    existing.notes === expected.notes &&
    existing.active === expected.active
  );
}

function buildProductProvisionPlan(existingProducts: ExistingProductRow[]): ProductProvisionPlan {
  const byId = new Map(existingProducts.map((item) => [item.id, item]));
  const byName = new Map(existingProducts.map((item) => [normalizeProductName(item.name), item]));
  const plan: ProductProvisionPlan = {
    productsToCreate: [],
    productsToUpdate: [],
    matchingProductIds: [],
    errors: [],
  };
  const matchedExistingIds = new Set<string>();

  for (const product of CANONICAL_REAL_PRODUCTS) {
    const existing = byId.get(product.id) ?? byName.get(normalizeProductName(product.name));
    if (!existing) {
      plan.productsToCreate.push(product);
      continue;
    }
    if (matchedExistingIds.has(existing.id)) {
      plan.errors.push(`${product.id}.duplicate_name produto existente ja usado: ${existing.id}`);
      continue;
    }
    matchedExistingIds.add(existing.id);
    if (productValuesMatch(existing, product)) {
      plan.matchingProductIds.push(existing.id);
      continue;
    }
    const { id: _id, stockQty: _stockQty, ...data } = product;
    plan.productsToUpdate.push({
      id: existing.id,
      canonicalId: product.id,
      data,
      preservedStockQty: existing.stockQty,
    });
  }

  return plan;
}

function printPlan(
  options: Options,
  plan: ReturnType<typeof buildCanonicalProvisionPlan>,
  productPlan: ProductProvisionPlan,
) {
  console.log(`mode=${options.mode}`);
  console.log(`target=${options.target}`);
  console.log(`services_to_create=${plan.servicesToCreate.length}`);
  console.log(`services_to_update=${plan.servicesToUpdate.length}`);
  console.log(`products_to_create=${productPlan.productsToCreate.length}`);
  console.log(`products_to_update=${productPlan.productsToUpdate.length}`);
  console.log(`service_combination_rules_to_create=${plan.serviceCombinationRulesToCreate.length}`);
  console.log(`services_matching=${plan.matchingServiceIds.length}`);
  console.log(`products_matching=${productPlan.matchingProductIds.length}`);
  console.log(`service_combination_rules_matching=${plan.matchingServiceCombinationRuleIds.length}`);
  console.log(`errors=${plan.errors.length + productPlan.errors.length}`);
  if (plan.servicesToCreate.length) {
    console.log(`service_ids_to_create=${plan.servicesToCreate.map((item) => item.id).join(",")}`);
  }
  if (plan.servicesToUpdate.length) {
    console.log(`service_ids_to_update=${plan.servicesToUpdate.map((item) => item.id).join(",")}`);
  }
  if (productPlan.productsToCreate.length) {
    console.log(`product_ids_to_create=${productPlan.productsToCreate.map((item) => item.id).join(",")}`);
  }
  if (productPlan.productsToUpdate.length) {
    console.log(`product_ids_to_update=${productPlan.productsToUpdate.map((item) => item.id).join(",")}`);
  }
  if (plan.serviceCombinationRulesToCreate.length) {
    console.log(`service_combination_rule_ids_to_create=${plan.serviceCombinationRulesToCreate.map((item) => item.id).join(",")}`);
  }
}

async function applyPlan(
  plan: ReturnType<typeof buildCanonicalProvisionPlan>,
  productPlan: ProductProvisionPlan,
) {
  await prisma.$transaction(async (tx) => {
    const geovane = await tx.professional.findFirst({
      where: {
        businessId: CANONICAL_UNIT_ID,
        OR: [{ id: "pro-geovane-borges" }, { name: "Geovane Borges" }],
      },
      orderBy: [{ id: "asc" }],
      select: { id: true },
    });
    if (!geovane) {
      throw new Error("Geovane Borges nao encontrado na unidade canonica");
    }
    await tx.professional.update({
      where: { id: geovane.id },
      data: { name: "Geovane Borges", active: true },
    });

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

    for (const product of productPlan.productsToCreate) {
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

    for (const service of plan.servicesToUpdate) {
      await tx.service.update({
        where: { id: service.id },
        data: {
          businessId: service.data.businessId,
          name: service.data.name,
          description: service.data.description,
          category: service.data.category,
          price: new Prisma.Decimal(service.data.price),
          durationMin: service.data.durationMin,
          defaultCommissionRate: new Prisma.Decimal(service.data.defaultCommissionRate),
          costEstimate: new Prisma.Decimal(service.data.costEstimate),
          notes: service.data.notes,
          active: service.data.active,
        },
      });
    }

    for (const product of productPlan.productsToUpdate) {
      await tx.product.update({
        where: { id: product.id },
        data: {
          businessId: product.data.businessId,
          name: product.data.name,
          category: product.data.category,
          salePrice: new Prisma.Decimal(product.data.salePrice),
          costPrice: new Prisma.Decimal(product.data.costPrice),
          minStockAlert: product.data.minStockAlert,
          notes: product.data.notes,
          active: product.data.active,
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

    await tx.service.updateMany({
      where: {
        businessId: CANONICAL_UNIT_ID,
        active: true,
        id: { notIn: canonicalServiceIds() },
      },
      data: { active: false },
    });

    await tx.serviceProfessional.deleteMany({
      where: {
        serviceId: { in: canonicalServiceIds() },
        professionalId: { not: geovane.id },
      },
    });
    await tx.serviceProfessional.deleteMany({
      where: {
        professionalId: geovane.id,
        service: {
          businessId: CANONICAL_UNIT_ID,
          active: false,
        },
      },
    });
    for (const serviceId of canonicalServiceIds()) {
      await tx.serviceProfessional.upsert({
        where: {
          serviceId_professionalId: {
            serviceId,
            professionalId: geovane.id,
          },
        },
        update: {},
        create: {
          id: `svc-pro-${serviceId}-${geovane.id}`,
          serviceId,
          professionalId: geovane.id,
        },
      });
    }
    await tx.commissionRule.deleteMany({ where: { professionalId: geovane.id } });
    await tx.businessCommissionRule.deleteMany({ where: { professionalId: geovane.id } });

    for (const hour of CANONICAL_BUSINESS_HOURS) {
      const existing = await tx.businessHour.findFirst({
        where: { unitId: CANONICAL_UNIT_ID, dayOfWeek: hour.dayOfWeek },
        select: { id: true },
      });
      const data = {
        opensAt: hour.opensAt,
        closesAt: hour.closesAt,
        breakStart: hour.breakStart,
        breakEnd: hour.breakEnd,
        isClosed: hour.isClosed,
      };
      if (existing) {
        await tx.businessHour.update({ where: { id: existing.id }, data });
      } else {
        await tx.businessHour.create({
          data: {
            id: `bh-${CANONICAL_UNIT_ID}-${hour.dayOfWeek}`,
            unitId: CANONICAL_UNIT_ID,
            dayOfWeek: hour.dayOfWeek,
            ...data,
          },
        });
      }
    }

    await tx.businessSettings.upsert({
      where: { unitId: CANONICAL_UNIT_ID },
      update: { bufferBetweenAppointmentsMinutes: 0 },
      create: {
        id: `settings-${CANONICAL_UNIT_ID}`,
        unitId: CANONICAL_UNIT_ID,
        businessName: "Barbearia Premium - Unidade Centro",
        segment: "barbearia",
        bufferBetweenAppointmentsMinutes: 0,
      },
    });
  });
}

async function assertOperationalContract() {
  const [activeServices, hours, settings, geovane] = await Promise.all([
    prisma.service.findMany({
      where: { businessId: CANONICAL_UNIT_ID, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, price: true, durationMin: true },
    }),
    prisma.businessHour.findMany({
      where: { unitId: CANONICAL_UNIT_ID },
      orderBy: { dayOfWeek: "asc" },
      select: {
        dayOfWeek: true,
        opensAt: true,
        closesAt: true,
        breakStart: true,
        breakEnd: true,
        isClosed: true,
      },
    }),
    prisma.businessSettings.findUnique({
      where: { unitId: CANONICAL_UNIT_ID },
      select: { bufferBetweenAppointmentsMinutes: true },
    }),
    prisma.professional.findFirst({
      where: { businessId: CANONICAL_UNIT_ID, name: "Geovane Borges", active: true },
      select: {
        id: true,
        services: {
          where: { serviceId: { in: canonicalServiceIds() } },
          select: { serviceId: true },
        },
        commissionRules: { select: { id: true } },
        businessCommissionRules: { select: { id: true } },
      },
    }),
  ]);
  const activeServiceIds = activeServices.map((item) => item.id).sort();
  const expectedServiceIds = canonicalServiceIds().sort();
  if (JSON.stringify(activeServiceIds) !== JSON.stringify(expectedServiceIds)) {
    throw new Error(`Catalogo ativo divergente: ${activeServiceIds.join(",")}`);
  }
  for (const expected of CANONICAL_REAL_SERVICES) {
    const service = activeServices.find((item) => item.id === expected.id);
    if (
      !service ||
      service.name !== expected.name ||
      Number(service.price) !== expected.price ||
      service.durationMin !== expected.durationMin
    ) {
      throw new Error(`Servico operacional divergente: ${expected.id}`);
    }
  }
  for (const expected of CANONICAL_BUSINESS_HOURS) {
    const hour = hours.find((item) => item.dayOfWeek === expected.dayOfWeek);
    if (
      !hour ||
      hour.opensAt !== expected.opensAt ||
      hour.closesAt !== expected.closesAt ||
      hour.breakStart !== expected.breakStart ||
      hour.breakEnd !== expected.breakEnd ||
      hour.isClosed !== expected.isClosed
    ) {
      throw new Error(`BusinessHour divergente: dayOfWeek=${expected.dayOfWeek}`);
    }
  }
  if (!settings || settings.bufferBetweenAppointmentsMinutes !== 0) {
    throw new Error("BusinessSettings divergente: bufferBetweenAppointmentsMinutes");
  }
  if (!geovane) {
    throw new Error("Geovane Borges ativo nao encontrado na unidade canonica");
  }
  const linkedServiceIds = geovane.services.map((item) => item.serviceId).sort();
  if (JSON.stringify(linkedServiceIds) !== JSON.stringify(expectedServiceIds)) {
    throw new Error(`Vinculos de Geovane divergentes: ${linkedServiceIds.join(",")}`);
  }
  if (geovane.commissionRules.length || geovane.businessCommissionRules.length) {
    throw new Error("Geovane possui regras de comissao ativas no cadastro");
  }
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
  const productPlan = buildProductProvisionPlan(existing.products);
  plan.productsToCreate = productPlan.productsToCreate;
  plan.matchingProductIds = productPlan.matchingProductIds;
  plan.errors = plan.errors.filter((item) => !item.startsWith("canon-prd-"));

  printPlan(options, plan, productPlan);

  if (plan.errors.length || productPlan.errors.length) {
    for (const error of plan.errors) console.error(`divergence=${error}`);
    for (const error of productPlan.errors) console.error(`divergence=${error}`);
    throw new Error("Canonico existente divergente; provisionamento bloqueado");
  }

  if (options.mode === "dry-run") return;

  await applyPlan(plan, productPlan);

  const after = await readExistingCanonicals();
  const afterProductPlan = buildProductProvisionPlan(after.products);
  const afterPlan = buildCanonicalProvisionPlan({
    existingServices: after.services,
    existingProducts: after.products,
    existingServiceCombinationRules: after.serviceCombinationRules,
  });
  afterPlan.productsToCreate = afterProductPlan.productsToCreate;
  afterPlan.matchingProductIds = afterProductPlan.matchingProductIds;
  afterPlan.errors = afterPlan.errors.filter((item) => !item.startsWith("canon-prd-"));
  if (
    afterPlan.errors.length ||
    afterProductPlan.errors.length ||
    afterPlan.servicesToCreate.length ||
    afterPlan.servicesToUpdate.length ||
    afterProductPlan.productsToCreate.length ||
    afterProductPlan.productsToUpdate.length ||
    afterPlan.serviceCombinationRulesToCreate.length
  ) {
    throw new Error("Validacao pos-apply falhou");
  }
  await assertOperationalContract();

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
