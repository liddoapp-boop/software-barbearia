import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildStockAlertMessage,
  classifyStockSituation,
  evaluateStockTransition,
} from "../src/application/stock-alerts.js";
import {
  MemoryStockAlertStore,
  StockAlertDispatcher,
  recordMemoryStockTransition,
} from "../src/application/stock-alert-outbox.js";
import { InMemoryStore } from "../src/infrastructure/in-memory-store.js";
import { createApp } from "../src/http/app.js";
import { OperationsService } from "../src/application/operations-service.js";

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("Etapa 2 - contrato deterministico de alertas de estoque", () => {
  describe("classificacao", () => {
    it.each([
      { quantity: 6, minimum: 5, expected: "IN_STOCK" },
      { quantity: 5, minimum: 5, expected: "LOW_STOCK" },
      { quantity: 1, minimum: 5, expected: "LOW_STOCK" },
      { quantity: 0, minimum: 5, expected: "OUT_OF_STOCK" },
      { quantity: 1, minimum: 0, expected: "IN_STOCK" },
      { quantity: 0, minimum: 0, expected: "OUT_OF_STOCK" },
      { quantity: -1, minimum: 5, expected: "OUT_OF_STOCK" },
    ])("classifica quantidade $quantity com minimo $minimum", ({ quantity, minimum, expected }) => {
      expect(classifyStockSituation(quantity, minimum)).toBe(expected);
    });
  });

  describe("transicoes e ciclo", () => {
    it.each([
      { from: 6, to: 5, active: false, alert: "LOW_STOCK", starts: true, resets: false },
      { from: 5, to: 4, active: true, alert: null, starts: false, resets: false },
      { from: 1, to: 0, active: true, alert: "OUT_OF_STOCK", starts: false, resets: false },
      { from: 0, to: 0, active: true, alert: null, starts: false, resets: false },
      { from: 5, to: 6, active: true, alert: null, starts: false, resets: true },
      { from: 0, to: 6, active: true, alert: null, starts: false, resets: true },
      { from: 0, to: 3, active: true, alert: null, starts: false, resets: false },
      { from: 6, to: 0, active: false, alert: "OUT_OF_STOCK", starts: true, resets: false },
    ])("avalia $from -> $to", ({ from, to, active, alert, starts, resets }) => {
      expect(evaluateStockTransition({
        previousQuantity: from,
        currentQuantity: to,
        minimumStock: 5,
        cycleActive: active,
      })).toMatchObject({
        alertType: alert,
        startsCycle: starts,
        resetsCycle: resets,
      });
    });

    it("libera nova queda depois da recuperacao", () => {
      const recovery = evaluateStockTransition({
        previousQuantity: 0,
        currentQuantity: 6,
        minimumStock: 5,
        cycleActive: true,
      });
      expect(recovery.resetsCycle).toBe(true);

      const nextDrop = evaluateStockTransition({
        previousQuantity: 6,
        currentQuantity: 5,
        minimumStock: 5,
        cycleActive: false,
      });
      expect(nextDrop).toMatchObject({ alertType: "LOW_STOCK", startsCycle: true });
    });
  });

  describe("templates", () => {
    it("gera alerta baixo sem IA", () => {
      expect(buildStockAlertMessage({
        type: "LOW_STOCK",
        productName: "Pomada",
        quantity: 2,
        minimumStock: 2,
      })).toBe([
        "⚠️ Estoque baixo",
        "",
        "Produto: Pomada",
        "Estoque atual: 2",
        "Estoque mínimo: 2",
        "",
        "Considere realizar uma nova compra.",
      ].join("\n"));
    });

    it("gera alerta zerado sem IA", () => {
      expect(buildStockAlertMessage({
        type: "OUT_OF_STOCK",
        productName: "Pomada",
        quantity: 0,
        minimumStock: 2,
      })).toBe([
        "🚨 Produto sem estoque",
        "",
        "Produto: Pomada",
        "Estoque atual: 0 unidades",
        "Estoque mínimo: 2",
      ].join("\n"));
    });
  });
});

describe("Etapa 2 - ciclo, deduplicacao e entrega", () => {
  function setup() {
    const memory = new InMemoryStore();
    const product = memory.products.find((item) => item.id === "prd-pomada")!;
    product.stockQty = 6;
    product.minStockAlert = 5;
    const store = new MemoryStockAlertStore(memory);
    return { memory, product, store };
  }

  it("mantem exatamente um alerta por tipo dentro do ciclo e libera outro depois do reset", () => {
    const { memory, product } = setup();
    product.stockQty = 5;
    const first = recordMemoryStockTransition(memory, {
      unitId: "unit-01",
      product,
      previousQuantity: 6,
    });
    expect(first?.alertType).toBe("LOW_STOCK");

    product.stockQty = 4;
    expect(recordMemoryStockTransition(memory, {
      unitId: "unit-01", product, previousQuantity: 5,
    })).toBeNull();

    product.stockQty = 0;
    const out = recordMemoryStockTransition(memory, {
      unitId: "unit-01", product, previousQuantity: 4,
    });
    expect(out?.alertType).toBe("OUT_OF_STOCK");
    expect(memory.stockAlerts).toHaveLength(2);

    expect(recordMemoryStockTransition(memory, {
      unitId: "unit-01", product, previousQuantity: 0,
    })).toBeNull();
    expect(memory.stockAlerts).toHaveLength(2);

    product.stockQty = 6;
    expect(recordMemoryStockTransition(memory, {
      unitId: "unit-01", product, previousQuantity: 0,
    })).toBeNull();
    product.stockQty = 5;
    const nextCycle = recordMemoryStockTransition(memory, {
      unitId: "unit-01", product, previousQuantity: 6,
    });
    expect(nextCycle).toMatchObject({ alertType: "LOW_STOCK", cycle: 2 });
    expect(memory.stockAlerts).toHaveLength(3);
  });

  it("duas instancias disputando o alerta fazem um unico envio", async () => {
    const { memory, product, store } = setup();
    product.stockQty = 5;
    recordMemoryStockTransition(memory, { unitId: "unit-01", product, previousQuantity: 6 });
    const deliveries: Array<{ phone: string; text: string }> = [];
    const options = {
      store,
      send: async (phone: string, text: string) => { deliveries.push({ phone, text }); },
      resolveOwnerPhone: () => "5511999999999",
    };
    const first = new StockAlertDispatcher(options);
    const second = new StockAlertDispatcher(options);

    await Promise.all([first.dispatchDue(), second.dispatchDue()]);

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ phone: "5511999999999" });
    expect(memory.stockAlerts[0]).toMatchObject({ status: "SENT", attempts: 1 });
  });

  it("falha nao remove a intencao e retry reutiliza o mesmo registro", async () => {
    const { memory, product, store } = setup();
    product.stockQty = 5;
    const alert = recordMemoryStockTransition(memory, {
      unitId: "unit-01", product, previousQuantity: 6,
    })!;
    let now = new Date("2026-07-16T15:00:00.000Z");
    let shouldFail = true;
    const dispatcher = new StockAlertDispatcher({
      store,
      now: () => now,
      baseBackoffMs: 1_000,
      send: async () => {
        if (shouldFail) throw Object.assign(new Error("segredo externo que nao pode ir ao log"), { reason: "timeout" });
      },
      resolveOwnerPhone: () => "5511999999999",
    });

    await dispatcher.dispatchDue();
    expect(memory.stockAlerts).toHaveLength(1);
    expect(memory.stockAlerts[0]).toMatchObject({ id: alert.id, status: "FAILED", attempts: 1, lastErrorCode: "timeout" });
    expect(JSON.stringify(memory.auditEvents)).not.toContain("segredo externo");

    shouldFail = false;
    now = new Date(now.getTime() + 1_000);
    await dispatcher.dispatchDue();
    await dispatcher.dispatchDue();
    expect(memory.stockAlerts).toHaveLength(1);
    expect(memory.stockAlerts[0]).toMatchObject({ id: alert.id, status: "SENT", attempts: 2 });
    expect(memory.auditEvents.some((event) => event.action === "STOCK_ALERT_RETRY_SUCCEEDED")).toBe(true);
  });

  it("respeita limite de tentativas e nao cria loop", async () => {
    const { memory, product, store } = setup();
    product.stockQty = 5;
    const alert = recordMemoryStockTransition(memory, {
      unitId: "unit-01", product, previousQuantity: 6, maxAttempts: 2,
    })!;
    let now = new Date("2026-07-16T15:00:00.000Z");
    let calls = 0;
    const dispatcher = new StockAlertDispatcher({
      store,
      now: () => now,
      baseBackoffMs: 1,
      send: async () => { calls += 1; throw Object.assign(new Error("offline"), { reason: "network" }); },
      resolveOwnerPhone: () => "5511999999999",
    });
    await dispatcher.dispatchDue();
    now = new Date(now.getTime() + 1);
    await dispatcher.dispatchDue();
    now = new Date(now.getTime() + 60_000);
    await dispatcher.dispatchDue();
    expect(calls).toBe(2);
    expect(memory.stockAlerts[0]).toMatchObject({ id: alert.id, status: "FAILED", attempts: 2 });
    expect(memory.stockAlerts[0].nextAttemptAt).toBeUndefined();
  });
});

describe("Etapa 2 - integracao HTTP pos-commit", () => {
  function configure() {
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "false";
    process.env.HTTP_LOG_ENABLED = "false";
    process.env.AI_WHATSAPP_UNIT_ID = "unit-01";
    process.env.AI_WHATSAPP_OWNER_PHONE = "5511999999999";
    const memoryStore = new InMemoryStore();
    const product = memoryStore.products.find((item) => item.id === "prd-pomada")!;
    product.stockQty = 6;
    product.minStockAlert = 5;
    return { memoryStore, product };
  }

  it("envia uma vez por transicao e reinicia o ciclo sem mensagem de recuperacao", async () => {
    const { memoryStore, product } = configure();
    const sent: string[] = [];
    const app = createApp({ memoryStore, stockAlertSend: async (_phone, text) => { sent.push(text); } });

    const adjust = async (type: "IN" | "OUT", quantity: number) => await app.inject({
      method: "PATCH",
      url: "/inventory/prd-pomada/stock",
      payload: { unitId: "unit-01", type, quantity, reason: "Teste Etapa 2", changedBy: "owner" },
    });

    expect((await adjust("OUT", 1)).statusCode).toBe(200);
    expect(product.stockQty).toBe(5);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("⚠️ Estoque baixo");

    expect((await adjust("OUT", 1)).statusCode).toBe(200);
    expect(sent).toHaveLength(1);
    expect((await adjust("OUT", 4)).statusCode).toBe(200);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toContain("🚨 Produto sem estoque");

    expect((await adjust("IN", 3)).statusCode).toBe(200);
    expect(sent).toHaveLength(2);
    expect((await adjust("IN", 3)).statusCode).toBe(200);
    expect(sent).toHaveLength(2);
    expect((await adjust("OUT", 1)).statusCode).toBe(200);
    expect(sent).toHaveLength(3);
    expect(memoryStore.stockAlerts).toHaveLength(3);
    expect(memoryStore.auditEvents.some((event) => event.action === "STOCK_ALERT_CYCLE_RESET")).toBe(true);
    await app.close();
  });

  it("falha da Evolution preserva movimento e retry envia o mesmo alerta", async () => {
    const { memoryStore, product } = configure();
    let now = new Date("2026-07-16T15:00:00.000Z");
    let fail = true;
    let sends = 0;
    const app = createApp({
      memoryStore,
      stockAlertNow: () => now,
      stockAlertSend: async () => {
        sends += 1;
        if (fail) throw Object.assign(new Error("payload externo secreto"), { reason: "timeout" });
      },
    });

    const operation = await app.inject({
      method: "PATCH",
      url: "/inventory/prd-pomada/stock",
      payload: { unitId: "unit-01", type: "OUT", quantity: 1, reason: "Venda confirmada", changedBy: "owner" },
    });
    expect(operation.statusCode).toBe(200);
    expect(product.stockQty).toBe(5);
    expect(memoryStore.stockAlerts).toHaveLength(1);
    const alertId = memoryStore.stockAlerts[0].id;
    expect(memoryStore.stockAlerts[0]).toMatchObject({ status: "FAILED", attempts: 1 });

    fail = false;
    now = new Date(now.getTime() + 30_000);
    await app.inject({ method: "GET", url: "/health" });
    expect(sends).toBe(2);
    expect(memoryStore.stockAlerts).toHaveLength(1);
    expect(memoryStore.stockAlerts[0]).toMatchObject({ id: alertId, status: "SENT", attempts: 2 });
    expect(JSON.stringify(memoryStore.auditEvents)).not.toContain("payload externo secreto");
    await app.close();
  });
});

describe("Etapa 2 - fontes de movimentacao em memoria", () => {
  function serviceWithStock(quantity = 6, minimumStock = 5) {
    const store = new InMemoryStore();
    const product = store.products.find((item) => item.id === "prd-pomada")!;
    product.stockQty = quantity;
    product.minStockAlert = minimumStock;
    return { store, product, operations: new OperationsService(store) };
  }

  it("observa venda PDV, inventario contado e movimento manual", () => {
    const sale = serviceWithStock();
    sale.operations.registerProductSale({
      unitId: "unit-01",
      soldAt: new Date(),
      items: [{ productId: sale.product.id, quantity: 1 }],
    });
    expect(sale.store.stockAlerts).toHaveLength(1);

    const count = serviceWithStock();
    count.operations.recordInventoryCount({
      unitId: "unit-01",
      productId: count.product.id,
      countedQty: 5,
      reason: "Contagem fisica",
      responsible: "owner",
    });
    expect(count.store.stockAlerts).toHaveLength(1);

    const manual = serviceWithStock();
    manual.operations.registerStockManualMovement({
      unitId: "unit-01",
      productId: manual.product.id,
      movementType: "OUT",
      quantity: 1,
      occurredAt: new Date(),
    });
    expect(manual.store.stockAlerts).toHaveLength(1);
  });

  it("avalia uma vez o checkout combinado com produto e consumo por servico", () => {
    const { store, product, operations } = serviceWithStock(7, 5);
    const settings = store.businessSettings.find((item) => item.unitId === "unit-01");
    if (settings) settings.bufferBetweenAppointmentsMinutes = 0;
    const appointment = operations.schedule({
      unitId: "unit-01",
      clientId: "cli-01",
      professionalId: "pro-01",
      serviceId: "svc-corte",
      startsAt: new Date("2026-07-20T12:00:00.000Z"),
      changedBy: "owner",
    });
    operations.updateStatus({ appointmentId: appointment.id, unitId: "unit-01", status: "CONFIRMED", changedBy: "owner" });
    operations.updateStatus({ appointmentId: appointment.id, unitId: "unit-01", status: "IN_SERVICE", changedBy: "owner" });
    operations.checkoutAppointment({
      appointmentId: appointment.id,
      unitId: "unit-01",
      changedBy: "owner",
      completedAt: new Date("2026-07-20T12:45:00.000Z"),
      paymentMethod: "PIX",
      products: [{ productId: product.id, quantity: 1 }],
    });
    expect(product.stockQty).toBe(5);
    expect(store.stockAlerts).toHaveLength(1);
    expect(store.stockAlerts[0]).toMatchObject({ alertType: "LOW_STOCK", quantity: 5 });
  });

  it("devolucao recupera e reinicia o ciclo sem mensagem", () => {
    const { store, product, operations } = serviceWithStock();
    const sale = operations.registerProductSale({
      unitId: "unit-01",
      soldAt: new Date("2026-07-16T10:00:00.000Z"),
      items: [{ productId: product.id, quantity: 1 }],
    });
    operations.refundProductSale({
      unitId: "unit-01",
      productSaleId: sale.sale.id,
      changedBy: "owner",
      reason: "Devolucao",
      refundedAt: new Date("2026-07-16T11:00:00.000Z"),
      items: [{ productId: product.id, quantity: 1 }],
    });
    expect(product.stockQty).toBe(6);
    expect(store.stockAlerts).toHaveLength(1);
    expect(store.auditEvents.some((event) => event.action === "STOCK_ALERT_CYCLE_RESET")).toBe(true);
  });
});
