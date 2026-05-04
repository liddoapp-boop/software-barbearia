import { describe, expect, it } from "vitest";
import { BarbershopEngine } from "../src/application/barbershop-engine";
import { Appointment, Product, ProductSale, Professional, Service } from "../src/domain/types";

function makeService(): Service {
  return {
    id: "svc-1",
    businessId: "unit-01",
    name: "Corte",
    category: "CORTE",
    price: 70,
    durationMin: 40,
    defaultCommissionRate: 0.5,
    costEstimate: 10,
    active: true,
    createdAt: new Date("2026-04-22T00:00:00.000Z"),
    updatedAt: new Date("2026-04-22T00:00:00.000Z"),
  };
}

function makeProfessional(): Professional {
  return {
    id: "pro-1",
    name: "Leo",
    active: true,
    commissionRules: [
      {
        id: "rule-service",
        appliesTo: "SERVICE",
        percentage: 0.5,
      },
      {
        id: "rule-product",
        appliesTo: "PRODUCT",
        percentage: 0.1,
      },
    ],
  };
}

describe("BarbershopEngine", () => {
  it("evita conflito de agenda por profissional", () => {
    const engine = new BarbershopEngine();
    const service = makeService();
    const now = new Date("2026-04-22T10:00:00");

    const existing: Appointment[] = [
      {
        id: "appt-1",
        unitId: "u1",
        clientId: "c1",
        professionalId: "pro-1",
        serviceId: service.id,
        startsAt: new Date("2026-04-22T10:00:00"),
        endsAt: new Date("2026-04-22T10:40:00"),
        status: "SCHEDULED",
        isFitting: false,
        history: [
          {
            action: "CREATED",
            changedAt: now,
            changedBy: "owner",
          },
        ],
      },
    ];

    expect(() =>
      engine.scheduleAppointment(
        {
          unitId: "u1",
          clientId: "c2",
          professionalId: "pro-1",
          service,
          startsAt: new Date("2026-04-22T10:20:00"),
          changedBy: "owner",
        },
        existing,
      ),
    ).toThrow(/Conflito/);
  });

  it("permite mesmo horario para profissional diferente", () => {
    const engine = new BarbershopEngine();
    const service = makeService();
    const now = new Date("2026-04-22T10:00:00");

    const existing: Appointment[] = [
      {
        id: "appt-1",
        unitId: "u1",
        clientId: "c1",
        professionalId: "pro-1",
        serviceId: service.id,
        startsAt: new Date("2026-04-22T10:00:00"),
        endsAt: new Date("2026-04-22T10:40:00"),
        status: "SCHEDULED",
        isFitting: false,
        history: [{ action: "CREATED", changedAt: now, changedBy: "owner" }],
      },
    ];

    expect(() =>
      engine.scheduleAppointment(
        {
          unitId: "u1",
          clientId: "c2",
          professionalId: "pro-2",
          service,
          startsAt: new Date("2026-04-22T10:20:00"),
          changedBy: "owner",
        },
        existing,
      ),
    ).not.toThrow();
  });

  it("concluir atendimento gera receita e comissao", () => {
    const engine = new BarbershopEngine();
    const service = makeService();
    const professional = makeProfessional();

    const scheduled = engine.scheduleAppointment(
      {
        unitId: "u1",
        clientId: "c1",
        professionalId: professional.id,
        service,
        startsAt: new Date("2026-04-22T11:00:00"),
        changedBy: "owner",
      },
      [],
    );

    const confirmed = engine.changeAppointmentStatus(
      scheduled,
      "CONFIRMED",
      "owner",
    );
    const inService = engine.changeAppointmentStatus(
      confirmed,
      "IN_SERVICE",
      "owner",
    );

    const completed = engine.completeAppointment({
      appointment: inService,
      service,
      professional,
      monthlyProducedValue: 0,
      changedBy: "owner",
      completedAt: new Date("2026-04-22T12:00:00"),
    });

    expect(completed.appointment.status).toBe("COMPLETED");
    expect(completed.revenue.amount).toBe(70);
    expect(completed.commission?.commissionAmount).toBe(35);
  });

  it("venda de produto reduz estoque e gera receita/comissao", () => {
    const engine = new BarbershopEngine();
    const professional = makeProfessional();
    const products: Product[] = [
      {
        id: "p1",
        name: "Pomada",
        category: "Finalizacao",
        salePrice: 50,
        costPrice: 20,
        stockQty: 3,
        minStockAlert: 1,
        active: true,
      },
    ];

    const sale: ProductSale = {
      id: "s1",
      unitId: "u1",
      items: [
        {
          productId: "p1",
          quantity: 2,
          unitPrice: 50,
          unitCost: 20,
        },
      ],
      grossAmount: 0,
      soldAt: new Date("2026-04-22T12:10:00"),
    };

    const result = engine.registerProductSale({ sale, products, professional });

    expect(result.sale.grossAmount).toBe(100);
    expect(result.revenue.amount).toBe(100);
    expect(result.commission?.commissionAmount).toBe(10);
    expect(result.stockMovements).toHaveLength(1);
    expect(result.stockMovements[0].quantity).toBe(2);
  });
});
