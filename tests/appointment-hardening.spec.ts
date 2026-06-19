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
    expect(first.json().appointment.endsAt).toBe("2026-04-22T16:55:00.000Z");

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

  it("retorna erro claro para status invalido em listagem", async () => {
    const app = createApp();

    const response = await app.inject({
      method: "GET",
      url: "/appointments?unitId=unit-01&status=INVALIDO",
    });

    expect([400, 422]).toContain(response.statusCode);
    expect(response.json().error).toMatch(/status/i);
  });
});
