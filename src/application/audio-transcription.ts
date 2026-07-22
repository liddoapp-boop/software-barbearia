export type AudioTranscriptionFailureReason =
  | "audio_transcription_unavailable"
  | "audio_transcription_429"
  | "audio_transcription_quota_exhausted"
  | "audio_transcription_5xx"
  | "audio_transcription_timeout"
  | "audio_transcription_circuit_open"
  | "audio_transcription_empty_file"
  | "audio_transcription_ffmpeg_failed"
  | "audio_transcription_whisper_failed"
  | "audio_transcription_empty"
  | "audio_transcription_no_speech"
  | "audio_transcription_failed";

export const DEFAULT_GEMINI_AUDIO_TRANSCRIPTION_TIMEOUT_MS = 20_000;
export const MIN_GEMINI_AUDIO_TRANSCRIPTION_TIMEOUT_MS = 5_000;
export const MAX_GEMINI_AUDIO_TRANSCRIPTION_TIMEOUT_MS = 45_000;
export const GEMINI_AUDIO_TRANSCRIPTION_TOTAL_BUDGET_MS = 45_000;
export const GEMINI_AUDIO_TRANSCRIPTION_MAX_RETRIES = 2;
export const GEMINI_AUDIO_TRANSCRIPTION_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_AUDIO_TRANSCRIPTION_RECENT_CALL_WINDOW_MS = 60_000;
export const DEFAULT_LOCAL_WHISPER_TIMEOUT_MS = 45_000;
export const MIN_LOCAL_WHISPER_TIMEOUT_MS = 20_000;
export const MAX_LOCAL_WHISPER_TIMEOUT_MS = 120_000;

export type LocalAudioProcessDiagnostic = {
  stage: "ffmpeg" | "whisper";
  durationMs: number;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutFingerprint?: string;
  stderrFingerprint?: string;
  safeReason: string;
};

export type AudioTranscriptionDiagnostics = {
  providerCalled: boolean;
  durationMs: number;
  passCount?: number;
  vadResult?: "speech" | "silence" | "unknown";
  httpStatus?: number;
  responseFingerprint?: AudioTranscriptionResponseFingerprint;
  attemptCount?: number;
  recentCallCount?: number;
  recentCallWindowMs?: number;
  totalBudgetMs?: number;
  model?: string;
  endpoint?: string;
  providerErrorCode?: string;
  providerErrorStatus?: string;
  providerErrorMessage?: string;
  retryAfterMs?: number;
  retryHeaders?: Record<string, string>;
  rateLimitKind?: "temporary" | "quota_exhausted";
  attempts?: ProviderAttemptDiagnostic[];
  fallbackUsed?: boolean;
  failureStage?: "input" | "ffmpeg" | "whisper" | "transcript";
  inputBytes?: number;
  inputExtension?: string;
  ffmpeg?: LocalAudioProcessDiagnostic;
  whisper?: LocalAudioProcessDiagnostic;
  gpuUsed?: boolean;
  gpuFallback?: boolean;
  tempFileId?: string;
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

export type AudioTranscriptionWarmupResult = {
  ready: true;
  durationMs: number;
  provider: string;
  model?: string;
};

export type AudioTranscriptionInput = {
  audio: Buffer;
  mimetype: string;
  correlationId?: string;
  initialPrompt?: string;
  pass?: 1 | 2;
  timeoutMs?: number;
};

export interface AudioTranscriptionService {
  transcribe(input: AudioTranscriptionInput): Promise<AudioTranscriptionResult>;
  warmUp?(): Promise<AudioTranscriptionWarmupResult>;
}

export function isApprovedLocalWhisperModelPath(modelPath: string) {
  return /(?:large[-_.]?v3[-_.]?)?turbo.*q5[_-]?0/i.test(path.basename(modelPath));
}

export function buildLocalWhisperArgs(input: {
  modelPath: string;
  vadModelPath: string;
  outputBase: string;
  initialPrompt?: string;
}) {
  const prompt = String(input.initialPrompt ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 1_500);
  return [
    "-m", input.modelPath, "-f", "-", "-l", "pt", "-p", "1", "-bs", "1", "-bo", "1", "-tp", "0",
    "-nf", "-nt", "-np", "-sns", "--vad", "-vm", input.vadModelPath, "-vt", "0.5",
    "-vspd", "250", "-vsd", "350", "-vp", "80",
    ...(prompt ? ["--prompt", prompt] : []),
    "-otxt", "-of", input.outputBase,
  ];
}

type GeminiAudioTranscriptionRuntime = ResilientProviderRuntime;

type GeminiProviderError = {
  code?: string;
  status?: string;
  message?: string;
  retryAfterMs?: number;
  retryHeaders?: Record<string, string>;
  rateLimitKind?: "temporary" | "quota_exhausted";
};

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

export function getLocalWhisperTimeoutMsFromEnv() {
  const parsed = Number(process.env.LOCAL_WHISPER_TIMEOUT_MS);
  if (!Number.isFinite(parsed)) return DEFAULT_LOCAL_WHISPER_TIMEOUT_MS;
  return Math.min(
    MAX_LOCAL_WHISPER_TIMEOUT_MS,
    Math.max(MIN_LOCAL_WHISPER_TIMEOUT_MS, Math.trunc(parsed)),
  );
}

export function getGeminiAudioTranscriptionTotalBudgetMsFromEnv() {
  return Math.min(
    120_000,
    getPositiveInteger(process.env.AI_AUDIO_TRANSCRIPTION_TOTAL_BUDGET_MS, GEMINI_AUDIO_TRANSCRIPTION_TOTAL_BUDGET_MS),
  );
}

export function getGeminiAudioTranscriptionMaxRetriesFromEnv() {
  return Math.min(5, getPositiveInteger(process.env.AI_AUDIO_TRANSCRIPTION_MAX_RETRIES, GEMINI_AUDIO_TRANSCRIPTION_MAX_RETRIES));
}

function normalizeGeminiAudioMimetype(mimetype: string) {
  return mimetype.split(";", 1)[0].trim().toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function sanitizeProviderDiagnostic(value: unknown, maxLength = 300) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const sanitized = String(value)
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/(?:api[_-]?key|key|token)\s*[:=]\s*[^\s,;]+/gi, "credential=[redacted]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return sanitized || undefined;
}

function getHeader(response: Response, name: string) {
  const headers = (response as Response & { headers?: { get?: (headerName: string) => string | null } }).headers;
  return sanitizeProviderDiagnostic(headers?.get?.(name), 128);
}

function parseRetryDelayMs(value: unknown) {
  if (typeof value !== "string") return undefined;
  const seconds = value.trim().match(/^(\d+(?:\.\d+)?)s$/i);
  if (!seconds) return undefined;
  const parsed = Number(seconds[1]) * 1000;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.ceil(parsed) : undefined;
}

function parseRetryAfterMs(value: string | undefined, now: number) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now) : undefined;
}

function getStructuredRetryDelayMs(details: unknown) {
  if (!Array.isArray(details)) return undefined;
  for (const detail of details) {
    const record = asRecord(detail);
    const type = String(record?.["@type"] ?? "").toLowerCase();
    if (type.endsWith("google.rpc.retryinfo")) {
      const parsed = parseRetryDelayMs(record?.retryDelay);
      if (parsed !== undefined) return parsed;
    }
  }
  return undefined;
}

function hasPermanentQuotaSignal(error: Record<string, unknown>) {
  const details = Array.isArray(error.details) ? error.details : [];
  const structuredQuotaIds = details.flatMap((detail) => {
    const violations = asRecord(detail)?.violations;
    return Array.isArray(violations)
      ? violations.flatMap((violation) => {
          const record = asRecord(violation);
          return [record?.quotaId, record?.quotaMetric].filter((value): value is string => typeof value === "string");
        })
      : [];
  }).join(" ").toLowerCase();
  const message = String(error.message ?? "").toLowerCase();
  return /(?:per.?day|daily|requestsperday|tokensperday|free.?tier.*(?:limit\s*:\s*0|per.?day))/.test(`${structuredQuotaIds} ${message}`)
    || /(?:billing account (?:is )?(?:disabled|inactive|not found)|insufficient quota|quota (?:is )?exhausted permanently)/.test(message)
    || /(?:limit\s*:\s*0)/.test(message);
}

async function readGeminiProviderError(response: Response, now: number): Promise<GeminiProviderError> {
  let payload: unknown;
  try {
    const text = await response.text();
    payload = text.length <= 32_000 ? JSON.parse(text) : undefined;
  } catch {
    payload = undefined;
  }
  const error = asRecord(asRecord(payload)?.error) ?? asRecord(payload) ?? {};
  const retryAfter = getHeader(response, "retry-after");
  const retryHeaders = Object.fromEntries(
    ["retry-after", "x-ratelimit-reset", "x-ratelimit-remaining", "x-ratelimit-limit"]
      .map((name) => [name, getHeader(response, name)] as const)
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  const headerDelayMs = parseRetryAfterMs(retryAfter, now);
  const structuredDelayMs = getStructuredRetryDelayMs(error.details);
  return {
    code: sanitizeProviderDiagnostic(error.code ?? response.status, 64),
    status: sanitizeProviderDiagnostic(error.status, 64),
    message: sanitizeProviderDiagnostic(error.message),
    retryAfterMs: headerDelayMs ?? structuredDelayMs,
    ...(Object.keys(retryHeaders).length ? { retryHeaders } : {}),
    ...(response.status === 429
      ? { rateLimitKind: hasPermanentQuotaSignal(error) ? "quota_exhausted" as const : "temporary" as const }
      : {}),
  };
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
  private readonly recentProviderCalls: number[] = [];
  private readonly runtime: GeminiAudioTranscriptionRuntime;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
    private readonly rateLimitThreshold: number,
    private readonly circuitCooldownMs: number,
    runtime: Partial<GeminiAudioTranscriptionRuntime> = {},
  ) {
    this.runtime = {
      now: runtime.now ?? Date.now,
      random: runtime.random ?? Math.random,
      sleep: runtime.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs))),
    };
  }

  private registerRateLimit(now: number) {
    if (now - this.rateLimitWindowStartedAt > this.circuitCooldownMs) {
      this.rateLimitCount = 0;
      this.rateLimitWindowStartedAt = now;
    }
    this.rateLimitCount += 1;
    if (this.rateLimitCount >= this.rateLimitThreshold) this.circuitOpenUntil = now + this.circuitCooldownMs;
  }

  private registerProviderCall(now: number) {
    this.recentProviderCalls.push(now);
    const cutoff = now - GEMINI_AUDIO_TRANSCRIPTION_RECENT_CALL_WINDOW_MS;
    while (this.recentProviderCalls.length && this.recentProviderCalls[0] < cutoff) this.recentProviderCalls.shift();
    return this.recentProviderCalls.length;
  }

  private getRecentProviderCallCount(now: number) {
    const cutoff = now - GEMINI_AUDIO_TRANSCRIPTION_RECENT_CALL_WINDOW_MS;
    while (this.recentProviderCalls.length && this.recentProviderCalls[0] < cutoff) this.recentProviderCalls.shift();
    return this.recentProviderCalls.length;
  }

  private createDiagnostics(input: {
    startedAt: number;
    providerCalled: boolean;
    attemptCount: number;
    recentCallCount: number;
    httpStatus?: number;
    providerError?: GeminiProviderError;
    responseFingerprint?: AudioTranscriptionResponseFingerprint;
    attempts?: ProviderAttemptDiagnostic[];
    fallbackUsed?: boolean;
    model?: string;
  }): AudioTranscriptionDiagnostics {
    return {
      providerCalled: input.providerCalled,
      durationMs: Math.max(0, this.runtime.now() - input.startedAt),
      attemptCount: input.attemptCount,
      recentCallCount: input.recentCallCount,
      recentCallWindowMs: GEMINI_AUDIO_TRANSCRIPTION_RECENT_CALL_WINDOW_MS,
      totalBudgetMs: getGeminiAudioTranscriptionTotalBudgetMsFromEnv(),
      model: input.model ?? this.model,
      endpoint: GEMINI_AUDIO_TRANSCRIPTION_ENDPOINT,
      ...(input.httpStatus === undefined ? {} : { httpStatus: input.httpStatus }),
      ...(input.responseFingerprint ? { responseFingerprint: input.responseFingerprint } : {}),
      ...(input.providerError?.code ? { providerErrorCode: input.providerError.code } : {}),
      ...(input.providerError?.status ? { providerErrorStatus: input.providerError.status } : {}),
      ...(input.providerError?.message ? { providerErrorMessage: input.providerError.message } : {}),
      ...(input.providerError?.retryAfterMs === undefined ? {} : { retryAfterMs: input.providerError.retryAfterMs }),
      ...(input.providerError?.retryHeaders ? { retryHeaders: input.providerError.retryHeaders } : {}),
      ...(input.providerError?.rateLimitKind ? { rateLimitKind: input.providerError.rateLimitKind } : {}),
      ...(input.attempts ? { attempts: input.attempts } : {}),
      ...(input.fallbackUsed === undefined ? {} : { fallbackUsed: input.fallbackUsed }),
    };
  }

  async transcribe(input: AudioTranscriptionInput): Promise<AudioTranscriptionResult> {
    if (!input.audio.length || !input.mimetype.trim()) throw new AudioTranscriptionError("audio_transcription_failed");
    const startedAt = this.runtime.now();
    if (startedAt < this.circuitOpenUntil) {
      throw new AudioTranscriptionError("audio_transcription_circuit_open", undefined, this.createDiagnostics({
        startedAt,
        providerCalled: false,
        attemptCount: 0,
        recentCallCount: this.getRecentProviderCallCount(startedAt),
      }));
    }
    const mimetype = normalizeGeminiAudioMimetype(input.mimetype);
    let recentCallCount = this.recentProviderCalls.length;
    try {
      const provider = await executeResilientProviderRequest({
        correlationId: input.correlationId,
        provider: "gemini",
        purpose: "transcription",
        model: this.model,
        fallbackModel: process.env.AI_AUDIO_TRANSCRIPTION_FALLBACK_MODEL,
        fallbackEnabled: isEnabled(process.env.AI_AUDIO_TRANSCRIPTION_MODEL_FALLBACK_ENABLED),
        endpoint: GEMINI_AUDIO_TRANSCRIPTION_ENDPOINT,
        timeoutMs: this.timeoutMs,
        totalBudgetMs: getGeminiAudioTranscriptionTotalBudgetMsFromEnv(),
        maxRetries: getGeminiAudioTranscriptionMaxRetriesFromEnv(),
        runtime: this.runtime,
        request: async (model, signal) => {
          recentCallCount = this.registerProviderCall(this.runtime.now());
          return await fetch(GEMINI_AUDIO_TRANSCRIPTION_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
          body: JSON.stringify({
            model,
            input: [
              { type: "text", text: "Transcreva somente a fala deste audio em portugues brasileiro. Nao explique, nao resuma e nao invente conteudo." },
              { type: "audio", data: input.audio.toString("base64"), mime_type: mimetype },
            ],
          }),
          signal,
        });
        },
      });
      const payload = await provider.response.json();
      const responseFingerprint = createAudioTranscriptionResponseFingerprint(payload, input.correlationId);
      const lastAttempt = provider.attempts[provider.attempts.length - 1];
      const lastFailure = [...provider.attempts].reverse().find((attempt) => attempt.result === "failed");
      const diagnostics = this.createDiagnostics({
        startedAt,
        providerCalled: true,
        attemptCount: provider.attempts.length,
        recentCallCount,
        httpStatus: provider.response.status,
        responseFingerprint,
        attempts: provider.attempts,
        fallbackUsed: provider.fallbackUsed,
        model: provider.model,
        providerError: lastFailure ? {
          code: lastFailure.providerCode,
          status: lastFailure.providerStatus,
          message: lastFailure.providerMessage,
          retryAfterMs: lastFailure.retryAfterMs,
          retryHeaders: lastFailure.retryHeaders,
          rateLimitKind: lastFailure.httpStatus === 429 ? "temporary" : undefined,
        } : undefined,
      });
      const transcript = extractTranscript(payload).slice(0, 1000);
      if (!transcript) throw new AudioTranscriptionError("audio_transcription_empty", undefined, diagnostics);
      if (/^\[\s*(?:sem fala|no speech)\s*\]$/i.test(transcript)) {
        throw new AudioTranscriptionError("audio_transcription_no_speech", undefined, diagnostics);
      }
      this.rateLimitCount = 0;
      this.rateLimitWindowStartedAt = 0;
      this.circuitOpenUntil = 0;
      return {
        transcript,
        provider: `gemini:${provider.model}`,
        normalizedMimetype: mimetype,
        diagnostics,
      };
    } catch (error) {
      if (error instanceof AudioTranscriptionError) throw error;
      if (!(error instanceof ResilientProviderError)) {
        throw new AudioTranscriptionError("audio_transcription_failed", undefined, this.createDiagnostics({
          startedAt, providerCalled: false, attemptCount: 0, recentCallCount,
        }));
      }
      const last = error.lastAttempt;
      const reason: AudioTranscriptionFailureReason = error.classification === "permanent_quota"
        ? "audio_transcription_quota_exhausted"
        : error.classification === "transient_timeout"
          ? "audio_transcription_timeout"
          : last?.httpStatus === 429
            ? "audio_transcription_429"
            : error.classification === "transient_http"
              ? "audio_transcription_5xx"
              : "audio_transcription_failed";
      if (reason === "audio_transcription_429") this.registerRateLimit(this.runtime.now());
      throw new AudioTranscriptionError(reason, undefined, this.createDiagnostics({
        startedAt,
        providerCalled: error.attempts.length > 0,
        attemptCount: error.attempts.length,
        recentCallCount,
        httpStatus: last?.httpStatus,
        attempts: error.attempts,
        fallbackUsed: error.attempts.some((attempt) => attempt.fallbackUsed),
        model: error.model,
        providerError: last ? {
          code: last.providerCode,
          status: last.providerStatus,
          message: last.providerMessage,
          retryAfterMs: last.retryAfterMs,
          retryHeaders: last.retryHeaders,
          rateLimitKind: error.classification === "permanent_quota" ? "quota_exhausted" : last.httpStatus === 429 ? "temporary" : undefined,
        } : undefined,
      }));
    }
  }
}

function buildSilentPcmWav(durationMs = 500) {
  const sampleRate = 16_000;
  const bytesPerSample = 2;
  const sampleCount = Math.ceil(sampleRate * durationMs / 1_000);
  const dataSize = sampleCount * bytesPerSample;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * bytesPerSample, 28);
  wav.writeUInt16LE(bytesPerSample, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataSize, 40);
  return wav;
}

function getLocalAudioExtension(mimetype: string) {
  const normalized = mimetype.split(";", 1)[0].trim().toLowerCase();
  const extensions: Record<string, string> = {
    "audio/ogg": ".ogg",
    "audio/opus": ".opus",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/mp4": ".m4a",
    "audio/m4a": ".m4a",
    "audio/aac": ".aac",
    "audio/webm": ".webm",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
  };
  return extensions[normalized] ?? ".audio";
}

function classifyLocalProcessResult(
  stage: LocalAudioProcessDiagnostic["stage"],
  stderr: string,
  exitCode: number | null,
  timedOut: boolean,
  spawnFailed: boolean,
) {
  if (timedOut) return `${stage}_timeout`;
  if (spawnFailed) return `${stage}_spawn_failed`;
  const normalized = stderr.toLowerCase();
  if (stage === "ffmpeg") {
    if (/invalid data|could not find codec parameters|error opening input/.test(normalized)) return "ffmpeg_invalid_media";
    if (/permission denied|access is denied/.test(normalized)) return "ffmpeg_access_denied";
    return exitCode === 0 ? "completed" : "ffmpeg_exit_nonzero";
  }
  if (/failed to load model|error loading model|cannot open model/.test(normalized)) return "whisper_model_load_failed";
  if (/failed to load vad|error loading vad|cannot open vad/.test(normalized)) return "whisper_vad_load_failed";
  if (/cuda.*(?:error|failed)|(?:error|failed).*cuda/.test(normalized)) return "whisper_cuda_failed";
  if (exitCode !== 0) return "whisper_exit_nonzero";
  const noSpeech = /no speech|vad[^\r\n]*(?:0 segments|no segments)|0 speech segments/.test(normalized);
  const backend = /loaded cuda backend|ggml_cuda_init:\s*found\s+[1-9]/.test(normalized) ? "cuda" : "cpu";
  return `completed_${backend}${noSpeech ? "_no_speech" : ""}`;
}

async function runLocalAudioProcess(input: {
  executable: string;
  args: string[];
  stage: LocalAudioProcessDiagnostic["stage"];
  timeoutMs: number;
}): Promise<LocalAudioProcessDiagnostic> {
  const startedAt = Date.now();
  const captureLimit = 64 * 1024;
  let stdoutBytes = 0;
  let stderrBytes = 0;
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let capturedStdoutBytes = 0;
  let capturedStderrBytes = 0;
  return await new Promise((resolve) => {
    const child = spawn(input.executable, input.args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    let timedOut = false;
    let spawnFailed = false;
    const finish = (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks);
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      resolve({
        stage: input.stage,
        durationMs: Date.now() - startedAt,
        exitCode,
        signal,
        timedOut,
        stdoutBytes,
        stderrBytes,
        stdoutFingerprint: stdout.length
          ? createHash("sha256").update(stdout).digest("hex").slice(0, 12)
          : undefined,
        stderrFingerprint: stderr
          ? createHash("sha256").update(stderr).digest("hex").slice(0, 12)
          : undefined,
        safeReason: classifyLocalProcessResult(input.stage, stderr, exitCode, timedOut, spawnFailed),
      });
    };
    child.stdout.on("data", (chunk: Buffer | string) => {
      const bytes = Buffer.from(chunk);
      stdoutBytes += bytes.length;
      if (capturedStdoutBytes < captureLimit) {
        const retained = bytes.subarray(0, captureLimit - capturedStdoutBytes);
        stdoutChunks.push(retained);
        capturedStdoutBytes += retained.length;
      }
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      const bytes = Buffer.from(chunk);
      stderrBytes += bytes.length;
      if (capturedStderrBytes < captureLimit) {
        const retained = bytes.subarray(0, captureLimit - capturedStderrBytes);
        stderrChunks.push(retained);
        capturedStderrBytes += retained.length;
      }
    });
    child.once("error", () => {
      spawnFailed = true;
      finish(null, null);
    });
    child.once("close", (code, signal) => finish(code, signal));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, Math.max(1, input.timeoutMs));
  });
}

export class LocalWhisperAudioTranscriptionService implements AudioTranscriptionService {
  private active = false;
  private warmupPromise?: Promise<AudioTranscriptionWarmupResult>;

  constructor(
    private readonly ffmpegPath: string,
    private readonly whisperPath: string,
    private readonly modelPath: string,
    private readonly vadModelPath: string,
    private readonly timeoutMs = 20_000,
    private readonly prompt = "Barbearia. Preserve nomes proprios, servicos, produtos, datas e horarios.",
    private readonly warmupTimeoutMs = 90_000,
  ) {}

  async transcribe(input: AudioTranscriptionInput): Promise<AudioTranscriptionResult> {
    return await this.runTranscription(input, this.timeoutMs);
  }

  async warmUp(): Promise<AudioTranscriptionWarmupResult> {
    if (!this.warmupPromise) {
      this.warmupPromise = this.performWarmUp();
    }
    return await this.warmupPromise;
  }

  private async performWarmUp(): Promise<AudioTranscriptionWarmupResult> {
    const startedAt = Date.now();
    try {
      const result = await this.runTranscription({
        audio: buildSilentPcmWav(),
        mimetype: "audio/wav",
        pass: 1,
        timeoutMs: this.warmupTimeoutMs,
      }, this.warmupTimeoutMs);
      return {
        ready: true,
        durationMs: Date.now() - startedAt,
        provider: result.provider,
        model: result.diagnostics?.model,
      };
    } catch (error) {
      if (error instanceof AudioTranscriptionError
        && ["audio_transcription_no_speech", "audio_transcription_empty"].includes(error.reason)
        && error.diagnostics.providerCalled) {
        return {
          ready: true,
          durationMs: Date.now() - startedAt,
          provider: `local_whisper:${path.basename(this.modelPath)}`,
          model: error.diagnostics.model,
        };
      }
      throw error;
    }
  }

  private async runTranscription(input: AudioTranscriptionInput, timeoutLimitMs: number): Promise<AudioTranscriptionResult> {
    if (!input.audio.length) {
      throw new AudioTranscriptionError("audio_transcription_empty_file", undefined, {
        providerCalled: false,
        durationMs: 0,
        failureStage: "input",
        inputBytes: 0,
      });
    }
    if (!input.mimetype.trim()) {
      throw new AudioTranscriptionError("audio_transcription_failed", undefined, {
        providerCalled: false,
        durationMs: 0,
        failureStage: "input",
        inputBytes: input.audio.length,
      });
    }
    if (this.active) throw new AudioTranscriptionError("audio_transcription_unavailable", "ASR local ocupado; concorrencia configurada em uma execucao.");
    this.active = true;
    const startedAt = Date.now();
    const timeoutMs = Math.max(1_000, Math.min(timeoutLimitMs, input.timeoutMs ?? timeoutLimitMs));
    const initialPrompt = String(input.initialPrompt ?? this.prompt)
      .replace(/[\r\n\t]+/g, " ")
      .trim()
      .slice(0, 1_500);
    const workDir = path.join(os.tmpdir(), `software-barbearia-asr-${randomUUID()}`);
    const inputExtension = getLocalAudioExtension(input.mimetype);
    const inputPath = path.join(workDir, `input${inputExtension}`);
    const normalizedPath = path.join(workDir, "normalized.wav");
    const outputBase = path.join(workDir, "transcript");
    const tempFileId = createHash("sha256").update(workDir).digest("hex").slice(0, 12);
    let ffmpegDiagnostic: LocalAudioProcessDiagnostic | undefined;
    let whisperDiagnostic: LocalAudioProcessDiagnostic | undefined;
    const emitStage = (stage: string, details: Record<string, unknown>) => {
      if (process.env.NODE_ENV === "test" && process.env.LOCAL_WHISPER_STRUCTURED_LOGS !== "true") return;
      console.info(JSON.stringify({
        event: "local_asr_stage",
        correlationId: input.correlationId || null,
        stage,
        tempFileId,
        ...details,
      }));
    };
    const buildDiagnostics = (
      failureStage?: AudioTranscriptionDiagnostics["failureStage"],
    ): AudioTranscriptionDiagnostics => ({
      providerCalled: Boolean(ffmpegDiagnostic || whisperDiagnostic),
      durationMs: Date.now() - startedAt,
      passCount: input.pass ?? 1,
      vadResult: "unknown",
      attemptCount: whisperDiagnostic ? 1 : 0,
      totalBudgetMs: timeoutMs,
      model: path.basename(this.modelPath),
      endpoint: "local_process",
      failureStage,
      inputBytes: input.audio.length,
      inputExtension,
      ffmpeg: ffmpegDiagnostic,
      whisper: whisperDiagnostic,
      gpuUsed: whisperDiagnostic ? whisperDiagnostic.safeReason.includes("cuda") : undefined,
      gpuFallback: whisperDiagnostic ? whisperDiagnostic.safeReason === "completed_cpu" : undefined,
      tempFileId,
    });
    try {
      await mkdir(workDir, { recursive: true });
      await writeFile(inputPath, input.audio);
      emitStage("input_ready", {
        result: "ready",
        durationMs: Date.now() - startedAt,
        inputBytes: input.audio.length,
        inputExtension,
        mimetype: input.mimetype.split(";", 1)[0].trim().toLowerCase(),
      });

      ffmpegDiagnostic = await runLocalAudioProcess({
        executable: this.ffmpegPath,
        args: [
          "-hide_banner", "-loglevel", "error", "-i", inputPath, "-ar", "16000", "-ac", "1",
          "-c:a", "pcm_s16le", "-y", normalizedPath,
        ],
        stage: "ffmpeg",
        timeoutMs: Math.max(1, timeoutMs - (Date.now() - startedAt)),
      });
      emitStage("ffmpeg", ffmpegDiagnostic);
      if (ffmpegDiagnostic.timedOut) {
        throw new AudioTranscriptionError("audio_transcription_timeout", undefined, buildDiagnostics("ffmpeg"));
      }
      if (ffmpegDiagnostic.exitCode !== 0) {
        throw new AudioTranscriptionError("audio_transcription_ffmpeg_failed", undefined, buildDiagnostics("ffmpeg"));
      }
      const normalizedSize = await stat(normalizedPath).then((item) => item.size).catch(() => 0);
      if (normalizedSize <= 44) {
        throw new AudioTranscriptionError("audio_transcription_ffmpeg_failed", undefined, buildDiagnostics("ffmpeg"));
      }

      const whisperArgs = buildLocalWhisperArgs({
        modelPath: this.modelPath,
        vadModelPath: this.vadModelPath,
        outputBase,
        initialPrompt,
      }).map((argument, index, arguments_) =>
        argument === "-" && arguments_[index - 1] === "-f" ? normalizedPath : argument,
      );
      const remainingMs = timeoutMs - (Date.now() - startedAt);
      if (remainingMs <= 0) {
        throw new AudioTranscriptionError("audio_transcription_timeout", undefined, buildDiagnostics("whisper"));
      }
      whisperDiagnostic = await runLocalAudioProcess({
        executable: this.whisperPath,
        args: whisperArgs,
        stage: "whisper",
        timeoutMs: remainingMs,
      });
      emitStage("whisper", whisperDiagnostic);
      if (whisperDiagnostic.timedOut) {
        throw new AudioTranscriptionError("audio_transcription_timeout", undefined, buildDiagnostics("whisper"));
      }
      if (whisperDiagnostic.exitCode !== 0) {
        throw new AudioTranscriptionError("audio_transcription_whisper_failed", undefined, buildDiagnostics("whisper"));
      }

      const transcript = (await readFile(`${outputBase}.txt`, "utf8").catch(() => "")).trim().slice(0, 1000);
      const diagnostics = buildDiagnostics(transcript ? undefined : "transcript");
      diagnostics.vadResult = transcript ? "speech" : "silence";
      if (!transcript) {
        const noSpeech = whisperDiagnostic.safeReason.includes("no_speech");
        throw new AudioTranscriptionError(
          noSpeech ? "audio_transcription_no_speech" : "audio_transcription_empty",
          undefined,
          diagnostics,
        );
      }
      emitStage("transcript", {
        result: "completed",
        durationMs: diagnostics.durationMs,
        transcriptLength: transcript.length,
        transcriptFingerprint: createHash("sha256").update(transcript).digest("hex").slice(0, 12),
      });
      return {
        transcript,
        provider: `local_whisper:${path.basename(this.modelPath)}`,
        normalizedMimetype: input.mimetype.split(";", 1)[0].trim().toLowerCase(),
        diagnostics,
      };
    } catch (error) {
      if (error instanceof AudioTranscriptionError) throw error;
      throw new AudioTranscriptionError(
        "audio_transcription_unavailable",
        undefined,
        buildDiagnostics(whisperDiagnostic ? "whisper" : ffmpegDiagnostic ? "ffmpeg" : "input"),
      );
    } finally {
      const cleanupStartedAt = Date.now();
      const cleanupSucceeded = await rm(workDir, { recursive: true, force: true })
        .then(() => true)
        .catch(() => false);
      emitStage("cleanup", {
        result: cleanupSucceeded ? "completed" : "failed",
        durationMs: Date.now() - cleanupStartedAt,
        safeReason: cleanupSucceeded ? "temporary_files_removed" : "temporary_files_cleanup_failed",
      });
      this.active = false;
    }
  }
}

export function isAudioTranscriptionEnabledFromEnv() {
  return isEnabled(process.env.AI_AUDIO_TRANSCRIPTION_ENABLED);
}

export function createAudioTranscriptionServiceFromEnv(): AudioTranscriptionService | null {
  if (!isAudioTranscriptionEnabledFromEnv()) return null;
  const provider = String(process.env.ASR_PROVIDER ?? process.env.AI_AUDIO_TRANSCRIPTION_PROVIDER ?? "").trim().toLowerCase();
  if (provider === "mock") {
    if (process.env.NODE_ENV !== "test") return null;
    const configuredFailure = String(process.env.AI_WHATSAPP_AUDIO_MOCK_FAILURE ?? "").trim();
    const failureReasons: AudioTranscriptionFailureReason[] = [
      "audio_transcription_429",
      "audio_transcription_quota_exhausted",
      "audio_transcription_5xx",
      "audio_transcription_timeout",
      "audio_transcription_empty_file",
      "audio_transcription_ffmpeg_failed",
      "audio_transcription_whisper_failed",
      "audio_transcription_empty",
      "audio_transcription_no_speech",
      "audio_transcription_failed",
    ];
    const failureReason = failureReasons.includes(configuredFailure as AudioTranscriptionFailureReason)
      ? (configuredFailure as AudioTranscriptionFailureReason)
      : undefined;
    return new MockAudioTranscriptionService(process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT ?? "", failureReason);
  }
  if (provider === "local_whisper") {
    const ffmpegPath = process.env.LOCAL_WHISPER_FFMPEG_PATH?.trim();
    const whisperPath = process.env.LOCAL_WHISPER_CLI_PATH?.trim();
    const modelPath = process.env.LOCAL_WHISPER_MODEL_PATH?.trim();
    const vadModelPath = process.env.LOCAL_WHISPER_VAD_MODEL_PATH?.trim();
    if (!ffmpegPath || !whisperPath || !modelPath || !vadModelPath) return null;
    if (process.env.NODE_ENV !== "test" && !isApprovedLocalWhisperModelPath(modelPath)) return null;
    if (String(process.env.LOCAL_WHISPER_GPU_ENABLED ?? "true").trim().toLowerCase() !== "true") return null;
    return new LocalWhisperAudioTranscriptionService(
      ffmpegPath,
      whisperPath,
      modelPath,
      vadModelPath,
      getLocalWhisperTimeoutMsFromEnv(),
      process.env.LOCAL_WHISPER_PROMPT?.trim() || undefined,
      Math.max(20_000, Math.min(120_000, getPositiveInteger(process.env.LOCAL_WHISPER_WARMUP_TIMEOUT_MS, 90_000))),
    );
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
import {
  executeResilientProviderRequest,
  ProviderAttemptDiagnostic,
  ResilientProviderError,
  ResilientProviderRuntime,
} from "./resilient-provider";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
