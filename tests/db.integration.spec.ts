import crypto from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../src/http/app";
import { prisma } from "../src/infrastructure/database/prisma";
import { hashPassword } from "../src/http/security";
import { buildServiceSetKey } from "../src/domain/appointment-services";
import { PrismaOperationsService } from "../src/application/prisma-operations-service";
import { StockEntryPreviewRepository } from "../src/application/stock-entry-preview-repository";
import { STOCK_ENTRY_PREVIEW_VERSION, StockEntryPreview } from "../src/application/stock-entry";
import { InMemoryStore } from "../src/infrastructure/in-memory-store";

const SENSITIVE_DATABASE_URL_PATTERNS = [
  /(^|[^a-z])prod([^a-z]|$)/i,
  /production/i,
  /render/i,
  /railway/i,
];
const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function assertDbTestsAreSafe() {
  if (process.env.RUN_DB_TESTS !== "1") return false;

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("test:db exige DATABASE_URL de banco isolado de teste");
  }

  const decodedUrl = decodeURIComponent(databaseUrl);
  if (SENSITIVE_DATABASE_URL_PATTERNS.some((pattern) => pattern.test(decodedUrl))) {
    throw new Error("test:db recusou DATABASE_URL com indicio de producao");
  }
  const url = new URL(databaseUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!LOCAL_DATABASE_HOSTS.has(url.hostname) || !/test/i.test(databaseName)) {
    throw new Error("test:db exige host local e nome de banco contendo test");
  }

  return true;
}

const runDbTests =
  assertDbTestsAreSafe();

const suite = runDbTests ? describe : describe.skip;
const DB_TEST_TIMEOUT_MS = 60_000;

type DbScenario = {
  unitId: string;
  serviceId: string;
  professionalId: string;
  clientId: string;
  productId: string;
};

type DbMultiServiceScenario = {
  unitId: string;
  corteId: string;
  barbaId: string;
  hidratacaoId: string;
  professionalId: string;
  partialProfessionalId: string;
  clientId: string;
  otherClientId: string;
  thirdClientId: string;
};

async function createPersistentUser(input: {
  email: string;
  password: string;
  role: "owner" | "recepcao" | "profissional";
  unitIds: string[];
  isActive?: boolean;
}) {
  const id = uniqueId("usr-db");
  await prisma.user.create({
    data: {
      id,
      email: input.email,
      passwordHash: hashPassword(input.password),
      name: input.email,
      role: input.role,
      isActive: input.isActive ?? true,
      unitAccesses: {
        create: input.unitIds.map((unitId) => ({
          id: uniqueId("access-db"),
          unitId,
          role: input.role,
          isActive: true,
        })),
      },
    },
  });
  return id;
}

function uniqueId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function createScenario(): Promise<DbScenario> {
  const suffix = crypto.randomUUID();
  const unitId = `unit-db-${suffix}`;
  const serviceId = `svc-db-${suffix}`;
  const professionalId = `pro-db-${suffix}`;
  const clientId = `cli-db-${suffix}`;
  const productId = `prd-db-${suffix}`;

  await prisma.unit.create({
    data: { id: unitId, name: `Unidade DB ${suffix}` },
  });

  await prisma.businessHour.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      id: `bh-db-${suffix}-${dayOfWeek}`,
      unitId,
      dayOfWeek,
      opensAt: "00:00",
      closesAt: "23:59",
      isClosed: false,
    })),
  });

  await prisma.service.create({
    data: {
      id: serviceId,
      businessId: unitId,
      name: "Corte DB",
      category: "CORTE",
      price: 75,
      durationMin: 45,
      costEstimate: 12,
    },
  });

  await prisma.professional.create({
    data: {
      id: professionalId,
      businessId: unitId,
      name: `Profissional DB ${suffix.slice(0, 8)}`,
      commissionRules: {
        create: [
          {
            id: `rule-service-${suffix}`,
            appliesTo: "SERVICE",
            percentage: 0.4,
          },
          {
            id: `rule-product-${suffix}`,
            appliesTo: "PRODUCT",
            percentage: 0.1,
          },
        ],
      },
    },
  });

  await prisma.serviceProfessional.create({
    data: {
      id: `svc-pro-${suffix}`,
      serviceId,
      professionalId,
    },
  });

  await prisma.client.create({
    data: {
      id: clientId,
      businessId: unitId,
      fullName: "Cliente DB",
      tags: ["DB"],
    },
  });

  await prisma.product.create({
    data: {
      id: productId,
      businessId: unitId,
      name: "Pomada DB",
      category: "FINALIZADOR",
      salePrice: 50,
      costPrice: 20,
      stockQty: 1,
      minStockAlert: 0,
    },
  });

  return { unitId, serviceId, professionalId, clientId, productId };
}

async function createMultiServiceScenario(): Promise<DbMultiServiceScenario> {
  const suffix = crypto.randomUUID().replace(/-/g, "");
  const unitId = `unit-ms-${suffix}`;
  const corteId = `svc-corte-${suffix}`;
  const barbaId = `svc-barba-${suffix}`;
  const hidratacaoId = `svc-hidratacao-${suffix}`;
  const professionalId = `pro-main-${suffix}`;
  const partialProfessionalId = `pro-partial-${suffix}`;
  const clientId = `cli-main-${suffix}`;
  const otherClientId = `cli-other-${suffix}`;
  const thirdClientId = `cli-third-${suffix}`;

  await prisma.unit.create({
    data: { id: unitId, name: `Unidade Alpha ${suffix.slice(0, 8)}` },
  });
  await prisma.businessSettings.create({
    data: {
      id: `settings-ms-${suffix}`,
      unitId,
      businessName: `Barbearia Alpha ${suffix.slice(0, 8)}`,
      segment: "barbearia",
      bufferBetweenAppointmentsMinutes: 0,
      minimumAdvanceMinutes: 0,
    },
  });
  await prisma.businessHour.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      id: `bh-ms-${suffix}-${dayOfWeek}`,
      unitId,
      dayOfWeek,
      opensAt: "00:00",
      closesAt: "23:59",
      isClosed: false,
    })),
  });
  await prisma.service.createMany({
    data: [
      {
        id: corteId,
        businessId: unitId,
        name: "Corte",
        category: "CORTE",
        price: 30,
        durationMin: 30,
        costEstimate: 5,
      },
      {
        id: barbaId,
        businessId: unitId,
        name: "Barba",
        category: "BARBA",
        price: 20,
        durationMin: 20,
        costEstimate: 4,
      },
      {
        id: hidratacaoId,
        businessId: unitId,
        name: "Hidratacao",
        category: "TRATAMENTO",
        price: 15,
        durationMin: 25,
        costEstimate: 3,
      },
    ],
  });
  await prisma.professional.createMany({
    data: [
      { id: professionalId, businessId: unitId, name: "Ana Principal" },
      { id: partialProfessionalId, businessId: unitId, name: "Bruno Parcial" },
    ],
  });
  await prisma.commissionRule.createMany({
    data: [
      {
        id: `rule-service-main-${suffix}`,
        professionalId,
        appliesTo: "SERVICE",
        percentage: 0.4,
      },
      {
        id: `rule-service-partial-${suffix}`,
        professionalId: partialProfessionalId,
        appliesTo: "SERVICE",
        percentage: 0.4,
      },
    ],
  });
  await prisma.serviceProfessional.createMany({
    data: [
      { id: `sp-main-corte-${suffix}`, serviceId: corteId, professionalId },
      { id: `sp-main-barba-${suffix}`, serviceId: barbaId, professionalId },
      { id: `sp-main-hid-${suffix}`, serviceId: hidratacaoId, professionalId },
      { id: `sp-partial-corte-${suffix}`, serviceId: corteId, professionalId: partialProfessionalId },
    ],
  });
  await prisma.client.createMany({
    data: [
      { id: clientId, businessId: unitId, fullName: "Cliente Alpha" },
      { id: otherClientId, businessId: unitId, fullName: "Cliente Beta" },
      { id: thirdClientId, businessId: unitId, fullName: "Cliente Gama" },
    ],
  });
  await prisma.serviceCombinationRule.create({
    data: {
      id: `combo-corte-barba-${suffix}`,
      unitId,
      serviceSetKey: buildServiceSetKey([corteId, barbaId]),
      label: "Corte + Barba - 45 min",
      effectiveDurationMin: 45,
      active: true,
      items: {
        create: [
          { id: `combo-item-corte-${suffix}`, serviceId: corteId, position: 0 },
          { id: `combo-item-barba-${suffix}`, serviceId: barbaId, position: 1 },
        ],
      },
    },
  });

  return {
    unitId,
    corteId,
    barbaId,
    hidratacaoId,
    professionalId,
    partialProfessionalId,
    clientId,
    otherClientId,
    thirdClientId,
  };
}

async function createAppointment(app: FastifyInstance, scenario: DbScenario, startsAt: string) {
  const response = await app.inject({
    method: "POST",
    url: "/appointments",
    payload: {
      unitId: scenario.unitId,
      clientId: scenario.clientId,
      professionalId: scenario.professionalId,
      serviceId: scenario.serviceId,
      startsAt,
      changedBy: "db-test",
    },
  });
  expect(response.statusCode).toBe(200);
  const appointmentId = response.json().appointment.id as string;

  const confirmed = await app.inject({
    method: "PATCH",
    url: `/appointments/${appointmentId}/status`,
    headers: { "idempotency-key": "status-db-001" },
    payload: { status: "CONFIRMED", changedBy: "db-test" },
  });
  expect(confirmed.statusCode).toBe(200);

  const inService = await app.inject({
    method: "PATCH",
    url: `/appointments/${appointmentId}/status`,
    headers: { "idempotency-key": "status-db-002" },
    payload: { status: "IN_SERVICE", changedBy: "db-test" },
  });
  expect(inService.statusCode).toBe(200);

  return appointmentId;
}

async function checkoutAppointment(
  app: FastifyInstance,
  appointmentId: string,
  idempotencyKey: string,
) {
  return await app.inject({
    method: "POST",
    url: `/appointments/${appointmentId}/checkout`,
    headers: { "idempotency-key": idempotencyKey },
    payload: {
      changedBy: "db-test",
      completedAt: "2026-05-10T13:45:00.000Z",
      paymentMethod: "PIX",
      expectedTotal: 75,
    },
  });
}

async function expectSingleCheckoutSideEffects(unitId: string, appointmentId: string) {
  const serviceRevenueCount = await prisma.financialEntry.count({
    where: {
      unitId,
      kind: "INCOME",
      source: "SERVICE",
      referenceType: "APPOINTMENT",
      referenceId: appointmentId,
    },
  });
  expect(serviceRevenueCount).toBe(1);

  const commissionCount = await prisma.commissionEntry.count({
    where: {
      unitId,
      appointmentId,
      source: "SERVICE",
    },
  });
  expect(commissionCount).toBe(1);
}

async function createProductSale(app: FastifyInstance, scenario: DbScenario, idempotencyKey: string) {
  const response = await app.inject({
    method: "POST",
    url: "/sales/products",
    headers: { "idempotency-key": idempotencyKey },
    payload: {
      unitId: scenario.unitId,
      clientId: scenario.clientId,
      professionalId: scenario.professionalId,
      soldAt: "2026-05-10T15:00:00.000Z",
      paymentMethod: "PIX",
      items: [{ productId: scenario.productId, quantity: 1 }],
    },
  });
  expect(response.statusCode).toBe(200);
  return response.json().sale.id as string;
}

suite("DB integration (Prisma/PostgreSQL robustness)", () => {
  beforeEach(() => {
    process.env.AUTH_ENFORCED = "false";
    process.env.DATA_BACKEND = "prisma";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-01T00:00:00.000Z"));
  });

  afterEach(() => {
    process.env.AUTH_ENFORCED = "false";
    vi.useRealTimers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("atualiza profissional e reconcilia TeamMember sem duplicacao", async () => {
    const app = createApp();
    const scenario = await createScenario();

    const inactive = await app.inject({
      method: "PATCH",
      url: `/professionals/${scenario.professionalId}`,
      headers: { "x-correlation-id": uniqueId("professional-update-audit") },
      payload: {
        unitId: scenario.unitId,
        name: "Profissional Atualizado",
        phone: "11987654321",
        email: "atualizado@barbearia.test",
        active: false,
      },
    });

    expect(inactive.statusCode).toBe(200);
    expect(inactive.json().professional).toMatchObject({
      id: scenario.professionalId,
      name: "Profissional Atualizado",
      active: false,
    });
    await expect(
      prisma.professional.findUniqueOrThrow({ where: { id: scenario.professionalId } }),
    ).resolves.toMatchObject({
      businessId: scenario.unitId,
      name: "Profissional Atualizado",
      active: false,
    });
    await expect(
      prisma.teamMember.findUniqueOrThrow({ where: { id: scenario.professionalId } }),
    ).resolves.toMatchObject({
      unitId: scenario.unitId,
      name: "Profissional Atualizado",
      phone: "11987654321",
      email: "atualizado@barbearia.test",
      isActive: false,
      role: "PROFESSIONAL",
      accessProfile: "profissional",
    });

    const active = await app.inject({
      method: "PATCH",
      url: `/professionals/${scenario.professionalId}`,
      payload: {
        unitId: scenario.unitId,
        phone: "11999990000",
        active: true,
      },
    });
    expect(active.statusCode).toBe(200);
    expect(active.json().professional.active).toBe(true);
    expect(
      await prisma.teamMember.findMany({ where: { id: scenario.professionalId } }),
    ).toEqual([
      expect.objectContaining({
        unitId: scenario.unitId,
        name: "Profissional Atualizado",
        phone: "11999990000",
        email: "atualizado@barbearia.test",
        isActive: true,
      }),
    ]);
    expect(
      await prisma.auditLog.count({
        where: {
          unitId: scenario.unitId,
          action: "PROFESSIONAL_UPDATED",
          entity: "professional",
          entityId: scenario.professionalId,
        },
      }),
    ).toBe(2);

    await app.close();
  });

  it("retorna 404 ao atualizar profissional inexistente", async () => {
    const app = createApp();
    const scenario = await createScenario();
    const response = await app.inject({
      method: "PATCH",
      url: `/professionals/${uniqueId("professional-missing")}`,
      payload: {
        unitId: scenario.unitId,
        name: "Profissional Inexistente",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("Profissional nao encontrado");
    await app.close();
  });

  it("bloqueia updateProfessional de outra unidade sem alterar ou vincular dados", async () => {
    const app = createApp();
    const target = await createScenario();
    const otherTenant = await createScenario();
    const original = await prisma.professional.findUniqueOrThrow({
      where: { id: target.professionalId },
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/professionals/${target.professionalId}`,
      payload: {
        unitId: otherTenant.unitId,
        name: "Alteracao Indevida",
        phone: "11000000000",
        email: "indevido@barbearia.test",
        active: false,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("Profissional nao encontrado");
    await expect(
      prisma.professional.findUniqueOrThrow({ where: { id: target.professionalId } }),
    ).resolves.toMatchObject({
      businessId: target.unitId,
      name: original.name,
      active: original.active,
    });
    expect(await prisma.teamMember.count({ where: { id: target.professionalId } })).toBe(0);
    await app.close();
  });

  it("projeta produto e quantidade no financeiro de venda persistida", async () => {
    const app = createApp();
    const scenario = await createScenario();
    const saleId = await createProductSale(app, scenario, uniqueId("sale-financial-products"));

    const response = await app.inject({
      method: "GET",
      url: `/financial/transactions?unitId=${scenario.unitId}&start=2026-05-10T00:00:00.000Z&end=2026-05-10T23:59:59.999Z`,
    });

    expect(response.statusCode).toBe(200);
    const productEntry = response
      .json()
      .transactions.find((item: { referenceType: string }) => item.referenceType === "PRODUCT_SALE");
    expect(productEntry).toMatchObject({
      productSaleId: saleId,
      paymentMethod: "PIX",
      productItems: [
        { productId: scenario.productId, productName: "Pomada DB", quantity: 1 },
      ],
    });
  });

  it("grava AppointmentServiceItem no dual-write Prisma de criacao", async () => {
    const app = createApp();
    const scenario = await createScenario();

    const response = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: scenario.unitId,
        clientId: scenario.clientId,
        professionalId: scenario.professionalId,
        serviceId: scenario.serviceId,
        startsAt: "2026-05-16T13:00:00.000Z",
        changedBy: "db-test",
      },
    });

    expect(response.statusCode).toBe(200);
    const appointmentId = response.json().appointment.id as string;
    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: { serviceItems: true },
    });
    expect(appointment.serviceId).toBe(scenario.serviceId);
    expect(Number(appointment.totalPriceSnapshot)).toBe(75);
    expect(appointment.effectiveDurationMinSnapshot).toBe(45);
    expect(appointment.durationCalculationMode).toBe("SUM");
    expect(appointment.serviceItems).toHaveLength(1);
    expect(appointment.serviceItems[0]).toMatchObject({
      serviceId: scenario.serviceId,
      position: 0,
      serviceNameSnapshot: "Corte DB",
      serviceDurationMinSnapshot: 45,
    });
  });

  it("cria walk-in Prisma com cliente novo dentro da mesma transacao", async () => {
    const app = createApp();
    const scenario = await createScenario();
    const phone = `1197${crypto.randomInt(1000000, 9999999)}`;
    const idempotencyKey = `walkin-db-${crypto.randomUUID()}`;

    const response = await app.inject({
      method: "POST",
      url: "/appointments/walk-in",
      headers: { "idempotency-key": idempotencyKey },
      payload: {
        unitId: scenario.unitId,
        clientName: "Cliente Walkin DB",
        clientPhone: phone,
        professionalId: scenario.professionalId,
        serviceId: scenario.serviceId,
        startedAt: "2026-05-16T14:00:00.000Z",
        changedBy: "db-test",
      },
    });

    expect(response.statusCode).toBe(200);
    const appointment = response.json().appointment;
    expect(appointment).toMatchObject({
      status: "IN_SERVICE",
      serviceId: scenario.serviceId,
      startsAt: "2026-05-01T00:00:00.000Z",
      endsAt: "2026-05-01T00:45:00.000Z",
      totalPriceSnapshot: 75,
      effectiveDurationMinSnapshot: 45,
    });

    const persistedClient = await prisma.client.findUniqueOrThrow({
      where: { id: appointment.clientId },
    });
    expect(persistedClient).toMatchObject({
      businessId: scenario.unitId,
      fullName: "Cliente Walkin DB",
      phone,
    });

    const persistedAppointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
      include: { history: { orderBy: { changedAt: "asc" } }, serviceItems: true },
    });
    expect(persistedAppointment.status).toBe("IN_SERVICE");
    expect(persistedAppointment.startsAt.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(persistedAppointment.endsAt.toISOString()).toBe("2026-05-01T00:45:00.000Z");
    expect(persistedAppointment.history.map((item) => item.action)).toEqual(["CREATED", "CHECKED_IN"]);
    expect(persistedAppointment.history.map((item) => item.changedAt.toISOString())).toEqual([
      "2026-05-01T00:00:00.000Z",
      "2026-05-01T00:00:00.000Z",
    ]);
    expect(persistedAppointment.serviceItems).toHaveLength(1);
    await expect(prisma.financialEntry.count({ where: { unitId: scenario.unitId, referenceId: appointment.id } })).resolves.toBe(0);
    await expect(prisma.commissionEntry.count({ where: { unitId: scenario.unitId, appointmentId: appointment.id } })).resolves.toBe(0);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        unitId: scenario.unitId,
        action: "WALK_IN_APPOINTMENT_CREATED",
        entity: "appointment",
        entityId: appointment.id,
      },
    });
    expect(audit.afterJson).toMatchObject({
      origin: "Atendimento sem agendamento",
      status: "IN_SERVICE",
      startsAt: "2026-05-01T00:00:00.000Z",
      endsAt: "2026-05-01T00:45:00.000Z",
    });

    const replay = await app.inject({
      method: "POST",
      url: "/appointments/walk-in",
      headers: { "idempotency-key": idempotencyKey },
      payload: {
        unitId: scenario.unitId,
        clientName: "Cliente Walkin DB",
        clientPhone: phone,
        professionalId: scenario.professionalId,
        serviceId: scenario.serviceId,
        startedAt: "2026-05-16T14:00:00.000Z",
        changedBy: "db-test",
      },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().appointment.id).toBe(appointment.id);
    expect(replay.json().appointment.startsAt).toBe("2026-05-01T00:00:00.000Z");
    await expect(prisma.client.count({ where: { businessId: scenario.unitId, phone } })).resolves.toBe(1);
    await expect(prisma.appointment.count({ where: { unitId: scenario.unitId, clientId: appointment.clientId } })).resolves.toBe(1);
  });

  it("confirma walk-in Prisma fora do expediente sem persistir a tentativa inicial", async () => {
    const app = createApp();
    const scenario = await createScenario();
    await prisma.businessHour.updateMany({
      where: { unitId: scenario.unitId },
      data: { opensAt: "08:00", closesAt: "20:00", isClosed: false },
    });
    const phone = `1198${crypto.randomInt(1000000, 9999999)}`;
    const idempotencyKey = `walkin-db-out-hours-${crypto.randomUUID()}`;
    const payload = {
      unitId: scenario.unitId,
      clientName: "Cliente Walkin DB Fora Expediente",
      clientPhone: phone,
      professionalId: scenario.professionalId,
      serviceId: scenario.serviceId,
      startedAt: "2026-05-16T14:00:00.000Z",
      changedBy: "db-test",
    };

    const first = await app.inject({
      method: "POST",
      url: "/appointments/walk-in",
      headers: { "idempotency-key": idempotencyKey },
      payload,
    });
    expect(first.statusCode).toBe(409);
    expect(first.json()).toMatchObject({
      code: "WALK_IN_OUTSIDE_BUSINESS_HOURS",
      requiresConfirmation: true,
      currentLocalTime: "21:00",
      businessHours: { opensAt: "08:00", closesAt: "20:00", isClosed: false },
    });
    await expect(prisma.client.count({ where: { businessId: scenario.unitId, phone } })).resolves.toBe(0);
    await expect(prisma.appointment.count({ where: { unitId: scenario.unitId } })).resolves.toBe(0);

    const confirmed = await app.inject({
      method: "POST",
      url: "/appointments/walk-in",
      headers: { "idempotency-key": idempotencyKey },
      payload: { ...payload, confirmOutOfHours: true },
    });
    expect(confirmed.statusCode).toBe(200);
    const appointment = confirmed.json().appointment;
    expect(appointment).toMatchObject({
      status: "IN_SERVICE",
      startsAt: "2026-05-01T00:00:00.000Z",
      endsAt: "2026-05-01T00:45:00.000Z",
    });

    const replay = await app.inject({
      method: "POST",
      url: "/appointments/walk-in",
      headers: { "idempotency-key": idempotencyKey },
      payload: { ...payload, confirmOutOfHours: true },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().appointment.id).toBe(appointment.id);
    await expect(prisma.client.count({ where: { businessId: scenario.unitId, phone } })).resolves.toBe(1);
    await expect(prisma.appointment.count({ where: { unitId: scenario.unitId } })).resolves.toBe(1);
    await expect(prisma.financialEntry.count({ where: { unitId: scenario.unitId, referenceId: appointment.id } })).resolves.toBe(0);
    await expect(prisma.commissionEntry.count({ where: { unitId: scenario.unitId, appointmentId: appointment.id } })).resolves.toBe(0);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        unitId: scenario.unitId,
        action: "WALK_IN_APPOINTMENT_CREATED",
        entity: "appointment",
        entityId: appointment.id,
      },
    });
    expect(audit.afterJson).toMatchObject({
      outsideBusinessHours: true,
      confirmOutOfHours: true,
      currentLocalTime: "21:00",
      businessHours: { opensAt: "08:00", closesAt: "20:00", isClosed: false },
    });
  });

  it("persiste criacao Prisma multi-servico com regra, ordem inversa e soma sem regra", async () => {
    const app = createApp();
    const scenario = await createMultiServiceScenario();

    const createPayload = {
      unitId: scenario.unitId,
      clientId: scenario.clientId,
      professionalId: scenario.professionalId,
      serviceIds: [scenario.corteId, scenario.barbaId],
      startsAt: "2026-05-22T13:00:00.000Z",
      changedBy: "db-test",
    };
    const created = await app.inject({ method: "POST", url: "/appointments", payload: createPayload });
    expect(created.statusCode).toBe(200);
    const createdId = created.json().appointment.id as string;
    const persisted = await prisma.appointment.findUniqueOrThrow({
      where: { id: createdId },
      include: { serviceItems: { orderBy: { position: "asc" } } },
    });
    expect(persisted.serviceId).toBe(scenario.corteId);
    expect(Number(persisted.totalPriceSnapshot)).toBe(50);
    expect(persisted.effectiveDurationMinSnapshot).toBe(45);
    expect(persisted.durationCalculationMode).toBe("COMBINATION_RULE");
    expect(persisted.endsAt.toISOString()).toBe("2026-05-22T13:45:00.000Z");
    expect(persisted.serviceItems.map((item) => item.serviceId)).toEqual([
      scenario.corteId,
      scenario.barbaId,
    ]);
    expect(persisted.serviceItems.map((item) => item.position)).toEqual([0, 1]);
    expect(persisted.serviceItems.map((item) => item.serviceNameSnapshot)).toEqual(["Corte", "Barba"]);
    expect(persisted.serviceItems.map((item) => Number(item.servicePriceSnapshot))).toEqual([30, 20]);

    const reversed = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: scenario.unitId,
        clientId: scenario.otherClientId,
        professionalId: scenario.professionalId,
        serviceIds: [scenario.barbaId, scenario.corteId],
        startsAt: "2026-05-22T15:00:00.000Z",
        changedBy: "db-test",
      },
    });
    expect(reversed.statusCode).toBe(200);
    const reversedRow = await prisma.appointment.findUniqueOrThrow({
      where: { id: reversed.json().appointment.id },
      include: { serviceItems: { orderBy: { position: "asc" } } },
    });
    expect(reversedRow.serviceId).toBe(scenario.barbaId);
    expect(reversedRow.effectiveDurationMinSnapshot).toBe(45);
    expect(reversedRow.durationCalculationMode).toBe("COMBINATION_RULE");
    expect(reversedRow.serviceItems.map((item) => item.serviceId)).toEqual([
      scenario.barbaId,
      scenario.corteId,
    ]);

    const summed = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: scenario.unitId,
        clientId: scenario.thirdClientId,
        professionalId: scenario.professionalId,
        serviceIds: [scenario.corteId, scenario.barbaId, scenario.hidratacaoId],
        startsAt: "2026-05-22T17:00:00.000Z",
        changedBy: "db-test",
      },
    });
    expect(summed.statusCode).toBe(200);
    const summedRow = await prisma.appointment.findUniqueOrThrow({
      where: { id: summed.json().appointment.id },
      include: { serviceItems: { orderBy: { position: "asc" } } },
    });
    expect(Number(summedRow.totalPriceSnapshot)).toBe(65);
    expect(summedRow.effectiveDurationMinSnapshot).toBe(75);
    expect(summedRow.durationCalculationMode).toBe("SUM");
    expect(summedRow.endsAt.toISOString()).toBe("2026-05-22T18:15:00.000Z");
    expect(summedRow.serviceItems.map((item) => item.serviceId)).toEqual([
      scenario.corteId,
      scenario.barbaId,
      scenario.hidratacaoId,
    ]);
  });

  it("rejeita profissional incompatível e conflito Prisma sem persistencia parcial", async () => {
    const app = createApp();
    const scenario = await createMultiServiceScenario();

    const beforeIncompatible = {
      appointments: await prisma.appointment.count({ where: { unitId: scenario.unitId } }),
      items: await prisma.appointmentServiceItem.count({
        where: { appointment: { unitId: scenario.unitId } },
      }),
    };
    const incompatible = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: scenario.unitId,
        clientId: scenario.clientId,
        professionalId: scenario.partialProfessionalId,
        serviceIds: [scenario.corteId, scenario.barbaId],
        startsAt: "2026-05-23T13:00:00.000Z",
        changedBy: "db-test",
      },
    });
    expect(incompatible.statusCode).toBe(400);
    expect(await prisma.appointment.count({ where: { unitId: scenario.unitId } })).toBe(
      beforeIncompatible.appointments,
    );
    expect(await prisma.appointmentServiceItem.count({ where: { appointment: { unitId: scenario.unitId } } })).toBe(
      beforeIncompatible.items,
    );

    const first = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: scenario.unitId,
        clientId: scenario.clientId,
        professionalId: scenario.professionalId,
        serviceIds: [scenario.corteId, scenario.barbaId],
        startsAt: "2026-05-23T14:00:00.000Z",
        changedBy: "db-test",
      },
    });
    expect(first.statusCode).toBe(200);
    const adjacent = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: scenario.unitId,
        clientId: scenario.otherClientId,
        professionalId: scenario.professionalId,
        serviceId: scenario.hidratacaoId,
        startsAt: "2026-05-23T14:45:00.000Z",
        changedBy: "db-test",
      },
    });
    expect(adjacent.statusCode).toBe(200);

    const beforeConflict = await prisma.appointment.count({ where: { unitId: scenario.unitId } });
    const conflict = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: scenario.unitId,
        clientId: scenario.thirdClientId,
        professionalId: scenario.professionalId,
        serviceId: scenario.hidratacaoId,
        startsAt: "2026-05-23T14:44:00.000Z",
        changedBy: "db-test",
      },
    });
    expect(conflict.statusCode).toBe(409);
    expect(await prisma.appointment.count({ where: { unitId: scenario.unitId } })).toBe(beforeConflict);
  });

  it("edita atomicamente servicos Prisma e preserva estado anterior em falha", async () => {
    const app = createApp();
    const scenario = await createMultiServiceScenario();

    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: scenario.unitId,
        clientId: scenario.clientId,
        professionalId: scenario.professionalId,
        serviceId: scenario.corteId,
        startsAt: "2026-05-24T13:00:00.000Z",
        changedBy: "db-test",
      },
    });
    expect(created.statusCode).toBe(200);
    const appointmentId = created.json().appointment.id as string;

    const toMulti = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}`,
      payload: {
        serviceIds: [scenario.corteId, scenario.barbaId],
        changedBy: "db-test",
      },
    });
    expect(toMulti.statusCode).toBe(200);
    let row = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: { serviceItems: { orderBy: { position: "asc" } } },
    });
    expect(row.serviceItems.map((item) => item.serviceId)).toEqual([scenario.corteId, scenario.barbaId]);
    expect(Number(row.totalPriceSnapshot)).toBe(50);
    expect(row.effectiveDurationMinSnapshot).toBe(45);
    expect(row.endsAt.toISOString()).toBe("2026-05-24T13:45:00.000Z");

    const toSingle = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}`,
      payload: {
        serviceId: scenario.barbaId,
        changedBy: "db-test",
      },
    });
    expect(toSingle.statusCode).toBe(200);
    row = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: { serviceItems: { orderBy: { position: "asc" } } },
    });
    expect(row.serviceId).toBe(scenario.barbaId);
    expect(row.serviceItems.map((item) => item.serviceId)).toEqual([scenario.barbaId]);
    expect(Number(row.totalPriceSnapshot)).toBe(20);
    expect(row.effectiveDurationMinSnapshot).toBe(20);

    const beforeFailureItems = row.serviceItems.map((item) => ({
      serviceId: item.serviceId,
      position: item.position,
      serviceNameSnapshot: item.serviceNameSnapshot,
    }));
    const failed = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}`,
      payload: {
        professionalId: scenario.partialProfessionalId,
        serviceIds: [scenario.corteId, scenario.barbaId],
        changedBy: "db-test",
      },
    });
    expect(failed.statusCode).toBe(400);
    const afterFailure = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: { serviceItems: { orderBy: { position: "asc" } } },
    });
    expect(afterFailure.professionalId).toBe(scenario.professionalId);
    expect(afterFailure.serviceId).toBe(scenario.barbaId);
    expect(afterFailure.serviceItems.map((item) => ({
      serviceId: item.serviceId,
      position: item.position,
      serviceNameSnapshot: item.serviceNameSnapshot,
    }))).toEqual(beforeFailureItems);
  });

  it("remarca Prisma usando snapshot de duracao e mantendo itens intactos", async () => {
    const app = createApp();
    const scenario = await createMultiServiceScenario();

    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: scenario.unitId,
        clientId: scenario.clientId,
        professionalId: scenario.professionalId,
        serviceIds: [scenario.corteId, scenario.barbaId],
        startsAt: "2026-05-25T13:00:00.000Z",
        changedBy: "db-test",
      },
    });
    expect(created.statusCode).toBe(200);
    const appointmentId = created.json().appointment.id as string;
    const before = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: { serviceItems: { orderBy: { position: "asc" } } },
    });
    await prisma.service.update({
      where: { id: scenario.corteId },
      data: { durationMin: 120, price: 300 },
    });

    const rescheduled = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/reschedule`,
      headers: { "idempotency-key": "reschedule-db-001" },
      payload: {
        startsAt: "2026-05-25T16:00:00.000Z",
        changedBy: "db-test",
      },
    });
    expect(rescheduled.statusCode).toBe(200);
    const after = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: { serviceItems: { orderBy: { position: "asc" } } },
    });
    expect(after.startsAt.toISOString()).toBe("2026-05-25T16:00:00.000Z");
    expect(after.endsAt.toISOString()).toBe("2026-05-25T16:45:00.000Z");
    expect(after.effectiveDurationMinSnapshot).toBe(45);
    expect(Number(after.totalPriceSnapshot)).toBe(50);
    expect(after.serviceItems.map((item) => ({
      serviceId: item.serviceId,
      price: Number(item.servicePriceSnapshot),
      duration: item.serviceDurationMinSnapshot,
    }))).toEqual(
      before.serviceItems.map((item) => ({
        serviceId: item.serviceId,
        price: Number(item.servicePriceSnapshot),
        duration: item.serviceDurationMinSnapshot,
      })),
    );
  });

  it("conclui checkout multi-servico Prisma sem duplicidade e preserva checkout single-service", async () => {
    const app = createApp();
    const scenario = await createMultiServiceScenario();
    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: scenario.unitId,
        clientId: scenario.clientId,
        professionalId: scenario.professionalId,
        serviceIds: [scenario.corteId, scenario.barbaId],
        startsAt: "2026-05-26T13:00:00.000Z",
        changedBy: "db-test",
      },
    });
    expect(created.statusCode).toBe(200);
    const multiAppointmentId = created.json().appointment.id as string;
    for (const status of ["CONFIRMED", "IN_SERVICE"]) {
      const response = await app.inject({
        method: "PATCH",
        url: `/appointments/${multiAppointmentId}/status`,
        headers: { "idempotency-key": `${status.toLowerCase()}-status-db-003` },
        payload: { status, changedBy: "db-test" },
      });
      expect(response.statusCode).toBe(200);
    }

    const multiKey = uniqueId("checkout-multi-success");
    const multi = await app.inject({
      method: "POST",
      url: `/appointments/${multiAppointmentId}/checkout`,
      headers: { "idempotency-key": multiKey },
      payload: {
        changedBy: "db-test",
        completedAt: "2026-05-26T13:45:00.000Z",
        paymentMethod: "PIX",
        expectedTotal: 50,
      },
    });
    expect(multi.statusCode).toBe(200);
    expect(multi.json().appointment).toMatchObject({ id: multiAppointmentId, status: "COMPLETED" });
    expect(multi.json().serviceRevenue).toMatchObject({ amount: 50 });
    expect(multi.json().commissions).toHaveLength(2);
    const multiReplay = await app.inject({
      method: "POST",
      url: `/appointments/${multiAppointmentId}/checkout`,
      headers: { "idempotency-key": multiKey },
      payload: {
        changedBy: "db-test",
        completedAt: "2026-05-26T13:45:00.000Z",
        paymentMethod: "PIX",
        expectedTotal: 50,
      },
    });
    expect(multiReplay.statusCode).toBe(200);
    expect(multiReplay.json().serviceRevenue.id).toBe(multi.json().serviceRevenue.id);
    const completedAppointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: multiAppointmentId },
    });
    expect(completedAppointment.status).toBe("COMPLETED");
    expect(await prisma.financialEntry.count({ where: { unitId: scenario.unitId, referenceId: multiAppointmentId, source: "SERVICE" } })).toBe(1);
    const multiCommissions = await prisma.commissionEntry.findMany({
      where: { unitId: scenario.unitId, appointmentId: multiAppointmentId, source: "SERVICE" },
      orderBy: { baseAmount: "asc" },
    });
    expect(multiCommissions).toHaveLength(2);
    expect(multiCommissions.every((commission) => commission.appointmentServiceItemId)).toBe(true);
    expect(multiCommissions.map((commission) => Number(commission.baseAmount)).sort((a, b) => a - b)).toEqual([20, 30]);
    expect(await prisma.stockMovement.count({ where: { unitId: scenario.unitId, referenceId: multiAppointmentId } })).toBe(0);
    expect(await prisma.auditLog.count({
      where: {
        unitId: scenario.unitId,
        action: "APPOINTMENT_CHECKOUT_COMPLETED",
        entityId: multiAppointmentId,
      },
    })).toBe(1);
    expect(await prisma.idempotencyRecord.count({
      where: {
        unitId: scenario.unitId,
        action: "APPOINTMENT_CHECKOUT",
        idempotencyKey: multiKey,
        status: "SUCCEEDED",
      },
    })).toBe(1);

    const singleScenario = await createScenario();
    const singleAppointmentId = await createAppointment(
      app,
      singleScenario,
      "2026-05-26T15:00:00.000Z",
    );
    const singleKey = uniqueId("checkout-single-regression");
    const single = await checkoutAppointment(app, singleAppointmentId, singleKey);
    expect(single.statusCode).toBe(200);
    expect(single.json().appointment.status).toBe("COMPLETED");
    const replay = await checkoutAppointment(app, singleAppointmentId, singleKey);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().serviceRevenue.id).toBe(single.json().serviceRevenue.id);
    expect(await prisma.financialEntry.count({
      where: {
        unitId: singleScenario.unitId,
        referenceId: singleAppointmentId,
        source: "SERVICE",
      },
    })).toBe(1);
    expect(await prisma.commissionEntry.count({
      where: { unitId: singleScenario.unitId, appointmentId: singleAppointmentId, source: "SERVICE" },
    })).toBe(1);
    expect(await prisma.idempotencyRecord.count({
      where: {
        unitId: singleScenario.unitId,
        action: "APPOINTMENT_CHECKOUT",
        idempotencyKey: singleKey,
        status: "SUCCEEDED",
      },
    })).toBe(1);
  });

  it("registra atraso com replay idempotente sem duplicar historico nem alterar horario/status", async () => {
    const app = createApp();
    const scenario = await createScenario();
    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: scenario.unitId,
        clientId: scenario.clientId,
        professionalId: scenario.professionalId,
        serviceId: scenario.serviceId,
        startsAt: "2026-05-10T13:00:00.000Z",
        changedBy: "db-test",
      },
    });
    expect(created.statusCode).toBe(200);
    const before = created.json().appointment;
    const idempotencyKey = uniqueId("delay-db-replay");
    const payload = {
      minutesLate: 17,
      changedBy: "db-test",
      reason: "Cliente avisou",
    };

    const first = await app.inject({
      method: "POST",
      url: `/appointments/${before.id}/delay`,
      headers: { "idempotency-key": idempotencyKey },
      payload,
    });
    const replay = await app.inject({
      method: "POST",
      url: `/appointments/${before.id}/delay`,
      headers: { "idempotency-key": idempotencyKey },
      payload,
    });

    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(first.json().appointment.status).toBe(before.status);
    expect(first.json().appointment.startsAt).toBe(before.startsAt);
    expect(first.json().appointment.endsAt).toBe(before.endsAt);
    const history = await prisma.appointmentHistory.findMany({
      where: { appointmentId: before.id, action: "DELAY_RECORDED" },
      orderBy: { changedAt: "asc" },
    });
    expect(history).toHaveLength(1);
    expect(history[0].reason).toContain("17 minutos de atraso");
    expect(history[0].changedBy).toBe("db-test");
    expect(await prisma.auditLog.count({
      where: { unitId: scenario.unitId, action: "APPOINTMENT_DELAY_RECORDED", entityId: before.id },
    })).toBe(1);
    expect(await prisma.idempotencyRecord.count({
      where: { unitId: scenario.unitId, action: "APPOINTMENT_DELAY_RECORDED", idempotencyKey },
    })).toBe(1);
    const idempotencyRecord = await prisma.idempotencyRecord.findUnique({
      where: {
        unitId_action_idempotencyKey: {
          unitId: scenario.unitId,
          action: "APPOINTMENT_DELAY_RECORDED",
          idempotencyKey,
        },
      },
    });
    expect(idempotencyRecord?.status).toBe("SUCCEEDED");
    expect(idempotencyRecord?.resolution).toBe(before.id);
    expect(idempotencyRecord?.responseJson).toMatchObject({
      id: before.id,
      status: before.status,
      startsAt: before.startsAt,
      endsAt: before.endsAt,
    });
  });

  it("conclui checkout Prisma com produto vinculado sem duplicar receita ou estoque no replay", async () => {
    const app = createApp();
    const scenario = await createScenario();
    await prisma.commissionRule.deleteMany({
      where: { professionalId: scenario.professionalId, appliesTo: "PRODUCT" },
    });
    const appointmentId = await createAppointment(
      app,
      scenario,
      "2026-05-27T13:00:00.000Z",
    );

    const idempotencyKey = uniqueId("checkout-appointment-product");
    const payload = {
      changedBy: "db-test",
      completedAt: "2026-05-27T13:45:00.000Z",
      paymentMethod: "PIX",
      expectedTotal: 125,
      products: [{ productId: scenario.productId, quantity: 1 }],
    };
    const checkout = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: { "idempotency-key": idempotencyKey },
      payload,
    });
    expect(checkout.statusCode).toBe(200);
    expect(checkout.json().serviceRevenue.amount).toBe(125);
    expect(checkout.json().sale.appointmentId).toBe(appointmentId);
    expect(checkout.json().commissions).toHaveLength(1);

    const replay = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: { "idempotency-key": idempotencyKey },
      payload,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().serviceRevenue.id).toBe(checkout.json().serviceRevenue.id);

    const [serviceRevenues, productRevenues, sales, product, stockMovements] = await Promise.all([
      prisma.financialEntry.findMany({
        where: {
          unitId: scenario.unitId,
          kind: "INCOME",
          source: "SERVICE",
          referenceType: "APPOINTMENT",
          referenceId: appointmentId,
        },
      }),
      prisma.financialEntry.findMany({
        where: {
          unitId: scenario.unitId,
          kind: "INCOME",
          source: "PRODUCT",
        },
      }),
      prisma.productSale.findMany({ where: { unitId: scenario.unitId, appointmentId } }),
      prisma.product.findUniqueOrThrow({ where: { id: scenario.productId } }),
      prisma.stockMovement.findMany({
        where: { unitId: scenario.unitId, productId: scenario.productId, referenceType: "PRODUCT_SALE" },
      }),
    ]);
    expect(serviceRevenues).toHaveLength(1);
    expect(Number(serviceRevenues[0].amount)).toBe(125);
    expect(productRevenues).toHaveLength(0);
    expect(sales).toHaveLength(1);
    expect(product.stockQty).toBe(0);
    expect(stockMovements).toHaveLength(1);
  });

  it("conclui checkout Prisma single-service sem criar comissao quando nao ha regra ativa", async () => {
    const app = createApp();
    const scenario = await createScenario();
    await prisma.commissionRule.deleteMany({ where: { professionalId: scenario.professionalId } });
    const appointmentId = await createAppointment(
      app,
      scenario,
      "2026-05-27T16:00:00.000Z",
    );

    const idempotencyKey = uniqueId("checkout-single-no-commission");
    const checkout = await checkoutAppointment(app, appointmentId, idempotencyKey);
    expect(checkout.statusCode).toBe(200);
    expect(checkout.json().appointment.status).toBe("COMPLETED");
    expect(checkout.json().serviceRevenue.amount).toBe(75);
    expect(checkout.json().commissions).toHaveLength(0);

    const replay = await checkoutAppointment(app, appointmentId, idempotencyKey);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().serviceRevenue.id).toBe(checkout.json().serviceRevenue.id);
    expect(replay.json().commissions).toHaveLength(0);
    expect(await prisma.financialEntry.count({
      where: { unitId: scenario.unitId, referenceId: appointmentId, source: "SERVICE" },
    })).toBe(1);
    expect(await prisma.commissionEntry.count({ where: { unitId: scenario.unitId } })).toBe(0);
  });

  it("conclui checkout Prisma multi-servico sem criar comissao quando nao ha regra ativa", async () => {
    const app = createApp();
    const scenario = await createMultiServiceScenario();
    await prisma.commissionRule.deleteMany({ where: { professionalId: scenario.professionalId } });
    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: scenario.unitId,
        clientId: scenario.clientId,
        professionalId: scenario.professionalId,
        serviceIds: [scenario.corteId, scenario.barbaId],
        startsAt: "2026-05-27T17:00:00.000Z",
        changedBy: "db-test",
      },
    });
    expect(created.statusCode).toBe(200);
    const appointmentId = created.json().appointment.id as string;
    for (const status of ["CONFIRMED", "IN_SERVICE"]) {
      const response = await app.inject({
        method: "PATCH",
        url: `/appointments/${appointmentId}/status`,
        headers: { "idempotency-key": `${status.toLowerCase()}-status-db-004` },
        payload: { status, changedBy: "db-test" },
      });
      expect(response.statusCode).toBe(200);
    }

    const idempotencyKey = uniqueId("checkout-multi-no-commission");
    const payload = {
      changedBy: "db-test",
      completedAt: "2026-05-27T17:45:00.000Z",
      paymentMethod: "PIX",
      expectedTotal: 50,
    };
    const checkout = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: { "idempotency-key": idempotencyKey },
      payload,
    });
    expect(checkout.statusCode).toBe(200);
    expect(checkout.json().serviceRevenue.amount).toBe(50);
    expect(checkout.json().commissions).toHaveLength(0);

    const replay = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: { "idempotency-key": idempotencyKey },
      payload,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().serviceRevenue.id).toBe(checkout.json().serviceRevenue.id);
    expect(replay.json().commissions).toHaveLength(0);
    expect(await prisma.financialEntry.count({
      where: { unitId: scenario.unitId, referenceId: appointmentId, source: "SERVICE" },
    })).toBe(1);
    expect(await prisma.commissionEntry.count({ where: { unitId: scenario.unitId } })).toBe(0);
  });

  it("conclui checkout Prisma com produto sem criar comissao quando nao ha regra ativa", async () => {
    const app = createApp();
    const scenario = await createScenario();
    await prisma.commissionRule.deleteMany({ where: { professionalId: scenario.professionalId } });
    const appointmentId = await createAppointment(
      app,
      scenario,
      "2026-05-27T18:00:00.000Z",
    );

    const idempotencyKey = uniqueId("checkout-product-no-commission");
    const payload = {
      changedBy: "db-test",
      completedAt: "2026-05-27T18:45:00.000Z",
      paymentMethod: "PIX",
      expectedTotal: 125,
      products: [{ productId: scenario.productId, quantity: 1 }],
    };
    const checkout = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: { "idempotency-key": idempotencyKey },
      payload,
    });
    expect(checkout.statusCode).toBe(200);
    expect(checkout.json().serviceRevenue.amount).toBe(125);
    expect(checkout.json().sale.appointmentId).toBe(appointmentId);
    expect(checkout.json().commissions).toHaveLength(0);

    const replay = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: { "idempotency-key": idempotencyKey },
      payload,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().serviceRevenue.id).toBe(checkout.json().serviceRevenue.id);
    expect(replay.json().commissions).toHaveLength(0);
    expect(await prisma.productSale.count({ where: { unitId: scenario.unitId, appointmentId } })).toBe(1);
    expect(await prisma.stockMovement.count({
      where: { unitId: scenario.unitId, productId: scenario.productId, referenceType: "PRODUCT_SALE" },
    })).toBe(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: scenario.productId } })).stockQty).toBe(0);
    expect(await prisma.commissionEntry.count({ where: { unitId: scenario.unitId } })).toBe(0);
  });
  it("faz rollback do checkout Prisma sem pagamento, total divergente ou estoque insuficiente", async () => {
    const app = createApp();
    const missingPaymentScenario = await createScenario();
    const missingPaymentAppointment = await createAppointment(
      app,
      missingPaymentScenario,
      "2026-05-28T13:00:00.000Z",
    );
    const missingPayment = await app.inject({
      method: "POST",
      url: `/appointments/${missingPaymentAppointment}/checkout`,
      headers: { "idempotency-key": uniqueId("checkout-missing-payment") },
      payload: {
        changedBy: "db-test",
        completedAt: "2026-05-28T13:45:00.000Z",
        paymentMethod: "",
        expectedTotal: 75,
      },
    });
    expect(missingPayment.statusCode).toBe(400);
    expect(await prisma.appointment.findUniqueOrThrow({ where: { id: missingPaymentAppointment } })).toMatchObject({
      status: "IN_SERVICE",
    });
    expect(await prisma.financialEntry.count({ where: { unitId: missingPaymentScenario.unitId } })).toBe(0);
    expect(await prisma.commissionEntry.count({ where: { unitId: missingPaymentScenario.unitId } })).toBe(0);

    const divergentScenario = await createScenario();
    const divergentAppointment = await createAppointment(
      app,
      divergentScenario,
      "2026-05-28T15:00:00.000Z",
    );
    const divergent = await app.inject({
      method: "POST",
      url: `/appointments/${divergentAppointment}/checkout`,
      headers: { "idempotency-key": uniqueId("checkout-divergent-total") },
      payload: {
        changedBy: "db-test",
        completedAt: "2026-05-28T15:45:00.000Z",
        paymentMethod: "PIX",
        expectedTotal: 999,
      },
    });
    expect(divergent.statusCode).toBe(400);
    expect(await prisma.appointment.findUniqueOrThrow({ where: { id: divergentAppointment } })).toMatchObject({
      status: "IN_SERVICE",
    });
    expect(await prisma.financialEntry.count({ where: { unitId: divergentScenario.unitId } })).toBe(0);
    expect(await prisma.commissionEntry.count({ where: { unitId: divergentScenario.unitId } })).toBe(0);

    const stockScenario = await createScenario();
    const stockAppointment = await createAppointment(
      app,
      stockScenario,
      "2026-05-28T17:00:00.000Z",
    );
    const insufficientStock = await app.inject({
      method: "POST",
      url: `/appointments/${stockAppointment}/checkout`,
      headers: { "idempotency-key": uniqueId("checkout-insufficient-stock") },
      payload: {
        changedBy: "db-test",
        completedAt: "2026-05-28T17:45:00.000Z",
        paymentMethod: "PIX",
        expectedTotal: 175,
        products: [{ productId: stockScenario.productId, quantity: 2 }],
      },
    });
    expect(insufficientStock.statusCode).toBe(400);
    expect(await prisma.appointment.findUniqueOrThrow({ where: { id: stockAppointment } })).toMatchObject({
      status: "IN_SERVICE",
    });
    expect(await prisma.financialEntry.count({ where: { unitId: stockScenario.unitId } })).toBe(0);
    expect(await prisma.commissionEntry.count({ where: { unitId: stockScenario.unitId } })).toBe(0);
    expect(await prisma.productSale.count({ where: { unitId: stockScenario.unitId } })).toBe(0);
    expect(await prisma.stockMovement.count({ where: { unitId: stockScenario.unitId } })).toBe(0);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: stockScenario.productId } })).stockQty).toBe(1);
  });

  it("quita checkout Prisma aberto com pagamento complementar sem criar segundo checkout", async () => {
    const app = createApp();
    const scenario = await createScenario();
    const appointmentId = await createAppointment(app, scenario, "2026-05-24T13:00:00.000Z");

    const partial = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: { "idempotency-key": uniqueId("checkout-partial-open") },
      payload: {
        changedBy: "db-test",
        completedAt: "2026-05-24T13:45:00.000Z",
        paymentMethod: "PIX",
        payments: [{ method: "PIX", amount: 20, responsible: "db-test" }],
      },
    });
    expect(partial.statusCode).toBe(200);
    expect(partial.json().appointment.status).toBe("IN_SERVICE");
    expect(partial.json().checkout).toMatchObject({ status: "OPEN", paidAmount: 20 });
    expect(partial.json().serviceRevenue).toBeUndefined();

    const pendingClosing = await app.inject({
      method: "POST",
      url: "/financial/daily-closing",
      headers: { "idempotency-key": uniqueId("daily-closing-pending") },
      payload: {
        unitId: scenario.unitId,
        businessDate: "2026-05-24",
        informedCash: 0,
        informedPix: 0,
        informedDebit: 0,
        informedCredit: 0,
        notes: "Tentativa com checkout parcial",
        responsible: "db-test",
      },
    });
    expect([400, 409]).toContain(pendingClosing.statusCode);
    expect(pendingClosing.json().error).toMatch(
      /fechamento bloqueado|atendimento.*andamento|checkout.*aberto|pagamento.*pendente/i,
    );

    const complement = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: { "idempotency-key": uniqueId("checkout-partial-complement") },
      payload: {
        changedBy: "db-test",
        completedAt: "2026-05-24T13:50:00.000Z",
        paymentMethod: "PIX",
        payments: [{ method: "PIX", amount: 55, responsible: "db-test" }],
      },
    });
    expect(complement.statusCode).toBe(200);
    expect(complement.json().appointment.status).toBe("COMPLETED");
    expect(complement.json().checkout.id).toBe(partial.json().checkout.id);
    expect(complement.json().checkout).toMatchObject({ status: "PAID", paidAmount: 75 });
    expect(complement.json().payments).toHaveLength(2);
    expect(complement.json().serviceRevenue.amount).toBe(75);

    await expect(prisma.appointmentCheckout.count({ where: { appointmentId } })).resolves.toBe(1);
    await expect(
      prisma.financialEntry.count({
        where: { unitId: scenario.unitId, referenceType: "APPOINTMENT", referenceId: appointmentId },
      }),
    ).resolves.toBe(1);
  });

  it("estorna atendimento Prisma com produto devolvendo estoque e cancelando comissoes pendentes", async () => {
    const app = createApp();
    const scenario = await createScenario();
    const appointmentId = await createAppointment(
      app,
      scenario,
      "2026-05-29T13:00:00.000Z",
    );
    const checkout = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: { "idempotency-key": uniqueId("checkout-refund-with-product") },
      payload: {
        changedBy: "db-test",
        completedAt: "2026-05-29T13:45:00.000Z",
        paymentMethod: "PIX",
        expectedTotal: 125,
        products: [{ productId: scenario.productId, quantity: 1 }],
      },
    });
    expect(checkout.statusCode).toBe(200);
    expect(checkout.json().commissions).toHaveLength(2);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: scenario.productId } })).stockQty).toBe(0);

    const payload = {
      unitId: scenario.unitId,
      changedBy: "db-test",
      reason: "Estorno integral com produto no atendimento",
      refundedAt: "2026-05-29T14:30:00.000Z",
    };
    const idempotencyKey = uniqueId("appointment-refund-with-product");
    const refund = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/refund`,
      headers: { "idempotency-key": idempotencyKey },
      payload,
    });
    expect(refund.statusCode).toBe(200);
    expect(refund.json().canceledCommissions).toHaveLength(2);
    expect(refund.json().stockMovements).toHaveLength(1);

    const replay = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/refund`,
      headers: { "idempotency-key": idempotencyKey },
      payload,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().refund.id).toBe(refund.json().refund.id);

    const productSale = await prisma.productSale.findFirstOrThrow({
      where: { unitId: scenario.unitId, appointmentId },
    });
    const [refunds, refundItems, refundExpenses, stockMovements, product, canceledCommissions] = await Promise.all([
      prisma.refund.findMany({ where: { unitId: scenario.unitId, appointmentId } }),
      prisma.refundItem.findMany({ where: { refundId: refund.json().refund.id } }),
      prisma.financialEntry.findMany({
        where: {
          unitId: scenario.unitId,
          kind: "EXPENSE",
          source: "REFUND",
          referenceType: "APPOINTMENT_REFUND",
        },
      }),
      prisma.stockMovement.findMany({
        where: {
          unitId: scenario.unitId,
          productId: scenario.productId,
          movementType: "IN",
          referenceType: "PRODUCT_REFUND",
        },
      }),
      prisma.product.findUniqueOrThrow({ where: { id: scenario.productId } }),
      prisma.commissionEntry.findMany({ where: { unitId: scenario.unitId, status: "CANCELED" } }),
    ]);
    expect(refunds).toHaveLength(1);
    expect(refunds[0].productSaleId).toBe(productSale.id);
    expect(refundItems).toHaveLength(1);
    expect(refundExpenses).toHaveLength(1);
    expect(stockMovements).toHaveLength(1);
    expect(product.stockQty).toBe(1);
    expect(canceledCommissions).toHaveLength(2);
  });

  it("valida booking publico multi-servico Prisma com compatibilidade e contrato do backend", async () => {
    const app = createApp();
    const scenario = await createMultiServiceScenario();

    const legacy = await app.inject({
      method: "POST",
      url: "/public/booking",
      payload: {
        unitId: scenario.unitId,
        clientName: "Cliente Publico Um",
        clientPhone: "11900000001",
        serviceId: scenario.corteId,
        startsAt: "2026-05-27T09:00:00.000Z",
      },
    });
    expect(legacy.statusCode).toBe(201);
    const legacyRow = await prisma.appointment.findUniqueOrThrow({
      where: { id: legacy.json().id },
      include: { serviceItems: true },
    });
    expect(legacyRow.serviceId).toBe(scenario.corteId);
    expect(legacyRow.serviceItems).toHaveLength(1);
    expect(Number(legacyRow.totalPriceSnapshot)).toBe(30);

    await prisma.businessSettings.update({
      where: { unitId: scenario.unitId },
      data: { bufferBetweenAppointmentsMinutes: 10 },
    });

    const multiIdempotencyKey = uniqueId("public-booking-multi");
    const multi = await app.inject({
      method: "POST",
      url: "/public/booking",
      payload: {
        unitId: scenario.unitId,
        clientName: "Cliente Publico Dois",
        clientPhone: "11900000002",
        serviceIds: [scenario.corteId, scenario.barbaId],
        idempotencyKey: multiIdempotencyKey,
        startsAt: "2026-05-27T10:00:00.000Z",
        totalPriceSnapshot: 1,
        effectiveDurationMinSnapshot: 1,
      },
    });
    expect(multi.statusCode).toBe(201);
    const multiRow = await prisma.appointment.findUniqueOrThrow({
      where: { id: multi.json().id },
      include: { serviceItems: { orderBy: { position: "asc" } } },
    });
    expect(multiRow.serviceItems.map((item) => item.serviceId)).toEqual([scenario.corteId, scenario.barbaId]);
    expect(Number(multiRow.totalPriceSnapshot)).toBe(50);
    expect(multiRow.effectiveDurationMinSnapshot).toBe(45);
    expect(multiRow.durationCalculationMode).toBe("COMBINATION_RULE");
    expect(multiRow.endsAt.toISOString()).toBe("2026-05-27T10:45:00.000Z");
    const publicBufferConflictBefore = await prisma.appointment.count({ where: { unitId: scenario.unitId } });
    const publicBufferConflict = await app.inject({
      method: "POST",
      url: "/public/booking",
      payload: {
        unitId: scenario.unitId,
        clientName: "Cliente Publico Buffer",
        clientPhone: "11900000020",
        serviceId: scenario.hidratacaoId,
        startsAt: "2026-05-27T10:50:00.000Z",
      },
    });
    expect(publicBufferConflict.statusCode).toBe(409);
    expect(await prisma.appointment.count({ where: { unitId: scenario.unitId } })).toBe(publicBufferConflictBefore);
    const countAfterMulti = await prisma.appointment.count({ where: { unitId: scenario.unitId } });
    const replay = await app.inject({
      method: "POST",
      url: "/public/booking",
      payload: {
        unitId: scenario.unitId,
        clientName: "Cliente Publico Dois",
        clientPhone: "11900000002",
        serviceIds: [scenario.corteId, scenario.barbaId],
        idempotencyKey: multiIdempotencyKey,
        startsAt: "2026-05-27T10:00:00.000Z",
      },
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json().id).toBe(multi.json().id);
    expect(replay.json().serviceIds).toEqual([scenario.corteId, scenario.barbaId]);
    expect(await prisma.appointment.count({ where: { unitId: scenario.unitId } })).toBe(countAfterMulti);

    const reversedIdempotencyKey = uniqueId("public-booking-reversed");
    const reversed = await app.inject({
      method: "POST",
      url: "/public/booking",
      payload: {
        unitId: scenario.unitId,
        clientName: "Cliente Publico Tres",
        clientPhone: "11900000003",
        serviceIds: [scenario.barbaId, scenario.corteId],
        idempotencyKey: reversedIdempotencyKey,
        startsAt: "2026-05-27T11:00:00.000Z",
      },
    });
    expect(reversed.statusCode).toBe(201);
    expect(reversed.json().serviceIds).toEqual([scenario.barbaId, scenario.corteId]);
    const reversedPublicRow = await prisma.appointment.findUniqueOrThrow({
      where: { id: reversed.json().id },
      include: { serviceItems: { orderBy: { position: "asc" } } },
    });
    expect(reversedPublicRow.serviceItems.map((item) => item.serviceId)).toEqual([
      scenario.barbaId,
      scenario.corteId,
    ]);
    expect(reversedPublicRow.serviceItems.map((item) => item.position)).toEqual([0, 1]);
    expect(Number(reversedPublicRow.totalPriceSnapshot)).toBe(50);
    expect(reversedPublicRow.effectiveDurationMinSnapshot).toBe(45);
    expect(reversedPublicRow.durationCalculationMode).toBe("COMBINATION_RULE");
    expect(reversedPublicRow.endsAt.toISOString()).toBe("2026-05-27T11:45:00.000Z");
    const countAfterReversed = await prisma.appointment.count({ where: { unitId: scenario.unitId } });
    const reversedReplay = await app.inject({
      method: "POST",
      url: "/public/booking",
      payload: {
        unitId: scenario.unitId,
        clientName: "Cliente Publico Tres",
        clientPhone: "11900000003",
        serviceIds: [scenario.barbaId, scenario.corteId],
        idempotencyKey: reversedIdempotencyKey,
        startsAt: "2026-05-27T11:00:00.000Z",
      },
    });
    expect(reversedReplay.statusCode).toBe(201);
    expect(reversedReplay.json().id).toBe(reversed.json().id);
    expect(reversedReplay.json().serviceIds).toEqual([scenario.barbaId, scenario.corteId]);
    expect(await prisma.appointment.count({ where: { unitId: scenario.unitId } })).toBe(countAfterReversed);

    const divergentReplay = await app.inject({
      method: "POST",
      url: "/public/booking",
      payload: {
        unitId: scenario.unitId,
        clientName: "Cliente Publico Dois",
        clientPhone: "11900000002",
        serviceIds: [scenario.corteId, scenario.barbaId],
        idempotencyKey: multiIdempotencyKey,
        startsAt: "2026-05-27T11:00:00.000Z",
      },
    });
    expect(divergentReplay.statusCode).toBe(409);
    expect(await prisma.appointment.count({ where: { unitId: scenario.unitId } })).toBe(countAfterReversed);

    const bothContracts = await app.inject({
      method: "POST",
      url: "/public/booking",
      payload: {
        unitId: scenario.unitId,
        clientName: "Cliente Publico Quatro",
        clientPhone: "11900000004",
        serviceId: scenario.corteId,
        serviceIds: [scenario.corteId, scenario.barbaId],
        startsAt: "2026-05-27T12:00:00.000Z",
      },
    });
    expect(bothContracts.statusCode).toBe(400);

    const incompatibleBefore = await prisma.appointment.count({ where: { unitId: scenario.unitId } });
    const incompatible = await app.inject({
      method: "POST",
      url: "/public/booking",
      payload: {
        unitId: scenario.unitId,
        clientName: "Cliente Publico Cinco",
        clientPhone: "11900000005",
        serviceIds: [scenario.corteId, scenario.barbaId],
        professionalId: scenario.partialProfessionalId,
        startsAt: "2026-05-27T12:00:00.000Z",
      },
    });
    expect(incompatible.statusCode).toBe(400);
    expect(await prisma.appointment.count({ where: { unitId: scenario.unitId } })).toBe(incompatibleBefore);

    const conflictBefore = await prisma.appointment.count({ where: { unitId: scenario.unitId } });
    const conflict = await app.inject({
      method: "POST",
      url: "/public/booking",
      payload: {
        unitId: scenario.unitId,
        clientName: "Cliente Publico Cinco",
        clientPhone: "11900000005",
        serviceId: scenario.hidratacaoId,
        startsAt: "2026-05-27T10:30:00.000Z",
      },
    });
    expect(conflict.statusCode).toBe(409);
    expect(await prisma.appointment.count({ where: { unitId: scenario.unitId } })).toBe(conflictBefore);
  });

  it("normaliza defaultCommissionRate no Prisma antes de persistir", async () => {
    const app = createApp();
    const scenario = await createScenario();

    const decimal = await app.inject({
      method: "POST",
      url: "/services",
      payload: {
        unitId: scenario.unitId,
        name: uniqueId("Servico decimal"),
        price: 30,
        durationMinutes: 20,
        defaultCommissionRate: 0.3,
      },
    });
    expect(decimal.statusCode).toBe(200);
    expect(decimal.json().service.defaultCommissionRate).toBe(30);
    const decimalRow = await prisma.service.findUniqueOrThrow({
      where: { id: decimal.json().service.id },
    });
    expect(Number(decimalRow.defaultCommissionRate)).toBe(0.3);

    const percent = await app.inject({
      method: "POST",
      url: "/services",
      payload: {
        unitId: scenario.unitId,
        name: uniqueId("Servico percentual"),
        price: 40,
        durationMinutes: 25,
        defaultCommissionRate: 30,
      },
    });
    expect(percent.statusCode).toBe(200);
    const percentRow = await prisma.service.findUniqueOrThrow({
      where: { id: percent.json().service.id },
    });
    expect(Number(percentRow.defaultCommissionRate)).toBe(0.3);

    const full = await app.inject({
      method: "POST",
      url: "/services",
      payload: {
        unitId: scenario.unitId,
        name: uniqueId("Servico integral"),
        price: 50,
        durationMinutes: 30,
        defaultCommissionRate: 100,
      },
    });
    expect(full.statusCode).toBe(200);
    const fullRow = await prisma.service.findUniqueOrThrow({
      where: { id: full.json().service.id },
    });
    expect(Number(fullRow.defaultCommissionRate)).toBe(1);

    const invalidHigh = await app.inject({
      method: "POST",
      url: "/services",
      payload: {
        unitId: scenario.unitId,
        name: uniqueId("Servico invalido alto"),
        price: 50,
        durationMinutes: 30,
        defaultCommissionRate: 150,
      },
    });
    expect(invalidHigh.statusCode).toBe(400);

    const invalidNegative = await app.inject({
      method: "POST",
      url: "/services",
      payload: {
        unitId: scenario.unitId,
        name: uniqueId("Servico invalido negativo"),
        price: 50,
        durationMinutes: 30,
        defaultCommissionRate: -10,
      },
    });
    expect(invalidNegative.statusCode).toBe(400);
  });

  it("autentica usuario persistente do Prisma e emite token com identidade e unidades", async () => {
    process.env.AUTH_ENFORCED = "true";
    const app = createApp();
    const scenario = await createScenario();
    const email = `${uniqueId("owner")}@barbearia.local`;
    const userId = await createPersistentUser({
      email,
      password: "owner-db-123",
      role: "owner",
      unitIds: [scenario.unitId],
    });

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email,
        password: "owner-db-123",
        activeUnitId: scenario.unitId,
      },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().user).toMatchObject({
      id: userId,
      email,
      role: "owner",
      unitIds: [scenario.unitId],
      activeUnitId: scenario.unitId,
    });

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${login.json().accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user).toMatchObject({
      id: userId,
      email,
      role: "owner",
      unitIds: [scenario.unitId],
      activeUnitId: scenario.unitId,
    });
    process.env.AUTH_ENFORCED = "false";
  });

  it("bloqueia login Prisma de usuario inativo e activeUnitId nao autorizado", async () => {
    process.env.AUTH_ENFORCED = "true";
    const app = createApp();
    const scenario = await createScenario();
    const other = await createScenario();
    const inactiveEmail = `${uniqueId("inactive")}@barbearia.local`;
    const activeEmail = `${uniqueId("active")}@barbearia.local`;
    await createPersistentUser({
      email: inactiveEmail,
      password: "inactive-db-123",
      role: "recepcao",
      unitIds: [scenario.unitId],
      isActive: false,
    });
    await createPersistentUser({
      email: activeEmail,
      password: "active-db-123",
      role: "recepcao",
      unitIds: [scenario.unitId],
    });

    const inactive = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: inactiveEmail,
        password: "inactive-db-123",
        activeUnitId: scenario.unitId,
      },
    });
    expect(inactive.statusCode).toBe(401);

    const unauthorizedUnit = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: activeEmail,
        password: "active-db-123",
        activeUnitId: other.unitId,
      },
    });
    expect(unauthorizedUnit.statusCode).toBe(403);
    process.env.AUTH_ENFORCED = "false";
  });

  it("aplica tenant guard Prisma em unitId de query e body", async () => {
    process.env.AUTH_ENFORCED = "true";
    const app = createApp();
    const scenario = await createScenario();
    const other = await createScenario();
    const email = `${uniqueId("tenant")}@barbearia.local`;
    await createPersistentUser({
      email,
      password: "tenant-db-123",
      role: "recepcao",
      unitIds: [scenario.unitId],
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email,
        password: "tenant-db-123",
        activeUnitId: scenario.unitId,
      },
    });
    expect(login.statusCode).toBe(200);
    const headers = { authorization: `Bearer ${login.json().accessToken}` };

    const query = await app.inject({
      method: "GET",
      url: `/dashboard?unitId=${other.unitId}&date=2026-05-10T00:00:00.000Z`,
      headers,
    });
    expect(query.statusCode).toBe(403);

    const body = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: {
        unitId: other.unitId,
        clientId: other.clientId,
        professionalId: other.professionalId,
        serviceId: other.serviceId,
        startsAt: "2026-05-10T13:00:00.000Z",
      },
    });
    expect(body.statusCode).toBe(403);
    process.env.AUTH_ENFORCED = "false";
  });

  it("persiste agendamento e conclusao com receita", async () => {
    const app = createApp();
    const scenario = await createScenario();
    const appointmentId = await createAppointment(
      app,
      scenario,
      "2026-05-10T13:00:00.000Z",
    );

    const checkout = await checkoutAppointment(app, appointmentId, uniqueId("checkout-db"));

    expect(checkout.statusCode).toBe(200);
    expect(checkout.json().appointment.status).toBe("COMPLETED");

    const persisted = await prisma.financialEntry.findFirst({
      where: {
        unitId: scenario.unitId,
        referenceId: appointmentId,
        source: "SERVICE",
      },
    });
    expect(persisted).not.toBeNull();
  });

  it("bloqueia /complete legado no Prisma sem efeitos financeiros", async () => {
    const app = createApp();
    const scenario = await createScenario();
    const appointmentId = await createAppointment(
      app,
      scenario,
      "2026-05-10T14:00:00.000Z",
    );

    const complete = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/complete`,
      payload: {
        changedBy: "db-test",
        completedAt: "2026-05-10T14:45:00.000Z",
      },
    });
    expect(complete.statusCode).toBe(410);

    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
    });
    expect(appointment.status).toBe("IN_SERVICE");

    const serviceRevenueCount = await prisma.financialEntry.count({
      where: {
        unitId: scenario.unitId,
        referenceId: appointmentId,
        source: "SERVICE",
      },
    });
    expect(serviceRevenueCount).toBe(0);

    const commissionCount = await prisma.commissionEntry.count({
      where: { appointmentId },
    });
    expect(commissionCount).toBe(0);
  });

  it("aplica RBAC do checkout no Prisma para owner, recepcao e profissional sem duplicar efeitos", async () => {
    process.env.AUTH_ENFORCED = "true";
    const scenario = await createScenario();
    const app = createApp();
    const ownerEmail = `${uniqueId("owner-checkout")}@barbearia.local`;
    const receptionEmail = `${uniqueId("reception-checkout")}@barbearia.local`;
    const professionalEmail = `${uniqueId("professional-checkout")}@barbearia.local`;
    await createPersistentUser({
      email: ownerEmail,
      password: "owner-checkout-db-123",
      role: "owner",
      unitIds: [scenario.unitId],
    });
    await createPersistentUser({
      email: receptionEmail,
      password: "reception-checkout-db-123",
      role: "recepcao",
      unitIds: [scenario.unitId],
    });
    await createPersistentUser({
      email: professionalEmail,
      password: "professional-checkout-db-123",
      role: "profissional",
      unitIds: [scenario.unitId],
    });

    const login = async (email: string, password: string, expectedRole: "owner" | "recepcao" | "profissional") => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password, activeUnitId: scenario.unitId },
      });
      expect(response.statusCode).toBe(200);
      const headers = { authorization: `Bearer ${response.json().accessToken}` };
      const me = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers,
      });
      expect(me.statusCode).toBe(200);
      expect(me.json().user.role).toBe(expectedRole);
      return headers;
    };

    const ownerHeaders = await login(ownerEmail, "owner-checkout-db-123", "owner");
    const receptionHeaders = await login(receptionEmail, "reception-checkout-db-123", "recepcao");
    const professionalHeaders = await login(professionalEmail, "professional-checkout-db-123", "profissional");

    const ownerCreated = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: ownerHeaders,
      payload: {
        unitId: scenario.unitId,
        clientId: scenario.clientId,
        professionalId: scenario.professionalId,
        serviceId: scenario.serviceId,
        startsAt: "2026-05-10T14:00:00.000Z",
      },
    });
    expect(ownerCreated.statusCode).toBe(200);
    const ownerAppointmentId = ownerCreated.json().appointment.id as string;

    for (const status of ["CONFIRMED", "IN_SERVICE"]) {
      const response = await app.inject({
        method: "PATCH",
        url: `/appointments/${ownerAppointmentId}/status`,
        headers: {
          ...ownerHeaders,
          "idempotency-key": uniqueId(`checkout-rbac-${status.toLowerCase()}`),
        },
        payload: { status },
      });
      expect(response.statusCode).toBe(200);
    }

    const ownerPayload = {
      completedAt: "2026-05-10T14:45:00.000Z",
      paymentMethod: "PIX",
      expectedTotal: 75,
    };
    const ownerIdempotencyKey = uniqueId("checkout-owner-allowed");
    const ownerCheckout = await app.inject({
      method: "POST",
      url: `/appointments/${ownerAppointmentId}/checkout`,
      headers: {
        ...ownerHeaders,
        "idempotency-key": ownerIdempotencyKey,
      },
      payload: ownerPayload,
    });
    expect(ownerCheckout.statusCode).toBe(200);
    expect(ownerCheckout.json().appointment.status).toBe("COMPLETED");
    expect(ownerCheckout.json().commissions).toHaveLength(1);

    const ownerReplay = await app.inject({
      method: "POST",
      url: `/appointments/${ownerAppointmentId}/checkout`,
      headers: {
        ...ownerHeaders,
        "idempotency-key": ownerIdempotencyKey,
      },
      payload: ownerPayload,
    });
    expect(ownerReplay.statusCode).toBe(200);
    expect(ownerReplay.json().serviceRevenue.id).toBe(ownerCheckout.json().serviceRevenue.id);
    expect(ownerReplay.json().commissions[0].id).toBe(ownerCheckout.json().commissions[0].id);
    await expectSingleCheckoutSideEffects(scenario.unitId, ownerAppointmentId);

    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: ownerHeaders,
      payload: {
        unitId: scenario.unitId,
        clientId: scenario.clientId,
        professionalId: scenario.professionalId,
        serviceId: scenario.serviceId,
        startsAt: "2026-05-10T15:00:00.000Z",
      },
    });
    expect(created.statusCode).toBe(200);
    const appointmentId = created.json().appointment.id as string;

    const confirmed = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      headers: {
        ...ownerHeaders,
        "idempotency-key": uniqueId("checkout-rbac-denied-confirm"),
      },
      payload: { status: "CONFIRMED" },
    });
    expect(confirmed.statusCode).toBe(200);

    const inService = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      headers: {
        ...ownerHeaders,
        "idempotency-key": uniqueId("checkout-rbac-denied-start"),
      },
      payload: { status: "IN_SERVICE" },
    });
    expect(inService.statusCode).toBe(200);

    const professionalCompleteByStatus = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      headers: {
        ...professionalHeaders,
        "idempotency-key": uniqueId("checkout-rbac-professional-complete"),
      },
      payload: { status: "COMPLETED" },
    });
    expect(professionalCompleteByStatus.statusCode).toBe(400);

    const professionalCheckout = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: {
        ...professionalHeaders,
        "idempotency-key": uniqueId("checkout-professional-denied"),
      },
      payload: {
        completedAt: "2026-05-10T15:45:00.000Z",
        paymentMethod: "PIX",
      },
    });
    expect(professionalCheckout.statusCode).toBe(403);
    await expectSingleCheckoutSideEffects(scenario.unitId, ownerAppointmentId);
    const deniedAppointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
    });
    expect(deniedAppointment.status).toBe("IN_SERVICE");
    const deniedRevenueCount = await prisma.financialEntry.count({
      where: { unitId: scenario.unitId, referenceId: appointmentId, source: "SERVICE" },
    });
    expect(deniedRevenueCount).toBe(0);
    const deniedCommissionCount = await prisma.commissionEntry.count({
      where: { appointmentId },
    });
    expect(deniedCommissionCount).toBe(0);

    const legacyComplete = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/complete`,
      headers: ownerHeaders,
      payload: {
        completedAt: "2026-05-10T15:45:00.000Z",
      },
    });
    expect(legacyComplete.statusCode).toBe(410);

    const receptionPayload = {
      completedAt: "2026-05-10T15:45:00.000Z",
      paymentMethod: "PIX",
      expectedTotal: 75,
    };
    const receptionIdempotencyKey = uniqueId("checkout-reception-allowed");
    const receptionCheckout = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: {
        ...receptionHeaders,
        "idempotency-key": receptionIdempotencyKey,
      },
      payload: receptionPayload,
    });
    expect(receptionCheckout.statusCode).toBe(200);
    expect(receptionCheckout.json().appointment.status).toBe("COMPLETED");
    expect(receptionCheckout.json().commissions).toHaveLength(1);

    const receptionReplay = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: {
        ...receptionHeaders,
        "idempotency-key": receptionIdempotencyKey,
      },
      payload: receptionPayload,
    });
    expect(receptionReplay.statusCode).toBe(200);
    expect(receptionReplay.json().serviceRevenue.id).toBe(receptionCheckout.json().serviceRevenue.id);
    expect(receptionReplay.json().commissions[0].id).toBe(receptionCheckout.json().commissions[0].id);
    await expectSingleCheckoutSideEffects(scenario.unitId, appointmentId);
    process.env.AUTH_ENFORCED = "false";
  });

  it("cancela comissao pendente no estorno de atendimento e mantem idempotencia", async () => {
    const app = createApp();
    const scenario = await createScenario();
    const appointmentId = await createAppointment(
      app,
      scenario,
      "2026-05-12T13:00:00.000Z",
    );
    const checkout = await checkoutAppointment(app, appointmentId, uniqueId("checkout-refund-service"));
    expect(checkout.statusCode).toBe(200);
    expect(checkout.json().commissions).toHaveLength(1);
    const commissionId = checkout.json().commissions[0].id as string;

    const payload = {
      unitId: scenario.unitId,
      changedBy: "db-test",
      reason: "Estorno de atendimento cancela comissao DB",
      refundedAt: "2026-05-12T14:00:00.000Z",
    };
    const idempotencyKey = uniqueId("appointment-refund-commission");
    const refund = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/refund`,
      headers: {
        "idempotency-key": idempotencyKey,
        "x-correlation-id": uniqueId("corr-appointment-refund"),
      },
      payload,
    });
    expect(refund.statusCode).toBe(200);
    expect(refund.json().canceledCommissions).toHaveLength(1);
    expect(refund.json().canceledCommissions[0]).toMatchObject({
      id: commissionId,
      status: "CANCELED",
      appointmentId,
      paidAt: null,
    });

    const replay = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/refund`,
      headers: { "idempotency-key": idempotencyKey },
      payload,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().refund.id).toBe(refund.json().refund.id);
    expect(replay.json().canceledCommissions).toHaveLength(1);

    const commission = await prisma.commissionEntry.findUniqueOrThrow({
      where: { id: commissionId },
    });
    expect(commission.status).toBe("CANCELED");
    expect(commission.paidAt).toBeNull();

    const payCanceled = await app.inject({
      method: "PATCH",
      url: `/financial/commissions/${commissionId}/pay`,
      headers: { "idempotency-key": uniqueId("pay-canceled-appointment-commission") },
      payload: {
        unitId: scenario.unitId,
        changedBy: "db-test",
        paidAt: "2026-05-12T14:30:00.000Z",
      },
    });
    expect(payCanceled.statusCode).toBe(400);
    expect(payCanceled.json().error).toBe("Comissao cancelada nao pode ser paga");

    const serviceRevenue = await prisma.financialEntry.findMany({
      where: {
        unitId: scenario.unitId,
        source: "SERVICE",
        referenceType: "APPOINTMENT",
        referenceId: appointmentId,
      },
    });
    expect(serviceRevenue).toHaveLength(1);

    const refundExpenses = await prisma.financialEntry.findMany({
      where: {
        unitId: scenario.unitId,
        source: "REFUND",
        referenceType: "APPOINTMENT_REFUND",
        notes: { contains: appointmentId },
      },
    });
    expect(refundExpenses).toHaveLength(1);

    const refunds = await prisma.refund.findMany({
      where: { unitId: scenario.unitId, appointmentId },
    });
    expect(refunds).toHaveLength(1);

    const pending = await app.inject({
      method: "GET",
      url: `/financial/commissions?unitId=${scenario.unitId}&start=2026-05-12T00:00:00.000Z&end=2026-05-12T23:59:59.999Z&status=PENDING`,
    });
    expect(pending.statusCode).toBe(200);
    expect(
      pending.json().entries.some((item: { id: string }) => item.id === commissionId),
    ).toBe(false);

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        unitId: scenario.unitId,
        action: "COMMISSION_CANCELED_DUE_TO_APPOINTMENT_REFUND",
        entity: "commission",
        entityId: commissionId,
      },
    });
    expect(auditLogs).toHaveLength(1);
  });

  it("bloqueia estorno de atendimento quando a comissao ja foi paga", async () => {
    const app = createApp();
    const scenario = await createScenario();
    const appointmentId = await createAppointment(
      app,
      scenario,
      "2026-05-13T13:00:00.000Z",
    );
    const checkout = await checkoutAppointment(app, appointmentId, uniqueId("checkout-paid-before-refund"));
    expect(checkout.statusCode).toBe(200);
    const commissionId = checkout.json().commissions[0].id as string;

    const pay = await app.inject({
      method: "PATCH",
      url: `/financial/commissions/${commissionId}/pay`,
      headers: { "idempotency-key": uniqueId("pay-before-appointment-refund") },
      payload: {
        unitId: scenario.unitId,
        changedBy: "db-test",
        paidAt: "2026-05-13T14:00:00.000Z",
      },
    });
    expect(pay.statusCode).toBe(200);

    const refund = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/refund`,
      headers: { "idempotency-key": uniqueId("blocked-paid-appointment-refund") },
      payload: {
        unitId: scenario.unitId,
        changedBy: "db-test",
        reason: "Nao deve estornar comissao paga",
        refundedAt: "2026-05-13T14:30:00.000Z",
      },
    });
    expect(refund.statusCode).toBe(400);
    expect(refund.json().error).toBe("Comissao ja paga exige ajuste manual antes do estorno");

    const refunds = await prisma.refund.findMany({
      where: { unitId: scenario.unitId, appointmentId },
    });
    expect(refunds).toHaveLength(0);
  });

  it("mantem estorno de atendimento funcionando quando nao ha comissao vinculada", async () => {
    const app = createApp();
    const scenario = await createScenario();
    await prisma.commissionRule.deleteMany({
      where: { professionalId: scenario.professionalId },
    });
    const appointmentId = await createAppointment(
      app,
      scenario,
      "2026-05-14T13:00:00.000Z",
    );
    const checkout = await checkoutAppointment(app, appointmentId, uniqueId("checkout-without-commission"));
    expect(checkout.statusCode).toBe(200);
    expect(checkout.json().commissions).toHaveLength(0);

    const refund = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/refund`,
      headers: { "idempotency-key": uniqueId("refund-without-commission") },
      payload: {
        unitId: scenario.unitId,
        changedBy: "db-test",
        reason: "Estorno sem comissao vinculada",
        refundedAt: "2026-05-14T14:00:00.000Z",
      },
    });
    expect(refund.statusCode).toBe(200);
    expect(refund.json().canceledCommissions).toHaveLength(0);

    const refundExpenses = await prisma.financialEntry.findMany({
      where: {
        unitId: scenario.unitId,
        source: "REFUND",
        referenceType: "APPOINTMENT_REFUND",
        notes: { contains: appointmentId },
      },
    });
    expect(refundExpenses).toHaveLength(1);
  });

  it("paga comissao concorrente sem duplicar despesa financeira", async () => {
    const app = createApp();
    const scenario = await createScenario();
    const appointmentId = await createAppointment(
      app,
      scenario,
      "2026-05-11T13:00:00.000Z",
    );
    const checkout = await checkoutAppointment(app, appointmentId, uniqueId("checkout-commission"));
    expect(checkout.statusCode).toBe(200);
    const commissionId = checkout.json().commissions[0].id as string;

    const payload = {
      unitId: scenario.unitId,
      paidAt: "2026-05-11T14:00:00.000Z",
      changedBy: "db-test",
    };
    const [first, second] = await Promise.all([
      app.inject({
        method: "PATCH",
        url: `/financial/commissions/${commissionId}/pay`,
        headers: { "idempotency-key": uniqueId("commission-pay-a") },
        payload,
      }),
      app.inject({
        method: "PATCH",
        url: `/financial/commissions/${commissionId}/pay`,
        headers: { "idempotency-key": uniqueId("commission-pay-b") },
        payload,
      }),
    ]);

    expect([first.statusCode, second.statusCode].every((status) => status === 200)).toBe(true);

    const commission = await prisma.commissionEntry.findUniqueOrThrow({
      where: { id: commissionId },
    });
    expect(commission.status).toBe("PAID");

    const expenses = await prisma.financialEntry.findMany({
      where: {
        unitId: scenario.unitId,
        kind: "EXPENSE",
        source: "COMMISSION",
        referenceType: "COMMISSION",
        referenceId: commissionId,
      },
    });
    expect(expenses).toHaveLength(1);

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        unitId: scenario.unitId,
        action: "FINANCIAL_COMMISSION_MARKED_PAID",
        entity: "financial_commission",
        entityId: commissionId,
      },
    });
    expect(auditLogs).toHaveLength(1);
  });

  it("faz replay simultaneo de refund com mesma idempotencyKey sem duplicar efeitos ou auditoria", async () => {
    const app = createApp();
    const scenario = await createScenario();
    const saleId = await createProductSale(app, scenario, uniqueId("sale-replay"));
    const payload = {
      unitId: scenario.unitId,
      changedBy: "db-test",
      reason: "Replay concorrente DB",
      refundedAt: "2026-05-12T15:30:00.000Z",
      items: [{ productId: scenario.productId, quantity: 1 }],
    };
    const idempotencyKey = uniqueId("refund-replay");

    const [first, second] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/sales/products/${saleId}/refund`,
        headers: {
          "idempotency-key": idempotencyKey,
          "x-correlation-id": uniqueId("corr-refund-a"),
        },
        payload,
      }),
      app.inject({
        method: "POST",
        url: `/sales/products/${saleId}/refund`,
        headers: {
          "idempotency-key": idempotencyKey,
          "x-correlation-id": uniqueId("corr-refund-b"),
        },
        payload,
      }),
    ]);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json().refund.id).toBe(second.json().refund.id);

    const refundId = first.json().refund.id as string;
    await expectSingleRefundSideEffect(scenario.unitId, saleId, refundId);

    const auditEvents = await app.inject({
      method: "GET",
      url: `/audit/events?unitId=${scenario.unitId}&entity=product_sale_refund&limit=20`,
    });
    expect(auditEvents.statusCode).toBe(200);
    expect(
      auditEvents.json().events.filter((event: { entityId: string }) => event.entityId === refundId),
    ).toHaveLength(1);
  });

  it("cancela comissao de produto pendente na devolucao total pelo Prisma", async () => {
    const app = createApp();
    const scenario = await createScenario();
    const saleId = await createProductSale(app, scenario, uniqueId("sale-refund-commission"));
    const commission = await prisma.commissionEntry.findFirstOrThrow({
      where: {
        unitId: scenario.unitId,
        productSaleId: saleId,
        source: "PRODUCT",
        status: "PENDING",
      },
    });

    const payload = {
      unitId: scenario.unitId,
      changedBy: "db-test",
      reason: "Devolucao total cancela comissao DB",
      refundedAt: "2026-05-12T16:30:00.000Z",
      items: [{ productId: scenario.productId, quantity: 1 }],
    };
    const idempotencyKey = uniqueId("refund-commission-cancel");
    const refund = await app.inject({
      method: "POST",
      url: `/sales/products/${saleId}/refund`,
      headers: {
        "idempotency-key": idempotencyKey,
        "x-correlation-id": uniqueId("corr-refund-commission"),
      },
      payload,
    });
    expect(refund.statusCode).toBe(200);
    expect(refund.json().canceledCommissions).toHaveLength(1);
    expect(refund.json().canceledCommissions[0]).toMatchObject({
      id: commission.id,
      status: "CANCELED",
    });

    const updated = await prisma.commissionEntry.findUniqueOrThrow({
      where: { id: commission.id },
    });
    expect(updated.status).toBe("CANCELED");

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        unitId: scenario.unitId,
        action: "PRODUCT_COMMISSION_CANCELED_BY_REFUND",
        entity: "commission",
        entityId: commission.id,
      },
    });
    expect(auditLogs).toHaveLength(1);

    const replay = await app.inject({
      method: "POST",
      url: `/sales/products/${saleId}/refund`,
      headers: { "idempotency-key": idempotencyKey },
      payload,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().refund.id).toBe(refund.json().refund.id);

    const replayAuditLogs = await prisma.auditLog.findMany({
      where: {
        unitId: scenario.unitId,
        action: "PRODUCT_COMMISSION_CANCELED_BY_REFUND",
        entity: "commission",
        entityId: commission.id,
      },
    });
    expect(replayAuditLogs).toHaveLength(1);
  });

  it("preserva comissao de produto ja paga durante devolucao total pelo Prisma", async () => {
    const app = createApp();
    const scenario = await createScenario();
    const saleId = await createProductSale(app, scenario, uniqueId("sale-refund-paid-commission"));
    const commission = await prisma.commissionEntry.findFirstOrThrow({
      where: {
        unitId: scenario.unitId,
        productSaleId: saleId,
        source: "PRODUCT",
        status: "PENDING",
      },
    });

    const pay = await app.inject({
      method: "PATCH",
      url: `/financial/commissions/${commission.id}/pay`,
      headers: { "idempotency-key": uniqueId("pay-product-before-refund") },
      payload: {
        unitId: scenario.unitId,
        changedBy: "db-test",
        paidAt: "2026-05-12T17:00:00.000Z",
      },
    });
    expect(pay.statusCode).toBe(200);

    const refund = await app.inject({
      method: "POST",
      url: `/sales/products/${saleId}/refund`,
      headers: { "idempotency-key": uniqueId("refund-paid-product-commission") },
      payload: {
        unitId: scenario.unitId,
        changedBy: "db-test",
        reason: "Devolucao preserva comissao paga DB",
        refundedAt: "2026-05-12T17:30:00.000Z",
        items: [{ productId: scenario.productId, quantity: 1 }],
      },
    });
    expect(refund.statusCode).toBe(200);
    expect(refund.json().canceledCommissions).toHaveLength(0);

    const updated = await prisma.commissionEntry.findUniqueOrThrow({
      where: { id: commission.id },
    });
    expect(updated.status).toBe("PAID");
  });

  it("rejeita payload divergente com mesma idempotencyKey sem efeito colateral extra", async () => {
    const app = createApp();
    const scenario = await createScenario();
    const saleId = await createProductSale(app, scenario, uniqueId("sale-divergent"));
    const idempotencyKey = uniqueId("refund-divergent");
    const payload = {
      unitId: scenario.unitId,
      changedBy: "db-test",
      reason: "Primeira devolucao",
      refundedAt: "2026-05-13T15:30:00.000Z",
      items: [{ productId: scenario.productId, quantity: 1 }],
    };

    const first = await app.inject({
      method: "POST",
      url: `/sales/products/${saleId}/refund`,
      headers: { "idempotency-key": idempotencyKey },
      payload,
    });
    expect(first.statusCode).toBe(200);

    const divergent = await app.inject({
      method: "POST",
      url: `/sales/products/${saleId}/refund`,
      headers: { "idempotency-key": idempotencyKey },
      payload: { ...payload, reason: "Payload divergente" },
    });
    expect(divergent.statusCode).toBe(409);

    const refunds = await prisma.refund.findMany({
      where: { unitId: scenario.unitId, productSaleId: saleId },
    });
    expect(refunds).toHaveLength(1);
  });

  it("bloqueia devolucao concorrente acima do vendido e preserva estoque", async () => {
    const app = createApp();
    const scenario = await createScenario();
    const saleId = await createProductSale(app, scenario, uniqueId("sale-concurrent-refund"));
    const payload = {
      unitId: scenario.unitId,
      changedBy: "db-test",
      reason: "Devolucao concorrente DB",
      refundedAt: "2026-05-14T15:30:00.000Z",
      items: [{ productId: scenario.productId, quantity: 1 }],
    };

    const [first, second] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/sales/products/${saleId}/refund`,
        headers: { "idempotency-key": uniqueId("refund-concurrent-a") },
        payload,
      }),
      app.inject({
        method: "POST",
        url: `/sales/products/${saleId}/refund`,
        headers: { "idempotency-key": uniqueId("refund-concurrent-b") },
        payload,
      }),
    ]);

    const statuses = [first.statusCode, second.statusCode].sort();
    expect(statuses).toEqual([200, 400]);

    const refunds = await prisma.refund.findMany({
      where: { unitId: scenario.unitId, productSaleId: saleId },
    });
    expect(refunds).toHaveLength(1);
    await expectSingleRefundSideEffect(scenario.unitId, saleId, refunds[0].id);

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: scenario.productId },
    });
    expect(product.stockQty).toBe(1);
  });

  it("finaliza checkout concorrente sem duplicar receita de atendimento", async () => {
    const app = createApp();
    const scenario = await createScenario();
    const appointmentId = await createAppointment(
      app,
      scenario,
      "2026-05-15T13:00:00.000Z",
    );

    const [first, second] = await Promise.all([
      checkoutAppointment(app, appointmentId, uniqueId("checkout-concurrent-a")),
      checkoutAppointment(app, appointmentId, uniqueId("checkout-concurrent-b")),
    ]);
    const statuses = [first.statusCode, second.statusCode].sort();
    expect(statuses).toEqual([200, 409]);

    const serviceRevenues = await prisma.financialEntry.findMany({
      where: {
        unitId: scenario.unitId,
        kind: "INCOME",
        source: "SERVICE",
        referenceType: "APPOINTMENT",
        referenceId: appointmentId,
      },
    });
    expect(serviceRevenues).toHaveLength(1);
  });

  it("consulta auditoria persistente via novo app Prisma", async () => {
    const app = createApp();
    const scenario = await createScenario();
    const saleId = await createProductSale(app, scenario, uniqueId("sale-audit"));
    const refund = await app.inject({
      method: "POST",
      url: `/sales/products/${saleId}/refund`,
      headers: {
        "idempotency-key": uniqueId("refund-audit"),
        "x-correlation-id": "corr-db-audit-persisted",
      },
      payload: {
        unitId: scenario.unitId,
        changedBy: "db-test",
        reason: "Auditoria persistente DB",
        refundedAt: "2026-05-16T15:30:00.000Z",
        items: [{ productId: scenario.productId, quantity: 1 }],
      },
    });
    expect(refund.statusCode).toBe(200);

    const secondApp = createApp();
    const events = await secondApp.inject({
      method: "GET",
      url: `/audit/events?unitId=${scenario.unitId}&action=PRODUCT_SALE_REFUNDED&entity=product_sale_refund&limit=20`,
    });

    expect(events.statusCode).toBe(200);
    expect(
      events.json().events.some(
        (event: { requestId: string; entityId: string }) =>
          event.requestId === "corr-db-audit-persisted" &&
          event.entityId === refund.json().refund.id,
      ),
    ).toBe(true);
  });

  it("impede duplicidade de agendamento concorrente para mesmo profissional e horario", async () => {
    const app = createApp();
    const scenario = await createScenario();
    const payload = {
      unitId: scenario.unitId,
      clientId: scenario.clientId,
      professionalId: scenario.professionalId,
      serviceId: scenario.serviceId,
      startsAt: "2026-05-20T13:00:00.000Z",
      changedBy: "db-concurrency-test",
    };

    const responses = await Promise.all([
      app.inject({ method: "POST", url: "/appointments", payload }),
      app.inject({ method: "POST", url: "/appointments", payload }),
    ]);
    const statusCodes = responses.map((response) => response.statusCode).sort();

    expect(statusCodes).toEqual([200, 409]);
    const activeCount = await prisma.appointment.count({
      where: {
        unitId: scenario.unitId,
        professionalId: scenario.professionalId,
        status: { in: ["SCHEDULED", "CONFIRMED", "IN_SERVICE"] },
        startsAt: { lt: new Date("2026-05-20T13:55:00.000Z") },
        endsAt: { gt: new Date("2026-05-20T13:00:00.000Z") },
      },
    });
    expect(activeCount).toBe(1);
  });

  it("impede remarcacao concorrente para mesmo profissional e horario", async () => {
    const app = createApp();
    const scenario = await createScenario();
    const first = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: scenario.unitId,
        clientId: scenario.clientId,
        professionalId: scenario.professionalId,
        serviceId: scenario.serviceId,
        startsAt: "2026-05-21T13:00:00.000Z",
        changedBy: "db-reschedule-concurrency-test",
      },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: scenario.unitId,
        clientId: scenario.clientId,
        professionalId: scenario.professionalId,
        serviceId: scenario.serviceId,
        startsAt: "2026-05-21T15:00:00.000Z",
        changedBy: "db-reschedule-concurrency-test",
      },
    });
    expect(second.statusCode).toBe(200);

    const startsAt = "2026-05-21T17:00:00.000Z";
    const responses = await Promise.all([
      app.inject({
        method: "PATCH",
        url: `/appointments/${first.json().appointment.id}/reschedule`,
        headers: { "idempotency-key": "reschedule-db-002" },
        payload: { startsAt, changedBy: "db-reschedule-concurrency-test" },
      }),
      app.inject({
        method: "PATCH",
        url: `/appointments/${second.json().appointment.id}/reschedule`,
        headers: { "idempotency-key": "reschedule-db-003" },
        payload: { startsAt, changedBy: "db-reschedule-concurrency-test" },
      }),
    ]);
    const statusCodes = responses.map((response) => response.statusCode).sort();

    expect(statusCodes).toEqual([200, 409]);
    const activeCount = await prisma.appointment.count({
      where: {
        unitId: scenario.unitId,
        professionalId: scenario.professionalId,
        status: { in: ["SCHEDULED", "CONFIRMED", "IN_SERVICE"] },
        startsAt: { lt: new Date("2026-05-21T17:55:00.000Z") },
        endsAt: { gt: new Date("2026-05-21T17:00:00.000Z") },
      },
    });
    expect(activeCount).toBe(1);
  });

  it("gera relatorios gerenciais e CSV com dados reais do Prisma", async () => {
    const app = createApp();
    const scenario = await createScenario();
    const appointmentId = await createAppointment(
      app,
      scenario,
      "2026-05-17T13:00:00.000Z",
    );
    const checkout = await checkoutAppointment(app, appointmentId, uniqueId("reports-db-checkout"));
    expect(checkout.statusCode).toBe(200);
    await createProductSale(app, scenario, uniqueId("reports-db-sale"));

    const base = `unitId=${scenario.unitId}&start=2026-05-10T00:00:00.000Z&end=2026-05-10T23:59:59.999Z`;
    const financial = await app.inject({
      method: "GET",
      url: `/reports/management/financial?${base}`,
    });
    expect(financial.statusCode).toBe(200);
    expect(financial.json().summary.serviceRevenue).toBeGreaterThan(0);

    const stock = await app.inject({
      method: "GET",
      url: `/reports/management/stock?${base}`,
    });
    expect(stock.statusCode).toBe(200);
    expect(stock.json().movements.some((row: { label: string }) => row.label === "Saida por venda")).toBe(true);

    const csv = await app.inject({
      method: "GET",
      url: `/reports/management/export.csv?${base}&type=financial`,
    });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.body).toContain("Atendimento finalizado");
  });

  it("confirma entrada de estoque atomicamente, bloqueia concorrência e reverte falha", async () => {
    const scenario = await createScenario();
    const repository = new StockEntryPreviewRepository({
      backend: "prisma",
      memoryStore: new InMemoryStore(),
      prisma,
    });
    const now = new Date("2026-07-15T15:00:00.000Z");
    const makePreview = (registerExpense: boolean): StockEntryPreview => ({
      version: STOCK_ENTRY_PREVIEW_VERSION,
      id: crypto.randomUUID(),
      unitId: scenario.unitId,
      actorId: "db-owner",
      phoneFingerprint: "db-phone-fingerprint",
      draft: {
        productId: scenario.productId,
        productName: "Pomada DB",
        quantity: 8,
        unitCost: 5,
        totalCost: 40,
        occurredAt: "2026-07-15T12:00:00.000-03:00",
        registerExpense,
      },
      createdAt: now.toISOString(),
      expiresAt: new Date("2099-07-15T15:10:00.000Z").toISOString(),
    });
    const audit = (previewId: string) => ({
      actorId: "db-owner",
      actorRole: "owner" as const,
      route: "/webhooks/evolution/whatsapp",
      method: "POST",
      requestId: uniqueId("stock-entry-db"),
      idempotencyKey: previewId,
    });
    const initialProduct = await prisma.product.findUniqueOrThrow({ where: { id: scenario.productId } });
    const preview = makePreview(true);
    const record = await repository.save(preview);
    const input = {
      unitId: scenario.unitId,
      actorId: preview.actorId,
      previewId: preview.id,
      previewAction: record.action,
      previewPayloadHash: record.payloadHash,
      draft: preview.draft,
      audit: audit(preview.id),
    };
    const service = new PrismaOperationsService(prisma);
    const confirmations = await Promise.allSettled([
      service.confirmStockEntry(input),
      service.confirmStockEntry(input),
    ]);
    expect(confirmations.filter((item) => item.status === "fulfilled")).toHaveLength(2);
    const repeated = await service.confirmStockEntry(input);
    expect(repeated.replay).toBe(true);
    const [updatedProduct, movements, expenses, audits] = await Promise.all([
      prisma.product.findUniqueOrThrow({ where: { id: scenario.productId } }),
      prisma.stockMovement.findMany({ where: { unitId: scenario.unitId, referenceType: "STOCK_ENTRY", referenceId: preview.id } }),
      prisma.financialEntry.findMany({ where: { unitId: scenario.unitId, referenceType: "STOCK_ENTRY", referenceId: preview.id } }),
      prisma.auditLog.findMany({ where: { unitId: scenario.unitId, action: "STOCK_ENTRY_CONFIRMED", entityId: preview.id } }),
    ]);
    expect(updatedProduct).toMatchObject({
      stockQty: initialProduct.stockQty + 8,
      salePrice: initialProduct.salePrice,
      costPrice: initialProduct.costPrice,
    });
    expect(movements).toHaveLength(1);
    expect(Number(movements[0].unitCost)).toBe(5);
    expect(Number(movements[0].totalCost)).toBe(40);
    expect(expenses).toHaveLength(1);
    expect(audits).toHaveLength(1);

    const rollbackPreview = makePreview(false);
    const rollbackRecord = await repository.save(rollbackPreview);
    const rollbackService = new PrismaOperationsService(prisma, undefined, undefined, (stage) => {
      if (stage === "after_stock") throw new Error("db_stock_entry_rollback");
    });
    const stockBeforeRollback = updatedProduct.stockQty;
    await expect(rollbackService.confirmStockEntry({
      ...input,
      previewId: rollbackPreview.id,
      previewAction: rollbackRecord.action,
      previewPayloadHash: rollbackRecord.payloadHash,
      draft: rollbackPreview.draft,
      audit: audit(rollbackPreview.id),
    })).rejects.toThrow("db_stock_entry_rollback");
    expect((await prisma.product.findUniqueOrThrow({ where: { id: scenario.productId } })).stockQty).toBe(stockBeforeRollback);
    expect(await prisma.stockMovement.count({ where: { referenceId: rollbackPreview.id } })).toBe(0);
    expect(await prisma.financialEntry.count({ where: { referenceId: rollbackPreview.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entityId: rollbackPreview.id, action: "STOCK_ENTRY_CONFIRMED" } })).toBe(0);
    expect((await repository.find({ unitId: scenario.unitId, actorId: rollbackPreview.actorId, phoneFingerprint: rollbackPreview.phoneFingerprint }))?.status).toBe("PENDING");
  });
}, DB_TEST_TIMEOUT_MS);

async function expectSingleRefundSideEffect(
  unitId: string,
  saleId: string,
  refundId: string,
) {
  const [refunds, financialEntries, stockMovements, auditLogs] = await Promise.all([
    prisma.refund.findMany({ where: { unitId, productSaleId: saleId } }),
    prisma.financialEntry.findMany({
      where: {
        unitId,
        kind: "EXPENSE",
        source: "REFUND",
        referenceType: "PRODUCT_SALE_REFUND",
        referenceId: refundId,
      },
    }),
    prisma.stockMovement.findMany({
      where: {
        unitId,
        movementType: "IN",
        referenceType: "PRODUCT_REFUND",
        referenceId: refundId,
      },
    }),
    prisma.auditLog.findMany({
      where: {
        unitId,
        action: "PRODUCT_SALE_REFUNDED",
        entity: "product_sale_refund",
        entityId: refundId,
      },
    }),
  ]);

  expect(refunds).toHaveLength(1);
  expect(financialEntries).toHaveLength(1);
  expect(stockMovements).toHaveLength(1);
  expect(auditLogs).toHaveLength(1);
}
