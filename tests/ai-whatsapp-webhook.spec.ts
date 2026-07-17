import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { createApp } from "../src/http/app";
import { InMemoryStore } from "../src/infrastructure/in-memory-store";

const originalEnv = { ...process.env };

function mockGeminiInvalidJsonAndWhatsapp() {
  return vi.fn(async (url: string) => {
    if (String(url).includes("/message/sendText/")) return { ok: true, text: async () => "" };
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "{" }] } }],
      }),
    };
  });
}

function mockGeminiUnavailableAndWhatsapp() {
  return vi.fn(async (url: string): Promise<{ ok: boolean; status?: number; text: () => Promise<string> }> => {
    if (String(url).includes("/message/sendText/")) return { ok: true, text: async () => "" };
    return { ok: false, status: 429, text: async () => "" };
  });
}

function mockGeminiTimeoutAndWhatsapp() {
  return vi.fn(async (url: string) => {
    if (String(url).includes("/message/sendText/")) return { ok: true, text: async () => "" };
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  });
}

function mockGeminiInvalidSchemaAndWhatsapp() {
  return vi.fn(async (url: string) => {
    if (String(url).includes("/message/sendText/")) return { ok: true, text: async () => "" };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"intent":"invalid"}' }] } }] }) };
  });
}

function mockGeminiAndFailedWhatsapp() {
  return vi.fn(async (url: string) => {
    if (String(url).includes("/message/sendText/")) return { ok: false, status: 503, text: async () => "unavailable" };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "{" }] } }] }) };
  });
}

function mockGeminiIntentAndWhatsapp(
  intent: string,
  draft: Record<string, unknown>,
  summary = "Previa gerada para WhatsApp.",
) {
  return vi.fn(async (url: string) => {
    if (String(url).includes("/message/sendText/")) return { ok: true, text: async () => "" };
    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    ok: true,
                    mode: "preview_only",
                    intent,
                    confidence: 0.9,
                    summary,
                    draft,
                    missingFields: [],
                    warnings: [],
                    allowedNextActions: [],
                    executed: false,
                  }),
                },
              ],
            },
          },
        ],
      }),
    };
  });
}

function mockSemanticScheduleAndWhatsapp(fields: Partial<{
  clientName: string;
  serviceNames: string[];
  professionalName: string;
  date: string;
  time: string;
  confidence: number;
  missingFields: string[];
}> = {}) {
  return vi.fn(async (url: string) => {
    if (String(url).includes("/message/sendText/")) return { ok: true, text: async () => "" };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          intent: "schedule_appointment",
          clientName: "",
          serviceNames: [],
          professionalName: "",
          date: "",
          time: "",
          confidence: 0.9,
          missingFields: [],
          ...fields,
        }) }] } }],
      }),
    };
  });
}

function mockSemanticV2ScheduleAndWhatsapp(input: {
  clientName: string;
  clientEvidence: string;
  serviceName: string;
  serviceEvidence: string;
  date?: string;
  dateEvidence?: string;
  time?: string;
  timeEvidence?: string;
  timeAmbiguous?: boolean;
  timePrecision?: "exact" | "approximate" | "unspecified";
  professionalName?: string;
  professionalEvidence?: string;
}) {
  return vi.fn(async (url: string) => {
    if (String(url).includes("/message/sendText/")) return { ok: true, text: async () => "" };
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        schemaVersion: "1.0",
        intent: "schedule_appointment",
        intentConfidence: 0.96,
        fields: {
          clientName: { value: input.clientName, evidence: input.clientEvidence, confidence: 0.96 },
          serviceNames: { values: [input.serviceName], evidence: input.serviceEvidence, confidence: 0.95 },
          professionalName: input.professionalName
            ? { value: input.professionalName, evidence: input.professionalEvidence ?? input.professionalName, confidence: 0.96 }
            : { value: "", evidence: "", confidence: 0 },
          date: input.date
            ? { expression: input.dateEvidence, canonical: input.date, evidence: input.dateEvidence, confidence: 0.96 }
            : { expression: "", canonical: "", evidence: "", confidence: 0 },
          time: {
            expression: input.timeEvidence ?? "",
            canonical: input.time ?? "",
            period: "unspecified",
            ambiguous: input.timeAmbiguous === true,
            precision: input.timePrecision ?? (input.timeAmbiguous ? "unspecified" : "exact"),
            evidence: input.timeEvidence ?? "",
            confidence: input.timeAmbiguous ? 0.6 : input.time ? 0.96 : 0,
          },
        },
        ambiguities: input.timeAmbiguous ? [{ field: "time", reason: "Periodo nao informado." }] : [],
        missingFields: [input.date ? "" : "date", input.time || input.timeAmbiguous ? "" : "time"].filter(Boolean),
      }) }] } }] }),
    };
  });
}

async function createWhatsappTestClient(app: FastifyInstance, token: string, suffix: string) {
  return createNamedWhatsappTestClient(app, token, "João Victor", suffix);
}

async function createNamedWhatsappTestClient(app: FastifyInstance, token: string, name: string, suffix: string) {
  const response = await app.inject({
    method: "POST",
    url: "/clients",
    headers: { authorization: `Bearer ${token}` },
    payload: { unitId: "unit-01", name, phone: `55119876${suffix.padStart(5, "0")}` },
  });
  expect(response.statusCode).toBe(200);
  return response.json().client as { id: string; fullName?: string; name?: string };
}

async function loginOwner(app: FastifyInstance) {
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    },
  });
  expect(response.statusCode).toBe(200);
  return response.json().accessToken as string;
}

function evolutionPayload(text: string, phone = "5511999999999", overrides: Record<string, unknown> = {}) {
  return {
    instance: "test-instance",
    data: {
      key: {
        remoteJid: `${phone}@s.whatsapp.net`,
        fromMe: false,
      },
      message: { conversation: text },
    },
    ...overrides,
  };
}

async function postWebhook(app: FastifyInstance, payload: Record<string, unknown>) {
  const response = await app.inject({
    method: "POST",
    url: "/webhooks/evolution/whatsapp",
    headers: { "x-evolution-webhook-secret": "test-webhook-secret" },
    payload,
  });
  return response;
}

function sentWhatsAppTexts(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).includes("/message/sendText/"))
    .map(([, init]) => {
      const body = Buffer.isBuffer((init as RequestInit).body)
        ? ((init as RequestInit).body as Buffer).toString("utf8")
        : String((init as RequestInit).body ?? "");
      return JSON.parse(body).text as string;
    });
}

function sentWhatsAppTargets(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).includes("/message/sendText/"))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body ?? "{}")).number as string);
}

function lastConfirmationCode(fetchMock: ReturnType<typeof vi.fn>) {
  const text = sentWhatsAppTexts(fetchMock).at(-1) ?? "";
  return text.match(/CONFIRMAR\s+(\d{4})/)?.[1] ?? "";
}

function expectPreviewWithoutVisibleCode(fetchMock: ReturnType<typeof vi.fn>) {
  const text = sentWhatsAppTexts(fetchMock).at(-1) ?? "";
  expect(text).toContain("Para confirmar, responda: CONFIRMAR");
  expect(text).toContain("Para cancelar, responda: CANCELAR");
  expect(text).not.toMatch(/CONFIRMAR\s+\d{4}/);
}

async function countCommercialState(app: FastifyInstance, token: string) {
  const [appointments, inventory, financial, sales, audit] = await Promise.all([
    app.inject({
      method: "GET",
      url: "/appointments?unitId=unit-01",
      headers: { authorization: `Bearer ${token}` },
    }),
    app.inject({
      method: "GET",
      url: "/inventory?unitId=unit-01",
      headers: { authorization: `Bearer ${token}` },
    }),
    app.inject({
      method: "GET",
      url: "/financial/entries?unitId=unit-01&start=2026-01-01T00:00:00.000Z&end=2026-12-31T23:59:59.999Z",
      headers: { authorization: `Bearer ${token}` },
    }),
    app.inject({
      method: "GET",
      url: "/sales/products?unitId=unit-01&start=2026-01-01T00:00:00.000Z&end=2026-12-31T23:59:59.999Z&limit=500",
      headers: { authorization: `Bearer ${token}` },
    }),
    app.inject({
      method: "GET",
      url: "/audit/events?unitId=unit-01&limit=500",
      headers: { authorization: `Bearer ${token}` },
    }),
  ]);
  expect(appointments.statusCode).toBe(200);
  expect(inventory.statusCode).toBe(200);
  expect(financial.statusCode).toBe(200);
  expect(sales.statusCode).toBe(200);
  expect(audit.statusCode).toBe(200);
  const products = inventory.json().products as Array<{ id: string; quantity?: number; stockQty?: number }>;
  return {
    appointments: appointments.json().appointments.length,
    pomadaStock: Number(products.find((item) => item.id === "prd-pomada")?.quantity ?? products.find((item) => item.id === "prd-pomada")?.stockQty ?? 0),
    financialEntries: financial.json().entries.length,
    sales: sales.json().sales.length,
    parsedAudits: (audit.json().events as Array<{ action: string }>).filter((event) => event.action === "AI_WHATSAPP_COMMAND_PARSED").length,
    confirmedAudits: (audit.json().events as Array<{ action: string }>).filter((event) => event.action === "AI_WHATSAPP_COMMAND_CONFIRMED").length,
  };
}

async function auditEvents(app: FastifyInstance, token: string) {
  const response = await app.inject({
    method: "GET",
    url: "/audit/events?unitId=unit-01&limit=500",
    headers: { authorization: `Bearer ${token}` },
  });
  expect(response.statusCode).toBe(200);
  return response.json().events as Array<{ action: string; afterJson?: Record<string, unknown> }>;
}

describe("Atendente IA WhatsApp-first", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "true";
    process.env.GEMINI_API_KEY = "fake-gemini-key-for-test";
    process.env.GEMINI_MODEL = "gemini-test";
    process.env.AI_WHATSAPP_ENABLED = "true";
    process.env.AI_WHATSAPP_OWNER_PHONE = "5511999999999";
    process.env.AI_WHATSAPP_UNIT_ID = "unit-01";
    process.env.EVOLUTION_WEBHOOK_SECRET = "test-webhook-secret";
    process.env.EVOLUTION_API_URL = "http://evolution.local";
    process.env.EVOLUTION_API_KEY = "test-evolution-key";
    process.env.EVOLUTION_INSTANCE_NAME = "test-instance";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    process.env = { ...originalEnv };
  });

  it("bloqueia numero nao autorizado sem enviar resposta", async () => {
    process.env.AI_WHATSAPP_UNIT_ID = "unit-inexistente";
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const response = await postWebhook(app, evolutionPayload("Vendi uma pomada para Lucas no Pix.", "5511888887777"));

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, ignored: true });
    expect(sentWhatsAppTexts(fetchMock)).toEqual([]);
  });

  it("falha fechado quando a unidade da integracao nao esta configurada", async () => {
    delete process.env.AI_WHATSAPP_UNIT_ID;
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const response = await postWebhook(app, evolutionPayload("Agendar corte para Joao amanha as 16:00"));

    expect(response.json()).toMatchObject({
      ok: true,
      executed: false,
      unavailable: true,
      reason: "whatsapp_identity_unavailable",
    });
    expect(sentWhatsAppTexts(fetchMock)).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes("/message/sendText/"))).toHaveLength(0);
  });

  it("falha fechado quando a unidade configurada nao existe", async () => {
    process.env.AI_WHATSAPP_UNIT_ID = "unit-inexistente";
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const response = await postWebhook(app, evolutionPayload("Agendar corte para Joao amanha as 16:00"));

    expect(response.json()).toMatchObject({
      ok: true,
      executed: false,
      unavailable: true,
      reason: "whatsapp_identity_unavailable",
    });
    expect(sentWhatsAppTexts(fetchMock)).toEqual([
      "Nao foi possivel validar o acesso do WhatsApp agora. Tente novamente mais tarde.",
    ]);
    expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes("/message/sendText/"))).toHaveLength(0);
  });

  it("bloqueia owner sem acesso owner ativo a unidade configurada", async () => {
    process.env.AUTH_USERS_JSON = JSON.stringify([{
      id: "owner-sem-acesso",
      email: "owner-sem-acesso@example.local",
      password: "senha-segura",
      role: "owner",
      unitIds: ["unit-02"],
    }]);
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const response = await postWebhook(app, evolutionPayload("Agendar corte para Joao amanha as 16:00"));

    expect(response.json()).toMatchObject({ unavailable: true, reason: "whatsapp_identity_unavailable" });
    expect(sentWhatsAppTexts(fetchMock)).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes("/message/sendText/"))).toHaveLength(0);
  });

  it("falha fechado quando mais de um owner pode representar a integracao", async () => {
    process.env.AUTH_USERS_JSON = JSON.stringify([
      { id: "owner-a", email: "owner-a@example.local", password: "senha-a", role: "owner", unitIds: ["unit-01"] },
      { id: "owner-b", email: "owner-b@example.local", password: "senha-b", role: "owner", unitIds: ["unit-01"] },
    ]);
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const response = await postWebhook(app, evolutionPayload("Agendar corte para Joao amanha as 16:00"));

    expect(response.json()).toMatchObject({ unavailable: true, reason: "whatsapp_identity_unavailable" });
    expect(sentWhatsAppTexts(fetchMock)).toHaveLength(1);
  });

  it("ignora unitId injetado pelo payload e mantem a unidade configurada", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);

    const response = await postWebhook(app, evolutionPayload(
      "Vendi uma pomada para Joao Santos, ele pagou no Pix.",
      ["55", "11", "99999", "9999"].join(""),
      { unitId: "unit-02", data: {
        unitId: "unit-02",
        key: { remoteJid: `${["55", "11", "99999", "9999"].join("")}@s.whatsapp.net`, fromMe: false },
        message: { conversation: "Vendi uma pomada para Joao Santos, ele pagou no Pix." },
      } },
    ));

    expect(response.json()).toMatchObject({ mode: "preview_only", intent: "sell_product", executed: false });
    const received = (await auditEvents(app, token)).find((event) => event.action === "AI_WHATSAPP_WEBHOOK_RECEIVED");
    expect(received?.afterJson).toMatchObject({ origin: "whatsapp_webhook", actorRole: "owner" });
    expect(received?.afterJson?.unitFingerprint).toBeTypeOf("string");
    expect(JSON.stringify(received)).not.toContain("unit-02");
  });

  it("autoriza payload LID sanitizado pelo remoteJidAlt e responde ao telefone real", async () => {
    process.env.AI_WHATSAPP_OWNER_PHONE = ["55", "11", "99999", "9452"].join("");
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    const response = await postWebhook(app, evolutionPayload("Vendi uma pomada para Joao Santos, ele pagou no Pix.", ["55", "11", "99999", "9452"].join(""), {
      data: {
        key: {
          remoteJid: `${["999", "999", "999", "999", "744"].join("")}@lid`,
          remoteJidAlt: `${["55", "11", "99999", "9452"].join("")}@s.whatsapp.net`,
          fromMe: false,
        },
        message: { conversation: "Vendi uma pomada para Joao Santos, ele pagou no Pix." },
      },
    }));

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ mode: "preview_only", intent: "sell_product", executed: false });
    expect(sentWhatsAppTargets(fetchMock).at(-1)).toBe("5511999999452");
    const events = await auditEvents(app, token);
    expect(events.some((event) => event.action === "AI_WHATSAPP_PIPELINE_RECEIVED" && typeof event.afterJson?.correlationId === "string")).toBe(true);
    await expect(countCommercialState(app, token)).resolves.toEqual({
      ...before,
      parsedAudits: before.parsedAudits + 1,
    });
  });

  it("nunca autoriza owner pelos digitos do LID", async () => {
    process.env.AI_WHATSAPP_OWNER_PHONE = "55999999999999744";
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const response = await postWebhook(app, evolutionPayload("Vendi uma pomada para Lucas no Pix.", "55999999999999744", {
      data: {
        key: {
          remoteJid: "999999999999744@lid",
          remoteJidAlt: "5511999999452@s.whatsapp.net",
          fromMe: false,
        },
        message: { conversation: "Vendi uma pomada para Lucas no Pix." },
      },
    }));

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, ignored: true });
    expect(sentWhatsAppTexts(fetchMock)).toEqual([]);
  });

  it("ignora mensagem de grupo", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const response = await postWebhook(app, evolutionPayload("Vendi uma pomada para Lucas no Pix.", "5511999999999", {
      data: {
        key: { remoteJid: "120363000000@g.us", participant: "5511999999999@s.whatsapp.net", fromMe: false },
        message: { conversation: "Vendi uma pomada para Lucas no Pix." },
      },
    }));

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, ignored: true });
    expect(sentWhatsAppTexts(fetchMock)).toEqual([]);
  });

  it("payload incompleto do owner recebe orientacao controlada", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const response = await postWebhook(app, evolutionPayload("", "5511999999999", { data: { key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false }, message: {} } }));

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, ignored: true, responseDelivered: true });
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toBe("Não recebi informações suficientes para identificar uma operação. Envie o produto, a quantidade e os demais dados necessários.");
  });

  it("texto de venda gera previa e nao executa", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    const response = await postWebhook(app, evolutionPayload("Vendi uma pomada para Joao Santos, ele pagou no Pix."));

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ mode: "preview_only", intent: "sell_product", executed: false });
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("Para confirmar, responda: CONFIRMAR");
    expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes("/message/sendText/")).length).toBe(0);
    await expect(countCommercialState(app, token)).resolves.toEqual({
      ...before,
      parsedAudits: before.parsedAudits + 1,
    });
  });

  it("A: gera previa direta e confirma venda avulsa sem cliente vinculado", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    const app = createApp({ memoryStore: store });
    const before = {
      clients: store.clients.length,
      sales: store.productSales.length,
      stock: store.products.find((item) => item.id === "prd-pomada")?.stockQty,
      financial: store.financialEntries.length,
      commissions: store.commissionEntries.length,
    };

    const preview = await postWebhook(app, evolutionPayload("Registrar venda de 1 Pomada com pagamento Pix"));

    expect(preview.json()).toMatchObject({ mode: "preview_only", intent: "sell_product", executed: false });
    expect(sentWhatsAppTexts(fetchMock)).toHaveLength(1);
    expect(sentWhatsAppTexts(fetchMock)[0]).toContain("Cliente: nao vinculado");
    expect(sentWhatsAppTexts(fetchMock)[0]).toContain("Produto: Pomada Matte");
    expect(sentWhatsAppTexts(fetchMock)[0]).toContain("Quantidade: 1");
    expect(sentWhatsAppTexts(fetchMock)[0]).toContain("Pagamento: Pix");
    expect(sentWhatsAppTexts(fetchMock)[0]).not.toContain("confirmar cliente");
    const parserAudit = store.auditEvents.find((event) => event.action === "AI_WHATSAPP_PARSER_COMPLETED");
    expect(parserAudit?.afterJson).toMatchObject({ intent: "sell_product", missingFields: [] });
    expect((parserAudit?.afterJson?.presentFields as string[]) ?? []).not.toContain("clientName");
    const groundingAudit = store.auditEvents.find((event) => event.action === "AI_WHATSAPP_ENTITY_RESOLUTION_COMPLETED");
    expect(groundingAudit?.afterJson).toMatchObject({
      entities: [{ entity: "product" }, { entity: "payment" }],
    });
    expect({
      clients: store.clients.length,
      sales: store.productSales.length,
      stock: store.products.find((item) => item.id === "prd-pomada")?.stockQty,
      financial: store.financialEntries.length,
      commissions: store.commissionEntries.length,
    }).toEqual(before);

    const confirmation = await postWebhook(app, evolutionPayload("CONFIRMAR"));

    expect(confirmation.json()).toMatchObject({ ok: true, executed: true });
    expect(store.productSales).toHaveLength(before.sales + 1);
    expect(store.productSales.at(-1)?.clientId).toBeUndefined();
    expect(store.clients).toHaveLength(before.clients);
  });

  it.each([
    ["PIX", "Pix"],
    ["dinheiro", "Dinheiro"],
    ["débito", "Cartao de debito"],
    ["crédito", "Cartao de credito"],
  ])("preserva %s da prévia WhatsApp até o lançamento financeiro", async (requestedPayment, expectedPaymentMethod) => {
    const fetchMock = mockGeminiIntentAndWhatsapp("sell_product", {
      productName: "Pomada",
      quantity: 1,
      paymentMethod: requestedPayment,
    });
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    const app = createApp({ memoryStore: store });
    const token = await loginOwner(app);

    const preview = await postWebhook(app, evolutionPayload(`Vendi uma Pomada com pagamento ${requestedPayment}.`));
    expect(preview.json()).toMatchObject({ mode: "preview_only", intent: "sell_product", executed: false });
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain(`Pagamento: ${expectedPaymentMethod}`);

    const confirmation = await postWebhook(app, evolutionPayload("CONFIRMAR"));
    expect(confirmation.json()).toMatchObject({ ok: true, executed: true });

    const replay = await postWebhook(app, evolutionPayload("CONFIRMAR"));
    expect(replay.json()).toMatchObject({ ok: true, executed: false });

    const entries = await app.inject({
      method: "GET",
      url: "/financial/entries?unitId=unit-01&start=2026-01-01T00:00:00.000Z&end=2026-12-31T23:59:59.999Z",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(entries.statusCode).toBe(200);
    expect(entries.json().entries).toContainEqual(expect.objectContaining({
      source: "PRODUCT",
      amount: 59,
      paymentMethod: expectedPaymentMethod,
    }));
    expect(store.productSales).toHaveLength(1);
    expect(store.financialEntries).toHaveLength(1);
    expect(store.financialEntries[0]?.paymentMethod).toBe(expectedPaymentMethod);
    expect(store.products.find((item) => item.id === "prd-pomada")?.stockQty).toBe(14);
    expect(store.stockMovements).toHaveLength(1);
    expect(store.stockAlerts).toHaveLength(0);
  });

  it("B: gera previa direta para dois Gel no Pix sem cliente", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    store.products.push({
      id: "prd-gel",
      name: "Gel",
      category: "Finalizacao",
      salePrice: 35,
      costPrice: 12,
      stockQty: 10,
      minStockAlert: 2,
      active: true,
    });
    const app = createApp({ memoryStore: store });

    const response = await postWebhook(app, evolutionPayload("Vender 2 Gel no Pix"));

    expect(response.json()).toMatchObject({ mode: "preview_only", intent: "sell_product", executed: false });
    expect(sentWhatsAppTexts(fetchMock)).toHaveLength(1);
    expect(sentWhatsAppTexts(fetchMock)[0]).toContain("Cliente: nao vinculado");
    expect(sentWhatsAppTexts(fetchMock)[0]).toContain("Produto: Gel");
    expect(sentWhatsAppTexts(fetchMock)[0]).toContain("Quantidade: 2");
  });

  it("C: faz grounding do cliente quando a venda menciona nome exato", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    await createNamedWhatsappTestClient(app, token, "João Vittor", "201");

    const response = await postWebhook(
      app,
      evolutionPayload("Registrar venda de 1 Pomada para João Vittor com pagamento Pix"),
    );

    expect(response.json()).toMatchObject({ mode: "preview_only", intent: "sell_product", executed: false });
    expect(sentWhatsAppTexts(fetchMock)).toHaveLength(1);
    expect(sentWhatsAppTexts(fetchMock)[0]).toContain("Cliente: João Vittor");
  });

  it("D: pede esclarecimento quando o cliente mencionado e ambiguo", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    await createNamedWhatsappTestClient(app, token, "João Vittor", "202");

    const response = await postWebhook(
      app,
      evolutionPayload("Registrar venda de 1 Pomada para João com pagamento Pix"),
    );

    expect(response.json()).toMatchObject({ ok: true, intent: "sell_product", executed: false });
    expect(lastConfirmationCode(fetchMock)).toBe("");
    expect(sentWhatsAppTexts(fetchMock)).toEqual([
      "Preciso confirmar cliente com seguranca. Informe o nome exato.",
    ]);
  });

  it("nao cria automaticamente cliente inexistente mencionado na venda", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    const app = createApp({ memoryStore: store });
    const clientsBefore = store.clients.length;

    const response = await postWebhook(
      app,
      evolutionPayload("Registrar venda de 1 Pomada para Cliente Fantasma com pagamento Pix"),
    );

    expect(response.json()).toMatchObject({ ok: true, intent: "sell_product", executed: false });
    expect(lastConfirmationCode(fetchMock)).toBe("");
    expect(sentWhatsAppTexts(fetchMock)).toEqual([
      "Preciso confirmar cliente com seguranca. Informe o nome exato.",
    ]);
    expect(store.clients).toHaveLength(clientsBefore);
    expect(store.productSales).toHaveLength(0);
  });

  it("E: CANCELAR limpa o agendamento anterior antes de uma venda avulsa", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    await createNamedWhatsappTestClient(app, token, "João Vittor", "203");

    const scheduling = await postWebhook(
      app,
      evolutionPayload("Agendar corte para João Vittor dia 15/12/2026 as 11:00"),
    );
    const cancellation = await postWebhook(app, evolutionPayload("CANCELAR"));
    const sale = await postWebhook(app, evolutionPayload("Registrar venda de 1 Pomada com pagamento Pix"));

    expect(scheduling.json()).toMatchObject({ ok: true, intent: "schedule_appointment", executed: false });
    expect(cancellation.json()).toMatchObject({ ok: true, cancelled: true });
    expect(sale.json()).toMatchObject({ mode: "preview_only", intent: "sell_product", executed: false });
    const texts = sentWhatsAppTexts(fetchMock);
    expect(texts.filter((text) => text.startsWith("Venda de produto") && text.includes("Produto:"))).toHaveLength(1);
    expect(texts.at(-1)).toContain("Cliente: nao vinculado");
    expect(texts.at(-1)).not.toContain("João Vittor");
  });

  it("F: pergunta somente o produto quando a venda informa apenas Pix", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const response = await postWebhook(app, evolutionPayload("Registrar uma venda no Pix"));

    expect(response.json()).toMatchObject({ ok: true, intent: "sell_product", executed: false });
    expect(lastConfirmationCode(fetchMock)).toBe("");
    expect(sentWhatsAppTexts(fetchMock)).toEqual(["Entendi a operação, mas não encontrei esse produto no catálogo. Qual é o produto cadastrado?"]);
  });

  it.each([
    ["pix", "Pix"],
    ["dinheiro", "Dinheiro"],
  ])("completa somente o pagamento %s sem perder a venda pendente", async (reply, expectedPayment) => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    store.businessPaymentMethods.forEach((method) => { method.isDefault = false; });
    const app = createApp({ memoryStore: store, ownerCommandParser: null });
    const product = store.products.find((item) => item.id === "prd-pomada")!;
    const stockBefore = product.stockQty;
    const salesBefore = store.productSales.length;
    const financialBefore = store.financialEntries.length;
    const alertsBefore = store.stockAlerts.length;

    const question = await postWebhook(app, evolutionPayload("Vendi 11 pomadas Matte por 649."));
    expect(question.json()).toMatchObject({ ok: true, intent: "sell_product", executed: false });
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toBe("Qual é a forma de pagamento?");

    const completed = await postWebhook(app, evolutionPayload(reply));
    expect(completed.json()).toMatchObject({ mode: "preview_only", intent: "sell_product", executed: false });
    const preview = sentWhatsAppTexts(fetchMock).at(-1) ?? "";
    expect(preview).toContain("Produto: Pomada Matte");
    expect(preview).toContain("Quantidade: 11");
    expect(preview).toContain("Valor unitário: R$ 59,00");
    expect(preview).toContain("Valor total: R$ 649,00");
    expect(preview).toContain(`Pagamento: ${expectedPayment}`);
    expect(preview).toContain("Estoque atual: 15");
    expect(preview).toContain("Estoque após a venda: 4");
    expect(preview).toContain("CONFIRMAR");
    expect(preview).toContain("CANCELAR");
    expect(product.stockQty).toBe(stockBefore);
    expect(store.productSales).toHaveLength(salesBefore);
    expect(store.financialEntries).toHaveLength(financialBefore);
    expect(store.stockAlerts).toHaveLength(alertsBefore);
  });

  it("pix sem contexto pendente não cria venda", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    const app = createApp({ memoryStore: store, ownerCommandParser: null });

    const response = await postWebhook(app, evolutionPayload("pix"));

    expect(response.json()).toMatchObject({ ok: true, executed: false, unavailable: true });
    expect(store.productSales).toHaveLength(0);
    expect(store.financialEntries).toHaveLength(0);
  });

  it("CANCELAR remove a venda em esclarecimento sem criar prévia ou mutação", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    store.businessPaymentMethods.forEach((method) => { method.isDefault = false; });
    const app = createApp({ memoryStore: store, ownerCommandParser: null });

    await postWebhook(app, evolutionPayload("Vendi 11 pomadas Matte por 649."));
    const cancellation = await postWebhook(app, evolutionPayload("CANCELAR"));
    const isolatedReply = await postWebhook(app, evolutionPayload("pix"));

    expect(cancellation.json()).toMatchObject({ ok: true, cancelled: true });
    expect(isolatedReply.json()).toMatchObject({ ok: true, executed: false, unavailable: true });
    expect(store.products.find((item) => item.id === "prd-pomada")?.stockQty).toBe(15);
    expect(store.productSales).toHaveLength(0);
    expect(store.financialEntries).toHaveLength(0);
    expect(store.stockAlerts).toHaveLength(0);
  });

  it("deduplica tres entregas concorrentes do mesmo eventId e envia uma unica previa", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);
    const text = "Vendi uma pomada para Joao Santos, ele pagou no Pix.";
    const payload = evolutionPayload(text, "5511999999999", {
      eventId: "duplicate-text-event-001",
      data: {
        key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false },
        message: { conversation: text },
      },
    });

    const responses = await Promise.all([
      postWebhook(app, payload),
      postWebhook(app, payload),
      postWebhook(app, payload),
    ]);

    expect(responses.filter((response) => response.json().mode === "preview_only")).toHaveLength(1);
    expect(responses.filter((response) => response.json().deduplicated === true)).toHaveLength(2);
    expect(sentWhatsAppTexts(fetchMock)).toHaveLength(1);
    const events = await auditEvents(app, token);
    expect(events.filter((event) => event.action === "AI_WHATSAPP_WEBHOOK_RECEIVED")).toHaveLength(3);
    expect(events.filter((event) => event.action === "AI_WHATSAPP_WEBHOOK_CLAIMED")).toHaveLength(1);
    expect(events.filter((event) => event.action === "AI_WHATSAPP_WEBHOOK_DEDUPLICATED")).toHaveLength(2);
    expect(events.filter((event) => event.action === "AI_WHATSAPP_RESPONSE_SENT")).toHaveLength(1);
    expect(events.find((event) => event.action === "AI_WHATSAPP_RESPONSE_SENT")?.afterJson).toMatchObject({ origin: "text_preview" });
    await expect(countCommercialState(app, token)).resolves.toEqual({
      ...before,
      parsedAudits: before.parsedAudits + 1,
    });
  });

  it("retry da Evolution nao duplica mensagem de erro e preserva estado sem mutacao", async () => {
    const fetchMock = mockGeminiUnavailableAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);
    const payload = evolutionPayload("comando sem suporte", "5511999999999", {
      data: {
        key: { id: "duplicate-failure-message-001", remoteJid: "5511999999999@s.whatsapp.net", fromMe: false },
        message: { conversation: "comando sem suporte" },
      },
    });

    const responses = await Promise.all([
      postWebhook(app, payload),
      postWebhook(app, payload),
      postWebhook(app, payload),
    ]);

    expect(responses.filter((response) => response.json().deduplicated === true)).toHaveLength(2);
    expect(sentWhatsAppTexts(fetchMock)).toHaveLength(1);
    expect(sentWhatsAppTexts(fetchMock)[0]).toContain("Nao consegui interpretar essa mensagem agora");
    const events = await auditEvents(app, token);
    expect(events.filter((event) => event.action === "AI_WHATSAPP_RESPONSE_SENT")).toHaveLength(1);
    expect(events.find((event) => event.action === "AI_WHATSAPP_RESPONSE_SENT")?.afterJson).toMatchObject({ origin: "temporary_parser_failure" });
    await expect(countCommercialState(app, token)).resolves.toEqual(before);
  });

  it("comando incompleto chama Gemini, completa apenas o campo ausente e gera previa", async () => {
    const fetchMock = mockGeminiIntentAndWhatsapp("sell_product", {
      clientName: "Joao Santos",
      productName: "Pomada",
      quantity: 1,
      paymentMethod: "Pix",
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const response = await postWebhook(app, evolutionPayload("Vendi uma pomada para Joao Santos."));

    expect(response.json()).toMatchObject({ ok: true, mode: "preview_only", intent: "sell_product", executed: false });
    expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes("/message/sendText/")).length).toBe(1);
    expectPreviewWithoutVisibleCode(fetchMock);
  });

  it("timeout Gemini com comando incompleto pede esclarecimento sem codigo", async () => {
    const fetchMock = mockGeminiTimeoutAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);

    const response = await postWebhook(app, evolutionPayload("Vendi uma pomada para Joao Santos."));

    expect(response.json()).toMatchObject({ ok: true, intent: "sell_product", executed: false });
    expect(lastConfirmationCode(fetchMock)).toBe("");
    const events = await auditEvents(app, token);
    expect(events.some((event) => event.action === "AI_WHATSAPP_PARSER_OBSERVED" && event.afterJson?.strategy === "deterministic_after_gemini_failure" && event.afterJson?.status === "TIMEOUT")).toBe(true);
  });

  it("delimita fala natural sem associar cliente parcial nem criar previa executavel", async () => {
    const fetchMock = mockGeminiIntentAndWhatsapp("sell_product", {
      clientName: "Joao",
      productName: "Pomada",
      quantity: 1,
      paymentMethod: "Pix",
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    const response = await postWebhook(app, evolutionPayload("Vendi uma pomada para Joao e ele pagou no Pix."));

    expect(response.json()).toMatchObject({ ok: true, intent: "sell_product", executed: false });
    expect(lastConfirmationCode(fetchMock)).toBe("");
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("nome exato");
    await expect(countCommercialState(app, token)).resolves.toEqual(before);
  });

  it("resolve alias explicito de produto sem executar antes da confirmacao", async () => {
    const fetchMock = mockGeminiIntentAndWhatsapp("sell_product", {
      clientName: "Joao Santos",
      productName: "Pomada",
      quantity: 1,
      paymentMethod: "Pix",
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    const response = await postWebhook(app, evolutionPayload("Vendi uma pomada para Joao Santos, ele pagou no Pix."));

    expect(response.json()).toMatchObject({ ok: true, mode: "preview_only", intent: "sell_product", executed: false });
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("Produto: Pomada Matte");
    expectPreviewWithoutVisibleCode(fetchMock);
    await expect(countCommercialState(app, token)).resolves.toEqual({
      ...before,
      parsedAudits: before.parsedAudits + 1,
    });
  });

  it("bloqueia produto parcial sem alias e nao cria pendencia executavel", async () => {
    const fetchMock = mockGeminiIntentAndWhatsapp("sell_product", {
      clientName: "Joao Santos",
      productName: "Oleo",
      quantity: 1,
      paymentMethod: "Pix",
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    const response = await postWebhook(app, evolutionPayload("Vendi um oleo para Joao Santos, ele pagou no Pix."));

    expect(response.json()).toMatchObject({ ok: true, intent: "sell_product", executed: false });
    expect(lastConfirmationCode(fetchMock)).toBe("");
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("produto");
    await expect(countCommercialState(app, token)).resolves.toEqual({
      ...before,
      parsedAudits: before.parsedAudits + 1,
    });
  });

  it("nao aceita data e horario inventados pela interpretacao semantica", async () => {
    const fetchMock = mockGeminiIntentAndWhatsapp("schedule_appointment", {
      clientName: "Joao",
      serviceNames: ["Corte masculino"],
      professionalName: "Geovane",
      date: "2026-12-15",
      time: "10:00",
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    const response = await postWebhook(app, evolutionPayload("Agende corte para Joao."));

    expect(response.json()).toMatchObject({ ok: true, intent: "schedule_appointment", executed: false });
    expect(lastConfirmationCode(fetchMock)).toBe("");
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toBe("Informe somente: dia, horario, cliente.");
    await expect(countCommercialState(app, token)).resolves.toEqual(before);
  });

  it("resolve alias explicito de servico sem alterar o fluxo do painel", async () => {
    const fetchMock = mockSemanticV2ScheduleAndWhatsapp({
      clientName: "Maria Nova", clientEvidence: "Maria Nova", serviceName: "Corte masculino", serviceEvidence: "corte masculino",
      date: "2026-12-15", dateEvidence: "15/12/2026", time: "10:00", timeEvidence: "as 10h",
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const response = await postWebhook(app, evolutionPayload("Agende corte masculino para Maria Nova dia 15/12/2026 as 10h."));

    expect(response.json()).toMatchObject({ ok: true, mode: "preview_only", intent: "schedule_appointment", executed: false });
    expectPreviewWithoutVisibleCode(fetchMock);
  });

  it("gera previa para cliente novo com catalogo de clientes vazio e nao cria entidade", async () => {
    const fetchMock = mockSemanticV2ScheduleAndWhatsapp({
      clientName: "Joao Victor", clientEvidence: "Joao Victor", serviceName: "Corte", serviceEvidence: "corte",
      date: "2026-12-15", dateEvidence: "15/12/2026", time: "17:00", timeEvidence: "as 17 horas",
    });
    vi.stubGlobal("fetch", fetchMock);
    const memoryStore = new InMemoryStore();
    memoryStore.clients = [];
    const app = createApp({ memoryStore });
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    const response = await postWebhook(app, evolutionPayload(
      "Marque um corte para o cliente Joao Victor no dia 15/12/2026 as 17 horas.",
    ));

    expect(response.json()).toMatchObject({ mode: "preview_only", intent: "schedule_appointment", executed: false });
    expectPreviewWithoutVisibleCode(fetchMock);
    expect(sentWhatsAppTexts(fetchMock)).toHaveLength(1);
    expect(sentWhatsAppTexts(fetchMock)[0]).toContain("Cliente novo ou não encontrado");
    expect(memoryStore.clients).toHaveLength(0);
    expect(memoryStore.appointments).toHaveLength(0);
    const events = await auditEvents(app, token);
    const entities = events.find((event) => event.action === "AI_WHATSAPP_ENTITY_RESOLUTION_COMPLETED")?.afterJson?.entities as Array<{ entity: string; result: string }>;
    expect(entities).toContainEqual(expect.objectContaining({ entity: "client", result: "NOT_FOUND_NEW_CLIENT" }));
    await expect(countCommercialState(app, token)).resolves.toEqual({
      ...before,
      parsedAudits: before.parsedAudits + 1,
    });
  });

  it("pede nome completo quando somente um primeiro nome novo foi informado", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const memoryStore = new InMemoryStore();
    memoryStore.clients = [];
    const app = createApp({ memoryStore, ownerCommandParser: null });

    const response = await postWebhook(app, evolutionPayload(
      "Marca um corte para João dia 15/12/2026 às 10:00.",
    ));

    expect(response.json()).toMatchObject({ ok: true, intent: "schedule_appointment", executed: false });
    expect(lastConfirmationCode(fetchMock)).toBe("");
    expect(sentWhatsAppTexts(fetchMock)).toEqual(["Para qual cliente?"]);
    expect(memoryStore.clients).toHaveLength(0);
    expect(memoryStore.appointments).toHaveLength(0);
  });

  it("cria cliente completo e agendamento uma unica vez somente apos CONFIRMAR", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const memoryStore = new InMemoryStore();
    memoryStore.clients = [];
    const app = createApp({ memoryStore, ownerCommandParser: null });

    await postWebhook(app, evolutionPayload(
      "Marca um corte para Maria da Silva dia 15/12/2026 às 10:00.",
    ));
    expectPreviewWithoutVisibleCode(fetchMock);
    expect(sentWhatsAppTexts(fetchMock)[0]).toContain("Cliente: Maria da Silva");
    expect(sentWhatsAppTexts(fetchMock)[0]).toContain("Cliente novo ou não encontrado");
    expect(memoryStore.clients).toHaveLength(0);
    expect(memoryStore.appointments).toHaveLength(0);

    const confirmed = await postWebhook(app, evolutionPayload("CONFIRMAR"));
    expect(confirmed.json()).toMatchObject({ ok: true, executed: true });
    expect(memoryStore.clients).toHaveLength(1);
    expect(memoryStore.clients[0].fullName).toBe("Maria da Silva");
    expect(memoryStore.appointments).toHaveLength(1);

    const replay = await postWebhook(app, evolutionPayload("CONFIRMAR"));
    expect(replay.json()).toMatchObject({ ok: true, executed: false });
    expect(memoryStore.clients).toHaveLength(1);
    expect(memoryStore.appointments).toHaveLength(1);
  });

  it("pede esclarecimento quando dois clientes sao semelhantes e nao gera previa", async () => {
    const fetchMock = mockSemanticV2ScheduleAndWhatsapp({
      clientName: "Joao Victor", clientEvidence: "Joao Victor", serviceName: "Corte", serviceEvidence: "corte",
      date: "2026-12-15", dateEvidence: "15/12/2026", time: "17:00", timeEvidence: "as 17 horas",
    });
    vi.stubGlobal("fetch", fetchMock);
    const memoryStore = new InMemoryStore();
    memoryStore.clients = [
      { id: "cli-amb-1", businessId: "unit-01", fullName: "Joao Victor Almeida", tags: [] },
      { id: "cli-amb-2", businessId: "unit-01", fullName: "Joao Victor Souza", tags: [] },
    ];
    const app = createApp({ memoryStore });
    const token = await loginOwner(app);

    const response = await postWebhook(app, evolutionPayload(
      "Marque um corte para Joao Victor no dia 15/12/2026 as 17 horas.",
    ));

    expect(response.json()).toMatchObject({ ok: true, intent: "schedule_appointment", executed: false });
    expect(lastConfirmationCode(fetchMock)).toBe("");
    expect(sentWhatsAppTexts(fetchMock)).toEqual(["Para qual cliente?"]);
    expect(memoryStore.appointments).toHaveLength(0);
    const events = await auditEvents(app, token);
    const entities = events.find((event) => event.action === "AI_WHATSAPP_ENTITY_RESOLUTION_COMPLETED")?.afterJson?.entities as Array<{ entity: string; result: string }>;
    expect(entities).toContainEqual(expect.objectContaining({ entity: "client", result: "AMBIGUOUS_MATCH" }));
  });

  it("bloqueia servico inexistente sem transformar cliente novo em falha fatal", async () => {
    const fetchMock = mockSemanticV2ScheduleAndWhatsapp({
      clientName: "Joao Victor", clientEvidence: "Joao Victor", serviceName: "Tatuagem", serviceEvidence: "tatuagem",
      date: "2026-12-15", dateEvidence: "15/12/2026", time: "17:00", timeEvidence: "as 17 horas",
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const response = await postWebhook(app, evolutionPayload(
      "Marque uma tatuagem para Joao Victor no dia 15/12/2026 as 17 horas.",
    ));

    expect(response.json()).toMatchObject({ ok: true, intent: "schedule_appointment", executed: false });
    expect(lastConfirmationCode(fetchMock)).toBe("");
    expect(sentWhatsAppTexts(fetchMock)).toEqual(["Qual servico voce deseja agendar?"]);
  });

  it("bloqueia profissional inexistente com pergunta especifica", async () => {
    const fetchMock = mockSemanticV2ScheduleAndWhatsapp({
      clientName: "Joao Victor", clientEvidence: "Joao Victor", serviceName: "Corte", serviceEvidence: "corte",
      professionalName: "Barbeiro Fantasma", professionalEvidence: "Barbeiro Fantasma",
      date: "2026-12-15", dateEvidence: "15/12/2026", time: "17:00", timeEvidence: "as 17 horas",
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const response = await postWebhook(app, evolutionPayload(
      "Marque corte para Joao Victor com Barbeiro Fantasma no dia 15/12/2026 as 17 horas.",
    ));

    expect(response.json()).toMatchObject({ ok: true, intent: "schedule_appointment", executed: false });
    expect(lastConfirmationCode(fetchMock)).toBe("");
    expect(sentWhatsAppTexts(fetchMock)).toEqual(["Com qual profissional?"]);
  });

  it("gera uma unica previa para linguagem natural completa sem executar", async () => {
    const fetchMock = mockSemanticV2ScheduleAndWhatsapp({
      clientName: "João Victor", clientEvidence: "João Victor", serviceName: "Corte", serviceEvidence: "corte",
      date: "2026-12-15", dateEvidence: "15/12/2026", time: "10:00", timeEvidence: "às 10h",
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    await createWhatsappTestClient(app, token, "101");
    const before = await countCommercialState(app, token);

    const response = await postWebhook(app, evolutionPayload(
      "Deixa marcado um corte para João Victor dia 15/12/2026 às 10h.",
    ));

    expect(response.json()).toMatchObject({ ok: true, mode: "preview_only", intent: "schedule_appointment", executed: false });
    expect(sentWhatsAppTexts(fetchMock)).toHaveLength(1);
    expectPreviewWithoutVisibleCode(fetchMock);
    await expect(countCommercialState(app, token)).resolves.toEqual({
      ...before,
      parsedAudits: before.parsedAudits + 1,
    });
  });

  it.each([
    {
      message: "Marca um corte para o CLIENTE TESTE IA WPP.",
      semantic: { clientName: "CLIENTE TESTE IA WPP", serviceNames: ["Corte"] },
      expectedReply: "Qual dia e horario voce deseja?",
    },
    {
      message: "Tem como encaixar o CLIENTE TESTE IA WPP amanhã às 17?",
      semantic: { clientName: "CLIENTE TESTE IA WPP", date: "2026-07-14", time: "17:00" },
      expectedReply: "Qual servico voce deseja agendar?",
    },
    {
      message: "Quero marcar um horário para o CLIENTE TESTE IA WPP.",
      semantic: { clientName: "CLIENTE TESTE IA WPP" },
      expectedReply: "Informe somente: servico, dia, horario.",
    },
  ])("pergunta somente os campos ausentes: $message", async ({ message, semantic, expectedReply }) => {
    const fetchMock = mockSemanticScheduleAndWhatsapp(semantic);
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    const response = await postWebhook(app, evolutionPayload(message));

    expect(response.json()).toMatchObject({ ok: true, intent: "schedule_appointment", executed: false });
    expect(lastConfirmationCode(fetchMock)).toBe("");
    expect(sentWhatsAppTexts(fetchMock)).toEqual([expectedReply]);
    await expect(countCommercialState(app, token)).resolves.toEqual(before);
  });

  it("valida disponibilidade deterministicamente e nao cria previa executavel para horario passado", async () => {
    const fetchMock = mockSemanticV2ScheduleAndWhatsapp({
      clientName: "João Victor", clientEvidence: "João Victor", serviceName: "Corte", serviceEvidence: "corte",
      date: "2020-07-12", dateEvidence: "12/07/2020", time: "10:00", timeEvidence: "às 10h",
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    await createWhatsappTestClient(app, token, "102");
    const before = await countCommercialState(app, token);

    const response = await postWebhook(app, evolutionPayload(
      "Deixa marcado um corte para João Victor dia 12/07/2020 às 10h.",
    ));

    expect(response.json()).toMatchObject({ ok: true, mode: "preview_only", intent: "schedule_appointment", executed: false });
    expect(lastConfirmationCode(fetchMock)).toBe("");
    expect(sentWhatsAppTexts(fetchMock)).toEqual([
      "Esse horario nao esta disponivel. Qual outro dia e horario voce deseja?",
    ]);
    await expect(countCommercialState(app, token)).resolves.toEqual(before);
  });

  it("texto de agendamento gera previa e nao executa", async () => {
    const fetchMock = mockSemanticV2ScheduleAndWhatsapp({
      clientName: "João Victor", clientEvidence: "João Victor", serviceName: "Corte", serviceEvidence: "corte",
      date: "2026-12-15", dateEvidence: "15/12/2026", time: "11:00", timeEvidence: "as 11h",
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    await createWhatsappTestClient(app, token, "103");
    const before = await countCommercialState(app, token);

    const response = await postWebhook(app, evolutionPayload("Agenda João Victor dia 15/12/2026 as 11h para corte."));

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ mode: "preview_only", intent: "schedule_appointment", executed: false });
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("Horario: 11:00");
    const after = await countCommercialState(app, token);
    expect(after.appointments).toBe(before.appointments);
    expect(after.sales).toBe(before.sales);
    expect(after.financialEntries).toBe(before.financialEntries);
  });

  it("mantem o nome do cliente e gera previa com Agendar mesmo sem a IA", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-13T15:00:00.000Z"));
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const response = await postWebhook(
      app,
      evolutionPayload("Agendar corte para Maria Teste Agendamento dia 14/07/2026 as 11:00"),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ mode: "preview_only", intent: "schedule_appointment", executed: false });
    const preview = sentWhatsAppTexts(fetchMock).at(-1) ?? "";
    expect(preview).toContain("Cliente: Maria Teste Agendamento");
    expect(preview).toContain("Servico: Corte");
    expect(preview).toContain("Data: 2026-07-14");
    expect(preview).toContain("Horario: 11:00");
  });

  it("gera previa deterministica para a frase natural real e resolve o unico profissional habilitado", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T15:00:00.000Z"));
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    store.services[0].name = "Corte";
    const app = createApp({ memoryStore: store, ownerCommandParser: null });
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    const response = await postWebhook(
      app,
      evolutionPayload("Coloca o João Vitor para cortar amanhã, às quatro da tarde."),
    );

    expect(response.json()).toMatchObject({ mode: "preview_only", intent: "schedule_appointment", executed: false });
    expect(sentWhatsAppTexts(fetchMock)).toHaveLength(1);
    expect(sentWhatsAppTexts(fetchMock)[0]).toContain("Cliente: João Vitor");
    expect(sentWhatsAppTexts(fetchMock)[0]).toContain("Servico: Corte");
    expect(sentWhatsAppTexts(fetchMock)[0]).toContain("Data: 2026-07-15");
    expect(sentWhatsAppTexts(fetchMock)[0]).toContain("Horario: 16:00");
    expect(sentWhatsAppTexts(fetchMock)[0]).toContain("Profissional: Geovane Borges");
    expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes("/message/sendText/")).length).toBe(0);
    await expect(countCommercialState(app, token)).resolves.toMatchObject({
      ...before,
      parsedAudits: before.parsedAudits + 1,
    });
  });

  it("pergunta o profissional quando dois ativos estao habilitados para Corte", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    store.services[0].name = "Corte";
    store.professionals.push({
      id: "pro-02",
      businessId: "unit-01",
      name: "Outro Barbeiro",
      active: true,
      commissionRules: [],
    });
    store.serviceProfessionalAssignments.push({ serviceId: "svc-corte", professionalId: "pro-02" });
    const app = createApp({ memoryStore: store, ownerCommandParser: null });

    const response = await postWebhook(
      app,
      evolutionPayload("Coloca o João Vitor para cortar amanhã às quatro da tarde"),
    );

    expect(response.json()).toMatchObject({ ok: true, intent: "schedule_appointment", executed: false });
    expect(sentWhatsAppTexts(fetchMock)).toEqual(["Com qual profissional?"]);
    expect(lastConfirmationCode(fetchMock)).toBe("");
  });

  it("bloqueia com mensagem clara quando nenhum profissional ativo esta habilitado", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    store.services[0].name = "Corte";
    store.serviceProfessionalAssignments = [{ serviceId: "svc-corte", professionalId: "pro-inexistente" }];
    const app = createApp({ memoryStore: store, ownerCommandParser: null });

    const response = await postWebhook(
      app,
      evolutionPayload("Coloca o João Vitor para cortar amanhã às quatro da tarde"),
    );

    expect(response.json()).toMatchObject({ ok: true, intent: "schedule_appointment", executed: false });
    expect(sentWhatsAppTexts(fetchMock)).toEqual([
      "Nenhum profissional ativo esta habilitado para esse servico.",
    ]);
    expect(lastConfirmationCode(fetchMock)).toBe("");
  });

  it.each([
    ["Coloca para cortar amanhã às quatro da tarde", "Para qual cliente?"],
    ["Coloca o João Vitor amanhã às quatro da tarde", "Qual servico voce deseja agendar?"],
    ["Coloca o João Vitor para cortar amanhã às quatro", "Você quis dizer 04:00 ou 16:00?"],
  ])("pergunta somente o campo ausente ou ambiguo: %s", async (message, expectedReply) => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    store.services[0].name = "Corte";
    const app = createApp({ memoryStore: store, ownerCommandParser: null });

    const response = await postWebhook(app, evolutionPayload(message));

    expect(response.json()).toMatchObject({ ok: true, intent: "schedule_appointment", executed: false });
    expect(sentWhatsAppTexts(fetchMock)).toEqual([expectedReply]);
    expect(lastConfirmationCode(fetchMock)).toBe("");
  });

  it("gera uma unica previa para cliente novo com o marcador cliente sem criar dados", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T15:00:00.000Z"));
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    const response = await postWebhook(
      app,
      evolutionPayload("Agendar corte para Cliente Teste RC3 dia 15/07/2026 \u00e0s 11:00 com Geovane Borges"),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ mode: "preview_only", intent: "schedule_appointment", executed: false });
    const previews = sentWhatsAppTexts(fetchMock);
    expect(previews).toHaveLength(1);
    expect(previews[0]).toContain("Cliente: Cliente Teste RC3");
    expect(previews[0]).toContain("Servico: Corte");
    expect(previews[0]).toContain("Data: 2026-07-15");
    expect(previews[0]).toContain("Horario: 11:00");
    expect(previews[0]).toContain("Profissional: Geovane Borges");
    expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes("/message/sendText/")).length).toBe(0);
    const after = await countCommercialState(app, token);
    expect(after).toMatchObject({ ...before, parsedAudits: before.parsedAudits + 1 });
  });

  it("gera previa deterministica com data e horario totalmente falados e audita somente o tipo", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-13T15:00:00.000Z"));
    const message = "Agendar corte para Maria da Silva dia quatorze de julho de dois mil e vinte e seis às onze e trinta";
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);

    const response = await postWebhook(app, evolutionPayload(message));

    expect(response.json()).toMatchObject({ mode: "preview_only", intent: "schedule_appointment", executed: false });
    const preview = sentWhatsAppTexts(fetchMock).at(-1) ?? "";
    expect(preview).toContain("Cliente: Maria da Silva");
    expect(preview).toContain("Servico: Corte");
    expect(preview).toContain("Data: 2026-07-14");
    expect(preview).toContain("Horario: 11:30");
    expect(preview).toContain("Profissional: Geovane Borges");
    expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes("/message/sendText/")).length).toBe(0);
    const events = await auditEvents(app, token);
    const observed = events.find((event) => event.action === "AI_WHATSAPP_PARSER_OBSERVED");
    expect(observed?.afterJson).toMatchObject({ strategy: "deterministic", dateRecognitionType: "fully_spoken" });
    expect(JSON.stringify(events)).not.toContain(message);
  });

  it("pede esclarecimento para horario realmente ambiguo depois da interpretacao semantica", async () => {
    const fetchMock = mockSemanticV2ScheduleAndWhatsapp({
      clientName: "João Victor", clientEvidence: "João Victor", serviceName: "Corte", serviceEvidence: "corte",
      date: "2026-12-15", dateEvidence: "15/12/2026", timeEvidence: "quinze para as duas", timeAmbiguous: true,
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    await createWhatsappTestClient(app, token, "104");

    const response = await postWebhook(
      app,
      evolutionPayload("Marque corte para João Victor dia 15/12/2026 quinze para as duas"),
    );

    expect(response.json()).toMatchObject({ ok: true, intent: "schedule_appointment", executed: false });
    expect(lastConfirmationCode(fetchMock)).toBe("");
    expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes("/message/sendText/")).length).toBe(1);
    const events = await auditEvents(app, token);
    expect(events.some((event) => event.action === "AI_WHATSAPP_PARSER_OBSERVED" && event.afterJson?.status === "AMBIGUOUS")).toBe(true);
    expect(events.some((event) => event.action === "AI_WHATSAPP_GEMINI_COMPLETED")).toBe(true);
  });

  it("responde com seguranca quando a IA esta indisponivel, sem executar nada", async () => {
    const fetchMock = mockGeminiUnavailableAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    const response = await postWebhook(app, evolutionPayload("PING IA"));

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, executed: false, unavailable: true });
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("Nao consegui interpretar essa mensagem agora");
    await expect(countCommercialState(app, token)).resolves.toEqual(before);
  });

  it("timeout, JSON invalido e schema invalido respondem sem executar", async () => {
    for (const fetchMock of [mockGeminiTimeoutAndWhatsapp(), mockGeminiInvalidJsonAndWhatsapp(), mockGeminiInvalidSchemaAndWhatsapp()]) {
      vi.stubGlobal("fetch", fetchMock);
      const app = createApp();
      const token = await loginOwner(app);
      const before = await countCommercialState(app, token);

      const response = await postWebhook(app, evolutionPayload("asdf teste qualquer"));

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ ok: true, executed: false, unavailable: true });
      expect(sentWhatsAppTexts(fetchMock).at(-1)).toMatch(/N[aã]o consegui/);
      await expect(countCommercialState(app, token)).resolves.toEqual(before);
      vi.unstubAllGlobals();
    }
  });

  it("429 repetido abre circuito e comando deterministico completo nao insiste no Gemini", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T15:00:00.000Z"));
    const fetchMock = mockGeminiUnavailableAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);

    await postWebhook(app, evolutionPayload("PING IA"));
    await postWebhook(app, evolutionPayload("PING IA"));
    const fallback = await postWebhook(app, evolutionPayload("Agendar corte para Maria Teste dia 15/07/2026 as 11:00"));

    expect(fallback.statusCode).toBe(200);
    expect(fallback.json()).toMatchObject({ ok: true, mode: "preview_only", intent: "schedule_appointment" });
    expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes("/message/sendText/")).length).toBe(2);
    const events = await auditEvents(app, token);
    expect(events.some((event) => event.action === "AI_WHATSAPP_FALLBACK_USED")).toBe(false);
    expect(events.some((event) => event.action === "AI_WHATSAPP_PARSER_OBSERVED" && event.afterJson?.strategy === "deterministic")).toBe(true);
  });

  it("comando desconhecido recebe orientacao segura sem exemplos e auditoria sem numero completo", async () => {
    const fetchMock = mockGeminiIntentAndWhatsapp("unknown", {});
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);

    const response = await postWebhook(app, evolutionPayload("asdf teste qualquer"));

    expect(response.statusCode).toBe(200);
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toBe("Essa operação ainda não está disponível. Posso ajudar com vendas de produtos, entradas de estoque, agendamentos e correções de prévias.");
    expect(sentWhatsAppTexts(fetchMock).at(-1)).not.toMatch(/Vendi uma pomada|Agendar corte para Joao/);
    const events = await auditEvents(app, token);
    const serialized = JSON.stringify(events.filter((event) => event.action === "AI_WHATSAPP_AI_FAILURE"));
    expect(serialized).not.toContain("5511999999999");
  });

  it("falha ao enviar resposta pela Evolution permanece controlada e auditada", async () => {
    const fetchMock = mockGeminiAndFailedWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    const response = await postWebhook(app, evolutionPayload("Vendi uma pomada para CLIENTE TESTE IA, ele pagou no Pix."));

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, responseDelivered: false });
    expect((await auditEvents(app, token)).some((event) => event.action === "AI_WHATSAPP_RESPONSE_FAILED")).toBe(true);
    const after = await countCommercialState(app, token);
    expect(after.sales).toBe(before.sales);
    expect(after.appointments).toBe(before.appointments);
  });

  it.each([
    "confirmar",
    "confirma",
    "pode confirmar",
    "confirmado",
    "sim, pode confirmar",
    "confirma para mim",
  ])("confirma a unica previa ativa sem codigo: %s", async (phrase) => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    const app = createApp({ memoryStore: store, ownerCommandParser: null });
    const salesBefore = store.productSales.length;
    const financialBefore = store.financialEntries.length;

    const preview = await postWebhook(app, evolutionPayload("Registrar venda de 1 Pomada com pagamento Pix"));
    expect(preview.json()).toMatchObject({ mode: "preview_only", executed: false });
    expect(store.productSales).toHaveLength(salesBefore);
    expect(store.financialEntries).toHaveLength(financialBefore);
    expectPreviewWithoutVisibleCode(fetchMock);

    const confirmation = await postWebhook(app, evolutionPayload(phrase));
    expect(confirmation.json()).toMatchObject({ ok: true, executed: true });
    expect(store.productSales).toHaveLength(salesBefore + 1);
    expect(store.financialEntries).toHaveLength(financialBefore + 1);
  });

  it.each(["sim", "não", "ok", "beleza"])("nao executa resposta ambigua: %s", async (phrase) => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    const app = createApp({ memoryStore: store, ownerCommandParser: null });
    const before = store.productSales.length;

    await postWebhook(app, evolutionPayload("Registrar venda de 1 Pomada com pagamento Pix"));
    const response = await postWebhook(app, evolutionPayload(phrase));

    expect(response.json()).toMatchObject({ ok: true, executed: false });
    expect(store.productSales).toHaveLength(before);
  });

  it.each([
    "Marca um corte para Cliente Teste Confirmação amanhã às quatro da tarde",
    "Marca um corte para Confirmação Silva amanhã às quatro da tarde",
  ])("nome com confirmacao nao executa nem substitui a previa anterior: %s", async (command) => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    store.clients = [];
    const app = createApp({ memoryStore: store, ownerCommandParser: null });

    await postWebhook(app, evolutionPayload("Registrar venda de 1 Pomada com pagamento Pix"));
    const response = await postWebhook(app, evolutionPayload(command));

    expect(response.json()).toMatchObject({
      ok: true,
      pendingPreserved: true,
      executed: false,
    });
    expect(store.productSales).toHaveLength(0);
    expect(store.financialEntries).toHaveLength(0);
    expect(store.clients).toHaveLength(0);
    expect(store.appointments).toHaveLength(0);
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("CANCELAR a prévia atual");
    expect(sentWhatsAppTexts(fetchMock).at(-1)).not.toContain("confirmada com sucesso");
  });

  it.each([
    ["O nome correto é Carlos Silva", ["Cliente: Carlos Silva", "Servico: Corte Premium", "Data: 2026-12-15", "Horario: 11:00"]],
    ["Muda para dia 16/12/2026", ["Cliente: Joao Santos", "Data: 2026-12-16", "Horario: 11:00"]],
    ["Não é dia 16, é dia 17", ["Cliente: Joao Santos", "Data: 2026-12-17", "Horario: 11:00"]],
    ["É às doze da tarde", ["Cliente: Joao Santos", "Data: 2026-12-15", "Horario: 12:00"]],
    ["Troca Corte Premium por Barba Terapia", ["Cliente: Joao Santos", "Servico: Barba Terapia", "Horario: 11:00"]],
    ["Na verdade é dia 17/12/2026 às uma da tarde", ["Data: 2026-12-17", "Horario: 13:00", "Servico: Corte Premium"]],
  ])("corrige agendamento preservando campos nao mencionados: %s", async (correction, expectedLines) => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    const app = createApp({ memoryStore: store, ownerCommandParser: null });

    const initial = await postWebhook(app, evolutionPayload("Agendar Corte Premium para Joao Santos dia 15/12/2026 as 11:00 com Geovane Borges"));
    const updated = await postWebhook(app, evolutionPayload(correction));

    expect(initial.json()).toMatchObject({ mode: "preview_only", executed: false });
    expect(updated.json()).toMatchObject({ mode: "preview_only", corrected: true, executed: false });
    const summary = sentWhatsAppTexts(fetchMock).at(-1) ?? "";
    expect(summary).toContain("Atualizei a prévia. Confira os dados e confirme novamente.");
    for (const line of expectedLines) expect(summary).toContain(line);
    expect(store.clients).toHaveLength(2);
    expect(store.appointments).toHaveLength(0);
  });

  it("corrige profissional elegivel e bloqueia profissional inelegivel sem perder a previa", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    const app = createApp({ memoryStore: store, ownerCommandParser: null });

    await postWebhook(app, evolutionPayload("Agendar Corte Premium para Joao Santos dia 15/12/2026 as 11:00 com Geovane Borges"));
    store.professionals.push({ id: "pro-02", businessId: "unit-01", name: "Outro Barbeiro", active: true, commissionRules: [] });
    store.serviceProfessionalAssignments.push({ serviceId: "svc-corte", professionalId: "pro-02" });
    const eligible = await postWebhook(app, evolutionPayload("Coloca com o Outro Barbeiro"));
    expect(eligible.json()).toMatchObject({ corrected: true, executed: false });
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("Profissional: Outro Barbeiro");

    store.serviceProfessionalAssignments = store.serviceProfessionalAssignments.filter((item) => item.professionalId !== "pro-01");
    const rejected = await postWebhook(app, evolutionPayload("Coloca com o Geovane Borges"));
    expect(rejected.json()).toMatchObject({ corrected: false, executed: false });
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("horario nao esta disponivel");

    const confirmed = await postWebhook(app, evolutionPayload("CONFIRMAR"));
    expect(confirmed.json()).toMatchObject({ executed: true });
    expect(store.appointments).toHaveLength(1);
    expect(store.appointments[0].professionalId).toBe("pro-02");
  });

  it("bloqueia horario corrigido indisponivel e preserva a previa anterior", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T15:00:00.000Z"));
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    const app = createApp({ memoryStore: store, ownerCommandParser: null });

    await postWebhook(app, evolutionPayload("Agendar Corte Premium para Joao Santos dia 15/12/2026 as 11:00 com Geovane Borges"));
    const rejected = await postWebhook(app, evolutionPayload("Na verdade é hoje às dez da manhã"));
    expect(rejected.json()).toMatchObject({ corrected: false, executed: false });
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("horario nao esta disponivel");
    expect(store.auditEvents.some((event) =>
      event.action === "AI_WHATSAPP_FINAL_STATE"
      && event.afterJson?.state === "AVAILABILITY_UNAVAILABLE",
    )).toBe(true);

    const confirmed = await postWebhook(app, evolutionPayload("CONFIRMAR"));
    expect(confirmed.json()).toMatchObject({ executed: true });
    expect(store.appointments).toHaveLength(1);
    expect(store.appointments[0].startsAt.toISOString()).toContain("2026-12-15T14:00:00.000Z");
  });

  it("cliente novo corrigido aparece no aviso e so e criado apos nova confirmacao", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    const app = createApp({ memoryStore: store, ownerCommandParser: null });
    const clientsBefore = store.clients.length;

    await postWebhook(app, evolutionPayload("Agendar Corte Premium para Joao Santos dia 15/12/2026 as 11:00 com Geovane Borges"));
    const updated = await postWebhook(app, evolutionPayload("O nome correto é Carlos Henrique"));
    expect(updated.json()).toMatchObject({ corrected: true, executed: false });
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("Cliente novo");
    expect(store.clients).toHaveLength(clientsBefore);

    await postWebhook(app, evolutionPayload("CONFIRMAR"));
    expect(store.clients).toHaveLength(clientsBefore + 1);
    expect(store.clients.at(-1)?.fullName).toBe("Carlos Henrique");
  });

  it.each([
    ["O produto é Gel", ["Produto: Gel", "Quantidade: 1", "Pagamento: Pix", "Valor total: R$ 25,00"]],
    ["São duas pomadas, não uma", ["Produto: Pomada Matte", "Quantidade: 2", "Valor total: R$ 118,00"]],
    ["O pagamento é Dinheiro", ["Produto: Pomada Matte", "Quantidade: 1", "Pagamento: Dinheiro"]],
    ["Vincula ao cliente Carlos Silva", ["Cliente: Carlos Silva", "Produto: Pomada Matte"]],
  ])("corrige venda e recalcula sem mutacao: %s", async (correction, expectedLines) => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    store.products.push({ ...store.products[0], id: "prd-gel", name: "Gel", salePrice: 25, stockQty: 8 });
    const app = createApp({ memoryStore: store, ownerCommandParser: null });
    const stockBefore = store.products.find((item) => item.id === "prd-pomada")?.stockQty;

    await postWebhook(app, evolutionPayload("Registrar venda de 1 Pomada Matte com pagamento Pix"));
    const updated = await postWebhook(app, evolutionPayload(correction));

    expect(updated.json()).toMatchObject({ mode: "preview_only", corrected: true, executed: false });
    const summary = sentWhatsAppTexts(fetchMock).at(-1) ?? "";
    for (const line of expectedLines) expect(summary).toContain(line);
    expect(store.productSales).toHaveLength(0);
    expect(store.financialEntries).toHaveLength(0);
    expect(store.products.find((item) => item.id === "prd-pomada")?.stockQty).toBe(stockBefore);
  });

  it("remove cliente da venda e bloqueia quantidade acima do estoque", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    const app = createApp({ memoryStore: store, ownerCommandParser: null });

    await postWebhook(app, evolutionPayload("Registrar venda de 1 Pomada Matte para Joao Santos com pagamento Pix"));
    const withoutClient = await postWebhook(app, evolutionPayload("Pode deixar sem cliente"));
    expect(withoutClient.json()).toMatchObject({ corrected: true, executed: false });
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("Cliente: nao vinculado");

    const overStock = await postWebhook(app, evolutionPayload("Troca para 99 unidades"));
    expect(overStock.json()).toMatchObject({ corrected: false, executed: false });
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("quantidade");
    expect(store.productSales).toHaveLength(0);
  });

  it("correcao com confirmacao gira a previa, invalida codigo antigo e exige CONFIRMAR separado", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    const app = createApp({ memoryStore: store, ownerCommandParser: null });
    const randomIntSpy = vi.spyOn(crypto, "randomInt") as unknown as { mockImplementation: (implementation: () => number) => void };
    let generated = 0;
    randomIntSpy.mockImplementation(() => generated++ === 0 ? 4321 : 8765);

    await postWebhook(app, evolutionPayload("Registrar venda de 1 Pomada Matte com pagamento Pix"));
    const corrected = await postWebhook(app, evolutionPayload("Troca para cinco e confirma"));
    expect(corrected.json()).toMatchObject({ corrected: true, executed: false });
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("confirme novamente");
    expect(store.productSales).toHaveLength(0);

    const oldCode = await postWebhook(app, evolutionPayload("CONFIRMAR 4321"));
    expect(oldCode.json()).toMatchObject({ executed: false });
    expect(store.productSales).toHaveLength(0);

    const confirmed = await postWebhook(app, evolutionPayload("CONFIRMAR"));
    expect(confirmed.json()).toMatchObject({ executed: true });
    expect(store.productSales).toHaveLength(1);
    expect(store.productSales[0].items[0].quantity).toBe(5);
  });

  it("replay da correcao responde uma vez e CANCELAR limpa a nova previa", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    const app = createApp({ memoryStore: store, ownerCommandParser: null });

    await postWebhook(app, evolutionPayload("Registrar venda de 1 Pomada Matte com pagamento Pix"));
    const correctionPayload = evolutionPayload("São duas pomadas, não uma", undefined, {
      data: {
        key: { id: "preview-correction-001", remoteJid: "5511999999999@s.whatsapp.net", fromMe: false },
        message: { conversation: "São duas pomadas, não uma" },
      },
    });
    const first = await postWebhook(app, correctionPayload);
    const replay = await postWebhook(app, correctionPayload);
    expect(first.json()).toMatchObject({ corrected: true, executed: false });
    expect(replay.json()).toMatchObject({ replay: true, deduplicated: true, executed: false });
    expect(sentWhatsAppTexts(fetchMock).filter((text) => text.includes("Atualizei a prévia"))).toHaveLength(1);

    await postWebhook(app, evolutionPayload("CANCELAR"));
    const confirmation = await postWebhook(app, evolutionPayload("CONFIRMAR"));
    expect(confirmation.json()).toMatchObject({ executed: false });
    expect(store.productSales).toHaveLength(0);
  });

  it("correcao ambigua preserva a previa e novo pedido completo nao substitui silenciosamente", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    const app = createApp({ memoryStore: store, ownerCommandParser: null });

    await postWebhook(app, evolutionPayload("Registrar venda de 1 Pomada Matte com pagamento Pix"));
    const ambiguous = await postWebhook(app, evolutionPayload("Muda para cinco"));
    expect(ambiguous.json()).toMatchObject({ ambiguous: true, executed: false });
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("produto, a quantidade ou o pagamento");

    const other = await postWebhook(app, evolutionPayload("Agendar Corte Premium para Carlos Silva dia 16/12/2026 as 10:00 com Geovane Borges"));
    expect(other.json()).toMatchObject({ pendingPreserved: true, executed: false });
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("CANCELAR a prévia atual");

    const confirmed = await postWebhook(app, evolutionPayload("CONFIRMAR"));
    expect(confirmed.json()).toMatchObject({ executed: true });
    expect(store.productSales).toHaveLength(1);
    expect(store.appointments).toHaveLength(0);
  });

  it("unidade confiavel diferente nao altera a previa existente", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    const app = createApp({ memoryStore: store, ownerCommandParser: null });

    await postWebhook(app, evolutionPayload("Registrar venda de 1 Pomada Matte com pagamento Pix"));
    process.env.AI_WHATSAPP_UNIT_ID = "unit-02";
    const foreignCorrection = await postWebhook(app, evolutionPayload("São duas pomadas, não uma"));
    expect(foreignCorrection.json()).toMatchObject({ executed: false });
    expect(foreignCorrection.json()).not.toHaveProperty("corrected", true);

    process.env.AI_WHATSAPP_UNIT_ID = "unit-01";
    const confirmed = await postWebhook(app, evolutionPayload("CONFIRMAR"));
    expect(confirmed.json()).toMatchObject({ executed: true });
    expect(store.productSales).toHaveLength(1);
    expect(store.productSales[0].items[0].quantity).toBe(1);
  });

  it("duas confirmacoes simples repetidas executam somente uma vez", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    const app = createApp({ memoryStore: store, ownerCommandParser: null });
    const before = store.productSales.length;

    await postWebhook(app, evolutionPayload("Registrar venda de 1 Pomada com pagamento Pix"));
    const first = await postWebhook(app, evolutionPayload("CONFIRMAR"));
    const second = await postWebhook(app, evolutionPayload("CONFIRMAR"));

    expect(first.json()).toMatchObject({ ok: true, executed: true });
    expect(second.json()).toMatchObject({ ok: true, executed: false });
    expect(store.productSales).toHaveLength(before + 1);
  });

  it.each(["cancelar", "cancela", "pode cancelar"])("cancela a unica previa sem codigo: %s", async (phrase) => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    const app = createApp({ memoryStore: store, ownerCommandParser: null });
    const before = store.productSales.length;

    await postWebhook(app, evolutionPayload("Registrar venda de 1 Pomada com pagamento Pix"));
    const cancellation = await postWebhook(app, evolutionPayload(phrase));
    const confirmation = await postWebhook(app, evolutionPayload("CONFIRMAR"));

    expect(cancellation.json()).toMatchObject({ ok: true, cancelled: true, executed: false });
    expect(confirmation.json()).toMatchObject({ ok: true, executed: false });
    expect(store.productSales).toHaveLength(before);
  });

  it("responde de forma segura quando nao ha previa ativa", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const response = await postWebhook(app, evolutionPayload("CONFIRMAR"));

    expect(response.json()).toMatchObject({ ok: true, executed: false });
    expect(sentWhatsAppTexts(fetchMock)).toEqual(["Não há nenhuma operação aguardando confirmação."]);
  });

  it("restart invalida a previa mantida somente em memoria", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    const appBeforeRestart = createApp({ memoryStore: store, ownerCommandParser: null });

    await postWebhook(appBeforeRestart, evolutionPayload("Registrar venda de 1 Pomada com pagamento Pix"));
    expect(store.productSales).toHaveLength(0);
    await appBeforeRestart.close();

    const appAfterRestart = createApp({ memoryStore: store, ownerCommandParser: null });
    const confirmation = await postWebhook(appAfterRestart, evolutionPayload("CONFIRMAR"));

    expect(confirmation.json()).toMatchObject({ ok: true, executed: false });
    expect(store.productSales).toHaveLength(0);
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toBe("Não há nenhuma operação aguardando confirmação.");
    await appAfterRestart.close();
  });

  it("mantem a previa ativa quando chega outro comando completo", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    store.clients = [];
    const app = createApp({ memoryStore: store, ownerCommandParser: null });

    await postWebhook(app, evolutionPayload("Registrar venda de 1 Pomada com pagamento Pix"));
    const blocked = await postWebhook(app, evolutionPayload("Agendar corte para Maria da Silva dia 15/12/2026 às 10:00"));
    const confirmation = await postWebhook(app, evolutionPayload("CONFIRMAR"));

    expect(blocked.json()).toMatchObject({ pendingPreserved: true, executed: false });
    expect(confirmation.json()).toMatchObject({ ok: true, executed: true });
    expect(store.productSales).toHaveLength(1);
    expect(store.appointments).toHaveLength(0);
    expect(store.clients).toHaveLength(0);
  });

  it("bloqueia confirmacao quando a unidade confiavel muda", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    const app = createApp({ memoryStore: store, ownerCommandParser: null });
    const before = store.productSales.length;

    await postWebhook(app, evolutionPayload("Registrar venda de 1 Pomada com pagamento Pix"));
    process.env.AI_WHATSAPP_UNIT_ID = "unit-02";
    const confirmation = await postWebhook(app, evolutionPayload("CONFIRMAR"));

    expect(confirmation.json()).toMatchObject({ ok: true, executed: false });
    expect(store.productSales).toHaveLength(before);
  });

  it("sintaxe antiga CONFIRMAR codigo continua executando uma vez pelo fluxo oficial", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    const randomIntSpy = vi.spyOn(crypto, "randomInt") as unknown as {
      mockImplementation: (implementation: (...args: unknown[]) => number) => unknown;
    };
    randomIntSpy.mockImplementation(() => 4321);
    await postWebhook(app, evolutionPayload("Vendi uma pomada para Joao Santos, ele pagou no Pix."));
    const code = "4321";
    expectPreviewWithoutVisibleCode(fetchMock);
    const confirm = await postWebhook(app, evolutionPayload(`CONFIRMAR ${code}`, ["55", "11", "99999", "9999"].join(""), {
      unitId: "unit-02",
      data: {
        unitId: "unit-02",
        key: { remoteJid: `${["55", "11", "99999", "9999"].join("")}@s.whatsapp.net`, fromMe: false },
        message: { conversation: `CONFIRMAR ${code}` },
      },
    }));

    expect(confirm.statusCode).toBe(200);
    expect(confirm.json()).toMatchObject({ ok: true, executed: true });
    const after = await countCommercialState(app, token);
    expect(after.sales).toBe(before.sales + 1);
    expect(after.pomadaStock).toBe(before.pomadaStock - 1);
    expect(after.financialEntries).toBe(before.financialEntries + 1);
    expect(after.appointments).toBe(before.appointments);
    expect(after.confirmedAudits).toBe(before.confirmedAudits + 1);

    const duplicate = await postWebhook(app, evolutionPayload(`CONFIRMAR ${code}`));
    expect(duplicate.json()).toMatchObject({ ok: true, executed: false });
    const finalState = await countCommercialState(app, token);
    expect(finalState.sales).toBe(after.sales);
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toBe("Não há nenhuma operação aguardando confirmação.");
  });

  it("CONFIRMAR sem codigo executa agendamento pelo fluxo oficial", async () => {
    const fetchMock = mockSemanticV2ScheduleAndWhatsapp({
      clientName: "João Victor", clientEvidence: "João Victor", serviceName: "Corte", serviceEvidence: "corte",
      date: "2026-12-15", dateEvidence: "15/12/2026", time: "11:00", timeEvidence: "as 11h",
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const existingClient = await createWhatsappTestClient(app, token, "105");
    const before = await countCommercialState(app, token);

    await postWebhook(app, evolutionPayload("Agenda João Victor dia 15/12/2026 as 11h para corte."));
    const confirm = await postWebhook(app, evolutionPayload("CONFIRMAR"));

    expect(confirm.statusCode).toBe(200);
    expect(confirm.json()).toMatchObject({ ok: true, executed: true });
    const after = await countCommercialState(app, token);
    expect(after.appointments).toBe(before.appointments + 1);
    expect(after.sales).toBe(before.sales);
    expect(after.financialEntries).toBe(before.financialEntries);
    expect(after.pomadaStock).toBe(before.pomadaStock);
    const appointments = await app.inject({
      method: "GET",
      url: "/appointments?unitId=unit-01",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(appointments.json().appointments).toContainEqual(expect.objectContaining({ clientId: existingClient.id }));
  });

  it("CANCELAR remove previa pendente e nao executa nada", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T15:00:00.000Z"));
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    await postWebhook(app, evolutionPayload("Vendi uma pomada para Joao Santos, ele pagou no Pix."));
    const cancel = await postWebhook(app, evolutionPayload("CANCELAR"));
    const confirm = await postWebhook(app, evolutionPayload("CONFIRMAR"));
    const newPreview = await postWebhook(app, evolutionPayload("Agendar corte para Maria Teste dia 15/07/2026 as 11:00"));

    expect(cancel.json()).toMatchObject({ ok: true, cancelled: true });
    expect(confirm.json()).toMatchObject({ ok: true, executed: false });
    expect(newPreview.json()).toMatchObject({ ok: true, mode: "preview_only", intent: "schedule_appointment", executed: false });
    const after = await countCommercialState(app, token);
    expect(after.sales).toBe(before.sales);
    expect(after.financialEntries).toBe(before.financialEntries);
    expect(after.pomadaStock).toBe(before.pomadaStock);
  });

  it("confirmacao expirada nao executa", async () => {
    process.env.AI_WHATSAPP_PENDING_TTL_MS = "1";
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    await postWebhook(app, evolutionPayload("Vendi uma pomada para Joao Santos, ele pagou no Pix."));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const confirm = await postWebhook(app, evolutionPayload("CONFIRMAR"));

    expect(confirm.json()).toMatchObject({ ok: true, executed: false });
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toBe("A prévia expirou. Envie o pedido novamente.");
    const after = await countCommercialState(app, token);
    expect(after.sales).toBe(before.sales);
    expect(after.financialEntries).toBe(before.financialEntries);
  });

  it("intencao nao liberada continua bloqueada", async () => {
    const fetchMock = mockGeminiIntentAndWhatsapp("checkout_service", {
      clientName: "Lucas",
      serviceNames: ["Corte"],
      paymentMethod: "Pix",
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    const response = await postWebhook(app, evolutionPayload("Fiz um corte no Lucas e ele pagou no Pix."));

    expect(response.json()).toMatchObject({ ok: true, executed: false, intent: "checkout_service" });
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("proxima etapa");
    const after = await countCommercialState(app, token);
    expect(after.sales).toBe(before.sales);
    expect(after.appointments).toBe(before.appointments);
    expect(after.financialEntries).toBe(before.financialEntries);
  });
});
