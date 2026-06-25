import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp, hasPublicIdTestMarker } from "../src/http/app";
import {
  computeBillingWebhookSignature,
  getBillingWebhookSecret,
} from "../src/http/security";

async function loginAs(
  app: FastifyInstance,
  input: {
    email: string;
    password: string;
    activeUnitId?: string;
  },
) {
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: input,
  });
  expect(login.statusCode).toBe(200);
  return login.json().accessToken as string;
}

async function createProfessional(app: FastifyInstance, name: string) {
  const response = await app.inject({
    method: "POST",
    url: "/professionals",
    payload: {
      unitId: "unit-01",
      name,
    },
  });
  expect(response.statusCode).toBe(200);
  return response.json().professional as { id: string; name: string };
}

async function setBarbaProfessionals(app: FastifyInstance, professionalIds: string[]) {
  const response = await app.inject({
    method: "PATCH",
    url: "/services/svc-barba",
    payload: {
      unitId: "unit-01",
      professionalIds,
    },
  });
  expect(response.statusCode).toBe(200);
  return response.json();
}

describe("API MVP", () => {
  beforeEach(() => {
    process.env.AUTH_ENFORCED = "false";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-04-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("envia headers minimos de seguranca para reduzir impacto de XSS", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(String(response.headers["content-security-policy"])).toContain("object-src 'none'");
    expect(String(response.headers["content-security-policy"])).toContain("base-uri 'self'");
  });

  it("executa fluxo de agendamento ate conclusao com receita", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const createResponse = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-22T13:00:00.000Z",
        changedBy: "owner",
      },
    });
    expect(createResponse.statusCode).toBe(200);
    const created = createResponse.json();
    const appointmentId = created.appointment.id as string;

    const confirmResponse = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: {
        status: "CONFIRMED",
        changedBy: "owner",
      },
    });
    expect(confirmResponse.statusCode).toBe(200);

    const inServiceResponse = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: {
        status: "IN_SERVICE",
        changedBy: "owner",
      },
    });
    expect(inServiceResponse.statusCode).toBe(200);

    const completeResponse = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/complete`,
      payload: {
        changedBy: "owner",
        completedAt: "2026-04-22T14:00:00.000Z",
      },
    });
    expect(completeResponse.statusCode).toBe(200);
    const completed = completeResponse.json();
    expect(completed.revenue.amount).toBe(75);
    expect(completed.appointment.status).toBe("COMPLETED");
  });

  it("impede conflito de agenda para o mesmo profissional", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-22T10:00:00.000Z",
        changedBy: "owner",
      },
    });

    const conflictResponse = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-02",
        professionalId: "pro-01",
        serviceId: "svc-barba",
        startsAt: "2026-04-22T10:20:00.000Z",
        changedBy: "owner",
      },
    });

    expect(conflictResponse.statusCode).toBe(409);
  });

  it("permite agendamento em horario livre", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const response = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-22T11:00:00.000Z",
        changedBy: "owner",
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it("permite agendamento apos termino de outro", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-22T10:00:00.000Z",
        changedBy: "owner",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-02",
        professionalId: "pro-01",
        serviceId: "svc-barba",
        startsAt: "2026-04-22T10:55:00.000Z",
        changedBy: "owner",
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it("permite agendamento antes de outro", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-22T10:00:00.000Z",
        changedBy: "owner",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-02",
        professionalId: "pro-01",
        serviceId: "svc-barba",
        startsAt: "2026-04-22T09:15:00.000Z",
        changedBy: "owner",
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it("ignora conflito de agendamento cancelado, concluido e no-show", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const first = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-22T13:00:00.000Z",
        changedBy: "owner",
      },
    });
    const firstId = first.json().appointment.id as string;
    await app.inject({
      method: "PATCH",
      url: `/appointments/${firstId}/status`,
      payload: { status: "CANCELLED", changedBy: "owner" },
    });

    const second = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-02",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-22T14:00:00.000Z",
        changedBy: "owner",
      },
    });
    const secondId = second.json().appointment.id as string;
    await app.inject({
      method: "PATCH",
      url: `/appointments/${secondId}/status`,
      payload: { status: "CONFIRMED", changedBy: "owner" },
    });
    await app.inject({
      method: "PATCH",
      url: `/appointments/${secondId}/status`,
      payload: { status: "IN_SERVICE", changedBy: "owner" },
    });
    await app.inject({
      method: "POST",
      url: `/appointments/${secondId}/complete`,
      payload: { changedBy: "owner", completedAt: "2026-04-22T14:45:00.000Z" },
    });

    const third = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-22T15:00:00.000Z",
        changedBy: "owner",
      },
    });
    const thirdId = third.json().appointment.id as string;
    await app.inject({
      method: "PATCH",
      url: `/appointments/${thirdId}/status`,
      payload: { status: "NO_SHOW", changedBy: "owner" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-02",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-22T13:15:00.000Z",
        changedBy: "owner",
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it("permite horario livre no mesmo dia sem sobreposicao real (23:06 vs 05:13)", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const existing = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-22T23:06:00.000Z",
        changedBy: "owner",
      },
    });
    expect(existing.statusCode).toBe(200);

    const freeSlot = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-02",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-22T05:13:00.000Z",
        changedBy: "owner",
      },
    });

    expect(freeSlot.statusCode).toBe(200);
  });

  it("permite mesmo profissional em outro dia", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-22T10:00:00.000Z",
        changedBy: "owner",
      },
    });

    const differentDay = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-02",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-23T10:00:00.000Z",
        changedBy: "owner",
      },
    });
    expect(differentDay.statusCode).toBe(200);
  });

  it("lista, detalha e atualiza agendamento pela central de appointments", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-22T16:00:00.000Z",
        changedBy: "owner",
      },
    });
    expect(created.statusCode).toBe(200);
    const appointmentId = created.json().appointment.id as string;

    const list = await app.inject({
      method: "GET",
      url: "/appointments?unitId=unit-01&start=2026-04-22T00:00:00.000Z&end=2026-04-22T23:59:59.999Z&search=joao",
    });
    expect(list.statusCode).toBe(200);
    const listBody = list.json();
    expect(Array.isArray(listBody.appointments)).toBe(true);
    expect(listBody.appointments.length).toBeGreaterThanOrEqual(1);

    const detail = await app.inject({
      method: "GET",
      url: `/appointments/${appointmentId}`,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().appointment.id).toBe(appointmentId);
    expect(detail.json().appointment).toHaveProperty("clientPhone");
    expect(detail.json().appointment).toHaveProperty("origin");

    const update = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}`,
      payload: {
        notes: "Cliente pediu acabamento premium",
        confirmation: true,
        changedBy: "owner",
      },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().appointment.status).toBe("CONFIRMED");
    expect(update.json().appointment.notes).toBe("Cliente pediu acabamento premium");
  });

  it("retorna contrato minimo do dashboard executivo", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const response = await app.inject({
      method: "GET",
      url: "/dashboard?unitId=unit-01&date=2026-04-23T00:00:00.000Z",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body).toHaveProperty("revenueToday");
    expect(body).toHaveProperty("revenueWeek");
    expect(body).toHaveProperty("revenueMonth");
    expect(body).toHaveProperty("goalMonth");
    expect(body).toHaveProperty("goalProgress");
    expect(Array.isArray(body.topProfessionals)).toBe(true);
    expect(Array.isArray(body.topServices)).toBe(true);
    expect(Array.isArray(body.topProducts)).toBe(true);
    expect(Array.isArray(body.criticalAlerts)).toBe(true);
    expect(Array.isArray(body.lowStock)).toBe(true);
    expect(body).toHaveProperty("forecast");
    expect(body.forecast).toHaveProperty("day");
    expect(body.forecast).toHaveProperty("week");
    expect(body.forecast).toHaveProperty("month");
    expect(body.forecast).toHaveProperty("confidence");
    expect(Array.isArray(body.smartAlerts)).toBe(true);
    expect(Array.isArray(body.actionSuggestions)).toBe(true);
    expect(body).toHaveProperty("suggestionTelemetry");
    expect(body.suggestionTelemetry).toHaveProperty("total");
    expect(body.suggestionTelemetry).toHaveProperty("conversionRate");
    expect(body).toHaveProperty("playbookHistory");
    expect(body.playbookHistory).toHaveProperty("summary");
    expect(body.playbookHistory).toHaveProperty("items");
    expect(body).toHaveProperty("thresholdTuning");
    expect(body.thresholdTuning).toHaveProperty("calibrated");
    expect(body.thresholdTuning).toHaveProperty("adjustments");
    if (body.actionSuggestions.length) {
      expect(body.actionSuggestions[0]).toHaveProperty("ctaLabel");
      expect(body.actionSuggestions[0]).toHaveProperty("ctaModule");
      expect(body.actionSuggestions[0]).toHaveProperty("actionPayload");
      expect(body.actionSuggestions[0].actionPayload).toHaveProperty("playbookSteps");
    }
  });

  it("sinaliza horarios vazios e retorna sugestoes acionaveis no dashboard", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const response = await app.inject({
      method: "GET",
      url: "/dashboard?unitId=unit-01&date=2026-04-23T00:00:00.000Z",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.smartAlerts.some((alert: { type: string }) => alert.type === "IDLE_WINDOW")).toBe(
      true,
    );
    expect(
      body.actionSuggestions.some(
        (suggestion: { actionType: string }) => suggestion.actionType === "FILL_IDLE_SLOTS",
      ),
    ).toBe(true);
  });

  it("sinaliza queda de previsao quando semana anterior foi maior", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const manualRevenue = await app.inject({
      method: "POST",
      url: "/financial/manual-entry",
      headers: { "idempotency-key": "dashboard-previous-week-revenue" },
      payload: {
        unitId: "unit-01",
        kind: "INCOME",
        amount: 900,
        occurredAt: "2026-04-15T10:00:00.000Z",
        description: "Receita teste semana anterior",
        changedBy: "owner",
      },
    });
    expect(manualRevenue.statusCode).toBe(200);

    const response = await app.inject({
      method: "GET",
      url: "/dashboard?unitId=unit-01&date=2026-04-23T00:00:00.000Z",
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(
      body.smartAlerts.some((alert: { type: string }) => alert.type === "FORECAST_DROP"),
    ).toBe(true);
  });

  it("registra telemetria de sugestoes e retorna calibracao no dashboard", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const events = [
      { outcome: "EXECUTED", actionType: "REACTIVATION_CAMPAIGN", estimatedImpact: 120 },
      { outcome: "EXECUTED", actionType: "FILL_IDLE_SLOTS", estimatedImpact: 90 },
      { outcome: "CONVERTED", actionType: "REACTIVATION_CAMPAIGN", estimatedImpact: 120, realizedRevenue: 160 },
      { outcome: "IGNORED", actionType: "UPSELL_COMBO", estimatedImpact: 40 },
    ] as const;

    for (const [index, event] of events.entries()) {
      const telemetry = await app.inject({
        method: "POST",
        url: `/dashboard/suggestions/sugg-${index + 1}/telemetry`,
        payload: {
          unitId: "unit-01",
          occurredAt: "2026-04-22T10:00:00.000Z",
          sourceModule: "dashboard",
          playbookType:
            event.actionType === "REACTIVATION_CAMPAIGN"
              ? "REACTIVATION"
              : event.actionType === "FILL_IDLE_SLOTS"
                ? "IDLE_WINDOW_FILL"
                : "FORECAST_PROTECTION",
          ...event,
        },
      });
      expect(telemetry.statusCode).toBe(200);
      expect(telemetry.json()).toHaveProperty("event");
      expect(telemetry.json()).toHaveProperty("summary");
    }

    const dashboard = await app.inject({
      method: "GET",
      url: "/dashboard?unitId=unit-01&date=2026-04-23T00:00:00.000Z",
    });
    expect(dashboard.statusCode).toBe(200);
    const body = dashboard.json();
    expect(body.suggestionTelemetry.total).toBeGreaterThanOrEqual(4);
    expect(body.suggestionTelemetry.converted).toBeGreaterThanOrEqual(1);
    expect(body.playbookHistory.summary.totalEvents).toBeGreaterThanOrEqual(4);
    expect(body.playbookHistory.summary.totalPlaybooks).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(body.playbookHistory.items)).toBe(true);
    expect(body.thresholdTuning.calibrated).toBe(true);
    expect(body.thresholdTuning.adjustments).toHaveProperty("minSmartAlertImpact");
    expect(Array.isArray(body.thresholdTuning.rationale)).toBe(true);
  });

  it("bloqueia transicao de status invalida", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const createResponse = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-22T15:00:00.000Z",
        changedBy: "owner",
      },
    });
    const appointmentId = createResponse.json().appointment.id as string;

    const invalidTransition = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: {
        status: "COMPLETED",
        changedBy: "owner",
      },
    });

    expect(invalidTransition.statusCode).toBe(422);
  });

  it("bloqueia remarcacao para horario em conflito", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const first = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-22T10:00:00.000Z",
        changedBy: "owner",
      },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-02",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-22T11:00:00.000Z",
        changedBy: "owner",
      },
    });
    expect(second.statusCode).toBe(200);

    const secondId = second.json().appointment.id as string;
    const conflictReschedule = await app.inject({
      method: "PATCH",
      url: `/appointments/${secondId}/reschedule`,
      payload: {
        startsAt: "2026-04-22T10:20:00.000Z",
        changedBy: "owner",
      },
    });

    expect(conflictReschedule.statusCode).toBe(409);
  });

  it("sugere horarios alternativos ordenados por proximidade", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-22T10:00:00.000Z",
        changedBy: "owner",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/appointments/suggestions",
      payload: {
        unitId: "unit-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-22T10:20:00.000Z",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(body.suggestions.length).toBeGreaterThan(0);
    expect(body.suggestions.length).toBeLessThanOrEqual(5);

    const requested = new Date("2026-04-22T10:20:00.000Z").getTime();
    const differences = body.suggestions.map((slot: { startsAt: string }) =>
      Math.abs(new Date(slot.startsAt).getTime() - requested),
    );
    expect(differences).toEqual([...differences].sort((a, b) => a - b));
  });

  it("registra venda multiproduto com impacto em receita e estoque", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const saleResponse = await app.inject({
      method: "POST",
      url: "/sales/products",
      headers: { "idempotency-key": "sale-multiproduct-impact" },
      payload: {
        unitId: "unit-01",
        soldAt: "2026-04-23T15:00:00.000Z",
        professionalId: "pro-01",
        clientId: "cli-01",
        items: [
          { productId: "prd-pomada", quantity: 2 },
          { productId: "prd-oleo-barba", quantity: 1 },
        ],
      },
    });

    expect(saleResponse.statusCode).toBe(200);
    const body = saleResponse.json();
    expect(body.sale.items).toHaveLength(2);
    expect(body.revenue.amount).toBe(157);
    expect(body.stockMovements).toHaveLength(2);

    const stockResponse = await app.inject({
      method: "GET",
      url: "/stock/overview?unitId=unit-01",
    });
    expect(stockResponse.statusCode).toBe(200);
    const stockBody = stockResponse.json();
    const pomada = stockBody.recentMovements.find((item: { productId: string }) => item.productId === "prd-pomada");
    const oleo = stockBody.recentMovements.find((item: { productId: string }) => item.productId === "prd-oleo-barba");
    expect(pomada).toBeTruthy();
    expect(oleo).toBeTruthy();
  });

  it("finaliza atendimento com checkout unificado (servico + produto + financeiro + comissao + cliente)", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-23T10:00:00.000Z",
        changedBy: "owner",
      },
    });
    const appointmentId = created.json().appointment.id as string;

    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "CONFIRMED", changedBy: "owner" },
    });
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "IN_SERVICE", changedBy: "owner" },
    });

    const checkout = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: { "idempotency-key": "checkout-unified-success" },
      payload: {
        changedBy: "owner",
        completedAt: "2026-04-23T10:50:00.000Z",
        paymentMethod: "PIX",
        notes: "Checkout unificado",
        products: [{ productId: "prd-pomada", quantity: 1 }],
      },
    });

    expect(checkout.statusCode).toBe(200);
    const body = checkout.json();
    expect(body.appointment.status).toBe("COMPLETED");
    expect(body.serviceRevenue.amount).toBeGreaterThan(0);
    expect(body.productRevenue.amount).toBeGreaterThan(0);
    expect(Array.isArray(body.commissions)).toBe(true);
    expect(body.clientMetrics.frequency90d).toBeGreaterThan(0);

    const stockResponse = await app.inject({
      method: "GET",
      url: "/stock/overview?unitId=unit-01",
    });
    expect(stockResponse.statusCode).toBe(200);
    const stockBody = stockResponse.json();
    const movement = stockBody.recentMovements.find(
      (item: { productId: string; referenceType: string }) =>
        item.productId === "prd-pomada" && item.referenceType === "PRODUCT_SALE",
    );
    expect(movement).toBeTruthy();
  });

  it("mantem checkout idempotente em retry e concorrencia sem duplicar financeiro, comissao ou estoque", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-23T13:00:00.000Z",
        changedBy: "owner",
      },
    });
    const appointmentId = created.json().appointment.id as string;
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "CONFIRMED", changedBy: "owner" },
    });
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "IN_SERVICE", changedBy: "owner" },
    });

    const payload = {
      changedBy: "owner",
      completedAt: "2026-04-23T13:50:00.000Z",
      paymentMethod: "PIX",
      products: [{ productId: "prd-pomada", quantity: 1 }],
    };
    const [first, retry, concurrent] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/appointments/${appointmentId}/checkout`,
        headers: { "idempotency-key": "checkout-retry-001" },
        payload,
      }),
      app.inject({
        method: "POST",
        url: `/appointments/${appointmentId}/checkout`,
        headers: { "idempotency-key": "checkout-retry-001" },
        payload,
      }),
      app.inject({
        method: "POST",
        url: `/appointments/${appointmentId}/checkout`,
        headers: { "idempotency-key": "checkout-retry-001" },
        payload,
      }),
    ]);

    expect(first.statusCode).toBe(200);
    expect(retry.statusCode).toBe(200);
    expect(concurrent.statusCode).toBe(200);
    expect(retry.json().serviceRevenue.id).toBe(first.json().serviceRevenue.id);
    expect(concurrent.json().sale.id).toBe(first.json().sale.id);

    const transactions = await app.inject({
      method: "GET",
      url: "/financial/transactions?unitId=unit-01&start=2026-04-23T00:00:00.000Z&end=2026-04-23T23:59:59.999Z",
    });
    expect(transactions.statusCode).toBe(200);
    expect(transactions.json().transactions).toHaveLength(2);

    const commissions = await app.inject({
      method: "GET",
      url: "/financial/commissions?unitId=unit-01&start=2026-04-23T00:00:00.000Z&end=2026-04-23T23:59:59.999Z",
    });
    expect(commissions.statusCode).toBe(200);
    expect(commissions.json().entries).toHaveLength(first.json().commissions.length);

    const stock = await app.inject({
      method: "GET",
      url: "/stock/overview?unitId=unit-01&limit=20",
    });
    const productMovements = stock
      .json()
      .recentMovements.filter(
        (item: { productId: string; referenceType: string }) =>
          item.productId === "prd-pomada" && item.referenceType === "PRODUCT_SALE",
      );
    expect(productMovements).toHaveLength(1);
    expect(stock.json().totals.totalStockQty).toBe(25);
  });

  it("mantem venda, lancamento manual e pagamento de comissao idempotentes e rejeita payload divergente", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const salePayload = {
      unitId: "unit-01",
      professionalId: "pro-01",
      clientId: "cli-01",
      soldAt: "2026-04-23T15:00:00.000Z",
      items: [{ productId: "prd-pomada", quantity: 2 }],
    };
    const sale = await app.inject({
      method: "POST",
      url: "/sales/products",
      headers: { "idempotency-key": "sale-retry-001" },
      payload: salePayload,
    });
    const saleRetry = await app.inject({
      method: "POST",
      url: "/sales/products",
      headers: { "idempotency-key": "sale-retry-001" },
      payload: salePayload,
    });
    expect(sale.statusCode).toBe(200);
    expect(saleRetry.statusCode).toBe(200);
    expect(saleRetry.json().sale.id).toBe(sale.json().sale.id);

    const manualPayload = {
      unitId: "unit-01",
      type: "INCOME",
      category: "AJUSTE",
      description: "Receita idempotente",
      amount: 180,
      date: "2026-04-23T16:00:00.000Z",
      paymentMethod: "PIX",
      changedBy: "owner",
    };
    const manual = await app.inject({
      method: "POST",
      url: "/financial/transactions",
      headers: { "idempotency-key": "manual-retry-001" },
      payload: manualPayload,
    });
    const manualRetry = await app.inject({
      method: "POST",
      url: "/financial/transactions",
      headers: { "idempotency-key": "manual-retry-001" },
      payload: manualPayload,
    });
    expect(manual.statusCode).toBe(200);
    expect(manualRetry.statusCode).toBe(200);
    expect(manualRetry.json().transaction.id).toBe(manual.json().transaction.id);

    const conflict = await app.inject({
      method: "POST",
      url: "/financial/transactions",
      headers: { "idempotency-key": "manual-retry-001" },
      payload: { ...manualPayload, amount: 181 },
    });
    expect(conflict.statusCode).toBe(409);

    const appointment = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-24T15:00:00.000Z",
        changedBy: "owner",
      },
    });
    const appointmentId = appointment.json().appointment.id as string;
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "CONFIRMED", changedBy: "owner" },
    });
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "IN_SERVICE", changedBy: "owner" },
    });
    await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/complete`,
      payload: { changedBy: "owner", completedAt: "2026-04-24T15:45:00.000Z" },
    });
    const commissions = await app.inject({
      method: "GET",
      url: "/financial/commissions?unitId=unit-01&start=2026-04-24T00:00:00.000Z&end=2026-04-24T23:59:59.999Z",
    });
    const pending = commissions.json().entries.find((item: { status: string }) => item.status === "PENDING");
    expect(pending).toBeTruthy();

    const payPayload = {
      unitId: "unit-01",
      changedBy: "owner",
      paidAt: "2026-04-24T16:00:00.000Z",
    };
    const pay = await app.inject({
      method: "PATCH",
      url: `/financial/commissions/${pending.id}/pay`,
      headers: { "idempotency-key": "commission-pay-001" },
      payload: payPayload,
    });
    const payRetry = await app.inject({
      method: "PATCH",
      url: `/financial/commissions/${pending.id}/pay`,
      headers: { "idempotency-key": "commission-pay-001" },
      payload: payPayload,
    });
    expect(pay.statusCode).toBe(200);
    expect(payRetry.statusCode).toBe(200);
    expect(payRetry.json()).toEqual(pay.json());

    const transactions = await app.inject({
      method: "GET",
      url: "/financial/transactions?unitId=unit-01&start=2026-04-23T00:00:00.000Z&end=2026-04-23T23:59:59.999Z",
    });
    const productSaleEntries = transactions
      .json()
      .transactions.filter((item: { referenceType: string }) => item.referenceType === "PRODUCT_SALE");
    const manualEntries = transactions
      .json()
      .transactions.filter((item: { description: string }) => item.description === "Receita idempotente");
    expect(productSaleEntries).toHaveLength(1);
    expect(manualEntries).toHaveLength(1);
  });

  it("mantem /financial/manual-entry idempotente e rejeita payload divergente", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const payload = {
      unitId: "unit-01",
      kind: "INCOME",
      amount: 180,
      occurredAt: "2026-04-25T09:00:00.000Z",
      description: "Receita manual idempotente",
      changedBy: "owner",
    };
    const first = await app.inject({
      method: "POST",
      url: "/financial/manual-entry",
      headers: { "idempotency-key": "manual-entry-retry-001" },
      payload,
    });
    const replay = await app.inject({
      method: "POST",
      url: "/financial/manual-entry",
      headers: { "idempotency-key": "manual-entry-retry-001" },
      payload,
    });
    const conflict = await app.inject({
      method: "POST",
      url: "/financial/manual-entry",
      headers: { "idempotency-key": "manual-entry-retry-001" },
      payload: { ...payload, amount: 181 },
    });

    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().entry.id).toBe(first.json().entry.id);
    expect(conflict.statusCode).toBe(409);

    const entries = await app.inject({
      method: "GET",
      url: "/financial/entries?unitId=unit-01&start=2026-04-25T00:00:00.000Z&end=2026-04-25T23:59:59.999Z",
    });
    const matches = entries
      .json()
      .entries.filter((item: { description: string }) => item.description === "Receita manual idempotente");
    expect(matches).toHaveLength(1);
  });

  it("estorna atendimento concluido com lancamento reverso rastreavel e idempotente", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-27T09:00:00.000Z",
        changedBy: "owner",
      },
    });
    const appointmentId = created.json().appointment.id as string;
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "CONFIRMED", changedBy: "owner" },
    });
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "IN_SERVICE", changedBy: "owner" },
    });
    const checkout = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: { "idempotency-key": "checkout-refund-service-001" },
      payload: {
        changedBy: "owner",
        completedAt: "2026-04-27T09:50:00.000Z",
        paymentMethod: "PIX",
      },
    });
    expect(checkout.statusCode).toBe(200);

    const payload = {
      unitId: "unit-01",
      changedBy: "owner",
      reason: "Cliente solicitou estorno",
      refundedAt: "2026-04-27T10:00:00.000Z",
    };
    const refund = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/refund`,
      headers: { "idempotency-key": "refund-service-001" },
      payload,
    });
    expect(refund.statusCode).toBe(200);
    expect(refund.json().financialEntry).toMatchObject({
      kind: "EXPENSE",
      source: "REFUND",
      category: "ESTORNO_SERVICO",
      referenceType: "APPOINTMENT_REFUND",
    });
    expect(refund.json().financialEntry.referenceId).toBe(refund.json().refund.id);
    expect(refund.json().refund.appointmentId).toBe(appointmentId);

    const replay = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/refund`,
      headers: { "idempotency-key": "refund-service-001" },
      payload,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().refund.id).toBe(refund.json().refund.id);

    const conflict = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/refund`,
      headers: { "idempotency-key": "refund-service-001" },
      payload: { ...payload, reason: "Outro motivo" },
    });
    expect(conflict.statusCode).toBe(409);

    const missingKey = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/refund`,
      payload: { ...payload, refundedAt: "2026-04-27T11:00:00.000Z" },
    });
    expect(missingKey.statusCode).toBe(400);

    const transactions = await app.inject({
      method: "GET",
      url: "/financial/transactions?unitId=unit-01&start=2026-04-27T00:00:00.000Z&end=2026-04-27T23:59:59.999Z",
    });
    const rows = transactions.json().transactions as Array<{
      type: string;
      source: string;
      referenceType: string;
    }>;
    expect(rows.filter((item) => item.type === "INCOME" && item.source === "SERVICE")).toHaveLength(1);
    expect(rows.filter((item) => item.type === "EXPENSE" && item.source === "REFUND")).toHaveLength(1);
    expect(transactions.json().summary.expense).toBe(75);

    const entries = await app.inject({
      method: "GET",
      url: "/financial/entries?unitId=unit-01&start=2026-04-27T00:00:00.000Z&end=2026-04-27T23:59:59.999Z&kind=EXPENSE",
    });
    expect(entries.json().entries).toHaveLength(1);
    expect(entries.json().entries[0].source).toBe("REFUND");

    const summary = await app.inject({
      method: "GET",
      url: "/financial/summary?unitId=unit-01&start=2026-04-27T00:00:00.000Z&end=2026-04-27T23:59:59.999Z",
    });
    expect(summary.json().summary.grossRevenue).toBe(75);
    expect(summary.json().summary.expenses).toBe(75);
    expect(summary.json().summary.refundsTotal).toBe(75);
    expect(summary.json().summary.paidCommissionsTotal).toBe(0);
    expect(summary.json().summary.operationalExpenses).toBe(0);
    expect(summary.json().cashFlow.balance).toBe(0);

    const notCompleted = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-02",
        professionalId: "pro-01",
        serviceId: "svc-barba",
        startsAt: "2026-04-27T12:00:00.000Z",
        changedBy: "owner",
      },
    });
    const notCompletedRefund = await app.inject({
      method: "POST",
      url: `/appointments/${notCompleted.json().appointment.id}/refund`,
      headers: { "idempotency-key": "refund-service-not-completed" },
      payload,
    });
    expect(notCompletedRefund.statusCode).toBe(400);
  });

  it("devolve produto parcialmente com financeiro reverso, estoque IN e replay sem duplicidade", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const sale = await app.inject({
      method: "POST",
      url: "/sales/products",
      headers: { "idempotency-key": "sale-product-refund-001" },
      payload: {
        unitId: "unit-01",
        professionalId: "pro-01",
        clientId: "cli-01",
        soldAt: "2026-04-27T14:00:00.000Z",
        items: [{ productId: "prd-pomada", quantity: 2 }],
      },
    });
    expect(sale.statusCode).toBe(200);
    const saleId = sale.json().sale.id as string;

    const stockAfterSale = await app.inject({
      method: "GET",
      url: "/inventory?unitId=unit-01&search=Pomada",
    });
    expect(stockAfterSale.json().products[0].quantity).toBe(13);

    const payload = {
      unitId: "unit-01",
      changedBy: "owner",
      reason: "Produto devolvido",
      refundedAt: "2026-04-27T15:00:00.000Z",
      items: [{ productId: "prd-pomada", quantity: 1 }],
    };
    const refund = await app.inject({
      method: "POST",
      url: `/sales/products/${saleId}/refund`,
      headers: { "idempotency-key": "refund-product-001" },
      payload,
    });
    expect(refund.statusCode).toBe(200);
    expect(refund.json().refund.productSaleId).toBe(saleId);
    expect(refund.json().financialEntry).toMatchObject({
      kind: "EXPENSE",
      source: "REFUND",
      category: "DEVOLUCAO_PRODUTO",
      amount: 59,
      referenceType: "PRODUCT_SALE_REFUND",
    });
    expect(refund.json().financialEntry.referenceId).toBe(refund.json().refund.id);
    expect(refund.json().stockMovements).toHaveLength(1);
    expect(refund.json().stockMovements[0]).toMatchObject({
      movementType: "IN",
      referenceType: "PRODUCT_REFUND",
      referenceId: refund.json().refund.id,
    });

    const replay = await app.inject({
      method: "POST",
      url: `/sales/products/${saleId}/refund`,
      headers: { "idempotency-key": "refund-product-001" },
      payload,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().refund.id).toBe(refund.json().refund.id);

    const stockAfterRefund = await app.inject({
      method: "GET",
      url: "/inventory?unitId=unit-01&search=Pomada",
    });
    expect(stockAfterRefund.json().products[0].quantity).toBe(14);

    const conflict = await app.inject({
      method: "POST",
      url: `/sales/products/${saleId}/refund`,
      headers: { "idempotency-key": "refund-product-001" },
      payload: { ...payload, reason: "Outro motivo" },
    });
    expect(conflict.statusCode).toBe(409);

    const missingKey = await app.inject({
      method: "POST",
      url: `/sales/products/${saleId}/refund`,
      payload: { ...payload, refundedAt: "2026-04-27T16:00:00.000Z" },
    });
    expect(missingKey.statusCode).toBe(400);

    const tooMuch = await app.inject({
      method: "POST",
      url: `/sales/products/${saleId}/refund`,
      headers: { "idempotency-key": "refund-product-too-much" },
      payload: { ...payload, items: [{ productId: "prd-pomada", quantity: 2 }] },
    });
    expect(tooMuch.statusCode).toBe(400);

    const transactions = await app.inject({
      method: "GET",
      url: "/financial/transactions?unitId=unit-01&start=2026-04-27T00:00:00.000Z&end=2026-04-27T23:59:59.999Z",
    });
    const rows = transactions.json().transactions as Array<{
      type: string;
      source: string;
    }>;
    expect(rows.filter((item) => item.type === "INCOME" && item.source === "PRODUCT")).toHaveLength(1);
    expect(rows.filter((item) => item.type === "EXPENSE" && item.source === "REFUND")).toHaveLength(1);
    expect(transactions.json().summary.income).toBe(118);
    expect(transactions.json().summary.expense).toBe(59);

    const stock = await app.inject({
      method: "GET",
      url: "/stock/overview?unitId=unit-01&limit=20",
    });
    const movements = stock.json().recentMovements as Array<{
      productId: string;
      referenceType: string;
    }>;
    expect(
      movements.filter(
        (item) => item.productId === "prd-pomada" && item.referenceType === "PRODUCT_SALE",
      ),
    ).toHaveLength(1);
    expect(
      movements.filter(
        (item) => item.productId === "prd-pomada" && item.referenceType === "PRODUCT_REFUND",
      ),
    ).toHaveLength(1);
  });

  it("cancela comissao de produto pendente em devolucao total sem duplicar no replay", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const sale = await app.inject({
      method: "POST",
      url: "/sales/products",
      headers: { "idempotency-key": "sale-product-refund-commission-full" },
      payload: {
        unitId: "unit-01",
        professionalId: "pro-01",
        clientId: "cli-01",
        soldAt: "2026-04-29T14:00:00.000Z",
        items: [{ productId: "prd-pomada", quantity: 1 }],
      },
    });
    expect(sale.statusCode).toBe(200);
    const saleId = sale.json().sale.id as string;

    const beforeRefund = await app.inject({
      method: "GET",
      url: "/financial/commissions?unitId=unit-01&start=2026-04-29T00:00:00.000Z&end=2026-04-29T23:59:59.999Z",
    });
    expect(beforeRefund.statusCode).toBe(200);
    const productCommission = beforeRefund
      .json()
      .entries.find(
        (item: { source: string; status: string }) =>
          item.source === "PRODUCT" && item.status === "PENDING",
      );
    expect(productCommission).toBeTruthy();

    const payload = {
      unitId: "unit-01",
      changedBy: "owner",
      reason: "Devolucao total cancela comissao pendente",
      refundedAt: "2026-04-29T15:00:00.000Z",
      items: [{ productId: "prd-pomada", quantity: 1 }],
    };
    const refund = await app.inject({
      method: "POST",
      url: `/sales/products/${saleId}/refund`,
      headers: { "idempotency-key": "refund-product-commission-full" },
      payload,
    });
    expect(refund.statusCode).toBe(200);
    expect(refund.json().canceledCommissions).toHaveLength(1);
    expect(refund.json().canceledCommissions[0]).toMatchObject({
      id: productCommission.id,
      status: "CANCELED",
    });

    const replay = await app.inject({
      method: "POST",
      url: `/sales/products/${saleId}/refund`,
      headers: { "idempotency-key": "refund-product-commission-full" },
      payload,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().refund.id).toBe(refund.json().refund.id);
    expect(replay.json().canceledCommissions).toHaveLength(1);

    const afterRefund = await app.inject({
      method: "GET",
      url: "/financial/commissions?unitId=unit-01&start=2026-04-29T00:00:00.000Z&end=2026-04-29T23:59:59.999Z",
    });
    expect(afterRefund.statusCode).toBe(200);
    const canceled = afterRefund
      .json()
      .entries.find((item: { id: string }) => item.id === productCommission.id);
    expect(canceled.status).toBe("CANCELED");

    const audit = await app.inject({
      method: "GET",
      url: "/audit/events?unitId=unit-01&entity=commission&action=PRODUCT_COMMISSION_CANCELED_BY_REFUND&limit=20",
    });
    expect(audit.statusCode).toBe(200);
    expect(
      audit.json().events.filter((item: { entityId: string }) => item.entityId === productCommission.id),
    ).toHaveLength(1);
  });

  it("cancela comissao de atendimento pendente no estorno e bloqueia pagamento posterior", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-barba",
        startsAt: "2026-04-30T14:00:00.000Z",
        changedBy: "owner",
      },
    });
    expect(created.statusCode).toBe(200);
    const appointmentId = created.json().appointment.id as string;

    for (const status of ["CONFIRMED", "IN_SERVICE"]) {
      const updated = await app.inject({
        method: "PATCH",
        url: `/appointments/${appointmentId}/status`,
        payload: { status, changedBy: "owner" },
      });
      expect(updated.statusCode).toBe(200);
    }

    const checkout = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: { "idempotency-key": "checkout-appointment-refund-commission" },
      payload: {
        changedBy: "owner",
        completedAt: "2026-04-30T14:45:00.000Z",
        paymentMethod: "PIX",
        expectedTotal: 55,
      },
    });
    expect(checkout.statusCode).toBe(200);
    expect(checkout.json().commissions).toHaveLength(1);
    const commissionId = checkout.json().commissions[0].id as string;

    const payload = {
      unitId: "unit-01",
      changedBy: "owner",
      reason: "Estorno cancela comissao de atendimento",
      refundedAt: "2026-04-30T15:00:00.000Z",
    };
    const refund = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/refund`,
      headers: { "idempotency-key": "refund-appointment-commission" },
      payload,
    });
    expect(refund.statusCode).toBe(200);
    expect(refund.json().canceledCommissions).toHaveLength(1);
    expect(refund.json().canceledCommissions[0]).toMatchObject({
      id: commissionId,
      status: "CANCELED",
    });

    const replay = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/refund`,
      headers: { "idempotency-key": "refund-appointment-commission" },
      payload,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().refund.id).toBe(refund.json().refund.id);
    expect(replay.json().canceledCommissions).toHaveLength(1);

    const commissions = await app.inject({
      method: "GET",
      url: "/financial/commissions?unitId=unit-01&start=2026-04-30T00:00:00.000Z&end=2026-04-30T23:59:59.999Z",
    });
    expect(commissions.statusCode).toBe(200);
    const canceled = commissions
      .json()
      .entries.find((item: { id: string }) => item.id === commissionId);
    expect(canceled.status).toBe("CANCELED");
    expect(canceled.paidAt).toBeNull();
    expect(commissions.json().summary.pendingCommission).toBe(0);

    const payCanceled = await app.inject({
      method: "PATCH",
      url: `/financial/commissions/${commissionId}/pay`,
      headers: { "idempotency-key": "pay-canceled-appointment-commission" },
      payload: {
        unitId: "unit-01",
        changedBy: "owner",
        paidAt: "2026-04-30T15:30:00.000Z",
      },
    });
    expect(payCanceled.statusCode).toBe(400);
    expect(payCanceled.json().error).toBe("Comissao cancelada nao pode ser paga");

    const transactions = await app.inject({
      method: "GET",
      url: "/financial/transactions?unitId=unit-01&start=2026-04-30T00:00:00.000Z&end=2026-04-30T23:59:59.999Z",
    });
    const related = transactions
      .json()
      .transactions.filter(
        (item: { appointmentId: string | null; notes: string | null }) =>
          item.appointmentId === appointmentId || item.notes?.includes(appointmentId),
      );
    expect(related.filter((item: { type: string; source: string }) => item.type === "INCOME" && item.source === "SERVICE")).toHaveLength(1);
    expect(related.filter((item: { type: string; source: string }) => item.type === "EXPENSE" && item.source === "REFUND")).toHaveLength(1);

    const audit = await app.inject({
      method: "GET",
      url: "/audit/events?unitId=unit-01&entity=commission&action=COMMISSION_CANCELED_DUE_TO_APPOINTMENT_REFUND&limit=20",
    });
    expect(audit.statusCode).toBe(200);
    expect(
      audit.json().events.filter((item: { entityId: string }) => item.entityId === commissionId),
    ).toHaveLength(1);
  });

  it("bloqueia estorno automatico de atendimento com comissao ja paga", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-barba",
        startsAt: "2026-04-30T16:00:00.000Z",
        changedBy: "owner",
      },
    });
    expect(created.statusCode).toBe(200);
    const appointmentId = created.json().appointment.id as string;

    for (const status of ["CONFIRMED", "IN_SERVICE"]) {
      const updated = await app.inject({
        method: "PATCH",
        url: `/appointments/${appointmentId}/status`,
        payload: { status, changedBy: "owner" },
      });
      expect(updated.statusCode).toBe(200);
    }

    const checkout = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: { "idempotency-key": "checkout-paid-appointment-refund" },
      payload: {
        changedBy: "owner",
        completedAt: "2026-04-30T16:45:00.000Z",
        paymentMethod: "PIX",
        expectedTotal: 55,
      },
    });
    expect(checkout.statusCode).toBe(200);
    const commissionId = checkout.json().commissions[0].id as string;

    const pay = await app.inject({
      method: "PATCH",
      url: `/financial/commissions/${commissionId}/pay`,
      headers: { "idempotency-key": "pay-before-appointment-refund" },
      payload: {
        unitId: "unit-01",
        changedBy: "owner",
        paidAt: "2026-04-30T17:00:00.000Z",
      },
    });
    expect(pay.statusCode).toBe(200);

    const refund = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/refund`,
      headers: { "idempotency-key": "refund-paid-appointment-commission" },
      payload: {
        unitId: "unit-01",
        changedBy: "owner",
        reason: "Nao estornar comissao paga",
        refundedAt: "2026-04-30T17:30:00.000Z",
      },
    });
    expect(refund.statusCode).toBe(400);
    expect(refund.json().error).toBe("Comissao ja paga exige ajuste manual antes do estorno");

    const transactions = await app.inject({
      method: "GET",
      url: "/financial/transactions?unitId=unit-01&start=2026-04-30T00:00:00.000Z&end=2026-04-30T23:59:59.999Z",
    });
    expect(
      transactions
        .json()
        .transactions.filter(
          (item: { type: string; source: string; notes: string | null }) =>
            item.type === "EXPENSE" &&
            item.source === "REFUND" &&
            item.notes?.includes(appointmentId),
        ),
    ).toHaveLength(0);
  });

  it("nao cancela silenciosamente comissao de produto ja paga em devolucao total", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const sale = await app.inject({
      method: "POST",
      url: "/sales/products",
      headers: { "idempotency-key": "sale-product-refund-paid-commission" },
      payload: {
        unitId: "unit-01",
        professionalId: "pro-01",
        clientId: "cli-01",
        soldAt: "2026-04-29T16:00:00.000Z",
        items: [{ productId: "prd-pomada", quantity: 1 }],
      },
    });
    expect(sale.statusCode).toBe(200);
    const saleId = sale.json().sale.id as string;

    const commissions = await app.inject({
      method: "GET",
      url: "/financial/commissions?unitId=unit-01&start=2026-04-29T00:00:00.000Z&end=2026-04-29T23:59:59.999Z",
    });
    const productCommission = commissions
      .json()
      .entries.find(
        (item: { source: string; status: string }) =>
          item.source === "PRODUCT" && item.status === "PENDING",
      );
    expect(productCommission).toBeTruthy();

    const pay = await app.inject({
      method: "PATCH",
      url: `/financial/commissions/${productCommission.id}/pay`,
      headers: { "idempotency-key": "pay-product-commission-before-refund" },
      payload: {
        unitId: "unit-01",
        changedBy: "owner",
        paidAt: "2026-04-29T16:30:00.000Z",
      },
    });
    expect(pay.statusCode).toBe(200);
    expect(pay.json().status).toBe("PAID");

    const refund = await app.inject({
      method: "POST",
      url: `/sales/products/${saleId}/refund`,
      headers: { "idempotency-key": "refund-product-paid-commission" },
      payload: {
        unitId: "unit-01",
        changedBy: "owner",
        reason: "Devolucao total preserva comissao paga",
        refundedAt: "2026-04-29T17:00:00.000Z",
        items: [{ productId: "prd-pomada", quantity: 1 }],
      },
    });
    expect(refund.statusCode).toBe(200);
    expect(refund.json().canceledCommissions).toHaveLength(0);

    const afterRefund = await app.inject({
      method: "GET",
      url: "/financial/commissions?unitId=unit-01&start=2026-04-29T00:00:00.000Z&end=2026-04-29T23:59:59.999Z",
    });
    const stillPaid = afterRefund
      .json()
      .entries.find((item: { id: string }) => item.id === productCommission.id);
    expect(stillPaid.status).toBe("PAID");
  });

  it("lista historico de vendas de produto por unidade com filtros e status de devolucao", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const saleUnit01 = await app.inject({
      method: "POST",
      url: "/sales/products",
      headers: { "idempotency-key": "history-sale-unit-01" },
      payload: {
        unitId: "unit-01",
        professionalId: "pro-01",
        clientId: "cli-01",
        soldAt: "2026-04-28T10:00:00.000Z",
        items: [{ productId: "prd-pomada", quantity: 2 }],
      },
    });
    expect(saleUnit01.statusCode).toBe(200);

    await app.inject({
      method: "POST",
      url: "/inventory",
      payload: {
        unitId: "unit-02",
        name: "Pomada Unidade 02",
        salePrice: 35,
        quantity: 5,
        costPrice: 12,
        minimumStock: 1,
        category: "Finalizacao",
        changedBy: "owner",
      },
    });

    const list = await app.inject({
      method: "GET",
      url: "/sales/products?unitId=unit-01&start=2026-04-28T00:00:00.000Z&end=2026-04-28T23:59:59.999Z&productId=prd-pomada&search=Pomada",
    });
    expect(list.statusCode).toBe(200);
    const rows = list.json().sales as Array<{
      id: string;
      unitId: string;
      status: string;
      items: Array<{ productId: string; productName: string; refundedQuantity: number }>;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(saleUnit01.json().sale.id);
    expect(rows[0].unitId).toBe("unit-01");
    expect(rows[0].status).toBe("NOT_REFUNDED");
    expect(rows[0].items[0]).toMatchObject({
      productId: "prd-pomada",
      productName: "Pomada Matte",
      refundedQuantity: 0,
    });
  });

  it("devolve venda antiga a partir do historico mantendo financeiro, estoque e auditoria", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const sale = await app.inject({
      method: "POST",
      url: "/sales/products",
      headers: { "idempotency-key": "history-refund-sale" },
      payload: {
        unitId: "unit-01",
        professionalId: "pro-01",
        clientId: "cli-01",
        soldAt: "2026-04-20T10:00:00.000Z",
        items: [{ productId: "prd-pomada", quantity: 1 }],
      },
    });
    expect(sale.statusCode).toBe(200);

    const history = await app.inject({
      method: "GET",
      url: "/sales/products?unitId=unit-01&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.999Z",
    });
    expect(history.statusCode).toBe(200);
    const historicalSale = history
      .json()
      .sales.find((item: { id: string }) => item.id === sale.json().sale.id);
    expect(historicalSale).toBeTruthy();

    const refund = await app.inject({
      method: "POST",
      url: `/sales/products/${historicalSale.id}/refund`,
      headers: { "idempotency-key": "history-refund-key" },
      payload: {
        unitId: "unit-01",
        changedBy: "owner",
        reason: "Devolucao historica",
        refundedAt: "2026-05-01T12:00:00.000Z",
        items: [{ productId: "prd-pomada", quantity: 1 }],
      },
    });
    expect(refund.statusCode).toBe(200);
    expect(refund.json().financialEntry).toMatchObject({
      kind: "EXPENSE",
      source: "REFUND",
      referenceType: "PRODUCT_SALE_REFUND",
    });
    expect(refund.json().stockMovements[0]).toMatchObject({
      movementType: "IN",
      referenceType: "PRODUCT_REFUND",
    });

    const updatedHistory = await app.inject({
      method: "GET",
      url: `/sales/products?unitId=unit-01&status=REFUNDED&search=${historicalSale.id}`,
    });
    expect(updatedHistory.statusCode).toBe(200);
    expect(updatedHistory.json().sales[0].totalRefundedAmount).toBe(59);
    expect(updatedHistory.json().sales[0].items[0].refundedQuantity).toBe(1);

    const audit = await app.inject({
      method: "GET",
      url: "/audit/events?unitId=unit-01&entity=product_sale_refund&action=PRODUCT_SALE_REFUNDED&limit=10",
    });
    expect(audit.statusCode).toBe(200);
    expect(
      audit.json().events.some((item: { entityId: string }) => item.entityId === refund.json().refund.id),
    ).toBe(true);
  });

  it("bloqueia devolucao por path de venda de produto de outra unidade sem efeitos colaterais", async () => {
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "true";
    const app = createApp();
    const tokenUnit02 = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-02",
    });
    const tokenUnit01 = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    });

    const product = await app.inject({
      method: "POST",
      url: "/inventory",
      headers: { authorization: `Bearer ${tokenUnit02}` },
      payload: {
        unitId: "unit-02",
        name: "Shampoo Unidade 02",
        salePrice: 42,
        quantity: 3,
        costPrice: 15,
        minimumStock: 1,
        category: "Banho",
      },
    });
    expect(product.statusCode).toBe(200);
    const productId = product.json().product.id as string;

    const sale = await app.inject({
      method: "POST",
      url: "/sales/products",
      headers: {
        authorization: `Bearer ${tokenUnit02}`,
        "idempotency-key": "tenant-sale-unit-02",
      },
      payload: {
        unitId: "unit-02",
        soldAt: "2026-04-29T10:00:00.000Z",
        items: [{ productId, quantity: 1 }],
      },
    });
    expect(sale.statusCode).toBe(200);

    const blocked = await app.inject({
      method: "POST",
      url: `/sales/products/${sale.json().sale.id}/refund`,
      headers: {
        authorization: `Bearer ${tokenUnit01}`,
        "idempotency-key": "tenant-refund-blocked",
      },
      payload: {
        unitId: "unit-02",
        reason: "Tentativa cruzada",
        refundedAt: "2026-04-29T11:00:00.000Z",
        items: [{ productId, quantity: 1 }],
      },
    });
    expect([403, 404]).toContain(blocked.statusCode);

    const historyUnit02 = await app.inject({
      method: "GET",
      url: "/sales/products?unitId=unit-02&limit=20",
      headers: { authorization: `Bearer ${tokenUnit02}` },
    });
    const saleAfter = historyUnit02
      .json()
      .sales.find((item: { id: string }) => item.id === sale.json().sale.id);
    expect(saleAfter.status).toBe("NOT_REFUNDED");

    const financialUnit02 = await app.inject({
      method: "GET",
      url: "/financial/transactions?unitId=unit-02&start=2026-04-29T00:00:00.000Z&end=2026-04-29T23:59:59.999Z",
      headers: { authorization: `Bearer ${tokenUnit02}` },
    });
    expect(
      financialUnit02
        .json()
        .transactions.filter((item: { type: string; source: string }) => item.type === "EXPENSE" && item.source === "REFUND"),
    ).toHaveLength(0);

    const stockUnit02 = await app.inject({
      method: "GET",
      url: "/stock/overview?unitId=unit-02&limit=20",
      headers: { authorization: `Bearer ${tokenUnit02}` },
    });
    expect(
      stockUnit02
        .json()
        .recentMovements.filter((item: { referenceType: string }) => item.referenceType === "PRODUCT_REFUND"),
    ).toHaveLength(0);
    process.env.AUTH_ENFORCED = "false";
  });

  it("bloqueia alteracao de produto e movimentacao manual de estoque por path fora da unidade ativa", async () => {
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "true";
    const app = createApp();
    const tokenUnit02 = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-02",
    });
    const tokenUnit01 = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    });

    const created = await app.inject({
      method: "POST",
      url: "/inventory",
      headers: { authorization: `Bearer ${tokenUnit02}` },
      payload: {
        unitId: "unit-02",
        name: "Produto Blindado",
        salePrice: 30,
        quantity: 4,
        costPrice: 10,
        minimumStock: 1,
        category: "Teste",
      },
    });
    expect(created.statusCode).toBe(200);
    const productId = created.json().product.id as string;

    const blockedUpdate = await app.inject({
      method: "PATCH",
      url: `/inventory/${productId}`,
      headers: { authorization: `Bearer ${tokenUnit01}` },
      payload: {
        unitId: "unit-02",
        quantity: 1,
      },
    });
    expect([403, 404]).toContain(blockedUpdate.statusCode);

    const blockedMovement = await app.inject({
      method: "POST",
      url: "/stock/movements/manual",
      headers: { authorization: `Bearer ${tokenUnit01}` },
      payload: {
        unitId: "unit-02",
        productId,
        movementType: "IN",
        quantity: 1,
      },
    });
    expect([403, 404]).toContain(blockedMovement.statusCode);

    const allowedList = await app.inject({
      method: "GET",
      url: "/inventory?unitId=unit-02&search=Produto%20Blindado",
      headers: { authorization: `Bearer ${tokenUnit02}` },
    });
    expect(allowedList.statusCode).toBe(200);
    expect(allowedList.json().products[0].quantity).toBe(4);
    process.env.AUTH_ENFORCED = "false";
  });

  it("paga comissao criando despesa financeira reconciliavel e idempotente", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const appointment = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-28T10:00:00.000Z",
        changedBy: "owner",
      },
    });
    const appointmentId = appointment.json().appointment.id as string;
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "CONFIRMED", changedBy: "owner" },
    });
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "IN_SERVICE", changedBy: "owner" },
    });
    await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/complete`,
      payload: { changedBy: "owner", completedAt: "2026-04-28T10:50:00.000Z" },
    });

    const commissions = await app.inject({
      method: "GET",
      url: "/financial/commissions?unitId=unit-01&start=2026-04-28T00:00:00.000Z&end=2026-04-28T23:59:59.999Z",
    });
    const pending = commissions
      .json()
      .entries.find((item: { status: string }) => item.status === "PENDING");
    expect(pending).toBeTruthy();

    const payPayload = {
      unitId: "unit-01",
      changedBy: "owner",
      paidAt: "2026-04-28T12:00:00.000Z",
    };
    const pay = await app.inject({
      method: "PATCH",
      url: `/financial/commissions/${pending.id}/pay`,
      headers: { "idempotency-key": "commission-expense-001" },
      payload: payPayload,
    });
    expect(pay.statusCode).toBe(200);
    expect(pay.json().status).toBe("PAID");
    expect(pay.json().paidAt).toBe(payPayload.paidAt);
    expect(typeof pay.json().financialEntryId).toBe("string");

    const replay = await app.inject({
      method: "PATCH",
      url: `/financial/commissions/${pending.id}/pay`,
      headers: { "idempotency-key": "commission-expense-001" },
      payload: payPayload,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(pay.json());

    const conflict = await app.inject({
      method: "PATCH",
      url: `/financial/commissions/${pending.id}/pay`,
      headers: { "idempotency-key": "commission-expense-001" },
      payload: { ...payPayload, paidAt: "2026-04-28T12:05:00.000Z" },
    });
    expect(conflict.statusCode).toBe(409);

    const alreadyPaid = await app.inject({
      method: "PATCH",
      url: `/financial/commissions/${pending.id}/pay`,
      headers: { "idempotency-key": "commission-expense-002" },
      payload: { ...payPayload, paidAt: "2026-04-28T12:10:00.000Z" },
    });
    expect(alreadyPaid.statusCode).toBe(200);
    expect(alreadyPaid.json().financialEntryId).toBe(pay.json().financialEntryId);

    const transactions = await app.inject({
      method: "GET",
      url: "/financial/transactions?unitId=unit-01&start=2026-04-28T00:00:00.000Z&end=2026-04-28T23:59:59.999Z",
    });
    const commissionExpenses = transactions
      .json()
      .transactions.filter(
        (item: { referenceType: string; referenceId: string }) =>
          item.referenceType === "COMMISSION" && item.referenceId === pending.id,
      );
    expect(commissionExpenses).toHaveLength(1);
    expect(commissionExpenses[0]).toMatchObject({
      type: "EXPENSE",
      category: "COMISSAO",
      amount: pending.commissionAmount,
      source: "COMMISSION",
      professionalId: pending.professionalId,
      commissionId: pending.id,
      referenceType: "COMMISSION",
      referenceId: pending.id,
    });

    const entries = await app.inject({
      method: "GET",
      url: "/financial/entries?unitId=unit-01&start=2026-04-28T00:00:00.000Z&end=2026-04-28T23:59:59.999Z&kind=EXPENSE",
    });
    expect(
      entries
        .json()
        .entries.filter((item: { referenceType: string }) => item.referenceType === "COMMISSION"),
    ).toHaveLength(1);

    const summary = await app.inject({
      method: "GET",
      url: "/financial/summary?unitId=unit-01&start=2026-04-28T00:00:00.000Z&end=2026-04-28T23:59:59.999Z",
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().summary.expenses).toBe(pending.commissionAmount);
    expect(summary.json().summary.paidCommissionsTotal).toBe(pending.commissionAmount);
    expect(summary.json().summary.refundsTotal).toBe(0);
    expect(summary.json().summary.operationalExpenses).toBe(0);
    expect(summary.json().cashFlow.outgoing).toBe(pending.commissionAmount);
  });

  it("registra auditoria persistente para pagamento de comissao e nao duplica em replay", async () => {
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "true";
    const app = createApp();
    const token = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    });

    const appointment = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-29T10:00:00.000Z",
        changedBy: "owner",
      },
    });
    const appointmentId = appointment.json().appointment.id as string;
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "CONFIRMED", changedBy: "owner" },
    });
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "IN_SERVICE", changedBy: "owner" },
    });
    const checkout = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "audit-commission-checkout",
      },
      payload: {
        changedBy: "owner",
        completedAt: "2026-04-29T10:50:00.000Z",
        paymentMethod: "PIX",
      },
    });
    expect(checkout.statusCode).toBe(200);

    const commissions = await app.inject({
      method: "GET",
      url: "/financial/commissions?unitId=unit-01&start=2026-04-29T00:00:00.000Z&end=2026-04-29T23:59:59.999Z",
      headers: { authorization: `Bearer ${token}` },
    });
    const pending = commissions
      .json()
      .entries.find((item: { status: string }) => item.status === "PENDING");
    expect(pending).toBeTruthy();

    const payPayload = {
      unitId: "unit-01",
      changedBy: "owner",
      paidAt: "2026-04-29T12:00:00.000Z",
    };
    const pay = await app.inject({
      method: "PATCH",
      url: `/financial/commissions/${pending.id}/pay`,
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "audit-commission-pay",
        "x-correlation-id": "corr-audit-commission-pay",
      },
      payload: payPayload,
    });
    expect(pay.statusCode).toBe(200);

    const replay = await app.inject({
      method: "PATCH",
      url: `/financial/commissions/${pending.id}/pay`,
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "audit-commission-pay",
        "x-correlation-id": "corr-audit-commission-pay-replay",
      },
      payload: payPayload,
    });
    expect(replay.statusCode).toBe(200);

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?unitId=unit-01&action=FINANCIAL_COMMISSION_MARKED_PAID&entity=financial_commission&limit=20`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(audit.statusCode).toBe(200);
    const events = audit.json().events as Array<{
      unitId: string;
      actorId: string;
      actorEmail: string;
      actorRole: string;
      action: string;
      entity: string;
      entityId: string;
      requestId: string;
      idempotencyKey: string;
      route: string;
      method: string;
    }>;
    const commissionEvents = events.filter((event) => event.entityId === pending.id);
    expect(commissionEvents).toHaveLength(1);
    expect(commissionEvents[0]).toMatchObject({
      unitId: "unit-01",
      actorId: "usr-owner",
      actorEmail: "owner@barbearia.local",
      actorRole: "owner",
      action: "FINANCIAL_COMMISSION_MARKED_PAID",
      entity: "financial_commission",
      entityId: pending.id,
      requestId: "corr-audit-commission-pay",
      idempotencyKey: "audit-commission-pay",
      route: "/financial/commissions/:id/pay",
      method: "PATCH",
    });
    process.env.AUTH_ENFORCED = "false";
  });

  it("registra auditoria para devolucao, permite usuario autenticado padrao e preserva append-only", async () => {
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "true";
    const app = createApp();
    const ownerToken = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    });
    const receptionToken = await loginAs(app, {
      email: "recepcao@barbearia.local",
      password: "recepcao123",
      activeUnitId: "unit-01",
    });

    const sale = await app.inject({
      method: "POST",
      url: "/sales/products",
      headers: {
        authorization: `Bearer ${ownerToken}`,
        "idempotency-key": "audit-product-sale",
      },
      payload: {
        unitId: "unit-01",
        professionalId: "pro-01",
        clientId: "cli-01",
        soldAt: "2026-04-30T14:00:00.000Z",
        items: [{ productId: "prd-pomada", quantity: 1 }],
      },
    });
    expect(sale.statusCode).toBe(200);
    const saleId = sale.json().sale.id as string;

    const refundPayload = {
      unitId: "unit-01",
      changedBy: "owner",
      reason: "Produto devolvido para teste de auditoria",
      refundedAt: "2026-04-30T15:00:00.000Z",
      items: [{ productId: "prd-pomada", quantity: 1 }],
    };
    const refund = await app.inject({
      method: "POST",
      url: `/sales/products/${saleId}/refund`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
        "idempotency-key": "audit-product-refund",
        "x-correlation-id": "corr-audit-product-refund",
      },
      payload: refundPayload,
    });
    expect(refund.statusCode).toBe(200);
    const refundId = refund.json().refund.id as string;

    const refundReplay = await app.inject({
      method: "POST",
      url: `/sales/products/${saleId}/refund`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
        "idempotency-key": "audit-product-refund",
      },
      payload: refundPayload,
    });
    expect(refundReplay.statusCode).toBe(200);

    const auditAsReception = await app.inject({
      method: "GET",
      url: "/audit/events?unitId=unit-01",
      headers: { authorization: `Bearer ${receptionToken}` },
    });
    expect(auditAsReception.statusCode).toBe(403);

    const audit = await app.inject({
      method: "GET",
      url: "/audit/events?unitId=unit-01&entity=product_sale_refund&limit=20",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(audit.statusCode).toBe(200);
    const events = audit.json().events as Array<{
      id: string;
      action: string;
      entity: string;
      entityId: string;
      requestId: string;
      idempotencyKey: string;
      createdAt: string;
    }>;
    const refundEvents = events.filter((event) => event.entityId === refundId);
    expect(refundEvents).toHaveLength(1);
    expect(refundEvents[0]).toMatchObject({
      action: "PRODUCT_SALE_REFUNDED",
      entity: "product_sale_refund",
      entityId: refundId,
      requestId: "corr-audit-product-refund",
      idempotencyKey: "audit-product-refund",
    });
    for (let index = 1; index < events.length; index += 1) {
      expect(new Date(events[index - 1].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(events[index].createdAt).getTime(),
      );
    }

    const originalEvent = refundEvents[0];
    const originalCreatedAt = new Date(originalEvent.createdAt).getTime();
    const beforeOriginal = new Date(originalCreatedAt - 1).toISOString();
    const afterOriginal = new Date(originalCreatedAt + 1).toISOString();
    const insidePeriod = await app.inject({
      method: "GET",
      url: `/audit/events?unitId=unit-01&entity=product_sale_refund&start=${encodeURIComponent(beforeOriginal)}&end=${encodeURIComponent(afterOriginal)}&limit=20`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(insidePeriod.statusCode).toBe(200);
    expect(
      (insidePeriod.json().events as Array<{ id: string }>).some((event) => event.id === originalEvent.id),
    ).toBe(true);

    const outsidePeriod = await app.inject({
      method: "GET",
      url: `/audit/events?unitId=unit-01&entity=product_sale_refund&end=${encodeURIComponent(beforeOriginal)}&limit=20`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(outsidePeriod.statusCode).toBe(200);
    expect(
      (outsidePeriod.json().events as Array<{ id: string }>).some((event) => event.id === originalEvent.id),
    ).toBe(false);

    const manual = await app.inject({
      method: "POST",
      url: "/financial/manual-entry",
      headers: {
        authorization: `Bearer ${ownerToken}`,
        "idempotency-key": "audit-manual-entry-after-refund",
      },
      payload: {
        unitId: "unit-01",
        kind: "INCOME",
        amount: 25,
        occurredAt: "2026-04-30T16:00:00.000Z",
        description: "Receita posterior a auditoria",
        changedBy: "owner",
      },
    });
    expect(manual.statusCode).toBe(200);

    const afterAnotherFlow = await app.inject({
      method: "GET",
      url: `/audit/events?unitId=unit-01&entity=product_sale_refund&action=PRODUCT_SALE_REFUNDED&limit=20`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const preserved = (afterAnotherFlow.json().events as Array<typeof originalEvent>).find(
      (event) => event.id === originalEvent.id,
    );
    expect(preserved).toEqual(originalEvent);

    const patchAudit = await app.inject({
      method: "PATCH",
      url: "/audit/events",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { unitId: "unit-01" },
    });
    const deleteAudit = await app.inject({
      method: "DELETE",
      url: "/audit/events",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { unitId: "unit-01" },
    });
    expect([404, 405]).toContain(patchAudit.statusCode);
    expect([404, 405]).toContain(deleteAudit.statusCode);
    process.env.AUTH_ENFORCED = "false";
  });

  it("bloqueia operacoes criticas sem idempotencyKey antes de qualquer efeito colateral", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();
    const requiredMessage = "idempotencyKey é obrigatória para esta operação";

    const appointment = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-26T10:00:00.000Z",
        changedBy: "owner",
      },
    });
    const appointmentId = appointment.json().appointment.id as string;
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "CONFIRMED", changedBy: "owner" },
    });
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "IN_SERVICE", changedBy: "owner" },
    });

    const checkout = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      payload: {
        changedBy: "owner",
        completedAt: "2026-04-26T10:50:00.000Z",
        paymentMethod: "PIX",
      },
    });
    expect(checkout.statusCode).toBe(400);
    expect(checkout.json().error).toBe(requiredMessage);
    const appointmentDetail = await app.inject({
      method: "GET",
      url: `/appointments/${appointmentId}`,
    });
    expect(appointmentDetail.json().appointment.status).toBe("IN_SERVICE");

    const sale = await app.inject({
      method: "POST",
      url: "/sales/products",
      payload: {
        unitId: "unit-01",
        soldAt: "2026-04-26T11:00:00.000Z",
        professionalId: "pro-01",
        clientId: "cli-01",
        items: [{ productId: "prd-pomada", quantity: 1 }],
      },
    });
    expect(sale.statusCode).toBe(400);
    expect(sale.json().error).toBe(requiredMessage);
    const saleTransactions = await app.inject({
      method: "GET",
      url: "/financial/transactions?unitId=unit-01&start=2026-04-26T00:00:00.000Z&end=2026-04-26T23:59:59.999Z",
    });
    expect(
      saleTransactions
        .json()
        .transactions.filter((item: { referenceType: string }) => item.referenceType === "PRODUCT_SALE"),
    ).toHaveLength(0);

    const manualEntry = await app.inject({
      method: "POST",
      url: "/financial/manual-entry",
      payload: {
        unitId: "unit-01",
        kind: "INCOME",
        amount: 125,
        occurredAt: "2026-04-26T12:00:00.000Z",
        description: "Manual sem chave",
        changedBy: "owner",
      },
    });
    expect(manualEntry.statusCode).toBe(400);
    expect(manualEntry.json().error).toBe(requiredMessage);
    const manualEntries = await app.inject({
      method: "GET",
      url: "/financial/entries?unitId=unit-01&start=2026-04-26T00:00:00.000Z&end=2026-04-26T23:59:59.999Z",
    });
    expect(
      manualEntries
        .json()
        .entries.filter((item: { description: string }) => item.description === "Manual sem chave"),
    ).toHaveLength(0);

    const financialTransaction = await app.inject({
      method: "POST",
      url: "/financial/transactions",
      payload: {
        unitId: "unit-01",
        type: "INCOME",
        category: "AJUSTE",
        description: "Transacao sem chave",
        amount: 140,
        date: "2026-04-26T13:00:00.000Z",
        paymentMethod: "PIX",
        changedBy: "owner",
      },
    });
    expect(financialTransaction.statusCode).toBe(400);
    expect(financialTransaction.json().error).toBe(requiredMessage);
    const financialTransactions = await app.inject({
      method: "GET",
      url: "/financial/transactions?unitId=unit-01&start=2026-04-26T00:00:00.000Z&end=2026-04-26T23:59:59.999Z",
    });
    expect(
      financialTransactions
        .json()
        .transactions.filter((item: { description: string }) => item.description === "Transacao sem chave"),
    ).toHaveLength(0);

    const commissionAppointment = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-27T10:00:00.000Z",
        changedBy: "owner",
      },
    });
    const commissionAppointmentId = commissionAppointment.json().appointment.id as string;
    await app.inject({
      method: "PATCH",
      url: `/appointments/${commissionAppointmentId}/status`,
      payload: { status: "CONFIRMED", changedBy: "owner" },
    });
    await app.inject({
      method: "PATCH",
      url: `/appointments/${commissionAppointmentId}/status`,
      payload: { status: "IN_SERVICE", changedBy: "owner" },
    });
    await app.inject({
      method: "POST",
      url: `/appointments/${commissionAppointmentId}/complete`,
      payload: { changedBy: "owner", completedAt: "2026-04-27T10:50:00.000Z" },
    });
    const commissions = await app.inject({
      method: "GET",
      url: "/financial/commissions?unitId=unit-01&start=2026-04-27T00:00:00.000Z&end=2026-04-27T23:59:59.999Z",
    });
    const pending = commissions.json().entries.find((item: { status: string }) => item.status === "PENDING");
    expect(pending).toBeTruthy();
    const pay = await app.inject({
      method: "PATCH",
      url: `/financial/commissions/${pending.id}/pay`,
      payload: {
        unitId: "unit-01",
        changedBy: "owner",
        paidAt: "2026-04-27T12:00:00.000Z",
      },
    });
    expect(pay.statusCode).toBe(400);
    expect(pay.json().error).toBe(requiredMessage);
    const commissionsAfterPay = await app.inject({
      method: "GET",
      url: "/financial/commissions?unitId=unit-01&start=2026-04-27T00:00:00.000Z&end=2026-04-27T23:59:59.999Z",
    });
    const stillPending = commissionsAfterPay
      .json()
      .entries.find((item: { id: string }) => item.id === pending.id);
    expect(stillPending.status).toBe("PENDING");
  });

  it("valida metodo de pagamento obrigatorio no checkout", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-23T11:00:00.000Z",
        changedBy: "owner",
      },
    });
    const appointmentId = created.json().appointment.id as string;

    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "CONFIRMED", changedBy: "owner" },
    });
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "IN_SERVICE", changedBy: "owner" },
    });

    const checkout = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: { "idempotency-key": "checkout-payment-method-validation" },
      payload: {
        changedBy: "owner",
        completedAt: "2026-04-23T11:50:00.000Z",
        paymentMethod: "   ",
      },
    });

    expect(checkout.statusCode).toBe(400);
  });

  it("valida consistencia do total no checkout", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-23T12:00:00.000Z",
        changedBy: "owner",
      },
    });
    const appointmentId = created.json().appointment.id as string;

    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "CONFIRMED", changedBy: "owner" },
    });
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "IN_SERVICE", changedBy: "owner" },
    });

    const checkout = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: { "idempotency-key": "checkout-total-validation" },
      payload: {
        changedBy: "owner",
        completedAt: "2026-04-23T12:50:00.000Z",
        paymentMethod: "PIX",
        expectedTotal: 1,
      },
    });

    expect(checkout.statusCode).toBe(400);
    expect(String(checkout.json().error || "")).toContain("Total inconsistente");
  });

  it("bloqueia venda quando estoque e insuficiente", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const response = await app.inject({
      method: "POST",
      url: "/sales/products",
      headers: { "idempotency-key": "sale-insufficient-stock" },
      payload: {
        unitId: "unit-01",
        soldAt: "2026-04-23T15:00:00.000Z",
        items: [{ productId: "prd-pomada", quantity: 999 }],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("aplica consumo de estoque por servico ao concluir atendimento", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const profileResponse = await app.inject({
      method: "PUT",
      url: "/services/svc-corte/stock-consumption",
      payload: {
        unitId: "unit-01",
        items: [
          {
            productId: "prd-pomada",
            quantityPerService: 1,
            wastePct: 0,
            isCritical: true,
          },
        ],
        changedBy: "owner",
      },
    });
    expect(profileResponse.statusCode).toBe(200);

    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-24T13:00:00.000Z",
        changedBy: "owner",
      },
    });
    const appointmentId = created.json().appointment.id as string;

    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: {
        status: "CONFIRMED",
        changedBy: "owner",
      },
    });
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: {
        status: "IN_SERVICE",
        changedBy: "owner",
      },
    });

    const completed = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/complete`,
      payload: {
        changedBy: "owner",
        completedAt: "2026-04-24T14:00:00.000Z",
      },
    });
    expect(completed.statusCode).toBe(200);
    const completedBody = completed.json();
    expect(completedBody.stockConsumption.applied).toBe(true);
    expect(completedBody.stockConsumption.movementsCount).toBe(1);

    const stockResponse = await app.inject({
      method: "GET",
      url: "/stock/overview?unitId=unit-01",
    });
    expect(stockResponse.statusCode).toBe(200);
    const stockBody = stockResponse.json();
    const serviceMovement = stockBody.recentMovements.find(
      (item: { referenceType: string; productId: string }) =>
        item.referenceType === "SERVICE_CONSUMPTION" && item.productId === "prd-pomada",
    );
    expect(serviceMovement).toBeTruthy();
  });

  it("permite movimentacao manual de estoque para reposicao rapida", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const movementResponse = await app.inject({
      method: "POST",
      url: "/stock/movements/manual",
      payload: {
        unitId: "unit-01",
        productId: "prd-pomada",
        movementType: "IN",
        quantity: 3,
        changedBy: "owner",
      },
    });

    expect(movementResponse.statusCode).toBe(200);
    const body = movementResponse.json();
    expect(body.movement.movementType).toBe("IN");
    expect(body.product.stockQty).toBeGreaterThanOrEqual(18);
  });

  it("lista, cria e atualiza produtos no modulo de inventory", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const createResponse = await app.inject({
      method: "POST",
      url: "/inventory",
      payload: {
        unitId: "unit-01",
        name: "Gel Modelador",
        salePrice: 49.9,
        quantity: 7,
        costPrice: 18.5,
        minimumStock: 2,
        category: "Finalizacao",
        notes: "Prateleira A",
        changedBy: "owner",
      },
    });
    expect(createResponse.statusCode).toBe(200);
    const createdProductId = createResponse.json().product.id as string;

    const listResponse = await app.inject({
      method: "GET",
      url: "/inventory?unitId=unit-01&search=Gel",
    });
    expect(listResponse.statusCode).toBe(200);
    const listBody = listResponse.json();
    expect(Array.isArray(listBody.products)).toBe(true);
    expect(listBody.products.some((item: { id: string }) => item.id === createdProductId)).toBe(
      true,
    );

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/inventory/${createdProductId}`,
      payload: {
        unitId: "unit-01",
        quantity: 4,
        minimumStock: 1,
        changedBy: "owner",
      },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().product.quantity).toBe(4);
  });

  it("ajusta estoque pelo endpoint rapido sem permitir saldo negativo", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const response = await app.inject({
      method: "PATCH",
      url: "/inventory/prd-pomada/stock",
      payload: {
        unitId: "unit-01",
        type: "OUT",
        quantity: 9999,
        reason: "Ajuste invalido",
        changedBy: "owner",
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("Quantidade de saida maior que o saldo atual");
  });

  it("retorna e atualiza ficha tecnica de consumo por servico", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const update = await app.inject({
      method: "PUT",
      url: "/services/svc-barba/stock-consumption",
      payload: {
        unitId: "unit-01",
        items: [
          {
            productId: "prd-oleo-barba",
            quantityPerService: 0.25,
            wastePct: 2,
            isCritical: true,
          },
        ],
        changedBy: "owner",
      },
    });
    expect(update.statusCode).toBe(200);

    const getResponse = await app.inject({
      method: "GET",
      url: "/services/svc-barba/stock-consumption?unitId=unit-01",
    });
    expect(getResponse.statusCode).toBe(200);
    const body = getResponse.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items[0].productId).toBe("prd-oleo-barba");
    expect(body.items[0].quantityPerService).toBe(0.25);
  });

  it("opera o modulo de servicos com CRUD, status e resumo", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const created = await app.inject({
      method: "POST",
      url: "/services",
      payload: {
        unitId: "unit-01",
        name: "Sobrancelha Express",
        price: 30,
        durationMinutes: 20,
        category: "ESTETICA",
        description: "Alinhamento rapido de sobrancelha.",
        defaultCommissionRate: 20,
        professionalIds: ["pro-01"],
        estimatedCost: 4,
      },
    });
    expect(created.statusCode).toBe(200);
    const serviceId = created.json().service.id as string;

    const listed = await app.inject({
      method: "GET",
      url: "/services?unitId=unit-01&search=Sobrancelha",
    });
    expect(listed.statusCode).toBe(200);
    expect(Array.isArray(listed.json().services)).toBe(true);
    expect(listed.json().services.some((item: { id: string }) => item.id === serviceId)).toBe(true);

    const updated = await app.inject({
      method: "PATCH",
      url: `/services/${serviceId}`,
      payload: {
        unitId: "unit-01",
        price: 35,
        durationMinutes: 25,
        notes: "Ajustado apos analise de margem",
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().service.price).toBe(35);
    expect(updated.json().service.durationMinutes).toBe(25);

    const status = await app.inject({
      method: "PATCH",
      url: `/services/${serviceId}/status`,
      payload: {
        unitId: "unit-01",
        isActive: false,
      },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json().service.isActive).toBe(false);

    const detail = await app.inject({
      method: "GET",
      url: `/services/${serviceId}?unitId=unit-01`,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().service.id).toBe(serviceId);

    const summary = await app.inject({
      method: "GET",
      url: "/services/summary?unitId=unit-01",
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toHaveProperty("totalServices");
    expect(summary.json()).toHaveProperty("activeServices");

    const removed = await app.inject({
      method: "DELETE",
      url: `/services/${serviceId}`,
      payload: {
        unitId: "unit-01",
      },
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().mode).toBe("deleted");
  });

  it("normaliza comissao padrao de servico em percentual humano sem overflow", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const decimal = await app.inject({
      method: "POST",
      url: "/services",
      payload: {
        unitId: "unit-01",
        name: "Comissao Decimal",
        price: 30,
        durationMinutes: 20,
        defaultCommissionRate: 0.3,
      },
    });
    expect(decimal.statusCode).toBe(200);
    expect(decimal.json().service.defaultCommissionRate).toBe(30);

    const percent = await app.inject({
      method: "POST",
      url: "/services",
      payload: {
        unitId: "unit-01",
        name: "Comissao Percentual",
        price: 40,
        durationMinutes: 25,
        defaultCommissionRate: 30,
      },
    });
    expect(percent.statusCode).toBe(200);
    expect(percent.json().service.defaultCommissionRate).toBe(30);

    const full = await app.inject({
      method: "POST",
      url: "/services",
      payload: {
        unitId: "unit-01",
        name: "Comissao Integral",
        price: 50,
        durationMinutes: 30,
        defaultCommissionRate: 100,
      },
    });
    expect(full.statusCode).toBe(200);
    expect(full.json().service.defaultCommissionRate).toBe(100);

    const invalidHigh = await app.inject({
      method: "POST",
      url: "/services",
      payload: {
        unitId: "unit-01",
        name: "Comissao Invalida Alta",
        price: 50,
        durationMinutes: 30,
        defaultCommissionRate: 150,
      },
    });
    expect(invalidHigh.statusCode).toBe(400);
    expect(invalidHigh.json().error).toContain("100");

    const invalidNegative = await app.inject({
      method: "POST",
      url: "/services",
      payload: {
        unitId: "unit-01",
        name: "Comissao Invalida Negativa",
        price: 50,
        durationMinutes: 30,
        defaultCommissionRate: -10,
      },
    });
    expect(invalidNegative.statusCode).toBe(400);
  });

  it("registra lancamento manual e retorna resumo financeiro correto", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const income = await app.inject({
      method: "POST",
      url: "/financial/manual-entry",
      headers: { "idempotency-key": "manual-entry-income-summary" },
      payload: {
        unitId: "unit-01",
        kind: "INCOME",
        amount: 200,
        occurredAt: "2026-04-23T09:00:00.000Z",
        description: "Entrada de caixa",
        changedBy: "owner",
      },
    });
    expect(income.statusCode).toBe(200);

    const expense = await app.inject({
      method: "POST",
      url: "/financial/manual-entry",
      headers: { "idempotency-key": "manual-entry-expense-summary" },
      payload: {
        unitId: "unit-01",
        kind: "EXPENSE",
        amount: 50,
        occurredAt: "2026-04-23T10:00:00.000Z",
        description: "Compra de materiais",
        changedBy: "owner",
      },
    });
    expect(expense.statusCode).toBe(200);

    const summary = await app.inject({
      method: "GET",
      url: "/financial/entries?unitId=unit-01&start=2026-04-23T00:00:00.000Z&end=2026-04-23T23:59:59.000Z",
    });

    expect(summary.statusCode).toBe(200);
    const body = summary.json();
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.summary.income).toBe(200);
    expect(body.summary.expense).toBe(50);
    expect(body.summary.net).toBe(150);
  });

  it("retorna overview financeiro gerencial com lucro, margem e comparativo", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const createAndComplete = async (startsAt: string, completedAt: string) => {
      const created = await app.inject({
        method: "POST",
        url: "/appointments",
        payload: {
          unitId: "unit-01",
          clientId: "cli-01",
          professionalId: "pro-01",
          serviceId: "svc-corte",
          startsAt,
          changedBy: "owner",
        },
      });
      const appointmentId = created.json().appointment.id as string;
      await app.inject({
        method: "PATCH",
        url: `/appointments/${appointmentId}/status`,
        payload: { status: "CONFIRMED", changedBy: "owner" },
      });
      await app.inject({
        method: "PATCH",
        url: `/appointments/${appointmentId}/status`,
        payload: { status: "IN_SERVICE", changedBy: "owner" },
      });
      await app.inject({
        method: "POST",
        url: `/appointments/${appointmentId}/complete`,
        payload: { changedBy: "owner", completedAt },
      });
    };

    await createAndComplete("2026-04-10T10:00:00.000Z", "2026-04-10T11:00:00.000Z");
    await createAndComplete("2026-04-11T10:00:00.000Z", "2026-04-11T11:00:00.000Z");
    await app.inject({
      method: "POST",
      url: "/sales/products",
      headers: { "idempotency-key": "management-overview-sale" },
      payload: {
        unitId: "unit-01",
        soldAt: "2026-04-11T12:00:00.000Z",
        professionalId: "pro-01",
        clientId: "cli-01",
        items: [{ productId: "prd-pomada", quantity: 1 }],
      },
    });
    await app.inject({
      method: "POST",
      url: "/financial/manual-entry",
      headers: { "idempotency-key": "management-overview-expense" },
      payload: {
        unitId: "unit-01",
        kind: "EXPENSE",
        amount: 25,
        occurredAt: "2026-04-11T08:00:00.000Z",
        description: "Despesa operacional",
        changedBy: "owner",
      },
    });

    const response = await app.inject({
      method: "GET",
      url:
        "/financial/management/overview?unitId=unit-01&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.999Z&compareStart=2026-03-01T00:00:00.000Z&compareEnd=2026-03-31T23:59:59.999Z",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty("summary");
    expect(body.summary).toHaveProperty("current");
    expect(body.summary).toHaveProperty("previous");
    expect(body.summary).toHaveProperty("delta");
    expect(body.summary.current.grossRevenue).toBeGreaterThan(0);
    expect(body.summary.current).toHaveProperty("operationalProfit");
    expect(body.summary.current).toHaveProperty("operationalMarginPct");
    expect(Array.isArray(body.professionals)).toBe(true);
    expect(body.professionals.length).toBeGreaterThan(0);
    expect(body.professionals[0]).toHaveProperty("estimatedProfit");
    expect(body.professionals[0]).toHaveProperty("marginPct");
    expect(body).toHaveProperty("highlights");
    expect(body.highlights).toHaveProperty("topProfitProfessional");
  });

  it("opera o modulo financeiro completo com transacoes, resumo, comissoes e relatorios", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const created = await app.inject({
      method: "POST",
      url: "/financial/transactions",
      headers: { "idempotency-key": "financial-module-create-transaction" },
      payload: {
        unitId: "unit-01",
        type: "INCOME",
        category: "AJUSTE",
        description: "Entrada extraordinaria",
        amount: 180,
        date: "2026-04-23T09:00:00.000Z",
        paymentMethod: "PIX",
        changedBy: "owner",
      },
    });
    expect(created.statusCode).toBe(200);
    const transactionId = created.json().transaction.id as string;

    const updated = await app.inject({
      method: "PATCH",
      url: `/financial/transactions/${transactionId}`,
      payload: {
        unitId: "unit-01",
        amount: 200,
        description: "Entrada extraordinaria ajustada",
        changedBy: "owner",
      },
    });
    expect(updated.statusCode).toBe(200);

    const list = await app.inject({
      method: "GET",
      url: "/financial/transactions?unitId=unit-01&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.999Z&type=INCOME",
    });
    expect(list.statusCode).toBe(200);
    expect(Array.isArray(list.json().transactions)).toBe(true);
    expect(list.json().summary.income).toBeGreaterThanOrEqual(200);

    const listByBusinessId = await app.inject({
      method: "GET",
      url: "/financial/transactions?businessId=unit-01&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.999Z&type=INCOME",
    });
    expect(listByBusinessId.statusCode).toBe(200);
    expect(Array.isArray(listByBusinessId.json().transactions)).toBe(true);
    expect(listByBusinessId.json().transactions.length).toBeGreaterThan(0);

    const summary = await app.inject({
      method: "GET",
      url: "/financial/summary?unitId=unit-01&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.999Z&compareStart=2026-03-01T00:00:00.000Z&compareEnd=2026-03-31T23:59:59.999Z",
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toHaveProperty("summary");
    expect(summary.json()).toHaveProperty("cashFlow");

    const appointment = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-24T13:00:00.000Z",
        changedBy: "owner",
      },
    });
    const appointmentId = appointment.json().appointment.id as string;
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "CONFIRMED", changedBy: "owner" },
    });
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "IN_SERVICE", changedBy: "owner" },
    });
    await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/complete`,
      payload: { changedBy: "owner", completedAt: "2026-04-24T14:00:00.000Z" },
    });

    const commissions = await app.inject({
      method: "GET",
      url: "/financial/commissions?unitId=unit-01&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.999Z",
    });
    expect(commissions.statusCode).toBe(200);
    const commissionBody = commissions.json();
    expect(Array.isArray(commissionBody.entries)).toBe(true);
    const pending = commissionBody.entries.find(
      (item: { status: string }) => item.status === "PENDING",
    );
    expect(pending).toBeTruthy();

    const pay = await app.inject({
      method: "PATCH",
      url: `/financial/commissions/${pending.id}/pay`,
      headers: { "idempotency-key": "financial-module-pay-commission" },
      payload: {
        unitId: "unit-01",
        changedBy: "owner",
        paidAt: "2026-04-25T10:00:00.000Z",
      },
    });
    expect(pay.statusCode).toBe(200);
    expect(pay.json().status).toBe("PAID");

    const reports = await app.inject({
      method: "GET",
      url: "/financial/reports?unitId=unit-01&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.999Z",
    });
    expect(reports.statusCode).toBe(200);
    expect(reports.json()).toHaveProperty("rankings");
    expect(reports.json()).toHaveProperty("margin");

    const deleted = await app.inject({
      method: "DELETE",
      url: `/financial/transactions/${transactionId}`,
      payload: {
        unitId: "unit-01",
        changedBy: "owner",
      },
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().deleted).toBe(true);
  });

  it("retorna contratos financeiros validos mesmo sem movimentacoes no periodo", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const start = "2026-02-01T00:00:00.000Z";
    const end = "2026-02-28T23:59:59.999Z";
    const compareStart = "2026-01-01T00:00:00.000Z";
    const compareEnd = "2026-01-31T23:59:59.999Z";

    const [summary, transactions, commissions, reports] = await Promise.all([
      app.inject({
        method: "GET",
        url: `/financial/summary?unitId=unit-01&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&compareStart=${encodeURIComponent(compareStart)}&compareEnd=${encodeURIComponent(compareEnd)}`,
      }),
      app.inject({
        method: "GET",
        url: `/financial/transactions?unitId=unit-01&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      }),
      app.inject({
        method: "GET",
        url: `/financial/commissions?unitId=unit-01&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      }),
      app.inject({
        method: "GET",
        url: `/financial/reports?unitId=unit-01&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      }),
    ]);

    expect(summary.statusCode).toBe(200);
    expect(summary.json().summary.grossRevenue).toBe(0);
    expect(summary.json().summary.expenses).toBe(0);
    expect(summary.json().summary.estimatedProfit).toBe(0);
    expect(summary.json().cashFlow.incoming).toBe(0);
    expect(summary.json().cashFlow.outgoing).toBe(0);

    expect(transactions.statusCode).toBe(200);
    expect(Array.isArray(transactions.json().transactions)).toBe(true);
    expect(transactions.json().transactions).toHaveLength(0);
    expect(transactions.json().summary.income).toBe(0);
    expect(transactions.json().summary.expense).toBe(0);
    expect(transactions.json().summary.net).toBe(0);

    expect(commissions.statusCode).toBe(200);
    expect(Array.isArray(commissions.json().entries)).toBe(true);
    expect(commissions.json().entries).toHaveLength(0);
    expect(commissions.json().summary.totalCommission).toBe(0);
    expect(commissions.json().summary.pendingCommission).toBe(0);

    expect(reports.statusCode).toBe(200);
    expect(reports.json()).toHaveProperty("rankings");
    expect(reports.json()).toHaveProperty("margin");
    expect(Array.isArray(reports.json().rankings.revenueByProfessional)).toBe(true);
    expect(Array.isArray(reports.json().rankings.revenueByService)).toBe(true);
    expect(Array.isArray(reports.json().rankings.revenueByPaymentMethod)).toBe(true);
    expect(Array.isArray(reports.json().rankings.expenseByCategory)).toBe(true);
  });

  it("retorna visao de clientes 360 com metricas preditivas e fila de reativacao", async () => {
    process.env.DATA_BACKEND = "memory";
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
    const app = createApp();

    const createAndComplete = async (clientIdValue: string, startsAt: string, completedAt: string) => {
      const created = await app.inject({
        method: "POST",
        url: "/appointments",
        payload: {
          unitId: "unit-01",
          clientId: clientIdValue,
          professionalId: "pro-01",
          serviceId: "svc-corte",
          startsAt,
          changedBy: "owner",
        },
      });
      const appointmentId = created.json().appointment.id as string;
      await app.inject({
        method: "PATCH",
        url: `/appointments/${appointmentId}/status`,
        payload: { status: "CONFIRMED", changedBy: "owner" },
      });
      await app.inject({
        method: "PATCH",
        url: `/appointments/${appointmentId}/status`,
        payload: { status: "IN_SERVICE", changedBy: "owner" },
      });
      await app.inject({
        method: "POST",
        url: `/appointments/${appointmentId}/complete`,
        payload: { changedBy: "owner", completedAt },
      });
    };

    await createAndComplete("cli-01", "2026-04-02T10:00:00.000Z", "2026-04-02T11:00:00.000Z");
    await createAndComplete("cli-01", "2026-04-10T10:00:00.000Z", "2026-04-10T11:00:00.000Z");
    await createAndComplete("cli-01", "2026-04-20T10:00:00.000Z", "2026-04-20T11:00:00.000Z");
    await createAndComplete("cli-02", "2026-03-01T10:00:00.000Z", "2026-03-01T11:00:00.000Z");
    await createAndComplete("cli-02", "2026-03-10T10:00:00.000Z", "2026-03-10T11:00:00.000Z");

    const response = await app.inject({
      method: "GET",
      url: "/clients/overview?unitId=unit-01&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.000Z",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body.clients)).toBe(true);
    expect(Array.isArray(body.reactivationQueue)).toBe(true);
    expect(body.summary.totalClients).toBeGreaterThanOrEqual(2);
    expect(body.summary).toHaveProperty("atRisk");
    expect(body.summary).toHaveProperty("vip");
    expect(body.summary).toHaveProperty("potentialReactivationRevenue");
    const activeClient = body.clients.find((item: { clientId: string }) => item.clientId === "cli-01");
    const atRiskClient = body.clients.find((item: { clientId: string }) => item.clientId === "cli-02");
    expect(activeClient?.status).toBe("VIP");
    expect(atRiskClient?.status).toBe("AT_RISK");
    expect(activeClient).toHaveProperty("ltv");
    expect(activeClient).toHaveProperty("averageTicket");
    expect(activeClient).toHaveProperty("visitFrequencyDays");
    expect(activeClient).toHaveProperty("reactivationScore");
    expect(activeClient).toHaveProperty("estimatedReactivationImpact");
    expect(activeClient).toHaveProperty("recommendedAction");
    expect(body.reactivationQueue.length).toBeGreaterThan(0);
    expect(body.reactivationQueue[0]).toHaveProperty("estimatedImpact");
  });

  it("cadastra cliente manualmente e lista no endpoint de clientes", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const created = await app.inject({
      method: "POST",
      url: "/clients",
      payload: {
        unitId: "unit-01",
        name: "Marina Costa",
        phone: "(11) 97777-6666",
        email: "marina@teste.com",
        birthDate: "1994-09-20",
        notes: "Cliente criada via teste",
        status: "NEW",
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().client.name).toBe("Marina Costa");
    expect(created.json().client.phone).toBe("11977776666");

    const listed = await app.inject({
      method: "GET",
      url: "/clients?unitId=unit-01",
    });
    expect(listed.statusCode).toBe(200);
    const rows = listed.json().clients as Array<{ name: string; phone: string }>;
    expect(rows.some((item) => item.name === "Marina Costa" && item.phone === "11977776666")).toBe(
      true,
    );
  });

  it("impede cadastro duplicado de cliente pelo mesmo telefone no mesmo negocio", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const first = await app.inject({
      method: "POST",
      url: "/clients",
      payload: {
        unitId: "unit-01",
        name: "Cliente 1",
        phone: "11912345678",
      },
    });
    expect(first.statusCode).toBe(200);

    const duplicated = await app.inject({
      method: "POST",
      url: "/clients",
      payload: {
        unitId: "unit-01",
        name: "Cliente 2",
        phone: "(11) 91234-5678",
      },
    });
    expect(duplicated.statusCode).toBe(409);
  });

  it("carrega e atualiza configuracoes da empresa com isolamento por unidade", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const settings = await app.inject({
      method: "GET",
      url: "/settings?unitId=unit-01",
    });
    expect(settings.statusCode).toBe(200);
    expect(settings.json()).toHaveProperty("business");
    expect(settings.json()).toHaveProperty("businessHours");
    expect(settings.json()).toHaveProperty("paymentMethods");
    expect(settings.json()).toHaveProperty("commissionRules");
    expect(settings.json()).toHaveProperty("teamMembers");

    const updateBusiness = await app.inject({
      method: "PATCH",
      url: "/settings/business",
      payload: {
        unitId: "unit-01",
        businessName: "Barbearia CTO",
        segment: "barbearia",
        inactiveCustomerDays: 90,
        atRiskCustomerDays: 45,
      },
    });
    expect(updateBusiness.statusCode).toBe(200);
    expect(updateBusiness.json().business.businessName).toBe("Barbearia CTO");

    const updateHours = await app.inject({
      method: "PATCH",
      url: "/settings/business-hours",
      payload: {
        unitId: "unit-01",
        hours: [
          {
            dayOfWeek: 1,
            opensAt: "09:00",
            closesAt: "19:00",
            breakStart: "13:00",
            breakEnd: "14:00",
            isClosed: false,
          },
        ],
      },
    });
    expect(updateHours.statusCode).toBe(200);
    const monday = (updateHours.json().businessHours as Array<{ dayOfWeek: number; opensAt: string }>).find(
      (item) => item.dayOfWeek === 1,
    );
    expect(monday?.opensAt).toBe("09:00");

    const addPayment = await app.inject({
      method: "POST",
      url: "/settings/payment-methods",
      payload: {
        unitId: "unit-01",
        name: "Transferencia",
      },
    });
    expect(addPayment.statusCode).toBe(200);
    const paymentId = addPayment.json().paymentMethod.id as string;

    const setDefault = await app.inject({
      method: "PATCH",
      url: `/settings/payment-methods/${paymentId}`,
      payload: {
        unitId: "unit-01",
        isDefault: true,
      },
    });
    expect(setDefault.statusCode).toBe(200);
    expect(setDefault.json().paymentMethod.isDefault).toBe(true);

    const paymentList = await app.inject({
      method: "GET",
      url: "/settings/payment-methods?unitId=unit-01",
    });
    expect(paymentList.statusCode).toBe(200);
    const defaults = (paymentList.json().paymentMethods as Array<{ isDefault: boolean }>).filter(
      (item) => item.isDefault,
    );
    expect(defaults).toHaveLength(1);

    const createRule = await app.inject({
      method: "POST",
      url: "/settings/commission-rules",
      payload: {
        unitId: "unit-01",
        professionalId: "pro-01",
        type: "PERCENTAGE",
        value: 40,
      },
    });
    expect(createRule.statusCode).toBe(200);

    const addTeamMember = await app.inject({
      method: "POST",
      url: "/settings/team-members",
      payload: {
        unitId: "unit-01",
        name: "Recepcao Teste",
        role: "RECEPTION",
        accessProfile: "recepcao",
      },
    });
    expect(addTeamMember.statusCode).toBe(200);

    const unit02 = await app.inject({
      method: "GET",
      url: "/settings?unitId=unit-02",
    });
    expect(unit02.statusCode).toBe(200);
    expect(unit02.json().business.businessName).not.toBe("Barbearia CTO");
  });

  it("retorna desempenho por profissional e extrato de comissoes", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const createResponse = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-22T13:00:00.000Z",
        changedBy: "owner",
      },
    });
    const appointmentId = createResponse.json().appointment.id as string;

    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "CONFIRMED", changedBy: "owner" },
    });
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "IN_SERVICE", changedBy: "owner" },
    });
    await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/complete`,
      payload: { changedBy: "owner", completedAt: "2026-04-22T14:00:00.000Z" },
    });

    await app.inject({
      method: "POST",
      url: "/sales/products",
      headers: { "idempotency-key": "professional-performance-sale" },
      payload: {
        unitId: "unit-01",
        soldAt: "2026-04-22T14:10:00.000Z",
        professionalId: "pro-01",
        clientId: "cli-01",
        items: [{ productId: "prd-pomada", quantity: 1 }],
      },
    });

    const perf = await app.inject({
      method: "GET",
      url: "/professionals/performance?unitId=unit-01&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.000Z&professionalId=pro-01",
    });
    expect(perf.statusCode).toBe(200);
    const perfBody = perf.json();
    expect(perfBody.professionals).toHaveLength(1);
    expect(perfBody.professionals[0].professionalId).toBe("pro-01");
    expect(perfBody.professionals[0].total).toBeGreaterThanOrEqual(1);

    const commissions = await app.inject({
      method: "GET",
      url: "/commissions/statement?unitId=unit-01&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.000Z&professionalId=pro-01&appliesTo=SERVICE",
    });
    expect(commissions.statusCode).toBe(200);
    const commissionsBody = commissions.json();
    expect(Array.isArray(commissionsBody.entries)).toBe(true);
    expect(commissionsBody.entries.length).toBeGreaterThan(0);
    expect(commissionsBody.entries.every((item: { appliesTo: string }) => item.appliesTo === "SERVICE")).toBe(true);
    expect(commissionsBody.summary).toHaveProperty("totalCommission");
  });

  it("cria, consulta e atualiza meta mensal com resumo de performance", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const createGoal = await app.inject({
      method: "POST",
      url: "/goals",
      payload: {
        unitId: "unit-01",
        month: 5,
        year: 2026,
        revenueTarget: 25000,
        appointmentsTarget: 300,
        averageTicketTarget: 82,
        notes: "Meta de maio para acelerar faturamento.",
      },
    });
    expect(createGoal.statusCode).toBe(200);
    expect(createGoal.json().goal.revenueTarget).toBe(25000);

    const duplicated = await app.inject({
      method: "POST",
      url: "/goals",
      payload: {
        unitId: "unit-01",
        month: 5,
        year: 2026,
        revenueTarget: 26000,
        appointmentsTarget: 320,
      },
    });
    expect(duplicated.statusCode).toBe(409);

    const currentGoal = await app.inject({
      method: "GET",
      url: "/goals/current?unitId=unit-01&month=5&year=2026",
    });
    expect(currentGoal.statusCode).toBe(200);
    expect(currentGoal.json().goal.month).toBe(5);
    expect(currentGoal.json().goal.year).toBe(2026);

    const goalId = currentGoal.json().goal.id as string;
    const updateGoal = await app.inject({
      method: "PATCH",
      url: `/goals/${goalId}`,
      payload: {
        unitId: "unit-01",
        revenueTarget: 27000,
        notes: "Meta revisada apos primeira semana.",
      },
    });
    expect(updateGoal.statusCode).toBe(200);
    expect(updateGoal.json().goal.revenueTarget).toBe(27000);

    const summary = await app.inject({
      method: "GET",
      url: "/performance/summary?unitId=unit-01&month=5&year=2026",
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toHaveProperty("goal");
    expect(summary.json()).toHaveProperty("metrics");
    expect(summary.json().metrics).toHaveProperty("goalProgressPercent");
    expect(Array.isArray(summary.json().insights)).toBe(true);

    const professionals = await app.inject({
      method: "GET",
      url: "/performance/professionals?unitId=unit-01&month=5&year=2026",
    });
    expect(professionals.statusCode).toBe(200);
    expect(Array.isArray(professionals.json().professionals)).toBe(true);
    if (professionals.json().professionals.length) {
      expect(professionals.json().professionals[0]).toHaveProperty("commissionEstimated");
      expect(professionals.json().professionals[0]).toHaveProperty("rank");
    }

    const services = await app.inject({
      method: "GET",
      url: "/performance/services?unitId=unit-01&month=5&year=2026",
    });
    expect(services.statusCode).toBe(200);
    expect(Array.isArray(services.json().services)).toBe(true);
    if (services.json().services.length) {
      expect(services.json().services[0]).toHaveProperty("sharePct");
      expect(services.json().services[0]).toHaveProperty("ticketAverage");
    }
  });

  it("executa fluxo premium de fidelidade e pacotes", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const adjust = await app.inject({
      method: "POST",
      url: "/loyalty/adjust",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        pointsDelta: 25,
        sourceType: "ADJUSTMENT",
        occurredAt: "2026-04-23T09:00:00.000Z",
        createdBy: "owner",
      },
    });
    expect(adjust.statusCode).toBe(200);

    const summary = await app.inject({
      method: "GET",
      url: "/loyalty/summary?unitId=unit-01&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.000Z",
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().summary.earned).toBeGreaterThanOrEqual(25);

    const purchase = await app.inject({
      method: "POST",
      url: "/packages/purchase",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        packageId: "pkg-corte-4",
        purchasedAt: "2026-04-23T09:00:00.000Z",
        changedBy: "owner",
      },
    });
    expect(purchase.statusCode).toBe(200);
    const packagePurchaseId = purchase.json().clientPackage.id as string;

    const redeem = await app.inject({
      method: "POST",
      url: "/packages/redeem-session",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        packagePurchaseId,
        serviceId: "svc-corte",
        occurredAt: "2026-04-23T10:00:00.000Z",
        changedBy: "owner",
      },
    });
    expect(redeem.statusCode).toBe(200);
    expect(redeem.json().clientPackage.sessionsRemaining).toBe(3);
  });

  it("executa fluxo premium de assinaturas, retencao e multiunidade", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const activate = await app.inject({
      method: "POST",
      url: "/subscriptions/activate",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        planId: "sub-gold",
        startedAt: "2026-04-23T09:00:00.000Z",
        changedBy: "owner",
      },
    });
    expect(activate.statusCode).toBe(200);
    const subscriptionId = activate.json().subscription.id as string;

    const cancel = await app.inject({
      method: "POST",
      url: "/subscriptions/cancel",
      payload: {
        unitId: "unit-01",
        subscriptionId,
        changedBy: "owner",
      },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().subscription.status).toBe("CANCELLED");

    vi.setSystemTime(new Date("2025-12-31T00:00:00.000Z"));
    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-02",
        professionalId: "pro-01",
        serviceId: "svc-barba",
        startsAt: "2026-01-01T10:00:00.000Z",
        changedBy: "owner",
      },
    });
    const appointmentId = created.json().appointment.id as string;
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "CONFIRMED", changedBy: "owner" },
    });
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "IN_SERVICE", changedBy: "owner" },
    });
    await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/complete`,
      payload: { changedBy: "owner", completedAt: "2026-01-01T11:00:00.000Z" },
    });

    vi.setSystemTime(new Date("2026-04-23T00:00:00.000Z"));
    const retention = await app.inject({
      method: "GET",
      url: "/retention/cases?unitId=unit-01&limit=20",
    });
    expect(retention.statusCode).toBe(200);
    const retentionBody = retention.json();
    expect(Array.isArray(retentionBody.cases)).toBe(true);
    expect(retentionBody.cases.length).toBeGreaterThan(0);
    const caseId = retentionBody.cases[0].id as string;

    const event = await app.inject({
      method: "POST",
      url: `/retention/cases/${caseId}/events`,
      payload: {
        unitId: "unit-01",
        channel: "PHONE",
        note: "Contato inicial de reativacao",
        occurredAt: "2026-04-23T11:00:00.000Z",
        createdBy: "owner",
      },
    });
    expect(event.statusCode).toBe(200);

    const convert = await app.inject({
      method: "POST",
      url: `/retention/cases/${caseId}/convert`,
      payload: {
        unitId: "unit-01",
        changedBy: "owner",
      },
    });
    expect(convert.statusCode).toBe(200);
    expect(convert.json().case.status).toBe("CONVERTED");

    const multiOverview = await app.inject({
      method: "GET",
      url: "/multiunit/overview?start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.000Z",
    });
    expect(multiOverview.statusCode).toBe(200);
    const multiBody = multiOverview.json();
    expect(Array.isArray(multiBody.units)).toBe(true);
    expect(multiBody.units.length).toBeGreaterThanOrEqual(2);
  });

  it("executa fluxo da etapa 8 com automacoes, scoring e integracoes", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const createRule = await app.inject({
      method: "POST",
      url: "/automations/rules",
      payload: {
        unitId: "unit-01",
        name: "Campanha churn alto",
        triggerType: "HIGH_RISK",
        channel: "WHATSAPP",
        target: "SEGMENT",
        messageTemplate: "Cliente em risco alto, enviar oferta de retorno",
        createdBy: "owner",
      },
    });
    expect(createRule.statusCode).toBe(200);
    const createdRuleId = createRule.json().rule.id as string;

    const updateRule = await app.inject({
      method: "PATCH",
      url: `/automations/rules/${createdRuleId}`,
      payload: {
        unitId: "unit-01",
        name: "Campanha churn alto (atualizada)",
        channel: "SMS",
        messageTemplate: "Oferta de retorno com foco em agenda de amanha",
      },
    });
    expect(updateRule.statusCode).toBe(200);
    expect(updateRule.json().rule.name).toContain("atualizada");
    expect(updateRule.json().rule.channel).toBe("SMS");
    expect(updateRule.json()).toHaveProperty("previousRule");

    const deactivate = await app.inject({
      method: "POST",
      url: `/automations/rules/${createdRuleId}/deactivate`,
      payload: { unitId: "unit-01" },
    });
    expect(deactivate.statusCode).toBe(200);
    expect(deactivate.json().rule.isActive).toBe(false);

    const activate = await app.inject({
      method: "POST",
      url: `/automations/rules/${createdRuleId}/activate`,
      payload: { unitId: "unit-01" },
    });
    expect(activate.statusCode).toBe(200);
    expect(activate.json().rule.isActive).toBe(true);

    const scoring = await app.inject({
      method: "POST",
      url: "/retention/scoring/recalculate",
      payload: {
        unitId: "unit-01",
        scoredAt: "2026-04-24T12:00:00.000Z",
      },
    });
    expect(scoring.statusCode).toBe(200);
    expect(scoring.json().processedClients).toBeGreaterThanOrEqual(2);

    const scoringClients = await app.inject({
      method: "GET",
      url: "/retention/scoring/clients?unitId=unit-01&riskLevel=HIGH&limit=10",
    });
    expect(scoringClients.statusCode).toBe(200);
    expect(Array.isArray(scoringClients.json().clients)).toBe(true);

    const executeCampaign = await app.inject({
      method: "POST",
      url: "/automations/campaigns/execute",
      payload: {
        unitId: "unit-01",
        ruleId: createdRuleId,
        campaignType: "retencao_risco_alto_force_fail_once",
        riskLevel: "HIGH",
        sourceModule: "dashboard",
        sourceSuggestionId: "suggestion-001",
        playbookType: "REACTIVATION",
        startedBy: "owner",
      },
    });
    expect(executeCampaign.statusCode).toBe(200);
    expect(executeCampaign.json().executionBatch).toHaveProperty("scheduled");
    expect(executeCampaign.json().playbookContext.playbookType).toBe("REACTIVATION");
    expect(executeCampaign.json().playbookContext.sourceModule).toBe("dashboard");
    expect(executeCampaign.json()).toHaveProperty("appliedRule");
    if (executeCampaign.json().executions.length > 0) {
      expect(executeCampaign.json().executions[0].attempts).toBeGreaterThanOrEqual(2);
      expect(executeCampaign.json().executions[0].payload.sourceModule).toBe("dashboard");
      expect(executeCampaign.json().executions[0].payload.playbookType).toBe("REACTIVATION");
    }

    const executeCampaignAgain = await app.inject({
      method: "POST",
      url: "/automations/campaigns/execute",
      payload: {
        unitId: "unit-01",
        ruleId: createdRuleId,
        campaignType: "retencao_risco_alto_force_fail_once",
        riskLevel: "HIGH",
        startedBy: "owner",
      },
    });
    expect(executeCampaignAgain.statusCode).toBe(200);
    expect(executeCampaignAgain.json().executionBatch.skipped).toBeGreaterThanOrEqual(0);

    const executeWithFailure = await app.inject({
      method: "POST",
      url: "/automations/campaigns/execute",
      payload: {
        unitId: "unit-01",
        ruleId: createdRuleId,
        campaignType: "reativacao_force_fail_until_reprocess",
        startedBy: "owner",
      },
    });
    expect(executeWithFailure.statusCode).toBe(200);
    const failedExecution = (executeWithFailure.json().executions as Array<{ id: string; status: string }>).find(
      (item) => item.status === "FAILED",
    );
    expect(failedExecution).toBeTruthy();

    if (failedExecution) {
      const reprocess = await app.inject({
        method: "POST",
        url: `/automations/executions/${failedExecution.id}/reprocess`,
        payload: {
          unitId: "unit-01",
          startedBy: "owner",
        },
      });
      expect(reprocess.statusCode).toBe(200);
      expect(reprocess.json().execution.status).toBe("SUCCESS");
    }

    const executions = await app.inject({
      method: "GET",
      url: "/automations/executions?unitId=unit-01&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.000Z",
    });
    expect(executions.statusCode).toBe(200);
    expect(executions.json().summary.total).toBeGreaterThanOrEqual(0);

    const outbound = await app.inject({
      method: "POST",
      url: "/integrations/webhooks/outbound/test",
      payload: {
        unitId: "unit-01",
        provider: "whatsapp-cloud",
        endpoint: "https://example.com/webhook-test",
        eventType: "RETENTION_CAMPAIGN",
        payload: { caseId: "case-001", simulateFailures: 1 },
        occurredAt: "2026-04-24T09:00:00.000Z",
        triggeredBy: "owner",
      },
    });
    expect(outbound.statusCode).toBe(200);
    expect(outbound.json().delivery.status).toBe("SUCCESS");
    expect(outbound.json().delivery.attempt).toBe(2);

    const inbound = await app.inject({
      method: "POST",
      url: "/integrations/webhooks/inbound/whatsapp-cloud",
      payload: {
        unitId: "unit-01",
        occurredAt: "2026-04-24T09:05:00.000Z",
        payload: {
          messageId: "msg-01",
          status: "delivered",
        },
      },
    });
    expect(inbound.statusCode).toBe(200);
    expect(inbound.json().received).toBe(true);

    const webhookLogs = await app.inject({
      method: "GET",
      url: "/integrations/webhooks/logs?unitId=unit-01&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.000Z",
    });
    expect(webhookLogs.statusCode).toBe(200);
    expect(webhookLogs.json().summary.total).toBeGreaterThanOrEqual(2);

    const activateSub = await app.inject({
      method: "POST",
      url: "/subscriptions/activate",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        planId: "sub-gold",
        startedAt: "2026-03-05T10:00:00.000Z",
        changedBy: "owner",
      },
    });
    expect(activateSub.statusCode).toBe(200);
    const activatedSubscriptionId = activateSub.json().subscription.id as string;
    const webhookPayload = {
      unitId: "unit-01",
      eventId: "evt-001",
      idempotencyKey: "idem-evt-001",
      subscriptionId: activatedSubscriptionId,
      externalSubscriptionId: `ext-${activatedSubscriptionId}`,
      eventType: "RENEWED",
      status: "PAID",
      amount: 149,
      occurredAt: "2026-04-24T10:00:00.000Z",
      payload: {
        gateway: "sandbox",
      },
    };
    const signature = computeBillingWebhookSignature(
      JSON.stringify(webhookPayload),
      getBillingWebhookSecret("billing-gateway"),
    );

    const billingWebhook = await app.inject({
      method: "POST",
      url: "/integrations/billing/webhooks/billing-gateway",
      headers: {
        "x-billing-signature": signature,
      },
      payload: webhookPayload,
    });
    expect(billingWebhook.statusCode).toBe(200);
    expect(billingWebhook.json().received).toBe(true);
    expect(billingWebhook.json().deduplicated).toBe(false);

    const billingWebhookDuplicate = await app.inject({
      method: "POST",
      url: "/integrations/billing/webhooks/billing-gateway",
      headers: {
        "x-billing-signature": signature,
      },
      payload: webhookPayload,
    });
    expect(billingWebhookDuplicate.statusCode).toBe(200);
    expect(billingWebhookDuplicate.json().deduplicated).toBe(true);

    const failedWebhookPayload = {
      unitId: "unit-01",
      eventId: "evt-002",
      idempotencyKey: "idem-evt-002",
      subscriptionId: activatedSubscriptionId,
      externalSubscriptionId: `ext-${activatedSubscriptionId}`,
      eventType: "CHARGE_FAILED",
      status: "FAILED",
      occurredAt: "2026-04-25T10:00:00.000Z",
      payload: {
        gateway: "sandbox",
      },
    };
    const failedSignature = computeBillingWebhookSignature(
      JSON.stringify(failedWebhookPayload),
      getBillingWebhookSecret("billing-gateway"),
    );
    const failedWebhook = await app.inject({
      method: "POST",
      url: "/integrations/billing/webhooks/billing-gateway",
      headers: {
        "x-billing-signature": failedSignature,
      },
      payload: failedWebhookPayload,
    });
    expect(failedWebhook.statusCode).toBe(200);

    const cancelAfterFailure = await app.inject({
      method: "POST",
      url: "/subscriptions/cancel",
      payload: {
        unitId: "unit-01",
        subscriptionId: activatedSubscriptionId,
        changedBy: "owner",
      },
    });
    expect(cancelAfterFailure.statusCode).toBe(200);

    const reconciliationSummary = await app.inject({
      method: "GET",
      url: "/billing/reconciliation/summary?unitId=unit-01&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.000Z",
    });
    expect(reconciliationSummary.statusCode).toBe(200);
    expect(reconciliationSummary.json().summary.eventsAnalyzed).toBeGreaterThanOrEqual(1);

    const discrepancies = await app.inject({
      method: "GET",
      url: "/billing/reconciliation/discrepancies?unitId=unit-01&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.000Z&type=STATUS_MISMATCH",
    });
    expect(discrepancies.statusCode).toBe(200);
    expect(discrepancies.json().discrepancies.length).toBeGreaterThanOrEqual(1);
    const firstDiscrepancy = discrepancies.json().discrepancies[0] as { id: string };

    const resolve = await app.inject({
      method: "POST",
      url: `/billing/reconciliation/discrepancies/${firstDiscrepancy.id}/resolve`,
      payload: {
        unitId: "unit-01",
        start: "2026-04-01T00:00:00.000Z",
        end: "2026-04-30T23:59:59.000Z",
        action: "MARK_RESOLVED",
        note: "Divergencia revisada manualmente",
        changedBy: "owner",
      },
    });
    expect(resolve.statusCode).toBe(200);
    expect(resolve.json().discrepancy.status).toBe("RESOLVED");

    const billingSync = await app.inject({
      method: "POST",
      url: "/integrations/billing/subscriptions/sync",
      payload: {
        unitId: "unit-01",
        occurredAt: "2026-05-24T10:00:00.000Z",
        changedBy: "owner",
      },
    });
    expect(billingSync.statusCode).toBe(200);
    expect(billingSync.json().summary.processed).toBeGreaterThanOrEqual(0);
  });

  it("rejeita webhook de cobranca com assinatura invalida", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const payload = {
      unitId: "unit-01",
      eventId: "evt-invalid-01",
      eventType: "CHARGE_FAILED",
      status: "FAILED",
      occurredAt: "2026-04-24T10:00:00.000Z",
    };

    const response = await app.inject({
      method: "POST",
      url: "/integrations/billing/webhooks/billing-gateway",
      headers: {
        "x-billing-signature": "sha256=invalid",
      },
      payload,
    });

    expect(response.statusCode).toBe(422);
  });

  it("retorna 401 em rota protegida sem token quando auth esta habilitada", async () => {
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "true";
    const app = createApp();

    const response = await app.inject({
      method: "GET",
      url: "/dashboard?unitId=unit-01&date=2026-04-23T00:00:00.000Z",
    });

    expect(response.statusCode).toBe(401);
    process.env.AUTH_ENFORCED = "false";
  });

  it("mantem fluxo publico de agendamento sem exigir login", async () => {
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "true";
    const app = createApp();

    const favicon = await app.inject({
      method: "GET",
      url: "/favicon.ico",
    });
    expect(favicon.statusCode).toBe(204);

    const services = await app.inject({
      method: "GET",
      url: "/public/services?unitId=unit-01",
      headers: { authorization: "Bearer token-invalido" },
    });
    expect(services.statusCode).toBe(200);
    expect(services.json()[0].durationMinutes).toBeGreaterThan(0);

    const booking = await app.inject({
      method: "POST",
      url: "/public/booking?unitId=unit-01",
      headers: { authorization: "Bearer token-invalido" },
      payload: {
        unitId: "unit-01",
        clientName: "Cliente Publico",
        clientPhone: "(11) 97777-6666",
        clientEmail: "",
        serviceId: "svc-corte",
        startsAt: "2026-06-05T19:00:00.000Z",
      },
    });

    expect(booking.statusCode).toBe(201);
    expect(booking.json().id).toBeTruthy();

    const secondBooking = await app.inject({
      method: "POST",
      url: "/public/booking?unitId=unit-01",
      headers: { authorization: "Bearer token-invalido" },
      payload: {
        unitId: "unit-01",
        clientName: "Cliente Publico",
        clientPhone: "(11) 97777-6666",
        serviceId: "svc-barba",
        startsAt: "2026-06-07T13:00:00.000Z",
      },
    });

    expect(secondBooking.statusCode).toBe(201);
    expect(secondBooking.json().id).toBeTruthy();
    expect(secondBooking.json().id).not.toBe(booking.json().id);
    process.env.AUTH_ENFORCED = "false";
  });

  it("rejeita e-mail invalido no booking publico com mensagem amigavel", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const booking = await app.inject({
      method: "POST",
      url: "/public/booking?unitId=unit-01",
      payload: {
        unitId: "unit-01",
        clientName: "Cliente Email Invalido",
        clientPhone: "(11) 90000-2160",
        clientEmail: "Faça uma query para SQL, visando encerrar e identificar duplicidades",
        serviceId: "svc-barba",
        professionalId: "pro-01",
        startsAt: "2026-06-05T19:00:00.000Z",
      },
    });

    expect(booking.statusCode).toBe(400);
    expect(booking.json()).toEqual({
      error: "Informe um e-mail valido ou deixe o campo em branco.",
    });
  });

  it("blinda /public/services contra servicos de teste, demo, TG, db e inativos", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const unsafeServices = [
      { name: "Servico Teste Comissao TG", category: "TESTE_TG" },
      { name: "Corte demo", category: "CORTE" },
      { name: "Servico db importado", category: "CORTE" },
    ];
    for (const service of unsafeServices) {
      const created = await app.inject({
        method: "POST",
        url: "/services",
        payload: {
          unitId: "unit-01",
          name: service.name,
          category: service.category,
          description: "Registro usado apenas em teste operacional.",
          price: 100,
          durationMinutes: 30,
          professionalIds: ["pro-01"],
          isActive: true,
        },
      });
      expect(created.statusCode).toBe(200);
    }

    const inactive = await app.inject({
      method: "POST",
      url: "/services",
      payload: {
        unitId: "unit-01",
        name: "Servico Interno Inativo",
        category: "INTERNO",
        price: 70,
        durationMinutes: 30,
        professionalIds: ["pro-01"],
        isActive: false,
      },
    });
    expect(inactive.statusCode).toBe(200);

    const services = await app.inject({
      method: "GET",
      url: "/public/services?unitId=unit-01",
    });

    expect(services.statusCode).toBe(200);
    const publicServices = services.json() as Array<Record<string, unknown>>;
    const publicNames = publicServices.map((item) => String(item.name));
    const normalizedPublicText = JSON.stringify(publicServices)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    expect(publicNames).toContain("Barba Terapia");
    expect(publicNames).toContain("Corte Premium");
    expect(publicNames).not.toContain("Servico Teste Comissao TG");
    expect(publicNames).not.toContain("Corte demo");
    expect(publicNames).not.toContain("Servico db importado");
    expect(publicNames).not.toContain("Servico Interno Inativo");
    expect(normalizedPublicText).not.toContain("teste");
    expect(normalizedPublicText).not.toContain("tg");
    expect(normalizedPublicText).not.toContain("demo");
    expect(normalizedPublicText).not.toContain("db");
  });

  it("grava no booking publico o profissional escolhido explicitamente", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();
    const rafael = await createProfessional(app, "Rafael Andrade");
    await setBarbaProfessionals(app, ["pro-01", rafael.id]);

    const geovaneBooking = await app.inject({
      method: "POST",
      url: "/public/booking?unitId=unit-01",
      payload: {
        unitId: "unit-01",
        clientName: "Cliente Profissional Geovane",
        clientPhone: "(11) 90000-2101",
        serviceId: "svc-barba",
        professionalId: "pro-01",
        startsAt: "2026-06-05T19:00:00.000Z",
      },
    });
    expect(geovaneBooking.statusCode).toBe(201);
    expect(geovaneBooking.json().professionalId).toBe("pro-01");
    expect(geovaneBooking.json().professionalName).toBe("Geovane Borges");

    const geovaneDetail = await app.inject({
      method: "GET",
      url: `/appointments/${geovaneBooking.json().id}`,
    });
    expect(geovaneDetail.statusCode).toBe(200);
    expect(geovaneDetail.json().appointment.professionalId).toBe("pro-01");
    expect(geovaneDetail.json().appointment.professional).toBe("Geovane Borges");

    const rafaelBooking = await app.inject({
      method: "POST",
      url: "/public/booking?unitId=unit-01",
      payload: {
        unitId: "unit-01",
        clientName: "Cliente Profissional Rafael",
        clientPhone: "(11) 90000-2102",
        serviceId: "svc-barba",
        professionalId: rafael.id,
        startsAt: "2026-06-05T20:00:00.000Z",
      },
    });
    expect(rafaelBooking.statusCode).toBe(201);
    expect(rafaelBooking.json().professionalId).toBe(rafael.id);
    expect(rafaelBooking.json().professionalName).toBe("Rafael Andrade");

    const rafaelDetail = await app.inject({
      method: "GET",
      url: `/appointments/${rafaelBooking.json().id}`,
    });
    expect(rafaelDetail.statusCode).toBe(200);
    expect(rafaelDetail.json().appointment.professionalId).toBe(rafael.id);
    expect(rafaelDetail.json().appointment.professional).toBe("Rafael Andrade");
  });

  it("lista somente dados publicos seguros dos profissionais elegiveis por servico", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();
    const rafael = await createProfessional(app, "Rafael Andrade");
    const profissionalDb = await createProfessional(app, "Profissional DB");
    const profissionalTg = await createProfessional(app, "Profissional Teste Comissao TG");
    await setBarbaProfessionals(app, ["pro-01", rafael.id, profissionalDb.id, profissionalTg.id]);

    const professionals = await app.inject({
      method: "GET",
      url: "/public/services/svc-barba/professionals?unitId=unit-01",
    });

    expect(professionals.statusCode).toBe(200);
    expect(professionals.json().service).toEqual({
      id: "svc-barba",
      name: "Barba Terapia",
    });
    expect(professionals.json().professionals).toEqual([
      { id: "pro-01", name: "Geovane Borges", displayName: "Geovane Borges" },
      { id: rafael.id, name: "Rafael Andrade", displayName: "Rafael Andrade" },
    ]);
    expect(JSON.stringify(professionals.json())).not.toContain("Profissional DB");
    expect(JSON.stringify(professionals.json())).not.toContain("Profissional Teste Comissao TG");
    for (const item of professionals.json().professionals as Array<Record<string, unknown>>) {
      expect(Object.keys(item).sort()).toEqual(["displayName", "id", "name"]);
      expect(item).not.toHaveProperty("email");
      expect(item).not.toHaveProperty("document");
      expect(item).not.toHaveProperty("phone");
      expect(item).not.toHaveProperty("commission");
    }
  });

  it("nao trata ocorrencia acidental de db em UUID como marcador publico de teste", () => {
    expect(hasPublicIdTestMarker("8efbcffa-b8d2-42a7-85f1-a0adccf877db")).toBe(false);
    expect(hasPublicIdTestMarker("svc-db-import")).toBe(true);
    expect(hasPublicIdTestMarker("demo-pro-02")).toBe(true);
  });

  it("mantem profissionais de demonstracao fora do contrato publico", async () => {
    const apiSource = readFileSync("src/http/app.ts", "utf8");
    const demoSeedSource = readFileSync("prisma/demo-seed.ts", "utf8");

    expect(demoSeedSource).toContain('id: "demo-pro-02"');
    expect(apiSource).toContain("!hasPublicIdTestMarker(item.id)");
    expect(apiSource).toContain("!hasPublicDataTestMarker(item.name)");
  });

  it("rejeita profissional publico nao vinculado ao servico", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();
    const unlinked = await createProfessional(app, "Profissional Sem Vinculo");

    const booking = await app.inject({
      method: "POST",
      url: "/public/booking?unitId=unit-01",
      payload: {
        unitId: "unit-01",
        clientName: "Cliente Profissional Invalido",
        clientPhone: "(11) 90000-2103",
        serviceId: "svc-barba",
        professionalId: unlinked.id,
        startsAt: "2026-06-05T19:00:00.000Z",
      },
    });

    expect(booking.statusCode).toBe(409);
    expect(booking.json().error).toContain("Profissional indisponivel");
  });

  it("mantem atribuicao deterministica sem preferencia no booking publico", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();
    const rafael = await createProfessional(app, "Rafael Andrade");
    await setBarbaProfessionals(app, ["pro-01", rafael.id]);

    const booking = await app.inject({
      method: "POST",
      url: "/public/booking?unitId=unit-01",
      payload: {
        unitId: "unit-01",
        clientName: "Cliente Sem Preferencia",
        clientPhone: "(11) 90000-2104",
        serviceId: "svc-barba",
        startsAt: "2026-06-05T19:00:00.000Z",
      },
    });

    expect(booking.statusCode).toBe(201);
    expect(booking.json().professionalId).toBe("pro-01");
    expect(booking.json().professionalName).toBe("Geovane Borges");
  });

  it("alinha /public/slots com a mesma disponibilidade profissional do booking publico", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();
    const rafael = await createProfessional(app, "Rafael Andrade");
    await setBarbaProfessionals(app, ["pro-01", rafael.id]);

    const explicitSlots = await app.inject({
      method: "GET",
      url: "/public/slots?unitId=unit-01&serviceId=svc-barba&professionalId=pro-01&weekStart=2026-06-01",
    });
    expect(explicitSlots.statusCode).toBe(200);
    const explicitFriday = explicitSlots.json()["2026-06-05"] as Array<{
      time: string;
      available: boolean;
      professionalId?: string;
      professionalName?: string;
    }>;
    const explicitSlot = explicitFriday.find((slot) => slot.time === "16:00");
    expect(explicitSlot).toMatchObject({
      time: "16:00",
      available: true,
      professionalId: "pro-01",
      professionalName: "Geovane Borges",
    });

    const automaticSlots = await app.inject({
      method: "GET",
      url: "/public/slots?unitId=unit-01&serviceId=svc-barba&weekStart=2026-06-01",
    });
    expect(automaticSlots.statusCode).toBe(200);
    const automaticFriday = automaticSlots.json()["2026-06-05"] as Array<{
      time: string;
      available: boolean;
      professionalId?: string;
      professionalName?: string;
    }>;
    const automaticSlot = automaticFriday.find((slot) => slot.time === "17:00");
    expect(automaticSlot).toMatchObject({
      time: "17:00",
      available: true,
      professionalId: "pro-01",
      professionalName: "Geovane Borges",
    });
    expect(automaticSlot).not.toHaveProperty("clientPhone");
    expect(automaticSlot).not.toHaveProperty("clientEmail");
    expect(automaticSlot).not.toHaveProperty("commission");
    expect(automaticSlot).not.toHaveProperty("financial");

    const booking = await app.inject({
      method: "POST",
      url: "/public/booking?unitId=unit-01",
      payload: {
        unitId: "unit-01",
        clientName: "Cliente Slots Alinhados",
        clientPhone: "(11) 90000-2105",
        serviceId: "svc-barba",
        startsAt: "2026-06-05T20:00:00.000Z",
      },
    });
    expect(booking.statusCode).toBe(201);
    expect(booking.json().professionalId).toBe(automaticSlot?.professionalId);
    expect(booking.json().professionalName).toBe(automaticSlot?.professionalName);
    expect(booking.json()).not.toHaveProperty("clientPhone");
    expect(booking.json()).not.toHaveProperty("clientEmail");
    expect(booking.json()).not.toHaveProperty("financial");
    expect(booking.json()).not.toHaveProperty("commission");
  });

  it("registra auditoria ao criar agendamento pelo booking publico", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const booking = await app.inject({
      method: "POST",
      url: "/public/booking?unitId=unit-01",
      headers: { "x-correlation-id": "corr-public-booking-audit" },
      payload: {
        unitId: "unit-01",
        clientName: "Cliente Auditoria Publica",
        clientPhone: "(11) 90000-2106",
        serviceId: "svc-barba",
        professionalId: "pro-01",
        startsAt: "2026-06-05T21:00:00.000Z",
      },
    });
    expect(booking.statusCode).toBe(201);

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?unitId=unit-01&entity=appointment&action=APPOINTMENT_CREATED&limit=20`,
    });
    expect(audit.statusCode).toBe(200);
    const events = audit.json().events as Array<{
      action: string;
      entity: string;
      entityId: string;
      route: string;
      method: string;
      requestId: string;
      afterJson: Record<string, unknown>;
      metadataJson: Record<string, unknown>;
    }>;
    const event = events.find((item) => item.entityId === booking.json().id);

    expect(event).toMatchObject({
      action: "APPOINTMENT_CREATED",
      entity: "appointment",
      entityId: booking.json().id,
      route: "/public/booking",
      method: "POST",
      requestId: "corr-public-booking-audit",
    });
    expect(event?.afterJson).toMatchObject({
      origin: "public_booking",
      appointmentId: booking.json().id,
      serviceId: "svc-barba",
      serviceName: "Barba Terapia",
      professionalId: "pro-01",
      professionalName: "Geovane Borges",
      startsAt: "2026-06-05T21:00:00.000Z",
    });
    expect(event?.afterJson).not.toHaveProperty("clientPhone");
    expect(event?.afterJson).not.toHaveProperty("clientEmail");
    expect(event?.metadataJson).toEqual({ source: "public" });
  });

  it("mantem o contrato estatico do booking publico sem selecao implicita findFirst", async () => {
    const apiSource = readFileSync("src/http/app.ts", "utf8");
    const publicSectionStart = apiSource.indexOf('app.get("/public/services"');
    const publicBookingSource = apiSource.slice(publicSectionStart);
    const uiSource = readFileSync("public/booking.html", "utf8");

    expect(publicSectionStart).toBeGreaterThanOrEqual(0);
    expect(publicBookingSource).not.toContain("serviceProfessional.findFirst");
    expect(publicBookingSource).toContain('app.get("/public/services/:serviceId/professionals"');
    expect(publicBookingSource).toContain("professionalId");
    expect(uiSource).toContain("STEPS.PROFESSIONAL");
    expect(uiSource).toContain("payload.professionalId = confirmData.professionalId");
    expect(uiSource).toContain("normalizeClientRecord");
    expect(uiSource).toContain("isSuspiciousStoredText");
    expect(uiSource).toContain("autocompleteMap");
    expect(uiSource).toContain("Informe um e-mail válido ou deixe o campo em branco.");
    expect(uiSource).not.toContain("const _se = getClient().email");
    expect(uiSource).not.toContain("const _sp = getClient().phone");
  });

  it("autentica e preserva perfis em /auth/me", async () => {
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "true";
    const app = createApp();

    for (const credentials of [
      { email: "owner@barbearia.local", password: "owner123", role: "owner" },
      { email: "recepcao@barbearia.local", password: "recepcao123", role: "recepcao" },
      { email: "profissional@barbearia.local", password: "profissional123", role: "profissional" },
    ]) {
      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: credentials.email,
          password: credentials.password,
          activeUnitId: "unit-01",
        },
      });
      expect(login.statusCode).toBe(200);
      expect(login.json().user.role).toBe(credentials.role);
      const token = login.json().accessToken as string;

      const me = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      expect(me.statusCode).toBe(200);
      expect(me.json().user.role).toBe(credentials.role);
      expect(me.json().user.activeUnitId).toBe("unit-01");
    }
    process.env.AUTH_ENFORCED = "false";
  });

  it("nao promove role invalida para owner em usuarios configurados", async () => {
    const previousUsersJson = process.env.AUTH_USERS_JSON;
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "true";
    process.env.AUTH_USERS_JSON = JSON.stringify([
      {
        id: "usr-invalid-role",
        email: "invalid-role@barbearia.local",
        password: "invalid123",
        role: "gerente",
        unitIds: ["unit-01"],
      },
      {
        id: "usr-valid-owner",
        email: "valid-owner@barbearia.local",
        password: "owner123",
        role: "owner",
        unitIds: ["unit-01"],
      },
    ]);
    const app = createApp();

    const invalidLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "invalid-role@barbearia.local",
        password: "invalid123",
        activeUnitId: "unit-01",
      },
    });
    expect(invalidLogin.statusCode).toBe(401);

    const ownerLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "valid-owner@barbearia.local",
        password: "owner123",
        activeUnitId: "unit-01",
      },
    });
    expect(ownerLogin.statusCode).toBe(200);
    expect(ownerLogin.json().user.role).toBe("owner");

    if (previousUsersJson == null) delete process.env.AUTH_USERS_JSON;
    else process.env.AUTH_USERS_JSON = previousUsersJson;
    process.env.AUTH_ENFORCED = "false";
  });

  it("bloqueia mismatch de tenant entre token e unitId informado", async () => {
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "true";
    const app = createApp();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "owner@barbearia.local",
        password: "owner123",
        activeUnitId: "unit-01",
      },
    });
    const token = login.json().accessToken as string;

    const response = await app.inject({
      method: "GET",
      url: "/dashboard?unitId=unit-02&date=2026-04-23T00:00:00.000Z",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(403);
    process.env.AUTH_ENFORCED = "false";
  });

  it("bloqueia probes reais de RBAC em rotas sensiveis", async () => {
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "true";
    const app = createApp();
    const ownerToken = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    });
    const receptionToken = await loginAs(app, {
      email: "recepcao@barbearia.local",
      password: "recepcao123",
      activeUnitId: "unit-01",
    });
    const professionalToken = await loginAs(app, {
      email: "profissional@barbearia.local",
      password: "profissional123",
      activeUnitId: "unit-01",
    });

    const base = "unitId=unit-01&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.999Z";
    const ownerUsers = await app.inject({
      method: "GET",
      url: "/users?unitId=unit-01",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(ownerUsers.statusCode).toBe(200);

    const professionalUsers = await app.inject({
      method: "GET",
      url: "/users?unitId=unit-01",
      headers: { authorization: `Bearer ${professionalToken}` },
    });
    expect(professionalUsers.statusCode).toBe(403);

    const ownerAudit = await app.inject({
      method: "GET",
      url: "/audit/events?unitId=unit-01",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(ownerAudit.statusCode).toBe(200);

    const receptionAudit = await app.inject({
      method: "GET",
      url: "/audit/events?unitId=unit-01",
      headers: { authorization: `Bearer ${receptionToken}` },
    });
    expect(receptionAudit.statusCode).toBe(403);

    const professionalAudit = await app.inject({
      method: "GET",
      url: "/audit/events?unitId=unit-01",
      headers: { authorization: `Bearer ${professionalToken}` },
    });
    expect(professionalAudit.statusCode).toBe(403);

    const ownerSettings = await app.inject({
      method: "GET",
      url: "/settings?unitId=unit-01",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(ownerSettings.statusCode).toBe(200);

    const professionalSettings = await app.inject({
      method: "GET",
      url: "/settings?unitId=unit-01",
      headers: { authorization: `Bearer ${professionalToken}` },
    });
    expect(professionalSettings.statusCode).toBe(403);

    const ownerFinancialReport = await app.inject({
      method: "GET",
      url: `/reports/management/financial?${base}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(ownerFinancialReport.statusCode).toBe(200);

    const professionalFinancialReport = await app.inject({
      method: "GET",
      url: `/reports/management/financial?${base}`,
      headers: { authorization: `Bearer ${professionalToken}` },
    });
    expect(professionalFinancialReport.statusCode).toBe(403);
    expect(professionalFinancialReport.json().error).toBe("Acesso negado");

    process.env.AUTH_ENFORCED = "false";
  });

  it("refina permissoes financeiras por perfil", async () => {
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "true";
    const app = createApp();
    const ownerToken = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    });
    const receptionToken = await loginAs(app, {
      email: "recepcao@barbearia.local",
      password: "recepcao123",
      activeUnitId: "unit-01",
    });
    const professionalToken = await loginAs(app, {
      email: "profissional@barbearia.local",
      password: "profissional123",
      activeUnitId: "unit-01",
    });

    const appointment = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-26T10:00:00.000Z",
      },
    });
    expect(appointment.statusCode).toBe(200);
    const appointmentId = appointment.json().appointment.id as string;
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { status: "CONFIRMED" },
    });
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { status: "IN_SERVICE" },
    });
    const checkout = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
        "idempotency-key": "permissions-checkout-commission",
      },
      payload: {
        completedAt: "2026-04-26T10:50:00.000Z",
        paymentMethod: "PIX",
      },
    });
    expect(checkout.statusCode).toBe(200);

    const commissions = await app.inject({
      method: "GET",
      url: "/financial/commissions?unitId=unit-01&start=2026-04-26T00:00:00.000Z&end=2026-04-26T23:59:59.999Z",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(commissions.statusCode).toBe(200);
    const pending = commissions
      .json()
      .entries.find((item: { status: string }) => item.status === "PENDING");
    expect(pending).toBeTruthy();

    const receptionPay = await app.inject({
      method: "PATCH",
      url: `/financial/commissions/${pending.id}/pay`,
      headers: {
        authorization: `Bearer ${receptionToken}`,
        "idempotency-key": "permissions-reception-pay",
      },
      payload: {
        unitId: "unit-01",
        paidAt: "2026-04-26T11:00:00.000Z",
      },
    });
    expect(receptionPay.statusCode).toBe(403);

    const professionalPay = await app.inject({
      method: "PATCH",
      url: `/financial/commissions/${pending.id}/pay`,
      headers: {
        authorization: `Bearer ${professionalToken}`,
        "idempotency-key": "permissions-professional-pay",
      },
      payload: {
        unitId: "unit-01",
        paidAt: "2026-04-26T11:01:00.000Z",
      },
    });
    expect(professionalPay.statusCode).toBe(403);

    const professionalFinancial = await app.inject({
      method: "GET",
      url: "/financial/summary?unitId=unit-01&start=2026-04-26T00:00:00.000Z&end=2026-04-26T23:59:59.999Z",
      headers: { authorization: `Bearer ${professionalToken}` },
    });
    expect(professionalFinancial.statusCode).toBe(403);

    const ownerPay = await app.inject({
      method: "PATCH",
      url: `/financial/commissions/${pending.id}/pay`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
        "idempotency-key": "permissions-owner-pay",
      },
      payload: {
        unitId: "unit-01",
        paidAt: "2026-04-26T11:05:00.000Z",
      },
    });
    expect(ownerPay.statusCode).toBe(200);
    process.env.AUTH_ENFORCED = "false";
  });

  it("bloqueia atualizacao por id quando o atendimento pertence a outra unidade", async () => {
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "true";
    const app = createApp();

    const loginUnit01 = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "owner@barbearia.local",
        password: "owner123",
        activeUnitId: "unit-01",
      },
    });
    const tokenUnit01 = loginUnit01.json().accessToken as string;

    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: {
        authorization: `Bearer ${tokenUnit01}`,
      },
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-25T10:00:00.000Z",
        changedBy: "owner",
      },
    });
    expect(created.statusCode).toBe(200);
    const appointmentId = created.json().appointment.id as string;

    const loginUnit02 = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "owner@barbearia.local",
        password: "owner123",
        activeUnitId: "unit-02",
      },
    });
    const tokenUnit02 = loginUnit02.json().accessToken as string;

    const updateStatus = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      headers: {
        authorization: `Bearer ${tokenUnit02}`,
      },
      payload: {
        status: "CONFIRMED",
        changedBy: "owner",
      },
    });

    expect(updateStatus.statusCode).toBe(403);
    process.env.AUTH_ENFORCED = "false";
  });

  it("retorna contratos gerenciais de financeiro, atendimentos, vendas, estoque e profissionais por periodo", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();

    const appointment = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-27T10:00:00.000Z",
        changedBy: "owner",
      },
    });
    expect(appointment.statusCode).toBe(200);
    const appointmentId = appointment.json().appointment.id as string;
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "CONFIRMED", changedBy: "owner" },
    });
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "IN_SERVICE", changedBy: "owner" },
    });
    const checkout = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: { "idempotency-key": "reports-management-checkout" },
      payload: {
        unitId: "unit-01",
        completedAt: "2026-04-27T10:45:00.000Z",
        paymentMethod: "PIX",
        changedBy: "owner",
        products: [{ productId: "prd-pomada", quantity: 1 }],
      },
    });
    expect(checkout.statusCode).toBe(200);

    const base = "unitId=unit-01&start=2026-04-27T00:00:00.000Z&end=2026-04-27T23:59:59.999Z";
    const financial = await app.inject({ method: "GET", url: `/reports/management/financial?${base}` });
    expect(financial.statusCode).toBe(200);
    expect(financial.json().summary.serviceRevenue).toBeGreaterThan(0);
    expect(financial.json().breakdown.byOrigin[0].label).toBeTruthy();

    const appointments = await app.inject({ method: "GET", url: `/reports/management/appointments?${base}` });
    expect(appointments.statusCode).toBe(200);
    expect(appointments.json().summary.completed).toBe(1);

    const productSales = await app.inject({ method: "GET", url: `/reports/management/product-sales?${base}` });
    expect(productSales.statusCode).toBe(200);
    expect(productSales.json().summary.salesCount).toBe(1);

    const stock = await app.inject({ method: "GET", url: `/reports/management/stock?${base}` });
    expect(stock.statusCode).toBe(200);
    expect(stock.json().movements.some((row: { label: string }) => row.label === "Saida por venda")).toBe(true);

    const professionals = await app.inject({ method: "GET", url: `/reports/management/professionals?${base}` });
    expect(professionals.statusCode).toBe(200);
    expect(professionals.json().professionals[0].professionalName).toBeTruthy();

    const summary = await app.inject({ method: "GET", url: `/reports/management/summary?${base}` });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().reports.map((item: { type: string }) => item.type)).toContain("financial");
  });

  it("exporta CSV gerencial com cabecalhos humanos", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();
    const response = await app.inject({
      method: "GET",
      url: "/reports/management/export.csv?unitId=unit-01&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.999Z&type=financial",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("relatorio-financial-unit-01");
    expect(response.body).toContain("\"Data\";\"Tipo\";\"Origem\"");
  });

  it("exporta CSV gerencial de clientes sem IDs tecnicos", async () => {
    process.env.DATA_BACKEND = "memory";
    const app = createApp();
    const response = await app.inject({
      method: "GET",
      url: "/reports/management/export.csv?unitId=unit-01&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.999Z&type=clients",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("relatorio-clients-unit-01");
    expect(response.body).toContain("\"Cliente\";\"Status\";\"Visitas no periodo\"");
    expect(response.body).not.toContain("clientId");
    expect(response.body).not.toContain("cli-");
  });

  it("preserva permissoes e tenant guard nos relatorios gerenciais sensiveis", async () => {
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "true";
    const app = createApp();
    const ownerToken = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    });
    const receptionToken = await loginAs(app, {
      email: "recepcao@barbearia.local",
      password: "recepcao123",
      activeUnitId: "unit-01",
    });
    const professionalToken = await loginAs(app, {
      email: "profissional@barbearia.local",
      password: "profissional123",
      activeUnitId: "unit-01",
    });

    const base = "unitId=unit-01&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.999Z";
    const summaryAsReception = await app.inject({
      method: "GET",
      url: `/reports/management/summary?${base}`,
      headers: { authorization: `Bearer ${receptionToken}` },
    });
    expect(summaryAsReception.statusCode).toBe(403);

    const auditAsReception = await app.inject({
      method: "GET",
      url: `/reports/management/audit?${base}`,
      headers: { authorization: `Bearer ${receptionToken}` },
    });
    expect(auditAsReception.statusCode).toBe(403);

    const auditAsProfessional = await app.inject({
      method: "GET",
      url: `/reports/management/audit?${base}`,
      headers: { authorization: `Bearer ${professionalToken}` },
    });
    expect(auditAsProfessional.statusCode).toBe(403);

    const auditAsOwner = await app.inject({
      method: "GET",
      url: `/reports/management/audit?${base}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(auditAsOwner.statusCode).toBe(200);

    const auditExportAsReception = await app.inject({
      method: "GET",
      url: `/reports/management/export.csv?${base}&type=audit`,
      headers: { authorization: `Bearer ${receptionToken}` },
    });
    expect(auditExportAsReception.statusCode).toBe(403);

    const financialExportAsProfessional = await app.inject({
      method: "GET",
      url: `/reports/management/export.csv?${base}&type=financial`,
      headers: { authorization: `Bearer ${professionalToken}` },
    });
    expect(financialExportAsProfessional.statusCode).toBe(403);

    const appointmentsExportAsProfessional = await app.inject({
      method: "GET",
      url: `/reports/management/export.csv?${base}&type=appointments`,
      headers: { authorization: `Bearer ${professionalToken}` },
    });
    expect(appointmentsExportAsProfessional.statusCode).toBe(403);

    const financialExportAsOwner = await app.inject({
      method: "GET",
      url: `/reports/management/export.csv?${base}&type=financial`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(financialExportAsOwner.statusCode).toBe(200);
    expect(financialExportAsOwner.headers["content-type"]).toContain("text/csv");

    const crossUnit = await app.inject({
      method: "GET",
      url: "/reports/management/appointments?unitId=unit-02&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.999Z",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(crossUnit.statusCode).toBe(403);
    process.env.AUTH_ENFORCED = "false";
  });
});
