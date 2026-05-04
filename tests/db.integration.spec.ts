import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../src/http/app";
import { prisma } from "../src/infrastructure/database/prisma";
import { hashPassword } from "../src/http/security";

const runDbTests =
  process.env.RUN_DB_TESTS === "1" && Boolean(process.env.DATABASE_URL);

const suite = runDbTests ? describe : describe.skip;

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
  beforeAll(() => {
    process.env.AUTH_ENFORCED = "false";
    process.env.DATA_BACKEND = "prisma";
  });

  afterAll(async () => {
    await prisma.$disconnect();
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
});

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
