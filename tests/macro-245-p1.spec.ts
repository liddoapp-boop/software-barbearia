import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../src/http/app";

async function loginAs(
  app: FastifyInstance,
  email: string,
  password: string,
  activeUnitId: string,
) {
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password, activeUnitId },
  });
  expect(response.statusCode).toBe(200);
  return response.json().accessToken as string;
}

async function createCompletedAppointment(
  app: FastifyInstance,
  ownerToken: string,
  suffix: string,
  startsAt: string,
) {
  const created = await app.inject({
    method: "POST",
    url: "/appointments",
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: {
      unitId: "unit-01",
      clientId: "cli-01",
      professionalId: "pro-01",
      serviceId: "svc-corte",
      startsAt,
    },
  });
  expect(created.statusCode).toBe(200);
  const appointmentId = created.json().appointment.id as string;

  for (const status of ["CONFIRMED", "IN_SERVICE"] as const) {
    const transition = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
        "idempotency-key": `macro-245-${suffix}-${status.toLowerCase()}`,
      },
      payload: { status },
    });
    expect(transition.statusCode).toBe(200);
  }

  const checkout = await app.inject({
    method: "POST",
    url: `/appointments/${appointmentId}/checkout`,
    headers: {
      authorization: `Bearer ${ownerToken}`,
      "idempotency-key": `macro-245-${suffix}-checkout`,
    },
    payload: {
      completedAt: new Date(new Date(startsAt).getTime() + 30 * 60_000).toISOString(),
      paymentMethod: "PIX",
    },
  });
  expect(checkout.statusCode).toBe(200);
  return appointmentId;
}

describe("Macro 245.1 - RBAC do estorno de atendimento", () => {
  beforeEach(() => {
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "true";
    process.env.BLOCK_COMMERCIAL_REFUNDS = "false";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-04-01T00:00:00.000Z"));
  });

  afterEach(() => {
    process.env.AUTH_ENFORCED = "false";
    delete process.env.BLOCK_COMMERCIAL_REFUNDS;
    vi.useRealTimers();
  });

  it("permite owner e recepcao, bloqueia profissional, anonimo e outro tenant", async () => {
    const app = createApp();
    const ownerToken = await loginAs(app, "owner@barbearia.local", "owner123", "unit-01");
    const receptionToken = await loginAs(
      app,
      "recepcao@barbearia.local",
      "recepcao123",
      "unit-01",
    );
    const professionalToken = await loginAs(
      app,
      "profissional@barbearia.local",
      "profissional123",
      "unit-01",
    );
    const otherTenantOwnerToken = await loginAs(
      app,
      "owner@barbearia.local",
      "owner123",
      "unit-02",
    );
    const receptionRefundId = await createCompletedAppointment(
      app,
      ownerToken,
      "reception",
      "2026-04-26T10:00:00.000Z",
    );
    const ownerRefundId = await createCompletedAppointment(
      app,
      ownerToken,
      "owner",
      "2026-04-26T12:00:00.000Z",
    );
    const refundPayload = {
      unitId: "unit-01",
      changedBy: "ignored-by-auth-hook",
      reason: "Correcao financeira autorizada",
      refundedAt: "2026-04-26T14:00:00.000Z",
    };

    const professional = await app.inject({
      method: "POST",
      url: `/appointments/${receptionRefundId}/refund`,
      headers: {
        authorization: `Bearer ${professionalToken}`,
        "idempotency-key": "macro-245-professional-denied",
      },
      payload: refundPayload,
    });
    expect(professional.statusCode).toBe(403);
    expect(professional.json().error).toBe("Acesso negado");

    const anonymous = await app.inject({
      method: "POST",
      url: `/appointments/${receptionRefundId}/refund`,
      headers: { "idempotency-key": "macro-245-anonymous-denied" },
      payload: refundPayload,
    });
    expect(anonymous.statusCode).toBe(401);

    const otherTenant = await app.inject({
      method: "POST",
      url: `/appointments/${receptionRefundId}/refund`,
      headers: {
        authorization: `Bearer ${otherTenantOwnerToken}`,
        "idempotency-key": "macro-245-other-tenant-denied",
      },
      payload: refundPayload,
    });
    expect(otherTenant.statusCode).toBe(403);
    expect(otherTenant.json().error).toBe("Unidade nao autorizada");

    const reception = await app.inject({
      method: "POST",
      url: `/appointments/${receptionRefundId}/refund`,
      headers: {
        authorization: `Bearer ${receptionToken}`,
        "idempotency-key": "macro-245-reception-allowed",
      },
      payload: refundPayload,
    });
    expect(reception.statusCode).toBe(200);

    const owner = await app.inject({
      method: "POST",
      url: `/appointments/${ownerRefundId}/refund`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
        "idempotency-key": "macro-245-owner-allowed",
      },
      payload: refundPayload,
    });
    expect(owner.statusCode).toBe(200);

    await app.close();
  });
});
