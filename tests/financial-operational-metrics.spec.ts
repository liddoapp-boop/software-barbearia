import { describe, expect, it } from "vitest";
import { OperationsService } from "../src/application/operations-service";
import { InMemoryStore } from "../src/infrastructure/in-memory-store";

describe("métricas operacionais do Financeiro", () => {
  it("reconcilia fórmulas, ticket pago e origens em centavos", () => {
    const store = new InMemoryStore();
    const operations = new OperationsService(store);

    store.financialEntries.push(
      {
        id: "entry-service-only",
        unitId: "unit-01",
        kind: "INCOME",
        source: "SERVICE",
        category: "SERVICO",
        paymentMethod: "PIX",
        amount: 100.11,
        occurredAt: new Date("2026-07-10T12:00:00.000Z"),
        referenceType: "APPOINTMENT",
        referenceId: "appointment-service-only",
        description: "Checkout somente serviço",
      },
      {
        id: "entry-service-product",
        unitId: "unit-01",
        kind: "INCOME",
        source: "SERVICE",
        category: "SERVICO",
        paymentMethod: "CARD",
        amount: 150.22,
        occurredAt: new Date("2026-07-11T12:00:00.000Z"),
        referenceType: "APPOINTMENT",
        referenceId: "appointment-service-product",
        description: "Checkout com serviço e produto",
      },
      {
        id: "entry-standalone-product",
        unitId: "unit-01",
        kind: "INCOME",
        source: "PRODUCT",
        category: "PRODUTO",
        paymentMethod: "CASH",
        amount: 75.33,
        occurredAt: new Date("2026-07-12T12:00:00.000Z"),
        referenceType: "PRODUCT_SALE",
        referenceId: "sale-standalone",
        description: "Venda avulsa de produto",
      },
      {
        id: "entry-manual",
        unitId: "unit-01",
        kind: "INCOME",
        category: "AJUSTE",
        paymentMethod: "PIX",
        amount: 25.44,
        occurredAt: new Date("2026-07-13T12:00:00.000Z"),
        referenceType: "MANUAL",
        description: "Receita manual",
      },
      {
        id: "expense-manual",
        unitId: "unit-01",
        kind: "EXPENSE",
        category: "OPERACAO",
        amount: 40.55,
        occurredAt: new Date("2026-07-14T12:00:00.000Z"),
        referenceType: "MANUAL",
        description: "Despesa manual",
      },
      {
        id: "entry-previous",
        unitId: "unit-01",
        kind: "INCOME",
        source: "SERVICE",
        category: "SERVICO",
        paymentMethod: "CASH",
        amount: 100,
        occurredAt: new Date("2026-06-10T12:00:00.000Z"),
        referenceType: "APPOINTMENT",
        referenceId: "appointment-previous",
        description: "Checkout anterior",
      },
    );
    store.appointmentCheckouts.push(
      {
        id: "checkout-service-only",
        unitId: "unit-01",
        appointmentId: "appointment-service-only",
        status: "PAID",
        totalAmount: 100.11,
        serviceAmount: 100.11,
        productAmount: 0,
        paidAmount: 100.1,
        changeAmount: 0,
        openedAt: new Date("2026-07-10T12:00:00.000Z"),
        paidAt: new Date("2026-07-10T12:00:00.000Z"),
        changedBy: "owner",
      },
      {
        id: "checkout-service-product",
        unitId: "unit-01",
        appointmentId: "appointment-service-product",
        status: "PAID",
        totalAmount: 150.22,
        serviceAmount: 100.11,
        productAmount: 50.11,
        paidAmount: 150.22,
        changeAmount: 0,
        openedAt: new Date("2026-07-11T12:00:00.000Z"),
        paidAt: new Date("2026-07-11T12:00:00.000Z"),
        changedBy: "owner",
      },
      {
        id: "checkout-previous",
        unitId: "unit-01",
        appointmentId: "appointment-previous",
        status: "PAID",
        totalAmount: 100,
        serviceAmount: 100,
        productAmount: 0,
        paidAmount: 100,
        changeAmount: 0,
        openedAt: new Date("2026-06-10T12:00:00.000Z"),
        paidAt: new Date("2026-06-10T12:00:00.000Z"),
        changedBy: "owner",
      },
      {
        id: "checkout-open",
        unitId: "unit-01",
        appointmentId: "appointment-completed-without-payment",
        status: "OPEN",
        totalAmount: 900,
        serviceAmount: 900,
        productAmount: 0,
        paidAmount: 0,
        changeAmount: 0,
        openedAt: new Date("2026-07-15T12:00:00.000Z"),
        changedBy: "owner",
      },
      {
        id: "checkout-cancelled",
        unitId: "unit-01",
        appointmentId: "appointment-cancelled",
        status: "CANCELLED",
        totalAmount: 800,
        serviceAmount: 800,
        productAmount: 0,
        paidAmount: 0,
        changeAmount: 0,
        openedAt: new Date("2026-07-16T12:00:00.000Z"),
        changedBy: "owner",
      },
    );

    const result = operations.getFinancialSummary({
      unitId: "unit-01",
      start: new Date("2026-07-01T00:00:00.000Z"),
      end: new Date("2026-07-31T23:59:59.999Z"),
      compareStart: new Date("2026-06-01T00:00:00.000Z"),
      compareEnd: new Date("2026-06-30T23:59:59.999Z"),
    });

    expect(result.summary).toMatchObject({
      grossRevenue: 351.1,
      expenses: 40.55,
      netBalance: 310.55,
      ticketAverage: 125.16,
      paidCheckoutsCount: 2,
      movementsCount: 5,
    });
    expect(result.revenueOrigins).toEqual({
      services: 200.22,
      products: 125.44,
      manual: 25.44,
      other: 0,
    });
    expect(Object.values(result.revenueOrigins).every((value) => value >= 0)).toBe(true);
    expect(
      Object.values(result.revenueOrigins).reduce(
        (sum, value) => sum + Math.round(value * 100),
        0,
      ),
    ).toBe(Math.round(result.summary.grossRevenue * 100));
    expect(result.comparison).toMatchObject({
      grossRevenueDelta: 251.1,
      expensesDelta: 40.55,
      netBalanceDelta: 210.55,
      ticketAverageDelta: 25.16,
      movementsDelta: 4,
    });
  });

  it("mantém ticket zerado e sinaliza fallback quando não há checkout pago", () => {
    const store = new InMemoryStore();
    const operations = new OperationsService(store);
    store.financialEntries.push({
      id: "manual-only",
      unitId: "unit-01",
      kind: "INCOME",
      category: "AJUSTE",
      amount: 10,
      occurredAt: new Date("2026-07-20T12:00:00.000Z"),
      referenceType: "MANUAL",
      description: "Receita manual",
    });

    const result = operations.getFinancialSummary({
      unitId: "unit-01",
      start: new Date("2026-07-01T00:00:00.000Z"),
      end: new Date("2026-07-31T23:59:59.999Z"),
    });

    expect(result.summary).toMatchObject({
      ticketAverage: 0,
      paidCheckoutsCount: 0,
      movementsCount: 1,
    });
  });
});
