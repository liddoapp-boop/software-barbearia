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
export const MAX_GEMINI_AUDIO_TRANSCRIPTION_TIMEOUT_MS = 45_000;

export type AudioTranscriptionDiagnostics = {
  providerCalled: boolean;
  durationMs: number;
  httpStatus?: number;
  responseFingerprint?: AudioTranscriptionResponseFingerprint;
};

export type AudioTranscriptionResponseFingerprint = {
  topLevelKeys: string[];
  outputsCount: number;
  stepsCount: number;
  stepTypes: string[];
  contentPartTypes: string[];
  hasOutputText: boolean;
  correlationId: string;
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
  transcribe(input: { audio: Buffer; mimetype: string; correlationId?: string }): Promise<AudioTranscriptionResult>;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function joinTextParts(values: unknown[]) {
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function getContentTexts(content: unknown) {
  if (!Array.isArray(content)) return [];
  return content.map((part) => {
    const record = asRecord(part);
    return record?.type === "text" ? record.text : undefined;
  });
}

function getCandidateTexts(candidates: unknown) {
  if (!Array.isArray(candidates)) return [];
  return candidates.flatMap((candidate) => {
    const content = asRecord(candidate)?.content;
    const parts = asRecord(content)?.parts;
    return Array.isArray(parts) ? parts.map((part) => asRecord(part)?.text) : [];
  });
}

function normalizeFingerprintType(value: unknown) {
  const type = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-z0-9_-]{1,64}$/.test(type) ? type : "unknown";
}

export function createAudioTranscriptionResponseFingerprint(payload: unknown, correlationId?: string): AudioTranscriptionResponseFingerprint {
  const record = asRecord(payload);
  const outputs = Array.isArray(record?.outputs) ? record.outputs : [];
  const steps = Array.isArray(record?.steps) ? record.steps : [];
  return {
    topLevelKeys: record ? Object.keys(record).sort() : [],
    outputsCount: outputs.length,
    stepsCount: steps.length,
    stepTypes: steps.map((step) => normalizeFingerprintType(asRecord(step)?.type)),
    contentPartTypes: steps.flatMap((step) => {
      const content = asRecord(step)?.content;
      return Array.isArray(content) ? content.map((part) => normalizeFingerprintType(asRecord(part)?.type)) : [];
    }),
    hasOutputText: typeof record?.output_text === "string",
    correlationId: correlationId?.trim().slice(0, 128) || "unavailable",
  };
}

export function extractTranscript(payload: unknown) {
  const record = asRecord(payload);
  if (!record) return "";
  const outputText = joinTextParts([record.output_text]);
  if (outputText) return outputText;
  const outputsText = joinTextParts(
    (Array.isArray(record.outputs) ? record.outputs : []).map((output) => asRecord(output)?.text),
  );
  if (outputsText) return outputsText;
  const stepsText = joinTextParts(
    (Array.isArray(record.steps) ? record.steps : []).flatMap((step) => {
      const recordStep = asRecord(step);
      return recordStep?.type === "model_output" ? getContentTexts(recordStep.content) : [];
    }),
  );
  if (stepsText) return stepsText;
  return joinTextParts(getCandidateTexts(record.candidates));
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

  async transcribe(input: { audio: Buffer; mimetype: string; correlationId?: string }): Promise<AudioTranscriptionResult> {
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
      const payload = await response.json();
      const responseFingerprint = createAudioTranscriptionResponseFingerprint(payload, input.correlationId);
      const diagnostics = { providerCalled, durationMs: Date.now() - startedAt, httpStatus: response.status, responseFingerprint };
      const transcript = extractTranscript(payload).slice(0, 1000);
      if (!transcript) throw new AudioTranscriptionError("audio_transcription_empty", undefined, diagnostics);
      if (/^\[\s*(?:sem fala|no speech)\s*\]$/i.test(transcript)) {
        throw new AudioTranscriptionError("audio_transcription_no_speech", undefined, diagnostics);
      }
      return {
        transcript,
        provider: `gemini:${this.model}`,
        normalizedMimetype: mimetype,
        diagnostics,
      };
    } catch (error) {
      const diagnostics = {
        providerCalled,
        durationMs: Date.now() - startedAt,
        ...(error instanceof AudioTranscriptionError ? error.diagnostics.httpStatus === undefined ? {} : { httpStatus: error.diagnostics.httpStatus } : {}),
        ...(error instanceof AudioTranscriptionError && error.diagnostics.responseFingerprint ? { responseFingerprint: error.diagnostics.responseFingerprint } : {}),
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
