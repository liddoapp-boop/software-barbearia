import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../src/http/app";

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
    await expect(countCommercialState(app, token)).resolves.toEqual({
      ...before,
      parsedAudits: before.parsedAudits + 1,
    });
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

  it("bloqueia cliente e profissional parciais no WhatsApp", async () => {
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
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("nome exato");
    await expect(countCommercialState(app, token)).resolves.toEqual(before);
  });

  it("resolve alias explicito de servico sem alterar o fluxo do painel", async () => {
    const fetchMock = mockGeminiIntentAndWhatsapp("schedule_appointment", {
      clientName: "CLIENTE TESTE IA WPP",
      serviceNames: ["Corte masculino"],
      date: "2026-12-15",
      time: "10:00",
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const response = await postWebhook(app, evolutionPayload("Agende corte masculino para CLIENTE TESTE IA WPP."));

    expect(response.json()).toMatchObject({ ok: true, mode: "preview_only", intent: "schedule_appointment", executed: false });
    expect(lastConfirmationCode(fetchMock)).toMatch(/^\d{4}$/);
  });

  it("texto de agendamento gera previa e nao executa", async () => {
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    const response = await postWebhook(app, evolutionPayload("Agenda CLIENTE TESTE IA WPP amanha as 11h para corte."));

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
      evolutionPayload("Agendar corte para CLIENTE TESTE IA WPP AGENDAMENTO dia 14/07/2026 as 11:00"),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ mode: "preview_only", intent: "schedule_appointment", executed: false });
    const preview = sentWhatsAppTexts(fetchMock).at(-1) ?? "";
    expect(preview).toContain("Cliente: CLIENTE TESTE IA WPP AGENDAMENTO");
    expect(preview).toContain("Servico: Corte");
    expect(preview).toContain("Data: 2026-07-14");
    expect(preview).toContain("Horario: 11:00");
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
    expect(sentWhatsAppTexts(fetchMock).at(-1)).toContain("Nao consegui processar essa mensagem agora");
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

  it("429 repetido abre circuito, usa fallback e nao insiste no Gemini", async () => {
    const fetchMock = mockGeminiUnavailableAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);

    await postWebhook(app, evolutionPayload("PING IA"));
    await postWebhook(app, evolutionPayload("PING IA"));
    const fallback = await postWebhook(app, evolutionPayload("Agendar corte para CLIENTE TESTE IA dia 15/07/2026 as 11:00"));

    expect(fallback.statusCode).toBe(200);
    expect(fallback.json()).toMatchObject({ ok: true, mode: "preview_only", intent: "schedule_appointment" });
    expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes("/message/sendText/")).length).toBe(2);
    const events = await auditEvents(app, token);
    expect(events.some((event) => event.action === "AI_WHATSAPP_FALLBACK_USED" && event.afterJson?.reason === "gemini_circuit_open")).toBe(true);
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
    const fetchMock = mockGeminiInvalidJsonAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await countCommercialState(app, token);

    await postWebhook(app, evolutionPayload("Agenda CLIENTE TESTE IA WPP amanha as 11h para corte."));
    const confirm = await postWebhook(app, evolutionPayload(`CONFIRMAR ${lastConfirmationCode(fetchMock)}`));

    expect(confirm.statusCode).toBe(200);
    expect(confirm.json()).toMatchObject({ ok: true, executed: true });
    const after = await countCommercialState(app, token);
    expect(after.appointments).toBe(before.appointments + 1);
    expect(after.sales).toBe(before.sales);
    expect(after.financialEntries).toBe(before.financialEntries);
    expect(after.pomadaStock).toBe(before.pomadaStock);
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
    const newPreview = await postWebhook(app, evolutionPayload("Agendar corte para CLIENTE TESTE IA WPP dia 15/07/2026 as 11:00"));

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
