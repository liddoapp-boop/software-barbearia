import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/http/app";

async function setUnit01WideWednesdayHours(app: ReturnType<typeof createApp>) {
  await app.inject({
    method: "PATCH",
    url: "/settings/business-hours",
    payload: {
      unitId: "unit-01",
      hours: [
        { dayOfWeek: 3, opensAt: "00:00", closesAt: "23:59", isClosed: false },
      ],
    },
  });
}

async function updateSchedulingSettings(app: ReturnType<typeof createApp>, payload: Record<string, unknown>) {
  const response = await app.inject({
    method: "PATCH",
    url: "/settings/business",
    payload: {
      unitId: "unit-01",
      businessName: "Barbearia Premium - Centro",
      segment: "barbearia",
      ...payload,
    },
  });
  expect(response.statusCode).toBe(200);
}

function appointmentPayload(overrides: Record<string, unknown> = {}) {
  return {
    unitId: "unit-01",
    clientId: "cli-01",
    professionalId: "pro-01",
    serviceId: "svc-corte",
    startsAt: "2026-04-22T16:30:00.000Z",
    changedBy: "appointment-hardening-test",
    ...overrides,
  };
}

async function patchAppointmentStatus(
  app: ReturnType<typeof createApp>,
  appointmentId: string,
  status: string,
  idempotencyKey: string,
  payload: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return await app.inject({
    method: "PATCH",
    url: `/appointments/${appointmentId}/status`,
    headers: { ...headers, "idempotency-key": idempotencyKey },
    payload: {
      status,
      changedBy: "appointment-hardening-test",
      ...payload,
    },
  });
}

async function ownerHeaders(app: ReturnType<typeof createApp>) {
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    },
  });
  expect(login.statusCode).toBe(200);
  return { authorization: `Bearer ${login.json().accessToken}` };
}

describe("blindagem de agendamentos", () => {
  beforeEach(() => {
    process.env.AUTH_ENFORCED = "false";
    process.env.DATA_BACKEND = "memory";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-04-22T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cria agendamento valido dentro do expediente", async () => {
    const app = createApp();
    await setUnit01WideWednesdayHours(app);

    const response = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: appointmentPayload(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().appointment.status).toBe("SCHEDULED");
  });

  it("bloqueia criacao fora do horario comercial", async () => {
    const app = createApp();
    await app.inject({
      method: "PATCH",
      url: "/settings/business-hours",
      payload: {
        unitId: "unit-01",
        hours: [{ dayOfWeek: 3, opensAt: "00:00", closesAt: "18:00", isClosed: false }],
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: appointmentPayload({ startsAt: "2026-04-22T22:30:00.000Z" }),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/expediente|horario/i);
  });

  it("mantem booking publico bloqueado fora do expediente mesmo com fluxo walk-in liberado por confirmacao", async () => {
    const app = createApp();
    await app.inject({
      method: "PATCH",
      url: "/settings/business-hours",
      payload: {
        unitId: "unit-01",
        hours: [{ dayOfWeek: 5, opensAt: "08:00", closesAt: "17:00", isClosed: false }],
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/public/booking?unitId=unit-01",
      payload: {
        unitId: "unit-01",
        clientName: "Cliente Publico Fora Expediente",
        clientPhone: "(11) 94444-3333",
        serviceId: "svc-corte",
        startsAt: "2026-06-05T21:00:00.000Z",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/fora do expediente|horario/i);
  });

  it("bloqueia criacao em dia fechado", async () => {
    const app = createApp();
    await app.inject({
      method: "PATCH",
      url: "/settings/business-hours",
      payload: {
        unitId: "unit-01",
        hours: [{ dayOfWeek: 3, opensAt: "00:00", closesAt: "23:59", isClosed: true }],
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: appointmentPayload(),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/fechad[ao]/i);
  });

  it("bloqueia criacao durante intervalo", async () => {
    const app = createApp();
    await app.inject({
      method: "PATCH",
      url: "/settings/business-hours",
      payload: {
        unitId: "unit-01",
        hours: [
          {
            dayOfWeek: 3,
            opensAt: "00:00",
            closesAt: "23:59",
            breakStart: "13:00",
            breakEnd: "14:00",
            isClosed: false,
          },
        ],
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: appointmentPayload(),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/intervalo/i);
  });

  it("bloqueia criacao no passado e antes da antecedencia minima", async () => {
    const app = createApp();
    await setUnit01WideWednesdayHours(app);

    const past = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: appointmentPayload({ startsAt: "2026-04-22T11:59:00.000Z" }),
    });
    expect(past.statusCode).toBe(409);
    expect(past.json().error).toMatch(/passado|antecedencia/i);

    const tooSoon = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: appointmentPayload({ startsAt: "2026-04-22T12:10:00.000Z" }),
    });
    expect(tooSoon.statusCode).toBe(409);
    expect(tooSoon.json().error).toMatch(/antecedencia/i);
  });

  it("bloqueia remarcacao para o passado", async () => {
    const app = createApp();
    await setUnit01WideWednesdayHours(app);

    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: appointmentPayload({ startsAt: "2026-04-22T16:00:00.000Z" }),
    });
    expect(created.statusCode).toBe(200);

    const rescheduled = await app.inject({
      method: "PATCH",
      url: `/appointments/${created.json().appointment.id}/reschedule`,
      headers: { "idempotency-key": "reschedule-past-still-blocked" },
      payload: {
        startsAt: "2026-04-22T11:59:00.000Z",
        changedBy: "appointment-hardening-test",
      },
    });
    expect(rescheduled.statusCode).toBe(409);
    expect(rescheduled.json().error).toMatch(/passado|antecedencia/i);
  });

  it("respeita buffer configurado na criacao e na remarcacao", async () => {
    const app = createApp();
    await setUnit01WideWednesdayHours(app);
    await updateSchedulingSettings(app, { bufferBetweenAppointmentsMinutes: 10 });

    const first = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: appointmentPayload({ startsAt: "2026-04-22T16:00:00.000Z" }),
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().appointment.endsAt).toBe("2026-04-22T16:45:00.000Z");

    const secondInsideBuffer = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: appointmentPayload({
        clientId: "cli-02",
        startsAt: "2026-04-22T16:50:00.000Z",
      }),
    });
    expect(secondInsideBuffer.statusCode).toBe(409);

    const movable = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: appointmentPayload({
        clientId: "cli-02",
        startsAt: "2026-04-22T18:00:00.000Z",
      }),
    });
    expect(movable.statusCode).toBe(200);

    const rescheduleInsideBuffer = await app.inject({
      method: "PATCH",
      url: `/appointments/${movable.json().appointment.id}/reschedule`,
      headers: { "idempotency-key": "reschedule-inside-buffer" },
      payload: {
        startsAt: "2026-04-22T16:50:00.000Z",
        changedBy: "appointment-hardening-test",
      },
    });
    expect(rescheduleInsideBuffer.statusCode).toBe(409);
  });

  it("bloqueia servico de outra unidade", async () => {
    const app = createApp();

    const response = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: appointmentPayload({ unitId: "unit-02" }),
    });

    expect([400, 403, 404, 409]).toContain(response.statusCode);
    expect(response.json().error).toMatch(/servico|unidade/i);
  });

  it("bloqueia cliente de outra unidade", async () => {
    const app = createApp();
    await setUnit01WideWednesdayHours(app);
    const createdClient = await app.inject({
      method: "POST",
      url: "/clients",
      payload: {
        unitId: "unit-02",
        name: "Cliente Zona Sul",
        phone: "11977776666",
      },
    });
    expect(createdClient.statusCode).toBe(200);

    const response = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: appointmentPayload({ clientId: createdClient.json().client.id }),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toMatch(/cliente/i);
  });

  it("retorna erro claro para status invalido em listagem", async () => {
    const app = createApp();

    const response = await app.inject({
      method: "GET",
      url: "/appointments?unitId=unit-01&status=INVALIDO",
    });

    expect([400, 422]).toContain(response.statusCode);
    expect(response.json().error).toMatch(/status/i);
  });

  it("exige idempotencia em status, faz replay e rejeita payload divergente", async () => {
    const app = createApp();
    await setUnit01WideWednesdayHours(app);
    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: appointmentPayload(),
    });
    expect(created.statusCode).toBe(200);
    const appointmentId = created.json().appointment.id;

    const missing = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      payload: { status: "CONFIRMED", changedBy: "appointment-hardening-test" },
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error).toMatch(/idempotencyKey/i);

    const first = await patchAppointmentStatus(app, appointmentId, "CONFIRMED", "status-confirm-001");
    const replay = await patchAppointmentStatus(app, appointmentId, "CONFIRMED", "status-confirm-001");
    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().appointment.status).toBe("CONFIRMED");

    const conflict = await patchAppointmentStatus(app, appointmentId, "IN_SERVICE", "status-confirm-001");
    expect(conflict.statusCode).toBe(409);
  });

  it("cancela SCHEDULED liberando slot e bloqueia cancelamento em IN_SERVICE", async () => {
    const app = createApp();
    await setUnit01WideWednesdayHours(app);
    const first = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: appointmentPayload({ startsAt: "2026-04-22T16:00:00.000Z" }),
    });
    expect(first.statusCode).toBe(200);
    const firstId = first.json().appointment.id;

    const cancelled = await patchAppointmentStatus(app, firstId, "CANCELLED", "cancel-scheduled-001", {
      reason: "Cliente cancelou",
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().appointment.status).toBe("CANCELLED");

    const reusedSlot = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: appointmentPayload({
        clientId: "cli-02",
        startsAt: "2026-04-22T16:00:00.000Z",
      }),
    });
    expect(reusedSlot.statusCode).toBe(200);

    const inService = await patchAppointmentStatus(app, reusedSlot.json().appointment.id, "CONFIRMED", "confirm-before-cancel-001");
    expect(inService.statusCode).toBe(200);
    const started = await patchAppointmentStatus(app, reusedSlot.json().appointment.id, "IN_SERVICE", "start-before-cancel-001");
    expect(started.statusCode).toBe(200);
    const blocked = await patchAppointmentStatus(app, reusedSlot.json().appointment.id, "CANCELLED", "cancel-in-service-001");
    expect([400, 422]).toContain(blocked.statusCode);
    expect(blocked.json().error).toMatch(/andamento|cancelado diretamente/i);
  });

  it("marca NO_SHOW somente apos 15 minutos e impede repeticao operacional", async () => {
    const app = createApp();
    await setUnit01WideWednesdayHours(app);
    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: appointmentPayload({ startsAt: "2026-04-22T12:30:00.000Z" }),
    });
    expect(created.statusCode).toBe(200);
    const appointmentId = created.json().appointment.id;
    const headers = await ownerHeaders(app);

    vi.setSystemTime(new Date("2026-04-22T12:44:00.000Z"));
    const early = await patchAppointmentStatus(app, appointmentId, "NO_SHOW", "noshow-early-001", {}, headers);
    expect([400, 422]).toContain(early.statusCode);
    expect(early.json().error).toBe("O cliente ainda esta dentro do periodo de tolerancia de 15 minutos.");

    vi.setSystemTime(new Date("2026-04-22T12:45:00.000Z"));
    const noShow = await patchAppointmentStatus(app, appointmentId, "NO_SHOW", "noshow-ok-001", {}, headers);
    expect(noShow.statusCode).toBe(200);
    expect(noShow.json().appointment.status).toBe("NO_SHOW");

    const repeated = await patchAppointmentStatus(app, appointmentId, "NO_SHOW", "noshow-repeat-001", {}, headers);
    expect([400, 422]).toContain(repeated.statusCode);
    expect(repeated.json().error).toMatch(/terminal|falta/i);
  });

  it("registra atraso sem alterar horario nem status e com replay idempotente", async () => {
    const app = createApp();
    await setUnit01WideWednesdayHours(app);
    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: appointmentPayload({ startsAt: "2026-04-22T12:30:00.000Z" }),
    });
    expect(created.statusCode).toBe(200);
    const before = created.json().appointment;
    const delayPayload = {
      minutesLate: 12,
      changedBy: "appointment-hardening-test",
      reason: "Cliente avisou atraso",
    };

    const first = await app.inject({
      method: "POST",
      url: `/appointments/${before.id}/delay`,
      headers: { "idempotency-key": "delay-001" },
      payload: delayPayload,
    });
    const replay = await app.inject({
      method: "POST",
      url: `/appointments/${before.id}/delay`,
      headers: { "idempotency-key": "delay-001" },
      payload: delayPayload,
    });
    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(first.json().appointment.status).toBe("SCHEDULED");
    expect(first.json().appointment.startsAt).toBe(before.startsAt);
    expect(first.json().appointment.endsAt).toBe(before.endsAt);
    expect(first.json().appointment.history.filter((item: { action: string }) => item.action === "DELAY_RECORDED")).toHaveLength(1);
    expect(replay.json().appointment.history.filter((item: { action: string }) => item.action === "DELAY_RECORDED")).toHaveLength(1);
    expect(first.json().appointment.history.at(-1).reason).toContain("12 minutos de atraso");
    expect(first.json().appointment.history.at(-1).changedBy).toBe("appointment-hardening-test");
  });

  it("bloqueia remarcacao e alteracao de servicos apos checkout", async () => {
    const app = createApp();
    await setUnit01WideWednesdayHours(app);
    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: appointmentPayload({ startsAt: "2026-04-22T16:30:00.000Z" }),
    });
    expect(created.statusCode).toBe(200);
    const appointmentId = created.json().appointment.id;
    expect((await patchAppointmentStatus(app, appointmentId, "CONFIRMED", "post-checkout-confirm")).statusCode).toBe(200);
    expect((await patchAppointmentStatus(app, appointmentId, "IN_SERVICE", "post-checkout-start")).statusCode).toBe(200);
    const checkout = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: { "idempotency-key": "post-checkout-001" },
      payload: {
        changedBy: "appointment-hardening-test",
        paymentMethod: "PIX",
      },
    });
    expect(checkout.statusCode).toBe(200);

    const reschedule = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/reschedule`,
      headers: { "idempotency-key": "post-checkout-reschedule" },
      payload: {
        startsAt: "2026-04-22T18:00:00.000Z",
        changedBy: "appointment-hardening-test",
      },
    });
    expect([400, 422]).toContain(reschedule.statusCode);

    const serviceChange = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}`,
      payload: {
        serviceId: "svc-barba",
        changedBy: "appointment-hardening-test",
      },
    });
    expect([400, 422]).toContain(serviceChange.statusCode);
  });
});
