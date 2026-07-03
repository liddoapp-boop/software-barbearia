import crypto from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../src/http/app";
import { prisma } from "../src/infrastructure/database/prisma";
import { hashPassword } from "../src/http/security";

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
      name: "Profissional DB",
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
    payload: { status: "CONFIRMED", changedBy: "db-test" },
  });
  expect(confirmed.statusCode).toBe(200);

  const inService = await app.inject({
    method: "PATCH",
    url: `/appointments/${appointmentId}/status`,
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
        headers: ownerHeaders,
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
      headers: ownerHeaders,
      payload: { status: "CONFIRMED" },
    });
    expect(confirmed.statusCode).toBe(200);

    const inService = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      headers: ownerHeaders,
      payload: { status: "IN_SERVICE" },
    });
    expect(inService.statusCode).toBe(200);

    const professionalCompleteByStatus = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      headers: professionalHeaders,
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
        payload: { startsAt, changedBy: "db-reschedule-concurrency-test" },
      }),
      app.inject({
        method: "PATCH",
        url: `/appointments/${second.json().appointment.id}/reschedule`,
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
