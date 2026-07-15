import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../src/http/app";
import {
  AudioTranscriptionError,
  createAudioTranscriptionResponseFingerprint,
  extractTranscript,
  GeminiAudioTranscriptionService,
  getGeminiAudioTranscriptionTimeoutMsFromEnv,
} from "../src/application/audio-transcription";
import type { AudioTranscriptionInput, AudioTranscriptionResult } from "../src/application/audio-transcription";
import { InMemoryStore } from "../src/infrastructure/in-memory-store";

const originalEnv = { ...process.env };
const audioBytes = "AQIDBA==";
const ownerPhone = ["55", "11", "99999", "9999"].join("");

function audioPayload(overrides: Record<string, unknown> = {}) {
  return {
    instance: "test-instance",
    data: {
      key: { id: "audio-message-001", remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false },
      message: { audioMessage: { mimetype: "audio/ogg; codecs=opus", fileLength: 4, seconds: 1 } },
    },
    ...overrides,
  };
}

function textPayload(text: string, messageId = `text-${text}`) {
  return {
    instance: "test-instance",
    data: {
      key: { id: messageId, remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false },
      message: { conversation: text },
    },
  };
}

function mockTransport(input: {
  downloadOk?: boolean;
  sendOk?: boolean;
  realTranscript?: string;
  realPayload?: unknown;
  realStatus?: number;
  realTimeout?: boolean;
  semanticTimeout?: boolean;
  semanticResponse?: unknown;
} = {}) {
  return vi.fn(async (url: string) => {
    if (String(url).includes("/message/sendText/")) return { ok: input.sendOk !== false, status: input.sendOk === false ? 503 : 200, text: async () => "" };
    if (String(url).includes("/chat/getBase64FromMediaMessage/")) {
      return input.downloadOk === false
        ? { ok: false, status: 503, text: async () => "" }
        : { ok: true, json: async () => ({ base64: audioBytes }) };
    }
    if (String(url).includes("/v1beta/interactions")) {
      if (input.realTimeout) {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }
      if (input.realStatus) return { ok: false, status: input.realStatus, text: async () => "" };
      return {
        ok: true,
        status: 200,
        json: async () => input.realPayload ?? { output_text: input.realTranscript === undefined ? "Vendi uma pomada para Joao Santos, ele pagou no Pix." : input.realTranscript },
      };
    }
    if (input.semanticTimeout) {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: input.semanticResponse ? JSON.stringify(input.semanticResponse) : "{" }] } }] }) };
  });
}

function providerResponse(input: {
  status?: number;
  transcript?: string;
  message?: string;
  errorStatus?: string;
  details?: unknown[];
  retryAfter?: string;
}) {
  const status = input.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => name.toLowerCase() === "retry-after" ? input.retryAfter ?? null : null,
    },
    text: async () => JSON.stringify({
      error: {
        code: status,
        status: input.errorStatus ?? (status === 429 ? "RESOURCE_EXHAUSTED" : "UNKNOWN"),
        message: input.message ?? "Resource exhausted, please try again later.",
        details: input.details ?? [],
      },
    }),
    json: async () => ({ output_text: input.transcript ?? "Agendar corte para Maria Teste dia 15/07/2026 as 11:00" }),
  };
}

function createFastGeminiAudioService(input: { now?: number; delays?: number[]; random?: number } = {}) {
  let now = input.now ?? 0;
  return new GeminiAudioTranscriptionService("fake-key", "gemini-asr-test", 20_000, 2, 60_000, {
    now: () => now,
    random: () => input.random ?? 0,
    sleep: async (delayMs) => {
      input.delays?.push(delayMs);
      now += delayMs;
    },
  });
}

function semanticScheduleResponse(input: {
  clientName: string;
  clientEvidence: string;
  serviceEvidence: string;
  date: string;
  dateEvidence: string;
  time: string;
  timeEvidence: string;
  period?: "morning" | "afternoon" | "night" | "unspecified";
  timeAmbiguous?: boolean;
  timePrecision?: "exact" | "approximate" | "unspecified";
}) {
  return {
    schemaVersion: "1.0",
    intent: "schedule_appointment",
    intentConfidence: 0.96,
    fields: {
      clientName: { value: input.clientName, evidence: input.clientEvidence, confidence: 0.96 },
      serviceNames: { values: ["Corte"], evidence: input.serviceEvidence, confidence: 0.95 },
      professionalName: { value: "", evidence: "", confidence: 0 },
      date: { expression: input.dateEvidence, canonical: input.date, evidence: input.dateEvidence, confidence: 0.96 },
      time: { expression: input.timeEvidence, canonical: input.time, period: input.period ?? "unspecified", ambiguous: input.timeAmbiguous ?? false, precision: input.timePrecision ?? "exact", evidence: input.timeEvidence, confidence: 0.96 },
    },
    ambiguities: [],
    missingFields: [],
  };
}

function sentTexts(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).includes("/message/sendText/"))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body ?? "")).text as string);
}

async function postWebhook(app: FastifyInstance, payload: Record<string, unknown>) {
  return await app.inject({
    method: "POST",
    url: "/webhooks/evolution/whatsapp",
    headers: { "x-evolution-webhook-secret": "test-webhook-secret" },
    payload,
  });
}

async function loginOwner(app: FastifyInstance) {
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "owner@barbearia.local", password: "owner123", activeUnitId: "unit-01" },
  });
  return response.json().accessToken as string;
}

async function audits(app: FastifyInstance, token: string) {
  const response = await app.inject({
    method: "GET",
    url: "/audit/events?unitId=unit-01&limit=500",
    headers: { authorization: `Bearer ${token}` },
  });
  return response.json().events as Array<{ action: string; afterJson?: Record<string, unknown> }>;
}

describe("extrator de respostas Gemini Interactions", () => {
  it.each([
    ["output_text", { output_text: "  texto direto  " }, "texto direto"],
    ["outputs legado", { outputs: [{ type: "text", text: "texto outputs" }] }, "texto outputs"],
    ["steps model_output", { steps: [{ type: "model_output", content: [{ type: "text", text: "texto steps" }] }] }, "texto steps"],
    ["multiplas partes", { steps: [{ type: "model_output", content: [{ type: "text", text: "primeira" }, { type: "text", text: "segunda" }] }] }, "primeira segunda"],
    ["etapas nao textuais", { steps: [{ type: "thought", content: [{ type: "text", text: "ignorar" }] }, { type: "model_output", content: [{ type: "audio" }, { type: "text", text: "saida" }] }] }, "saida"],
    ["candidates legado", { candidates: [{ content: { parts: [{ text: "texto candidates" }] } }] }, "texto candidates"],
    ["formatos misturados respeitam prioridade", { output_text: "prioritario", outputs: [{ text: "nao usar" }], steps: [{ type: "model_output", content: [{ type: "text", text: "nao usar" }] }] }, "prioritario"],
    ["payload vazio", {}, ""],
    ["texto apenas espacos", { output_text: "   ", outputs: [{ text: "\t" }] }, ""],
    ["tipos invalidos", { output_text: {}, outputs: "invalid", steps: [{ type: "model_output", content: [{ type: "text", text: {} }] }], candidates: [null] }, ""],
  ])("extrai com seguranca %s", (_name, payload, expected) => {
    expect(() => extractTranscript(payload)).not.toThrow();
    expect(extractTranscript(payload)).toBe(expected);
  });

  it("gera fingerprint estrutural sem texto ou conteudo sensivel", () => {
    const fingerprint = createAudioTranscriptionResponseFingerprint({
      output_text: "TRANSCRICAO QUE NAO DEVE SER AUDITADA",
      outputs: [{ type: "text", text: "tambem nao registrar" }],
      steps: [{ type: "model_output", content: [{ type: "text", text: "nao registrar" }, { type: "audio" }] }],
    }, "correlation-test-001");

    expect(fingerprint).toEqual({
      topLevelKeys: ["output_text", "outputs", "steps"],
      outputsCount: 1,
      stepsCount: 1,
      stepTypes: ["model_output"],
      contentPartTypes: ["text", "audio"],
      hasOutputText: true,
      correlationId: "correlation-test-001",
    });
    expect(JSON.stringify(fingerprint)).not.toContain("TRANSCRICAO");
    expect(JSON.stringify(fingerprint)).not.toContain("nao registrar");
  });

  it("preserva status HTTP e fingerprint quando a resposta valida nao possui texto", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ steps: [{ type: "model_output", content: [{ type: "audio" }] }] }) })));
    const service = new GeminiAudioTranscriptionService("fake-key", "gemini-test", 1_000, 2, 60_000);

    try {
      await service.transcribe({ audio: Buffer.from([1]), mimetype: "audio/ogg", correlationId: "correlation-empty-001" });
      throw new Error("Era esperada falha de transcricao vazia.");
    } catch (error) {
      expect(error).toBeInstanceOf(AudioTranscriptionError);
      const transcriptionError = error as AudioTranscriptionError;
      expect(transcriptionError.reason).toBe("audio_transcription_empty");
      expect(transcriptionError.diagnostics).toMatchObject({ providerCalled: true, httpStatus: 200 });
      expect(transcriptionError.diagnostics.responseFingerprint).toMatchObject({ stepsCount: 1, correlationId: "correlation-empty-001" });
    }
  });
});

describe("resiliencia do ASR diante de HTTP 429", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("429 -> 200 respeita Retry-After e conserva diagnostico sanitizado", async () => {
    const delays: number[] = [];
    const responses = [
      providerResponse({ status: 429, retryAfter: "2", message: "Resource exhausted; retry. https://sensitive.example/path" }),
      providerResponse({ transcript: "fala recuperada" }),
    ];
    const fetchMock = vi.fn(async () => responses.shift());
    vi.stubGlobal("fetch", fetchMock);

    const result = await createFastGeminiAudioService({ delays }).transcribe({
      audio: Buffer.from([1]), mimetype: "audio/ogg", correlationId: "retry-429-200",
    });

    expect(result.transcript).toBe("fala recuperada");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([2_000]);
    expect(result.diagnostics).toMatchObject({
      httpStatus: 200,
      attemptCount: 2,
      recentCallCount: 2,
      model: "gemini-asr-test",
      endpoint: "https://generativelanguage.googleapis.com/v1beta/interactions",
      providerErrorCode: "429",
      providerErrorStatus: "RESOURCE_EXHAUSTED",
      providerErrorMessage: "Resource exhausted; retry. [url]",
      retryAfterMs: 2_000,
      retryHeaders: { "retry-after": "2" },
      rateLimitKind: "temporary",
    });
  });

  it("429 -> 429 -> 200 usa no maximo dois retries com backoff e jitter", async () => {
    const delays: number[] = [];
    const responses = [providerResponse({ status: 429 }), providerResponse({ status: 429 }), providerResponse({ transcript: "terceira tentativa" })];
    vi.stubGlobal("fetch", vi.fn(async () => responses.shift()));

    const result = await createFastGeminiAudioService({ delays, random: 0.5 }).transcribe({ audio: Buffer.from([1]), mimetype: "audio/ogg" });

    expect(result.transcript).toBe("terceira tentativa");
    expect(result.diagnostics).toMatchObject({ attemptCount: 3, recentCallCount: 3, rateLimitKind: "temporary" });
    expect(delays).toEqual([1_500, 3_000]);
  });

  it("429 persistente encerra depois de tres chamadas", async () => {
    const delays: number[] = [];
    const fetchMock = vi.fn(async () => providerResponse({ status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createFastGeminiAudioService({ delays }).transcribe({ audio: Buffer.from([1]), mimetype: "audio/ogg" }))
      .rejects.toMatchObject({
        reason: "audio_transcription_429",
        diagnostics: { attemptCount: 3, recentCallCount: 3, rateLimitKind: "temporary" },
      });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([1_000, 2_000]);
  });

  it("cota permanente nao faz retry inutil", async () => {
    const fetchMock = vi.fn(async () => providerResponse({
      status: 429,
      message: "You exceeded your current quota, please check your plan and billing details.",
      details: [{
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }],
      }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createFastGeminiAudioService().transcribe({ audio: Buffer.from([1]), mimetype: "audio/ogg" }))
      .rejects.toMatchObject({
        reason: "audio_transcription_quota_exhausted",
        diagnostics: { attemptCount: 1, rateLimitKind: "quota_exhausted" },
      });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("nao ultrapassa o limite total de 45 segundos", async () => {
    const delays: number[] = [];
    const fetchMock = vi.fn(async () => providerResponse({ status: 429, retryAfter: "46" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createFastGeminiAudioService({ delays }).transcribe({ audio: Buffer.from([1]), mimetype: "audio/ogg" }))
      .rejects.toMatchObject({
        reason: "audio_transcription_timeout",
        diagnostics: { attemptCount: 1, totalBudgetMs: 45_000, retryAfterMs: 46_000 },
      });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });
});

describe("audio do atendente IA via WhatsApp", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.DATA_BACKEND = "memory";
    process.env.NODE_ENV = "test";
    process.env.AUTH_ENFORCED = "true";
    process.env.GEMINI_API_KEY = "fake-gemini-key-for-test";
    process.env.GEMINI_MODEL = "gemini-test";
    process.env.AI_WHATSAPP_ENABLED = "true";
    process.env.AI_WHATSAPP_OWNER_PHONE = ownerPhone;
    process.env.AI_WHATSAPP_UNIT_ID = "unit-01";
    process.env.EVOLUTION_WEBHOOK_SECRET = "test-webhook-secret";
    process.env.EVOLUTION_API_URL = "http://evolution.local";
    process.env.EVOLUTION_API_KEY = "test-evolution-key";
    process.env.EVOLUTION_INSTANCE_NAME = "test-instance";
    process.env.AI_WHATSAPP_AUDIO_ENABLED = "true";
    process.env.AI_AUDIO_TRANSCRIPTION_ENABLED = "true";
    process.env.AI_AUDIO_TRANSCRIPTION_PROVIDER = "mock";
    process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT = "Vendi uma pomada para Joao Santos, ele pagou no Pix.";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    process.env = { ...originalEnv };
  });

  it("limita o timeout Gemini configuravel a uma faixa segura", () => {
    delete process.env.AI_AUDIO_TRANSCRIPTION_TIMEOUT_MS;
    expect(getGeminiAudioTranscriptionTimeoutMsFromEnv()).toBe(20_000);
    process.env.AI_AUDIO_TRANSCRIPTION_TIMEOUT_MS = "100";
    expect(getGeminiAudioTranscriptionTimeoutMsFromEnv()).toBe(5_000);
    process.env.AI_AUDIO_TRANSCRIPTION_TIMEOUT_MS = "45000";
    expect(getGeminiAudioTranscriptionTimeoutMsFromEnv()).toBe(45_000);
    process.env.AI_AUDIO_TRANSCRIPTION_TIMEOUT_MS = "60000";
    expect(getGeminiAudioTranscriptionTimeoutMsFromEnv()).toBe(45_000);
  });

  it("reconhece audio, baixa em memoria, transcreve e gera somente previa de venda", async () => {
    const fetchMock = mockTransport();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);

    const response = await postWebhook(app, audioPayload());

    expect(response.json()).toMatchObject({ ok: true, audio: true, mode: "preview_only", intent: "sell_product", executed: false });
    expect(sentTexts(fetchMock).at(-1)).toContain("Entendi o audio como:");
    expect(sentTexts(fetchMock).at(-1)).toContain("CONFIRMAR");
    const events = await audits(app, token);
    expect(events.map((event) => event.action)).toEqual(expect.arrayContaining([
      "AI_WHATSAPP_PIPELINE_RECEIVED",
      "AI_WHATSAPP_AUDIO_RECEIVED",
      "AI_WHATSAPP_AUDIO_MEDIA_DOWNLOADED",
      "AI_WHATSAPP_AUDIO_TRANSCRIPTION_STARTED",
      "AI_WHATSAPP_AUDIO_TRANSCRIPTION_COMPLETED",
      "AI_WHATSAPP_PARSER_STARTED",
      "AI_WHATSAPP_BOUNDARY_EVALUATED",
      "AI_WHATSAPP_ENTITY_RESOLUTION_COMPLETED",
      "AI_WHATSAPP_PARSER_COMPLETED",
      "AI_WHATSAPP_FINAL_DECISION",
      "AI_WHATSAPP_COMMAND_PARSED",
    ]));
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT ?? "");
    expect(events.some((event) => event.action === "AI_WHATSAPP_PARSER_STARTED" && typeof event.afterJson?.textFingerprint === "string")).toBe(true);
  });

  it("texto transcrito de agendamento usa a mesma previa textual", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-13T15:00:00.000Z"));
    process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT = "Agendar corte para Maria Teste Audio dia quatorze do sete de vinte e seis as onze e trinta";
    const fetchMock = mockTransport();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);

    const response = await postWebhook(app, audioPayload());

    expect(response.json()).toMatchObject({ mode: "preview_only", intent: "schedule_appointment", executed: false });
    expect(sentTexts(fetchMock).at(-1)).toContain("Data: 2026-07-14");
    expect(sentTexts(fetchMock).at(-1)).toContain("Horario: 11:30");
    expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes("/message/sendText/") && !String(url).includes("/chat/getBase64FromMediaMessage/")).length).toBe(0);
    const events = await audits(app, token);
    expect(events.some((event) => event.action === "AI_WHATSAPP_PARSER_OBSERVED" && event.afterJson?.dateRecognitionType === "spoken_numeric_month")).toBe(true);
    expect(JSON.stringify(events)).not.toContain(process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT);
  });

  it("frase exata do audio gera uma unica previa deterministica mesmo com tres retries", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-13T15:00:00.000Z"));
    process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT =
      "Agendar um corte para o cliente João Vittor no dia 13/7/2026 às 17h00";
    const fetchMock = mockTransport();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const createdClient = await app.inject({
      method: "POST",
      url: "/clients",
      headers: { authorization: `Bearer ${token}` },
      payload: { unitId: "unit-01", name: "João Vittor", phone: "5511987654321" },
    });
    expect(createdClient.statusCode).toBe(200);
    const before = await app.inject({
      method: "GET",
      url: "/appointments?unitId=unit-01",
      headers: { authorization: `Bearer ${token}` },
    });

    const responses = await Promise.all([
      postWebhook(app, audioPayload()),
      postWebhook(app, audioPayload()),
      postWebhook(app, audioPayload()),
    ]);

    expect(responses.filter((response) => response.json().mode === "preview_only")).toHaveLength(1);
    expect(responses.filter((response) => response.json().deduplicated === true)).toHaveLength(2);
    expect(sentTexts(fetchMock)).toHaveLength(1);
    expect(sentTexts(fetchMock)[0]).toContain("Cliente: João Vittor");
    expect(sentTexts(fetchMock)[0]).toContain("Servico: Corte");
    expect(sentTexts(fetchMock)[0]).toContain("Data: 2026-07-13");
    expect(sentTexts(fetchMock)[0]).toContain("Horario: 17:00");
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/chat/getBase64FromMediaMessage/")).length).toBe(1);
    expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes("/message/sendText/") && !String(url).includes("/chat/getBase64FromMediaMessage/")).length).toBe(0);

    const events = await audits(app, token);
    expect(events.filter((event) => event.action === "AI_WHATSAPP_WEBHOOK_RECEIVED")).toHaveLength(3);
    expect(events.filter((event) => event.action === "AI_WHATSAPP_WEBHOOK_CLAIMED")).toHaveLength(1);
    expect(events.filter((event) => event.action === "AI_WHATSAPP_WEBHOOK_DEDUPLICATED")).toHaveLength(2);
    expect(events.filter((event) => event.action === "AI_WHATSAPP_RESPONSE_SENT")).toHaveLength(1);
    expect(events.find((event) => event.action === "AI_WHATSAPP_RESPONSE_SENT")?.afterJson).toMatchObject({ origin: "audio_preview" });
    expect(events.find((event) => event.action === "AI_WHATSAPP_PARSER_OBSERVED")?.afterJson).toMatchObject({
      strategy: "deterministic",
      status: "PARSED_COMPLETE",
      presentFields: ["clientName", "serviceNames", "professionalName", "date", "time"],
      missingFields: [],
    });
    expect(events.some((event) => event.action === "AI_WHATSAPP_GEMINI_STARTED" || event.action === "AI_WHATSAPP_GEMINI_COMPLETED")).toBe(false);
    expect(JSON.stringify(events)).not.toContain(process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT);

    const after = await app.inject({
      method: "GET",
      url: "/appointments?unitId=unit-01",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(after.json().appointments).toHaveLength(before.json().appointments.length);
  });

  it("normaliza a transcricao real com hesitacao e periodo em uma unica previa", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-13T15:00:00.000Z"));
    process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT =
      "Marque um corte para o cliente João Victor. É amanhã, às 5 da tarde.";
    const fetchMock = mockTransport({ semanticResponse: semanticScheduleResponse({
      clientName: "João Victor",
      clientEvidence: "cliente João Victor",
      serviceEvidence: "corte",
      date: "2026-07-14",
      dateEvidence: "amanhã",
      time: "17:00",
      timeEvidence: "5 da tarde",
      period: "afternoon",
    }) });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await app.inject({
      method: "GET",
      url: "/appointments?unitId=unit-01",
      headers: { authorization: `Bearer ${token}` },
    });

    const responses = await Promise.all([
      postWebhook(app, audioPayload()),
      postWebhook(app, audioPayload()),
      postWebhook(app, audioPayload()),
    ]);

    expect(responses.filter((response) => response.json().mode === "preview_only")).toHaveLength(1);
    expect(responses.filter((response) => response.json().deduplicated === true)).toHaveLength(2);
    expect(sentTexts(fetchMock)).toHaveLength(1);
    expect(sentTexts(fetchMock)[0]).toContain("Cliente: João Victor");
    expect(sentTexts(fetchMock)[0]).toContain("Servico: Corte");
    expect(sentTexts(fetchMock)[0]).toContain("Profissional: Geovane Borges");
    expect(sentTexts(fetchMock)[0]).toContain("Data: 2026-07-14");
    expect(sentTexts(fetchMock)[0]).toContain("Horario: 17:00");
    expect(sentTexts(fetchMock)[0]).toContain("Cliente novo ou não encontrado");
    expect(sentTexts(fetchMock)[0]).toContain("CONFIRMAR");
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/chat/getBase64FromMediaMessage/")).length).toBe(1);

    const events = await audits(app, token);
    expect(events.filter((event) => event.action === "AI_WHATSAPP_WEBHOOK_RECEIVED")).toHaveLength(3);
    expect(events.filter((event) => event.action === "AI_WHATSAPP_WEBHOOK_CLAIMED")).toHaveLength(1);
    expect(events.filter((event) => event.action === "AI_WHATSAPP_WEBHOOK_DEDUPLICATED")).toHaveLength(2);
    expect(events.filter((event) => event.action === "AI_WHATSAPP_RESPONSE_SENT")).toHaveLength(1);
    expect(events.find((event) => event.action === "AI_WHATSAPP_PARSER_OBSERVED")?.afterJson).toMatchObject({
      strategy: "gemini",
      status: "PARSED_COMPLETE",
      presentFields: ["clientName", "serviceNames", "professionalName", "date", "time"],
      missingFields: [],
    });
    expect(events.some((event) => event.action === "AI_WHATSAPP_GEMINI_COMPLETED")).toBe(true);
    const entities = events.find((event) => event.action === "AI_WHATSAPP_ENTITY_RESOLUTION_COMPLETED")?.afterJson?.entities as Array<{ entity: string; result: string }>;
    expect(entities).toContainEqual(expect.objectContaining({ entity: "client", result: "NOT_FOUND_NEW_CLIENT" }));
    expect(JSON.stringify(events)).not.toContain(process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT);

    const after = await app.inject({
      method: "GET",
      url: "/appointments?unitId=unit-01",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(after.json().appointments).toHaveLength(before.json().appointments.length);
  });

  it("interpreta semanticamente a segunda transcricao real com ordem flexivel", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-13T15:00:00.000Z"));
    process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT =
      "Faça um agendamento de corte para o cliente João Vittor amanhã às 17 horas da tarde.";
    const fetchMock = mockTransport({ semanticResponse: semanticScheduleResponse({
      clientName: "João Vittor",
      clientEvidence: "cliente João Vittor",
      serviceEvidence: "corte",
      date: "2026-07-14",
      dateEvidence: "amanhã",
      time: "17:00",
      timeEvidence: "17 horas da tarde",
      period: "afternoon",
    }) });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await app.inject({ method: "GET", url: "/appointments?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });

    const response = await postWebhook(app, audioPayload());

    expect(response.json()).toMatchObject({ mode: "preview_only", intent: "schedule_appointment", executed: false });
    expect(sentTexts(fetchMock)).toHaveLength(1);
    expect(sentTexts(fetchMock)[0]).toContain("Cliente: João Vittor");
    expect(sentTexts(fetchMock)[0]).toContain("Servico: Corte");
    expect(sentTexts(fetchMock)[0]).toContain("Data: 2026-07-14");
    expect(sentTexts(fetchMock)[0]).toContain("Horario: 17:00");
    expect(sentTexts(fetchMock)[0]).toContain("Cliente novo ou não encontrado");
    expect(sentTexts(fetchMock)[0]).toContain("Profissional: Geovane Borges");
    const events = await audits(app, token);
    expect(events.find((event) => event.action === "AI_WHATSAPP_PARSER_OBSERVED")?.afterJson).toMatchObject({
      strategy: "gemini",
      status: "PARSED_COMPLETE",
    });
    const after = await app.inject({ method: "GET", url: "/appointments?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });
    expect(after.json().appointments).toHaveLength(before.json().appointments.length);
  });

  it("preserva campos de horario aproximado e Sim completa o contexto com uma unica previa", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-13T15:00:00.000Z"));
    process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT = "Coloca o Rafael Silva pra cortar amanhã umas quatro da tarde.";
    const fetchMock = mockTransport({ semanticResponse: semanticScheduleResponse({
      clientName: "Rafael Silva",
      clientEvidence: "Rafael Silva",
      serviceEvidence: "cortar",
      date: "2026-07-14",
      dateEvidence: "amanhã",
      time: "16:00",
      timeEvidence: "umas quatro da tarde",
      period: "afternoon",
      timeAmbiguous: true,
      timePrecision: "approximate",
    }) });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const [before, beforeAppointments] = await Promise.all([
      app.inject({ method: "GET", url: "/catalog?unitId=unit-01", headers: { authorization: `Bearer ${token}` } }),
      app.inject({ method: "GET", url: "/appointments?unitId=unit-01", headers: { authorization: `Bearer ${token}` } }),
    ]);

    const question = await postWebhook(app, audioPayload());

    expect(question.json()).toMatchObject({ ok: true, intent: "schedule_appointment", executed: false });
    expect(sentTexts(fetchMock)).toEqual(["Entendi: Rafael Silva, corte, amanhã. Você quer marcar exatamente às 16:00?"]);
    expect(sentTexts(fetchMock)[0]).not.toContain("Agendar corte para");

    const continuation = await postWebhook(app, textPayload("Sim."));

    expect(continuation.json()).toMatchObject({ mode: "preview_only", intent: "schedule_appointment", executed: false });
    expect(sentTexts(fetchMock)).toHaveLength(2);
    expect(sentTexts(fetchMock)[1]).toContain("Cliente: Rafael Silva");
    expect(sentTexts(fetchMock)[1]).toContain("Servico: Corte");
    expect(sentTexts(fetchMock)[1]).toContain("Profissional: Geovane Borges");
    expect(sentTexts(fetchMock)[1]).toContain("Data: 2026-07-14");
    expect(sentTexts(fetchMock)[1]).toContain("Horario: 16:00");
    expect(sentTexts(fetchMock)[1]).toContain("Cliente novo ou não encontrado");
    const semanticCalls = fetchMock.mock.calls.filter(([url]) => !String(url).includes("/message/sendText/") && !String(url).includes("/chat/getBase64FromMediaMessage/"));
    expect(semanticCalls).toHaveLength(1);
    const [after, afterAppointments] = await Promise.all([
      app.inject({ method: "GET", url: "/catalog?unitId=unit-01", headers: { authorization: `Bearer ${token}` } }),
      app.inject({ method: "GET", url: "/appointments?unitId=unit-01", headers: { authorization: `Bearer ${token}` } }),
    ]);
    expect(after.json().clients).toHaveLength(before.json().clients.length);
    expect(afterAppointments.json().appointments).toHaveLength(beforeAppointments.json().appointments.length);
    const events = await audits(app, token);
    expect(events.some((event) => event.action === "AI_WHATSAPP_CONTEXT_STORED" && event.afterJson?.pendingField === "time" && event.afterJson?.proposedValue === "16:00")).toBe(true);
    expect(events.some((event) => event.action === "AI_WHATSAPP_CONTEXT_COMPLETED" && event.afterJson?.resolvedValue === "16:00")).toBe(true);
  });

  it("preenche cliente e horario em esclarecimentos curtos sem perder o comando do audio", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T15:00:00.000Z"));
    process.env.ASR_PROVIDER = "local_whisper";
    delete process.env.AI_AUDIO_TRANSCRIPTION_PROVIDER;
    const transcript = "Marca o João para cortar amanhã às quatro.";
    const transcribe = vi.fn(async (input: AudioTranscriptionInput): Promise<AudioTranscriptionResult> => ({
      transcript,
      provider: "local_whisper:ggml-large-v3-turbo-q5_0.bin",
      diagnostics: { providerCalled: true, durationMs: 80, passCount: input.pass ?? 1, vadResult: "speech" },
    }));
    const fetchMock = mockTransport();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    store.services[0].name = "Corte";
    store.clients.push({
      id: "cli-joao-vittor",
      businessId: "unit-01",
      fullName: "João Vittor",
      phone: ["55", "11", "98765", "4331"].join(""),
      tags: ["RECURRING"],
    });
    const app = createApp({ memoryStore: store, audioTranscriptionService: { transcribe }, ownerCommandParser: null });
    const token = await loginOwner(app);
    const before = await app.inject({ method: "GET", url: "/appointments?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });

    const question = await postWebhook(app, audioPayload({ data: {
      key: { id: "clarification-audio-001", remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false },
      message: { audioMessage: { mimetype: "audio/ogg", fileLength: 4, seconds: 3 } },
    } }));
    expect(question.json()).toMatchObject({ ok: true, intent: "schedule_appointment", executed: false });
    expect(sentTexts(fetchMock)).toEqual(["Para qual cliente?"]);

    const clientReply = textPayload("João Vittor", "clarification-client-001");
    const clientContinuation = await postWebhook(app, clientReply);
    expect(clientContinuation.json()).toMatchObject({ ok: true, intent: "schedule_appointment", executed: false });
    expect(sentTexts(fetchMock)[1]).toBe("Você quis dizer 04:00 ou 16:00?");

    const replay = await postWebhook(app, clientReply);
    expect(replay.json()).toMatchObject({ ok: true, replay: true, executed: false });
    expect(sentTexts(fetchMock)).toHaveLength(2);

    const timeContinuation = await postWebhook(app, textPayload("16:00", "clarification-time-001"));
    expect(timeContinuation.json()).toMatchObject({ mode: "preview_only", intent: "schedule_appointment", executed: false });
    expect(sentTexts(fetchMock)).toHaveLength(3);
    expect(sentTexts(fetchMock)[2]).toContain("Cliente: João Vittor");
    expect(sentTexts(fetchMock)[2]).toContain("Servico: Corte");
    expect(sentTexts(fetchMock)[2]).toContain("Profissional: Geovane Borges");
    expect(sentTexts(fetchMock)[2]).toContain("Data: 2026-07-15");
    expect(sentTexts(fetchMock)[2]).toContain("Horario: 16:00");
    const modelCalls = fetchMock.mock.calls.filter(([url]) =>
      !String(url).includes("/message/sendText/")
      && !String(url).includes("/chat/getBase64FromMediaMessage/"));
    expect(modelCalls).toHaveLength(0);
    const events = await audits(app, token);
    expect(events.some((event) => event.action === "AI_WHATSAPP_CONTEXT_COMPLETED"
      && event.afterJson?.pendingField === "clientName"
      && event.afterJson?.resolvedValue === "João Vittor")).toBe(true);
    expect(events.some((event) => event.action === "AI_WHATSAPP_CONTEXT_COMPLETED"
      && event.afterJson?.pendingField === "time"
      && event.afterJson?.resolvedValue === "16:00")).toBe(true);
    const after = await app.inject({ method: "GET", url: "/appointments?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });
    expect(after.json().appointments).toHaveLength(before.json().appointments.length);
    expect(store.clients).toHaveLength(3);
  });

  it("resposta curta invalida repete apenas o campo pendente", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T15:00:00.000Z"));
    process.env.ASR_PROVIDER = "local_whisper";
    delete process.env.AI_AUDIO_TRANSCRIPTION_PROVIDER;
    const transcribe = vi.fn(async (): Promise<AudioTranscriptionResult> => ({
      transcript: "Marca para cortar amanhã às quatro.",
      provider: "local_whisper:ggml-large-v3-turbo-q5_0.bin",
      diagnostics: { providerCalled: true, durationMs: 80, passCount: 1, vadResult: "speech" },
    }));
    const fetchMock = mockTransport();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    store.services[0].name = "Corte";
    const app = createApp({ memoryStore: store, audioTranscriptionService: { transcribe }, ownerCommandParser: null });

    await postWebhook(app, audioPayload({ data: {
      key: { id: "invalid-short-audio", remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false },
      message: { audioMessage: { mimetype: "audio/ogg", fileLength: 4, seconds: 3 } },
    } }));
    const invalid = await postWebhook(app, textPayload("12345", "invalid-short-client"));

    expect(invalid.json()).toMatchObject({ ok: true, intent: "schedule_appointment", executed: false });
    expect(sentTexts(fetchMock)).toEqual(["Para qual cliente?", "Para qual cliente?"]);
    expect(fetchMock.mock.calls.some(([url]) => /generativelanguage|llama/i.test(String(url)))).toBe(false);
  });

  it.each(["client", "time"] as const)("CANCELAR limpa todo o contexto durante esclarecimento de %s", async (stage) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T15:00:00.000Z"));
    process.env.ASR_PROVIDER = "local_whisper";
    delete process.env.AI_AUDIO_TRANSCRIPTION_PROVIDER;
    const transcribe = vi.fn(async (): Promise<AudioTranscriptionResult> => ({
      transcript: "Marca para cortar amanhã às quatro.",
      provider: "local_whisper:ggml-large-v3-turbo-q5_0.bin",
      diagnostics: { providerCalled: true, durationMs: 80, passCount: 1, vadResult: "speech" },
    }));
    const fetchMock = mockTransport();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    store.services[0].name = "Corte";
    const app = createApp({ memoryStore: store, audioTranscriptionService: { transcribe }, ownerCommandParser: null });

    await postWebhook(app, audioPayload({ data: {
      key: { id: `cancel-${stage}-audio`, remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false },
      message: { audioMessage: { mimetype: "audio/ogg", fileLength: 4, seconds: 3 } },
    } }));
    if (stage === "time") {
      await postWebhook(app, textPayload("Maria Nova", "cancel-time-client"));
      expect(sentTexts(fetchMock).at(-1)).toBe("Você quis dizer 04:00 ou 16:00?");
    }
    const cancellation = await postWebhook(app, textPayload("CANCELAR", `cancel-${stage}-command`));
    expect(cancellation.json()).toMatchObject({ ok: true, cancelled: true });

    const fresh = await postWebhook(app, textPayload("16:00", `after-cancel-${stage}`));
    expect(fresh.json()).toMatchObject({ ok: true, executed: false, unavailable: true, reason: "deterministic_no_match" });
    expect(sentTexts(fetchMock).at(-1)).toBe("Nao consegui entender com seguranca. Envie novamente ou escreva a mensagem em texto.");
    expect(sentTexts(fetchMock).at(-1)).not.toContain("Maria Nova");
  });

  it("gera previa direta quando a fala informa exatamente as quatro da tarde", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-13T15:00:00.000Z"));
    process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT = "Coloca o Rafael Silva pra cortar amanhã às quatro da tarde.";
    const fetchMock = mockTransport({ semanticResponse: semanticScheduleResponse({
      clientName: "Rafael Silva", clientEvidence: "Rafael Silva", serviceEvidence: "cortar",
      date: "2026-07-14", dateEvidence: "amanhã", time: "16:00", timeEvidence: "às quatro da tarde",
      period: "afternoon", timePrecision: "exact",
    }) });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const response = await postWebhook(app, audioPayload());

    expect(response.json()).toMatchObject({ mode: "preview_only", intent: "schedule_appointment", executed: false });
    expect(sentTexts(fetchMock)).toHaveLength(1);
    expect(sentTexts(fetchMock)[0]).toContain("Horario: 16:00");
    expect(sentTexts(fetchMock)[0]).not.toContain("Você quer marcar exatamente");
  });

  it("aceita continuacoes naturais para confirmar ou explicitar o horario proposto", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-13T15:00:00.000Z"));
    for (const continuation of ["Isso.", "às quatro", "16 horas", "quatro da tarde"]) {
      process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT = "Coloca o Rafael Silva pra cortar amanhã umas quatro da tarde.";
      const fetchMock = mockTransport({ semanticResponse: semanticScheduleResponse({
        clientName: "Rafael Silva", clientEvidence: "Rafael Silva", serviceEvidence: "cortar",
        date: "2026-07-14", dateEvidence: "amanhã", time: "16:00", timeEvidence: "umas quatro da tarde",
        period: "afternoon", timeAmbiguous: true, timePrecision: "approximate",
      }) });
      vi.stubGlobal("fetch", fetchMock);
      const app = createApp();

      await postWebhook(app, audioPayload());
      const response = await postWebhook(app, textPayload(continuation));

      expect(response.json()).toMatchObject({ mode: "preview_only", intent: "schedule_appointment", executed: false });
      expect(sentTexts(fetchMock).at(-1)).toContain("Horario: 16:00");
      vi.unstubAllGlobals();
    }
  });

  it("timeout do Gemini semantico depois de ASR bem sucedido gera falha temporaria, nao ambiguidade", async () => {
    process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT = "Coloca o Rafael pra cortar amanhã umas quatro da tarde.";
    const fetchMock = mockTransport({ semanticTimeout: true });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const response = await postWebhook(app, audioPayload());

    expect(response.json()).toMatchObject({ ok: true, executed: false, unavailable: true, reason: "gemini_timeout" });
    expect(sentTexts(fetchMock)).toHaveLength(1);
    expect(sentTexts(fetchMock)[0]).toContain("falha temporaria do servico");
    expect(sentTexts(fetchMock)[0]).not.toContain("Você quer marcar exatamente");
    expect(sentTexts(fetchMock)[0]).not.toContain("Agendar corte para");
  });

  it("retry concorrente de horario aproximado envia somente uma pergunta", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-13T15:00:00.000Z"));
    process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT = "Coloca o Rafael pra cortar amanhã umas quatro da tarde.";
    const fetchMock = mockTransport({ semanticResponse: semanticScheduleResponse({
      clientName: "Rafael", clientEvidence: "Rafael", serviceEvidence: "cortar",
      date: "2026-07-14", dateEvidence: "amanhã", time: "16:00", timeEvidence: "umas quatro da tarde",
      period: "afternoon", timeAmbiguous: true, timePrecision: "approximate",
    }) });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const responses = await Promise.all([postWebhook(app, audioPayload()), postWebhook(app, audioPayload()), postWebhook(app, audioPayload())]);

    expect(responses.filter((response) => response.json().deduplicated === true)).toHaveLength(2);
    expect(sentTexts(fetchMock)).toEqual(["Entendi: Rafael, corte, amanhã. Você quer marcar exatamente às 16:00?"]);
  });

  it("so executa a venda transcrita apos CONFIRMAR usando o fluxo oficial", async () => {
    const fetchMock = mockTransport();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await app.inject({ method: "GET", url: "/sales/products?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });

    await postWebhook(app, audioPayload());
    const code = (sentTexts(fetchMock).at(-1) ?? "").match(/CONFIRMAR\s+(\d{4})/)?.[1];
    const confirmed = await postWebhook(app, textPayload(`CONFIRMAR ${code}`));
    const after = await app.inject({ method: "GET", url: "/sales/products?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });

    expect(confirmed.json()).toMatchObject({ ok: true, executed: true });
    expect((after.json().sales as unknown[]).length).toBe((before.json().sales as unknown[]).length + 1);
  });

  it("rejeita media sem dados suficientes, grande ou de mimetype inesperado", async () => {
    const fetchMock = mockTransport();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const invalid = await postWebhook(app, audioPayload({ data: { key: { id: "bad-type", remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false }, messageType: "audio", message: { audioMessage: { mimetype: "image/jpeg", fileLength: 4 } } } }));
    const large = await postWebhook(app, audioPayload({ data: { key: { id: "large", remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false }, message: { audioMessage: { mimetype: "audio/ogg", fileLength: 99999999 } } } }));
    const incomplete = await postWebhook(app, audioPayload({ data: { key: { remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false }, message: { audioMessage: { mimetype: "audio/ogg" } } } }));

    for (const response of [invalid, large, incomplete]) {
      expect(response.json()).toMatchObject({ ok: true, audio: true, executed: false });
    }
    expect(sentTexts(fetchMock).every((text) => text.includes("Recebi um audio"))).toBe(true);
  });

  it("distingue audio ininteligivel de falha temporaria do provedor", async () => {
    for (const scenario of [
      { failure: "", expected: "O áudio foi transcrito, mas não consegui identificar o pedido com segurança" },
      { failure: "audio_transcription_failed", expected: "falha temporaria do servico" },
      { failure: "audio_transcription_429", expected: "falha temporaria do servico" },
      { failure: "audio_transcription_timeout", expected: "falha temporaria do servico" },
    ]) {
      process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT = "";
      process.env.AI_WHATSAPP_AUDIO_MOCK_FAILURE = scenario.failure;
      const fetchMock = mockTransport();
      vi.stubGlobal("fetch", fetchMock);
      const app = createApp();
      const response = await postWebhook(app, audioPayload({ data: { key: { id: `failure-${scenario.failure || "empty"}`, remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false }, message: { audioMessage: { mimetype: "audio/ogg", fileLength: 4 } } } }));

      expect(response.json()).toMatchObject({ ok: true, audio: true, executed: false });
      expect(sentTexts(fetchMock).at(-1)).toContain(scenario.expected);
      vi.unstubAllGlobals();
    }
  });

  it("controla falha no download e falha ao enviar a resposta", async () => {
    const downloadMock = mockTransport({ downloadOk: false });
    vi.stubGlobal("fetch", downloadMock);
    const failedDownloadApp = createApp();
    const download = await postWebhook(failedDownloadApp, audioPayload());
    expect(download.json()).toMatchObject({ ok: true, audio: true, reason: "download_failed", responseDelivered: true });

    vi.unstubAllGlobals();
    const sendMock = mockTransport({ sendOk: false });
    vi.stubGlobal("fetch", sendMock);
    const failedSendApp = createApp();
    const send = await postWebhook(failedSendApp, audioPayload());
    expect(send.json()).toMatchObject({ ok: true, audio: true, mode: "preview_only", responseDelivered: false });
  });

  it("ignora replay de audio e mantem auditoria sem bytes, token ou numero completo", async () => {
    const fetchMock = mockTransport();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const first = await postWebhook(app, audioPayload());
    const replay = await postWebhook(app, audioPayload());
    const serializedAudit = JSON.stringify(await audits(app, token));

    expect(first.json()).toMatchObject({ mode: "preview_only", executed: false });
    expect(replay.json()).toMatchObject({ ok: true, replay: true, executed: false });
    expect(sentTexts(fetchMock)).toHaveLength(1);
    expect(serializedAudit).not.toContain(audioBytes);
    expect(serializedAudit).not.toContain("test-evolution-key");
    expect(serializedAudit).not.toContain(ownerPhone);
  });

  it("mantem a transcricao real Gemini isolada do mock e gera a previa textual", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-13T15:00:00.000Z"));
    process.env.AI_AUDIO_TRANSCRIPTION_PROVIDER = "gemini";
    process.env.AI_AUDIO_TRANSCRIPTION_API_KEY = "fake-audio-provider-key";
    process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT = "Vendi uma pomada para CLIENTE DO MOCK, ele pagou no Pix.";
    const fetchMock = mockTransport({
      realPayload: {
        steps: [{ type: "model_output", content: [{ type: "text", text: "Agendar corte para Maria Transcrita Real com Geovane dia 14/07/2026 as 11:00" }] }],
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await app.inject({ method: "GET", url: "/sales/products?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });

    const response = await postWebhook(app, audioPayload());

    expect(response.json()).toMatchObject({ ok: true, mode: "preview_only", intent: "schedule_appointment", executed: false });
    expect(sentTexts(fetchMock).at(-1)).toContain("Maria Transcrita Real");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/v1beta/interactions"))).toBe(true);
    const interactionCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/v1beta/interactions")) as [string, RequestInit?] | undefined;
    const interactionBody = JSON.parse(String(interactionCall?.[1]?.body ?? ""));
    expect(interactionBody.input[1]).toMatchObject({ type: "audio", mime_type: "audio/ogg" });
    const events = await audits(app, token);
    const completed = events.find((event) => event.action === "AI_WHATSAPP_AUDIO_TRANSCRIPTION_COMPLETED");
    expect(completed?.afterJson).toMatchObject({ httpStatus: 200, responseFingerprint: { stepsCount: 1, stepTypes: ["model_output"] } });
    const after = await app.inject({ method: "GET", url: "/sales/products?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });
    expect((after.json().sales as unknown[]).length).toBe((before.json().sales as unknown[]).length);
  });

  it("429 seguido de 200 continua uma unica vez para a interpretacao semantica", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-13T15:00:00.000Z"));
    const semantic = semanticScheduleResponse({
      clientName: "Joao Retry", clientEvidence: "Joao Retry", serviceEvidence: "corte",
      date: "2026-07-14", dateEvidence: "amanha", time: "17:00", timeEvidence: "cinco da tarde", period: "afternoon",
    });
    const baseTransport = mockTransport({ semanticResponse: semantic });
    let asrCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/v1beta/interactions")) {
        asrCalls += 1;
        return asrCalls === 1
          ? providerResponse({ status: 429, retryAfter: "1", message: "Resource exhausted, please try again later." })
          : providerResponse({ transcript: "Olha, marque um corte para Joao Retry amanha, cinco da tarde." });
      }
      return await baseTransport(url);
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ audioTranscriptionService: createFastGeminiAudioService() });
    const token = await loginOwner(app);
    const before = await app.inject({ method: "GET", url: "/appointments?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });

    const response = await postWebhook(app, audioPayload({ data: { key: { id: "asr-retry-semantic", remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false }, message: { audioMessage: { mimetype: "audio/ogg", fileLength: 4 } } } }));

    expect(response.json()).toMatchObject({ mode: "preview_only", intent: "schedule_appointment", executed: false });
    expect(asrCalls).toBe(2);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes(":generateContent"))).toHaveLength(1);
    expect(sentTexts(fetchMock)).toHaveLength(1);
    const events = await audits(app, token);
    expect(events.find((event) => event.action === "AI_WHATSAPP_AUDIO_TRANSCRIPTION_COMPLETED")?.afterJson).toMatchObject({
      attemptCount: 2,
      httpStatus: 200,
      providerErrorCode: "429",
      retryAfterMs: 1_000,
      rateLimitKind: "temporary",
    });
    expect(events.some((event) => event.action === "AI_WHATSAPP_GEMINI_COMPLETED")).toBe(true);
    const after = await app.inject({ method: "GET", url: "/appointments?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });
    expect(after.json().appointments).toHaveLength(before.json().appointments.length);
  });

  it("429 persistente envia somente a resposta final temporaria e nao chama o Gemini semantico", async () => {
    const baseTransport = mockTransport();
    const fetchMock = vi.fn(async (url: string) => String(url).includes("/v1beta/interactions")
      ? providerResponse({ status: 429 })
      : await baseTransport(url));
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ audioTranscriptionService: createFastGeminiAudioService() });
    const token = await loginOwner(app);
    const before = await app.inject({ method: "GET", url: "/appointments?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });

    const response = await postWebhook(app, audioPayload({ data: { key: { id: "asr-429-persistent", remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false }, message: { audioMessage: { mimetype: "audio/ogg", fileLength: 4 } } } }));

    expect(response.json()).toMatchObject({ ok: true, audio: true, reason: "audio_transcription_429", executed: false });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/v1beta/interactions"))).toHaveLength(3);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes(":generateContent"))).toHaveLength(0);
    expect(sentTexts(fetchMock)).toEqual([
      "Nao consegui transcrever o audio agora por uma falha temporaria do servico. Tente novamente em instantes ou envie a mesma mensagem em texto.",
    ]);
    const events = await audits(app, token);
    expect(events.find((event) => event.action === "AI_WHATSAPP_AUDIO_TRANSCRIPTION_FAILED")?.afterJson).toMatchObject({
      attemptCount: 3, rateLimitKind: "temporary", recentCallCount: 3,
    });
    const after = await app.inject({ method: "GET", url: "/appointments?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });
    expect(after.json().appointments).toHaveLength(before.json().appointments.length);
  });

  it("cota permanente responde uma vez sem retry nem interpretacao semantica", async () => {
    const baseTransport = mockTransport();
    const fetchMock = vi.fn(async (url: string) => String(url).includes("/v1beta/interactions")
      ? providerResponse({
          status: 429,
          message: "Daily quota exhausted.",
          details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel" }] }],
        })
      : await baseTransport(url));
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ audioTranscriptionService: createFastGeminiAudioService() });

    const response = await postWebhook(app, audioPayload({ data: { key: { id: "asr-quota-permanent", remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false }, message: { audioMessage: { mimetype: "audio/ogg", fileLength: 4 } } } }));

    expect(response.json()).toMatchObject({ reason: "audio_transcription_quota_exhausted", executed: false });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/v1beta/interactions"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes(":generateContent"))).toHaveLength(0);
    expect(sentTexts(fetchMock)).toEqual([
      "O servico de transcricao esta indisponivel por limite de cota. Envie a mesma mensagem em texto.",
    ]);
  });

  it("replay concorrente do mesmo audio cria uma unica sequencia e uma unica resposta", async () => {
    const baseTransport = mockTransport();
    let releaseAsr: (() => void) | undefined;
    const asrStarted = new Promise<void>((resolve) => { releaseAsr = resolve; });
    let asrCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/v1beta/interactions")) {
        asrCalls += 1;
        releaseAsr?.();
        await Promise.resolve();
        return providerResponse({ transcript: "Agendar corte para Maria Replay dia 15/07/2026 as 11:00" });
      }
      return await baseTransport(url);
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ audioTranscriptionService: createFastGeminiAudioService() });

    const firstPromise = postWebhook(app, audioPayload());
    await asrStarted;
    const responses = await Promise.all([firstPromise, postWebhook(app, audioPayload()), postWebhook(app, audioPayload())]);

    expect(responses.filter((response) => response.json().mode === "preview_only")).toHaveLength(1);
    expect(responses.filter((response) => response.json().deduplicated === true)).toHaveLength(2);
    expect(asrCalls).toBe(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("getBase64FromMediaMessage"))).toHaveLength(1);
    expect(sentTexts(fetchMock)).toHaveLength(1);
  });

  it("trata 429, 5xx, timeout e resposta vazia do provider real sem executar", async () => {
    const scenarios = [
      { name: "rate", transport: { realStatus: 429 }, reason: "audio_transcription_429" },
      { name: "server", transport: { realStatus: 503 }, reason: "audio_transcription_5xx" },
      { name: "timeout", transport: { realTimeout: true }, reason: "audio_transcription_timeout" },
      { name: "empty", transport: { realTranscript: "" }, reason: "audio_transcription_empty" },
    ];
    for (const scenario of scenarios) {
      process.env.AI_AUDIO_TRANSCRIPTION_PROVIDER = "gemini";
      process.env.AI_AUDIO_TRANSCRIPTION_API_KEY = "fake-audio-provider-key";
      const fetchMock = mockTransport(scenario.transport);
      vi.stubGlobal("fetch", fetchMock);
      const app = createApp({ audioTranscriptionService: createFastGeminiAudioService() });
      const response = await postWebhook(app, audioPayload({ data: { key: { id: `real-${scenario.name}`, remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false }, message: { audioMessage: { mimetype: "audio/ogg", fileLength: 4 } } } }));

      expect(response.json()).toMatchObject({ ok: true, audio: true, executed: false, reason: scenario.reason });
      expect(sentTexts(fetchMock).at(-1)).toContain(
        scenario.reason === "audio_transcription_empty"
          ? "O áudio foi transcrito, mas não consegui identificar o pedido com segurança"
          : "falha temporaria do servico",
      );
      vi.unstubAllGlobals();
    }
  });

  it("abre o circuito apenas apos duas sequencias de 429 persistente", async () => {
    process.env.AI_AUDIO_TRANSCRIPTION_PROVIDER = "gemini";
    process.env.AI_AUDIO_TRANSCRIPTION_API_KEY = "fake-audio-provider-key";
    const fetchMock = mockTransport({ realStatus: 429 });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ audioTranscriptionService: createFastGeminiAudioService() });
    const token = await loginOwner(app);

    for (const id of ["rate-limit-1", "rate-limit-2"]) {
      await postWebhook(app, audioPayload({ data: { key: { id, remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false }, message: { audioMessage: { mimetype: "audio/ogg", fileLength: 4 } } } }));
    }
    const blocked = await postWebhook(app, audioPayload({ data: { key: { id: "rate-limit-3", remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false }, message: { audioMessage: { mimetype: "audio/ogg", fileLength: 4 } } } }));

    expect(blocked.json()).toMatchObject({ ok: true, audio: true, executed: false, reason: "audio_transcription_circuit_open" });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/v1beta/interactions"))).toHaveLength(6);
    const events = await audits(app, token);
    expect(events.some((event) => event.action === "AI_WHATSAPP_AUDIO_TRANSCRIPTION_FAILED" && event.afterJson?.reason === "audio_transcription_circuit_open" && event.afterJson?.providerCalled === false)).toBe(true);
  });

  it("responde sem baixar midia quando a feature flag esta desligada", async () => {
    process.env.AI_WHATSAPP_AUDIO_ENABLED = "false";
    const fetchMock = mockTransport();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);

    const response = await postWebhook(app, audioPayload());
    const replay = await postWebhook(app, audioPayload());

    expect(response.json()).toMatchObject({ ok: true, audio: true, disabled: true, executed: false });
    expect(replay.json()).toMatchObject({ ok: true, deduplicated: true, executed: false });
    expect(sentTexts(fetchMock)).toEqual([
      "O processamento de áudio não está disponível nesta versão. Envie seu pedido em texto.",
    ]);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("getBase64FromMediaMessage"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/v1beta/interactions"))).toBe(false);
    const events = await audits(app, token);
    expect(events.some((event) => event.action === "AI_WHATSAPP_AUDIO_TRANSCRIPTION_DISABLED")).toBe(true);
    expect(events.some((event) => event.action === "AI_WHATSAPP_AUDIO_MEDIA_DOWNLOADED")).toBe(false);
    expect(events.some((event) => event.action === "AI_WHATSAPP_AUDIO_TRANSCRIPTION_STARTED")).toBe(false);
    expect(events.some((event) => event.action === "AI_WHATSAPP_COMMAND_PARSED")).toBe(false);
  });

  it("usa vocabulario local, parser oficial deterministico e nenhuma IA remota", async () => {
    process.env.ASR_PROVIDER = "local_whisper";
    delete process.env.AI_AUDIO_TRANSCRIPTION_PROVIDER;
    const transcribe = vi.fn(async (_input: AudioTranscriptionInput): Promise<AudioTranscriptionResult> => ({
      transcript: "Registrar venda de 1 Pomada com pagamento pique",
      provider: "local_whisper:ggml-large-v3-turbo-q5_0.bin",
      diagnostics: { providerCalled: true, durationMs: 120, passCount: 1 as const, vadResult: "speech" as const },
    }));
    const fetchMock = mockTransport();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ audioTranscriptionService: { transcribe }, ownerCommandParser: null });
    const token = await loginOwner(app);
    const before = await app.inject({
      method: "GET",
      url: "/sales/products?unitId=unit-01",
      headers: { authorization: `Bearer ${token}` },
    });

    const response = await postWebhook(app, audioPayload({ data: {
      key: { id: "local-vocabulary-001", remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false },
      message: { audioMessage: { mimetype: "audio/ogg", fileLength: 4, seconds: 1 } },
    } }));
    const cancellation = await postWebhook(app, textPayload("CANCELAR"));

    expect(response.json()).toMatchObject({ ok: true, mode: "preview_only", intent: "sell_product", executed: false });
    expect(sentTexts(fetchMock)[0]).toContain("Produto: Pomada");
    expect(sentTexts(fetchMock)[0]).toContain("Pagamento: Pix");
    expect(sentTexts(fetchMock)[0]).toContain("Cliente: nao vinculado");
    expect(cancellation.json()).toMatchObject({ ok: true, cancelled: true });
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(transcribe.mock.calls[0]?.[0]).toMatchObject({ pass: 1, timeoutMs: 20_000 });
    expect(String(transcribe.mock.calls[0]?.[0]?.initialPrompt).length).toBeLessThanOrEqual(1_500);
    expect(fetchMock.mock.calls.some(([url]) => /generativelanguage|llama/i.test(String(url)))).toBe(false);
    const events = await audits(app, token);
    expect(events.find((event) => event.action === "AI_WHATSAPP_AUDIO_FIELD_VALIDATION")?.afterJson)
      .toMatchObject({ passCount: 1, fields: expect.arrayContaining([
        { field: "productName", status: "GROUNDED" },
        { field: "paymentMethod", status: "GROUNDED" },
      ]) });
    const after = await app.inject({
      method: "GET",
      url: "/sales/products?unitId=unit-01",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(after.json().sales).toHaveLength(before.json().sales.length);
  });

  it("texto e audio autorizados resolvem a mesma identidade e unidade", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-14T15:00:00.000Z"));
    process.env.ASR_PROVIDER = "local_whisper";
    delete process.env.AI_AUDIO_TRANSCRIPTION_PROVIDER;
    const transcript = "Coloca o João Vitor para cortar amanhã, às quatro da tarde";
    const transcribe = vi.fn(async (input: AudioTranscriptionInput): Promise<AudioTranscriptionResult> => ({
      transcript,
      provider: "local_whisper:ggml-large-v3-turbo-q5_0.bin",
      diagnostics: { providerCalled: true, durationMs: 100, passCount: input.pass ?? 1, vadResult: "speech" },
    }));
    const fetchMock = mockTransport();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    store.services[0].name = "Corte";
    const app = createApp({ memoryStore: store, audioTranscriptionService: { transcribe }, ownerCommandParser: null });
    const token = await loginOwner(app);
    const createdClient = await app.inject({
      method: "POST",
      url: "/clients",
      headers: { authorization: `Bearer ${token}` },
      payload: { unitId: "unit-01", name: "João Vitor", phone: ["55", "11", "98765", "4331"].join("") },
    });
    expect(createdClient.statusCode).toBe(200);
    const before = await app.inject({ method: "GET", url: "/appointments?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });

    const textResponse = await postWebhook(app, textPayload(transcript));
    const audioResponse = await postWebhook(app, audioPayload({ data: {
      key: { id: "natural-unit-resolution-audio", remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false },
      message: { audioMessage: { mimetype: "audio/ogg", fileLength: 4, seconds: 5 } },
    } }));

    expect(textResponse.json()).toMatchObject({ ok: true, executed: false });
    expect(audioResponse.json()).toMatchObject({ ok: true, executed: false });
    expect(transcribe).toHaveBeenCalled();
    expect(textResponse.json()).not.toHaveProperty("unavailable", true);
    expect(audioResponse.json()).not.toHaveProperty("unavailable", true);
    expect(sentTexts(fetchMock)).toHaveLength(2);
    expect(fetchMock.mock.calls.some(([url]) => /generativelanguage|llama/i.test(String(url)))).toBe(false);
    const events = await audits(app, token);
    const identities = events
      .filter((event) => event.action === "AI_WHATSAPP_WEBHOOK_RECEIVED")
      .map((event) => event.afterJson)
      .filter((event) => event?.origin === "whatsapp_webhook");
    expect(identities).toHaveLength(2);
    expect(new Set(identities.map((identity) => identity?.unitFingerprint)).size).toBe(1);
    expect(new Set(identities.map((identity) => identity?.actorFingerprint)).size).toBe(1);
    expect(identities.every((identity) => identity?.actorRole === "owner")).toBe(true);
    const parserEvents = events.filter((event) => event.action === "AI_WHATSAPP_PARSER_OBSERVED");
    expect(parserEvents).toHaveLength(2);
    expect(parserEvents.every((event) => event.afterJson?.strategy === "deterministic")).toBe(true);
    expect(sentTexts(fetchMock).every((text) => text.includes("Horario: 16:00"))).toBe(true);
    expect(sentTexts(fetchMock).every((text) => text.includes("Profissional: Geovane Borges"))).toBe(true);
    const after = await app.inject({ method: "GET", url: "/appointments?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });
    expect(after.json().appointments).toHaveLength(before.json().appointments.length);
  });

  it("entrega somente a transcricao real ao parser e responde sem exemplos quando nao compreende", async () => {
    process.env.ASR_PROVIDER = "local_whisper";
    delete process.env.AI_AUDIO_TRANSCRIPTION_PROVIDER;
    const transcript = "pedido real sem intencao reconhecivel";
    const transcribe = vi.fn(async (input: AudioTranscriptionInput): Promise<AudioTranscriptionResult> => ({
      transcript,
      provider: "local_whisper:ggml-large-v3-turbo-q5_0.bin",
      diagnostics: { providerCalled: true, durationMs: 100, passCount: input.pass ?? 1, vadResult: "speech" },
    }));
    const fetchMock = mockTransport();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ audioTranscriptionService: { transcribe }, ownerCommandParser: null });
    const token = await loginOwner(app);
    const beforeSales = await app.inject({ method: "GET", url: "/sales/products?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });
    const beforeAppointments = await app.inject({ method: "GET", url: "/appointments?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });

    const response = await postWebhook(app, audioPayload({ data: {
      key: { id: "local-safe-fallback-001", remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false },
      message: { audioMessage: { mimetype: "audio/ogg", fileLength: 4, seconds: 1 } },
    } }));

    expect(response.json()).toMatchObject({ ok: true, executed: false });
    expect(sentTexts(fetchMock)).toEqual([
      "O áudio foi transcrito, mas não consegui identificar o pedido com segurança. Envie novamente ou escreva a mensagem em texto.",
    ]);
    expect(sentTexts(fetchMock)[0]).not.toMatch(/Vendi uma pomada|Agendar corte para Joao|CONFIRMAR/);
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.some(([url]) => /generativelanguage|llama/i.test(String(url)))).toBe(false);
    const events = await audits(app, token);
    expect(events.find((event) => event.action === "AI_WHATSAPP_PARSER_STARTED")?.afterJson)
      .toMatchObject({ characterCount: transcript.length, approximateWordCount: 5 });
    expect(events.filter((event) => event.action === "AI_WHATSAPP_RESPONSE_SENT")).toHaveLength(1);
    expect(events.some((event) => event.action === "AI_WHATSAPP_COMMAND_PARSED")).toBe(false);
    expect(JSON.stringify(events)).not.toContain(transcript);
    const afterSales = await app.inject({ method: "GET", url: "/sales/products?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });
    const afterAppointments = await app.inject({ method: "GET", url: "/appointments?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });
    expect(afterSales.json().sales).toHaveLength(beforeSales.json().sales.length);
    expect(afterAppointments.json().appointments).toHaveLength(beforeAppointments.json().appointments.length);
  });

  it("faz no maximo uma segunda passagem focada no mesmo claim e dentro do orcamento", async () => {
    process.env.ASR_PROVIDER = "local_whisper";
    delete process.env.AI_AUDIO_TRANSCRIPTION_PROVIDER;
    let transcriptionPass = 0;
    const transcribe = vi.fn(async (_input: AudioTranscriptionInput): Promise<AudioTranscriptionResult> => {
      transcriptionPass += 1;
      return transcriptionPass === 1 ? {
        transcript: "Registrar venda de 1 produto com pagamento Pix",
        provider: "local_whisper:ggml-large-v3-turbo-q5_0.bin",
        diagnostics: { providerCalled: true, durationMs: 100, passCount: 1, vadResult: "speech" },
      } : {
        transcript: "Registrar venda de 1 Pomada com pagamento Pix",
        provider: "local_whisper:ggml-large-v3-turbo-q5_0.bin",
        diagnostics: { providerCalled: true, durationMs: 90, passCount: 2, vadResult: "speech" },
      };
    });
    const fetchMock = mockTransport();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({ audioTranscriptionService: { transcribe }, ownerCommandParser: null });
    const token = await loginOwner(app);

    const response = await postWebhook(app, audioPayload({ data: {
      key: { id: "local-second-pass-001", remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false },
      message: { audioMessage: { mimetype: "audio/ogg", fileLength: 4, seconds: 1 } },
    } }));

    expect(response.json()).toMatchObject({ ok: true, mode: "preview_only", intent: "sell_product", executed: false });
    expect(transcribe).toHaveBeenCalledTimes(2);
    const first = transcribe.mock.calls[0]?.[0];
    const second = transcribe.mock.calls[1]?.[0];
    expect(second).toMatchObject({ pass: 2, correlationId: first?.correlationId });
    expect(second?.audio).toBe(first?.audio);
    expect(second?.timeoutMs).toBeLessThanOrEqual(20_000);
    expect(String(second?.initialPrompt).length).toBeLessThanOrEqual(500);
    expect(fetchMock.mock.calls.some(([url]) => /generativelanguage|llama/i.test(String(url)))).toBe(false);
    const events = await audits(app, token);
    expect(events.filter((event) => event.action === "AI_WHATSAPP_AUDIO_SECOND_PASS_COMPLETED")).toHaveLength(1);
    expect(events.find((event) => event.action === "AI_WHATSAPP_AUDIO_FIELD_VALIDATION")?.afterJson?.passCount).toBe(2);
  });

  it("gera previa direta para nome completo novo reconhecido no audio", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-13T15:00:00.000Z"));
    process.env.ASR_PROVIDER = "local_whisper";
    delete process.env.AI_AUDIO_TRANSCRIPTION_PROVIDER;
    const transcript = "Agendar corte para Maria Audio Nova com Geovane Borges dia 15/07/2026 as 11:00";
    const transcribe = vi.fn(async (_input: AudioTranscriptionInput): Promise<AudioTranscriptionResult> => ({
      transcript,
      provider: "local_whisper:ggml-large-v3-turbo-q5_0.bin",
      diagnostics: { providerCalled: true, durationMs: 100, passCount: 1, vadResult: "speech" },
    }));
    const fetchMock = mockTransport();
    vi.stubGlobal("fetch", fetchMock);
    const store = new InMemoryStore();
    store.clients = [];
    store.services[0].name = "Corte";
    const app = createApp({ memoryStore: store, audioTranscriptionService: { transcribe }, ownerCommandParser: null });
    const token = await loginOwner(app);
    const before = await app.inject({
      method: "GET",
      url: "/appointments?unitId=unit-01",
      headers: { authorization: `Bearer ${token}` },
    });

    const first = await postWebhook(app, audioPayload({ data: {
      key: { id: "local-new-client-001", remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false },
      message: { audioMessage: { mimetype: "audio/ogg", fileLength: 4, seconds: 1 } },
    } }));
    expect(first.json()).toMatchObject({ ok: true, mode: "preview_only", intent: "schedule_appointment", executed: false });
    expect(sentTexts(fetchMock)).toHaveLength(1);
    expect(sentTexts(fetchMock)[0]).not.toContain("Para qual cliente?");
    expect(sentTexts(fetchMock)[0]).toContain("Cliente: Maria Audio Nova");
    expect(sentTexts(fetchMock)[0]).toContain("Servico: Corte");
    expect(sentTexts(fetchMock)[0]).toContain("Profissional: Geovane Borges");
    expect(sentTexts(fetchMock)[0]).toContain("Data: 2026-07-15");
    expect(sentTexts(fetchMock)[0]).toContain("Horario: 11:00");
    expect(sentTexts(fetchMock)[0]).toContain("Cliente novo ou não encontrado. Ele será criado somente se o owner confirmar.");
    expect(sentTexts(fetchMock)[0]).toMatch(/CONFIRMAR \d{4}/);
    expect(transcribe).toHaveBeenCalledTimes(1);
    const events = await audits(app, token);
    expect(events.find((event) => event.action === "AI_WHATSAPP_AUDIO_FIELD_VALIDATION")?.afterJson)
      .toMatchObject({ fields: expect.arrayContaining([{ field: "clientName", status: "EXACT" }]) });
    expect(JSON.stringify(events)).not.toContain(transcript);
    const after = await app.inject({
      method: "GET",
      url: "/appointments?unitId=unit-01",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(after.json().appointments).toHaveLength(before.json().appointments.length);
    expect(store.clients).toHaveLength(0);
  });
});
