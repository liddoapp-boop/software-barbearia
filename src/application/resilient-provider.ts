export type ProviderPurpose = "transcription" | "semantic";

export type ProviderFailureClassification =
  | "success"
  | "transient_network"
  | "transient_timeout"
  | "transient_http"
  | "permanent_quota"
  | "permanent_http"
  | "invalid_configuration";

export type ProviderAttemptDiagnostic = {
  correlationId: string;
  provider: string;
  purpose: ProviderPurpose;
  model: string;
  endpoint: string;
  attempt: number;
  httpStatus?: number;
  providerCode?: string;
  providerStatus?: string;
  providerMessage?: string;
  retryAfterMs?: number;
  retryHeaders?: Record<string, string>;
  durationMs: number;
  remainingBudgetMs: number;
  classification: ProviderFailureClassification;
  retryApplied: boolean;
  fallbackUsed: boolean;
  result: "success" | "failed";
};

export type ResilientProviderRuntime = {
  now: () => number;
  random: () => number;
  sleep: (delayMs: number) => Promise<void>;
};

type ProviderErrorDetails = {
  code?: string;
  status?: string;
  message?: string;
  retryAfterMs?: number;
  retryHeaders?: Record<string, string>;
  permanentQuota: boolean;
};

export type ResilientProviderRequestConfig = {
  correlationId?: string;
  provider: string;
  purpose: ProviderPurpose;
  model: string;
  fallbackModel?: string;
  fallbackEnabled?: boolean;
  endpoint: string;
  timeoutMs: number;
  totalBudgetMs: number;
  maxRetries: number;
  request: (model: string, signal: AbortSignal) => Promise<Response>;
  onAttempt?: (attempt: ProviderAttemptDiagnostic) => void | Promise<void>;
  runtime?: Partial<ResilientProviderRuntime>;
};

export type ResilientProviderSuccess = {
  response: Response;
  model: string;
  attempts: ProviderAttemptDiagnostic[];
  fallbackUsed: boolean;
};

export class ResilientProviderError extends Error {
  constructor(
    readonly classification: ProviderFailureClassification,
    readonly attempts: ProviderAttemptDiagnostic[],
    readonly model: string,
  ) {
    super(classification);
    this.name = "ResilientProviderError";
  }

  get lastAttempt() {
    return this.attempts[this.attempts.length - 1];
  }
}

const retryableStatuses = new Set([408, 429, 500, 502, 503, 504]);

export function sanitizeProviderValue(value: unknown, maxLength = 300) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const sanitized = String(value)
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/(?:api[_-]?key|key|token|authorization)\s*[:=]\s*[^\s,;]+/gi, "credential=[redacted]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return sanitized || undefined;
}

export function sanitizeProviderEndpoint(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return String(value).split("?", 1)[0].slice(0, 300);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseRetryDelayMs(value: unknown) {
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)s$/i);
  const delay = match ? Number(match[1]) * 1000 : NaN;
  return Number.isFinite(delay) && delay >= 0 ? Math.ceil(delay) : undefined;
}

function parseRetryAfterMs(value: string | null, now: number) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? Math.max(0, instant - now) : undefined;
}

function structuredRetryDelay(details: unknown) {
  if (!Array.isArray(details)) return undefined;
  for (const detail of details) {
    const record = asRecord(detail);
    if (String(record?.["@type"] ?? "").toLowerCase().endsWith("google.rpc.retryinfo")) {
      const delay = parseRetryDelayMs(record?.retryDelay);
      if (delay !== undefined) return delay;
    }
  }
  return undefined;
}

function hasPermanentQuotaSignal(error: Record<string, unknown>) {
  const details = Array.isArray(error.details) ? error.details : [];
  const quotaText = details.flatMap((detail) => {
    const violations = asRecord(detail)?.violations;
    return Array.isArray(violations)
      ? violations.flatMap((violation) => {
          const record = asRecord(violation);
          return [record?.quotaId, record?.quotaMetric].filter((item): item is string => typeof item === "string");
        })
      : [];
  }).join(" ").toLowerCase();
  const message = String(error.message ?? "").toLowerCase();
  return /(?:per.?day|daily|requestsperday|tokensperday|limit\s*:\s*0)/.test(`${quotaText} ${message}`)
    || /(?:billing account (?:is )?(?:disabled|inactive|not found)|insufficient quota|quota (?:is )?exhausted permanently)/.test(message);
}

async function readProviderError(response: Response, now: number): Promise<ProviderErrorDetails> {
  let payload: unknown;
  try {
    const text = await response.text();
    payload = text.length <= 32_000 ? JSON.parse(text) : undefined;
  } catch {
    payload = undefined;
  }
  const error = asRecord(asRecord(payload)?.error) ?? asRecord(payload) ?? {};
  const retryAfter = response.headers?.get?.("retry-after") ?? null;
  const retryHeaders = Object.fromEntries(
    ["retry-after", "x-ratelimit-reset", "x-ratelimit-remaining", "x-ratelimit-limit"]
      .map((name) => [name, sanitizeProviderValue(response.headers?.get?.(name), 128)] as const)
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  const retryAfterMs = parseRetryAfterMs(retryAfter, now) ?? structuredRetryDelay(error.details);
  const message = String(error.message ?? "").toLowerCase();
  const exhaustedFreeTierWithoutRetry = retryAfterMs === undefined
    && /exceeded your current quota/.test(message)
    && /quota exceeded for metric/.test(message)
    && /free_tier_requests/.test(message);
  return {
    code: sanitizeProviderValue(error.code ?? response.status, 64),
    status: sanitizeProviderValue(error.status, 64),
    message: sanitizeProviderValue(error.message),
    retryAfterMs,
    ...(Object.keys(retryHeaders).length ? { retryHeaders } : {}),
    permanentQuota: response.status === 429 && (hasPermanentQuotaSignal(error) || exhaustedFreeTierWithoutRetry),
  };
}

function positiveInteger(value: number, fallback: number) {
  return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : fallback;
}

function isTransientNetworkError(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError" || error.name === "TimeoutError") return true;
  const code = String((error as Error & { code?: string; cause?: { code?: string } }).code
    ?? (error as Error & { cause?: { code?: string } }).cause?.code ?? "").toUpperCase();
  return error instanceof TypeError || ["ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"].includes(code);
}

export async function executeResilientProviderRequest(
  config: ResilientProviderRequestConfig,
): Promise<ResilientProviderSuccess> {
  const runtime: ResilientProviderRuntime = {
    now: config.runtime?.now ?? Date.now,
    random: config.runtime?.random ?? Math.random,
    sleep: config.runtime?.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs))),
  };
  const startedAt = runtime.now();
  const attempts: ProviderAttemptDiagnostic[] = [];
  const maxRetries = positiveInteger(config.maxRetries, 0);
  const endpoint = sanitizeProviderEndpoint(config.endpoint);
  const correlationId = config.correlationId?.trim().slice(0, 128) || "unavailable";
  let model = config.model;
  let fallbackUsed = false;
  let primaryAttempt = 0;

  while (true) {
    const elapsed = runtime.now() - startedAt;
    const remainingBefore = config.totalBudgetMs - elapsed;
    if (remainingBefore <= 0) {
      throw new ResilientProviderError("transient_timeout", attempts, model);
    }
    primaryAttempt += 1;
    const attemptStartedAt = runtime.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1, Math.min(config.timeoutMs, remainingBefore)));
    let response: Response | undefined;
    let errorDetails: ProviderErrorDetails | undefined;
    let classification: ProviderFailureClassification = "success";
    try {
      response = await config.request(model, controller.signal);
      if (!response.ok) {
        errorDetails = await readProviderError(response, runtime.now());
        classification = errorDetails.permanentQuota
          ? "permanent_quota"
          : retryableStatuses.has(response.status)
            ? "transient_http"
            : "permanent_http";
      }
    } catch (error) {
      if (!isTransientNetworkError(error)) {
        classification = "invalid_configuration";
        errorDetails = { message: sanitizeProviderValue(error instanceof Error ? error.message : error), permanentQuota: false };
      } else {
        classification = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")
          ? "transient_timeout"
          : "transient_network";
        errorDetails = { message: sanitizeProviderValue(error instanceof Error ? error.message : error), permanentQuota: false };
      }
    } finally {
      clearTimeout(timeout);
    }

    const transient = classification === "transient_http" || classification === "transient_network" || classification === "transient_timeout";
    const canRetryPrimary = transient && !fallbackUsed && primaryAttempt <= maxRetries;
    const canFallback = transient && !fallbackUsed && Boolean(config.fallbackEnabled && config.fallbackModel?.trim());
    const retryApplied = canRetryPrimary || (!canRetryPrimary && canFallback);
    const diagnostic: ProviderAttemptDiagnostic = {
      correlationId,
      provider: config.provider,
      purpose: config.purpose,
      model,
      endpoint,
      attempt: attempts.length + 1,
      ...(response ? { httpStatus: response.status } : {}),
      ...(errorDetails?.code ? { providerCode: errorDetails.code } : {}),
      ...(errorDetails?.status ? { providerStatus: errorDetails.status } : {}),
      ...(errorDetails?.message ? { providerMessage: errorDetails.message } : {}),
      ...(errorDetails?.retryAfterMs === undefined ? {} : { retryAfterMs: errorDetails.retryAfterMs }),
      ...(errorDetails?.retryHeaders ? { retryHeaders: errorDetails.retryHeaders } : {}),
      durationMs: Math.max(0, runtime.now() - attemptStartedAt),
      remainingBudgetMs: Math.max(0, config.totalBudgetMs - (runtime.now() - startedAt)),
      classification,
      retryApplied,
      fallbackUsed,
      result: classification === "success" ? "success" : "failed",
    };
    attempts.push(diagnostic);
    await config.onAttempt?.(diagnostic);

    if (classification === "success" && response) return { response, model, attempts, fallbackUsed };
    if (!retryApplied) throw new ResilientProviderError(classification, attempts, model);

    const baseDelay = 1_000 * (2 ** Math.min(primaryAttempt - 1, 5));
    const jittered = baseDelay + Math.floor(runtime.random() * baseDelay);
    const delayMs = Math.max(errorDetails?.retryAfterMs ?? 0, jittered);
    const remaining = config.totalBudgetMs - (runtime.now() - startedAt);
    if (delayMs >= remaining) throw new ResilientProviderError("transient_timeout", attempts, model);
    await runtime.sleep(delayMs);

    if (!canRetryPrimary && canFallback) {
      fallbackUsed = true;
      model = config.fallbackModel!.trim();
    }
  }
}
