import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  const response = await app.inject({
    method: "POST",
    url: "/clients",
    headers: { authorization: `Bearer ${token}` },
    payload: { unitId: "unit-01", name: "João Victor", phone: `55119876${suffix.padStart(5, "0")}` },
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
    vi.unstubAllGlobals();
    vi.useRealTimers();
    process.env = { ...originalEnv };
  });

  it("bloqueia numero nao autorizado sem enviar resposta", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const response = await postWebhook(app, evolutionPayload("Vendi uma pomada para Lucas no Pix.", "5511888887777"));

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, ignored: true });
    expect(sentWhatsAppTexts(fetchMock)).toEqual([]);
  });

  it("autoriza payload LID sanitizado pelo remoteJidAlt e responde ao telefone real", async () => {
    process.env.AI_WHATSAPP_OWNER_PHONE = "5511999999452";
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    const response = await postWebhook(app, evolutionPayload("Vendi uma pomada para CLIENTE TESTE IA WPP, ele pagou no Pix.", "5511999999452", {
      data: {
        key: {
          remoteJid: "999999999999744@lid",
          remoteJidAlt: "5511999999452@s.whatsapp.net",
          fromMe: false,
        },
        message: { conversation: "Vendi uma pomada para CLIENTE TESTE IA WPP, ele pagou no Pix." },
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
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("Agendamento: Agendar corte");
  });

  it("texto de venda gera previa e nao executa", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    const response = await postWebhook(app, evolutionPayload("Vendi uma pomada para CLIENTE TESTE IA WPP, ele pagou no Pix."));

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ mode: "preview_only", intent: "sell_product", executed: false });
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("Para confirmar, responda: CONFIRMAR");
    expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes("/message/sendText/")).length).toBe(0);
    await expect(countCommercialState(app, token)).resolves.toEqual({
      ...before,
      parsedAudits: before.parsedAudits + 1,
    });
  });

  it("deduplica tres entregas concorrentes do mesmo eventId e envia uma unica previa", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);
    const text = "Vendi uma pomada para CLIENTE TESTE IA WPP, ele pagou no Pix.";
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
      clientName: "CLIENTE TESTE IA WPP",
      productName: "Pomada",
      quantity: 1,
      paymentMethod: "Pix",
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const response = await postWebhook(app, evolutionPayload("Vendi uma pomada para CLIENTE TESTE IA WPP."));

    expect(response.json()).toMatchObject({ ok: true, mode: "preview_only", intent: "sell_product", executed: false });
    expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes("/message/sendText/")).length).toBe(1);
    expect(lastConfirmationCode(fetchMock)).toMatch(/^\d{4}$/);
  });

  it("timeout Gemini com comando incompleto pede esclarecimento sem codigo", async () => {
    const fetchMock = mockGeminiTimeoutAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);

    const response = await postWebhook(app, evolutionPayload("Vendi uma pomada para CLIENTE TESTE IA WPP."));

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
      clientName: "CLIENTE TESTE IA WPP",
      productName: "Pomada",
      quantity: 1,
      paymentMethod: "Pix",
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    const response = await postWebhook(app, evolutionPayload("Vendi uma pomada para CLIENTE TESTE IA WPP, ele pagou no Pix."));

    expect(response.json()).toMatchObject({ ok: true, mode: "preview_only", intent: "sell_product", executed: false });
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("Produto: Pomada Matte");
    expect(lastConfirmationCode(fetchMock)).toMatch(/^\d{4}$/);
    await expect(countCommercialState(app, token)).resolves.toEqual({
      ...before,
      parsedAudits: before.parsedAudits + 1,
    });
  });

  it("bloqueia produto parcial sem alias e nao cria pendencia executavel", async () => {
    const fetchMock = mockGeminiIntentAndWhatsapp("sell_product", {
      clientName: "CLIENTE TESTE IA WPP",
      productName: "Oleo",
      quantity: 1,
      paymentMethod: "Pix",
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    const response = await postWebhook(app, evolutionPayload("Vendi um oleo para CLIENTE TESTE IA WPP, ele pagou no Pix."));

    expect(response.json()).toMatchObject({ ok: true, intent: "sell_product", executed: false });
    expect(lastConfirmationCode(fetchMock)).toBe("");
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("produto");
    await expect(countCommercialState(app, token)).resolves.toEqual(before);
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
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toBe("Qual dia e horario voce deseja?");
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
    expect(lastConfirmationCode(fetchMock)).toMatch(/^\d{4}$/);
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
    expect(lastConfirmationCode(fetchMock)).toMatch(/^\d{4}$/);
    expect(sentWhatsAppTexts(fetchMock)).toHaveLength(1);
    expect(sentWhatsAppTexts(fetchMock)[0]).toContain("Cliente novo ou nao encontrado");
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
    expect(lastConfirmationCode(fetchMock)).toMatch(/^\d{4}$/);
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

    expect(response.json()).toMatchObject({ ok: true, intent: "schedule_appointment", executed: false });
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

  it("gera previa deterministica com data e horario totalmente falados e audita somente o tipo", async () => {
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
      expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("Nao consegui");
      await expect(countCommercialState(app, token)).resolves.toEqual(before);
      vi.unstubAllGlobals();
    }
  });

  it("429 repetido abre circuito e comando deterministico completo nao insiste no Gemini", async () => {
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

  it("comando desconhecido recebe orientacao de formato e auditoria sem numero completo", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);

    const response = await postWebhook(app, evolutionPayload("asdf teste qualquer"));

    expect(response.statusCode).toBe(200);
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("Agendamento: Agendar corte");
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

  it("CONFIRMAR codigo executa venda uma vez pelo fluxo oficial", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    await postWebhook(app, evolutionPayload("Vendi uma pomada para CLIENTE TESTE IA WPP, ele pagou no Pix."));
    const code = lastConfirmationCode(fetchMock);
    expect(code).toMatch(/^\d{4}$/);
    const confirm = await postWebhook(app, evolutionPayload(`CONFIRMAR ${code}`));

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
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("ja foi confirmada ou expirou");
  });

  it("CONFIRMAR codigo executa agendamento pelo fluxo oficial", async () => {
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
    const confirm = await postWebhook(app, evolutionPayload(`CONFIRMAR ${lastConfirmationCode(fetchMock)}`));

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
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    await postWebhook(app, evolutionPayload("Vendi uma pomada para CLIENTE TESTE IA WPP, ele pagou no Pix."));
    const code = lastConfirmationCode(fetchMock);
    const cancel = await postWebhook(app, evolutionPayload("CANCELAR"));
    const confirm = await postWebhook(app, evolutionPayload(`CONFIRMAR ${code}`));
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

    await postWebhook(app, evolutionPayload("Vendi uma pomada para CLIENTE TESTE IA WPP, ele pagou no Pix."));
    const code = lastConfirmationCode(fetchMock);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const confirm = await postWebhook(app, evolutionPayload(`CONFIRMAR ${code}`));

    expect(confirm.json()).toMatchObject({ ok: true, executed: false });
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
