import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LocalLlamaOwnerCommandParser,
  createOwnerCommandParserFromEnv,
} from "../src/application/owner-command-ai";
import {
  AudioTranscriptionError,
  LocalWhisperAudioTranscriptionService,
  createAudioTranscriptionServiceFromEnv,
} from "../src/application/audio-transcription";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

const parserInput = {
  message: "Marque corte para Joao amanha as quatro da tarde",
  context: {
    unitId: "unit-test",
    unitName: "Unidade Teste",
    now: new Date("2026-07-13T12:00:00-03:00"),
    timezone: "America/Sao_Paulo",
    services: [{ name: "Corte" }],
    products: [],
    paymentMethods: [{ name: "Pix", isDefault: true }],
    professionals: [{ name: "Rafael" }],
  },
};

describe("provedores locais de IA", () => {
  it("envia schema estrito ao llama-server com thinking desativado", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              intent: "schedule_appointment",
              clientName: "Joao",
              serviceNames: ["Corte"],
              professionalName: null,
              dateExpression: "amanha",
              timeExpression: "quatro da tarde",
              canonicalDate: "2026-07-14",
              canonicalTime: "16:00",
              timePrecision: "exact",
              missingFields: ["professionalName"],
              ambiguousFields: [],
              confidence: { intent: 0.99, clientName: 0.95, service: 0.95, professional: 0, date: 0.95, time: 0.95 },
            }),
          },
        }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const parser = new LocalLlamaOwnerCommandParser("http://127.0.0.1:11435", "Qwen3-4B-Q4_K_M.gguf", 1000);
    const result = await parser.parseGemini(parserInput);

    expect(result.result?.intent).toBe("schedule_appointment");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      stream: false,
      reasoning_format: "none",
      chat_template_kwargs: { enable_thinking: false },
      response_format: { type: "json_schema" },
    });
    expect(body.messages[0].content).toContain("/no_think");
    expect(body.response_format.schema.additionalProperties).toBe(false);
  });

  it("mantem o semantico deterministico por padrao e seleciona local apenas por flag", () => {
    process.env.NODE_ENV = "production";
    delete process.env.SEMANTIC_PROVIDER;
    expect(createOwnerCommandParserFromEnv()).toBeNull();
    process.env.SEMANTIC_PROVIDER = "local_llama";
    expect(createOwnerCommandParserFromEnv()).toBeInstanceOf(LocalLlamaOwnerCommandParser);
  });

  it("seleciona whisper.cpp somente quando habilitado e falha fechado se o processo estiver indisponivel", async () => {
    process.env.AI_AUDIO_TRANSCRIPTION_ENABLED = "true";
    process.env.ASR_PROVIDER = "local_whisper";
    process.env.LOCAL_WHISPER_FFMPEG_PATH = "Z:\\missing\\ffmpeg.exe";
    process.env.LOCAL_WHISPER_CLI_PATH = "Z:\\missing\\whisper-cli.exe";
    process.env.LOCAL_WHISPER_MODEL_PATH = "Z:\\missing\\model.bin";
    process.env.LOCAL_WHISPER_VAD_MODEL_PATH = "Z:\\missing\\vad.bin";
    const service = createAudioTranscriptionServiceFromEnv();
    expect(service).toBeInstanceOf(LocalWhisperAudioTranscriptionService);
    await expect(service?.transcribe({ audio: Buffer.from([1, 2, 3]), mimetype: "audio/ogg" }))
      .rejects.toMatchObject({ reason: "audio_transcription_unavailable" } satisfies Partial<AudioTranscriptionError>);
  });
});
