import crypto from "node:crypto";

export type UserRole = "owner" | "recepcao" | "profissional";

export type AuthSession = {
  userId: string;
  email: string;
  role: UserRole;
  unitIds: string[];
  activeUnitId: string;
  expiresAt: string;
};

type TokenPayload = {
  sub: string;
  email: string;
  role: UserRole;
  unitIds: string[];
  activeUnitId: string;
  iat: number;
  exp: number;
};

export type AuthUser = {
  id: string;
  email: string;
  password?: string;
  passwordHash?: string;
  name?: string;
  role: UserRole;
  unitIds: string[];
};

const DEFAULT_USERS: AuthUser[] = [
  {
    id: "usr-owner",
    email: "owner@barbearia.local",
    password: "owner123",
    role: "owner",
    unitIds: ["unit-01", "unit-02"],
  },
  {
    id: "usr-recepcao",
    email: "recepcao@barbearia.local",
    password: "recepcao123",
    role: "recepcao",
    unitIds: ["unit-01"],
  },
  {
    id: "usr-profissional",
    email: "profissional@barbearia.local",
    password: "profissional123",
    role: "profissional",
    unitIds: ["unit-01"],
  },
];

function toBase64Url(input: string) {
  return Buffer.from(input, "utf-8").toString("base64url");
}

function fromBase64Url(input: string) {
  return Buffer.from(input, "base64url").toString("utf-8");
}

function signHmac(content: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(content).digest("base64url");
}

function signHexHmac(content: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(content).digest("hex");
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const iterations = 210_000;
  const keyLength = 32;
  const digest = "sha256";
  const hash = crypto
    .pbkdf2Sync(password, salt, iterations, keyLength, digest)
    .toString("base64url");
  return `pbkdf2$${digest}$${iterations}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const normalizedStored = String(stored ?? "");
  const parts = normalizedStored.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2") {
    const expected = Buffer.from(normalizedStored, "utf-8");
    const incoming = Buffer.from(String(password ?? ""), "utf-8");
    return expected.length === incoming.length && crypto.timingSafeEqual(expected, incoming);
  }

  const [, digest, iterationsRaw, salt, expectedHash] = parts;
  const iterations = Number(iterationsRaw);
  if (!digest || !Number.isInteger(iterations) || iterations < 100_000 || !salt || !expectedHash) {
    return false;
  }

  const incomingHash = crypto
    .pbkdf2Sync(password, salt, iterations, 32, digest)
    .toString("base64url");
  const expected = Buffer.from(expectedHash, "base64url");
  const incoming = Buffer.from(incomingHash, "base64url");
  return expected.length === incoming.length && crypto.timingSafeEqual(expected, incoming);
}

export function getAuthSecret() {
  return process.env.AUTH_SECRET?.trim() || "dev-secret-change-me";
}

export function getBillingWebhookSecret(provider?: string) {
  const normalized = String(provider ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");
  const providerKey = normalized
    ? process.env[`BILLING_WEBHOOK_SECRET_${normalized}`]?.trim()
    : undefined;
  return providerKey || process.env.BILLING_WEBHOOK_SECRET?.trim() || "billing-dev-secret";
}

export function computeBillingWebhookSignature(payload: string, secret: string) {
  return `sha256=${signHexHmac(payload, secret)}`;
}

export function verifyBillingWebhookSignature(input: {
  payload: string;
  signature?: string;
  secret: string;
}) {
  const incoming = String(input.signature ?? "").trim();
  if (!incoming) return false;
  const normalized = incoming.startsWith("sha256=") ? incoming.slice(7) : incoming;
  if (!/^[a-fA-F0-9]{64}$/.test(normalized)) return false;
  const expected = signHexHmac(input.payload, input.secret);
  const expectedBuffer = Buffer.from(expected, "hex");
  const incomingBuffer = Buffer.from(normalized.toLowerCase(), "hex");
  if (expectedBuffer.length !== incomingBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, incomingBuffer);
}

export function isAuthEnforced() {
  return String(process.env.AUTH_ENFORCED ?? "true").toLowerCase() === "true";
}

export function loadAuthUsers(): AuthUser[] {
  const raw = process.env.AUTH_USERS_JSON?.trim();
  if (!raw) return DEFAULT_USERS;

  try {
    const parsed = JSON.parse(raw) as Array<Partial<AuthUser>>;
    const users = parsed
      .map((item) => ({
        id: String(item.id ?? "").trim(),
        email: String(item.email ?? "").trim().toLowerCase(),
        password: String(item.password ?? ""),
        passwordHash: item.passwordHash ? String(item.passwordHash) : undefined,
        name: item.name ? String(item.name).trim() : undefined,
        role: item.role as UserRole,
        unitIds: Array.isArray(item.unitIds)
          ? item.unitIds.map((unitId) => String(unitId).trim()).filter(Boolean)
          : [],
      }))
      .filter(
        (item) =>
          item.id && item.email && (item.password || item.passwordHash) && item.unitIds.length > 0,
      )
      .filter(
        (item) =>
          item.role === "owner" || item.role === "recepcao" || item.role === "profissional",
      );

    if (users.length > 0) return users;
    return DEFAULT_USERS;
  } catch {
    return DEFAULT_USERS;
  }
}

export function issueAccessToken(input: {
  user: AuthUser;
  activeUnitId?: string;
  expiresInSec?: number;
}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresInSec = Math.max(300, input.expiresInSec ?? 60 * 60 * 8);
  const activeUnitId = input.activeUnitId ?? input.user.unitIds[0];
  if (!input.user.unitIds.includes(activeUnitId)) {
    throw new Error("Unidade nao autorizada para o usuario");
  }

  const payload: TokenPayload = {
    sub: input.user.id,
    email: input.user.email,
    role: input.user.role,
    unitIds: input.user.unitIds,
    activeUnitId,
    iat: nowSec,
    exp: nowSec + expiresInSec,
  };

  const headerSegment = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payloadSegment = toBase64Url(JSON.stringify(payload));
  const content = `${headerSegment}.${payloadSegment}`;
  const signature = signHmac(content, getAuthSecret());

  return {
    accessToken: `${content}.${signature}`,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

export function verifyAccessToken(token: string): AuthSession {
  const normalized = String(token ?? "").trim();
  const [headerSegment, payloadSegment, signature] = normalized.split(".");
  if (!headerSegment || !payloadSegment || !signature) {
    throw new Error("Token invalido");
  }

  const expectedSignature = signHmac(`${headerSegment}.${payloadSegment}`, getAuthSecret());
  if (expectedSignature !== signature) {
    throw new Error("Token invalido");
  }

  const payload = JSON.parse(fromBase64Url(payloadSegment)) as TokenPayload;
  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= nowSec) {
    throw new Error("Token expirado");
  }

  if (!Array.isArray(payload.unitIds) || payload.unitIds.length === 0) {
    throw new Error("Token invalido");
  }

  if (!payload.unitIds.includes(payload.activeUnitId)) {
    throw new Error("Token invalido");
  }

  return {
    userId: payload.sub,
    email: payload.email,
    role: payload.role,
    unitIds: payload.unitIds,
    activeUnitId: payload.activeUnitId,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}
