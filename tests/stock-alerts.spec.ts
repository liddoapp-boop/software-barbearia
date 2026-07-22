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
import type { WhatsappDeliveryAttemptContext } from "../src/notifications/index.js";

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
      unitId: "unit-01",
      store,
      send: async (phone: string, text: string, attempt?: WhatsappDeliveryAttemptContext) => {
        await attempt?.onProviderCallStarted();
        deliveries.push({ phone, text });
      },
      resolveOwnerPhone: () => "5511999999999",
    };
    const first = new StockAlertDispatcher(options);
    const second = new StockAlertDispatcher(options);

    await Promise.all([first.dispatchDue(), second.dispatchDue()]);

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ phone: "5511999999999" });
    expect(memory.stockAlerts[0]).toMatchObject({ status: "SENT", attempts: 1 });
    expect(memory.stockAlerts[0].deliveryAttemptId).toBeTruthy();
    expect(memory.stockAlerts[0].providerCallStartedAt).toBeInstanceOf(Date);
  });

  it("rejeicao HTTP explicita preserva a intencao e permite retry seguro", async () => {
    const { memory, product, store } = setup();
    product.stockQty = 5;
    const alert = recordMemoryStockTransition(memory, {
      unitId: "unit-01", product, previousQuantity: 6,
    })!;
    let now = new Date("2026-07-16T15:00:00.000Z");
    let shouldFail = true;
    const dispatcher = new StockAlertDispatcher({
      unitId: "unit-01",
      store,
      now: () => now,
      baseBackoffMs: 1_000,
      send: async (_phone, _text, attempt) => {
        await attempt?.onProviderCallStarted();
        if (shouldFail) throw Object.assign(new Error("segredo externo que nao pode ir ao log"), { reason: "http" });
      },
      resolveOwnerPhone: () => "5511999999999",
    });

    await dispatcher.dispatchDue();
    expect(memory.stockAlerts).toHaveLength(1);
    expect(memory.stockAlerts[0]).toMatchObject({ id: alert.id, status: "FAILED", attempts: 1, lastErrorCode: "http" });
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
      unitId: "unit-01",
      store,
      now: () => now,
      baseBackoffMs: 1,
      send: async () => { calls += 1; throw Object.assign(new Error("config local"), { reason: "configuration" }); },
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

  it("timeout depois do inicio vira incerto e ciclos posteriores nao reenviam", async () => {
    const { memory, product, store } = setup();
    product.stockQty = 5;
    recordMemoryStockTransition(memory, { unitId: "unit-01", product, previousQuantity: 6 });
    let calls = 0;
    const dispatcher = new StockAlertDispatcher({
      unitId: "unit-01",
      store,
      send: async (_phone, _text, attempt) => {
        calls += 1;
        await attempt?.onProviderCallStarted();
        throw Object.assign(new Error("socket encerrado depois do POST"), { reason: "network" });
      },
      resolveOwnerPhone: () => "5511999999999",
    });

    await expect(dispatcher.dispatchDue()).resolves.toMatchObject({
      processed: 1,
      sent: 0,
      failed: 0,
      uncertain: 1,
    });
    await dispatcher.dispatchDue();
    await dispatcher.dispatchDue();

    expect(calls).toBe(1);
    expect(memory.stockAlerts[0]).toMatchObject({ status: "UNCERTAIN", attempts: 1, lastErrorCode: "network" });
    expect(memory.stockAlerts[0].nextAttemptAt).toBeUndefined();
  });

  it("claim antigo sem chamada iniciada e recuperado com seguranca", async () => {
    const { memory, product, store } = setup();
    product.stockQty = 5;
    recordMemoryStockTransition(memory, { unitId: "unit-01", product, previousQuantity: 6 });
    let now = new Date("2026-07-16T15:00:00.000Z");
    const abandoned = await store.claimNext("unit-01", now);
    expect(abandoned).toMatchObject({ status: "SENDING", attempts: 1 });
    expect(abandoned?.providerCallStartedAt).toBeUndefined();

    now = new Date(now.getTime() + 6 * 60_000);
    let calls = 0;
    const dispatcher = new StockAlertDispatcher({
      unitId: "unit-01",
      store,
      now: () => now,
      send: async (_phone, _text, attempt) => {
        calls += 1;
        await attempt?.onProviderCallStarted();
      },
      resolveOwnerPhone: () => "5511999999999",
    });
    await expect(dispatcher.dispatchDue()).resolves.toMatchObject({ recovered: 1, sent: 1, uncertain: 0 });
    expect(calls).toBe(1);
    expect(memory.stockAlerts[0]).toMatchObject({ status: "SENT", attempts: 1 });
    expect(memory.stockAlerts[0].deliveryAttemptId).not.toBe(abandoned?.deliveryAttemptId);
  });

  it("claim antigo com chamada iniciada vira incerto sem nova chamada", async () => {
    const { memory, product, store } = setup();
    product.stockQty = 5;
    recordMemoryStockTransition(memory, { unitId: "unit-01", product, previousQuantity: 6 });
    let now = new Date("2026-07-16T15:00:00.000Z");
    const abandoned = (await store.claimNext("unit-01", now))!;
    await store.markProviderCallStarted("unit-01", abandoned, now);

    now = new Date(now.getTime() + 6 * 60_000);
    const send = vi.fn();
    const dispatcher = new StockAlertDispatcher({
      unitId: "unit-01",
      store,
      now: () => now,
      send,
      resolveOwnerPhone: () => "5511999999999",
    });
    await expect(dispatcher.dispatchDue()).resolves.toMatchObject({ processed: 0, uncertain: 1, recovered: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(memory.stockAlerts[0]).toMatchObject({ status: "UNCERTAIN", lastErrorCode: "stale_provider_call" });
  });

  it("bloqueio local permanece falha confirmada e nao marca inicio do provider", async () => {
    const { memory, product, store } = setup();
    product.stockQty = 5;
    recordMemoryStockTransition(memory, { unitId: "unit-01", product, previousQuantity: 6 });
    const dispatcher = new StockAlertDispatcher({
      unitId: "unit-01",
      store,
      send: async () => {
        throw Object.assign(new Error("bloqueado localmente"), { reason: "isolated_outbound_not_allowlisted" });
      },
      resolveOwnerPhone: () => "5511999999999",
    });
    await expect(dispatcher.dispatchDue()).resolves.toMatchObject({ sent: 0, failed: 1, uncertain: 0 });
    expect(memory.stockAlerts[0]).toMatchObject({
      status: "FAILED",
      lastErrorCode: "isolated_outbound_not_allowlisted",
    });
    expect(memory.stockAlerts[0].providerCallStartedAt).toBeUndefined();
  });
});

describe("Etapa 2 - isolamento da outbox por unidade", () => {
  function setupTwoUnits() {
    const memory = new InMemoryStore();
    const template = memory.products.find((item) => item.id === "prd-pomada")!;
    const productA = { ...template, id: "prd-unit-a", name: "Pomada A", stockQty: 5, minStockAlert: 5 };
    const productB = { ...template, id: "prd-unit-b", name: "Pomada B", stockQty: 5, minStockAlert: 5 };
    recordMemoryStockTransition(memory, { unitId: "unit-a", product: productA, previousQuantity: 6 });
    recordMemoryStockTransition(memory, { unitId: "unit-b", product: productB, previousQuantity: 6 });
    return { memory, store: new MemoryStockAlertStore(memory) };
  }

  function dispatcher(input: {
    unitId: string;
    store: MemoryStockAlertStore;
    send: (phone: string, text: string, attempt?: WhatsappDeliveryAttemptContext) => Promise<void>;
    now?: () => Date;
    resolveOwnerPhone?: (unitId: string) => string | undefined;
  }) {
    return new StockAlertDispatcher({
      ...input,
      resolveOwnerPhone: input.resolveOwnerPhone ?? (() => "5511999999999"),
    });
  }

  it("dispatchers A e B processam apenas sua unidade mesmo com resolver permissivo", async () => {
    const { memory, store } = setupTwoUnits();
    const deliveries: string[] = [];
    const send = async (_phone: string, text: string, attempt?: WhatsappDeliveryAttemptContext) => {
      await attempt?.onProviderCallStarted();
      deliveries.push(text);
    };

    await expect(dispatcher({ unitId: "unit-a", store, send }).dispatchDue()).resolves.toMatchObject({
      processed: 1,
      sent: 1,
    });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toContain("Pomada A");
    expect(memory.stockAlerts.find((alert) => alert.unitId === "unit-a")).toMatchObject({ status: "SENT", attempts: 1 });
    expect(memory.stockAlerts.find((alert) => alert.unitId === "unit-b")).toMatchObject({ status: "PENDING", attempts: 0 });

    await expect(dispatcher({ unitId: "unit-b", store, send }).dispatchDue()).resolves.toMatchObject({
      processed: 1,
      sent: 1,
    });
    expect(deliveries).toHaveLength(2);
    expect(deliveries[1]).toContain("Pomada B");
    expect(memory.stockAlerts.find((alert) => alert.unitId === "unit-b")).toMatchObject({ status: "SENT", attempts: 1 });
  });

  it("falha fechado sem unitId valido ou sem resolver", () => {
    const { store } = setupTwoUnits();
    const send = async () => undefined;
    expect(() => new StockAlertDispatcher({
      unitId: "",
      store,
      send,
      resolveOwnerPhone: () => "5511999999999",
    })).toThrow("valid unitId");
    expect(() => new StockAlertDispatcher({
      unitId: "../unit-a",
      store,
      send,
      resolveOwnerPhone: () => "5511999999999",
    })).toThrow("valid unitId");
    expect(() => new StockAlertDispatcher({
      unitId: "unit-a",
      store,
      send,
      resolveOwnerPhone: undefined as unknown as (unitId: string) => string | undefined,
    })).toThrow("owner resolver");
  });

  it("resolver sem telefone falha somente o alerta da unidade do dispatcher", async () => {
    const { memory, store } = setupTwoUnits();
    const send = vi.fn();
    await expect(dispatcher({
      unitId: "unit-a",
      store,
      send,
      resolveOwnerPhone: () => undefined,
    }).dispatchDue()).resolves.toMatchObject({ processed: 1, sent: 0, failed: 1 });
    expect(send).not.toHaveBeenCalled();
    expect(memory.stockAlerts.find((alert) => alert.unitId === "unit-a")).toMatchObject({
      status: "FAILED",
      attempts: 1,
      lastErrorCode: "configuration",
    });
    expect(memory.stockAlerts.find((alert) => alert.unitId === "unit-b")).toMatchObject({ status: "PENDING", attempts: 0 });
  });

  it("nao chama o resolver se a store violar o escopo contratado", async () => {
    const { memory, store } = setupTwoUnits();
    const alertB = memory.stockAlerts.find((alert) => alert.unitId === "unit-b")!;
    const claimNext = vi.spyOn(store, "claimNext").mockResolvedValue({
      ...alertB,
      status: "SENDING",
      attempts: 1,
      claimedAt: new Date(),
      deliveryAttemptId: crypto.randomUUID(),
    });
    const resolver = vi.fn(() => "5511999999999");
    const send = vi.fn();
    await expect(dispatcher({ unitId: "unit-a", store, send, resolveOwnerPhone: resolver }).dispatchDue())
      .rejects.toThrow("outside the dispatcher unit scope");
    expect(claimNext).toHaveBeenCalledWith("unit-a", expect.any(Date));
    expect(resolver).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(alertB).toMatchObject({ status: "PENDING", attempts: 0 });
  });

  it("recupera claim expirado sem atravessar unidade ou consumir tentativa alheia", async () => {
    const { memory, store } = setupTwoUnits();
    let now = new Date("2030-01-01T12:00:00.000Z");
    const claimedB = await store.claimNext("unit-b", now);
    expect(claimedB).toMatchObject({ unitId: "unit-b", status: "SENDING", attempts: 1 });
    now = new Date(now.getTime() + 6 * 60_000);
    const sendA = vi.fn(async (_phone, _text, attempt?: WhatsappDeliveryAttemptContext) => {
      await attempt?.onProviderCallStarted();
    });
    await expect(dispatcher({ unitId: "unit-a", store, send: sendA, now: () => now }).dispatchDue())
      .resolves.toMatchObject({ recovered: 0, sent: 1 });
    expect(memory.stockAlerts.find((alert) => alert.unitId === "unit-b")).toMatchObject({
      status: "SENDING",
      attempts: 1,
      deliveryAttemptId: claimedB?.deliveryAttemptId,
    });

    const sendB = vi.fn(async (_phone, _text, attempt?: WhatsappDeliveryAttemptContext) => {
      await attempt?.onProviderCallStarted();
    });
    await expect(dispatcher({ unitId: "unit-b", store, send: sendB, now: () => now }).dispatchDue())
      .resolves.toMatchObject({ recovered: 1, sent: 1 });
    expect(sendB).toHaveBeenCalledOnce();
    expect(memory.stockAlerts.find((alert) => alert.unitId === "unit-b")).toMatchObject({ status: "SENT", attempts: 1 });
  });

  it("finalizacoes recusam alerta de outra unidade sem alterar estado", async () => {
    const { memory, store } = setupTwoUnits();
    const now = new Date("2030-01-01T12:00:00.000Z");
    const claimedB = (await store.claimNext("unit-b", now))!;
    await expect(store.markProviderCallStarted("unit-a", claimedB, now)).resolves.toBe(false);
    await expect(store.markSent("unit-a", claimedB, now)).resolves.toBe(false);
    await expect(store.markFailed("unit-a", claimedB, { errorCode: "http", failedAt: now })).resolves.toBe(false);
    await expect(store.markUncertain("unit-a", claimedB, { errorCode: "timeout", uncertainAt: now })).resolves.toBe(false);
    expect(memory.stockAlerts.find((alert) => alert.unitId === "unit-b")).toMatchObject({
      status: "SENDING",
      attempts: 1,
      providerCallStartedAt: undefined,
    });
  });

  it("workers de unidades diferentes processam em paralelo sem perda ou duplicacao", async () => {
    const { memory, store } = setupTwoUnits();
    const deliveries: string[] = [];
    const send = async (_phone: string, text: string, attempt?: WhatsappDeliveryAttemptContext) => {
      await attempt?.onProviderCallStarted();
      deliveries.push(text);
    };
    const [resultA, resultB] = await Promise.all([
      dispatcher({ unitId: "unit-a", store, send }).dispatchDue(),
      dispatcher({ unitId: "unit-b", store, send }).dispatchDue(),
    ]);
    expect(resultA).toMatchObject({ processed: 1, sent: 1, failed: 0 });
    expect(resultB).toMatchObject({ processed: 1, sent: 1, failed: 0 });
    expect(deliveries).toHaveLength(2);
    expect(memory.stockAlerts).toHaveLength(2);
    expect(memory.stockAlerts.every((alert) => alert.status === "SENT" && alert.attempts === 1)).toBe(true);
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
    const app = createApp({
      memoryStore,
      stockAlertSend: async (_phone, text, attempt) => {
        await attempt?.onProviderCallStarted();
        sent.push(text);
      },
    });

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

  it("timeout ambiguo preserva movimento e nunca reenvia LOW_STOCK", async () => {
    const { memoryStore, product } = configure();
    let now = new Date("2026-07-16T15:00:00.000Z");
    let sends = 0;
    const app = createApp({
      memoryStore,
      stockAlertNow: () => now,
      stockAlertSend: async (_phone, _text, attempt) => {
        sends += 1;
        await attempt?.onProviderCallStarted();
        throw Object.assign(new Error("payload externo secreto"), { reason: "timeout" });
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
    expect(memoryStore.stockAlerts[0]).toMatchObject({
      status: "UNCERTAIN",
      attempts: 1,
      lastErrorCode: "timeout",
    });
    expect(memoryStore.stockAlerts[0].deliveryAttemptId).toBeTruthy();
    expect(memoryStore.stockAlerts[0].providerCallStartedAt).toBeInstanceOf(Date);

    now = new Date(now.getTime() + 30_000);
    await app.inject({ method: "GET", url: "/health" });
    now = new Date(now.getTime() + 10 * 60_000);
    await app.inject({ method: "GET", url: "/health" });
    expect(sends).toBe(1);
    expect(memoryStore.stockAlerts).toHaveLength(1);
    expect(memoryStore.stockAlerts[0]).toMatchObject({ id: alertId, status: "UNCERTAIN", attempts: 1 });
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T09:00:00.000Z"));
    try {
      const { store, product, operations } = serviceWithStock(7, 5);
      const settings = store.businessSettings.find((item) => item.unitId === "unit-01");
      if (settings) settings.bufferBetweenAppointmentsMinutes = 0;
      const appointment = operations.schedule({
        unitId: "unit-01",
        clientId: "cli-01",
        professionalId: "pro-01",
        serviceId: "svc-corte",
        startsAt: new Date(Date.now() + 3 * 60 * 60_000),
        changedBy: "owner",
      });
      operations.updateStatus({ appointmentId: appointment.id, unitId: "unit-01", status: "CONFIRMED", changedBy: "owner" });
      operations.updateStatus({ appointmentId: appointment.id, unitId: "unit-01", status: "IN_SERVICE", changedBy: "owner" });
      operations.checkoutAppointment({
        appointmentId: appointment.id,
        unitId: "unit-01",
        changedBy: "owner",
        completedAt: new Date(Date.now() + 3 * 60 * 60_000 + 45 * 60_000),
        paymentMethod: "PIX",
        products: [{ productId: product.id, quantity: 1 }],
      });
      expect(product.stockQty).toBe(5);
      expect(store.stockAlerts).toHaveLength(1);
      expect(store.stockAlerts[0]).toMatchObject({ alertType: "LOW_STOCK", quantity: 5 });
    } finally {
      vi.useRealTimers();
    }
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
