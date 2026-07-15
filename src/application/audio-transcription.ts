export type AudioTranscriptionFailureReason =
  | "audio_transcription_unavailable"
  | "audio_transcription_429"
  | "audio_transcription_quota_exhausted"
  | "audio_transcription_5xx"
  | "audio_transcription_timeout"
  | "audio_transcription_circuit_open"
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
        && error.reason === "audio_transcription_no_speech"
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
    if (!input.audio.length || !input.mimetype.trim()) throw new AudioTranscriptionError("audio_transcription_failed");
    if (this.active) throw new AudioTranscriptionError("audio_transcription_unavailable", "ASR local ocupado; concorrencia configurada em uma execucao.");
    this.active = true;
    const startedAt = Date.now();
    const timeoutMs = Math.max(1_000, Math.min(timeoutLimitMs, input.timeoutMs ?? timeoutLimitMs));
    const initialPrompt = String(input.initialPrompt ?? this.prompt)
      .replace(/[\r\n\t]+/g, " ")
      .trim()
      .slice(0, 1_500);
    const workDir = path.join(os.tmpdir(), `software-barbearia-asr-${randomUUID()}`);
    const outputBase = path.join(workDir, "transcript");
    let ffmpeg: ChildProcessWithoutNullStreams | undefined;
    let whisper: ChildProcessWithoutNullStreams | undefined;
    try {
      await mkdir(workDir, { recursive: true });
      ffmpeg = spawn(this.ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-ar", "16000", "-ac", "1",
        "-c:a", "pcm_s16le", "-f", "wav", "pipe:1",
      ], { windowsHide: true });
      const whisperArgs = buildLocalWhisperArgs({
        modelPath: this.modelPath,
        vadModelPath: this.vadModelPath,
        outputBase,
        initialPrompt,
      });
      whisper = spawn(this.whisperPath, whisperArgs, { windowsHide: true });
      ffmpeg.stderr.resume();
      whisper.stdout.resume();
      whisper.stderr.resume();
      ffmpeg.stdout.pipe(whisper.stdin);
      ffmpeg.stdin.end(input.audio);

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          error ? reject(error) : resolve();
        };
        const timer = setTimeout(() => {
          ffmpeg?.kill();
          whisper?.kill();
          finish(Object.assign(new Error("ASR local timeout"), { code: "LOCAL_ASR_TIMEOUT" }));
        }, timeoutMs);
        ffmpeg?.once("error", finish);
        whisper?.once("error", finish);
        whisper?.once("close", (code) => code === 0 ? finish() : finish(new Error(`whisper.cpp exit ${code ?? "unknown"}`)));
      });

      const transcript = (await readFile(`${outputBase}.txt`, "utf8").catch(() => "")).trim().slice(0, 1000);
      const diagnostics: AudioTranscriptionDiagnostics = {
        providerCalled: true,
        durationMs: Date.now() - startedAt,
        passCount: input.pass ?? 1,
        vadResult: transcript ? "speech" : "silence",
        attemptCount: 1,
        totalBudgetMs: timeoutMs,
        model: path.basename(this.modelPath),
        endpoint: "local_process",
      };
      if (!transcript) throw new AudioTranscriptionError("audio_transcription_no_speech", undefined, diagnostics);
      return {
        transcript,
        provider: `local_whisper:${path.basename(this.modelPath)}`,
        normalizedMimetype: input.mimetype.split(";", 1)[0].trim().toLowerCase(),
        diagnostics,
      };
    } catch (error) {
      if (error instanceof AudioTranscriptionError) throw error;
      const timedOut = error instanceof Error && (error as Error & { code?: string }).code === "LOCAL_ASR_TIMEOUT";
      throw new AudioTranscriptionError(
        timedOut ? "audio_transcription_timeout" : "audio_transcription_unavailable",
        undefined,
        {
          providerCalled: Boolean(ffmpeg && whisper),
          durationMs: Date.now() - startedAt,
          passCount: input.pass ?? 1,
          vadResult: "unknown",
          attemptCount: ffmpeg && whisper ? 1 : 0,
          totalBudgetMs: timeoutMs,
          model: path.basename(this.modelPath),
          endpoint: "local_process",
        },
      );
    } finally {
      ffmpeg?.kill();
      whisper?.kill();
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
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
      20_000,
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
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
