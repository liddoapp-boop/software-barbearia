import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { OperationsService } from "../src/application/operations-service";
import { StockEntryPreviewRepository } from "../src/application/stock-entry-preview-repository";
import {
  STOCK_ENTRY_PREVIEW_VERSION,
  StockEntryBatchDraft,
  StockEntryPreview,
  interpretStockEntryBatchCorrection,
  interpretStockEntryCommand,
} from "../src/application/stock-entry";
import { InMemoryStore } from "../src/infrastructure/in-memory-store";

const products = [
  { id: "prd-pomada", name: "Pomada Matte", salePrice: 59 },
  { id: "prd-oleo-barba", name: "Oleo para Barba", salePrice: 39 },
];
const now = new Date("2026-07-20T15:00:00.000Z");

function ready(message: string, candidates = products) {
  const parsed = interpretStockEntryCommand({ message, products: candidates, now });
  expect(parsed).toMatchObject({ recognized: true, status: "ready" });
  if (!parsed.recognized || parsed.status !== "ready") throw new Error("expected ready stock-entry batch");
  return parsed;
}

async function saveBatch(store: InMemoryStore, batch: StockEntryBatchDraft) {
  const preview: StockEntryPreview = {
    version: STOCK_ENTRY_PREVIEW_VERSION,
    id: crypto.randomUUID(),
    unitId: "unit-01",
    actorId: "usr-owner",
    phoneFingerprint: "batch-phone-fingerprint",
    draft: batch.items[0],
    batch,
    createdAt: now.toISOString(),
    expiresAt: "2099-07-20T15:10:00.000Z",
  };
  const repository = new StockEntryPreviewRepository({ backend: "memory", memoryStore: store });
  const record = await repository.save(preview);
  return { preview, record, repository };
}

function confirmationInput(saved: Awaited<ReturnType<typeof saveBatch>>) {
  return {
    unitId: saved.preview.unitId,
    actorId: saved.preview.actorId,
    previewId: saved.preview.id,
    previewAction: saved.record.action,
    previewPayloadHash: saved.record.payloadHash,
    draft: saved.preview.draft,
    batch: saved.preview.batch,
    audit: {
      actorId: saved.preview.actorId,
      actorRole: "owner" as const,
      route: "/webhooks/evolution/whatsapp",
      method: "POST",
      requestId: `request-${saved.preview.id}`,
      idempotencyKey: saved.preview.id,
    },
  };
}

describe("entrada de estoque em lote pelo WhatsApp", () => {
  it("separa dois produtos, custos distintos, números e variação Matte/mate", () => {
    const parsed = ready("Comprei 2 Pomadas mate por 5 reais cada e 3 Óleos para Barba por 8 reais cada.");
    expect(parsed.batch).toEqual({
      items: [
        expect.objectContaining({ productId: "prd-pomada", quantity: 2, unitCost: 5, totalCost: 10, salePrice: 59 }),
        expect.objectContaining({ productId: "prd-oleo-barba", quantity: 3, unitCost: 8, totalCost: 24, salePrice: 39 }),
      ],
      totalCost: 34,
    });
  });

  it("aceita números por extenso e ordem livre dos itens", () => {
    const parsed = ready("Comprei três Óleos para Barba por oito reais cada e duas Pomadas Matte por cinco reais cada.");
    expect(parsed.batch.items.map((item) => [item.productId, item.quantity, item.unitCost])).toEqual([
      ["prd-oleo-barba", 3, 8],
      ["prd-pomada", 2, 5],
    ]);
    expect(parsed.batch.totalCost).toBe(34);
  });

  it("usa o mesmo contrato canônico para texto e uma transcrição de áudio", () => {
    const phrase = "Comprei 2 Pomadas Matte por 5 reais cada e 3 Óleos para Barba por 8 reais cada.";
    const text = ready(phrase);
    const audioTranscript = ready(phrase);
    expect(audioTranscript.batch).toEqual(text.batch);
  });

  it("corrige somente quantidade ou custo do item indicado e permite retirar um item", () => {
    const original = ready("Comprei 2 Pomadas Matte por 5 reais cada e 3 Óleos para Barba por 8 reais cada.").batch;
    const quantity = interpretStockEntryBatchCorrection({
      message: "Na verdade, são 4 óleos.", currentBatch: original, products, now,
    });
    expect(quantity).toMatchObject({ status: "valid", productId: "prd-oleo-barba", changedFields: ["quantity"] });
    if (quantity.status !== "valid") throw new Error("expected valid correction");
    expect(quantity.batch.items).toEqual([
      original.items[0],
      expect.objectContaining({ productId: "prd-oleo-barba", quantity: 4, unitCost: 8, totalCost: 32, salePrice: 39 }),
    ]);

    const cost = interpretStockEntryBatchCorrection({
      message: "O custo da pomada é 6 reais.", currentBatch: original, products, now,
    });
    expect(cost).toMatchObject({ status: "valid", productId: "prd-pomada", changedFields: ["unitCost"] });
    if (cost.status !== "valid") throw new Error("expected valid correction");
    expect(cost.batch.items[0]).toMatchObject({ quantity: 2, unitCost: 6, totalCost: 12, salePrice: 59 });
    expect(cost.batch.items[1]).toEqual(original.items[1]);

    const removed = interpretStockEntryBatchCorrection({
      message: "Retira o óleo dessa entrada.", currentBatch: original, products, now,
    });
    expect(removed).toMatchObject({ status: "valid", productId: "prd-oleo-barba", batch: { totalCost: 10 } });
  });

  it("rejeita produto inexistente, ambíguo, custo faltando e correção sem item seguro", () => {
    expect(interpretStockEntryCommand({
      message: "Comprei 2 Pomadas Matte por 5 reais cada e 3 Shampoos por 8 reais cada.", products, now,
    })).toMatchObject({ status: "clarification", reason: "product_not_found" });

    expect(interpretStockEntryCommand({
      message: "Comprei 2 Pomadas por 5 reais cada e 3 Óleos para Barba por 8 reais cada.",
      products: [...products, { id: "prd-pomada-brilho", name: "Pomada Brilho", salePrice: 55 }],
      now,
    })).toMatchObject({ status: "clarification", reason: "product_ambiguous" });

    expect(interpretStockEntryCommand({
      message: "Comprei 2 Pomadas Matte e 3 Óleos para Barba por 8 reais cada.", products, now,
    })).toMatchObject({ status: "clarification", reason: "cost_missing" });

    const batch = ready("Comprei 2 Pomadas Matte por 5 reais cada e 3 Óleos para Barba por 8 reais cada.").batch;
    expect(interpretStockEntryBatchCorrection({ message: "Na verdade, são 4.", currentBatch: batch, products, now }))
      .toMatchObject({ status: "clarification", reason: "item_ambiguous" });
  });

  it("não altera nada antes de confirmar e confirma todos atomicamente, sem financeiro", async () => {
    const store = new InMemoryStore();
    const parsed = ready("Comprei 2 Pomadas Matte por 5 reais cada e 3 Óleos para Barba por 8 reais cada.");
    const saved = await saveBatch(store, parsed.batch);
    expect(store.products.map((product) => product.stockQty)).toEqual([15, 12]);
    expect(store.stockMovements).toHaveLength(0);
    expect(store.financialEntries).toHaveLength(0);

    const result = await new OperationsService(store).confirmStockEntry(confirmationInput(saved));
    expect(result.movements).toHaveLength(2);
    expect(result.totalCost).toBe(34);
    expect(store.products.map((product) => product.stockQty)).toEqual([17, 15]);
    expect(store.products.map((product) => product.salePrice)).toEqual([59, 39]);
    expect(store.stockMovements).toHaveLength(2);
    expect(store.financialEntries).toHaveLength(0);
    expect(store.auditEvents.filter((event) => event.action === "STOCK_ENTRY_CONFIRMED")).toHaveLength(1);
    expect(store.auditEvents.find((event) => event.action === "STOCK_ENTRY_CONFIRMED")?.afterJson)
      .toMatchObject({ batchId: saved.preview.id, itemCount: 2, totalCost: 34 });

    const replay = await new OperationsService(store).confirmStockEntry(confirmationInput(saved));
    expect(replay.replay).toBe(true);
    expect(store.products.map((product) => product.stockQty)).toEqual([17, 15]);
    expect(store.stockMovements).toHaveLength(2);
  });

  it("reverte todos os itens quando qualquer etapa falha", async () => {
    const store = new InMemoryStore();
    const saved = await saveBatch(store, ready("Comprei 2 Pomadas Matte por 5 reais cada e 3 Óleos para Barba por 8 reais cada.").batch);
    const service = new OperationsService(store, undefined, undefined, (stage) => {
      if (stage === "after_stock") throw new Error("batch_failure");
    });
    await expect(service.confirmStockEntry(confirmationInput(saved))).rejects.toThrow("batch_failure");
    expect(store.products.map((product) => product.stockQty)).toEqual([15, 12]);
    expect(store.stockMovements).toHaveLength(0);
    expect(store.auditEvents.filter((event) => event.action === "STOCK_ENTRY_CONFIRMED")).toHaveLength(0);
    expect(store.financialEntries).toHaveLength(0);
    expect((await saved.repository.find({ unitId: "unit-01", actorId: "usr-owner", phoneFingerprint: "batch-phone-fingerprint" }))?.status)
      .toBe("PENDING");
  });

  it("recusa o lote inteiro se um item não pertencer à unidade", async () => {
    const store = new InMemoryStore();
    (store.products.find((product) => product.id === "prd-oleo-barba") as typeof store.products[number] & { businessId?: string }).businessId = "unit-02";
    const saved = await saveBatch(store, ready("Comprei 2 Pomadas Matte por 5 reais cada e 3 Óleos para Barba por 8 reais cada.").batch);
    await expect(new OperationsService(store).confirmStockEntry(confirmationInput(saved))).rejects.toThrow("nesta unidade");
    expect(store.products.map((product) => product.stockQty)).toEqual([15, 12]);
    expect(store.stockMovements).toHaveLength(0);
    expect(store.financialEntries).toHaveLength(0);
  });

  it("cancela o lote inteiro sem efeitos", async () => {
    const store = new InMemoryStore();
    const saved = await saveBatch(store, ready("Comprei 2 Pomadas Matte por 5 reais cada e 3 Óleos para Barba por 8 reais cada.").batch);
    expect(await saved.repository.cancel(saved.record)).toBe(true);
    expect(store.products.map((product) => product.stockQty)).toEqual([15, 12]);
    expect(store.stockMovements).toHaveLength(0);
    expect(store.financialEntries).toHaveLength(0);
  });
});
