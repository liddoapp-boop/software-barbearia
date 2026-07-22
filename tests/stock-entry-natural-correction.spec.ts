import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { interpretStockEntryCorrection, type StockEntryDraft } from "../src/application/stock-entry";
import type { AudioTranscriptionService } from "../src/application/audio-transcription";
import { createApp } from "../src/http/app";
import { InMemoryStore } from "../src/infrastructure/in-memory-store";

const originalEnv = { ...process.env };
const ownerPhone = "5511999999999";
const products = [
  { id: "prd-pomada", name: "Pomada Matte", salePrice: 59 },
  { id: "prd-oleo", name: "Óleo para Barba", salePrice: 42 },
];
const currentDraft: StockEntryDraft = {
  productId: "prd-pomada",
  productName: "Pomada Matte",
  quantity: 2,
  unitCost: 5,
  totalCost: 10,
  salePrice: 59,
  occurredAt: "2026-07-20T12:00:00.000-03:00",
};

function textPayload(text: string, messageId: string) {
  return {
    instance: "test-instance",
    data: {
      key: { id: messageId, remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false },
      message: { conversation: text },
    },
  };
}

function audioPayload(messageId: string) {
  return {
    instance: "test-instance",
    data: {
      key: { id: messageId, remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false },
      messageType: "audioMessage",
      message: { audioMessage: { mimetype: "audio/ogg; codecs=opus", fileLength: 4, seconds: 5, ptt: true } },
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

describe("correções naturais de quantidade da prévia", () => {
  it.each([
    "Na verdade, foram 3 pomadas.",
    "Me enganei, são 3.",
    "A quantidade correta é 3.",
    "Corrige para três unidades.",
  ])("altera somente a quantidade: %s", (message) => {
    const before = structuredClone(currentDraft);
    expect(interpretStockEntryCorrection({ message, currentDraft, products })).toMatchObject({
      status: "valid",
      changedFields: ["quantity"],
      draft: {
        productId: before.productId,
        productName: before.productName,
        quantity: 3,
        unitCost: before.unitCost,
        totalCost: 15,
        salePrice: before.salePrice,
        occurredAt: before.occurredAt,
      },
    });
    expect(currentDraft).toEqual(before);
  });

  it.each([
    "Na verdade, foram 3 ou 4 pomadas.",
    "Me enganei, são 3 reais.",
    "Corrige para 3 Pomadas Brilho.",
  ])("rejeita formulação realmente ambígua sem mutar a prévia: %s", (message) => {
    const before = structuredClone(currentDraft);
    expect(interpretStockEntryCorrection({ message, currentDraft, products }))
      .toMatchObject({ status: "invalid", reason: "quantity_invalid" });
    expect(currentDraft).toEqual(before);
  });
});

describe("regressão texto, áudio e fluxo misto da correção natural", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    Object.assign(process.env, {
      NODE_ENV: "test",
      HTTP_LOG_ENABLED: "false",
      DATA_BACKEND: "memory",
      AUTH_ENFORCED: "true",
      AI_WHATSAPP_ENABLED: "true",
      AI_WHATSAPP_OWNER_PHONE: ownerPhone,
      AI_WHATSAPP_UNIT_ID: "unit-01",
      EVOLUTION_WEBHOOK_SECRET: "test-webhook-secret",
      EVOLUTION_API_URL: "http://evolution.local",
      EVOLUTION_API_KEY: "test-evolution-key",
      EVOLUTION_INSTANCE_NAME: "test-instance",
      AI_WHATSAPP_AUDIO_ENABLED: "true",
      AI_AUDIO_TRANSCRIPTION_ENABLED: "true",
      ASR_PROVIDER: "local_whisper",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it.each([
    { name: "texto para texto", initialAudio: false, correctionAudio: false, correction: "Na verdade, foram 3 pomadas." },
    { name: "texto para áudio", initialAudio: false, correctionAudio: true, correction: "Me enganei, são 3." },
    { name: "áudio para texto", initialAudio: true, correctionAudio: false, correction: "A quantidade correta é 3." },
  ])("preserva campos e não cria efeitos no fluxo $name", async (scenario) => {
    const store = new InMemoryStore();
    const fetchMock = transportMock();
    vi.stubGlobal("fetch", fetchMock);
    const initialText = "Entraram duas Pomadas Matte no estoque, por cinco reais cada.";
    const transcripts = [
      scenario.initialAudio ? initialText : null,
      scenario.correctionAudio ? scenario.correction : null,
    ].filter(Boolean) as string[];
    const transcriber: AudioTranscriptionService = {
      transcribe: vi.fn(async () => ({ transcript: transcripts.shift()!, provider: "local_whisper:test" })),
    };
    const app = createApp({
      memoryStore: store,
      audioTranscriptionService: scenario.initialAudio || scenario.correctionAudio ? transcriber : undefined,
      ownerCommandParser: null,
    });
    const product = store.products.find((item) => item.id === "prd-pomada")!;
    const before = { stockQty: product.stockQty, salePrice: product.salePrice, costPrice: product.costPrice };

    const initial = await webhook(app, scenario.initialAudio
      ? audioPayload(`natural-${scenario.name}-initial-audio`)
      : textPayload(initialText, `natural-${scenario.name}-initial-text`));
    const corrected = await webhook(app, scenario.correctionAudio
      ? audioPayload(`natural-${scenario.name}-correction-audio`)
      : textPayload(scenario.correction, `natural-${scenario.name}-correction-text`));

    expect(initial.json()).toMatchObject({
      intent: "stock_entry",
      executed: false,
      preview: { productName: "Pomada Matte", quantity: 2, unitCost: 5, totalCost: 10, salePrice: 59 },
    });
    expect(corrected.json()).toMatchObject({
      intent: "stock_entry",
      corrected: true,
      executed: false,
      audio: scenario.correctionAudio,
      preview: { productName: "Pomada Matte", quantity: 3, unitCost: 5, totalCost: 15, salePrice: 59 },
    });
    expect(product).toMatchObject(before);
    expect(store.stockMovements).toHaveLength(0);
    expect(store.financialEntries).toHaveLength(0);
    expect(store.auditEvents.find((event) => event.action === "AI_WHATSAPP_STOCK_ENTRY_PREVIEW_CORRECTED")?.afterJson)
      .toMatchObject({
        changedFields: ["quantity"],
        semanticProviderInvoked: false,
        canonicalDraft: { productId: "prd-pomada", quantity: 3, unitCost: 5, totalCost: 15, salePrice: 59 },
      });
    expect(fetchMock.mock.calls.some(([url]) => /gemini|openai|qwen|11435/i.test(String(url)))).toBe(false);
    expect(transcriber.transcribe).toHaveBeenCalledTimes(Number(scenario.initialAudio) + Number(scenario.correctionAudio));
    await app.close();
  });

  it("reproduz o Ogg real cuja transcricao usa pomadas mate e cria somente a previa correta", async () => {
    const fixture = readFileSync(path.resolve("tests/fixtures/evolution-stock-entry-mate-real.ogg"));
    const store = new InMemoryStore();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/chat/getBase64FromMediaMessage/")) {
        return { ok: true, headers: { get: () => null }, json: async () => ({ base64: fixture.toString("base64") }) };
      }
      if (url.includes("/message/sendText/")) return { ok: true, status: 200, text: async () => "" };
      throw new Error(`Chamada externa inesperada: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const transcriber: AudioTranscriptionService = {
      transcribe: vi.fn(async () => ({
        transcript: "Entraram duas pomadas mate no estoque. Cinco reais cada uma.",
        provider: "local_whisper:ggml-large-v3-turbo-q5_0.bin",
      })),
    };
    const app = createApp({ memoryStore: store, audioTranscriptionService: transcriber, ownerCommandParser: null });
    const product = store.products.find((item) => item.id === "prd-pomada")!;
    const before = {
      stockQty: product.stockQty,
      costPrice: product.costPrice,
      salePrice: product.salePrice,
      movements: store.stockMovements.length,
      financial: store.financialEntries.length,
    };
    const payload = audioPayload("captured-mate-real-001");
    payload.data.message.audioMessage.fileLength = fixture.length;
    payload.data.message.audioMessage.seconds = 6;

    const response = await webhook(app, payload);
    const replay = await webhook(app, payload);

    expect(response.json()).toMatchObject({
      intent: "stock_entry",
      audio: true,
      executed: false,
      preview: {
        productId: "prd-pomada",
        productName: "Pomada Matte",
        quantity: 2,
        unitCost: 5,
        totalCost: 10,
        salePrice: 59,
      },
    });
    expect(replay.json()).toMatchObject({ replay: true, deduplicated: true, executed: false });
    expect(transcriber.transcribe).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("getBase64FromMediaMessage"))).toHaveLength(1);
    expect(product).toMatchObject({
      stockQty: before.stockQty,
      costPrice: before.costPrice,
      salePrice: before.salePrice,
    });
    expect(store.stockMovements).toHaveLength(before.movements);
    expect(store.financialEntries).toHaveLength(before.financial);
    expect(store.auditEvents.find((event) => event.action === "AI_WHATSAPP_STOCK_ENTRY_PRODUCT_RESOLVED"))
      .toMatchObject({ unitId: "unit-01", entityId: "prd-pomada" });
    await app.close();
  });
});
