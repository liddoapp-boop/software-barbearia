import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/http/security";

const prisma = new PrismaClient();

const SENSITIVE_DATABASE_MARKERS = [
  "prod",
  "production",
  "render",
  "railway",
];

type SeedUserRole = "owner" | "recepcao" | "profissional";

type SeedUser = {
  id: string;
  email: string;
  password: string;
  name: string;
  role: SeedUserRole;
  unitIds: string[];
};

const OFFICIAL_PRODUCTS = [
  { id: "prd-gel", name: "Gel", category: "Finalizacao", salePrice: 10, costPrice: 5.5, stockQty: 30 },
  { id: "prd-pomada", name: "Pomada", category: "Finalizacao", salePrice: 25, costPrice: 7.5, stockQty: 10 },
  { id: "prd-bucha-nudread", name: "Bucha Nudread", category: "Dread", salePrice: 25, costPrice: 12.5, stockQty: 3 },
  { id: "prd-oleo-barba", name: "Oleo para Barba", category: "Barba", salePrice: 35, costPrice: 13, stockQty: 4 },
  { id: "prd-shampoo", name: "Shampoo", category: "Cabelo", salePrice: 25, costPrice: 7.5, stockQty: 10 },
  { id: "prd-condicionador", name: "Condicionador", category: "Cabelo", salePrice: 25, costPrice: 7.5, stockQty: 10 },
  { id: "prd-mascara-hidratacao", name: "Mascara de Hidratacao", category: "Tratamento", salePrice: 30, costPrice: 7.5, stockQty: 10 },
];

function requireProductionEnv(name: string) {
  const value = process.env[name]?.trim();
  if (process.env.NODE_ENV === "production" && !value) {
    throw new Error(`${name} e obrigatorio para rodar seed em producao`);
  }
  return value;
}

function isLocalDatabaseUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function assertSeedIsAllowed() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("prisma/seed.ts e destrutivo e nao pode rodar com NODE_ENV=production");
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return;

  const normalizedUrl = decodeURIComponent(databaseUrl).toLowerCase();
  const hasSensitiveMarker = SENSITIVE_DATABASE_MARKERS.some((marker) =>
    normalizedUrl.includes(marker),
  );
  const allowDestructiveSeed = process.env.ALLOW_DESTRUCTIVE_SEED === "true";
  if (hasSensitiveMarker && !allowDestructiveSeed) {
    throw new Error(
      "DATABASE_URL parece sensivel; defina ALLOW_DESTRUCTIVE_SEED=true apenas para base isolada de dev/test",
    );
  }

  if (!isLocalDatabaseUrl(databaseUrl) && !allowDestructiveSeed) {
    throw new Error(
      "Seed destrutivo em banco nao-local exige ALLOW_DESTRUCTIVE_SEED=true e base isolada",
    );
  }
}

async function main() {
  assertSeedIsAllowed();

  // Limpa dados operacionais para iniciar base zerada.
  await prisma.billingSubscriptionEvent.deleteMany();
  await prisma.integrationWebhookLog.deleteMany();
  await prisma.retentionScoreSnapshot.deleteMany();
  await prisma.automationExecution.deleteMany();
  await prisma.automationRule.deleteMany();
  await prisma.retentionEvent.deleteMany();
  await prisma.retentionCase.deleteMany();
  await prisma.clientSubscription.deleteMany();
  await prisma.subscriptionPlan.deleteMany();
  await prisma.clientPackage.deleteMany();
  await prisma.servicePackage.deleteMany();
  await prisma.loyaltyLedger.deleteMany();
  await prisma.loyaltyProgram.deleteMany();
  await prisma.appointmentHistory.deleteMany();
  await prisma.commissionEntry.deleteMany();
  await prisma.financialEntry.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.appointmentServiceItem.deleteMany();
  await prisma.serviceCombinationRuleItem.deleteMany();
  await prisma.serviceCombinationRule.deleteMany();
  await prisma.serviceProfessional.deleteMany();
  await prisma.serviceStockConsumption.deleteMany();
  await prisma.productSaleItem.deleteMany();
  await prisma.productSale.deleteMany();
  await prisma.appointment.deleteMany();

  await prisma.unit.upsert({
    where: { id: "unit-01" },
    update: {},
    create: {
      id: "unit-01",
      name: "Barbearia Premium - Unidade Centro",
      timezone: "America/Sao_Paulo",
    },
  });
  await prisma.unit.upsert({
    where: { id: "unit-02" },
    update: {
      name: "Barbearia Premium - Unidade Zona Sul",
    },
    create: {
      id: "unit-02",
      name: "Barbearia Premium - Unidade Zona Sul",
      timezone: "America/Sao_Paulo",
    },
  });

  const seedOwnerEmail = requireProductionEnv("SEED_OWNER_EMAIL") ?? "owner@barbearia.local";
  const seedOwnerPassword = requireProductionEnv("SEED_OWNER_PASSWORD") ?? "owner123";
  const seedOwnerUnitIds = (process.env.SEED_OWNER_UNIT_IDS ?? "unit-01,unit-02")
    .split(",")
    .map((unitId: string) => unitId.trim())
    .filter(Boolean);
  const defaultUsers: SeedUser[] =
    process.env.NODE_ENV === "production"
      ? [
          {
            id: process.env.SEED_OWNER_ID ?? "usr-owner",
            email: seedOwnerEmail,
            password: seedOwnerPassword,
            name: process.env.SEED_OWNER_NAME ?? "Dono",
            role: "owner",
            unitIds: seedOwnerUnitIds.length ? seedOwnerUnitIds : ["unit-01"],
          },
        ]
      : [
          {
            id: "usr-owner",
            email: "owner@barbearia.local",
            password: "owner123",
            name: "Dono",
            role: "owner",
            unitIds: ["unit-01", "unit-02"],
          },
          {
            id: "usr-recepcao",
            email: "recepcao@barbearia.local",
            password: "recepcao123",
            name: "Recepcao",
            role: "recepcao",
            unitIds: ["unit-01"],
          },
          {
            id: "usr-profissional",
            email: "profissional@barbearia.local",
            password: "profissional123",
            name: "Profissional",
            role: "profissional",
            unitIds: ["unit-01"],
          },
        ];

  for (const user of defaultUsers) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        id: user.id,
        name: user.name,
        role: user.role,
        isActive: true,
      },
      create: {
        id: user.id,
        email: user.email,
        passwordHash: hashPassword(user.password),
        name: user.name,
        role: user.role,
        isActive: true,
      },
    });

    for (const unitId of user.unitIds) {
      await prisma.userUnitAccess.upsert({
        where: {
          userId_unitId: {
            userId: user.id,
            unitId,
          },
        },
        update: {
          role: user.role,
          isActive: true,
        },
        create: {
          id: `access-${user.id}-${unitId}`,
          userId: user.id,
          unitId,
          role: user.role,
          isActive: true,
        },
      });
    }
  }

  await prisma.service.upsert({
    where: { id: "svc-corte" },
    update: {
      businessId: "unit-01",
      description: "Corte com acabamento premium e finalizacao personalizada.",
      category: "CORTE",
      price: 75,
      costEstimate: 12,
      durationMin: 45,
      defaultCommissionRate: 0,
      notes: "",
      active: true,
    },
    create: {
      id: "svc-corte",
      businessId: "unit-01",
      name: "Corte Premium",
      description: "Corte com acabamento premium e finalizacao personalizada.",
      category: "CORTE",
      price: 75,
      durationMin: 45,
      defaultCommissionRate: 0,
      costEstimate: 12,
      notes: "",
      active: true,
    },
  });

  await prisma.service.upsert({
    where: { id: "svc-barba" },
    update: {
      businessId: "unit-01",
      description: "Modelagem e hidratacao de barba com toalha quente.",
      category: "BARBA",
      price: 55,
      costEstimate: 10,
      durationMin: 35,
      defaultCommissionRate: 0,
      notes: "",
      active: true,
    },
    create: {
      id: "svc-barba",
      businessId: "unit-01",
      name: "Barba Terapia",
      description: "Modelagem e hidratacao de barba com toalha quente.",
      category: "BARBA",
      price: 55,
      durationMin: 35,
      defaultCommissionRate: 0,
      costEstimate: 10,
      notes: "",
      active: true,
    },
  });

  await prisma.professional.upsert({
    where: { id: "pro-01" },
    update: {
      businessId: "unit-01",
      name: "Geovane Borges",
      active: true,
    },
    create: {
      id: "pro-01",
      businessId: "unit-01",
      name: "Geovane Borges",
      active: true,
    },
  });

  await prisma.professional.deleteMany({
    where: {
      id: { not: "pro-01" },
    },
  });

  await prisma.serviceProfessional.createMany({
    data: [
      { id: "svc-pro-svc-corte-pro-01", serviceId: "svc-corte", professionalId: "pro-01" },
      { id: "svc-pro-svc-barba-pro-01", serviceId: "svc-barba", professionalId: "pro-01" },
    ],
    skipDuplicates: true,
  });
  await prisma.commissionRule.deleteMany({
    where: { professionalId: "pro-01" },
  });

  await prisma.client.upsert({
    where: { id: "cli-01" },
    update: {},
    create: {
      id: "cli-01",
      fullName: "Joao Santos",
      phone: "11999999999",
      preferredProfessionalId: "pro-01",
      tags: ["RECURRING"],
    },
  });
  await prisma.client.upsert({
    where: { id: "cli-02" },
    update: {},
    create: {
      id: "cli-02",
      fullName: "Carlos Silva",
      phone: "11888888888",
      tags: ["NEW"],
    },
  });

  for (const product of OFFICIAL_PRODUCTS) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: {
        businessId: "unit-01",
        name: product.name,
        category: product.category,
        salePrice: product.salePrice,
        costPrice: product.costPrice,
        stockQty: product.stockQty,
        minStockAlert: 0,
        notes: "catalogo-real-geovane-seed",
        active: true,
      },
      create: {
        id: product.id,
        businessId: "unit-01",
        name: product.name,
        category: product.category,
        salePrice: product.salePrice,
        costPrice: product.costPrice,
        stockQty: product.stockQty,
        minStockAlert: 0,
        notes: "catalogo-real-geovane-seed",
        active: true,
      },
    });
  }

  await prisma.serviceStockConsumption.createMany({
    data: [
      {
        id: "cons-unit-01-svc-corte-prd-pomada",
        unitId: "unit-01",
        serviceId: "svc-corte",
        productId: "prd-pomada",
        quantityPerService: 0.2,
        wastePct: 5,
        isCritical: true,
      },
      {
        id: "cons-unit-01-svc-barba-prd-oleo",
        unitId: "unit-01",
        serviceId: "svc-barba",
        productId: "prd-oleo-barba",
        quantityPerService: 0.15,
        wastePct: 4,
        isCritical: true,
      },
    ],
    skipDuplicates: true,
  });


  await prisma.loyaltyProgram.upsert({
    where: { id: "loyalty-unit-01" },
    update: {
      unitId: "unit-01",
      name: "Fidelidade Premium",
      type: "POINTS",
      conversionRate: 0.1,
      isActive: true,
    },
    create: {
      id: "loyalty-unit-01",
      unitId: "unit-01",
      name: "Fidelidade Premium",
      type: "POINTS",
      conversionRate: 0.1,
      isActive: true,
    },
  });

  await prisma.servicePackage.upsert({
    where: { id: "pkg-corte-4" },
    update: {
      unitId: "unit-01",
      name: "Pacote Corte 4 sessoes",
      price: 260,
      sessionsTotal: 4,
      sessionsByService: { "svc-corte": 4 },
      validityDays: 90,
      isActive: true,
    },
    create: {
      id: "pkg-corte-4",
      unitId: "unit-01",
      name: "Pacote Corte 4 sessoes",
      price: 260,
      sessionsTotal: 4,
      sessionsByService: { "svc-corte": 4 },
      validityDays: 90,
      isActive: true,
    },
  });
  await prisma.servicePackage.upsert({
    where: { id: "pkg-barba-4" },
    update: {
      unitId: "unit-01",
      name: "Pacote Barba 4 sessoes",
      price: 190,
      sessionsTotal: 4,
      sessionsByService: { "svc-barba": 4 },
      validityDays: 90,
      isActive: true,
    },
    create: {
      id: "pkg-barba-4",
      unitId: "unit-01",
      name: "Pacote Barba 4 sessoes",
      price: 190,
      sessionsTotal: 4,
      sessionsByService: { "svc-barba": 4 },
      validityDays: 90,
      isActive: true,
    },
  });

  await prisma.subscriptionPlan.upsert({
    where: { id: "sub-gold" },
    update: {
      unitId: "unit-01",
      name: "Assinatura Gold",
      priceMonthly: 149,
      billingDay: 5,
      benefits: ["1 corte premium", "10% produtos"],
      isActive: true,
    },
    create: {
      id: "sub-gold",
      unitId: "unit-01",
      name: "Assinatura Gold",
      priceMonthly: 149,
      billingDay: 5,
      benefits: ["1 corte premium", "10% produtos"],
      isActive: true,
    },
  });
  await prisma.subscriptionPlan.upsert({
    where: { id: "sub-black" },
    update: {
      unitId: "unit-01",
      name: "Assinatura Black",
      priceMonthly: 249,
      billingDay: 5,
      benefits: ["2 cortes premium", "1 barba", "15% produtos"],
      isActive: true,
    },
    create: {
      id: "sub-black",
      unitId: "unit-01",
      name: "Assinatura Black",
      priceMonthly: 249,
      billingDay: 5,
      benefits: ["2 cortes premium", "1 barba", "15% produtos"],
      isActive: true,
    },
  });

  const now = new Date();
  await prisma.retentionCase.upsert({
    where: { id: "ret-case-cli-02" },
    update: {
      unitId: "unit-01",
      clientId: "cli-02",
      status: "OPEN",
      riskLevel: "MEDIUM",
      reason: "Sem retorno recente",
      recommendedAction: "Contato com oferta de retorno",
      lastVisitAt: new Date(now.getTime() - 50 * 24 * 60 * 60 * 1000),
      daysWithoutReturn: 50,
      ownerUser: "owner",
    },
    create: {
      id: "ret-case-cli-02",
      unitId: "unit-01",
      clientId: "cli-02",
      status: "OPEN",
      riskLevel: "MEDIUM",
      reason: "Sem retorno recente",
      recommendedAction: "Contato com oferta de retorno",
      lastVisitAt: new Date(now.getTime() - 50 * 24 * 60 * 60 * 1000),
      daysWithoutReturn: 50,
      ownerUser: "owner",
    },
  });

  await prisma.automationRule.upsert({
    where: { id: "auto-risk-whatsapp" },
    update: {
      unitId: "unit-01",
      name: "Reativacao clientes de alto risco",
      triggerType: "HIGH_RISK",
      channel: "WHATSAPP",
      target: "SEGMENT",
      messageTemplate: "Sentimos sua falta. Temos uma condicao especial para seu retorno.",
      isActive: true,
      createdBy: "system",
    },
    create: {
      id: "auto-risk-whatsapp",
      unitId: "unit-01",
      name: "Reativacao clientes de alto risco",
      triggerType: "HIGH_RISK",
      channel: "WHATSAPP",
      target: "SEGMENT",
      messageTemplate: "Sentimos sua falta. Temos uma condicao especial para seu retorno.",
      isActive: true,
      createdBy: "system",
    },
  });

  const serviceStart = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const serviceEnd = new Date(serviceStart.getTime() + 45 * 60 * 1000);
  const saleAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const expenseAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  await prisma.appointment.upsert({
    where: { id: "appt-seed-fin-01" },
    update: {
      unitId: "unit-01",
      clientId: "cli-01",
      professionalId: "pro-01",
      serviceId: "svc-corte",
      startsAt: serviceStart,
      endsAt: serviceEnd,
      status: "COMPLETED",
      notes: "Atendimento seed financeiro",
      serviceNameSnapshot: "Corte Premium",
      servicePriceSnapshot: 75,
      serviceDurationMinSnapshot: 45,
      totalPriceSnapshot: 75,
      effectiveDurationMinSnapshot: 45,
      durationCalculationMode: "SUM",
    },
    create: {
      id: "appt-seed-fin-01",
      unitId: "unit-01",
      clientId: "cli-01",
      professionalId: "pro-01",
      serviceId: "svc-corte",
      startsAt: serviceStart,
      endsAt: serviceEnd,
      status: "COMPLETED",
      notes: "Atendimento seed financeiro",
      serviceNameSnapshot: "Corte Premium",
      servicePriceSnapshot: 75,
      serviceDurationMinSnapshot: 45,
      totalPriceSnapshot: 75,
      effectiveDurationMinSnapshot: 45,
      durationCalculationMode: "SUM",
    },
  });

  await prisma.appointmentServiceItem.upsert({
    where: {
      appointmentId_position: {
        appointmentId: "appt-seed-fin-01",
        position: 0,
      },
    },
    update: {
      serviceId: "svc-corte",
      serviceNameSnapshot: "Corte Premium",
      servicePriceSnapshot: 75,
      serviceDurationMinSnapshot: 45,
    },
    create: {
      id: "asi-appt-seed-fin-01-svc-corte",
      appointmentId: "appt-seed-fin-01",
      serviceId: "svc-corte",
      position: 0,
      serviceNameSnapshot: "Corte Premium",
      servicePriceSnapshot: 75,
      serviceDurationMinSnapshot: 45,
    },
  });

  await prisma.appointmentHistory.createMany({
    data: [
      {
        id: "appt-seed-fin-01-created",
        appointmentId: "appt-seed-fin-01",
        changedAt: serviceStart,
        changedBy: "seed",
        action: "CREATED",
      },
      {
        id: "appt-seed-fin-01-completed",
        appointmentId: "appt-seed-fin-01",
        changedAt: serviceEnd,
        changedBy: "seed",
        action: "COMPLETED",
      },
    ],
    skipDuplicates: true,
  });

  await prisma.productSale.upsert({
    where: { id: "sale-seed-fin-01" },
    update: {
      unitId: "unit-01",
      clientId: "cli-01",
      professionalId: "pro-01",
      grossAmount: 25,
      soldAt: saleAt,
    },
    create: {
      id: "sale-seed-fin-01",
      unitId: "unit-01",
      clientId: "cli-01",
      professionalId: "pro-01",
      grossAmount: 25,
      soldAt: saleAt,
    },
  });

  await prisma.productSaleItem.upsert({
    where: { id: "sale-item-seed-fin-01" },
    update: {
      productSaleId: "sale-seed-fin-01",
      productId: "prd-pomada",
      quantity: 1,
      unitPrice: 25,
      unitCost: 7.5,
    },
    create: {
      id: "sale-item-seed-fin-01",
      productSaleId: "sale-seed-fin-01",
      productId: "prd-pomada",
      quantity: 1,
      unitPrice: 25,
      unitCost: 7.5,
    },
  });

  await prisma.financialEntry.upsert({
    where: { id: "fin-seed-service-01" },
    update: {
      unitId: "unit-01",
      kind: "INCOME",
      source: "SERVICE",
      category: "SERVICO",
      paymentMethod: "PIX",
      amount: 75,
      occurredAt: serviceEnd,
      referenceType: "APPOINTMENT",
      referenceId: "appt-seed-fin-01",
      professionalId: "pro-01",
      customerId: "cli-01",
      description: "Receita de servico concluido (seed)",
      notes: "Gerado para validacao da aba Financeiro",
    },
    create: {
      id: "fin-seed-service-01",
      unitId: "unit-01",
      kind: "INCOME",
      source: "SERVICE",
      category: "SERVICO",
      paymentMethod: "PIX",
      amount: 75,
      occurredAt: serviceEnd,
      referenceType: "APPOINTMENT",
      referenceId: "appt-seed-fin-01",
      professionalId: "pro-01",
      customerId: "cli-01",
      description: "Receita de servico concluido (seed)",
      notes: "Gerado para validacao da aba Financeiro",
    },
  });

  await prisma.financialEntry.upsert({
    where: { id: "fin-seed-product-01" },
    update: {
      unitId: "unit-01",
      kind: "INCOME",
      source: "PRODUCT",
      category: "PRODUTO",
      paymentMethod: "CARTAO",
      amount: 25,
      occurredAt: saleAt,
      referenceType: "PRODUCT_SALE",
      referenceId: "sale-seed-fin-01",
      professionalId: "pro-01",
      customerId: "cli-01",
      description: "Venda de produto (seed)",
      notes: "Gerado para validacao da aba Financeiro",
    },
    create: {
      id: "fin-seed-product-01",
      unitId: "unit-01",
      kind: "INCOME",
      source: "PRODUCT",
      category: "PRODUTO",
      paymentMethod: "CARTAO",
      amount: 25,
      occurredAt: saleAt,
      referenceType: "PRODUCT_SALE",
      referenceId: "sale-seed-fin-01",
      professionalId: "pro-01",
      customerId: "cli-01",
      description: "Venda de produto (seed)",
      notes: "Gerado para validacao da aba Financeiro",
    },
  });

  await prisma.financialEntry.upsert({
    where: { id: "fin-seed-expense-01" },
    update: {
      unitId: "unit-01",
      kind: "EXPENSE",
      source: null,
      category: "OPERACIONAL",
      paymentMethod: "PIX",
      amount: 22.5,
      occurredAt: expenseAt,
      referenceType: "MANUAL",
      referenceId: null,
      description: "Despesa manual operacional (seed)",
      notes: "Gerado para validacao da aba Financeiro",
    },
    create: {
      id: "fin-seed-expense-01",
      unitId: "unit-01",
      kind: "EXPENSE",
      source: null,
      category: "OPERACIONAL",
      paymentMethod: "PIX",
      amount: 22.5,
      occurredAt: expenseAt,
      referenceType: "MANUAL",
      referenceId: null,
      description: "Despesa manual operacional (seed)",
      notes: "Gerado para validacao da aba Financeiro",
    },
  });

}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
