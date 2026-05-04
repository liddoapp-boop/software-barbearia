import crypto from "node:crypto";

export type IdempotencyRecordStatus = "IN_PROGRESS" | "SUCCEEDED" | "FAILED";

export function normalizeIdempotencyKey(value?: string | null) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function normalizeForHash(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => normalizeForHash(item));
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if (key === "idempotencyKey" || key === "idempotencyPayloadHash") continue;
    const item = (value as Record<string, unknown>)[key];
    if (item === undefined) continue;
    output[key] = normalizeForHash(item);
  }
  return output;
}

export function hashIdempotencyPayload(payload: unknown) {
  const canonical = JSON.stringify(normalizeForHash(payload));
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export function toJsonValue<T>(payload: T): unknown {
  return JSON.parse(JSON.stringify(payload));
}
