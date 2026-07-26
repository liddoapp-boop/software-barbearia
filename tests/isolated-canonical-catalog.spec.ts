import { afterEach, describe, expect, it } from "vitest";
import { OperationsService } from "../src/application/operations-service";
import { createApp } from "../src/http/app";
import { InMemoryStore } from "../src/infrastructure/in-memory-store";
import { LEGACY_MANUAL_CUT_SERVICE_ID } from "../src/infrastructure/canonical-demo-catalog";

const EXPECTED_PRODUCTS = [
  "Gel",
  "Pomada",
  "Bucha Nudread",
  "Oleo para Barba",
  "Shampoo",
  "Condicionador",
  "Mascara de Hidratacao",
];

const EXPECTED_SERVICES = [
  { id: "svc-corte", name: "Corte", price: 30, durationMin: 30, category: "CORTE" },
  { id: "svc-barba", name: "Barba", price: 20, durationMin: 30, category: "BARBA" },
  { id: "canon-svc-hidratacao", name: "Hidratação", price: 20, durationMin: 30, category: "TRATAMENTO" },
  { id: "canon-svc-luzes", name: "Luzes", price: 50, durationMin: 60, category: "TECNICO" },
  { id: "canon-svc-pigmentacao", name: "Pigmentação", price: 45, durationMin: 60, category: "TECNICO" },
  { id: "canon-svc-corte-barba", name: "Corte + Barba", price: 50, durationMin: 45, category: "COMBO" },
];

afterEach(() => {
  delete process.env.DATA_BACKEND;
  delete process.env.AUTH_ENFORCED;
});

describe("catalogo canonico do ambiente isolado", () => {
  it("expoe os seis servicos reais em catalogo, servicos e booking publico", async () => {
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "false";
    const app = createApp();

    const [catalog, services, publicServices] = await Promise.all([
      app.inject({ method: "GET", url: "/catalog?unitId=unit-01" }),
      app.inject({ method: "GET", url: "/services?unitId=unit-01" }),
      app.inject({ method: "GET", url: "/public/services?unitId=unit-01" }),
    ]);

    expect(catalog.statusCode).toBe(200);
    expect(services.statusCode).toBe(200);
    expect(publicServices.statusCode).toBe(200);

    const expectedNames = EXPECTED_SERVICES.map((item) => item.name);
    const activeServiceLists = [
      (catalog.json().services as Array<Record<string, unknown>>),
      (publicServices.json() as Array<Record<string, unknown>>),
    ];
    for (const list of activeServiceLists) {
      expect(list).toHaveLength(6);
      expect(list.map((item) => item.name)).toEqual(expect.arrayContaining(expectedNames));
      expect(list.map((item) => item.name)).not.toEqual(
        expect.arrayContaining(["Corte Premium", "Barba Terapia"]),
      );
    }
    const serviceAdminList = services.json().services as Array<Record<string, unknown>>;
    expect(serviceAdminList.filter((item) => (item.active ?? item.isActive) === true)).toHaveLength(6);
    expect(serviceAdminList).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Corte Manual 232A", isActive: false })]),
    );
    expect(catalog.json().services).toEqual(
      expect.arrayContaining(EXPECTED_SERVICES.map((item) => expect.objectContaining(item))),
    );
    expect(catalog.json().products).toHaveLength(7);
    expect(catalog.json().products.map((item: { name: string }) => item.name)).toEqual(
      expect.arrayContaining(EXPECTED_PRODUCTS),
    );
    expect(catalog.json().products.map((item: { name: string }) => item.name)).not.toContain("Pomada Matte");
  });

  it("mantem Agenda, filtro, checkout e booking publico funcionais com os IDs estaveis", async () => {
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "false";
    const app = createApp();

    const filtered = await app.inject({ method: "GET", url: "/services?unitId=unit-01&category=TECNICO" });
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json().services.map((item: { name: string }) => item.name)).toEqual(
      expect.arrayContaining(["Luzes", "Pigmentação"]),
    );

    const appointment = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: {
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceIds: ["svc-corte", "svc-barba"],
        startsAt: "2026-08-03T13:00:00.000Z",
        changedBy: "owner",
      },
    });
    expect(appointment.statusCode).toBe(200);
    expect(appointment.json().appointment).toMatchObject({
      professionalId: "pro-01",
      totalPriceSnapshot: 50,
      effectiveDurationMinSnapshot: 45,
      durationCalculationMode: "COMBINATION_RULE",
    });

    const appointmentId = appointment.json().appointment.id as string;
    for (const status of ["CONFIRMED", "IN_SERVICE"]) {
      const response = await app.inject({
        method: "PATCH",
        url: `/appointments/${appointmentId}/status`,
        headers: { "idempotency-key": `isolated-catalog-${status.toLowerCase()}` },
        payload: { status, changedBy: "owner" },
      });
      expect(response.statusCode).toBe(200);
    }
    const checkout = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/checkout`,
      headers: { "idempotency-key": "isolated-catalog-checkout" },
      payload: {
        unitId: "unit-01",
        changedBy: "owner",
        completedAt: "2026-08-03T13:45:00.000Z",
        paymentMethod: "PIX",
        expectedTotal: 50,
      },
    });
    expect(checkout.statusCode).toBe(200);
    expect(checkout.json().serviceRevenue.amount).toBe(50);

    const booking = await app.inject({
      method: "POST",
      url: "/public/booking?unitId=unit-01",
      payload: {
        unitId: "unit-01",
        clientName: "Cliente Catalogo Canonico",
        clientPhone: "11988887777",
        serviceId: "svc-barba",
        startsAt: "2026-08-03T14:00:00.000Z",
      },
    });
    expect(booking.statusCode).toBe(201);
    expect(booking.json()).toMatchObject({ professionalId: "pro-01" });
    expect(booking.json().id).toBeTruthy();
  });

  it("mantem Corte Manual 232A inativo para novos fluxos e resolvivel no historico", () => {
    const store = new InMemoryStore();
    const operations = new OperationsService(store);

    expect(operations.getCatalog({ unitId: "unit-01" }).services.map((service) => service.name)).not.toContain(
      "Corte Manual 232A",
    );
    expect(() =>
      operations.schedule({
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: LEGACY_MANUAL_CUT_SERVICE_ID,
        startsAt: new Date("2026-08-03T13:00:00.000Z"),
        changedBy: "owner",
      }),
    ).toThrow(/inativo|disponivel/i);

    store.appointments.push({
      id: "apt-legacy-corte-manual-232a",
      unitId: "unit-01",
      clientId: "cli-01",
      professionalId: "pro-01",
      serviceId: LEGACY_MANUAL_CUT_SERVICE_ID,
      startsAt: new Date("2026-07-06T13:00:00.000Z"),
      endsAt: new Date("2026-07-06T13:30:00.000Z"),
      status: "COMPLETED",
      isFitting: false,
      history: [{ changedAt: new Date("2026-07-06T13:30:00.000Z"), changedBy: "legacy", action: "COMPLETED" }],
    });
    expect(
      operations.getAppointmentById({ appointmentId: "apt-legacy-corte-manual-232a", unitId: "unit-01" }),
    ).toMatchObject({ service: "Corte Manual 232A", servicePrice: 60, serviceDurationMin: 30 });
  });
});
