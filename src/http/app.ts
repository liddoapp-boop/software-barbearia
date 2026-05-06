import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import { OperationsService } from "../application/operations-service";
import { PrismaOperationsService } from "../application/prisma-operations-service";
import { AuditRecorder, TransactionalAuditContext } from "../application/audit-service";
import { InMemoryStore } from "../infrastructure/in-memory-store";
import { AppointmentStatus, ReportExportType } from "../domain/types";
import { prisma } from "../infrastructure/database/prisma";
import {
  hashIdempotencyPayload,
  normalizeIdempotencyKey,
} from "../application/idempotency";
import {
  AuthSession,
  AuthUser,
  UserRole,
  getBillingWebhookSecret,
  isAuthEnforced,
  issueAccessToken,
  loadAuthUsers,
  verifyPassword,
  verifyBillingWebhookSignature,
  verifyAccessToken,
} from "./security";

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
  return request.routeOptions.url ?? "";
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

function getAllowedCorsOrigins() {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) return true;
  const values = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length > 0 ? values : true;
}

function getPolicyForRoute(method: string, route: string): AccessPolicy {
  if (route === "/health" || route === "/" || route === "/catalog" || route === "/*") {
    return { isPublic: true };
  }
  if (route === "/auth/login") return { isPublic: true };
  if (route === "/integrations/billing/webhooks/:provider") return { isPublic: true };
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
  if (route === "/reports/management/product-sales") {
    return { isPublic: false, roles: ["owner", "recepcao"], unitSource: "query" };
  }
  if (route === "/reports/management/export.csv") {
    return { isPublic: false, roles: ["owner", "recepcao", "profissional"], unitSource: "query" };
  }
  if (route.startsWith("/reports/management/")) {
    return {
      isPublic: false,
      roles: ["owner", "recepcao", "profissional"],
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

function normalizeUserRole(value: unknown): UserRole | null {
  const role = String(value ?? "").trim().toLowerCase();
  if (role === "owner" || role === "recepcao" || role === "profissional") return role;
  return null;
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
  if (!userRole) throw new Error("Perfil de usuario invalido");
  const activeAccesses = row.unitAccesses
    .map((access) => ({
      unitId: access.unitId,
      role: normalizeUserRole(access.role) ?? userRole,
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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

export function createApp() {
  const backend = process.env.DATA_BACKEND ?? "memory";
  const authEnforced = isAuthEnforced();
  const authUsers = loadAuthUsers();
  const memoryStore = new InMemoryStore();
  const httpLogEnabled =
    String(
      process.env.HTTP_LOG_ENABLED ??
        (process.env.NODE_ENV === "test" ? "false" : "true"),
    ).toLowerCase() === "true";
  const operations =
    backend === "prisma"
      ? new PrismaOperationsService(prisma)
      : new OperationsService(memoryStore);

  const app = Fastify({
    logger: httpLogEnabled
      ? {
          level: process.env.LOG_LEVEL ?? "info",
        }
      : false,
  });

  app.register(cors, { origin: getAllowedCorsOrigins() });
  app.register(fastifyStatic, {
    root: path.join(process.cwd(), "public"),
    prefix: "/",
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
    serviceId: z.string().min(1),
    startsAt: z.string().datetime(),
    bufferAfterMin: z.number().int().min(0).max(120).optional(),
    isFitting: z.boolean().optional(),
    notes: z.string().max(500).optional(),
    changedBy: z.string().min(1),
  });

  const rescheduleSchema = z.object({
    startsAt: z.string().datetime(),
    changedBy: z.string().min(1),
  });

  const suggestionsSchema = z.object({
    unitId: z.string().min(1),
    professionalId: z.string().min(1),
    serviceId: z.string().min(1),
    startsAt: z.string().datetime(),
    windowHours: z.number().int().min(1).max(24).optional(),
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
      notes: z.string().max(500).optional(),
      isFitting: z.boolean().optional(),
      confirmation: z.boolean().optional(),
      changedBy: z.string().min(1),
    })
    .refine(
      (value) =>
        value.startsAt != null ||
        value.clientId != null ||
        value.professionalId != null ||
        value.serviceId != null ||
        value.notes != null ||
        value.isFitting != null ||
        value.confirmation != null,
      {
        message: "Informe ao menos um campo para atualizar o agendamento",
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
    reason: z.string().max(250).optional(),
  });

  const completeSchema = z.object({
    changedBy: z.string().min(1),
    completedAt: z.string().datetime(),
  });
  const checkoutSchema = z.object({
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
    changedBy: z.string().min(1),
    completedAt: z.string().datetime().optional(),
    paymentMethod: z.string().trim().min(1, "Metodo de pagamento obrigatorio").max(60),
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
        value.notes != null,
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
    unitId: z.string().min(1),
    productId: z.string().min(1),
    movementType: z.enum(["IN", "OUT", "LOSS", "INTERNAL_USE"]),
    quantity: z.number().int().positive(),
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
        reason: "forbidden_role",
        method,
        route,
        requestId: req.correlationId,
        role: req.auth.role,
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
      idempotencyKey: getIdempotencyKey(request, bodyIdempotencyKey),
      before: payload.before,
      after: payload.after,
      metadata: payload.metadata,
    });
  }

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
    const role = (request as RequestWithAuth).auth?.role;
    if (!role) return;
    if (role === "owner") return;
    if (type === "financial" || type === "audit" || type === "commissions") {
      throw new Error("Acesso negado");
    }
    if (type === "product-sales" && role !== "recepcao") {
      throw new Error("Acesso negado");
    }
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

  app.get("/health", async () => ({ ok: true, authEnforced }));
  app.get("/", async (_request, reply) => {
    return reply.sendFile("index.html");
  });
  app.get("/catalog", async () => await operations.getCatalog());

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

    return await operations.getDailyAgenda({
      unitId: query.unitId,
      date: new Date(query.date),
    });
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

    return await operations.getAgendaRange({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
    });
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

  app.post("/appointments/suggestions", async (request) => {
    const body = suggestionsSchema.parse(request.body);
    const suggestions = await operations.suggestAppointmentAlternatives({
      unitId: body.unitId,
      professionalId: body.professionalId,
      serviceId: body.serviceId,
      startsAt: new Date(body.startsAt),
      windowHours: body.windowHours,
    });
    return { suggestions };
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

    const statusValues = (query.status ?? []).filter((status) =>
      [
        "SCHEDULED",
        "CONFIRMED",
        "IN_SERVICE",
        "COMPLETED",
        "CANCELLED",
        "NO_SHOW",
        "BLOCKED",
      ].includes(status),
    ) as AppointmentStatus[];

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
    return { appointments };
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
    return { appointment };
  });

  app.patch("/appointments/:id", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = appointmentPatchSchema.parse(request.body);
    const req = request as RequestWithAuth;
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
      notes: body.notes,
      isFitting: body.isFitting,
      confirmation: body.confirmation,
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

  app.patch("/appointments/:id/reschedule", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = rescheduleSchema.parse(request.body);
    const req = request as RequestWithAuth;

    const appointment = await operations.reschedule({
      appointmentId: params.id,
      unitId: req.auth?.activeUnitId,
      startsAt: new Date(body.startsAt),
      changedBy: body.changedBy,
    });
    await recordAudit(request, {
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

    const appointment = await operations.updateStatus({
      appointmentId: params.id,
      unitId: req.auth?.activeUnitId,
      status: body.status,
      changedBy: body.changedBy,
      reason: body.reason,
    });
    await recordAudit(request, {
      unitId: appointment.unitId,
      action: "APPOINTMENT_STATUS_UPDATED",
      entity: "appointment",
      entityId: appointment.id,
      after: {
        status: appointment.status,
        reason: body.reason ?? null,
      },
    });
    return { appointment };
  });

  app.post("/appointments/:id/complete", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = completeSchema.parse(request.body);
    const req = request as RequestWithAuth;
    const result = await operations.complete({
      appointmentId: params.id,
      unitId: req.auth?.activeUnitId,
      changedBy: body.changedBy,
      completedAt: new Date(body.completedAt),
    });
    await recordAudit(request, {
      unitId: result.appointment.unitId,
      action: "APPOINTMENT_COMPLETED",
      entity: "appointment",
      entityId: result.appointment.id,
      after: {
        revenue: result.revenue.amount,
        completedAt: result.appointment.endsAt.toISOString(),
        stockConsumptionApplied: Boolean(result.stockConsumption?.applied),
        stockMovementsCount: Number(result.stockConsumption?.movementsCount ?? 0),
        stockWarnings: Array.isArray(result.stockConsumption?.warnings)
          ? result.stockConsumption.warnings.length
          : 0,
      },
    });
    return result;
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
      paymentMethod: body.paymentMethod,
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

  app.post("/appointments/:id/refund", async (request) => {
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
    return result;
  });

  app.post("/sales/products", async (request) => {
    const body = productSaleSchema.parse(request.body);
    const idempotencyKey = requireIdempotencyKey(request, body.idempotencyKey);
    const result = await operations.registerProductSale({
      unitId: body.unitId,
      clientId: body.clientId,
      professionalId: body.professionalId,
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

  app.post("/sales/products/:id/refund", async (request) => {
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

  app.get("/financial/reports", async (request) => {
    const query = financialReportsQuerySchema.parse(request.query);
    return await operations.getFinancialReports({
      unitId: query.unitId,
      start: new Date(query.start),
      end: new Date(query.end),
    });
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
      referenceId: body.referenceId,
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

  app.setErrorHandler(
    (error: Error, _request: FastifyRequest, reply: FastifyReply) => {
      const isUniqueConstraint = (error as Error & { code?: string }).code === "P2002";
      const message = isUniqueConstraint
        ? "Conflito: operacao critica ja processada para esta origem"
        : error.message || "Erro inesperado";
      const normalized = message.toLowerCase();
      const statusCode =
        isUniqueConstraint
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
          ? 409
          : normalized.includes("invalida")
            ? 422
            : 400;

      reply.status(statusCode).send({ error: message });
    },
  );

  return app;
}
