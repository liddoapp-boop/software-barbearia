import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../src/http/app";
import type { AudioTranscriptionResult } from "../src/application/audio-transcription";
import { REACTIVATION_PUBLIC_BOOKING_URL_ERROR } from "../src/application/reactivation-campaign";
import { InMemoryStore } from "../src/infrastructure/in-memory-store";

const originalEnv = { ...process.env };
const ownerPhone = "5511999999999";
const clientPhone = "551198760001";

function textPayload(phone: string, text: string, id: string) {
  return {
    instance: "test-instance",
    data: {
      key: { id, remoteJid: `${phone}@s.whatsapp.net`, fromMe: false },
      message: { conversation: text },
    },
  };
}

function audioPayload(id: string) {
  return {
    instance: "test-instance",
    data: {
      key: { id, remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false },
      message: { audioMessage: { mimetype: "audio/ogg", fileLength: 4, seconds: 1 } },
    },
  };
}

async function post(app: FastifyInstance, payload: Record<string, unknown>) {
  return await app.inject({
    method: "POST",
    url: "/webhooks/evolution/whatsapp",
    headers: { "x-evolution-webhook-secret": "test-webhook-secret" },
    payload,
  });
}

function controlledStore() {
  const store = new InMemoryStore();
  store.clients = [{ id: "controlled-client", businessId: "unit-01", fullName: "Cliente Controlado", phone: clientPhone, tags: ["INACTIVE"] }];
  const startsAt = new Date(Date.now() - 100 * 86_400_000);
  store.appointments = [{
    id: "controlled-history", unitId: "unit-01", clientId: "controlled-client", professionalId: "pro-01", serviceId: "svc-corte",
    startsAt, endsAt: new Date(startsAt.getTime() + 45 * 60_000), status: "COMPLETED", isFitting: false, history: [],
  }];
  return store;
}

describe("campanha de reativacao no WhatsApp do owner", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.DATA_BACKEND = "memory";
    process.env.NODE_ENV = "test";
    process.env.AUTH_ENFORCED = "true";
    process.env.HTTP_LOG_ENABLED = "false";
    process.env.AI_WHATSAPP_ENABLED = "true";
    process.env.AI_WHATSAPP_OWNER_PHONE = ownerPhone;
    process.env.AI_WHATSAPP_UNIT_ID = "unit-01";
    process.env.EVOLUTION_WEBHOOK_SECRET = "test-webhook-secret";
    process.env.EVOLUTION_API_URL = "http://evolution.local";
    process.env.EVOLUTION_API_KEY = "test-key";
    process.env.EVOLUTION_INSTANCE_NAME = "test-instance";
    process.env.PUBLIC_BOOKING_URL = "https://agenda.example.com/agendamento?unitId=unit-01";
    process.env.AI_WHATSAPP_AUDIO_ENABLED = "true";
    process.env.AI_AUDIO_TRANSCRIPTION_ENABLED = "true";
    process.env.ASR_PROVIDER = "local_whisper";
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/chat/getBase64FromMediaMessage/")) return { ok: true, json: async () => ({ base64: "AQIDBA==" }) };
      return { ok: true, status: 200, text: async () => "" };
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("texto cria previa, sim nao confirma, CONFIRMAR envia uma vez e replay nao duplica", async () => {
    const store = controlledStore();
    const send = vi.fn(async (_phone: string, _text: string) => undefined);
    const app = createApp({ memoryStore: store, ownerCommandParser: null, reactivationSend: send });

    const draft = await post(app, textPayload(ownerPhone, "Prepare uma campanha de reativação", "draft-text"));
    const ambiguous = await post(app, textPayload(ownerPhone, "sim", "ambiguous-text"));
    const confirmed = await post(app, textPayload(ownerPhone, "CONFIRMAR", "confirm-text"));
    const replay = await post(app, textPayload(ownerPhone, "CONFIRMAR", "replay-text"));

    expect(draft.json()).toMatchObject({ mode: "preview_only", executed: false });
    expect(ambiguous.json()).toMatchObject({ mode: "preview_only", executed: false, pendingPreserved: true });
    expect(confirmed.json()).toMatchObject({ ok: true, executed: true, replay: false });
    expect(replay.json()).toMatchObject({ ok: true, executed: true, replay: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(clientPhone, store.reactivationRecipients[0]?.message);
    expect(store.reactivationRecipients[0]).toMatchObject({ status: "SENT", attempts: 1 });
    await app.close();
  });

  it("falha fechado com erro seguro quando o link publico oficial esta ausente", async () => {
    delete process.env.PUBLIC_BOOKING_URL;
    const store = controlledStore();
    const send = vi.fn(async () => undefined);
    const app = createApp({ memoryStore: store, ownerCommandParser: null, reactivationSend: send });

    const response = await post(app, textPayload(ownerPhone, "Prepare uma campanha de reativação", "draft-missing-link"));

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      intent: "reactivation_campaign",
      unavailable: true,
      reason: "reactivation_public_booking_url_invalid",
      error: REACTIVATION_PUBLIC_BOOKING_URL_ERROR,
      executed: false,
    });
    expect(send).not.toHaveBeenCalled();
    expect(store.reactivationCampaigns).toHaveLength(0);
    expect(store.reactivationRecipients).toHaveLength(0);
    expect(store.auditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "REACTIVATION_CAMPAIGN_REJECTED",
        afterJson: expect.objectContaining({ reason: "PUBLIC_BOOKING_URL_INVALID" }),
      }),
    ]));
    await app.close();
  });

  it("audio cria somente o rascunho e CANCELAR nao envia", async () => {
    const store = controlledStore();
    const send = vi.fn(async () => undefined);
    const transcribe = vi.fn(async (): Promise<AudioTranscriptionResult> => ({
      transcript: "Monte uma campanha de reativação",
      provider: "local_whisper:test",
      diagnostics: { providerCalled: true, durationMs: 5, passCount: 1, vadResult: "speech" },
    }));
    const app = createApp({ memoryStore: store, ownerCommandParser: null, reactivationSend: send, audioTranscriptionService: { transcribe } });

    const draft = await post(app, audioPayload("draft-audio"));
    const cancelled = await post(app, textPayload(ownerPhone, "CANCELAR", "cancel-text"));

    expect(draft.json()).toMatchObject({ mode: "preview_only", executed: false, audio: true });
    expect(cancelled.json()).toMatchObject({ cancelled: true, executed: false });
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
    expect(store.reactivationCampaigns[0]?.status).toBe("CANCELLED");
    await app.close();
  });

  it("cliente controlado faz opt-out, cancela pendencia e recebe confirmacao sanitizada", async () => {
    const store = controlledStore();
    const app = createApp({ memoryStore: store, ownerCommandParser: null, reactivationSend: vi.fn(async () => undefined) });
    await post(app, textPayload(ownerPhone, "Prepare uma campanha de reativação", "draft-optout"));

    const response = await post(app, textPayload(clientPhone, "REMOVER MEU NÚMERO", "client-optout"));

    expect(response.json()).toMatchObject({ ok: true, optedOut: true });
    expect(store.clients[0]?.whatsappOptOut).toBe(true);
    expect(store.reactivationRecipients[0]).toMatchObject({ status: "SKIPPED", skipReason: "WHATSAPP_OPT_OUT" });
    const audit = store.auditEvents.find((item) => item.action === "CLIENT_WHATSAPP_OPT_OUT");
    expect(JSON.stringify(audit)).not.toContain(clientPhone);
    expect(store.reactivationRecipientAudits.map((item) => item.event)).toContain("OPT_OUT_RECEIVED");
    expect(JSON.stringify(store.reactivationRecipientAudits)).not.toContain(clientPhone);
    expect(JSON.stringify(audit)).not.toContain("REMOVER MEU NÚMERO");
    await app.close();
  });

  it("usa a fronteira real e nao contabiliza bloqueio isolado como envio", async () => {
    process.env.SERVER_MODE = "isolated";
    process.env.ISOLATED_WHATSAPP_OUTBOUND_MODE = "disabled";
    delete process.env.ISOLATED_WHATSAPP_OUTBOUND_ALLOWLIST;
    const store = controlledStore();
    const fetchMock = vi.mocked(fetch);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const app = createApp({ memoryStore: store, ownerCommandParser: null });

    const draft = await post(app, textPayload(ownerPhone, "Prepare uma campanha de reativação", "draft-blocked"));
    const confirmed = await post(app, textPayload(ownerPhone, "CONFIRMAR", "confirm-blocked"));

    expect(draft.json()).toMatchObject({ mode: "preview_only", executed: false, responseDelivered: false });
    expect(confirmed.json()).toMatchObject({ ok: true, executed: true, replay: false, responseDelivered: false });
    expect(store.reactivationCampaigns[0]).toMatchObject({ status: "PARTIAL" });
    expect(store.reactivationRecipients[0]).toMatchObject({ status: "FAILED", attempts: 1, sentAt: null });
    expect(store.reactivationRecipientAudits.map((item) => item.event)).toEqual([
      "CLAIM_OBTAINED",
      "PROVIDER_CALL_STARTED",
      "FAILURE_CONFIRMED",
      "OUTBOUND_BLOCKED",
    ]);
    expect(JSON.stringify(store.reactivationRecipientAudits)).not.toContain(clientPhone);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warning.mock.calls.flat().join(" ")).toContain("isolated_outbound_disabled");
    await app.close();
  });
});
