import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/http/app";
import { InMemoryStore } from "../src/infrastructure/in-memory-store";
import { OperationsService } from "../src/application/operations-service";
import { StockEntryPreviewRepository } from "../src/application/stock-entry-preview-repository";
import {
  STOCK_ENTRY_PREVIEW_VERSION,
  StockEntryDraft,
  StockEntryPreview,
  interpretStockEntryCorrection,
  interpretStockEntryCommand,
} from "../src/application/stock-entry";
import type { AudioTranscriptionService } from "../src/application/audio-transcription";
import type { Product } from "../src/domain/types";

const originalEnv = { ...process.env };
const ownerPhone = "5511999999999";
const products = [
  { id: "prd-pente", name: "Pente", salePrice: 12 },
  { id: "prd-pomada", name: "Pomada Matte", salePrice: 59 },
];

function addPente(store: InMemoryStore, businessId = "unit-01") {
  store.products.push({
    id: `prd-pente-${businessId}`,
    businessId,
    name: "Pente",
    category: "Acessórios",
    salePrice: 12,
    costPrice: 3,
    stockQty: 4,
    minStockAlert: 1,
    active: true,
  } as Product & { businessId: string });
  return store.products.at(-1)! as Product & { businessId: string };
}

function draft(overrides: Partial<StockEntryDraft> = {}): StockEntryDraft {
  return {
    productId: "prd-pomada",
    productName: "Pomada Matte",
    quantity: 10,
    unitCost: 10,
    totalCost: 100,
    salePrice: 59,
    occurredAt: "2026-07-15T12:00:00.000-03:00",
    ...overrides,
  };
}

async function savePreview(store: InMemoryStore, input: {
  unitId?: string;
  actorId?: string;
  phoneFingerprint?: string;
  draft?: StockEntryDraft;
} = {}) {
  const now = new Date("2026-07-15T15:00:00.000Z");
  const preview: StockEntryPreview = {
    version: STOCK_ENTRY_PREVIEW_VERSION,
    id: crypto.randomUUID(),
    unitId: input.unitId ?? "unit-01",
    actorId: input.actorId ?? "usr-owner",
    phoneFingerprint: input.phoneFingerprint ?? "phone-fingerprint-test",
    draft: input.draft ?? draft(),
    createdAt: now.toISOString(),
    expiresAt: new Date("2099-07-15T15:10:00.000Z").toISOString(),
  };
  const repository = new StockEntryPreviewRepository({ backend: "memory", memoryStore: store });
  const record = await repository.save(preview);
  return { preview, record, repository };
}

function audit(previewId: string) {
  return {
    actorId: "usr-owner",
    actorRole: "owner" as const,
    route: "/webhooks/evolution/whatsapp",
    method: "POST",
    requestId: `request-${previewId}`,
    idempotencyKey: previewId,
  };
}

function confirmationInput(saved: Awaited<ReturnType<typeof savePreview>>) {
  return {
    unitId: saved.preview.unitId,
    actorId: saved.preview.actorId,
    previewId: saved.preview.id,
    previewAction: saved.record.action,
    previewPayloadHash: saved.record.payloadHash,
    draft: saved.preview.draft,
    audit: audit(saved.preview.id),
  };
}

function evolutionTextPayload(text: string, messageId: string, phone = ownerPhone) {
  return {
    instance: "test-instance",
    data: {
      key: { id: messageId, remoteJid: `${phone}@s.whatsapp.net`, fromMe: false },
      message: { conversation: text },
    },
  };
}

function evolutionRealisticExtendedTextPayload(text: string, messageId: string) {
  return {
    event: "messages.upsert",
    instance: "test-instance",
    data: {
      key: { id: messageId, remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false },
      pushName: "Owner Teste",
      message: { extendedTextMessage: { text } },
      messageType: "extendedTextMessage",
      messageTimestamp: 1_784_171_200,
      source: "android",
    },
  };
}

function evolutionAudioPayload(messageId: string) {
  return {
    instance: "test-instance",
    data: {
      key: { id: messageId, remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false },
      message: { audioMessage: { mimetype: "audio/ogg; codecs=opus", fileLength: 4, seconds: 1 } },
    },
  };
}

function transportMock() {
  return vi.fn(async (url: string) => {
    if (url.includes("/chat/getBase64FromMediaMessage/")) {
      return { ok: true, headers: { get: () => null }, json: async () => ({ base64: "AQIDBA==" }) };
    }
    if (url.includes("/message/sendText/")) return { ok: true, status: 200, text: async () => "" };
    throw new Error(`Chamada externa inesperada: ${url}`);
  });
}

async function webhook(app: ReturnType<typeof createApp>, payload: Record<string, unknown>) {
  return await app.inject({
    method: "POST",
    url: "/webhooks/evolution/whatsapp",
    headers: { "x-evolution-webhook-secret": "test-webhook-secret" },
    payload,
  });
}

function sentTexts(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).includes("/message/sendText/"))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)).text as string);
}

describe("parser determinístico de entrada de estoque", () => {
  const now = new Date("2026-07-15T15:00:00.000Z");

  it.each([
    ["Comprei oito pentes por cinco reais cada.", { productName: "Pente", quantity: 8, unitCost: 5, totalCost: 40, salePrice: 12 }],
    ["Adiciona dez pomadas no estoque. Paguei cem reais no total.", { productName: "Pomada Matte", quantity: 10, unitCost: 10, totalCost: 100, salePrice: 59 }],
    ["Adiciona 4 pentes no estoque por 6 reais cada.", { productName: "Pente", quantity: 4, unitCost: 6, totalCost: 24, salePrice: 12 }],
    ["Comprei 2 pentes por R$ 7,50 cada.", { productName: "Pente", quantity: 2, unitCost: 7.5, totalCost: 15, salePrice: 12 }],
  ])("interpreta custo unitário e total sem modelo: %s", (message, expected) => {
    const result = interpretStockEntryCommand({ message, products, now });
    expect(result).toMatchObject({ recognized: true, status: "ready", draft: expected });
  });

  it.each([
    "Adiciona uma unidade de Pomada Matte no estoque. Paguei seis reais no total.",
    "Adiciono uma unidade de Pomada Matte no estoque, paguei seis reais no total",
    "Coloca uma Pomada Matte no estoque, paguei seis reais.",
    "Adiciona uma unidade da Pomada Matte, o total foi seis reais.",
    "Comprei uma Pomada Matte por seis reais.",
  ])("aceita variações naturais seguras da entrada inicial: %s", (message) => {
    expect(interpretStockEntryCommand({ message, products, now })).toMatchObject({
      recognized: true,
      status: "ready",
      draft: {
        productName: "Pomada Matte",
        quantity: 1,
        unitCost: 6,
        totalCost: 6,
        salePrice: 59,
      },
    });
  });

  it("interpreta data e observação e calcula somente no sistema", () => {
    const result = interpretStockEntryCommand({
      message: "Comprei 2 pentes por 8 reais cada dia 14/07/2026. Obs: reposição do balcão",
      products,
      now,
    });
    expect(result).toMatchObject({
      status: "ready",
      draft: { occurredAt: "2026-07-14T12:00:00.000-03:00", notes: "reposição do balcão", totalCost: 16 },
    });
  });

  it.each([
    ["Comprei 3 navalhas por 5 reais cada.", "product_not_found"],
    ["Adiciona 3 pomadas no estoque por 5 reais cada.", "product_ambiguous", [{ id: "1", name: "Pomada Matte", salePrice: 59 }, { id: "2", name: "Pomada Brilho", salePrice: 55 }]],
    ["Adiciona 3 pentes no estoque por 15 reais.", "cost_ambiguous"],
    ["Adiciona 3 pentes no estoque por 5 reais cada, total 20 reais.", "cost_inconsistent"],
    ["Adiciona 3 pentes no estoque por 10 reais no total.", "cost_inconsistent"],
    ["Adiciona 3 pentes no estoque por -5 reais cada.", "cost_inconsistent"],
    ["Adiciona 3 pentes, quantidade 4, por 5 reais cada.", "quantity_ambiguous"],
  ])("pede esclarecimento sem escrever: %s", (message, reason, customProducts = products) => {
    expect(interpretStockEntryCommand({ message, products: customProducts, now })).toMatchObject({
      recognized: true,
      status: "clarification",
      reason,
    });
  });
});

describe("correções naturais da prévia de entrada de estoque", () => {
  const now = new Date("2026-07-16T15:00:00.000Z");
  const currentDraft = draft({ quantity: 2, unitCost: 5, totalCost: 10 });
  const correctionProducts = [
    ...products,
    { id: "prd-oleo", name: "Óleo para Barba", salePrice: 42 },
  ];

  it.each([
    ["Me enganei, são 3 unidades.", { quantity: 3, unitCost: 5, totalCost: 15 }],
    ["Na verdade coloca 4.", { quantity: 4, unitCost: 5, totalCost: 20 }],
    ["A quantidade correta é 2.", { quantity: 2, unitCost: 5, totalCost: 10 }],
    ["O valor por unidade é 6 reais.", { quantity: 2, unitCost: 6, totalCost: 12 }],
    ["O custo unitário correto é 5,50.", { quantity: 2, unitCost: 5.5, totalCost: 11 }],
    ["Me enganei, foi 7 reais cada.", { quantity: 2, unitCost: 7, totalCost: 14 }],
    ["O total correto é 12 reais.", { quantity: 2, unitCost: 6, totalCost: 12 }],
    ["Na verdade paguei 14 no total.", { quantity: 2, unitCost: 7, totalCost: 14 }],
    ["A compra inteira deu 20 reais.", { quantity: 2, unitCost: 10, totalCost: 20 }],
    ["Na verdade são 3 unidades e o total foi 18 reais.", { quantity: 3, unitCost: 6, totalCost: 18 }],
  ])("corrige e recalcula somente os campos informados: %s", (message, expected) => {
    expect(interpretStockEntryCorrection({ message, currentDraft, products: correctionProducts, now })).toMatchObject({
      status: "valid",
      draft: expected,
    });
  });

  it.each([
    "Me enganei, o total correto é sete reais.",
    "Me enganei, o total, na verdade, é sete reais",
    "Na verdade paguei sete reais no total.",
  ])("identifica explicitamente o custo total na variação observada: %s", (message) => {
    const pendingDraft = draft({ quantity: 1, unitCost: 6, totalCost: 6 });
    expect(interpretStockEntryCorrection({ message, currentDraft: pendingDraft, products: correctionProducts, now })).toMatchObject({
      status: "valid",
      changedFields: ["totalCost"],
      draft: { quantity: 1, unitCost: 7, totalCost: 7 },
    });
  });

  it("identifica explicitamente o custo unitário sem confundi-lo com total", () => {
    const pendingDraft = draft({ quantity: 1, unitCost: 6, totalCost: 6 });
    expect(interpretStockEntryCorrection({
      message: "O custo unitário correto é sete reais.",
      currentDraft: pendingDraft,
      products: correctionProducts,
      now,
    })).toMatchObject({
      status: "valid",
      changedFields: ["unitCost"],
      draft: { quantity: 1, unitCost: 7, totalCost: 7 },
    });
  });

  it("troca produto e recarrega somente o preço de venda informativo", () => {
    expect(interpretStockEntryCorrection({
      message: "Troca para Óleo para Barba.",
      currentDraft,
      products: correctionProducts,
      now,
    })).toMatchObject({
      status: "valid",
      changedFields: ["product"],
      draft: {
        productId: "prd-oleo",
        productName: "Óleo para Barba",
        salePrice: 42,
        quantity: 2,
        unitCost: 5,
        totalCost: 10,
      },
    });
  });

  it.each([
    "Na verdade o produto é Óleo para Barba.",
    "Me enganei, era o óleo.",
  ])("aceita variações naturais para corrigir produto: %s", (message) => {
    expect(interpretStockEntryCorrection({ message, currentDraft, products: correctionProducts, now })).toMatchObject({
      status: "valid",
      changedFields: ["product"],
      draft: { productId: "prd-oleo", productName: "Óleo para Barba", salePrice: 42 },
    });
  });

  it("corrige produto, quantidade e custo unitário na mesma mensagem", () => {
    expect(interpretStockEntryCorrection({
      message: "Troca para Óleo para Barba, foram 2 unidades a 8 reais cada.",
      currentDraft,
      products: correctionProducts,
      now,
    })).toMatchObject({
      status: "valid",
      changedFields: ["product", "quantity", "unitCost"],
      draft: {
        productId: "prd-oleo",
        salePrice: 42,
        quantity: 2,
        unitCost: 8,
        totalCost: 16,
      },
    });
  });

  it("não escolhe silenciosamente um produto ambíguo e aceita o nome exato depois", () => {
    const ambiguousProducts = [
      ...correctionProducts,
      { id: "prd-pomada-brilho", name: "Pomada Brilho", salePrice: 55 },
    ];
    const ambiguous = interpretStockEntryCorrection({
      message: "Troca para a pomada.",
      currentDraft,
      products: ambiguousProducts,
      now,
    });
    expect(ambiguous).toMatchObject({
      status: "clarification",
      reason: "product_ambiguous",
      clarification: { kind: "product" },
    });
    expect(interpretStockEntryCorrection({
      message: "Pomada Brilho",
      currentDraft,
      products: ambiguousProducts,
      now,
      clarification: ambiguous.status === "clarification" ? ambiguous.clarification : undefined,
    })).toMatchObject({
      status: "valid",
      draft: { productId: "prd-pomada-brilho", salePrice: 55 },
    });
  });

  it.each([
    ["A data correta foi ontem.", "2026-07-15T12:00:00.000-03:00"],
    ["Foi no dia 15/07/2026.", "2026-07-15T12:00:00.000-03:00"],
    ["Na verdade comprei hoje.", "2026-07-16T12:00:00.000-03:00"],
  ])("corrige a data: %s", (message, occurredAt) => {
    expect(interpretStockEntryCorrection({ message, currentDraft, products: correctionProducts, now })).toMatchObject({
      status: "valid",
      changedFields: ["date"],
      draft: { occurredAt },
    });
  });

  it.each([
    "Me enganei, são 0 unidades.",
    "A quantidade correta é -2.",
    "O custo unitário correto é zero.",
    "O custo unitário correto é abc.",
    "O total correto é abc.",
    "O total correto é -12 reais.",
    "A data correta foi 31/02/2026.",
    "Troca para Navalha Inexistente.",
    "São 3 unidades, custou 5 reais cada e o total foi 20 reais.",
  ])("recusa correção inválida sem produzir nova prévia: %s", (message) => {
    expect(interpretStockEntryCorrection({ message, currentDraft, products: correctionProducts, now })).toMatchObject({
      status: "invalid",
    });
  });

  it("preserva a prévia em ambiguidade e resolve a resposta posterior", () => {
    const ambiguous = interpretStockEntryCorrection({
      message: "Me enganei, o valor correto é 12 reais.",
      currentDraft,
      products: correctionProducts,
      now,
    });
    expect(ambiguous).toMatchObject({
      status: "clarification",
      reason: "cost_kind_ambiguous",
      message: "Os R$ 12,00 correspondem ao custo unitário ou ao custo total?",
      clarification: { kind: "cost_kind", amount: 12 },
    });
    expect(interpretStockEntryCorrection({
      message: "É o total.",
      currentDraft,
      products: correctionProducts,
      now,
      clarification: ambiguous.status === "clarification" ? ambiguous.clarification : undefined,
    })).toMatchObject({ status: "valid", draft: { unitCost: 6, totalCost: 12 } });
  });

  it.each([
    "O valor correto é 12.",
    "Na verdade foi 3.",
  ])("pede esclarecimento sem adivinhar: %s", (message) => {
    expect(interpretStockEntryCorrection({ message, currentDraft, products: correctionProducts, now })).toMatchObject({
      status: "clarification",
    });
  });

  it("mantém a fotografia anterior intacta quando o campo continua ambíguo", () => {
    const pendingDraft = draft({ quantity: 1, unitCost: 6, totalCost: 6 });
    const before = structuredClone(pendingDraft);
    expect(interpretStockEntryCorrection({
      message: "Me enganei, precisa ser sete reais.",
      currentDraft: pendingDraft,
      products: correctionProducts,
      now,
    })).toMatchObject({ status: "clarification", reason: "field_ambiguous" });
    expect(pendingDraft).toEqual(before);
  });
});

describe("operação atômica de entrada em memória", () => {
  it("confirma sem financeiro e preserva preço de venda e custo cadastral", async () => {
    const store = new InMemoryStore();
    const product = store.products.find((item) => item.id === "prd-pomada")!;
    const before = { stockQty: product.stockQty, salePrice: product.salePrice, costPrice: product.costPrice };
    const saved = await savePreview(store);
    const result = await new OperationsService(store).confirmStockEntry(confirmationInput(saved));

    expect(result).toMatchObject({ product: { stockQty: before.stockQty + 10 }, replay: false });
    expect(result).not.toHaveProperty("financialEntry");
    expect(store.stockMovements).toHaveLength(1);
    expect(store.stockMovements[0]).toMatchObject({ movementType: "IN", unitCost: 10, totalCost: 100, referenceType: "STOCK_ENTRY" });
    expect(store.financialEntries).toHaveLength(0);
    expect(store.auditEvents.filter((event) => event.action === "STOCK_ENTRY_CONFIRMED")).toHaveLength(1);
    expect(product).toMatchObject({ salePrice: before.salePrice, costPrice: before.costPrice });
  });

  it("bloqueia confirmação repetida e concorrente sem duplicar efeitos", async () => {
    const store = new InMemoryStore();
    const saved = await savePreview(store);
    const service = new OperationsService(store, undefined, undefined, async (stage) => {
      if (stage === "after_claim") await Promise.resolve();
    });
    const [first, concurrent] = await Promise.all([
      service.confirmStockEntry(confirmationInput(saved)),
      service.confirmStockEntry(confirmationInput(saved)),
    ]);
    const repeated = await service.confirmStockEntry(confirmationInput(saved));
    expect([first.replay, concurrent.replay].sort()).toEqual([false, true]);
    expect(repeated.replay).toBe(true);
    expect(store.stockMovements).toHaveLength(1);
    expect(store.financialEntries).toHaveLength(0);
    expect(store.auditEvents.filter((event) => event.action === "STOCK_ENTRY_CONFIRMED")).toHaveLength(1);
  });

  it("faz rollback integral e mantém a prévia confirmável em falha", async () => {
    const store = new InMemoryStore();
    const product = store.products.find((item) => item.id === "prd-pomada")!;
    const stockBefore = product.stockQty;
    const saved = await savePreview(store);
    const service = new OperationsService(store, undefined, undefined, (stage) => {
      if (stage === "after_stock") throw new Error("falha injetada");
    });
    await expect(service.confirmStockEntry(confirmationInput(saved))).rejects.toThrow("falha injetada");
    expect(product.stockQty).toBe(stockBefore);
    expect(store.stockMovements).toHaveLength(0);
    expect(store.financialEntries).toHaveLength(0);
    expect(store.auditEvents).toHaveLength(0);
    expect((await saved.repository.find({ unitId: "unit-01", actorId: "usr-owner", phoneFingerprint: "phone-fingerprint-test" }))?.status).toBe("PENDING");
  });

  it("isola tenant e actor", async () => {
    const store = new InMemoryStore();
    const foreign = addPente(store, "unit-02");
    const saved = await savePreview(store, { draft: draft({ productId: foreign.id, productName: foreign.name }) });
    const service = new OperationsService(store);
    await expect(service.confirmStockEntry(confirmationInput(saved))).rejects.toThrow("nesta unidade");
    await expect(service.confirmStockEntry({ ...confirmationInput(saved), actorId: "outro-owner" })).rejects.toThrow("inválida");
    expect(foreign.stockQty).toBe(4);
  });

  it("cancela a prévia sem qualquer alteração", async () => {
    const store = new InMemoryStore();
    const before = store.products.find((item) => item.id === "prd-pomada")!.stockQty;
    const saved = await savePreview(store);
    expect(await saved.repository.cancel(saved.record)).toBe(true);
    expect(store.products.find((item) => item.id === "prd-pomada")!.stockQty).toBe(before);
    expect(store.stockMovements).toHaveLength(0);
    expect(store.financialEntries).toHaveLength(0);
  });

  it("invalida atomicamente a fotografia anterior ao substituir a prévia", async () => {
    const store = new InMemoryStore();
    const saved = await savePreview(store, { draft: draft({ quantity: 2, unitCost: 5, totalCost: 10 }) });
    const updatedPreview: StockEntryPreview = {
      ...saved.preview,
      id: crypto.randomUUID(),
      draft: draft({ quantity: 3, unitCost: 6, totalCost: 18 }),
      createdAt: new Date("2026-07-15T15:01:00.000Z").toISOString(),
    };
    const updatedRecord = await saved.repository.replacePending(saved.record, updatedPreview);
    expect(updatedRecord).not.toBeNull();

    const service = new OperationsService(store);
    await expect(service.confirmStockEntry(confirmationInput(saved))).rejects.toThrow(/prévia|invalida|inválida/i);
    const latest = { preview: updatedPreview, record: updatedRecord!, repository: saved.repository };
    const confirmed = await service.confirmStockEntry(confirmationInput(latest));
    expect(confirmed).toMatchObject({ replay: false, movement: { quantity: 3, unitCost: 6, totalCost: 18 } });
    expect(store.stockMovements).toHaveLength(1);
    expect(store.financialEntries).toHaveLength(0);
  });
});

describe("orquestrador único de texto e áudio no WhatsApp", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NODE_ENV = "test";
    process.env.HTTP_LOG_ENABLED = "false";
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "true";
    process.env.AI_WHATSAPP_ENABLED = "true";
    process.env.AI_WHATSAPP_OWNER_PHONE = ownerPhone;
    process.env.AI_WHATSAPP_UNIT_ID = "unit-01";
    process.env.EVOLUTION_WEBHOOK_SECRET = "test-webhook-secret";
    process.env.EVOLUTION_API_URL = "http://evolution.local";
    process.env.EVOLUTION_API_KEY = "test-evolution-key";
    process.env.EVOLUTION_INSTANCE_NAME = "test-instance";
    process.env.AI_WHATSAPP_AUDIO_ENABLED = "true";
    process.env.AI_AUDIO_TRANSCRIPTION_ENABLED = "true";
    process.env.ASR_PROVIDER = "local_whisper";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("gera e confirma uma única entrada para o payload messages.upsert realista", async () => {
    const store = new InMemoryStore();
    const fetchMock = transportMock();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ memoryStore: store });
    const product = store.products.find((item) => item.id === "prd-pomada")!;
    const before = { stockQty: product.stockQty, salePrice: product.salePrice };

    const realistic = await webhook(app, evolutionRealisticExtendedTextPayload(
      "Adiciona 2 unidades de Pomada Matte no estoque. Paguei 10 reais no total.",
      "stock-realistic-extended-001",
    ));
    expect(realistic.json()).toMatchObject({
      intent: "stock_entry",
      executed: false,
      preview: {
        productName: "Pomada Matte",
        quantity: 2,
        unitCost: 5,
        totalCost: 10,
        salePrice: 59,
      },
    });
    expect(realistic.json().preview).not.toHaveProperty("registerExpense");
    expect(sentTexts(fetchMock).at(-1)).toMatch(/Custo unitário de compra: R\$\s*5,00/);
    expect(sentTexts(fetchMock).at(-1)).toMatch(/Custo total: R\$\s*10,00/);
    expect(sentTexts(fetchMock).at(-1)).toMatch(/Preço de venda atual: R\$\s*59,00/);
    expect(sentTexts(fetchMock).at(-1)).not.toMatch(/financeir|despesa/i);
    expect(product).toMatchObject(before);
    expect(store.stockMovements).toHaveLength(0);
    expect(store.financialEntries).toHaveLength(0);

    const confirmed = await webhook(app, evolutionTextPayload("CONFIRMAR", "stock-realistic-confirm-001"));
    const repeated = await webhook(app, evolutionTextPayload("CONFIRMAR", "stock-realistic-confirm-002"));
    expect(confirmed.json()).toMatchObject({ executed: true, replay: false });
    expect(repeated.json()).toMatchObject({ executed: true, replay: true });
    expect(product).toMatchObject({ stockQty: before.stockQty + 2, salePrice: before.salePrice });
    expect(store.stockMovements).toHaveLength(1);
    expect(store.stockMovements[0]).toMatchObject({ movementType: "IN", quantity: 2, unitCost: 5, totalCost: 10 });
    expect(store.financialEntries).toHaveLength(0);
    expect(store.auditEvents.filter((event) => event.action === "STOCK_ENTRY_CONFIRMED")).toHaveLength(1);
    await app.close();
  });

  it("atualiza a mesma prévia, resolve ambiguidade e confirma somente a versão mais recente", async () => {
    const store = new InMemoryStore();
    const fetchMock = transportMock();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ memoryStore: store });
    const product = store.products.find((item) => item.id === "prd-pomada")!;
    const stockBefore = product.stockQty;

    const original = await webhook(app, evolutionTextPayload(
      "Adiciona 2 unidades de Pomada Matte no estoque. Paguei 10 reais no total.",
      "stock-correction-original-001",
    ));
    const originalPreviewId = original.json().previewId;

    const corrected = await webhook(app, evolutionRealisticExtendedTextPayload(
      "Me enganei, o total correto é 12 reais.",
      "stock-correction-total-001",
    ));
    expect(corrected.json()).toMatchObject({
      intent: "stock_entry",
      corrected: true,
      preview: { quantity: 2, unitCost: 6, totalCost: 12, salePrice: 59 },
    });
    expect(corrected.json().previewId).not.toBe(originalPreviewId);
    expect(sentTexts(fetchMock).at(-1)).toContain("Entrada de estoque atualizada");
    expect(product.stockQty).toBe(stockBefore);

    const ambiguous = await webhook(app, evolutionTextPayload(
      "O valor correto é 18 reais.",
      "stock-correction-ambiguous-001",
    ));
    expect(ambiguous.json()).toMatchObject({ intent: "stock_entry", corrected: false, clarification: true });
    expect(sentTexts(fetchMock).at(-1)).toBe("Os R$ 18,00 correspondem ao custo unitário ou ao custo total?");

    const clarified = await webhook(app, evolutionTextPayload("É o total.", "stock-correction-clarified-001"));
    expect(clarified.json()).toMatchObject({
      intent: "stock_entry",
      corrected: true,
      preview: { quantity: 2, unitCost: 9, totalCost: 18 },
    });
    expect(product.stockQty).toBe(stockBefore);

    const confirmed = await webhook(app, evolutionTextPayload("CONFIRMAR", "stock-correction-confirm-001"));
    const replay = await webhook(app, evolutionTextPayload("CONFIRMAR", "stock-correction-confirm-002"));
    expect(confirmed.json()).toMatchObject({ executed: true, replay: false });
    expect(replay.json()).toMatchObject({ executed: true, replay: true });
    expect(product.stockQty).toBe(stockBefore + 2);
    expect(store.stockMovements).toHaveLength(1);
    expect(store.stockMovements[0]).toMatchObject({ quantity: 2, unitCost: 9, totalCost: 18 });
    expect(store.financialEntries).toHaveLength(0);
    await app.close();
  });

  it("texto e áudio percorrem o mesmo parser de correção e produzem a mesma prévia atualizada", async () => {
    const run = async (audio: boolean) => {
      const store = new InMemoryStore();
      const fetchMock = transportMock();
      vi.stubGlobal("fetch", fetchMock);
      const correction = "Na verdade são 3 unidades e o total foi 18 reais.";
      const transcriber: AudioTranscriptionService = {
        transcribe: vi.fn(async () => ({ transcript: correction, provider: "local_whisper:test" })),
      };
      const app = createApp({ memoryStore: store, audioTranscriptionService: audio ? transcriber : undefined });
      await webhook(app, evolutionRealisticExtendedTextPayload(
        "Adiciona 2 unidades de Pomada Matte no estoque. Paguei 10 reais no total.",
        `stock-correction-${audio ? "audio" : "text"}-original-001`,
      ));
      const response = await webhook(
        app,
        audio
          ? evolutionAudioPayload("stock-correction-audio-001")
          : evolutionTextPayload(correction, "stock-correction-text-001"),
      );
      await app.close();
      return { body: response.json(), fetchMock };
    };

    const textResult = await run(false);
    const audioResult = await run(true);
    expect(textResult.body.preview).toEqual(audioResult.body.preview);
    expect(textResult.body).toMatchObject({ corrected: true, audio: false });
    expect(audioResult.body).toMatchObject({ corrected: true, audio: true });
    expect([...textResult.fetchMock.mock.calls, ...audioResult.fetchMock.mock.calls]
      .some(([url]) => /gemini|openai|qwen/i.test(String(url)))).toBe(false);
  });

  it("texto original e transcript real do áudio atualizam o mesmo custo total sem mutação antes de CONFIRMAR", async () => {
    const run = async (audio: boolean) => {
      const store = new InMemoryStore();
      const fetchMock = transportMock();
      vi.stubGlobal("fetch", fetchMock);
      const transcript = "Me enganei, o total, na verdade, é sete reais";
      const transcriber: AudioTranscriptionService = {
        transcribe: vi.fn(async () => ({ transcript, provider: "local_whisper:test" })),
      };
      const app = createApp({ memoryStore: store, audioTranscriptionService: audio ? transcriber : undefined });
      const product = store.products.find((item) => item.id === "prd-pomada")!;
      const before = { stockQty: product.stockQty, salePrice: product.salePrice };
      await webhook(app, evolutionTextPayload(
        "Adiciona 1 unidade de Pomada Matte no estoque. Paguei 6 reais no total.",
        `stock-total-seven-${audio ? "audio" : "text"}-original-001`,
      ));
      const response = await webhook(
        app,
        audio
          ? evolutionAudioPayload("stock-total-seven-audio-correction-001")
          : evolutionTextPayload("Me enganei, o total correto é sete reais.", "stock-total-seven-text-correction-001"),
      );
      const body = response.json();
      expect(product).toMatchObject(before);
      expect(store.stockMovements).toHaveLength(0);
      expect(store.financialEntries).toHaveLength(0);
      await app.close();
      return body;
    };

    const textResult = await run(false);
    const audioResult = await run(true);
    expect(audioResult.preview).toEqual(textResult.preview);
    expect(textResult).toMatchObject({ corrected: true, audio: false, preview: { quantity: 1, unitCost: 7, totalCost: 7 } });
    expect(audioResult).toMatchObject({ corrected: true, audio: true, preview: { quantity: 1, unitCost: 7, totalCost: 7 } });
  });

  it("frase canônica e transcript real do áudio inicial geram a mesma prévia sem mutação", async () => {
    const run = async (audio: boolean) => {
      const store = new InMemoryStore();
      const fetchMock = transportMock();
      vi.stubGlobal("fetch", fetchMock);
      const transcript = "Adiciono uma unidade de Pomada Matte no estoque, paguei seis reais no total";
      const transcriber: AudioTranscriptionService = {
        transcribe: vi.fn(async () => ({ transcript, provider: "local_whisper:test" })),
      };
      const app = createApp({ memoryStore: store, audioTranscriptionService: audio ? transcriber : undefined });
      const product = store.products.find((item) => item.id === "prd-pomada")!;
      const before = { stockQty: product.stockQty, salePrice: product.salePrice };
      const response = await webhook(
        app,
        audio
          ? evolutionAudioPayload("stock-initial-real-audio-001")
          : evolutionTextPayload(
              "Adiciona uma unidade de Pomada Matte no estoque. Paguei seis reais no total.",
              "stock-initial-canonical-text-001",
            ),
      );
      const body = response.json();
      expect(product).toMatchObject(before);
      expect(store.stockMovements).toHaveLength(0);
      expect(store.financialEntries).toHaveLength(0);
      await app.close();
      return body;
    };

    const textResult = await run(false);
    const audioResult = await run(true);
    expect(audioResult.preview).toEqual(textResult.preview);
    expect(textResult).toMatchObject({ intent: "stock_entry", audio: false, executed: false });
    expect(audioResult).toMatchObject({ intent: "stock_entry", audio: true, executed: false });
    expect(audioResult.preview).toMatchObject({ productName: "Pomada Matte", quantity: 1, unitCost: 6, totalCost: 6, salePrice: 59 });
  });

  it("cancela a versão atualizada sem mutação", async () => {
    const store = new InMemoryStore();
    const fetchMock = transportMock();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ memoryStore: store });
    const product = store.products.find((item) => item.id === "prd-pomada")!;
    const stockBefore = product.stockQty;
    await webhook(app, evolutionTextPayload(
      "Adiciona 2 unidades de Pomada Matte no estoque. Paguei 10 reais no total.",
      "stock-correction-cancel-original-001",
    ));
    await webhook(app, evolutionTextPayload("Me enganei, são 3 unidades.", "stock-correction-cancel-update-001"));
    const cancelled = await webhook(app, evolutionTextPayload("CANCELAR", "stock-correction-cancel-001"));
    expect(cancelled.json()).toMatchObject({ intent: "stock_entry", cancelled: true, executed: false });
    expect(product.stockQty).toBe(stockBefore);
    expect(store.stockMovements).toHaveLength(0);
    expect(store.financialEntries).toHaveLength(0);
    await app.close();
  });

  it("repetir a mesma correção preserva a fotografia atual e não duplica efeitos", async () => {
    const store = new InMemoryStore();
    const fetchMock = transportMock();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ memoryStore: store });
    await webhook(app, evolutionTextPayload(
      "Adiciona 2 unidades de Pomada Matte no estoque. Paguei 10 reais no total.",
      "stock-correction-repeat-original-001",
    ));
    const first = await webhook(app, evolutionTextPayload("O total correto é 12 reais.", "stock-correction-repeat-001"));
    const repeated = await webhook(app, evolutionTextPayload("O total correto é 12 reais.", "stock-correction-repeat-002"));
    expect(repeated.json()).toMatchObject({ corrected: true, previewId: first.json().previewId, preview: first.json().preview });

    await webhook(app, evolutionTextPayload("CONFIRMAR", "stock-correction-repeat-confirm-001"));
    await webhook(app, evolutionTextPayload("CONFIRMAR", "stock-correction-repeat-confirm-002"));
    expect(store.stockMovements).toHaveLength(1);
    expect(store.stockMovements[0]).toMatchObject({ quantity: 2, unitCost: 6, totalCost: 12 });
    expect(store.financialEntries).toHaveLength(0);
    await app.close();
  });

  it("texto e áudio geram o mesmo payload determinístico sem chamar IA paga", async () => {
    const command = "Comprei oito pentes por cinco reais cada.";
    const textStore = new InMemoryStore();
    addPente(textStore);
    const textTransport = transportMock();
    vi.stubGlobal("fetch", textTransport);
    const textApp = createApp({ memoryStore: textStore });
    const textResponse = await webhook(textApp, evolutionTextPayload(command, "stock-text-001"));
    const textBody = textResponse.json();
    await textApp.close();

    const audioStore = new InMemoryStore();
    addPente(audioStore);
    const audioTransport = transportMock();
    vi.stubGlobal("fetch", audioTransport);
    const transcriber: AudioTranscriptionService = {
      transcribe: vi.fn(async () => ({ transcript: command, provider: "local_whisper:test" })),
    };
    const audioApp = createApp({ memoryStore: audioStore, audioTranscriptionService: transcriber });
    const audioResponse = await webhook(audioApp, evolutionAudioPayload("stock-audio-001"));
    const audioBody = audioResponse.json();

    expect(textBody.preview).toEqual(audioBody.preview);
    expect(textBody).toMatchObject({ intent: "stock_entry", executed: false, audio: false });
    expect(audioBody).toMatchObject({ intent: "stock_entry", executed: false, audio: true });
    expect(sentTexts(audioTransport).at(-1)).toContain("Entrada de estoque");
    expect(sentTexts(audioTransport).at(-1)).toMatch(/Custo unitário de compra: R\$\s*5,00/);
    expect(sentTexts(audioTransport).at(-1)).toMatch(/Custo total: R\$\s*40,00/);
    expect(sentTexts(audioTransport).at(-1)).toMatch(/Preço de venda atual: R\$\s*12,00/);
    expect(sentTexts(audioTransport).at(-1)).not.toMatch(/financeir|despesa/i);
    expect(sentTexts(audioTransport).at(-1)).toContain("CONFIRMAR ou CANCELAR");
    expect([...textTransport.mock.calls, ...audioTransport.mock.calls].some(([url]) => /gemini|openai|qwen/i.test(String(url)))).toBe(false);
    await audioApp.close();
  });

  it("prévia e cancelamento não alteram estoque, preço, movimento ou financeiro", async () => {
    const store = new InMemoryStore();
    const fetchMock = transportMock();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ memoryStore: store });
    const product = store.products.find((item) => item.id === "prd-pomada")!;
    const before = { stockQty: product.stockQty, salePrice: product.salePrice };
    const preview = await webhook(app, evolutionTextPayload("Adiciona dez pomadas no estoque. Paguei cem reais no total.", "stock-preview-001"));
    expect(preview.json()).toMatchObject({ intent: "stock_entry", executed: false });
    expect(product).toMatchObject(before);
    expect(store.stockMovements).toHaveLength(0);
    expect(store.financialEntries).toHaveLength(0);
    const cancelled = await webhook(app, evolutionTextPayload("CANCELAR", "stock-cancel-001"));
    expect(cancelled.json()).toMatchObject({ cancelled: true, executed: false });
    expect(product).toMatchObject(before);
    expect(store.stockMovements).toHaveLength(0);
    expect(store.financialEntries).toHaveLength(0);
    expect(store.auditEvents.filter((event) => event.action === "STOCK_ENTRY_CONFIRMED")).toHaveLength(0);
    await app.close();
  });

  it("não confirma entrada com respostas aproximadas ou acrescidas", async () => {
    const store = new InMemoryStore();
    const fetchMock = transportMock();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ memoryStore: store });
    const product = store.products.find((item) => item.id === "prd-pomada")!;
    const stockBefore = product.stockQty;
    await webhook(app, evolutionTextPayload(
      "Adiciona 2 pomadas no estoque por 5 reais cada.",
      "stock-strict-preview-001",
    ));

    for (const [index, invalidConfirmation] of [
      "sim",
      "ok",
      "beleza",
      "confirma",
      "confirmado",
      "pode confirmar",
      "CONFIRMAR agora",
    ].entries()) {
      const response = await webhook(app, evolutionTextPayload(invalidConfirmation, `stock-strict-invalid-${index}`));
      expect(response.json()).toMatchObject({ intent: "stock_entry", executed: false, pendingPreserved: true });
    }

    expect(product.stockQty).toBe(stockBefore);
    expect(store.stockMovements).toHaveLength(0);
    expect(store.financialEntries).toHaveLength(0);
    expect(store.auditEvents.filter((event) => event.action === "STOCK_ENTRY_CONFIRMED")).toHaveLength(0);
    await app.close();
  });

  it("cancela somente com CANCELAR exato e normaliza caixa e espaços externos", async () => {
    const store = new InMemoryStore();
    const fetchMock = transportMock();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ memoryStore: store });
    const product = store.products.find((item) => item.id === "prd-pomada")!;
    const stockBefore = product.stockQty;
    await webhook(app, evolutionTextPayload(
      "Adiciona 2 pomadas no estoque por 5 reais cada.",
      "stock-strict-cancel-preview-001",
    ));

    for (const [index, invalidCancellation] of ["cancela", "CANCELAR agora"].entries()) {
      const response = await webhook(app, evolutionTextPayload(invalidCancellation, `stock-strict-cancel-invalid-${index}`));
      expect(response.json()).toMatchObject({ intent: "stock_entry", executed: false, pendingPreserved: true });
    }
    const cancelled = await webhook(app, evolutionTextPayload("  cAnCeLaR  ", "stock-strict-cancel-valid-001"));
    expect(cancelled.json()).toMatchObject({ intent: "stock_entry", executed: false, cancelled: true });
    expect(product.stockQty).toBe(stockBefore);
    expect(store.stockMovements).toHaveLength(0);
    expect(store.financialEntries).toHaveLength(0);
    expect(store.auditEvents.filter((event) => event.action === "STOCK_ENTRY_CONFIRMED")).toHaveLength(0);
    await app.close();
  });

  it("confirma após recriar o app, repete confirmação e deduplica webhook", async () => {
    const store = new InMemoryStore();
    const fetchMock = transportMock();
    vi.stubGlobal("fetch", fetchMock);
    let app = createApp({ memoryStore: store });
    const product = store.products.find((item) => item.id === "prd-pomada")!;
    const before = { stockQty: product.stockQty, salePrice: product.salePrice, costPrice: product.costPrice };
    const payload = evolutionTextPayload("Adiciona dez pomadas no estoque. Paguei cem reais no total.", "stock-persist-001");
    await webhook(app, payload);
    const duplicate = await webhook(app, payload);
    expect(duplicate.json()).toMatchObject({ replay: true, deduplicated: true, executed: false });
    await app.close();

    app = createApp({ memoryStore: store });
    const confirmed = await webhook(app, evolutionTextPayload("  cOnFiRmAr  ", "stock-confirm-001"));
    const repeated = await webhook(app, evolutionTextPayload("CONFIRMAR", "stock-confirm-002"));
    expect(confirmed.json()).toMatchObject({ executed: true, replay: false });
    expect(repeated.json()).toMatchObject({ executed: true, replay: true });
    expect(product).toMatchObject({ stockQty: before.stockQty + 10, salePrice: before.salePrice, costPrice: before.costPrice });
    expect(store.stockMovements).toHaveLength(1);
    expect(store.financialEntries).toHaveLength(0);
    await app.close();
  });

  it("bloqueia nova entrada e preserva integralmente a prévia anterior", async () => {
    const store = new InMemoryStore();
    const fetchMock = transportMock();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ memoryStore: store });
    const product = store.products.find((item) => item.id === "prd-pomada")!;
    const stockBefore = product.stockQty;
    const original = await webhook(app, evolutionTextPayload(
      "Adiciona 2 pomadas no estoque por 5 reais cada.",
      "stock-pending-original-001",
    ));
    const originalBody = original.json();
    const blocked = await webhook(app, evolutionTextPayload(
      "Adiciona 8 pomadas no estoque por 7 reais cada.",
      "stock-pending-new-intent-001",
    ));

    expect(blocked.json()).toMatchObject({
      intent: "stock_entry",
      executed: false,
      pendingPreserved: true,
      newStockEntryBlocked: true,
    });
    expect(sentTexts(fetchMock).at(-1)).toContain("Responda CONFIRMAR, CANCELAR ou envie uma correção antes de iniciar outra entrada");
    const stored = [...store.aiWhatsappStockEntryPreviews.values()][0] as { preview: StockEntryPreview };
    expect(stored.preview).toMatchObject({
      id: originalBody.previewId,
      draft: { quantity: 2, unitCost: 5, totalCost: 10, salePrice: 59 },
    });
    expect(product.stockQty).toBe(stockBefore);
    expect(store.stockMovements).toHaveLength(0);
    expect(store.financialEntries).toHaveLength(0);
    expect(store.auditEvents.filter((event) => event.action === "STOCK_ENTRY_CONFIRMED")).toHaveLength(0);

    const confirmed = await webhook(app, evolutionTextPayload("CONFIRMAR", "stock-pending-confirm-001"));
    expect(confirmed.json()).toMatchObject({ executed: true });
    expect(product.stockQty).toBe(stockBefore + 2);
    expect(store.stockMovements).toHaveLength(1);
    expect(store.financialEntries).toHaveLength(0);
    await app.close();
  });

  it("falha fechado quando o Whisper local está indisponível", async () => {
    const store = new InMemoryStore();
    const before = store.products.find((item) => item.id === "prd-pomada")!.stockQty;
    const fetchMock = transportMock();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ memoryStore: store, audioTranscriptionService: null });
    const response = await webhook(app, evolutionAudioPayload("stock-audio-unavailable-001"));
    expect(response.json()).toMatchObject({ executed: false, audio: true, reason: "audio_transcription_unavailable" });
    expect(store.products.find((item) => item.id === "prd-pomada")!.stockQty).toBe(before);
    expect(store.stockMovements).toHaveLength(0);
    await app.close();
  });

  it("mantém idempotência quando a Evolution falha após a transação", async () => {
    const store = new InMemoryStore();
    let failSend = false;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/message/sendText/")) return { ok: !failSend, status: failSend ? 503 : 200, text: async () => "" };
      throw new Error(`Chamada externa inesperada: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ memoryStore: store });
    await webhook(app, evolutionTextPayload("Adiciona 2 pomadas no estoque. Paguei dez reais no total.", "stock-evolution-preview-001"));
    failSend = true;
    const confirmed = await webhook(app, evolutionTextPayload("CONFIRMAR", "stock-evolution-confirm-001"));
    expect(confirmed.json()).toMatchObject({ executed: true, replay: false, responseDelivered: false });
    failSend = false;
    const retry = await webhook(app, evolutionTextPayload("CONFIRMAR", "stock-evolution-confirm-002"));
    expect(retry.json()).toMatchObject({ executed: true, replay: true, responseDelivered: true });
    expect(store.stockMovements).toHaveLength(1);
    expect(store.financialEntries).toHaveLength(0);
    await app.close();
  });

  it("bloqueia telefone sem RBAC e mantém isolamento", async () => {
    const store = new InMemoryStore();
    const before = store.products.find((item) => item.id === "prd-pomada")!.stockQty;
    const fetchMock = transportMock();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ memoryStore: store });
    const response = await webhook(app, evolutionTextPayload(
      "Adiciona dez pomadas no estoque. Paguei cem reais no total.",
      "stock-unauthorized-001",
      "5511888888888",
    ));
    expect(response.json()).toMatchObject({ ignored: true });
    expect(store.products.find((item) => item.id === "prd-pomada")!.stockQty).toBe(before);
    expect(store.stockMovements).toHaveLength(0);
    await app.close();
  });

  it("falha fechado quando a Evolution não fornece messageId ou eventId", async () => {
    const store = new InMemoryStore();
    const before = store.products.find((item) => item.id === "prd-pomada")!.stockQty;
    const fetchMock = transportMock();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ memoryStore: store });
    const payload = evolutionTextPayload("Adiciona dez pomadas no estoque. Paguei cem reais no total.", "");
    const response = await webhook(app, payload);
    expect(response.json()).toMatchObject({ intent: "stock_entry", unavailable: true, executed: false });
    expect(store.products.find((item) => item.id === "prd-pomada")!.stockQty).toBe(before);
    expect(store.aiWhatsappStockEntryPreviews.size).toBe(0);
    await app.close();
  });
});
