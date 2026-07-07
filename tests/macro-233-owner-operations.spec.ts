import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/http/app";

type TestApp = ReturnType<typeof createApp>;

async function login(app: TestApp, email: string, password: string) {
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password, activeUnitId: "unit-01" },
  });
  expect(response.statusCode).toBe(200);
  return { authorization: `Bearer ${response.json().accessToken}` };
}

async function createAppointment(app: TestApp, headers: Record<string, string>, startsAt: string, serviceId = "svc-corte") {
  const response = await app.inject({
    method: "POST",
    url: "/appointments",
    headers: { ...headers, "idempotency-key": `appt-${startsAt}-${serviceId}` },
    payload: {
      unitId: "unit-01",
      clientId: "cli-01",
      professionalId: "pro-01",
      serviceId,
      startsAt,
      changedBy: "macro-233-test",
    },
  });
  expect(response.statusCode).toBe(200);
  return response.json().appointment;
}

async function setStatus(app: TestApp, headers: Record<string, string>, appointmentId: string, status: string) {
  const response = await app.inject({
    method: "PATCH",
    url: `/appointments/${appointmentId}/status`,
    headers: { ...headers, "idempotency-key": `status-${appointmentId}-${status}` },
    payload: { status, changedBy: "macro-233-test" },
  });
  expect(response.statusCode).toBe(200);
  return response.json().appointment;
}

async function setBusinessHours(
  app: TestApp,
  headers: Record<string, string>,
  hours: Array<{ dayOfWeek: number; opensAt: string; closesAt: string; isClosed: boolean }>,
) {
  const response = await app.inject({
    method: "PATCH",
    url: "/settings/business-hours",
    headers,
    payload: {
      unitId: "unit-01",
      hours,
    },
  });
  expect(response.statusCode).toBe(200);
}

describe("Macro 233 owner-only operations", () => {
  const previousEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ["DATA_BACKEND", "AUTH_ENFORCED", "BLOCK_COMMERCIAL_REFUNDS", "ENABLE_COMMISSION_TEST_RULES"]) {
      previousEnv[key] = process.env[key];
    }
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "true";
    process.env.BLOCK_COMMERCIAL_REFUNDS = "true";
    delete process.env.ENABLE_COMMISSION_TEST_RULES;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-04-22T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("mantem walk-in owner-only, reutiliza cliente por telefone normalizado e lista na agenda", async () => {
    const app = createApp();
    const owner = await login(app, "owner@barbearia.local", "owner123");
    const reception = await login(app, "recepcao@barbearia.local", "recepcao123");

    const blocked = await app.inject({
      method: "POST",
      url: "/appointments/walk-in",
      headers: { ...reception, "idempotency-key": "walkin-denied" },
      payload: {
        unitId: "unit-01",
        clientName: "Joao Santos",
        clientPhone: "(11) 99999-9999",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startedAt: "2026-04-22T13:00:00.000Z",
        changedBy: "macro-233-test",
      },
    });
    expect(blocked.statusCode).toBe(403);

    const created = await app.inject({
      method: "POST",
      url: "/appointments/walk-in",
      headers: { ...owner, "idempotency-key": "walkin-owner-001" },
      payload: {
        unitId: "unit-01",
        clientName: "Joao Santos",
        clientPhone: "(11) 99999-9999",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startedAt: "2026-04-22T13:00:00.000Z",
        changedBy: "macro-233-test",
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().appointment).toMatchObject({
      clientId: "cli-01",
      status: "IN_SERVICE",
      notes: "Atendimento sem agendamento",
    });
    expect(created.json().appointment.startsAt).toBe("2026-04-22T12:00:00.000Z");
    expect(created.json().appointment.endsAt).toBe("2026-04-22T12:45:00.000Z");

    const replay = await app.inject({
      method: "POST",
      url: "/appointments/walk-in",
      headers: { ...owner, "idempotency-key": "walkin-owner-001" },
      payload: {
        unitId: "unit-01",
        clientName: "Joao Santos",
        clientPhone: "(11) 99999-9999",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startedAt: "2026-04-22T13:00:00.000Z",
        changedBy: "macro-233-test",
      },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().appointment.id).toBe(created.json().appointment.id);
    expect(replay.json().appointment.startsAt).toBe("2026-04-22T12:00:00.000Z");

    const agenda = await app.inject({
      method: "GET",
      url: "/appointments?unitId=unit-01&start=2026-04-22T00:00:00.000Z&end=2026-04-22T23:59:59.999Z",
      headers: owner,
    });
    expect(agenda.statusCode).toBe(200);
    expect(agenda.json().appointments.some((item: any) => item.id === created.json().appointment.id)).toBe(true);
  });

  it("usa horario do servidor no walk-in e ignora startedAt passado ou futuro do cliente", async () => {
    vi.setSystemTime(new Date("2026-04-22T12:00:00.250Z"));
    const app = createApp();
    const owner = await login(app, "owner@barbearia.local", "owner123");

    const pastPayload = await app.inject({
      method: "POST",
      url: "/appointments/walk-in",
      headers: { ...owner, "idempotency-key": "walkin-server-time-past" },
      payload: {
        unitId: "unit-01",
        clientName: "Cliente Relogio Passado",
        clientPhone: "11922220001",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startedAt: "2026-04-22T11:59:59.000Z",
        changedBy: "macro-233-test",
      },
    });
    expect(pastPayload.statusCode).toBe(200);
    expect(pastPayload.json().appointment).toMatchObject({
      startsAt: "2026-04-22T12:00:00.250Z",
      endsAt: "2026-04-22T12:45:00.250Z",
      status: "IN_SERVICE",
    });

    vi.setSystemTime(new Date("2026-04-22T13:00:00.500Z"));
    const futureApp = createApp();
    const futureOwner = await login(futureApp, "owner@barbearia.local", "owner123");
    const futurePayload = await futureApp.inject({
      method: "POST",
      url: "/appointments/walk-in",
      headers: { ...futureOwner, "idempotency-key": "walkin-server-time-future" },
      payload: {
        unitId: "unit-01",
        clientName: "Cliente Relogio Futuro",
        clientPhone: "11922220002",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startedAt: "2026-04-22T20:00:00.000Z",
        changedBy: "macro-233-test",
      },
    });
    expect(futurePayload.statusCode).toBe(200);
    expect(futurePayload.json().appointment).toMatchObject({
      startsAt: "2026-04-22T13:00:00.500Z",
      endsAt: "2026-04-22T13:45:00.500Z",
      status: "IN_SERVICE",
    });
  });

  it("exige confirmacao para walk-in owner fora do expediente e confirma com a mesma idempotencyKey", async () => {
    vi.setSystemTime(new Date("2026-04-23T00:33:00.000Z"));
    const app = createApp();
    const owner = await login(app, "owner@barbearia.local", "owner123");
    const reception = await login(app, "recepcao@barbearia.local", "recepcao123");
    await setBusinessHours(app, owner, [
      { dayOfWeek: 3, opensAt: "08:00", closesAt: "20:00", isClosed: false },
    ]);

    const payload = {
      unitId: "unit-01",
      clientName: "Cliente Fora Expediente",
      clientPhone: "(11) 95555-4444",
      professionalId: "pro-01",
      serviceId: "svc-corte",
      startedAt: "2026-04-22T12:00:00.000Z",
      changedBy: "macro-233-test",
    };

    const first = await app.inject({
      method: "POST",
      url: "/appointments/walk-in",
      headers: { ...owner, "idempotency-key": "walkin-out-hours-001" },
      payload,
    });
    expect(first.statusCode).toBe(409);
    expect(first.json()).toMatchObject({
      code: "WALK_IN_OUTSIDE_BUSINESS_HOURS",
      requiresConfirmation: true,
      businessHours: { opensAt: "08:00", closesAt: "20:00", isClosed: false },
      currentLocalTime: "21:33",
    });
    expect(first.json().message).toMatch(/fora do expediente/i);

    const emptyAgenda = await app.inject({
      method: "GET",
      url: "/appointments?unitId=unit-01&start=2026-04-23T00:00:00.000Z&end=2026-04-23T02:00:00.000Z",
      headers: owner,
    });
    expect(emptyAgenda.statusCode).toBe(200);
    expect(emptyAgenda.json().appointments).toHaveLength(0);

    const receptionConfirm = await app.inject({
      method: "POST",
      url: "/appointments/walk-in",
      headers: { ...reception, "idempotency-key": "walkin-out-hours-reception" },
      payload: { ...payload, confirmOutOfHours: true },
    });
    expect(receptionConfirm.statusCode).toBe(403);

    const confirmed = await app.inject({
      method: "POST",
      url: "/appointments/walk-in",
      headers: { ...owner, "idempotency-key": "walkin-out-hours-001" },
      payload: { ...payload, confirmOutOfHours: true },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().appointment).toMatchObject({
      status: "IN_SERVICE",
      startsAt: "2026-04-23T00:33:00.000Z",
      endsAt: "2026-04-23T01:18:00.000Z",
    });

    const replay = await app.inject({
      method: "POST",
      url: "/appointments/walk-in",
      headers: { ...owner, "idempotency-key": "walkin-out-hours-001" },
      payload: { ...payload, confirmOutOfHours: true },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().appointment.id).toBe(confirmed.json().appointment.id);

    const agenda = await app.inject({
      method: "GET",
      url: "/appointments?unitId=unit-01&start=2026-04-23T00:00:00.000Z&end=2026-04-23T02:00:00.000Z",
      headers: owner,
    });
    expect(agenda.statusCode).toBe(200);
    expect(agenda.json().appointments).toHaveLength(1);

    const audit = await app.inject({
      method: "GET",
      url: "/audit/events?unitId=unit-01&action=WALK_IN_APPOINTMENT_CREATED&entity=appointment&limit=20",
      headers: owner,
    });
    expect(audit.statusCode).toBe(200);
    const event = (audit.json().events as Array<{ entityId: string; afterJson: Record<string, unknown> }>).find(
      (item) => item.entityId === confirmed.json().appointment.id,
    );
    expect(event?.afterJson).toMatchObject({
      outsideBusinessHours: true,
      confirmOutOfHours: true,
    });
  });

  it("bloqueia horarios/dias, impede conflitos e permite desbloqueio auditavel", async () => {
    const app = createApp();
    const owner = await login(app, "owner@barbearia.local", "owner123");
    await createAppointment(app, owner, "2026-04-22T15:00:00.000Z");

    const conflict = await app.inject({
      method: "POST",
      url: "/appointments/blocks",
      headers: { ...owner, "idempotency-key": "block-conflict-001" },
      payload: {
        unitId: "unit-01",
        professionalId: "pro-01",
        startsAt: "2026-04-22T15:10:00.000Z",
        endsAt: "2026-04-22T15:30:00.000Z",
        reason: "Manutencao",
        changedBy: "macro-233-test",
      },
    });
    expect(conflict.statusCode).toBeGreaterThanOrEqual(400);
    expect(conflict.json().error).toMatch(/Conflito/i);

    const block = await app.inject({
      method: "POST",
      url: "/appointments/blocks",
      headers: { ...owner, "idempotency-key": "block-ok-001" },
      payload: {
        unitId: "unit-01",
        professionalId: "pro-01",
        startsAt: "2026-04-22T16:00:00.000Z",
        endsAt: "2026-04-22T16:30:00.000Z",
        reason: "Intervalo operacional",
        changedBy: "macro-233-test",
      },
    });
    expect(block.statusCode).toBe(200);
    expect(block.json().block.status).toBe("ACTIVE");

    const blockedAppointment = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: { ...owner, "idempotency-key": "appointment-inside-block" },
      payload: {
        unitId: "unit-01",
        clientId: "cli-02",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-22T16:00:00.000Z",
        changedBy: "macro-233-test",
      },
    });
    expect(blockedAppointment.statusCode).toBeGreaterThanOrEqual(400);
    expect(blockedAppointment.json().error).toMatch(/bloqueado|bloqueio/i);

    const dayBlock = await app.inject({
      method: "POST",
      url: "/appointments/blocks",
      headers: { ...owner, "idempotency-key": "day-block-001" },
      payload: {
        unitId: "unit-01",
        startsAt: "2026-04-23T00:00:00.000Z",
        endsAt: "2026-04-24T00:00:00.000Z",
        reason: "Dia bloqueado",
        isFullDay: true,
        changedBy: "macro-233-test",
      },
    });
    expect(dayBlock.statusCode).toBe(200);
    expect(dayBlock.json().block.isFullDay).toBe(true);

    const agenda = await app.inject({
      method: "GET",
      url: "/appointments?unitId=unit-01&start=2026-04-22T00:00:00.000Z&end=2026-04-24T23:59:59.999Z",
      headers: owner,
    });
    expect(agenda.statusCode).toBe(200);
    expect(agenda.json().blockEvents.map((item: any) => item.label)).toContain("Dia bloqueado");

    const agendaRange = await app.inject({
      method: "GET",
      url: "/agenda/range?unitId=unit-01&start=2026-04-22T00:00:00.000Z&end=2026-04-24T23:59:59.999Z",
      headers: owner,
    });
    expect(agendaRange.statusCode).toBe(200);
    expect(agendaRange.json().blocks).toHaveLength(2);
    expect(agendaRange.json().blockEvents.map((item: any) => item.label)).toEqual(
      expect.arrayContaining(["Horario bloqueado", "Dia bloqueado"]),
    );

    const cancel = await app.inject({
      method: "POST",
      url: `/appointments/blocks/${block.json().block.id}/cancel`,
      headers: { ...owner, "idempotency-key": "block-cancel-001" },
      payload: {
        unitId: "unit-01",
        reason: "Agenda liberada",
        changedBy: "macro-233-test",
      },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().block.status).toBe("CANCELLED");

    const refreshedAgendaRange = await app.inject({
      method: "GET",
      url: "/agenda/range?unitId=unit-01&start=2026-04-22T00:00:00.000Z&end=2026-04-24T23:59:59.999Z",
      headers: owner,
    });
    expect(refreshedAgendaRange.statusCode).toBe(200);
    expect(refreshedAgendaRange.json().blockEvents.map((item: any) => item.id)).not.toContain(block.json().block.id);
  });

  it("exige confirmacao para encaixe/conflito e recalcula servicos durante atendimento", async () => {
    const app = createApp();
    const owner = await login(app, "owner@barbearia.local", "owner123");
    const existing = await createAppointment(app, owner, "2026-04-22T17:00:00.000Z");

    const fittingPreview = await app.inject({
      method: "POST",
      url: "/appointments/fitting",
      headers: { ...owner, "idempotency-key": "fitting-preview-001" },
      payload: {
        unitId: "unit-01",
        clientName: "Cliente Encaixe",
        clientPhone: "11911112222",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-22T17:00:00.000Z",
        changedBy: "macro-233-test",
      },
    });
    expect(fittingPreview.statusCode).toBe(200);
    expect(fittingPreview.json()).toMatchObject({
      requiresConfirmation: true,
      durationMin: 45,
    });
    expect(fittingPreview.json().conflicts[0].appointmentId).toBe(existing.id);

    const fitting = await app.inject({
      method: "POST",
      url: "/appointments/fitting",
      headers: { ...owner, "idempotency-key": "fitting-confirmed-001" },
      payload: {
        unitId: "unit-01",
        clientName: "Cliente Encaixe",
        clientPhone: "11911112222",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: "2026-04-22T17:00:00.000Z",
        confirmRisk: true,
        changedBy: "macro-233-test",
      },
    });
    expect(fitting.statusCode).toBe(200);
    expect(fitting.json().appointment).toMatchObject({ status: "IN_SERVICE", isFitting: true });
    expect(fitting.json().conflictsAccepted).toContain(existing.id);

    vi.setSystemTime(new Date("2026-04-22T18:00:00.000Z"));
    const inService = await app.inject({
      method: "POST",
      url: "/appointments/walk-in",
      headers: { ...owner, "idempotency-key": "service-change-base" },
      payload: {
        unitId: "unit-01",
        clientName: "Servico Em Andamento",
        clientPhone: "11933334444",
        professionalId: "pro-01",
        serviceId: "svc-barba",
        startedAt: "2026-04-22T12:00:00.000Z",
        changedBy: "macro-233-test",
      },
    });
    expect(inService.statusCode).toBe(200);
    await createAppointment(app, owner, "2026-04-22T18:40:00.000Z", "svc-barba");

    const riskyChange = await app.inject({
      method: "PATCH",
      url: `/appointments/${inService.json().appointment.id}/services`,
      headers: { ...owner, "idempotency-key": "service-change-risk" },
      payload: {
        unitId: "unit-01",
        serviceId: "svc-corte",
        changedBy: "macro-233-test",
      },
    });
    expect(riskyChange.statusCode).toBeGreaterThanOrEqual(400);
    expect(riskyChange.json().error).toMatch(/conflita/i);

    const confirmedChange = await app.inject({
      method: "PATCH",
      url: `/appointments/${inService.json().appointment.id}/services`,
      headers: { ...owner, "idempotency-key": "service-change-confirmed" },
      payload: {
        unitId: "unit-01",
        serviceId: "svc-corte",
        confirmRisk: true,
        changedBy: "macro-233-test",
      },
    });
    expect(confirmedChange.statusCode).toBe(200);
    expect(confirmedChange.json().appointment).toMatchObject({
      serviceId: "svc-corte",
      totalPriceSnapshot: 75,
      effectiveDurationMinSnapshot: 45,
    });
    expect(confirmedChange.json().appointment.endsAt).toBe("2026-04-22T18:45:00.000Z");
  });

  it("processa checkout dividido/troco/falha, correcao administrativa e bloqueio comercial de refund", async () => {
    const app = createApp();
    const owner = await login(app, "owner@barbearia.local", "owner123");
    const failedAppointment = await createAppointment(app, owner, "2026-04-22T19:00:00.000Z");
    await setStatus(app, owner, failedAppointment.id, "CONFIRMED");
    await setStatus(app, owner, failedAppointment.id, "IN_SERVICE");

    const failedCheckout = await app.inject({
      method: "POST",
      url: `/appointments/${failedAppointment.id}/checkout`,
      headers: { ...owner, "idempotency-key": "checkout-failed-001" },
      payload: {
        unitId: "unit-01",
        changedBy: "macro-233-test",
        completedAt: "2026-04-22T19:45:00.000Z",
        payments: [{ method: "PIX", amount: 75, status: "FAILED", failureReason: "Pagamento recusado" }],
      },
    });
    expect(failedCheckout.statusCode).toBe(200);
    expect(failedCheckout.json().appointment.status).toBe("IN_SERVICE");
    expect(failedCheckout.json().checkout.status).toBe("OPEN");
    expect(failedCheckout.json().serviceRevenue).toBeUndefined();

    const paidAppointment = await createAppointment(app, owner, "2026-04-22T20:00:00.000Z");
    await setStatus(app, owner, paidAppointment.id, "CONFIRMED");
    await setStatus(app, owner, paidAppointment.id, "IN_SERVICE");
    const paidCheckout = await app.inject({
      method: "POST",
      url: `/appointments/${paidAppointment.id}/checkout`,
      headers: { ...owner, "idempotency-key": "checkout-split-001" },
      payload: {
        unitId: "unit-01",
        changedBy: "macro-233-test",
        completedAt: "2026-04-22T20:45:00.000Z",
        payments: [
          { method: "dinheiro", amount: 20, receivedAmount: 20, responsible: "Geovane" },
          { method: "PIX", amount: 55, responsible: "Geovane", reference: "pix-abc" },
        ],
      },
    });
    expect(paidCheckout.statusCode).toBe(200);
    expect(paidCheckout.json().appointment.status).toBe("COMPLETED");
    expect(paidCheckout.json().checkout.status).toBe("PAID");
    expect(paidCheckout.json().payments.map((item: any) => item.method)).toEqual(["CASH", "PIX"]);
    expect(paidCheckout.json().commissions).toHaveLength(0);

    const cashAppointment = await createAppointment(app, owner, "2026-04-22T21:00:00.000Z");
    await setStatus(app, owner, cashAppointment.id, "CONFIRMED");
    await setStatus(app, owner, cashAppointment.id, "IN_SERVICE");
    const cashCheckout = await app.inject({
      method: "POST",
      url: `/appointments/${cashAppointment.id}/checkout`,
      headers: { ...owner, "idempotency-key": "checkout-cash-change-001" },
      payload: {
        unitId: "unit-01",
        changedBy: "macro-233-test",
        completedAt: "2026-04-22T21:45:00.000Z",
        payments: [{ method: "dinheiro", amount: 75, receivedAmount: 100, responsible: "Geovane" }],
      },
    });
    expect(cashCheckout.statusCode).toBe(200);
    expect(cashCheckout.json().checkout).toMatchObject({ paidAmount: 75, changeAmount: 25 });
    expect(cashCheckout.json().serviceRevenue.amount).toBe(75);

    const correction = await app.inject({
      method: "POST",
      url: `/financial/checkout-payments/${paidCheckout.json().payments[0].id}/correct`,
      headers: { ...owner, "idempotency-key": "payment-correction-001" },
      payload: {
        unitId: "unit-01",
        reason: "Pagamento lancado duplicado",
        responsible: "Geovane",
        correctedAt: "2026-04-22T22:00:00.000Z",
      },
    });
    expect(correction.statusCode).toBe(200);
    expect(correction.json().correction).toMatchObject({
      status: "REVERSED",
      reversedPaymentId: paidCheckout.json().payments[0].id,
    });
    expect(correction.json().financialEntry).toMatchObject({
      kind: "EXPENSE",
      category: "CORRECAO_ADMINISTRATIVA",
      amount: 20,
    });

    const refund = await app.inject({
      method: "POST",
      url: `/appointments/${paidAppointment.id}/refund`,
      headers: { ...owner, "idempotency-key": "commercial-refund-blocked" },
      payload: {
        unitId: "unit-01",
        changedBy: "macro-233-test",
        reason: "Pedido comercial",
        refundedAt: "2026-04-22T22:30:00.000Z",
      },
    });
    expect(refund.statusCode).toBe(410);
  });

  it("registra movimentos manuais, inventario fisico e fechamento diario com reabertura", async () => {
    const app = createApp();
    const owner = await login(app, "owner@barbearia.local", "owner123");

    const manual = await app.inject({
      method: "POST",
      url: "/stock/movements/manual",
      headers: { ...owner, "idempotency-key": "stock-manual-001" },
      payload: {
        unitId: "unit-01",
        productId: "prd-pomada",
        movementType: "IN",
        quantity: 2,
        reason: "Entrada conferida",
        responsible: "Geovane",
        changedBy: "macro-233-test",
        occurredAt: "2026-04-22T12:30:00.000Z",
      },
    });
    expect(manual.statusCode).toBe(200);
    expect(manual.json().product.stockQty).toBe(17);

    const manualReplay = await app.inject({
      method: "POST",
      url: "/stock/movements/manual",
      headers: { ...owner, "idempotency-key": "stock-manual-001" },
      payload: {
        unitId: "unit-01",
        productId: "prd-pomada",
        movementType: "IN",
        quantity: 2,
        reason: "Entrada conferida",
        responsible: "Geovane",
        changedBy: "macro-233-test",
        occurredAt: "2026-04-22T12:30:00.000Z",
      },
    });
    expect(manualReplay.statusCode).toBe(200);
    expect(manualReplay.json().movement.id).toBe(manual.json().movement.id);
    expect(manualReplay.json().product.stockQty).toBe(17);

    const count = await app.inject({
      method: "POST",
      url: "/inventory/counts",
      headers: { ...owner, "idempotency-key": "inventory-count-001" },
      payload: {
        unitId: "unit-01",
        productId: "prd-pomada",
        countedQty: 16,
        reason: "Conferencia fisica",
        responsible: "Geovane",
        countedAt: "2026-04-22T13:00:00.000Z",
      },
    });
    expect(count.statusCode).toBe(200);
    expect(count.json().count).toMatchObject({
      expectedQty: 17,
      countedQty: 16,
      differenceQty: -1,
      status: "APPLIED",
    });
    expect(count.json().movement).toMatchObject({ movementType: "OUT", quantity: 1 });

    const close = await app.inject({
      method: "POST",
      url: "/financial/daily-closing",
      headers: { ...owner, "idempotency-key": "daily-closing-001" },
      payload: {
        unitId: "unit-01",
        businessDate: "2026-04-22",
        informedCash: 0,
        informedPix: 0,
        informedDebit: 0,
        informedCredit: 0,
        notes: "Fechamento de teste macro 233",
        responsible: "Geovane",
      },
    });
    expect(close.statusCode).toBe(200);
    expect(close.json().closing.status).toBe("CLOSED");
    expect(close.json().closing.responsible).toBe("Geovane");

    const reopen = await app.inject({
      method: "POST",
      url: `/financial/daily-closing/${close.json().closing.id}/reopen`,
      headers: owner,
      payload: {
        unitId: "unit-01",
        reopenedBy: "Geovane",
        reason: "Revisao administrativa",
      },
    });
    expect(reopen.statusCode).toBe(200);
    expect(reopen.json().closing).toMatchObject({
      status: "REOPENED",
      reopenReason: "Revisao administrativa",
    });
  });
});
