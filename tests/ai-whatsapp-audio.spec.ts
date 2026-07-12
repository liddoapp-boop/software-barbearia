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

function textPayload(text: string) {
  return {
    instance: "test-instance",
    data: {
      key: { id: `text-${text}`, remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false },
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
        json: async () => input.realPayload ?? { output_text: input.realTranscript === undefined ? "Vendi uma pomada para CLIENTE TESTE IA AUDIO, ele pagou no Pix." : input.realTranscript },
      };
    }
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "{" }] } }] }) };
  });
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
    process.env.AI_AUDIO_TRANSCRIPTION_ENABLED = "true";
    process.env.AI_AUDIO_TRANSCRIPTION_PROVIDER = "mock";
    process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT = "Vendi uma pomada para CLIENTE TESTE IA AUDIO, ele pagou no Pix.";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("limita o timeout Gemini configuravel a uma faixa segura", () => {
    delete process.env.AI_AUDIO_TRANSCRIPTION_TIMEOUT_MS;
    expect(getGeminiAudioTranscriptionTimeoutMsFromEnv()).toBe(20_000);
    process.env.AI_AUDIO_TRANSCRIPTION_TIMEOUT_MS = "100";
    expect(getGeminiAudioTranscriptionTimeoutMsFromEnv()).toBe(5_000);
    process.env.AI_AUDIO_TRANSCRIPTION_TIMEOUT_MS = "40000";
    expect(getGeminiAudioTranscriptionTimeoutMsFromEnv()).toBe(30_000);
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
      "AI_WHATSAPP_AUDIO_RECEIVED",
      "AI_WHATSAPP_AUDIO_TRANSCRIPTION_STARTED",
      "AI_WHATSAPP_AUDIO_TRANSCRIPTION_COMPLETED",
      "AI_WHATSAPP_COMMAND_PARSED",
    ]));
  });

  it("texto transcrito de agendamento usa a mesma previa textual", async () => {
    process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT = "Agendar corte para CLIENTE TESTE IA AUDIO dia 14/07/2026 as 11:00";
    const fetchMock = mockTransport();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const response = await postWebhook(app, audioPayload());

    expect(response.json()).toMatchObject({ mode: "preview_only", intent: "schedule_appointment", executed: false });
    expect(sentTexts(fetchMock).at(-1)).toContain("Horario: 11:00");
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

  it("responde com orientacao controlada para transcricao vazia, erro, 429 e timeout", async () => {
    for (const failure of ["", "audio_transcription_failed", "audio_transcription_429", "audio_transcription_timeout"]) {
      process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT = "";
      process.env.AI_WHATSAPP_AUDIO_MOCK_FAILURE = failure;
      const fetchMock = mockTransport();
      vi.stubGlobal("fetch", fetchMock);
      const app = createApp();
      const response = await postWebhook(app, audioPayload({ data: { key: { id: `failure-${failure || "empty"}`, remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false }, message: { audioMessage: { mimetype: "audio/ogg", fileLength: 4 } } } }));

      expect(response.json()).toMatchObject({ ok: true, audio: true, executed: false });
      expect(sentTexts(fetchMock).at(-1)).toContain("Nao consegui entender o audio");
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
    process.env.AI_AUDIO_TRANSCRIPTION_PROVIDER = "gemini";
    process.env.AI_AUDIO_TRANSCRIPTION_API_KEY = "fake-audio-provider-key";
    process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT = "Vendi uma pomada para CLIENTE DO MOCK, ele pagou no Pix.";
    const fetchMock = mockTransport({
      realPayload: {
        steps: [{ type: "model_output", content: [{ type: "text", text: "Agendar corte para CLIENTE TRANSCRITO REAL dia 14/07/2026 as 11:00" }] }],
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await app.inject({ method: "GET", url: "/sales/products?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });

    const response = await postWebhook(app, audioPayload());

    expect(response.json()).toMatchObject({ ok: true, mode: "preview_only", intent: "schedule_appointment", executed: false });
    expect(sentTexts(fetchMock).at(-1)).toContain("CLIENTE TRANSCRITO REAL");
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
      const app = createApp();
      const response = await postWebhook(app, audioPayload({ data: { key: { id: `real-${scenario.name}`, remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false }, message: { audioMessage: { mimetype: "audio/ogg", fileLength: 4 } } } }));

      expect(response.json()).toMatchObject({ ok: true, audio: true, executed: false, reason: scenario.reason });
      expect(sentTexts(fetchMock).at(-1)).toContain("Nao consegui entender o audio");
      vi.unstubAllGlobals();
    }
  });

  it("abre o circuito apenas apos dois 429 e registra que a terceira chamada nao chegou ao Gemini", async () => {
    process.env.AI_AUDIO_TRANSCRIPTION_PROVIDER = "gemini";
    process.env.AI_AUDIO_TRANSCRIPTION_API_KEY = "fake-audio-provider-key";
    const fetchMock = mockTransport({ realStatus: 429 });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);

    for (const id of ["rate-limit-1", "rate-limit-2"]) {
      await postWebhook(app, audioPayload({ data: { key: { id, remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false }, message: { audioMessage: { mimetype: "audio/ogg", fileLength: 4 } } } }));
    }
    const blocked = await postWebhook(app, audioPayload({ data: { key: { id: "rate-limit-3", remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false }, message: { audioMessage: { mimetype: "audio/ogg", fileLength: 4 } } } }));

    expect(blocked.json()).toMatchObject({ ok: true, audio: true, executed: false, reason: "audio_transcription_circuit_open" });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/v1beta/interactions"))).toHaveLength(2);
    const events = await audits(app, token);
    expect(events.some((event) => event.action === "AI_WHATSAPP_AUDIO_TRANSCRIPTION_FAILED" && event.afterJson?.reason === "audio_transcription_circuit_open" && event.afterJson?.providerCalled === false)).toBe(true);
  });

  it("responde sem baixar midia quando a feature flag esta desligada", async () => {
    process.env.AI_AUDIO_TRANSCRIPTION_ENABLED = "false";
    const fetchMock = mockTransport();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const response = await postWebhook(app, audioPayload());

    expect(response.json()).toMatchObject({ ok: true, audio: true, disabled: true, executed: false });
    expect(sentTexts(fetchMock).at(-1)).toContain("transcricao ainda nao esta ativa");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("getBase64FromMediaMessage"))).toBe(false);
  });
});
