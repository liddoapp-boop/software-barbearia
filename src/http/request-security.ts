import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getAuthSecret } from "./security";

export const AUTH_SESSION_COOKIE = "sb_session";
export const CSRF_COOKIE = "sb_csrf";

export function parseCookies(header: string | undefined) {
  const result: Record<string, string> = {};
  for (const item of String(header ?? "").split(";")) {
    const separator = item.indexOf("=");
    if (separator < 1) continue;
    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      // Ignore malformed cookie values instead of accepting ambiguous input.
    }
  }
  return result;
}

function cookieSecurityAttributes() {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

function signCsrfNonce(nonce: string) {
  return crypto.createHmac("sha256", getAuthSecret()).update(`csrf:${nonce}`).digest("base64url");
}

export function createCsrfToken() {
  const nonce = crypto.randomBytes(24).toString("base64url");
  return `${nonce}.${signCsrfNonce(nonce)}`;
}

export function isValidCsrfToken(value: string | undefined) {
  const [nonce, signature, extra] = String(value ?? "").split(".");
  if (!nonce || !signature || extra) return false;
  const expected = Buffer.from(signCsrfNonce(nonce));
  const incoming = Buffer.from(signature);
  return expected.length === incoming.length && crypto.timingSafeEqual(expected, incoming);
}

export function setAuthCookies(reply: FastifyReply, accessToken: string, expiresAt: string) {
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const csrfToken = createCsrfToken();
  const common = `Path=/; Max-Age=${maxAge}; SameSite=Strict${cookieSecurityAttributes()}`;
  reply.header("Set-Cookie", [
    `${AUTH_SESSION_COOKIE}=${encodeURIComponent(accessToken)}; ${common}; HttpOnly`,
    `${CSRF_COOKIE}=${encodeURIComponent(csrfToken)}; ${common}`,
  ]);
  reply.header("Cache-Control", "no-store");
  return csrfToken;
}

export function clearAuthCookies(reply: FastifyReply) {
  const common = `Path=/; Max-Age=0; SameSite=Strict${cookieSecurityAttributes()}`;
  reply.header("Set-Cookie", [
    `${AUTH_SESSION_COOKIE}=; ${common}; HttpOnly`,
    `${CSRF_COOKIE}=; ${common}`,
  ]);
  reply.header("Cache-Control", "no-store");
}

export function assertCsrf(request: FastifyRequest) {
  const cookies = parseCookies(request.headers.cookie);
  const headerValue = request.headers["x-csrf-token"];
  const incoming = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const cookieValue = cookies[CSRF_COOKIE];
  if (!incoming || !cookieValue || incoming !== cookieValue || !isValidCsrfToken(incoming)) {
    throw Object.assign(new Error("Requisicao de origem invalida"), { statusCode: 403, publicCode: "CSRF_INVALID" });
  }
}

type RateLimitRule = { limit: number; windowMs: number };

export class MemoryRateLimiter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  consume(key: string, rule: RateLimitRule, now = Date.now()) {
    if (this.entries.size > 10_000) {
      for (const [entryKey, entry] of this.entries) {
        if (entry.resetAt <= now) this.entries.delete(entryKey);
      }
    }
    const current = this.entries.get(key);
    if (!current || current.resetAt <= now) {
      const resetAt = now + rule.windowMs;
      this.entries.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: rule.limit - 1, resetAt };
    }
    current.count += 1;
    return {
      allowed: current.count <= rule.limit,
      remaining: Math.max(0, rule.limit - current.count),
      resetAt: current.resetAt,
    };
  }
}

export function enforceRateLimit(input: {
  limiter: MemoryRateLimiter;
  key: string;
  limit: number;
  windowMs: number;
  reply: FastifyReply;
}) {
  const result = input.limiter.consume(input.key, { limit: input.limit, windowMs: input.windowMs });
  input.reply.header("RateLimit-Limit", input.limit);
  input.reply.header("RateLimit-Remaining", result.remaining);
  input.reply.header("RateLimit-Reset", Math.ceil(result.resetAt / 1000));
  if (!result.allowed) {
    const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    input.reply.header("Retry-After", retryAfter);
    throw Object.assign(new Error("Muitas requisicoes"), { statusCode: 429, publicCode: "RATE_LIMITED" });
  }
}

export function getClientAddress(request: FastifyRequest) {
  // Fastify only honors forwarded headers when trustProxy is explicitly enabled.
  return request.ip || request.socket.remoteAddress || "unknown";
}
