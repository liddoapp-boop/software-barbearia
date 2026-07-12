export type AudioTranscriptionFailureReason =
  | "audio_transcription_unavailable"
  | "audio_transcription_429"
  | "audio_transcription_5xx"
  | "audio_transcription_timeout"
  | "audio_transcription_circuit_open"
  | "audio_transcription_empty"
  | "audio_transcription_no_speech"
  | "audio_transcription_failed";

export const DEFAULT_GEMINI_AUDIO_TRANSCRIPTION_TIMEOUT_MS = 20_000;
export const MIN_GEMINI_AUDIO_TRANSCRIPTION_TIMEOUT_MS = 5_000;
export const MAX_GEMINI_AUDIO_TRANSCRIPTION_TIMEOUT_MS = 30_000;

export type AudioTranscriptionDiagnostics = {
  providerCalled: boolean;
  durationMs: number;
  httpStatus?: number;
};

export class AudioTranscriptionError extends Error {
  constructor(
    public readonly reason: AudioTranscriptionFailureReason,
    message = "Nao foi possivel transcrever o audio.",
    public readonly diagnostics: AudioTranscriptionDiagnostics = { providerCalled: false, durationMs: 0 },
  ) {
    super(message);
    this.name = "AudioTranscriptionError";
  }
}

export type AudioTranscriptionResult = {
  transcript: string;
  provider: string;
  confidence?: number;
  diagnostics?: AudioTranscriptionDiagnostics;
  normalizedMimetype?: string;
};

export interface AudioTranscriptionService {
  transcribe(input: { audio: Buffer; mimetype: string }): Promise<AudioTranscriptionResult>;
}

function isEnabled(value: unknown) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function getPositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

export function getGeminiAudioTranscriptionTimeoutMsFromEnv() {
  const parsed = Number(process.env.AI_AUDIO_TRANSCRIPTION_TIMEOUT_MS);
  if (!Number.isFinite(parsed)) return DEFAULT_GEMINI_AUDIO_TRANSCRIPTION_TIMEOUT_MS;
  return Math.min(
    MAX_GEMINI_AUDIO_TRANSCRIPTION_TIMEOUT_MS,
    Math.max(MIN_GEMINI_AUDIO_TRANSCRIPTION_TIMEOUT_MS, Math.trunc(parsed)),
  );
}

function normalizeGeminiAudioMimetype(mimetype: string) {
  return mimetype.split(";", 1)[0].trim().toLowerCase();
}

function extractTranscript(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const record = payload as Record<string, unknown>;
  const outputText = typeof record.output_text === "string" ? record.output_text : "";
  if (outputText.trim()) return outputText.trim();
  const candidates = Array.isArray(record.candidates) ? record.candidates : [];
  return candidates
    .flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
      const content = (candidate as Record<string, unknown>).content;
      if (!content || typeof content !== "object" || Array.isArray(content)) return [];
      const parts = (content as Record<string, unknown>).parts;
      return Array.isArray(parts)
        ? parts.map((part) => (part && typeof part === "object" && !Array.isArray(part) ? (part as Record<string, unknown>).text : ""))
        : [];
    })
    .filter((text): text is string => typeof text === "string")
    .join("")
    .trim();
}

/** Kept exclusively for deterministic tests. It is never selected outside NODE_ENV=test. */
export class MockAudioTranscriptionService implements AudioTranscriptionService {
  constructor(
    private readonly transcript: string,
    private readonly failureReason?: AudioTranscriptionFailureReason,
  ) {}

  async transcribe(): Promise<AudioTranscriptionResult> {
    if (this.failureReason) throw new AudioTranscriptionError(this.failureReason);
    const transcript = this.transcript.trim().slice(0, 1000);
    if (!transcript) throw new AudioTranscriptionError("audio_transcription_empty");
    if (/^\[\s*(?:sem fala|no speech)\s*\]$/i.test(transcript)) {
      throw new AudioTranscriptionError("audio_transcription_no_speech");
    }
    return { transcript, provider: "mock" };
  }
}

export class GeminiAudioTranscriptionService implements AudioTranscriptionService {
  private rateLimitCount = 0;
  private rateLimitWindowStartedAt = 0;
  private circuitOpenUntil = 0;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
    private readonly rateLimitThreshold: number,
    private readonly circuitCooldownMs: number,
  ) {}

  private registerRateLimit(now: number) {
    if (now - this.rateLimitWindowStartedAt > this.circuitCooldownMs) {
      this.rateLimitCount = 0;
      this.rateLimitWindowStartedAt = now;
    }
    this.rateLimitCount += 1;
    if (this.rateLimitCount >= this.rateLimitThreshold) this.circuitOpenUntil = now + this.circuitCooldownMs;
  }

  async transcribe(input: { audio: Buffer; mimetype: string }): Promise<AudioTranscriptionResult> {
    if (!input.audio.length || !input.mimetype.trim()) throw new AudioTranscriptionError("audio_transcription_failed");
    if (Date.now() < this.circuitOpenUntil) throw new AudioTranscriptionError("audio_transcription_circuit_open");
    const mimetype = normalizeGeminiAudioMimetype(input.mimetype);
    const startedAt = Date.now();
    let providerCalled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      providerCalled = true;
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          model: this.model,
          input: [
            { type: "text", text: "Transcreva somente a fala deste audio em portugues brasileiro. Nao explique, nao resuma e nao invente conteudo." },
            { type: "audio", data: input.audio.toString("base64"), mime_type: mimetype },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const reason = response.status === 429 ? "audio_transcription_429" : response.status >= 500 ? "audio_transcription_5xx" : "audio_transcription_failed";
        if (reason === "audio_transcription_429") this.registerRateLimit(Date.now());
        throw new AudioTranscriptionError(reason, undefined, {
          providerCalled,
          durationMs: Date.now() - startedAt,
          httpStatus: response.status,
        });
      }
      const transcript = extractTranscript(await response.json()).slice(0, 1000);
      if (!transcript) throw new AudioTranscriptionError("audio_transcription_empty");
      if (/^\[\s*(?:sem fala|no speech)\s*\]$/i.test(transcript)) {
        throw new AudioTranscriptionError("audio_transcription_no_speech");
      }
      return {
        transcript,
        provider: `gemini:${this.model}`,
        normalizedMimetype: mimetype,
        diagnostics: { providerCalled, durationMs: Date.now() - startedAt, httpStatus: response.status },
      };
    } catch (error) {
      const diagnostics = {
        providerCalled,
        durationMs: Date.now() - startedAt,
        ...(error instanceof AudioTranscriptionError ? error.diagnostics.httpStatus === undefined ? {} : { httpStatus: error.diagnostics.httpStatus } : {}),
      };
      if (error instanceof AudioTranscriptionError) throw new AudioTranscriptionError(error.reason, error.message, diagnostics);
      if (error instanceof Error && error.name === "AbortError") throw new AudioTranscriptionError("audio_transcription_timeout", undefined, diagnostics);
      throw new AudioTranscriptionError("audio_transcription_failed", undefined, diagnostics);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function isAudioTranscriptionEnabledFromEnv() {
  return isEnabled(process.env.AI_AUDIO_TRANSCRIPTION_ENABLED);
}

export function createAudioTranscriptionServiceFromEnv(): AudioTranscriptionService | null {
  if (!isAudioTranscriptionEnabledFromEnv()) return null;
  const provider = String(process.env.AI_AUDIO_TRANSCRIPTION_PROVIDER ?? "").trim().toLowerCase();
  if (provider === "mock") {
    if (process.env.NODE_ENV !== "test") return null;
    const configuredFailure = String(process.env.AI_WHATSAPP_AUDIO_MOCK_FAILURE ?? "").trim();
    const failureReasons: AudioTranscriptionFailureReason[] = [
      "audio_transcription_429",
      "audio_transcription_5xx",
      "audio_transcription_timeout",
      "audio_transcription_empty",
      "audio_transcription_no_speech",
      "audio_transcription_failed",
    ];
    const failureReason = failureReasons.includes(configuredFailure as AudioTranscriptionFailureReason)
      ? (configuredFailure as AudioTranscriptionFailureReason)
      : undefined;
    return new MockAudioTranscriptionService(process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT ?? "", failureReason);
  }
  if (provider !== "gemini") return null;
  const apiKey = String(process.env.AI_AUDIO_TRANSCRIPTION_API_KEY ?? "").trim();
  if (!apiKey) return null;
  return new GeminiAudioTranscriptionService(
    apiKey,
    String(process.env.AI_AUDIO_TRANSCRIPTION_MODEL ?? "gemini-3.5-flash").trim() || "gemini-3.5-flash",
    getGeminiAudioTranscriptionTimeoutMsFromEnv(),
    getPositiveInteger(process.env.AI_AUDIO_TRANSCRIPTION_CIRCUIT_429_THRESHOLD, 2),
    getPositiveInteger(process.env.AI_AUDIO_TRANSCRIPTION_CIRCUIT_COOLDOWN_MS, 60_000),
  );
}
