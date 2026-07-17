import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LocalLlamaOwnerCommandParser,
  createOwnerCommandParserFromEnv,
} from "../src/application/owner-command-ai";
import {
  AudioTranscriptionError,
  LocalWhisperAudioTranscriptionService,
  buildLocalWhisperArgs,
  createAudioTranscriptionServiceFromEnv,
  isApprovedLocalWhisperModelPath,
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

    const parser = new LocalLlamaOwnerCommandParser(
      "http://127.0.0.1:11435",
      "google_gemma-3-4b-it-Q4_K_M.gguf",
      1000,
      "4996030242583a40aa151ff93f49ed787ac8c25e4120c3ae4588b2e2a7d1ae94",
    );
    const result = await parser.parseGemini(parserInput);

    expect(result.result?.intent).toBe("schedule_appointment");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      stream: false,
      reasoning_format: "none",
      chat_template_kwargs: { enable_thinking: false },
      response_format: { type: "json_schema" },
    });
    expect(body.messages[0].content).not.toContain("/no_think");
    expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
  });

  it("seleciona o semantico local por padrao em producao e permite desativacao explicita", () => {
    process.env.NODE_ENV = "production";
    delete process.env.SEMANTIC_PROVIDER;
    expect(createOwnerCommandParserFromEnv()).toBeInstanceOf(LocalLlamaOwnerCommandParser);
    process.env.SEMANTIC_PROVIDER = "deterministic";
    expect(createOwnerCommandParserFromEnv()).toBeNull();
  });

  it("seleciona whisper.cpp sem rede externa e falha fechado se o processo estiver indisponivel", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("external_network_forbidden"); });
    vi.stubGlobal("fetch", fetchMock);
    process.env.AI_AUDIO_TRANSCRIPTION_ENABLED = "true";
    process.env.ASR_PROVIDER = "local_whisper";
    process.env.AI_AUDIO_TRANSCRIPTION_PROVIDER = "gemini";
    process.env.AI_AUDIO_TRANSCRIPTION_API_KEY = "paid-key-must-not-be-used";
    process.env.LOCAL_WHISPER_FFMPEG_PATH = "Z:\\missing\\ffmpeg.exe";
    process.env.LOCAL_WHISPER_CLI_PATH = "Z:\\missing\\whisper-cli.exe";
    process.env.LOCAL_WHISPER_MODEL_PATH = "Z:\\missing\\model.bin";
    process.env.LOCAL_WHISPER_VAD_MODEL_PATH = "Z:\\missing\\vad.bin";
    const service = createAudioTranscriptionServiceFromEnv();
    expect(service).toBeInstanceOf(LocalWhisperAudioTranscriptionService);
    await expect(service?.transcribe({ audio: Buffer.from([1, 2, 3]), mimetype: "audio/ogg" }))
      .rejects.toMatchObject({ reason: "audio_transcription_unavailable" } satisfies Partial<AudioTranscriptionError>);
    await expect(service?.warmUp?.())
      .rejects.toMatchObject({ reason: "audio_transcription_unavailable" } satisfies Partial<AudioTranscriptionError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fixa o perfil local em turbo Q5_0, GPU, portugues, VAD, temperatura zero e uma thread", () => {
    expect(isApprovedLocalWhisperModelPath("C:\\models\\ggml-large-v3-turbo-q5_0.bin")).toBe(true);
    expect(isApprovedLocalWhisperModelPath("C:\\models\\ggml-large-v3-q8_0.bin")).toBe(false);
    const args = buildLocalWhisperArgs({
      modelPath: "C:\\models\\ggml-large-v3-turbo-q5_0.bin",
      vadModelPath: "C:\\models\\ggml-silero-v6.2.0.bin",
      outputBase: "C:\\temp\\transcript",
      initialPrompt: `  Pomada\nPix ${"x".repeat(2_000)}  `,
    });
    expect(args).toEqual(expect.arrayContaining([
      "-l", "pt", "-p", "1", "-bs", "1", "-bo", "1", "-tp", "0",
      "--vad", "-vm", "C:\\models\\ggml-silero-v6.2.0.bin",
    ]));
    expect(args).not.toContain("-ng");
    expect(args[args.indexOf("--prompt") + 1]).toHaveLength(1_500);
  });

  it("falha fechado em producao fora do modelo aprovado ou com GPU desativada", () => {
    process.env.NODE_ENV = "production";
    process.env.AI_AUDIO_TRANSCRIPTION_ENABLED = "true";
    process.env.ASR_PROVIDER = "local_whisper";
    process.env.LOCAL_WHISPER_FFMPEG_PATH = "ffmpeg.exe";
    process.env.LOCAL_WHISPER_CLI_PATH = "whisper-cli.exe";
    process.env.LOCAL_WHISPER_VAD_MODEL_PATH = "ggml-silero-v6.2.0.bin";
    process.env.LOCAL_WHISPER_MODEL_PATH = "ggml-large-v3-q8_0.bin";
    expect(createAudioTranscriptionServiceFromEnv()).toBeNull();
    process.env.LOCAL_WHISPER_MODEL_PATH = "ggml-large-v3-turbo-q5_0.bin";
    process.env.LOCAL_WHISPER_GPU_ENABLED = "false";
    expect(createAudioTranscriptionServiceFromEnv()).toBeNull();
  });
});
