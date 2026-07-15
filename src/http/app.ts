import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import { OperationsService } from "../application/operations-service";
import { PrismaOperationsService } from "../application/prisma-operations-service";
import { createGeminiRetentionScorerFromEnv } from "../application/gemini-retention-scoring";
import {
  createOwnerCommandParserFromEnv,
  OwnerCommandParser,
  OwnerCommandParserError,
  OwnerCommandParserStatus,
  OwnerCommandParseResult,
  getDeterministicDateRecognitionType,
  getOwnerCommandClientNameRejectionReason,
  getOwnerCommandBoundaryObservation,
  parseCanonicalDeterministicOwnerCommand,
  parseDeterministicOwnerCommand,
  recognizeOwnerCommandDate,
  recognizeOwnerCommandTime,
} from "../application/owner-command-ai";
import {
  AudioTranscriptionError,
  AudioTranscriptionService,
  createAudioTranscriptionServiceFromEnv,
  GEMINI_AUDIO_TRANSCRIPTION_ENDPOINT,
  getGeminiAudioTranscriptionTotalBudgetMsFromEnv,
  getGeminiAudioTranscriptionTimeoutMsFromEnv,
  isAudioTranscriptionEnabledFromEnv,
} from "../application/audio-transcription";
import { AiWhatsappPipelineState, SingleWhatsappResponseGate } from "../application/ai-whatsapp-pipeline";
import {
  AudioCanonicalization,
  BarbershopAudioVocabulary,
  buildBarbershopAudioVocabulary,
  buildFocusedWhisperPrompt,
  canonicalizeAudioTranscript,
  getAudioCriticalMissingFields,
} from "../application/barbershop-audio-vocabulary";
import { ProviderAttemptDiagnostic } from "../application/resilient-provider";
import {
  AiWhatsappEntityKind,
  isAiWhatsappResolvedEntityStatus,
  resolveAiWhatsappClient,
  resolveAiWhatsappEntity,
} from "../application/whatsapp-entity-resolution";
import { AuditRecorder, TransactionalAuditContext } from "../application/audit-service";
import { InMemoryStore } from "../infrastructure/in-memory-store";
import { AppointmentStatus, Client, ReportExportType } from "../domain/types";
import { prisma } from "../infrastructure/database/prisma";
import {
  hashIdempotencyPayload,
  normalizeIdempotencyKey,
} from "../application/idempotency";
import {
  calculateAppointmentServicesTotal,
  resolveEffectiveAppointmentDuration,
  resolveLegacyPrimaryServiceId,
  MAX_APPOINTMENT_SERVICES,
  MIN_APPOINTMENT_SERVICES,
  normalizeServiceIds,
} from "../domain/appointment-services";
import {
  AuthSession,
  AuthUser,
  UserRole,
  getBillingWebhookSecret,
  getAuthSecret,
  getDataBackend,
  hashPassword,
  isAuthEnforced,
  issueAccessToken,
  loadAuthUsers,
  verifyPassword,
  verifyBillingWebhookSignature,
  verifyAccessToken,
} from "./security";
import { verifyFirebaseIdToken, isFirebaseToken } from "./firebase-auth";
import {
  sendWhatsAppMessage,
  sendEmail,
  getWhatsAppConnectionState,
  connectWhatsApp,
  disconnectWhatsApp,
  WhatsappDeliveryError,
  buildBookingWhatsApp,
  buildBookingEmailHtml,
} from "../notifications";

type RequestWithAuth = FastifyRequest & {
  auth?: AuthSession;
  correlationId?: string;
  hasInvalidToken?: boolean;
};

type AccessPolicy = {
  isPublic: boolean;
  roles?: UserRole[];
  unitSource?: "query" | "body";
};

function asRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
}

function routePattern(request: FastifyRequest) {
  const configuredRoute = request.routeOptions.url;
  if (configuredRoute) return configuredRoute;
  try {
    return new URL(request.url, "http://localhost").pathname;
  } catch {
    return "";
  }
}

function getIdempotencyKey(request: FastifyRequest, bodyKey?: string) {
  const headerValue =
    request.headers["idempotency-key"] ?? request.headers["x-idempotency-key"];
  const headerKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return normalizeIdempotencyKey(bodyKey) ?? normalizeIdempotencyKey(headerKey);
}

function requireIdempotencyKey(request: FastifyRequest, bodyKey?: string) {
  const idempotencyKey = getIdempotencyKey(request, bodyKey);
  if (!idempotencyKey) {
    throw new Error("idempotencyKey é obrigatória para esta operação");
  }
  return idempotencyKey;
}

function getIdempotencyPayloadHash(payload: unknown) {
  return hashIdempotencyPayload(payload);
}

function toBase64UrlJson(input: unknown) {
  return Buffer.from(JSON.stringify(input), "utf-8").toString("base64url");
}

function fromBase64UrlJson(input: string) {
  return JSON.parse(Buffer.from(input, "base64url").toString("utf-8")) as unknown;
}

function stableJson(input: unknown): string {
  if (input === null || typeof input !== "object") return JSON.stringify(input);
  if (Array.isArray(input)) return `[${input.map((item) => stableJson(item)).join(",")}]`;
  const record = input as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function signOwnerCommandConfirmation(payload: unknown) {
  return crypto.createHmac("sha256", getAuthSecret()).update(stableJson(payload)).digest("base64url");
}

function getAllowedCorsOrigins() {
  const raw = process.env.CORS_ORIGIN?.trim();
  const isProduction = process.env.NODE_ENV === "production";
  if (!raw) {
    if (isProduction) {
      throw new Error("CORS_ORIGIN restrito e obrigatorio em producao");
    }
    return true;
  }
  const values = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!values.length) {
    if (isProduction) {
      throw new Error("CORS_ORIGIN restrito e obrigatorio em producao");
    }
    return true;
  }
  if (!isProduction && values.includes("*")) {
    return true;
  }
  if (isProduction && values.includes("*")) {
    throw new Error("CORS_ORIGIN='*' nao e permitido em producao");
  }
  const allowedOrigins: string[] = [];
  if (isProduction) {
    for (const value of values) {
      try {
        const url = new URL(value);
        const normalized = value.endsWith("/") ? value.slice(0, -1) : value;
        if ((url.protocol !== "http:" && url.protocol !== "https:") || url.origin !== normalized) {
          throw new Error("invalid-origin");
        }
        allowedOrigins.push(url.origin);
      } catch {
        throw new Error("CORS_ORIGIN deve conter apenas origens http/https validas");
      }
    }
  }
  return allowedOrigins.length ? allowedOrigins : values;
}

function getContentSecurityPolicy() {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://www.gstatic.com https://unpkg.com https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https:",
    "connect-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "form-action 'self'",
  ].join("; ");
}

const normalizePublicFilterText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const hasPublicDataTestMarker = (...values: unknown[]) => {
  const text = values.map(normalizePublicFilterText).join(" ");
  return ["teste", "tg", "demo", "db"].some((marker) => text.includes(marker));
};

export const hasPublicIdTestMarker = (value: unknown) => {
  const text = normalizePublicFilterText(value);
  if (["teste", "tg", "demo"].some((marker) => text.includes(marker))) return true;
  return /(^|[^a-z0-9])db([^a-z0-9]|$)/.test(text);
};

const isPublicOperationalService = (item: {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  category?: unknown;
  notes?: unknown;
  active?: unknown;
  isActive?: unknown;
}) =>
  item.active !== false &&
  item.isActive !== false &&
  !hasPublicIdTestMarker(item.id) &&
  !hasPublicDataTestMarker(item.name, item.description, item.category, item.notes);

const isPublicOperationalProfessional = (item: { id?: unknown; name?: unknown }) =>
  !hasPublicIdTestMarker(item.id) &&
  !hasPublicDataTestMarker(item.name);

const DEFAULT_WORKING_HOURS = {
  timezone: "America/Sao_Paulo",
  weekly: [
    { day: 1, label: "Segunda", start: "08:00", end: "20:00" },
    { day: 2, label: "Terca", start: "08:00", end: "20:00" },
    { day: 3, label: "Quarta", start: "08:00", end: "20:00" },
    { day: 4, label: "Quinta", start: "08:00", end: "20:00" },
    { day: 5, label: "Sexta", start: "08:00", end: "20:00" },
    { day: 6, label: "Sabado", start: "08:00", end: "14:00" },
    { day: 0, label: "Domingo", start: "", end: "", isClosed: true },
  ],
} as const;

function parseHmToMinutes(value: string) {
  const [h, m] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function getWeekdayAndMinutes(date: Date, timezone: string) {
  const dayText = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: timezone,
  }).format(date);
  const timeText = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(date);
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const day = dayMap[dayText] ?? 0;
  const timeMins = parseHmToMinutes(timeText);
  return { day, minutes: timeMins ?? 0 };
}

function normalizeWorkingHoursRows(
  rows: Array<{ dayOfWeek: number; opensAt?: string | null; closesAt?: string | null; isClosed?: boolean }>,
  timezone = DEFAULT_WORKING_HOURS.timezone,
) {
  const labels = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];
  const map = new Map(rows.map((item) => [item.dayOfWeek, item]));
  return {
    timezone,
    weekly: Array.from({ length: 7 }, (_, day) => {
      const row = map.get(day);
      if (!row || row.isClosed || !row.opensAt || !row.closesAt) {
        return { day, label: labels[day], start: "", end: "", isClosed: true };
      }
      return {
        day,
        label: labels[day],
        start: row.opensAt,
        end: row.closesAt,
        isClosed: false,
      };
    }),
  };
}

async function resolveWorkingHoursForUnit(unitId: string, operations: any) {
  if (
    operations &&
    "getBusinessHours" in operations &&
    typeof operations.getBusinessHours === "function"
  ) {
    try {
      const result = await operations.getBusinessHours({ unitId });
      const rows = Array.isArray(result?.businessHours) ? result.businessHours : [];
      if (rows.length) return normalizeWorkingHoursRows(rows);
    } catch {
      // fallback below
    }
  }
  return {
    timezone: DEFAULT_WORKING_HOURS.timezone,
    weekly: DEFAULT_WORKING_HOURS.weekly.map((item) => ({
      ...item,
      isClosed: "isClosed" in item ? item.isClosed : false,
    })),
  };
}

function isWithinWorkingHours(
  startsAt: Date,
  endsAt: Date,
  workingHours: { timezone?: string; weekly?: Array<{ day: number; start: string; end: string; isClosed?: boolean }> },
) {
  const timezone = workingHours?.timezone || DEFAULT_WORKING_HOURS.timezone;
  const weekly = Array.isArray(workingHours?.weekly) ? workingHours.weekly : [];
  const startRef = getWeekdayAndMinutes(startsAt, timezone);
  const endRef = getWeekdayAndMinutes(endsAt, timezone);
  if (startRef.day !== endRef.day) return false;
  const slot = weekly.find((item) => item.day === startRef.day);
  if (!slot || slot.isClosed || !slot.start || !slot.end) return false;
  const from = parseHmToMinutes(slot.start);
  const to = parseHmToMinutes(slot.end);
  if (from == null || to == null) return false;
  return startRef.minutes >= from && endRef.minutes <= to;
}

function getPolicyForRoute(method: string, route: string): AccessPolicy {
  if (
    route === "/health" ||
    route === "/" ||
    route === "/login" ||
    route === "/agendamento" ||
    route === "/login.html" ||
    route === "/booking.html" ||
    route === "/favicon.ico" ||
    route === "/*"
  ) {
    return { isPublic: true };
  }
  if (route.startsWith("/public/")) return { isPublic: true };
  if (route === "/catalog") {
    return { isPublic: false, roles: ["owner", "recepcao", "profissional"], unitSource: "query" };
  }
  if (route === "/auth/login" || route === "/auth/firebase") return { isPublic: true };
  if (route === "/integrations/billing/webhooks/:provider") return { isPublic: true };
  if (route === "/webhooks/evolution/whatsapp") return { isPublic: true };
  if (route === "/whatsapp/status" || route === "/whatsapp/connect" || route === "/whatsapp/disconnect") {
    return { isPublic: false, roles: ["owner"] };
  }
  if (route === "/ai/owner-command/parse") {
    return { isPublic: false, roles: ["owner"] };
  }
  if (route === "/ai/owner-command/confirm") {
    return { isPublic: false, roles: ["owner"] };
  }
  if (route === "/auth/me") {
    return { isPublic: false, roles: ["owner", "recepcao", "profissional"] };
  }
  if (route === "/users") {
    return { isPublic: false, roles: ["owner"], unitSource: "query" };
  }
  if (route === "/multiunit/overview" || route === "/multiunit/benchmark") {
    return { isPublic: false, roles: ["owner"] };
  }
  if (route.startsWith("/billing/reconciliation/")) {
    return {
      isPublic: false,
      roles: ["owner"],
      unitSource: method === "GET" ? "query" : "body",
    };
  }
  if (route === "/audit/events") {
    return { isPublic: false, roles: ["owner"], unitSource: "query" };
  }
  if (route === "/reports/management/audit") {
    return { isPublic: false, roles: ["owner"], unitSource: "query" };
  }
  if (route === "/reports/management/financial" || route === "/reports/management/summary") {
    return { isPublic: false, roles: ["owner"], unitSource: "query" };
  }
  if (route === "/reports/management/export.csv") {
    return { isPublic: false, roles: ["owner"], unitSource: "query" };
  }
  if (route.startsWith("/reports/management/")) {
    return {
      isPublic: false,
      roles: ["owner"],
      unitSource: "query",
    };
  }

  if (route.startsWith("/integrations/") || route.startsWith("/automations/")) {
    return {
      isPublic: false,
      roles: ["owner"],
      unitSource: method === "GET" ? "query" : "body",
    };
  }
  if (route.startsWith("/retention/scoring/")) {
    return {
      isPublic: false,
      roles: ["owner"],
      unitSource: method === "GET" ? "query" : "body",
    };
  }
  if (route.startsWith("/commissions/")) {
    return { isPublic: false, roles: ["owner"], unitSource: "query" };
  }
  if (route.startsWith("/settings")) {
    return {
      isPublic: false,
      roles: ["owner"],
      unitSource: method === "GET" ? "query" : "body",
    };
  }
  if (route === "/goals/current" || route.startsWith("/performance/")) {
    return {
      isPublic: false,
      roles: ["owner", "recepcao", "profissional"],
      unitSource: "query",
    };
  }
  if (route === "/goals" || route.startsWith("/goals/")) {
    return {
      isPublic: false,
      roles: ["owner"],
      unitSource: method === "GET" ? "query" : "body",
    };
  }
  if (route === "/appointments/:id/checkout") {
    return { isPublic: false, roles: ["owner", "recepcao"] };
  }
  if (route === "/appointments/:id/refund") {
    return { isPublic: false, roles: ["owner", "recepcao"], unitSource: "body" };
  }
  if (
    route === "/appointments/walk-in" ||
    route === "/appointments/fitting" ||
    route === "/appointments/blocks" ||
    route === "/appointments/blocks/:id/cancel" ||
    route === "/appointments/:id/services"
  ) {
    return { isPublic: false, roles: ["owner"], unitSource: "body" };
  }
  if (route === "/appointments/:id/complete") {
    return { isPublic: false, roles: ["owner"] };
  }
  if (route.startsWith("/appointments/:id/")) {
    return { isPublic: false, roles: ["owner", "recepcao", "profissional"] };
  }
  if (route.startsWith("/appointments")) {
    return {
      isPublic: false,
      roles: ["owner", "recepcao", "profissional"],
      unitSource: method === "GET" ? "query" : "body",
    };
  }
  if (route.startsWith("/dashboard/suggestions/")) {
    return { isPublic: false, roles: ["owner", "recepcao", "profissional"], unitSource: "body" };
  }
  if (route === "/financial/commissions/:id/pay") {
    return { isPublic: false, roles: ["owner"], unitSource: "body" };
  }
  if (
    route === "/financial/daily-closing" ||
    route === "/financial/daily-closing/:id/reopen" ||
    route === "/financial/checkout-payments/:id/correct" ||
    route === "/inventory/counts" ||
    route === "/stock/movements/manual"
  ) {
    return { isPublic: false, roles: ["owner"], unitSource: "body" };
  }
  if (route === "/sales/products") {
    return {
      isPublic: false,
      roles: ["owner", "recepcao"],
      unitSource: method === "GET" ? "query" : "body",
    };
  }
  if (route === "/sales/products/:id/refund") {
    return { isPublic: false, roles: ["owner", "recepcao"], unitSource: "body" };
  }
  if (route.startsWith("/financial/")) {
    return {
      isPublic: false,
      roles: ["owner"],
      unitSource: method === "GET" ? "query" : "body",
    };
  }

  const queryRoutes = new Set([
    "/agenda/day",
    "/agenda/range",
    "/dashboard",
    "/goals/current",
    "/performance/summary",
    "/performance/professionals",
    "/performance/services",
    "/financial/summary",
    "/inventory",
    "/financial/entries",
    "/financial/transactions",
    "/financial/commissions",
    "/financial/reports",
    "/financial/management/overview",
    "/stock/overview",
    "/services",
    "/services/:id",
    "/services/summary",
    "/services/:id/stock-consumption",
    "/clients",
    "/clients/overview",
    "/professionals/performance",
    "/loyalty/summary",
    "/loyalty/ledger",
    "/packages",
    "/packages/client-balance",
    "/subscriptions/plans",
    "/subscriptions/overview",
    "/retention/cases",
    "/integrations/webhooks/logs",
  ]);
  if (queryRoutes.has(route)) {
    return { isPublic: false, roles: ["owner", "recepcao", "profissional"], unitSource: "query" };
  }

  return { isPublic: false, roles: ["owner", "recepcao"], unitSource: "body" };
}

function normalizeUserRole(value: unknown): UserRole {
  const role = String(value ?? "").trim().toLowerCase();
  if (role === "owner" || role === "recepcao" || role === "profissional") return role;
  throw new Error("Perfil de usuario invalido");
}

async function countPersistentUsers() {
  try {
    return await prisma.user.count();
  } catch {
    return 0;
  }
}

async function findPersistentAuthUser(email: string): Promise<AuthUser | null> {
  const row = await prisma.user.findUnique({
    where: { email },
    include: {
      unitAccesses: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!row) return null;
  if (!row.isActive) {
    throw new Error("Nao autenticado");
  }

  const userRole = normalizeUserRole(row.role);
  const activeAccesses = row.unitAccesses
    .map((access) => ({
      unitId: access.unitId,
      role: normalizeUserRole(access.role),
    }))
    .filter((access) => access.unitId);
  const unitIds = Array.from(new Set(activeAccesses.map((access) => access.unitId)));
  if (!unitIds.length) throw new Error("Usuario sem unidade ativa");

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
    role: userRole,
    unitIds,
  };
}

async function authenticateLogin(input: {
  backend: string;
  authUsers: AuthUser[];
  email: string;
  password: string;
}) {
  const fallbackUser = input.authUsers.find((item) => item.email === input.email);
  const isProduction = process.env.NODE_ENV === "production";
  if (input.backend === "prisma") {
    try {
      const persistentUser = await findPersistentAuthUser(input.email);
      if (persistentUser) {
        if (!verifyPassword(input.password, persistentUser.passwordHash ?? "")) {
          throw new Error("Nao autenticado");
        }
        return persistentUser;
      }

      if ((await countPersistentUsers()) > 0) {
        if (fallbackUser && process.env.NODE_ENV !== "production") {
          const storedPassword = fallbackUser.passwordHash ?? fallbackUser.password ?? "";
          if (verifyPassword(input.password, storedPassword)) return fallbackUser;
        }
        throw new Error("Nao autenticado");
      }
      if (isProduction) {
        throw new Error("Nao autenticado");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isProduction) {
        throw new Error("Nao autenticado");
      }
      if (
        message === "Nao autenticado" ||
        message.includes("Perfil de usuario invalido") ||
        message.includes("Usuario sem unidade ativa")
      ) {
        throw error;
      }
    }
  }

  const user = fallbackUser;
  if (!user) throw new Error("Nao autenticado");
  const storedPassword = user.passwordHash ?? user.password ?? "";
  if (!verifyPassword(input.password, storedPassword)) {
    throw new Error("Nao autenticado");
  }
  return user;
}

function firebaseUnitId(uid: string) {
  return `unit-fb-${crypto.createHash("sha256").update(uid).digest("hex").slice(0, 20)}`;
}

async function ensureFirebaseAuthUser(input: {
  uid: string;
  email?: string;
  name?: string;
}) {
  const email = String(input.email || `${input.uid}@firebase.local`).trim().toLowerCase();
  const unitId = firebaseUnitId(input.uid);
  const userId = `firebase-${input.uid}`.slice(0, 120);
  const displayName =
    String(input.name || email.split("@")[0] || "Usuario").trim() || "Usuario";

  await prisma.unit.upsert({
    where: { id: unitId },
    update: {},
    create: {
      id: unitId,
      name: displayName,
      timezone: "America/Sao_Paulo",
    },
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      role: "owner",
      isActive: true,
    },
    create: {
      id: userId,
      email,
      passwordHash: hashPassword(crypto.randomUUID()),
      name: displayName,
      role: "owner",
      isActive: true,
    },
    select: { id: true, email: true },
  });

  await prisma.userUnitAccess.upsert({
    where: {
      userId_unitId: {
        userId: user.id,
        unitId,
      },
    },
    update: {
      role: "owner",
      isActive: true,
    },
    create: {
      id: `access-${user.id}-${unitId}`.slice(0, 180),
      userId: user.id,
      unitId,
      role: "owner",
      isActive: true,
    },
  });

  return {
    userId: user.id,
    email: user.email,
    role: "owner" as UserRole,
    unitIds: [unitId],
    activeUnitId: unitId,
    expiresAt: new Date(Date.now() + 8 * 3600_000).toISOString(),
  };
}

async function resolveFirebaseUser(
  uid: string,
  email: string | undefined,
  backend: string,
  name?: string,
): Promise<AuthSession | null> {
  if (backend === "prisma" && email) {
    try {
      const dbUser = await findPersistentAuthUser(email);
      if (dbUser) {
        return {
          userId: dbUser.id,
          email: dbUser.email,
          role: "owner",
          unitIds: dbUser.unitIds,
          activeUnitId: dbUser.unitIds[0],
          expiresAt: new Date(Date.now() + 8 * 3600_000).toISOString(),
        };
      }
    } catch {
      // fall through to per-Firebase-user provisioning
    }
  }

  if (backend === "prisma") {
    return await ensureFirebaseAuthUser({ uid, email, name });
  }

  const activeUnitId = firebaseUnitId(uid);
  return {
    userId: uid,
    email: email ?? "",
    role: "owner",
    unitIds: [activeUnitId],
    activeUnitId,
    expiresAt: new Date(Date.now() + 8 * 3600_000).toISOString(),
  };
}

export function createApp(options: { memoryStore?: InMemoryStore; audioTranscriptionService?: AudioTranscriptionService | null; ownerCommandParser?: OwnerCommandParser | null } = {}) {
  const backend = getDataBackend();
  const authEnforced = isAuthEnforced();
  if (process.env.NODE_ENV === "production") {
    getAuthSecret();
  }
  const authUsers = loadAuthUsers();
  const corsOrigin = getAllowedCorsOrigins();
  const memoryStore = options.memoryStore ?? new InMemoryStore();
  const httpLogEnabled =
    String(
      process.env.HTTP_LOG_ENABLED ??
        (process.env.NODE_ENV === "test" ? "false" : "true"),
    ).toLowerCase() === "true";
  const retentionAiScorer = createGeminiRetentionScorerFromEnv();
  const ownerCommandParser = options.ownerCommandParser === undefined ? createOwnerCommandParserFromEnv() : options.ownerCommandParser;
  const configuredAsrProvider = String(process.env.ASR_PROVIDER ?? process.env.AI_AUDIO_TRANSCRIPTION_PROVIDER ?? "").trim().toLowerCase();
  const audioProviderAllowed = configuredAsrProvider === "local_whisper"
    || (process.env.NODE_ENV === "test" && ["mock", "gemini"].includes(configuredAsrProvider));
  // O gate operacional do WhatsApp e a capacidade geral de ASR precisam estar
  // habilitados. Assim, uma configuracao geral residual nao reativa o recurso
  // experimental no canal WhatsApp.
  const audioTranscriptionEnabled =
    String(process.env.AI_WHATSAPP_AUDIO_ENABLED ?? "").trim().toLowerCase() === "true" &&
    isAudioTranscriptionEnabledFromEnv() &&
    audioProviderAllowed;
  const audioTranscriptionService = audioTranscriptionEnabled
    ? options.audioTranscriptionService === undefined
      ? createAudioTranscriptionServiceFromEnv()
      : options.audioTranscriptionService
    : null;
  const configuredAsrTimeoutMs = configuredAsrProvider === "local_whisper"
    ? 20_000
    : getGeminiAudioTranscriptionTimeoutMsFromEnv();
  const configuredAsrModel = configuredAsrProvider === "local_whisper"
    ? path.basename(process.env.LOCAL_WHISPER_MODEL_PATH?.trim() || "ggml-large-v3-turbo-q5_0.bin")
    : process.env.AI_AUDIO_TRANSCRIPTION_MODEL?.trim() || "gemini-3.5-flash";
  const configuredAsrEndpoint = configuredAsrProvider === "local_whisper" ? "local_process" : GEMINI_AUDIO_TRANSCRIPTION_ENDPOINT;
  const configuredAsrTotalBudgetMs = configuredAsrProvider === "local_whisper"
    ? Math.min(20_000, configuredAsrTimeoutMs)
    : getGeminiAudioTranscriptionTotalBudgetMsFromEnv();
  const operations =
    backend === "prisma"
      ? new PrismaOperationsService(prisma, undefined, retentionAiScorer)
      : new OperationsService(memoryStore, undefined, retentionAiScorer);

  const buildAppointmentBlockEvents = (blocks: Array<{
    id: string;
    unitId: string;
    professionalId?: string | null;
    startsAt: Date;
    endsAt: Date;
    isFullDay: boolean;
    reason: string;
  }>) =>
    blocks.map((block) => ({
      id: block.id,
      unitId: block.unitId,
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      status: "BLOCKED",
      label: block.isFullDay ? "Dia bloqueado" : "Horario bloqueado",
      reason: block.reason,
      isFullDay: block.isFullDay,
      professionalId: block.professionalId ?? null,
      kind: "BLOCK",
    }));

  const getActiveAppointmentBlocksForAgenda = async (input: {
    unitId: string;
    start?: Date;
    end?: Date;
  }) => {
    if (backend === "prisma") {
      return await prisma.appointmentBlock.findMany({
        where: {
          unitId: input.unitId,
          status: "ACTIVE",
          ...(input.start || input.end
            ? {
                startsAt: input.end ? { lte: input.end } : undefined,
                endsAt: input.start ? { gte: input.start } : undefined,
              }
            : {}),
        },
        orderBy: { startsAt: "asc" },
      });
    }
    return memoryStore.appointmentBlocks
      .filter((block) => block.unitId === input.unitId && block.status === "ACTIVE")
      .filter((block) => (!input.start ? true : block.endsAt >= input.start))
      .filter((block) => (!input.end ? true : block.startsAt <= input.end))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  };

  function getAuthenticatedOwnerUnitId(request: FastifyRequest) {
    const unitId = (request as RequestWithAuth).auth?.activeUnitId;
    if (!unitId) {
      throw new Error("Unidade ativa nao encontrada para o usuario autenticado.");
    }
    return unitId;
  }

  const assertOwnerCommandUnitExists = async (unitId: string) => {
    const exists =
      backend === "prisma"
        ? await prisma.unit.findUnique({ where: { id: unitId }, select: { id: true } })
        : memoryStore.units.find((item) => item.id === unitId);
    if (!exists) {
      throw new Error("Unidade ativa nao encontrada para o usuario autenticado.");
    }
  };

  const getOwnerCommandContext = async (input: {
    unitId: string;
    screenContext?: string;
  }) => {
    const [catalog, paymentMethods, unit] = await Promise.all([
      operations.getCatalog({ unitId: input.unitId }),
      backend === "prisma"
        ? prisma.paymentMethod.findMany({
            where: { unitId: input.unitId, isActive: true },
            select: { name: true, isDefault: true },
            orderBy: { name: "asc" },
          })
        : Promise.resolve(
            memoryStore.businessPaymentMethods
              .filter((item) => item.unitId === input.unitId && item.isActive)
              .map((item) => ({ name: item.name, isDefault: item.isDefault })),
          ),
      backend === "prisma"
        ? prisma.unit.findUnique({
            where: { id: input.unitId },
            select: { name: true, timezone: true },
          })
        : Promise.resolve(memoryStore.units.find((item) => item.id === input.unitId) ?? null),
    ]);

    return {
      unitId: input.unitId,
      unitName: unit?.name,
      screenContext: input.screenContext,
      now: new Date(),
      timezone: unit?.timezone ?? "America/Sao_Paulo",
      services: (catalog.services as unknown as Array<Record<string, unknown>>).map((item) => ({
        id: String(item.id ?? ""),
        name: String(item.name ?? ""),
        category: typeof item.category === "string" ? item.category : null,
        price: Number(item.price ?? 0),
        durationMin: Number(item.durationMin ?? 0),
        enabledProfessionalIds: Array.isArray(item.enabledProfessionalIds)
          ? item.enabledProfessionalIds.map(String)
          : undefined,
      })),
      products: (catalog.products as unknown as Array<Record<string, unknown>>).map((item) => ({
        name: String(item.name ?? ""),
        category: typeof item.category === "string" ? item.category : null,
        salePrice: Number(item.salePrice ?? 0),
        stockQty: Number(item.stockQty ?? item.quantity ?? 0),
      })),
      paymentMethods,
      professionals: (catalog.professionals as unknown as Array<Record<string, unknown>>).map((item) => ({
        id: String(item.id ?? ""),
        name: String(item.name ?? ""),
      })),
    };
  };

  const ownerCommandIntentSchema = z.enum([
    "checkout_service",
    "sell_product",
    "product_sale",
    "schedule_appointment",
    "cancel_appointment",
    "report_query",
    "unknown",
  ]);

  type OwnerCommandIntent = z.infer<typeof ownerCommandIntentSchema>;

  type OwnerCommandScheduleDraft = {
    clientName: string;
    serviceNames: string[];
    professionalName?: string;
    date: string;
    time: string;
    notes?: string;
  };

  type OwnerCommandProductSaleDraft = {
    clientName: string | null;
    productName: string;
    quantity: number;
    paymentMethod: string;
    quotedUnitPrice?: number;
    notes?: string;
  };

  type OwnerCommandDraft = OwnerCommandScheduleDraft | OwnerCommandProductSaleDraft;

  type OwnerCommandConfirmationPayload = {
    unitId?: string;
    actorId?: string;
    intent?: string;
    draft?: OwnerCommandDraft;
    exp?: number;
  };

  const unsupportedOwnerCommandExecutionMessage =
    "Execucao desta acao sera liberada em uma proxima etapa.";

  function normalizeMatchText(value: unknown) {
    return String(value ?? "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function getSaoPauloDateTimeParts(value: Date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(value);
    const map = new Map(parts.map((part) => [part.type, part.value]));
    const year = map.get("year");
    const month = map.get("month");
    const day = map.get("day");
    const hour = map.get("hour");
    const minute = map.get("minute");
    return year && month && day && hour && minute
      ? { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` }
      : { date: "", time: "" };
  }

  function getDraftString(draft: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = draft[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  }

  function getDraftStringArray(draft: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = draft[key];
      if (Array.isArray(value)) {
        const items = value.map((item) => String(item ?? "").trim()).filter(Boolean);
        if (items.length) return items;
      }
      if (typeof value === "string" && value.trim()) return [value.trim()];
    }
    return [];
  }

  function getDraftNumber(draft: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = draft[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim()) {
        const raw = value.trim();
        const normalized = raw.includes(",")
          ? raw.replace(/\./g, "").replace(",", ".")
          : raw;
        const parsed = Number(normalized);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return undefined;
  }

  function normalizeOwnerScheduleDraft(rawDraft: Record<string, unknown>) {
    const startsAt = getDraftString(rawDraft, ["startsAt", "startAt", "datetime", "dateTime"]);
    const startsAtDate = startsAt ? new Date(startsAt) : null;
    const startsAtParts =
      startsAtDate && !Number.isNaN(startsAtDate.getTime())
        ? getSaoPauloDateTimeParts(startsAtDate)
        : { date: "", time: "" };
    const draft: Partial<OwnerCommandScheduleDraft> = {
      clientName: getDraftString(rawDraft, ["clientName", "client", "cliente"]),
      serviceNames: getDraftStringArray(rawDraft, [
        "serviceNames",
        "services",
        "serviceName",
        "servicos",
        "servico",
      ]),
      professionalName: getDraftString(rawDraft, [
        "professionalName",
        "professional",
        "barberName",
        "barber",
        "profissional",
      ]),
      date: getDraftString(rawDraft, ["date", "data"]) || startsAtParts.date,
      time: getDraftString(rawDraft, ["time", "horario", "hour"]) || startsAtParts.time,
      notes: getDraftString(rawDraft, ["notes", "observations", "observacoes"]),
    };

    const missingFields: string[] = [];
    if (!draft.clientName) missingFields.push("clientName");
    if (!draft.serviceNames?.length) missingFields.push("serviceNames");
    if (!draft.date) missingFields.push("date");
    if (!draft.time) missingFields.push("time");
    if (draft.date && !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) missingFields.push("date");
    if (draft.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) missingFields.push("time");

    return {
      draft: {
        clientName: draft.clientName ?? "",
        serviceNames: draft.serviceNames ?? [],
        professionalName: draft.professionalName || undefined,
        date: draft.date ?? "",
        time: draft.time ?? "",
        notes: draft.notes || undefined,
      },
      missingFields: Array.from(new Set(missingFields)),
    };
  }

  function normalizeOwnerProductSaleDraft(rawDraft: Record<string, unknown>) {
    const quantity = getDraftNumber(rawDraft, ["quantity", "qty", "quantidade"]) ?? 1;
    const quotedUnitPrice = getDraftNumber(rawDraft, [
      "quotedUnitPrice",
      "unitPrice",
      "price",
      "valorUnitario",
      "valor",
      "total",
    ]);
    const draft: Partial<OwnerCommandProductSaleDraft> = {
      clientName: getDraftString(rawDraft, ["clientName", "client", "cliente"]),
      productName: getDraftString(rawDraft, ["productName", "product", "produto"]),
      quantity,
      paymentMethod: getDraftString(rawDraft, ["paymentMethod", "payment", "metodoPagamento", "pagamento"]),
      quotedUnitPrice,
      notes: getDraftString(rawDraft, ["notes", "observations", "observacoes"]),
    };

    const missingFields: string[] = [];
    if (!draft.productName) missingFields.push("productName");
    if (!Number.isInteger(draft.quantity) || Number(draft.quantity) < 1 || Number(draft.quantity) > 99) {
      missingFields.push("quantity");
    }
    if (!draft.paymentMethod) missingFields.push("paymentMethod");
    if (draft.quotedUnitPrice !== undefined && (!Number.isFinite(draft.quotedUnitPrice) || draft.quotedUnitPrice < 0)) {
      missingFields.push("quotedUnitPrice");
    }

    return {
      draft: {
        clientName: draft.clientName || null,
        productName: draft.productName ?? "",
        quantity: Number.isInteger(draft.quantity) ? Number(draft.quantity) : 0,
        paymentMethod: draft.paymentMethod ?? "",
        quotedUnitPrice: draft.quotedUnitPrice,
        notes: draft.notes || undefined,
      },
      missingFields: Array.from(new Set(missingFields)),
    };
  }

  function buildOwnerCommandConfirmationToken(input: {
    unitId: string;
    actorId?: string;
    intent: OwnerCommandIntent;
    draft: OwnerCommandDraft;
  }) {
    const payload = {
      unitId: input.unitId,
      actorId: input.actorId ?? "anonymous",
      intent: input.intent,
      draft: input.draft,
      exp: Math.floor(Date.now() / 1000) + 15 * 60,
    };
    return `${toBase64UrlJson(payload)}.${signOwnerCommandConfirmation(payload)}`;
  }

  function verifyOwnerCommandConfirmationToken(input: {
    token?: string;
    unitId: string;
    actorId?: string;
    intent: OwnerCommandIntent;
    draft: OwnerCommandDraft;
  }) {
    const token = String(input.token ?? "").trim();
    if (!token) throw new Error("Confirmacao invalida. Gere uma nova previa antes de executar.");
    const [payloadSegment, signature] = token.split(".");
    if (!payloadSegment || !signature) {
      throw new Error("Confirmacao invalida. Gere uma nova previa antes de executar.");
    }
    let payload: OwnerCommandConfirmationPayload;
    try {
      payload = fromBase64UrlJson(payloadSegment) as OwnerCommandConfirmationPayload;
    } catch {
      throw new Error("Confirmacao invalida. Gere uma nova previa antes de executar.");
    }
    const expectedSignature = signOwnerCommandConfirmation(payload);
    const expected = Buffer.from(expectedSignature, "base64url");
    const incoming = Buffer.from(signature, "base64url");
    if (expected.length !== incoming.length || !crypto.timingSafeEqual(expected, incoming)) {
      throw new Error("Confirmacao invalida. Gere uma nova previa antes de executar.");
    }
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new Error("Confirmacao expirada. Gere uma nova previa antes de executar.");
    }
    const expectedPayload = {
      unitId: input.unitId,
      actorId: input.actorId ?? "anonymous",
      intent: input.intent,
      draft: input.draft,
      exp: payload.exp,
    };
    if (stableJson(payload) !== stableJson(expectedPayload)) {
      throw new Error("Confirmacao invalida. Gere uma nova previa antes de executar.");
    }
  }

  function findUniqueByName<T extends Record<string, unknown>>(
    rows: T[],
    getName: (item: T) => unknown,
    name: string,
  ) {
    const needle = normalizeMatchText(name);
    if (!needle) return null;
    const exact = rows.filter((item) => normalizeMatchText(getName(item)) === needle);
    if (exact.length === 1) return exact[0];
    const partial = rows.filter((item) => {
      const haystack = normalizeMatchText(getName(item));
      return haystack.includes(needle) || needle.includes(haystack);
    });
    return partial.length === 1 ? partial[0] : null;
  }

  function resolveWhatsappEntity<T extends Record<string, unknown>>(input: {
    entity: AiWhatsappEntityKind;
    rows: T[];
    getName: (item: T) => unknown;
    name: string;
    allowAliases?: boolean;
  }) {
    return resolveAiWhatsappEntity({
      ...input,
      aliases: input.allowAliases === false ? [] : undefined,
    });
  }

  function getWhatsappEntityResolutionDiagnostic(entity: string, resolved?: { status: string; candidates: unknown[] } | null) {
    const status = resolved?.status ?? "NOT_EVALUATED";
    const result = status === "EXPLICIT_ALIAS_MATCH"
      ? "ENTITY_ALIAS"
      : status === "EXACT_MATCH" || status === "UNIQUE_NORMALIZED_MATCH"
        ? "ENTITY_EXACT"
        : status === "AMBIGUOUS" || status === "PARTIAL_MATCH"
          ? "ENTITY_AMBIGUOUS"
          : "ENTITY_NOT_FOUND";
    return { entity, result, candidateCount: resolved?.candidates.length ?? 0 };
  }

  function getWhatsappClientResolutionDiagnostic(resolved?: {
    status: "EXACT_MATCH" | "NOT_FOUND_NEW_CLIENT" | "AMBIGUOUS_MATCH";
    sourceStatus: string;
    candidates: unknown[];
  } | null) {
    return {
      entity: "client",
      result: resolved?.status ?? "NOT_FOUND_NEW_CLIENT",
      candidateCount: resolved?.candidates.length ?? 0,
      sourceStatus: resolved?.sourceStatus ?? "NOT_FOUND",
    };
  }

  async function resolveOwnerCommandSchedule(input: {
    unitId: string;
    draft: OwnerCommandScheduleDraft;
    strictWhatsappEntities?: boolean;
    allowNewClient?: boolean;
  }) {
    const catalog = await operations.getCatalog({ unitId: input.unitId });
    const clients = catalog.clients as unknown as Array<Record<string, unknown>>;
    const services = catalog.services as unknown as Array<Record<string, unknown>>;
    const professionals = catalog.professionals as unknown as Array<Record<string, unknown>>;
    const missingFields: string[] = [];
    const warnings: string[] = [];

    const whatsappClient = input.strictWhatsappEntities
      ? resolveAiWhatsappClient({ rows: clients, getName: (item) => item.fullName ?? item.name, name: input.draft.clientName })
      : null;
    const client = input.strictWhatsappEntities ? whatsappClient?.match ?? null : findUniqueByName(
      clients,
      (item) => item.fullName ?? item.name,
      input.draft.clientName,
    );
    if (input.strictWhatsappEntities && whatsappClient?.status === "AMBIGUOUS_MATCH") {
      missingFields.push("clientName");
      warnings.push("Ha mais de um cliente semelhante. Informe qual cliente correto.");
    } else if (input.strictWhatsappEntities && whatsappClient?.status === "NOT_FOUND_NEW_CLIENT" && !input.allowNewClient) {
      missingFields.push("clientName");
      warnings.push("Nome de cliente novo sem confianca semantica suficiente. Informe somente o nome completo.");
    } else if (!client) {
      warnings.push("Cliente novo ou não encontrado. Ele será criado somente se o owner confirmar.");
    }

    const serviceIds = input.draft.serviceNames
      .map((name) => {
        const whatsappService = input.strictWhatsappEntities
          ? resolveWhatsappEntity({ entity: "service", rows: services, getName: (item) => item.name, name })
          : null;
        const service = input.strictWhatsappEntities ? whatsappService?.match ?? null : findUniqueByName(services, (item) => item.name, name);
        if (!service || (whatsappService && !isAiWhatsappResolvedEntityStatus(whatsappService.status))) {
          warnings.push("Servico nao encontrado, ambiguo ou sem alias autorizado. Informe o nome exato.");
          return "";
        }
        return String(service.id ?? "");
      })
      .filter(Boolean);
    if (serviceIds.length !== input.draft.serviceNames.length) missingFields.push("serviceNames");

    const whatsappProfessional = input.strictWhatsappEntities && input.draft.professionalName
      ? resolveWhatsappEntity({ entity: "professional", rows: professionals, getName: (item) => item.name, name: input.draft.professionalName, allowAliases: false })
      : null;
    let professional = input.draft.professionalName
      ? input.strictWhatsappEntities ? whatsappProfessional?.match ?? null : findUniqueByName(professionals, (item) => item.name, input.draft.professionalName)
      : null;
    if (!professional || (whatsappProfessional && !isAiWhatsappResolvedEntityStatus(whatsappProfessional.status))) {
      missingFields.push("professionalName");
      warnings.push("Profissional nao encontrado ou ambiguo. Informe o nome exato.");
    }

    const startsAt = new Date(`${input.draft.date}T${input.draft.time}:00.000-03:00`);
    if (Number.isNaN(startsAt.getTime())) missingFields.push("date");

    if (
      professional
      && serviceIds.length === input.draft.serviceNames.length
      && !Number.isNaN(startsAt.getTime())
    ) {
      const servicesPreview = await operations.previewAppointmentServices({
        unitId: input.unitId,
        serviceIds,
      });
      const professionalId = String(professional.id ?? "");
      const eligibleProfessionalIds = Array.isArray(servicesPreview.eligibleProfessionalIds)
        ? servicesPreview.eligibleProfessionalIds.map(String)
        : [];
      const durationMin = Number(servicesPreview.effectiveDurationMin ?? 0);
      const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
      const bufferAfterMin = await resolvePublicBufferAfterMin(input.unitId);
      const workingHours = await resolveWorkingHoursForUnit(input.unitId, operations);
      const busySlots = await getPublicBusySlots(
        input.unitId,
        [professionalId],
        startsAt,
        endsAt,
        bufferAfterMin,
      );
      const unavailable = startsAt.getTime() <= Date.now()
        || !Number.isFinite(durationMin)
        || durationMin <= 0
        || !eligibleProfessionalIds.includes(professionalId)
        || !isWithinWorkingHours(startsAt, endsAt, workingHours)
        || !isProfessionalAvailableFromBusySlots(professionalId, startsAt, endsAt, busySlots, bufferAfterMin);
      if (unavailable) {
        missingFields.push("availability");
        warnings.push("Horario indisponivel para o profissional e os servicos informados.");
      }
    }

    return {
      missingFields: Array.from(new Set(missingFields)),
      warnings,
      entityResolutionDiagnostics: input.strictWhatsappEntities
        ? [
            getWhatsappClientResolutionDiagnostic(whatsappClient),
            getWhatsappEntityResolutionDiagnostic("professional", whatsappProfessional),
          ]
        : [],
      schedule: professional && serviceIds.length === input.draft.serviceNames.length
        ? {
            clientId: client ? String(client.id ?? "") : "",
            clientName: String(client?.fullName ?? client?.name ?? input.draft.clientName),
            professionalId: String(professional.id ?? ""),
            serviceIds,
            startsAt,
            professionalName: String(professional.name ?? input.draft.professionalName ?? ""),
          }
        : null,
    };
  }

  async function resolveIncompleteWhatsappScheduleClient(input: {
    unitId: string;
    draft: OwnerCommandScheduleDraft;
    allowNewClient: boolean;
  }) {
    const catalog = await operations.getCatalog({ unitId: input.unitId });
    const clients = catalog.clients as unknown as Array<Record<string, unknown>>;
    const resolved = resolveAiWhatsappClient({
      rows: clients,
      getName: (item) => item.fullName ?? item.name,
      name: input.draft.clientName,
    });
    const missingFields: string[] = [];
    const warnings: string[] = [];
    if (!input.draft.clientName || resolved.status === "AMBIGUOUS_MATCH") {
      missingFields.push("clientName");
      if (input.draft.clientName) warnings.push("Ha mais de um cliente semelhante. Informe qual cliente correto.");
    } else if (resolved.status === "NOT_FOUND_NEW_CLIENT" && !input.allowNewClient) {
      missingFields.push("clientName");
      warnings.push("Nome de cliente novo sem confianca suficiente. Informe somente o nome completo.");
    }
    return {
      missingFields,
      warnings,
      entityResolutionDiagnostics: [getWhatsappClientResolutionDiagnostic(resolved)],
      schedule: null,
    };
  }

  async function getOwnerCommandClients(unitId: string) {
    if (backend === "prisma") {
      return await prisma.client.findMany({
        where: { businessId: unitId },
        select: { id: true, fullName: true },
      });
    }
    return memoryStore.clients
      .filter((item) => (item.businessId ?? "unit-01") === unitId)
      .map((item) => ({ id: item.id, fullName: item.fullName }));
  }

  async function ensureOwnerCommandClient(input: { unitId: string; clientName: string; strictWhatsappEntities?: boolean }) {
    const normalizedName = normalizeMatchText(input.clientName);
    if (!normalizedName) throw new Error("Cliente obrigatorio para confirmar agendamento.");
    const clients = await getOwnerCommandClients(input.unitId);
    if (input.strictWhatsappEntities) {
      const resolved = resolveAiWhatsappClient({
        rows: clients,
        getName: (item) => item.fullName,
        name: input.clientName,
      });
      if (resolved.status === "EXACT_MATCH" && resolved.match) return resolved.match.id;
      if (resolved.status === "AMBIGUOUS_MATCH") {
        throw new Error("Cliente ambiguo. Gere uma nova previa com o nome completo.");
      }
    }
    const exact = clients.filter((item) => normalizeMatchText(item.fullName) === normalizedName);
    if (exact.length === 1) return exact[0].id;
    if (exact.length > 1) throw new Error("Cliente ambiguo. Revise a previa antes de confirmar.");

    const partial = clients.filter((item) => {
      const haystack = normalizeMatchText(item.fullName);
      return haystack.includes(normalizedName) || normalizedName.includes(haystack);
    });
    if (partial.length === 1) return partial[0].id;
    if (partial.length > 1) throw new Error("Cliente ambiguo. Revise a previa antes de confirmar.");

    const id = crypto.randomUUID();
    if (backend === "prisma") {
      const created = await prisma.client.create({
        data: {
          id,
          businessId: input.unitId,
          fullName: input.clientName,
          tags: ["NEW"],
        },
        select: { id: true },
      });
      return created.id;
    }
    const created: Client = {
      id,
      businessId: input.unitId,
      fullName: input.clientName,
      tags: ["NEW"],
    };
    memoryStore.clients.push(created);
    return created.id;
  }

  async function resolveOwnerCommandProductSale(input: {
    unitId: string;
    draft: OwnerCommandProductSaleDraft;
    strictWhatsappEntities?: boolean;
  }) {
    const [catalog, paymentMethods] = await Promise.all([
      operations.getCatalog({ unitId: input.unitId }),
      backend === "prisma"
        ? prisma.paymentMethod.findMany({
            where: { unitId: input.unitId, isActive: true },
            select: { name: true },
          })
        : Promise.resolve(
            memoryStore.businessPaymentMethods
              .filter((item) => item.unitId === input.unitId && item.isActive)
              .map((item) => ({ name: item.name })),
          ),
    ]);
    const clients = catalog.clients as unknown as Array<Record<string, unknown>>;
    const products = catalog.products as unknown as Array<Record<string, unknown>>;
    const missingFields: string[] = [];
    const warnings: string[] = [];
    const requestedClientName = String(input.draft.clientName ?? "").trim();
    const hasRequestedClient = Boolean(requestedClientName);

    const whatsappClient = input.strictWhatsappEntities && hasRequestedClient
      ? resolveAiWhatsappClient({ rows: clients, getName: (item) => item.fullName ?? item.name, name: requestedClientName })
      : null;
    const client = hasRequestedClient
      ? input.strictWhatsappEntities ? whatsappClient?.match ?? null : findUniqueByName(
          clients,
          (item) => item.fullName ?? item.name,
          requestedClientName,
        )
      : null;
    if (input.strictWhatsappEntities && whatsappClient?.status === "AMBIGUOUS_MATCH") {
      missingFields.push("clientName");
      warnings.push("Ha mais de um cliente semelhante. Informe qual cliente correto.");
    } else if (input.strictWhatsappEntities && whatsappClient?.status === "NOT_FOUND_NEW_CLIENT") {
      missingFields.push("clientName");
      warnings.push("Cliente nao encontrado. Informe o nome exato de um cliente cadastrado ou remova o cliente da venda avulsa.");
    } else if (hasRequestedClient && !client) {
      warnings.push("Cliente novo ou não encontrado. Ele será criado somente se o owner confirmar.");
    }

    const whatsappProduct = input.strictWhatsappEntities
      ? resolveWhatsappEntity({ entity: "product", rows: products, getName: (item) => item.name, name: input.draft.productName })
      : null;
    const product = input.strictWhatsappEntities ? whatsappProduct?.match ?? null : findUniqueByName(products, (item) => item.name, input.draft.productName);
    if (!product || (whatsappProduct && !isAiWhatsappResolvedEntityStatus(whatsappProduct.status))) {
      missingFields.push("productName");
      warnings.push("Produto nao encontrado, ambiguo ou sem alias autorizado. Informe o nome exato.");
    }

    const quantity = Math.trunc(Number(input.draft.quantity));
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      missingFields.push("quantity");
      warnings.push("Quantidade invalida para venda de produto.");
    }

    const whatsappPayment = input.strictWhatsappEntities
      ? resolveWhatsappEntity({ entity: "payment", rows: paymentMethods, getName: (item) => item.name, name: input.draft.paymentMethod })
      : null;
    const paymentMethod = input.strictWhatsappEntities ? whatsappPayment?.match ?? null : findUniqueByName(paymentMethods, (item) => item.name, input.draft.paymentMethod);
    if (!paymentMethod || (whatsappPayment && !isAiWhatsappResolvedEntityStatus(whatsappPayment.status))) {
      missingFields.push("paymentMethod");
      warnings.push("Metodo de pagamento nao encontrado, ambiguo ou sem alias autorizado.");
    }

    const stockQty = Number(product?.stockQty ?? product?.quantity ?? 0);
    if (product && quantity > 0 && stockQty < quantity) {
      missingFields.push("quantity");
      warnings.push("Estoque insuficiente para venda de produto.");
    }

    const officialUnitPrice = Number(product?.salePrice ?? 0);
    if (product && input.draft.quotedUnitPrice !== undefined) {
      const quoted = Number(input.draft.quotedUnitPrice);
      if (!Number.isFinite(quoted) || quoted < 0) {
        missingFields.push("quotedUnitPrice");
        warnings.push("Valor informado invalido.");
      } else if (Math.abs(quoted - officialUnitPrice) >= 0.01) {
        warnings.push(
          `Valor informado (${quoted.toFixed(2)}) diverge do preco oficial (${officialUnitPrice.toFixed(2)}). A venda usara o preco oficial.`,
        );
      }
    }

    return {
      missingFields: Array.from(new Set(missingFields)),
      warnings,
      entityResolutionDiagnostics: input.strictWhatsappEntities
        ? [
            ...(hasRequestedClient ? [getWhatsappClientResolutionDiagnostic(whatsappClient)] : []),
            getWhatsappEntityResolutionDiagnostic("product", whatsappProduct),
            getWhatsappEntityResolutionDiagnostic("payment", whatsappPayment),
          ]
        : [],
      sale: product && paymentMethod && quantity > 0 && stockQty >= quantity
        ? {
            clientId: client ? String(client.id ?? "") : undefined,
            clientName: hasRequestedClient
              ? String(client?.fullName ?? client?.name ?? requestedClientName)
              : null,
            productId: String(product.id ?? ""),
            productName: String(product.name ?? input.draft.productName),
            quantity,
            paymentMethod: String(paymentMethod.name ?? input.draft.paymentMethod),
            unitPrice: officialUnitPrice,
            total: Number((officialUnitPrice * quantity).toFixed(2)),
            stockQty,
          }
        : null,
    };
  }

  function buildOwnerCommandExecutionIdempotencyKey(input: {
    intent: OwnerCommandIntent;
    token?: string;
  }) {
    const digest = crypto
      .createHash("sha256")
      .update(String(input.token ?? ""))
      .digest("base64url")
      .slice(0, 64);
    return `ai-owner-${input.intent}-${digest}`;
  }

  type OwnerCommandPreviewResponse = OwnerCommandParseResult & {
    sale?: Record<string, unknown>;
    confirmationToken?: string;
    confirmationMessage?: string;
    executionMessage?: string;
    parserDiagnostics?: {
      strategy: "deterministic" | "gemini" | "local_llama" | "deterministic_after_gemini_failure" | "deterministic_after_local_llama_failure";
      status: OwnerCommandParserStatus;
      deterministicDurationMs?: number;
      geminiDurationMs?: number;
      providerDurationMs?: number;
      httpStatus?: number;
      failureCode?: string;
      dateRecognitionType?: string;
      presentFields: string[];
      missingFields: string[];
      correlationId?: string;
      fieldDiagnostics?: OwnerCommandParseResult["fieldDiagnostics"];
      providerAttempts?: ProviderAttemptDiagnostic[];
      model?: string;
      fallbackUsed?: boolean;
    };
    entityResolutionDiagnostics?: Array<{ entity: string; result: string; candidateCount: number; sourceStatus?: string }>;
  };

  type AiWhatsappPendingCommand = {
    id: string;
    code: string;
    phone: string;
    unitId: string;
    actorId: string;
    commandContext: AiWhatsappCommandContext;
    intent: OwnerCommandIntent;
    draft: OwnerCommandDraft;
    confirmationToken: string;
    expiresAt: number;
    used: boolean;
  };

  type AiWhatsappClarificationContext = {
    unitId: string;
    phone: string;
    intent: "schedule_appointment";
    draft: Record<string, unknown>;
    missingFields: string[];
    fieldDiagnostics?: OwnerCommandParseResult["fieldDiagnostics"];
    pendingField?: "clientName" | "serviceNames" | "professionalName" | "date" | "time";
    proposedValue?: string;
    originCorrelationId: string;
    commandContext: AiWhatsappCommandContext;
    expiresAt: number;
  };

  type AiWhatsappCommandContext = {
    actorId: string;
    actorRole: "owner";
    unitId: string;
    phoneFingerprint: string;
    correlationId: string;
    messageIdFingerprint: string;
    origin: "whatsapp_webhook";
  };

  class AiWhatsappIdentityError extends Error {
    constructor(public readonly reason: "missing_unit_configuration" | "unit_not_found" | "owner_access_missing" | "owner_access_ambiguous") {
      super(reason);
      this.name = "AiWhatsappIdentityError";
    }
  }

  type EvolutionWhatsappAudio = {
    mimetype: string;
    declaredSize?: number;
    durationSeconds?: number;
    messageId: string;
    source: Record<string, unknown>;
  };

  class EvolutionAudioError extends Error {
    constructor(public readonly reason: "missing_media" | "invalid_media" | "media_too_large" | "media_too_long" | "download_failed" | "download_timeout") {
      super(reason);
      this.name = "EvolutionAudioError";
    }
  }

  const aiWhatsappPendingCommands = new Map<string, AiWhatsappPendingCommand>();
  const aiWhatsappClarificationContexts = new Map<string, AiWhatsappClarificationContext>();
  const aiWhatsappProcessedWebhookMessages = new Map<string, number>();
  const aiWhatsappAllowedIntents = new Set<OwnerCommandIntent>(["schedule_appointment", "sell_product"]);

  async function resolveAiWhatsappCommandContext(input: {
    senderPhone: string;
    expectedOwnerPhone: string;
    correlationId: string;
    messageId?: string;
  }): Promise<AiWhatsappCommandContext> {
    if (!input.expectedOwnerPhone || input.senderPhone !== input.expectedOwnerPhone) {
      throw new AiWhatsappIdentityError("owner_access_missing");
    }
    const configuredUnitId = String(process.env.AI_WHATSAPP_UNIT_ID ?? "").trim();
    if (!configuredUnitId) throw new AiWhatsappIdentityError("missing_unit_configuration");

    const unitExists = backend === "prisma"
      ? Boolean(await prisma.unit.findUnique({ where: { id: configuredUnitId }, select: { id: true } }))
      : memoryStore.units.some((unit) => unit.id === configuredUnitId);
    if (!unitExists) throw new AiWhatsappIdentityError("unit_not_found");

    const owners = backend === "prisma"
      ? (await prisma.userUnitAccess.findMany({
          where: {
            unitId: configuredUnitId,
            isActive: true,
            role: "owner",
            user: { isActive: true, role: "owner" },
          },
          select: { userId: true },
          take: 2,
        })).map((access) => access.userId)
      : authUsers
          .filter((user) => user.role === "owner" && user.unitIds.includes(configuredUnitId))
          .map((user) => user.id);
    const uniqueOwners = [...new Set(owners)];
    if (!uniqueOwners.length) throw new AiWhatsappIdentityError("owner_access_missing");
    if (uniqueOwners.length !== 1) throw new AiWhatsappIdentityError("owner_access_ambiguous");

    return {
      actorId: uniqueOwners[0],
      actorRole: "owner",
      unitId: configuredUnitId,
      phoneFingerprint: crypto.createHash("sha256").update(input.senderPhone).digest("hex").slice(0, 12),
      correlationId: input.correlationId,
      messageIdFingerprint: crypto.createHash("sha256").update(input.messageId || input.correlationId).digest("hex").slice(0, 12),
      origin: "whatsapp_webhook",
    };
  }

  function getAiWhatsappTtlMs() {
    const configured = Number(process.env.AI_WHATSAPP_PENDING_TTL_MS ?? 10 * 60 * 1000);
    return Number.isFinite(configured) && configured > 0 ? configured : 10 * 60 * 1000;
  }

  function getAiWhatsappWebhookDedupTtlMs() {
    const configured = Number(process.env.AI_WHATSAPP_WEBHOOK_DEDUP_TTL_MS ?? 7 * 24 * 60 * 60 * 1000);
    return Number.isFinite(configured) && configured > 0 ? configured : 7 * 24 * 60 * 60 * 1000;
  }

  function normalizePhoneDigits(value: unknown) {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (!digits) return "";
    return digits.startsWith("55") ? digits : `55${digits}`;
  }

  function maskPhone(value: unknown) {
    const digits = normalizePhoneDigits(value);
    if (digits.length <= 4) return "****";
    return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
  }

  function safeHeaderValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
  }

  function isAiWhatsappEnabled() {
    return String(process.env.AI_WHATSAPP_ENABLED ?? "").trim().toLowerCase() === "true";
  }

  function validateEvolutionWebhookSecret(request: FastifyRequest) {
    const secret = String(process.env.EVOLUTION_WEBHOOK_SECRET ?? "").trim();
    if (!isAiWhatsappEnabled() || !secret) return false;
    const headerSecret =
      safeHeaderValue(request.headers["x-evolution-webhook-secret"]) ??
      safeHeaderValue(request.headers["x-webhook-secret"]);
    const authorization = safeHeaderValue(request.headers.authorization);
    const bearerSecret = authorization?.toLowerCase().startsWith("bearer ")
      ? authorization.slice(7).trim()
      : undefined;
    const incoming = String(headerSecret ?? bearerSecret ?? "").trim();
    if (!incoming) return false;
    const expected = Buffer.from(secret);
    const received = Buffer.from(incoming);
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  }

  function getRecordValue(record: Record<string, unknown> | null, path: string[]) {
    let current: unknown = record;
    for (const key of path) {
      if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }

  function getFirstString(record: Record<string, unknown> | null, paths: string[][]) {
    for (const path of paths) {
      const value = getRecordValue(record, path);
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
    return "";
  }

  function getFirstFiniteNumber(record: Record<string, unknown> | null, paths: string[][]) {
    for (const path of paths) {
      const value = getRecordValue(record, path);
      const parsed = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    return undefined;
  }

  function extractEvolutionWhatsappIdentity(body: Record<string, unknown> | null) {
    const data = asRecord(body?.data);
    const key = asRecord(data?.key);
    const chatJid = getFirstString(body, [["data", "key", "remoteJid"], ["key", "remoteJid"], ["remoteJid"]]);
    const remoteJidAlt = getFirstString(body, [["data", "key", "remoteJidAlt"], ["key", "remoteJidAlt"], ["remoteJidAlt"]]);
    const senderLid = chatJid.endsWith("@lid") ? chatJid : "";
    const senderPhoneJid = senderLid
      ? (remoteJidAlt.endsWith("@s.whatsapp.net") ? remoteJidAlt : "")
      : (chatJid.endsWith("@s.whatsapp.net") ? chatJid : "");
    const senderPhone = senderPhoneJid ? normalizePhoneDigits(senderPhoneJid.slice(0, -"@s.whatsapp.net".length)) : "";

    return {
      chatJid,
      senderPhone,
      senderLid,
      fromMe: Boolean(key?.fromMe ?? data?.fromMe ?? body?.fromMe),
      replyTarget: senderPhone,
    };
  }

  function isSupportedWhatsappAudioMimetype(mimetype: string) {
    return /^(audio\/(?:ogg|opus|mpeg|mp3|mp4|m4a|aac|webm|wav|x-wav))(?:;|$)/i.test(mimetype.trim());
  }

  function getAiWhatsappAudioMaxBytes() {
    const configured = Number(process.env.AI_AUDIO_MAX_BYTES ?? process.env.AI_WHATSAPP_AUDIO_MAX_BYTES ?? 8 * 1024 * 1024);
    return Number.isFinite(configured) && configured > 0 ? Math.trunc(configured) : 8 * 1024 * 1024;
  }

  function getAiWhatsappAudioMaxDurationSeconds() {
    const configured = Number(process.env.AI_AUDIO_MAX_DURATION_SECONDS ?? process.env.AI_WHATSAPP_AUDIO_MAX_DURATION_SECONDS ?? 120);
    return Number.isFinite(configured) && configured > 0 ? configured : 120;
  }

  function getAiWhatsappAudioDownloadTimeoutMs() {
    const configured = Number(process.env.AI_WHATSAPP_AUDIO_DOWNLOAD_TIMEOUT_MS ?? 8000);
    return Number.isFinite(configured) && configured > 0 ? Math.trunc(configured) : 8000;
  }

  function buildAiWhatsappAudioReplayKey(phone: string, messageId: string) {
    return crypto.createHash("sha256").update(`${normalizePhoneDigits(phone)}:${messageId}`).digest("base64url");
  }

  function buildAiWhatsappWebhookReplayKey(input: {
    instance: string;
    senderPhone: string;
    messageId: string;
    eventId: string;
  }) {
    const source = input.messageId ? `message:${input.messageId}` : `event:${input.eventId}`;
    return crypto
      .createHash("sha256")
      .update(`${input.instance}:${normalizePhoneDigits(input.senderPhone)}:${source}`)
      .digest("base64url");
  }

  async function downloadEvolutionWhatsappAudio(input: { instance: string; audio: EvolutionWhatsappAudio }) {
    if (!input.instance || !input.audio.messageId || !input.audio.source) {
      throw new EvolutionAudioError("missing_media");
    }
    if (!isSupportedWhatsappAudioMimetype(input.audio.mimetype)) {
      throw new EvolutionAudioError("invalid_media");
    }
    if ((input.audio.declaredSize ?? 0) > getAiWhatsappAudioMaxBytes()) {
      throw new EvolutionAudioError("media_too_large");
    }
    if ((input.audio.durationSeconds ?? 0) > getAiWhatsappAudioMaxDurationSeconds()) {
      throw new EvolutionAudioError("media_too_long");
    }

    const baseUrl = String(process.env.EVOLUTION_API_URL ?? "").replace(/\/+$/, "");
    const apiKey = String(process.env.EVOLUTION_API_KEY ?? "").trim();
    if (!baseUrl || !apiKey) throw new EvolutionAudioError("download_failed");
    const configuredUrl = String(process.env.EVOLUTION_MEDIA_DOWNLOAD_URL ?? "").trim();
    const url = configuredUrl || `${baseUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(input.instance)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getAiWhatsappAudioDownloadTimeoutMs());
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: apiKey },
        body: JSON.stringify({ message: input.audio.source, convertToMp4: false }),
        signal: controller.signal,
      });
      if (!response.ok) throw new EvolutionAudioError("download_failed");
      const maxEncodedBytes = Math.ceil((getAiWhatsappAudioMaxBytes() * 4) / 3) + 4;
      const contentLength = Number(response.headers?.get("content-length") ?? 0);
      if (Number.isFinite(contentLength) && contentLength > maxEncodedBytes) throw new EvolutionAudioError("media_too_large");
      const payload = asRecord(await response.json());
      const encoded = getFirstString(payload, [["base64"], ["data", "base64"], ["media", "base64"]])
        .replace(/^data:[^;]+;base64,/i, "")
        .replace(/\s/g, "");
      if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new EvolutionAudioError("download_failed");
      if (encoded.length > maxEncodedBytes) throw new EvolutionAudioError("media_too_large");
      const audio = Buffer.from(encoded, "base64");
      if (!audio.length) throw new EvolutionAudioError("download_failed");
      if (audio.length > getAiWhatsappAudioMaxBytes()) throw new EvolutionAudioError("media_too_large");
      return audio;
    } catch (error) {
      if (error instanceof EvolutionAudioError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new EvolutionAudioError("download_timeout");
      throw new EvolutionAudioError("download_failed");
    } finally {
      clearTimeout(timeout);
    }
  }

  function extractEvolutionWhatsappMessage(payload: unknown) {
    const body = asRecord(payload);
    const data = asRecord(body?.data);
    const message = asRecord(data?.message);
    const identity = extractEvolutionWhatsappIdentity(body);
    const instance = getFirstString(body, [["instance"], ["instanceName"], ["data", "instance"], ["data", "instanceName"]]);
    const messageId = getFirstString(body, [["data", "key", "id"], ["data", "key", "messageId"], ["messageId"], ["id"]]);
    const eventId = getFirstString(body, [["eventId"], ["webhookId"], ["data", "eventId"], ["data", "webhookId"]]);
    const pushName = getFirstString(body, [["data", "pushName"], ["pushName"]]);
    const text = getFirstString(body, [
      ["data", "message", "conversation"],
      ["data", "message", "extendedTextMessage", "text"],
      ["data", "message", "ephemeralMessage", "message", "conversation"],
      ["message", "conversation"],
      ["text"],
    ]);
    const explicitAudioCandidate =
      asRecord(getRecordValue(body, ["data", "message", "audioMessage"])) ??
      asRecord(getRecordValue(body, ["data", "message", "pttMessage"])) ??
      asRecord(getRecordValue(body, ["message", "audioMessage"]));
    const mediaCandidate =
      asRecord(getRecordValue(body, ["data", "message", "mediaMessage"])) ??
      asRecord(getRecordValue(body, ["message", "mediaMessage"]));
    const messageType = getFirstString(body, [["data", "messageType"], ["messageType"], ["data", "type"], ["type"]]);
    const typedAudioCandidate = /audio|ptt|voice/i.test(messageType) ? message : null;
    const audioCandidate = explicitAudioCandidate ?? mediaCandidate ?? typedAudioCandidate;
    const audioMimetype = getFirstString(audioCandidate, [["mimetype"], ["mimeType"], ["media", "mimetype"]]);
    const isAudio = Boolean(explicitAudioCandidate) ||
      (Boolean(audioCandidate) && (isSupportedWhatsappAudioMimetype(audioMimetype) || /audio|ptt|voice|media/i.test(messageType)));
    const audio = isAudio
      ? {
          mimetype: audioMimetype.toLowerCase(),
          declaredSize: getFirstFiniteNumber(audioCandidate, [["fileLength"], ["fileSize"], ["size"], ["media", "fileLength"]]),
          durationSeconds: getFirstFiniteNumber(audioCandidate, [["seconds"], ["duration"], ["durationSeconds"], ["media", "seconds"]]),
          messageId,
          source: data ?? {},
        }
      : undefined;
    const isGroup =
      identity.chatJid.endsWith("@g.us") ||
      Boolean(data?.isGroup) ||
      Boolean(body?.isGroup);

    return {
      instance,
      messageId,
      eventId,
      ...identity,
      maskedPhone: maskPhone(identity.senderPhone),
      pushName,
      text,
      audio,
      isGroup,
      hasMessage: Boolean(message) || Boolean(text) || Boolean(audio),
    };
  }

  function pruneAiWhatsappPendingCommands() {
    const now = Date.now();
    for (const [key, pending] of aiWhatsappPendingCommands.entries()) {
      if (pending.expiresAt <= now || pending.used) aiWhatsappPendingCommands.delete(key);
    }
    for (const [key, expiresAt] of aiWhatsappProcessedWebhookMessages.entries()) {
      if (expiresAt <= now) aiWhatsappProcessedWebhookMessages.delete(key);
    }
    for (const [key, context] of aiWhatsappClarificationContexts.entries()) {
      if (context.expiresAt <= now) aiWhatsappClarificationContexts.delete(key);
    }
  }

  async function claimAiWhatsappWebhook(input: {
    unitId: string;
    replayKey: string;
    payloadHash: string;
  }) {
    if (backend !== "prisma") {
      if (aiWhatsappProcessedWebhookMessages.has(input.replayKey)) return "duplicate" as const;
      aiWhatsappProcessedWebhookMessages.set(input.replayKey, Date.now() + getAiWhatsappWebhookDedupTtlMs());
      return "claimed" as const;
    }

    try {
      await prisma.idempotencyRecord.create({
        data: {
          id: crypto.randomUUID(),
          unitId: input.unitId,
          action: "AI_WHATSAPP_WEBHOOK_RESPONSE",
          idempotencyKey: input.replayKey,
          payloadHash: input.payloadHash,
          status: "CLAIMED",
          expiresAt: new Date(Date.now() + getAiWhatsappWebhookDedupTtlMs()),
        },
      });
      return "claimed" as const;
    } catch (error) {
      if (asRecord(error)?.code === "P2002") return "duplicate" as const;
      throw error;
    }
  }

  function generateAiWhatsappCode() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = String(crypto.randomInt(1000, 10000));
      if (!Array.from(aiWhatsappPendingCommands.values()).some((item) => item.code === code && !item.used)) {
        return code;
      }
    }
    return String(crypto.randomInt(1000, 10000));
  }

  function buildAiWhatsappPendingKey(phone: string, code: string) {
    return `${normalizePhoneDigits(phone)}:${code}`;
  }

  function formatCurrencyBR(value: unknown) {
    const amount = Number(value ?? 0);
    return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function formatAiWhatsappPreview(preview: OwnerCommandPreviewResponse, code: string) {
    const lines = ["Entendi o seguinte:"];
    if (preview.intent === "sell_product") {
      const sale = preview.sale ?? {};
      const draft = preview.draft as Record<string, unknown>;
      const clientName = String(sale.clientName ?? draft.clientName ?? "").trim();
      lines.push(
        `Cliente: ${clientName || "nao vinculado"}`,
        `Produto: ${String(sale.productName ?? draft.productName ?? "-")}`,
        `Quantidade: ${String(sale.quantity ?? draft.quantity ?? "-")}`,
        `Pagamento: ${String(sale.paymentMethod ?? draft.paymentMethod ?? "-")}`,
        `Valor: ${formatCurrencyBR(sale.total)}`,
      );
    } else if (preview.intent === "schedule_appointment") {
      const draft = preview.draft as Record<string, unknown>;
      lines.push(
        `Cliente: ${String(draft.clientName ?? "-")}`,
        `Servico: ${Array.isArray(draft.serviceNames) ? draft.serviceNames.join(", ") : "-"}`,
        `Data: ${String(draft.date ?? "-")}`,
        `Horario: ${String(draft.time ?? "-")}`,
      );
      if (draft.professionalName) lines.push(`Profissional: ${String(draft.professionalName)}`);
    } else {
      lines.push(preview.summary || unsupportedOwnerCommandExecutionMessage);
    }
    const warnings = Array.isArray(preview.warnings) ? preview.warnings.filter(Boolean) : [];
    if (warnings.length) lines.push("", `Avisos: ${warnings.join(" ")}`);
    lines.push("", `Para confirmar, responda: CONFIRMAR ${code}`, "Para cancelar, responda: CANCELAR");
    return lines.join("\n");
  }

  function formatAiWhatsappGuidance() {
    return "Nao consegui entender com seguranca. Envie novamente ou escreva a mensagem em texto.";
  }

  function formatAiWhatsappAudioParserFailure() {
    return "O áudio foi transcrito, mas não consegui identificar o pedido com segurança. Envie novamente ou escreva a mensagem em texto.";
  }

  function formatAiWhatsappTemporaryFailure() {
    return "Nao consegui interpretar essa mensagem agora por uma falha temporaria do servico. Tente novamente em instantes.";
  }

  function formatAiWhatsappAudioFailure(kind: "processing" | "transcription") {
    return kind === "processing"
      ? "Recebi um audio, mas nao consegui processar. Tente enviar novamente ou mande em texto."
      : formatAiWhatsappAudioParserFailure();
  }

  function formatAiWhatsappAudioProviderFailure() {
    return "Nao consegui transcrever o audio agora por uma falha temporaria do servico. Tente novamente em instantes ou envie a mesma mensagem em texto.";
  }

  function formatAiWhatsappAudioQuotaFailure() {
    return "O servico de transcricao esta indisponivel por limite de cota. Envie a mesma mensagem em texto.";
  }

  function formatAiWhatsappAudioDisabled() {
    return "O processamento de áudio não está disponível nesta versão. Envie seu pedido em texto.";
  }

  function formatAiWhatsappAudioPreview(transcript: string, preview: OwnerCommandPreviewResponse, code: string) {
    const safeTranscript = transcript.replace(/[\r\n\t]+/g, " ").trim().slice(0, 300);
    return `Entendi o audio como: '${safeTranscript}'\nConfira a previa abaixo.\n\n${formatAiWhatsappPreview(preview, code)}`;
  }

  function formatAiWhatsappEntityClarification(preview: OwnerCommandPreviewResponse) {
    const missing = new Set(preview.missingFields ?? []);
    if (preview.intent === "schedule_appointment") {
      const pendingField = selectAiWhatsappScheduleClarificationField(preview.missingFields);
      if (pendingField === "clientName") return "Para qual cliente?";
      if (missing.size === 1 && missing.has("time") && preview.fieldDiagnostics?.time?.reason === "approximate_time") {
        const clientName = String(preview.draft.clientName ?? "").trim();
        const services = Array.isArray(preview.draft.serviceNames) ? preview.draft.serviceNames.map(String) : [];
        const canonicalService = services[0]?.toLocaleLowerCase("pt-BR") ?? "servico";
        const service = normalizeMatchText(canonicalService).startsWith("corte ") ? "corte" : canonicalService;
        const expression = preview.fieldDiagnostics?.date?.expression?.trim();
        const date = normalizeMatchText(expression) === "amanha" ? "amanhã" : expression || String(preview.draft.date ?? "");
        const proposedTime = preview.fieldDiagnostics.time.proposedValue;
        return `Entendi: ${clientName}, ${service}, ${date}. Você quer marcar exatamente às ${proposedTime}?`;
      }
      if (missing.size === 1 && missing.has("time") && preview.fieldDiagnostics?.time?.status === "ambiguous") {
        if (preview.fieldDiagnostics.time.reason === "period_not_specified"
          && preview.fieldDiagnostics.time.proposedValue === "04:00") {
          const [hour, minute] = preview.fieldDiagnostics.time.proposedValue.split(":");
          const alternativeHour = String((Number(hour) + 12) % 24).padStart(2, "0");
          return `Você quis dizer ${hour}:${minute} ou ${alternativeHour}:${minute}?`;
        }
        return "Esse horario e de manha, de tarde ou de noite?";
      }
      if (missing.size === 2 && missing.has("date") && missing.has("time")) {
        return "Qual dia e horario voce deseja?";
      }
      if (missing.size === 1 && missing.has("date")) return "Qual dia voce deseja?";
      if (missing.size === 1 && missing.has("time")) return "Qual horario voce deseja?";
      if (missing.size === 1 && missing.has("serviceNames")) return "Qual servico voce deseja agendar?";
      if (missing.size === 1 && missing.has("clientName")) return "Para qual cliente?";
      if (missing.size === 1
        && missing.has("professionalName")
        && preview.fieldDiagnostics?.professionalName?.reason === "no_eligible_professional") {
        return "Nenhum profissional ativo esta habilitado para esse servico.";
      }
      if (missing.size === 1 && missing.has("professionalName")) return "Com qual profissional?";
      if (missing.size === 1 && missing.has("availability")) {
        return "Esse horario nao esta disponivel. Qual outro dia e horario voce deseja?";
      }
    }

    if (preview.intent === "sell_product" && missing.size === 1 && missing.has("productName")) {
      return "Qual produto?";
    }

    const labels: Record<string, string> = {
      clientName: "cliente",
      productName: "produto",
      serviceNames: "servico",
      professionalName: "profissional",
      paymentMethod: "forma de pagamento",
      date: "dia",
      time: "horario",
      availability: "outro dia e horario",
    };
    const fields = (preview.missingFields ?? [])
      .map((field) => labels[field])
      .filter((field): field is string => Boolean(field));
    if (!fields.length) return formatAiWhatsappGuidance();
    if (preview.intent === "schedule_appointment") {
      return `Informe somente: ${fields.join(", ")}.`;
    }
    const onlyPeople = (preview.missingFields ?? []).every(
      (field) => field === "clientName" || field === "professionalName",
    );
    return onlyPeople
      ? `Preciso confirmar ${fields.join(", ")} com seguranca. Informe o nome exato.`
      : `Preciso confirmar ${fields.join(", ")} com seguranca. Informe o nome exato ou um alias autorizado.`;
  }

  function getAiWhatsappTextObservation(text: string) {
    const normalized = normalizeMatchText(text);
    return {
      textFingerprint: crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 12),
      characterCount: text.length,
      approximateWordCount: normalized ? normalized.split(/\s+/).length : 0,
      hasPunctuation: /[,.!?;:]/.test(text),
    };
  }

  function isMeaningfulOwnerCommandDraftValue(value: unknown) {
    if (Array.isArray(value)) return value.length > 0;
    return typeof value === "number" ? Number.isFinite(value) : typeof value === "string" ? Boolean(value.trim()) : Boolean(value);
  }

  function applyLocalAudioFieldSafety(
    preview: OwnerCommandPreviewResponse,
    canonicalization: AudioCanonicalization,
  ) {
    const categoryToField = preview.intent === "sell_product"
      ? { product: "productName", payment: "paymentMethod" } as const
      : preview.intent === "schedule_appointment"
        ? { service: "serviceNames", professional: "professionalName" } as const
        : {};
    for (const [category, field] of Object.entries(categoryToField)) {
      const categoryResults = canonicalization.fields.filter((item) => item.category === category);
      const hasGroundedValue = categoryResults.some((item) => item.status === "EXACT" || item.status === "GROUNDED");
      const ambiguous = categoryResults.find((item) => item.status === "AMBIGUOUS");
      if (!ambiguous || hasGroundedValue) continue;
      preview.missingFields = Array.from(new Set([...preview.missingFields, field]));
      preview.allowedNextActions = [];
      delete preview.confirmationToken;
      delete preview.confirmationMessage;
      preview.fieldDiagnostics = {
        ...(preview.fieldDiagnostics ?? {}),
        [field]: {
          confidence: ambiguous.score ?? 0,
          source: "deterministic",
          status: "ambiguous",
          reason: "audio_entity_ambiguous",
        },
      };
      preview.ambiguities = Array.from(new Map([
        ...(preview.ambiguities ?? []).map((item) => [item.field, item] as const),
        [field, { field, reason: "audio_entity_ambiguous" }],
      ]).values());
    }
    const newClient = preview.entityResolutionDiagnostics
      ?.some((item) => item.entity === "client" && item.result === "NOT_FOUND_NEW_CLIENT");
    const clientName = typeof preview.draft.clientName === "string" ? preview.draft.clientName.trim() : "";
    if (preview.intent === "schedule_appointment" && newClient && clientName
      && !isStructurallyValidNewClientName(clientName)) {
      preview.missingFields = Array.from(new Set([...preview.missingFields, "clientName"]));
      preview.allowedNextActions = [];
      delete preview.confirmationToken;
      delete preview.confirmationMessage;
      preview.fieldDiagnostics = {
        ...(preview.fieldDiagnostics ?? {}),
        clientName: {
          confidence: preview.fieldDiagnostics?.clientName?.confidence ?? 0,
          source: "deterministic",
          status: "ambiguous",
          reason: "audio_new_client_confirmation",
        },
      };
      delete preview.executionMessage;
    }
  }

  function getLocalAudioFieldValidation(preview: OwnerCommandPreviewResponse, canonicalization: AudioCanonicalization) {
    const fields = preview.intent === "sell_product"
      ? ["productName", "quantity", "paymentMethod"]
      : preview.intent === "schedule_appointment"
        ? ["clientName", "serviceNames", "professionalName", "date", "time"]
        : [];
    const categoryByField: Record<string, string> = {
      productName: "product",
      paymentMethod: "payment",
      serviceNames: "service",
      professionalName: "professional",
    };
    const entityByField: Record<string, string> = {
      clientName: "client",
      productName: "product",
      paymentMethod: "payment",
      serviceNames: "service",
      professionalName: "professional",
    };
    return fields.map((field) => {
      const diagnostic = preview.fieldDiagnostics?.[field];
      const categoryStatuses = canonicalization.fields
        .filter((item) => item.category === categoryByField[field])
        .map((item) => item.status);
      const entityResult = preview.entityResolutionDiagnostics
        ?.find((item) => item.entity === entityByField[field])?.result;
      let status: "EXACT" | "GROUNDED" | "NEEDS_CONFIRMATION" | "MISSING" | "AMBIGUOUS" | "UNSAFE";
      if (preview.missingFields.includes(field)) {
        status = diagnostic?.reason === "audio_new_client_confirmation" ? "NEEDS_CONFIRMATION"
          : diagnostic?.status === "ambiguous" ? "AMBIGUOUS"
          : diagnostic?.status === "rejected" ? "UNSAFE"
            : diagnostic?.reason === "approximate_time" ? "NEEDS_CONFIRMATION" : "MISSING";
      } else if (["ENTITY_ALIAS", "RESOLVED"].includes(entityResult ?? "") || categoryStatuses.includes("GROUNDED")) {
        status = "GROUNDED";
      } else if (categoryStatuses.includes("AMBIGUOUS")) {
        status = "AMBIGUOUS";
      } else {
        status = "EXACT";
      }
      return { field, status };
    });
  }

  function buildAiWhatsappClarificationKey(unitId: string, phone: string) {
    return `${unitId}:${normalizePhoneDigits(phone)}`;
  }

  const aiWhatsappScheduleClarificationFields = [
    "clientName",
    "serviceNames",
    "professionalName",
    "date",
    "time",
  ] as const;

  function selectAiWhatsappScheduleClarificationField(missingFields: string[]) {
    const missing = new Set(missingFields);
    if (missing.has("clientName")
      && (missingFields.length === 1 || (missingFields.length === 2 && missing.has("time")))) {
      return "clientName" as const;
    }
    if (missingFields.length !== 1) return undefined;
    return aiWhatsappScheduleClarificationFields.find((field) => missing.has(field));
  }

  function isValidAiWhatsappShortName(value: string) {
    return value.length >= 2
      && value.length <= 120
      && /^[\p{L}\p{M}][\p{L}\p{M}' -]*$/u.test(value)
      && !getOwnerCommandClientNameRejectionReason(value);
  }

  async function buildPendingClarificationParseResult(input: {
    message: string;
    context: AiWhatsappClarificationContext;
    unitId: string;
  }): Promise<{ parsed: OwnerCommandParseResult; accepted: boolean; resolvedValue?: string }> {
    const { context } = input;
    const pendingField = context.pendingField;
    const draft: Record<string, unknown> = { ...context.draft };
    const fieldDiagnostics = { ...(context.fieldDiagnostics ?? {}) };
    const missingFields = new Set(context.missingFields);
    const rawValue = input.message.trim();
    const confirmsProposed = Boolean(context.proposedValue)
      && /^(?:sim|isso|exato|exatamente|correto|pode ser)$/i.test(normalizeMatchText(rawValue));
    let resolvedValue: string | undefined;

    if (pendingField === "clientName") {
      const candidate = confirmsProposed ? context.proposedValue ?? "" : rawValue;
      if (isValidAiWhatsappShortName(candidate)) {
        const catalog = await operations.getCatalog({ unitId: input.unitId });
        const resolution = resolveAiWhatsappClient({
          rows: catalog.clients as unknown as Array<Record<string, unknown>>,
          getName: (item) => item.fullName ?? item.name,
          name: candidate,
        });
        if (resolution.status !== "AMBIGUOUS_MATCH") {
          const match = resolution.match as Record<string, unknown> | null;
          resolvedValue = String(match?.fullName ?? match?.name ?? candidate).trim();
        }
      }
    } else if (pendingField === "serviceNames") {
      const catalog = await operations.getCatalog({ unitId: input.unitId });
      const resolution = resolveWhatsappEntity({
        entity: "service",
        rows: catalog.services as unknown as Array<Record<string, unknown>>,
        getName: (item) => item.name,
        name: rawValue,
      });
      if (isAiWhatsappResolvedEntityStatus(resolution.status)) {
        resolvedValue = String((resolution.match as Record<string, unknown>)?.name ?? rawValue).trim();
      }
    } else if (pendingField === "professionalName") {
      const catalog = await operations.getCatalog({ unitId: input.unitId });
      const resolution = resolveWhatsappEntity({
        entity: "professional",
        rows: catalog.professionals as unknown as Array<Record<string, unknown>>,
        getName: (item) => item.name,
        name: rawValue,
        allowAliases: false,
      });
      if (isAiWhatsappResolvedEntityStatus(resolution.status)) {
        resolvedValue = String((resolution.match as Record<string, unknown>)?.name ?? rawValue).trim();
      }
    } else if (pendingField === "date") {
      const ownerContext = await getOwnerCommandContext({ unitId: input.unitId, screenContext: "whatsapp" });
      resolvedValue = recognizeOwnerCommandDate(rawValue, ownerContext.now, ownerContext.timezone)?.date;
    } else if (pendingField === "time") {
      if (confirmsProposed) {
        resolvedValue = context.proposedValue;
      } else {
        const recognized = recognizeOwnerCommandTime(rawValue);
        resolvedValue = recognized?.time || undefined;
        if (!resolvedValue && recognized?.ambiguous && recognized.candidateTime && context.proposedValue) {
          const [candidateHour, candidateMinute] = recognized.candidateTime.split(":").map(Number);
          const [proposedHour, proposedMinute] = context.proposedValue.split(":").map(Number);
          if (candidateMinute === proposedMinute && candidateHour % 12 === proposedHour % 12) {
            resolvedValue = context.proposedValue;
          }
        }
      }
    }

    if (pendingField && resolvedValue) {
      draft[pendingField] = pendingField === "serviceNames" ? [resolvedValue] : resolvedValue;
      missingFields.delete(pendingField);
      fieldDiagnostics[pendingField] = {
        confidence: 0.99,
        source: "conversation_context",
        status: "accepted",
      };
    }

    const remainingMissingFields = Array.from(missingFields);
    const acceptedConfidences = Object.values(fieldDiagnostics).filter(Boolean).map((field) => field.confidence);
    return {
      accepted: Boolean(pendingField && resolvedValue),
      resolvedValue,
      parsed: {
        ok: true,
        mode: "preview_only",
        intent: "schedule_appointment",
        confidence: acceptedConfidences.length ? Math.min(...acceptedConfidences) : 0.8,
        summary: remainingMissingFields.length
          ? "Previa de agendamento incompleta. Revise os campos faltantes ou ambiguos."
          : "Previa de agendamento completada pelo contexto da conversa.",
        draft,
        missingFields: remainingMissingFields,
        warnings: remainingMissingFields.length ? ["Comando incompleto para criar agendamento."] : [],
        allowedNextActions: [],
        executed: false,
        fieldDiagnostics,
        ambiguities: remainingMissingFields
          .filter((field) => fieldDiagnostics[field]?.status === "ambiguous")
          .map((field) => ({ field, reason: fieldDiagnostics[field]?.reason ?? "ambiguous_value" })),
      },
    };
  }

  function mergeOwnerCommandConversationContext(
    parsed: OwnerCommandParseResult,
    prior?: AiWhatsappClarificationContext,
  ) {
    if (!prior || parsed.intent !== "schedule_appointment") return parsed;
    const draft = { ...parsed.draft };
    const fieldDiagnostics = { ...(parsed.fieldDiagnostics ?? {}) };
    const ambiguousFields = new Set((parsed.ambiguities ?? []).map((item) => item.field));
    for (const field of ["clientName", "serviceNames", "professionalName", "date", "time"]) {
      const currentDiagnostic = fieldDiagnostics[field];
      const priorDiagnostic = prior.fieldDiagnostics?.[field];
      if (ambiguousFields.has(field)
        || currentDiagnostic?.status === "rejected"
        || currentDiagnostic?.status === "ambiguous"
        || isMeaningfulOwnerCommandDraftValue(draft[field])
        || !isMeaningfulOwnerCommandDraftValue(prior.draft[field])
        || priorDiagnostic?.status !== "accepted") continue;
      draft[field] = prior.draft[field];
      fieldDiagnostics[field] = {
        confidence: priorDiagnostic.confidence,
        source: "conversation_context",
        status: "accepted",
      };
    }
    const missingFields = ["clientName", "serviceNames", "professionalName", "date", "time"]
      .filter((field) => !isMeaningfulOwnerCommandDraftValue(draft[field]));
    return {
      ...parsed,
      draft,
      fieldDiagnostics,
      missingFields,
      warnings: missingFields.length ? parsed.warnings : [],
    };
  }

  function mergeOwnerCommandParseResults(deterministic: OwnerCommandParseResult, gemini: OwnerCommandParseResult) {
    if (deterministic.intent === "schedule_appointment" && gemini.intent === "schedule_appointment") {
      return gemini;
    }

    const draft = { ...gemini.draft };
    for (const [field, value] of Object.entries(deterministic.draft)) {
      if (isMeaningfulOwnerCommandDraftValue(value)) draft[field] = value;
    }
    return {
      ...gemini,
      intent: deterministic.intent,
      confidence: Math.min(deterministic.confidence, gemini.confidence),
      draft,
      missingFields: gemini.missingFields.filter((field) => !isMeaningfulOwnerCommandDraftValue(draft[field])),
      warnings: Array.from(new Set([...(deterministic.warnings ?? []), ...(gemini.warnings ?? [])])),
    };
  }

  function getOwnerCommandPresentFields(draft: Record<string, unknown>) {
    return ["clientName", "productName", "serviceNames", "professionalName", "date", "time", "quantity", "paymentMethod", "quotedUnitPrice"]
      .filter((field) => isMeaningfulOwnerCommandDraftValue(draft[field]));
  }

  function getOwnerCommandPreviewStatus(preview: OwnerCommandPreviewResponse): OwnerCommandParserStatus {
    if (preview.intent === "unknown") return "UNSUPPORTED";
    if (preview.missingFields.length) {
      return preview.ambiguities?.length || Object.values(preview.fieldDiagnostics ?? {}).some((field) => field.status === "ambiguous")
        ? "AMBIGUOUS"
        : "PARSED_INCOMPLETE";
    }
    return "PARSED_COMPLETE";
  }

  function isTrustedNewClientDraft(parsed: OwnerCommandParseResult) {
    const clientName = typeof parsed.draft.clientName === "string" ? parsed.draft.clientName.trim() : "";
    const diagnostic = parsed.fieldDiagnostics?.clientName;
    const rejectionReason = getOwnerCommandClientNameRejectionReason(clientName);
    return Boolean(
      clientName
      && isStructurallyValidNewClientName(clientName)
      && diagnostic?.status === "accepted"
      && diagnostic.confidence >= 0.8
      && (!rejectionReason || rejectionReason === "contains_introducer"),
    );
  }

  function isStructurallyValidNewClientName(value: string) {
    const rejectionReason = getOwnerCommandClientNameRejectionReason(value);
    if (rejectionReason && rejectionReason !== "contains_introducer") return false;
    const components = normalizeMatchText(value)
      .split(/\s+/)
      .filter((part) => part.length >= 2 && !["da", "das", "de", "do", "dos", "e"].includes(part));
    return components.length >= 2;
  }

  async function resolveParsedOwnerCommandPreview(input: {
    unitId: string;
    actorId?: string;
    screenContext?: string;
    disableSemanticProvider?: boolean;
  }, parsed: OwnerCommandParseResult): Promise<OwnerCommandPreviewResponse> {
    const response: OwnerCommandPreviewResponse = {
      ...parsed,
      ok: true,
      mode: "preview_only",
      executed: false,
      allowedNextActions: [],
    };
    if (parsed.intent === "schedule_appointment") {
      const normalized = normalizeOwnerScheduleDraft(parsed.draft);
      const allowNewClient = input.screenContext !== "whatsapp" || isTrustedNewClientDraft(parsed);
      const resolved = normalized.missingFields.length
        ? input.screenContext === "whatsapp" && input.disableSemanticProvider
          ? await resolveIncompleteWhatsappScheduleClient({
              unitId: input.unitId,
              draft: normalized.draft,
              allowNewClient,
            })
          : { missingFields: [] as string[], warnings: [] as string[], entityResolutionDiagnostics: [] as Array<{ entity: string; result: string; candidateCount: number; sourceStatus?: string }>, schedule: null }
        : await resolveOwnerCommandSchedule({
            unitId: input.unitId,
            draft: normalized.draft,
            strictWhatsappEntities: input.screenContext === "whatsapp",
            allowNewClient,
          });
      const missingFields = Array.from(
        new Set([...(parsed.missingFields ?? []), ...normalized.missingFields, ...resolved.missingFields]),
      );
      response.draft = normalized.draft;
      response.missingFields = missingFields;
      response.warnings = Array.from(new Set([...(parsed.warnings ?? []), ...resolved.warnings]));
      response.entityResolutionDiagnostics = resolved.entityResolutionDiagnostics;
      if (!missingFields.length && resolved.schedule) {
        response.allowedNextActions = ["confirm_execute"];
        response.confirmationToken = buildOwnerCommandConfirmationToken({
          unitId: input.unitId,
          actorId: input.actorId,
          intent: parsed.intent,
          draft: normalized.draft,
        });
        response.confirmationMessage = "Confirmar criacao deste agendamento?";
      }
    } else if (parsed.intent === "sell_product") {
      const normalized = normalizeOwnerProductSaleDraft(parsed.draft);
      const resolved = normalized.missingFields.length
        ? { missingFields: normalized.missingFields, warnings: [] as string[], entityResolutionDiagnostics: [] as Array<{ entity: string; result: string; candidateCount: number; sourceStatus?: string }>, sale: null }
        : await resolveOwnerCommandProductSale({ unitId: input.unitId, draft: normalized.draft, strictWhatsappEntities: input.screenContext === "whatsapp" });
      const parsedRequiredMissingFields = (parsed.missingFields ?? []).filter((field) => field !== "clientName");
      const missingFields = Array.from(
        new Set([...parsedRequiredMissingFields, ...normalized.missingFields, ...resolved.missingFields]),
      );
      response.draft = normalized.draft;
      response.missingFields = missingFields;
      response.warnings = Array.from(new Set([
        ...(parsedRequiredMissingFields.length ? parsed.warnings ?? [] : []),
        ...resolved.warnings,
      ]));
      response.entityResolutionDiagnostics = resolved.entityResolutionDiagnostics;
      if (resolved.sale) response.sale = resolved.sale;
      if (!missingFields.length && resolved.sale) {
        response.allowedNextActions = ["confirm_execute"];
        response.confirmationToken = buildOwnerCommandConfirmationToken({
          unitId: input.unitId,
          actorId: input.actorId,
          intent: parsed.intent,
          draft: normalized.draft,
        });
        response.confirmationMessage = "Confirmar venda de produto?";
      }
    } else {
      response.executionMessage = unsupportedOwnerCommandExecutionMessage;
    }
    return response;
  }

  async function parseOwnerCommandPreview(input: {
    unitId: string;
    actorId?: string;
    message: string;
    screenContext?: string;
    correlationId?: string;
    priorClarificationContext?: AiWhatsappClarificationContext;
    disableSemanticProvider?: boolean;
    channelContext?: AiWhatsappCommandContext;
  }): Promise<OwnerCommandPreviewResponse> {
    if (input.channelContext && (
      input.channelContext.origin !== "whatsapp_webhook"
      || input.channelContext.actorRole !== "owner"
      || input.channelContext.unitId !== input.unitId
      || input.channelContext.actorId !== input.actorId
    )) {
      throw new Error("Contexto confiavel do webhook invalido.");
    }
    await assertOwnerCommandUnitExists(input.unitId);
    const context = await getOwnerCommandContext({
      unitId: input.unitId,
      screenContext: input.screenContext,
    });
    const parserInput = { message: input.message, context, correlationId: input.correlationId };
    const isWhatsapp = input.screenContext === "whatsapp";

    if (!isWhatsapp) {
      if (!ownerCommandParser) {
        throw new Error("IA indisponivel: configure GEMINI_API_KEY no ambiente local seguro.");
      }
      return await resolveParsedOwnerCommandPreview(input, await ownerCommandParser.parse(parserInput));
    }

    const deterministicStartedAt = Date.now();
    const deterministic = parseDeterministicOwnerCommand(parserInput);
    const canonicalDeterministic = parseCanonicalDeterministicOwnerCommand(parserInput);
    const deterministicFastPath = deterministic?.intent === "schedule_appointment" ? canonicalDeterministic : deterministic;
    const deterministicDurationMs = Date.now() - deterministicStartedAt;
    const providerStrategy = (attempt: { model?: string }) => attempt.model?.startsWith("local_llama:") ? "local_llama" as const : "gemini" as const;
    const providerFallbackStrategy = (attempt: { model?: string }) => attempt.model?.startsWith("local_llama:")
      ? "deterministic_after_local_llama_failure" as const
      : "deterministic_after_gemini_failure" as const;
    const withDiagnostics = (preview: OwnerCommandPreviewResponse, diagnostics: Omit<NonNullable<OwnerCommandPreviewResponse["parserDiagnostics"]>, "presentFields" | "missingFields" | "correlationId">) => ({
      ...preview,
      parserDiagnostics: {
        ...diagnostics,
        presentFields: getOwnerCommandPresentFields(preview.draft),
        missingFields: preview.missingFields,
        correlationId: input.correlationId,
        fieldDiagnostics: preview.fieldDiagnostics,
        dateRecognitionType: preview.intent === "schedule_appointment"
          ? getDeterministicDateRecognitionType(input.message, context.now, context.timezone)
          : undefined,
      },
    });

    if (deterministicFastPath) {
      const deterministicPreview = await resolveParsedOwnerCommandPreview(input, deterministicFastPath);
      const deterministicStatus = getOwnerCommandPreviewStatus(deterministicPreview);
      if (input.disableSemanticProvider) {
        return withDiagnostics(deterministicPreview, {
          strategy: "deterministic",
          status: deterministicStatus,
          deterministicDurationMs,
        });
      }
      if (deterministicPreview.allowedNextActions.includes("confirm_execute") || deterministicStatus === "AMBIGUOUS") {
        return withDiagnostics(deterministicPreview, {
          strategy: "deterministic",
          status: deterministicStatus,
          deterministicDurationMs,
        });
      }
      if (!ownerCommandParser) {
        return withDiagnostics(deterministicPreview, {
          strategy: "deterministic_after_gemini_failure",
          status: getOwnerCommandPreviewStatus(deterministicPreview),
          deterministicDurationMs,
          failureCode: "parser_error",
        });
      }
      const gemini = await ownerCommandParser.parseGemini(parserInput);
      if (gemini.result) {
        const preview = await resolveParsedOwnerCommandPreview(input, mergeOwnerCommandParseResults(deterministicFastPath, gemini.result));
        return withDiagnostics(preview, {
          strategy: providerStrategy(gemini),
          status: getOwnerCommandPreviewStatus(preview),
          deterministicDurationMs,
          geminiDurationMs: gemini.durationMs,
          providerDurationMs: gemini.durationMs,
          httpStatus: gemini.httpStatus,
          providerAttempts: gemini.attempts,
          model: gemini.model,
          fallbackUsed: gemini.fallbackUsed,
        });
      }
      return withDiagnostics({ ...deterministicPreview, fallbackReason: gemini.failureCode }, {
        strategy: providerFallbackStrategy(gemini),
        status: gemini.status,
        deterministicDurationMs,
        geminiDurationMs: gemini.durationMs,
        providerDurationMs: gemini.durationMs,
        httpStatus: gemini.httpStatus,
        failureCode: gemini.failureCode,
        providerAttempts: gemini.attempts,
        model: gemini.model,
        fallbackUsed: gemini.fallbackUsed,
      });
    }

    if (input.disableSemanticProvider || !ownerCommandParser) {
      throw new OwnerCommandParserError("deterministic_no_match", "Nao foi possivel identificar o comando com seguranca.");
    }
    const gemini = await ownerCommandParser.parseGemini(parserInput);
    if (!gemini.result) {
      throw new OwnerCommandParserError(gemini.failureCode ?? "parser_error", "IA indisponivel no momento. Tente novamente em instantes.", gemini.httpStatus, gemini.attempts);
    }
    const preview = await resolveParsedOwnerCommandPreview(
      input,
      mergeOwnerCommandConversationContext(gemini.result, input.priorClarificationContext),
    );
    return withDiagnostics(preview, {
      strategy: providerStrategy(gemini),
      status: getOwnerCommandPreviewStatus(preview),
      deterministicDurationMs,
      geminiDurationMs: gemini.durationMs,
      providerDurationMs: gemini.durationMs,
      httpStatus: gemini.httpStatus,
      providerAttempts: gemini.attempts,
      model: gemini.model,
      fallbackUsed: gemini.fallbackUsed,
    });
  }

  async function executeOwnerCommand(input: {
    request: FastifyRequest;
    unitId: string;
    actorId?: string;
    actorLabel?: string;
    intent: OwnerCommandIntent;
    draft: Record<string, unknown>;
    confirmationToken?: string;
    idempotencyPrefix?: string;
  }) {
    if (input.intent !== "schedule_appointment" && input.intent !== "sell_product") {
      return {
        ok: true,
        mode: "preview_only",
        intent: input.intent,
        executed: false,
        message: unsupportedOwnerCommandExecutionMessage,
      };
    }

    if (!input.confirmationToken && input.intent === "sell_product") {
      return {
        statusCode: 401,
        body: {
          ok: false,
          mode: "confirmation_required",
          intent: input.intent,
          executed: false,
          message: "Confirmacao obrigatoria. Gere uma nova previa antes de executar.",
        },
      };
    }

    if (input.intent === "sell_product") {
      const normalized = normalizeOwnerProductSaleDraft(input.draft);
      if (normalized.missingFields.length) {
        return {
          ok: false,
          mode: "confirmation_required",
          intent: input.intent,
          executed: false,
          missingFields: normalized.missingFields,
          message: "Nao foi possivel executar. Revise os campos faltantes antes de confirmar.",
        };
      }
      verifyOwnerCommandConfirmationToken({
        token: input.confirmationToken,
        unitId: input.unitId,
        actorId: input.actorId,
        intent: input.intent,
        draft: normalized.draft,
      });
      const resolved = await resolveOwnerCommandProductSale({ unitId: input.unitId, draft: normalized.draft, strictWhatsappEntities: Boolean(input.idempotencyPrefix) });
      if (resolved.missingFields.length || !resolved.sale) {
        return {
          ok: false,
          mode: "confirmation_required",
          intent: input.intent,
          executed: false,
          missingFields: resolved.missingFields,
          warnings: resolved.warnings,
          message: "Nao foi possivel executar. Revise a previa antes de confirmar.",
        };
      }

      const clientId = resolved.sale.clientId || (resolved.sale.clientName
        ? await ensureOwnerCommandClient({
            unitId: input.unitId,
            clientName: resolved.sale.clientName,
            strictWhatsappEntities: Boolean(input.idempotencyPrefix),
          })
        : undefined);
      const idempotencyKey = `${input.idempotencyPrefix ?? ""}${buildOwnerCommandExecutionIdempotencyKey({
        intent: input.intent,
        token: input.confirmationToken,
      })}`;
      const saleResult = await operations.registerProductSale({
        unitId: input.unitId,
        clientId,
        soldAt: new Date(),
        items: [{ productId: resolved.sale.productId, quantity: resolved.sale.quantity }],
        paymentMethod: resolved.sale.paymentMethod,
        idempotencyKey,
        idempotencyPayloadHash: getIdempotencyPayloadHash({
          route: routePattern(input.request),
          unitId: input.unitId,
          intent: input.intent,
          draft: normalized.draft,
        }),
        audit: transactionalAuditContext(input.request),
      });
      await recordAudit(input.request, {
        unitId: saleResult.sale.unitId,
        action: "AI_OWNER_COMMAND_PRODUCT_SALE_CREATED",
        entity: "product_sale",
        entityId: saleResult.sale.id,
        idempotencyKey,
        after: {
          origin: "atendente_ia",
          productId: resolved.sale.productId,
          productName: resolved.sale.productName,
          quantity: resolved.sale.quantity,
          paymentMethod: resolved.sale.paymentMethod,
          clientId,
          grossAmount: saleResult.sale.grossAmount,
        },
        metadata: {
          humanConfirmed: true,
          intent: input.intent,
          channel: input.idempotencyPrefix ? "whatsapp" : "panel",
        },
      });
      return {
        ok: true,
        mode: "executed_after_confirmation",
        intent: input.intent,
        executed: true,
        message: "Venda de produto registrada com sucesso.",
        sale: saleResult.sale,
        revenue: saleResult.revenue,
        stockMovements: saleResult.stockMovements,
      };
    }

    const normalized = normalizeOwnerScheduleDraft(input.draft);
    if (normalized.missingFields.length) {
      return {
        ok: false,
        mode: "confirmation_required",
        intent: input.intent,
        executed: false,
        missingFields: normalized.missingFields,
        message: "Nao foi possivel executar. Revise os campos faltantes antes de confirmar.",
      };
    }
    verifyOwnerCommandConfirmationToken({
      token: input.confirmationToken,
      unitId: input.unitId,
      actorId: input.actorId,
      intent: input.intent,
      draft: normalized.draft,
    });
    const resolved = await resolveOwnerCommandSchedule({
      unitId: input.unitId,
      draft: normalized.draft,
      strictWhatsappEntities: Boolean(input.idempotencyPrefix),
      allowNewClient: isStructurallyValidNewClientName(normalized.draft.clientName),
    });
    if (resolved.missingFields.length || !resolved.schedule) {
      return {
        ok: false,
        mode: "confirmation_required",
        intent: input.intent,
        executed: false,
        missingFields: resolved.missingFields,
        warnings: resolved.warnings,
        message: "Nao foi possivel executar. Revise a previa antes de confirmar.",
      };
    }

    const clientId = resolved.schedule.clientId || await ensureOwnerCommandClient({
      unitId: input.unitId,
      clientName: resolved.schedule.clientName,
      strictWhatsappEntities: Boolean(input.idempotencyPrefix),
    });
    const appointment = await operations.schedule({
      unitId: input.unitId,
      clientId,
      professionalId: resolved.schedule.professionalId,
      serviceIds: resolved.schedule.serviceIds,
      startsAt: resolved.schedule.startsAt,
      notes: normalized.draft.notes
        ? `Atendente IA - ${normalized.draft.notes}`
        : "Atendente IA - confirmado pelo owner",
      changedBy: input.actorLabel ?? "owner",
    });
    await recordAudit(input.request, {
      unitId: appointment.unitId,
      action: "AI_OWNER_COMMAND_APPOINTMENT_CREATED",
      entity: "appointment",
      entityId: appointment.id,
      after: {
        origin: "atendente_ia",
        startsAt: appointment.startsAt.toISOString(),
        professionalId: appointment.professionalId,
        clientId: appointment.clientId,
        serviceId: appointment.serviceId,
        serviceIds: resolved.schedule.serviceIds,
      },
      metadata: {
        humanConfirmed: true,
        intent: input.intent,
        channel: input.idempotencyPrefix ? "whatsapp" : "panel",
      },
    });
    return {
      ok: true,
      mode: "executed_after_confirmation",
      intent: input.intent,
      executed: true,
      message: "Agendamento criado com sucesso.",
      appointment,
    };
  }

  const app = Fastify({
    logger: httpLogEnabled
      ? {
          level: process.env.LOG_LEVEL ?? "info",
        }
      : false,
  });
  app.log.info({
    event: "ai.whatsapp.audio.transcription.configured",
    enabled: audioTranscriptionEnabled,
    serviceAvailable: Boolean(audioTranscriptionService),
    provider: configuredAsrProvider || "none",
    timeoutMs: configuredAsrTimeoutMs,
    model: configuredAsrModel,
    gpuEnabled: configuredAsrProvider === "local_whisper" ? true : null,
    maxPasses: configuredAsrProvider === "local_whisper" ? 2 : 1,
  });

  app.register(cors, { origin: corsOrigin });
  app.register(fastifyStatic, {
    root: path.join(process.cwd(), "public"),
    prefix: "/",
  });

  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Content-Security-Policy", getContentSecurityPolicy());
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
  });

  app.get("/favicon.ico", async (_request, reply) => {
    reply.status(204).send();
  });

  const auditRecorder = new AuditRecorder({
    backend,
    prisma,
    memoryEvents: memoryStore.auditEvents,
    log: app.log,
  });

  const scheduleSchema = z.object({
    unitId: z.string().min(1),
    clientId: z.string().min(1),
    professionalId: z.string().min(1),
    serviceId: z.string().min(1).optional(),
    serviceIds: z.array(z.string().min(1)).min(MIN_APPOINTMENT_SERVICES).max(MAX_APPOINTMENT_SERVICES).optional(),
    startsAt: z.string().datetime(),
    bufferAfterMin: z.number().int().min(0).max(120).optional(),
    isFitting: z.boolean().optional(),
    notes: z.string().max(500).optional(),
    changedBy: z.string().min(1),
  }).refine((value) => value.serviceId != null || value.serviceIds != null, {
    message: "Informe ao menos um servico para o agendamento",
  }).refine((value) => !(value.serviceId != null && value.serviceIds != null), {
    message: "Informe serviceId ou serviceIds, nao ambos",
  });

  const rescheduleSchema = z.object({
    startsAt: z.string().datetime(),
    changedBy: z.string().min(1),
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
  });

  const suggestionsSchema = z.object({
    unitId: z.string().min(1),
    professionalId: z.string().min(1),
    serviceId: z.string().min(1).optional(),
    serviceIds: z.array(z.string().min(1)).min(MIN_APPOINTMENT_SERVICES).max(MAX_APPOINTMENT_SERVICES).optional(),
    startsAt: z.string().datetime(),
    windowHours: z.number().int().min(1).max(24).optional(),
  }).refine((value) => value.serviceId != null || value.serviceIds != null, {
    message: "Informe ao menos um servico para consultar horarios",
  }).refine((value) => !(value.serviceId != null && value.serviceIds != null), {
    message: "Informe serviceId ou serviceIds, nao ambos",
  });

  const appointmentServicesPreviewSchema = z.object({
    unitId: z.string().min(1),
    serviceId: z.string().min(1).optional(),
    serviceIds: z.array(z.string().min(1)).min(MIN_APPOINTMENT_SERVICES).max(MAX_APPOINTMENT_SERVICES).optional(),
  }).refine((value) => value.serviceId != null || value.serviceIds != null, {
    message: "Informe ao menos um servico para calcular o resumo",
  }).refine((value) => !(value.serviceId != null && value.serviceIds != null), {
    message: "Informe serviceId ou serviceIds, nao ambos",
  });

  const appointmentsListQuerySchema = z.object({
    unitId: z.string().min(1),
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
    period: z.enum(["today", "tomorrow", "week", "month"]).optional(),
    status: z
      .string()
      .transform((value) =>
        value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      )
      .optional(),
    clientId: z.string().min(1).optional(),
    professionalId: z.string().min(1).optional(),
    serviceId: z.string().min(1).optional(),
    search: z.string().max(120).optional(),
  });

  const appointmentPatchSchema = z
    .object({
      startsAt: z.string().datetime().optional(),
      clientId: z.string().min(1).optional(),
      professionalId: z.string().min(1).optional(),
      serviceId: z.string().min(1).optional(),
      serviceIds: z.array(z.string().min(1)).min(MIN_APPOINTMENT_SERVICES).max(MAX_APPOINTMENT_SERVICES).optional(),
      notes: z.string().max(500).optional(),
      isFitting: z.boolean().optional(),
      confirmation: z.boolean().optional(),
      idempotencyKey: z.string().trim().min(1).max(160).optional(),
      changedBy: z.string().min(1),
    })
    .refine(
      (value) =>
        value.startsAt != null ||
        value.clientId != null ||
        value.professionalId != null ||
        value.serviceId != null ||
        value.serviceIds != null ||
        value.notes != null ||
        value.isFitting != null ||
        value.confirmation != null,
      {
        message: "Informe ao menos um campo para atualizar o agendamento",
      },
    )
    .refine(
      (value) => !(value.serviceId != null && value.serviceIds != null),
      {
        message: "Informe serviceId ou serviceIds, nao ambos",
      },
    );

  const statusSchema = z.object({
    status: z.enum([
      "SCHEDULED",
      "CONFIRMED",
      "IN_SERVICE",
      "COMPLETED",
      "CANCELLED",
      "NO_SHOW",
      "BLOCKED",
    ] as [AppointmentStatus, ...AppointmentStatus[]]),
    changedBy: z.string().min(1),
    reason: z.string().trim().max(250).optional(),
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
  }).refine((value) => value.status !== "CANCELLED" || Boolean(value.reason), {
    message: "Motivo do cancelamento e obrigatorio",
    path: ["reason"],
  });

  const delaySchema = z.object({
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
    minutesLate: z.number().int().min(1).max(24 * 60),
    changedBy: z.string().min(1),
    reason: z.string().max(250).optional(),
    recordedAt: z.string().datetime().optional(),
  });

  const completeSchema = z.object({
    changedBy: z.string().min(1),
    completedAt: z.string().datetime(),
  });
  const checkoutSchema = z.object({
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
    changedBy: z.string().min(1),
    completedAt: z.string().datetime().optional(),
    paymentMethod: z.string().trim().min(1, "Metodo de pagamento obrigatorio").max(60).optional(),
    payments: z
      .array(
        z.object({
          method: z.string().trim().min(1).max(60),
          amount: z.number().positive(),
          receivedAmount: z.number().positive().optional(),
          paidAt: z.string().datetime().optional(),
          responsible: z.string().min(1).max(120).optional(),
          reference: z.string().max(160).optional(),
          status: z.enum(["CONFIRMED", "FAILED"]).optional(),
          failureReason: z.string().max(240).optional(),
          idempotencyKey: z.string().trim().min(1).max(160).optional(),
        }),
      )
      .optional(),
    expectedTotal: z.number().min(0).optional(),
    notes: z.string().max(500).optional(),
    products: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.number().int().min(1).max(99),
        }),
      )
      .optional(),
  }).refine((value) => Boolean(value.paymentMethod || value.payments?.length), {
    message: "Informe paymentMethod ou payments para o checkout",
  });

  const walkInBaseSchema = z.object({
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
    unitId: z.string().min(1),
    clientName: z.string().min(2).max(120),
    clientPhone: z.string().min(8).max(30),
    professionalId: z.string().min(1),
    serviceId: z.string().min(1).optional(),
    serviceIds: z.array(z.string().min(1)).min(1).max(6).optional(),
    startedAt: z.string().datetime().optional(),
    confirmOutOfHours: z.boolean().optional(),
    changedBy: z.string().min(1),
  });
  const walkInSchema = walkInBaseSchema.refine((value) => value.serviceId != null || value.serviceIds != null, {
    message: "Informe ao menos um servico",
  }).refine((value) => !(value.serviceId != null && value.serviceIds != null), {
    message: "Informe serviceId ou serviceIds, nao ambos",
  });

  const fittingSchema = walkInBaseSchema.extend({
    startsAt: z.string().datetime(),
    confirmRisk: z.boolean().optional(),
  }).omit({ startedAt: true }).refine((value) => value.serviceId != null || value.serviceIds != null, {
    message: "Informe ao menos um servico",
  }).refine((value) => !(value.serviceId != null && value.serviceIds != null), {
    message: "Informe serviceId ou serviceIds, nao ambos",
  });

  const appointmentBlockSchema = z.object({
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
    unitId: z.string().min(1),
    professionalId: z.string().min(1).optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    reason: z.string().trim().min(3).max(240),
    isFullDay: z.boolean().optional(),
    changedBy: z.string().min(1),
  });

  const appointmentBlockCancelSchema = z.object({
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
    unitId: z.string().min(1),
    reason: z.string().trim().min(3).max(240),
    changedBy: z.string().min(1),
  });

  const appointmentServicesInServiceSchema = z.object({
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
    unitId: z.string().min(1).optional(),
    serviceId: z.string().min(1).optional(),
    serviceIds: z.array(z.string().min(1)).min(1).max(6).optional(),
    confirmRisk: z.boolean().optional(),
    changedBy: z.string().min(1),
  }).refine((value) => value.serviceId != null || value.serviceIds != null, {
    message: "Informe ao menos um servico",
  }).refine((value) => !(value.serviceId != null && value.serviceIds != null), {
    message: "Informe serviceId ou serviceIds, nao ambos",
  });

  const dashboardSuggestionTelemetrySchema = z.object({
    unitId: z.string().min(1),
    actionType: z.enum(["REACTIVATION_CAMPAIGN", "FILL_IDLE_SLOTS", "UPSELL_COMBO"]),
    outcome: z.enum(["EXECUTED", "IGNORED", "CONVERTED"]),
    estimatedImpact: z.number().min(0).optional(),
    realizedRevenue: z.number().min(0).optional(),
    sourceModule: z.enum(["dashboard", "clientes", "automacoes"]).optional(),
    playbookType: z
      .enum(["REACTIVATION", "IDLE_WINDOW_FILL", "FORECAST_PROTECTION"])
      .optional(),
    note: z.string().max(240).optional(),
    occurredAt: z.string().datetime().optional(),
  });

  const productSaleSchema = z.object({
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
    unitId: z.string().min(1),
    professionalId: z.string().min(1).optional(),
    clientId: z.string().min(1).optional(),
    paymentMethod: z.string().trim().min(1).max(80).optional(),
    soldAt: z.string().datetime(),
    items: z.array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(99),
      }),
    ),
  });

  const productSalesHistoryQuerySchema = z.object({
    unitId: z.string().min(1),
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
    clientId: z.string().min(1).optional(),
    professionalId: z.string().min(1).optional(),
    productId: z.string().min(1).optional(),
    search: z.string().max(120).optional(),
    status: z.enum(["NOT_REFUNDED", "PARTIALLY_REFUNDED", "REFUNDED"]).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  });

  const appointmentRefundSchema = z.object({
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
    unitId: z.string().min(1),
    changedBy: z.string().min(1),
    reason: z.string().trim().min(3).max(500),
    refundedAt: z.string().datetime(),
  });

  const productSaleRefundSchema = z.object({
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
    unitId: z.string().min(1),
    changedBy: z.string().min(1),
    reason: z.string().trim().min(3).max(500),
    refundedAt: z.string().datetime(),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.number().int().min(1).max(99),
        }),
      )
      .min(1),
  });

  const manualFinancialEntrySchema = z.object({
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
    unitId: z.string().min(1),
    kind: z.enum(["INCOME", "EXPENSE"]),
    amount: z.number().positive(),
    occurredAt: z.string().datetime(),
    description: z.string().min(3).max(120),
    changedBy: z.string().min(1),
  });

  const financialSummaryQuerySchema = z.object({
    unitId: z.string().min(1),
    start: z.string().datetime(),
    end: z.string().datetime(),
    compareStart: z.string().datetime().optional(),
    compareEnd: z.string().datetime().optional(),
  });

  const financialTransactionsQuerySchema = z.object({
    unitId: z.string().min(1).optional(),
    businessId: z.string().min(1).optional(),
    start: z.string().datetime(),
    end: z.string().datetime(),
    type: z.enum(["INCOME", "EXPENSE"]).optional(),
    category: z.string().min(1).optional(),
    paymentMethod: z.string().min(1).optional(),
    source: z.string().min(1).optional(),
    professionalId: z.string().min(1).optional(),
    customerId: z.string().min(1).optional(),
    search: z.string().max(120).optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
  }).refine((value) => Boolean(value.unitId || value.businessId), {
    message: "unitId ou businessId e obrigatorio",
  });

  const financialTransactionCreateSchema = z.object({
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
    unitId: z.string().min(1),
    type: z.enum(["INCOME", "EXPENSE"]),
    category: z.string().min(1).max(80),
    description: z.string().min(3).max(160),
    amount: z.number().positive(),
    date: z.string().datetime(),
    paymentMethod: z.string().max(40).optional(),
    source: z.string().max(30).optional(),
    appointmentId: z.string().min(1).optional(),
    productSaleId: z.string().min(1).optional(),
    professionalId: z.string().min(1).optional(),
    customerId: z.string().min(1).optional(),
    notes: z.string().max(400).optional(),
    changedBy: z.string().min(1),
  });

  const financialTransactionUpdateSchema = z
    .object({
      unitId: z.string().min(1),
      type: z.enum(["INCOME", "EXPENSE"]).optional(),
      category: z.string().min(1).max(80).optional(),
      description: z.string().min(3).max(160).optional(),
      amount: z.number().positive().optional(),
      date: z.string().datetime().optional(),
      paymentMethod: z.string().max(40).optional(),
      professionalId: z.string().min(1).optional(),
      customerId: z.string().min(1).optional(),
      notes: z.string().max(400).optional(),
      changedBy: z.string().min(1),
    })
    .refine(
      (value) =>
        value.type != null ||
        value.category != null ||
        value.description != null ||
        value.amount != null ||
        value.date != null ||
        value.paymentMethod != null ||
        value.professionalId != null ||
        value.customerId != null ||
        value.notes != null,
      {
        message: "Informe ao menos um campo para atualizar o lancamento",
      },
    );

  const financialCommissionsQuerySchema = z.object({
    unitId: z.string().min(1),
    start: z.string().datetime(),
    end: z.string().datetime(),
    professionalId: z.string().min(1).optional(),
    status: z.enum(["PENDING", "PAID", "CANCELED"]).optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
  });

  const financialCommissionPaySchema = z.object({
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
    unitId: z.string().min(1),
    paidAt: z.string().datetime().optional(),
    changedBy: z.string().min(1),
  });

  const financialReportsQuerySchema = z.object({
    unitId: z.string().min(1),
    start: z.string().datetime(),
    end: z.string().datetime(),
  });

  const managementReportQuerySchema = z.object({
    unitId: z.string().min(1),
    start: z.string().datetime(),
    end: z.string().datetime(),
    professionalId: z.string().min(1).optional(),
    productId: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
  });

  const managementExportQuerySchema = managementReportQuerySchema.extend({
    type: z.enum([
      "financial",
      "appointments",
      "product-sales",
      "stock",
      "clients",
      "professionals",
      "commissions",
      "audit",
    ]),
  });

  const clientsOverviewQuerySchema = z.object({
    unitId: z.string().min(1),
    start: z.string().datetime(),
    end: z.string().datetime(),
    search: z.string().max(120).optional(),
    status: z.enum(["ACTIVE", "AT_RISK", "INACTIVE", "VIP"]).optional(),
    segment: z.enum(["VALUE_HIGH", "VALUE_MEDIUM", "VALUE_LOW"]).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  });

  const clientsListQuerySchema = z.object({
    unitId: z.string().min(1),
    search: z.string().max(120).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  });

  const clientCreateSchema = z.object({
    unitId: z.string().min(1),
    name: z.string().min(2).max(120),
    phone: z.string().min(8).max(30),
    email: z.string().email().max(120).optional(),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "birthDate deve estar no formato YYYY-MM-DD")
      .optional(),
    notes: z.string().max(500).optional(),
    status: z.enum(["NEW", "ACTIVE", "VIP", "INACTIVE"]).optional(),
    tags: z
      .array(z.enum(["NEW", "RECURRING", "VIP", "INACTIVE"]))
      .max(6)
      .optional(),
  });

  const professionalCreateSchema = z.object({
    unitId: z.string().min(1),
    name: z.string().min(2).max(120),
    phone: z.string().max(30).optional(),
    email: z.string().email().max(120).optional().or(z.literal("")),
  });

  const professionalUpdateSchema = z.object({
    unitId: z.string().min(1),
    name: z.string().min(2).max(120).optional(),
    phone: z.string().max(30).optional(),
    email: z.string().email().max(120).optional().or(z.literal("")),
    active: z.boolean().optional(),
  });

  const professionalsPerformanceQuerySchema = z.object({
    unitId: z.string().min(1),
    start: z.string().datetime(),
    end: z.string().datetime(),
    professionalId: z.string().min(1).optional(),
  });

  const goalsCurrentQuerySchema = z.object({
    unitId: z.string().min(1),
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
  });

  const goalsCreateSchema = z.object({
    unitId: z.string().min(1),
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2000).max(2100),
    revenueTarget: z.number().positive(),
    appointmentsTarget: z.number().int().min(1),
    averageTicketTarget: z.number().positive().optional(),
    notes: z.string().max(500).optional(),
  });

  const goalsUpdateSchema = z
    .object({
      unitId: z.string().min(1),
      month: z.number().int().min(1).max(12).optional(),
      year: z.number().int().min(2000).max(2100).optional(),
      revenueTarget: z.number().positive().optional(),
      appointmentsTarget: z.number().int().min(1).optional(),
      averageTicketTarget: z.number().positive().optional().nullable(),
      notes: z.string().max(500).optional(),
    })
    .refine(
      (value) =>
        value.month != null ||
        value.year != null ||
        value.revenueTarget != null ||
        value.appointmentsTarget != null ||
        value.averageTicketTarget != null ||
        value.notes != null,
      {
        message: "Informe ao menos um campo para atualizar a meta",
      },
    );

  const performanceMonthQuerySchema = z.object({
    unitId: z.string().min(1),
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
  });

  const settingsQuerySchema = z.object({
    unitId: z.string().min(1),
  });

  const settingsBusinessPatchSchema = z.object({
    unitId: z.string().min(1),
    businessName: z.string().min(1),
    segment: z.enum(["barbearia", "estetica", "salao", "pet_shop", "clinica", "outro"]),
    phone: z.string().max(30).optional(),
    email: z.string().email().max(120).optional().or(z.literal("")),
    address: z.string().max(160).optional(),
    city: z.string().max(80).optional(),
    state: z.string().max(50).optional(),
    document: z.string().max(30).optional(),
    displayName: z.string().max(120).optional(),
    primaryColor: z.string().max(16).optional(),
    themeMode: z.enum(["light", "dark", "system"]).optional(),
    defaultAppointmentDuration: z.number().int().min(1).max(480).optional(),
    minimumAdvanceMinutes: z.number().int().min(0).max(10080).optional(),
    bufferBetweenAppointmentsMinutes: z.number().int().min(0).max(240).optional(),
    reminderLeadMinutes: z.number().int().min(0).max(10080).optional(),
    sendAppointmentReminders: z.boolean().optional(),
    inactiveCustomerDays: z.number().int().min(1).max(10000).optional(),
    atRiskCustomerDays: z.number().int().min(1).max(10000).optional(),
    allowWalkIns: z.boolean().optional(),
    allowOutOfHoursAppointments: z.boolean().optional(),
    allowOverbooking: z.boolean().optional(),
    houseCommissionType: z.enum(["PERCENTAGE", "FIXED"]).optional(),
    houseCommissionValue: z.number().min(0).optional(),
  });

  const settingsBusinessHoursPatchSchema = z.object({
    unitId: z.string().min(1),
    hours: z.array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        opensAt: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
        closesAt: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
        breakStart: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
        breakEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
        isClosed: z.boolean().optional(),
      }),
    ).min(1),
  });

  const settingsPaymentMethodsCreateSchema = z.object({
    unitId: z.string().min(1),
    name: z.string().min(2).max(80),
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
  });

  const settingsPaymentMethodsUpdateSchema = z
    .object({
      unitId: z.string().min(1),
      name: z.string().min(2).max(80).optional(),
      isActive: z.boolean().optional(),
      isDefault: z.boolean().optional(),
    })
    .refine(
      (value) => value.name != null || value.isActive != null || value.isDefault != null,
      {
        message: "Informe ao menos um campo para atualizar o metodo de pagamento",
      },
    );

  const settingsCommissionRuleCreateSchema = z.object({
    unitId: z.string().min(1),
    professionalId: z.string().min(1).optional(),
    serviceId: z.string().min(1).optional(),
    type: z.enum(["PERCENTAGE", "FIXED"]),
    value: z.number().min(0),
    isActive: z.boolean().optional(),
  });

  const settingsCommissionRuleUpdateSchema = z
    .object({
      unitId: z.string().min(1),
      professionalId: z.string().min(1).optional().or(z.literal("")),
      serviceId: z.string().min(1).optional().or(z.literal("")),
      type: z.enum(["PERCENTAGE", "FIXED"]).optional(),
      value: z.number().min(0).optional(),
      isActive: z.boolean().optional(),
    })
    .refine(
      (value) =>
        value.professionalId != null ||
        value.serviceId != null ||
        value.type != null ||
        value.value != null ||
        value.isActive != null,
      {
        message: "Informe ao menos um campo para atualizar a regra de comissao",
      },
    );

  const settingsTeamMemberCreateSchema = z.object({
    unitId: z.string().min(1),
    name: z.string().min(2).max(120),
    role: z.enum(["OWNER", "MANAGER", "PROFESSIONAL", "RECEPTION"]),
    accessProfile: z.enum(["owner", "gerente", "profissional", "recepcao"]),
    email: z.string().email().max(120).optional().or(z.literal("")),
    phone: z.string().max(30).optional(),
    isActive: z.boolean().optional(),
  });

  const settingsTeamMemberUpdateSchema = z
    .object({
      unitId: z.string().min(1),
      name: z.string().min(2).max(120).optional(),
      role: z.enum(["OWNER", "MANAGER", "PROFESSIONAL", "RECEPTION"]).optional(),
      accessProfile: z.enum(["owner", "gerente", "profissional", "recepcao"]).optional(),
      email: z.string().email().max(120).optional().or(z.literal("")),
      phone: z.string().max(30).optional(),
      isActive: z.boolean().optional(),
    })
    .refine(
      (value) =>
        value.name != null ||
        value.role != null ||
        value.accessProfile != null ||
        value.email != null ||
        value.phone != null ||
        value.isActive != null,
      {
        message: "Informe ao menos um campo para atualizar o membro da equipe",
      },
    );

  const financialManagementOverviewQuerySchema = z.object({
    unitId: z.string().min(1),
    start: z.string().datetime(),
    end: z.string().datetime(),
    compareStart: z.string().datetime().optional(),
    compareEnd: z.string().datetime().optional(),
  });

  const commissionsStatementQuerySchema = z.object({
    unitId: z.string().min(1),
    start: z.string().datetime(),
    end: z.string().datetime(),
    professionalId: z.string().min(1).optional(),
    appliesTo: z.enum(["SERVICE", "PRODUCT"]).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  });

  const loyaltySummaryQuerySchema = z.object({
    unitId: z.string().min(1),
    start: z.string().datetime(),
    end: z.string().datetime(),
  });

  const loyaltyLedgerQuerySchema = z.object({
    unitId: z.string().min(1),
    clientId: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  });

  const loyaltyAdjustSchema = z.object({
    unitId: z.string().min(1),
    clientId: z.string().min(1),
    pointsDelta: z.number().refine((value) => value !== 0, {
      message: "pointsDelta nao pode ser zero",
    }),
    sourceType: z.enum(["ADJUSTMENT", "REDEEM"]).optional(),
    sourceId: z.string().min(1).optional(),
    note: z.string().max(240).optional(),
    occurredAt: z.string().datetime().optional(),
    createdBy: z.string().min(1),
  });

  const packagesQuerySchema = z.object({
    unitId: z.string().min(1),
  });

  const packagePurchaseSchema = z.object({
    unitId: z.string().min(1),
    clientId: z.string().min(1),
    packageId: z.string().min(1),
    purchasedAt: z.string().datetime(),
    changedBy: z.string().min(1),
  });

  const packageRedeemSchema = z.object({
    unitId: z.string().min(1),
    clientId: z.string().min(1),
    packagePurchaseId: z.string().min(1),
    serviceId: z.string().min(1),
    occurredAt: z.string().datetime(),
    changedBy: z.string().min(1),
  });

  const packageBalanceQuerySchema = z.object({
    unitId: z.string().min(1),
    clientId: z.string().min(1),
  });

  const subscriptionPlansQuerySchema = z.object({
    unitId: z.string().min(1),
  });

  const subscriptionActivateSchema = z.object({
    unitId: z.string().min(1),
    clientId: z.string().min(1),
    planId: z.string().min(1),
    startedAt: z.string().datetime(),
    changedBy: z.string().min(1),
  });

  const subscriptionCancelSchema = z.object({
    unitId: z.string().min(1),
    subscriptionId: z.string().min(1),
    changedBy: z.string().min(1),
  });

  const subscriptionsOverviewQuerySchema = z.object({
    unitId: z.string().min(1),
    start: z.string().datetime(),
    end: z.string().datetime(),
  });

  const retentionCasesQuerySchema = z.object({
    unitId: z.string().min(1),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    status: z.enum(["OPEN", "IN_PROGRESS", "CONVERTED", "LOST"]).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  });

  const retentionEventSchema = z.object({
    unitId: z.string().min(1),
    channel: z.enum(["PHONE", "WHATSAPP", "MANUAL"]),
    note: z.string().min(3).max(280),
    outcome: z.string().max(140).optional(),
    occurredAt: z.string().datetime(),
    createdBy: z.string().min(1),
  });

  const retentionConvertSchema = z.object({
    unitId: z.string().min(1),
    changedBy: z.string().min(1),
  });

  const multiUnitOverviewQuerySchema = z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  });

  const multiUnitBenchmarkQuerySchema = z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
    metric: z.enum(["revenue", "occupancy", "ticket"]).default("revenue"),
  });

  const automationRuleCreateSchema = z.object({
    unitId: z.string().min(1),
    name: z.string().min(3).max(120),
    triggerType: z.enum(["INACTIVITY", "BIRTHDAY", "HIGH_RISK"]),
    channel: z.enum(["WHATSAPP", "SMS", "EMAIL", "MANUAL"]),
    target: z.enum(["CLIENT", "SEGMENT"]),
    messageTemplate: z.string().min(3).max(500),
    createdBy: z.string().min(1),
  });

  const automationRulesQuerySchema = z.object({
    unitId: z.string().min(1),
    active: z.coerce.boolean().optional(),
  });

  const automationRuleUpdateSchema = z
    .object({
      unitId: z.string().min(1),
      name: z.string().min(3).max(120).optional(),
      triggerType: z.enum(["INACTIVITY", "BIRTHDAY", "HIGH_RISK"]).optional(),
      channel: z.enum(["WHATSAPP", "SMS", "EMAIL", "MANUAL"]).optional(),
      target: z.enum(["CLIENT", "SEGMENT"]).optional(),
      messageTemplate: z.string().min(3).max(500).optional(),
    })
    .refine(
      (value) =>
        value.name != null ||
        value.triggerType != null ||
        value.channel != null ||
        value.target != null ||
        value.messageTemplate != null,
      {
        message: "Informe ao menos um campo para atualizar a regra",
      },
    );

  const automationRuleToggleSchema = z.object({
    unitId: z.string().min(1),
  });

  const automationCampaignExecuteSchema = z.object({
    unitId: z.string().min(1),
    ruleId: z.string().min(1).optional(),
    campaignType: z.string().min(2).max(80),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    sourceModule: z.enum(["dashboard", "clientes", "automacoes"]).optional(),
    sourceSuggestionId: z.string().min(1).max(120).optional(),
    playbookType: z
      .enum(["REACTIVATION", "IDLE_WINDOW_FILL", "FORECAST_PROTECTION"])
      .optional(),
    startedBy: z.string().min(1),
  });

  const automationExecutionsQuerySchema = z.object({
    unitId: z.string().min(1),
    start: z.string().datetime(),
    end: z.string().datetime(),
    status: z.enum(["PENDING", "SUCCESS", "FAILED"]).optional(),
  });

  const automationExecutionReprocessSchema = z.object({
    unitId: z.string().min(1),
    startedBy: z.string().min(1),
  });

  const retentionScoringRecalculateSchema = z.object({
    unitId: z.string().min(1),
    scoredAt: z.string().datetime().optional(),
    modelVersion: z.string().min(2).max(50).optional(),
  });

  const retentionScoringOverviewQuerySchema = z.object({
    unitId: z.string().min(1),
    start: z.string().datetime(),
    end: z.string().datetime(),
  });

  const retentionScoringClientsQuerySchema = z.object({
    unitId: z.string().min(1),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  });

  const retentionScoringClientQuerySchema = z.object({
    unitId: z.string().min(1),
  });

  const ownerCommandParseSchema = z.object({
    unitId: z.string().min(1).optional(),
    message: z.string().trim().min(3).max(1000),
    screenContext: z.string().trim().min(1).max(80).optional(),
  });

  const ownerCommandConfirmSchema = z.object({
    unitId: z.string().min(1).optional(),
    intent: ownerCommandIntentSchema,
    draft: z.record(z.string(), z.unknown()).default({}),
    confirmationToken: z.string().trim().min(20).max(3000).optional(),
  });

  const integrationWebhookOutboundTestSchema = z.object({
    unitId: z.string().min(1),
    provider: z.string().min(2).max(60),
    endpoint: z.string().url(),
    eventType: z.string().min(2).max(80),
    payload: z.record(z.string(), z.unknown()).optional(),
    occurredAt: z.string().datetime().optional(),
    triggeredBy: z.string().min(1),
  });

  const integrationWebhookInboundSchema = z.object({
    unitId: z.string().min(1),
    payload: z.record(z.string(), z.unknown()).optional(),
    occurredAt: z.string().datetime().optional(),
  });

  const integrationWebhookLogsQuerySchema = z.object({
    unitId: z.string().min(1),
    provider: z.string().min(2).max(60).optional(),
    status: z.enum(["SUCCESS", "FAILED"]).optional(),
    start: z.string().datetime(),
    end: z.string().datetime(),
  });

  const billingSubscriptionsSyncSchema = z.object({
    unitId: z.string().min(1),
    occurredAt: z.string().datetime(),
    changedBy: z.string().min(1),
  });

  const billingReconciliationQuerySchema = z.object({
    unitId: z.string().min(1),
    start: z.string().datetime(),
    end: z.string().datetime(),
  });

  const billingReconciliationDiscrepanciesQuerySchema = z.object({
    unitId: z.string().min(1),
    start: z.string().datetime(),
    end: z.string().datetime(),
    status: z.enum(["OPEN", "RESOLVED"]).optional(),
    type: z
      .enum(["MISSING_FINANCIAL_ENTRY", "AMOUNT_MISMATCH", "DUPLICATE_EVENT", "STATUS_MISMATCH"])
      .optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  });

  const billingReconciliationResolveSchema = z.object({
    unitId: z.string().min(1),
    start: z.string().datetime(),
    end: z.string().datetime(),
    action: z.enum([
      "MARK_RESOLVED",
      "IGNORE",
      "REPROCESS_REQUESTED",
      "CANCEL_SUBSCRIPTION_REQUESTED",
    ]),
    note: z.string().min(3).max(500).optional(),
    changedBy: z.string().min(1).optional(),
  });

  const billingWebhookEventSchema = z.object({
    unitId: z.string().min(1),
    eventId: z.string().min(2).max(120).optional(),
    idempotencyKey: z.string().min(2).max(200).optional(),
    subscriptionId: z.string().min(1).optional(),
    externalSubscriptionId: z.string().min(2).max(120).optional(),
    eventType: z.enum(["RENEWED", "CHARGE_FAILED", "CANCELLED"]),
    status: z.enum(["PAID", "FAILED", "CANCELLED"]),
    amount: z.number().min(0).optional(),
    occurredAt: z.string().datetime(),
    payload: z.record(z.string(), z.unknown()).optional(),
  });

  const authLoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
    activeUnitId: z.string().min(1).optional(),
  });

  const auditEventsQuerySchema = z.object({
    unitId: z.string().min(1),
    entity: z.string().min(1).optional(),
    action: z.string().min(1).optional(),
    actorId: z.string().min(1).optional(),
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  });

  const serviceStockConsumptionQuerySchema = z.object({
    unitId: z.string().min(1),
  });

  const servicesQuerySchema = z.object({
    unitId: z.string().min(1),
    status: z.enum(["ALL", "ACTIVE", "INACTIVE"]).optional(),
    category: z.string().max(120).optional(),
    search: z.string().max(160).optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
  });

  const serviceCreateSchema = z.object({
    unitId: z.string().min(1),
    name: z.string().min(1).max(120),
    price: z.number().min(0),
    durationMinutes: z.number().int().positive(),
    category: z.string().max(120).optional(),
    description: z.string().max(1000).optional(),
    defaultCommissionRate: z.number().min(0).max(100).optional(),
    professionalIds: z.array(z.string().min(1)).max(100).optional(),
    isActive: z.boolean().optional(),
    estimatedCost: z.number().min(0).optional(),
    notes: z.string().max(1000).optional(),
    imageUrl: z.string().max(500).optional().or(z.literal("")),
  });

  const serviceUpdateSchema = z
    .object({
      unitId: z.string().min(1),
      name: z.string().min(1).max(120).optional(),
      price: z.number().min(0).optional(),
      durationMinutes: z.number().int().positive().optional(),
      category: z.string().max(120).optional(),
      description: z.string().max(1000).optional(),
      defaultCommissionRate: z.number().min(0).max(100).optional(),
      professionalIds: z.array(z.string().min(1)).max(100).optional(),
      isActive: z.boolean().optional(),
      estimatedCost: z.number().min(0).optional(),
      notes: z.string().max(1000).optional(),
      imageUrl: z.string().max(500).optional().or(z.literal("")),
    })
    .refine(
      (value) =>
        value.name != null ||
        value.price != null ||
        value.durationMinutes != null ||
        value.category != null ||
        value.description != null ||
        value.defaultCommissionRate != null ||
        value.professionalIds != null ||
        value.isActive != null ||
        value.estimatedCost != null ||
        value.notes != null ||
        value.imageUrl != null,
      {
        message: "Informe ao menos um campo para atualizar o servico",
      },
    );

  const serviceStatusSchema = z.object({
    unitId: z.string().min(1),
    isActive: z.boolean(),
  });

  const serviceStockConsumptionItemSchema = z.object({
    productId: z.string().min(1),
    quantityPerService: z.number().positive(),
    wastePct: z.number().min(0).max(100).optional(),
    isCritical: z.boolean().optional(),
  });

  const serviceStockConsumptionSetSchema = z.object({
    unitId: z.string().min(1),
    items: z.array(serviceStockConsumptionItemSchema).max(50),
    changedBy: z.string().min(1),
  });

  const stockManualMovementSchema = z.object({
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
    unitId: z.string().min(1),
    productId: z.string().min(1),
    movementType: z.enum(["IN", "OUT", "LOSS", "INTERNAL_USE"]),
    quantity: z.number().int().positive(),
    reason: z.string().trim().min(3).max(240),
    responsible: z.string().min(1).max(120),
    occurredAt: z.string().datetime().optional(),
    referenceType: z.enum(["ADJUSTMENT", "INTERNAL"]).optional(),
    referenceId: z.string().min(1).optional(),
    changedBy: z.string().min(1),
  });

  const inventoryQuerySchema = z.object({
    unitId: z.string().min(1),
    search: z.string().max(120).optional(),
    category: z.string().max(80).optional(),
    status: z.enum(["ALL", "LOW_STOCK", "OUT_OF_STOCK"]).optional(),
    limit: z.coerce.number().int().min(1).max(80).optional(),
  });

  const inventoryCreateSchema = z.object({
    unitId: z.string().min(1),
    name: z.string().min(1).max(120),
    salePrice: z.number().min(0),
    quantity: z.number().int().min(0),
    costPrice: z.number().min(0).optional(),
    minimumStock: z.number().int().min(0).optional(),
    category: z.string().max(80).optional(),
    notes: z.string().max(500).optional(),
    changedBy: z.string().min(1),
  });

  const inventoryUpdateSchema = z
    .object({
      unitId: z.string().min(1),
      name: z.string().min(1).max(120).optional(),
      salePrice: z.number().min(0).optional(),
      quantity: z.number().int().min(0).optional(),
      costPrice: z.number().min(0).optional(),
      minimumStock: z.number().int().min(0).optional(),
      category: z.string().max(80).optional(),
      notes: z.string().max(500).optional(),
      changedBy: z.string().min(1),
    })
    .refine(
      (value) =>
        value.name != null ||
        value.salePrice != null ||
        value.quantity != null ||
        value.costPrice != null ||
        value.minimumStock != null ||
        value.category != null ||
        value.notes != null,
      {
        message: "Informe ao menos um campo para atualizar o produto",
      },
    );

  const inventoryDeleteSchema = z.object({
    unitId: z.string().min(1),
    changedBy: z.string().min(1),
  });

  const inventoryStockAdjustSchema = z.object({
    unitId: z.string().min(1),
    type: z.enum(["IN", "OUT", "ADJUSTMENT"]),
    quantity: z.number().int().min(0),
    reason: z.string().max(240).optional(),
    changedBy: z.string().min(1),
  });

  const inventoryCountSchema = z.object({
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
    unitId: z.string().min(1),
    productId: z.string().min(1),
    countedQty: z.number().int().min(0),
    reason: z.string().trim().min(3).max(240),
    responsible: z.string().min(1).max(120),
    countedAt: z.string().datetime().optional(),
  });

  const dailyClosingSchema = z.object({
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
    unitId: z.string().min(1),
    businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    informedCash: z.number().min(0).optional(),
    informedPix: z.number().min(0).optional(),
    informedDebit: z.number().min(0).optional(),
    informedCredit: z.number().min(0).optional(),
    notes: z.string().max(500).optional(),
    responsible: z.string().min(1).max(120),
  });

  const dailyClosingReopenSchema = z.object({
    unitId: z.string().min(1),
    reopenedBy: z.string().min(1).max(120),
    reason: z.string().trim().min(3).max(240),
  });

  const checkoutPaymentCorrectionSchema = z.object({
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
    unitId: z.string().min(1),
    reason: z.string().trim().min(3).max(240),
    responsible: z.string().min(1).max(120),
    correctedAt: z.string().datetime().optional(),
  });

  app.addHook("onRequest", async (request, reply) => {
    const req = request as RequestWithAuth;
    const incomingCorrelation = request.headers["x-correlation-id"];
    const correlationId =
      typeof incomingCorrelation === "string" && incomingCorrelation.trim().length > 0
        ? incomingCorrelation.trim()
        : crypto.randomUUID();
    req.correlationId = correlationId;
    reply.header("x-correlation-id", correlationId);

    const authorization = request.headers.authorization;
    if (!authorization) return;
    const [scheme, token] = authorization.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      req.hasInvalidToken = true;
      return;
    }

    // Firebase ID token (RS256) — verificação via Google public certs
    if (isFirebaseToken(token)) {
      try {
        const firebasePayload = await verifyFirebaseIdToken(token);
        const session = await resolveFirebaseUser(
          firebasePayload.uid,
          firebasePayload.email,
          backend,
          firebasePayload.name,
        );
        if (session) {
          req.auth = session;
          req.hasInvalidToken = false;
        } else {
          req.hasInvalidToken = true;
        }
      } catch {
        req.hasInvalidToken = true;
      }
      return;
    }

    // Token customizado legado (HS256)
    try {
      req.auth = verifyAccessToken(token);
      req.hasInvalidToken = false;
    } catch {
      req.hasInvalidToken = true;
    }
  });

  app.addHook("preHandler", async (request) => {
    const req = request as RequestWithAuth;
    const method = request.method.toUpperCase();
    const route = routePattern(request);
    const policy = getPolicyForRoute(method, route);

    if (policy.isPublic) return;

    if (!req.auth) {
      if (authEnforced) {
        app.log.warn({
          event: "auth.denied",
          reason: req.hasInvalidToken ? "invalid_token" : "missing_token",
          method,
          route,
          requestId: req.correlationId,
        });
        throw new Error("Nao autenticado");
      }
      return;
    }

    if (policy.roles && !policy.roles.includes(req.auth.role)) {
      app.log.warn({
        event: "auth.denied",
        reason: "role_not_allowed",
        method,
        route,
        requestId: req.correlationId,
        userId: req.auth.userId,
        role: req.auth.role,
        allowedRoles: policy.roles,
      });
      throw new Error("Acesso negado");
    }

    if (policy.unitSource) {
      const target = policy.unitSource === "query" ? request.query : request.body;
      const record = asRecord(target);
      const providedUnitId =
        record && typeof record.unitId === "string" ? record.unitId.trim() : undefined;

      if (providedUnitId && providedUnitId !== req.auth.activeUnitId) {
        throw new Error("Unidade nao autorizada");
      }
      if (record) {
        record.unitId = req.auth.activeUnitId;
      }
    }

    const body = asRecord(request.body);
    if (body) {
      body.changedBy = req.auth.userId;
      body.createdBy = req.auth.userId;
      body.startedBy = req.auth.userId;
      body.triggeredBy = req.auth.userId;
    }
  });

  app.addHook("onResponse", async (request, reply) => {
    const req = request as RequestWithAuth;
    app.log.info({
      event: "http.request.completed",
      method: request.method,
      route: routePattern(request),
      statusCode: reply.statusCode,
      latencyMs: reply.elapsedTime,
      requestId: req.correlationId,
      userId: req.auth?.userId,
      role: req.auth?.role,
      unitId: req.auth?.activeUnitId,
    });
  });

  async function recordAudit(
    request: FastifyRequest,
    payload: {
      unitId: string;
      action: string;
      entity: string;
      entityId?: string;
      idempotencyKey?: string;
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    },
  ) {
    const req = request as RequestWithAuth;
    const body = asRecord(request.body);
    const bodyIdempotencyKey =
      body && typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined;
    return await auditRecorder.record({
      unitId: payload.unitId,
      actorId: req.auth?.userId ?? "anonymous",
      actorEmail: req.auth?.email,
      actorRole: req.auth?.role ?? "anonymous",
      action: payload.action,
      entity: payload.entity,
      entityId: payload.entityId,
      route: routePattern(request),
      method: request.method.toUpperCase(),
      requestId: req.correlationId ?? crypto.randomUUID(),
      idempotencyKey: payload.idempotencyKey ?? getIdempotencyKey(request, bodyIdempotencyKey),
      before: payload.before,
      after: payload.after,
      metadata: payload.metadata,
    });
  }

  const auditDateIso = (value: Date | string) =>
    value instanceof Date ? value.toISOString() : new Date(value).toISOString();

  function transactionalAuditContext(request: FastifyRequest): TransactionalAuditContext | undefined {
    if (backend !== "prisma") return undefined;
    const req = request as RequestWithAuth;
    const body = asRecord(request.body);
    const bodyIdempotencyKey =
      body && typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined;
    return {
      actorId: req.auth?.userId ?? "anonymous",
      actorEmail: req.auth?.email,
      actorRole: req.auth?.role ?? "anonymous",
      route: routePattern(request),
      method: request.method.toUpperCase(),
      requestId: req.correlationId ?? crypto.randomUUID(),
      idempotencyKey: getIdempotencyKey(request, bodyIdempotencyKey),
    };
  }

  function assertManagementReportAccess(request: FastifyRequest, type: ReportExportType) {
    const req = request as RequestWithAuth;
    if (req.auth && req.auth.role !== "owner") {
      throw new Error("Acesso negado");
    }
    void type;
  }

  function csvEscape(value: unknown) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function buildCsv(rows: unknown[][]) {
    return `\uFEFF${rows.map((line) => line.map(csvEscape).join(";")).join("\n")}\n`;
  }

  function csvRowsForReport(type: ReportExportType, payload: any) {
    if (type === "financial") {
      return [
        ["Data", "Tipo", "Origem", "Categoria", "Descricao", "Valor", "Forma de pagamento", "Profissional", "Cliente"],
        ...(payload.lines ?? []).map((row: any) => [
          row.date,
          row.type,
          row.originLabel,
          row.category,
          row.description,
          row.amount,
          row.paymentMethod,
          row.professionalName,
          row.customerName,
        ]),
      ];
    }
    if (type === "appointments") {
      return [
        ["Data", "Status", "Cliente", "Profissional", "Servico", "Valor"],
        ...(payload.appointments ?? []).map((row: any) => [
          row.startsAt,
          row.status,
          row.clientName,
          row.professionalName,
          row.serviceName,
          row.price,
        ]),
      ];
    }
    if (type === "product-sales") {
      return [
        ["Data", "Cliente", "Profissional", "Status", "Total", "Devolvido", "Itens"],
        ...(payload.sales ?? []).map((row: any) => [
          row.soldAt,
          row.clientName,
          row.professionalName,
          row.status,
          row.grossAmount,
          row.totalRefundedAmount,
          (row.items ?? []).map((item: any) => `${item.productName} x${item.quantity}`).join(", "),
        ]),
      ];
    }
    if (type === "stock") {
      return [
        ["Data", "Produto", "Movimentacao", "Tipo", "Origem", "Quantidade"],
        ...(payload.movements ?? []).map((row: any) => [
          row.occurredAt,
          row.productName,
          row.label,
          row.movementType,
          row.referenceType,
          row.quantity,
        ]),
      ];
    }
    if (type === "clients") {
      return [
        ["Cliente", "Status", "Visitas no periodo", "Receita no periodo", "LTV", "Ticket medio", "Ultima visita", "Acao recomendada"],
        ...(payload.clients ?? []).map((row: any) => [
          row.fullName,
          row.status,
          row.visits,
          row.revenue,
          row.ltv,
          row.averageTicket,
          row.lastVisitAt,
          row.recommendedAction,
        ]),
      ];
    }
    if (type === "professionals") {
      return [
        ["Ranking", "Profissional", "Atendimentos concluidos", "Receita servicos", "Receita produtos", "Receita total", "Ticket medio", "Comissao pendente", "Comissao paga", "Comissao total"],
        ...(payload.professionals ?? []).map((row: any) => [
          row.rank,
          row.professionalName,
          row.completedAppointments,
          row.serviceRevenue,
          row.productRevenue,
          row.totalRevenue,
          row.averageTicket,
          row.pendingCommission,
          row.paidCommission,
          row.totalCommission,
        ]),
      ];
    }
    if (type === "commissions") {
      return [
        ["Profissional", "Origem", "Base", "Comissao", "Status", "Criada em", "Paga em"],
        ...(payload.entries ?? []).map((row: any) => [
          row.professionalName,
          row.source,
          row.baseAmount,
          row.commissionAmount,
          row.status,
          row.createdAt,
          row.paidAt,
        ]),
      ];
    }
    return [
      ["Data", "Ator", "Perfil", "Acao", "Modulo", "Rota", "Metodo"],
      ...(payload.events ?? []).map((row: any) => [
        row.createdAt,
        row.actor,
        row.actorRole,
        row.action,
        row.entity,
        row.route,
        row.method,
      ]),
    ];
  }

  app.post("/auth/login", async (request) => {
    const body = authLoginSchema.parse(request.body);
    const email = body.email.trim().toLowerCase();
    const user = await authenticateLogin({
      backend,
      authUsers,
      email,
      password: body.password,
    });

    const token = issueAccessToken({
      user,
      activeUnitId: body.activeUnitId,
    });

    return {
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        unitIds: user.unitIds,
        activeUnitId: body.activeUnitId ?? user.unitIds[0],
      },
    };
  });

  // Troca token Firebase por JWT customizado (mantém dashboard sem alterações)
  app.post("/auth/firebase", async (request, reply) => {
    const body = z
      .object({ idToken: z.string().min(10) })
      .parse(request.body);

    let firebasePayload: Awaited<ReturnType<typeof verifyFirebaseIdToken>>;
    try {
      firebasePayload = await verifyFirebaseIdToken(body.idToken);
    } catch {
      reply.status(401).send({ error: "Token Firebase invalido" });
      return;
    }

    const session = await resolveFirebaseUser(
      firebasePayload.uid,
      firebasePayload.email,
      backend,
      firebasePayload.name,
    );
    if (!session) {
      reply.status(401).send({ error: "Usuario nao autorizado" });
      return;
    }

    const authUser: AuthUser = {
      id: session.userId,
      email: session.email,
      name: firebasePayload.name,
      role: session.role,
      unitIds: session.unitIds,
    };

    const token = issueAccessToken({ user: authUser, activeUnitId: session.activeUnitId });
    return {
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
      user: {
        id: authUser.id,
        email: authUser.email,
        name: authUser.name,
        role: authUser.role,
        unitIds: authUser.unitIds,
        activeUnitId: session.activeUnitId,
      },
    };
  });

  app.get("/auth/me", async (request) => {
    const req = request as RequestWithAuth;
    if (!req.auth) {
      throw new Error("Nao autenticado");
    }
    return {
      user: {
        id: req.auth.userId,
        email: req.auth.email,
        role: req.auth.role,
        unitIds: req.auth.unitIds,
        activeUnitId: req.auth.activeUnitId,
      },
      requestId: req.correlationId,
    };
  });

  app.get("/users", async (request) => {
    const query = z.object({ unitId: z.string().min(1) }).parse(request.query);
    if (backend === "prisma") {
      const rows = await prisma.user.findMany({
        where: {
          unitAccesses: {
            some: {
              unitId: query.unitId,
              isActive: true,
            },
          },
        },
        include: {
          unitAccesses: {
            where: { isActive: true },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { name: "asc" },
      });
      return {
        users: rows.map((user) => ({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isActive: user.isActive,
          unitIds: user.unitAccesses.map((access) => access.unitId),
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        })),
      };
    }

    return {
      users: authUsers
        .filter((user) => user.unitIds.includes(query.unitId))
        .map((user) => ({
          id: user.id,
          email: user.email,
          name: user.name ?? user.email,
          role: user.role,
          isActive: true,
          unitIds: user.unitIds,
        })),
    };
  });

  app.get("/audit/events", async (request) => {
    const query = auditEventsQuerySchema.parse(request.query);
    const rows = await auditRecorder.list({
      unitId: query.unitId,
      entity: query.entity,
      action: query.action,
      actorId: query.actorId,
      start: query.start ? new Date(query.start) : undefined,
      end: query.end ? new Date(query.end) : undefined,
      limit: query.limit,
    });

    return {
      events: rows,
      summary: {
        total: rows.length,
      },
    };
  });

  app.get("/reports/management/summary", async (request) => {
    const query = managementReportQuerySchema.parse(request.query);
    return await operations.getManagementSummaryReport({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
    });
  });

  app.get("/reports/management/financial", async (request) => {
    const query = managementReportQuerySchema.parse(request.query);
    return await operations.getManagementFinancialReport({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
      limit: query.limit,
    });
  });

  app.get("/reports/management/appointments", async (request) => {
    const query = managementReportQuerySchema.parse(request.query);
    return await operations.getManagementAppointmentsReport({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
      professionalId: query.professionalId,
      limit: query.limit,
    });
  });

  app.get("/reports/management/product-sales", async (request) => {
    const query = managementReportQuerySchema.parse(request.query);
    return await operations.getManagementProductSalesReport({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
      productId: query.productId,
      professionalId: query.professionalId,
      limit: query.limit,
    });
  });

  app.get("/reports/management/stock", async (request) => {
    const query = managementReportQuerySchema.parse(request.query);
    return await operations.getManagementStockReport({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
      limit: query.limit,
    });
  });

  app.get("/reports/management/professionals", async (request) => {
    const query = managementReportQuerySchema.parse(request.query);
    return await operations.getManagementProfessionalsReport({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
      professionalId: query.professionalId,
    });
  });

  app.get("/reports/management/audit", async (request) => {
    const query = managementReportQuerySchema.parse(request.query);
    return await operations.getManagementAuditReport({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
      limit: query.limit,
    });
  });

  app.get("/reports/management/export.csv", async (request, reply) => {
    const query = managementExportQuerySchema.parse(request.query);
    assertManagementReportAccess(request, query.type);
    const payload = await operations.getManagementReportForExport({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
      type: query.type,
      limit: query.limit,
    });
    const csv = buildCsv(csvRowsForReport(query.type, payload));
    const startLabel = query.start.slice(0, 10);
    const endLabel = query.end.slice(0, 10);
    reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header(
        "Content-Disposition",
        `attachment; filename="relatorio-${query.type}-${query.unitId}-${startLabel}-${endLabel}.csv"`,
      )
      .send(csv);
  });

  app.get("/health", async () => ({
    ok: true,
    authEnforced,
    audio: {
      enabled: audioTranscriptionEnabled,
      ready: Boolean(audioTranscriptionService),
      provider: configuredAsrProvider || "none",
    },
  }));
  app.get("/", async (_request, reply) => {
    return reply.sendFile("index.html");
  });
  app.get("/login", async (_request, reply) => {
    return reply.sendFile("login.html");
  });
  app.get("/agendamento", async (_request, reply) => {
    return reply.sendFile("booking.html");
  });
  app.get("/login.html", async (_request, reply) => {
    return reply.redirect("/login");
  });
  app.get("/booking.html", async (_request, reply) => {
    return reply.redirect("/agendamento");
  });
  app.get("/catalog", async (request) => {
    const query = z.object({ unitId: z.string().min(1) }).parse(request.query);
    return await operations.getCatalog({ unitId: query.unitId });
  });

  app.get("/clients", async (request) => {
    const query = clientsListQuerySchema.parse(request.query);
    if (!("listClients" in operations) || typeof operations.listClients !== "function") {
      throw new Error("Listagem de clientes indisponivel");
    }
    return await operations.listClients({
      unitId: query.unitId,
      search: query.search,
      limit: query.limit,
    });
  });

  app.post("/clients", async (request) => {
    const body = clientCreateSchema.parse(request.body);
    if (!("createClient" in operations) || typeof operations.createClient !== "function") {
      throw new Error("Cadastro de clientes indisponivel");
    }

    const result = await operations.createClient({
      unitId: body.unitId,
      name: body.name,
      phone: body.phone,
      email: body.email,
      birthDate: body.birthDate ? new Date(`${body.birthDate}T00:00:00.000Z`) : undefined,
      notes: body.notes,
      status: body.status,
      tags: body.tags,
    });

    await recordAudit(request, {
      unitId: body.unitId,
      action: "CLIENT_CREATED",
      entity: "client",
      entityId: result.client.id,
      after: {
        phone: result.client.phone,
        status: result.client.status,
      },
    });
    return result;
  });

  app.get("/agenda/day", async (request) => {
    const query = z
      .object({
        unitId: z.string().min(1),
        date: z.string().datetime(),
      })
      .parse(request.query);

    const date = new Date(query.date);
    const appointments = await operations.getDailyAgenda({
      unitId: query.unitId,
      date,
    });
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    const blocks = await getActiveAppointmentBlocksForAgenda({ unitId: query.unitId, start, end });
    const blockEvents = buildAppointmentBlockEvents(blocks);
    const workingHours = await resolveWorkingHoursForUnit(query.unitId, operations);
    return { appointments, blocks, blockEvents, workingHours };
  });

  app.get("/agenda/range", async (request) => {
    const query = z
      .object({
        unitId: z.string().min(1),
        start: z.string().datetime(),
        end: z.string().datetime(),
      })
      .parse(request.query);

    if (!("getAgendaRange" in operations) || typeof operations.getAgendaRange !== "function") {
      throw new Error("Operacao de agenda por periodo indisponivel");
    }

    const start = new Date(query.start);
    const end = new Date(query.end);
    const appointments = await operations.getAgendaRange({
      unitId: query.unitId,
      start,
      end,
    });
    const blocks = await getActiveAppointmentBlocksForAgenda({ unitId: query.unitId, start, end });
    const blockEvents = buildAppointmentBlockEvents(blocks);
    const workingHours = await resolveWorkingHoursForUnit(query.unitId, operations);
    return { appointments, blocks, blockEvents, workingHours };
  });

  app.get("/dashboard", async (request) => {
    const query = z
      .object({
        unitId: z.string().min(1),
        date: z.string().datetime(),
      })
      .parse(request.query);

    return await operations.getDashboard({
      unitId: query.unitId,
      date: new Date(query.date),
    });
  });

  app.post("/dashboard/suggestions/:id/telemetry", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = dashboardSuggestionTelemetrySchema.parse(request.body);
    if (
      !("recordDashboardSuggestionTelemetry" in operations) ||
      typeof operations.recordDashboardSuggestionTelemetry !== "function"
    ) {
      throw new Error("Telemetria de dashboard indisponivel");
    }
    return await operations.recordDashboardSuggestionTelemetry({
      unitId: body.unitId,
      suggestionId: params.id,
      actionType: body.actionType,
      outcome: body.outcome,
      estimatedImpact: body.estimatedImpact,
      realizedRevenue: body.realizedRevenue,
      sourceModule: body.sourceModule,
      playbookType: body.playbookType,
      note: body.note,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
    });
  });

  app.get("/goals/current", async (request) => {
    const query = goalsCurrentQuerySchema.parse(request.query);
    if (!("getCurrentGoal" in operations) || typeof operations.getCurrentGoal !== "function") {
      throw new Error("Consulta de metas indisponivel");
    }

    return await operations.getCurrentGoal({
      unitId: query.unitId,
      month: query.month,
      year: query.year,
    });
  });

  app.post("/goals", async (request) => {
    const body = goalsCreateSchema.parse(request.body);
    if (!("createGoal" in operations) || typeof operations.createGoal !== "function") {
      throw new Error("Cadastro de metas indisponivel");
    }

    const result = await operations.createGoal({
      unitId: body.unitId,
      month: body.month,
      year: body.year,
      revenueTarget: body.revenueTarget,
      appointmentsTarget: body.appointmentsTarget,
      averageTicketTarget: body.averageTicketTarget,
      notes: body.notes,
    });

    await recordAudit(request, {
      unitId: body.unitId,
      action: "GOAL_CREATED",
      entity: "goal",
      entityId: result.goal.id,
      after: {
        month: result.goal.month,
        year: result.goal.year,
        revenueTarget: result.goal.revenueTarget,
        appointmentsTarget: result.goal.appointmentsTarget,
      },
    });
    return result;
  });

  app.patch("/goals/:id", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = goalsUpdateSchema.parse(request.body);
    if (!("updateGoal" in operations) || typeof operations.updateGoal !== "function") {
      throw new Error("Atualizacao de metas indisponivel");
    }

    const result = await operations.updateGoal({
      unitId: body.unitId,
      goalId: params.id,
      month: body.month,
      year: body.year,
      revenueTarget: body.revenueTarget,
      appointmentsTarget: body.appointmentsTarget,
      averageTicketTarget: body.averageTicketTarget,
      notes: body.notes,
    });

    await recordAudit(request, {
      unitId: body.unitId,
      action: "GOAL_UPDATED",
      entity: "goal",
      entityId: params.id,
      after: {
        month: result.goal.month,
        year: result.goal.year,
        revenueTarget: result.goal.revenueTarget,
        appointmentsTarget: result.goal.appointmentsTarget,
      },
    });
    return result;
  });

  app.get("/performance/summary", async (request) => {
    const query = performanceMonthQuerySchema.parse(request.query);
    if (
      !("getPerformanceSummary" in operations) ||
      typeof operations.getPerformanceSummary !== "function"
    ) {
      throw new Error("Resumo de performance indisponivel");
    }

    return await operations.getPerformanceSummary({
      unitId: query.unitId,
      month: query.month,
      year: query.year,
    });
  });

  app.get("/performance/professionals", async (request) => {
    const query = performanceMonthQuerySchema.parse(request.query);
    if (
      !("getPerformanceProfessionals" in operations) ||
      typeof operations.getPerformanceProfessionals !== "function"
    ) {
      throw new Error("Performance por profissionais indisponivel");
    }

    return await operations.getPerformanceProfessionals({
      unitId: query.unitId,
      month: query.month,
      year: query.year,
    });
  });

  app.get("/performance/services", async (request) => {
    const query = performanceMonthQuerySchema.parse(request.query);
    if (
      !("getPerformanceServices" in operations) ||
      typeof operations.getPerformanceServices !== "function"
    ) {
      throw new Error("Performance por servicos indisponivel");
    }

    return await operations.getPerformanceServices({
      unitId: query.unitId,
      month: query.month,
      year: query.year,
    });
  });

  app.post("/appointments", async (request) => {
    const body = scheduleSchema.parse(request.body);
    const appointment = await operations.schedule({
      ...body,
      startsAt: new Date(body.startsAt),
    });
    await recordAudit(request, {
      unitId: appointment.unitId,
      action: "APPOINTMENT_CREATED",
      entity: "appointment",
      entityId: appointment.id,
      after: {
        startsAt: appointment.startsAt.toISOString(),
        professionalId: appointment.professionalId,
        clientId: appointment.clientId,
      },
    });
    return { appointment };
  });

  app.post("/appointments/services/preview", async (request) => {
    const body = appointmentServicesPreviewSchema.parse(request.body);
    if (
      !("previewAppointmentServices" in operations) ||
      typeof operations.previewAppointmentServices !== "function"
    ) {
      throw new Error("Resumo de servicos do agendamento indisponivel");
    }
    const summary = await operations.previewAppointmentServices(body);
    return { summary };
  });

  app.post("/appointments/suggestions", async (request) => {
    const body = suggestionsSchema.parse(request.body);
    const suggestions = await operations.suggestAppointmentAlternatives({
      unitId: body.unitId,
      professionalId: body.professionalId,
      serviceId: body.serviceId,
      serviceIds: body.serviceIds,
      startsAt: new Date(body.startsAt),
      windowHours: body.windowHours,
    });
    return { suggestions };
  });

  app.post("/appointments/walk-in", async (request, reply) => {
    const body = walkInSchema.parse(request.body);
    const idempotencyKey = requireIdempotencyKey(request, body.idempotencyKey);
    let appointment;
    try {
      appointment = await operations.createWalkInAppointment({
        unitId: body.unitId,
        clientName: body.clientName,
        clientPhone: body.clientPhone,
        professionalId: body.professionalId,
        serviceId: body.serviceId,
        serviceIds: body.serviceIds,
        startedAt: body.startedAt ? new Date(body.startedAt) : undefined,
        confirmOutOfHours: body.confirmOutOfHours,
        changedBy: body.changedBy,
        idempotencyKey,
        idempotencyPayloadHash: getIdempotencyPayloadHash({ route: "/appointments/walk-in", body }),
        audit: transactionalAuditContext(request),
      });
    } catch (error) {
      const outOfHours = error as Error & {
        code?: string;
        businessHours?: unknown;
        currentLocalTime?: string;
        requiresConfirmation?: boolean;
      };
      if (outOfHours.code === "WALK_IN_OUTSIDE_BUSINESS_HOURS") {
        reply.status(409).send({
          code: outOfHours.code,
          message: outOfHours.message,
          businessHours: outOfHours.businessHours,
          currentLocalTime: outOfHours.currentLocalTime,
          requiresConfirmation: true,
        });
        return;
      }
      throw error;
    }
    if (backend !== "prisma") await recordAudit(request, {
      unitId: body.unitId,
      action: "WALK_IN_APPOINTMENT_CREATED",
      entity: "appointment",
      entityId: appointment.id,
      after: {
        origin: "Atendimento sem agendamento",
        status: appointment.status,
        startsAt: auditDateIso(appointment.startsAt),
        endsAt: auditDateIso(appointment.endsAt),
        outsideBusinessHours: Boolean(body.confirmOutOfHours),
        confirmOutOfHours: Boolean(body.confirmOutOfHours),
      },
    });
    return { appointment };
  });

  app.post("/appointments/fitting", async (request) => {
    const body = fittingSchema.parse(request.body);
    const idempotencyKey = requireIdempotencyKey(request, body.idempotencyKey);
    const result = await operations.createFittingAppointment({
      unitId: body.unitId,
      clientName: body.clientName,
      clientPhone: body.clientPhone,
      professionalId: body.professionalId,
      serviceId: body.serviceId,
      serviceIds: body.serviceIds,
      startsAt: new Date(body.startsAt),
      confirmRisk: body.confirmRisk,
      changedBy: body.changedBy,
      idempotencyKey,
      idempotencyPayloadHash: getIdempotencyPayloadHash({ route: "/appointments/fitting", body }),
      audit: transactionalAuditContext(request),
    });
    return result;
  });

  app.post("/appointments/blocks", async (request) => {
    const body = appointmentBlockSchema.parse(request.body);
    const idempotencyKey = requireIdempotencyKey(request, body.idempotencyKey);
    const block = await operations.createAppointmentBlock({
      unitId: body.unitId,
      professionalId: body.professionalId,
      startsAt: new Date(body.startsAt),
      endsAt: new Date(body.endsAt),
      reason: body.reason,
      isFullDay: body.isFullDay,
      changedBy: body.changedBy,
      idempotencyKey,
      idempotencyPayloadHash: getIdempotencyPayloadHash({ route: "/appointments/blocks", body }),
    });
    if (backend !== "prisma") await recordAudit(request, {
      unitId: body.unitId,
      action: block.isFullDay ? "APPOINTMENT_DAY_BLOCKED" : "APPOINTMENT_TIME_BLOCKED",
      entity: "appointment_block",
      entityId: block.id,
      after: (block ?? {}) as Record<string, unknown>,
    });
    return { block };
  });

  app.post("/appointments/blocks/:id/cancel", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = appointmentBlockCancelSchema.parse(request.body);
    const idempotencyKey = requireIdempotencyKey(request, body.idempotencyKey);
    const block = await operations.cancelAppointmentBlock({
      unitId: body.unitId,
      blockId: params.id,
      changedBy: body.changedBy,
      reason: body.reason,
      idempotencyKey,
      idempotencyPayloadHash: getIdempotencyPayloadHash({ route: "/appointments/blocks/:id/cancel", params, body }),
    });
    if (backend !== "prisma") await recordAudit(request, {
      unitId: body.unitId,
      action: "APPOINTMENT_BLOCK_CANCELLED",
      entity: "appointment_block",
      entityId: params.id,
      after: (block ?? {}) as Record<string, unknown>,
    });
    return { block };
  });

  app.get("/appointments", async (request) => {
    const query = appointmentsListQuerySchema.parse(request.query);
    const now = new Date();
    let start = query.start ? new Date(query.start) : undefined;
    let end = query.end ? new Date(query.end) : undefined;

    if (query.period) {
      if (query.period === "today") {
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
      } else if (query.period === "tomorrow") {
        start = new Date(now);
        start.setDate(start.getDate() + 1);
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setHours(23, 59, 59, 999);
      } else if (query.period === "week") {
        start = new Date(now);
        const day = start.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        start.setDate(start.getDate() + diffToMonday);
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(end.getDate() + 6);
        end.setHours(23, 59, 59, 999);
      } else if (query.period === "month") {
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      }
    }

    const allowedAppointmentStatuses = [
      "SCHEDULED",
      "CONFIRMED",
      "IN_SERVICE",
      "COMPLETED",
      "CANCELLED",
      "NO_SHOW",
      "BLOCKED",
    ] as const;
    const invalidStatus = (query.status ?? []).find(
      (status) => !allowedAppointmentStatuses.includes(status as AppointmentStatus),
    );
    if (invalidStatus) {
      throw new Error(`Status invalido para agendamentos: ${invalidStatus}`);
    }
    const statusValues = (query.status ?? []) as AppointmentStatus[];

    if (!("getAppointments" in operations) || typeof operations.getAppointments !== "function") {
      throw new Error("Listagem de agendamentos indisponivel");
    }

    const appointments = await operations.getAppointments({
      unitId: query.unitId,
      start,
      end,
      status: statusValues.length ? statusValues : undefined,
      clientId: query.clientId,
      professionalId: query.professionalId,
      serviceId: query.serviceId,
      search: query.search,
    });
    const blocks = await getActiveAppointmentBlocksForAgenda({ unitId: query.unitId, start, end });
    const blockEvents = buildAppointmentBlockEvents(blocks);
    const workingHours = await resolveWorkingHoursForUnit(query.unitId, operations);
    return { appointments, blocks, blockEvents, workingHours };
  });

  app.get("/appointments/:id", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const req = request as RequestWithAuth;
    if (
      !("getAppointmentById" in operations) ||
      typeof operations.getAppointmentById !== "function"
    ) {
      throw new Error("Detalhe de agendamento indisponivel");
    }
    const appointment = await operations.getAppointmentById({
      appointmentId: params.id,
      unitId: req.auth?.activeUnitId,
    });
    const workingHours = await resolveWorkingHoursForUnit(req.auth?.activeUnitId || appointment.unitId, operations);
    return { appointment, workingHours };
  });

  app.patch("/appointments/:id", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = appointmentPatchSchema.parse(request.body);
    const req = request as RequestWithAuth;
    const confirmationIdempotencyKey =
      body.confirmation === true ? requireIdempotencyKey(request, body.idempotencyKey) : undefined;
    if (
      !("updateAppointment" in operations) ||
      typeof operations.updateAppointment !== "function"
    ) {
      throw new Error("Atualizacao de agendamento indisponivel");
    }
    const appointment = await operations.updateAppointment({
      appointmentId: params.id,
      unitId: req.auth?.activeUnitId,
      startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
      clientId: body.clientId,
      professionalId: body.professionalId,
      serviceId: body.serviceId,
      serviceIds: body.serviceIds,
      notes: body.notes,
      isFitting: body.isFitting,
      confirmation: body.confirmation,
      idempotencyKey: confirmationIdempotencyKey,
      idempotencyPayloadHash: confirmationIdempotencyKey
        ? getIdempotencyPayloadHash({ route: "/appointments/:id", params, body })
        : undefined,
      changedBy: body.changedBy,
    });
    await recordAudit(request, {
      unitId: appointment.unitId,
      action: "APPOINTMENT_UPDATED",
      entity: "appointment",
      entityId: appointment.id,
      after: {
        startsAt: appointment.startsAt.toISOString(),
        status: appointment.status,
        professionalId: appointment.professionalId,
        clientId: appointment.clientId,
        serviceId: appointment.serviceId,
      },
    });
    return { appointment };
  });

  app.patch("/appointments/:id/services", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = appointmentServicesInServiceSchema.parse(request.body);
    const req = request as RequestWithAuth;
    const idempotencyKey = requireIdempotencyKey(request, body.idempotencyKey);
    const appointment = await operations.updateAppointmentServicesInService({
      appointmentId: params.id,
      unitId: body.unitId ?? req.auth?.activeUnitId,
      serviceId: body.serviceId,
      serviceIds: body.serviceIds,
      confirmRisk: body.confirmRisk,
      changedBy: body.changedBy,
      idempotencyKey,
      idempotencyPayloadHash: getIdempotencyPayloadHash({ route: "/appointments/:id/services", params, body }),
    });
    if (backend !== "prisma") await recordAudit(request, {
      unitId: appointment.unitId,
      action: "APPOINTMENT_SERVICES_CHANGED_IN_SERVICE",
      entity: "appointment",
      entityId: appointment.id,
      after: {
        serviceId: appointment.serviceId,
        totalPriceSnapshot: appointment.totalPriceSnapshot,
        effectiveDurationMinSnapshot: appointment.effectiveDurationMinSnapshot,
        endsAt: appointment.endsAt.toISOString(),
      },
    });
    return { appointment };
  });

  app.patch("/appointments/:id/reschedule", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = rescheduleSchema.parse(request.body);
    const req = request as RequestWithAuth;
    const idempotencyKey = requireIdempotencyKey(request, body.idempotencyKey);

    const appointment = await operations.reschedule({
      appointmentId: params.id,
      unitId: req.auth?.activeUnitId,
      startsAt: new Date(body.startsAt),
      changedBy: body.changedBy,
      idempotencyKey,
      idempotencyPayloadHash: getIdempotencyPayloadHash({ route: "/appointments/:id/reschedule", params, body }),
      audit: transactionalAuditContext(request),
    });
    if (backend !== "prisma") await recordAudit(request, {
      unitId: appointment.unitId,
      action: "APPOINTMENT_RESCHEDULED",
      entity: "appointment",
      entityId: appointment.id,
      after: {
        startsAt: appointment.startsAt.toISOString(),
        endsAt: appointment.endsAt.toISOString(),
      },
    });
    return { appointment };
  });

  app.patch("/appointments/:id/status", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = statusSchema.parse(request.body);
    const req = request as RequestWithAuth;
    if (body.status === "NO_SHOW" && req.auth?.role !== "owner") {
      throw new Error("Apenas owner pode marcar falta");
    }
    const idempotencyKey = requireIdempotencyKey(request, body.idempotencyKey);

    const appointment = await operations.updateStatus({
      appointmentId: params.id,
      unitId: req.auth?.activeUnitId,
      status: body.status,
      changedBy: body.changedBy,
      reason: body.reason,
      idempotencyKey,
      idempotencyPayloadHash: getIdempotencyPayloadHash({ route: "/appointments/:id/status", params, body }),
      audit: transactionalAuditContext(request),
    });
    const auditAction =
      appointment.status === "CONFIRMED"
        ? "APPOINTMENT_CONFIRMED"
        : appointment.status === "IN_SERVICE"
          ? "APPOINTMENT_STARTED"
          : appointment.status === "CANCELLED"
            ? "APPOINTMENT_CANCELLED"
            : appointment.status === "NO_SHOW"
              ? "APPOINTMENT_NO_SHOW"
              : "APPOINTMENT_STATUS_UPDATED";
    if (backend !== "prisma") await recordAudit(request, {
      unitId: appointment.unitId,
      action: auditAction,
      entity: "appointment",
      entityId: appointment.id,
      after: {
        status: appointment.status,
        reason: body.reason ?? null,
      },
    });
    return { appointment };
  });

  app.post("/appointments/:id/delay", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = delaySchema.parse(request.body);
    const req = request as RequestWithAuth;
    const idempotencyKey = requireIdempotencyKey(request, body.idempotencyKey);
    if (
      !("recordAppointmentDelay" in operations) ||
      typeof operations.recordAppointmentDelay !== "function"
    ) {
      throw new Error("Registro de atraso indisponivel");
    }
    const appointment = await operations.recordAppointmentDelay({
      appointmentId: params.id,
      unitId: req.auth?.activeUnitId,
      minutesLate: body.minutesLate,
      changedBy: body.changedBy,
      reason: body.reason,
      recordedAt: body.recordedAt ? new Date(body.recordedAt) : undefined,
      idempotencyKey,
      idempotencyPayloadHash: getIdempotencyPayloadHash({ route: "/appointments/:id/delay", params, body }),
      audit: transactionalAuditContext(request),
    });
    if (backend !== "prisma") await recordAudit(request, {
      unitId: appointment.unitId,
      action: "APPOINTMENT_DELAY_RECORDED",
      entity: "appointment",
      entityId: appointment.id,
      after: {
        status: appointment.status,
        minutesLate: body.minutesLate,
        reason: body.reason ?? null,
      },
    });
    return { appointment, message: "Atraso registrado." };
  });

  app.post("/appointments/:id/complete", async (request, reply) => {
    z.object({ id: z.string().min(1) }).parse(request.params);
    completeSchema.parse(request.body);
    return reply.status(410).send({
      error:
        "Rota legada desativada. Use POST /appointments/:id/checkout para concluir atendimento com financeiro.",
    });
  });

  app.post("/appointments/:id/checkout", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = checkoutSchema.parse(request.body);
    const req = request as RequestWithAuth;
    const idempotencyKey = requireIdempotencyKey(request, body.idempotencyKey);
    const result = await operations.checkoutAppointment({
      appointmentId: params.id,
      unitId: req.auth?.activeUnitId,
      changedBy: body.changedBy,
      completedAt: body.completedAt ? new Date(body.completedAt) : new Date(),
      paymentMethod: body.paymentMethod ?? body.payments?.[0]?.method ?? "PIX",
      payments: body.payments?.map((payment) => ({
        ...payment,
        paidAt: payment.paidAt ? new Date(payment.paidAt) : undefined,
      })),
      expectedTotal: body.expectedTotal,
      notes: body.notes,
      products: body.products ?? [],
      idempotencyKey,
      idempotencyPayloadHash: getIdempotencyPayloadHash({ route: "/appointments/:id/checkout", params, body }),
      audit: transactionalAuditContext(request),
    });
    if (backend !== "prisma") await recordAudit(request, {
      unitId: result.appointment.unitId,
      action: "APPOINTMENT_CHECKOUT_COMPLETED",
      entity: "appointment_checkout",
      entityId: result.appointment.id,
      after: {
        productItems: Array.isArray(body.products)
          ? body.products.reduce((acc, item) => acc + Number(item.quantity || 0), 0)
          : 0,
        paymentMethod: body.paymentMethod ?? "NAO_INFORMADO",
        totalService: Number(result.serviceRevenue?.amount ?? 0),
        totalProduct: Number(result.productRevenue?.amount ?? 0),
        clientFrequency90d: Number(result.clientMetrics?.frequency90d ?? 0),
      },
    });
    return result;
  });

  app.post("/appointments/:id/refund", async (request, reply) => {
    if (process.env.BLOCK_COMMERCIAL_REFUNDS === "true") {
      return reply.status(410).send({
        error:
          "Estorno comercial de atendimento desativado para esta unidade. Use correcao administrativa auditada.",
      });
    }
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = appointmentRefundSchema.parse(request.body);
    const req = request as RequestWithAuth;
    const idempotencyKey = requireIdempotencyKey(request, body.idempotencyKey);
    const result = await operations.refundAppointment({
      appointmentId: params.id,
      unitId: req.auth?.activeUnitId ?? body.unitId,
      changedBy: body.changedBy,
      reason: body.reason,
      refundedAt: new Date(body.refundedAt),
      idempotencyKey,
      idempotencyPayloadHash: getIdempotencyPayloadHash({ route: "/appointments/:id/refund", params, body }),
      audit: transactionalAuditContext(request),
    });
    if (backend !== "prisma") await recordAudit(request, {
      unitId: body.unitId,
      action: "APPOINTMENT_REFUNDED",
      entity: "appointment_refund",
      entityId: result.refund.id,
      after: {
        appointmentId: params.id,
        amount: result.financialEntry.amount,
        reason: body.reason,
      },
    });
    const canceledCommissions = (result as {
      canceledCommissions?: Array<{
        id: string;
        appointmentId?: string;
        commissionAmount?: number;
        status?: string;
      }>;
    }).canceledCommissions;
    if (backend !== "prisma" && Array.isArray(canceledCommissions)) {
      for (const commission of canceledCommissions) {
        await recordAudit(request, {
          unitId: body.unitId,
          action: "COMMISSION_CANCELED_DUE_TO_APPOINTMENT_REFUND",
          entity: "commission",
          entityId: commission.id,
          before: { status: "PENDING" },
          after: {
            status: "CANCELED",
            appointmentId: commission.appointmentId ?? params.id,
            refundId: result.refund.id,
            amount: commission.commissionAmount,
          },
        });
      }
    }
    return result;
  });

  app.post("/sales/products", async (request) => {
    const body = productSaleSchema.parse(request.body);
    const idempotencyKey = requireIdempotencyKey(request, body.idempotencyKey);
    const result = await operations.registerProductSale({
      unitId: body.unitId,
      clientId: body.clientId,
      professionalId: body.professionalId,
      paymentMethod: body.paymentMethod,
      soldAt: new Date(body.soldAt),
      items: body.items,
      idempotencyKey,
      idempotencyPayloadHash: getIdempotencyPayloadHash({ route: "/sales/products", body }),
      audit: transactionalAuditContext(request),
    });
    if (backend !== "prisma") await recordAudit(request, {
      unitId: body.unitId,
      action: "PRODUCT_SALE_REGISTERED",
      entity: "product_sale",
      entityId: result.sale.id,
      after: {
        grossAmount: result.sale.grossAmount,
        items: result.sale.items.length,
      },
    });
    return result;
  });

  app.get("/sales/products", async (request) => {
    const query = productSalesHistoryQuerySchema.parse(request.query);
    if (!("listProductSales" in operations) || typeof operations.listProductSales !== "function") {
      throw new Error("Historico de vendas indisponivel");
    }
    return await operations.listProductSales({
      unitId: query.unitId,
      start: query.start ? new Date(query.start) : undefined,
      end: query.end ? new Date(query.end) : undefined,
      clientId: query.clientId,
      professionalId: query.professionalId,
      productId: query.productId,
      search: query.search,
      status: query.status,
      limit: query.limit,
    });
  });

  app.post("/sales/products/:id/refund", async (request, reply) => {
    if (process.env.BLOCK_COMMERCIAL_REFUNDS === "true") {
      return reply.status(410).send({
        error:
          "Devolucao comercial de produto desativada para esta unidade. Use correcao administrativa auditada.",
      });
    }
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = productSaleRefundSchema.parse(request.body);
    const idempotencyKey = requireIdempotencyKey(request, body.idempotencyKey);
    const result = await operations.refundProductSale({
      productSaleId: params.id,
      unitId: body.unitId,
      changedBy: body.changedBy,
      reason: body.reason,
      refundedAt: new Date(body.refundedAt),
      items: body.items,
      idempotencyKey,
      idempotencyPayloadHash: getIdempotencyPayloadHash({ route: "/sales/products/:id/refund", params, body }),
      audit: transactionalAuditContext(request),
    });
    if (backend !== "prisma") await recordAudit(request, {
      unitId: body.unitId,
      action: "PRODUCT_SALE_REFUNDED",
      entity: "product_sale_refund",
      entityId: result.refund.id,
      after: {
        productSaleId: params.id,
        amount: result.financialEntry.amount,
        items: body.items.length,
      },
    });
    const canceledCommissions = (result as {
      canceledCommissions?: Array<{
        id: string;
        status: string;
        commissionAmount: number;
      }>;
    }).canceledCommissions;
    if (backend !== "prisma" && Array.isArray(canceledCommissions)) {
      for (const commission of canceledCommissions) {
        await recordAudit(request, {
          unitId: body.unitId,
          action: "PRODUCT_COMMISSION_CANCELED_BY_REFUND",
          entity: "commission",
          entityId: commission.id,
          before: { status: "PENDING" },
          after: {
            status: commission.status,
            productSaleId: params.id,
            refundId: result.refund.id,
            amount: commission.commissionAmount,
          },
        });
      }
    }
    return result;
  });

  app.post("/financial/manual-entry", async (request) => {
    const body = manualFinancialEntrySchema.parse(request.body);
    const idempotencyKey = requireIdempotencyKey(request, body.idempotencyKey);
    const entry = await operations.registerManualFinancialEntry({
      unitId: body.unitId,
      kind: body.kind,
      amount: body.amount,
      occurredAt: new Date(body.occurredAt),
      description: body.description,
      changedBy: body.changedBy,
      idempotencyKey,
      idempotencyPayloadHash: getIdempotencyPayloadHash({ route: "/financial/manual-entry", body }),
      audit: transactionalAuditContext(request),
    });
    if (backend !== "prisma") await recordAudit(request, {
      unitId: body.unitId,
      action: "FINANCIAL_MANUAL_ENTRY_REGISTERED",
      entity: "financial_entry",
      entityId: entry.id,
      after: {
        kind: entry.kind,
        amount: entry.amount,
      },
    });
    return { entry };
  });

  app.get("/financial/summary", async (request) => {
    const query = financialSummaryQuerySchema.parse(request.query);
    return await operations.getFinancialSummary({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
      compareStart: query.compareStart ? new Date(query.compareStart) : undefined,
      compareEnd: query.compareEnd ? new Date(query.compareEnd) : undefined,
    });
  });

  app.get("/financial/transactions", async (request) => {
    const query = financialTransactionsQuerySchema.parse(request.query);
    return await operations.getFinancialTransactions({
      unitId: query.unitId ?? query.businessId!,
      start: new Date(query.start),
      end: new Date(query.end),
      type: query.type,
      category: query.category,
      paymentMethod: query.paymentMethod,
      source: query.source,
      professionalId: query.professionalId,
      customerId: query.customerId,
      search: query.search,
      limit: query.limit,
    });
  });

  app.post("/financial/transactions", async (request) => {
    const body = financialTransactionCreateSchema.parse(request.body);
    const idempotencyKey = requireIdempotencyKey(request, body.idempotencyKey);
    const transaction = await operations.createFinancialTransaction({
      unitId: body.unitId,
      type: body.type,
      amount: body.amount,
      date: new Date(body.date),
      category: body.category,
      description: body.description,
      paymentMethod: body.paymentMethod,
      source: body.source,
      appointmentId: body.appointmentId,
      productSaleId: body.productSaleId,
      professionalId: body.professionalId,
      customerId: body.customerId,
      notes: body.notes,
      changedBy: body.changedBy,
      idempotencyKey,
      idempotencyPayloadHash: getIdempotencyPayloadHash({ route: "/financial/transactions", body }),
      audit: transactionalAuditContext(request),
    });
    if (backend !== "prisma") await recordAudit(request, {
      unitId: body.unitId,
      action: "FINANCIAL_TRANSACTION_CREATED",
      entity: "financial_transaction",
      entityId: transaction.id,
      after: {
        type: transaction.kind,
        amount: transaction.amount,
        category: transaction.category,
      },
    });
    return { transaction };
  });

  app.patch("/financial/transactions/:id", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = financialTransactionUpdateSchema.parse(request.body);
    const transaction = await operations.updateFinancialTransaction({
      unitId: body.unitId,
      id: params.id,
      type: body.type,
      amount: body.amount,
      date: body.date ? new Date(body.date) : undefined,
      category: body.category,
      description: body.description,
      paymentMethod: body.paymentMethod,
      professionalId: body.professionalId,
      customerId: body.customerId,
      notes: body.notes,
      changedBy: body.changedBy,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "FINANCIAL_TRANSACTION_UPDATED",
      entity: "financial_transaction",
      entityId: transaction.id,
      after: {
        type: transaction.kind,
        amount: transaction.amount,
        category: transaction.category,
      },
    });
    return { transaction };
  });

  app.delete("/financial/transactions/:id", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({ unitId: z.string().min(1), changedBy: z.string().min(1) }).parse(request.body);
    const result = await operations.deleteFinancialTransaction({
      unitId: body.unitId,
      id: params.id,
      changedBy: body.changedBy,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "FINANCIAL_TRANSACTION_DELETED",
      entity: "financial_transaction",
      entityId: params.id,
      after: {
        deleted: true,
      },
    });
    return result;
  });

  app.get("/financial/entries", async (request) => {
    const query = z
      .object({
        unitId: z.string().min(1),
        start: z.string().datetime(),
        end: z.string().datetime(),
        kind: z.enum(["INCOME", "EXPENSE"]).optional(),
      })
      .parse(request.query);

    return await operations.getFinancialEntries({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
      kind: query.kind,
    });
  });

  app.get("/financial/management/overview", async (request) => {
    const query = financialManagementOverviewQuerySchema.parse(request.query);
    return await operations.getFinancialManagementOverview({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
      compareStart: query.compareStart ? new Date(query.compareStart) : undefined,
      compareEnd: query.compareEnd ? new Date(query.compareEnd) : undefined,
    });
  });

  app.get("/financial/commissions", async (request) => {
    const query = financialCommissionsQuerySchema.parse(request.query);
    return await operations.getFinancialCommissions({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
      professionalId: query.professionalId,
      status: query.status,
      limit: query.limit,
    });
  });

  app.patch("/financial/commissions/:id/pay", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = financialCommissionPaySchema.parse(request.body);
    const idempotencyKey = requireIdempotencyKey(request, body.idempotencyKey);
    const result = await operations.markFinancialCommissionAsPaid({
      unitId: body.unitId,
      id: params.id,
      paidAt: body.paidAt ? new Date(body.paidAt) : undefined,
      changedBy: body.changedBy,
      idempotencyKey,
      idempotencyPayloadHash: getIdempotencyPayloadHash({ route: "/financial/commissions/:id/pay", params, body }),
      audit: transactionalAuditContext(request),
    });
    if (backend !== "prisma") await recordAudit(request, {
      unitId: body.unitId,
      action: "FINANCIAL_COMMISSION_MARKED_PAID",
      entity: "financial_commission",
      entityId: params.id,
      after: result,
    });
    return result;
  });

  app.post("/financial/checkout-payments/:id/correct", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = checkoutPaymentCorrectionSchema.parse(request.body);
    const idempotencyKey = requireIdempotencyKey(request, body.idempotencyKey);
    const result = await operations.correctCheckoutPayment({
      unitId: body.unitId,
      paymentId: params.id,
      reason: body.reason,
      responsible: body.responsible,
      correctedAt: body.correctedAt ? new Date(body.correctedAt) : undefined,
      idempotencyKey,
      idempotencyPayloadHash: getIdempotencyPayloadHash({ route: "/financial/checkout-payments/:id/correct", params, body }),
      audit: transactionalAuditContext(request),
    });
    if (backend !== "prisma") await recordAudit(request, {
      unitId: body.unitId,
      action: "CHECKOUT_PAYMENT_ADMIN_CORRECTED",
      entity: "checkout_payment",
      entityId: params.id,
      after: result,
    });
    return result;
  });

  app.get("/financial/reports", async (request) => {
    const query = financialReportsQuerySchema.parse(request.query);
    return await operations.getFinancialReports({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
    });
  });

  app.post("/financial/daily-closing", async (request) => {
    const body = dailyClosingSchema.parse(request.body);
    const idempotencyKey = requireIdempotencyKey(request, body.idempotencyKey);
    const result = await operations.closeDaily({
      unitId: body.unitId,
      businessDate: new Date(`${body.businessDate}T00:00:00.000-03:00`),
      informedCash: body.informedCash,
      informedPix: body.informedPix,
      informedDebit: body.informedDebit,
      informedCredit: body.informedCredit,
      notes: body.notes,
      responsible: body.responsible,
      idempotencyKey,
      idempotencyPayloadHash: getIdempotencyPayloadHash({ route: "/financial/daily-closing", body }),
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "DAILY_CLOSING_CLOSED",
      entity: "daily_closing",
      entityId: result.closing.id,
      after: (result.closing ?? {}) as Record<string, unknown>,
    });
    return result;
  });

  app.post("/financial/daily-closing/:id/reopen", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = dailyClosingReopenSchema.parse(request.body);
    const result = await operations.reopenDailyClosing({
      unitId: body.unitId,
      closingId: params.id,
      reopenedBy: body.reopenedBy,
      reason: body.reason,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "DAILY_CLOSING_REOPENED",
      entity: "daily_closing",
      entityId: params.id,
      after: (result.closing ?? {}) as Record<string, unknown>,
    });
    return result;
  });

  app.get("/inventory", async (request) => {
    const query = inventoryQuerySchema.parse(request.query);
    if (!("getInventory" in operations) || typeof operations.getInventory !== "function") {
      throw new Error("Modulo de estoque indisponivel");
    }
    return await operations.getInventory({
      unitId: query.unitId,
      search: query.search,
      category: query.category,
      status: query.status,
      limit: query.limit,
    });
  });

  app.post("/inventory", async (request) => {
    const body = inventoryCreateSchema.parse(request.body);
    if (
      !("createInventoryProduct" in operations) ||
      typeof operations.createInventoryProduct !== "function"
    ) {
      throw new Error("Cadastro de produtos indisponivel");
    }
    const result = await operations.createInventoryProduct({
      unitId: body.unitId,
      name: body.name,
      salePrice: body.salePrice,
      quantity: body.quantity,
      costPrice: body.costPrice,
      minimumStock: body.minimumStock,
      category: body.category,
      notes: body.notes,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "INVENTORY_PRODUCT_CREATED",
      entity: "inventory_product",
      entityId: result.product.id,
      after: {
        name: result.product.name,
        quantity: result.product.quantity,
      },
    });
    return result;
  });

  app.patch("/inventory/:id", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = inventoryUpdateSchema.parse(request.body);
    if (
      !("updateInventoryProduct" in operations) ||
      typeof operations.updateInventoryProduct !== "function"
    ) {
      throw new Error("Edicao de produtos indisponivel");
    }
    const result = await operations.updateInventoryProduct({
      unitId: body.unitId,
      id: params.id,
      name: body.name,
      salePrice: body.salePrice,
      quantity: body.quantity,
      costPrice: body.costPrice,
      minimumStock: body.minimumStock,
      category: body.category,
      notes: body.notes,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "INVENTORY_PRODUCT_UPDATED",
      entity: "inventory_product",
      entityId: params.id,
      after: {
        quantity: result.product.quantity,
        minimumStock: result.product.minimumStock,
      },
    });
    return result;
  });

  app.delete("/inventory/:id", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = inventoryDeleteSchema.parse(request.body);
    if (
      !("archiveInventoryProduct" in operations) ||
      typeof operations.archiveInventoryProduct !== "function"
    ) {
      throw new Error("Exclusao de produtos indisponivel");
    }
    const result = await operations.archiveInventoryProduct({
      unitId: body.unitId,
      id: params.id,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "INVENTORY_PRODUCT_ARCHIVED",
      entity: "inventory_product",
      entityId: params.id,
      after: {
        inactive: true,
      },
    });
    return result;
  });

  app.patch("/inventory/:id/stock", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = inventoryStockAdjustSchema.parse(request.body);
    if (
      !("adjustInventoryStock" in operations) ||
      typeof operations.adjustInventoryStock !== "function"
    ) {
      throw new Error("Ajuste de estoque indisponivel");
    }
    const result = await operations.adjustInventoryStock({
      unitId: body.unitId,
      id: params.id,
      type: body.type,
      quantity: body.quantity,
      reason: body.reason,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "INVENTORY_STOCK_ADJUSTED",
      entity: "inventory_product",
      entityId: params.id,
      after: {
        type: body.type,
        quantity: body.quantity,
      },
    });
    return result;
  });

  app.post("/inventory/counts", async (request) => {
    const body = inventoryCountSchema.parse(request.body);
    const idempotencyKey = requireIdempotencyKey(request, body.idempotencyKey);
    const result = await operations.recordInventoryCount({
      unitId: body.unitId,
      productId: body.productId,
      countedQty: body.countedQty,
      reason: body.reason,
      responsible: body.responsible,
      countedAt: body.countedAt ? new Date(body.countedAt) : undefined,
      idempotencyKey,
      idempotencyPayloadHash: getIdempotencyPayloadHash({ route: "/inventory/counts", body }),
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "INVENTORY_PHYSICAL_COUNT_RECORDED",
      entity: "inventory_count",
      entityId: result.count.id,
      after: result,
    });
    return result;
  });

  app.get("/stock/overview", async (request) => {
    const query = z
      .object({
        unitId: z.string().min(1),
        limit: z.coerce.number().int().min(1).max(50).optional(),
      })
      .parse(request.query);

    return await operations.getStockOverview({
      unitId: query.unitId,
      limit: query.limit,
    });
  });

  app.get("/services/summary", async (request) => {
    const query = z.object({ unitId: z.string().min(1) }).parse(request.query);
    if (!("getServicesSummary" in operations) || typeof operations.getServicesSummary !== "function") {
      throw new Error("Resumo de servicos indisponivel");
    }
    return await operations.getServicesSummary({
      unitId: query.unitId,
    });
  });

  app.get("/services", async (request) => {
    const query = servicesQuerySchema.parse(request.query);
    if (!("getServices" in operations) || typeof operations.getServices !== "function") {
      throw new Error("Modulo de servicos indisponivel");
    }
    return await operations.getServices({
      unitId: query.unitId,
      status: query.status,
      category: query.category,
      search: query.search,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
    });
  });

  app.get("/services/:id", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const query = z.object({ unitId: z.string().min(1) }).parse(request.query);
    if (!("getServiceById" in operations) || typeof operations.getServiceById !== "function") {
      throw new Error("Detalhe de servico indisponivel");
    }
    return await operations.getServiceById({
      unitId: query.unitId,
      serviceId: params.id,
    });
  });

  app.post("/services", async (request) => {
    const body = serviceCreateSchema.parse(request.body);
    if (!("createService" in operations) || typeof operations.createService !== "function") {
      throw new Error("Cadastro de servico indisponivel");
    }
    const result = await operations.createService({
      unitId: body.unitId,
      name: body.name,
      price: body.price,
      durationMinutes: body.durationMinutes,
      category: body.category,
      description: body.description,
      defaultCommissionRate: body.defaultCommissionRate,
      professionalIds: body.professionalIds,
      isActive: body.isActive,
      estimatedCost: body.estimatedCost,
      notes: body.notes,
      imageUrl: body.imageUrl,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "SERVICE_CREATED",
      entity: "service",
      entityId: result.service.id,
      after: {
        name: result.service.name,
        price: result.service.price,
        durationMinutes: result.service.durationMinutes,
      },
    });
    return result;
  });

  app.patch("/services/:id", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = serviceUpdateSchema.parse(request.body);
    if (!("updateService" in operations) || typeof operations.updateService !== "function") {
      throw new Error("Edicao de servico indisponivel");
    }
    const result = await operations.updateService({
      unitId: body.unitId,
      serviceId: params.id,
      name: body.name,
      price: body.price,
      durationMinutes: body.durationMinutes,
      category: body.category,
      description: body.description,
      defaultCommissionRate: body.defaultCommissionRate,
      professionalIds: body.professionalIds,
      isActive: body.isActive,
      estimatedCost: body.estimatedCost,
      notes: body.notes,
      imageUrl: body.imageUrl,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "SERVICE_UPDATED",
      entity: "service",
      entityId: params.id,
      after: {
        name: result.service.name,
        isActive: result.service.isActive,
        price: result.service.price,
      },
    });
    return result;
  });

  app.patch("/services/:id/status", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = serviceStatusSchema.parse(request.body);
    if (!("updateServiceStatus" in operations) || typeof operations.updateServiceStatus !== "function") {
      throw new Error("Atualizacao de status de servico indisponivel");
    }
    const result = await operations.updateServiceStatus({
      unitId: body.unitId,
      serviceId: params.id,
      isActive: body.isActive,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: body.isActive ? "SERVICE_ACTIVATED" : "SERVICE_INACTIVATED",
      entity: "service",
      entityId: params.id,
      after: {
        isActive: body.isActive,
      },
    });
    return result;
  });

  app.delete("/services/:id", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({ unitId: z.string().min(1) }).parse(request.body);
    if (!("deleteService" in operations) || typeof operations.deleteService !== "function") {
      throw new Error("Exclusao de servico indisponivel");
    }
    const result = await operations.deleteService({
      unitId: body.unitId,
      serviceId: params.id,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: result.mode === "deleted" ? "SERVICE_DELETED" : "SERVICE_INACTIVATED",
      entity: "service",
      entityId: params.id,
      after: result,
    });
    return result;
  });

  app.get("/services/:id/stock-consumption", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const query = serviceStockConsumptionQuerySchema.parse(request.query);
    if (
      !("getServiceStockConsumption" in operations) ||
      typeof operations.getServiceStockConsumption !== "function"
    ) {
      throw new Error("Consumo de estoque por servico indisponivel");
    }

    return await operations.getServiceStockConsumption({
      unitId: query.unitId,
      serviceId: params.id,
    });
  });

  app.put("/services/:id/stock-consumption", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = serviceStockConsumptionSetSchema.parse(request.body);
    if (
      !("setServiceStockConsumption" in operations) ||
      typeof operations.setServiceStockConsumption !== "function"
    ) {
      throw new Error("Consumo de estoque por servico indisponivel");
    }

    const updated = await operations.setServiceStockConsumption({
      unitId: body.unitId,
      serviceId: params.id,
      items: body.items,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "SERVICE_STOCK_CONSUMPTION_UPDATED",
      entity: "service_stock_consumption",
      entityId: `${body.unitId}:${params.id}`,
      after: {
        itemsCount: updated.items.length,
      },
    });
    return updated;
  });

  app.post("/stock/movements/manual", async (request) => {
    const body = stockManualMovementSchema.parse(request.body);
    const idempotencyKey = requireIdempotencyKey(request, body.idempotencyKey);
    if (
      !("registerStockManualMovement" in operations) ||
      typeof operations.registerStockManualMovement !== "function"
    ) {
      throw new Error("Movimentacao manual de estoque indisponivel");
    }

    const result = await operations.registerStockManualMovement({
      unitId: body.unitId,
      productId: body.productId,
      movementType: body.movementType,
      quantity: body.quantity,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
      referenceType: body.referenceType,
      referenceId: body.referenceId ?? body.reason,
      reason: body.reason,
      responsible: body.responsible,
      changedBy: body.changedBy,
      idempotencyKey,
      idempotencyPayloadHash: getIdempotencyPayloadHash({ route: "/stock/movements/manual", body }),
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "STOCK_MOVEMENT_MANUAL_REGISTERED",
      entity: "stock_movement",
      entityId: result.movement.id,
      after: {
        productId: body.productId,
        movementType: body.movementType,
        quantity: body.quantity,
        reason: body.reason,
        responsible: body.responsible,
        stockQty: result.product.stockQty,
      },
    });
    return result;
  });

  app.get("/clients/overview", async (request) => {
    const query = clientsOverviewQuerySchema.parse(request.query);
    return await operations.getClientsOverview({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
      search: query.search,
      status: query.status,
      segment: query.segment,
      limit: query.limit,
    });
  });

  app.post("/professionals", async (request) => {
    const body = professionalCreateSchema.parse(request.body);
    const result = await operations.createProfessional({
      unitId: body.unitId,
      name: body.name,
      phone: body.phone,
      email: body.email || undefined,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "PROFESSIONAL_CREATED",
      entity: "professional",
      entityId: result.professional.id,
      after: { name: result.professional.name },
    });
    return result;
  });

  app.patch("/professionals/:id", async (request) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = professionalUpdateSchema.parse(request.body);
    const result = await operations.updateProfessional({ id, ...body, email: body.email || undefined });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "PROFESSIONAL_UPDATED",
      entity: "professional",
      entityId: id,
      after: { name: body.name, phone: body.phone, email: body.email },
    });
    return result;
  });

  app.get("/professionals/performance", async (request) => {
    const query = professionalsPerformanceQuerySchema.parse(request.query);
    return await operations.getProfessionalsPerformance({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
      professionalId: query.professionalId,
    });
  });

  app.get("/settings", async (request) => {
    const query = settingsQuerySchema.parse(request.query);
    const req = request as RequestWithAuth;
    return await operations.getSettingsOverview({
      unitId: query.unitId,
      authUser: req.auth ?? undefined,
    });
  });

  app.get("/settings/business", async (request) => {
    const query = settingsQuerySchema.parse(request.query);
    return await operations.getBusinessSettings({
      unitId: query.unitId,
    });
  });

  app.patch("/settings/business", async (request) => {
    const body = settingsBusinessPatchSchema.parse(request.body);
    const result = await operations.updateBusinessSettings({
      unitId: body.unitId,
      businessName: body.businessName,
      segment: body.segment,
      phone: body.phone,
      email: body.email || undefined,
      address: body.address,
      city: body.city,
      state: body.state,
      document: body.document,
      displayName: body.displayName,
      primaryColor: body.primaryColor,
      themeMode: body.themeMode,
      defaultAppointmentDuration: body.defaultAppointmentDuration,
      minimumAdvanceMinutes: body.minimumAdvanceMinutes,
      bufferBetweenAppointmentsMinutes: body.bufferBetweenAppointmentsMinutes,
      reminderLeadMinutes: body.reminderLeadMinutes,
      sendAppointmentReminders: body.sendAppointmentReminders,
      inactiveCustomerDays: body.inactiveCustomerDays,
      atRiskCustomerDays: body.atRiskCustomerDays,
      allowWalkIns: body.allowWalkIns,
      allowOutOfHoursAppointments: body.allowOutOfHoursAppointments,
      allowOverbooking: body.allowOverbooking,
      houseCommissionType: body.houseCommissionType,
      houseCommissionValue: body.houseCommissionValue,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "SETTINGS_BUSINESS_UPDATED",
      entity: "business_settings",
      entityId: body.unitId,
      after: {
        businessName: result.business.businessName,
        segment: result.business.segment,
      },
    });
    return result;
  });

  app.get("/settings/business-hours", async (request) => {
    const query = settingsQuerySchema.parse(request.query);
    return await operations.getBusinessHours({
      unitId: query.unitId,
    });
  });

  app.patch("/settings/business-hours", async (request) => {
    const body = settingsBusinessHoursPatchSchema.parse(request.body);
    const result = await operations.updateBusinessHours({
      unitId: body.unitId,
      hours: body.hours.map((item) => ({
        dayOfWeek: item.dayOfWeek,
        opensAt: item.opensAt || undefined,
        closesAt: item.closesAt || undefined,
        breakStart: item.breakStart || undefined,
        breakEnd: item.breakEnd || undefined,
        isClosed: item.isClosed,
      })),
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "SETTINGS_BUSINESS_HOURS_UPDATED",
      entity: "business_hours",
      entityId: body.unitId,
      after: {
        updatedRows: body.hours.length,
      },
    });
    return result;
  });

  app.get("/settings/payment-methods", async (request) => {
    const query = settingsQuerySchema.parse(request.query);
    return await operations.getPaymentMethods({
      unitId: query.unitId,
    });
  });

  app.post("/settings/payment-methods", async (request) => {
    const body = settingsPaymentMethodsCreateSchema.parse(request.body);
    const result = await operations.createPaymentMethod({
      unitId: body.unitId,
      name: body.name,
      isActive: body.isActive,
      isDefault: body.isDefault,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "SETTINGS_PAYMENT_METHOD_CREATED",
      entity: "payment_method",
      entityId: result.paymentMethod.id,
      after: {
        name: result.paymentMethod.name,
        isDefault: result.paymentMethod.isDefault,
      },
    });
    return result;
  });

  app.patch("/settings/payment-methods/:id", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = settingsPaymentMethodsUpdateSchema.parse(request.body);
    const result = await operations.updatePaymentMethod({
      unitId: body.unitId,
      paymentMethodId: params.id,
      name: body.name,
      isActive: body.isActive,
      isDefault: body.isDefault,
    });
    if (!result.paymentMethod) {
      throw new Error("Metodo de pagamento nao encontrado");
    }
    await recordAudit(request, {
      unitId: body.unitId,
      action: "SETTINGS_PAYMENT_METHOD_UPDATED",
      entity: "payment_method",
      entityId: params.id,
      after: {
        name: result.paymentMethod.name,
        isActive: result.paymentMethod.isActive,
        isDefault: result.paymentMethod.isDefault,
      },
    });
    return result;
  });

  app.get("/settings/commission-rules", async (request) => {
    const query = settingsQuerySchema.parse(request.query);
    return await operations.getBusinessCommissionRules({
      unitId: query.unitId,
    });
  });

  app.post("/settings/commission-rules", async (request) => {
    const body = settingsCommissionRuleCreateSchema.parse(request.body);
    const result = await operations.createBusinessCommissionRule({
      unitId: body.unitId,
      professionalId: body.professionalId,
      serviceId: body.serviceId,
      type: body.type,
      value: body.value,
      isActive: body.isActive,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "SETTINGS_COMMISSION_RULE_CREATED",
      entity: "commission_rule",
      entityId: result.commissionRule.id,
      after: {
        type: result.commissionRule.type,
        value: result.commissionRule.value,
      },
    });
    return result;
  });

  app.patch("/settings/commission-rules/:id", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = settingsCommissionRuleUpdateSchema.parse(request.body);
    const result = await operations.updateBusinessCommissionRule({
      unitId: body.unitId,
      ruleId: params.id,
      professionalId: body.professionalId || undefined,
      serviceId: body.serviceId || undefined,
      type: body.type,
      value: body.value,
      isActive: body.isActive,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "SETTINGS_COMMISSION_RULE_UPDATED",
      entity: "commission_rule",
      entityId: params.id,
      after: {
        type: result.commissionRule.type,
        value: result.commissionRule.value,
        isActive: result.commissionRule.isActive,
      },
    });
    return result;
  });

  app.get("/settings/team-members", async (request) => {
    const query = settingsQuerySchema.parse(request.query);
    return await operations.getTeamMembers({
      unitId: query.unitId,
    });
  });

  app.post("/settings/team-members", async (request) => {
    const body = settingsTeamMemberCreateSchema.parse(request.body);
    const result = await operations.createTeamMember({
      unitId: body.unitId,
      name: body.name,
      role: body.role,
      accessProfile: body.accessProfile,
      email: body.email || undefined,
      phone: body.phone,
      isActive: body.isActive,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "SETTINGS_TEAM_MEMBER_CREATED",
      entity: "team_member",
      entityId: result.teamMember.id,
      after: {
        role: result.teamMember.role,
        accessProfile: result.teamMember.accessProfile,
      },
    });
    return result;
  });

  app.patch("/settings/team-members/:id", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = settingsTeamMemberUpdateSchema.parse(request.body);
    const result = await operations.updateTeamMember({
      unitId: body.unitId,
      memberId: params.id,
      name: body.name,
      role: body.role,
      accessProfile: body.accessProfile,
      email: body.email || undefined,
      phone: body.phone,
      isActive: body.isActive,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "SETTINGS_TEAM_MEMBER_UPDATED",
      entity: "team_member",
      entityId: params.id,
      after: {
        role: result.teamMember.role,
        accessProfile: result.teamMember.accessProfile,
        isActive: result.teamMember.isActive,
      },
    });
    return result;
  });

  app.get("/commissions/statement", async (request) => {
    const query = commissionsStatementQuerySchema.parse(request.query);
    return await operations.getCommissionsStatement({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
      professionalId: query.professionalId,
      appliesTo: query.appliesTo,
      limit: query.limit,
    });
  });

  app.get("/loyalty/summary", async (request) => {
    const query = loyaltySummaryQuerySchema.parse(request.query);
    return await operations.getLoyaltySummary({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
    });
  });

  app.get("/loyalty/ledger", async (request) => {
    const query = loyaltyLedgerQuerySchema.parse(request.query);
    return await operations.getLoyaltyLedger({
      unitId: query.unitId,
      clientId: query.clientId,
      limit: query.limit,
    });
  });

  app.post("/loyalty/adjust", async (request) => {
    const body = loyaltyAdjustSchema.parse(request.body);
    return await operations.adjustLoyalty({
      unitId: body.unitId,
      clientId: body.clientId,
      pointsDelta: body.pointsDelta,
      sourceType: body.sourceType,
      sourceId: body.sourceId,
      note: body.note,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
      createdBy: body.createdBy,
    });
  });

  app.get("/packages", async (request) => {
    const query = packagesQuerySchema.parse(request.query);
    return await operations.getServicePackages({
      unitId: query.unitId,
    });
  });

  app.post("/packages/purchase", async (request) => {
    const body = packagePurchaseSchema.parse(request.body);
    return await operations.purchasePackage({
      unitId: body.unitId,
      clientId: body.clientId,
      packageId: body.packageId,
      purchasedAt: new Date(body.purchasedAt),
      changedBy: body.changedBy,
    });
  });

  app.post("/packages/redeem-session", async (request) => {
    const body = packageRedeemSchema.parse(request.body);
    return await operations.redeemPackageSession({
      unitId: body.unitId,
      clientId: body.clientId,
      packagePurchaseId: body.packagePurchaseId,
      serviceId: body.serviceId,
      occurredAt: new Date(body.occurredAt),
      changedBy: body.changedBy,
    });
  });

  app.get("/packages/client-balance", async (request) => {
    const query = packageBalanceQuerySchema.parse(request.query);
    return await operations.getClientPackageBalance({
      unitId: query.unitId,
      clientId: query.clientId,
    });
  });

  app.get("/subscriptions/plans", async (request) => {
    const query = subscriptionPlansQuerySchema.parse(request.query);
    return await operations.getSubscriptionPlans({
      unitId: query.unitId,
    });
  });

  app.post("/subscriptions/activate", async (request) => {
    const body = subscriptionActivateSchema.parse(request.body);
    return await operations.activateSubscription({
      unitId: body.unitId,
      clientId: body.clientId,
      planId: body.planId,
      startedAt: new Date(body.startedAt),
      changedBy: body.changedBy,
    });
  });

  app.post("/subscriptions/cancel", async (request) => {
    const body = subscriptionCancelSchema.parse(request.body);
    return await operations.cancelSubscription({
      unitId: body.unitId,
      subscriptionId: body.subscriptionId,
      changedBy: body.changedBy,
    });
  });

  app.get("/subscriptions/overview", async (request) => {
    const query = subscriptionsOverviewQuerySchema.parse(request.query);
    return await operations.getSubscriptionsOverview({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
    });
  });

  app.get("/retention/cases", async (request) => {
    const query = retentionCasesQuerySchema.parse(request.query);
    return await operations.getRetentionCases({
      unitId: query.unitId,
      riskLevel: query.riskLevel,
      status: query.status,
      limit: query.limit,
    });
  });

  app.post("/retention/cases/:id/events", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = retentionEventSchema.parse(request.body);
    return await operations.addRetentionEvent({
      unitId: body.unitId,
      caseId: params.id,
      channel: body.channel,
      note: body.note,
      outcome: body.outcome,
      occurredAt: new Date(body.occurredAt),
      createdBy: body.createdBy,
    });
  });

  app.post("/retention/cases/:id/convert", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = retentionConvertSchema.parse(request.body);
    return await operations.convertRetentionCase({
      unitId: body.unitId,
      caseId: params.id,
      changedBy: body.changedBy,
    });
  });

  app.get("/multiunit/overview", async (request) => {
    const query = multiUnitOverviewQuerySchema.parse(request.query);
    return await operations.getMultiUnitOverview({
      start: new Date(query.start),
      end: new Date(query.end),
    });
  });

  app.get("/multiunit/benchmark", async (request) => {
    const query = multiUnitBenchmarkQuerySchema.parse(request.query);
    return await operations.getMultiUnitBenchmark({
      start: new Date(query.start),
      end: new Date(query.end),
      metric: query.metric,
    });
  });

  app.post("/automations/rules", async (request) => {
    const body = automationRuleCreateSchema.parse(request.body);
    const result = await operations.createAutomationRule(body);
    await recordAudit(request, {
      unitId: body.unitId,
      action: "AUTOMATION_RULE_CREATED",
      entity: "automation_rule",
      entityId: result.rule.id,
      after: {
        triggerType: result.rule.triggerType,
        channel: result.rule.channel,
      },
    });
    return result;
  });

  app.get("/automations/rules", async (request) => {
    const query = automationRulesQuerySchema.parse(request.query);
    return await operations.getAutomationRules({
      unitId: query.unitId,
      active: query.active,
    });
  });

  app.patch("/automations/rules/:id", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = automationRuleUpdateSchema.parse(request.body);
    const result = await operations.updateAutomationRule({
      unitId: body.unitId,
      ruleId: params.id,
      name: body.name,
      triggerType: body.triggerType,
      channel: body.channel,
      target: body.target,
      messageTemplate: body.messageTemplate,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "AUTOMATION_RULE_UPDATED",
      entity: "automation_rule",
      entityId: params.id,
      before: {
        name: result.previousRule.name,
        triggerType: result.previousRule.triggerType,
        channel: result.previousRule.channel,
        target: result.previousRule.target,
      },
      after: {
        name: result.rule.name,
        triggerType: result.rule.triggerType,
        channel: result.rule.channel,
        target: result.rule.target,
      },
    });
    return result;
  });

  app.post("/automations/rules/:id/activate", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = automationRuleToggleSchema.parse(request.body);
    const result = await operations.activateAutomationRule({
      unitId: body.unitId,
      ruleId: params.id,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "AUTOMATION_RULE_ACTIVATED",
      entity: "automation_rule",
      entityId: params.id,
      after: {
        isActive: true,
      },
    });
    return result;
  });

  app.post("/automations/rules/:id/deactivate", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = automationRuleToggleSchema.parse(request.body);
    const result = await operations.deactivateAutomationRule({
      unitId: body.unitId,
      ruleId: params.id,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "AUTOMATION_RULE_DEACTIVATED",
      entity: "automation_rule",
      entityId: params.id,
      after: {
        isActive: false,
      },
    });
    return result;
  });

  app.post("/automations/campaigns/execute", async (request) => {
    const body = automationCampaignExecuteSchema.parse(request.body);
    const result = await operations.executeAutomationCampaign(body);
    await recordAudit(request, {
      unitId: body.unitId,
      action: "AUTOMATION_CAMPAIGN_EXECUTED",
      entity: "automation_campaign",
      entityId: body.ruleId,
      after: {
        campaignType: body.campaignType,
        playbookType: body.playbookType ?? null,
        sourceModule: body.sourceModule ?? "automacoes",
        sourceSuggestionId: body.sourceSuggestionId ?? null,
        totalExecutions: result.executionBatch.scheduled,
      },
    });
    return result;
  });

  app.get("/automations/executions", async (request) => {
    const query = automationExecutionsQuerySchema.parse(request.query);
    return await operations.getAutomationExecutions({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
      status: query.status,
    });
  });

  app.post("/automations/executions/:id/reprocess", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = automationExecutionReprocessSchema.parse(request.body);
    const result = await operations.reprocessAutomationExecution({
      unitId: body.unitId,
      executionId: params.id,
      startedBy: body.startedBy,
    });
    await recordAudit(request, {
      unitId: body.unitId,
      action: "AUTOMATION_EXECUTION_REPROCESSED",
      entity: "automation_execution",
      entityId: params.id,
      after: {
        status: result.execution.status,
      },
    });
    return result;
  });

  app.post("/retention/scoring/recalculate", async (request) => {
    const body = retentionScoringRecalculateSchema.parse(request.body);
    return await operations.recalculateRetentionScoring({
      unitId: body.unitId,
      scoredAt: body.scoredAt ? new Date(body.scoredAt) : new Date(),
      modelVersion: body.modelVersion,
    });
  });

  app.get("/retention/scoring/overview", async (request) => {
    const query = retentionScoringOverviewQuerySchema.parse(request.query);
    return await operations.getRetentionScoringOverview({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
    });
  });

  app.get("/retention/scoring/clients", async (request) => {
    const query = retentionScoringClientsQuerySchema.parse(request.query);
    return await operations.getRetentionScoringClients({
      unitId: query.unitId,
      riskLevel: query.riskLevel,
      limit: query.limit,
    });
  });

  app.get("/retention/scoring/client/:clientId", async (request) => {
    const params = z.object({ clientId: z.string().min(1) }).parse(request.params);
    const query = retentionScoringClientQuerySchema.parse(request.query);
    return await operations.getRetentionScoringClient({
      unitId: query.unitId,
      clientId: params.clientId,
    });
  });

  app.post("/ai/owner-command/parse", async (request) => {
    const body = ownerCommandParseSchema.parse(request.body);
    const req = request as RequestWithAuth;
    const unitId = getAuthenticatedOwnerUnitId(request);
    return await parseOwnerCommandPreview({
      unitId,
      screenContext: body.screenContext,
      message: body.message,
      actorId: req.auth?.userId,
    });
  });

  app.post("/ai/owner-command/confirm", async (request, reply) => {
    const body = ownerCommandConfirmSchema.parse(request.body);
    const req = request as RequestWithAuth;
    const unitId = getAuthenticatedOwnerUnitId(request);
    await assertOwnerCommandUnitExists(unitId);
    const result = await executeOwnerCommand({
      request,
      unitId,
      actorId: req.auth?.userId,
      actorLabel: req.auth?.email || req.auth?.userId || "owner",
      intent: body.intent,
      draft: body.draft,
      confirmationToken: body.confirmationToken,
    });
    if (asRecord(result)?.statusCode) {
      const statusCode = Number(asRecord(result)?.statusCode);
      return reply.status(statusCode).send(asRecord(result)?.body);
    }
    return result;
  });

  app.post("/webhooks/evolution/whatsapp", async (request, reply) => {
    if (!validateEvolutionWebhookSecret(request)) {
      app.log.warn({ event: "ai.whatsapp.rejected", reason: "invalid_secret" });
      return reply.status(401).send({ ok: false });
    }

    const message = extractEvolutionWhatsappMessage(request.body);
    const expectedInstance = String(process.env.EVOLUTION_INSTANCE_NAME ?? "liddo-barber").trim();
    const ownerPhone = normalizePhoneDigits(process.env.AI_WHATSAPP_OWNER_PHONE);
    let unitId = "";
    let actorId = "";
    let whatsappContext: AiWhatsappCommandContext | undefined;
    const correlationId = (request as RequestWithAuth).correlationId ?? request.id;
    const webhookKeySource = message.messageId ? "message_id" : message.eventId ? "event_id" : "unavailable";
    const webhookReplayKey = webhookKeySource === "unavailable"
      ? ""
      : buildAiWhatsappWebhookReplayKey({
          instance: message.instance || expectedInstance,
          senderPhone: message.senderPhone,
          messageId: message.messageId,
          eventId: message.eventId,
        });
    const webhookEntityId = webhookReplayKey ? webhookReplayKey.slice(0, 32) : message.maskedPhone;
    const safeAudit = async (payload: {
      unitId: string;
      action: string;
      entity: string;
      entityId?: string;
      after?: Record<string, unknown>;
    }) => {
      try {
        await recordAudit(request, {
          ...payload,
          after: { ...(payload.after ?? {}), correlationId },
        });
        return true;
      } catch {
        app.log.error({ event: "ai.whatsapp.audit_failed", action: payload.action, phone: message.maskedPhone });
        return false;
      }
    };
    const responseGate = new SingleWhatsappResponseGate();
    let finalState: AiWhatsappPipelineState | undefined;
    const finalize = async (state: AiWhatsappPipelineState) => {
      if (finalState) return finalState;
      finalState = state;
      await safeAudit({
        unitId,
        action: "AI_WHATSAPP_FINAL_STATE",
        entity: "ai_whatsapp_pipeline",
        entityId: webhookEntityId,
        after: { state, keySource: webhookKeySource, phone: message.maskedPhone },
      });
      return state;
    };
    const inferFinalState = (origin: string): AiWhatsappPipelineState => ({
      guidance_empty_message: "UNKNOWN_INTENT",
      audio_disabled: "ASR_PERMANENT_FAILURE",
      audio_processing_failure: "MEDIA_DOWNLOAD_FAILED",
      audio_transcription_failure: "ASR_PERMANENT_FAILURE",
      audio_transcription_provider_failure: "ASR_TRANSIENT_FAILURE",
      audio_transcription_quota_failure: "ASR_PERMANENT_FAILURE",
      cancellation_result: "CANCELLED",
      confirmation_expired: "EXECUTION_FAILED",
      confirmation_result: "CONFIRMED",
      temporary_parser_failure: "SEMANTIC_TRANSIENT_FAILURE",
      guidance_parser_failure: "INVALID_STRUCTURED_OUTPUT",
      guidance_unsupported_intent: "UNKNOWN_INTENT",
      entity_clarification: "MISSING_FIELDS",
      audio_preview: "PREVIEW_SENT",
      text_preview: "PREVIEW_SENT",
      unexpected_failure: "EXECUTION_FAILED",
    } as Record<string, AiWhatsappPipelineState>)[origin] ?? "EXECUTION_FAILED";
    const safeSend = async (text: string, origin: string) => {
      await finalize(inferFinalState(origin));
      const outcome = await responseGate.send(async () => await sendWhatsAppMessage(message.replyTarget, text));
      if (!outcome.attempted) {
        app.log.error({ event: "ai.whatsapp.duplicate_response_suppressed", origin, phone: message.maskedPhone });
        await safeAudit({
          unitId,
          action: "AI_WHATSAPP_RESPONSE_DUPLICATE_SUPPRESSED",
          entity: "ai_whatsapp_response",
          entityId: webhookEntityId,
          after: { origin, keySource: webhookKeySource, phone: message.maskedPhone },
        });
        return false;
      }
      if (outcome.delivered) {
        await safeAudit({
          unitId,
          action: "AI_WHATSAPP_RESPONSE_SENT",
          entity: "ai_whatsapp_response",
          entityId: webhookEntityId,
          after: {
            result: "SENT",
            origin,
            keySource: webhookKeySource,
            phone: message.maskedPhone,
          },
        });
        return true;
      }
      app.log.error({ event: "ai.whatsapp.response_failed", phone: message.maskedPhone });
      const deliveryError = outcome.error instanceof WhatsappDeliveryError ? outcome.error : undefined;
      await safeAudit({
        unitId,
        action: "AI_WHATSAPP_RESPONSE_FAILED",
        entity: "ai_whatsapp_response",
        entityId: webhookEntityId,
        after: {
          reason: deliveryError?.reason ?? "evolution_send_failed",
          httpStatus: deliveryError?.httpStatus ?? null,
          durationMs: deliveryError?.durationMs ?? null,
          origin,
          keySource: webhookKeySource,
          phone: message.maskedPhone,
        },
      });
      return false;
    };

    if (message.instance && expectedInstance && message.instance !== expectedInstance) {
      app.log.warn({ event: "ai.whatsapp.rejected", reason: "wrong_instance", phone: message.maskedPhone });
      return { ok: true, ignored: true };
    }
    if (message.isGroup) {
      app.log.info({ event: "ai.whatsapp.ignored", reason: "group", phone: message.maskedPhone });
      return { ok: true, ignored: true };
    }
    if (message.fromMe) {
      app.log.info({ event: "ai.whatsapp.ignored", reason: "from_me", phone: message.maskedPhone });
      return { ok: true, ignored: true };
    }
    if (!ownerPhone || message.senderPhone !== ownerPhone) {
      app.log.warn({ event: "ai.whatsapp.rejected", reason: "unauthorized_phone", phone: message.maskedPhone });
      return { ok: true, ignored: true };
    }

    try {
      whatsappContext = await resolveAiWhatsappCommandContext({
        senderPhone: message.senderPhone,
        expectedOwnerPhone: ownerPhone,
        correlationId,
        messageId: message.messageId,
      });
      unitId = whatsappContext.unitId;
      actorId = whatsappContext.actorId;
      app.log.info({
        event: "ai.whatsapp.identity.resolved",
        unitFingerprint: crypto.createHash("sha256").update(unitId).digest("hex").slice(0, 12),
        actorRole: whatsappContext.actorRole,
        origin: whatsappContext.origin,
        phoneFingerprint: whatsappContext.phoneFingerprint,
      });
    } catch (error) {
      const reason = error instanceof AiWhatsappIdentityError ? error.reason : "owner_access_missing";
      app.log.error({ event: "ai.whatsapp.identity.rejected", reason, phone: message.maskedPhone });
      const outcome = await responseGate.send(async () => await sendWhatsAppMessage(
        message.replyTarget,
        "Nao foi possivel validar o acesso do WhatsApp agora. Tente novamente mais tarde.",
      ));
      return { ok: true, executed: false, unavailable: true, reason: "whatsapp_identity_unavailable", responseDelivered: outcome.delivered };
    }
    if (!whatsappContext) {
      return { ok: true, executed: false, unavailable: true, reason: "whatsapp_identity_unavailable", responseDelivered: false };
    }

    await safeAudit({
      unitId,
      action: "AI_WHATSAPP_WEBHOOK_RECEIVED",
      entity: "ai_whatsapp_webhook",
      entityId: webhookEntityId,
      after: {
        result: "RECEIVED",
        keySource: webhookKeySource,
        hasAudio: Boolean(message.audio),
        hasText: Boolean(message.text),
        phone: message.maskedPhone,
        origin: whatsappContext.origin,
        actorRole: whatsappContext.actorRole,
        actorFingerprint: crypto.createHash("sha256").update(whatsappContext.actorId).digest("hex").slice(0, 12),
        unitFingerprint: crypto.createHash("sha256").update(whatsappContext.unitId).digest("hex").slice(0, 12),
        phoneFingerprint: whatsappContext.phoneFingerprint,
        messageIdFingerprint: whatsappContext.messageIdFingerprint,
      },
    });
    if (webhookReplayKey) {
      let claim: "claimed" | "duplicate";
      try {
        claim = await claimAiWhatsappWebhook({
          unitId,
          replayKey: webhookReplayKey,
          payloadHash: getIdempotencyPayloadHash(request.body),
        });
      } catch {
        app.log.error({ event: "ai.whatsapp.deduplication_failed", phone: message.maskedPhone });
        await safeAudit({
          unitId,
          action: "AI_WHATSAPP_DEDUPLICATION_FAILED",
          entity: "ai_whatsapp_webhook",
          entityId: webhookEntityId,
          after: { result: "SAFE_FAILURE", keySource: webhookKeySource, phone: message.maskedPhone },
        });
        await finalize("EXECUTION_FAILED");
        return { ok: true, executed: false, unavailable: true, reason: "deduplication_unavailable", responseDelivered: false };
      }
      if (claim === "duplicate") {
        await safeAudit({
          unitId,
          action: "AI_WHATSAPP_WEBHOOK_DEDUPLICATED",
          entity: "ai_whatsapp_webhook",
          entityId: webhookEntityId,
          after: { result: "DUPLICATE_IGNORED", keySource: webhookKeySource, phone: message.maskedPhone },
        });
        if (message.audio) {
          await safeAudit({
            unitId,
            action: "AI_WHATSAPP_AUDIO_REPLAY_IGNORED",
            entity: "ai_whatsapp_audio",
            entityId: webhookEntityId,
            after: { result: "DUPLICATE_IGNORED", phone: message.maskedPhone },
          });
        }
        await finalize("DUPLICATE");
        return { ok: true, replay: true, deduplicated: true, executed: false, responseDelivered: false };
      }
      await safeAudit({
        unitId,
        action: "AI_WHATSAPP_WEBHOOK_CLAIMED",
        entity: "ai_whatsapp_webhook",
        entityId: webhookEntityId,
        after: { result: "CLAIMED", keySource: webhookKeySource, phone: message.maskedPhone },
      });
    }
    if (!message.text && !message.audio) {
      app.log.info({ event: "ai.whatsapp.ignored", reason: "empty_text", phone: message.maskedPhone });
      await safeAudit({
        unitId,
        action: "AI_WHATSAPP_COMMAND_REJECTED",
        entity: "ai_whatsapp_command",
        entityId: message.maskedPhone,
        after: { reason: "empty_text", phone: message.maskedPhone },
      });
      const responseDelivered = await safeSend(formatAiWhatsappGuidance(), "guidance_empty_message");
      return { ok: true, ignored: true, responseDelivered };
    }

    await safeAudit({
      unitId,
      action: "AI_WHATSAPP_PIPELINE_RECEIVED",
      entity: "ai_whatsapp_pipeline",
      entityId: message.maskedPhone,
      after: {
        correlationId,
        stage: "audio_pipeline_received",
        result: "RECEIVED",
        hasAudio: Boolean(message.audio),
        ...(message.text ? getAiWhatsappTextObservation(message.text) : {}),
      },
    });

    try {
    pruneAiWhatsappPendingCommands();
    let commandText = message.text;
    let audioTranscript = "";
    let audioAssistance: {
      audioBytes: Buffer;
      audioEntityId: string;
      mimetype: string;
      vocabulary: BarbershopAudioVocabulary;
      canonicalization: AudioCanonicalization;
      provider: string;
      startedAt: number;
      passCount: number;
    } | undefined;
    if (message.audio) {
      const audioEntityId = message.audio.messageId
        ? buildAiWhatsappAudioReplayKey(message.senderPhone, message.audio.messageId).slice(0, 32)
        : message.maskedPhone;
      await safeAudit({
        unitId,
        action: "AI_WHATSAPP_AUDIO_RECEIVED",
        entity: "ai_whatsapp_audio",
        entityId: audioEntityId,
        after: {
          mimetype: message.audio.mimetype || "unknown",
          declaredSize: message.audio.declaredSize ?? null,
          durationSeconds: message.audio.durationSeconds ?? null,
          phone: message.maskedPhone,
        },
      });
      if (!audioTranscriptionEnabled) {
        await safeAudit({
          unitId,
          action: "AI_WHATSAPP_AUDIO_TRANSCRIPTION_DISABLED",
          entity: "ai_whatsapp_audio",
          entityId: audioEntityId,
          after: { reason: "feature_disabled", phone: message.maskedPhone },
        });
        const responseDelivered = await safeSend(formatAiWhatsappAudioDisabled(), "audio_disabled");
        return { ok: true, executed: false, audio: true, disabled: true, responseDelivered };
      }
      if (!message.audio.messageId) {
        await safeAudit({
          unitId,
          action: "AI_WHATSAPP_AUDIO_REJECTED",
          entity: "ai_whatsapp_audio",
          entityId: audioEntityId,
          after: { reason: "missing_media", phone: message.maskedPhone },
        });
        const responseDelivered = await safeSend(formatAiWhatsappAudioFailure("processing"), "audio_processing_failure");
        return { ok: true, executed: false, audio: true, reason: "missing_media", responseDelivered };
      }
      let audioBytes: Buffer;
      try {
        audioBytes = await downloadEvolutionWhatsappAudio({
          instance: message.instance || expectedInstance,
          audio: message.audio,
        });
      } catch (error) {
        const reason = error instanceof EvolutionAudioError ? error.reason : "download_failed";
        await safeAudit({
          unitId,
          action: "AI_WHATSAPP_AUDIO_REJECTED",
          entity: "ai_whatsapp_audio",
          entityId: audioEntityId,
          after: { reason, phone: message.maskedPhone },
        });
        const responseDelivered = await safeSend(formatAiWhatsappAudioFailure("processing"), "audio_processing_failure");
        return { ok: true, executed: false, audio: true, reason, responseDelivered };
      }
      await safeAudit({
        unitId,
        action: "AI_WHATSAPP_AUDIO_MEDIA_DOWNLOADED",
        entity: "ai_whatsapp_audio",
        entityId: audioEntityId,
        after: { correlationId, stage: "media_download", result: "MEDIA_DOWNLOADED", size: audioBytes.length },
      });
      await safeAudit({
        unitId,
        action: "AI_WHATSAPP_AUDIO_TRANSCRIPTION_STARTED",
        entity: "ai_whatsapp_audio",
        entityId: audioEntityId,
        after: {
          mimetype: message.audio.mimetype,
          size: audioBytes.length,
          timeoutMs: configuredAsrTimeoutMs,
          totalBudgetMs: configuredAsrTotalBudgetMs,
          model: configuredAsrModel,
          endpoint: configuredAsrEndpoint,
          phone: message.maskedPhone,
        },
      });
      if (!audioTranscriptionService) {
        await safeAudit({
          unitId,
          action: "AI_WHATSAPP_AUDIO_TRANSCRIPTION_FAILED",
          entity: "ai_whatsapp_audio",
          entityId: audioEntityId,
          after: { reason: "audio_transcription_unavailable", phone: message.maskedPhone },
        });
        const responseDelivered = await safeSend(formatAiWhatsappAudioFailure("transcription"), "audio_transcription_failure");
        return { ok: true, executed: false, audio: true, reason: "audio_transcription_unavailable", responseDelivered };
      }
      try {
        const vocabulary = buildBarbershopAudioVocabulary(await getOwnerCommandContext({
          unitId,
          screenContext: "whatsapp",
        }));
        const assistedStartedAt = Date.now();
        const transcription = await audioTranscriptionService.transcribe({
          audio: audioBytes,
          mimetype: message.audio.mimetype,
          correlationId,
          initialPrompt: vocabulary.prompt,
          pass: 1,
          timeoutMs: Math.min(20_000, configuredAsrTotalBudgetMs),
        });
        audioTranscript = transcription.transcript.trim().slice(0, 1000);
        if (!audioTranscript) throw new AudioTranscriptionError("audio_transcription_empty");
        const canonicalization = canonicalizeAudioTranscript(audioTranscript, vocabulary);
        if (transcription.provider.startsWith("local_whisper:")) {
          audioTranscript = canonicalization.transcript;
        }
        audioAssistance = {
          audioBytes,
          audioEntityId,
          mimetype: message.audio.mimetype,
          vocabulary,
          canonicalization,
          provider: transcription.provider,
          startedAt: assistedStartedAt,
          passCount: 1,
        };
        await safeAudit({
          unitId,
          action: "AI_WHATSAPP_AUDIO_TRANSCRIPTION_COMPLETED",
          entity: "ai_whatsapp_audio",
          entityId: audioEntityId,
          after: {
            correlationId,
            stage: "audio_transcription_completed",
            result: "TRANSCRIPTION_SUCCESS",
            provider: transcription.provider,
            model: configuredAsrModel,
            confidence: transcription.confidence ?? null,
            normalizedMimetype: transcription.normalizedMimetype ?? null,
            providerCalled: transcription.diagnostics?.providerCalled ?? null,
            durationMs: transcription.diagnostics?.durationMs ?? null,
            passCount: 1,
            vadResult: transcription.diagnostics?.vadResult ?? (audioTranscript ? "speech" : "silence"),
            httpStatus: transcription.diagnostics?.httpStatus ?? null,
            attemptCount: transcription.diagnostics?.attemptCount ?? null,
            recentCallCount: transcription.diagnostics?.recentCallCount ?? null,
            recentCallWindowMs: transcription.diagnostics?.recentCallWindowMs ?? null,
            totalBudgetMs: transcription.diagnostics?.totalBudgetMs ?? null,
            endpoint: transcription.diagnostics?.endpoint ?? null,
            providerErrorCode: transcription.diagnostics?.providerErrorCode ?? null,
            providerErrorStatus: transcription.diagnostics?.providerErrorStatus ?? null,
            retryAfterMs: transcription.diagnostics?.retryAfterMs ?? null,
            retryHeaders: transcription.diagnostics?.retryHeaders ?? null,
            rateLimitKind: transcription.diagnostics?.rateLimitKind ?? null,
            responseFingerprint: transcription.diagnostics?.responseFingerprint ?? null,
            attempts: transcription.diagnostics?.attempts ?? [],
            fallbackUsed: transcription.diagnostics?.fallbackUsed ?? false,
            phone: message.maskedPhone,
          },
        });
        await safeAudit({
          unitId,
          action: "AI_WHATSAPP_AUDIO_ASSISTANCE_COMPLETED",
          entity: "ai_whatsapp_audio",
          entityId: audioEntityId,
          after: {
            correlationId,
            passCount: 1,
            vocabularyFingerprint: vocabulary.fingerprint.slice(0, 12),
            promptFingerprint: crypto.createHash("sha256").update(vocabulary.prompt).digest("hex").slice(0, 12),
            promptLength: vocabulary.prompt.length,
            termCount: vocabulary.terms.length,
            fields: canonicalization.fields.map((field) => ({
              category: field.category,
              status: field.status,
              score: field.score ?? null,
            })),
            correctedCategories: canonicalization.correctedCategories,
            correctionFingerprints: canonicalization.correctionFingerprints,
            needsSecondPass: canonicalization.needsSecondPass,
          },
        });
      } catch (error) {
        const reason = error instanceof AudioTranscriptionError ? error.reason : "audio_transcription_failed";
        const diagnostics = error instanceof AudioTranscriptionError ? error.diagnostics : null;
        await safeAudit({
          unitId,
          action: "AI_WHATSAPP_AUDIO_TRANSCRIPTION_FAILED",
          entity: "ai_whatsapp_audio",
          entityId: audioEntityId,
          after: {
            correlationId,
            stage: "audio_transcription_failed",
            result: reason === "audio_transcription_empty" ? "TRANSCRIPTION_EMPTY" : "TRANSCRIPTION_FAILED",
            reason,
            providerCalled: diagnostics?.providerCalled ?? null,
            durationMs: diagnostics?.durationMs ?? null,
            httpStatus: diagnostics?.httpStatus ?? null,
            attemptCount: diagnostics?.attemptCount ?? null,
            recentCallCount: diagnostics?.recentCallCount ?? null,
            recentCallWindowMs: diagnostics?.recentCallWindowMs ?? null,
            totalBudgetMs: diagnostics?.totalBudgetMs ?? null,
            model: diagnostics?.model ?? null,
            endpoint: diagnostics?.endpoint ?? null,
            providerErrorCode: diagnostics?.providerErrorCode ?? null,
            providerErrorStatus: diagnostics?.providerErrorStatus ?? null,
            retryAfterMs: diagnostics?.retryAfterMs ?? null,
            retryHeaders: diagnostics?.retryHeaders ?? null,
            rateLimitKind: diagnostics?.rateLimitKind ?? null,
            responseFingerprint: diagnostics?.responseFingerprint ?? null,
            attempts: diagnostics?.attempts ?? [],
            fallbackUsed: diagnostics?.fallbackUsed ?? false,
            phone: message.maskedPhone,
          },
        });
        const temporaryProviderFailure = [
          "audio_transcription_unavailable",
          "audio_transcription_429",
          "audio_transcription_5xx",
          "audio_transcription_timeout",
          "audio_transcription_circuit_open",
          "audio_transcription_failed",
        ].includes(reason);
        const quotaExhausted = reason === "audio_transcription_quota_exhausted";
        await finalize(reason === "audio_transcription_empty" || reason === "audio_transcription_no_speech"
          ? "AUDIO_EMPTY"
          : quotaExhausted
            ? "ASR_PERMANENT_FAILURE"
            : temporaryProviderFailure ? "ASR_TRANSIENT_FAILURE" : "ASR_PERMANENT_FAILURE");
        const responseDelivered = await safeSend(
          quotaExhausted
            ? formatAiWhatsappAudioQuotaFailure()
            : temporaryProviderFailure ? formatAiWhatsappAudioProviderFailure() : formatAiWhatsappAudioFailure("transcription"),
          quotaExhausted
            ? "audio_transcription_quota_failure"
            : temporaryProviderFailure ? "audio_transcription_provider_failure" : "audio_transcription_failure",
        );
        return { ok: true, executed: false, audio: true, reason, responseDelivered };
      }
      commandText = audioTranscript;
    }
    await safeAudit({
      unitId,
      action: "AI_WHATSAPP_PARSER_STARTED",
      entity: "ai_whatsapp_command",
      entityId: message.maskedPhone,
      after: { correlationId, stage: "owner_command_parser_started", ...getAiWhatsappTextObservation(commandText) },
    });
    const normalizedText = commandText.trim();
    const confirmMatch = normalizedText.match(/^CONFIRMAR\s+(\d{4})$/i);
    if (/^CANCELAR$/i.test(normalizedText)) {
      let cancelled = false;
      for (const [key, pending] of aiWhatsappPendingCommands.entries()) {
        if (pending.phone === message.senderPhone
          && pending.commandContext.unitId === whatsappContext.unitId
          && pending.commandContext.actorId === whatsappContext.actorId) {
          if (!pending.used && pending.expiresAt > Date.now()) cancelled = true;
          pending.used = true;
          aiWhatsappPendingCommands.delete(key);
        }
      }
      const clarificationKey = buildAiWhatsappClarificationKey(unitId, message.senderPhone);
      if (aiWhatsappClarificationContexts.delete(clarificationKey)) cancelled = true;
      await safeAudit({
        unitId,
        action: "AI_WHATSAPP_COMMAND_CANCELLED",
        entity: "ai_whatsapp_command",
        entityId: message.maskedPhone,
        after: { cancelled, phone: message.maskedPhone },
      });
      const responseDelivered = await safeSend("Acao cancelada. Nada foi alterado.", "cancellation_result");
      return { ok: true, cancelled, responseDelivered };
    }

    if (confirmMatch) {
      const code = confirmMatch[1];
      const pendingKey = buildAiWhatsappPendingKey(message.senderPhone, code);
      const pending = aiWhatsappPendingCommands.get(pendingKey);
      if (!pending
        || pending.used
        || pending.expiresAt <= Date.now()
        || pending.commandContext.unitId !== whatsappContext.unitId
        || pending.commandContext.actorId !== whatsappContext.actorId
        || pending.commandContext.origin !== "whatsapp_webhook") {
        await safeAudit({
          unitId,
          action: "AI_WHATSAPP_COMMAND_REJECTED",
          entity: "ai_whatsapp_command",
          entityId: message.maskedPhone,
          after: { reason: "missing_or_expired_confirmation", phone: message.maskedPhone },
        });
        const responseDelivered = await safeSend("Essa acao ja foi confirmada ou expirou.", "confirmation_expired");
        return { ok: true, executed: false, responseDelivered };
      }
      pending.used = true;
      aiWhatsappPendingCommands.delete(pendingKey);
      const execution = await executeOwnerCommand({
        request,
        unitId: pending.unitId,
        actorId: pending.actorId,
        actorLabel: "owner-whatsapp",
        intent: pending.intent,
        draft: pending.draft,
        confirmationToken: pending.confirmationToken,
        idempotencyPrefix: "whatsapp-",
      });
      const executionRecord = asRecord(execution);
      const executed = executionRecord?.executed === true;
      await safeAudit({
        unitId: pending.unitId,
        action: executed ? "AI_WHATSAPP_COMMAND_CONFIRMED" : "AI_WHATSAPP_COMMAND_REJECTED",
        entity: "ai_whatsapp_command",
        entityId: pending.id,
        after: {
          intent: pending.intent,
          executed,
          phone: message.maskedPhone,
        },
      });
      await finalize(executed ? "SUCCEEDED" : "EXECUTION_FAILED");
      const responseDelivered = await safeSend(
        executed
          ? String(executionRecord?.message ?? "Acao confirmada com sucesso.")
          : String(executionRecord?.message ?? "Nao foi possivel confirmar essa acao."),
        "confirmation_result",
      );
      return { ok: true, executed, responseDelivered };
    }

    const clarificationKey = buildAiWhatsappClarificationKey(unitId, message.senderPhone);
    // Um áudio novo é sempre um comando independente. Contexto pendente só pode
    // completar uma resposta textual explícita, nunca contaminar a transcrição.
    const storedClarificationContext = aiWhatsappClarificationContexts.get(clarificationKey);
    const priorClarificationContext = audioAssistance
      ? undefined
      : storedClarificationContext?.commandContext.unitId === whatsappContext.unitId
        && storedClarificationContext.commandContext.actorId === whatsappContext.actorId
        && storedClarificationContext.commandContext.origin === "whatsapp_webhook"
        ? storedClarificationContext
        : undefined;
    let preview: OwnerCommandPreviewResponse;
    try {
      if (priorClarificationContext?.pendingField) {
        const continuation = await buildPendingClarificationParseResult({
          message: commandText,
          context: priorClarificationContext,
          unitId,
        });
        preview = await resolveParsedOwnerCommandPreview(
          { unitId, actorId, screenContext: "whatsapp" },
          continuation.parsed,
        );
        preview.parserDiagnostics = {
          strategy: "deterministic",
          status: getOwnerCommandPreviewStatus(preview),
          deterministicDurationMs: 0,
          presentFields: getOwnerCommandPresentFields(preview.draft),
          missingFields: preview.missingFields,
          correlationId,
          fieldDiagnostics: preview.fieldDiagnostics,
        };
        if (continuation.accepted) {
          await safeAudit({
            unitId,
            action: "AI_WHATSAPP_CONTEXT_COMPLETED",
            entity: "ai_whatsapp_context",
            entityId: message.maskedPhone,
            after: {
              correlationId,
              originCorrelationId: priorClarificationContext.originCorrelationId,
              pendingField: priorClarificationContext.pendingField,
              resolvedValue: continuation.resolvedValue,
            },
          });
        }
      } else {
        preview = await parseOwnerCommandPreview({
          unitId,
          actorId,
          message: commandText,
          screenContext: "whatsapp",
          correlationId,
          priorClarificationContext,
          disableSemanticProvider: audioAssistance?.provider.startsWith("local_whisper:") ?? false,
          channelContext: whatsappContext,
        });
      }

      if (audioAssistance?.provider.startsWith("local_whisper:") && audioAssistance.passCount === 1) {
        const criticalMissingFields = getAudioCriticalMissingFields(preview);
        const shouldRunSecondPass = audioAssistance.canonicalization.needsSecondPass || criticalMissingFields.length > 0;
        const elapsedMs = Date.now() - audioAssistance.startedAt;
        const remainingMs = 20_000 - elapsedMs;
        if (shouldRunSecondPass && remainingMs >= 1_000 && audioTranscriptionService) {
          const categoryByField: Record<string, string> = {
            productName: "product",
            paymentMethod: "payment",
            serviceNames: "service",
            professionalName: "professional",
            date: "datetime",
            time: "datetime",
            quantity: "sale",
          };
          const relevantCategories = new Set(
            criticalMissingFields.map((field) => categoryByField[field]).filter(Boolean),
          );
          const focusedCandidates = [
            ...audioAssistance.canonicalization.focusedCandidates,
            ...audioAssistance.vocabulary.terms
              .filter((term) => relevantCategories.has(term.category))
              .map((term) => term.canonical),
          ];
          const focusedPrompt = buildFocusedWhisperPrompt(audioAssistance.vocabulary, focusedCandidates);
          await safeAudit({
            unitId,
            action: "AI_WHATSAPP_AUDIO_SECOND_PASS_STARTED",
            entity: "ai_whatsapp_audio",
            entityId: audioAssistance.audioEntityId,
            after: {
              correlationId,
              passCount: 2,
              remainingBudgetMs: remainingMs,
              candidateCount: new Set(focusedCandidates).size,
              promptFingerprint: crypto.createHash("sha256").update(focusedPrompt).digest("hex").slice(0, 12),
            },
          });
          try {
            const secondTranscription = await audioTranscriptionService.transcribe({
              audio: audioAssistance.audioBytes,
              mimetype: audioAssistance.mimetype,
              correlationId,
              initialPrompt: focusedPrompt,
              pass: 2,
              timeoutMs: remainingMs,
            });
            const secondCanonicalization = canonicalizeAudioTranscript(
              secondTranscription.transcript.trim().slice(0, 1_000),
              audioAssistance.vocabulary,
            );
            const secondCommandText = secondCanonicalization.transcript;
            const secondPreview = await parseOwnerCommandPreview({
              unitId,
              actorId,
              message: secondCommandText,
              screenContext: "whatsapp",
              correlationId,
              priorClarificationContext,
              disableSemanticProvider: true,
              channelContext: whatsappContext,
            });
            const firstCriticalMissing = getAudioCriticalMissingFields(preview).length;
            const secondCriticalMissing = getAudioCriticalMissingFields(secondPreview).length;
            const firstAmbiguous = audioAssistance.canonicalization.fields.filter((field) => field.status === "AMBIGUOUS").length;
            const secondAmbiguous = secondCanonicalization.fields.filter((field) => field.status === "AMBIGUOUS").length;
            const decisionKey = (candidate: OwnerCommandPreviewResponse) => JSON.stringify({
              intent: candidate.intent,
              clientName: candidate.draft.clientName ?? null,
              serviceNames: candidate.draft.serviceNames ?? null,
              date: candidate.draft.date ?? null,
              time: candidate.draft.time ?? null,
            });
            if (firstCriticalMissing === 0 && secondCriticalMissing === 0
              && decisionKey(preview) !== decisionKey(secondPreview)) {
              throw new OwnerCommandParserError(
                "deterministic_conflict",
                "As transcricoes produziram comandos conflitantes.",
              );
            }
            const useSecond = secondCriticalMissing < firstCriticalMissing
              || (secondCriticalMissing === firstCriticalMissing && secondAmbiguous < firstAmbiguous);
            audioAssistance.passCount = 2;
            if (useSecond) {
              preview = secondPreview;
              commandText = secondCommandText;
              audioTranscript = secondCommandText;
              audioAssistance.canonicalization = secondCanonicalization;
            }
            await safeAudit({
              unitId,
              action: "AI_WHATSAPP_AUDIO_SECOND_PASS_COMPLETED",
              entity: "ai_whatsapp_audio",
              entityId: audioAssistance.audioEntityId,
              after: {
                correlationId,
                passCount: 2,
                selected: useSecond,
                durationMs: secondTranscription.diagnostics?.durationMs ?? null,
                vadResult: secondTranscription.diagnostics?.vadResult ?? "unknown",
                criticalMissingBefore: firstCriticalMissing,
                criticalMissingAfter: secondCriticalMissing,
                fields: secondCanonicalization.fields.map((field) => ({
                  category: field.category,
                  status: field.status,
                  score: field.score ?? null,
                })),
                correctedCategories: secondCanonicalization.correctedCategories,
                correctionFingerprints: secondCanonicalization.correctionFingerprints,
                totalDurationMs: Date.now() - audioAssistance.startedAt,
              },
            });
          } catch (secondPassError) {
            if (secondPassError instanceof OwnerCommandParserError) throw secondPassError;
            const reason = secondPassError instanceof AudioTranscriptionError
              ? secondPassError.reason
              : "audio_transcription_failed";
            await safeAudit({
              unitId,
              action: "AI_WHATSAPP_AUDIO_SECOND_PASS_FAILED",
              entity: "ai_whatsapp_audio",
              entityId: audioAssistance.audioEntityId,
              after: {
                correlationId,
                passCount: 2,
                reason,
                totalDurationMs: Date.now() - audioAssistance.startedAt,
              },
            });
          }
        }
      }
    } catch (error) {
      const reason = error instanceof OwnerCommandParserError ? error.reason : "parser_error";
      const providerAttempts = error instanceof OwnerCommandParserError ? error.attempts : [];
      const temporaryFailure = ["gemini_429", "gemini_5xx", "gemini_timeout", "gemini_circuit_open", "gemini_network_error", "local_llama_timeout", "local_llama_unavailable", "local_llama_http_error"].includes(reason);
      const invalidStructuredOutput = ["gemini_invalid_json", "gemini_invalid_schema", "gemini_empty_response", "local_llama_invalid_json", "local_llama_invalid_schema", "local_llama_empty_response"].includes(reason);
      app.log.warn({ event: "ai.whatsapp.rejected", reason, phone: message.maskedPhone });
      await safeAudit({
        unitId,
        action: "AI_WHATSAPP_AI_FAILURE",
        entity: "ai_whatsapp_command",
        entityId: message.maskedPhone,
        after: {
          reason,
          httpStatus: error instanceof OwnerCommandParserError ? error.httpStatus ?? null : null,
          providerAttempts,
          phone: message.maskedPhone,
        },
      });
      await safeAudit({
        unitId,
        action: audioAssistance?.provider.startsWith("local_whisper:")
          ? "AI_WHATSAPP_LOCAL_PARSER_FAILED"
          : "AI_WHATSAPP_GEMINI_FAILED",
        entity: "ai_whatsapp_command",
        entityId: message.maskedPhone,
        after: {
          result: invalidStructuredOutput ? "INVALID_STRUCTURED_OUTPUT" : temporaryFailure ? "TRANSIENT_PROVIDER_FAILURE" : "PERMANENT_PROVIDER_FAILURE",
          reason,
          attempts: providerAttempts,
          phone: message.maskedPhone,
        },
      });
      await finalize(invalidStructuredOutput
        ? "INVALID_STRUCTURED_OUTPUT"
        : temporaryFailure ? "SEMANTIC_TRANSIENT_FAILURE" : "SEMANTIC_PERMANENT_FAILURE");
      const responseDelivered = await safeSend(
        temporaryFailure
          ? formatAiWhatsappTemporaryFailure()
          : audioAssistance ? formatAiWhatsappAudioParserFailure() : formatAiWhatsappGuidance(),
        temporaryFailure ? "temporary_parser_failure" : "guidance_parser_failure",
      );
      return { ok: true, executed: false, unavailable: true, reason, responseDelivered };
    }
    if (audioAssistance?.provider.startsWith("local_whisper:")) {
      applyLocalAudioFieldSafety(preview, audioAssistance.canonicalization);
      await safeAudit({
        unitId,
        action: "AI_WHATSAPP_AUDIO_FIELD_VALIDATION",
        entity: "ai_whatsapp_audio",
        entityId: audioAssistance.audioEntityId,
        after: {
          correlationId,
          passCount: audioAssistance.passCount,
          fields: getLocalAudioFieldValidation(preview, audioAssistance.canonicalization),
        },
      });
    }
    if (preview.parserDiagnostics) {
      await safeAudit({
        unitId,
        action: "AI_WHATSAPP_PARSER_OBSERVED",
        entity: "ai_whatsapp_command",
        entityId: message.maskedPhone,
        after: preview.parserDiagnostics,
      });
    }
    await safeAudit({
      unitId,
      action: "AI_WHATSAPP_BOUNDARY_EVALUATED",
      entity: "ai_whatsapp_command",
      entityId: message.maskedPhone,
      after: {
        correlationId,
        stage: "owner_command_boundary_evaluated",
        ...getOwnerCommandBoundaryObservation(commandText),
      },
    });
    if (preview.parserDiagnostics?.strategy === "gemini") {
      await safeAudit({
        unitId,
        action: "AI_WHATSAPP_GEMINI_STARTED",
        entity: "ai_whatsapp_command",
        entityId: message.maskedPhone,
        after: { correlationId, stage: "owner_command_gemini_started" },
      });
      await safeAudit({
        unitId,
        action: "AI_WHATSAPP_GEMINI_COMPLETED",
        entity: "ai_whatsapp_command",
        entityId: message.maskedPhone,
        after: {
          correlationId,
          stage: "owner_command_gemini_completed",
          result: "GEMINI_SUCCESS",
          durationMs: preview.parserDiagnostics.geminiDurationMs ?? null,
          httpStatus: preview.parserDiagnostics.httpStatus ?? null,
          model: preview.parserDiagnostics.model ?? (process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash"),
          attempts: preview.parserDiagnostics.providerAttempts ?? [],
          fallbackUsed: preview.parserDiagnostics.fallbackUsed ?? false,
        },
      });
    } else if (preview.parserDiagnostics?.strategy === "local_llama") {
      await safeAudit({
        unitId,
        action: "AI_WHATSAPP_LOCAL_LLAMA_COMPLETED",
        entity: "ai_whatsapp_command",
        entityId: message.maskedPhone,
        after: {
          correlationId,
          stage: "owner_command_local_llama_completed",
          result: "LOCAL_LLAMA_SUCCESS",
          durationMs: preview.parserDiagnostics.providerDurationMs ?? null,
          httpStatus: preview.parserDiagnostics.httpStatus ?? null,
          model: preview.parserDiagnostics.model ?? null,
        },
      });
    } else if (preview.parserDiagnostics?.failureCode?.startsWith("local_llama_")) {
      await safeAudit({
        unitId,
        action: "AI_WHATSAPP_LOCAL_LLAMA_FAILED",
        entity: "ai_whatsapp_command",
        entityId: message.maskedPhone,
        after: {
          correlationId,
          stage: "owner_command_local_llama_failed",
          result: preview.parserDiagnostics.failureCode === "local_llama_timeout" ? "LOCAL_LLAMA_TIMEOUT" : "LOCAL_LLAMA_PROVIDER_ERROR",
          durationMs: preview.parserDiagnostics.providerDurationMs ?? null,
          httpStatus: preview.parserDiagnostics.httpStatus ?? null,
          failureCode: preview.parserDiagnostics.failureCode,
          model: preview.parserDiagnostics.model ?? null,
        },
      });
    } else if (preview.parserDiagnostics?.failureCode?.startsWith("gemini_")) {
      await safeAudit({
        unitId,
        action: "AI_WHATSAPP_GEMINI_FAILED",
        entity: "ai_whatsapp_command",
        entityId: message.maskedPhone,
        after: {
          correlationId,
          stage: "owner_command_gemini_failed",
          result: preview.parserDiagnostics.failureCode === "gemini_timeout" ? "GEMINI_TIMEOUT" : "GEMINI_PROVIDER_ERROR",
          durationMs: preview.parserDiagnostics.geminiDurationMs ?? null,
          httpStatus: preview.parserDiagnostics.httpStatus ?? null,
          failureCode: preview.parserDiagnostics.failureCode,
          model: preview.parserDiagnostics.model ?? null,
          attempts: preview.parserDiagnostics.providerAttempts ?? [],
          fallbackUsed: preview.parserDiagnostics.fallbackUsed ?? false,
        },
      });
    }
    await safeAudit({
      unitId,
      action: "AI_WHATSAPP_PARSER_COMPLETED",
      entity: "ai_whatsapp_command",
      entityId: message.maskedPhone,
      after: {
        correlationId,
        stage: "owner_command_parser_completed",
        result: preview.parserDiagnostics?.status ?? "UNSUPPORTED",
        intent: preview.intent,
        presentFields: preview.parserDiagnostics?.presentFields ?? [],
        missingFields: preview.missingFields,
      },
    });
    await safeAudit({
      unitId,
      action: "AI_WHATSAPP_ENTITY_RESOLUTION_COMPLETED",
      entity: "ai_whatsapp_command",
      entityId: message.maskedPhone,
      after: {
        correlationId,
        stage: "owner_command_entity_resolution_completed",
        entities: preview.entityResolutionDiagnostics ?? [],
      },
    });
    if (!aiWhatsappAllowedIntents.has(preview.intent) || !preview.confirmationToken || !preview.allowedNextActions.includes("confirm_execute")) {
      if (preview.intent === "schedule_appointment"
        && Object.values(preview.fieldDiagnostics ?? {}).some((field) => field.status === "accepted")) {
        const pendingField = selectAiWhatsappScheduleClarificationField(preview.missingFields);
        const clarificationContext: AiWhatsappClarificationContext = {
          unitId,
          phone: message.senderPhone,
          intent: "schedule_appointment",
          draft: { ...preview.draft },
          missingFields: [...preview.missingFields],
          fieldDiagnostics: preview.fieldDiagnostics,
          pendingField,
          proposedValue: pendingField === "time"
            ? preview.fieldDiagnostics?.time?.proposedValue
            : pendingField === "clientName" && typeof preview.draft.clientName === "string"
              ? preview.draft.clientName.trim()
              : undefined,
          originCorrelationId: correlationId,
          commandContext: whatsappContext,
          expiresAt: Date.now() + getAiWhatsappTtlMs(),
        };
        aiWhatsappClarificationContexts.set(clarificationKey, clarificationContext);
        await safeAudit({
          unitId,
          action: "AI_WHATSAPP_CONTEXT_STORED",
          entity: "ai_whatsapp_context",
          entityId: message.maskedPhone,
          after: {
            correlationId,
            intent: clarificationContext.intent,
            presentFields: getOwnerCommandPresentFields(clarificationContext.draft),
            pendingField: clarificationContext.pendingField ?? null,
            proposedValue: clarificationContext.proposedValue ?? null,
            expiresAt: new Date(clarificationContext.expiresAt).toISOString(),
          },
        });
      }
      await safeAudit({
        unitId,
        action: "AI_WHATSAPP_FINAL_DECISION",
        entity: "ai_whatsapp_command",
        entityId: message.maskedPhone,
        after: {
          correlationId,
          stage: "owner_command_final_decision",
          result: preview.intent === "unknown" ? "FINAL_SAFE_FAILURE" : "FINAL_CLARIFICATION",
          reason: preview.intent === "unknown" ? "unsupported_intent" : "incomplete_or_unsafe",
        },
      });
      await safeAudit({
        unitId,
        action: "AI_WHATSAPP_COMMAND_REJECTED",
        entity: "ai_whatsapp_command",
        entityId: message.maskedPhone,
        after: {
          reason: "unsupported_or_incomplete_intent",
          intent: preview.intent,
          missingFields: preview.missingFields,
          phone: message.maskedPhone,
        },
      });
      const hasAmbiguity = Boolean(preview.ambiguities?.length)
        || Object.values(preview.fieldDiagnostics ?? {}).some((field) => field.status === "ambiguous");
      const hasGroundingFailure = (preview.entityResolutionDiagnostics ?? []).some((entity) =>
        !["EXACT_MATCH", "NOT_FOUND_NEW_CLIENT", "RESOLVED"].includes(entity.result));
      await finalize(preview.intent === "unknown"
        ? "UNKNOWN_INTENT"
        : hasAmbiguity
          ? "AMBIGUOUS_FIELDS"
          : hasGroundingFailure ? "GROUNDING_FAILED" : "MISSING_FIELDS");
      const responseDelivered = await safeSend(
        preview.intent === "unknown"
          ? audioAssistance ? formatAiWhatsappAudioParserFailure() : formatAiWhatsappGuidance()
          : preview.executionMessage ?? formatAiWhatsappEntityClarification(preview),
        preview.intent === "unknown" ? "guidance_unsupported_intent" : "entity_clarification",
      );
      return { ok: true, executed: false, intent: preview.intent, responseDelivered };
    }

    const code = generateAiWhatsappCode();
    aiWhatsappClarificationContexts.delete(buildAiWhatsappClarificationKey(unitId, message.senderPhone));
    const pending: AiWhatsappPendingCommand = {
      id: crypto.randomUUID(),
      code,
      phone: message.senderPhone,
      unitId,
      actorId,
      commandContext: whatsappContext,
      intent: preview.intent,
      draft: preview.draft as OwnerCommandDraft,
      confirmationToken: preview.confirmationToken,
      expiresAt: Date.now() + getAiWhatsappTtlMs(),
      used: false,
    };
    aiWhatsappPendingCommands.set(buildAiWhatsappPendingKey(message.senderPhone, code), pending);
    await safeAudit({
      unitId,
      action: "AI_WHATSAPP_FINAL_DECISION",
      entity: "ai_whatsapp_command",
      entityId: pending.id,
      after: {
        correlationId,
        stage: "owner_command_final_decision",
        result: "FINAL_PREVIEW",
        reason: "preview_executable",
      },
    });
    if (preview.fallbackReason) {
      await safeAudit({
        unitId,
        action: "AI_WHATSAPP_FALLBACK_USED",
        entity: "ai_whatsapp_command",
        entityId: pending.id,
        after: { reason: preview.fallbackReason, intent: preview.intent, phone: message.maskedPhone },
      });
    }
    await safeAudit({
      unitId,
      action: "AI_WHATSAPP_COMMAND_PARSED",
      entity: "ai_whatsapp_command",
      entityId: pending.id,
      after: {
        intent: preview.intent,
        expiresAt: new Date(pending.expiresAt).toISOString(),
        phone: message.maskedPhone,
        missingFields: preview.missingFields,
      },
    });
    const responseDelivered = await safeSend(
      audioTranscript ? formatAiWhatsappAudioPreview(audioTranscript, preview, code) : formatAiWhatsappPreview(preview, code),
      audioTranscript ? "audio_preview" : "text_preview",
    );
    return { ok: true, mode: "preview_only", intent: preview.intent, executed: false, audio: Boolean(audioTranscript), responseDelivered };
    } catch {
      app.log.error({ event: "ai.whatsapp.unexpected_failure", phone: message.maskedPhone });
      await safeAudit({
        unitId,
        action: "AI_WHATSAPP_COMMAND_REJECTED",
        entity: "ai_whatsapp_command",
        entityId: message.maskedPhone,
        after: { reason: "webhook_unexpected_failure", phone: message.maskedPhone },
      });
      const responseDelivered = await safeSend(formatAiWhatsappTemporaryFailure(), "unexpected_failure");
      return { ok: true, executed: false, unavailable: true, reason: "webhook_unexpected_failure", responseDelivered };
    }
  });

  app.post("/integrations/webhooks/outbound/test", async (request) => {
    const body = integrationWebhookOutboundTestSchema.parse(request.body);
    return await operations.testOutboundWebhook({
      ...body,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
    });
  });

  app.post("/integrations/webhooks/inbound/:provider", async (request) => {
    const params = z.object({ provider: z.string().min(2).max(60) }).parse(request.params);
    const body = integrationWebhookInboundSchema.parse(request.body);
    return await operations.receiveInboundWebhook({
      provider: params.provider,
      unitId: body.unitId,
      endpoint: `/integrations/webhooks/inbound/${params.provider}`,
      payload: body.payload,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
    });
  });

  app.get("/integrations/webhooks/logs", async (request) => {
    const query = integrationWebhookLogsQuerySchema.parse(request.query);
    return await operations.getIntegrationWebhookLogs({
      unitId: query.unitId,
      provider: query.provider,
      status: query.status,
      start: new Date(query.start),
      end: new Date(query.end),
    });
  });

  app.post("/integrations/billing/subscriptions/sync", async (request) => {
    const body = billingSubscriptionsSyncSchema.parse(request.body);
    return await operations.syncBillingSubscriptions({
      unitId: body.unitId,
      occurredAt: new Date(body.occurredAt),
      changedBy: body.changedBy,
    });
  });

  app.post("/integrations/billing/webhooks/:provider", async (request) => {
    const params = z.object({ provider: z.string().min(2).max(60) }).parse(request.params);
    const body = billingWebhookEventSchema.parse(request.body);
    const signatureHeader = request.headers["x-billing-signature"];
    const signature =
      typeof signatureHeader === "string"
        ? signatureHeader
        : Array.isArray(signatureHeader)
          ? signatureHeader[0]
          : undefined;
    const rawPayload = JSON.stringify(body);
    const isValidSignature = verifyBillingWebhookSignature({
      payload: rawPayload,
      signature,
      secret: getBillingWebhookSecret(params.provider),
    });
    if (!isValidSignature) {
      throw new Error("Assinatura de webhook invalida");
    }

    const req = request as RequestWithAuth;
    return await operations.processBillingWebhookEvent({
      provider: params.provider,
      endpoint: `/integrations/billing/webhooks/${params.provider}`,
      unitId: body.unitId,
      eventId: body.eventId,
      idempotencyKey: body.idempotencyKey,
      subscriptionId: body.subscriptionId,
      externalSubscriptionId: body.externalSubscriptionId,
      eventType: body.eventType,
      status: body.status,
      amount: body.amount,
      occurredAt: new Date(body.occurredAt),
      payload: body.payload,
      correlationId: req.correlationId,
    });
  });

  app.get("/billing/reconciliation/summary", async (request) => {
    const query = billingReconciliationQuerySchema.parse(request.query);
    return await operations.getBillingReconciliationSummary({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
    });
  });

  app.get("/billing/reconciliation/discrepancies", async (request) => {
    const query = billingReconciliationDiscrepanciesQuerySchema.parse(request.query);
    return await operations.getBillingReconciliationDiscrepancies({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
      status: query.status,
      type: query.type,
      limit: query.limit,
    });
  });

  app.post("/billing/reconciliation/discrepancies/:id/resolve", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = billingReconciliationResolveSchema.parse(request.body);
    const req = request as RequestWithAuth;
    const resolvedBy = body.changedBy ?? req.auth?.userId ?? "system";

    const result = await operations.resolveBillingReconciliationDiscrepancy({
      unitId: body.unitId,
      discrepancyId: params.id,
      resolvedBy,
      action: body.action,
      note: body.note,
      start: new Date(body.start),
      end: new Date(body.end),
    });

    await recordAudit(request, {
      unitId: body.unitId,
      action: "BILLING_RECONCILIATION_RESOLVE",
      entity: "billing_reconciliation_discrepancy",
      entityId: params.id,
      after: {
        resolvedBy,
        action: body.action,
      },
    });

    return result;
  });

  // ─── Rotas públicas de agendamento (sem autenticação) ──────────────────────

  const PILOT_PUBLIC_BOOKING_UNIT_ID = "unit-geovane-borges";
  const PUBLIC_BOOKING_UNIT_NOT_FOUND_MESSAGE =
    "Nao encontramos a unidade de agendamento. Confira o link e tente novamente.";

  const normalizePublicUnitId = (value?: unknown) => String(value ?? "").trim();

  const hasPublicCatalogForUnit = async (unitId: string) => {
    if (!unitId) return false;
    if (backend === "prisma") {
      const [unit, services] = await Promise.all([
        prisma.unit.findUnique({ where: { id: unitId }, select: { id: true } }),
        prisma.service.findMany({
          where: { businessId: unitId, active: true },
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            notes: true,
            active: true,
            professionals: {
              select: {
                professional: {
                  select: { id: true, name: true, businessId: true, active: true },
                },
              },
            },
          },
        }),
      ]);
      if (!unit) return false;
      return services.some(
        (service) =>
          isPublicOperationalService(service) &&
          service.professionals.some(
            ({ professional }) =>
              professional.businessId === unitId &&
              professional.active &&
              isPublicOperationalProfessional(professional),
          ),
      );
    }
    if (!memoryStore.units.some((unit) => unit.id === unitId)) return false;
    const publicProfessionalIds = new Set(
      memoryStore.professionals
        .filter((professional) => professional.businessId === unitId && professional.active)
        .filter(isPublicOperationalProfessional)
        .map((professional) => professional.id),
    );
    return memoryStore.services
      .filter((service) => (service.businessId ?? unitId) === unitId && service.active)
      .filter(isPublicOperationalService)
      .some((service) =>
        memoryStore.serviceProfessionalAssignments.some(
          (assignment) =>
            assignment.serviceId === service.id &&
            publicProfessionalIds.has(assignment.professionalId),
        ),
      );
  };

  const findPublicBookingUnitCandidates = async () => {
    if (backend === "prisma") {
      const services = await prisma.service.findMany({
        where: { active: true },
        select: {
          businessId: true,
          id: true,
          name: true,
          description: true,
          category: true,
          notes: true,
          active: true,
          professionals: {
            select: {
              professional: {
                select: { id: true, name: true, businessId: true, active: true },
              },
            },
          },
        },
      });
      const unitIds = Array.from(new Set(
        services
          .filter(
            (service) =>
              isPublicOperationalService(service) &&
              service.professionals.some(
                ({ professional }) =>
                  professional.businessId === service.businessId &&
                  professional.active &&
                  isPublicOperationalProfessional(professional),
              ),
          )
          .map((service) => service.businessId),
      ));
      if (!unitIds.length) return [];
      const units = await prisma.unit.findMany({
        where: { id: { in: unitIds } },
        select: { id: true },
      });
      const existingUnitIds = new Set(units.map((unit) => unit.id));
      return unitIds.filter((unitId) => existingUnitIds.has(unitId)).sort();
    }
    const unitIds = new Set<string>();
    for (const service of memoryStore.services) {
      const unitId = service.businessId ?? "";
      if (!unitId || !service.active || !isPublicOperationalService(service)) continue;
      const hasProfessional = memoryStore.serviceProfessionalAssignments.some((assignment) => {
        if (assignment.serviceId !== service.id) return false;
        const professional = memoryStore.professionals.find((item) => item.id === assignment.professionalId);
        return Boolean(
          professional &&
          professional.businessId === unitId &&
          professional.active &&
          isPublicOperationalProfessional(professional),
        );
      });
      if (hasProfessional && memoryStore.units.some((unit) => unit.id === unitId)) unitIds.add(unitId);
    }
    return Array.from(unitIds).sort();
  };

  const resolvePublicUnitId = async (value?: unknown) => {
    const fromRequest = normalizePublicUnitId(value);
    if (fromRequest) {
      return (await hasPublicCatalogForUnit(fromRequest)) ? fromRequest : null;
    }

    const fromConfig = normalizePublicUnitId(process.env.PUBLIC_BOOKING_UNIT_ID);
    if (fromConfig && (await hasPublicCatalogForUnit(fromConfig))) return fromConfig;

    const candidates = await findPublicBookingUnitCandidates();
    if (candidates.length === 1) return candidates[0];

    // Fallback centralizado do piloto. Substituir por PUBLIC_BOOKING_UNIT_ID
    // quando houver mais de uma unidade publica ativa.
    if (await hasPublicCatalogForUnit(PILOT_PUBLIC_BOOKING_UNIT_ID)) {
      return PILOT_PUBLIC_BOOKING_UNIT_ID;
    }
    return null;
  };

  type PublicBookingService = {
    id: string;
    name: string;
    description?: string | null;
    category?: string | null;
    notes?: string | null;
    price: number | bigint | { toNumber(): number };
    durationMin: number;
    active: boolean;
  };

  type PublicBookingProfessional = {
    id: string;
    name: string;
  };

  type PublicBusySlot = {
    professionalId: string;
    startsAt: Date;
    endsAt: Date;
  };

  const activeAppointmentStatuses: AppointmentStatus[] = [
    "SCHEDULED",
    "CONFIRMED",
    "IN_SERVICE",
    "BLOCKED",
  ];

  const sortPublicProfessionals = (items: PublicBookingProfessional[]) =>
    [...items].sort((a, b) => {
      const byName = a.name.localeCompare(b.name, "pt-BR");
      return byName || a.id.localeCompare(b.id, "pt-BR");
    });

  const normalizePublicProfessionalId = (value?: unknown) => {
    const normalized = String(value ?? "").trim();
    return normalized || undefined;
  };

  const normalizePublicServiceIds = (input: { serviceId?: string; serviceIds?: string[] }) => {
    if (input.serviceId !== undefined && input.serviceIds !== undefined) {
      throw new Error("Informe serviceId ou serviceIds, nao ambos");
    }
    if (Array.isArray(input.serviceIds)) {
      return normalizeServiceIds(input.serviceIds);
    }
    return normalizeServiceIds([input.serviceId]);
  };

  const parsePublicServiceIdsQuery = (value: unknown) => {
    if (Array.isArray(value)) return value.map((item) => String(item));
    const raw = String(value ?? "").trim();
    if (!raw) return undefined;
    return raw.split(",").map((item) => item.trim()).filter(Boolean);
  };

  const normalizeOptionalPublicEmail = (value: unknown) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized || undefined;
  };

  const getPublicServiceForBooking = async (
    unitId: string,
    serviceId: string,
  ): Promise<PublicBookingService | null> => {
    if (backend === "prisma") {
      const service = await prisma.service.findFirst({
        where: { id: serviceId, businessId: unitId, active: true },
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          notes: true,
          price: true,
          durationMin: true,
          active: true,
        },
      });
      return service && isPublicOperationalService(service) ? service : null;
    }
    const service = memoryStore.services.find(
      (item) => item.id === serviceId && item.active && (item.businessId ?? unitId) === unitId,
    );
    if (!service) return null;
    const publicService = {
      id: service.id,
      name: service.name,
      description: service.description,
      category: service.category,
      notes: service.notes,
      price: service.price,
      durationMin: service.durationMin,
      active: service.active,
    };
    return isPublicOperationalService(publicService) ? publicService : null;
  };

  const getPublicServicesForBooking = async (
    unitId: string,
    serviceIds: string[],
  ): Promise<PublicBookingService[]> => {
    const services = await Promise.all(
      serviceIds.map((serviceId) => getPublicServiceForBooking(unitId, serviceId)),
    );
    if (services.some((item) => !item)) return [];
    return services as PublicBookingService[];
  };

  const getPublicEligibleProfessionals = async (
    unitId: string,
    serviceId: string,
    professionalId?: string,
  ): Promise<PublicBookingProfessional[]> => {
    if (backend === "prisma") {
      const rows = await prisma.serviceProfessional.findMany({
        where: {
          serviceId,
          ...(professionalId ? { professionalId } : {}),
          service: { businessId: unitId, active: true },
          professional: { businessId: unitId, active: true },
        },
        include: {
          professional: { select: { id: true, name: true } },
        },
        orderBy: [{ professional: { name: "asc" } }, { professionalId: "asc" }],
      });
      return sortPublicProfessionals(
        Array.from(
          new Map(rows.map((row) => [
            row.professional.id,
            {
            id: row.professional.id,
            name: row.professional.name,
            },
          ])).values(),
        )
          .filter(isPublicOperationalProfessional),
      );
    }

    const linkedIds = memoryStore.serviceProfessionalAssignments
      .filter((item) => item.serviceId === serviceId)
      .map((item) => item.professionalId);
    const professionals = memoryStore.professionals
      .filter((item) => item.active && (item.businessId ?? unitId) === unitId)
      .filter((item) => linkedIds.includes(item.id))
      .filter((item) => !professionalId || item.id === professionalId)
      .filter(isPublicOperationalProfessional)
      .map((item) => ({ id: item.id, name: item.name }));
    return sortPublicProfessionals(professionals);
  };

  const getPublicEligibleProfessionalsForServices = async (
    unitId: string,
    serviceIds: string[],
    professionalId?: string,
  ): Promise<PublicBookingProfessional[]> => {
    const lists = await Promise.all(
      serviceIds.map((serviceId) => getPublicEligibleProfessionals(unitId, serviceId, professionalId)),
    );
    if (lists.some((items) => items.length === 0)) return [];
    const [first, ...rest] = lists;
    return sortPublicProfessionals(
      first.filter((professional) =>
        rest.every((items) => items.some((item) => item.id === professional.id)),
      ),
    );
  };

  const getPublicBusySlots = async (
    unitId: string,
    professionalIds: string[],
    start: Date,
    end: Date,
    bufferAfterMin = 0,
  ): Promise<PublicBusySlot[]> => {
    if (!professionalIds.length) return [];
    const bufferMs = Math.max(0, Math.trunc(bufferAfterMin)) * 60_000;
    const queryStart = new Date(start.getTime() - bufferMs);
    const queryEnd = new Date(end.getTime() + bufferMs);
    if (backend === "prisma") {
      const [appointments, blocks] = await Promise.all([
        prisma.appointment.findMany({
        where: {
          unitId,
          professionalId: { in: professionalIds },
          startsAt: { lt: queryEnd },
          endsAt: { gt: queryStart },
          status: { in: activeAppointmentStatuses },
        },
        select: { professionalId: true, startsAt: true, endsAt: true },
        }),
        prisma.appointmentBlock.findMany({
          where: {
            unitId,
            status: "ACTIVE",
            startsAt: { lt: queryEnd },
            endsAt: { gt: queryStart },
            OR: [{ professionalId: null }, { professionalId: { in: professionalIds } }],
          },
          select: { professionalId: true, startsAt: true, endsAt: true },
        }),
      ]);
      return [
        ...appointments,
        ...blocks.flatMap((block) =>
          (block.professionalId ? [block.professionalId] : professionalIds).map((professionalId) => ({
            professionalId,
            startsAt: block.startsAt,
            endsAt: block.endsAt,
          })),
        ),
      ];
    }
    const appointmentSlots = memoryStore.appointments
      .filter(
        (item) =>
          item.unitId === unitId &&
          professionalIds.includes(item.professionalId) &&
          activeAppointmentStatuses.includes(item.status) &&
          item.startsAt < queryEnd &&
          item.endsAt > queryStart,
      )
      .map((item) => ({
        professionalId: item.professionalId,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
      }));
    const blockSlots = memoryStore.appointmentBlocks
      .filter(
        (block) =>
          block.unitId === unitId &&
          block.status === "ACTIVE" &&
          block.startsAt < queryEnd &&
          block.endsAt > queryStart &&
          (!block.professionalId || professionalIds.includes(block.professionalId)),
      )
      .flatMap((block) =>
        (block.professionalId ? [block.professionalId] : professionalIds).map((professionalId) => ({
          professionalId,
          startsAt: block.startsAt,
          endsAt: block.endsAt,
        })),
      );
    return [...appointmentSlots, ...blockSlots];
  };

  const isProfessionalAvailableFromBusySlots = (
    professionalId: string,
    startsAt: Date,
    endsAt: Date,
    busySlots: PublicBusySlot[],
    bufferAfterMin = 0,
  ) =>
    !busySlots.some((item) => {
      const bufferMs = Math.max(0, Math.trunc(bufferAfterMin)) * 60_000;
      return (
        item.professionalId === professionalId &&
        startsAt < new Date(item.endsAt.getTime() + bufferMs) &&
        new Date(endsAt.getTime() + bufferMs) > item.startsAt
      );
    });

  const resolvePublicBufferAfterMin = async (unitId: string) => {
    if (backend === "prisma") {
      const settings = await prisma.businessSettings.findUnique({
        where: { unitId },
        select: { bufferBetweenAppointmentsMinutes: true },
      });
      return Math.max(0, Math.trunc(settings?.bufferBetweenAppointmentsMinutes ?? 0));
    }
    const settings = await operations.getBusinessSettings({ unitId });
    const business = ((settings as { business?: { bufferBetweenAppointmentsMinutes?: number } })?.business
      ?? settings) as { bufferBetweenAppointmentsMinutes?: number };
    return Math.max(0, Math.trunc(Number(business?.bufferBetweenAppointmentsMinutes ?? 0)));
  };

  const resolvePublicServicesContract = async (unitId: string, serviceIds: string[]) => {
    const services = await getPublicServicesForBooking(unitId, serviceIds);
    if (services.length !== serviceIds.length) return null;
    const serviceItems = services.map((service, position) => ({
      id: `public-${service.id}`,
      appointmentId: "public-preview",
      serviceId: service.id,
      position,
      serviceNameSnapshot: service.name,
      servicePriceSnapshot: Number(service.price),
      serviceDurationMinSnapshot: service.durationMin,
    }));
    let activeRules: Array<{
      id: string;
      unitId: string;
      serviceSetKey: string;
      label: string;
      effectiveDurationMin: number;
      active: boolean;
      items: [];
    }> = [];
    if (backend === "prisma") {
      const rows = await prisma.serviceCombinationRule.findMany({
        where: { unitId, active: true },
        select: {
          id: true,
          unitId: true,
          serviceSetKey: true,
          label: true,
          effectiveDurationMin: true,
          active: true,
        },
      });
      activeRules = rows.map((row) => ({ ...row, items: [] }));
    } else {
      activeRules = memoryStore.serviceCombinationRules
        .filter((rule) => rule.unitId === unitId && rule.active)
        .map((rule) => ({
          id: rule.id,
          unitId: rule.unitId,
          serviceSetKey: rule.serviceSetKey,
          label: rule.label,
          effectiveDurationMin: rule.effectiveDurationMin,
          active: rule.active,
          items: [],
        }));
    }
    const duration = resolveEffectiveAppointmentDuration({
      items: serviceItems,
      activeRules,
    });
    return {
      services,
      serviceItems,
      totalPriceSnapshot: calculateAppointmentServicesTotal(serviceItems),
      effectiveDurationMin: duration.effectiveDurationMin,
      duration,
    };
  };

  const resolvePublicProfessionalForSlot = async (input: {
    unitId: string;
    serviceIds: string[];
    startsAt: Date;
    endsAt: Date;
    bufferAfterMin: number;
    professionalId?: string;
  }) => {
    const eligible = await getPublicEligibleProfessionalsForServices(
      input.unitId,
      input.serviceIds,
      input.professionalId,
    );
    if (!eligible.length) {
      return {
        professional: null,
        reason: input.professionalId
          ? "Profissional indisponivel para todos os servicos"
          : "Nenhum profissional disponivel para todos os servicos",
      };
    }
    const busySlots = await getPublicBusySlots(
      input.unitId,
      eligible.map((item) => item.id),
      input.startsAt,
      input.endsAt,
      input.bufferAfterMin,
    );
    const professional =
      eligible.find((item) =>
        isProfessionalAvailableFromBusySlots(item.id, input.startsAt, input.endsAt, busySlots, input.bufferAfterMin),
      ) ?? null;
    return {
      professional,
      reason: professional ? null : "Horario indisponivel. Por favor escolha outro horario.",
    };
  };

  app.get("/public/services", async (request, reply) => {
    const query = z.object({ unitId: z.string().min(1).optional() }).parse(request.query);
    const unitId = await resolvePublicUnitId(query.unitId);
    if (!unitId) {
      reply.status(404).send({ error: PUBLIC_BOOKING_UNIT_NOT_FOUND_MESSAGE });
      return;
    }
    if (backend === "prisma") {
      const services = (await prisma.service.findMany({
        where: { businessId: unitId, active: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          notes: true,
          price: true,
          durationMin: true,
        },
      })).filter(isPublicOperationalService);
      return services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        category: s.category,
        price: Number(s.price),
        durationMinutes: s.durationMin,
      }));
    }
    const result = await operations.getServices({ unitId, status: "ACTIVE" });
    return (result.services ?? [])
      .filter(isPublicOperationalService)
      .map((service: any) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        category: service.category,
        price: service.price,
        imageUrl: service.imageUrl,
        durationMinutes: service.durationMinutes ?? service.durationMin ?? service.duration,
      }));
  });

  app.post("/public/services/preview", async (request, reply) => {
    const body = z.object({
      unitId: z.string().min(1).optional(),
      serviceIds: z.array(z.string().min(1)).min(MIN_APPOINTMENT_SERVICES).max(MAX_APPOINTMENT_SERVICES),
    }).parse(request.body);
    const unitId = await resolvePublicUnitId(body.unitId);
    if (!unitId) {
      reply.status(404).send({ error: PUBLIC_BOOKING_UNIT_NOT_FOUND_MESSAGE });
      return;
    }
    const serviceIds = normalizePublicServiceIds({ serviceIds: body.serviceIds });
    const contract = await resolvePublicServicesContract(unitId, serviceIds);
    if (!contract) {
      reply.status(404).send({ error: "Servico nao encontrado" });
      return;
    }
    return {
      serviceIds,
      services: contract.services.map((service) => ({
        id: service.id,
        name: service.name,
        price: Number(service.price),
        durationMinutes: service.durationMin,
      })),
      serviceItems: contract.serviceItems,
      totalPrice: contract.totalPriceSnapshot,
      totalPriceSnapshot: contract.totalPriceSnapshot,
      effectiveDurationMin: contract.effectiveDurationMin,
      calculationMode: contract.duration.calculationMode,
      ruleId: contract.duration.matchedRuleId,
      ruleLabel: contract.duration.matchedRuleLabel,
    };
  });
  app.get("/public/services/:serviceId/professionals", async (request, reply) => {
    const params = z.object({ serviceId: z.string().min(1) }).parse(request.params);
    const query = z.object({ unitId: z.string().min(1).optional() }).parse(request.query);
    const unitId = await resolvePublicUnitId(query.unitId);
    if (!unitId) {
      reply.status(404).send({ error: PUBLIC_BOOKING_UNIT_NOT_FOUND_MESSAGE });
      return;
    }
    const service = await getPublicServiceForBooking(unitId, params.serviceId);
    if (!service) {
      reply.status(404).send({ error: "Servico nao encontrado" });
      return;
    }
    const professionals = await getPublicEligibleProfessionals(unitId, service.id);
    return {
      service: {
        id: service.id,
        name: service.name,
      },
      professionals: professionals.map((item) => ({
        id: item.id,
        name: item.name,
        displayName: item.name,
      })),
    };
  });

  app.get("/public/business", async (request, reply) => {
    const query = z.object({ unitId: z.string().min(1).optional() }).parse(request.query);
    const unitId = await resolvePublicUnitId(query.unitId);
    if (!unitId) {
      reply.status(404).send({ error: PUBLIC_BOOKING_UNIT_NOT_FOUND_MESSAGE });
      return;
    }
    if (backend === "prisma") {
      const settings = await prisma.businessSettings.findUnique({
        where: { unitId },
        select: { businessName: true, displayName: true, segment: true },
      });
      const fallbackName = (await prisma.unit.findUnique({
        where: { id: unitId },
        select: { name: true },
      }))?.name ?? "Agendamento";
      return {
        name: settings?.displayName?.trim() || settings?.businessName?.trim() || fallbackName,
        segment: settings?.segment ?? null,
      };
    }
    let settings: unknown = null;
    try {
      settings = await operations.getBusinessSettings({ unitId });
    } catch (_) {
      settings = null;
    }
    const business = (settings as { business?: { displayName?: string; businessName?: string; segment?: string } } | null)?.business
      ?? (settings as { displayName?: string; businessName?: string; segment?: string } | null);
    return {
      name: business?.displayName?.trim() || business?.businessName?.trim() || "Agendamento",
      segment: business?.segment ?? null,
    };
  });

  app.get("/public/working-hours", async (request, reply) => {
    const query = z.object({ unitId: z.string().min(1).optional() }).parse(request.query);
    const unitId = await resolvePublicUnitId(query.unitId);
    if (!unitId) {
      reply.status(404).send({ error: PUBLIC_BOOKING_UNIT_NOT_FOUND_MESSAGE });
      return;
    }
    const workingHours = await resolveWorkingHoursForUnit(unitId, operations);
    return { workingHours };
  });

  app.get("/public/slots", async (request, reply) => {
    const query = z
      .object({
        serviceId: z.string().min(1).optional(),
        serviceIds: z.preprocess(
          parsePublicServiceIdsQuery,
          z.array(z.string().min(1)).min(MIN_APPOINTMENT_SERVICES).max(MAX_APPOINTMENT_SERVICES).optional(),
        ),
        weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        unitId: z.string().min(1).optional(),
        professionalId: z.string().min(1).optional(),
      })
      .refine((value) => value.serviceId != null || value.serviceIds != null, {
        message: "Informe ao menos um servico para consultar horarios",
      })
      .refine((value) => !(value.serviceId != null && value.serviceIds != null), {
        message: "Informe serviceId ou serviceIds, nao ambos",
      })
      .parse(request.query);

    const unitId = await resolvePublicUnitId(query.unitId);
    if (!unitId) {
      reply.status(404).send({ error: PUBLIC_BOOKING_UNIT_NOT_FOUND_MESSAGE });
      return;
    }
    const weekStartDate = new Date(`${query.weekStart}T00:00:00.000-03:00`);

    const serviceIds = normalizePublicServiceIds({
      serviceId: query.serviceId,
      serviceIds: query.serviceIds,
    });
    const contract = await resolvePublicServicesContract(unitId, serviceIds);
    if (!contract) {
      reply.status(404).send({ error: "Servico nao encontrado" });
      return;
    }
    const eligibleProfessionals = await getPublicEligibleProfessionalsForServices(
      unitId,
      serviceIds,
      query.professionalId,
    );
    if (query.professionalId && !eligibleProfessionals.length) {
      reply.status(409).send({ error: "Profissional indisponivel para todos os servicos" });
      return;
    }
    const eligibleProfessionalIds = eligibleProfessionals.map((item) => item.id);
    const durationMin = contract.effectiveDurationMin;
    const bufferAfterMin = await resolvePublicBufferAfterMin(unitId);

    // Horários de funcionamento por dia da semana
    let businessHours: Array<{
      dayOfWeek: number;
      opensAt: string | null;
      closesAt: string | null;
      isClosed: boolean;
    }> = [];
    if (backend === "prisma") {
      businessHours = await prisma.businessHour.findMany({ where: { unitId } });
    }

    // Agendamentos da semana
    const weekEnd = new Date(weekStartDate.getTime() + 7 * 24 * 3600_000);
    const busySlots = await getPublicBusySlots(
      unitId,
      eligibleProfessionalIds,
      weekStartDate,
      weekEnd,
      bufferAfterMin,
    );

    const now = new Date();
    const minAdvanceMs = 30 * 60_000;
    const result: Record<
      string,
      {
        time: string;
        available: boolean;
        professionalId?: string;
        professionalName?: string;
      }[]
    > = {};

    for (let d = 0; d < 7; d++) {
      const day = new Date(weekStartDate.getTime() + d * 24 * 3600_000);
      const dateKey = day.toISOString().slice(0, 10);
      const dayOfWeek = day.getDay(); // 0=dom

      const bh = businessHours.find((h) => h.dayOfWeek === dayOfWeek);
      if (bh?.isClosed || (!bh && businessHours.length > 0)) {
        result[dateKey] = [];
        continue;
      }

      const opensAt = bh?.opensAt ?? "08:00";
      const closesAt = bh?.closesAt ?? "20:00";
      const [openH, openM] = opensAt.split(":").map(Number) as [number, number];
      const [closeH, closeM] = closesAt.split(":").map(Number) as [number, number];

      const slots: {
        time: string;
        available: boolean;
        professionalId?: string;
        professionalName?: string;
      }[] = [];
      let slotMin = openH * 60 + openM;
      const endMin = closeH * 60 + closeM - durationMin - bufferAfterMin;

      while (slotMin <= endMin) {
        const h = Math.floor(slotMin / 60).toString().padStart(2, "0");
        const m = (slotMin % 60).toString().padStart(2, "0");
        const slotDate = new Date(
          `${dateKey}T${h}:${m}:00.000-03:00`,
        );

        const isPast = slotDate.getTime() - now.getTime() < minAdvanceMs;
        const slotEnd = new Date(slotDate.getTime() + durationMin * 60_000);
        const professional = eligibleProfessionals.find((item) =>
          isProfessionalAvailableFromBusySlots(item.id, slotDate, slotEnd, busySlots, bufferAfterMin),
        );

        slots.push({
          time: `${h}:${m}`,
          available: !isPast && Boolean(professional),
          ...(professional
            ? {
                professionalId: professional.id,
                professionalName: professional.name,
              }
            : {}),
        });
        slotMin += 30;
      }

      result[dateKey] = slots;
    }

    return result;
  });

  const publicBookingIdempotencyRecords = new Map<string, { payloadHash: string; responseJson: unknown }>();
  const publicBookingAction = "PUBLIC_BOOKING_CREATE";

  const getPublicBookingReplay = async (unitId: string, idempotencyKey: string, payloadHash: string) => {
    if (backend === "prisma") {
      const existing = await prisma.idempotencyRecord.findUnique({
        where: { unitId_action_idempotencyKey: { unitId, action: publicBookingAction, idempotencyKey } },
      });
      if (!existing) return null;
      if (existing.payloadHash !== payloadHash) {
        throw new Error("Conflito: idempotencyKey reutilizada com payload diferente");
      }
      return existing.responseJson ?? null;
    }
    const existing = publicBookingIdempotencyRecords.get(`${unitId}:${publicBookingAction}:${idempotencyKey}`);
    if (!existing) return null;
    if (existing.payloadHash !== payloadHash) {
      throw new Error("Conflito: idempotencyKey reutilizada com payload diferente");
    }
    return existing.responseJson;
  };

  const storePublicBookingReplay = async (
    unitId: string,
    idempotencyKey: string,
    payloadHash: string,
    responseJson: unknown,
  ) => {
    if (backend === "prisma") {
      await prisma.idempotencyRecord.upsert({
        where: { unitId_action_idempotencyKey: { unitId, action: publicBookingAction, idempotencyKey } },
        create: {
          id: crypto.randomUUID(),
          unitId,
          action: publicBookingAction,
          idempotencyKey,
          payloadHash,
          status: "SUCCEEDED",
          responseJson: responseJson as any,
        },
        update: {
          payloadHash,
          status: "SUCCEEDED",
          responseJson: responseJson as any,
        },
      });
      return;
    }
    publicBookingIdempotencyRecords.set(`${unitId}:${publicBookingAction}:${idempotencyKey}`, {
      payloadHash,
      responseJson: JSON.parse(JSON.stringify(responseJson)),
    });
  };
  const publicBookingSchema = z.object({
    clientName: z.string().min(2).max(120),
    clientPhone: z.string().min(8).max(20),
    clientEmail: z.preprocess(
      normalizeOptionalPublicEmail,
      z.string().email("Informe um e-mail valido ou deixe o campo em branco.").optional(),
    ),
    serviceId: z.string().min(1).optional(),
    serviceIds: z.array(z.string().min(1)).min(MIN_APPOINTMENT_SERVICES).max(MAX_APPOINTMENT_SERVICES).optional(),
    professionalId: z.preprocess(
      (value) => normalizePublicProfessionalId(value),
      z.string().min(1).optional(),
    ),
    startsAt: z.string().datetime(),
    unitId: z.string().min(1).optional(),
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
  }).refine((value) => value.serviceId != null || value.serviceIds != null, {
    message: "Informe ao menos um servico para o agendamento",
  }).refine((value) => !(value.serviceId != null && value.serviceIds != null), {
    message: "Informe serviceId ou serviceIds, nao ambos",
  }).refine((value) => value.professionalId == null, {
    message: "professionalId nao e aceito no booking publico",
  });

  app.post("/public/booking", async (request, reply) => {
    const parsedBody = publicBookingSchema.safeParse(request.body);
    if (!parsedBody.success) {
      const hasEmailIssue = parsedBody.error.issues.some((issue) =>
        issue.path.includes("clientEmail"),
      );
      reply.status(400).send({
        error: hasEmailIssue
          ? "Informe um e-mail valido ou deixe o campo em branco."
          : "Nao foi possivel concluir o agendamento. Verifique os dados e tente novamente.",
      });
      return;
    }
    const body = parsedBody.data;
    const unitId = await resolvePublicUnitId(body.unitId);
    if (!unitId) {
      reply.status(404).send({ error: PUBLIC_BOOKING_UNIT_NOT_FOUND_MESSAGE });
      return;
    }
    const publicBookingIdempotencyKey = getIdempotencyKey(request, body.idempotencyKey);
    const publicBookingPayloadHash = publicBookingIdempotencyKey
      ? getIdempotencyPayloadHash({ route: "/public/booking", unitId, body: { ...body, unitId } })
      : "";
    if (publicBookingIdempotencyKey) {
      let replay: unknown;
      try {
        replay = await getPublicBookingReplay(unitId, publicBookingIdempotencyKey, publicBookingPayloadHash);
      } catch (error) {
        reply.status(409).send({ error: "idempotencyKey reutilizada com payload diferente" });
        return;
      }
      if (replay) {
        reply.status(201).send(replay);
        return;
      }
    }
    const workingHours = await resolveWorkingHoursForUnit(unitId, operations);

    const phone = body.clientPhone.replace(/\D/g, "");

    let clientId: string;
    let profId: string;
    let profName: string | undefined;
    const startsAt = new Date(body.startsAt);
    let endsAt: Date;
    let appointmentId: string;

    const serviceIds = normalizePublicServiceIds({
      serviceId: body.serviceId,
      serviceIds: body.serviceIds,
    });
    const contract = await resolvePublicServicesContract(unitId, serviceIds);
    if (!contract) {
      reply.status(404).send({ error: "Servico nao encontrado" });
      return;
    }
    const primaryService = contract.services[0];
    const bufferAfterMin = await resolvePublicBufferAfterMin(unitId);

    endsAt = new Date(startsAt.getTime() + contract.effectiveDurationMin * 60_000);
    if (!isWithinWorkingHours(startsAt, endsAt, workingHours)) {
      reply.status(409).send({
        error:
          "Horario fora do expediente. Escolha um horario disponivel na agenda.",
        workingHours,
      });
      return;
    }

    const resolvedProfessional = await resolvePublicProfessionalForSlot({
      unitId,
      serviceIds,
      startsAt,
      endsAt,
      bufferAfterMin,
      professionalId: body.professionalId,
    });
    if (!resolvedProfessional.professional) {
      reply.status(409).send({ error: resolvedProfessional.reason });
      return;
    }
    profId = resolvedProfessional.professional.id;
    profName = resolvedProfessional.professional.name;

    if (backend === "prisma") {
      // Busca ou cria cliente pelo telefone depois de validar serviço, profissional e disponibilidade.
      let client = await prisma.client.findFirst({
        where: { businessId: unitId, phone: { contains: phone } },
      });
      if (!client) {
        client = await prisma.client.create({
          data: {
            id: crypto.randomUUID(),
            businessId: unitId,
            fullName: body.clientName,
            phone: body.clientPhone,
            email: body.clientEmail,
          },
        });
      }
      clientId = client.id;
      const created = await operations.schedule({
        unitId,
        clientId,
        professionalId: profId,
        serviceId: body.serviceId,
        serviceIds: body.serviceIds,
        startsAt,
        notes: `Agendamento online - ${body.clientName}`,
        changedBy: "public",
      });
      appointmentId = created.id;
      endsAt = created.endsAt;
    } else {
      // Memory backend
      let memClient = memoryStore.clients.find(c => c.phone?.replace(/\D/g,"") === phone);
      if (!memClient) {
        memClient = { id: crypto.randomUUID(), fullName: body.clientName, phone: body.clientPhone, tags: ["NEW"] };
        memoryStore.clients.push(memClient);
      }
      clientId = memClient.id;

      const created = await operations.schedule({
        unitId,
        clientId,
        professionalId: profId,
        serviceId: body.serviceId,
        serviceIds: body.serviceIds,
        startsAt,
        notes: `Agendamento online - ${body.clientName}`,
        changedBy: "public",
      });
      appointmentId = created.id;
      endsAt = created.endsAt;
    }

    const appointment = { id: appointmentId, startsAt, endsAt };
    await recordAudit(request, {
      unitId,
      action: "APPOINTMENT_CREATED",
      entity: "appointment",
      entityId: appointmentId,
      after: {
        origin: "public_booking",
        appointmentId,
        clientId,
        serviceId: primaryService.id,
        serviceIds,
        serviceName: primaryService.name,
        serviceNames: contract.services.map((service) => service.name),
        professionalId: profId,
        professionalName: profName,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      },
      metadata: {
        source: "public",
      },
    });

    // Notificações assíncronas (não bloqueia a resposta)
    const bookingData = {
      clientName: body.clientName,
      clientPhone: body.clientPhone,
      clientEmail: body.clientEmail,
      serviceName: contract.services.map((item) => item.name).join(" + "),
      servicePrice: contract.totalPriceSnapshot,
      startsAt,
      professionalName: profName,
    };

    setImmediate(async () => {
      try {
        await sendWhatsAppMessage(body.clientPhone, buildBookingWhatsApp(bookingData));
      } catch { /* ignora falha de WhatsApp */ }
      if (body.clientEmail) {
        try {
          await sendEmail(
            body.clientEmail,
            `Agendamento confirmado - ${primaryService.name}`,
            buildBookingEmailHtml(bookingData),
          );
        } catch { /* ignora falha de email */ }
      }
    });

    const responsePayload = {
      id: appointment.id,
      message: "Agendamento confirmado com sucesso.",
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      serviceIds,
      serviceName: contract.services.map((item) => item.name).join(" + "),
      serviceNames: contract.services.map((item) => item.name),
      totalPrice: contract.totalPriceSnapshot,
      effectiveDurationMin: contract.effectiveDurationMin,
      ruleLabel: contract.duration.matchedRuleLabel,
      professionalId: profId,
      professionalName: profName,
      workingHours,
    };
    if (publicBookingIdempotencyKey) {
      await storePublicBookingReplay(unitId, publicBookingIdempotencyKey, publicBookingPayloadHash, responsePayload);
    }
    reply.status(201).send(responsePayload);
  });

  // ─── Rotas de gerenciamento WhatsApp (admin) ─────────────────────────────

  app.get("/whatsapp/status", async () => {
    return getWhatsAppConnectionState();
  });

  app.post("/whatsapp/connect", async () => {
    return connectWhatsApp();
  });

  app.delete("/whatsapp/disconnect", async () => {
    await disconnectWhatsApp();
    return { ok: true };
  });

  app.setErrorHandler(
    (error: Error, _request: FastifyRequest, reply: FastifyReply) => {
      const errorCode = (error as Error & { code?: string }).code;
      const isUniqueConstraint = errorCode === "P2002";
      const isWriteConflict = errorCode === "P2034";
      const message = isUniqueConstraint
        ? "Conflito: operacao critica ja processada para esta origem"
        : isWriteConflict
          ? "Conflito: operacao concorrente deve ser repetida"
        : error.message || "Erro inesperado";
      const normalized = message.toLowerCase();
      const statusCode =
        isUniqueConstraint || isWriteConflict
          ? 409
          : normalized.includes("nao autenticado") ||
        normalized.includes("token invalido") ||
        normalized.includes("token expirado")
          ? 401
          : normalized.includes("acesso negado") || normalized.includes("nao autorizada")
            ? 403
            : normalized.includes("nao encontrado")
        ? 404
        : normalized.includes("conflito")
          || normalized.includes("expediente")
          || normalized.includes("fechada")
          || normalized.includes("fechado")
          || normalized.includes("intervalo")
          || normalized.includes("antecedencia")
          || normalized.includes("passado")
          ? 409
          : normalized.includes("invalida")
            ? 422
            : 400;

      reply.status(statusCode).send({ error: message });
    },
  );

  return app;
}
