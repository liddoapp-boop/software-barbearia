import process from "node:process";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

dotenv.config({ quiet: true });

const EXPECTED_DB = "barbearia_pilot";
const EXPECTED_MIGRATIONS = 21;

const UNIT_ID = "unit-geovane-borges";
const PROFESSIONAL_ID = "pro-geovane-borges";

const services = [
  { id: "svc-geovane-corte", name: "Corte", category: "CORTE", price: "30.00", durationMin: 30 },
  { id: "svc-geovane-barba", name: "Barba", category: "BARBA", price: "20.00", durationMin: 30 },
  { id: "svc-geovane-hidratacao", name: "Hidratacao", category: "TRATAMENTO", price: "20.00", durationMin: 30 },
  { id: "svc-geovane-luzes", name: "Luzes", category: "QUIMICA", price: "50.00", durationMin: 60 },
  { id: "svc-geovane-pigmentacao", name: "Pigmentacao", category: "QUIMICA", price: "45.00", durationMin: 60 },
];

const products = [
  { id: "prd-geovane-gel", name: "Gel", category: "Finalizacao", salePrice: "5.50", costPrice: "0.00" },
  { id: "prd-geovane-pomada", name: "Pomada", category: "Finalizacao", salePrice: "7.50", costPrice: "0.00" },
  { id: "prd-geovane-bucha", name: "Bucha", category: "Acessorio", salePrice: "12.50", costPrice: "0.00" },
  { id: "prd-geovane-shampoo", name: "Shampoo", category: "Cabelo", salePrice: "7.50", costPrice: "0.00" },
  { id: "prd-geovane-condicionador", name: "Condicionador", category: "Cabelo", salePrice: "7.50", costPrice: "0.00" },
  { id: "prd-geovane-mascara", name: "Mascara", category: "Tratamento", salePrice: "7.50", costPrice: "0.00" },
];

const paymentMethods = [
  { id: "pay-geovane-dinheiro", name: "Dinheiro", isDefault: true },
  { id: "pay-geovane-pix", name: "Pix", isDefault: false },
];

const businessHours = [
  { dayOfWeek: 0, opensAt: null, closesAt: null, breakStart: null, breakEnd: null, isClosed: true },
  { dayOfWeek: 1, opensAt: "09:00", closesAt: "19:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false },
  { dayOfWeek: 2, opensAt: "09:00", closesAt: "19:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false },
  { dayOfWeek: 3, opensAt: "09:00", closesAt: "19:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false },
  { dayOfWeek: 4, opensAt: "09:00", closesAt: "19:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false },
  { dayOfWeek: 5, opensAt: "09:00", closesAt: "19:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false },
  { dayOfWeek: 6, opensAt: "09:00", closesAt: "14:00", breakStart: null, breakEnd: null, isClosed: false },
];

function parseDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL ausente");
  const url = new URL(raw);
  const database = url.pathname.replace(/^\//, "");
  const host = url.hostname.toLowerCase();
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error("Provisionamento recusado: host precisa ser local");
  }
  if (database !== EXPECTED_DB) {
    throw new Error(`Provisionamento recusado: banco deve ser ${EXPECTED_DB}`);
  }
  if (database === "barbearia") {
    throw new Error("Provisionamento recusado: banco barbearia e proibido");
  }
  return { host, database };
}

function serviceSetKey(serviceIds) {
  const canonical = JSON.stringify([...new Set(serviceIds)].sort());
  return createHash("sha256").update(canonical).digest("hex");
}

async function assertSchemaReady(prisma) {
  const migrations = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL
  `;
  const failed = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM "_prisma_migrations"
    WHERE finished_at IS NULL AND rolled_back_at IS NULL
  `;
  const appliedCount = Number(migrations[0]?.count ?? 0);
  const failedCount = Number(failed[0]?.count ?? 0);
  if (appliedCount !== EXPECTED_MIGRATIONS || failedCount !== 0) {
    throw new Error(`Schema nao esta pronto: migrations=${appliedCount}, falhas=${failedCount}`);
  }
}

async function assertNoConflicts(prisma) {
  const [badUnits, badUsers, smokeClients] = await Promise.all([
    prisma.unit.findMany({
      where: { OR: [{ name: "Unidade Teste" }, { name: "Unidade Padrao" }, { id: "unit-01" }] },
      select: { id: true, name: true },
    }),
    prisma.user.count({
      where: {
        OR: [
          { email: { endsWith: "@barbearia.local" } },
          { email: { contains: "example.com" } },
        ],
      },
    }),
    prisma.client.count({
      where: {
        OR: [
          { fullName: { contains: "Teste" } },
          { fullName: { contains: "Smoke" } },
          { fullName: { contains: "VALIDACAO" } },
        ],
      },
    }),
  ]);
  if (badUnits.length) {
    throw new Error(`Dados conflitantes de unidade encontrados: ${badUnits.map((item) => item.id).join(", ")}`);
  }
  if (badUsers > 0) {
    throw new Error("Usuarios seed/dev encontrados; provisionamento recusado");
  }
  if (smokeClients > 0) {
    throw new Error("Clientes de teste/smoke encontrados; provisionamento recusado");
  }
}

function printSummary(target) {
  console.log("Provisionamento Geovane piloto");
  console.log(`Banco: ${target.host}/${target.database}`);
  console.log("Serao aplicados dados confirmados:");
  console.log("- 1 unidade Barbearia Geovane Borges");
  console.log("- 1 profissional Geovane Borges");
  console.log(`- ${businessHours.length} linhas de horario`);
  console.log(`- ${services.length} servicos e 1 regra Corte + Barba`);
  console.log(`- ${products.length} produtos com preco confirmado; estoque fica 0 por ausencia de quantidade real`);
  console.log(`- ${paymentMethods.length} formas de pagamento confirmadas`);
  console.log("Owner nao sera criado sem e-mail e credencial reais.");
}

async function main() {
  const target = parseDatabaseUrl();
  printSummary(target);

  const prisma = new PrismaClient();
  try {
    await assertSchemaReady(prisma);
    await assertNoConflicts(prisma);

    await prisma.$transaction(async (tx) => {
      await tx.unit.upsert({
        where: { id: UNIT_ID },
        update: { name: "Barbearia Geovane Borges", timezone: "America/Sao_Paulo" },
        create: { id: UNIT_ID, name: "Barbearia Geovane Borges", timezone: "America/Sao_Paulo" },
      });

      await tx.businessSettings.upsert({
        where: { unitId: UNIT_ID },
        update: {
          businessName: "Barbearia Geovane Borges",
          segment: "barbearia",
          displayName: "Barbearia Geovane Borges",
          defaultAppointmentDuration: 30,
          minimumAdvanceMinutes: 30,
          bufferBetweenAppointmentsMinutes: 0,
          allowWalkIns: true,
          allowOutOfHoursAppointments: false,
          allowOverbooking: false,
        },
        create: {
          id: "settings-geovane-borges",
          unitId: UNIT_ID,
          businessName: "Barbearia Geovane Borges",
          segment: "barbearia",
          displayName: "Barbearia Geovane Borges",
          defaultAppointmentDuration: 30,
          minimumAdvanceMinutes: 30,
          bufferBetweenAppointmentsMinutes: 0,
          allowWalkIns: true,
          allowOutOfHoursAppointments: false,
          allowOverbooking: false,
        },
      });

      await tx.professional.upsert({
        where: { id: PROFESSIONAL_ID },
        update: { businessId: UNIT_ID, name: "Geovane Borges", active: true },
        create: { id: PROFESSIONAL_ID, businessId: UNIT_ID, name: "Geovane Borges", active: true },
      });

      for (const hour of businessHours) {
        await tx.businessHour.upsert({
          where: { unitId_dayOfWeek: { unitId: UNIT_ID, dayOfWeek: hour.dayOfWeek } },
          update: hour,
          create: { id: `hours-geovane-${hour.dayOfWeek}`, unitId: UNIT_ID, ...hour },
        });
      }

      for (const service of services) {
        await tx.service.upsert({
          where: { id: service.id },
          update: {
            businessId: UNIT_ID,
            name: service.name,
            category: service.category,
            price: service.price,
            durationMin: service.durationMin,
            costEstimate: "0.00",
            active: true,
            notes: "piloto-geovane-dado-confirmado",
          },
          create: {
            ...service,
            businessId: UNIT_ID,
            costEstimate: "0.00",
            active: true,
            notes: "piloto-geovane-dado-confirmado",
          },
        });
        await tx.serviceProfessional.upsert({
          where: {
            serviceId_professionalId: {
              serviceId: service.id,
              professionalId: PROFESSIONAL_ID,
            },
          },
          update: {},
          create: {
            id: `svcpro-${service.id}-${PROFESSIONAL_ID}`,
            serviceId: service.id,
            professionalId: PROFESSIONAL_ID,
          },
        });
      }

      const comboRuleId = "rule-geovane-corte-barba-45";
      await tx.serviceCombinationRule.upsert({
        where: { id: comboRuleId },
        update: {
          unitId: UNIT_ID,
          serviceSetKey: serviceSetKey(["svc-geovane-corte", "svc-geovane-barba"]),
          label: "Corte + Barba - 45 min",
          effectiveDurationMin: 45,
          active: true,
        },
        create: {
          id: comboRuleId,
          unitId: UNIT_ID,
          serviceSetKey: serviceSetKey(["svc-geovane-corte", "svc-geovane-barba"]),
          label: "Corte + Barba - 45 min",
          effectiveDurationMin: 45,
          active: true,
        },
      });
      await tx.serviceCombinationRuleItem.upsert({
        where: { ruleId_serviceId: { ruleId: comboRuleId, serviceId: "svc-geovane-corte" } },
        update: { position: 0 },
        create: { id: `${comboRuleId}-corte`, ruleId: comboRuleId, serviceId: "svc-geovane-corte", position: 0 },
      });
      await tx.serviceCombinationRuleItem.upsert({
        where: { ruleId_serviceId: { ruleId: comboRuleId, serviceId: "svc-geovane-barba" } },
        update: { position: 1 },
        create: { id: `${comboRuleId}-barba`, ruleId: comboRuleId, serviceId: "svc-geovane-barba", position: 1 },
      });

      for (const product of products) {
        await tx.product.upsert({
          where: { id: product.id },
          update: {
            businessId: UNIT_ID,
            name: product.name,
            category: product.category,
            salePrice: product.salePrice,
            costPrice: product.costPrice,
            stockQty: 0,
            minStockAlert: 0,
            active: true,
            notes: "piloto-geovane-preco-confirmado-estoque-real-ausente",
          },
          create: {
            ...product,
            businessId: UNIT_ID,
            stockQty: 0,
            minStockAlert: 0,
            active: true,
            notes: "piloto-geovane-preco-confirmado-estoque-real-ausente",
          },
        });
      }

      for (const method of paymentMethods) {
        await tx.paymentMethod.upsert({
          where: { id: method.id },
          update: { unitId: UNIT_ID, name: method.name, isActive: true, isDefault: method.isDefault },
          create: { ...method, unitId: UNIT_ID, isActive: true },
        });
      }
    });

    const counts = await Promise.all([
      prisma.unit.count(),
      prisma.professional.count({ where: { businessId: UNIT_ID } }),
      prisma.service.count({ where: { businessId: UNIT_ID } }),
      prisma.product.count({ where: { businessId: UNIT_ID } }),
      prisma.businessHour.count({ where: { unitId: UNIT_ID } }),
      prisma.paymentMethod.count({ where: { unitId: UNIT_ID } }),
      prisma.user.count(),
    ]);
    console.log("Resumo final:");
    console.log(`units=${counts[0]}, professionals=${counts[1]}, services=${counts[2]}, products=${counts[3]}, hours=${counts[4]}, payments=${counts[5]}, users=${counts[6]}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
