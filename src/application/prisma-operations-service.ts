import { PrismaClient, Prisma } from "@prisma/client";
import { BarbershopEngine } from "./barbershop-engine";
import {
  Appointment,
  AppointmentStatus,
  BusinessCommissionRule,
  BusinessHour,
  BusinessPaymentMethod,
  BusinessSettings,
  BusinessTeamMember,
  AutomationChannel,
  AutomationPlaybookType,
  AutomationRuleUpdateInput,
  AutomationSourceModule,
  AutomationTarget,
  AutomationTriggerType,
  BillingWebhookEventInput,
  BillingWebhookProcessResult,
  BillingReconciliationDiscrepancy,
  FinancialEntry,
  FinancialManagementOverviewPayload,
  FinancialManagementProfessionalRow,
  FinancialManagementSnapshot,
  Client,
  DashboardSuggestionTelemetryEvent,
  DashboardSuggestionTelemetryOutcome,
  ClientsOverviewPayload,
  ClientPredictiveStatus,
  ClientValueSegment,
  CommissionRule,
  DashboardActionSuggestion,
  DashboardPayload,
  GoalPaceStatus,
  GoalProgressSummary,
  DashboardSmartAlert,
  MonthlyGoal,
  Product,
  ProductSale,
  ProductSaleHistoryRow,
  ProductSaleRefundStatus,
  Professional,
  Refund,
  ServiceStockConsumptionItem,
  Service,
} from "../domain/types";
import {
  ACTIVE_APPOINTMENT_CONFLICT_STATUSES,
  buildCommissionPaymentExpenseEntry,
  buildProductRefundExpenseEntry,
  buildServiceRefundExpenseEntry,
  buildStockMovementsFromProductRefund,
  hasAppointmentConflict,
} from "../domain/rules";
import { buildClientsOverviewPredictive } from "./client-predictive";
import {
  buildReplenishmentSuggestions,
  computeEffectiveConsumptionQty,
  normalizeConsumptionItems,
} from "./stock-consumption";
import {
  buildDashboardPlaybookHistory,
  calibrateDashboardThresholds,
  DashboardThresholdConfig,
  summarizeDashboardSuggestionTelemetry,
} from "./dashboard-telemetry";
import {
  hashIdempotencyPayload,
  normalizeIdempotencyKey,
  toJsonValue,
} from "./idempotency";
import {
  toAuditEvent,
  TransactionalAuditContext,
  writePrismaAuditEvent,
} from "./audit-service";

function asNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  return Number(value);
}

function monthRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

function dayRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function weekRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  const day = start.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function shiftRange(start: Date, end: Date, days: number): { start: Date; end: Date } {
  const rangeStart = new Date(start);
  rangeStart.setDate(rangeStart.getDate() + days);
  const rangeEnd = new Date(end);
  rangeEnd.setDate(rangeEnd.getDate() + days);
  return { start: rangeStart, end: rangeEnd };
}

function normalizeTransactionSource(source?: string | null) {
  const normalized = String(source ?? "").trim().toUpperCase();
  if (!normalized) return "MANUAL";
  if (["SERVICE", "PRODUCT", "COMMISSION", "REFUND", "MANUAL"].includes(normalized)) {
    return normalized;
  }
  return "MANUAL";
}

type IdempotencyScope = {
  unitId: string;
  action: string;
  idempotencyKey?: string;
  payloadHash: string;
};

type CriticalAuditInput = TransactionalAuditContext & {
  action: string;
  entity: string;
  entityId?: string;
  unitId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

function normalizeClientPhone(value: string) {
  return String(value || "").replace(/\D+/g, "");
}

function isValidClientPhone(value: string) {
  const normalized = normalizeClientPhone(value);
  return normalized.length >= 10 && normalized.length <= 15;
}

function mapClientStatusToTags(status?: string) {
  if (status === "VIP") return ["VIP"] as const;
  if (status === "INACTIVE") return ["INACTIVE"] as const;
  if (status === "ACTIVE") return ["RECURRING"] as const;
  return ["NEW"] as const;
}

function mapClientTagsToStatus(tags: string[]) {
  if (tags.includes("VIP")) return "VIP";
  if (tags.includes("INACTIVE")) return "INACTIVE";
  if (tags.includes("NEW")) return "NEW";
  return "ACTIVE";
}

function normalizeTime(value?: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) throw new Error("Horario invalido. Use o formato HH:MM");
  return raw;
}

function timeToMinutes(value?: string) {
  const normalized = normalizeTime(value);
  if (!normalized) return null;
  const [hh, mm] = normalized.split(":").map((item) => Number(item));
  return hh * 60 + mm;
}

export class PrismaOperationsService {
  private readonly reconciliationResolutions = new Map<
    string,
    {
      resolvedAt: string;
      resolvedBy: string;
      action: string;
      note?: string;
    }
  >();
  private readonly dashboardSuggestionTelemetry: DashboardSuggestionTelemetryEvent[] = [];

  constructor(
    private readonly prisma: PrismaClient,
    private readonly engine = new BarbershopEngine(),
  ) {}

  private buildIdempotencyScope(input: {
    unitId: string;
    action: string;
    idempotencyKey?: string;
    payloadHash?: string;
    payload: unknown;
  }): IdempotencyScope | null {
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    if (!idempotencyKey) return null;
    return {
      unitId: input.unitId,
      action: input.action,
      idempotencyKey,
      payloadHash: input.payloadHash ?? hashIdempotencyPayload(input.payload),
    };
  }

  private scopedOperationKey(scope: IdempotencyScope | null) {
    return scope ? `${scope.action}:${scope.idempotencyKey}` : null;
  }

  private async getReplayResult<T>(scope: IdempotencyScope): Promise<T | null> {
    const record = await this.prisma.idempotencyRecord.findUnique({
      where: {
        unitId_action_idempotencyKey: {
          unitId: scope.unitId,
          action: scope.action,
          idempotencyKey: scope.idempotencyKey!,
        },
      },
    });
    if (!record) return null;
    if (record.payloadHash !== scope.payloadHash) {
      throw new Error("Conflito: idempotencyKey reutilizada com payload diferente");
    }
    if (record.status !== "SUCCEEDED" || record.responseJson == null) {
      throw new Error("Conflito: operacao idempotente ainda em processamento");
    }
    return record.responseJson as T;
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }

  private async replayAfterUniqueConflict<T>(error: unknown, scope: IdempotencyScope | null) {
    if (!this.isUniqueConstraintError(error)) throw error;
    if (scope) {
      const replay = await this.getReplayResult<T>(scope);
      if (replay) return replay;
    }
    throw new Error("Conflito: operacao critica ja processada para esta origem");
  }

  private async recordCriticalAudit(
    tx: Prisma.TransactionClient,
    input?: CriticalAuditInput,
  ) {
    if (!input) return;
    const event = toAuditEvent(input);
    await writePrismaAuditEvent(tx, event);
  }

  async getCatalog() {
    const [services, professionals, clients, products] = await Promise.all([
      this.prisma.service.findMany({ orderBy: { name: "asc" } }),
      this.prisma.professional.findMany({
        where: { active: true },
        include: { commissionRules: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.client.findMany({ orderBy: { fullName: "asc" } }),
      this.prisma.product.findMany({ orderBy: { name: "asc" } }),
    ]);

    return {
      services: services.map((item) => this.mapService(item)),
      professionals: professionals.map((item) => this.mapProfessional(item)),
      clients: clients.map((item) => this.mapClient(item)),
      products: products.map((item) => this.mapProduct(item)),
    };
  }

  async listClients(input: {
    unitId: string;
    search?: string;
    limit?: number;
  }) {
    const normalizedSearch = String(input.search ?? "").trim();
    const limit = Math.min(Math.max(input.limit ?? 200, 1), 200);

    const rows = await this.prisma.client.findMany({
      where: {
        businessId: input.unitId,
        ...(normalizedSearch
          ? {
              OR: [
                {
                  fullName: {
                    contains: normalizedSearch,
                    mode: "insensitive",
                  },
                },
                {
                  phone: {
                    contains: normalizedSearch,
                    mode: "insensitive",
                  },
                },
                {
                  email: {
                    contains: normalizedSearch,
                    mode: "insensitive",
                  },
                },
                {
                  tags: {
                    has: normalizedSearch.toUpperCase(),
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { fullName: "asc" },
      take: limit,
    });

    return {
      clients: rows.map((item) => ({
        id: item.id,
        businessId: item.businessId,
        name: item.fullName,
        phone: item.phone ?? null,
        email: item.email ?? null,
        birthDate: item.birthDate ? item.birthDate.toISOString() : null,
        notes: item.notes ?? null,
        status: mapClientTagsToStatus(item.tags),
        tags: item.tags,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      summary: {
        total: rows.length,
      },
    };
  }

  async createClient(input: {
    unitId: string;
    name: string;
    phone: string;
    email?: string;
    birthDate?: Date;
    notes?: string;
    status?: "NEW" | "ACTIVE" | "VIP" | "INACTIVE";
    tags?: Array<"NEW" | "RECURRING" | "VIP" | "INACTIVE">;
  }) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: input.unitId },
      select: { id: true },
    });
    if (!unit) {
      throw new Error("Unidade nao encontrada");
    }

    const name = String(input.name || "").trim();
    if (!name) throw new Error("Nome do cliente e obrigatorio");

    const normalizedPhone = normalizeClientPhone(input.phone);
    if (!normalizedPhone) throw new Error("Telefone do cliente e obrigatorio");
    if (!isValidClientPhone(normalizedPhone)) {
      throw new Error("Telefone invalido. Informe um telefone com DDD");
    }

    const duplicate = await this.prisma.client.findFirst({
      where: {
        businessId: input.unitId,
        phone: normalizedPhone,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new Error("Conflito: telefone ja cadastrado para este negocio");
    }

    const tags =
      input.tags && input.tags.length
        ? Array.from(new Set(input.tags))
        : [...mapClientStatusToTags(input.status)];

    const created = await this.prisma.client.create({
      data: {
        id: crypto.randomUUID(),
        businessId: input.unitId,
        fullName: name,
        phone: normalizedPhone,
        email: input.email ? String(input.email).trim() : null,
        birthDate: input.birthDate ?? null,
        notes: input.notes ? String(input.notes).trim() : null,
        tags,
      },
    });

    return {
      client: {
        id: created.id,
        businessId: created.businessId,
        name: created.fullName,
        phone: created.phone ?? null,
        email: created.email ?? null,
        birthDate: created.birthDate ? created.birthDate.toISOString() : null,
        notes: created.notes ?? null,
        status: mapClientTagsToStatus(created.tags),
        tags: created.tags,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    };
  }

  private async ensureBusinessSettings(unitId: string) {
    const existing = await this.prisma.businessSettings.findUnique({
      where: { unitId },
    });
    if (existing) return existing;
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      select: { name: true },
    });
    return await this.prisma.businessSettings.create({
      data: {
        id: crypto.randomUUID(),
        unitId,
        businessName: unit?.name ?? "Minha empresa",
        segment: "barbearia",
      },
    });
  }

  private async ensureBusinessHours(unitId: string) {
    const existing = await this.prisma.businessHour.findMany({
      where: { unitId },
      orderBy: { dayOfWeek: "asc" },
    });
    if (existing.length) return existing;
    const defaults = [
      { dayOfWeek: 0, isClosed: true },
      { dayOfWeek: 1, opensAt: "08:00", closesAt: "18:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false },
      { dayOfWeek: 2, opensAt: "08:00", closesAt: "18:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false },
      { dayOfWeek: 3, opensAt: "08:00", closesAt: "18:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false },
      { dayOfWeek: 4, opensAt: "08:00", closesAt: "18:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false },
      { dayOfWeek: 5, opensAt: "08:00", closesAt: "18:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false },
      { dayOfWeek: 6, opensAt: "08:00", closesAt: "14:00", isClosed: false },
    ];
    await this.prisma.businessHour.createMany({
      data: defaults.map((item) => ({
        id: crypto.randomUUID(),
        unitId,
        dayOfWeek: item.dayOfWeek,
        opensAt: item.opensAt ?? null,
        closesAt: item.closesAt ?? null,
        breakStart: item.breakStart ?? null,
        breakEnd: item.breakEnd ?? null,
        isClosed: item.isClosed,
      })),
      skipDuplicates: true,
    });
    return await this.prisma.businessHour.findMany({
      where: { unitId },
      orderBy: { dayOfWeek: "asc" },
    });
  }

  private async ensurePaymentMethods(unitId: string) {
    const existing = await this.prisma.paymentMethod.findMany({
      where: { unitId },
      orderBy: { name: "asc" },
    });
    if (existing.length) return existing;
    await this.prisma.paymentMethod.createMany({
      data: [
        { id: crypto.randomUUID(), unitId, name: "Dinheiro", isActive: true, isDefault: false },
        { id: crypto.randomUUID(), unitId, name: "Pix", isActive: true, isDefault: true },
        { id: crypto.randomUUID(), unitId, name: "Cartao de credito", isActive: true, isDefault: false },
        { id: crypto.randomUUID(), unitId, name: "Cartao de debito", isActive: true, isDefault: false },
      ],
      skipDuplicates: true,
    });
    return await this.prisma.paymentMethod.findMany({
      where: { unitId },
      orderBy: { name: "asc" },
    });
  }

  private async ensureTeamMembers(unitId: string) {
    const existing = await this.prisma.teamMember.findMany({
      where: { unitId },
      orderBy: { createdAt: "asc" },
    });
    if (existing.length) return existing;

    const professionals = await this.prisma.professional.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    });
    await this.prisma.teamMember.create({
      data: {
        id: crypto.randomUUID(),
        unitId,
        name: "Dono",
        role: "OWNER",
        accessProfile: "owner",
        email: "owner@barbearia.local",
        isActive: true,
      },
    });
    if (professionals.length) {
      await this.prisma.teamMember.createMany({
        data: professionals.map((item) => ({
          id: crypto.randomUUID(),
          unitId,
          name: item.name,
          role: "PROFESSIONAL",
          accessProfile: "profissional",
          isActive: item.active,
        })),
        skipDuplicates: true,
      });
    }
    return await this.prisma.teamMember.findMany({
      where: { unitId },
      orderBy: { createdAt: "asc" },
    });
  }

  private mapBusinessSettingsView(settings: {
    id: string;
    unitId: string;
    businessName: string;
    segment: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    document: string | null;
    displayName: string | null;
    primaryColor: string | null;
    themeMode: string;
    defaultAppointmentDuration: number;
    minimumAdvanceMinutes: number;
    bufferBetweenAppointmentsMinutes: number;
    reminderLeadMinutes: number;
    sendAppointmentReminders: boolean;
    inactiveCustomerDays: number;
    atRiskCustomerDays: number;
    allowWalkIns: boolean;
    allowOutOfHoursAppointments: boolean;
    allowOverbooking: boolean;
    houseCommissionType: string;
    houseCommissionValue: Prisma.Decimal;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: settings.id,
      unitId: settings.unitId,
      businessName: settings.businessName,
      segment: settings.segment,
      phone: settings.phone ?? "",
      email: settings.email ?? "",
      address: settings.address ?? "",
      city: settings.city ?? "",
      state: settings.state ?? "",
      document: settings.document ?? "",
      displayName: settings.displayName ?? "",
      primaryColor: settings.primaryColor ?? "#0f172a",
      themeMode: settings.themeMode,
      defaultAppointmentDuration: settings.defaultAppointmentDuration,
      minimumAdvanceMinutes: settings.minimumAdvanceMinutes,
      bufferBetweenAppointmentsMinutes: settings.bufferBetweenAppointmentsMinutes,
      reminderLeadMinutes: settings.reminderLeadMinutes,
      sendAppointmentReminders: settings.sendAppointmentReminders,
      inactiveCustomerDays: settings.inactiveCustomerDays,
      atRiskCustomerDays: settings.atRiskCustomerDays,
      allowWalkIns: settings.allowWalkIns,
      allowOutOfHoursAppointments: settings.allowOutOfHoursAppointments,
      allowOverbooking: settings.allowOverbooking,
      houseCommissionType: settings.houseCommissionType,
      houseCommissionValue: asNumber(settings.houseCommissionValue),
      createdAt: settings.createdAt.toISOString(),
      updatedAt: settings.updatedAt.toISOString(),
    };
  }

  async getSettingsOverview(input: { unitId: string; authUser?: Record<string, unknown> }) {
    const [settings, hours, paymentMethods, teamMembers, commissionRules] = await Promise.all([
      this.ensureBusinessSettings(input.unitId),
      this.ensureBusinessHours(input.unitId),
      this.ensurePaymentMethods(input.unitId),
      this.ensureTeamMembers(input.unitId),
      this.prisma.businessCommissionRule.findMany({
        where: { unitId: input.unitId },
        include: {
          professional: { select: { name: true } },
          service: { select: { name: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    return {
      business: this.mapBusinessSettingsView(settings),
      businessHours: hours.map((item) => ({
        id: item.id,
        dayOfWeek: item.dayOfWeek,
        opensAt: item.opensAt ?? "",
        closesAt: item.closesAt ?? "",
        breakStart: item.breakStart ?? "",
        breakEnd: item.breakEnd ?? "",
        isClosed: item.isClosed,
      })),
      paymentMethods: paymentMethods.map((item) => ({
        id: item.id,
        name: item.name,
        isActive: item.isActive,
        isDefault: item.isDefault,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      commissionRules: commissionRules.map((item) => ({
        id: item.id,
        professionalId: item.professionalId ?? null,
        professionalName: item.professional?.name ?? null,
        serviceId: item.serviceId ?? null,
        serviceName: item.service?.name ?? null,
        type: item.type,
        value: asNumber(item.value),
        isActive: item.isActive,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      teamMembers: teamMembers.map((item) => ({
        id: item.id,
        name: item.name,
        role: item.role,
        accessProfile: item.accessProfile,
        email: item.email ?? "",
        phone: item.phone ?? "",
        isActive: item.isActive,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      security: {
        currentSession: {
          role: String(input.authUser?.role ?? "owner"),
          email: String(input.authUser?.email ?? "owner@barbearia.local"),
          activeUnitId: input.unitId,
        },
        passwordChangeSupported: false,
        note: "Fluxo de alteracao de senha depende de endpoint dedicado de identidade.",
      },
    };
  }

  async getBusinessSettings(input: { unitId: string }) {
    const settings = await this.ensureBusinessSettings(input.unitId);
    return {
      business: this.mapBusinessSettingsView(settings),
    };
  }

  async updateBusinessSettings(input: {
    unitId: string;
    businessName: string;
    segment: BusinessSettings["segment"];
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    document?: string;
    displayName?: string;
    primaryColor?: string;
    themeMode?: "light" | "dark" | "system";
    defaultAppointmentDuration?: number;
    minimumAdvanceMinutes?: number;
    bufferBetweenAppointmentsMinutes?: number;
    reminderLeadMinutes?: number;
    sendAppointmentReminders?: boolean;
    inactiveCustomerDays?: number;
    atRiskCustomerDays?: number;
    allowWalkIns?: boolean;
    allowOutOfHoursAppointments?: boolean;
    allowOverbooking?: boolean;
    houseCommissionType?: "PERCENTAGE" | "FIXED";
    houseCommissionValue?: number;
  }) {
    const current = await this.ensureBusinessSettings(input.unitId);
    const businessName = String(input.businessName ?? "").trim();
    if (!businessName) throw new Error("Nome da empresa e obrigatorio");
    const inactiveCustomerDays =
      input.inactiveCustomerDays != null ? Math.trunc(Number(input.inactiveCustomerDays)) : current.inactiveCustomerDays;
    const atRiskCustomerDays =
      input.atRiskCustomerDays != null ? Math.trunc(Number(input.atRiskCustomerDays)) : current.atRiskCustomerDays;
    if (inactiveCustomerDays <= 0 || atRiskCustomerDays <= 0) {
      throw new Error("Dias de cliente em risco/inativo devem ser positivos");
    }
    const defaultAppointmentDuration =
      input.defaultAppointmentDuration != null
        ? Math.trunc(Number(input.defaultAppointmentDuration))
        : current.defaultAppointmentDuration;
    if (!Number.isFinite(defaultAppointmentDuration) || defaultAppointmentDuration <= 0) {
      throw new Error("Duracao padrao de agendamento invalida");
    }
    const houseCommissionValue =
      input.houseCommissionValue != null ? Number(input.houseCommissionValue) : asNumber(current.houseCommissionValue);
    const houseCommissionType = input.houseCommissionType ?? current.houseCommissionType;
    if (!Number.isFinite(houseCommissionValue) || houseCommissionValue < 0) {
      throw new Error("Valor de comissao da casa invalido");
    }
    if (houseCommissionType === "PERCENTAGE" && houseCommissionValue > 100) {
      throw new Error("Comissao percentual deve ficar entre 0 e 100");
    }

    const updated = await this.prisma.businessSettings.update({
      where: { unitId: input.unitId },
      data: {
        businessName,
        segment: input.segment,
        phone: String(input.phone ?? "").trim() || null,
        email: String(input.email ?? "").trim() || null,
        address: String(input.address ?? "").trim() || null,
        city: String(input.city ?? "").trim() || null,
        state: String(input.state ?? "").trim() || null,
        document: String(input.document ?? "").trim() || null,
        displayName: String(input.displayName ?? "").trim() || null,
        primaryColor: String(input.primaryColor ?? "").trim() || current.primaryColor,
        themeMode: input.themeMode ?? current.themeMode,
        defaultAppointmentDuration,
        minimumAdvanceMinutes:
          input.minimumAdvanceMinutes != null
            ? Math.max(0, Math.trunc(Number(input.minimumAdvanceMinutes)))
            : current.minimumAdvanceMinutes,
        bufferBetweenAppointmentsMinutes:
          input.bufferBetweenAppointmentsMinutes != null
            ? Math.max(0, Math.trunc(Number(input.bufferBetweenAppointmentsMinutes)))
            : current.bufferBetweenAppointmentsMinutes,
        reminderLeadMinutes:
          input.reminderLeadMinutes != null
            ? Math.max(0, Math.trunc(Number(input.reminderLeadMinutes)))
            : current.reminderLeadMinutes,
        sendAppointmentReminders: input.sendAppointmentReminders ?? current.sendAppointmentReminders,
        inactiveCustomerDays,
        atRiskCustomerDays,
        allowWalkIns: input.allowWalkIns ?? current.allowWalkIns,
        allowOutOfHoursAppointments:
          input.allowOutOfHoursAppointments ?? current.allowOutOfHoursAppointments,
        allowOverbooking: input.allowOverbooking ?? current.allowOverbooking,
        houseCommissionType,
        houseCommissionValue: Number(houseCommissionValue.toFixed(2)),
      },
    });

    return {
      business: this.mapBusinessSettingsView(updated),
    };
  }

  async getBusinessHours(input: { unitId: string }) {
    const hours = await this.ensureBusinessHours(input.unitId);
    return {
      businessHours: hours.map((item) => ({
        id: item.id,
        dayOfWeek: item.dayOfWeek,
        opensAt: item.opensAt ?? "",
        closesAt: item.closesAt ?? "",
        breakStart: item.breakStart ?? "",
        breakEnd: item.breakEnd ?? "",
        isClosed: item.isClosed,
      })),
    };
  }

  async updateBusinessHours(input: {
    unitId: string;
    hours: Array<{
      dayOfWeek: number;
      opensAt?: string;
      closesAt?: string;
      breakStart?: string;
      breakEnd?: string;
      isClosed?: boolean;
    }>;
  }) {
    await this.ensureBusinessHours(input.unitId);
    for (const row of input.hours) {
      if (row.dayOfWeek < 0 || row.dayOfWeek > 6) throw new Error("Dia da semana invalido");
      const isClosed = Boolean(row.isClosed);
      const opensAt = normalizeTime(row.opensAt);
      const closesAt = normalizeTime(row.closesAt);
      const breakStart = normalizeTime(row.breakStart);
      const breakEnd = normalizeTime(row.breakEnd);
      if (!isClosed) {
        const openMinutes = timeToMinutes(opensAt);
        const closeMinutes = timeToMinutes(closesAt);
        if (openMinutes == null || closeMinutes == null || openMinutes >= closeMinutes) {
          throw new Error("Horario invalido: abertura deve ser antes do fechamento");
        }
        if ((breakStart && !breakEnd) || (!breakStart && breakEnd)) {
          throw new Error("Intervalo deve informar inicio e fim");
        }
        if (breakStart && breakEnd) {
          const breakStartMinutes = timeToMinutes(breakStart);
          const breakEndMinutes = timeToMinutes(breakEnd);
          if (
            breakStartMinutes == null ||
            breakEndMinutes == null ||
            breakStartMinutes >= breakEndMinutes ||
            breakStartMinutes <= openMinutes ||
            breakEndMinutes >= closeMinutes
          ) {
            throw new Error("Intervalo deve estar dentro do horario de funcionamento");
          }
        }
      }
      const existing = await this.prisma.businessHour.findFirst({
        where: { unitId: input.unitId, dayOfWeek: row.dayOfWeek },
      });
      if (existing) {
        await this.prisma.businessHour.update({
          where: { id: existing.id },
          data: {
            isClosed,
            opensAt: isClosed ? null : opensAt || null,
            closesAt: isClosed ? null : closesAt || null,
            breakStart: isClosed ? null : breakStart || null,
            breakEnd: isClosed ? null : breakEnd || null,
          },
        });
      } else {
        await this.prisma.businessHour.create({
          data: {
            id: crypto.randomUUID(),
            unitId: input.unitId,
            dayOfWeek: row.dayOfWeek,
            isClosed,
            opensAt: isClosed ? null : opensAt || null,
            closesAt: isClosed ? null : closesAt || null,
            breakStart: isClosed ? null : breakStart || null,
            breakEnd: isClosed ? null : breakEnd || null,
          },
        });
      }
    }
    return await this.getBusinessHours({ unitId: input.unitId });
  }

  async getPaymentMethods(input: { unitId: string }) {
    const methods = await this.ensurePaymentMethods(input.unitId);
    return {
      paymentMethods: methods.map((item) => ({
        id: item.id,
        name: item.name,
        isActive: item.isActive,
        isDefault: item.isDefault,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    };
  }

  async createPaymentMethod(input: { unitId: string; name: string; isActive?: boolean; isDefault?: boolean }) {
    await this.ensurePaymentMethods(input.unitId);
    const name = String(input.name ?? "").trim();
    if (!name) throw new Error("Nome do metodo de pagamento e obrigatorio");
    const duplicate = await this.prisma.paymentMethod.findFirst({
      where: {
        unitId: input.unitId,
        name: {
          equals: name,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });
    if (duplicate) throw new Error("Metodo de pagamento ja cadastrado");
    if (input.isDefault) {
      await this.prisma.paymentMethod.updateMany({
        where: { unitId: input.unitId, isDefault: true },
        data: { isDefault: false },
      });
    }
    const created = await this.prisma.paymentMethod.create({
      data: {
        id: crypto.randomUUID(),
        unitId: input.unitId,
        name,
        isActive: input.isActive !== false || Boolean(input.isDefault),
        isDefault: Boolean(input.isDefault),
      },
    });
    const hasDefault = await this.prisma.paymentMethod.findFirst({
      where: { unitId: input.unitId, isDefault: true, isActive: true },
      select: { id: true },
    });
    if (!hasDefault) {
      await this.prisma.paymentMethod.update({
        where: { id: created.id },
        data: { isDefault: true, isActive: true },
      });
    }
    return {
      paymentMethod: created,
    };
  }

  async updatePaymentMethod(input: { unitId: string; paymentMethodId: string; name?: string; isActive?: boolean; isDefault?: boolean }) {
    const current = await this.prisma.paymentMethod.findFirst({
      where: { id: input.paymentMethodId, unitId: input.unitId },
    });
    if (!current) throw new Error("Metodo de pagamento nao encontrado");
    let nextName: string | undefined;
    if (input.name != null) {
      nextName = String(input.name).trim();
      if (!nextName) throw new Error("Nome do metodo de pagamento e obrigatorio");
      const duplicate = await this.prisma.paymentMethod.findFirst({
        where: {
          unitId: input.unitId,
          id: { not: current.id },
          name: { equals: nextName, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (duplicate) throw new Error("Metodo de pagamento ja cadastrado");
    }
    if (input.isDefault === true) {
      await this.prisma.paymentMethod.updateMany({
        where: { unitId: input.unitId, isDefault: true },
        data: { isDefault: false },
      });
    }
    const updated = await this.prisma.paymentMethod.update({
      where: { id: current.id },
      data: {
        name: nextName,
        isActive: input.isActive ?? undefined,
        isDefault: input.isDefault ?? undefined,
      },
    });
    if (!updated.isDefault || !updated.isActive) {
      const hasDefault = await this.prisma.paymentMethod.findFirst({
        where: { unitId: input.unitId, isDefault: true, isActive: true },
        select: { id: true },
      });
      if (!hasDefault) {
        const firstActive = await this.prisma.paymentMethod.findFirst({
          where: { unitId: input.unitId, isActive: true },
          orderBy: { createdAt: "asc" },
        });
        if (firstActive) {
          await this.prisma.paymentMethod.update({
            where: { id: firstActive.id },
            data: { isDefault: true },
          });
        }
      }
    }
    return {
      paymentMethod: await this.prisma.paymentMethod.findUnique({ where: { id: current.id } }),
    };
  }

  async getBusinessCommissionRules(input: { unitId: string }) {
    const rules = await this.prisma.businessCommissionRule.findMany({
      where: { unitId: input.unitId },
      include: {
        professional: { select: { name: true } },
        service: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return {
      commissionRules: rules.map((item) => ({
        id: item.id,
        professionalId: item.professionalId ?? null,
        professionalName: item.professional?.name ?? null,
        serviceId: item.serviceId ?? null,
        serviceName: item.service?.name ?? null,
        type: item.type,
        value: asNumber(item.value),
        isActive: item.isActive,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    };
  }

  async createBusinessCommissionRule(input: {
    unitId: string;
    professionalId?: string;
    serviceId?: string;
    type: "PERCENTAGE" | "FIXED";
    value: number;
    isActive?: boolean;
  }) {
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 0) throw new Error("Valor de comissao invalido");
    if (input.type === "PERCENTAGE" && value > 100) {
      throw new Error("Comissao percentual deve ficar entre 0 e 100");
    }
    if (input.professionalId) {
      const existsProfessional = await this.prisma.professional.findUnique({
        where: { id: input.professionalId },
        select: { id: true },
      });
      if (!existsProfessional) throw new Error("Profissional nao encontrado");
    }
    if (input.serviceId) {
      const existsService = await this.prisma.service.findFirst({
        where: { id: input.serviceId, businessId: input.unitId },
        select: { id: true },
      });
      if (!existsService) throw new Error("Servico nao encontrado");
    }
    const created = await this.prisma.businessCommissionRule.create({
      data: {
        id: crypto.randomUUID(),
        unitId: input.unitId,
        professionalId: input.professionalId || null,
        serviceId: input.serviceId || null,
        type: input.type,
        value: Number(value.toFixed(2)),
        isActive: input.isActive !== false,
      },
    });
    return { commissionRule: created };
  }

  async updateBusinessCommissionRule(input: {
    unitId: string;
    ruleId: string;
    professionalId?: string;
    serviceId?: string;
    type?: "PERCENTAGE" | "FIXED";
    value?: number;
    isActive?: boolean;
  }) {
    const current = await this.prisma.businessCommissionRule.findFirst({
      where: { id: input.ruleId, unitId: input.unitId },
    });
    if (!current) throw new Error("Regra de comissao nao encontrada");
    if (input.professionalId != null && input.professionalId) {
      const existsProfessional = await this.prisma.professional.findUnique({
        where: { id: input.professionalId },
        select: { id: true },
      });
      if (!existsProfessional) throw new Error("Profissional nao encontrado");
    }
    if (input.serviceId != null && input.serviceId) {
      const existsService = await this.prisma.service.findFirst({
        where: { id: input.serviceId, businessId: input.unitId },
        select: { id: true },
      });
      if (!existsService) throw new Error("Servico nao encontrado");
    }
    if (input.value != null) {
      const value = Number(input.value);
      if (!Number.isFinite(value) || value < 0) throw new Error("Valor de comissao invalido");
      if ((input.type ?? current.type) === "PERCENTAGE" && value > 100) {
        throw new Error("Comissao percentual deve ficar entre 0 e 100");
      }
    }
    const updated = await this.prisma.businessCommissionRule.update({
      where: { id: current.id },
      data: {
        professionalId: input.professionalId != null ? input.professionalId || null : undefined,
        serviceId: input.serviceId != null ? input.serviceId || null : undefined,
        type: input.type,
        value: input.value != null ? Number(Number(input.value).toFixed(2)) : undefined,
        isActive: input.isActive,
      },
    });
    return { commissionRule: updated };
  }

  async getTeamMembers(input: { unitId: string }) {
    const members = await this.ensureTeamMembers(input.unitId);
    return {
      teamMembers: members.map((item) => ({
        id: item.id,
        name: item.name,
        role: item.role,
        accessProfile: item.accessProfile,
        email: item.email ?? "",
        phone: item.phone ?? "",
        isActive: item.isActive,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    };
  }

  async createTeamMember(input: {
    unitId: string;
    name: string;
    role: BusinessTeamMember["role"];
    accessProfile: BusinessTeamMember["accessProfile"];
    email?: string;
    phone?: string;
    isActive?: boolean;
  }) {
    const name = String(input.name ?? "").trim();
    if (!name) throw new Error("Nome do membro e obrigatorio");
    const created = await this.prisma.teamMember.create({
      data: {
        id: crypto.randomUUID(),
        unitId: input.unitId,
        name,
        role: input.role,
        accessProfile: input.accessProfile,
        email: String(input.email ?? "").trim() || null,
        phone: String(input.phone ?? "").trim() || null,
        isActive: input.isActive !== false,
      },
    });
    return { teamMember: created };
  }

  async updateTeamMember(input: {
    unitId: string;
    memberId: string;
    name?: string;
    role?: BusinessTeamMember["role"];
    accessProfile?: BusinessTeamMember["accessProfile"];
    email?: string;
    phone?: string;
    isActive?: boolean;
  }) {
    const current = await this.prisma.teamMember.findFirst({
      where: { id: input.memberId, unitId: input.unitId },
      select: { id: true },
    });
    if (!current) throw new Error("Membro da equipe nao encontrado");
    let nextName: string | undefined;
    if (input.name != null) {
      nextName = String(input.name).trim();
      if (!nextName) throw new Error("Nome do membro e obrigatorio");
    }
    const updated = await this.prisma.teamMember.update({
      where: { id: current.id },
      data: {
        name: nextName,
        role: input.role,
        accessProfile: input.accessProfile,
        email: input.email != null ? String(input.email).trim() || null : undefined,
        phone: input.phone != null ? String(input.phone).trim() || null : undefined,
        isActive: input.isActive,
      },
    });
    return { teamMember: updated };
  }

  private async getServiceUsageStatsMap(unitId: string) {
    const rows = await this.prisma.appointment.findMany({
      where: {
        unitId,
        status: "COMPLETED",
      },
      select: {
        serviceId: true,
        startsAt: true,
        service: {
          select: {
            price: true,
          },
        },
      },
    });
    const usageMap = new Map<
      string,
      {
        salesCount: number;
        revenueGenerated: number;
        lastCompletedAt: Date | null;
      }
    >();
    for (const row of rows) {
      const current = usageMap.get(row.serviceId) ?? {
        salesCount: 0,
        revenueGenerated: 0,
        lastCompletedAt: null,
      };
      current.salesCount += 1;
      current.revenueGenerated += asNumber(row.service.price);
      if (!current.lastCompletedAt || row.startsAt > current.lastCompletedAt) {
        current.lastCompletedAt = row.startsAt;
      }
      usageMap.set(row.serviceId, current);
    }
    return usageMap;
  }

  private async getServiceProfessionalIds(serviceId: string) {
    const rows = await this.prisma.serviceProfessional.findMany({
      where: { serviceId },
      select: { professionalId: true },
    });
    return rows.map((item) => item.professionalId);
  }

  private async canProfessionalExecuteService(serviceId: string, professionalId: string) {
    const rows = await this.prisma.serviceProfessional.findMany({
      where: { serviceId },
      select: { professionalId: true },
      take: 100,
    });
    if (!rows.length) return true;
    return rows.some((item) => item.professionalId === professionalId);
  }

  private async assertProfessionalCanExecuteService(serviceId: string, professionalId: string) {
    const allowed = await this.canProfessionalExecuteService(serviceId, professionalId);
    if (!allowed) {
      throw new Error("Profissional nao habilitado para este servico");
    }
  }

  private async buildServiceManagementView(
    service: Service,
    usage?: {
      salesCount: number;
      revenueGenerated: number;
      lastCompletedAt: Date | null;
    },
  ) {
    const enabledProfessionalIds = await this.getServiceProfessionalIds(service.id);
    const enabledProfessionalsRows = enabledProfessionalIds.length
      ? await this.prisma.professional.findMany({
          where: { id: { in: enabledProfessionalIds } },
          orderBy: { name: "asc" },
        })
      : [];
    const estimatedMargin = Number((Number(service.price || 0) - Number(service.costEstimate || 0)).toFixed(2));
    const estimatedMarginPct =
      Number(service.price || 0) > 0
        ? Number(((estimatedMargin / Number(service.price || 0)) * 100).toFixed(2))
        : 0;
    return {
      id: service.id,
      businessId: service.businessId,
      name: service.name,
      description: service.description ?? "",
      category: service.category ?? "",
      price: Number(service.price || 0),
      durationMinutes: Number(service.durationMin || 0),
      defaultCommissionRate: Number(service.defaultCommissionRate ?? 0),
      estimatedCost: Number(service.costEstimate || 0),
      estimatedMargin,
      estimatedMarginPct,
      isActive: Boolean(service.active),
      notes: service.notes ?? "",
      enabledProfessionalIds,
      enabledProfessionals: enabledProfessionalsRows.map((item) => ({
        id: item.id,
        name: item.name,
        active: item.active,
      })),
      salesCount: usage?.salesCount ?? 0,
      revenueGenerated: Number((usage?.revenueGenerated ?? 0).toFixed(2)),
      lastSoldAt: usage?.lastCompletedAt ? usage.lastCompletedAt.toISOString() : null,
      createdAt: service.createdAt instanceof Date ? service.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: service.updatedAt instanceof Date ? service.updatedAt.toISOString() : new Date().toISOString(),
    };
  }

  async getServices(input: {
    unitId: string;
    status?: "ACTIVE" | "INACTIVE" | "ALL";
    category?: string;
    search?: string;
    minPrice?: number;
    maxPrice?: number;
  }) {
    const status = String(input.status ?? "ALL").toUpperCase();
    const where: Prisma.ServiceWhereInput = {
      businessId: input.unitId,
      ...(status === "ACTIVE" ? { active: true } : {}),
      ...(status === "INACTIVE" ? { active: false } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: "insensitive" } },
              { description: { contains: input.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [servicesRows, usageMap, categoryRows] = await Promise.all([
      this.prisma.service.findMany({
        where: {
          ...where,
          ...(input.minPrice != null || input.maxPrice != null
            ? {
                price: {
                  ...(input.minPrice != null ? { gte: Number(input.minPrice) } : {}),
                  ...(input.maxPrice != null ? { lte: Number(input.maxPrice) } : {}),
                },
              }
            : {}),
        },
        orderBy: { name: "asc" },
      }),
      this.getServiceUsageStatsMap(input.unitId),
      this.prisma.service.findMany({
        where: { businessId: input.unitId },
        select: { category: true },
      }),
    ]);
    const services = await Promise.all(
      servicesRows.map((item) =>
        this.buildServiceManagementView(this.mapService(item), usageMap.get(item.id)),
      ),
    );
    const categories = [
      ...new Set(categoryRows.map((item) => String(item.category ?? "").trim()).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return { services, categories };
  }

  async getServiceById(input: { unitId: string; serviceId: string }) {
    const [serviceRow, usageMap, recentRows] = await Promise.all([
      this.prisma.service.findFirst({
        where: { id: input.serviceId, businessId: input.unitId },
      }),
      this.getServiceUsageStatsMap(input.unitId),
      this.prisma.appointment.findMany({
        where: {
          unitId: input.unitId,
          serviceId: input.serviceId,
        },
        orderBy: { startsAt: "desc" },
        take: 8,
        include: {
          client: true,
          professional: true,
          service: true,
          history: { orderBy: { changedAt: "asc" } },
        },
      }),
    ]);
    if (!serviceRow) throw new Error("Servico nao encontrado");
    const service = this.mapService(serviceRow);
    const usage = usageMap.get(service.id) ?? {
      salesCount: 0,
      revenueGenerated: 0,
      lastCompletedAt: null,
    };
    const serviceView = await this.buildServiceManagementView(service, usage);
    const recent = recentRows.map((item) => {
      const view = this.buildAppointmentView(item);
      return {
        appointmentId: view.id,
        startsAt: view.startsAt.toISOString(),
        status: view.status,
        client: view.client,
        professional: view.professional,
        revenue: Number(view.servicePrice || 0),
      };
    });
    return {
      service: serviceView,
      usage: {
        totalAppointments: recent.length,
        totalCompleted: usage.salesCount,
        totalRevenue: Number(usage.revenueGenerated.toFixed(2)),
        lastSoldAt: usage.lastCompletedAt ? usage.lastCompletedAt.toISOString() : null,
        recent,
      },
      financialImpact: {
        estimatedCostTotal: Number((usage.salesCount * Number(service.costEstimate || 0)).toFixed(2)),
        estimatedProfitTotal: Number(
          (usage.revenueGenerated - usage.salesCount * Number(service.costEstimate || 0)).toFixed(2),
        ),
        estimatedMarginPct: serviceView.estimatedMarginPct,
      },
      professionals: (
        await this.prisma.professional.findMany({
          where: { active: true },
          orderBy: { name: "asc" },
        })
      ).map((item) => ({
        id: item.id,
        name: item.name,
        enabled: serviceView.enabledProfessionalIds.includes(item.id),
      })),
    };
  }

  async createService(input: {
    unitId: string;
    name: string;
    price: number;
    durationMinutes: number;
    category?: string;
    description?: string;
    defaultCommissionRate?: number;
    professionalIds?: string[];
    isActive?: boolean;
    estimatedCost?: number;
    notes?: string;
  }) {
    const name = String(input.name ?? "").trim();
    if (!name) throw new Error("Nome do servico obrigatorio");
    const price = Number(input.price ?? 0);
    const durationMinutes = Math.trunc(Number(input.durationMinutes ?? 0));
    const estimatedCost = Number(input.estimatedCost ?? 0);
    const defaultCommissionRate = Number(input.defaultCommissionRate ?? 0);
    if (!Number.isFinite(price) || price < 0) throw new Error("Preco invalido");
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) throw new Error("Duracao invalida");
    if (!Number.isFinite(estimatedCost) || estimatedCost < 0) throw new Error("Custo estimado invalido");
    if (
      !Number.isFinite(defaultCommissionRate) ||
      defaultCommissionRate < 0 ||
      defaultCommissionRate > 100
    ) {
      throw new Error("Comissao deve estar entre 0% e 100%");
    }

    const service = await this.prisma.service.create({
      data: {
        id: crypto.randomUUID(),
        businessId: input.unitId,
        name,
        description: String(input.description ?? "").trim() || null,
        category: String(input.category ?? "").trim() || null,
        price: Number(price.toFixed(2)),
        durationMin: durationMinutes,
        defaultCommissionRate: Number(defaultCommissionRate.toFixed(2)),
        costEstimate: Number(estimatedCost.toFixed(2)),
        notes: String(input.notes ?? "").trim() || null,
        active: input.isActive !== false,
      },
    });

    const professionalIds = Array.from(
      new Set((Array.isArray(input.professionalIds) ? input.professionalIds : []).map((item) => String(item))),
    );
    if (professionalIds.length) {
      const professionals = await this.prisma.professional.findMany({
        where: { id: { in: professionalIds }, active: true },
        select: { id: true },
      });
      if (professionals.length) {
        await this.prisma.serviceProfessional.createMany({
          data: professionals.map((item) => ({
            id: crypto.randomUUID(),
            serviceId: service.id,
            professionalId: item.id,
          })),
          skipDuplicates: true,
        });
      }
    }

    return {
      service: await this.buildServiceManagementView(this.mapService(service)),
    };
  }

  async updateService(input: {
    unitId: string;
    serviceId: string;
    name?: string;
    description?: string;
    category?: string;
    price?: number;
    durationMinutes?: number;
    defaultCommissionRate?: number;
    estimatedCost?: number;
    notes?: string;
    isActive?: boolean;
    professionalIds?: string[];
  }) {
    const current = await this.prisma.service.findFirst({
      where: { id: input.serviceId, businessId: input.unitId },
    });
    if (!current) throw new Error("Servico nao encontrado");

    if (input.price != null && (!Number.isFinite(Number(input.price)) || Number(input.price) < 0)) {
      throw new Error("Preco invalido");
    }
    if (
      input.durationMinutes != null &&
      (!Number.isFinite(Number(input.durationMinutes)) || Math.trunc(Number(input.durationMinutes)) <= 0)
    ) {
      throw new Error("Duracao invalida");
    }
    if (
      input.defaultCommissionRate != null &&
      (!Number.isFinite(Number(input.defaultCommissionRate)) ||
        Number(input.defaultCommissionRate) < 0 ||
        Number(input.defaultCommissionRate) > 100)
    ) {
      throw new Error("Comissao deve estar entre 0% e 100%");
    }
    if (
      input.estimatedCost != null &&
      (!Number.isFinite(Number(input.estimatedCost)) || Number(input.estimatedCost) < 0)
    ) {
      throw new Error("Custo estimado invalido");
    }

    const updated = await this.prisma.service.update({
      where: { id: current.id },
      data: {
        ...(input.name !== undefined ? { name: String(input.name).trim() } : {}),
        ...(input.description !== undefined ? { description: String(input.description || "").trim() || null } : {}),
        ...(input.category !== undefined ? { category: String(input.category || "").trim() || null } : {}),
        ...(input.price !== undefined ? { price: Number(Number(input.price).toFixed(2)) } : {}),
        ...(input.durationMinutes !== undefined ? { durationMin: Math.trunc(Number(input.durationMinutes)) } : {}),
        ...(input.defaultCommissionRate !== undefined
          ? { defaultCommissionRate: Number(Number(input.defaultCommissionRate).toFixed(2)) }
          : {}),
        ...(input.estimatedCost !== undefined
          ? { costEstimate: Number(Number(input.estimatedCost).toFixed(2)) }
          : {}),
        ...(input.notes !== undefined ? { notes: String(input.notes || "").trim() || null } : {}),
        ...(input.isActive !== undefined ? { active: Boolean(input.isActive) } : {}),
      },
    });

    if (Array.isArray(input.professionalIds)) {
      const professionalIds = Array.from(new Set(input.professionalIds.map((item) => String(item))));
      const professionals = professionalIds.length
        ? await this.prisma.professional.findMany({
            where: { id: { in: professionalIds }, active: true },
            select: { id: true },
          })
        : [];
      await this.prisma.$transaction(async (tx) => {
        await tx.serviceProfessional.deleteMany({ where: { serviceId: updated.id } });
        if (professionals.length) {
          await tx.serviceProfessional.createMany({
            data: professionals.map((item) => ({
              id: crypto.randomUUID(),
              serviceId: updated.id,
              professionalId: item.id,
            })),
            skipDuplicates: true,
          });
        }
      });
    }

    return {
      service: await this.buildServiceManagementView(
        this.mapService(updated),
        (await this.getServiceUsageStatsMap(input.unitId)).get(updated.id),
      ),
    };
  }

  async updateServiceStatus(input: { unitId: string; serviceId: string; isActive: boolean }) {
    const current = await this.prisma.service.findFirst({
      where: { id: input.serviceId, businessId: input.unitId },
    });
    if (!current) throw new Error("Servico nao encontrado");
    const updated = await this.prisma.service.update({
      where: { id: current.id },
      data: { active: Boolean(input.isActive) },
    });
    return {
      service: await this.buildServiceManagementView(
        this.mapService(updated),
        (await this.getServiceUsageStatsMap(input.unitId)).get(updated.id),
      ),
    };
  }

  async deleteService(input: { unitId: string; serviceId: string }) {
    const service = await this.prisma.service.findFirst({
      where: { id: input.serviceId, businessId: input.unitId },
    });
    if (!service) throw new Error("Servico nao encontrado");
    const hasHistory = await this.prisma.appointment.count({
      where: { serviceId: service.id },
    });
    if (hasHistory > 0) {
      const updated = await this.prisma.service.update({
        where: { id: service.id },
        data: { active: false },
      });
      return {
        mode: "inactivated",
        service: await this.buildServiceManagementView(
          this.mapService(updated),
          (await this.getServiceUsageStatsMap(input.unitId)).get(updated.id),
        ),
      };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.serviceProfessional.deleteMany({ where: { serviceId: service.id } });
      await tx.serviceStockConsumption.deleteMany({ where: { serviceId: service.id } });
      await tx.service.delete({ where: { id: service.id } });
    });
    return {
      mode: "deleted",
      serviceId: service.id,
    };
  }

  async getServicesSummary(input: { unitId: string }) {
    const [servicesRows, usageMap] = await Promise.all([
      this.prisma.service.findMany({
        where: { businessId: input.unitId },
        orderBy: { name: "asc" },
      }),
      this.getServiceUsageStatsMap(input.unitId),
    ]);
    const services = servicesRows.map((item) => this.mapService(item));
    const totalServices = services.length;
    const activeServices = services.filter((item) => item.active).length;
    const inactiveServices = totalServices - activeServices;
    const averageTicket =
      totalServices > 0
        ? Number((services.reduce((acc, item) => acc + Number(item.price || 0), 0) / totalServices).toFixed(2))
        : 0;

    let bestSellingService: { id: string; name: string; salesCount: number } | null = null;
    let highestRevenueService: { id: string; name: string; revenueGenerated: number } | null = null;
    for (const service of services) {
      const usage = usageMap.get(service.id) ?? {
        salesCount: 0,
        revenueGenerated: 0,
        lastCompletedAt: null,
      };
      if (!bestSellingService || usage.salesCount > bestSellingService.salesCount) {
        bestSellingService = { id: service.id, name: service.name, salesCount: usage.salesCount };
      }
      if (
        !highestRevenueService ||
        usage.revenueGenerated > highestRevenueService.revenueGenerated
      ) {
        highestRevenueService = {
          id: service.id,
          name: service.name,
          revenueGenerated: Number(usage.revenueGenerated.toFixed(2)),
        };
      }
    }

    const priceAdjustmentCandidates = services
      .map((service) => {
        const margin = Number(service.price || 0) - Number(service.costEstimate || 0);
        const marginPct = Number(service.price || 0) > 0 ? (margin / Number(service.price || 0)) * 100 : 0;
        const usage = usageMap.get(service.id) ?? { salesCount: 0, revenueGenerated: 0, lastCompletedAt: null };
        let reason = "";
        if (marginPct < 25) {
          reason = "Margem estimada abaixo de 25%";
        } else if (usage.salesCount === 0 && service.active) {
          reason = "Servico ativo sem vendas no periodo";
        } else if (usage.salesCount >= 5 && marginPct < 35) {
          reason = "Alta demanda com margem comprimida";
        }
        return {
          id: service.id,
          name: service.name,
          marginPct: Number(marginPct.toFixed(2)),
          salesCount: usage.salesCount,
          reason,
        };
      })
      .filter((item) => Boolean(item.reason))
      .sort((a, b) => a.marginPct - b.marginPct)
      .slice(0, 5);

    return {
      totalServices,
      activeServices,
      inactiveServices,
      averageTicket,
      bestSellingService,
      highestRevenueService,
      priceAdjustmentCandidates,
    };
  }

  private getInventoryStatus(quantity: number, minimumStock: number) {
    if (quantity <= 0) return "OUT_OF_STOCK" as const;
    if (quantity <= minimumStock) return "LOW_STOCK" as const;
    return "IN_STOCK" as const;
  }

  private getInventoryReasonFromMovement(movement: {
    referenceType: string;
    referenceId: string | null;
  }) {
    if (movement.referenceType === "ADJUSTMENT") {
      const reason = String(movement.referenceId ?? "").trim();
      return reason || "Ajuste de estoque";
    }
    if (movement.referenceType === "PRODUCT_SALE") return "Venda de produto";
    if (movement.referenceType === "SERVICE_CONSUMPTION") return "Consumo por servico";
    if (movement.referenceType === "INTERNAL") return "Uso interno";
    return "Movimentacao de estoque";
  }

  async getInventory(input: {
    unitId: string;
    search?: string;
    category?: string;
    status?: "ALL" | "LOW_STOCK" | "OUT_OF_STOCK";
    limit?: number;
  }) {
    const search = String(input.search ?? "").trim().toLowerCase();
    const category = String(input.category ?? "").trim();
    const status = String(input.status ?? "ALL").toUpperCase();
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 80);

    const [products, movements, stockOverview] = await Promise.all([
      this.prisma.product.findMany({
        where: { active: true, businessId: input.unitId },
        orderBy: { name: "asc" },
      }),
      this.prisma.stockMovement.findMany({
        where: { unitId: input.unitId },
        orderBy: { occurredAt: "desc" },
        take: limit,
        include: { product: { select: { name: true } } },
      }),
      this.getStockOverview({ unitId: input.unitId, limit }),
    ]);

    const inventoryProducts = products
      .map((item) => {
        const quantity = Math.max(0, Math.trunc(Number(item.stockQty) || 0));
        const minimumStock = Math.max(0, Math.trunc(Number(item.minStockAlert) || 0));
        const status = this.getInventoryStatus(quantity, minimumStock);
        return {
          id: item.id,
          businessId: item.businessId || input.unitId,
          name: item.name,
          category: item.category,
          salePrice: asNumber(item.salePrice),
          costPrice: asNumber(item.costPrice),
          quantity,
          minimumStock,
          notes: item.notes ?? "",
          status,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
          estimatedValue: Number(
            (quantity * (asNumber(item.costPrice) || asNumber(item.salePrice))).toFixed(2),
          ),
        };
      })
      .filter((item) => {
        if (search && !item.name.toLowerCase().includes(search)) return false;
        if (category && item.category !== category) return false;
        if (status === "LOW_STOCK" && item.status !== "LOW_STOCK") return false;
        if (status === "OUT_OF_STOCK" && item.status !== "OUT_OF_STOCK") return false;
        return true;
      });

    const logs = movements.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      type:
        item.referenceType === "ADJUSTMENT"
          ? "ADJUSTMENT"
          : item.movementType === "IN"
            ? "IN"
            : "OUT",
      quantity: item.quantity,
      reason: this.getInventoryReasonFromMovement(item),
      createdAt: item.occurredAt.toISOString(),
    }));
    const lastMovement = logs[0] ?? null;
    const categories = [...new Set(products.map((item) => item.category).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );

    const summaryProducts = products.map((item) => {
      const quantity = Math.max(0, Math.trunc(Number(item.stockQty) || 0));
      const minimumStock = Math.max(0, Math.trunc(Number(item.minStockAlert) || 0));
      return {
        quantity,
        minimumStock,
        estimatedValue: Number(
          (quantity * (asNumber(item.costPrice) || asNumber(item.salePrice))).toFixed(2),
        ),
      };
    });

    return {
      summary: {
        totalProducts: products.length,
        itemsInStock: summaryProducts.filter((item) => item.quantity > 0).length,
        lowStockCount: summaryProducts.filter(
          (item) => item.quantity > 0 && item.quantity <= item.minimumStock,
        ).length,
        estimatedStockValue: Number(
          summaryProducts.reduce((acc, item) => acc + item.estimatedValue, 0).toFixed(2),
        ),
        lastMovementAt: lastMovement?.createdAt ?? null,
      },
      categories,
      products: inventoryProducts,
      logs,
      lastMovement,
      totals: stockOverview.totals,
      lowStock: stockOverview.lowStock,
      recentMovements: stockOverview.recentMovements,
      replenishmentSuggestions: stockOverview.replenishmentSuggestions,
    };
  }

  async createInventoryProduct(input: {
    unitId: string;
    name: string;
    salePrice: number;
    quantity: number;
    costPrice?: number;
    minimumStock?: number;
    category?: string;
    notes?: string;
  }) {
    const name = String(input.name ?? "").trim();
    if (!name) throw new Error("Nome do produto obrigatorio");
    const salePrice = Number(input.salePrice ?? 0);
    const quantity = Math.trunc(Number(input.quantity ?? 0));
    const costPrice = Number(input.costPrice ?? 0);
    const minimumStock = Math.trunc(Number(input.minimumStock ?? 0));
    if (!Number.isFinite(salePrice) || salePrice < 0) throw new Error("Preco de venda invalido");
    if (!Number.isFinite(quantity) || quantity < 0) throw new Error("Quantidade invalida");
    if (!Number.isFinite(costPrice) || costPrice < 0) throw new Error("Custo invalido");
    if (!Number.isFinite(minimumStock) || minimumStock < 0) throw new Error("Estoque minimo invalido");

    const now = new Date();
    const created = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          id: crypto.randomUUID(),
          businessId: input.unitId,
          name,
          category: String(input.category ?? "").trim() || "Sem categoria",
          salePrice: Number(salePrice.toFixed(2)),
          costPrice: Number(costPrice.toFixed(2)),
          stockQty: quantity,
          minStockAlert: minimumStock,
          notes: String(input.notes ?? "").trim() || null,
        },
      });
      if (quantity > 0) {
        await tx.stockMovement.create({
          data: {
            id: crypto.randomUUID(),
            unitId: input.unitId,
            productId: product.id,
            movementType: "IN",
            quantity,
            occurredAt: now,
            referenceType: "ADJUSTMENT",
            referenceId: "Estoque inicial no cadastro",
          },
        });
      }
      return product;
    });

    return {
      product: {
        id: created.id,
        businessId: created.businessId || input.unitId,
        name: created.name,
        category: created.category,
        salePrice: asNumber(created.salePrice),
        costPrice: asNumber(created.costPrice),
        quantity: created.stockQty,
        minimumStock: created.minStockAlert,
        notes: created.notes ?? "",
        status: this.getInventoryStatus(created.stockQty, created.minStockAlert),
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
        estimatedValue: Number(
          (created.stockQty * (asNumber(created.costPrice) || asNumber(created.salePrice))).toFixed(2),
        ),
      },
    };
  }

  async updateInventoryProduct(input: {
    unitId: string;
    id: string;
    name?: string;
    salePrice?: number;
    quantity?: number;
    costPrice?: number;
    minimumStock?: number;
    category?: string;
    notes?: string;
  }) {
    const current = await this.prisma.product.findFirst({
      where: {
        id: input.id,
        active: true,
        businessId: input.unitId,
      },
    });
    if (!current) throw new Error("Produto nao encontrado");

    const nextName = input.name != null ? String(input.name).trim() : current.name;
    if (!nextName) throw new Error("Nome do produto obrigatorio");
    const nextSalePrice = input.salePrice != null ? Number(input.salePrice) : asNumber(current.salePrice);
    const nextCostPrice = input.costPrice != null ? Number(input.costPrice) : asNumber(current.costPrice);
    const nextMinimumStock =
      input.minimumStock != null ? Math.trunc(Number(input.minimumStock)) : current.minStockAlert;
    const nextQuantity = input.quantity != null ? Math.trunc(Number(input.quantity)) : current.stockQty;
    if (!Number.isFinite(nextSalePrice) || nextSalePrice < 0) throw new Error("Preco de venda invalido");
    if (!Number.isFinite(nextCostPrice) || nextCostPrice < 0) throw new Error("Custo invalido");
    if (!Number.isFinite(nextMinimumStock) || nextMinimumStock < 0) {
      throw new Error("Estoque minimo invalido");
    }
    if (!Number.isFinite(nextQuantity) || nextQuantity < 0) throw new Error("Quantidade invalida");

    const delta = nextQuantity - current.stockQty;
    const reason = "Ajuste por edicao de produto";

    const updated = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id: input.id },
        data: {
          name: nextName,
          salePrice: Number(nextSalePrice.toFixed(2)),
          costPrice: Number(nextCostPrice.toFixed(2)),
          minStockAlert: nextMinimumStock,
          stockQty: nextQuantity,
          category: input.category != null ? String(input.category).trim() || "Sem categoria" : undefined,
          notes: input.notes != null ? String(input.notes).trim() || null : undefined,
        },
      });
      if (delta !== 0) {
        await tx.stockMovement.create({
          data: {
            id: crypto.randomUUID(),
            unitId: input.unitId,
            productId: input.id,
            movementType: delta > 0 ? "IN" : "OUT",
            quantity: Math.abs(delta),
            occurredAt: new Date(),
            referenceType: "ADJUSTMENT",
            referenceId: reason,
          },
        });
      }
      return product;
    });

    return {
      product: {
        id: updated.id,
        businessId: updated.businessId || input.unitId,
        name: updated.name,
        category: updated.category,
        salePrice: asNumber(updated.salePrice),
        costPrice: asNumber(updated.costPrice),
        quantity: updated.stockQty,
        minimumStock: updated.minStockAlert,
        notes: updated.notes ?? "",
        status: this.getInventoryStatus(updated.stockQty, updated.minStockAlert),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        estimatedValue: Number(
          (updated.stockQty * (asNumber(updated.costPrice) || asNumber(updated.salePrice))).toFixed(2),
        ),
      },
      log:
        delta === 0
          ? null
          : {
              type: "ADJUSTMENT",
              quantity: Math.abs(delta),
              reason,
            },
    };
  }

  async archiveInventoryProduct(input: {
    unitId: string;
    id: string;
  }) {
    const updated = await this.prisma.product.updateMany({
      where: {
        id: input.id,
        businessId: input.unitId,
        active: true,
      },
      data: {
        active: false,
      },
    });
    if (updated.count === 0) throw new Error("Produto nao encontrado");
    return {
      id: input.id,
      inactive: true,
    };
  }

  async adjustInventoryStock(input: {
    unitId: string;
    id: string;
    type: "IN" | "OUT" | "ADJUSTMENT";
    quantity: number;
    reason?: string;
  }) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: input.id,
        businessId: input.unitId,
        active: true,
      },
    });
    if (!product) throw new Error("Produto nao encontrado");
    const rawQuantity = Math.trunc(Number(input.quantity));
    if (!Number.isFinite(rawQuantity) || rawQuantity < 0) throw new Error("Quantidade invalida");

    const currentQty = product.stockQty;
    let nextQty = currentQty;
    let movementType: "IN" | "OUT";
    let movementQty = rawQuantity;

    if (input.type === "IN") {
      movementType = "IN";
      nextQty = currentQty + rawQuantity;
    } else if (input.type === "OUT") {
      if (rawQuantity > currentQty) throw new Error("Quantidade de saida maior que o saldo atual");
      movementType = "OUT";
      nextQty = currentQty - rawQuantity;
    } else {
      nextQty = rawQuantity;
      const delta = nextQty - currentQty;
      movementType = delta >= 0 ? "IN" : "OUT";
      movementQty = Math.abs(delta);
    }

    if (nextQty < 0) throw new Error("Nao e permitido quantidade negativa");
    if (movementQty === 0) {
      return {
        product: {
          id: product.id,
          businessId: product.businessId || input.unitId,
          name: product.name,
          category: product.category,
          salePrice: asNumber(product.salePrice),
          costPrice: asNumber(product.costPrice),
          quantity: product.stockQty,
          minimumStock: product.minStockAlert,
          notes: product.notes ?? "",
          status: this.getInventoryStatus(product.stockQty, product.minStockAlert),
          createdAt: product.createdAt.toISOString(),
          updatedAt: product.updatedAt.toISOString(),
          estimatedValue: Number(
            (product.stockQty * (asNumber(product.costPrice) || asNumber(product.salePrice))).toFixed(2),
          ),
        },
        log: null,
      };
    }

    const reason = String(input.reason ?? "").trim() || "Ajuste rapido de estoque";
    const result = await this.prisma.$transaction(async (tx) => {
      const movement = await tx.stockMovement.create({
        data: {
          id: crypto.randomUUID(),
          unitId: input.unitId,
          productId: input.id,
          movementType,
          quantity: movementQty,
          occurredAt: new Date(),
          referenceType: "ADJUSTMENT",
          referenceId: reason,
        },
      });
      const updated = await tx.product.update({
        where: { id: input.id },
        data: { stockQty: nextQty },
      });
      return { movement, updated };
    });

    return {
      product: {
        id: result.updated.id,
        businessId: result.updated.businessId || input.unitId,
        name: result.updated.name,
        category: result.updated.category,
        salePrice: asNumber(result.updated.salePrice),
        costPrice: asNumber(result.updated.costPrice),
        quantity: result.updated.stockQty,
        minimumStock: result.updated.minStockAlert,
        notes: result.updated.notes ?? "",
        status: this.getInventoryStatus(result.updated.stockQty, result.updated.minStockAlert),
        createdAt: result.updated.createdAt.toISOString(),
        updatedAt: result.updated.updatedAt.toISOString(),
        estimatedValue: Number(
          (
            result.updated.stockQty *
            (asNumber(result.updated.costPrice) || asNumber(result.updated.salePrice))
          ).toFixed(2),
        ),
      },
      log: {
        id: result.movement.id,
        productId: result.movement.productId,
        type: input.type === "ADJUSTMENT" ? "ADJUSTMENT" : input.type,
        quantity: result.movement.quantity,
        reason: this.getInventoryReasonFromMovement(result.movement),
        createdAt: result.movement.occurredAt.toISOString(),
      },
    };
  }

  async getServiceStockConsumption(input: {
    unitId: string;
    serviceId: string;
  }) {
    try {
      const service = await this.prisma.service.findFirst({
        where: { id: input.serviceId, businessId: input.unitId },
        select: { id: true },
      });
      if (!service) throw new Error("Servico nao encontrado");
      const rows = await this.prisma.serviceStockConsumption.findMany({
        where: {
          unitId: input.unitId,
          serviceId: input.serviceId,
        },
        orderBy: { updatedAt: "desc" },
      });
      const items = rows.map((item) => ({
        productId: item.productId,
        quantityPerService: asNumber(item.quantityPerService),
        wastePct: asNumber(item.wastePct),
        isCritical: item.isCritical,
      }));
      const updatedAt = rows[0]?.updatedAt ?? new Date();
      return {
        unitId: input.unitId,
        serviceId: input.serviceId,
        items,
        updatedAt: updatedAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error("Consumo de estoque por servico indisponivel");
    }
  }

  async setServiceStockConsumption(input: {
    unitId: string;
    serviceId: string;
    items: ServiceStockConsumptionItem[];
  }) {
    const normalized = normalizeConsumptionItems(input.items);
    const now = new Date();
    try {
      const service = await this.prisma.service.findFirst({
        where: { id: input.serviceId, businessId: input.unitId },
        select: { id: true },
      });
      if (!service) throw new Error("Servico nao encontrado");
      if (normalized.length > 0) {
        const productCount = await this.prisma.product.count({
          where: {
            id: { in: normalized.map((item) => item.productId) },
            businessId: input.unitId,
            active: true,
          },
        });
        if (productCount !== normalized.length) {
          throw new Error("Produto de ficha tecnica nao encontrado ou fora da unidade");
        }
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.serviceStockConsumption.deleteMany({
          where: {
            unitId: input.unitId,
            serviceId: input.serviceId,
          },
        });
        if (normalized.length > 0) {
          await tx.serviceStockConsumption.createMany({
            data: normalized.map((item) => ({
              id: crypto.randomUUID(),
              unitId: input.unitId,
              serviceId: input.serviceId,
              productId: item.productId,
              quantityPerService: item.quantityPerService,
              wastePct: item.wastePct ?? 0,
              isCritical: Boolean(item.isCritical),
            })),
          });
        }
      });
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error("Consumo de estoque por servico indisponivel");
    }
    return {
      unitId: input.unitId,
      serviceId: input.serviceId,
      items: normalized,
      updatedAt: now.toISOString(),
    };
  }

  async schedule(input: {
    unitId: string;
    clientId: string;
    professionalId: string;
    serviceId: string;
    startsAt: Date;
    bufferAfterMin?: number;
    isFitting?: boolean;
    notes?: string;
    changedBy: string;
  }) {
    const serviceRow = await this.prisma.service.findFirst({
      where: { id: input.serviceId, businessId: input.unitId },
    });
    if (!serviceRow || !serviceRow.active) {
      throw new Error("Servico nao encontrado ou inativo");
    }

    const professionalRow = await this.prisma.professional.findUnique({
      where: { id: input.professionalId },
      include: { commissionRules: true },
    });
    if (!professionalRow || !professionalRow.active) {
      throw new Error("Profissional nao encontrado ou inativo");
    }
    await this.assertProfessionalCanExecuteService(serviceRow.id, professionalRow.id);

    const clientRow = await this.prisma.client.findFirst({
      where: { id: input.clientId, businessId: input.unitId },
    });
    if (!clientRow) throw new Error("Cliente nao encontrado");

    const service = this.mapService(serviceRow);
    const expectedEnd = new Date(
      input.startsAt.getTime() +
        (service.durationMin + (input.bufferAfterMin ?? 0)) * 60_000,
    );

    const existingRows = await this.findOverlappingActiveAppointments({
      businessId: input.unitId,
      professionalId: input.professionalId,
      startAt: input.startsAt,
      endAt: expectedEnd,
    });
    const existing = existingRows.map((item) => this.mapAppointment(item));

    const appointment = this.engine.scheduleAppointment(
      {
        unitId: input.unitId,
        clientId: input.clientId,
        professionalId: input.professionalId,
        service,
        startsAt: input.startsAt,
        bufferAfterMin: input.bufferAfterMin,
        isFitting: input.isFitting,
        notes: input.notes,
        changedBy: input.changedBy,
      },
      existing,
    );

    await this.prisma.appointment.create({
      data: {
        id: appointment.id,
        unitId: appointment.unitId,
        clientId: appointment.clientId,
        professionalId: appointment.professionalId,
        serviceId: appointment.serviceId,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        status: appointment.status,
        isFitting: appointment.isFitting,
        notes: appointment.notes,
        history: {
          create: appointment.history.map((entry) => ({
            id: crypto.randomUUID(),
            changedAt: entry.changedAt,
            changedBy: entry.changedBy,
            action: entry.action,
            reason: entry.reason,
          })),
        },
      },
      include: { history: { orderBy: { changedAt: "asc" } } },
    });

    return appointment;
  }

  async reschedule(input: {
    appointmentId: string;
    unitId?: string;
    startsAt: Date;
    changedBy: string;
  }) {
    const row = await this.prisma.appointment.findUnique({
      where: { id: input.appointmentId },
      include: { history: { orderBy: { changedAt: "asc" } }, service: true },
    });
    if (!row) throw new Error("Agendamento nao encontrado");
    if (input.unitId && row.unitId !== input.unitId) {
      throw new Error("Unidade nao autorizada");
    }

    const appointment = this.mapAppointment(row);
    const service = this.mapService(row.service);

    const newEnd = new Date(input.startsAt.getTime() + service.durationMin * 60_000);
    const overlappingRows = await this.findOverlappingActiveAppointments({
      businessId: appointment.unitId,
      professionalId: appointment.professionalId,
      startAt: input.startsAt,
      endAt: newEnd,
      excludeAppointmentId: appointment.id,
    });

    const updated = this.engine.rescheduleAppointment(
      appointment,
      input.startsAt,
      service.durationMin,
      overlappingRows.map((item) => this.mapAppointment(item)),
      input.changedBy,
    );

    await this.prisma.appointment.update({
      where: { id: updated.id },
      data: {
        startsAt: updated.startsAt,
        endsAt: updated.endsAt,
        history: {
          create: {
            id: crypto.randomUUID(),
            changedAt: new Date(),
            changedBy: input.changedBy,
            action: "RESCHEDULED",
          },
        },
      },
    });

    return updated;
  }

  private async findOverlappingActiveAppointments(input: {
    businessId: string;
    professionalId: string;
    startAt: Date;
    endAt: Date;
    excludeAppointmentId?: string;
  }) {
    return await this.prisma.appointment.findMany({
      where: {
        unitId: input.businessId,
        professionalId: input.professionalId,
        ...(input.excludeAppointmentId ? { id: { not: input.excludeAppointmentId } } : {}),
        status: { in: ACTIVE_APPOINTMENT_CONFLICT_STATUSES },
        startsAt: { lt: input.endAt },
        endsAt: { gt: input.startAt },
      },
      include: { history: { orderBy: { changedAt: "asc" } } },
    });
  }

  async updateStatus(input: {
    appointmentId: string;
    unitId?: string;
    status: AppointmentStatus;
    changedBy: string;
    reason?: string;
  }) {
    const row = await this.prisma.appointment.findUnique({
      where: { id: input.appointmentId },
      include: { history: { orderBy: { changedAt: "asc" } } },
    });
    if (!row) throw new Error("Agendamento nao encontrado");
    if (input.unitId && row.unitId !== input.unitId) {
      throw new Error("Unidade nao autorizada");
    }

    const appointment = this.mapAppointment(row);
    const updated = this.engine.changeAppointmentStatus(
      appointment,
      input.status,
      input.changedBy,
      input.reason,
    );

    const action = updated.history[updated.history.length - 1]?.action ?? "CREATED";
    await this.prisma.appointment.update({
      where: { id: updated.id },
      data: {
        status: updated.status,
        history: {
          create: {
            id: crypto.randomUUID(),
            changedAt: new Date(),
            changedBy: input.changedBy,
            action,
            reason: input.reason,
          },
        },
      },
    });

    return updated;
  }

  async complete(input: {
    appointmentId: string;
    unitId?: string;
    changedBy: string;
    completedAt: Date;
  }) {
    const row = await this.prisma.appointment.findUnique({
      where: { id: input.appointmentId },
      include: {
        history: { orderBy: { changedAt: "asc" } },
        service: true,
        professional: { include: { commissionRules: true } },
      },
    });
    if (!row) throw new Error("Agendamento nao encontrado");
    if (input.unitId && row.unitId !== input.unitId) {
      throw new Error("Unidade nao autorizada");
    }

    const appointment = this.mapAppointment(row);
    const service = this.mapService(row.service);
    const professional = this.mapProfessional(row.professional);
    const range = monthRange(input.completedAt);

    const serviceIncomeAgg = await this.prisma.financialEntry.aggregate({
      where: {
        unitId: appointment.unitId,
        kind: "INCOME",
        source: "SERVICE",
        occurredAt: { gte: range.start, lt: range.end },
      },
      _sum: { amount: true },
    });

    const result = this.engine.completeAppointment({
      appointment,
      service,
      professional,
      monthlyProducedValue: asNumber(serviceIncomeAgg._sum.amount),
      changedBy: input.changedBy,
      completedAt: input.completedAt,
    });

    let stockConsumptionRows: Array<{
      productId: string;
      quantityPerService: Prisma.Decimal;
      wastePct: Prisma.Decimal;
      isCritical: boolean;
    }> = [];
    try {
      stockConsumptionRows = await this.prisma.serviceStockConsumption.findMany({
        where: {
          unitId: appointment.unitId,
          serviceId: appointment.serviceId,
        },
        select: {
          productId: true,
          quantityPerService: true,
          wastePct: true,
          isCritical: true,
        },
      });
    } catch {
      stockConsumptionRows = [];
    }

    const stockConsumptionWarnings: string[] = [];
    const stockConsumptionMovements: Array<{
      id: string;
      unitId: string;
      productId: string;
      movementType: "OUT";
      quantity: number;
      occurredAt: Date;
      referenceType: "SERVICE_CONSUMPTION";
      referenceId: string;
    }> = [];
    const stockConsumptionAppliedItems: Array<{
      productId: string;
      quantity: number;
      movementId: string;
    }> = [];
    if (stockConsumptionRows.length > 0) {
      const products = await this.prisma.product.findMany({
        where: {
          id: { in: stockConsumptionRows.map((item) => item.productId) },
          active: true,
        },
        select: {
          id: true,
          name: true,
          stockQty: true,
        },
      });
      const productById = new Map(products.map((item) => [item.id, item]));
      for (const row of stockConsumptionRows) {
        const product = productById.get(row.productId);
        if (!product) {
          stockConsumptionWarnings.push(`Produto ${row.productId} nao encontrado para consumo.`);
          continue;
        }
        const quantity = computeEffectiveConsumptionQty({
          productId: row.productId,
          quantityPerService: asNumber(row.quantityPerService),
          wastePct: asNumber(row.wastePct),
          isCritical: row.isCritical,
        });
        if (quantity <= 0) continue;
        if (product.stockQty < quantity) {
          stockConsumptionWarnings.push(
            `Saldo insuficiente para ${product.name}. Saldo=${product.stockQty}, consumo=${quantity}.`,
          );
          continue;
        }
        const movementId = crypto.randomUUID();
        stockConsumptionMovements.push({
          id: movementId,
          unitId: appointment.unitId,
          productId: row.productId,
          movementType: "OUT",
          quantity,
          occurredAt: input.completedAt,
          referenceType: "SERVICE_CONSUMPTION",
          referenceId: appointment.id,
        });
        stockConsumptionAppliedItems.push({
          productId: row.productId,
          quantity,
          movementId,
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const action = result.appointment.history[result.appointment.history.length - 1]?.action;
      await tx.appointment.update({
        where: { id: result.appointment.id },
        data: {
          status: "COMPLETED",
          history: {
            create: {
              id: crypto.randomUUID(),
              changedAt: input.completedAt,
              changedBy: input.changedBy,
              action: action ?? "COMPLETED",
            },
          },
        },
      });

      await tx.financialEntry.create({
        data: {
          id: result.revenue.id,
          unitId: result.revenue.unitId,
          kind: result.revenue.kind,
          source: result.revenue.source,
          category: result.revenue.category ?? "SERVICO",
          paymentMethod: result.revenue.paymentMethod ?? "NAO_INFORMADO",
          amount: result.revenue.amount,
          occurredAt: result.revenue.occurredAt,
          referenceType: result.revenue.referenceType,
          referenceId: result.revenue.referenceId,
          professionalId: appointment.professionalId,
          customerId: appointment.clientId,
          description: result.revenue.description,
          notes: result.revenue.notes,
        },
      });

      if (result.commission) {
        await tx.commissionEntry.create({
          data: {
            id: result.commission.id,
            professionalId: result.commission.professionalId,
            unitId: result.commission.unitId,
            appointmentId: result.commission.appointmentId,
            productSaleId: result.commission.productSaleId,
            source: result.commission.source,
            baseAmount: result.commission.baseAmount,
            commissionRate: result.commission.commissionRate,
            commissionAmount: result.commission.commissionAmount,
            status: result.commission.status ?? "PENDING",
            occurredAt: result.commission.occurredAt,
            ruleId: result.commission.ruleId,
            paidAt: result.commission.paidAt,
          },
        });
      }

      for (const movement of stockConsumptionMovements) {
        await tx.stockMovement.create({
          data: {
            id: movement.id,
            unitId: movement.unitId,
            productId: movement.productId,
            movementType: movement.movementType,
            quantity: movement.quantity,
            occurredAt: movement.occurredAt,
            referenceType: movement.referenceType,
            referenceId: movement.referenceId,
          },
        });
        await tx.product.update({
          where: { id: movement.productId },
          data: {
            stockQty: {
              decrement: movement.quantity,
            },
          },
        });
      }
    });

    return {
      ...result,
      stockConsumption: {
        applied: stockConsumptionAppliedItems.length > 0,
        movementsCount: stockConsumptionAppliedItems.length,
        items: stockConsumptionAppliedItems,
        warnings: stockConsumptionWarnings,
      },
    };
  }

  async registerProductSale(input: {
    unitId: string;
    professionalId?: string;
    clientId?: string;
    soldAt: Date;
    items: Array<{
      productId: string;
      quantity: number;
    }>;
    idempotencyKey?: string;
    idempotencyPayloadHash?: string;
    audit?: TransactionalAuditContext;
  }) {
    const scope = this.buildIdempotencyScope({
      unitId: input.unitId,
      action: "PRODUCT_SALE_CREATE",
      idempotencyKey: input.idempotencyKey,
      payloadHash: input.idempotencyPayloadHash,
      payload: input,
    });
    if (scope) {
      const replay = await this.getReplayResult<ReturnType<BarbershopEngine["registerProductSale"]>>(scope);
      if (replay) return replay;
    }
    const operationKey = this.scopedOperationKey(scope);

    const productsRows = await this.prisma.product.findMany({
      where: {
        id: { in: input.items.map((item) => item.productId) },
        businessId: input.unitId,
        active: true,
      },
    });
    if (productsRows.length !== input.items.length) {
      throw new Error("Produto nao encontrado ou inativo");
    }
    const products = productsRows.map((item) => this.mapProduct(item));

    let professional: Professional | undefined;
    if (input.professionalId) {
      const row = await this.prisma.professional.findUnique({
        where: { id: input.professionalId },
        include: { commissionRules: true },
      });
      if (!row) throw new Error("Profissional nao encontrado");
      professional = this.mapProfessional(row);
    }

    const sale: ProductSale = {
      id: crypto.randomUUID(),
      unitId: input.unitId,
      clientId: input.clientId,
      professionalId: input.professionalId,
      soldAt: input.soldAt,
      grossAmount: 0,
      items: input.items.map((item) => {
        const product = products.find((prod) => prod.id === item.productId);
        if (!product) throw new Error(`Produto ${item.productId} nao encontrado`);
        return {
          productId: product.id,
          quantity: item.quantity,
          unitPrice: product.salePrice,
          unitCost: product.costPrice,
        };
      }),
    };

    const result = this.engine.registerProductSale({
      sale,
      products,
      professional,
    });

    try {
      await this.prisma.$transaction(async (tx) => {
      if (scope) {
        await tx.idempotencyRecord.create({
          data: {
            id: crypto.randomUUID(),
            unitId: scope.unitId,
            action: scope.action,
            idempotencyKey: scope.idempotencyKey!,
            payloadHash: scope.payloadHash,
            status: "IN_PROGRESS",
          },
        });
      }

      await tx.productSale.create({
        data: {
          id: result.sale.id,
          unitId: result.sale.unitId,
          clientId: result.sale.clientId,
          professionalId: result.sale.professionalId,
          grossAmount: result.sale.grossAmount,
          soldAt: result.sale.soldAt,
          idempotencyKey: operationKey,
          items: {
            create: result.sale.items.map((item) => ({
              id: crypto.randomUUID(),
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unitCost: item.unitCost,
            })),
          },
        },
      });

      await tx.financialEntry.create({
        data: {
          id: result.revenue.id,
          unitId: result.revenue.unitId,
          kind: result.revenue.kind,
          source: result.revenue.source,
          category: result.revenue.category ?? "PRODUTO",
          paymentMethod: result.revenue.paymentMethod ?? "NAO_INFORMADO",
          amount: result.revenue.amount,
          occurredAt: result.revenue.occurredAt,
          referenceType: result.revenue.referenceType,
          referenceId: result.revenue.referenceId,
          professionalId: result.sale.professionalId,
          customerId: result.sale.clientId,
          description: result.revenue.description,
          notes: result.revenue.notes,
          idempotencyKey: operationKey,
        },
      });

      for (const movement of result.stockMovements) {
        await tx.stockMovement.create({
          data: {
            id: movement.id,
            unitId: movement.unitId,
            productId: movement.productId,
            movementType: movement.movementType,
            quantity: movement.quantity,
            occurredAt: movement.occurredAt,
            referenceType: movement.referenceType,
            referenceId: movement.referenceId,
          },
        });
        const stockUpdate = await tx.product.updateMany({
          where: {
            id: movement.productId,
            businessId: input.unitId,
            stockQty: { gte: movement.quantity },
          },
          data: {
            stockQty: {
              decrement: movement.quantity,
            },
          },
        });
        if (stockUpdate.count !== 1) {
          throw new Error("Estoque insuficiente para venda de produto");
        }
      }

      if (result.commission) {
        await tx.commissionEntry.create({
          data: {
            id: result.commission.id,
            professionalId: result.commission.professionalId,
            unitId: result.commission.unitId,
            appointmentId: result.commission.appointmentId,
            productSaleId: result.commission.productSaleId,
            source: result.commission.source,
            baseAmount: result.commission.baseAmount,
            commissionRate: result.commission.commissionRate,
            commissionAmount: result.commission.commissionAmount,
            status: result.commission.status ?? "PENDING",
            occurredAt: result.commission.occurredAt,
            ruleId: result.commission.ruleId,
            idempotencyKey: operationKey,
            paidAt: result.commission.paidAt,
          },
        });
      }
      await this.recordCriticalAudit(
        tx,
        input.audit
          ? {
              ...input.audit,
              unitId: result.sale.unitId,
              action: "PRODUCT_SALE_REGISTERED",
              entity: "product_sale",
              entityId: result.sale.id,
              after: {
                grossAmount: result.sale.grossAmount,
                items: result.sale.items.length,
              },
            }
          : undefined,
      );
      if (scope) {
        await tx.idempotencyRecord.update({
          where: {
            unitId_action_idempotencyKey: {
              unitId: scope.unitId,
              action: scope.action,
              idempotencyKey: scope.idempotencyKey!,
            },
          },
          data: {
            status: "SUCCEEDED",
            responseJson: toJsonValue(result) as Prisma.InputJsonValue,
            resolution: result.sale.id,
          },
        });
      }
    });
    } catch (error) {
      return await this.replayAfterUniqueConflict<typeof result>(error, scope);
    }

    return result;
  }

  async listProductSales(input: {
    unitId: string;
    start?: Date;
    end?: Date;
    clientId?: string;
    professionalId?: string;
    productId?: string;
    search?: string;
    status?: ProductSaleRefundStatus;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(input.limit ?? 200, 1), 500);
    const search = String(input.search ?? "").trim();
    const where: Prisma.ProductSaleWhereInput = {
      unitId: input.unitId,
      soldAt: {
        ...(input.start ? { gte: input.start } : {}),
        ...(input.end ? { lte: input.end } : {}),
      },
      ...(input.clientId ? { clientId: input.clientId } : {}),
      ...(input.professionalId ? { professionalId: input.professionalId } : {}),
      ...(input.productId ? { items: { some: { productId: input.productId } } } : {}),
      ...(search
        ? {
            OR: [
              { id: { contains: search, mode: "insensitive" } },
              { client: { fullName: { contains: search, mode: "insensitive" } } },
              { professional: { name: { contains: search, mode: "insensitive" } } },
              {
                items: {
                  some: { product: { name: { contains: search, mode: "insensitive" } } },
                },
              },
            ],
          }
        : {}),
    };

    const sales = await this.prisma.productSale.findMany({
      where,
      orderBy: { soldAt: "desc" },
      take: limit,
      include: {
        client: { select: { id: true, fullName: true } },
        professional: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true } },
          },
        },
        refunds: {
          include: { items: true },
        },
      },
    });

    const rows = sales
      .map((sale): ProductSaleHistoryRow => {
        const refundedByProduct = new Map<string, number>();
        let totalRefundedAmount = 0;
        for (const refund of sale.refunds) {
          totalRefundedAmount += asNumber(refund.totalAmount);
          for (const item of refund.items) {
            refundedByProduct.set(
              item.productId,
              (refundedByProduct.get(item.productId) ?? 0) + item.quantity,
            );
          }
        }
        const items = sale.items.map((item) => {
          const refundedQuantity = refundedByProduct.get(item.productId) ?? 0;
          return {
            productId: item.productId,
            productName: item.product.name,
            quantity: item.quantity,
            unitPrice: asNumber(item.unitPrice),
            unitCost: asNumber(item.unitCost),
            refundedQuantity,
            refundableQuantity: Math.max(0, item.quantity - refundedQuantity),
          };
        });
        const totalSoldQty = items.reduce((acc, item) => acc + item.quantity, 0);
        const totalRefundedQty = items.reduce((acc, item) => acc + item.refundedQuantity, 0);
        const status: ProductSaleRefundStatus =
          totalRefundedQty <= 0
            ? "NOT_REFUNDED"
            : totalRefundedQty >= totalSoldQty
              ? "REFUNDED"
              : "PARTIALLY_REFUNDED";
        return {
          id: sale.id,
          unitId: sale.unitId,
          soldAt: sale.soldAt,
          clientId: sale.clientId ?? undefined,
          clientName: sale.client?.fullName,
          professionalId: sale.professionalId ?? undefined,
          professionalName: sale.professional?.name,
          grossAmount: asNumber(sale.grossAmount),
          items,
          totalRefundedAmount: Number(totalRefundedAmount.toFixed(2)),
          status,
          createdAt: sale.createdAt,
        };
      })
      .filter((sale) => !input.status || sale.status === input.status);

    return { sales: rows, summary: { total: rows.length, limit } };
  }

  async checkoutAppointment(input: {
    appointmentId: string;
    unitId?: string;
    changedBy: string;
    completedAt: Date;
    paymentMethod: string;
    expectedTotal?: number;
    notes?: string;
    products?: Array<{
      productId: string;
      quantity: number;
    }>;
    idempotencyKey?: string;
    idempotencyPayloadHash?: string;
    audit?: TransactionalAuditContext;
  }) {
    const row = await this.prisma.appointment.findUnique({
      where: { id: input.appointmentId },
      include: {
        service: true,
        professional: { include: { commissionRules: true } },
        client: true,
      },
    });
    if (!row) throw new Error("Agendamento nao encontrado");
    if (input.unitId && row.unitId !== input.unitId) throw new Error("Unidade nao autorizada");

    const scope = this.buildIdempotencyScope({
      unitId: row.unitId,
      action: "APPOINTMENT_CHECKOUT",
      idempotencyKey: input.idempotencyKey,
      payloadHash: input.idempotencyPayloadHash,
      payload: input,
    });
    if (scope) {
      const replay = await this.getReplayResult<any>(scope);
      if (replay) return replay;
    }
    const operationKey = this.scopedOperationKey(scope);
    const serviceEntryKey = operationKey ? `${operationKey}:service-revenue` : null;
    const productEntryKey = operationKey ? `${operationKey}:product-revenue` : null;
    const serviceCommissionKey = operationKey ? `${operationKey}:service-commission` : null;
    const productCommissionKey = operationKey ? `${operationKey}:product-commission` : null;
    const checkoutSaleKey = operationKey ? `${operationKey}:product-sale` : null;

    if (row.status === "COMPLETED") throw new Error("Atendimento ja finalizado");

    const paymentMethod = String(input.paymentMethod || "").trim();
    if (!paymentMethod) throw new Error("Metodo de pagamento obrigatorio");

    const groupedProducts = new Map<string, number>();
    const rawCheckoutProducts = Array.isArray(input.products)
      ? input.products.filter((item) => item && item.productId && item.quantity > 0)
      : [];
    for (const item of rawCheckoutProducts) {
      const productId = String(item.productId || "").trim();
      if (!productId) continue;
      groupedProducts.set(productId, (groupedProducts.get(productId) ?? 0) + Math.trunc(Number(item.quantity) || 0));
    }
    const checkoutProducts = Array.from(groupedProducts.entries())
      .map(([productId, quantity]) => ({ productId, quantity }))
      .filter((item) => item.quantity > 0);
    const completedAt = input.completedAt;
    const notes = String(input.notes || "").trim() || undefined;

    const appointment = this.mapAppointment(row);
    const service = this.mapService(row.service);
    const professional = this.mapProfessional(row.professional);
    const range = monthRange(completedAt);
    const serviceIncomeAgg = await this.prisma.financialEntry.aggregate({
      where: {
        unitId: appointment.unitId,
        kind: "INCOME",
        source: "SERVICE",
        occurredAt: { gte: range.start, lt: range.end },
      },
      _sum: { amount: true },
    });
    const serviceResult = this.engine.completeAppointment({
      appointment,
      service,
      professional,
      monthlyProducedValue: asNumber(serviceIncomeAgg._sum.amount),
      changedBy: input.changedBy,
      completedAt,
    });
    serviceResult.revenue.paymentMethod = paymentMethod;
    if (notes) serviceResult.revenue.notes = notes;

    let saleResult:
      | ReturnType<BarbershopEngine["registerProductSale"]>
      | undefined;
    if (checkoutProducts.length > 0) {
      const productsRows = await this.prisma.product.findMany({
        where: {
          id: { in: checkoutProducts.map((item) => item.productId) },
          businessId: appointment.unitId,
          active: true,
        },
      });
      if (productsRows.length !== checkoutProducts.length) {
        throw new Error("Produto nao encontrado ou inativo");
      }
      const products = productsRows.map((item) => this.mapProduct(item));
      const sale: ProductSale = {
        id: crypto.randomUUID(),
        unitId: appointment.unitId,
        clientId: appointment.clientId,
        professionalId: appointment.professionalId,
        soldAt: completedAt,
        grossAmount: 0,
        items: checkoutProducts.map((item) => {
          const product = products.find((rowItem) => rowItem.id === item.productId);
          if (!product) throw new Error(`Produto ${item.productId} nao encontrado`);
          return {
            productId: product.id,
            quantity: item.quantity,
            unitPrice: product.salePrice,
            unitCost: product.costPrice,
          };
        }),
      };
      saleResult = this.engine.registerProductSale({
        sale,
        products,
        professional,
      });
      saleResult.revenue.paymentMethod = paymentMethod;
      if (notes) saleResult.revenue.notes = notes;
    }

    if (input.expectedTotal != null) {
      const expectedTotal = Number(input.expectedTotal);
      const computedTotal = Number(
        ((serviceResult.revenue.amount ?? 0) + (saleResult?.revenue.amount ?? 0)).toFixed(2),
      );
      if (!Number.isFinite(expectedTotal) || Math.abs(computedTotal - expectedTotal) > 0.01) {
        throw new Error(
          `Total inconsistente no checkout. Esperado=${expectedTotal.toFixed(2)}, calculado=${computedTotal.toFixed(2)}`,
        );
      }
    }

    let checkoutResponse: any;

    try {
      await this.prisma.$transaction(async (tx) => {
      if (scope) {
        await tx.idempotencyRecord.create({
          data: {
            id: crypto.randomUUID(),
            unitId: scope.unitId,
            action: scope.action,
            idempotencyKey: scope.idempotencyKey!,
            payloadHash: scope.payloadHash,
            status: "IN_PROGRESS",
          },
        });
      }

      const appointmentUpdate = await tx.appointment.updateMany({
        where: { id: appointment.id, status: { not: "COMPLETED" } },
        data: { status: "COMPLETED" },
      });
      if (appointmentUpdate.count !== 1) {
        throw new Error("Conflito: atendimento ja foi finalizado");
      }
      await tx.appointmentHistory.create({
        data: {
          id: crypto.randomUUID(),
          appointmentId: appointment.id,
          changedAt: completedAt,
          changedBy: input.changedBy,
          action: "COMPLETED",
          reason: "Checkout unificado",
        },
      });

      await tx.financialEntry.create({
        data: {
          id: serviceResult.revenue.id,
          unitId: serviceResult.revenue.unitId,
          kind: serviceResult.revenue.kind,
          source: serviceResult.revenue.source,
          category: serviceResult.revenue.category ?? "SERVICO",
          paymentMethod,
          amount: serviceResult.revenue.amount,
          occurredAt: serviceResult.revenue.occurredAt,
          referenceType: serviceResult.revenue.referenceType,
          referenceId: serviceResult.revenue.referenceId,
          professionalId: appointment.professionalId,
          customerId: appointment.clientId,
          description: serviceResult.revenue.description,
          notes: serviceResult.revenue.notes,
          idempotencyKey: serviceEntryKey,
        },
      });

      if (serviceResult.commission) {
        await tx.commissionEntry.create({
          data: {
            id: serviceResult.commission.id,
            professionalId: serviceResult.commission.professionalId,
            unitId: serviceResult.commission.unitId,
            appointmentId: serviceResult.commission.appointmentId,
            source: serviceResult.commission.source,
            baseAmount: serviceResult.commission.baseAmount,
            commissionRate: serviceResult.commission.commissionRate,
            commissionAmount: serviceResult.commission.commissionAmount,
            status: "PENDING",
            occurredAt: serviceResult.commission.occurredAt,
            ruleId: serviceResult.commission.ruleId,
            idempotencyKey: serviceCommissionKey,
          },
        });
      }

      if (saleResult) {
        await tx.productSale.create({
          data: {
            id: saleResult.sale.id,
            unitId: saleResult.sale.unitId,
            clientId: saleResult.sale.clientId,
            professionalId: saleResult.sale.professionalId,
            grossAmount: saleResult.sale.grossAmount,
            soldAt: saleResult.sale.soldAt,
            idempotencyKey: checkoutSaleKey,
            items: {
              create: saleResult.sale.items.map((item) => ({
                id: crypto.randomUUID(),
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                unitCost: item.unitCost,
              })),
            },
          },
        });

        await tx.financialEntry.create({
          data: {
            id: saleResult.revenue.id,
            unitId: saleResult.revenue.unitId,
            kind: saleResult.revenue.kind,
            source: saleResult.revenue.source,
            category: saleResult.revenue.category ?? "PRODUTO",
            paymentMethod,
            amount: saleResult.revenue.amount,
            occurredAt: saleResult.revenue.occurredAt,
            referenceType: saleResult.revenue.referenceType,
            referenceId: saleResult.revenue.referenceId,
            professionalId: appointment.professionalId,
            customerId: appointment.clientId,
            description: saleResult.revenue.description,
            notes: saleResult.revenue.notes,
            idempotencyKey: productEntryKey,
          },
        });

        for (const movement of saleResult.stockMovements) {
          const currentProduct = await tx.product.findUnique({
            where: { id: movement.productId },
            select: { stockQty: true, name: true },
          });
          if (!currentProduct) throw new Error("Produto nao encontrado ou inativo");
          if (currentProduct.stockQty < movement.quantity) {
            throw new Error(
              `Estoque insuficiente para ${currentProduct.name}. Disponivel=${currentProduct.stockQty}, solicitado=${movement.quantity}`,
            );
          }
          await tx.stockMovement.create({
            data: {
              id: movement.id,
              unitId: movement.unitId,
              productId: movement.productId,
              movementType: movement.movementType,
              quantity: movement.quantity,
              occurredAt: movement.occurredAt,
              referenceType: movement.referenceType,
              referenceId: movement.referenceId,
            },
          });
          const stockUpdate = await tx.product.updateMany({
            where: {
              id: movement.productId,
              businessId: appointment.unitId,
              stockQty: { gte: movement.quantity },
            },
            data: {
              stockQty: {
                decrement: movement.quantity,
              },
            },
          });
          if (stockUpdate.count !== 1) {
            throw new Error("Estoque insuficiente para venda de produto");
          }
        }

        if (saleResult.commission) {
          await tx.commissionEntry.create({
            data: {
              id: saleResult.commission.id,
              professionalId: saleResult.commission.professionalId,
              unitId: saleResult.commission.unitId,
              appointmentId: saleResult.commission.appointmentId,
              productSaleId: saleResult.commission.productSaleId,
              source: saleResult.commission.source,
              baseAmount: saleResult.commission.baseAmount,
              commissionRate: saleResult.commission.commissionRate,
              commissionAmount: saleResult.commission.commissionAmount,
              status: "PENDING",
              occurredAt: saleResult.commission.occurredAt,
              ruleId: saleResult.commission.ruleId,
              idempotencyKey: productCommissionKey,
            },
          });
        }
      }

      await tx.client.update({
        where: { id: appointment.clientId },
        data: { notes: row.client.notes ?? null },
      });
      const clientCompletedAppointments = await tx.appointment.findMany({
        where: {
          unitId: appointment.unitId,
          clientId: appointment.clientId,
          status: "COMPLETED",
        },
        orderBy: { endsAt: "desc" },
        select: { endsAt: true },
      });
      const clientTotalSpentAgg = await tx.financialEntry.aggregate({
        where: {
          unitId: appointment.unitId,
          customerId: appointment.clientId,
          kind: "INCOME",
        },
        _sum: { amount: true },
      });
      const window90 = new Date(completedAt.getTime() - 90 * 24 * 60 * 60 * 1000);
      const visits90d = clientCompletedAppointments.filter((item) => item.endsAt >= window90).length;

      checkoutResponse = {
        appointment: serviceResult.appointment,
        serviceRevenue: serviceResult.revenue,
        productRevenue: saleResult?.revenue,
        sale: saleResult?.sale,
        stockMovements: saleResult?.stockMovements ?? [],
        commissions: [serviceResult.commission, saleResult?.commission].filter(Boolean),
        clientMetrics: {
          lastVisitAt: clientCompletedAppointments[0]?.endsAt ?? completedAt,
          totalSpent: Number(asNumber(clientTotalSpentAgg._sum.amount).toFixed(2)),
          frequency90d: visits90d,
        },
      };

      await this.recordCriticalAudit(
        tx,
        input.audit
          ? {
              ...input.audit,
              unitId: appointment.unitId,
              action: "APPOINTMENT_CHECKOUT_COMPLETED",
              entity: "appointment_checkout",
              entityId: appointment.id,
              after: {
                productItems: checkoutProducts.reduce(
                  (acc, item) => acc + Number(item.quantity || 0),
                  0,
                ),
                paymentMethod,
                totalService: Number(serviceResult.revenue.amount ?? 0),
                totalProduct: Number(saleResult?.revenue.amount ?? 0),
                clientFrequency90d: visits90d,
              },
            }
          : undefined,
      );

      if (scope) {
        await tx.idempotencyRecord.update({
          where: {
            unitId_action_idempotencyKey: {
              unitId: scope.unitId,
              action: scope.action,
              idempotencyKey: scope.idempotencyKey!,
            },
          },
          data: {
            status: "SUCCEEDED",
            responseJson: toJsonValue(checkoutResponse) as Prisma.InputJsonValue,
            resolution: appointment.id,
          },
        });
      }
    });
    } catch (error) {
      return await this.replayAfterUniqueConflict<typeof checkoutResponse>(error, scope);
    }

    return checkoutResponse!;
  }

  async refundAppointment(input: {
    appointmentId: string;
    unitId: string;
    changedBy: string;
    reason: string;
    refundedAt: Date;
    idempotencyKey?: string;
    idempotencyPayloadHash?: string;
    audit?: TransactionalAuditContext;
  }) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: input.appointmentId },
      select: {
        id: true,
        unitId: true,
        status: true,
        professionalId: true,
        clientId: true,
      },
    });
    if (!appointment) throw new Error("Agendamento nao encontrado");
    if (appointment.unitId !== input.unitId) throw new Error("Unidade nao autorizada");

    const scope = this.buildIdempotencyScope({
      unitId: input.unitId,
      action: "APPOINTMENT_REFUND",
      idempotencyKey: input.idempotencyKey,
      payloadHash: input.idempotencyPayloadHash,
      payload: input,
    });
    if (scope) {
      const replay = await this.getReplayResult<{
        refund: Refund;
        financialEntry: FinancialEntry;
        stockMovements: unknown[];
      }>(scope);
      if (replay) return replay;
    }
    const operationKey = this.scopedOperationKey(scope);

    const reason = String(input.reason ?? "").trim();
    if (!reason) throw new Error("Motivo do estorno e obrigatorio");
    if (!(input.refundedAt instanceof Date) || Number.isNaN(input.refundedAt.getTime())) {
      throw new Error("Data do estorno invalida");
    }
    if (appointment.status !== "COMPLETED") {
      throw new Error("Atendimento nao concluido nao pode ser estornado");
    }

    let response:
      | {
          refund: Refund;
          financialEntry: FinancialEntry;
          stockMovements: unknown[];
        }
      | undefined;

    try {
      await this.prisma.$transaction(async (tx) => {
        if (scope) {
          await tx.idempotencyRecord.create({
            data: {
              id: crypto.randomUUID(),
              unitId: scope.unitId,
              action: scope.action,
              idempotencyKey: scope.idempotencyKey!,
              payloadHash: scope.payloadHash,
              status: "IN_PROGRESS",
            },
          });
        }

        const originalRevenue = await tx.financialEntry.findFirst({
          where: {
            unitId: input.unitId,
            kind: "INCOME",
            source: "SERVICE",
            referenceType: "APPOINTMENT",
            referenceId: appointment.id,
          },
          select: { amount: true },
        });
        if (!originalRevenue) throw new Error("Receita original do atendimento nao encontrada");

        const existingRefund = await tx.refund.findFirst({
          where: { unitId: input.unitId, appointmentId: appointment.id },
          select: { id: true },
        });
        if (existingRefund) throw new Error("Atendimento ja estornado");

        const refund: Refund = {
          id: crypto.randomUUID(),
          unitId: input.unitId,
          appointmentId: appointment.id,
          totalAmount: Number(asNumber(originalRevenue.amount).toFixed(2)),
          reason,
          refundedAt: input.refundedAt,
          changedBy: input.changedBy,
          idempotencyKey: operationKey ?? undefined,
          createdAt: input.refundedAt,
          items: [],
        };
        const financialEntry = buildServiceRefundExpenseEntry({
          unitId: input.unitId,
          refundId: refund.id,
          appointmentId: appointment.id,
          professionalId: appointment.professionalId,
          customerId: appointment.clientId,
          amount: refund.totalAmount,
          occurredAt: input.refundedAt,
          reason,
        });

        await tx.refund.create({
          data: {
            id: refund.id,
            unitId: refund.unitId,
            appointmentId: refund.appointmentId,
            totalAmount: refund.totalAmount,
            reason: refund.reason,
            refundedAt: refund.refundedAt,
            changedBy: refund.changedBy,
            idempotencyKey: operationKey,
          },
        });
        await tx.financialEntry.create({
          data: {
            id: financialEntry.id,
            unitId: financialEntry.unitId,
            kind: financialEntry.kind,
            source: "REFUND",
            category: financialEntry.category,
            amount: financialEntry.amount,
            occurredAt: financialEntry.occurredAt,
            referenceType: financialEntry.referenceType,
            referenceId: financialEntry.referenceId,
            professionalId: financialEntry.professionalId,
            customerId: financialEntry.customerId,
            description: financialEntry.description,
            notes: financialEntry.notes,
            idempotencyKey: operationKey ? `${operationKey}:financial` : null,
          },
        });
        await tx.appointmentHistory.create({
          data: {
            id: crypto.randomUUID(),
            appointmentId: appointment.id,
            changedAt: input.refundedAt,
            changedBy: input.changedBy,
            action: "REFUNDED",
            reason,
          },
        });

        response = { refund, financialEntry, stockMovements: [] };
        await this.recordCriticalAudit(
          tx,
          input.audit
            ? {
                ...input.audit,
                unitId: input.unitId,
                action: "APPOINTMENT_REFUNDED",
                entity: "appointment_refund",
                entityId: refund.id,
                after: {
                  appointmentId: appointment.id,
                  amount: financialEntry.amount,
                  reason,
                },
              }
            : undefined,
        );
        if (scope) {
          await tx.idempotencyRecord.update({
            where: {
              unitId_action_idempotencyKey: {
                unitId: scope.unitId,
                action: scope.action,
                idempotencyKey: scope.idempotencyKey!,
              },
            },
            data: {
              status: "SUCCEEDED",
              responseJson: toJsonValue(response) as Prisma.InputJsonValue,
              resolution: refund.id,
            },
          });
        }
      });
    } catch (error) {
      return await this.replayAfterUniqueConflict<typeof response>(error, scope);
    }

    return response!;
  }

  async refundProductSale(input: {
    productSaleId: string;
    unitId: string;
    changedBy: string;
    reason: string;
    refundedAt: Date;
    items: Array<{
      productId: string;
      quantity: number;
    }>;
    idempotencyKey?: string;
    idempotencyPayloadHash?: string;
    audit?: TransactionalAuditContext;
  }) {
    const sale = await this.prisma.productSale.findFirst({
      where: { id: input.productSaleId, unitId: input.unitId },
      include: { items: true },
    });
    if (!sale) throw new Error("Venda de produto nao encontrada");

    const scope = this.buildIdempotencyScope({
      unitId: input.unitId,
      action: "PRODUCT_SALE_REFUND",
      idempotencyKey: input.idempotencyKey,
      payloadHash: input.idempotencyPayloadHash,
      payload: input,
    });
    if (scope) {
      const replay = await this.getReplayResult<{
        refund: Refund;
        financialEntry: FinancialEntry;
        stockMovements: unknown[];
      }>(scope);
      if (replay) return replay;
    }
    const operationKey = this.scopedOperationKey(scope);

    const reason = String(input.reason ?? "").trim();
    if (!reason) throw new Error("Motivo da devolucao e obrigatorio");
    if (!(input.refundedAt instanceof Date) || Number.isNaN(input.refundedAt.getTime())) {
      throw new Error("Data da devolucao invalida");
    }
    const requested = new Map<string, number>();
    for (const item of input.items ?? []) {
      const productId = String(item.productId ?? "").trim();
      const quantity = Math.trunc(Number(item.quantity ?? 0));
      if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
        throw new Error("Itens da devolucao invalidos");
      }
      requested.set(productId, (requested.get(productId) ?? 0) + quantity);
    }
    if (requested.size === 0) throw new Error("Informe ao menos um item para devolucao");

    let response:
      | {
          refund: Refund;
          financialEntry: FinancialEntry;
          stockMovements: ReturnType<typeof buildStockMovementsFromProductRefund>;
        }
      | undefined;

    try {
      await this.prisma.$transaction(async (tx) => {
        if (scope) {
          await tx.idempotencyRecord.create({
            data: {
              id: crypto.randomUUID(),
              unitId: scope.unitId,
              action: scope.action,
              idempotencyKey: scope.idempotencyKey!,
              payloadHash: scope.payloadHash,
              status: "IN_PROGRESS",
            },
          });
        }

        await tx.$queryRaw`
          SELECT "id"
          FROM "ProductSale"
          WHERE "id" = ${input.productSaleId}
            AND "unitId" = ${input.unitId}
          FOR UPDATE
        `;

        const currentSale = await tx.productSale.findFirst({
          where: { id: input.productSaleId, unitId: input.unitId },
          include: { items: true },
        });
        if (!currentSale) throw new Error("Venda de produto nao encontrada");

        const soldByProduct = new Map<string, { quantity: number; unitPrice: number }>();
        for (const item of currentSale.items) {
          const current = soldByProduct.get(item.productId) ?? {
            quantity: 0,
            unitPrice: asNumber(item.unitPrice),
          };
          current.quantity += item.quantity;
          current.unitPrice = asNumber(item.unitPrice);
          soldByProduct.set(item.productId, current);
        }

        const previousRefunds = await tx.refund.findMany({
          where: { unitId: input.unitId, productSaleId: input.productSaleId },
          include: { items: true },
        });
        const refundedByProduct = new Map<string, number>();
        for (const refund of previousRefunds) {
          for (const item of refund.items) {
            refundedByProduct.set(
              item.productId,
              (refundedByProduct.get(item.productId) ?? 0) + item.quantity,
            );
          }
        }

        const refundId = crypto.randomUUID();
        const refundItems: NonNullable<Refund["items"]> = [];
        let totalAmount = 0;
        for (const [productId, quantity] of requested.entries()) {
          const sold = soldByProduct.get(productId);
          if (!sold) throw new Error(`Produto ${productId} nao pertence a venda`);
          const alreadyRefunded = refundedByProduct.get(productId) ?? 0;
          if (alreadyRefunded + quantity > sold.quantity) {
            throw new Error("Quantidade devolvida maior que quantidade vendida");
          }
          const amount = Number((sold.unitPrice * quantity).toFixed(2));
          totalAmount += amount;
          refundItems.push({
            id: crypto.randomUUID(),
            refundId,
            productId,
            quantity,
            unitPrice: sold.unitPrice,
            amount,
          });
        }

        const refund: Refund = {
          id: refundId,
          unitId: input.unitId,
          productSaleId: input.productSaleId,
          totalAmount: Number(totalAmount.toFixed(2)),
          reason,
          refundedAt: input.refundedAt,
          changedBy: input.changedBy,
          idempotencyKey: operationKey ?? undefined,
          createdAt: input.refundedAt,
          items: refundItems,
        };
        const financialEntry = buildProductRefundExpenseEntry({
          unitId: input.unitId,
          refundId: refund.id,
          productSaleId: input.productSaleId,
          professionalId: currentSale.professionalId ?? undefined,
          customerId: currentSale.clientId ?? undefined,
          amount: refund.totalAmount,
          occurredAt: input.refundedAt,
          reason,
        });
        const stockMovements = buildStockMovementsFromProductRefund({
          unitId: input.unitId,
          refundId: refund.id,
          occurredAt: input.refundedAt,
          items: refundItems,
        });

        await tx.refund.create({
          data: {
            id: refund.id,
            unitId: refund.unitId,
            productSaleId: refund.productSaleId,
            totalAmount: refund.totalAmount,
            reason: refund.reason,
            refundedAt: refund.refundedAt,
            changedBy: refund.changedBy,
            idempotencyKey: operationKey,
            items: {
              create: refundItems.map((item) => ({
                id: item.id,
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                amount: item.amount,
              })),
            },
          },
        });
        await tx.financialEntry.create({
          data: {
            id: financialEntry.id,
            unitId: financialEntry.unitId,
            kind: financialEntry.kind,
            source: "REFUND",
            category: financialEntry.category,
            amount: financialEntry.amount,
            occurredAt: financialEntry.occurredAt,
            referenceType: financialEntry.referenceType,
            referenceId: financialEntry.referenceId,
            professionalId: financialEntry.professionalId,
            customerId: financialEntry.customerId,
            description: financialEntry.description,
            notes: financialEntry.notes,
            idempotencyKey: operationKey ? `${operationKey}:financial` : null,
          },
        });
        for (const movement of stockMovements) {
          await tx.stockMovement.create({
            data: {
              id: movement.id,
              unitId: movement.unitId,
              productId: movement.productId,
              movementType: movement.movementType,
              quantity: movement.quantity,
              occurredAt: movement.occurredAt,
              referenceType: movement.referenceType,
              referenceId: movement.referenceId,
            },
          });
          const updatedProduct = await tx.product.updateMany({
            where: { id: movement.productId, businessId: input.unitId },
            data: { stockQty: { increment: movement.quantity } },
          });
          if (updatedProduct.count !== 1) {
            throw new Error("Produto da devolucao nao pertence a unidade");
          }
        }

        response = { refund, financialEntry, stockMovements };
        await this.recordCriticalAudit(
          tx,
          input.audit
            ? {
                ...input.audit,
                unitId: input.unitId,
                action: "PRODUCT_SALE_REFUNDED",
                entity: "product_sale_refund",
                entityId: refund.id,
                after: {
                  productSaleId: input.productSaleId,
                  amount: financialEntry.amount,
                  items: refundItems.length,
                },
              }
            : undefined,
        );
        if (scope) {
          await tx.idempotencyRecord.update({
            where: {
              unitId_action_idempotencyKey: {
                unitId: scope.unitId,
                action: scope.action,
                idempotencyKey: scope.idempotencyKey!,
              },
            },
            data: {
              status: "SUCCEEDED",
              responseJson: toJsonValue(response) as Prisma.InputJsonValue,
              resolution: refund.id,
            },
          });
        }
      });
    } catch (error) {
      return await this.replayAfterUniqueConflict<typeof response>(error, scope);
    }

    return response!;
  }

  async registerManualFinancialEntry(input: {
    unitId: string;
    kind: "INCOME" | "EXPENSE";
    amount: number;
    occurredAt: Date;
    description: string;
    changedBy: string;
    idempotencyKey?: string;
    idempotencyPayloadHash?: string;
    audit?: TransactionalAuditContext;
  }) {
    const created = await this.createFinancialTransaction({
      unitId: input.unitId,
      type: input.kind,
      amount: input.amount,
      date: input.occurredAt,
      category: input.kind === "EXPENSE" ? "OPERACIONAL" : "RECEITA_MANUAL",
      description: input.description,
      source: "MANUAL",
      changedBy: input.changedBy,
      idempotencyKey: input.idempotencyKey,
      idempotencyPayloadHash: input.idempotencyPayloadHash,
      audit: input.audit,
      auditAction: "FINANCIAL_MANUAL_ENTRY_REGISTERED",
      auditEntity: "financial_entry",
    });

    return {
      id: created.id,
      unitId: created.unitId,
      kind: created.kind,
      source: created.source ?? undefined,
      amount: asNumber(created.amount),
      occurredAt: created.occurredAt,
      referenceType: created.referenceType,
      referenceId: created.referenceId ?? undefined,
      description: created.description,
    };
  }

  async registerStockManualMovement(input: {
    unitId: string;
    productId: string;
    movementType: "IN" | "OUT" | "LOSS" | "INTERNAL_USE";
    quantity: number;
    occurredAt: Date;
    referenceType?: "ADJUSTMENT" | "INTERNAL";
    referenceId?: string;
  }) {
    const quantity = Math.trunc(Number(input.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Quantidade invalida para movimentacao de estoque");
    }

    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, businessId: input.unitId },
      select: {
        id: true,
        name: true,
        stockQty: true,
        active: true,
      },
    });
    if (!product || !product.active) {
      throw new Error("Produto nao encontrado ou inativo");
    }
    if (input.movementType !== "IN" && product.stockQty < quantity) {
      throw new Error("Saldo insuficiente para movimentacao de saida");
    }

    const movement = await this.prisma.$transaction(async (tx) => {
      const createdMovement = await tx.stockMovement.create({
        data: {
          id: crypto.randomUUID(),
          unitId: input.unitId,
          productId: input.productId,
          movementType: input.movementType,
          quantity,
          occurredAt: input.occurredAt,
          referenceType: input.referenceType ?? "ADJUSTMENT",
          referenceId: input.referenceId,
        },
      });

      const updated = await tx.product.updateMany({
        where: { id: input.productId, businessId: input.unitId },
        data:
          input.movementType === "IN"
            ? {
                stockQty: {
                  increment: quantity,
                },
              }
            : {
                stockQty: {
                  decrement: quantity,
                },
              },
      });
      if (updated.count !== 1) throw new Error("Produto nao encontrado ou inativo");
      return createdMovement;
    });

    const updatedProduct = await this.prisma.product.findFirst({
      where: { id: input.productId, businessId: input.unitId },
      select: {
        id: true,
        name: true,
        stockQty: true,
      },
    });

    return {
      movement: {
        id: movement.id,
        unitId: movement.unitId,
        productId: movement.productId,
        movementType: movement.movementType,
        quantity: movement.quantity,
        occurredAt: movement.occurredAt,
        referenceType: movement.referenceType,
        referenceId: movement.referenceId ?? undefined,
      },
      product: {
        id: updatedProduct?.id ?? input.productId,
        name: updatedProduct?.name ?? "Produto",
        stockQty: updatedProduct?.stockQty ?? 0,
      },
    };
  }

  async getFinancialEntries(input: {
    unitId: string;
    start: Date;
    end: Date;
    kind?: "INCOME" | "EXPENSE";
  }) {
    const result = await this.getFinancialTransactions({
      unitId: input.unitId,
      start: input.start,
      end: input.end,
      type: input.kind,
      limit: 1000,
    });
    return {
      entries: result.transactions.map((row) => ({
        id: row.id,
        unitId: row.businessId,
        kind: row.type,
        source:
          row.source === "SERVICE" ||
          row.source === "PRODUCT" ||
          row.source === "COMMISSION" ||
          row.source === "REFUND"
            ? row.source
            : undefined,
        amount: row.amount,
        occurredAt: new Date(row.date),
        referenceType: row.referenceType,
        referenceId: row.referenceId ?? undefined,
        description: row.description,
      })),
      summary: {
        income: result.summary.income,
        expense: result.summary.expense,
        net: result.summary.net,
      },
    };
  }

  async getFinancialSummary(input: {
    unitId: string;
    start: Date;
    end: Date;
    compareStart?: Date;
    compareEnd?: Date;
  }) {
    const currentStart = new Date(input.start);
    const currentEnd = new Date(input.end);
    const compareRange = this.resolveComparisonRange({
      start: currentStart,
      end: currentEnd,
      compareStart: input.compareStart,
      compareEnd: input.compareEnd,
    });

    const summarize = async (start: Date, end: Date) => {
      const [
        incomeAgg,
        expenseAgg,
        commissionsPendingAgg,
        commissionsTotalAgg,
        completedCount,
      ] = await Promise.all([
        this.prisma.financialEntry.aggregate({
          where: { unitId: input.unitId, kind: "INCOME", occurredAt: { gte: start, lte: end } },
          _sum: { amount: true },
        }),
        this.prisma.financialEntry.aggregate({
          where: { unitId: input.unitId, kind: "EXPENSE", occurredAt: { gte: start, lte: end } },
          _sum: { amount: true },
        }),
        this.prisma.commissionEntry.aggregate({
          where: {
            unitId: input.unitId,
            occurredAt: { gte: start, lte: end },
            status: "PENDING",
          },
          _sum: { commissionAmount: true },
        }),
        this.prisma.commissionEntry.aggregate({
          where: {
            unitId: input.unitId,
            occurredAt: { gte: start, lte: end },
            status: "PENDING",
          },
          _sum: { commissionAmount: true },
        }),
        this.prisma.appointment.count({
          where: {
            unitId: input.unitId,
            status: "COMPLETED",
            startsAt: { gte: start, lte: end },
          },
        }),
      ]);
      const income = asNumber(incomeAgg._sum.amount);
      const expenses = asNumber(expenseAgg._sum.amount);
      const pendingCommissions = asNumber(commissionsPendingAgg._sum.commissionAmount);
      const totalCommissions = asNumber(commissionsTotalAgg._sum.commissionAmount);
      const net = income - expenses;
      return {
        income: Number(income.toFixed(2)),
        expenses: Number(expenses.toFixed(2)),
        net: Number(net.toFixed(2)),
        estimatedProfit: Number((income - expenses - totalCommissions).toFixed(2)),
        pendingCommissions: Number(pendingCommissions.toFixed(2)),
        ticketAverage: Number((completedCount > 0 ? income / completedCount : 0).toFixed(2)),
      };
    };

    const [current, previous] = await Promise.all([
      summarize(currentStart, currentEnd),
      summarize(compareRange.start, compareRange.end),
    ]);

    return {
      period: {
        start: currentStart.toISOString(),
        end: currentEnd.toISOString(),
        compareStart: compareRange.start.toISOString(),
        compareEnd: compareRange.end.toISOString(),
      },
      summary: {
        grossRevenue: current.income,
        expenses: current.expenses,
        estimatedProfit: current.estimatedProfit,
        netBalance: current.net,
        pendingCommissions: current.pendingCommissions,
        ticketAverage: current.ticketAverage,
      },
      cashFlow: {
        incoming: current.income,
        outgoing: current.expenses,
        balance: current.net,
      },
      comparison: {
        grossRevenueDelta: Number((current.income - previous.income).toFixed(2)),
        expensesDelta: Number((current.expenses - previous.expenses).toFixed(2)),
        estimatedProfitDelta: Number((current.estimatedProfit - previous.estimatedProfit).toFixed(2)),
        netBalanceDelta: Number((current.net - previous.net).toFixed(2)),
      },
    };
  }

  async getFinancialTransactions(input: {
    unitId: string;
    start: Date;
    end: Date;
    type?: "INCOME" | "EXPENSE";
    category?: string;
    paymentMethod?: string;
    source?: string;
    professionalId?: string;
    customerId?: string;
    search?: string;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(input.limit ?? 300, 1), 1000);
    const where: Prisma.FinancialEntryWhereInput = {
      unitId: input.unitId,
      occurredAt: { gte: input.start, lte: input.end },
      ...(input.type ? { kind: input.type } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
      ...(input.professionalId ? { professionalId: input.professionalId } : {}),
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.source
        ? input.source.toUpperCase() === "MANUAL"
          ? { source: null }
          : {
              source:
                input.source.toUpperCase() === "SERVICE" ||
                input.source.toUpperCase() === "PRODUCT" ||
                input.source.toUpperCase() === "COMMISSION" ||
                input.source.toUpperCase() === "REFUND"
                  ? (input.source.toUpperCase() as "SERVICE" | "PRODUCT" | "COMMISSION" | "REFUND")
                  : undefined,
            }
        : {}),
      ...(input.search
        ? {
            OR: [
              { description: { contains: input.search, mode: "insensitive" } },
              { notes: { contains: input.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.financialEntry.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      take: limit,
    });

    const professionalIds = Array.from(
      new Set(rows.map((item) => item.professionalId).filter((item): item is string => Boolean(item))),
    );
    const customerIds = Array.from(
      new Set(rows.map((item) => item.customerId).filter((item): item is string => Boolean(item))),
    );
    const [professionals, customers] = await Promise.all([
      professionalIds.length
        ? this.prisma.professional.findMany({
            where: { id: { in: professionalIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      customerIds.length
        ? this.prisma.client.findMany({
            where: { id: { in: customerIds } },
            select: { id: true, fullName: true },
          })
        : Promise.resolve([]),
    ]);
    const professionalsById = new Map(professionals.map((item) => [item.id, item.name]));
    const customersById = new Map(customers.map((item) => [item.id, item.fullName]));

    const transactions = rows.map((row) => ({
      id: row.id,
      businessId: row.unitId,
      type: row.kind,
      category: row.category ?? "GERAL",
      description: row.description,
      amount: Number(asNumber(row.amount).toFixed(2)),
      paymentMethod: row.paymentMethod ?? null,
      source: normalizeTransactionSource(row.source),
      appointmentId: row.referenceType === "APPOINTMENT" ? row.referenceId ?? null : null,
      productSaleId: row.referenceType === "PRODUCT_SALE" ? row.referenceId ?? null : null,
      commissionId: row.referenceType === "COMMISSION" ? row.referenceId ?? null : null,
      professionalId: row.professionalId ?? null,
      professionalName: row.professionalId ? professionalsById.get(row.professionalId) ?? null : null,
      customerId: row.customerId ?? null,
      customerName: row.customerId ? customersById.get(row.customerId) ?? null : null,
      date: row.occurredAt.toISOString(),
      notes: row.notes ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      referenceType: row.referenceType,
      referenceId: row.referenceId ?? null,
    }));

    const income = transactions
      .filter((item) => item.type === "INCOME")
      .reduce((acc, item) => acc + item.amount, 0);
    const expense = transactions
      .filter((item) => item.type === "EXPENSE")
      .reduce((acc, item) => acc + item.amount, 0);

    return {
      transactions,
      summary: {
        income: Number(income.toFixed(2)),
        expense: Number(expense.toFixed(2)),
        net: Number((income - expense).toFixed(2)),
      },
    };
  }

  async createFinancialTransaction(input: {
    unitId: string;
    type: "INCOME" | "EXPENSE";
    amount: number;
    date: Date;
    category: string;
    description: string;
    paymentMethod?: string;
    source?: string;
    appointmentId?: string;
    productSaleId?: string;
    professionalId?: string;
    customerId?: string;
    notes?: string;
    changedBy: string;
    idempotencyKey?: string;
    idempotencyPayloadHash?: string;
    audit?: TransactionalAuditContext;
    auditAction?: string;
    auditEntity?: string;
  }) {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error("Valor invalido para lancamento");
    }
    const description = String(input.description ?? "").trim();
    if (!description) throw new Error("Descricao obrigatoria");
    const category = String(input.category ?? "").trim();
    if (!category) throw new Error("Categoria obrigatoria");
    if (!(input.date instanceof Date) || Number.isNaN(input.date.getTime())) {
      throw new Error("Data obrigatoria");
    }

    const source = normalizeTransactionSource(input.source);
    const referenceType =
      input.appointmentId != null
        ? "APPOINTMENT"
        : input.productSaleId != null
          ? "PRODUCT_SALE"
          : "MANUAL";
    const referenceId = input.appointmentId ?? input.productSaleId ?? null;

    const scope = this.buildIdempotencyScope({
      unitId: input.unitId,
      action: "FINANCIAL_TRANSACTION_CREATE",
      idempotencyKey: input.idempotencyKey,
      payloadHash: input.idempotencyPayloadHash,
      payload: input,
    });
    if (scope) {
      const replay = await this.getReplayResult<Prisma.FinancialEntryGetPayload<object>>(scope);
      if (replay) return replay;
    }
    const operationKey = this.scopedOperationKey(scope);

    let created: Prisma.FinancialEntryGetPayload<object> | undefined;
    try {
      await this.prisma.$transaction(async (tx) => {
        if (scope) {
          await tx.idempotencyRecord.create({
            data: {
              id: crypto.randomUUID(),
              unitId: scope.unitId,
              action: scope.action,
              idempotencyKey: scope.idempotencyKey!,
              payloadHash: scope.payloadHash,
              status: "IN_PROGRESS",
            },
          });
        }

        created = await tx.financialEntry.create({
          data: {
            id: crypto.randomUUID(),
            unitId: input.unitId,
            kind: input.type,
            source:
              source === "SERVICE" ||
              source === "PRODUCT" ||
              source === "COMMISSION" ||
              source === "REFUND"
                ? (source as "SERVICE" | "PRODUCT" | "COMMISSION" | "REFUND")
                : null,
            category,
            paymentMethod: String(input.paymentMethod ?? "").trim() || null,
            amount: Number(input.amount.toFixed(2)),
            occurredAt: input.date,
            referenceType,
            referenceId,
            professionalId: String(input.professionalId ?? "").trim() || null,
            customerId: String(input.customerId ?? "").trim() || null,
            description,
            notes: String(input.notes ?? "").trim() || null,
            idempotencyKey: operationKey,
          },
        });

        await this.recordCriticalAudit(
          tx,
          input.audit
            ? {
                ...input.audit,
                unitId: input.unitId,
                action: input.auditAction ?? "FINANCIAL_TRANSACTION_CREATED",
                entity: input.auditEntity ?? "financial_transaction",
                entityId: created.id,
                after: {
                  type: created.kind,
                  amount: asNumber(created.amount),
                  category: created.category ?? undefined,
                },
              }
            : undefined,
        );

        if (scope) {
          await tx.idempotencyRecord.update({
            where: {
              unitId_action_idempotencyKey: {
                unitId: scope.unitId,
                action: scope.action,
                idempotencyKey: scope.idempotencyKey!,
              },
            },
            data: {
              status: "SUCCEEDED",
              responseJson: toJsonValue(created) as Prisma.InputJsonValue,
              resolution: created.id,
            },
          });
        }
      });
    } catch (error) {
      return await this.replayAfterUniqueConflict<Prisma.FinancialEntryGetPayload<object>>(error, scope);
    }

    return created!;
  }

  async updateFinancialTransaction(input: {
    unitId: string;
    id: string;
    type?: "INCOME" | "EXPENSE";
    amount?: number;
    date?: Date;
    category?: string;
    description?: string;
    paymentMethod?: string;
    professionalId?: string;
    customerId?: string;
    notes?: string;
    changedBy: string;
  }) {
    const current = await this.prisma.financialEntry.findFirst({
      where: { id: input.id, unitId: input.unitId },
    });
    if (!current) throw new Error("Lancamento nao encontrado");
    if (current.referenceType !== "MANUAL") {
      throw new Error("Somente lancamentos manuais podem ser editados");
    }
    if (input.amount != null && (!Number.isFinite(input.amount) || input.amount <= 0)) {
      throw new Error("Valor invalido para lancamento");
    }
    if (input.date != null && Number.isNaN(input.date.getTime())) {
      throw new Error("Data obrigatoria");
    }
    if (input.category != null && !String(input.category).trim()) {
      throw new Error("Categoria obrigatoria");
    }
    if (input.description != null && !String(input.description).trim()) {
      throw new Error("Descricao obrigatoria");
    }

    return await this.prisma.financialEntry.update({
      where: { id: input.id },
      data: {
        kind: input.type ?? undefined,
        amount: input.amount != null ? Number(input.amount.toFixed(2)) : undefined,
        occurredAt: input.date ?? undefined,
        category: input.category != null ? String(input.category).trim() : undefined,
        description:
          input.description != null ? String(input.description).trim() : undefined,
        paymentMethod:
          input.paymentMethod != null ? String(input.paymentMethod).trim() || null : undefined,
        professionalId:
          input.professionalId != null ? String(input.professionalId).trim() || null : undefined,
        customerId:
          input.customerId != null ? String(input.customerId).trim() || null : undefined,
        notes: input.notes != null ? String(input.notes).trim() || null : undefined,
      },
    });
  }

  async deleteFinancialTransaction(input: {
    unitId: string;
    id: string;
    changedBy: string;
  }) {
    const current = await this.prisma.financialEntry.findFirst({
      where: { id: input.id, unitId: input.unitId },
      select: { id: true, referenceType: true },
    });
    if (!current) throw new Error("Lancamento nao encontrado");
    if (current.referenceType !== "MANUAL") {
      throw new Error("Somente lancamentos manuais podem ser excluidos");
    }
    await this.prisma.financialEntry.delete({ where: { id: input.id } });
    return { deleted: true, id: input.id };
  }

  async getFinancialCommissions(input: {
    unitId: string;
    start: Date;
    end: Date;
    professionalId?: string;
    status?: "PENDING" | "PAID" | "CANCELED";
    limit?: number;
  }) {
    const limit = Math.min(Math.max(input.limit ?? 300, 1), 1000);
    const rows = await this.prisma.commissionEntry.findMany({
      where: {
        unitId: input.unitId,
        occurredAt: { gte: input.start, lte: input.end },
        ...(input.professionalId ? { professionalId: input.professionalId } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      orderBy: { occurredAt: "desc" },
      take: limit,
      include: {
        professional: {
          select: { id: true, name: true },
        },
      },
    });

    const entries = rows.map((item) => ({
      id: item.id,
      businessId: item.unitId,
      professionalId: item.professionalId,
      professionalName: item.professional.name,
      appointmentId: item.appointmentId ?? null,
      baseAmount: Number(asNumber(item.baseAmount).toFixed(2)),
      commissionRate:
        item.commissionRate == null
          ? null
          : Number((asNumber(item.commissionRate) * 100).toFixed(2)),
      commissionAmount: Number(asNumber(item.commissionAmount).toFixed(2)),
      status: (item.status as "PENDING" | "PAID" | "CANCELED") ?? "PENDING",
      createdAt: item.createdAt.toISOString(),
      paidAt: item.paidAt ? item.paidAt.toISOString() : null,
      source: item.source,
    }));

    const summary = entries.reduce(
      (acc, item) => {
        acc.total += item.commissionAmount;
        if (item.status === "PENDING") acc.pending += item.commissionAmount;
        if (item.status === "PAID") acc.paid += item.commissionAmount;
        if (item.status === "CANCELED") acc.canceled += item.commissionAmount;
        return acc;
      },
      { total: 0, pending: 0, paid: 0, canceled: 0 },
    );

    const byProfessional = new Map<
      string,
      { professionalId: string; professionalName: string; revenueGenerated: number; commissionAmount: number; pendingAmount: number }
    >();
    for (const item of entries) {
      const current = byProfessional.get(item.professionalId) ?? {
        professionalId: item.professionalId,
        professionalName: item.professionalName,
        revenueGenerated: 0,
        commissionAmount: 0,
        pendingAmount: 0,
      };
      current.revenueGenerated += item.baseAmount;
      current.commissionAmount += item.commissionAmount;
      if (item.status === "PENDING") current.pendingAmount += item.commissionAmount;
      byProfessional.set(item.professionalId, current);
    }

    return {
      entries,
      summary: {
        totalCommission: Number(summary.total.toFixed(2)),
        pendingCommission: Number(summary.pending.toFixed(2)),
        paidCommission: Number(summary.paid.toFixed(2)),
        canceledCommission: Number(summary.canceled.toFixed(2)),
      },
      byProfessional: Array.from(byProfessional.values())
        .map((item) => ({
          ...item,
          revenueGenerated: Number(item.revenueGenerated.toFixed(2)),
          commissionAmount: Number(item.commissionAmount.toFixed(2)),
          pendingAmount: Number(item.pendingAmount.toFixed(2)),
        }))
        .sort((a, b) => b.commissionAmount - a.commissionAmount),
    };
  }

  async markFinancialCommissionAsPaid(input: {
    unitId: string;
    id: string;
    paidAt?: Date;
    changedBy: string;
    idempotencyKey?: string;
    idempotencyPayloadHash?: string;
    audit?: TransactionalAuditContext;
  }) {
    const scope = this.buildIdempotencyScope({
      unitId: input.unitId,
      action: "COMMISSION_PAY",
      idempotencyKey: input.idempotencyKey,
      payloadHash: input.idempotencyPayloadHash,
      payload: input,
    });
    if (scope) {
      const replay = await this.getReplayResult<{
        id: string;
        status: string;
        paidAt: string;
        financialEntryId: string;
      }>(scope);
      if (replay) return replay;
    }

    const paidAt = input.paidAt ?? new Date();
    let result:
      | {
          id: string;
          status: string;
          paidAt: string;
          financialEntryId: string;
        }
      | undefined;
    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.commissionEntry.findFirst({
          where: { id: input.id, unitId: input.unitId },
          select: {
            id: true,
            unitId: true,
            professionalId: true,
            commissionAmount: true,
            status: true,
            paidAt: true,
          },
        });
        if (!current) throw new Error("Comissao nao encontrada");
        if (current.status === "CANCELED") {
          throw new Error("Comissao cancelada nao pode ser paga");
        }

        if (scope) {
          await tx.idempotencyRecord.create({
            data: {
              id: crypto.randomUUID(),
              unitId: scope.unitId,
              action: scope.action,
              idempotencyKey: scope.idempotencyKey!,
              payloadHash: scope.payloadHash,
              status: "IN_PROGRESS",
            },
          });
        }

        const effectivePaidAt = current.paidAt ?? paidAt;
        const updated =
          current.status === "PAID" && current.paidAt
            ? current
            : await tx.commissionEntry.update({
                where: { id: input.id },
                data: {
                  status: "PAID",
                  paidAt: effectivePaidAt,
                },
                select: {
                  id: true,
                  unitId: true,
                  professionalId: true,
                  commissionAmount: true,
                  status: true,
                  paidAt: true,
                },
              });

        const expenseInput = buildCommissionPaymentExpenseEntry({
          unitId: updated.unitId,
          commissionId: updated.id,
          professionalId: updated.professionalId,
          amount: asNumber(updated.commissionAmount),
          occurredAt: updated.paidAt ?? effectivePaidAt,
        });
        const expense = await tx.financialEntry.upsert({
          where: {
            unitId_referenceType_referenceId_source: {
              unitId: updated.unitId,
              referenceType: "COMMISSION",
              referenceId: updated.id,
              source: "COMMISSION",
            },
          },
          create: {
            id: expenseInput.id,
            unitId: expenseInput.unitId,
            kind: expenseInput.kind,
            source: "COMMISSION",
            category: expenseInput.category,
            amount: expenseInput.amount,
            occurredAt: expenseInput.occurredAt,
            referenceType: expenseInput.referenceType,
            referenceId: expenseInput.referenceId,
            professionalId: expenseInput.professionalId,
            description: expenseInput.description,
          },
          update: {},
          select: { id: true },
        });

        result = {
          id: updated.id,
          status: updated.status,
          paidAt: updated.paidAt?.toISOString() ?? effectivePaidAt.toISOString(),
          financialEntryId: expense.id,
        };

        await this.recordCriticalAudit(
          tx,
          input.audit
            ? {
                ...input.audit,
                unitId: input.unitId,
                action: "FINANCIAL_COMMISSION_MARKED_PAID",
                entity: "financial_commission",
                entityId: input.id,
                after: result,
              }
            : undefined,
        );

        if (scope) {
          await tx.idempotencyRecord.update({
            where: {
              unitId_action_idempotencyKey: {
                unitId: scope.unitId,
                action: scope.action,
                idempotencyKey: scope.idempotencyKey!,
              },
            },
            data: {
              status: "SUCCEEDED",
              responseJson: toJsonValue(result) as Prisma.InputJsonValue,
              resolution: input.id,
            },
          });
        }
      });
    } catch (error) {
      return await this.replayAfterUniqueConflict<typeof result>(error, scope);
    }

    return result!;
  }

  async getFinancialReports(input: {
    unitId: string;
    start: Date;
    end: Date;
  }) {
    const [transactionsPayload, overview, appointments] = await Promise.all([
      this.getFinancialTransactions({
        unitId: input.unitId,
        start: input.start,
        end: input.end,
        limit: 2000,
      }),
      this.getFinancialManagementOverview({
        unitId: input.unitId,
        start: input.start,
        end: input.end,
      }),
      this.prisma.appointment.findMany({
        where: {
          unitId: input.unitId,
          status: "COMPLETED",
          startsAt: { gte: input.start, lte: input.end },
        },
        select: {
          serviceId: true,
          service: { select: { name: true, price: true } },
        },
      }),
    ]);

    const revenueByProfessionalMap = new Map<string, { professionalId: string; professionalName: string; revenue: number }>();
    const revenueByPaymentMethodMap = new Map<string, { paymentMethod: string; revenue: number; transactions: number }>();
    const expenseByCategoryMap = new Map<string, { category: string; amount: number; transactions: number }>();
    const revenueByServiceMap = new Map<string, { serviceId: string; serviceName: string; revenue: number; appointments: number }>();

    for (const row of transactionsPayload.transactions) {
      if (row.type === "INCOME") {
        if (row.professionalId) {
          const current = revenueByProfessionalMap.get(row.professionalId) ?? {
            professionalId: row.professionalId,
            professionalName: row.professionalName ?? "Profissional",
            revenue: 0,
          };
          current.revenue += row.amount;
          revenueByProfessionalMap.set(row.professionalId, current);
        }
        const paymentMethod = row.paymentMethod ?? "NAO_INFORMADO";
        const currentPayment = revenueByPaymentMethodMap.get(paymentMethod) ?? {
          paymentMethod,
          revenue: 0,
          transactions: 0,
        };
        currentPayment.revenue += row.amount;
        currentPayment.transactions += 1;
        revenueByPaymentMethodMap.set(paymentMethod, currentPayment);
      } else {
        const category = row.category || "SEM_CATEGORIA";
        const currentExpense = expenseByCategoryMap.get(category) ?? {
          category,
          amount: 0,
          transactions: 0,
        };
        currentExpense.amount += row.amount;
        currentExpense.transactions += 1;
        expenseByCategoryMap.set(category, currentExpense);
      }
    }

    for (const row of appointments) {
      const current = revenueByServiceMap.get(row.serviceId) ?? {
        serviceId: row.serviceId,
        serviceName: row.service.name,
        revenue: 0,
        appointments: 0,
      };
      current.revenue += asNumber(row.service.price);
      current.appointments += 1;
      revenueByServiceMap.set(row.serviceId, current);
    }

    return {
      period: {
        start: input.start.toISOString(),
        end: input.end.toISOString(),
      },
      rankings: {
        revenueByProfessional: Array.from(revenueByProfessionalMap.values())
          .map((item) => ({ ...item, revenue: Number(item.revenue.toFixed(2)) }))
          .sort((a, b) => b.revenue - a.revenue),
        revenueByService: Array.from(revenueByServiceMap.values())
          .map((item) => ({ ...item, revenue: Number(item.revenue.toFixed(2)) }))
          .sort((a, b) => b.revenue - a.revenue),
        revenueByPaymentMethod: Array.from(revenueByPaymentMethodMap.values())
          .map((item) => ({ ...item, revenue: Number(item.revenue.toFixed(2)) }))
          .sort((a, b) => b.revenue - a.revenue),
        expenseByCategory: Array.from(expenseByCategoryMap.values())
          .map((item) => ({ ...item, amount: Number(item.amount.toFixed(2)) }))
          .sort((a, b) => b.amount - a.amount),
      },
      margin: {
        estimatedProfit: Number(overview.summary.current.operationalProfit.toFixed(2)),
        estimatedMarginPct: Number(overview.summary.current.operationalMarginPct.toFixed(1)),
        grossRevenue: Number(overview.summary.current.grossRevenue.toFixed(2)),
      },
    };
  }

  async getFinancialManagementOverview(input: {
    unitId: string;
    start: Date;
    end: Date;
    compareStart?: Date;
    compareEnd?: Date;
  }): Promise<FinancialManagementOverviewPayload> {
    const currentStart = new Date(input.start);
    const currentEnd = new Date(input.end);
    const compareRange = this.resolveComparisonRange({
      start: currentStart,
      end: currentEnd,
      compareStart: input.compareStart,
      compareEnd: input.compareEnd,
    });

    const [current, previous] = await Promise.all([
      this.buildFinancialManagementSnapshot({
        unitId: input.unitId,
        start: currentStart,
        end: currentEnd,
      }),
      this.buildFinancialManagementSnapshot({
        unitId: input.unitId,
        start: compareRange.start,
        end: compareRange.end,
      }),
    ]);

    const previousByProfessional = new Map(
      previous.professionals.map((item) => [item.professionalId, item]),
    );
    const professionals = current.professionals
      .map((item) => {
        const prev = previousByProfessional.get(item.professionalId);
        const deltaEstimatedProfit = item.estimatedProfit - (prev?.estimatedProfit ?? 0);
        const previousProfit = prev?.estimatedProfit ?? 0;
        const deltaEstimatedProfitPct =
          previousProfit > 0
            ? (deltaEstimatedProfit / previousProfit) * 100
            : item.estimatedProfit > 0
              ? 100
              : 0;
        return {
          ...item,
          previousEstimatedProfit: Number(previousProfit.toFixed(2)),
          previousGrossRevenue: Number((prev?.grossRevenue ?? 0).toFixed(2)),
          deltaEstimatedProfit: Number(deltaEstimatedProfit.toFixed(2)),
          deltaEstimatedProfitPct: Number(deltaEstimatedProfitPct.toFixed(1)),
        };
      })
      .sort((a, b) => b.estimatedProfit - a.estimatedProfit);

    const delta = this.computeFinancialSnapshotDelta(current.summary, previous.summary);

    const topProfitProfessional = professionals[0]
      ? {
          professionalId: professionals[0].professionalId,
          name: professionals[0].name,
          estimatedProfit: professionals[0].estimatedProfit,
        }
      : null;
    const topRevenueProfessional = [...professionals].sort(
      (a, b) => b.grossRevenue - a.grossRevenue,
    )[0];
    const lowestMarginProfessional = [...professionals].sort((a, b) => a.marginPct - b.marginPct)[0];

    return {
      period: {
        start: currentStart.toISOString(),
        end: currentEnd.toISOString(),
        compareStart: compareRange.start.toISOString(),
        compareEnd: compareRange.end.toISOString(),
      },
      summary: {
        current: current.summary,
        previous: previous.summary,
        delta,
      },
      breakdown: {
        totalCost: Number(
          (
            current.summary.serviceCost +
            current.summary.productCost +
            current.summary.operationalExpenses +
            current.summary.totalCommissions
          ).toFixed(2),
        ),
        costRatioPct: current.summary.grossRevenue
          ? Number(
              (
                ((current.summary.serviceCost +
                  current.summary.productCost +
                  current.summary.operationalExpenses +
                  current.summary.totalCommissions) /
                  current.summary.grossRevenue) *
                100
              ).toFixed(1),
            )
          : 0,
        profitRatioPct: current.summary.grossRevenue
          ? Number(
              ((current.summary.operationalProfit / current.summary.grossRevenue) * 100).toFixed(1),
            )
          : 0,
      },
      professionals,
      highlights: {
        topProfitProfessional,
        topRevenueProfessional: topRevenueProfessional
          ? {
              professionalId: topRevenueProfessional.professionalId,
              name: topRevenueProfessional.name,
              grossRevenue: topRevenueProfessional.grossRevenue,
            }
          : null,
        lowestMarginProfessional: lowestMarginProfessional
          ? {
              professionalId: lowestMarginProfessional.professionalId,
              name: lowestMarginProfessional.name,
              marginPct: lowestMarginProfessional.marginPct,
            }
          : null,
      },
    };
  }

  async getStockOverview(input: {
    unitId: string;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(input.limit ?? 12, 1), 50);

    const [products, movements, movementWindow, totalStock] = await Promise.all([
      this.prisma.product.findMany({
        where: { active: true, businessId: input.unitId },
        select: {
          id: true,
          name: true,
          stockQty: true,
          minStockAlert: true,
        },
      }),
      this.prisma.stockMovement.findMany({
        where: { unitId: input.unitId },
        orderBy: { occurredAt: "desc" },
        take: limit,
        include: {
          product: {
            select: { name: true },
          },
        },
      }),
      this.prisma.stockMovement.findMany({
        where: {
          unitId: input.unitId,
          occurredAt: {
            gte: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { occurredAt: "desc" },
        take: 400,
      }),
      this.prisma.product.aggregate({
        where: { active: true, businessId: input.unitId },
        _sum: { stockQty: true },
      }),
    ]);

    const lowStock = products
      .filter((item) => item.stockQty <= item.minStockAlert)
      .map((item) => ({
        id: item.id,
        name: item.name,
        stockQty: item.stockQty,
        minStockAlert: item.minStockAlert,
      }));

    return {
      lowStock,
      recentMovements: movements.map((item) => ({
        id: item.id,
        unitId: item.unitId,
        productId: item.productId,
        productName: item.product.name,
        movementType: item.movementType,
        quantity: item.quantity,
        occurredAt: item.occurredAt,
        referenceType: item.referenceType,
        referenceId: item.referenceId ?? undefined,
      })),
      replenishmentSuggestions: buildReplenishmentSuggestions({
        products: products.map((item) => ({
          id: item.id,
          name: item.name,
          stockQty: item.stockQty,
          minStockAlert: item.minStockAlert,
          active: true,
        })),
        stockMovements: movementWindow.map((item) => ({
          productId: item.productId,
          movementType: item.movementType,
          quantity: item.quantity,
          occurredAt: item.occurredAt,
          referenceType: item.referenceType as
            | "PRODUCT_SALE"
            | "SERVICE_CONSUMPTION"
            | "ADJUSTMENT"
            | "INTERNAL",
        })),
        limit: 12,
      }),
      totals: {
        totalProducts: products.length,
        lowStockCount: lowStock.length,
        totalStockQty: totalStock._sum.stockQty ?? 0,
      },
    };
  }

  async getClientsOverview(input: {
    unitId: string;
    start: Date;
    end: Date;
    search?: string;
    status?: ClientPredictiveStatus | "WARNING";
    segment?: ClientValueSegment;
    limit?: number;
  }): Promise<ClientsOverviewPayload> {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const normalizedSearch = String(input.search ?? "").trim();
    const clientWhere: Prisma.ClientWhereInput = {
      businessId: input.unitId,
      ...(normalizedSearch
        ? {
            OR: [
              {
                fullName: {
                  contains: normalizedSearch,
                  mode: "insensitive",
                },
              },
              {
                phone: {
                  contains: normalizedSearch,
                  mode: "insensitive",
                },
              },
              {
                tags: {
                  has: normalizedSearch.toUpperCase(),
                },
              },
            ],
          }
        : {}),
    };

    const clients = await this.prisma.client.findMany({
      where: clientWhere,
      orderBy: { fullName: "asc" },
    });
    if (!clients.length) {
      return {
        clients: [],
        summary: {
          active: 0,
          atRisk: 0,
          warning: 0,
          inactive: 0,
          vip: 0,
          totalRevenue: 0,
          averageTicket: 0,
          totalClients: 0,
          potentialReactivationRevenue: 0,
        },
        reactivationQueue: [],
      };
    }

    const clientIds = clients.map((item) => item.id);
    const [completedInRange, completedAllTime] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          unitId: input.unitId,
          clientId: { in: clientIds },
          status: "COMPLETED",
          startsAt: { gte: input.start, lte: input.end },
        },
        include: {
          service: {
            select: { price: true },
          },
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          unitId: input.unitId,
          clientId: { in: clientIds },
          status: "COMPLETED",
        },
        select: {
          clientId: true,
          endsAt: true,
          service: {
            select: { price: true },
          },
        },
      }),
    ]);

    const periodByClient = new Map<string, { visits: number; revenue: number }>();
    for (const appointment of completedInRange) {
      const current = periodByClient.get(appointment.clientId) ?? { visits: 0, revenue: 0 };
      current.visits += 1;
      current.revenue += asNumber(appointment.service.price);
      periodByClient.set(appointment.clientId, current);
    }

    const allTimeByClient = new Map<string, { visits: number; revenue: number; visitDates: Date[] }>();
    for (const row of completedAllTime) {
      const current = allTimeByClient.get(row.clientId) ?? { visits: 0, revenue: 0, visitDates: [] };
      current.visits += 1;
      current.revenue += asNumber(row.service.price);
      current.visitDates.push(row.endsAt);
      allTimeByClient.set(row.clientId, current);
    }

    const rows = clients
      .map((client) => {
        const period = periodByClient.get(client.id) ?? { visits: 0, revenue: 0 };
        const allTime = allTimeByClient.get(client.id) ?? { visits: 0, revenue: 0, visitDates: [] };
        const orderedVisits = [...allTime.visitDates].sort((a, b) => a.getTime() - b.getTime());
        const lastVisit = orderedVisits.length ? orderedVisits[orderedVisits.length - 1] : null;
        const daysWithoutReturn = lastVisit
          ? Math.floor((input.end.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        const visitFrequencyDays =
          orderedVisits.length <= 1
            ? null
            : Number(
                (
                  orderedVisits
                    .slice(1)
                    .reduce((acc, visit, index) => {
                      const prev = orderedVisits[index];
                      return (
                        acc + (visit.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
                      );
                    }, 0) /
                  (orderedVisits.length - 1)
                ).toFixed(1),
              );

        return {
          clientId: client.id,
          fullName: client.fullName,
          phone: client.phone ?? null,
          tags: client.tags as Client["tags"],
          visits: period.visits,
          revenue: Number(period.revenue.toFixed(2)),
          ltv: Number(allTime.revenue.toFixed(2)),
          averageTicket: allTime.visits
            ? Number((allTime.revenue / allTime.visits).toFixed(2))
            : 0,
          visitFrequencyDays,
          lastVisitAt: lastVisit ? lastVisit.toISOString() : null,
          daysWithoutReturn,
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    const statusFilter = input.status === "WARNING" ? "AT_RISK" : input.status;
    return buildClientsOverviewPredictive({
      rows,
      status: statusFilter,
      segment: input.segment,
      limit,
    });
  }

  async getProfessionalsPerformance(input: {
    unitId: string;
    start: Date;
    end: Date;
    professionalId?: string;
  }) {
    const professionals = await this.prisma.professional.findMany({
      where: {
        active: true,
        ...(input.professionalId ? { id: input.professionalId } : {}),
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: "asc" },
    });
    if (!professionals.length) {
      return {
        professionals: [],
        summary: {
          totalRevenue: 0,
          totalCompleted: 0,
          bestRevenue: null,
          bestOccupancy: null,
        },
      };
    }

    const professionalIds = professionals.map((item) => item.id);
    const appointments = await this.prisma.appointment.findMany({
      where: {
        unitId: input.unitId,
        professionalId: { in: professionalIds },
        startsAt: { gte: input.start, lte: input.end },
      },
      include: {
        service: {
          select: { price: true },
        },
      },
    });

    const map = new Map<
      string,
      { professionalId: string; name: string; completed: number; total: number; revenue: number }
    >();
    for (const professional of professionals) {
      map.set(professional.id, {
        professionalId: professional.id,
        name: professional.name,
        completed: 0,
        total: 0,
        revenue: 0,
      });
    }

    for (const item of appointments) {
      const current = map.get(item.professionalId);
      if (!current) continue;
      current.total += 1;
      if (item.status === "COMPLETED") {
        current.completed += 1;
        current.revenue += asNumber(item.service.price);
      }
    }

    const rows = Array.from(map.values())
      .map((item) => ({
        professionalId: item.professionalId,
        name: item.name,
        completed: item.completed,
        total: item.total,
        occupancyRate: item.total ? Number(((item.completed / item.total) * 100).toFixed(1)) : 0,
        revenue: Number(item.revenue.toFixed(2)),
        ticketAverage: item.completed ? Number((item.revenue / item.completed).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = rows.reduce((acc, item) => acc + item.revenue, 0);
    const totalCompleted = rows.reduce((acc, item) => acc + item.completed, 0);
    const bestRevenue =
      rows.length > 0
        ? rows.reduce((best, current) => (current.revenue > best.revenue ? current : best))
        : null;
    const bestOccupancy =
      rows.length > 0
        ? rows.reduce((best, current) =>
            current.occupancyRate > best.occupancyRate ? current : best,
          )
        : null;

    return {
      professionals: rows,
      summary: {
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalCompleted,
        bestRevenue: bestRevenue
          ? {
              professionalId: bestRevenue.professionalId,
              name: bestRevenue.name,
              revenue: bestRevenue.revenue,
            }
          : null,
        bestOccupancy: bestOccupancy
          ? {
              professionalId: bestOccupancy.professionalId,
              name: bestOccupancy.name,
              occupancyRate: bestOccupancy.occupancyRate,
            }
          : null,
      },
    };
  }

  async getCurrentGoal(input: {
    unitId: string;
    month?: number;
    year?: number;
  }) {
    const now = new Date();
    const month = input.month ?? now.getMonth() + 1;
    const year = input.year ?? now.getFullYear();
    const goal = await this.prisma.monthlyGoal.findFirst({
      where: {
        businessId: input.unitId,
        month,
        year,
      },
    });

    return {
      goal: goal ? this.mapMonthlyGoal(goal) : null,
      period: {
        month,
        year,
      },
    };
  }

  async createGoal(input: {
    unitId: string;
    month: number;
    year: number;
    revenueTarget: number;
    appointmentsTarget: number;
    averageTicketTarget?: number;
    notes?: string;
  }) {
    const duplicated = await this.prisma.monthlyGoal.findFirst({
      where: {
        businessId: input.unitId,
        month: input.month,
        year: input.year,
      },
      select: { id: true },
    });
    if (duplicated) {
      throw new Error("Conflito: ja existe uma meta cadastrada para este periodo.");
    }

    const created = await this.prisma.monthlyGoal.create({
      data: {
        id: crypto.randomUUID(),
        businessId: input.unitId,
        month: input.month,
        year: input.year,
        revenueTarget: new Prisma.Decimal(input.revenueTarget),
        appointmentsTarget: input.appointmentsTarget,
        averageTicketTarget:
          typeof input.averageTicketTarget === "number"
            ? new Prisma.Decimal(input.averageTicketTarget)
            : null,
        notes: input.notes ? String(input.notes).trim() : null,
      },
    });

    return {
      goal: this.mapMonthlyGoal(created),
    };
  }

  async updateGoal(input: {
    unitId: string;
    goalId: string;
    month?: number;
    year?: number;
    revenueTarget?: number;
    appointmentsTarget?: number;
    averageTicketTarget?: number | null;
    notes?: string;
  }) {
    const current = await this.prisma.monthlyGoal.findFirst({
      where: {
        id: input.goalId,
        businessId: input.unitId,
      },
    });
    if (!current) throw new Error("Meta nao encontrada.");

    const nextMonth = input.month ?? current.month;
    const nextYear = input.year ?? current.year;
    const duplicated = await this.prisma.monthlyGoal.findFirst({
      where: {
        businessId: input.unitId,
        month: nextMonth,
        year: nextYear,
        id: { not: current.id },
      },
      select: { id: true },
    });
    if (duplicated) {
      throw new Error("Conflito: ja existe uma meta cadastrada para este periodo.");
    }

    const updated = await this.prisma.monthlyGoal.update({
      where: { id: current.id },
      data: {
        month: nextMonth,
        year: nextYear,
        revenueTarget:
          typeof input.revenueTarget === "number"
            ? new Prisma.Decimal(input.revenueTarget)
            : undefined,
        appointmentsTarget:
          typeof input.appointmentsTarget === "number"
            ? input.appointmentsTarget
            : undefined,
        averageTicketTarget:
          input.averageTicketTarget == null
            ? input.averageTicketTarget === null
              ? null
              : undefined
            : new Prisma.Decimal(input.averageTicketTarget),
        notes: typeof input.notes === "string" ? input.notes.trim() : undefined,
      },
    });

    return {
      goal: this.mapMonthlyGoal(updated),
    };
  }

  async getPerformanceSummary(input: {
    unitId: string;
    month?: number;
    year?: number;
  }): Promise<GoalProgressSummary> {
    const now = new Date();
    const month = input.month ?? now.getMonth() + 1;
    const year = input.year ?? now.getFullYear();
    const period = monthRange(new Date(year, month - 1, 1, 12, 0, 0, 0));
    const goal = await this.prisma.monthlyGoal.findFirst({
      where: {
        businessId: input.unitId,
        month,
        year,
      },
    });

    const [completedAppointments, salesAgg, professionalsPayload, servicesPayload] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          unitId: input.unitId,
          status: "COMPLETED",
          startsAt: { gte: period.start, lte: period.end },
        },
        include: {
          service: {
            select: { price: true },
          },
        },
      }),
      this.prisma.productSale.aggregate({
        where: {
          unitId: input.unitId,
          soldAt: { gte: period.start, lte: period.end },
        },
        _sum: {
          grossAmount: true,
        },
      }),
      this.getPerformanceProfessionals({ unitId: input.unitId, month, year }),
      this.getPerformanceServices({ unitId: input.unitId, month, year }),
    ]);

    const appointmentRevenue = completedAppointments.reduce(
      (acc, item) => acc + asNumber(item.service.price),
      0,
    );
    const salesRevenue = asNumber(salesAgg._sum.grossAmount);
    const revenueCurrent = Number((appointmentRevenue + salesRevenue).toFixed(2));
    const appointmentsCompleted = completedAppointments.length;
    const ticketAverageCurrent = appointmentsCompleted
      ? Number((appointmentRevenue / appointmentsCompleted).toFixed(2))
      : 0;

    const daysTotal = new Date(year, month, 0).getDate();
    const isCurrentMonth = now.getMonth() + 1 === month && now.getFullYear() === year;
    const daysElapsed = isCurrentMonth ? Math.max(1, now.getDate()) : now > period.end ? daysTotal : 0;
    const daysRemaining = isCurrentMonth ? Math.max(0, daysTotal - now.getDate()) : now > period.end ? 0 : daysTotal;
    const revenueTarget = goal ? asNumber(goal.revenueTarget) : 0;
    const appointmentsTarget = goal?.appointmentsTarget ?? 0;
    const goalProgressPercent = revenueTarget
      ? Number(((revenueCurrent / revenueTarget) * 100).toFixed(1))
      : 0;
    const remainingAmount = revenueTarget
      ? Number(Math.max(0, revenueTarget - revenueCurrent).toFixed(2))
      : 0;
    const remainingAppointments = appointmentsTarget
      ? Math.max(0, appointmentsTarget - appointmentsCompleted)
      : 0;
    const requiredRevenuePerDay =
      daysRemaining > 0 ? Number((remainingAmount / daysRemaining).toFixed(2)) : 0;
    const requiredAppointmentsPerDay =
      daysRemaining > 0 ? Number((remainingAppointments / daysRemaining).toFixed(2)) : 0;
    const expectedRevenueByNow =
      revenueTarget && daysTotal > 0
        ? Number(((revenueTarget * Math.min(daysElapsed, daysTotal)) / daysTotal).toFixed(2))
        : 0;
    const paceStatus = this.resolveGoalPaceStatus({
      hasGoal: Boolean(goal),
      revenueCurrent,
      expectedRevenueByNow,
    });

    const professionals = professionalsPayload.professionals;
    const services = servicesPayload.services;
    const topProfessional = professionals[0] ?? null;
    const topService = services[0] ?? null;

    const insights = this.buildGoalInsights({
      goal: goal
        ? {
            id: goal.id,
            businessId: goal.businessId,
            month: goal.month,
            year: goal.year,
            revenueTarget: asNumber(goal.revenueTarget),
            appointmentsTarget: goal.appointmentsTarget,
            averageTicketTarget:
              goal.averageTicketTarget == null
                ? undefined
                : asNumber(goal.averageTicketTarget),
            notes: goal.notes ?? undefined,
            createdAt: goal.createdAt,
            updatedAt: goal.updatedAt,
          }
        : null,
      revenueCurrent,
      remainingAmount,
      requiredRevenuePerDay,
      services,
      professionals,
      ticketAverageCurrent,
    });

    return {
      goal: goal ? this.mapMonthlyGoal(goal) : null,
      period: {
        month,
        year,
        start: period.start.toISOString(),
        end: period.end.toISOString(),
      },
      metrics: {
        revenueCurrent,
        appointmentsCompleted,
        ticketAverageCurrent,
        goalProgressPercent,
        remainingAmount,
        remainingAppointments,
        daysTotal,
        daysElapsed,
        daysRemaining,
        requiredRevenuePerDay,
        requiredAppointmentsPerDay,
        expectedRevenueByNow,
        paceStatus,
      },
      topProfessional: topProfessional
        ? {
            professionalId: topProfessional.professionalId,
            name: topProfessional.name,
            revenue: topProfessional.revenue,
          }
        : null,
      topService: topService
        ? {
            serviceId: topService.serviceId,
            name: topService.name,
            revenue: topService.revenue,
            sharePct: topService.sharePct,
          }
        : null,
      insights,
    };
  }

  async getPerformanceProfessionals(input: {
    unitId: string;
    month?: number;
    year?: number;
  }) {
    const now = new Date();
    const month = input.month ?? now.getMonth() + 1;
    const year = input.year ?? now.getFullYear();
    const period = monthRange(new Date(year, month - 1, 1, 12, 0, 0, 0));

    const [professionals, appointments, commissionsByProfessional] = await Promise.all([
      this.prisma.professional.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.appointment.findMany({
        where: {
          unitId: input.unitId,
          startsAt: { gte: period.start, lte: period.end },
        },
        include: {
          service: {
            select: { price: true },
          },
        },
      }),
      this.prisma.commissionEntry.groupBy({
        by: ["professionalId"],
        where: {
          unitId: input.unitId,
          occurredAt: { gte: period.start, lte: period.end },
        },
        _sum: {
          commissionAmount: true,
        },
      }),
    ]);

    const commissionsByProfessionalMap = new Map(
      commissionsByProfessional.map((item) => [item.professionalId, asNumber(item._sum.commissionAmount)]),
    );

    const rows = professionals
      .map((professional) => {
        const total = appointments.filter((item) => item.professionalId === professional.id);
        const completed = total.filter((item) => item.status === "COMPLETED");
        const revenue = completed.reduce((acc, item) => acc + asNumber(item.service.price), 0);

        return {
          professionalId: professional.id,
          name: professional.name,
          revenue: Number(revenue.toFixed(2)),
          completedAppointments: completed.length,
          ticketAverage: completed.length ? Number((revenue / completed.length).toFixed(2)) : 0,
          occupancyRate: total.length
            ? Number(((completed.length / total.length) * 100).toFixed(1))
            : 0,
          commissionEstimated: Number(
            (commissionsByProfessionalMap.get(professional.id) ?? 0).toFixed(2),
          ),
          rank: 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .map((item, index) => ({
        ...item,
        rank: index + 1,
      }));

    return {
      period: {
        month,
        year,
        start: period.start.toISOString(),
        end: period.end.toISOString(),
      },
      summary: {
        totalRevenue: Number(rows.reduce((acc, item) => acc + item.revenue, 0).toFixed(2)),
        totalCompletedAppointments: rows.reduce((acc, item) => acc + item.completedAppointments, 0),
      },
      professionals: rows,
    };
  }

  async getPerformanceServices(input: {
    unitId: string;
    month?: number;
    year?: number;
  }) {
    const now = new Date();
    const month = input.month ?? now.getMonth() + 1;
    const year = input.year ?? now.getFullYear();
    const period = monthRange(new Date(year, month - 1, 1, 12, 0, 0, 0));

    const completed = await this.prisma.appointment.findMany({
      where: {
        unitId: input.unitId,
        status: "COMPLETED",
        startsAt: { gte: period.start, lte: period.end },
      },
      include: {
        service: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
      },
    });

    const map = new Map<string, { serviceId: string; name: string; quantity: number; revenue: number }>();
    for (const appointment of completed) {
      const current = map.get(appointment.service.id) ?? {
        serviceId: appointment.service.id,
        name: appointment.service.name,
        quantity: 0,
        revenue: 0,
      };
      current.quantity += 1;
      current.revenue += asNumber(appointment.service.price);
      map.set(appointment.service.id, current);
    }

    const totalRevenue = Array.from(map.values()).reduce((acc, item) => acc + item.revenue, 0);
    const services = Array.from(map.values())
      .map((item) => ({
        serviceId: item.serviceId,
        name: item.name,
        quantity: item.quantity,
        revenue: Number(item.revenue.toFixed(2)),
        ticketAverage: item.quantity ? Number((item.revenue / item.quantity).toFixed(2)) : 0,
        sharePct: totalRevenue ? Number(((item.revenue / totalRevenue) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      period: {
        month,
        year,
        start: period.start.toISOString(),
        end: period.end.toISOString(),
      },
      summary: {
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalServices: services.length,
      },
      services,
    };
  }

  async getCommissionsStatement(input: {
    unitId: string;
    start: Date;
    end: Date;
    professionalId?: string;
    appliesTo?: "SERVICE" | "PRODUCT";
    limit?: number;
  }) {
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
    const where: Prisma.CommissionEntryWhereInput = {
      unitId: input.unitId,
      occurredAt: { gte: input.start, lte: input.end },
      ...(input.professionalId ? { professionalId: input.professionalId } : {}),
      ...(input.appliesTo ? { source: input.appliesTo } : {}),
    };

    const [entriesRows, totalAgg, serviceAgg, productAgg, byProfessionalAgg] = await Promise.all([
      this.prisma.commissionEntry.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        take: limit,
        include: {
          professional: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.commissionEntry.aggregate({
        where,
        _sum: { commissionAmount: true },
      }),
      this.prisma.commissionEntry.aggregate({
        where: { ...where, source: "SERVICE" },
        _sum: { commissionAmount: true },
      }),
      this.prisma.commissionEntry.aggregate({
        where: { ...where, source: "PRODUCT" },
        _sum: { commissionAmount: true },
      }),
      this.prisma.commissionEntry.groupBy({
        by: ["professionalId"],
        where,
        _sum: { commissionAmount: true },
        _count: { _all: true },
      }),
    ]);

    const ruleIds = Array.from(new Set(entriesRows.map((item) => item.ruleId)));
    const professionalIds = Array.from(new Set(byProfessionalAgg.map((item) => item.professionalId)));

    const [rules, professionals] = await Promise.all([
      this.prisma.commissionRule.findMany({
        where: { id: { in: ruleIds } },
        select: {
          id: true,
          percentage: true,
          fixedAmount: true,
        },
      }),
      this.prisma.professional.findMany({
        where: { id: { in: professionalIds } },
        select: { id: true, name: true },
      }),
    ]);

    const rulesById = new Map(rules.map((item) => [item.id, item]));
    const professionalsById = new Map(professionals.map((item) => [item.id, item.name]));

    return {
      entries: entriesRows.map((item) => {
        const rule = rulesById.get(item.ruleId);
        return {
          id: item.id,
          occurredAt: item.occurredAt.toISOString(),
          professionalId: item.professionalId,
          professionalName: item.professional.name,
          appliesTo: item.source,
          baseAmount: Number(asNumber(item.baseAmount).toFixed(2)),
          percentage:
            rule?.percentage == null ? null : Number((asNumber(rule.percentage) * 100).toFixed(2)),
          fixedAmount:
            rule?.fixedAmount == null ? null : Number(asNumber(rule.fixedAmount).toFixed(2)),
          commissionAmount: Number(asNumber(item.commissionAmount).toFixed(2)),
          referenceId: item.appointmentId ?? item.productSaleId ?? null,
          referenceType: item.appointmentId ? "APPOINTMENT" : "PRODUCT_SALE",
        };
      }),
      summary: {
        totalCommission: Number(asNumber(totalAgg._sum.commissionAmount).toFixed(2)),
        serviceCommission: Number(asNumber(serviceAgg._sum.commissionAmount).toFixed(2)),
        productCommission: Number(asNumber(productAgg._sum.commissionAmount).toFixed(2)),
        byProfessional: byProfessionalAgg
          .map((item) => ({
            professionalId: item.professionalId,
            name: professionalsById.get(item.professionalId) ?? "Profissional",
            totalCommission: Number(asNumber(item._sum.commissionAmount).toFixed(2)),
            entries: item._count._all,
          }))
          .sort((a, b) => b.totalCommission - a.totalCommission),
      },
    };
  }

  async getLoyaltySummary(input: {
    unitId: string;
    start: Date;
    end: Date;
  }) {
    const [program, entries, allBalances] = await Promise.all([
      this.prisma.loyaltyProgram.findFirst({
        where: { unitId: input.unitId, isActive: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.loyaltyLedger.findMany({
        where: {
          unitId: input.unitId,
          occurredAt: {
            gte: input.start,
            lte: input.end,
          },
        },
      }),
      this.prisma.loyaltyLedger.findMany({
        where: { unitId: input.unitId },
        orderBy: { occurredAt: "desc" },
      }),
    ]);

    const earned = entries
      .filter((item) => asNumber(item.pointsDelta) > 0)
      .reduce((acc, item) => acc + asNumber(item.pointsDelta), 0);
    const redeemed = Math.abs(
      entries
        .filter((item) => asNumber(item.pointsDelta) < 0)
        .reduce((acc, item) => acc + asNumber(item.pointsDelta), 0),
    );
    const activeClients = new Set(entries.map((item) => item.clientId)).size;
    const balanceByClient = new Map<string, number>();
    for (const entry of allBalances) {
      if (!balanceByClient.has(entry.clientId)) {
        balanceByClient.set(entry.clientId, asNumber(entry.balanceAfter));
      }
    }
    const totalBalance = Array.from(balanceByClient.values()).reduce((acc, value) => acc + value, 0);

    return {
      program: program
        ? {
            id: program.id,
            name: program.name,
            type: program.type,
            conversionRate: asNumber(program.conversionRate),
          }
        : null,
      summary: {
        earned: Number(earned.toFixed(2)),
        redeemed: Number(redeemed.toFixed(2)),
        net: Number((earned - redeemed).toFixed(2)),
        activeClients,
        totalBalance: Number(totalBalance.toFixed(2)),
      },
    };
  }

  async getLoyaltyLedger(input: {
    unitId: string;
    clientId?: string;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
    const entries = await this.prisma.loyaltyLedger.findMany({
      where: {
        unitId: input.unitId,
        ...(input.clientId ? { clientId: input.clientId } : {}),
      },
      include: {
        client: {
          select: { fullName: true },
        },
      },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });

    return {
      entries: entries.map((item) => ({
        id: item.id,
        unitId: item.unitId,
        clientId: item.clientId,
        clientName: item.client.fullName,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        pointsDelta: Number(asNumber(item.pointsDelta).toFixed(2)),
        balanceAfter: Number(asNumber(item.balanceAfter).toFixed(2)),
        occurredAt: item.occurredAt.toISOString(),
        createdBy: item.createdBy,
      })),
    };
  }

  async adjustLoyalty(input: {
    unitId: string;
    clientId: string;
    pointsDelta: number;
    sourceType?: "ADJUSTMENT" | "REDEEM";
    sourceId?: string;
    note?: string;
    occurredAt?: Date;
    createdBy: string;
  }) {
    if (!Number.isFinite(input.pointsDelta) || input.pointsDelta === 0) {
      throw new Error("Ajuste de fidelidade invalido");
    }
    const client = await this.prisma.client.findUnique({ where: { id: input.clientId } });
    if (!client) throw new Error("Cliente nao encontrado");

    const currentBalance = await this.getCurrentLoyaltyBalance(input.unitId, input.clientId);
    const nextBalance = currentBalance + input.pointsDelta;
    if (nextBalance < 0) throw new Error("Saldo de fidelidade insuficiente");

    const entry = await this.prisma.loyaltyLedger.create({
      data: {
        id: crypto.randomUUID(),
        unitId: input.unitId,
        clientId: input.clientId,
        sourceType: input.sourceType ?? (input.pointsDelta < 0 ? "REDEEM" : "ADJUSTMENT"),
        sourceId: input.sourceId,
        pointsDelta: input.pointsDelta,
        balanceAfter: nextBalance,
        occurredAt: input.occurredAt ?? new Date(),
        createdBy: input.createdBy,
      },
    });

    return {
      entry: {
        ...entry,
        pointsDelta: Number(asNumber(entry.pointsDelta).toFixed(2)),
        balanceAfter: Number(asNumber(entry.balanceAfter).toFixed(2)),
        occurredAt: entry.occurredAt.toISOString(),
      },
      balance: Number(asNumber(entry.balanceAfter).toFixed(2)),
    };
  }

  async getServicePackages(input: { unitId: string }) {
    const packages = await this.prisma.servicePackage.findMany({
      where: { unitId: input.unitId, isActive: true },
      orderBy: { name: "asc" },
    });
    return {
      packages: packages.map((item) => ({
        id: item.id,
        unitId: item.unitId,
        name: item.name,
        price: Number(asNumber(item.price).toFixed(2)),
        sessionsTotal: item.sessionsTotal,
        sessionsByService: (item.sessionsByService as Record<string, number> | null) ?? {},
        validityDays: item.validityDays,
        isActive: item.isActive,
      })),
    };
  }

  async purchasePackage(input: {
    unitId: string;
    clientId: string;
    packageId: string;
    purchasedAt: Date;
    changedBy: string;
  }) {
    const [client, pack] = await Promise.all([
      this.prisma.client.findUnique({ where: { id: input.clientId } }),
      this.prisma.servicePackage.findFirst({
        where: {
          id: input.packageId,
          unitId: input.unitId,
          isActive: true,
        },
      }),
    ]);
    if (!client) throw new Error("Cliente nao encontrado");
    if (!pack) throw new Error("Pacote nao encontrado ou inativo");

    const expiresAt = new Date(input.purchasedAt.getTime() + pack.validityDays * 24 * 60 * 60 * 1000);
    const created = await this.prisma.clientPackage.create({
      data: {
        id: crypto.randomUUID(),
        unitId: input.unitId,
        clientId: input.clientId,
        packageId: pack.id,
        purchasedAt: input.purchasedAt,
        expiresAt,
        sessionsRemaining: pack.sessionsTotal,
        status: "ACTIVE",
      },
    });

    await this.prisma.financialEntry.create({
      data: {
        id: crypto.randomUUID(),
        unitId: input.unitId,
        kind: "INCOME",
        source: "SERVICE",
        amount: pack.price,
        occurredAt: input.purchasedAt,
        referenceType: "MANUAL",
        referenceId: created.id,
        description: `Venda de pacote: ${pack.name}`,
      },
    });

    return {
      clientPackage: {
        ...created,
        purchasedAt: created.purchasedAt.toISOString(),
        expiresAt: created.expiresAt.toISOString(),
      },
    };
  }

  async redeemPackageSession(input: {
    unitId: string;
    clientId: string;
    packagePurchaseId: string;
    serviceId: string;
    occurredAt: Date;
    changedBy: string;
  }) {
    const purchase = await this.prisma.clientPackage.findFirst({
      where: {
        id: input.packagePurchaseId,
        unitId: input.unitId,
        clientId: input.clientId,
      },
      include: { package: true },
    });
    if (!purchase) throw new Error("Pacote do cliente nao encontrado");
    if (purchase.status !== "ACTIVE") throw new Error("Pacote nao esta ativo");
    if (purchase.expiresAt < input.occurredAt) {
      await this.prisma.clientPackage.update({
        where: { id: purchase.id },
        data: { status: "EXPIRED" },
      });
      throw new Error("Pacote expirado");
    }
    if (purchase.sessionsRemaining <= 0) {
      await this.prisma.clientPackage.update({
        where: { id: purchase.id },
        data: { status: "DEPLETED" },
      });
      throw new Error("Pacote sem saldo de sessoes");
    }

    const sessionsByService = (purchase.package.sessionsByService as Record<string, number> | null) ?? {};
    const serviceLimit = sessionsByService[input.serviceId];
    if (serviceLimit != null && serviceLimit <= 0) {
      throw new Error("Servico nao elegivel para este pacote");
    }

    const nextRemaining = purchase.sessionsRemaining - 1;
    const status = nextRemaining <= 0 ? "DEPLETED" : "ACTIVE";
    const updated = await this.prisma.clientPackage.update({
      where: { id: purchase.id },
      data: {
        sessionsRemaining: nextRemaining,
        status,
      },
    });
    return {
      clientPackage: {
        ...updated,
        purchasedAt: updated.purchasedAt.toISOString(),
        expiresAt: updated.expiresAt.toISOString(),
      },
    };
  }

  async getClientPackageBalance(input: {
    unitId: string;
    clientId: string;
  }) {
    const rows = await this.prisma.clientPackage.findMany({
      where: { unitId: input.unitId, clientId: input.clientId },
      include: {
        package: {
          select: { name: true },
        },
      },
      orderBy: { purchasedAt: "desc" },
    });

    return {
      balances: rows.map((item) => ({
        id: item.id,
        packageId: item.packageId,
        packageName: item.package.name,
        sessionsRemaining: item.sessionsRemaining,
        status: item.status,
        expiresAt: item.expiresAt.toISOString(),
      })),
    };
  }

  async getSubscriptionPlans(input: { unitId: string }) {
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { unitId: input.unitId, isActive: true },
      orderBy: { name: "asc" },
    });
    return {
      plans: plans.map((item) => ({
        ...item,
        priceMonthly: Number(asNumber(item.priceMonthly).toFixed(2)),
      })),
    };
  }

  async activateSubscription(input: {
    unitId: string;
    clientId: string;
    planId: string;
    startedAt: Date;
    changedBy: string;
  }) {
    const [client, plan] = await Promise.all([
      this.prisma.client.findUnique({ where: { id: input.clientId } }),
      this.prisma.subscriptionPlan.findFirst({
        where: { id: input.planId, unitId: input.unitId, isActive: true },
      }),
    ]);
    if (!client) throw new Error("Cliente nao encontrado");
    if (!plan) throw new Error("Plano de assinatura nao encontrado ou inativo");

    const nextBillingAt = new Date(input.startedAt);
    nextBillingAt.setMonth(nextBillingAt.getMonth() + 1);
    nextBillingAt.setDate(Math.max(1, Math.min(28, plan.billingDay)));

    const created = await this.prisma.clientSubscription.create({
      data: {
        id: crypto.randomUUID(),
        unitId: input.unitId,
        clientId: input.clientId,
        planId: input.planId,
        startedAt: input.startedAt,
        nextBillingAt,
        status: "ACTIVE",
        cycleCount: 1,
      },
    });

    await this.prisma.financialEntry.create({
      data: {
        id: crypto.randomUUID(),
        unitId: input.unitId,
        kind: "INCOME",
        source: "SERVICE",
        amount: plan.priceMonthly,
        occurredAt: input.startedAt,
        referenceType: "MANUAL",
        referenceId: created.id,
        description: `Assinatura iniciada: ${plan.name}`,
      },
    });

    return {
      subscription: {
        ...created,
        startedAt: created.startedAt.toISOString(),
        nextBillingAt: created.nextBillingAt.toISOString(),
      },
    };
  }

  async cancelSubscription(input: {
    unitId: string;
    subscriptionId: string;
    changedBy: string;
  }) {
    const row = await this.prisma.clientSubscription.findFirst({
      where: {
        id: input.subscriptionId,
        unitId: input.unitId,
      },
    });
    if (!row) throw new Error("Assinatura nao encontrada");
    const updated = await this.prisma.clientSubscription.update({
      where: { id: row.id },
      data: { status: "CANCELLED" },
    });
    return {
      subscription: {
        ...updated,
        startedAt: updated.startedAt.toISOString(),
        nextBillingAt: updated.nextBillingAt.toISOString(),
      },
    };
  }

  async getSubscriptionsOverview(input: {
    unitId: string;
    start: Date;
    end: Date;
  }) {
    const rows = await this.prisma.clientSubscription.findMany({
      where: { unitId: input.unitId },
      include: { plan: true },
      orderBy: { startedAt: "desc" },
    });

    const active = rows.filter((item) => item.status === "ACTIVE").length;
    const pastDue = rows.filter((item) => item.status === "PAST_DUE").length;
    const cancelled = rows.filter((item) => item.status === "CANCELLED").length;
    const mrr = rows
      .filter((item) => item.status === "ACTIVE")
      .reduce((acc, item) => acc + asNumber(item.plan.priceMonthly), 0);

    return {
      summary: {
        active,
        pastDue,
        cancelled,
        mrr: Number(mrr.toFixed(2)),
      },
      subscriptions: rows.map((item) => ({
        ...item,
        planName: item.plan.name,
        startedAt: item.startedAt.toISOString(),
        nextBillingAt: item.nextBillingAt.toISOString(),
      })),
    };
  }

  async getRetentionCases(input: {
    unitId: string;
    riskLevel?: "LOW" | "MEDIUM" | "HIGH";
    status?: "OPEN" | "IN_PROGRESS" | "CONVERTED" | "LOST";
    limit?: number;
  }) {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const rows = await this.prisma.retentionCase.findMany({
      where: {
        unitId: input.unitId,
        ...(input.riskLevel ? { riskLevel: input.riskLevel } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      include: {
        client: {
          select: { fullName: true },
        },
      },
      orderBy: { daysWithoutReturn: "desc" },
      take: limit,
    });

    return {
      cases: rows.map((item) => ({
        ...item,
        clientName: item.client.fullName,
        lastVisitAt: item.lastVisitAt ? item.lastVisitAt.toISOString() : null,
        updatedAt: item.updatedAt.toISOString(),
      })),
      summary: {
        total: rows.length,
        high: rows.filter((item) => item.riskLevel === "HIGH").length,
        medium: rows.filter((item) => item.riskLevel === "MEDIUM").length,
        low: rows.filter((item) => item.riskLevel === "LOW").length,
      },
    };
  }

  async addRetentionEvent(input: {
    unitId: string;
    caseId: string;
    channel: "PHONE" | "WHATSAPP" | "MANUAL";
    note: string;
    outcome?: string;
    occurredAt: Date;
    createdBy: string;
  }) {
    const row = await this.prisma.retentionCase.findFirst({
      where: { id: input.caseId, unitId: input.unitId },
    });
    if (!row) throw new Error("Caso de retencao nao encontrado");

    if (row.status === "OPEN") {
      await this.prisma.retentionCase.update({
        where: { id: row.id },
        data: { status: "IN_PROGRESS" },
      });
    }

    const event = await this.prisma.retentionEvent.create({
      data: {
        id: crypto.randomUUID(),
        caseId: row.id,
        channel: input.channel,
        note: input.note,
        outcome: input.outcome,
        occurredAt: input.occurredAt,
        createdBy: input.createdBy,
      },
    });
    return {
      event: {
        ...event,
        occurredAt: event.occurredAt.toISOString(),
      },
    };
  }

  async convertRetentionCase(input: {
    unitId: string;
    caseId: string;
    changedBy: string;
  }) {
    const row = await this.prisma.retentionCase.findFirst({
      where: { id: input.caseId, unitId: input.unitId },
    });
    if (!row) throw new Error("Caso de retencao nao encontrado");
    const updated = await this.prisma.retentionCase.update({
      where: { id: row.id },
      data: { status: "CONVERTED" },
    });
    return {
      case: {
        ...updated,
        lastVisitAt: updated.lastVisitAt ? updated.lastVisitAt.toISOString() : null,
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  }

  async createAutomationRule(input: {
    unitId: string;
    name: string;
    triggerType: AutomationTriggerType;
    channel: AutomationChannel;
    target: AutomationTarget;
    messageTemplate: string;
    createdBy: string;
  }) {
    const created = await this.prisma.automationRule.create({
      data: {
        id: crypto.randomUUID(),
        unitId: input.unitId,
        name: input.name.trim(),
        triggerType: input.triggerType,
        channel: input.channel,
        target: input.target,
        messageTemplate: input.messageTemplate.trim(),
        createdBy: input.createdBy,
      },
    });
    return {
      rule: {
        ...created,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    };
  }

  async getAutomationRules(input: {
    unitId: string;
    active?: boolean;
  }) {
    const rules = await this.prisma.automationRule.findMany({
      where: {
        unitId: input.unitId,
        ...(input.active == null ? {} : { isActive: input.active }),
      },
      orderBy: { updatedAt: "desc" },
    });
    return {
      rules: rules.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    };
  }

  async updateAutomationRule(input: AutomationRuleUpdateInput) {
    const row = await this.prisma.automationRule.findFirst({
      where: {
        id: input.ruleId,
        unitId: input.unitId,
      },
    });
    if (!row) throw new Error("Regra de automacao nao encontrada");
    const hasAnyChange =
      input.name != null ||
      input.triggerType != null ||
      input.channel != null ||
      input.target != null ||
      input.messageTemplate != null;
    if (!hasAnyChange) throw new Error("Nenhum campo informado para atualizar regra");

    const previousRule = {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };

    const updated = await this.prisma.automationRule.update({
      where: { id: row.id },
      data: {
        ...(input.name != null ? { name: input.name.trim() } : {}),
        ...(input.triggerType != null ? { triggerType: input.triggerType } : {}),
        ...(input.channel != null ? { channel: input.channel } : {}),
        ...(input.target != null ? { target: input.target } : {}),
        ...(input.messageTemplate != null ? { messageTemplate: input.messageTemplate.trim() } : {}),
      },
    });
    return {
      previousRule,
      rule: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  }

  async activateAutomationRule(input: {
    unitId: string;
    ruleId: string;
  }) {
    const row = await this.prisma.automationRule.findFirst({
      where: {
        id: input.ruleId,
        unitId: input.unitId,
      },
    });
    if (!row) throw new Error("Regra de automacao nao encontrada");
    const updated = await this.prisma.automationRule.update({
      where: { id: row.id },
      data: { isActive: true },
    });
    return {
      rule: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  }

  async deactivateAutomationRule(input: {
    unitId: string;
    ruleId: string;
  }) {
    const row = await this.prisma.automationRule.findFirst({
      where: {
        id: input.ruleId,
        unitId: input.unitId,
      },
    });
    if (!row) throw new Error("Regra de automacao nao encontrada");
    const updated = await this.prisma.automationRule.update({
      where: { id: row.id },
      data: { isActive: false },
    });
    return {
      rule: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  }

  async executeAutomationCampaign(input: {
    unitId: string;
    ruleId?: string;
    campaignType: string;
    riskLevel?: "LOW" | "MEDIUM" | "HIGH";
    sourceModule?: AutomationSourceModule;
    sourceSuggestionId?: string;
    playbookType?: AutomationPlaybookType;
    startedBy: string;
  }) {
    const now = new Date();
    const rule = input.ruleId
      ? await this.prisma.automationRule.findFirst({
          where: {
            id: input.ruleId,
            unitId: input.unitId,
          },
        })
      : null;
    if (input.ruleId && !rule) throw new Error("Regra de automacao nao encontrada");
    if (rule && !rule.isActive) throw new Error("Regra de automacao inativa");

    const [clients, snapshots] = await Promise.all([
      this.prisma.client.findMany({
        select: { id: true, fullName: true },
      }),
      this.prisma.retentionScoreSnapshot.findMany({
        where: { unitId: input.unitId },
        orderBy: { scoredAt: "desc" },
      }),
    ]);
    const latestByClient = this.latestRetentionScoreMap(snapshots);

    const candidates = clients.filter((client) => {
      if (!input.riskLevel) return true;
      return latestByClient.get(client.id)?.riskLevel === input.riskLevel;
    });

    let scheduled = 0;
    let skipped = 0;
    const createdExecutions = [];

    for (const client of candidates) {
      const idempotencyKey = this.buildAutomationIdempotencyKey({
        unitId: input.unitId,
        campaignType: input.campaignType,
        ruleId: rule?.id ?? undefined,
        clientId: client.id,
        date: now,
      });
      try {
        const created = await this.prisma.automationExecution.create({
          data: {
            id: crypto.randomUUID(),
            unitId: input.unitId,
            ruleId: rule?.id,
            clientId: client.id,
            campaignType: input.campaignType,
            status: "PENDING",
            attempts: 0,
            idempotencyKey,
            payload: {
              startedBy: input.startedBy,
              clientName: client.fullName,
              riskLevel: latestByClient.get(client.id)?.riskLevel ?? null,
              sourceModule: input.sourceModule ?? "automacoes",
              sourceSuggestionId: input.sourceSuggestionId ?? null,
              playbookType: input.playbookType ?? null,
              reprocessCount: 0,
            } as Prisma.InputJsonValue,
            startedAt: now,
          },
        });
        const processed = await this.processAutomationExecution(created.id, now);
        createdExecutions.push(processed);
        scheduled += 1;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          skipped += 1;
          continue;
        }
        throw error;
      }
    }

    return {
      executionBatch: {
        scheduled,
        skipped,
        totalCandidates: candidates.length,
      },
      appliedRule: rule
        ? {
            id: rule.id,
            name: rule.name,
            triggerType: rule.triggerType,
            channel: rule.channel,
            target: rule.target,
            isActive: rule.isActive,
          }
        : null,
      playbookContext: {
        sourceModule: input.sourceModule ?? "automacoes",
        sourceSuggestionId: input.sourceSuggestionId ?? null,
        playbookType: input.playbookType ?? null,
        riskLevel: input.riskLevel ?? null,
        triggeredAt: now.toISOString(),
      },
      executions: createdExecutions.map((item) => ({
        ...item,
        startedAt: item.startedAt.toISOString(),
        finishedAt: item.finishedAt ? item.finishedAt.toISOString() : null,
      })),
    };
  }

  async reprocessAutomationExecution(input: {
    unitId: string;
    executionId: string;
    startedBy: string;
  }) {
    const current = await this.prisma.automationExecution.findFirst({
      where: {
        id: input.executionId,
        unitId: input.unitId,
      },
    });
    if (!current) throw new Error("Execucao de automacao nao encontrada");
    if (current.status !== "FAILED") {
      throw new Error("Somente execucoes com falha podem ser reprocessadas");
    }

    const currentPayload = (current.payload ?? {}) as Record<string, unknown>;
    const reprocessCount = Number(currentPayload.reprocessCount ?? 0) + 1;
    const startedAt = new Date();
    await this.prisma.automationExecution.update({
      where: { id: current.id },
      data: {
        status: "PENDING",
        attempts: 0,
        errorMessage: null,
        startedAt,
        finishedAt: null,
        payload: {
          ...currentPayload,
          startedBy: input.startedBy,
          reprocessCount,
        } as Prisma.InputJsonValue,
      },
    });

    const processed = await this.processAutomationExecution(current.id, startedAt);
    const clientName = processed.clientId
      ? (
          await this.prisma.client.findUnique({
            where: { id: processed.clientId },
            select: { fullName: true },
          })
        )?.fullName ?? null
      : null;

    return {
      execution: {
        ...processed,
        clientName,
        startedAt: processed.startedAt.toISOString(),
        finishedAt: processed.finishedAt ? processed.finishedAt.toISOString() : null,
      },
    };
  }

  async getAutomationExecutions(input: {
    unitId: string;
    start: Date;
    end: Date;
    status?: "PENDING" | "SUCCESS" | "FAILED";
  }) {
    const rows = await this.prisma.automationExecution.findMany({
      where: {
        unitId: input.unitId,
        startedAt: { gte: input.start, lte: input.end },
        ...(input.status ? { status: input.status } : {}),
      },
      include: {
        client: {
          select: { fullName: true },
        },
      },
      orderBy: { startedAt: "desc" },
    });
    const executions = rows.map((item) => ({
      ...item,
      clientName: item.client?.fullName ?? null,
      startedAt: item.startedAt.toISOString(),
      finishedAt: item.finishedAt ? item.finishedAt.toISOString() : null,
    }));
    return {
      executions,
      summary: {
        total: executions.length,
        success: executions.filter((item) => item.status === "SUCCESS").length,
        failed: executions.filter((item) => item.status === "FAILED").length,
        pending: executions.filter((item) => item.status === "PENDING").length,
      },
    };
  }

  async recalculateRetentionScoring(input: {
    unitId: string;
    scoredAt: Date;
    modelVersion?: string;
  }) {
    const modelVersion = input.modelVersion ?? "heuristic-v1";
    const clients = await this.prisma.client.findMany({
      select: { id: true },
    });
    const snapshots = [];

    for (const client of clients) {
      const snapshot = await this.buildRetentionScoreSnapshot(
        input.unitId,
        client.id,
        input.scoredAt,
        modelVersion,
      );
      await this.prisma.retentionScoreSnapshot.create({
        data: {
          id: snapshot.id,
          unitId: snapshot.unitId,
          clientId: snapshot.clientId,
          riskScore: snapshot.riskScore,
          riskLevel: snapshot.riskLevel,
          returnProbability: snapshot.returnProbability,
          reasons: snapshot.reasons,
          modelVersion: snapshot.modelVersion,
          scoredAt: snapshot.scoredAt,
        },
      });
      await this.syncRetentionCaseFromScore(snapshot);
      snapshots.push(snapshot);
    }

    return {
      modelVersion,
      processedClients: snapshots.length,
      snapshots: snapshots.map((item) => ({
        ...item,
        scoredAt: item.scoredAt.toISOString(),
      })),
    };
  }

  async getRetentionScoringOverview(input: {
    unitId: string;
    start: Date;
    end: Date;
  }) {
    const rows = await this.prisma.retentionScoreSnapshot.findMany({
      where: {
        unitId: input.unitId,
        scoredAt: { gte: input.start, lte: input.end },
      },
      orderBy: { scoredAt: "desc" },
    });
    const latest = Array.from(this.latestRetentionScoreMap(rows).values());
    const avgRisk = latest.length
      ? latest.reduce((acc, item) => acc + asNumber(item.riskScore), 0) / latest.length
      : 0;
    const avgReturnProbability = latest.length
      ? latest.reduce((acc, item) => acc + asNumber(item.returnProbability), 0) / latest.length
      : 0;

    return {
      summary: {
        totalClients: latest.length,
        high: latest.filter((item) => item.riskLevel === "HIGH").length,
        medium: latest.filter((item) => item.riskLevel === "MEDIUM").length,
        low: latest.filter((item) => item.riskLevel === "LOW").length,
        averageRiskScore: Number(avgRisk.toFixed(2)),
        averageReturnProbability: Number(avgReturnProbability.toFixed(2)),
      },
    };
  }

  async getRetentionScoringClients(input: {
    unitId: string;
    riskLevel?: "LOW" | "MEDIUM" | "HIGH";
    limit?: number;
  }) {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const rows = await this.prisma.retentionScoreSnapshot.findMany({
      where: { unitId: input.unitId },
      include: {
        client: {
          select: { fullName: true },
        },
      },
      orderBy: { scoredAt: "desc" },
    });

    const latestMap = new Map<string, (typeof rows)[number]>();
    for (const item of rows) {
      if (!latestMap.has(item.clientId)) latestMap.set(item.clientId, item);
    }
    const clients = Array.from(latestMap.values())
      .filter((item) => (!input.riskLevel ? true : item.riskLevel === input.riskLevel))
      .sort((a, b) => asNumber(b.riskScore) - asNumber(a.riskScore))
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        unitId: item.unitId,
        clientId: item.clientId,
        clientName: item.client.fullName,
        riskScore: asNumber(item.riskScore),
        riskLevel: item.riskLevel,
        returnProbability: asNumber(item.returnProbability),
        reasons: item.reasons,
        modelVersion: item.modelVersion,
        scoredAt: item.scoredAt.toISOString(),
      }));
    return { clients };
  }

  async getRetentionScoringClient(input: {
    unitId: string;
    clientId: string;
  }) {
    const client = await this.prisma.client.findUnique({
      where: { id: input.clientId },
      select: { id: true, fullName: true },
    });
    if (!client) throw new Error("Cliente nao encontrado");

    const historyRows = await this.prisma.retentionScoreSnapshot.findMany({
      where: {
        unitId: input.unitId,
        clientId: input.clientId,
      },
      orderBy: { scoredAt: "desc" },
      take: 20,
    });
    const history = historyRows.map((item) => ({
      id: item.id,
      unitId: item.unitId,
      clientId: item.clientId,
      riskScore: asNumber(item.riskScore),
      riskLevel: item.riskLevel,
      returnProbability: asNumber(item.returnProbability),
      reasons: item.reasons,
      modelVersion: item.modelVersion,
      scoredAt: item.scoredAt.toISOString(),
    }));
    return {
      client,
      latest: history[0] ?? null,
      history,
    };
  }

  async testOutboundWebhook(input: {
    unitId: string;
    provider: string;
    endpoint: string;
    eventType: string;
    payload?: Record<string, unknown>;
    occurredAt?: Date;
    triggeredBy: string;
  }) {
    const maxAttempts = 3;
    const requestedFailuresRaw = (input.payload as Record<string, unknown> | undefined)
      ?.simulateFailures;
    const requestedFailures =
      typeof requestedFailuresRaw === "number" && Number.isFinite(requestedFailuresRaw)
        ? Math.max(0, Math.floor(requestedFailuresRaw))
        : 0;
    const finalAttempt = Math.min(maxAttempts, requestedFailures + 1);
    const success = requestedFailures < maxAttempts;
    const payload = {
      eventType: input.eventType,
      ...(input.payload ?? {}),
    } as Prisma.InputJsonValue;
    const responseBody = {
      accepted: success,
      triggeredBy: input.triggeredBy,
    } as Prisma.InputJsonValue;

    const log = await this.prisma.integrationWebhookLog.create({
      data: {
        id: crypto.randomUUID(),
        unitId: input.unitId,
        provider: input.provider,
        direction: "OUTBOUND",
        endpoint: input.endpoint,
        status: success ? "SUCCESS" : "FAILED",
        httpStatus: success ? 202 : 502,
        attempt: finalAttempt,
        correlationId: crypto.randomUUID(),
        payload,
        responseBody,
        errorMessage: success ? null : `Falha de entrega apos ${maxAttempts} tentativas`,
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
    return {
      delivery: {
        ...log,
        occurredAt: log.occurredAt.toISOString(),
      },
    };
  }

  async receiveInboundWebhook(input: {
    provider: string;
    unitId: string;
    endpoint: string;
    payload?: Record<string, unknown>;
    occurredAt?: Date;
  }) {
    const forceFailure = Boolean(
      (input.payload as Record<string, unknown> | undefined)?.forceFailure,
    );
    const payload = (input.payload ?? undefined) as Prisma.InputJsonValue | undefined;
    const log = await this.prisma.integrationWebhookLog.create({
      data: {
        id: crypto.randomUUID(),
        unitId: input.unitId,
        provider: input.provider,
        direction: "INBOUND",
        endpoint: input.endpoint,
        status: forceFailure ? "FAILED" : "SUCCESS",
        httpStatus: forceFailure ? 400 : 200,
        attempt: 1,
        correlationId: crypto.randomUUID(),
        payload,
        responseBody: { received: !forceFailure } as Prisma.InputJsonValue,
        errorMessage: forceFailure ? "Payload inbound invalido para o provedor" : null,
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
    return {
      received: !forceFailure,
      log: {
        ...log,
        occurredAt: log.occurredAt.toISOString(),
      },
    };
  }

  async getIntegrationWebhookLogs(input: {
    unitId: string;
    provider?: string;
    status?: "SUCCESS" | "FAILED";
    start: Date;
    end: Date;
  }) {
    const rows = await this.prisma.integrationWebhookLog.findMany({
      where: {
        unitId: input.unitId,
        occurredAt: { gte: input.start, lte: input.end },
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      orderBy: { occurredAt: "desc" },
    });
    const logs = rows.map((item) => ({
      ...item,
      occurredAt: item.occurredAt.toISOString(),
    }));
    return {
      logs,
      summary: {
        total: logs.length,
        success: logs.filter((item) => item.status === "SUCCESS").length,
        failed: logs.filter((item) => item.status === "FAILED").length,
      },
    };
  }

  async syncBillingSubscriptions(input: {
    unitId: string;
    occurredAt: Date;
    changedBy: string;
  }) {
    const subscriptions = await this.prisma.clientSubscription.findMany({
      where: {
        unitId: input.unitId,
        status: "ACTIVE",
        nextBillingAt: { lte: input.occurredAt },
      },
      include: { plan: true },
    });
    let synced = 0;
    const events = [];

    for (const subscription of subscriptions) {
      const exists = await this.prisma.billingSubscriptionEvent.findFirst({
        where: {
          subscriptionId: subscription.id,
          eventType: "RENEWED",
          occurredAt: input.occurredAt,
        },
      });
      if (exists) continue;

      const eventId = crypto.randomUUID();
      const amount = asNumber(subscription.plan.priceMonthly);
      await this.prisma.$transaction(async (tx) => {
        await tx.billingSubscriptionEvent.create({
          data: {
            id: eventId,
            unitId: input.unitId,
            subscriptionId: subscription.id,
            externalSubscriptionId: `ext-${subscription.id}`,
            eventType: "RENEWED",
            amount,
            status: "PAID",
            occurredAt: input.occurredAt,
            payload: { changedBy: input.changedBy },
          },
        });
        await tx.financialEntry.create({
          data: {
            id: crypto.randomUUID(),
            unitId: input.unitId,
            kind: "INCOME",
            source: "SERVICE",
            amount,
            occurredAt: input.occurredAt,
            referenceType: "MANUAL",
            referenceId: subscription.id,
            description: `Recorrencia de assinatura: ${subscription.plan.name}`,
          },
        });
        const nextBilling = new Date(subscription.nextBillingAt);
        nextBilling.setMonth(nextBilling.getMonth() + 1);
        await tx.clientSubscription.update({
          where: { id: subscription.id },
          data: {
            cycleCount: { increment: 1 },
            nextBillingAt: nextBilling,
          },
        });
      });

      const created = await this.prisma.billingSubscriptionEvent.findUnique({
        where: { id: eventId },
      });
      if (created) events.push(created);
      synced += 1;
    }

    return {
      summary: {
        processed: subscriptions.length,
        synced,
      },
      events: events.map((item) => ({
        ...item,
        amount: asNumber(item.amount),
        occurredAt: item.occurredAt.toISOString(),
      })),
    };
  }

  async processBillingWebhookEvent(
    input: BillingWebhookEventInput,
  ): Promise<BillingWebhookProcessResult> {
    const eventId = input.eventId?.trim();
    const idempotencyKey = input.idempotencyKey?.trim();
    const dedupeFilters: Prisma.BillingSubscriptionEventWhereInput[] = [];
    if (eventId) {
      dedupeFilters.push({
        payload: { path: ["eventId"], equals: eventId },
      });
    }
    if (idempotencyKey) {
      dedupeFilters.push({
        payload: { path: ["idempotencyKey"], equals: idempotencyKey },
      });
    }

    if (dedupeFilters.length > 0) {
      const existing = await this.prisma.billingSubscriptionEvent.findFirst({
        where: {
          unitId: input.unitId,
          OR: dedupeFilters,
        },
      });
      if (existing) {
        await this.prisma.integrationWebhookLog.create({
          data: {
            id: crypto.randomUUID(),
            unitId: input.unitId,
            provider: input.provider,
            direction: "INBOUND",
            endpoint: input.endpoint,
            status: "SUCCESS",
            httpStatus: 200,
            attempt: 1,
            correlationId: input.correlationId ?? crypto.randomUUID(),
            payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
            responseBody: { received: true, deduplicated: true } as Prisma.InputJsonValue,
            occurredAt: input.occurredAt,
          },
        });
        return {
          received: true,
          deduplicated: true,
          event: this.mapBillingEventToResponse(existing),
          subscription: null,
        };
      }
    }

    const subscription = await this.resolveSubscriptionForWebhook({
      unitId: input.unitId,
      subscriptionId: input.subscriptionId,
      externalSubscriptionId: input.externalSubscriptionId,
    });
    const amount =
      typeof input.amount === "number" && Number.isFinite(input.amount) ? input.amount : undefined;
    const eventIdCreated = crypto.randomUUID();
    const payload: Prisma.InputJsonValue = {
      ...(input.payload ?? {}),
      provider: input.provider,
      eventId,
      idempotencyKey,
    } as Prisma.InputJsonObject;

    await this.prisma.$transaction(async (tx) => {
      await tx.billingSubscriptionEvent.create({
        data: {
          id: eventIdCreated,
          unitId: input.unitId,
          subscriptionId: subscription?.id,
          externalSubscriptionId: input.externalSubscriptionId,
          eventType: input.eventType,
          amount,
          status: input.status,
          occurredAt: input.occurredAt,
          payload,
        },
      });

      if (subscription) {
        if (input.eventType === "RENEWED" && input.status === "PAID" && amount && amount > 0) {
          await tx.financialEntry.create({
            data: {
              id: crypto.randomUUID(),
              unitId: input.unitId,
              kind: "INCOME",
              source: "SERVICE",
              amount,
              occurredAt: input.occurredAt,
              referenceType: "MANUAL",
              referenceId: subscription.id,
              description: "Recorrencia de assinatura (webhook gateway)",
            },
          });
          const nextBilling = new Date(subscription.nextBillingAt);
          nextBilling.setMonth(nextBilling.getMonth() + 1);
          await tx.clientSubscription.update({
            where: { id: subscription.id },
            data: {
              status: "ACTIVE",
              nextBillingAt: nextBilling,
              cycleCount: { increment: 1 },
            },
          });
        } else if (input.eventType === "CHARGE_FAILED" || input.status === "FAILED") {
          await tx.clientSubscription.update({
            where: { id: subscription.id },
            data: { status: "PAST_DUE" },
          });
        } else if (input.eventType === "CANCELLED" || input.status === "CANCELLED") {
          await tx.clientSubscription.update({
            where: { id: subscription.id },
            data: { status: "CANCELLED" },
          });
        }
      }

      await tx.integrationWebhookLog.create({
        data: {
          id: crypto.randomUUID(),
          unitId: input.unitId,
          provider: input.provider,
          direction: "INBOUND",
          endpoint: input.endpoint,
          status: "SUCCESS",
          httpStatus: 200,
          attempt: 1,
          correlationId: input.correlationId ?? crypto.randomUUID(),
          payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
          responseBody: { received: true, deduplicated: false } as Prisma.InputJsonValue,
          occurredAt: input.occurredAt,
        },
      });
    });

    const created = await this.prisma.billingSubscriptionEvent.findUnique({
      where: { id: eventIdCreated },
    });
    const updatedSubscription = subscription
      ? await this.prisma.clientSubscription.findUnique({
          where: { id: subscription.id },
          select: { id: true, status: true, nextBillingAt: true },
        })
      : null;

    if (!created) throw new Error("Falha ao persistir evento de cobranca");
    return {
      received: true,
      deduplicated: false,
      event: this.mapBillingEventToResponse(created),
      subscription: updatedSubscription
        ? {
            id: updatedSubscription.id,
            status: updatedSubscription.status,
            nextBillingAt: updatedSubscription.nextBillingAt.toISOString(),
          }
        : null,
    };
  }

  async runBillingReconciliation(input: { unitId: string; start: Date; end: Date }) {
    return await this.buildBillingReconciliation(input);
  }

  async getBillingReconciliationSummary(input: { unitId: string; start: Date; end: Date }) {
    const snapshot = await this.buildBillingReconciliation(input);
    return { summary: snapshot.summary };
  }

  async getBillingReconciliationDiscrepancies(input: {
    unitId: string;
    start: Date;
    end: Date;
    status?: "OPEN" | "RESOLVED";
    type?:
      | "MISSING_FINANCIAL_ENTRY"
      | "AMOUNT_MISMATCH"
      | "DUPLICATE_EVENT"
      | "STATUS_MISMATCH";
    limit?: number;
  }) {
    const snapshot = await this.buildBillingReconciliation(input);
    const limit = Math.min(Math.max(input.limit ?? 200, 1), 500);
    const discrepancies = snapshot.discrepancies
      .filter((item) => (!input.status ? true : item.status === input.status))
      .filter((item) => (!input.type ? true : item.type === input.type))
      .slice(0, limit);
    return {
      discrepancies,
      summary: {
        ...snapshot.summary,
        filtered: discrepancies.length,
      },
    };
  }

  async resolveBillingReconciliationDiscrepancy(input: {
    unitId: string;
    discrepancyId: string;
    resolvedBy: string;
    action: string;
    note?: string;
    start: Date;
    end: Date;
  }) {
    const snapshot = await this.buildBillingReconciliation({
      unitId: input.unitId,
      start: input.start,
      end: input.end,
    });
    const discrepancy = snapshot.discrepancies.find((item) => item.id === input.discrepancyId);
    if (!discrepancy) {
      throw new Error("Divergencia de reconciliacao nao encontrada");
    }
    const resolution = {
      resolvedAt: new Date().toISOString(),
      resolvedBy: input.resolvedBy,
      action: input.action,
      note: input.note?.trim() || undefined,
    };
    this.reconciliationResolutions.set(discrepancy.id, resolution);
    return {
      discrepancy: {
        ...discrepancy,
        status: "RESOLVED" as const,
        resolution,
      },
    };
  }

  private mapBillingEventToResponse(event: {
    id: string;
    unitId: string;
    subscriptionId: string | null;
    externalSubscriptionId: string | null;
    eventType: string;
    amount: Prisma.Decimal | number | null;
    status: string;
    occurredAt: Date;
    payload: Prisma.JsonValue | null;
  }) {
    return {
      id: event.id,
      unitId: event.unitId,
      subscriptionId: event.subscriptionId ?? undefined,
      externalSubscriptionId: event.externalSubscriptionId ?? undefined,
      eventType: this.normalizeBillingEventType(event.eventType),
      amount: asNumber(event.amount),
      status: this.normalizeBillingStatus(event.status),
      occurredAt: event.occurredAt.toISOString(),
      payload:
        event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
          ? (event.payload as Record<string, unknown>)
          : undefined,
    };
  }

  private normalizeBillingEventType(value: string): "RENEWED" | "CHARGE_FAILED" | "CANCELLED" {
    if (value === "CHARGE_FAILED") return value;
    if (value === "CANCELLED") return value;
    return "RENEWED";
  }

  private normalizeBillingStatus(value: string): "PAID" | "FAILED" | "CANCELLED" {
    if (value === "FAILED") return value;
    if (value === "CANCELLED") return value;
    return "PAID";
  }

  private async buildBillingReconciliation(input: { unitId: string; start: Date; end: Date }) {
    const [events, financialEntries, subscriptions] = await Promise.all([
      this.prisma.billingSubscriptionEvent.findMany({
        where: {
          unitId: input.unitId,
          occurredAt: { gte: input.start, lte: input.end },
        },
        orderBy: { occurredAt: "desc" },
      }),
      this.prisma.financialEntry.findMany({
        where: {
          unitId: input.unitId,
          kind: "INCOME",
          occurredAt: { gte: input.start, lte: input.end },
        },
        orderBy: { occurredAt: "desc" },
      }),
      this.prisma.clientSubscription.findMany({
        where: { unitId: input.unitId },
        select: { id: true, status: true },
      }),
    ]);

    const discrepancies: BillingReconciliationDiscrepancy[] = [];
    const duplicateKeys = new Map<string, string>();

    for (const event of events) {
      const key = this.buildBillingDedupeKey({
        subscriptionId: event.subscriptionId ?? undefined,
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        payload: event.payload,
      });
      if (key) {
        if (duplicateKeys.has(key)) {
          discrepancies.push(
            this.applyBillingResolution({
              id: `duplicate:${event.id}`,
              unitId: input.unitId,
              type: "DUPLICATE_EVENT",
              status: "OPEN",
              subscriptionId: event.subscriptionId ?? undefined,
              eventId: event.id,
              message: "Evento de cobranca duplicado detectado para a mesma chave idempotente.",
              occurredAt: event.occurredAt.toISOString(),
              metadata: {
                dedupeKey: key,
                originalEventId: duplicateKeys.get(key),
              },
            }),
          );
        } else {
          duplicateKeys.set(key, event.id);
        }
      }

      const normalizedEventType = this.normalizeBillingEventType(event.eventType);
      const normalizedStatus = this.normalizeBillingStatus(event.status);
      if (normalizedEventType === "RENEWED" && normalizedStatus === "PAID") {
        const eventAmount = asNumber(event.amount);
        const dayKey = this.toUtcDayKey(event.occurredAt);
        const relatedFinancial = financialEntries.filter(
          (entry) =>
            entry.referenceId === event.subscriptionId &&
            this.toUtcDayKey(entry.occurredAt) === dayKey,
        );
        if (relatedFinancial.length === 0) {
          discrepancies.push(
            this.applyBillingResolution({
              id: `missing-financial:${event.id}`,
              unitId: input.unitId,
              type: "MISSING_FINANCIAL_ENTRY",
              status: "OPEN",
              subscriptionId: event.subscriptionId ?? undefined,
              eventId: event.id,
              message: "Evento pago sem lancamento financeiro correspondente.",
              expected: `Lancamento financeiro de ${eventAmount.toFixed(2)}`,
              actual: "Nenhum lancamento encontrado",
              occurredAt: event.occurredAt.toISOString(),
            }),
          );
        } else {
          const hasAmountMatch = relatedFinancial.some(
            (entry) => Math.abs(asNumber(entry.amount) - eventAmount) < 0.01,
          );
          if (!hasAmountMatch) {
            discrepancies.push(
              this.applyBillingResolution({
                id: `amount-mismatch:${event.id}`,
                unitId: input.unitId,
                type: "AMOUNT_MISMATCH",
                status: "OPEN",
                subscriptionId: event.subscriptionId ?? undefined,
                eventId: event.id,
                message: "Valor do evento de cobranca diverge do financeiro.",
                expected: eventAmount.toFixed(2),
                actual: relatedFinancial
                  .map((entry) => asNumber(entry.amount).toFixed(2))
                  .join(", "),
                occurredAt: event.occurredAt.toISOString(),
              }),
            );
          }
        }
      }
    }

    for (const subscription of subscriptions) {
      const latestEvent = events.find((item) => item.subscriptionId === subscription.id);
      if (!latestEvent) continue;
      const expectedStatus = this.expectedSubscriptionStatusFromEvent(
        this.normalizeBillingStatus(latestEvent.status),
      );
      if (expectedStatus && expectedStatus !== subscription.status) {
        discrepancies.push(
          this.applyBillingResolution({
            id: `status-mismatch:${subscription.id}:${latestEvent.id}`,
            unitId: input.unitId,
            type: "STATUS_MISMATCH",
            status: "OPEN",
            subscriptionId: subscription.id,
            eventId: latestEvent.id,
            message: "Status da assinatura diverge do ultimo evento de cobranca.",
            expected: expectedStatus,
            actual: subscription.status,
            occurredAt: latestEvent.occurredAt.toISOString(),
          }),
        );
      }
    }

    const resolved = discrepancies.filter((item) => item.status === "RESOLVED").length;
    const open = discrepancies.length - resolved;

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        eventsAnalyzed: events.length,
        discrepancies: discrepancies.length,
        open,
        resolved,
        byType: {
          missingFinancialEntry: discrepancies.filter(
            (item) => item.type === "MISSING_FINANCIAL_ENTRY",
          ).length,
          amountMismatch: discrepancies.filter((item) => item.type === "AMOUNT_MISMATCH").length,
          duplicateEvent: discrepancies.filter((item) => item.type === "DUPLICATE_EVENT").length,
          statusMismatch: discrepancies.filter((item) => item.type === "STATUS_MISMATCH").length,
        },
      },
      discrepancies: discrepancies.sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      ),
    };
  }

  private applyBillingResolution(
    discrepancy: BillingReconciliationDiscrepancy,
  ): BillingReconciliationDiscrepancy {
    const resolution = this.reconciliationResolutions.get(discrepancy.id);
    if (!resolution) return discrepancy;
    return {
      ...discrepancy,
      status: "RESOLVED",
      resolution,
    };
  }

  private buildBillingDedupeKey(input: {
    subscriptionId?: string;
    eventType: string;
    occurredAt: Date;
    payload: Prisma.JsonValue | null;
  }) {
    const payload =
      input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)
        ? (input.payload as Record<string, unknown>)
        : {};
    const byEventId = typeof payload.eventId === "string" ? payload.eventId.trim() : "";
    const byIdempotency =
      typeof payload.idempotencyKey === "string" ? payload.idempotencyKey.trim() : "";
    if (byEventId) return `event:${byEventId}`;
    if (byIdempotency) return `idem:${byIdempotency}`;
    if (!input.subscriptionId) return "";
    return `fallback:${input.subscriptionId}:${input.eventType}:${this.toUtcDayKey(input.occurredAt)}`;
  }

  private toUtcDayKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private expectedSubscriptionStatusFromEvent(status: "PAID" | "FAILED" | "CANCELLED") {
    if (status === "PAID") return "ACTIVE" as const;
    if (status === "FAILED") return "PAST_DUE" as const;
    if (status === "CANCELLED") return "CANCELLED" as const;
    return undefined;
  }

  private async resolveSubscriptionForWebhook(input: {
    unitId: string;
    subscriptionId?: string;
    externalSubscriptionId?: string;
  }) {
    if (input.subscriptionId) {
      const byId = await this.prisma.clientSubscription.findFirst({
        where: {
          id: input.subscriptionId,
          unitId: input.unitId,
        },
      });
      if (byId) return byId;
    }
    const external = input.externalSubscriptionId?.trim();
    if (external?.startsWith("ext-")) {
      const internalId = external.slice(4);
      return await this.prisma.clientSubscription.findFirst({
        where: {
          id: internalId,
          unitId: input.unitId,
        },
      });
    }
    return null;
  }

  async getMultiUnitOverview(input: { start: Date; end: Date }) {
    const units = await this.prisma.unit.findMany({ orderBy: { name: "asc" } });
    const result = [];
    for (const unit of units) {
      const [incomeAgg, appointments] = await Promise.all([
        this.prisma.financialEntry.aggregate({
          _sum: { amount: true },
          where: {
            unitId: unit.id,
            kind: "INCOME",
            occurredAt: { gte: input.start, lte: input.end },
          },
        }),
        this.prisma.appointment.findMany({
          where: {
            unitId: unit.id,
            startsAt: { gte: input.start, lte: input.end },
          },
          select: { status: true },
        }),
      ]);
      const completed = appointments.filter((item) => item.status === "COMPLETED").length;
      const revenue = asNumber(incomeAgg._sum.amount);
      result.push({
        unitId: unit.id,
        unitName: unit.name,
        revenue: Number(revenue.toFixed(2)),
        appointments: appointments.length,
        completed,
        occupancyRate: appointments.length
          ? Number(((completed / appointments.length) * 100).toFixed(1))
          : 0,
      });
    }

    const totalRevenue = result.reduce((acc, item) => acc + item.revenue, 0);
    const totalAppointments = result.reduce((acc, item) => acc + item.appointments, 0);
    const totalCompleted = result.reduce((acc, item) => acc + item.completed, 0);
    return {
      units: result,
      summary: {
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalAppointments,
        totalCompleted,
        occupancyRate: totalAppointments
          ? Number(((totalCompleted / totalAppointments) * 100).toFixed(1))
          : 0,
      },
    };
  }

  async getMultiUnitBenchmark(input: {
    start: Date;
    end: Date;
    metric: "revenue" | "occupancy" | "ticket";
  }) {
    const overview = await this.getMultiUnitOverview(input);
    const ranking = overview.units
      .map((item) => ({
        unitId: item.unitId,
        unitName: item.unitName,
        revenue: item.revenue,
        occupancy: item.occupancyRate,
        ticket: item.completed ? Number((item.revenue / item.completed).toFixed(2)) : 0,
      }))
      .sort((a, b) => {
        if (input.metric === "occupancy") return b.occupancy - a.occupancy;
        if (input.metric === "ticket") return b.ticket - a.ticket;
        return b.revenue - a.revenue;
      });
    return { metric: input.metric, ranking };
  }

  async getDailyAgenda(input: { unitId: string; date: Date }) {
    const range = dayRange(input.date);
    return this.getAgendaRange({
      unitId: input.unitId,
      start: range.start,
      end: range.end,
    });
  }

  async getAgendaRange(input: { unitId: string; start: Date; end: Date }) {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        unitId: input.unitId,
        startsAt: { gte: input.start, lte: input.end },
      },
      include: {
        client: true,
        professional: true,
        service: true,
      },
      orderBy: { startsAt: "asc" },
    });

    return appointments.map((appointment) => this.buildAppointmentView(appointment));
  }

  async getAppointments(input: {
    unitId: string;
    start?: Date;
    end?: Date;
    status?: AppointmentStatus[];
    clientId?: string;
    professionalId?: string;
    serviceId?: string;
    search?: string;
  }) {
    const rows = await this.prisma.appointment.findMany({
      where: {
        unitId: input.unitId,
        ...(input.start || input.end
          ? {
              startsAt: {
                ...(input.start ? { gte: input.start } : {}),
                ...(input.end ? { lte: input.end } : {}),
              },
            }
          : {}),
        ...(input.status?.length ? { status: { in: input.status } } : {}),
        ...(input.clientId ? { clientId: input.clientId } : {}),
        ...(input.professionalId ? { professionalId: input.professionalId } : {}),
        ...(input.serviceId ? { serviceId: input.serviceId } : {}),
        ...(input.search
          ? {
              OR: [
                { client: { fullName: { contains: input.search, mode: "insensitive" } } },
                { client: { phone: { contains: input.search, mode: "insensitive" } } },
                { professional: { name: { contains: input.search, mode: "insensitive" } } },
                { service: { name: { contains: input.search, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: {
        client: true,
        professional: true,
        service: true,
        history: { orderBy: { changedAt: "asc" } },
      },
      orderBy: { startsAt: "asc" },
    });

    return rows.map((row) => this.buildAppointmentView(row));
  }

  async getAppointmentById(input: {
    appointmentId: string;
    unitId?: string;
  }) {
    const row = await this.prisma.appointment.findFirst({
      where: {
        id: input.appointmentId,
        ...(input.unitId ? { unitId: input.unitId } : {}),
      },
      include: {
        client: true,
        professional: true,
        service: true,
        history: { orderBy: { changedAt: "desc" } },
      },
    });

    if (!row) throw new Error("Agendamento nao encontrado");
    const view = this.buildAppointmentView(row);
    return {
      ...view,
      history: row.history.map((entry) => ({
        changedAt: entry.changedAt.toISOString(),
        changedBy: entry.changedBy,
        action: entry.action,
        reason: entry.reason,
      })),
    };
  }

  async updateAppointment(input: {
    appointmentId: string;
    unitId?: string;
    startsAt?: Date;
    clientId?: string;
    professionalId?: string;
    serviceId?: string;
    notes?: string;
    isFitting?: boolean;
    confirmation?: boolean;
    changedBy: string;
  }) {
    const current = await this.prisma.appointment.findUnique({
      where: { id: input.appointmentId },
      include: {
        history: { orderBy: { changedAt: "asc" } },
        service: true,
      },
    });
    if (!current) throw new Error("Agendamento nao encontrado");
    if (input.unitId && current.unitId !== input.unitId) {
      throw new Error("Unidade nao autorizada");
    }

    const nextClientId = input.clientId ?? current.clientId;
    const nextProfessionalId = input.professionalId ?? current.professionalId;
    const nextServiceId = input.serviceId ?? current.serviceId;
    const nextStartsAt = input.startsAt ?? current.startsAt;

    const [serviceRow, professionalRow, clientRow] = await Promise.all([
      this.prisma.service.findFirst({
        where: { id: nextServiceId, businessId: current.unitId },
      }),
      this.prisma.professional.findUnique({ where: { id: nextProfessionalId } }),
      this.prisma.client.findFirst({
        where: { id: nextClientId, businessId: current.unitId },
      }),
    ]);

    if (!serviceRow || !serviceRow.active) throw new Error("Servico nao encontrado ou inativo");
    if (!professionalRow || !professionalRow.active) {
      throw new Error("Profissional nao encontrado ou inativo");
    }
    await this.assertProfessionalCanExecuteService(serviceRow.id, professionalRow.id);
    if (!clientRow) throw new Error("Cliente nao encontrado");

    const nextEndsAt = new Date(nextStartsAt.getTime() + serviceRow.durationMin * 60_000);
    const overlappingRows = await this.prisma.appointment.findMany({
      where: {
        unitId: current.unitId,
        id: { not: current.id },
        professionalId: nextProfessionalId,
        status: { in: ACTIVE_APPOINTMENT_CONFLICT_STATUSES },
        startsAt: { lt: nextEndsAt },
        endsAt: { gt: nextStartsAt },
      },
      select: {
        id: true,
        unitId: true,
        clientId: true,
        professionalId: true,
        serviceId: true,
        startsAt: true,
        endsAt: true,
        status: true,
        isFitting: true,
        notes: true,
      },
    });

    const hasConflict = hasAppointmentConflict({
      businessId: current.unitId,
      professionalId: nextProfessionalId,
      startsAt: nextStartsAt,
      endsAt: nextEndsAt,
      ignoreAppointmentId: current.id,
      existingAppointments: overlappingRows.map((item) => this.mapAppointment(item)),
    });
    if (hasConflict) {
      throw new Error("Conflito de horario detectado para o profissional");
    }

    const hasMainChange =
      nextClientId !== current.clientId ||
      nextProfessionalId !== current.professionalId ||
      nextServiceId !== current.serviceId ||
      nextStartsAt.getTime() !== current.startsAt.getTime() ||
      (input.notes !== undefined ? input.notes : current.notes ?? undefined) !==
        (current.notes ?? undefined) ||
      (input.isFitting !== undefined ? Boolean(input.isFitting) : current.isFitting) !==
        current.isFitting;

    const updatedBase = await this.prisma.appointment.update({
      where: { id: current.id },
      data: {
        clientId: nextClientId,
        professionalId: nextProfessionalId,
        serviceId: nextServiceId,
        startsAt: nextStartsAt,
        endsAt: nextEndsAt,
        notes: input.notes !== undefined ? input.notes : current.notes,
        isFitting: input.isFitting !== undefined ? Boolean(input.isFitting) : current.isFitting,
        ...(hasMainChange
          ? {
              history: {
                create: {
                  id: crypto.randomUUID(),
                  changedAt: new Date(),
                  changedBy: input.changedBy,
                  action: "RESCHEDULED",
                  reason: "Atualizacao manual do agendamento",
                },
              },
            }
          : {}),
      },
      include: {
        client: true,
        professional: true,
        service: true,
        history: { orderBy: { changedAt: "asc" } },
      },
    });

    if (input.confirmation === true && updatedBase.status === "SCHEDULED") {
      await this.updateStatus({
        appointmentId: updatedBase.id,
        unitId: input.unitId,
        status: "CONFIRMED",
        changedBy: input.changedBy,
        reason: "Confirmado na central de agendamentos",
      });
    }

    const finalRow = await this.prisma.appointment.findUnique({
      where: { id: current.id },
      include: {
        client: true,
        professional: true,
        service: true,
        history: { orderBy: { changedAt: "asc" } },
      },
    });
    if (!finalRow) throw new Error("Agendamento nao encontrado");
    return this.buildAppointmentView(finalRow);
  }

  async suggestAppointmentAlternatives(input: {
    unitId: string;
    professionalId: string;
    serviceId: string;
    startsAt: Date;
    windowHours?: number;
  }) {
    const [serviceRow, professionalRow] = await Promise.all([
      this.prisma.service.findUnique({
        where: { id: input.serviceId },
        select: { id: true, active: true, durationMin: true },
      }),
      this.prisma.professional.findUnique({
        where: { id: input.professionalId },
        select: { id: true, active: true },
      }),
    ]);

    if (!serviceRow || !serviceRow.active) {
      throw new Error("Servico nao encontrado ou inativo");
    }
    if (!professionalRow || !professionalRow.active) {
      throw new Error("Profissional nao encontrado ou inativo");
    }
    await this.assertProfessionalCanExecuteService(serviceRow.id, professionalRow.id);

    const windowHours = Math.min(Math.max(input.windowHours ?? 6, 1), 24);
    const windowStart = new Date(input.startsAt.getTime() - 2 * 60 * 60 * 1000);
    const windowEnd = new Date(input.startsAt.getTime() + windowHours * 60 * 60 * 1000);
    const durationMs = serviceRow.durationMin * 60_000;
    const stepMs = 15 * 60_000;

    const overlappingRows = await this.prisma.appointment.findMany({
      where: {
        unitId: input.unitId,
        professionalId: input.professionalId,
        status: { in: ACTIVE_APPOINTMENT_CONFLICT_STATUSES },
        startsAt: { lt: new Date(windowEnd.getTime() + durationMs) },
        endsAt: { gt: windowStart },
      },
      select: {
        id: true,
        unitId: true,
        clientId: true,
        professionalId: true,
        serviceId: true,
        startsAt: true,
        endsAt: true,
        status: true,
        isFitting: true,
        notes: true,
      },
    });

    const existingAppointments = overlappingRows.map((item) => this.mapAppointment(item));
    const suggestions: Array<{ startsAt: string; endsAt: string; reason: string }> = [];

    for (let cursor = windowStart.getTime(); cursor <= windowEnd.getTime(); cursor += stepMs) {
      const startsAt = new Date(cursor);
      const endsAt = new Date(startsAt.getTime() + durationMs);
      const conflict = hasAppointmentConflict({
        businessId: input.unitId,
        professionalId: input.professionalId,
        startsAt,
        endsAt,
        existingAppointments,
      });
      if (conflict) continue;
      if (startsAt.getTime() === input.startsAt.getTime()) continue;

      suggestions.push({
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        reason: "Disponivel no recorte solicitado",
      });
    }

    return suggestions
      .sort((a, b) => {
        const diffA = Math.abs(new Date(a.startsAt).getTime() - input.startsAt.getTime());
        const diffB = Math.abs(new Date(b.startsAt).getTime() - input.startsAt.getTime());
        return diffA - diffB;
      })
      .slice(0, 5);
  }

  async getDashboard(input: { unitId: string; date: Date }): Promise<DashboardPayload> {
    const baseThresholds = this.getDashboardThresholds(input.unitId);
    const telemetrySummary = summarizeDashboardSuggestionTelemetry(
      this.getDashboardSuggestionTelemetryWindow(input.unitId, input.date),
    );
    const playbookHistory = buildDashboardPlaybookHistory({
      events: this.getDashboardSuggestionTelemetryWindow(input.unitId, input.date),
      windowDays: 45,
    });
    const { thresholds, tuning } = calibrateDashboardThresholds({
      base: baseThresholds,
      telemetry: telemetrySummary,
    });
    const day = dayRange(input.date);
    const week = weekRange(input.date);
    const month = monthRange(input.date);
    const prevDay = shiftRange(day.start, day.end, -1);
    const prevWeek = shiftRange(week.start, week.end, -7);
    const prevMonth = monthRange(
      new Date(input.date.getFullYear(), input.date.getMonth() - 1, 1),
    );
    const historicalWindowStart = new Date(day.start.getTime() - 90 * 24 * 60 * 60 * 1000);
    const eligibleFutureStatuses: AppointmentStatus[] = [
      "SCHEDULED",
      "CONFIRMED",
      "IN_SERVICE",
    ];

    const [
      appointmentsToday,
      appointmentsMonth,
      products,
      incomeDay,
      incomeWeek,
      incomeMonth,
      expenseMonth,
      incomePrevWeek,
      incomePrevMonth,
      incomePrevDay,
      incomeServiceMonth,
      incomeProductMonth,
      salesMonth,
      salesItemsMonth,
      completedByClient,
      commissionsMonth,
      professionals,
      forecastAppointments,
      historicalResolvedAppointments,
      completedRevenueHistory,
    ] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          unitId: input.unitId,
          startsAt: { gte: day.start, lte: day.end },
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          unitId: input.unitId,
          startsAt: { gte: month.start, lt: month.end },
        },
        include: {
          service: true,
          professional: true,
          client: true,
        },
      }),
      this.prisma.product.findMany({
        where: { active: true },
        select: { id: true, name: true, stockQty: true, minStockAlert: true },
      }),
      this.prisma.financialEntry.aggregate({
        where: {
          unitId: input.unitId,
          kind: "INCOME",
          occurredAt: { gte: day.start, lte: day.end },
        },
        _sum: { amount: true },
      }),
      this.prisma.financialEntry.aggregate({
        where: {
          unitId: input.unitId,
          kind: "INCOME",
          occurredAt: { gte: week.start, lte: week.end },
        },
        _sum: { amount: true },
      }),
      this.prisma.financialEntry.aggregate({
        where: {
          unitId: input.unitId,
          kind: "INCOME",
          occurredAt: { gte: month.start, lt: month.end },
        },
        _sum: { amount: true },
      }),
      this.prisma.financialEntry.aggregate({
        where: {
          unitId: input.unitId,
          kind: "EXPENSE",
          occurredAt: { gte: month.start, lt: month.end },
        },
        _sum: { amount: true },
      }),
      this.prisma.financialEntry.aggregate({
        where: {
          unitId: input.unitId,
          kind: "INCOME",
          occurredAt: { gte: prevWeek.start, lte: prevWeek.end },
        },
        _sum: { amount: true },
      }),
      this.prisma.financialEntry.aggregate({
        where: {
          unitId: input.unitId,
          kind: "INCOME",
          occurredAt: { gte: prevMonth.start, lt: prevMonth.end },
        },
        _sum: { amount: true },
      }),
      this.prisma.financialEntry.aggregate({
        where: {
          unitId: input.unitId,
          kind: "INCOME",
          occurredAt: { gte: prevDay.start, lte: prevDay.end },
        },
        _sum: { amount: true },
      }),
      this.prisma.financialEntry.aggregate({
        where: {
          unitId: input.unitId,
          kind: "INCOME",
          source: "SERVICE",
          occurredAt: { gte: month.start, lt: month.end },
        },
        _sum: { amount: true },
      }),
      this.prisma.financialEntry.aggregate({
        where: {
          unitId: input.unitId,
          kind: "INCOME",
          source: "PRODUCT",
          occurredAt: { gte: month.start, lt: month.end },
        },
        _sum: { amount: true },
      }),
      this.prisma.productSale.findMany({
        where: {
          unitId: input.unitId,
          soldAt: { gte: month.start, lt: month.end },
        },
        include: { items: true },
      }),
      this.prisma.productSaleItem.findMany({
        where: {
          productSale: {
            unitId: input.unitId,
            soldAt: { gte: month.start, lt: month.end },
          },
        },
        include: { product: true },
      }),
      this.prisma.appointment.groupBy({
        by: ["clientId"],
        where: {
          unitId: input.unitId,
          status: "COMPLETED",
        },
        _max: { endsAt: true },
      }),
      this.prisma.commissionEntry.findMany({
        where: {
          unitId: input.unitId,
          occurredAt: { gte: month.start, lt: month.end },
        },
        include: {
          professional: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.professional.findMany({
        where: { active: true },
        select: { id: true, name: true },
      }),
      this.prisma.appointment.findMany({
        where: {
          unitId: input.unitId,
          status: { in: eligibleFutureStatuses },
          startsAt: { gte: day.start, lte: month.end },
        },
        include: {
          service: {
            select: { id: true, price: true },
          },
          professional: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          unitId: input.unitId,
          startsAt: { gte: historicalWindowStart, lt: day.start },
          status: { in: ["COMPLETED", "CANCELLED", "NO_SHOW"] },
        },
        select: { status: true },
      }),
      this.prisma.appointment.findMany({
        where: {
          unitId: input.unitId,
          startsAt: { lt: day.start },
          status: "COMPLETED",
        },
        include: {
          service: {
            select: { price: true },
          },
          client: {
            select: { id: true, fullName: true },
          },
        },
      }),
    ]);

    const monthCompletedWithService = appointmentsMonth.filter(
      (item) => item.status === "COMPLETED",
    );
    const completedMonth = appointmentsMonth.filter((item) => item.status === "COMPLETED");
    const cancelledMonth = appointmentsMonth.filter((item) => item.status === "CANCELLED");
    const noShowMonth = appointmentsMonth.filter((item) => item.status === "NO_SHOW");

    const revenueToday = asNumber(incomeDay._sum.amount);
    const revenueWeek = asNumber(incomeWeek._sum.amount);
    const revenueMonth = asNumber(incomeMonth._sum.amount);
    const revenuePrevWeek = asNumber(incomePrevWeek._sum.amount);
    const revenuePrevMonth = asNumber(incomePrevMonth._sum.amount);
    const revenuePrevDay = asNumber(incomePrevDay._sum.amount);
    const serviceRevenueMonth = asNumber(incomeServiceMonth._sum.amount);
    const productRevenueMonth = asNumber(incomeProductMonth._sum.amount);
    const expensesMonth = asNumber(expenseMonth._sum.amount);
    const netCashMonth = revenueMonth - expensesMonth;

    const serviceCostMonth = monthCompletedWithService.reduce(
      (acc, item) => acc + asNumber(item.service.costEstimate),
      0,
    );
    const productCostMonth = salesMonth.reduce((acc, sale) => {
      return (
        acc +
        sale.items.reduce((itemAcc, item) => itemAcc + asNumber(item.unitCost) * item.quantity, 0)
      );
    }, 0);
    const profitEstimatedMonth = revenueMonth - serviceCostMonth - productCostMonth;
    const totalCommissionsMonth = commissionsMonth.reduce(
      (acc, item) => acc + asNumber(item.commissionAmount),
      0,
    );

    const totalSlots = appointmentsMonth.length;
    const completedSlots = completedMonth.length;
    const cancellationRate = totalSlots ? (cancelledMonth.length / totalSlots) * 100 : 0;
    const noShowRate = totalSlots ? (noShowMonth.length / totalSlots) * 100 : 0;
    const occupancyRate = totalSlots ? (completedSlots / totalSlots) * 100 : 0;
    const ticketAverageOverall = completedSlots ? revenueMonth / completedSlots : 0;

    const topProfessionalsMap = new Map<string, { name: string; revenue: number; count: number }>();
    for (const item of monthCompletedWithService) {
      const current = topProfessionalsMap.get(item.professionalId) ?? {
        name: item.professional.name,
        revenue: 0,
        count: 0,
      };
      current.revenue += asNumber(item.service.price);
      current.count += 1;
      topProfessionalsMap.set(item.professionalId, current);
    }
    const topProfessionals = Array.from(topProfessionalsMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((item) => ({
        name: item.name,
        revenue: Number(item.revenue.toFixed(2)),
        ticketAverage: item.count ? Number((item.revenue / item.count).toFixed(2)) : 0,
      }));

    const topServicesMap = new Map<string, { name: string; count: number; revenue: number }>();
    for (const item of monthCompletedWithService) {
      const current = topServicesMap.get(item.serviceId) ?? {
        name: item.service.name,
        count: 0,
        revenue: 0,
      };
      current.count += 1;
      current.revenue += asNumber(item.service.price);
      topServicesMap.set(item.serviceId, current);
    }
    const topServices = Array.from(topServicesMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const topProductsMap = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const item of salesItemsMonth) {
      const current = topProductsMap.get(item.productId) ?? {
        name: item.product.name,
        quantity: 0,
        revenue: 0,
      };
      current.quantity += item.quantity;
      current.revenue += asNumber(item.unitPrice) * item.quantity;
      topProductsMap.set(item.productId, current);
    }
    const topProducts = Array.from(topProductsMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const commissionsMap = new Map<string, { professionalId: string; name: string; commission: number; produced: number }>();
    for (const row of commissionsMonth) {
      const existing = commissionsMap.get(row.professionalId) ?? {
        professionalId: row.professionalId,
        name: row.professional.name,
        commission: 0,
        produced: 0,
      };
      existing.commission += asNumber(row.commissionAmount);
      commissionsMap.set(row.professionalId, existing);
    }
    const producedByPro = new Map<string, number>();
    for (const item of monthCompletedWithService) {
      producedByPro.set(item.professionalId, (producedByPro.get(item.professionalId) ?? 0) + 1);
    }
    const commissionsByProfessional = Array.from(commissionsMap.values()).map((item) => ({
      ...item,
      produced: producedByPro.get(item.professionalId) ?? 0,
      commission: Number(item.commission.toFixed(2)),
    }));

    const professionalPerformanceMap = new Map<string, { professionalId: string; name: string; completed: number; total: number; revenue: number }>();
    for (const item of appointmentsMonth) {
      const current = professionalPerformanceMap.get(item.professionalId) ?? {
        professionalId: item.professionalId,
        name: item.professional.name,
        completed: 0,
        total: 0,
        revenue: 0,
      };
      current.total += 1;
      if (item.status === "COMPLETED") {
        current.completed += 1;
        current.revenue += asNumber(item.service.price);
      }
      professionalPerformanceMap.set(item.professionalId, current);
    }
    const professionalPerformance = Array.from(professionalPerformanceMap.values()).map(
      (item) => ({
        professionalId: item.professionalId,
        name: item.name,
        completed: item.completed,
        total: item.total,
        revenue: Number(item.revenue.toFixed(2)),
        ticketAverage: item.completed
          ? Number((item.revenue / item.completed).toFixed(2))
          : 0,
        occupancyRate: item.total
          ? Number(((item.completed / item.total) * 100).toFixed(1))
          : 0,
      }),
    );

    const topClientsMap = new Map<string, { fullName: string; revenue: number; visits: number }>();
    for (const item of monthCompletedWithService) {
      const current = topClientsMap.get(item.clientId) ?? {
        fullName: item.client.fullName,
        revenue: 0,
        visits: 0,
      };
      current.revenue += asNumber(item.service.price);
      current.visits += 1;
      topClientsMap.set(item.clientId, current);
    }
    const topClients = Array.from(topClientsMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((item) => ({
        fullName: item.fullName,
        revenue: Number(item.revenue.toFixed(2)),
        visits: item.visits,
      }));

    const lostRevenueEstimate = appointmentsMonth
      .filter((item) => item.status === "CANCELLED" || item.status === "NO_SHOW")
      .reduce((acc, item) => acc + asNumber(item.service.price), 0);

    const clientsOverdue: Array<{ id: string; fullName: string; daysWithoutReturn: number }> = [];
    for (const row of completedByClient) {
      if (!row._max.endsAt) continue;
      const daysWithoutReturn = Math.floor(
        (input.date.getTime() - row._max.endsAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysWithoutReturn < thresholds.reactivationMinDays) continue;
      const client = await this.prisma.client.findUnique({
        where: { id: row.clientId },
        select: { id: true, fullName: true },
      });
      if (!client) continue;
      clientsOverdue.push({
        id: client.id,
        fullName: client.fullName,
        daysWithoutReturn,
      });
    }
    clientsOverdue.sort((a, b) => b.daysWithoutReturn - a.daysWithoutReturn);

    const sumScheduledRevenue = (start: Date, end: Date) =>
      forecastAppointments
        .filter((item) => item.startsAt >= start && item.startsAt <= end)
        .reduce((acc, item) => acc + asNumber(item.service.price), 0);

    const historicalResolved = historicalResolvedAppointments.length;
    const historicalCompleted = historicalResolvedAppointments.filter(
      (item) => item.status === "COMPLETED",
    ).length;
    const historicalConversionRate = historicalResolved
      ? historicalCompleted / historicalResolved
      : thresholds.fallbackConversionRate;
    const averageTicket =
      ticketAverageOverall ||
      (await this.prisma.service.aggregate({
        _avg: { price: true },
      }).then((result) => asNumber(result._avg.price))) ||
      60;

    const scheduledRevenueDay = sumScheduledRevenue(day.start, day.end);
    const scheduledRevenueWeek = sumScheduledRevenue(week.start, week.end);
    const scheduledRevenueMonth = sumScheduledRevenue(month.start, month.end);
    const forecastDay = scheduledRevenueDay * historicalConversionRate;
    const forecastWeek = scheduledRevenueWeek * historicalConversionRate;
    const forecastMonth = scheduledRevenueMonth * historicalConversionRate;

    const deltaPct = (current: number, previous: number) => {
      if (previous <= 0) return 0;
      return ((current - previous) / previous) * 100;
    };
    const confidence = Math.max(
      thresholds.baseConfidence,
      Math.min(
        thresholds.maxConfidence,
        Math.round(thresholds.baseConfidence + Math.min(40, historicalResolved * 2)),
      ),
    );

    const timeBands = [
      { key: "MORNING", label: "Manha", startHour: 8, endHour: 12 },
      { key: "AFTERNOON", label: "Tarde", startHour: 12, endHour: 17 },
      { key: "EVENING", label: "Noite", startHour: 17, endHour: 21 },
    ];
    const idleWindowStart = day.start;
    const idleWindowEnd = new Date(
      day.start.getTime() + thresholds.idleHorizonHours * 60 * 60 * 1000,
    );
    const idleAlerts: DashboardSmartAlert[] = [];
    for (const professional of professionals) {
      const appointmentsByProfessional = forecastAppointments.filter(
        (item) =>
          item.professionalId === professional.id &&
          item.startsAt >= idleWindowStart &&
          item.startsAt <= idleWindowEnd,
      );
      for (const band of timeBands) {
        const hasSlot = appointmentsByProfessional.some((item) => {
          const hour = item.startsAt.getHours();
          return hour >= band.startHour && hour < band.endHour;
        });
        if (hasSlot) continue;
        idleAlerts.push({
          id: `idle-${professional.id}-${band.key.toLowerCase()}`,
          type: "IDLE_WINDOW",
          severity: "MEDIUM",
          message: `${professional.name} sem agendamentos na faixa da ${band.label.toLowerCase()} nas proximas ${thresholds.idleHorizonHours}h.`,
          estimatedImpact: Number(averageTicket.toFixed(2)),
          scope: {
            professionalId: professional.id,
            professionalName: professional.name,
            band: band.key,
            horizonHours: thresholds.idleHorizonHours,
          },
        });
      }
    }

    const completedByClientRevenue = new Map<
      string,
      { fullName: string; revenue: number; visits: number }
    >();
    for (const appointment of completedRevenueHistory) {
      const current = completedByClientRevenue.get(appointment.client.id) ?? {
        fullName: appointment.client.fullName,
        revenue: 0,
        visits: 0,
      };
      current.revenue += asNumber(appointment.service.price);
      current.visits += 1;
      completedByClientRevenue.set(appointment.client.id, current);
    }

    const reactivationCandidates = clientsOverdue
      .map((client) => {
        const summary = completedByClientRevenue.get(client.id);
        const baseTicket = summary?.visits ? summary.revenue / summary.visits : averageTicket;
        const estimatedImpact = Math.max(baseTicket, averageTicket * 0.8);
        return {
          id: client.id,
          fullName: client.fullName,
          daysWithoutReturn: client.daysWithoutReturn,
          estimatedImpact: Number(estimatedImpact.toFixed(2)),
        };
      })
      .sort((a, b) => b.estimatedImpact - a.estimatedImpact)
      .slice(0, 5);

    const lowStock = products
      .filter((item) => item.stockQty <= item.minStockAlert)
      .map((item) => ({ id: item.id, name: item.name, stockQty: item.stockQty }));

    const goalMonth = 20000;
    const goalProgress = goalMonth ? (revenueMonth / goalMonth) * 100 : 0;
    const criticalAlerts = [
      ...(noShowRate > thresholds.noShowAlertPct
        ? [`Taxa de faltas acima de ${thresholds.noShowAlertPct}% no mes`]
        : []),
      ...(cancellationRate > thresholds.cancellationAlertPct
        ? [`Cancelamentos acima de ${thresholds.cancellationAlertPct}% no mes`]
        : []),
      ...(revenuePrevWeek > 0 && revenueWeek < revenuePrevWeek
        ? ["Faturamento semanal abaixo da semana anterior"]
        : []),
      ...(lowStock.length ? [`${lowStock.length} itens com estoque baixo`] : []),
      ...(clientsOverdue.length ? ["Clientes inativos aguardando reativacao"] : []),
    ];

    const smartAlerts: DashboardSmartAlert[] = [];
    if (revenuePrevWeek > 0 && forecastWeek < revenuePrevWeek) {
      const gap = Number((revenuePrevWeek - forecastWeek).toFixed(2));
      if (gap >= thresholds.minSmartAlertImpact) {
        smartAlerts.push({
          id: "forecast-drop-week",
          type: "FORECAST_DROP",
          severity:
            gap >= revenuePrevWeek * thresholds.forecastDropHighSeverityPct
              ? "HIGH"
              : "MEDIUM",
          message: `Previsao semanal abaixo da semana anterior em R$ ${gap.toFixed(2)}.`,
          estimatedImpact: gap,
          scope: {
            previousRevenue: Number(revenuePrevWeek.toFixed(2)),
            forecastRevenue: Number(forecastWeek.toFixed(2)),
          },
        });
      }
    }
    smartAlerts.push(
      ...idleAlerts
        .filter((item) => item.estimatedImpact >= thresholds.minSmartAlertImpact)
        .slice(0, 6),
    );
    if (reactivationCandidates.length) {
      const topReactivation = reactivationCandidates
        .slice(0, 3)
        .reduce((acc, item) => acc + item.estimatedImpact, 0);
      if (topReactivation >= thresholds.minSmartAlertImpact) {
        smartAlerts.push({
          id: "reactivation-opportunity",
          type: "REACTIVATION_OPPORTUNITY",
          severity: topReactivation >= averageTicket * 2 ? "HIGH" : "MEDIUM",
          message: `${reactivationCandidates.length} clientes inativos com potencial de retorno imediato.`,
          estimatedImpact: Number(topReactivation.toFixed(2)),
          scope: {
            topClients: reactivationCandidates.slice(0, 3).map((item) => ({
              clientId: item.id,
              fullName: item.fullName,
              daysWithoutReturn: item.daysWithoutReturn,
            })),
          },
        });
      }
    }
    smartAlerts.sort((a, b) => b.estimatedImpact - a.estimatedImpact);

    const actionSuggestions: DashboardActionSuggestion[] = [];
    if (reactivationCandidates.length) {
      const top = reactivationCandidates.slice(0, 3);
      const totalImpact = Number(
        top.reduce((acc, item) => acc + item.estimatedImpact, 0).toFixed(2),
      );
      actionSuggestions.push({
        id: "action-reactivation-top3",
        title: "Reativar clientes de maior potencial",
        description: `Priorize contato com ${top.map((item) => item.fullName).join(", ")} para recuperar receita.`,
        estimatedImpact: totalImpact,
        priorityScore: Number((totalImpact * 1.35).toFixed(2)),
        actionType: "REACTIVATION_CAMPAIGN",
        ctaLabel: "Abrir Clientes 360",
        ctaModule: "clientes",
        actionPayload: {
          clientIds: top.map((item) => item.id),
          channel: "WHATSAPP",
          moduleId: "clientes",
          suggestedClients: top.map((item) => ({
            id: item.id,
            fullName: item.fullName,
            daysWithoutReturn: item.daysWithoutReturn,
            estimatedImpact: item.estimatedImpact,
          })),
          playbookSteps: [
            "Abrir a carteira de clientes e validar historico recente.",
            "Priorizar contato por WhatsApp com oferta de retorno em 24h.",
            "Acompanhar respostas e disparar automacao para nao respondentes.",
          ],
        },
      });
    }
    if (idleAlerts.length) {
      const totalImpact = Number((idleAlerts.length * averageTicket).toFixed(2));
      actionSuggestions.push({
        id: "action-fill-idle-windows",
        title: "Preencher horarios vazios nas proximas 72h",
        description:
          "Crie oferta de giro rapido para faixas sem agendamento e reduza ociosidade dos profissionais.",
        estimatedImpact: totalImpact,
        priorityScore: Number((totalImpact * 1.2).toFixed(2)),
        actionType: "FILL_IDLE_SLOTS",
        ctaLabel: "Ir para Agenda",
        ctaModule: "agenda",
        actionPayload: {
          idleWindows: idleAlerts.slice(0, 6).map((alert) => alert.scope),
          moduleId: "agenda",
          playbookSteps: [
            "Filtrar agenda da semana e destacar faixas vazias.",
            "Ofertar servicos de giro rapido para preencher os horarios ociosos.",
            "Monitorar ocupacao apos o ajuste e reavaliar em 24h.",
          ],
        },
      });
    }
    const upsellImpact = Number(
      ((appointmentsToday.length || 1) * averageTicket * 0.15).toFixed(2),
    );
    actionSuggestions.push({
      id: "action-upsell-combo",
      title: "Aumentar ticket com combo rapido",
      description:
        "Oriente recepcao e profissionais a ofertar combo de servico + produto para atendimentos de hoje.",
      estimatedImpact: upsellImpact,
      priorityScore: Number((upsellImpact * 1.1).toFixed(2)),
      actionType: "UPSELL_COMBO",
      ctaLabel: "Ir para Operacao",
      ctaModule: "operacao",
      actionPayload: {
        baseTicket: Number(averageTicket.toFixed(2)),
        suggestedService: topServices[0]?.name ?? "Corte Premium",
        suggestedProduct: topProducts[0]?.name ?? "Pomada Matte",
        moduleId: "operacao",
        playbookSteps: [
          "Alinhar script de upsell com equipe de recepcao/profissionais.",
          "Ofertar combo em todo atendimento elegivel de hoje.",
          "Registrar adesao e comparar ticket medio ao fim do dia.",
        ],
      },
    });
    actionSuggestions.sort((a, b) => b.priorityScore - a.priorityScore);

    return {
      appointmentsToday: appointmentsToday.length,
      completedToday: appointmentsToday.filter((item) => item.status === "COMPLETED").length,
      cancelledToday: appointmentsToday.filter((item) => item.status === "CANCELLED").length,
      noShowToday: appointmentsToday.filter((item) => item.status === "NO_SHOW").length,
      revenueToday: Number(revenueToday.toFixed(2)),
      revenueWeek: Number(revenueWeek.toFixed(2)),
      revenueMonth: Number(revenueMonth.toFixed(2)),
      revenuePrevWeek: Number(revenuePrevWeek.toFixed(2)),
      revenuePrevMonth: Number(revenuePrevMonth.toFixed(2)),
      profitEstimatedMonth: Number(profitEstimatedMonth.toFixed(2)),
      ticketAverageOverall: Number(ticketAverageOverall.toFixed(2)),
      occupancyRate: Number(occupancyRate.toFixed(1)),
      cancellationRate: Number(cancellationRate.toFixed(1)),
      noShowRate: Number(noShowRate.toFixed(1)),
      goalMonth,
      goalProgress: Number(goalProgress.toFixed(1)),
      topProfessionals,
      topServices,
      topProducts,
      clientsOverdue: clientsOverdue.slice(0, 5),
      criticalAlerts,
      lowStock,
      financialSummary: {
        serviceRevenueMonth: Number(serviceRevenueMonth.toFixed(2)),
        productRevenueMonth: Number(productRevenueMonth.toFixed(2)),
        expensesMonth: Number(expensesMonth.toFixed(2)),
        netCashMonth: Number(netCashMonth.toFixed(2)),
        totalCommissionsMonth: Number(totalCommissionsMonth.toFixed(2)),
      },
      commissionsByProfessional,
      professionalPerformance,
      topClients,
      lostRevenueEstimate: Number(lostRevenueEstimate.toFixed(2)),
      forecast: {
        day: Number(forecastDay.toFixed(2)),
        week: Number(forecastWeek.toFixed(2)),
        month: Number(forecastMonth.toFixed(2)),
        prevDay: Number(revenuePrevDay.toFixed(2)),
        prevWeek: Number(revenuePrevWeek.toFixed(2)),
        prevMonth: Number(revenuePrevMonth.toFixed(2)),
        deltaDayPct: Number(deltaPct(forecastDay, revenuePrevDay).toFixed(1)),
        deltaWeekPct: Number(deltaPct(forecastWeek, revenuePrevWeek).toFixed(1)),
        deltaMonthPct: Number(deltaPct(forecastMonth, revenuePrevMonth).toFixed(1)),
        confidence,
        basis: {
          scheduledRevenueDay: Number(scheduledRevenueDay.toFixed(2)),
          scheduledRevenueWeek: Number(scheduledRevenueWeek.toFixed(2)),
          scheduledRevenueMonth: Number(scheduledRevenueMonth.toFixed(2)),
          historicalConversionRate: Number(historicalConversionRate.toFixed(4)),
          averageTicket: Number(averageTicket.toFixed(2)),
        },
      },
      smartAlerts,
      actionSuggestions,
      suggestionTelemetry: telemetrySummary,
      playbookHistory,
      thresholdTuning: tuning,
    };
  }

  recordDashboardSuggestionTelemetry(input: {
    unitId: string;
    suggestionId: string;
    actionType: DashboardActionSuggestion["actionType"];
    outcome: DashboardSuggestionTelemetryOutcome;
    estimatedImpact?: number;
    realizedRevenue?: number;
    sourceModule?: "dashboard" | "clientes" | "automacoes";
    playbookType?: "REACTIVATION" | "IDLE_WINDOW_FILL" | "FORECAST_PROTECTION";
    note?: string;
    occurredAt?: Date;
  }) {
    const event: DashboardSuggestionTelemetryEvent = {
      id: crypto.randomUUID(),
      unitId: input.unitId,
      suggestionId: input.suggestionId,
      actionType: input.actionType,
      outcome: input.outcome,
      estimatedImpact: Number((input.estimatedImpact ?? 0).toFixed(2)),
      realizedRevenue:
        typeof input.realizedRevenue === "number"
          ? Number(input.realizedRevenue.toFixed(2))
          : undefined,
      sourceModule: input.sourceModule,
      playbookType: input.playbookType,
      note: input.note,
      occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    };
    this.dashboardSuggestionTelemetry.push(event);
    if (this.dashboardSuggestionTelemetry.length > 2000) {
      this.dashboardSuggestionTelemetry.splice(0, this.dashboardSuggestionTelemetry.length - 2000);
    }
    const summary = summarizeDashboardSuggestionTelemetry(
      this.getDashboardSuggestionTelemetryWindow(input.unitId, new Date(event.occurredAt)),
    );
    return { event, summary };
  }

  private getDashboardSuggestionTelemetryWindow(unitId: string, date: Date) {
    const start = new Date(date.getTime() - 45 * 24 * 60 * 60 * 1000);
    return this.dashboardSuggestionTelemetry.filter(
      (item) =>
        item.unitId === unitId &&
        new Date(item.occurredAt) >= start &&
        new Date(item.occurredAt) <= date,
    );
  }

  private getDashboardThresholds(unitId: string): DashboardThresholdConfig {
    const byUnit: Record<
      string,
      {
        noShowAlertPct: number;
        cancellationAlertPct: number;
        forecastDropHighSeverityPct: number;
        reactivationMinDays: number;
        idleHorizonHours: number;
        minSmartAlertImpact: number;
        fallbackConversionRate: number;
        baseConfidence: number;
        maxConfidence: number;
      }
    > = {
      "unit-01": {
        noShowAlertPct: 10,
        cancellationAlertPct: 12,
        forecastDropHighSeverityPct: 0.2,
        reactivationMinDays: 30,
        idleHorizonHours: 72,
        minSmartAlertImpact: 40,
        fallbackConversionRate: 0.82,
        baseConfidence: 45,
        maxConfidence: 95,
      },
      "unit-02": {
        noShowAlertPct: 9,
        cancellationAlertPct: 11,
        forecastDropHighSeverityPct: 0.18,
        reactivationMinDays: 28,
        idleHorizonHours: 72,
        minSmartAlertImpact: 35,
        fallbackConversionRate: 0.8,
        baseConfidence: 45,
        maxConfidence: 95,
      },
    };

    return byUnit[unitId] ?? byUnit["unit-01"];
  }

  private async buildFinancialManagementSnapshot(input: {
    unitId: string;
    start: Date;
    end: Date;
  }): Promise<{
    summary: FinancialManagementSnapshot;
    professionals: FinancialManagementProfessionalRow[];
  }> {
    const [completedAppointments, productSales, expenseRows, commissionRows, professionals] =
      await Promise.all([
        this.prisma.appointment.findMany({
          where: {
            unitId: input.unitId,
            status: "COMPLETED",
            startsAt: { gte: input.start, lte: input.end },
          },
          select: {
            professionalId: true,
            service: {
              select: {
                price: true,
                costEstimate: true,
              },
            },
          },
        }),
        this.prisma.productSale.findMany({
          where: {
            unitId: input.unitId,
            soldAt: { gte: input.start, lte: input.end },
          },
          select: {
            professionalId: true,
            grossAmount: true,
            items: {
              select: {
                quantity: true,
                unitCost: true,
              },
            },
          },
        }),
        this.prisma.financialEntry.findMany({
          where: {
            unitId: input.unitId,
            kind: "EXPENSE",
            occurredAt: { gte: input.start, lte: input.end },
          },
          select: {
            amount: true,
          },
        }),
        this.prisma.commissionEntry.findMany({
          where: {
            unitId: input.unitId,
            occurredAt: { gte: input.start, lte: input.end },
          },
          select: {
            professionalId: true,
            commissionAmount: true,
          },
        }),
        this.prisma.professional.findMany({
          where: { active: true },
          select: { id: true, name: true },
        }),
      ]);

    let serviceRevenue = 0;
    let serviceCost = 0;
    const professionalNames = new Map(professionals.map((item) => [item.id, item.name]));
    const professionalMap = new Map<
      string,
      {
        professionalId: string;
        name: string;
        serviceRevenue: number;
        productRevenue: number;
        serviceCost: number;
        productCost: number;
        commission: number;
        appointmentsCompleted: number;
      }
    >();

    for (const appointment of completedAppointments) {
      const price = asNumber(appointment.service.price);
      const cost = asNumber(appointment.service.costEstimate);
      serviceRevenue += price;
      serviceCost += cost;

      const row = professionalMap.get(appointment.professionalId) ?? {
        professionalId: appointment.professionalId,
        name:
          professionalNames.get(appointment.professionalId) ??
          "Profissional",
        serviceRevenue: 0,
        productRevenue: 0,
        serviceCost: 0,
        productCost: 0,
        commission: 0,
        appointmentsCompleted: 0,
      };
      row.serviceRevenue += price;
      row.serviceCost += cost;
      row.appointmentsCompleted += 1;
      professionalMap.set(appointment.professionalId, row);
    }

    let productRevenue = 0;
    let productCost = 0;
    for (const sale of productSales) {
      const saleGross = asNumber(sale.grossAmount);
      const saleCost = sale.items.reduce(
        (acc, item) => acc + asNumber(item.unitCost) * Number(item.quantity ?? 0),
        0,
      );
      productRevenue += saleGross;
      productCost += saleCost;

      if (sale.professionalId) {
        const row = professionalMap.get(sale.professionalId) ?? {
          professionalId: sale.professionalId,
          name: professionalNames.get(sale.professionalId) ?? "Profissional",
          serviceRevenue: 0,
          productRevenue: 0,
          serviceCost: 0,
          productCost: 0,
          commission: 0,
          appointmentsCompleted: 0,
        };
        row.productRevenue += saleGross;
        row.productCost += saleCost;
        professionalMap.set(sale.professionalId, row);
      }
    }

    const operationalExpenses = expenseRows.reduce((acc, item) => acc + asNumber(item.amount), 0);
    const totalCommissions = commissionRows.reduce(
      (acc, item) => acc + asNumber(item.commissionAmount),
      0,
    );

    for (const entry of commissionRows) {
      const row = professionalMap.get(entry.professionalId) ?? {
        professionalId: entry.professionalId,
        name: professionalNames.get(entry.professionalId) ?? "Profissional",
        serviceRevenue: 0,
        productRevenue: 0,
        serviceCost: 0,
        productCost: 0,
        commission: 0,
        appointmentsCompleted: 0,
      };
      row.commission += asNumber(entry.commissionAmount);
      professionalMap.set(entry.professionalId, row);
    }

    const grossRevenue = serviceRevenue + productRevenue;
    const operationalProfit =
      grossRevenue - (serviceCost + productCost + operationalExpenses + totalCommissions);
    const operationalMarginPct = grossRevenue ? (operationalProfit / grossRevenue) * 100 : 0;

    const professionalsRows = Array.from(professionalMap.values()).map((item) => {
      const gross = item.serviceRevenue + item.productRevenue;
      const estimatedProfit =
        gross - (item.serviceCost + item.productCost + item.commission);
      return {
        professionalId: item.professionalId,
        name: item.name,
        serviceRevenue: Number(item.serviceRevenue.toFixed(2)),
        productRevenue: Number(item.productRevenue.toFixed(2)),
        grossRevenue: Number(gross.toFixed(2)),
        serviceCost: Number(item.serviceCost.toFixed(2)),
        productCost: Number(item.productCost.toFixed(2)),
        commission: Number(item.commission.toFixed(2)),
        estimatedProfit: Number(estimatedProfit.toFixed(2)),
        marginPct: gross ? Number(((estimatedProfit / gross) * 100).toFixed(1)) : 0,
        appointmentsCompleted: item.appointmentsCompleted,
        ticketAverage: item.appointmentsCompleted
          ? Number((item.serviceRevenue / item.appointmentsCompleted).toFixed(2))
          : 0,
      };
    });

    return {
      summary: {
        grossRevenue: Number(grossRevenue.toFixed(2)),
        serviceRevenue: Number(serviceRevenue.toFixed(2)),
        productRevenue: Number(productRevenue.toFixed(2)),
        serviceCost: Number(serviceCost.toFixed(2)),
        productCost: Number(productCost.toFixed(2)),
        operationalExpenses: Number(operationalExpenses.toFixed(2)),
        totalCommissions: Number(totalCommissions.toFixed(2)),
        operationalProfit: Number(operationalProfit.toFixed(2)),
        operationalMarginPct: Number(operationalMarginPct.toFixed(1)),
      },
      professionals: professionalsRows,
    };
  }

  private resolveComparisonRange(input: {
    start: Date;
    end: Date;
    compareStart?: Date;
    compareEnd?: Date;
  }) {
    if (input.compareStart && input.compareEnd) {
      return {
        start: new Date(input.compareStart),
        end: new Date(input.compareEnd),
      };
    }

    const diffMs = Math.max(0, input.end.getTime() - input.start.getTime());
    const previousEnd = new Date(input.start.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - diffMs);
    return { start: previousStart, end: previousEnd };
  }

  private computeFinancialSnapshotDelta(
    current: FinancialManagementSnapshot,
    previous: FinancialManagementSnapshot,
  ) {
    const deltaPct = (value: number, base: number) =>
      base > 0 ? (value / base) * 100 : value > 0 ? 100 : 0;
    return {
      grossRevenue: Number((current.grossRevenue - previous.grossRevenue).toFixed(2)),
      serviceRevenue: Number((current.serviceRevenue - previous.serviceRevenue).toFixed(2)),
      productRevenue: Number((current.productRevenue - previous.productRevenue).toFixed(2)),
      serviceCost: Number((current.serviceCost - previous.serviceCost).toFixed(2)),
      productCost: Number((current.productCost - previous.productCost).toFixed(2)),
      operationalExpenses: Number(
        (current.operationalExpenses - previous.operationalExpenses).toFixed(2),
      ),
      totalCommissions: Number(
        (current.totalCommissions - previous.totalCommissions).toFixed(2),
      ),
      operationalProfit: Number(
        (current.operationalProfit - previous.operationalProfit).toFixed(2),
      ),
      operationalMarginPct: Number(
        deltaPct(
          current.operationalMarginPct - previous.operationalMarginPct,
          Math.abs(previous.operationalMarginPct),
        ).toFixed(1),
      ),
    };
  }

  private mapService(item: {
    id: string;
    businessId: string;
    name: string;
    description: string | null;
    category: string | null;
    price: Prisma.Decimal;
    durationMin: number;
    defaultCommissionRate: Prisma.Decimal;
    costEstimate: Prisma.Decimal;
    notes: string | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): Service {
    return {
      id: item.id,
      businessId: item.businessId,
      name: item.name,
      description: item.description ?? undefined,
      category: item.category ?? undefined,
      price: asNumber(item.price),
      durationMin: item.durationMin,
      defaultCommissionRate: asNumber(item.defaultCommissionRate),
      costEstimate: asNumber(item.costEstimate),
      notes: item.notes ?? undefined,
      active: item.active,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private mapProfessional(item: {
    id: string;
    name: string;
    active: boolean;
    commissionRules: Array<{
      id: string;
      appliesTo: string;
      serviceCategory: string | null;
      percentage: Prisma.Decimal | null;
      fixedAmount: Prisma.Decimal | null;
      goalThreshold: Prisma.Decimal | null;
      extraPercentageAfterGoal: Prisma.Decimal | null;
    }>;
  }): Professional {
    const rules: CommissionRule[] = item.commissionRules
      .filter((rule) => rule.appliesTo === "SERVICE" || rule.appliesTo === "PRODUCT")
      .map((rule) => {
        const appliesTo = rule.appliesTo as "SERVICE" | "PRODUCT";
        return {
          id: rule.id,
          appliesTo,
          serviceCategory: rule.serviceCategory ?? undefined,
          percentage: rule.percentage == null ? undefined : asNumber(rule.percentage),
          fixedAmount: rule.fixedAmount == null ? undefined : asNumber(rule.fixedAmount),
          goalThreshold:
            rule.goalThreshold == null ? undefined : asNumber(rule.goalThreshold),
          extraPercentageAfterGoal:
            rule.extraPercentageAfterGoal == null
              ? undefined
              : asNumber(rule.extraPercentageAfterGoal),
        };
      });

    return {
      id: item.id,
      name: item.name,
      active: item.active,
      commissionRules: rules,
    };
  }

  private mapClient(item: {
    id: string;
    fullName: string;
    phone: string | null;
    preferredProfessionalId: string | null;
    tags: string[];
  }): Client {
    return {
      id: item.id,
      fullName: item.fullName,
      phone: item.phone ?? undefined,
      preferredProfessionalId: item.preferredProfessionalId ?? undefined,
      tags: item.tags as Array<"NEW" | "RECURRING" | "VIP" | "INACTIVE">,
    };
  }

  private mapProduct(item: {
    id: string;
    name: string;
    category: string;
    salePrice: Prisma.Decimal;
    costPrice: Prisma.Decimal;
    stockQty: number;
    minStockAlert: number;
    active: boolean;
  }): Product {
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      salePrice: asNumber(item.salePrice),
      costPrice: asNumber(item.costPrice),
      stockQty: item.stockQty,
      minStockAlert: item.minStockAlert,
      active: item.active,
    };
  }

  private mapAppointment(item: {
    id: string;
    unitId: string;
    clientId: string;
    professionalId: string;
    serviceId: string;
    startsAt: Date;
    endsAt: Date;
    status: AppointmentStatus;
    isFitting: boolean;
    notes: string | null;
    history?: Array<{
      changedAt: Date;
      changedBy: string;
      action: string;
      reason: string | null;
    }>;
  }): Appointment {
    return {
      id: item.id,
      unitId: item.unitId,
      clientId: item.clientId,
      professionalId: item.professionalId,
      serviceId: item.serviceId,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      status: item.status,
      isFitting: item.isFitting,
      notes: item.notes ?? undefined,
      history: (item.history ?? []).map((entry) => ({
        changedAt: entry.changedAt,
        changedBy: entry.changedBy,
        action: entry.action as Appointment["history"][number]["action"],
        reason: entry.reason ?? undefined,
      })),
    };
  }

  private buildAppointmentView(item: {
    id: string;
    unitId: string;
    clientId: string;
    professionalId: string;
    serviceId: string;
    startsAt: Date;
    endsAt: Date;
    status: AppointmentStatus;
    isFitting: boolean;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    client: {
      fullName: string;
      phone: string | null;
      tags: string[];
    };
    professional: { name: string };
    service: { name: string; price: Prisma.Decimal; durationMin: number };
    history?: Array<{
      action: string;
      changedAt: Date;
    }>;
  }) {
    const confirmation =
      item.status === "CONFIRMED" ||
      item.status === "IN_SERVICE" ||
      item.status === "COMPLETED" ||
      (item.history ?? []).some((entry) => entry.action === "CONFIRMED");

    return {
      id: item.id,
      unitId: item.unitId,
      clientId: item.clientId,
      professionalId: item.professionalId,
      serviceId: item.serviceId,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      status: item.status,
      isFitting: item.isFitting,
      notes: item.notes ?? undefined,
      history: [],
      client: item.client.fullName,
      clientPhone: item.client.phone,
      clientTags: item.client.tags as Array<"NEW" | "RECURRING" | "VIP" | "INACTIVE">,
      professional: item.professional.name,
      service: item.service.name,
      servicePrice: asNumber(item.service.price),
      serviceDurationMin: item.service.durationMin,
      origin: "MANUAL",
      confirmation,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private latestRetentionScoreMap(
    rows: Array<{
      clientId: string;
      scoredAt: Date;
      riskLevel: "LOW" | "MEDIUM" | "HIGH";
      riskScore: Prisma.Decimal | number;
      returnProbability: Prisma.Decimal | number;
    }>,
  ) {
    const map = new Map<string, (typeof rows)[number]>();
    for (const item of rows) {
      if (!map.has(item.clientId)) map.set(item.clientId, item);
    }
    return map;
  }

  private buildAutomationIdempotencyKey(input: {
    unitId: string;
    campaignType: string;
    ruleId?: string;
    clientId: string;
    date: Date;
  }) {
    const windowBucket = input.date.toISOString().slice(0, 13);
    return `${input.unitId}:${input.campaignType}:${input.ruleId ?? "manual"}:${input.clientId}:${windowBucket}`;
  }

  private shouldFailAutomationExecution(input: {
    campaignType: string;
    attempts: number;
    payload: Prisma.JsonValue | null;
  }) {
    const payload = (input.payload ?? {}) as Record<string, unknown>;
    const reprocessCount = Number(payload.reprocessCount ?? 0);
    const campaignType = String(input.campaignType).toLowerCase();
    if (campaignType.includes("force_fail_always")) return true;
    if (campaignType.includes("force_fail_until_reprocess") && reprocessCount === 0) return true;
    if (campaignType.includes("force_fail_once") && input.attempts === 1) return true;
    return false;
  }

  private async processAutomationExecution(executionId: string, startedAt: Date) {
    const maxAttempts = 3;
    let attempts = 0;
    let status: "PENDING" | "SUCCESS" | "FAILED" = "PENDING";
    let errorMessage: string | null = null;
    let finishedAt: Date | null = null;
    let campaignType = "";
    let payload: Prisma.JsonValue | null = null;

    while (attempts < maxAttempts) {
      attempts += 1;
      const current = await this.prisma.automationExecution.findUnique({
        where: { id: executionId },
        select: { campaignType: true, payload: true },
      });
      campaignType = current?.campaignType ?? campaignType;
      payload = current?.payload ?? payload;
      if (
        this.shouldFailAutomationExecution({
          campaignType,
          attempts,
          payload,
        })
      ) {
        continue;
      }
      status = "SUCCESS";
      finishedAt = new Date();
      errorMessage = null;
      break;
    }

    if (status !== "SUCCESS") {
      status = "FAILED";
      finishedAt = new Date();
      errorMessage = `Falha apos ${maxAttempts} tentativas`;
    }

    return await this.prisma.automationExecution.update({
      where: { id: executionId },
      data: {
        status,
        attempts,
        startedAt,
        finishedAt,
        errorMessage,
      },
    });
  }

  private async buildRetentionScoreSnapshot(
    unitId: string,
    clientId: string,
    scoredAt: Date,
    modelVersion: string,
  ) {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        unitId,
        clientId,
        status: "COMPLETED",
      },
      orderBy: { endsAt: "desc" },
      select: { endsAt: true },
    });
    const lastVisitAt = appointments[0]?.endsAt;
    const daysWithoutReturn = lastVisitAt
      ? Math.floor((scoredAt.getTime() - lastVisitAt.getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    const visits90d = appointments.filter(
      (item) => item.endsAt >= new Date(scoredAt.getTime() - 90 * 24 * 60 * 60 * 1000),
    ).length;

    let riskScore = Math.min(100, Math.max(0, daysWithoutReturn * 1.2));
    riskScore -= Math.min(30, visits90d * 6);
    riskScore = Math.max(0, Math.min(100, riskScore));

    const riskLevel: "LOW" | "MEDIUM" | "HIGH" =
      riskScore >= 70 ? "HIGH" : riskScore >= 40 ? "MEDIUM" : "LOW";
    const returnProbability = Math.max(0, Math.min(100, 100 - riskScore));
    const reasons: string[] = [];
    if (!lastVisitAt) reasons.push("Cliente sem historico recente de atendimento");
    if (daysWithoutReturn >= 60) reasons.push("Mais de 60 dias sem retorno");
    else if (daysWithoutReturn >= 30) reasons.push("Mais de 30 dias sem retorno");
    if (visits90d <= 1) reasons.push("Baixa frequencia de visitas nos ultimos 90 dias");
    if (!reasons.length) reasons.push("Padrao de recorrencia saudavel");

    return {
      id: crypto.randomUUID(),
      unitId,
      clientId,
      riskScore: Number(riskScore.toFixed(2)),
      riskLevel,
      returnProbability: Number(returnProbability.toFixed(2)),
      reasons,
      modelVersion,
      scoredAt,
    };
  }

  private async syncRetentionCaseFromScore(snapshot: {
    unitId: string;
    clientId: string;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    riskScore: number;
    scoredAt: Date;
  }) {
    if (snapshot.riskLevel === "LOW") return;
    const existing = await this.prisma.retentionCase.findFirst({
      where: {
        unitId: snapshot.unitId,
        clientId: snapshot.clientId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    });

    if (existing) {
      await this.prisma.retentionCase.update({
        where: { id: existing.id },
        data: {
          riskLevel: snapshot.riskLevel,
          reason: "Risco preditivo elevado",
          recommendedAction: "Executar automacao de reativacao",
          updatedAt: snapshot.scoredAt,
        },
      });
      return;
    }

    await this.prisma.retentionCase.create({
      data: {
        id: crypto.randomUUID(),
        unitId: snapshot.unitId,
        clientId: snapshot.clientId,
        status: "OPEN",
        riskLevel: snapshot.riskLevel,
        reason: "Risco preditivo elevado",
        recommendedAction: "Executar automacao de reativacao",
        daysWithoutReturn: Math.round(snapshot.riskScore),
        ownerUser: "automation",
        updatedAt: snapshot.scoredAt,
      },
    });
  }

  private mapMonthlyGoal(goal: {
    id: string;
    month: number;
    year: number;
    revenueTarget: Prisma.Decimal | number;
    appointmentsTarget: number;
    averageTicketTarget: Prisma.Decimal | number | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: goal.id,
      month: goal.month,
      year: goal.year,
      revenueTarget: Number(asNumber(goal.revenueTarget).toFixed(2)),
      appointmentsTarget: goal.appointmentsTarget,
      averageTicketTarget:
        goal.averageTicketTarget == null
          ? null
          : Number(asNumber(goal.averageTicketTarget).toFixed(2)),
      notes: goal.notes ?? null,
      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString(),
    };
  }

  private resolveGoalPaceStatus(input: {
    hasGoal: boolean;
    revenueCurrent: number;
    expectedRevenueByNow: number;
  }): GoalPaceStatus {
    if (!input.hasGoal) return "ON_TRACK";
    if (input.expectedRevenueByNow <= 0) {
      return input.revenueCurrent > 0 ? "ABOVE_RHYTHM" : "ON_TRACK";
    }
    const ratio = input.revenueCurrent / input.expectedRevenueByNow;
    if (ratio >= 1.05) return "ABOVE_RHYTHM";
    if (ratio >= 0.95) return "ON_TRACK";
    return "BELOW_RHYTHM";
  }

  private buildGoalInsights(input: {
    goal: MonthlyGoal | null;
    revenueCurrent: number;
    remainingAmount: number;
    requiredRevenuePerDay: number;
    services: Array<{ name: string; sharePct: number }>;
    professionals: Array<{ name: string }>;
    ticketAverageCurrent: number;
  }) {
    const insights: string[] = [];
    if (input.goal) {
      insights.push(
        `Faltam R$ ${input.remainingAmount.toFixed(2)} para bater a meta do mes.`,
      );
      if (input.requiredRevenuePerDay > 0) {
        insights.push(
          `Voce precisa faturar R$ ${input.requiredRevenuePerDay.toFixed(2)} por dia ate o fim do mes.`,
        );
      }
      if (typeof input.goal.averageTicketTarget === "number") {
        const gap = Number(
          (input.goal.averageTicketTarget - input.ticketAverageCurrent).toFixed(2),
        );
        if (gap > 0) {
          insights.push(
            `Aumentar o ticket medio em R$ ${gap.toFixed(2)} pode acelerar o alcance da meta.`,
          );
        }
      }
    }
    if (input.services.length) {
      insights.push(
        `O servico ${input.services[0].name} representa ${input.services[0].sharePct.toFixed(1)}% da receita de servicos.`,
      );
    }
    if (input.professionals.length) {
      insights.push(`${input.professionals[0].name} lidera o faturamento este mes.`);
    }
    if (!insights.length) {
      insights.push(
        "Ainda nao ha atendimentos concluidos suficientes para calcular a performance.",
      );
    }
    return insights;
  }

  private async getCurrentLoyaltyBalance(unitId: string, clientId: string) {
    const latest = await this.prisma.loyaltyLedger.findFirst({
      where: { unitId, clientId },
      orderBy: { occurredAt: "desc" },
      select: { balanceAfter: true },
    });
    return asNumber(latest?.balanceAfter);
  }
}
