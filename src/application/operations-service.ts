import { BarbershopEngine } from "./barbershop-engine";
import { InMemoryStore } from "../infrastructure/in-memory-store";
import {
  Appointment,
  AppointmentStatus,
  BusinessCommissionRule,
  BusinessHour,
  BusinessPaymentMethod,
  BusinessSettings,
  BusinessTeamMember,
  AutomationChannel,
  AutomationExecution,
  AutomationPlaybookType,
  AutomationRuleUpdateInput,
  AutomationSourceModule,
  AutomationTarget,
  AutomationTriggerType,
  BillingWebhookEventInput,
  BillingWebhookProcessResult,
  FinancialEntry,
  FinancialManagementOverviewPayload,
  FinancialManagementProfessionalRow,
  FinancialManagementSnapshot,
  BillingReconciliationDiscrepancy,
  DashboardSuggestionTelemetryEvent,
  DashboardSuggestionTelemetryOutcome,
  ClientsOverviewPayload,
  ClientPredictiveStatus,
  ClientValueSegment,
  DashboardActionSuggestion,
  DashboardPayload,
  DashboardSmartAlert,
  IntegrationWebhookStatus,
  GoalProgressSummary,
  GoalPaceStatus,
  MonthlyGoal,
  Product,
  ProductSale,
  ProductSaleHistoryRow,
  ProductSaleRefundStatus,
  Refund,
  Service,
  ServiceStockConsumptionItem,
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

type MemoryIdempotencyRecord = {
  unitId: string;
  action: string;
  idempotencyKey: string;
  payloadHash: string;
  responseJson?: unknown;
  status: "IN_PROGRESS" | "SUCCEEDED";
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

export class OperationsService {
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
  private readonly idempotencyRecords = new Map<string, MemoryIdempotencyRecord>();

  constructor(
    private readonly store: InMemoryStore,
    private readonly engine = new BarbershopEngine(),
  ) {}

  private idempotencyScope(input: {
    unitId: string;
    action: string;
    idempotencyKey?: string;
    payloadHash?: string;
    payload: unknown;
  }) {
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    if (!idempotencyKey) return null;
    const mapKey = `${input.unitId}:${input.action}:${idempotencyKey}`;
    return {
      mapKey,
      unitId: input.unitId,
      action: input.action,
      idempotencyKey,
      payloadHash: input.payloadHash ?? hashIdempotencyPayload(input.payload),
    };
  }

  private replayMemoryIdempotency<T>(scope: ReturnType<OperationsService["idempotencyScope"]>) {
    if (!scope) return null;
    const existing = this.idempotencyRecords.get(scope.mapKey);
    if (!existing) return null;
    if (existing.payloadHash !== scope.payloadHash) {
      throw new Error("Conflito: idempotencyKey reutilizada com payload diferente");
    }
    if (existing.status !== "SUCCEEDED") {
      throw new Error("Conflito: operacao idempotente ainda em processamento");
    }
    return existing.responseJson as T;
  }

  private startMemoryIdempotency(scope: ReturnType<OperationsService["idempotencyScope"]>) {
    if (!scope) return;
    this.idempotencyRecords.set(scope.mapKey, {
      unitId: scope.unitId,
      action: scope.action,
      idempotencyKey: scope.idempotencyKey,
      payloadHash: scope.payloadHash,
      status: "IN_PROGRESS",
    });
  }

  private finishMemoryIdempotency(
    scope: ReturnType<OperationsService["idempotencyScope"]>,
    response: unknown,
  ) {
    if (!scope) return;
    this.idempotencyRecords.set(scope.mapKey, {
      unitId: scope.unitId,
      action: scope.action,
      idempotencyKey: scope.idempotencyKey,
      payloadHash: scope.payloadHash,
      responseJson: toJsonValue(response),
      status: "SUCCEEDED",
    });
  }

  private getInventoryStatus(quantity: number, minimumStock: number) {
    if (quantity <= 0) return "OUT_OF_STOCK" as const;
    if (quantity <= minimumStock) return "LOW_STOCK" as const;
    return "IN_STOCK" as const;
  }

  private getInventoryReasonFromMovement(movement: {
    referenceType: string;
    referenceId?: string;
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

  private mapInventoryProduct(
    product: Product,
    unitId: string,
  ) {
    const metadata = product as Product & {
      businessId?: string;
      notes?: string;
      createdAt?: Date;
      updatedAt?: Date;
    };
    const quantity = Math.max(0, Math.trunc(Number(product.stockQty) || 0));
    const minimumStock = Math.max(0, Math.trunc(Number(product.minStockAlert) || 0));
    const status = this.getInventoryStatus(quantity, minimumStock);
    return {
      id: product.id,
      businessId: metadata.businessId ?? unitId,
      name: product.name,
      category: product.category,
      salePrice: Number(product.salePrice || 0),
      costPrice: Number(product.costPrice || 0),
      quantity,
      minimumStock,
      notes: metadata.notes ?? "",
      status,
      createdAt: metadata.createdAt instanceof Date ? metadata.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: metadata.updatedAt instanceof Date ? metadata.updatedAt.toISOString() : new Date().toISOString(),
      estimatedValue: Number((quantity * (Number(product.costPrice || 0) || Number(product.salePrice || 0))).toFixed(2)),
    };
  }

  getCatalog() {
    return {
      services: this.store.services,
      professionals: this.store.professionals,
      clients: this.store.clients,
      products: this.store.products,
    };
  }

  listClients(input: {
    unitId: string;
    search?: string;
    limit?: number;
  }) {
    const normalizedSearch = String(input.search ?? "").trim().toLowerCase();
    const limit = Math.min(Math.max(input.limit ?? 200, 1), 200);
    const rows = this.store.clients
      .map((client) => {
        const metadata = client as typeof client & {
          businessId?: string;
          email?: string;
          birthDate?: Date;
          notes?: string;
          createdAt?: Date;
          updatedAt?: Date;
        };
        const businessId = metadata.businessId ?? "unit-01";
        return {
          id: client.id,
          businessId,
          name: client.fullName,
          phone: client.phone ?? null,
          email: metadata.email ?? null,
          birthDate: metadata.birthDate ? metadata.birthDate.toISOString() : null,
          notes: metadata.notes ?? null,
          status: mapClientTagsToStatus(client.tags ?? []),
          tags: client.tags ?? [],
          createdAt: (metadata.createdAt ?? new Date()).toISOString(),
          updatedAt: (metadata.updatedAt ?? new Date()).toISOString(),
        };
      })
      .filter((client) => client.businessId === input.unitId)
      .filter((client) => {
        if (!normalizedSearch) return true;
        const haystack = [
          client.name,
          client.phone ?? "",
          client.email ?? "",
          ...(Array.isArray(client.tags) ? client.tags : []),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit);

    return {
      clients: rows,
      summary: {
        total: rows.length,
      },
    };
  }

  createClient(input: {
    unitId: string;
    name: string;
    phone: string;
    email?: string;
    birthDate?: Date;
    notes?: string;
    status?: "NEW" | "ACTIVE" | "VIP" | "INACTIVE";
    tags?: Array<"NEW" | "RECURRING" | "VIP" | "INACTIVE">;
  }) {
    const unit = this.store.units.find((item) => item.id === input.unitId);
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

    const duplicate = this.store.clients.find((client) => {
      const metadata = client as typeof client & { businessId?: string };
      const businessId = metadata.businessId ?? "unit-01";
      if (businessId !== input.unitId) return false;
      return normalizeClientPhone(client.phone ?? "") === normalizedPhone;
    });
    if (duplicate) {
      throw new Error("Conflito: telefone ja cadastrado para este negocio");
    }

    const tags =
      input.tags && input.tags.length
        ? Array.from(new Set(input.tags))
        : [...mapClientStatusToTags(input.status)];

    const now = new Date();
    const created = {
      id: crypto.randomUUID(),
      fullName: name,
      phone: normalizedPhone,
      tags,
      businessId: input.unitId,
      email: input.email ? String(input.email).trim() : undefined,
      birthDate: input.birthDate,
      notes: input.notes ? String(input.notes).trim() : undefined,
      createdAt: now,
      updatedAt: now,
    };

    this.store.clients.push(created);

    return {
      client: {
        id: created.id,
        businessId: created.businessId,
        name: created.fullName,
        phone: created.phone,
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

  private ensureBusinessSettings(unitId: string) {
    const existing = this.store.businessSettings.find((item) => item.unitId === unitId);
    if (existing) return existing;
    const unit = this.store.units.find((item) => item.id === unitId);
    const now = new Date();
    const created: BusinessSettings = {
      id: crypto.randomUUID(),
      unitId,
      businessName: unit?.name || "Minha empresa",
      segment: "barbearia",
      defaultAppointmentDuration: 45,
      minimumAdvanceMinutes: 30,
      bufferBetweenAppointmentsMinutes: 10,
      reminderLeadMinutes: 60,
      sendAppointmentReminders: true,
      inactiveCustomerDays: 60,
      atRiskCustomerDays: 30,
      allowWalkIns: true,
      allowOutOfHoursAppointments: false,
      allowOverbooking: false,
      houseCommissionType: "PERCENTAGE",
      houseCommissionValue: 40,
      themeMode: "light",
      createdAt: now,
      updatedAt: now,
    };
    this.store.businessSettings.push(created);
    return created;
  }

  private ensureBusinessHours(unitId: string) {
    const existing = this.store.businessHours.filter((item) => item.unitId === unitId);
    if (existing.length) return existing;
    const now = new Date();
    const defaults: BusinessHour[] = [
      { id: crypto.randomUUID(), unitId, dayOfWeek: 0, isClosed: true, createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), unitId, dayOfWeek: 1, opensAt: "08:00", closesAt: "18:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false, createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), unitId, dayOfWeek: 2, opensAt: "08:00", closesAt: "18:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false, createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), unitId, dayOfWeek: 3, opensAt: "08:00", closesAt: "18:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false, createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), unitId, dayOfWeek: 4, opensAt: "08:00", closesAt: "18:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false, createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), unitId, dayOfWeek: 5, opensAt: "08:00", closesAt: "18:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false, createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), unitId, dayOfWeek: 6, opensAt: "08:00", closesAt: "14:00", isClosed: false, createdAt: now, updatedAt: now },
    ];
    this.store.businessHours.push(...defaults);
    return defaults;
  }

  private ensurePaymentMethods(unitId: string) {
    const existing = this.store.businessPaymentMethods.filter((item) => item.unitId === unitId);
    if (existing.length) return existing;
    const now = new Date();
    const defaults: BusinessPaymentMethod[] = [
      { id: crypto.randomUUID(), unitId, name: "Dinheiro", isActive: true, isDefault: false, createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), unitId, name: "Pix", isActive: true, isDefault: true, createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), unitId, name: "Cartao de credito", isActive: true, isDefault: false, createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), unitId, name: "Cartao de debito", isActive: true, isDefault: false, createdAt: now, updatedAt: now },
    ];
    this.store.businessPaymentMethods.push(...defaults);
    return defaults;
  }

  private ensureTeamMembers(unitId: string) {
    const existing = this.store.businessTeamMembers.filter((item) => item.unitId === unitId);
    if (existing.length) return existing;
    const now = new Date();
    const owner: BusinessTeamMember = {
      id: crypto.randomUUID(),
      unitId,
      name: "Dono",
      role: "OWNER",
      accessProfile: "owner",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    const professionals: BusinessTeamMember[] = this.store.professionals.map((item) => ({
      id: crypto.randomUUID(),
      unitId,
      name: item.name,
      role: "PROFESSIONAL",
      accessProfile: "profissional",
      email: undefined,
      phone: undefined,
      isActive: item.active,
      createdAt: now,
      updatedAt: now,
    }));
    this.store.businessTeamMembers.push(owner, ...professionals);
    return [owner, ...professionals];
  }

  private mapBusinessSettingsView(settings: BusinessSettings) {
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
      themeMode: settings.themeMode ?? "light",
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
      houseCommissionValue: settings.houseCommissionValue,
      createdAt: (settings.createdAt ?? new Date()).toISOString(),
      updatedAt: (settings.updatedAt ?? new Date()).toISOString(),
    };
  }

  getSettingsOverview(input: { unitId: string; authUser?: Record<string, unknown> }) {
    const settings = this.ensureBusinessSettings(input.unitId);
    const hours = this.ensureBusinessHours(input.unitId)
      .slice()
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    const paymentMethods = this.ensurePaymentMethods(input.unitId);
    const teamMembers = this.ensureTeamMembers(input.unitId);
    const commissionRules = this.store.businessCommissionRules
      .filter((item) => item.unitId === input.unitId)
      .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));

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
        createdAt: (item.createdAt ?? new Date()).toISOString(),
        updatedAt: (item.updatedAt ?? new Date()).toISOString(),
      })),
      commissionRules: commissionRules.map((item) => ({
        id: item.id,
        professionalId: item.professionalId ?? null,
        professionalName:
          this.store.professionals.find((professional) => professional.id === item.professionalId)?.name ??
          null,
        serviceId: item.serviceId ?? null,
        serviceName:
          this.store.services.find((service) => service.id === item.serviceId)?.name ?? null,
        type: item.type,
        value: item.value,
        isActive: item.isActive,
        createdAt: (item.createdAt ?? new Date()).toISOString(),
        updatedAt: (item.updatedAt ?? new Date()).toISOString(),
      })),
      teamMembers: teamMembers.map((item) => ({
        id: item.id,
        name: item.name,
        role: item.role,
        accessProfile: item.accessProfile,
        email: item.email ?? "",
        phone: item.phone ?? "",
        isActive: item.isActive,
        createdAt: (item.createdAt ?? new Date()).toISOString(),
        updatedAt: (item.updatedAt ?? new Date()).toISOString(),
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

  getBusinessSettings(input: { unitId: string }) {
    return {
      business: this.mapBusinessSettingsView(this.ensureBusinessSettings(input.unitId)),
    };
  }

  updateBusinessSettings(input: {
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
    const settings = this.ensureBusinessSettings(input.unitId);
    const businessName = String(input.businessName ?? "").trim();
    if (!businessName) throw new Error("Nome da empresa e obrigatorio");
    const inactiveCustomerDays =
      input.inactiveCustomerDays != null ? Math.trunc(Number(input.inactiveCustomerDays)) : settings.inactiveCustomerDays;
    const atRiskCustomerDays =
      input.atRiskCustomerDays != null ? Math.trunc(Number(input.atRiskCustomerDays)) : settings.atRiskCustomerDays;
    if (inactiveCustomerDays <= 0 || atRiskCustomerDays <= 0) {
      throw new Error("Dias de cliente em risco/inativo devem ser positivos");
    }
    const defaultAppointmentDuration =
      input.defaultAppointmentDuration != null
        ? Math.trunc(Number(input.defaultAppointmentDuration))
        : settings.defaultAppointmentDuration;
    if (!Number.isFinite(defaultAppointmentDuration) || defaultAppointmentDuration <= 0) {
      throw new Error("Duracao padrao de agendamento invalida");
    }
    const houseCommissionValue =
      input.houseCommissionValue != null ? Number(input.houseCommissionValue) : settings.houseCommissionValue;
    const houseCommissionType = input.houseCommissionType ?? settings.houseCommissionType;
    if (!Number.isFinite(houseCommissionValue) || houseCommissionValue < 0) {
      throw new Error("Valor de comissao da casa invalido");
    }
    if (houseCommissionType === "PERCENTAGE" && houseCommissionValue > 100) {
      throw new Error("Comissao percentual deve ficar entre 0 e 100");
    }

    settings.businessName = businessName;
    settings.segment = input.segment ?? settings.segment;
    settings.phone = String(input.phone ?? "").trim() || undefined;
    settings.email = String(input.email ?? "").trim() || undefined;
    settings.address = String(input.address ?? "").trim() || undefined;
    settings.city = String(input.city ?? "").trim() || undefined;
    settings.state = String(input.state ?? "").trim() || undefined;
    settings.document = String(input.document ?? "").trim() || undefined;
    settings.displayName = String(input.displayName ?? "").trim() || undefined;
    settings.primaryColor = String(input.primaryColor ?? "").trim() || settings.primaryColor;
    settings.themeMode = input.themeMode ?? settings.themeMode ?? "light";
    settings.defaultAppointmentDuration = defaultAppointmentDuration;
    settings.minimumAdvanceMinutes =
      input.minimumAdvanceMinutes != null
        ? Math.max(0, Math.trunc(Number(input.minimumAdvanceMinutes)))
        : settings.minimumAdvanceMinutes;
    settings.bufferBetweenAppointmentsMinutes =
      input.bufferBetweenAppointmentsMinutes != null
        ? Math.max(0, Math.trunc(Number(input.bufferBetweenAppointmentsMinutes)))
        : settings.bufferBetweenAppointmentsMinutes;
    settings.reminderLeadMinutes =
      input.reminderLeadMinutes != null
        ? Math.max(0, Math.trunc(Number(input.reminderLeadMinutes)))
        : settings.reminderLeadMinutes;
    settings.sendAppointmentReminders = input.sendAppointmentReminders ?? settings.sendAppointmentReminders;
    settings.inactiveCustomerDays = inactiveCustomerDays;
    settings.atRiskCustomerDays = atRiskCustomerDays;
    settings.allowWalkIns = input.allowWalkIns ?? settings.allowWalkIns;
    settings.allowOutOfHoursAppointments =
      input.allowOutOfHoursAppointments ?? settings.allowOutOfHoursAppointments;
    settings.allowOverbooking = input.allowOverbooking ?? settings.allowOverbooking;
    settings.houseCommissionType = houseCommissionType;
    settings.houseCommissionValue = Number(houseCommissionValue.toFixed(2));
    settings.updatedAt = new Date();

    return {
      business: this.mapBusinessSettingsView(settings),
    };
  }

  getBusinessHours(input: { unitId: string }) {
    const hours = this.ensureBusinessHours(input.unitId)
      .slice()
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
      .map((item) => ({
        id: item.id,
        dayOfWeek: item.dayOfWeek,
        opensAt: item.opensAt ?? "",
        closesAt: item.closesAt ?? "",
        breakStart: item.breakStart ?? "",
        breakEnd: item.breakEnd ?? "",
        isClosed: item.isClosed,
      }));
    return { businessHours: hours };
  }

  updateBusinessHours(input: {
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
    const existing = this.ensureBusinessHours(input.unitId);
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
      const target = existing.find((item) => item.dayOfWeek === row.dayOfWeek);
      if (!target) {
        this.store.businessHours.push({
          id: crypto.randomUUID(),
          unitId: input.unitId,
          dayOfWeek: row.dayOfWeek,
          opensAt: isClosed ? undefined : opensAt,
          closesAt: isClosed ? undefined : closesAt,
          breakStart: isClosed ? undefined : breakStart || undefined,
          breakEnd: isClosed ? undefined : breakEnd || undefined,
          isClosed,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } else {
        target.isClosed = isClosed;
        target.opensAt = isClosed ? undefined : opensAt;
        target.closesAt = isClosed ? undefined : closesAt;
        target.breakStart = isClosed ? undefined : breakStart || undefined;
        target.breakEnd = isClosed ? undefined : breakEnd || undefined;
        target.updatedAt = new Date();
      }
    }
    return this.getBusinessHours({ unitId: input.unitId });
  }

  getPaymentMethods(input: { unitId: string }) {
    const paymentMethods = this.ensurePaymentMethods(input.unitId).map((item) => ({
      id: item.id,
      name: item.name,
      isActive: item.isActive,
      isDefault: item.isDefault,
      createdAt: (item.createdAt ?? new Date()).toISOString(),
      updatedAt: (item.updatedAt ?? new Date()).toISOString(),
    }));
    return { paymentMethods };
  }

  createPaymentMethod(input: { unitId: string; name: string; isActive?: boolean; isDefault?: boolean }) {
    const methods = this.ensurePaymentMethods(input.unitId);
    const name = String(input.name ?? "").trim();
    if (!name) throw new Error("Nome do metodo de pagamento e obrigatorio");
    const duplicate = methods.some((item) => item.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) throw new Error("Metodo de pagamento ja cadastrado");
    const now = new Date();
    const created: BusinessPaymentMethod = {
      id: crypto.randomUUID(),
      unitId: input.unitId,
      name,
      isActive: input.isActive !== false,
      isDefault: Boolean(input.isDefault),
      createdAt: now,
      updatedAt: now,
    };
    if (created.isDefault) {
      methods.forEach((item) => {
        item.isDefault = false;
        item.updatedAt = now;
      });
      created.isActive = true;
    }
    this.store.businessPaymentMethods.push(created);
    if (!methods.some((item) => item.isDefault)) {
      created.isDefault = true;
      created.isActive = true;
      created.updatedAt = now;
    }
    return { paymentMethod: created };
  }

  updatePaymentMethod(input: { unitId: string; paymentMethodId: string; name?: string; isActive?: boolean; isDefault?: boolean }) {
    const methods = this.ensurePaymentMethods(input.unitId);
    const method = methods.find((item) => item.id === input.paymentMethodId);
    if (!method) throw new Error("Metodo de pagamento nao encontrado");
    if (input.name != null) {
      const nextName = String(input.name).trim();
      if (!nextName) throw new Error("Nome do metodo de pagamento e obrigatorio");
      const duplicate = methods.some(
        (item) => item.id !== method.id && item.name.trim().toLowerCase() === nextName.toLowerCase(),
      );
      if (duplicate) throw new Error("Metodo de pagamento ja cadastrado");
      method.name = nextName;
    }
    if (input.isActive != null) method.isActive = Boolean(input.isActive);
    if (input.isDefault != null) {
      if (input.isDefault) {
        methods.forEach((item) => {
          item.isDefault = false;
          item.updatedAt = new Date();
        });
        method.isDefault = true;
        method.isActive = true;
      } else {
        method.isDefault = false;
      }
    }
    if (!methods.some((item) => item.isDefault && item.isActive)) {
      const firstActive = methods.find((item) => item.isActive);
      if (firstActive) firstActive.isDefault = true;
    }
    method.updatedAt = new Date();
    return { paymentMethod: method };
  }

  getBusinessCommissionRules(input: { unitId: string }) {
    const rules = this.store.businessCommissionRules
      .filter((item) => item.unitId === input.unitId)
      .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
      .map((item) => ({
        id: item.id,
        professionalId: item.professionalId ?? null,
        professionalName:
          this.store.professionals.find((professional) => professional.id === item.professionalId)?.name ??
          null,
        serviceId: item.serviceId ?? null,
        serviceName: this.store.services.find((service) => service.id === item.serviceId)?.name ?? null,
        type: item.type,
        value: item.value,
        isActive: item.isActive,
        createdAt: (item.createdAt ?? new Date()).toISOString(),
        updatedAt: (item.updatedAt ?? new Date()).toISOString(),
      }));
    return { commissionRules: rules };
  }

  createBusinessCommissionRule(input: {
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
    if (input.professionalId && !this.store.professionals.find((item) => item.id === input.professionalId)) {
      throw new Error("Profissional nao encontrado");
    }
    if (
      input.serviceId &&
      !this.store.services.find((item) => item.id === input.serviceId && this.isServiceFromUnit(item, input.unitId))
    ) {
      throw new Error("Servico nao encontrado");
    }
    const now = new Date();
    const rule: BusinessCommissionRule = {
      id: crypto.randomUUID(),
      unitId: input.unitId,
      professionalId: input.professionalId || undefined,
      serviceId: input.serviceId || undefined,
      type: input.type,
      value: Number(value.toFixed(2)),
      isActive: input.isActive !== false,
      createdAt: now,
      updatedAt: now,
    };
    this.store.businessCommissionRules.push(rule);
    return { commissionRule: rule };
  }

  updateBusinessCommissionRule(input: {
    unitId: string;
    ruleId: string;
    professionalId?: string;
    serviceId?: string;
    type?: "PERCENTAGE" | "FIXED";
    value?: number;
    isActive?: boolean;
  }) {
    const rule = this.store.businessCommissionRules.find(
      (item) => item.id === input.ruleId && item.unitId === input.unitId,
    );
    if (!rule) throw new Error("Regra de comissao nao encontrada");
    if (input.professionalId != null) {
      if (input.professionalId && !this.store.professionals.find((item) => item.id === input.professionalId)) {
        throw new Error("Profissional nao encontrado");
      }
      rule.professionalId = input.professionalId || undefined;
    }
    if (input.serviceId != null) {
      if (
        input.serviceId &&
        !this.store.services.find((item) => item.id === input.serviceId && this.isServiceFromUnit(item, input.unitId))
      ) {
        throw new Error("Servico nao encontrado");
      }
      rule.serviceId = input.serviceId || undefined;
    }
    if (input.type != null) rule.type = input.type;
    if (input.value != null) {
      const value = Number(input.value);
      if (!Number.isFinite(value) || value < 0) throw new Error("Valor de comissao invalido");
      if ((input.type ?? rule.type) === "PERCENTAGE" && value > 100) {
        throw new Error("Comissao percentual deve ficar entre 0 e 100");
      }
      rule.value = Number(value.toFixed(2));
    }
    if (input.isActive != null) rule.isActive = Boolean(input.isActive);
    rule.updatedAt = new Date();
    return { commissionRule: rule };
  }

  getTeamMembers(input: { unitId: string }) {
    const members = this.ensureTeamMembers(input.unitId)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map((item) => ({
        id: item.id,
        name: item.name,
        role: item.role,
        accessProfile: item.accessProfile,
        email: item.email ?? "",
        phone: item.phone ?? "",
        isActive: item.isActive,
        createdAt: (item.createdAt ?? new Date()).toISOString(),
        updatedAt: (item.updatedAt ?? new Date()).toISOString(),
      }));
    return { teamMembers: members };
  }

  createTeamMember(input: {
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
    const now = new Date();
    const created: BusinessTeamMember = {
      id: crypto.randomUUID(),
      unitId: input.unitId,
      name,
      role: input.role,
      accessProfile: input.accessProfile,
      email: String(input.email ?? "").trim() || undefined,
      phone: String(input.phone ?? "").trim() || undefined,
      isActive: input.isActive !== false,
      createdAt: now,
      updatedAt: now,
    };
    this.store.businessTeamMembers.push(created);
    return { teamMember: created };
  }

  updateTeamMember(input: {
    unitId: string;
    memberId: string;
    name?: string;
    role?: BusinessTeamMember["role"];
    accessProfile?: BusinessTeamMember["accessProfile"];
    email?: string;
    phone?: string;
    isActive?: boolean;
  }) {
    const member = this.store.businessTeamMembers.find(
      (item) => item.id === input.memberId && item.unitId === input.unitId,
    );
    if (!member) throw new Error("Membro da equipe nao encontrado");
    if (input.name != null) {
      const name = String(input.name).trim();
      if (!name) throw new Error("Nome do membro e obrigatorio");
      member.name = name;
    }
    if (input.role != null) member.role = input.role;
    if (input.accessProfile != null) member.accessProfile = input.accessProfile;
    if (input.email != null) member.email = String(input.email).trim() || undefined;
    if (input.phone != null) member.phone = String(input.phone).trim() || undefined;
    if (input.isActive != null) member.isActive = Boolean(input.isActive);
    member.updatedAt = new Date();
    return { teamMember: member };
  }

  private isServiceFromUnit(service: Service, unitId: string) {
    return (service.businessId ?? unitId) === unitId;
  }

  private getServiceProfessionalIds(serviceId: string) {
    return this.store.serviceProfessionalAssignments
      .filter((item) => item.serviceId === serviceId)
      .map((item) => item.professionalId);
  }

  private canProfessionalExecuteService(serviceId: string, professionalId: string) {
    const enabled = this.getServiceProfessionalIds(serviceId);
    if (!enabled.length) return true;
    return enabled.includes(professionalId);
  }

  private assertProfessionalCanExecuteService(serviceId: string, professionalId: string) {
    if (!this.canProfessionalExecuteService(serviceId, professionalId)) {
      throw new Error("Profissional nao habilitado para este servico");
    }
  }

  private getServiceUsageStats(unitId: string) {
    const completedAppointments = this.store.appointments.filter(
      (item) => item.unitId === unitId && item.status === "COMPLETED",
    );
    const statsMap = new Map<
      string,
      {
        salesCount: number;
        revenueGenerated: number;
        lastCompletedAt: Date | null;
      }
    >();
    for (const appointment of completedAppointments) {
      const service = this.store.services.find((item) => item.id === appointment.serviceId);
      if (!service) continue;
      const current = statsMap.get(service.id) ?? {
        salesCount: 0,
        revenueGenerated: 0,
        lastCompletedAt: null,
      };
      current.salesCount += 1;
      current.revenueGenerated += Number(service.price || 0);
      if (!current.lastCompletedAt || appointment.startsAt > current.lastCompletedAt) {
        current.lastCompletedAt = appointment.startsAt;
      }
      statsMap.set(service.id, current);
    }
    return statsMap;
  }

  private buildServiceManagementView(
    service: Service,
    usageStats?: {
      salesCount: number;
      revenueGenerated: number;
      lastCompletedAt: Date | null;
    },
  ) {
    const enabledProfessionalIds = this.getServiceProfessionalIds(service.id);
    const enabledProfessionals = this.store.professionals
      .filter((professional) => enabledProfessionalIds.includes(professional.id))
      .map((professional) => ({
        id: professional.id,
        name: professional.name,
        active: professional.active,
      }));
    const commissionRate = Number(service.defaultCommissionRate ?? 0);
    const estimatedMargin = Number((Number(service.price || 0) - Number(service.costEstimate || 0)).toFixed(2));
    const marginPct =
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
      defaultCommissionRate: commissionRate,
      estimatedCost: Number(service.costEstimate || 0),
      estimatedMargin,
      estimatedMarginPct: marginPct,
      isActive: Boolean(service.active),
      notes: service.notes ?? "",
      enabledProfessionalIds,
      enabledProfessionals,
      salesCount: usageStats?.salesCount ?? 0,
      revenueGenerated: Number((usageStats?.revenueGenerated ?? 0).toFixed(2)),
      lastSoldAt: usageStats?.lastCompletedAt ? usageStats.lastCompletedAt.toISOString() : null,
      createdAt:
        service.createdAt instanceof Date ? service.createdAt.toISOString() : new Date().toISOString(),
      updatedAt:
        service.updatedAt instanceof Date ? service.updatedAt.toISOString() : new Date().toISOString(),
    };
  }

  getServices(input: {
    unitId: string;
    status?: "ACTIVE" | "INACTIVE" | "ALL";
    category?: string;
    search?: string;
    minPrice?: number;
    maxPrice?: number;
  }) {
    const search = String(input.search ?? "").trim().toLowerCase();
    const category = String(input.category ?? "").trim().toLowerCase();
    const status = String(input.status ?? "ALL").toUpperCase();
    const minPrice = input.minPrice != null ? Number(input.minPrice) : null;
    const maxPrice = input.maxPrice != null ? Number(input.maxPrice) : null;
    const usageMap = this.getServiceUsageStats(input.unitId);

    const services = this.store.services
      .filter((item) => this.isServiceFromUnit(item, input.unitId))
      .filter((item) => {
        if (status === "ACTIVE" && !item.active) return false;
        if (status === "INACTIVE" && item.active) return false;
        return true;
      })
      .filter((item) => {
        if (!category) return true;
        return String(item.category ?? "").toLowerCase() === category;
      })
      .filter((item) => {
        const price = Number(item.price || 0);
        if (minPrice != null && Number.isFinite(minPrice) && price < minPrice) return false;
        if (maxPrice != null && Number.isFinite(maxPrice) && price > maxPrice) return false;
        return true;
      })
      .filter((item) => {
        if (!search) return true;
        const haystack = `${item.name} ${item.category ?? ""} ${item.description ?? ""}`.toLowerCase();
        return haystack.includes(search);
      })
      .map((item) => this.buildServiceManagementView(item, usageMap.get(item.id)))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    const categories = [
      ...new Set(
        this.store.services
          .filter((item) => this.isServiceFromUnit(item, input.unitId))
          .map((item) => String(item.category ?? "").trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));

    return {
      services,
      categories,
    };
  }

  getServiceById(input: { unitId: string; serviceId: string }) {
    const service = this.store.services.find(
      (item) => item.id === input.serviceId && this.isServiceFromUnit(item, input.unitId),
    );
    if (!service) throw new Error("Servico nao encontrado");

    const usageMap = this.getServiceUsageStats(input.unitId);
    const usage = usageMap.get(service.id) ?? {
      salesCount: 0,
      revenueGenerated: 0,
      lastCompletedAt: null,
    };
    const serviceView = this.buildServiceManagementView(service, usage);

    const recentUsage = this.store.appointments
      .filter((item) => item.unitId === input.unitId && item.serviceId === service.id)
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
      .slice(0, 8)
      .map((item) => this.buildAppointmentView(item))
      .map((item) => ({
        appointmentId: item.id,
        startsAt: item.startsAt.toISOString(),
        status: item.status,
        client: item.client,
        professional: item.professional,
        revenue: Number(item.servicePrice || 0),
      }));

    return {
      service: serviceView,
      usage: {
        totalAppointments: recentUsage.length,
        totalCompleted: usage.salesCount,
        totalRevenue: usage.revenueGenerated,
        lastSoldAt: usage.lastCompletedAt ? usage.lastCompletedAt.toISOString() : null,
        recent: recentUsage,
      },
      financialImpact: {
        estimatedCostTotal: Number((usage.salesCount * Number(service.costEstimate || 0)).toFixed(2)),
        estimatedProfitTotal: Number(
          (usage.revenueGenerated - usage.salesCount * Number(service.costEstimate || 0)).toFixed(2),
        ),
        estimatedMarginPct: serviceView.estimatedMarginPct,
      },
      professionals: this.store.professionals
        .filter((item) => item.active)
        .map((item) => ({
          id: item.id,
          name: item.name,
          enabled: serviceView.enabledProfessionalIds.includes(item.id),
        })),
    };
  }

  createService(input: {
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
    const commissionRate = Number(input.defaultCommissionRate ?? 0);
    if (!Number.isFinite(price) || price < 0) throw new Error("Preco invalido");
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      throw new Error("Duracao invalida");
    }
    if (!Number.isFinite(estimatedCost) || estimatedCost < 0) throw new Error("Custo estimado invalido");
    if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) {
      throw new Error("Comissao deve estar entre 0% e 100%");
    }
    if (
      this.store.services.some(
        (item) =>
          this.isServiceFromUnit(item, input.unitId) &&
          item.name.trim().toLowerCase() === name.toLowerCase(),
      )
    ) {
      throw new Error("Ja existe servico com este nome");
    }

    const now = new Date();
    const service: Service = {
      id: crypto.randomUUID(),
      businessId: input.unitId,
      name,
      description: String(input.description ?? "").trim() || undefined,
      category: String(input.category ?? "").trim() || undefined,
      price: Number(price.toFixed(2)),
      durationMin: durationMinutes,
      defaultCommissionRate: Number(commissionRate.toFixed(2)),
      costEstimate: Number(estimatedCost.toFixed(2)),
      notes: String(input.notes ?? "").trim() || undefined,
      active: input.isActive !== false,
      createdAt: now,
      updatedAt: now,
    };
    this.store.services.push(service);

    const selectedProfessionalIds = Array.from(
      new Set((Array.isArray(input.professionalIds) ? input.professionalIds : []).map((item) => String(item))),
    );
    for (const professionalId of selectedProfessionalIds) {
      const professional = this.store.professionals.find(
        (item) => item.id === professionalId && item.active,
      );
      if (!professional) continue;
      this.store.serviceProfessionalAssignments.push({
        serviceId: service.id,
        professionalId: professional.id,
      });
    }

    return {
      service: this.buildServiceManagementView(service),
    };
  }

  updateService(input: {
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
    const service = this.store.services.find(
      (item) => item.id === input.serviceId && this.isServiceFromUnit(item, input.unitId),
    );
    if (!service) throw new Error("Servico nao encontrado");

    if (input.name != null) {
      const name = String(input.name).trim();
      if (!name) throw new Error("Nome do servico obrigatorio");
      service.name = name;
    }
    if (input.description !== undefined) {
      service.description = String(input.description || "").trim() || undefined;
    }
    if (input.category !== undefined) {
      service.category = String(input.category || "").trim() || undefined;
    }
    if (input.price != null) {
      const price = Number(input.price);
      if (!Number.isFinite(price) || price < 0) throw new Error("Preco invalido");
      service.price = Number(price.toFixed(2));
    }
    if (input.durationMinutes != null) {
      const durationMinutes = Math.trunc(Number(input.durationMinutes));
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        throw new Error("Duracao invalida");
      }
      service.durationMin = durationMinutes;
    }
    if (input.defaultCommissionRate != null) {
      const commissionRate = Number(input.defaultCommissionRate);
      if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) {
        throw new Error("Comissao deve estar entre 0% e 100%");
      }
      service.defaultCommissionRate = Number(commissionRate.toFixed(2));
    }
    if (input.estimatedCost != null) {
      const estimatedCost = Number(input.estimatedCost);
      if (!Number.isFinite(estimatedCost) || estimatedCost < 0) {
        throw new Error("Custo estimado invalido");
      }
      service.costEstimate = Number(estimatedCost.toFixed(2));
    }
    if (input.notes !== undefined) {
      service.notes = String(input.notes || "").trim() || undefined;
    }
    if (input.isActive != null) {
      service.active = Boolean(input.isActive);
    }
    service.updatedAt = new Date();

    if (Array.isArray(input.professionalIds)) {
      const nextProfessionalIds = new Set(
        input.professionalIds
          .map((item) => String(item))
          .filter((professionalId) =>
            this.store.professionals.some(
              (professional) => professional.id === professionalId && professional.active,
            ),
          ),
      );
      this.store.serviceProfessionalAssignments = this.store.serviceProfessionalAssignments.filter(
        (item) => item.serviceId !== service.id,
      );
      for (const professionalId of nextProfessionalIds) {
        this.store.serviceProfessionalAssignments.push({
          serviceId: service.id,
          professionalId,
        });
      }
    }

    return {
      service: this.buildServiceManagementView(
        service,
        this.getServiceUsageStats(input.unitId).get(service.id),
      ),
    };
  }

  updateServiceStatus(input: { unitId: string; serviceId: string; isActive: boolean }) {
    const service = this.store.services.find(
      (item) => item.id === input.serviceId && this.isServiceFromUnit(item, input.unitId),
    );
    if (!service) throw new Error("Servico nao encontrado");
    service.active = Boolean(input.isActive);
    service.updatedAt = new Date();
    return {
      service: this.buildServiceManagementView(
        service,
        this.getServiceUsageStats(input.unitId).get(service.id),
      ),
    };
  }

  deleteService(input: { unitId: string; serviceId: string }) {
    const index = this.store.services.findIndex(
      (item) => item.id === input.serviceId && this.isServiceFromUnit(item, input.unitId),
    );
    if (index === -1) throw new Error("Servico nao encontrado");
    const service = this.store.services[index];
    const hasHistory = this.store.appointments.some((item) => item.serviceId === service.id);
    if (hasHistory) {
      service.active = false;
      service.updatedAt = new Date();
      return {
        mode: "inactivated",
        service: this.buildServiceManagementView(
          service,
          this.getServiceUsageStats(input.unitId).get(service.id),
        ),
      };
    }

    this.store.services.splice(index, 1);
    this.store.serviceProfessionalAssignments = this.store.serviceProfessionalAssignments.filter(
      (item) => item.serviceId !== service.id,
    );
    this.store.serviceStockConsumptionProfiles = this.store.serviceStockConsumptionProfiles.filter(
      (item) => item.serviceId !== service.id,
    );
    return {
      mode: "deleted",
      serviceId: service.id,
    };
  }

  getServicesSummary(input: { unitId: string }) {
    const services = this.store.services.filter((item) => this.isServiceFromUnit(item, input.unitId));
    const usageMap = this.getServiceUsageStats(input.unitId);
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

  getInventory(input: {
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

    const baseProducts = this.store.products
      .filter((item) => item.active)
      .filter((item) => {
        const businessId = (item as Product & { businessId?: string }).businessId ?? input.unitId;
        return businessId === input.unitId;
      });
    const categories = [...new Set(baseProducts.map((item) => item.category).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, "pt-BR"),
    );

    const products = baseProducts
      .map((item) => this.mapInventoryProduct(item, input.unitId))
      .filter((item) => {
        if (search && !item.name.toLowerCase().includes(search)) return false;
        if (category && item.category !== category) return false;
        if (status === "LOW_STOCK" && item.status !== "LOW_STOCK") return false;
        if (status === "OUT_OF_STOCK" && item.status !== "OUT_OF_STOCK") return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    const movements = this.store.stockMovements
      .filter((item) => item.unitId === input.unitId)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const logs = movements.slice(0, limit).map((item) => {
      const product = this.store.products.find((row) => row.id === item.productId);
      return {
        id: item.id,
        productId: item.productId,
        productName: product?.name ?? "Produto",
        type: item.referenceType === "ADJUSTMENT" ? "ADJUSTMENT" : item.movementType === "IN" ? "IN" : "OUT",
        quantity: item.quantity,
        reason: this.getInventoryReasonFromMovement(item),
        createdAt: item.occurredAt.toISOString(),
      };
    });

    const lastMovement = logs[0] ?? null;
    const summaryProducts = baseProducts.map((item) => this.mapInventoryProduct(item, input.unitId));
    const itemsInStock = summaryProducts.filter((item) => item.quantity > 0).length;
    const lowStockCount = summaryProducts.filter((item) => item.status === "LOW_STOCK").length;
    const estimatedStockValue = summaryProducts.reduce((acc, item) => acc + item.estimatedValue, 0);
    const stockOverview = this.getStockOverview({ unitId: input.unitId, limit });

    return {
      summary: {
        totalProducts: summaryProducts.length,
        itemsInStock,
        lowStockCount,
        estimatedStockValue: Number(estimatedStockValue.toFixed(2)),
        lastMovementAt: lastMovement?.createdAt ?? null,
      },
      categories,
      products,
      logs,
      lastMovement,
      totals: stockOverview.totals,
      lowStock: stockOverview.lowStock,
      recentMovements: stockOverview.recentMovements,
      replenishmentSuggestions: stockOverview.replenishmentSuggestions,
    };
  }

  createInventoryProduct(input: {
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
    if (!Number.isFinite(salePrice) || salePrice < 0) {
      throw new Error("Preco de venda invalido");
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new Error("Quantidade invalida");
    }
    if (!Number.isFinite(costPrice) || costPrice < 0) {
      throw new Error("Custo invalido");
    }
    if (!Number.isFinite(minimumStock) || minimumStock < 0) {
      throw new Error("Estoque minimo invalido");
    }

    const now = new Date();
    const product = {
      id: crypto.randomUUID(),
      businessId: input.unitId,
      name,
      category: String(input.category ?? "").trim() || "Sem categoria",
      salePrice: Number(salePrice.toFixed(2)),
      costPrice: Number(costPrice.toFixed(2)),
      stockQty: quantity,
      minStockAlert: minimumStock,
      notes: String(input.notes ?? "").trim(),
      active: true,
      createdAt: now,
      updatedAt: now,
    } as Product;
    this.store.products.push(product);

    if (quantity > 0) {
      this.store.stockMovements.push({
        id: crypto.randomUUID(),
        unitId: input.unitId,
        productId: product.id,
        movementType: "IN",
        quantity,
        occurredAt: now,
        referenceType: "ADJUSTMENT",
        referenceId: "Estoque inicial no cadastro",
      });
    }

    return {
      product: this.mapInventoryProduct(product, input.unitId),
    };
  }

  updateInventoryProduct(input: {
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
    const product = this.store.products.find(
      (item) =>
        item.id === input.id &&
        item.active &&
        ((item as Product & { businessId?: string }).businessId ?? input.unitId) === input.unitId,
    ) as (Product & { notes?: string; businessId?: string; createdAt?: Date; updatedAt?: Date }) | undefined;
    if (!product) throw new Error("Produto nao encontrado");

    const nextName = input.name != null ? String(input.name).trim() : product.name;
    if (!nextName) throw new Error("Nome do produto obrigatorio");
    const nextSalePrice = input.salePrice != null ? Number(input.salePrice) : Number(product.salePrice || 0);
    const nextCostPrice = input.costPrice != null ? Number(input.costPrice) : Number(product.costPrice || 0);
    const nextMinimumStock =
      input.minimumStock != null ? Math.trunc(Number(input.minimumStock)) : Number(product.minStockAlert || 0);
    const nextQuantity =
      input.quantity != null ? Math.trunc(Number(input.quantity)) : Number(product.stockQty || 0);
    if (!Number.isFinite(nextSalePrice) || nextSalePrice < 0) {
      throw new Error("Preco de venda invalido");
    }
    if (!Number.isFinite(nextCostPrice) || nextCostPrice < 0) {
      throw new Error("Custo invalido");
    }
    if (!Number.isFinite(nextMinimumStock) || nextMinimumStock < 0) {
      throw new Error("Estoque minimo invalido");
    }
    if (!Number.isFinite(nextQuantity) || nextQuantity < 0) {
      throw new Error("Quantidade invalida");
    }

    const previousQty = Number(product.stockQty || 0);
    product.name = nextName;
    product.salePrice = Number(nextSalePrice.toFixed(2));
    product.costPrice = Number(nextCostPrice.toFixed(2));
    product.minStockAlert = nextMinimumStock;
    product.category = input.category != null ? String(input.category).trim() || "Sem categoria" : product.category;
    if (input.notes != null) {
      product.notes = String(input.notes).trim();
    }
    product.stockQty = nextQuantity;
    product.businessId = input.unitId;
    product.updatedAt = new Date();

    let log: { id: string; type: "IN" | "OUT" | "ADJUSTMENT"; quantity: number; reason: string; createdAt: string } | null =
      null;
    if (nextQuantity !== previousQty) {
      const delta = nextQuantity - previousQty;
      const movement = {
        id: crypto.randomUUID(),
        unitId: input.unitId,
        productId: product.id,
        movementType: delta > 0 ? ("IN" as const) : ("OUT" as const),
        quantity: Math.abs(delta),
        occurredAt: new Date(),
        referenceType: "ADJUSTMENT" as const,
        referenceId: "Ajuste por edicao de produto",
      };
      this.store.stockMovements.push(movement);
      log = {
        id: movement.id,
        type: "ADJUSTMENT",
        quantity: movement.quantity,
        reason: this.getInventoryReasonFromMovement(movement),
        createdAt: movement.occurredAt.toISOString(),
      };
    }

    return {
      product: this.mapInventoryProduct(product, input.unitId),
      log,
    };
  }

  archiveInventoryProduct(input: {
    unitId: string;
    id: string;
  }) {
    const product = this.store.products.find(
      (item) =>
        item.id === input.id &&
        item.active &&
        ((item as Product & { businessId?: string }).businessId ?? input.unitId) === input.unitId,
    );
    if (!product) throw new Error("Produto nao encontrado");
    product.active = false;
    return {
      id: product.id,
      inactive: true,
    };
  }

  adjustInventoryStock(input: {
    unitId: string;
    id: string;
    type: "IN" | "OUT" | "ADJUSTMENT";
    quantity: number;
    reason?: string;
  }) {
    const product = this.store.products.find(
      (item) =>
        item.id === input.id &&
        item.active &&
        ((item as Product & { businessId?: string }).businessId ?? input.unitId) === input.unitId,
    );
    if (!product) throw new Error("Produto nao encontrado");
    const quantity = Math.trunc(Number(input.quantity));
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new Error("Quantidade invalida");
    }

    const current = Number(product.stockQty || 0);
    let nextQty = current;
    let movementType: "IN" | "OUT";
    let movementQty = quantity;

    if (input.type === "IN") {
      movementType = "IN";
      nextQty = current + quantity;
    } else if (input.type === "OUT") {
      if (quantity > current) throw new Error("Quantidade de saida maior que o saldo atual");
      movementType = "OUT";
      nextQty = current - quantity;
    } else {
      nextQty = quantity;
      const delta = nextQty - current;
      movementType = delta >= 0 ? "IN" : "OUT";
      movementQty = Math.abs(delta);
    }

    if (nextQty < 0) throw new Error("Nao e permitido quantidade negativa");
    product.stockQty = nextQty;

    if (movementQty === 0) {
      return {
        product: this.mapInventoryProduct(product, input.unitId),
        log: null,
      };
    }

    const movement = {
      id: crypto.randomUUID(),
      unitId: input.unitId,
      productId: product.id,
      movementType,
      quantity: movementQty,
      occurredAt: new Date(),
      referenceType: "ADJUSTMENT" as const,
      referenceId: String(input.reason ?? "").trim() || "Ajuste rapido de estoque",
    };
    this.store.stockMovements.push(movement);

    return {
      product: this.mapInventoryProduct(product, input.unitId),
      log: {
        id: movement.id,
        type: input.type === "ADJUSTMENT" ? "ADJUSTMENT" : input.type,
        quantity: movement.quantity,
        reason: this.getInventoryReasonFromMovement(movement),
        createdAt: movement.occurredAt.toISOString(),
      },
    };
  }

  getServiceStockConsumption(input: {
    unitId: string;
    serviceId: string;
  }) {
    const service = this.store.services.find(
      (item) => item.id === input.serviceId && item.businessId === input.unitId,
    );
    if (!service) throw new Error("Servico nao encontrado");
    const profile = this.store.serviceStockConsumptionProfiles.find(
      (item) => item.unitId === input.unitId && item.serviceId === input.serviceId,
    );
    return {
      unitId: input.unitId,
      serviceId: input.serviceId,
      items: profile?.items ?? [],
      updatedAt: (profile?.updatedAt ?? new Date()).toISOString(),
    };
  }

  setServiceStockConsumption(input: {
    unitId: string;
    serviceId: string;
    items: ServiceStockConsumptionItem[];
  }) {
    const service = this.store.services.find(
      (item) => item.id === input.serviceId && item.businessId === input.unitId,
    );
    if (!service) throw new Error("Servico nao encontrado");
    const normalized = normalizeConsumptionItems(input.items);
    for (const item of normalized) {
      const product = this.store.products.find(
        (row) =>
          row.id === item.productId &&
          row.active &&
          ((row as Product & { businessId?: string }).businessId ?? "unit-01") === input.unitId,
      );
      if (!product) throw new Error(`Produto ${item.productId} nao encontrado ou inativo`);
    }
    const now = new Date();
    const existingIndex = this.store.serviceStockConsumptionProfiles.findIndex(
      (item) => item.unitId === input.unitId && item.serviceId === input.serviceId,
    );
    if (existingIndex >= 0) {
      this.store.serviceStockConsumptionProfiles[existingIndex] = {
        ...this.store.serviceStockConsumptionProfiles[existingIndex],
        items: normalized,
        updatedAt: now,
      };
    } else {
      this.store.serviceStockConsumptionProfiles.push({
        unitId: input.unitId,
        serviceId: input.serviceId,
        items: normalized,
        updatedAt: now,
      });
    }

    return {
      unitId: input.unitId,
      serviceId: input.serviceId,
      items: normalized,
      updatedAt: now.toISOString(),
    };
  }

  schedule(input: {
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
    const service = this.store.services.find((item) => item.id === input.serviceId);
    if (!service || !service.active) throw new Error("Servico nao encontrado ou inativo");

    const professional = this.store.professionals.find(
      (item) => item.id === input.professionalId,
    );
    if (!professional || !professional.active) {
      throw new Error("Profissional nao encontrado ou inativo");
    }
    this.assertProfessionalCanExecuteService(service.id, professional.id);

    const client = this.store.clients.find((item) => item.id === input.clientId);
    if (!client) throw new Error("Cliente nao encontrado");

    const expectedEnd = new Date(
      input.startsAt.getTime() + (service.durationMin + (input.bufferAfterMin ?? 0)) * 60_000,
    );
    const appointment = this.engine.scheduleAppointment(
      {
        unitId: input.unitId,
        clientId: client.id,
        professionalId: professional.id,
        service,
        startsAt: input.startsAt,
        bufferAfterMin: input.bufferAfterMin,
        isFitting: input.isFitting,
        notes: input.notes,
        changedBy: input.changedBy,
      },
      this.store.appointments.filter(
        (item) =>
          item.unitId === input.unitId &&
          item.professionalId === professional.id &&
          item.startsAt < expectedEnd &&
          item.endsAt > input.startsAt,
      ),
    );

    this.store.appointments.push(appointment);
    return appointment;
  }

  reschedule(input: {
    appointmentId: string;
    unitId?: string;
    startsAt: Date;
    changedBy: string;
  }) {
    const appointment = this.store.appointments.find(
      (item) => item.id === input.appointmentId,
    );
    if (!appointment) throw new Error("Agendamento nao encontrado");
    if (input.unitId && appointment.unitId !== input.unitId) {
      throw new Error("Unidade nao autorizada");
    }

    const service = this.store.services.find((item) => item.id === appointment.serviceId);
    if (!service) throw new Error("Servico do agendamento nao encontrado");

    const updated = this.engine.rescheduleAppointment(
      appointment,
      input.startsAt,
      service.durationMin,
      this.store.appointments.filter(
        (item) =>
          item.unitId === appointment.unitId &&
          item.professionalId === appointment.professionalId &&
          item.id !== appointment.id &&
          item.startsAt < new Date(input.startsAt.getTime() + service.durationMin * 60_000) &&
          item.endsAt > input.startsAt,
      ),
      input.changedBy,
    );

    this.replaceAppointment(updated);
    return updated;
  }

  updateStatus(input: {
    appointmentId: string;
    unitId?: string;
    status: AppointmentStatus;
    changedBy: string;
    reason?: string;
  }) {
    const appointment = this.store.appointments.find(
      (item) => item.id === input.appointmentId,
    );
    if (!appointment) throw new Error("Agendamento nao encontrado");
    if (input.unitId && appointment.unitId !== input.unitId) {
      throw new Error("Unidade nao autorizada");
    }

    const updated = this.engine.changeAppointmentStatus(
      appointment,
      input.status,
      input.changedBy,
      input.reason,
    );

    this.replaceAppointment(updated);
    return updated;
  }

  complete(input: {
    appointmentId: string;
    unitId?: string;
    changedBy: string;
    completedAt: Date;
  }) {
    const appointment = this.store.appointments.find(
      (item) => item.id === input.appointmentId,
    );
    if (!appointment) throw new Error("Agendamento nao encontrado");
    if (input.unitId && appointment.unitId !== input.unitId) {
      throw new Error("Unidade nao autorizada");
    }

    const service = this.store.services.find((item) => item.id === appointment.serviceId);
    if (!service) throw new Error("Servico nao encontrado");

    const professional = this.store.professionals.find(
      (item) => item.id === appointment.professionalId,
    );
    if (!professional) throw new Error("Profissional nao encontrado");

    const monthlyProducedValue = this.store.financialEntries
      .filter(
        (item) =>
          item.kind === "INCOME" &&
          item.source === "SERVICE" &&
          item.occurredAt.getMonth() === input.completedAt.getMonth() &&
          item.occurredAt.getFullYear() === input.completedAt.getFullYear(),
      )
      .reduce((acc, item) => acc + item.amount, 0);

    const result = this.engine.completeAppointment({
      appointment,
      service,
      professional,
      monthlyProducedValue,
      changedBy: input.changedBy,
      completedAt: input.completedAt,
    });

    const stockConsumption = this.applyServiceStockConsumption({
      unitId: appointment.unitId,
      serviceId: appointment.serviceId,
      appointmentId: appointment.id,
      occurredAt: input.completedAt,
    });

    result.revenue.professionalId = appointment.professionalId;
    result.revenue.customerId = appointment.clientId;
    result.revenue.paymentMethod = result.revenue.paymentMethod ?? "NAO_INFORMADO";
    result.revenue.updatedAt = input.completedAt;

    this.replaceAppointment(result.appointment);
    this.store.financialEntries.push(result.revenue);
    if (result.commission) this.store.commissionEntries.push(result.commission);
    if (stockConsumption.items.length > 0) {
      stockConsumption.items.forEach((item) => {
        const movement = this.store.stockMovements.find((row) => row.id === item.movementId);
        if (!movement) return;
        const product = this.store.products.find((row) => row.id === movement.productId);
        if (!product) return;
        product.stockQty -= movement.quantity;
      });
    }

    return {
      ...result,
      stockConsumption,
    };
  }

  registerProductSale(input: {
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
    audit?: unknown;
  }) {
    const scope = this.idempotencyScope({
      unitId: input.unitId,
      action: "PRODUCT_SALE_CREATE",
      idempotencyKey: input.idempotencyKey,
      payloadHash: input.idempotencyPayloadHash,
      payload: input,
    });
    const replay = this.replayMemoryIdempotency<ReturnType<BarbershopEngine["registerProductSale"]>>(scope);
    if (replay) return replay;

    const sale: ProductSale = {
      id: crypto.randomUUID(),
      unitId: input.unitId,
      clientId: input.clientId,
      professionalId: input.professionalId,
      items: input.items.map((item) => {
        const product = this.store.products.find(
          (row) =>
            row.id === item.productId &&
            ((row as Product & { businessId?: string }).businessId ?? "unit-01") === input.unitId,
        );
        if (!product || !product.active) {
          throw new Error(`Produto ${item.productId} nao encontrado ou inativo`);
        }

        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: product.salePrice,
          unitCost: product.costPrice,
        };
      }),
      grossAmount: 0,
      soldAt: input.soldAt,
    };

    const professional = input.professionalId
      ? this.store.professionals.find((row) => row.id === input.professionalId)
      : undefined;

    const result = this.engine.registerProductSale({
      sale,
      products: this.store.products,
      professional,
    });

    result.revenue.professionalId = sale.professionalId;
    result.revenue.customerId = sale.clientId;
    result.revenue.paymentMethod = result.revenue.paymentMethod ?? "NAO_INFORMADO";
    result.revenue.updatedAt = input.soldAt;

    this.startMemoryIdempotency(scope);
    this.store.productSales.push(result.sale);
    this.store.financialEntries.push(result.revenue);
    this.store.stockMovements.push(...result.stockMovements);
    if (result.commission) this.store.commissionEntries.push(result.commission);

    for (const movement of result.stockMovements) {
      const product = this.store.products.find((item) => item.id === movement.productId);
      if (!product) continue;
      product.stockQty -= movement.quantity;
    }

    this.finishMemoryIdempotency(scope, result);
    return result;
  }

  listProductSales(input: {
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
    const search = String(input.search ?? "").trim().toLowerCase();
    const rows = this.store.productSales
      .filter((sale) => sale.unitId === input.unitId)
      .filter((sale) => !input.start || sale.soldAt >= input.start)
      .filter((sale) => !input.end || sale.soldAt <= input.end)
      .filter((sale) => !input.clientId || sale.clientId === input.clientId)
      .filter((sale) => !input.professionalId || sale.professionalId === input.professionalId)
      .filter(
        (sale) =>
          !input.productId || sale.items.some((item) => item.productId === input.productId),
      )
      .map((sale): ProductSaleHistoryRow => {
        const refunds = this.store.refunds.filter(
          (refund) => refund.unitId === input.unitId && refund.productSaleId === sale.id,
        );
        const refundedByProduct = new Map<string, number>();
        let totalRefundedAmount = 0;
        for (const refund of refunds) {
          totalRefundedAmount += Number(refund.totalAmount ?? 0);
          for (const item of refund.items ?? []) {
            refundedByProduct.set(
              item.productId,
              (refundedByProduct.get(item.productId) ?? 0) + Number(item.quantity ?? 0),
            );
          }
        }
        const items = sale.items.map((item) => {
          const product = this.store.products.find((row) => row.id === item.productId);
          const refundedQuantity = refundedByProduct.get(item.productId) ?? 0;
          return {
            productId: item.productId,
            productName: product?.name ?? item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unitCost: item.unitCost,
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
        const client = sale.clientId
          ? this.store.clients.find((row) => row.id === sale.clientId)
          : undefined;
        const professional = sale.professionalId
          ? this.store.professionals.find((row) => row.id === sale.professionalId)
          : undefined;
        return {
          id: sale.id,
          unitId: sale.unitId,
          soldAt: sale.soldAt,
          clientId: sale.clientId,
          clientName: client?.fullName,
          professionalId: sale.professionalId,
          professionalName: professional?.name,
          grossAmount: Number(Number(sale.grossAmount ?? 0).toFixed(2)),
          items,
          totalRefundedAmount: Number(totalRefundedAmount.toFixed(2)),
          status,
          createdAt: (sale as ProductSale & { createdAt?: Date }).createdAt ?? sale.soldAt,
        };
      })
      .filter((sale) => !input.status || sale.status === input.status)
      .filter((sale) => {
        if (!search) return true;
        const haystack = [
          sale.id,
          sale.clientName ?? "",
          sale.professionalName ?? "",
          ...sale.items.map((item) => item.productName ?? item.productId),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(search);
      })
      .sort((a, b) => b.soldAt.getTime() - a.soldAt.getTime())
      .slice(0, limit);

    return { sales: rows, summary: { total: rows.length, limit } };
  }

  checkoutAppointment(input: {
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
    audit?: unknown;
  }) {
    const appointment = this.store.appointments.find((item) => item.id === input.appointmentId);
    if (!appointment) throw new Error("Agendamento nao encontrado");
    if (input.unitId && appointment.unitId !== input.unitId) throw new Error("Unidade nao autorizada");
    const checkoutScope = this.idempotencyScope({
      unitId: appointment.unitId,
      action: "APPOINTMENT_CHECKOUT",
      idempotencyKey: input.idempotencyKey,
      payloadHash: input.idempotencyPayloadHash,
      payload: input,
    });
    const checkoutReplay = this.replayMemoryIdempotency<{
      appointment: unknown;
      serviceRevenue: unknown;
      productRevenue?: unknown;
      sale?: unknown;
      stockMovements: unknown[];
      commissions: unknown[];
      clientMetrics: unknown;
      stockConsumption: unknown;
    }>(checkoutScope);
    if (checkoutReplay) return checkoutReplay;
    if (appointment.status === "COMPLETED") throw new Error("Atendimento ja finalizado");

    const paymentMethod = String(input.paymentMethod || "").trim();
    if (!paymentMethod) throw new Error("Metodo de pagamento obrigatorio");

    this.startMemoryIdempotency(checkoutScope);
    const serviceResult = this.complete({
      appointmentId: input.appointmentId,
      unitId: input.unitId,
      changedBy: input.changedBy,
      completedAt: input.completedAt,
    });
    serviceResult.revenue.paymentMethod = paymentMethod;
    if (input.notes) serviceResult.revenue.notes = String(input.notes).trim();

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
    let saleResult:
      | ReturnType<BarbershopEngine["registerProductSale"]>
      | undefined;
    if (checkoutProducts.length > 0) {
      saleResult = this.registerProductSale({
        unitId: appointment.unitId,
        professionalId: appointment.professionalId,
        clientId: appointment.clientId,
        soldAt: input.completedAt,
        items: checkoutProducts,
      });
      saleResult.revenue.paymentMethod = paymentMethod;
      if (input.notes) saleResult.revenue.notes = String(input.notes).trim();
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

    const clientAppointments = this.store.appointments
      .filter(
        (item) =>
          item.unitId === appointment.unitId &&
          item.clientId === appointment.clientId &&
          item.status === "COMPLETED",
      )
      .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());
    const totalSpent = this.store.financialEntries
      .filter(
        (entry) =>
          entry.unitId === appointment.unitId &&
          entry.customerId === appointment.clientId &&
          entry.kind === "INCOME",
      )
      .reduce((acc, entry) => acc + Number(entry.amount || 0), 0);
    const window90 = new Date(input.completedAt.getTime() - 90 * 24 * 60 * 60 * 1000);
    const frequency90d = clientAppointments.filter((item) => item.endsAt >= window90).length;

    const response = {
      appointment: serviceResult.appointment,
      serviceRevenue: serviceResult.revenue,
      productRevenue: saleResult?.revenue,
      sale: saleResult?.sale,
      stockMovements: saleResult?.stockMovements ?? [],
      commissions: [serviceResult.commission, saleResult?.commission].filter(Boolean),
      clientMetrics: {
        lastVisitAt: clientAppointments[0]?.endsAt ?? input.completedAt,
        totalSpent: Number(totalSpent.toFixed(2)),
        frequency90d,
      },
      stockConsumption: serviceResult.stockConsumption,
    };
    this.finishMemoryIdempotency(checkoutScope, response);
    return response;
  }

  refundAppointment(input: {
    appointmentId: string;
    unitId: string;
    changedBy: string;
    reason: string;
    refundedAt: Date;
    idempotencyKey?: string;
    idempotencyPayloadHash?: string;
    audit?: unknown;
  }) {
    const appointment = this.store.appointments.find((item) => item.id === input.appointmentId);
    if (!appointment) throw new Error("Agendamento nao encontrado");
    if (appointment.unitId !== input.unitId) throw new Error("Unidade nao autorizada");

    const scope = this.idempotencyScope({
      unitId: input.unitId,
      action: "APPOINTMENT_REFUND",
      idempotencyKey: input.idempotencyKey,
      payloadHash: input.idempotencyPayloadHash,
      payload: input,
    });
    const replay = this.replayMemoryIdempotency<{
      refund: Refund;
      financialEntry: FinancialEntry;
      stockMovements: unknown[];
    }>(scope);
    if (replay) return replay;

    if (appointment.status !== "COMPLETED") {
      throw new Error("Atendimento nao concluido nao pode ser estornado");
    }
    const reason = String(input.reason ?? "").trim();
    if (!reason) throw new Error("Motivo do estorno e obrigatorio");
    if (!(input.refundedAt instanceof Date) || Number.isNaN(input.refundedAt.getTime())) {
      throw new Error("Data do estorno invalida");
    }

    const originalRevenue = this.store.financialEntries.find(
      (entry) =>
        entry.unitId === input.unitId &&
        entry.kind === "INCOME" &&
        entry.source === "SERVICE" &&
        entry.referenceType === "APPOINTMENT" &&
        entry.referenceId === appointment.id,
    );
    if (!originalRevenue) throw new Error("Receita original do atendimento nao encontrada");

    const alreadyRefunded = this.store.refunds.some(
      (refund) => refund.unitId === input.unitId && refund.appointmentId === appointment.id,
    );
    if (alreadyRefunded) throw new Error("Atendimento ja estornado");

    const refund: Refund = {
      id: crypto.randomUUID(),
      unitId: input.unitId,
      appointmentId: appointment.id,
      totalAmount: Number(Number(originalRevenue.amount ?? 0).toFixed(2)),
      reason,
      refundedAt: input.refundedAt,
      changedBy: input.changedBy,
      idempotencyKey: input.idempotencyKey,
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

    this.startMemoryIdempotency(scope);
    this.store.refunds.push(refund);
    this.store.financialEntries.push(financialEntry);
    appointment.history.push({
      changedAt: input.refundedAt,
      changedBy: input.changedBy,
      action: "REFUNDED",
      reason,
    });

    const response = {
      refund,
      financialEntry,
      stockMovements: [],
    };
    this.finishMemoryIdempotency(scope, response);
    return response;
  }

  refundProductSale(input: {
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
    audit?: unknown;
  }) {
    const sale = this.store.productSales.find((item) => item.id === input.productSaleId);
    if (!sale) throw new Error("Venda de produto nao encontrada");
    if (sale.unitId !== input.unitId) throw new Error("Unidade nao autorizada");

    const scope = this.idempotencyScope({
      unitId: input.unitId,
      action: "PRODUCT_SALE_REFUND",
      idempotencyKey: input.idempotencyKey,
      payloadHash: input.idempotencyPayloadHash,
      payload: input,
    });
    const replay = this.replayMemoryIdempotency<{
      refund: Refund;
      financialEntry: FinancialEntry;
      stockMovements: unknown[];
    }>(scope);
    if (replay) return replay;

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

    const soldByProduct = new Map<string, { quantity: number; unitPrice: number }>();
    for (const item of sale.items) {
      const current = soldByProduct.get(item.productId) ?? {
        quantity: 0,
        unitPrice: Number(item.unitPrice ?? 0),
      };
      current.quantity += Number(item.quantity ?? 0);
      current.unitPrice = Number(item.unitPrice ?? current.unitPrice);
      soldByProduct.set(item.productId, current);
    }

    const refundedByProduct = new Map<string, number>();
    for (const refund of this.store.refunds.filter(
      (item) => item.unitId === input.unitId && item.productSaleId === sale.id,
    )) {
      for (const item of refund.items ?? []) {
        refundedByProduct.set(
          item.productId,
          (refundedByProduct.get(item.productId) ?? 0) + Number(item.quantity ?? 0),
        );
      }
    }

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
        refundId: "",
        productId,
        quantity,
        unitPrice: sold.unitPrice,
        amount,
      });
    }

    const refund: Refund = {
      id: crypto.randomUUID(),
      unitId: input.unitId,
      productSaleId: sale.id,
      totalAmount: Number(totalAmount.toFixed(2)),
      reason,
      refundedAt: input.refundedAt,
      changedBy: input.changedBy,
      idempotencyKey: input.idempotencyKey,
      createdAt: input.refundedAt,
      items: refundItems.map((item) => ({ ...item, refundId: "" })),
    };
    refund.items = refund.items?.map((item) => ({ ...item, refundId: refund.id }));

    const financialEntry = buildProductRefundExpenseEntry({
      unitId: input.unitId,
      refundId: refund.id,
      productSaleId: sale.id,
      professionalId: sale.professionalId,
      customerId: sale.clientId,
      amount: refund.totalAmount,
      occurredAt: input.refundedAt,
      reason,
    });
    const stockMovements = buildStockMovementsFromProductRefund({
      unitId: input.unitId,
      refundId: refund.id,
      occurredAt: input.refundedAt,
      items: refund.items ?? [],
    });

    this.startMemoryIdempotency(scope);
    this.store.refunds.push(refund);
    this.store.financialEntries.push(financialEntry);
    this.store.stockMovements.push(...stockMovements);
    for (const movement of stockMovements) {
      const product = this.store.products.find((item) => item.id === movement.productId);
      if (product) product.stockQty += movement.quantity;
    }

    const response = {
      refund,
      financialEntry,
      stockMovements,
    };
    this.finishMemoryIdempotency(scope, response);
    return response;
  }

  registerManualFinancialEntry(input: {
    unitId: string;
    kind: "INCOME" | "EXPENSE";
    amount: number;
    occurredAt: Date;
    description: string;
    changedBy: string;
    idempotencyKey?: string;
    idempotencyPayloadHash?: string;
    audit?: unknown;
  }) {
    return this.createFinancialTransaction({
      unitId: input.unitId,
      type: input.kind,
      amount: input.amount,
      date: input.occurredAt,
      description: input.description,
      category: input.kind === "EXPENSE" ? "OPERACIONAL" : "RECEITA_MANUAL",
      source: "MANUAL",
      changedBy: input.changedBy,
      idempotencyKey: input.idempotencyKey,
      idempotencyPayloadHash: input.idempotencyPayloadHash,
    });
  }

  registerStockManualMovement(input: {
    unitId: string;
    productId: string;
    movementType: "IN" | "OUT" | "LOSS" | "INTERNAL_USE";
    quantity: number;
    occurredAt: Date;
    referenceType?: "ADJUSTMENT" | "INTERNAL";
    referenceId?: string;
  }) {
    const product = this.store.products.find(
      (item) =>
        item.id === input.productId &&
        item.active &&
        ((item as Product & { businessId?: string }).businessId ?? "unit-01") === input.unitId,
    );
    if (!product) throw new Error("Produto nao encontrado ou inativo");
    const quantity = Math.trunc(Number(input.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Quantidade invalida para movimentacao de estoque");
    }

    if (input.movementType !== "IN" && product.stockQty < quantity) {
      throw new Error("Saldo insuficiente para movimentacao de saida");
    }

    if (input.movementType === "IN") {
      product.stockQty += quantity;
    } else {
      product.stockQty -= quantity;
    }

    const movement = {
      id: crypto.randomUUID(),
      unitId: input.unitId,
      productId: input.productId,
      movementType: input.movementType,
      quantity,
      occurredAt: input.occurredAt,
      referenceType: input.referenceType ?? "ADJUSTMENT",
      referenceId: input.referenceId,
    };
    this.store.stockMovements.push(movement);
    return {
      movement,
      product: {
        id: product.id,
        name: product.name,
        stockQty: product.stockQty,
      },
    };
  }

  private normalizeTransactionSource(source?: string) {
    const normalized = String(source ?? "").trim().toUpperCase();
    if (!normalized) return "MANUAL";
    if (["SERVICE", "PRODUCT", "COMMISSION", "REFUND", "MANUAL"].includes(normalized)) {
      return normalized;
    }
    return "MANUAL";
  }

  getFinancialSummary(input: {
    unitId: string;
    start: Date;
    end: Date;
    compareStart?: Date;
    compareEnd?: Date;
  }) {
    const range = {
      start: new Date(input.start),
      end: new Date(input.end),
    };
    const compare = this.resolveComparisonRange({
      start: range.start,
      end: range.end,
      compareStart: input.compareStart,
      compareEnd: input.compareEnd,
    });

    const sumForRange = (start: Date, end: Date) => {
      const transactions = this.store.financialEntries.filter(
        (item) =>
          item.unitId === input.unitId && item.occurredAt >= start && item.occurredAt <= end,
      );
      const income = transactions
        .filter((item) => item.kind === "INCOME")
        .reduce((acc, item) => acc + Number(item.amount ?? 0), 0);
      const expenses = transactions
        .filter((item) => item.kind === "EXPENSE")
        .reduce((acc, item) => acc + Number(item.amount ?? 0), 0);
      const commissions = this.store.commissionEntries
        .filter(
          (item) =>
            item.unitId === input.unitId &&
            item.occurredAt >= start &&
            item.occurredAt <= end &&
            (item.status ?? "PENDING") === "PENDING",
        )
        .reduce((acc, item) => acc + Number(item.commissionAmount ?? 0), 0);
      const appointmentsCount = this.store.appointments.filter(
        (item) =>
          item.unitId === input.unitId &&
          item.status === "COMPLETED" &&
          item.startsAt >= start &&
          item.startsAt <= end,
      ).length;
      const ticketAverage = appointmentsCount > 0 ? income / appointmentsCount : 0;
      const net = income - expenses;
      const estimatedProfit = income - expenses - commissions;
      return {
        income: Number(income.toFixed(2)),
        expenses: Number(expenses.toFixed(2)),
        net: Number(net.toFixed(2)),
        estimatedProfit: Number(estimatedProfit.toFixed(2)),
        pendingCommissions: Number(
          this.store.commissionEntries
            .filter(
              (item) =>
                item.unitId === input.unitId &&
                item.occurredAt >= start &&
                item.occurredAt <= end &&
                (item.status ?? "PENDING") === "PENDING",
            )
            .reduce((acc, item) => acc + Number(item.commissionAmount ?? 0), 0)
            .toFixed(2),
        ),
        ticketAverage: Number(ticketAverage.toFixed(2)),
      };
    };

    const current = sumForRange(range.start, range.end);
    const previous = sumForRange(compare.start, compare.end);

    return {
      period: {
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        compareStart: compare.start.toISOString(),
        compareEnd: compare.end.toISOString(),
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

  getFinancialTransactions(input: {
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
    const category = String(input.category ?? "").trim().toLowerCase();
    const paymentMethod = String(input.paymentMethod ?? "").trim().toLowerCase();
    const source = String(input.source ?? "").trim().toUpperCase();
    const professionalId = String(input.professionalId ?? "").trim();
    const customerId = String(input.customerId ?? "").trim();
    const search = String(input.search ?? "").trim().toLowerCase();

    const transactions = this.store.financialEntries
      .filter((item) => {
        if (item.unitId !== input.unitId) return false;
        if (item.occurredAt < input.start || item.occurredAt > input.end) return false;
        if (input.type && item.kind !== input.type) return false;
        if (category && String(item.category ?? "").toLowerCase() !== category) return false;
        if (
          paymentMethod &&
          String(item.paymentMethod ?? "").toLowerCase() !== paymentMethod
        ) {
          return false;
        }
        if (source && this.normalizeTransactionSource(item.source) !== source) return false;
        if (professionalId && item.professionalId !== professionalId) return false;
        if (customerId && item.customerId !== customerId) return false;
        if (search) {
          const text = `${item.description ?? ""} ${item.notes ?? ""}`.toLowerCase();
          if (!text.includes(search)) return false;
        }
        return true;
      })
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, limit)
      .map((item) => {
        const professional = item.professionalId
          ? this.store.professionals.find((row) => row.id === item.professionalId)
          : null;
        const customer = item.customerId
          ? this.store.clients.find((row) => row.id === item.customerId)
          : null;
        return {
          id: item.id,
          businessId: item.unitId,
          type: item.kind,
          category: item.category ?? "GERAL",
          description: item.description,
          amount: Number(Number(item.amount ?? 0).toFixed(2)),
          paymentMethod: item.paymentMethod ?? null,
          source: this.normalizeTransactionSource(item.source),
          appointmentId: item.referenceType === "APPOINTMENT" ? item.referenceId ?? null : null,
          productSaleId:
            item.referenceType === "PRODUCT_SALE" ? item.referenceId ?? null : null,
          commissionId: item.referenceType === "COMMISSION" ? item.referenceId ?? null : null,
          professionalId: item.professionalId ?? null,
          professionalName: professional?.name ?? null,
          customerId: item.customerId ?? null,
          customerName: customer?.fullName ?? null,
          date: item.occurredAt.toISOString(),
          notes: item.notes ?? null,
          createdAt: (item.createdAt ?? item.occurredAt).toISOString(),
          updatedAt: (item.updatedAt ?? item.occurredAt).toISOString(),
          referenceType: item.referenceType,
          referenceId: item.referenceId ?? null,
        };
      });

    const income = transactions
      .filter((item) => item.type === "INCOME")
      .reduce((acc, item) => acc + item.amount, 0);
    const expenses = transactions
      .filter((item) => item.type === "EXPENSE")
      .reduce((acc, item) => acc + item.amount, 0);

    return {
      transactions,
      summary: {
        income: Number(income.toFixed(2)),
        expense: Number(expenses.toFixed(2)),
        net: Number((income - expenses).toFixed(2)),
      },
    };
  }

  createFinancialTransaction(input: {
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
    audit?: unknown;
    auditAction?: string;
    auditEntity?: string;
  }) {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error("Valor invalido para lancamento");
    }
    const description = String(input.description ?? "").trim();
    if (!description) throw new Error("Descricao obrigatoria");
    if (!(input.date instanceof Date) || Number.isNaN(input.date.getTime())) {
      throw new Error("Data obrigatoria");
    }
    const category = String(input.category ?? "").trim();
    if (!category) throw new Error("Categoria obrigatoria");

    const source = this.normalizeTransactionSource(input.source);
    const referenceType =
      input.appointmentId != null
        ? "APPOINTMENT"
        : input.productSaleId != null
          ? "PRODUCT_SALE"
          : "MANUAL";
    const referenceId = input.appointmentId ?? input.productSaleId ?? undefined;
    const now = new Date();
    const amount = Number(input.amount.toFixed(2));
    const scope = this.idempotencyScope({
      unitId: input.unitId,
      action: "FINANCIAL_TRANSACTION_CREATE",
      idempotencyKey: input.idempotencyKey,
      payloadHash: input.idempotencyPayloadHash,
      payload: input,
    });
    const replay = this.replayMemoryIdempotency<FinancialEntry>(scope);
    if (replay) return replay;

    const entry = {
      id: crypto.randomUUID(),
      unitId: input.unitId,
      kind: input.type,
      source:
        source === "SERVICE" ||
        source === "PRODUCT" ||
        source === "COMMISSION" ||
        source === "REFUND"
          ? source
          : undefined,
      category,
      paymentMethod: String(input.paymentMethod ?? "").trim() || undefined,
      amount,
      occurredAt: input.date,
      referenceType,
      referenceId,
      professionalId: String(input.professionalId ?? "").trim() || undefined,
      customerId: String(input.customerId ?? "").trim() || undefined,
      description,
      notes: String(input.notes ?? "").trim() || undefined,
      createdAt: now,
      updatedAt: now,
    } as const;
    this.startMemoryIdempotency(scope);
    this.store.financialEntries.push(entry);
    this.finishMemoryIdempotency(scope, entry);
    return entry;
  }

  updateFinancialTransaction(input: {
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
    const entry = this.store.financialEntries.find(
      (item) => item.id === input.id && item.unitId === input.unitId,
    );
    if (!entry) throw new Error("Lancamento nao encontrado");
    if (entry.referenceType !== "MANUAL") {
      throw new Error("Somente lancamentos manuais podem ser editados");
    }

    if (input.amount != null) {
      if (!Number.isFinite(input.amount) || input.amount <= 0) {
        throw new Error("Valor invalido para lancamento");
      }
      entry.amount = Number(input.amount.toFixed(2));
    }
    if (input.type) entry.kind = input.type;
    if (input.date) {
      if (Number.isNaN(input.date.getTime())) throw new Error("Data obrigatoria");
      entry.occurredAt = input.date;
    }
    if (input.category != null) {
      const category = String(input.category).trim();
      if (!category) throw new Error("Categoria obrigatoria");
      entry.category = category;
    }
    if (input.description != null) {
      const description = String(input.description).trim();
      if (!description) throw new Error("Descricao obrigatoria");
      entry.description = description;
    }
    if (input.paymentMethod != null) {
      entry.paymentMethod = String(input.paymentMethod).trim() || undefined;
    }
    if (input.professionalId != null) {
      entry.professionalId = String(input.professionalId).trim() || undefined;
    }
    if (input.customerId != null) {
      entry.customerId = String(input.customerId).trim() || undefined;
    }
    if (input.notes != null) {
      entry.notes = String(input.notes).trim() || undefined;
    }
    entry.updatedAt = new Date();
    return entry;
  }

  deleteFinancialTransaction(input: {
    unitId: string;
    id: string;
    changedBy: string;
  }) {
    const index = this.store.financialEntries.findIndex(
      (item) => item.id === input.id && item.unitId === input.unitId,
    );
    if (index === -1) throw new Error("Lancamento nao encontrado");
    const entry = this.store.financialEntries[index];
    if (entry.referenceType !== "MANUAL") {
      throw new Error("Somente lancamentos manuais podem ser excluidos");
    }
    this.store.financialEntries.splice(index, 1);
    return {
      deleted: true,
      id: entry.id,
    };
  }

  getFinancialCommissions(input: {
    unitId: string;
    start: Date;
    end: Date;
    professionalId?: string;
    status?: "PENDING" | "PAID" | "CANCELED";
    limit?: number;
  }) {
    const limit = Math.min(Math.max(input.limit ?? 300, 1), 1000);
    const entries = this.store.commissionEntries
      .filter((item) => {
        if (item.unitId !== input.unitId) return false;
        if (item.occurredAt < input.start || item.occurredAt > input.end) return false;
        if (input.professionalId && item.professionalId !== input.professionalId) return false;
        if (input.status && (item.status ?? "PENDING") !== input.status) return false;
        return true;
      })
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, limit)
      .map((item) => {
        const professional = this.store.professionals.find((row) => row.id === item.professionalId);
        return {
          id: item.id,
          businessId: item.unitId,
          professionalId: item.professionalId,
          professionalName: professional?.name ?? "Profissional",
          appointmentId: item.appointmentId ?? null,
          baseAmount: Number(Number(item.baseAmount ?? 0).toFixed(2)),
          commissionRate:
            item.commissionRate == null ? null : Number((Number(item.commissionRate) * 100).toFixed(2)),
          commissionAmount: Number(Number(item.commissionAmount ?? 0).toFixed(2)),
          status: item.status ?? "PENDING",
          createdAt: (item.createdAt ?? item.occurredAt).toISOString(),
          paidAt: item.paidAt ? item.paidAt.toISOString() : null,
          source: item.source,
        };
      });

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

    const byProfessional = new Map<string, { professionalId: string; professionalName: string; revenueGenerated: number; commissionAmount: number; pendingAmount: number }>();
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

  markFinancialCommissionAsPaid(input: {
    unitId: string;
    id: string;
    paidAt?: Date;
    changedBy: string;
    idempotencyKey?: string;
    idempotencyPayloadHash?: string;
    audit?: unknown;
  }) {
    const scope = this.idempotencyScope({
      unitId: input.unitId,
      action: "COMMISSION_PAY",
      idempotencyKey: input.idempotencyKey,
      payloadHash: input.idempotencyPayloadHash,
      payload: input,
    });
    const replay = this.replayMemoryIdempotency<{
      id: string;
      status: string;
      paidAt: string;
      financialEntryId: string;
    }>(scope);
    if (replay) return replay;

    const commission = this.store.commissionEntries.find(
      (item) => item.id === input.id && item.unitId === input.unitId,
    );
    if (!commission) throw new Error("Comissao nao encontrada");
    if ((commission.status ?? "PENDING") === "CANCELED") {
      throw new Error("Comissao cancelada nao pode ser paga");
    }

    this.startMemoryIdempotency(scope);
    const paidAt = commission.paidAt ?? input.paidAt ?? new Date();
    commission.status = "PAID";
    commission.paidAt = paidAt;
    let expense = this.store.financialEntries.find(
      (item) =>
        item.unitId === input.unitId &&
        item.referenceType === "COMMISSION" &&
        item.referenceId === commission.id &&
        item.source === "COMMISSION",
    );
    if (!expense) {
      expense = buildCommissionPaymentExpenseEntry({
        unitId: commission.unitId,
        commissionId: commission.id,
        professionalId: commission.professionalId,
        amount: Number(commission.commissionAmount ?? 0),
        occurredAt: paidAt,
      });
      this.store.financialEntries.push(expense);
    }
    const response = {
      id: commission.id,
      status: commission.status,
      paidAt: paidAt.toISOString(),
      financialEntryId: expense.id,
    };
    this.finishMemoryIdempotency(scope, response);
    return response;
  }

  getFinancialReports(input: {
    unitId: string;
    start: Date;
    end: Date;
  }) {
    const transactions = this.getFinancialTransactions({
      unitId: input.unitId,
      start: input.start,
      end: input.end,
      limit: 2000,
    }).transactions;
    const overview = this.getFinancialManagementOverview({
      unitId: input.unitId,
      start: input.start,
      end: input.end,
    });

    const revenueByProfessionalMap = new Map<string, { professionalId: string; professionalName: string; revenue: number }>();
    const revenueByServiceMap = new Map<string, { serviceId: string; serviceName: string; revenue: number; appointments: number }>();
    const revenueByPaymentMethodMap = new Map<string, { paymentMethod: string; revenue: number; transactions: number }>();
    const expenseByCategoryMap = new Map<string, { category: string; amount: number; transactions: number }>();

    for (const row of transactions) {
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
        const paymentRow = revenueByPaymentMethodMap.get(paymentMethod) ?? {
          paymentMethod,
          revenue: 0,
          transactions: 0,
        };
        paymentRow.revenue += row.amount;
        paymentRow.transactions += 1;
        revenueByPaymentMethodMap.set(paymentMethod, paymentRow);
      } else {
        const category = row.category || "SEM_CATEGORIA";
        const expenseRow = expenseByCategoryMap.get(category) ?? {
          category,
          amount: 0,
          transactions: 0,
        };
        expenseRow.amount += row.amount;
        expenseRow.transactions += 1;
        expenseByCategoryMap.set(category, expenseRow);
      }
    }

    const completedAppointments = this.store.appointments.filter(
      (item) =>
        item.unitId === input.unitId &&
        item.status === "COMPLETED" &&
        item.startsAt >= input.start &&
        item.startsAt <= input.end,
    );
    for (const appointment of completedAppointments) {
      const service = this.store.services.find((row) => row.id === appointment.serviceId);
      const key = appointment.serviceId;
      const current = revenueByServiceMap.get(key) ?? {
        serviceId: key,
        serviceName: service?.name ?? "Servico",
        revenue: 0,
        appointments: 0,
      };
      current.revenue += Number(service?.price ?? 0);
      current.appointments += 1;
      revenueByServiceMap.set(key, current);
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

  getFinancialEntries(input: {
    unitId: string;
    start: Date;
    end: Date;
    kind?: "INCOME" | "EXPENSE";
  }) {
    const result = this.getFinancialTransactions({
      unitId: input.unitId,
      start: input.start,
      end: input.end,
      type: input.kind,
      limit: 1000,
    });
    return {
      entries: result.transactions.map((item) => ({
        id: item.id,
        unitId: item.businessId,
        kind: item.type,
        source:
          item.source === "SERVICE" ||
          item.source === "PRODUCT" ||
          item.source === "COMMISSION" ||
          item.source === "REFUND"
            ? item.source
            : undefined,
        amount: item.amount,
        occurredAt: new Date(item.date),
        referenceType: item.referenceType,
        referenceId: item.referenceId ?? undefined,
        description: item.description,
      })),
      summary: {
        income: result.summary.income,
        expense: result.summary.expense,
        net: result.summary.net,
      },
    };
  }

  getFinancialManagementOverview(input: {
    unitId: string;
    start: Date;
    end: Date;
    compareStart?: Date;
    compareEnd?: Date;
  }): FinancialManagementOverviewPayload {
    const currentStart = new Date(input.start);
    const currentEnd = new Date(input.end);
    const compareRange = this.resolveComparisonRange({
      start: currentStart,
      end: currentEnd,
      compareStart: input.compareStart,
      compareEnd: input.compareEnd,
    });

    const current = this.buildFinancialManagementSnapshot({
      unitId: input.unitId,
      start: currentStart,
      end: currentEnd,
    });
    const previous = this.buildFinancialManagementSnapshot({
      unitId: input.unitId,
      start: compareRange.start,
      end: compareRange.end,
    });

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

  getStockOverview(input: {
    unitId: string;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(input.limit ?? 12, 1), 50);
    const unitProducts = this.store.products.filter(
      (item) =>
        item.active &&
        ((item as Product & { businessId?: string }).businessId ?? "unit-01") === input.unitId,
    );
    const lowStock = unitProducts
      .filter((item) => item.stockQty <= item.minStockAlert)
      .map((item) => ({
        id: item.id,
        name: item.name,
        stockQty: item.stockQty,
        minStockAlert: item.minStockAlert,
      }));

    const recentMovements = this.store.stockMovements
      .filter((item) => item.unitId === input.unitId)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, limit)
      .map((item) => {
        const product = this.store.products.find((prod) => prod.id === item.productId);
        return {
          ...item,
          productName: product?.name ?? "Produto",
        };
      });

    const totalProducts = unitProducts.length;
    const totalStockQty = unitProducts.reduce((acc, item) => acc + item.stockQty, 0);

    return {
      lowStock,
      recentMovements,
      replenishmentSuggestions: buildReplenishmentSuggestions({
        products: unitProducts,
        stockMovements: this.store.stockMovements.filter((item) => item.unitId === input.unitId),
        limit: 12,
      }),
      totals: {
        totalProducts,
        lowStockCount: lowStock.length,
        totalStockQty,
      },
    };
  }

  getClientsOverview(input: {
    unitId: string;
    start: Date;
    end: Date;
    search?: string;
    status?: ClientPredictiveStatus | "WARNING";
    segment?: ClientValueSegment;
    limit?: number;
  }): ClientsOverviewPayload {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const completedInRange = this.store.appointments.filter(
      (item) =>
        item.unitId === input.unitId &&
        item.status === "COMPLETED" &&
        item.startsAt >= input.start &&
        item.startsAt <= input.end,
    );
    const completedAllTime = this.store.appointments.filter(
      (item) => item.unitId === input.unitId && item.status === "COMPLETED",
    );

    const periodByClient = new Map<string, { visits: number; revenue: number }>();
    for (const appointment of completedInRange) {
      const service = this.store.services.find((item) => item.id === appointment.serviceId);
      const current = periodByClient.get(appointment.clientId) ?? { visits: 0, revenue: 0 };
      current.visits += 1;
      current.revenue += service?.price ?? 0;
      periodByClient.set(appointment.clientId, current);
    }

    const allTimeByClient = new Map<string, { visits: number; revenue: number; visitDates: Date[] }>();
    for (const appointment of completedAllTime) {
      const service = this.store.services.find((item) => item.id === appointment.serviceId);
      const current = allTimeByClient.get(appointment.clientId) ?? {
        visits: 0,
        revenue: 0,
        visitDates: [],
      };
      current.visits += 1;
      current.revenue += service?.price ?? 0;
      current.visitDates.push(appointment.endsAt);
      allTimeByClient.set(appointment.clientId, current);
    }

    const normalizedSearch = String(input.search ?? "")
      .trim()
      .toLowerCase();
    const rows = this.store.clients
      .filter((client) => {
        const metadata = client as typeof client & { businessId?: string };
        const businessId = metadata.businessId ?? "unit-01";
        return businessId === input.unitId;
      })
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
          tags: client.tags,
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
      .filter((row) => {
        if (!normalizedSearch) return true;
        const haystack = [
          row.fullName,
          row.phone ?? "",
          ...(Array.isArray(row.tags) ? row.tags : []),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      });

    const statusFilter = input.status === "WARNING" ? "AT_RISK" : input.status;
    return buildClientsOverviewPredictive({
      rows,
      status: statusFilter,
      segment: input.segment,
      limit,
    });
  }

  getProfessionalsPerformance(input: {
    unitId: string;
    start: Date;
    end: Date;
    professionalId?: string;
  }) {
    const appointmentsInRange = this.store.appointments.filter(
      (item) =>
        item.unitId === input.unitId &&
        item.startsAt >= input.start &&
        item.startsAt <= input.end &&
        (!input.professionalId || item.professionalId === input.professionalId),
    );

    const professionals = this.store.professionals
      .filter((item) => item.active)
      .filter((item) => (!input.professionalId ? true : item.id === input.professionalId))
      .map((professional) => {
        const total = appointmentsInRange.filter(
          (item) => item.professionalId === professional.id,
        );
        const completed = total.filter((item) => item.status === "COMPLETED");
        const revenue = completed.reduce((acc, appointment) => {
          const service = this.store.services.find((item) => item.id === appointment.serviceId);
          return acc + (service?.price ?? 0);
        }, 0);

        return {
          professionalId: professional.id,
          name: professional.name,
          completed: completed.length,
          total: total.length,
          occupancyRate: total.length
            ? Number(((completed.length / total.length) * 100).toFixed(1))
            : 0,
          revenue: Number(revenue.toFixed(2)),
          ticketAverage: completed.length
            ? Number((revenue / completed.length).toFixed(2))
            : 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = professionals.reduce((acc, item) => acc + item.revenue, 0);
    const totalCompleted = professionals.reduce((acc, item) => acc + item.completed, 0);
    const bestRevenue =
      professionals.length > 0
        ? professionals.reduce((best, current) =>
            current.revenue > best.revenue ? current : best,
          )
        : null;
    const bestOccupancy =
      professionals.length > 0
        ? professionals.reduce((best, current) =>
            current.occupancyRate > best.occupancyRate ? current : best,
          )
        : null;

    return {
      professionals,
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

  getCurrentGoal(input: {
    unitId: string;
    month?: number;
    year?: number;
  }) {
    const now = new Date();
    const month = input.month ?? now.getMonth() + 1;
    const year = input.year ?? now.getFullYear();
    const goal = this.store.monthlyGoals
      .find(
        (item) =>
          item.businessId === input.unitId &&
          item.month === month &&
          item.year === year,
      ) ?? null;

    return {
      goal: goal ? this.mapMonthlyGoal(goal) : null,
      period: {
        month,
        year,
      },
    };
  }

  createGoal(input: {
    unitId: string;
    month: number;
    year: number;
    revenueTarget: number;
    appointmentsTarget: number;
    averageTicketTarget?: number;
    notes?: string;
  }) {
    const duplicated = this.store.monthlyGoals.some(
      (item) =>
        item.businessId === input.unitId &&
        item.month === input.month &&
        item.year === input.year,
    );
    if (duplicated) {
      throw new Error("Conflito: ja existe uma meta cadastrada para este periodo.");
    }

    const now = new Date();
    const goal: MonthlyGoal = {
      id: crypto.randomUUID(),
      businessId: input.unitId,
      month: input.month,
      year: input.year,
      revenueTarget: Number(input.revenueTarget.toFixed(2)),
      appointmentsTarget: Math.trunc(input.appointmentsTarget),
      averageTicketTarget:
        typeof input.averageTicketTarget === "number"
          ? Number(input.averageTicketTarget.toFixed(2))
          : undefined,
      notes: input.notes ? String(input.notes).trim() : undefined,
      createdAt: now,
      updatedAt: now,
    };
    this.store.monthlyGoals.push(goal);
    return {
      goal: this.mapMonthlyGoal(goal),
    };
  }

  updateGoal(input: {
    unitId: string;
    goalId: string;
    month?: number;
    year?: number;
    revenueTarget?: number;
    appointmentsTarget?: number;
    averageTicketTarget?: number | null;
    notes?: string;
  }) {
    const index = this.store.monthlyGoals.findIndex(
      (item) => item.id === input.goalId && item.businessId === input.unitId,
    );
    if (index < 0) {
      throw new Error("Meta nao encontrada.");
    }
    const current = this.store.monthlyGoals[index];
    const nextMonth = input.month ?? current.month;
    const nextYear = input.year ?? current.year;
    const duplicated = this.store.monthlyGoals.some(
      (item) =>
        item.id !== current.id &&
        item.businessId === input.unitId &&
        item.month === nextMonth &&
        item.year === nextYear,
    );
    if (duplicated) {
      throw new Error("Conflito: ja existe uma meta cadastrada para este periodo.");
    }

    const next: MonthlyGoal = {
      ...current,
      month: nextMonth,
      year: nextYear,
      revenueTarget:
        typeof input.revenueTarget === "number"
          ? Number(input.revenueTarget.toFixed(2))
          : current.revenueTarget,
      appointmentsTarget:
        typeof input.appointmentsTarget === "number"
          ? Math.trunc(input.appointmentsTarget)
          : current.appointmentsTarget,
      averageTicketTarget:
        input.averageTicketTarget == null
          ? input.averageTicketTarget === null
            ? undefined
            : current.averageTicketTarget
          : Number(input.averageTicketTarget.toFixed(2)),
      notes:
        typeof input.notes === "string"
          ? String(input.notes).trim()
          : current.notes,
      updatedAt: new Date(),
    };

    this.store.monthlyGoals[index] = next;
    return {
      goal: this.mapMonthlyGoal(next),
    };
  }

  getPerformanceSummary(input: {
    unitId: string;
    month?: number;
    year?: number;
  }): GoalProgressSummary {
    const now = new Date();
    const month = input.month ?? now.getMonth() + 1;
    const year = input.year ?? now.getFullYear();
    const periodDate = new Date(year, month - 1, 1, 12, 0, 0, 0);
    const period = this.monthRange(periodDate);
    const goal =
      this.store.monthlyGoals.find(
        (item) =>
          item.businessId === input.unitId &&
          item.month === month &&
          item.year === year,
      ) ?? null;

    const completedAppointments = this.store.appointments.filter(
      (item) =>
        item.unitId === input.unitId &&
        item.status === "COMPLETED" &&
        item.startsAt >= period.start &&
        item.startsAt <= period.end,
    );
    const appointmentRevenue = completedAppointments.reduce((acc, item) => {
      const service = this.store.services.find((serviceRow) => serviceRow.id === item.serviceId);
      return acc + Number(service?.price ?? 0);
    }, 0);
    const salesRevenue = this.store.productSales
      .filter(
        (item) =>
          item.unitId === input.unitId &&
          item.soldAt >= period.start &&
          item.soldAt <= period.end,
      )
      .reduce((acc, item) => acc + Number(item.grossAmount ?? 0), 0);
    const revenueCurrent = Number((appointmentRevenue + salesRevenue).toFixed(2));
    const appointmentsCompleted = completedAppointments.length;
    const ticketAverageCurrent = appointmentsCompleted
      ? Number((appointmentRevenue / appointmentsCompleted).toFixed(2))
      : 0;

    const daysTotal = new Date(year, month, 0).getDate();
    const isCurrentMonth = now.getMonth() + 1 === month && now.getFullYear() === year;
    const daysElapsed = isCurrentMonth ? Math.max(1, now.getDate()) : now > period.end ? daysTotal : 0;
    const daysRemaining = isCurrentMonth ? Math.max(0, daysTotal - now.getDate()) : now > period.end ? 0 : daysTotal;
    const revenueTarget = goal?.revenueTarget ?? 0;
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

    const professionals = this.getPerformanceProfessionals({
      unitId: input.unitId,
      month,
      year,
    }).professionals;
    const services = this.getPerformanceServices({
      unitId: input.unitId,
      month,
      year,
    }).services;
    const topProfessional = professionals[0] ?? null;
    const topService = services[0] ?? null;

    const insights = this.buildGoalInsights({
      goal,
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

  getPerformanceProfessionals(input: {
    unitId: string;
    month?: number;
    year?: number;
  }) {
    const now = new Date();
    const month = input.month ?? now.getMonth() + 1;
    const year = input.year ?? now.getFullYear();
    const period = this.monthRange(new Date(year, month - 1, 1, 12, 0, 0, 0));
    const activeProfessionals = this.store.professionals.filter((item) => item.active);
    const appointments = this.store.appointments.filter(
      (item) =>
        item.unitId === input.unitId &&
        item.startsAt >= period.start &&
        item.startsAt <= period.end,
    );
    const completed = appointments.filter((item) => item.status === "COMPLETED");

    const professionals = activeProfessionals
      .map((professional) => {
        const professionalAppointments = appointments.filter(
          (item) => item.professionalId === professional.id,
        );
        const professionalCompleted = completed.filter(
          (item) => item.professionalId === professional.id,
        );
        const revenue = professionalCompleted.reduce((acc, item) => {
          const service = this.store.services.find((serviceRow) => serviceRow.id === item.serviceId);
          return acc + Number(service?.price ?? 0);
        }, 0);
        const commissionEstimated = this.store.commissionEntries
          .filter(
            (entry) =>
              entry.unitId === input.unitId &&
              entry.professionalId === professional.id &&
              entry.occurredAt >= period.start &&
              entry.occurredAt <= period.end,
          )
          .reduce((acc, entry) => acc + Number(entry.commissionAmount ?? 0), 0);

        return {
          professionalId: professional.id,
          name: professional.name,
          revenue: Number(revenue.toFixed(2)),
          completedAppointments: professionalCompleted.length,
          ticketAverage: professionalCompleted.length
            ? Number((revenue / professionalCompleted.length).toFixed(2))
            : 0,
          occupancyRate: professionalAppointments.length
            ? Number(((professionalCompleted.length / professionalAppointments.length) * 100).toFixed(1))
            : 0,
          commissionEstimated: Number(commissionEstimated.toFixed(2)),
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
        totalRevenue: Number(professionals.reduce((acc, item) => acc + item.revenue, 0).toFixed(2)),
        totalCompletedAppointments: professionals.reduce(
          (acc, item) => acc + item.completedAppointments,
          0,
        ),
      },
      professionals,
    };
  }

  getPerformanceServices(input: {
    unitId: string;
    month?: number;
    year?: number;
  }) {
    const now = new Date();
    const month = input.month ?? now.getMonth() + 1;
    const year = input.year ?? now.getFullYear();
    const period = this.monthRange(new Date(year, month - 1, 1, 12, 0, 0, 0));
    const completed = this.store.appointments.filter(
      (item) =>
        item.unitId === input.unitId &&
        item.status === "COMPLETED" &&
        item.startsAt >= period.start &&
        item.startsAt <= period.end,
    );

    const map = new Map<
      string,
      { serviceId: string; name: string; quantity: number; revenue: number }
    >();
    for (const appointment of completed) {
      const service = this.store.services.find((item) => item.id === appointment.serviceId);
      if (!service) continue;
      const current = map.get(service.id) ?? {
        serviceId: service.id,
        name: service.name,
        quantity: 0,
        revenue: 0,
      };
      current.quantity += 1;
      current.revenue += Number(service.price ?? 0);
      map.set(service.id, current);
    }

    const totalRevenue = Array.from(map.values()).reduce((acc, item) => acc + item.revenue, 0);
    const services = Array.from(map.values())
      .map((item) => ({
        serviceId: item.serviceId,
        name: item.name,
        quantity: item.quantity,
        revenue: Number(item.revenue.toFixed(2)),
        ticketAverage: item.quantity
          ? Number((item.revenue / item.quantity).toFixed(2))
          : 0,
        sharePct: totalRevenue
          ? Number(((item.revenue / totalRevenue) * 100).toFixed(1))
          : 0,
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

  getCommissionsStatement(input: {
    unitId: string;
    start: Date;
    end: Date;
    professionalId?: string;
    appliesTo?: "SERVICE" | "PRODUCT";
    limit?: number;
  }) {
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
    const filtered = this.store.commissionEntries
      .filter(
        (item) =>
          item.unitId === input.unitId &&
          item.occurredAt >= input.start &&
          item.occurredAt <= input.end &&
          (!input.professionalId || item.professionalId === input.professionalId) &&
          (!input.appliesTo || item.source === input.appliesTo),
      )
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    const entries = filtered.slice(0, limit).map((item) => {
      const professional = this.store.professionals.find(
        (row) => row.id === item.professionalId,
      );
      const rule = professional?.commissionRules.find((row) => row.id === item.ruleId);
      const referenceType = item.appointmentId ? "APPOINTMENT" : "PRODUCT_SALE";
      const referenceId = item.appointmentId ?? item.productSaleId ?? null;

      return {
        id: item.id,
        occurredAt: item.occurredAt.toISOString(),
        professionalId: item.professionalId,
        professionalName: professional?.name ?? "Profissional",
        appliesTo: item.source,
        baseAmount: Number(item.baseAmount.toFixed(2)),
        percentage:
          rule?.percentage == null ? null : Number((rule.percentage * 100).toFixed(2)),
        fixedAmount: rule?.fixedAmount == null ? null : Number(rule.fixedAmount.toFixed(2)),
        commissionAmount: Number(item.commissionAmount.toFixed(2)),
        referenceId,
        referenceType,
      };
    });

    const totalCommission = filtered.reduce((acc, item) => acc + item.commissionAmount, 0);
    const serviceCommission = filtered
      .filter((item) => item.source === "SERVICE")
      .reduce((acc, item) => acc + item.commissionAmount, 0);
    const productCommission = filtered
      .filter((item) => item.source === "PRODUCT")
      .reduce((acc, item) => acc + item.commissionAmount, 0);

    const byProfessionalMap = new Map<
      string,
      { professionalId: string; name: string; totalCommission: number; entries: number }
    >();
    for (const item of filtered) {
      const professional = this.store.professionals.find((row) => row.id === item.professionalId);
      const current = byProfessionalMap.get(item.professionalId) ?? {
        professionalId: item.professionalId,
        name: professional?.name ?? "Profissional",
        totalCommission: 0,
        entries: 0,
      };
      current.totalCommission += item.commissionAmount;
      current.entries += 1;
      byProfessionalMap.set(item.professionalId, current);
    }

    return {
      entries,
      summary: {
        totalCommission: Number(totalCommission.toFixed(2)),
        serviceCommission: Number(serviceCommission.toFixed(2)),
        productCommission: Number(productCommission.toFixed(2)),
        byProfessional: Array.from(byProfessionalMap.values())
          .map((item) => ({
            ...item,
            totalCommission: Number(item.totalCommission.toFixed(2)),
          }))
          .sort((a, b) => b.totalCommission - a.totalCommission),
      },
    };
  }

  getLoyaltySummary(input: {
    unitId: string;
    start: Date;
    end: Date;
  }) {
    const program = this.store.loyaltyPrograms.find(
      (item) => item.unitId === input.unitId && item.isActive,
    );
    const entries = this.store.loyaltyLedger.filter(
      (item) =>
        item.unitId === input.unitId &&
        item.occurredAt >= input.start &&
        item.occurredAt <= input.end,
    );
    const earned = entries
      .filter((item) => item.pointsDelta > 0)
      .reduce((acc, item) => acc + item.pointsDelta, 0);
    const redeemed = Math.abs(
      entries
        .filter((item) => item.pointsDelta < 0)
        .reduce((acc, item) => acc + item.pointsDelta, 0),
    );
    const activeClients = new Set(entries.map((item) => item.clientId)).size;
    const balanceByClient = new Map<string, number>();
    for (const item of this.store.loyaltyLedger.filter((row) => row.unitId === input.unitId)) {
      balanceByClient.set(item.clientId, item.balanceAfter);
    }
    const totalBalance = Array.from(balanceByClient.values()).reduce((acc, value) => acc + value, 0);

    return {
      program: program
        ? {
            id: program.id,
            name: program.name,
            type: program.type,
            conversionRate: program.conversionRate,
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

  getLoyaltyLedger(input: {
    unitId: string;
    clientId?: string;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
    const entries = this.store.loyaltyLedger
      .filter(
        (item) =>
          item.unitId === input.unitId &&
          (!input.clientId || item.clientId === input.clientId),
      )
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, limit)
      .map((item) => {
        const client = this.store.clients.find((row) => row.id === item.clientId);
        return {
          ...item,
          occurredAt: item.occurredAt.toISOString(),
          clientName: client?.fullName ?? "Cliente",
          pointsDelta: Number(item.pointsDelta.toFixed(2)),
          balanceAfter: Number(item.balanceAfter.toFixed(2)),
        };
      });
    return { entries };
  }

  adjustLoyalty(input: {
    unitId: string;
    clientId: string;
    pointsDelta: number;
    sourceType?: "ADJUSTMENT" | "REDEEM";
    sourceId?: string;
    note?: string;
    occurredAt?: Date;
    createdBy: string;
  }) {
    const client = this.store.clients.find((item) => item.id === input.clientId);
    if (!client) throw new Error("Cliente nao encontrado");
    if (!Number.isFinite(input.pointsDelta) || input.pointsDelta === 0) {
      throw new Error("Ajuste de fidelidade invalido");
    }

    const currentBalance = this.getCurrentLoyaltyBalance(input.unitId, input.clientId);
    const nextBalance = currentBalance + input.pointsDelta;
    if (nextBalance < 0) throw new Error("Saldo de fidelidade insuficiente");

    const entry = {
      id: crypto.randomUUID(),
      unitId: input.unitId,
      clientId: input.clientId,
      sourceType: input.sourceType ?? (input.pointsDelta < 0 ? "REDEEM" : "ADJUSTMENT"),
      sourceId: input.sourceId,
      pointsDelta: Number(input.pointsDelta.toFixed(2)),
      balanceAfter: Number(nextBalance.toFixed(2)),
      occurredAt: input.occurredAt ?? new Date(),
      createdBy: input.createdBy,
    };
    this.store.loyaltyLedger.push(entry);

    return {
      entry: {
        ...entry,
        occurredAt: entry.occurredAt.toISOString(),
      },
      balance: entry.balanceAfter,
    };
  }

  getServicePackages(input: { unitId: string }) {
    return {
      packages: this.store.servicePackages
        .filter((item) => item.unitId === input.unitId && item.isActive)
        .map((item) => ({ ...item })),
    };
  }

  purchasePackage(input: {
    unitId: string;
    clientId: string;
    packageId: string;
    purchasedAt: Date;
    changedBy: string;
  }) {
    const client = this.store.clients.find((item) => item.id === input.clientId);
    if (!client) throw new Error("Cliente nao encontrado");
    const pack = this.store.servicePackages.find(
      (item) => item.id === input.packageId && item.unitId === input.unitId && item.isActive,
    );
    if (!pack) throw new Error("Pacote nao encontrado ou inativo");

    const purchasedAt = input.purchasedAt;
    const expiresAt = new Date(purchasedAt.getTime() + pack.validityDays * 24 * 60 * 60 * 1000);
    const clientPackage = {
      id: crypto.randomUUID(),
      unitId: input.unitId,
      clientId: input.clientId,
      packageId: pack.id,
      purchasedAt,
      expiresAt,
      sessionsRemaining: pack.sessionsTotal,
      status: "ACTIVE" as const,
    };
    this.store.clientPackages.push(clientPackage);

    this.store.financialEntries.push({
      id: crypto.randomUUID(),
      unitId: input.unitId,
      kind: "INCOME",
      source: "SERVICE",
      amount: pack.price,
      occurredAt: purchasedAt,
      referenceType: "MANUAL",
      referenceId: clientPackage.id,
      description: `Venda de pacote: ${pack.name}`,
    });

    return {
      clientPackage: {
        ...clientPackage,
        purchasedAt: clientPackage.purchasedAt.toISOString(),
        expiresAt: clientPackage.expiresAt.toISOString(),
      },
    };
  }

  redeemPackageSession(input: {
    unitId: string;
    clientId: string;
    packagePurchaseId: string;
    serviceId: string;
    occurredAt: Date;
    changedBy: string;
  }) {
    const purchase = this.store.clientPackages.find(
      (item) =>
        item.id === input.packagePurchaseId &&
        item.unitId === input.unitId &&
        item.clientId === input.clientId,
    );
    if (!purchase) throw new Error("Pacote do cliente nao encontrado");
    if (purchase.status !== "ACTIVE") throw new Error("Pacote nao esta ativo");
    if (purchase.expiresAt < input.occurredAt) {
      purchase.status = "EXPIRED";
      throw new Error("Pacote expirado");
    }
    if (purchase.sessionsRemaining <= 0) {
      purchase.status = "DEPLETED";
      throw new Error("Pacote sem saldo de sessoes");
    }

    const pack = this.store.servicePackages.find((item) => item.id === purchase.packageId);
    const serviceLimit = pack?.sessionsByService?.[input.serviceId] ?? null;
    if (serviceLimit != null && serviceLimit <= 0) {
      throw new Error("Servico nao elegivel para este pacote");
    }

    purchase.sessionsRemaining -= 1;
    if (purchase.sessionsRemaining <= 0) {
      purchase.status = "DEPLETED";
    }

    return {
      clientPackage: {
        ...purchase,
        purchasedAt: purchase.purchasedAt.toISOString(),
        expiresAt: purchase.expiresAt.toISOString(),
      },
    };
  }

  getClientPackageBalance(input: {
    unitId: string;
    clientId: string;
  }) {
    const rows = this.store.clientPackages
      .filter((item) => item.unitId === input.unitId && item.clientId === input.clientId)
      .map((item) => {
        const pack = this.store.servicePackages.find((row) => row.id === item.packageId);
        return {
          id: item.id,
          packageId: item.packageId,
          packageName: pack?.name ?? "Pacote",
          sessionsRemaining: item.sessionsRemaining,
          status: item.status,
          expiresAt: item.expiresAt.toISOString(),
        };
      });
    return { balances: rows };
  }

  getSubscriptionPlans(input: { unitId: string }) {
    return {
      plans: this.store.subscriptionPlans
        .filter((item) => item.unitId === input.unitId && item.isActive)
        .map((item) => ({ ...item })),
    };
  }

  activateSubscription(input: {
    unitId: string;
    clientId: string;
    planId: string;
    startedAt: Date;
    changedBy: string;
  }) {
    const client = this.store.clients.find((item) => item.id === input.clientId);
    if (!client) throw new Error("Cliente nao encontrado");
    const plan = this.store.subscriptionPlans.find(
      (item) => item.id === input.planId && item.unitId === input.unitId && item.isActive,
    );
    if (!plan) throw new Error("Plano de assinatura nao encontrado ou inativo");

    const startedAt = input.startedAt;
    const nextBillingAt = new Date(startedAt);
    nextBillingAt.setMonth(nextBillingAt.getMonth() + 1);
    nextBillingAt.setDate(Math.max(1, Math.min(28, plan.billingDay)));

    const subscription = {
      id: crypto.randomUUID(),
      unitId: input.unitId,
      clientId: input.clientId,
      planId: plan.id,
      startedAt,
      nextBillingAt,
      status: "ACTIVE" as const,
      cycleCount: 1,
    };
    this.store.clientSubscriptions.push(subscription);

    this.store.financialEntries.push({
      id: crypto.randomUUID(),
      unitId: input.unitId,
      kind: "INCOME",
      source: "SERVICE",
      amount: plan.priceMonthly,
      occurredAt: startedAt,
      referenceType: "MANUAL",
      referenceId: subscription.id,
      description: `Assinatura iniciada: ${plan.name}`,
    });

    return {
      subscription: {
        ...subscription,
        startedAt: subscription.startedAt.toISOString(),
        nextBillingAt: subscription.nextBillingAt.toISOString(),
      },
    };
  }

  cancelSubscription(input: {
    unitId: string;
    subscriptionId: string;
    changedBy: string;
  }) {
    const subscription = this.store.clientSubscriptions.find(
      (item) => item.id === input.subscriptionId && item.unitId === input.unitId,
    );
    if (!subscription) throw new Error("Assinatura nao encontrada");
    subscription.status = "CANCELLED";
    return {
      subscription: {
        ...subscription,
        startedAt: subscription.startedAt.toISOString(),
        nextBillingAt: subscription.nextBillingAt.toISOString(),
      },
    };
  }

  getSubscriptionsOverview(input: {
    unitId: string;
    start: Date;
    end: Date;
  }) {
    const rows = this.store.clientSubscriptions.filter((item) => item.unitId === input.unitId);
    const active = rows.filter((item) => item.status === "ACTIVE").length;
    const pastDue = rows.filter((item) => item.status === "PAST_DUE").length;
    const cancelled = rows.filter((item) => item.status === "CANCELLED").length;
    const plansById = Object.fromEntries(
      this.store.subscriptionPlans.map((item) => [item.id, item]),
    ) as Record<string, (typeof this.store.subscriptionPlans)[number]>;
    const mrr = rows
      .filter((item) => item.status === "ACTIVE")
      .reduce((acc, item) => acc + (plansById[item.planId]?.priceMonthly ?? 0), 0);

    return {
      summary: {
        active,
        pastDue,
        cancelled,
        mrr: Number(mrr.toFixed(2)),
      },
      subscriptions: rows.map((item) => ({
        ...item,
        startedAt: item.startedAt.toISOString(),
        nextBillingAt: item.nextBillingAt.toISOString(),
        planName: plansById[item.planId]?.name ?? "Plano",
      })),
    };
  }

  getRetentionCases(input: {
    unitId: string;
    riskLevel?: "LOW" | "MEDIUM" | "HIGH";
    status?: "OPEN" | "IN_PROGRESS" | "CONVERTED" | "LOST";
    limit?: number;
  }) {
    this.refreshRetentionCases(input.unitId);
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const rows = this.store.retentionCases
      .filter((item) => item.unitId === input.unitId)
      .filter((item) => (!input.riskLevel ? true : item.riskLevel === input.riskLevel))
      .filter((item) => (!input.status ? true : item.status === input.status))
      .sort((a, b) => b.daysWithoutReturn - a.daysWithoutReturn)
      .slice(0, limit)
      .map((item) => {
        const client = this.store.clients.find((row) => row.id === item.clientId);
        return {
          ...item,
          lastVisitAt: item.lastVisitAt ? item.lastVisitAt.toISOString() : null,
          updatedAt: item.updatedAt.toISOString(),
          clientName: client?.fullName ?? "Cliente",
        };
      });

    return {
      cases: rows,
      summary: {
        total: rows.length,
        high: rows.filter((item) => item.riskLevel === "HIGH").length,
        medium: rows.filter((item) => item.riskLevel === "MEDIUM").length,
        low: rows.filter((item) => item.riskLevel === "LOW").length,
      },
    };
  }

  addRetentionEvent(input: {
    unitId: string;
    caseId: string;
    channel: "PHONE" | "WHATSAPP" | "MANUAL";
    note: string;
    outcome?: string;
    occurredAt: Date;
    createdBy: string;
  }) {
    const row = this.store.retentionCases.find(
      (item) => item.id === input.caseId && item.unitId === input.unitId,
    );
    if (!row) throw new Error("Caso de retencao nao encontrado");
    if (row.status === "OPEN") row.status = "IN_PROGRESS";
    row.updatedAt = new Date();

    const event = {
      id: crypto.randomUUID(),
      caseId: row.id,
      channel: input.channel,
      note: input.note,
      outcome: input.outcome,
      occurredAt: input.occurredAt,
      createdBy: input.createdBy,
    };
    this.store.retentionEvents.push(event);
    return { event: { ...event, occurredAt: event.occurredAt.toISOString() } };
  }

  convertRetentionCase(input: {
    unitId: string;
    caseId: string;
    changedBy: string;
  }) {
    const row = this.store.retentionCases.find(
      (item) => item.id === input.caseId && item.unitId === input.unitId,
    );
    if (!row) throw new Error("Caso de retencao nao encontrado");
    row.status = "CONVERTED";
    row.updatedAt = new Date();
    return { case: { ...row, updatedAt: row.updatedAt.toISOString() } };
  }

  createAutomationRule(input: {
    unitId: string;
    name: string;
    triggerType: AutomationTriggerType;
    channel: AutomationChannel;
    target: AutomationTarget;
    messageTemplate: string;
    createdBy: string;
  }) {
    const now = new Date();
    const rule = {
      id: crypto.randomUUID(),
      unitId: input.unitId,
      name: input.name.trim(),
      triggerType: input.triggerType,
      channel: input.channel,
      target: input.target,
      messageTemplate: input.messageTemplate.trim(),
      isActive: true,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.store.automationRules.push(rule);
    return {
      rule: {
        ...rule,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
      },
    };
  }

  getAutomationRules(input: {
    unitId: string;
    active?: boolean;
  }) {
    const rules = this.store.automationRules
      .filter((item) => item.unitId === input.unitId)
      .filter((item) => (input.active == null ? true : item.isActive === input.active))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }));
    return { rules };
  }

  updateAutomationRule(input: AutomationRuleUpdateInput) {
    const rule = this.store.automationRules.find(
      (item) => item.id === input.ruleId && item.unitId === input.unitId,
    );
    if (!rule) throw new Error("Regra de automacao nao encontrada");
    const hasAnyChange =
      input.name != null ||
      input.triggerType != null ||
      input.channel != null ||
      input.target != null ||
      input.messageTemplate != null;
    if (!hasAnyChange) throw new Error("Nenhum campo informado para atualizar regra");

    const previousRule = {
      ...rule,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };

    if (input.name != null) {
      rule.name = input.name.trim();
    }
    if (input.triggerType != null) {
      rule.triggerType = input.triggerType;
    }
    if (input.channel != null) {
      rule.channel = input.channel;
    }
    if (input.target != null) {
      rule.target = input.target;
    }
    if (input.messageTemplate != null) {
      rule.messageTemplate = input.messageTemplate.trim();
    }
    rule.updatedAt = new Date();

    return {
      previousRule,
      rule: {
        ...rule,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
      },
    };
  }

  activateAutomationRule(input: {
    unitId: string;
    ruleId: string;
  }) {
    const rule = this.store.automationRules.find(
      (item) => item.id === input.ruleId && item.unitId === input.unitId,
    );
    if (!rule) throw new Error("Regra de automacao nao encontrada");
    rule.isActive = true;
    rule.updatedAt = new Date();
    return {
      rule: {
        ...rule,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
      },
    };
  }

  deactivateAutomationRule(input: {
    unitId: string;
    ruleId: string;
  }) {
    const rule = this.store.automationRules.find(
      (item) => item.id === input.ruleId && item.unitId === input.unitId,
    );
    if (!rule) throw new Error("Regra de automacao nao encontrada");
    rule.isActive = false;
    rule.updatedAt = new Date();
    return {
      rule: {
        ...rule,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
      },
    };
  }

  executeAutomationCampaign(input: {
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
      ? this.store.automationRules.find(
          (item) => item.id === input.ruleId && item.unitId === input.unitId,
        )
      : undefined;
    if (input.ruleId && !rule) throw new Error("Regra de automacao nao encontrada");
    if (rule && !rule.isActive) throw new Error("Regra de automacao inativa");

    const scores = this.getLatestRetentionScores(input.unitId);
    const candidates = this.store.clients.filter((client) => {
      const score = scores.get(client.id);
      if (!input.riskLevel) return true;
      return score?.riskLevel === input.riskLevel;
    });

    let scheduled = 0;
    let skipped = 0;
    const executions = [];
    for (const client of candidates) {
      const idempotencyKey = this.buildAutomationIdempotencyKey({
        unitId: input.unitId,
        campaignType: input.campaignType,
        ruleId: rule?.id,
        clientId: client.id,
        date: now,
      });
      const exists = this.store.automationExecutions.some(
        (item) => item.unitId === input.unitId && item.idempotencyKey === idempotencyKey,
      );
      if (exists) {
        skipped += 1;
        continue;
      }

      const execution: AutomationExecution = {
        id: crypto.randomUUID(),
        unitId: input.unitId,
        ruleId: rule?.id,
        clientId: client.id,
        campaignType: input.campaignType,
        status: "PENDING",
        attempts: 0,
        idempotencyKey,
        errorMessage: undefined,
        payload: {
          startedBy: input.startedBy,
          clientName: client.fullName,
          riskLevel: scores.get(client.id)?.riskLevel ?? null,
          sourceModule: input.sourceModule ?? "automacoes",
          sourceSuggestionId: input.sourceSuggestionId ?? null,
          playbookType: input.playbookType ?? null,
          reprocessCount: 0,
        },
        startedAt: now,
        finishedAt: undefined,
      };
      this.processAutomationExecution(execution, now);
      this.store.automationExecutions.push(execution);
      executions.push(execution);
      scheduled += 1;
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
      executions: executions.map((item) => ({
        ...item,
        startedAt: item.startedAt.toISOString(),
        finishedAt: item.finishedAt?.toISOString() ?? null,
      })),
    };
  }

  reprocessAutomationExecution(input: {
    unitId: string;
    executionId: string;
    startedBy: string;
  }) {
    const execution = this.store.automationExecutions.find(
      (item) => item.id === input.executionId && item.unitId === input.unitId,
    );
    if (!execution) throw new Error("Execucao de automacao nao encontrada");
    if (execution.status !== "FAILED") {
      throw new Error("Somente execucoes com falha podem ser reprocessadas");
    }

    const now = new Date();
    execution.status = "PENDING";
    execution.attempts = 0;
    execution.errorMessage = undefined;
    execution.startedAt = now;
    execution.finishedAt = undefined;
    execution.payload = {
      ...(execution.payload ?? {}),
      startedBy: input.startedBy,
      reprocessCount: Number((execution.payload as Record<string, unknown> | undefined)?.reprocessCount ?? 0) + 1,
    };

    this.processAutomationExecution(execution, now);
    const client = execution.clientId
      ? this.store.clients.find((row) => row.id === execution.clientId)
      : undefined;
    const finishedAt = execution.finishedAt as Date | undefined;

    return {
      execution: {
        ...execution,
        clientName: client?.fullName ?? null,
        startedAt: execution.startedAt.toISOString(),
        finishedAt: finishedAt ? finishedAt.toISOString() : null,
      },
    };
  }

  getAutomationExecutions(input: {
    unitId: string;
    start: Date;
    end: Date;
    status?: "PENDING" | "SUCCESS" | "FAILED";
  }) {
    const rows = this.store.automationExecutions
      .filter(
        (item) =>
          item.unitId === input.unitId &&
          item.startedAt >= input.start &&
          item.startedAt <= input.end &&
          (!input.status || item.status === input.status),
      )
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .map((item) => {
        const client = item.clientId
          ? this.store.clients.find((row) => row.id === item.clientId)
          : undefined;
        return {
          ...item,
          clientName: client?.fullName ?? null,
          startedAt: item.startedAt.toISOString(),
          finishedAt: item.finishedAt?.toISOString() ?? null,
        };
      });

    return {
      executions: rows,
      summary: {
        total: rows.length,
        success: rows.filter((item) => item.status === "SUCCESS").length,
        failed: rows.filter((item) => item.status === "FAILED").length,
        pending: rows.filter((item) => item.status === "PENDING").length,
      },
    };
  }

  recalculateRetentionScoring(input: {
    unitId: string;
    scoredAt: Date;
    modelVersion?: string;
  }) {
    const scoredAt = input.scoredAt;
    const modelVersion = input.modelVersion ?? "heuristic-v1";
    const snapshots = [];

    for (const client of this.store.clients) {
      const snapshot = this.buildRetentionScoreSnapshot(
        input.unitId,
        client.id,
        scoredAt,
        modelVersion,
      );
      this.store.retentionScoreSnapshots.push(snapshot);
      this.syncRetentionCaseFromScore(snapshot);
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

  getRetentionScoringOverview(input: {
    unitId: string;
    start: Date;
    end: Date;
  }) {
    const rows = this.store.retentionScoreSnapshots.filter(
      (item) =>
        item.unitId === input.unitId &&
        item.scoredAt >= input.start &&
        item.scoredAt <= input.end,
    );
    const latest = this.getLatestRetentionScores(input.unitId, rows);
    const values = Array.from(latest.values());
    const avgRisk = values.length
      ? values.reduce((acc, item) => acc + item.riskScore, 0) / values.length
      : 0;
    const avgReturnProbability = values.length
      ? values.reduce((acc, item) => acc + item.returnProbability, 0) / values.length
      : 0;

    return {
      summary: {
        totalClients: values.length,
        high: values.filter((item) => item.riskLevel === "HIGH").length,
        medium: values.filter((item) => item.riskLevel === "MEDIUM").length,
        low: values.filter((item) => item.riskLevel === "LOW").length,
        averageRiskScore: Number(avgRisk.toFixed(2)),
        averageReturnProbability: Number(avgReturnProbability.toFixed(2)),
      },
    };
  }

  getRetentionScoringClients(input: {
    unitId: string;
    riskLevel?: "LOW" | "MEDIUM" | "HIGH";
    limit?: number;
  }) {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const latest = Array.from(this.getLatestRetentionScores(input.unitId).values())
      .filter((item) => (!input.riskLevel ? true : item.riskLevel === input.riskLevel))
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, limit)
      .map((item) => {
        const client = this.store.clients.find((row) => row.id === item.clientId);
        return {
          ...item,
          clientName: client?.fullName ?? "Cliente",
          scoredAt: item.scoredAt.toISOString(),
        };
      });
    return { clients: latest };
  }

  getRetentionScoringClient(input: {
    unitId: string;
    clientId: string;
  }) {
    const client = this.store.clients.find((item) => item.id === input.clientId);
    if (!client) throw new Error("Cliente nao encontrado");

    const history = this.store.retentionScoreSnapshots
      .filter((item) => item.unitId === input.unitId && item.clientId === input.clientId)
      .sort((a, b) => b.scoredAt.getTime() - a.scoredAt.getTime())
      .slice(0, 20)
      .map((item) => ({
        ...item,
        scoredAt: item.scoredAt.toISOString(),
      }));
    return {
      client: {
        id: client.id,
        fullName: client.fullName,
      },
      latest: history[0] ?? null,
      history,
    };
  }

  testOutboundWebhook(input: {
    unitId: string;
    provider: string;
    endpoint: string;
    eventType: string;
    payload?: Record<string, unknown>;
    occurredAt?: Date;
    triggeredBy: string;
  }) {
    const now = input.occurredAt ?? new Date();
    const maxAttempts = 3;
    const requestedFailuresRaw = (input.payload as Record<string, unknown> | undefined)
      ?.simulateFailures;
    const requestedFailures =
      typeof requestedFailuresRaw === "number" && Number.isFinite(requestedFailuresRaw)
        ? Math.max(0, Math.floor(requestedFailuresRaw))
        : 0;
    const finalAttempt = Math.min(maxAttempts, requestedFailures + 1);
    const success = requestedFailures < maxAttempts;
    const status: IntegrationWebhookStatus = success ? "SUCCESS" : "FAILED";
    const log = {
      id: crypto.randomUUID(),
      unitId: input.unitId,
      provider: input.provider,
      direction: "OUTBOUND" as const,
      endpoint: input.endpoint,
      status,
      httpStatus: success ? 202 : 502,
      attempt: finalAttempt,
      correlationId: crypto.randomUUID(),
      payload: {
        eventType: input.eventType,
        ...input.payload,
      },
      responseBody: {
        accepted: success,
        triggeredBy: input.triggeredBy,
      },
      errorMessage: success
        ? undefined
        : `Falha de entrega apos ${maxAttempts} tentativas`,
      occurredAt: now,
    };
    this.store.integrationWebhookLogs.push(log);
    return {
      delivery: {
        ...log,
        occurredAt: log.occurredAt.toISOString(),
      },
    };
  }

  receiveInboundWebhook(input: {
    provider: string;
    unitId: string;
    endpoint: string;
    payload?: Record<string, unknown>;
    occurredAt?: Date;
  }) {
    const now = input.occurredAt ?? new Date();
    const forceFailure = Boolean(
      (input.payload as Record<string, unknown> | undefined)?.forceFailure,
    );
    const status: IntegrationWebhookStatus = forceFailure ? "FAILED" : "SUCCESS";
    const log = {
      id: crypto.randomUUID(),
      unitId: input.unitId,
      provider: input.provider,
      direction: "INBOUND" as const,
      endpoint: input.endpoint,
      status,
      httpStatus: forceFailure ? 400 : 200,
      attempt: 1,
      correlationId: crypto.randomUUID(),
      payload: input.payload,
      responseBody: { received: !forceFailure },
      errorMessage: forceFailure ? "Payload inbound invalido para o provedor" : undefined,
      occurredAt: now,
    };
    this.store.integrationWebhookLogs.push(log);
    return {
      received: !forceFailure,
      log: {
        ...log,
        occurredAt: log.occurredAt.toISOString(),
      },
    };
  }

  getIntegrationWebhookLogs(input: {
    unitId: string;
    provider?: string;
    status?: "SUCCESS" | "FAILED";
    start: Date;
    end: Date;
  }) {
    const logs = this.store.integrationWebhookLogs
      .filter(
        (item) =>
          item.unitId === input.unitId &&
          item.occurredAt >= input.start &&
          item.occurredAt <= input.end &&
          (!input.provider || item.provider === input.provider) &&
          (!input.status || item.status === input.status),
      )
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .map((item) => ({
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

  syncBillingSubscriptions(input: {
    unitId: string;
    occurredAt: Date;
    changedBy: string;
  }) {
    const dueSubscriptions = this.store.clientSubscriptions.filter(
      (item) =>
        item.unitId === input.unitId &&
        item.status === "ACTIVE" &&
        item.nextBillingAt <= input.occurredAt,
    );
    let synced = 0;
    const events = [];

    for (const subscription of dueSubscriptions) {
      const idempotencyKey = `${subscription.id}:${input.occurredAt.toISOString().slice(0, 10)}:RENEWED`;
      const alreadySynced = this.store.billingSubscriptionEvents.some(
        (item) =>
          item.subscriptionId === subscription.id &&
          item.payload?.idempotencyKey === idempotencyKey,
      );
      if (alreadySynced) continue;

      const plan = this.store.subscriptionPlans.find((item) => item.id === subscription.planId);
      const amount = plan?.priceMonthly ?? 0;
      const event = {
        id: crypto.randomUUID(),
        unitId: input.unitId,
        subscriptionId: subscription.id,
        externalSubscriptionId: `ext-${subscription.id}`,
        eventType: "RENEWED" as const,
        amount,
        status: "PAID" as const,
        occurredAt: input.occurredAt,
        payload: {
          idempotencyKey,
          changedBy: input.changedBy,
        },
      };
      this.store.billingSubscriptionEvents.push(event);
      this.store.financialEntries.push({
        id: crypto.randomUUID(),
        unitId: input.unitId,
        kind: "INCOME",
        source: "SERVICE",
        amount,
        occurredAt: input.occurredAt,
        referenceType: "MANUAL",
        referenceId: subscription.id,
        description: `Recorrencia de assinatura: ${plan?.name ?? "Plano"}`,
      });

      const nextBilling = new Date(subscription.nextBillingAt);
      nextBilling.setMonth(nextBilling.getMonth() + 1);
      subscription.nextBillingAt = nextBilling;
      subscription.cycleCount += 1;
      synced += 1;
      events.push(event);
    }

    return {
      summary: {
        processed: dueSubscriptions.length,
        synced,
      },
      events: events.map((item) => ({
        ...item,
        occurredAt: item.occurredAt.toISOString(),
      })),
    };
  }

  processBillingWebhookEvent(input: BillingWebhookEventInput): BillingWebhookProcessResult {
    const eventId = input.eventId?.trim();
    const idempotencyKey = input.idempotencyKey?.trim();
    const existing = this.store.billingSubscriptionEvents.find((item) => {
      if (item.unitId !== input.unitId) return false;
      const payload = item.payload ?? {};
      const payloadEventId =
        typeof payload.eventId === "string" ? payload.eventId.trim() : undefined;
      const payloadIdempotencyKey =
        typeof payload.idempotencyKey === "string" ? payload.idempotencyKey.trim() : undefined;
      return (
        (eventId && payloadEventId === eventId) ||
        (idempotencyKey && payloadIdempotencyKey === idempotencyKey)
      );
    });

    if (existing) {
      this.store.integrationWebhookLogs.push({
        id: crypto.randomUUID(),
        unitId: input.unitId,
        provider: input.provider,
        direction: "INBOUND",
        endpoint: input.endpoint,
        status: "SUCCESS",
        httpStatus: 200,
        attempt: 1,
        correlationId: input.correlationId ?? crypto.randomUUID(),
        payload: input.payload,
        responseBody: { received: true, deduplicated: true },
        occurredAt: input.occurredAt,
      });

      return {
        received: true,
        deduplicated: true,
        event: {
          ...existing,
          occurredAt: existing.occurredAt.toISOString(),
        },
        subscription: null,
      };
    }

    const subscription = this.resolveSubscriptionForWebhook({
      unitId: input.unitId,
      subscriptionId: input.subscriptionId,
      externalSubscriptionId: input.externalSubscriptionId,
    });

    const amount = Number.isFinite(input.amount) ? Number(input.amount) : undefined;
    const event = {
      id: crypto.randomUUID(),
      unitId: input.unitId,
      subscriptionId: subscription?.id,
      externalSubscriptionId: input.externalSubscriptionId,
      eventType: input.eventType,
      amount,
      status: input.status,
      occurredAt: input.occurredAt,
      payload: {
        ...input.payload,
        provider: input.provider,
        eventId,
        idempotencyKey,
      },
    } as const;
    this.store.billingSubscriptionEvents.push(event);

    if (subscription) {
      if (input.eventType === "RENEWED" && input.status === "PAID" && amount && amount > 0) {
        this.store.financialEntries.push({
          id: crypto.randomUUID(),
          unitId: input.unitId,
          kind: "INCOME",
          source: "SERVICE",
          amount,
          occurredAt: input.occurredAt,
          referenceType: "MANUAL",
          referenceId: subscription.id,
          description: "Recorrencia de assinatura (webhook gateway)",
        });
        const nextBilling = new Date(subscription.nextBillingAt);
        nextBilling.setMonth(nextBilling.getMonth() + 1);
        subscription.nextBillingAt = nextBilling;
        subscription.cycleCount += 1;
        subscription.status = "ACTIVE";
      } else if (input.eventType === "CHARGE_FAILED" || input.status === "FAILED") {
        subscription.status = "PAST_DUE";
      } else if (input.eventType === "CANCELLED" || input.status === "CANCELLED") {
        subscription.status = "CANCELLED";
      }
    }

    this.store.integrationWebhookLogs.push({
      id: crypto.randomUUID(),
      unitId: input.unitId,
      provider: input.provider,
      direction: "INBOUND",
      endpoint: input.endpoint,
      status: "SUCCESS",
      httpStatus: 200,
      attempt: 1,
      correlationId: input.correlationId ?? crypto.randomUUID(),
      payload: input.payload,
      responseBody: { received: true, deduplicated: false },
      occurredAt: input.occurredAt,
    });

    return {
      received: true,
      deduplicated: false,
      event: {
        ...event,
        occurredAt: event.occurredAt.toISOString(),
      },
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            nextBillingAt: subscription.nextBillingAt.toISOString(),
          }
        : null,
    };
  }

  runBillingReconciliation(input: { unitId: string; start: Date; end: Date }) {
    return this.buildBillingReconciliation(input);
  }

  getBillingReconciliationSummary(input: { unitId: string; start: Date; end: Date }) {
    const snapshot = this.buildBillingReconciliation(input);
    return { summary: snapshot.summary };
  }

  getBillingReconciliationDiscrepancies(input: {
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
    const snapshot = this.buildBillingReconciliation(input);
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

  resolveBillingReconciliationDiscrepancy(input: {
    unitId: string;
    discrepancyId: string;
    resolvedBy: string;
    action: string;
    note?: string;
    start: Date;
    end: Date;
  }) {
    const snapshot = this.buildBillingReconciliation({
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

  private resolveSubscriptionForWebhook(input: {
    unitId: string;
    subscriptionId?: string;
    externalSubscriptionId?: string;
  }) {
    if (input.subscriptionId) {
      const byId = this.store.clientSubscriptions.find(
        (item) => item.id === input.subscriptionId && item.unitId === input.unitId,
      );
      if (byId) return byId;
    }
    const external = input.externalSubscriptionId?.trim();
    if (external?.startsWith("ext-")) {
      const internalId = external.slice(4);
      return this.store.clientSubscriptions.find(
        (item) => item.id === internalId && item.unitId === input.unitId,
      );
    }
    return undefined;
  }

  private buildBillingReconciliation(input: { unitId: string; start: Date; end: Date }) {
    const events = this.store.billingSubscriptionEvents
      .filter(
        (item) =>
          item.unitId === input.unitId &&
          item.occurredAt >= input.start &&
          item.occurredAt <= input.end,
      )
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    const financialEntries = this.store.financialEntries.filter(
      (item) =>
        item.unitId === input.unitId &&
        item.kind === "INCOME" &&
        item.occurredAt >= input.start &&
        item.occurredAt <= input.end,
    );

    const discrepancies: BillingReconciliationDiscrepancy[] = [];
    const duplicateKeys = new Map<string, string>();

    for (const event of events) {
      const key = this.buildBillingDedupeKey(event);
      if (key) {
        if (duplicateKeys.has(key)) {
          discrepancies.push(
            this.applyBillingResolution({
              id: `duplicate:${event.id}`,
              unitId: input.unitId,
              type: "DUPLICATE_EVENT",
              status: "OPEN",
              subscriptionId: event.subscriptionId,
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

      if (event.eventType === "RENEWED" && event.status === "PAID") {
        const day = this.toUtcDayKey(event.occurredAt);
        const relatedFinancial = financialEntries.filter(
          (entry) =>
            entry.referenceId === event.subscriptionId &&
            this.toUtcDayKey(entry.occurredAt) === day,
        );
        if (relatedFinancial.length === 0) {
          discrepancies.push(
            this.applyBillingResolution({
              id: `missing-financial:${event.id}`,
              unitId: input.unitId,
              type: "MISSING_FINANCIAL_ENTRY",
              status: "OPEN",
              subscriptionId: event.subscriptionId,
              eventId: event.id,
              message: "Evento pago sem lancamento financeiro correspondente.",
              expected: `Lancamento financeiro de ${Number(event.amount ?? 0).toFixed(2)}`,
              actual: "Nenhum lancamento encontrado",
              occurredAt: event.occurredAt.toISOString(),
            }),
          );
        } else {
          const hasAmountMatch = relatedFinancial.some(
            (entry) => Math.abs(entry.amount - Number(event.amount ?? 0)) < 0.01,
          );
          if (!hasAmountMatch) {
            discrepancies.push(
              this.applyBillingResolution({
                id: `amount-mismatch:${event.id}`,
                unitId: input.unitId,
                type: "AMOUNT_MISMATCH",
                status: "OPEN",
                subscriptionId: event.subscriptionId,
                eventId: event.id,
                message: "Valor do evento de cobranca diverge do financeiro.",
                expected: Number(event.amount ?? 0).toFixed(2),
                actual: relatedFinancial.map((item) => item.amount.toFixed(2)).join(", "),
                occurredAt: event.occurredAt.toISOString(),
              }),
            );
          }
        }
      }
    }

    const subscriptions = this.store.clientSubscriptions.filter((item) => item.unitId === input.unitId);
    for (const subscription of subscriptions) {
      const latestEvent = events.find((item) => item.subscriptionId === subscription.id);
      if (!latestEvent) continue;
      const expectedStatus = this.expectedSubscriptionStatusFromEvent(latestEvent.status);
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

  private buildBillingDedupeKey(event: {
    subscriptionId?: string;
    eventType: string;
    occurredAt: Date;
    payload?: Record<string, unknown>;
  }) {
    const payload = event.payload ?? {};
    const byEventId = typeof payload.eventId === "string" ? payload.eventId.trim() : "";
    const byIdempotency =
      typeof payload.idempotencyKey === "string" ? payload.idempotencyKey.trim() : "";
    if (byEventId) return `event:${byEventId}`;
    if (byIdempotency) return `idem:${byIdempotency}`;
    if (!event.subscriptionId) return "";
    return `fallback:${event.subscriptionId}:${event.eventType}:${this.toUtcDayKey(event.occurredAt)}`;
  }

  private toUtcDayKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private expectedSubscriptionStatusFromEvent(status: string) {
    if (status === "PAID") return "ACTIVE" as const;
    if (status === "FAILED") return "PAST_DUE" as const;
    if (status === "CANCELLED") return "CANCELLED" as const;
    return undefined;
  }

  getMultiUnitOverview(input: { start: Date; end: Date }) {
    const units = this.store.units.map((unit) => {
      const income = this.store.financialEntries
        .filter(
          (entry) =>
            entry.unitId === unit.id &&
            entry.kind === "INCOME" &&
            entry.occurredAt >= input.start &&
            entry.occurredAt <= input.end,
        )
        .reduce((acc, entry) => acc + entry.amount, 0);
      const appointments = this.store.appointments.filter(
        (item) =>
          item.unitId === unit.id &&
          item.startsAt >= input.start &&
          item.startsAt <= input.end,
      );
      const completed = appointments.filter((item) => item.status === "COMPLETED").length;
      const occupancyRate = appointments.length
        ? Number(((completed / appointments.length) * 100).toFixed(1))
        : 0;
      return {
        unitId: unit.id,
        unitName: unit.name,
        revenue: Number(income.toFixed(2)),
        appointments: appointments.length,
        completed,
        occupancyRate,
      };
    });

    const totalRevenue = units.reduce((acc, item) => acc + item.revenue, 0);
    const totalAppointments = units.reduce((acc, item) => acc + item.appointments, 0);
    const totalCompleted = units.reduce((acc, item) => acc + item.completed, 0);

    return {
      units,
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

  getMultiUnitBenchmark(input: {
    start: Date;
    end: Date;
    metric: "revenue" | "occupancy" | "ticket";
  }) {
    const overview = this.getMultiUnitOverview(input).units;
    const ranking = overview
      .map((item) => {
        const ticket = item.completed ? Number((item.revenue / item.completed).toFixed(2)) : 0;
        return {
          unitId: item.unitId,
          unitName: item.unitName,
          revenue: item.revenue,
          occupancy: item.occupancyRate,
          ticket,
        };
      })
      .sort((a, b) => {
        if (input.metric === "occupancy") return b.occupancy - a.occupancy;
        if (input.metric === "ticket") return b.ticket - a.ticket;
        return b.revenue - a.revenue;
      });
    return { metric: input.metric, ranking };
  }

  getDailyAgenda(input: { unitId: string; date: Date }) {
    const start = new Date(input.date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(input.date);
    end.setHours(23, 59, 59, 999);
    return this.getAgendaRange({
      unitId: input.unitId,
      start,
      end,
    });
  }

  getAgendaRange(input: { unitId: string; start: Date; end: Date }) {
    return this.store.appointments
      .filter(
        (item) =>
          item.unitId === input.unitId &&
          item.startsAt >= input.start &&
          item.startsAt <= input.end,
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .map((appointment) => this.buildAppointmentView(appointment));
  }

  getAppointments(input: {
    unitId: string;
    start?: Date;
    end?: Date;
    status?: AppointmentStatus[];
    clientId?: string;
    professionalId?: string;
    serviceId?: string;
    search?: string;
  }) {
    const search = String(input.search || "").trim().toLowerCase();
    const statusSet = input.status?.length ? new Set(input.status) : null;

    return this.store.appointments
      .filter((item) => item.unitId === input.unitId)
      .filter((item) => (input.start ? item.startsAt >= input.start : true))
      .filter((item) => (input.end ? item.startsAt <= input.end : true))
      .filter((item) => (statusSet ? statusSet.has(item.status) : true))
      .filter((item) => (input.clientId ? item.clientId === input.clientId : true))
      .filter((item) => (input.professionalId ? item.professionalId === input.professionalId : true))
      .filter((item) => (input.serviceId ? item.serviceId === input.serviceId : true))
      .map((item) => this.buildAppointmentView(item))
      .filter((item) => {
        if (!search) return true;
        const haystack = `${item.client} ${item.clientPhone || ""} ${item.professional} ${item.service}`.toLowerCase();
        return haystack.includes(search);
      })
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }

  getAppointmentById(input: { appointmentId: string; unitId?: string }) {
    const appointment = this.store.appointments.find((item) => item.id === input.appointmentId);
    if (!appointment) throw new Error("Agendamento nao encontrado");
    if (input.unitId && appointment.unitId !== input.unitId) {
      throw new Error("Unidade nao autorizada");
    }
    const view = this.buildAppointmentView(appointment);
    return {
      ...view,
      history: appointment.history
        .slice()
        .sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime())
        .map((entry) => ({
          ...entry,
          changedAt: entry.changedAt.toISOString(),
        })),
    };
  }

  updateAppointment(input: {
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
    const appointment = this.store.appointments.find((item) => item.id === input.appointmentId);
    if (!appointment) throw new Error("Agendamento nao encontrado");
    if (input.unitId && appointment.unitId !== input.unitId) {
      throw new Error("Unidade nao autorizada");
    }

    const nextClientId = input.clientId ?? appointment.clientId;
    const nextProfessionalId = input.professionalId ?? appointment.professionalId;
    const nextServiceId = input.serviceId ?? appointment.serviceId;
    const nextStartsAt = input.startsAt ?? appointment.startsAt;
    const nextService = this.store.services.find((item) => item.id === nextServiceId && item.active);
    if (!nextService) throw new Error("Servico nao encontrado ou inativo");

    const nextProfessional = this.store.professionals.find(
      (item) => item.id === nextProfessionalId && item.active,
    );
    if (!nextProfessional) throw new Error("Profissional nao encontrado ou inativo");
    this.assertProfessionalCanExecuteService(nextService.id, nextProfessional.id);

    const nextClient = this.store.clients.find((item) => item.id === nextClientId);
    if (!nextClient) throw new Error("Cliente nao encontrado");

    const nextEndsAt = new Date(nextStartsAt.getTime() + nextService.durationMin * 60_000);
    const hasConflict = hasAppointmentConflict({
      businessId: appointment.unitId,
      professionalId: nextProfessional.id,
      startsAt: nextStartsAt,
      endsAt: nextEndsAt,
      ignoreAppointmentId: appointment.id,
      existingAppointments: this.store.appointments,
    });
    if (hasConflict) {
      throw new Error("Conflito de horario detectado para o profissional");
    }

    let updated: Appointment = {
      ...appointment,
      clientId: nextClient.id,
      professionalId: nextProfessional.id,
      serviceId: nextService.id,
      startsAt: nextStartsAt,
      endsAt: nextEndsAt,
      notes:
        input.notes !== undefined
          ? input.notes || undefined
          : appointment.notes,
      isFitting: input.isFitting !== undefined ? Boolean(input.isFitting) : appointment.isFitting,
    };

    const hasMainChange =
      updated.clientId !== appointment.clientId ||
      updated.professionalId !== appointment.professionalId ||
      updated.serviceId !== appointment.serviceId ||
      updated.startsAt.getTime() !== appointment.startsAt.getTime() ||
      updated.notes !== appointment.notes ||
      updated.isFitting !== appointment.isFitting;

    if (hasMainChange) {
      updated = {
        ...updated,
        history: [
          ...updated.history,
          {
            changedAt: new Date(),
            changedBy: input.changedBy,
            action: "RESCHEDULED",
            reason: "Atualizacao manual do agendamento",
          },
        ],
      };
    }

    if (input.confirmation === true && updated.status === "SCHEDULED") {
      updated = this.engine.changeAppointmentStatus(
        updated,
        "CONFIRMED",
        input.changedBy,
        "Confirmado na central de agendamentos",
      );
    }

    this.replaceAppointment(updated);
    return this.buildAppointmentView(updated);
  }

  async suggestAppointmentAlternatives(input: {
    unitId: string;
    professionalId: string;
    serviceId: string;
    startsAt: Date;
    windowHours?: number;
  }) {
    const service = this.store.services.find((item) => item.id === input.serviceId && item.active);
    if (!service) throw new Error("Servico nao encontrado ou inativo");

    const professional = this.store.professionals.find(
      (item) => item.id === input.professionalId && item.active,
    );
    if (!professional) throw new Error("Profissional nao encontrado ou inativo");
    this.assertProfessionalCanExecuteService(service.id, professional.id);

    const windowHours = Math.min(Math.max(input.windowHours ?? 6, 1), 24);
    const windowStart = new Date(input.startsAt.getTime() - 2 * 60 * 60 * 1000);
    const windowEnd = new Date(input.startsAt.getTime() + windowHours * 60 * 60 * 1000);
    const durationMs = service.durationMin * 60_000;
    const stepMs = 15 * 60_000;

    const existingAppointments = this.store.appointments.filter(
      (item) =>
        item.unitId === input.unitId &&
        item.professionalId === professional.id &&
        ACTIVE_APPOINTMENT_CONFLICT_STATUSES.includes(item.status) &&
        item.startsAt < new Date(windowEnd.getTime() + durationMs) &&
        item.endsAt > windowStart,
    );

    const suggestions: Array<{ startsAt: string; endsAt: string; reason: string }> = [];
    for (let cursor = windowStart.getTime(); cursor <= windowEnd.getTime(); cursor += stepMs) {
      const startsAt = new Date(cursor);
      const endsAt = new Date(startsAt.getTime() + durationMs);

      const conflict = hasAppointmentConflict({
        businessId: input.unitId,
        professionalId: professional.id,
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

  getDashboard(input: { unitId: string; date: Date }): DashboardPayload {
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
    const day = this.dayRange(input.date);
    const week = this.weekRange(input.date);
    const month = this.monthRange(input.date);
    const prevDay = this.shiftRange(day.start, day.end, -1);
    const prevWeek = this.shiftRange(week.start, week.end, -7);
    const prevMonth = this.monthRange(
      new Date(input.date.getFullYear(), input.date.getMonth() - 1, 1),
    );

    const allAppointments = this.store.appointments.filter(
      (item) => item.unitId === input.unitId,
    );
    const financials = this.store.financialEntries.filter(
      (item) => item.unitId === input.unitId && item.kind === "INCOME",
    );
    const sales = this.store.productSales.filter((item) => item.unitId === input.unitId);

    const appointmentsToday = this.inRangeByDate(allAppointments, day.start, day.end, "startsAt");
    const appointmentsMonth = this.inRangeByDate(
      allAppointments,
      month.start,
      month.end,
      "startsAt",
    );

    const revenueToday = this.sumInRange(financials, day.start, day.end, "occurredAt");
    const revenueWeek = this.sumInRange(financials, week.start, week.end, "occurredAt");
    const revenueMonth = this.sumInRange(financials, month.start, month.end, "occurredAt");
    const revenuePrevDay = this.sumInRange(financials, prevDay.start, prevDay.end, "occurredAt");
    const revenuePrevWeek = this.sumInRange(
      financials,
      prevWeek.start,
      prevWeek.end,
      "occurredAt",
    );
    const revenuePrevMonth = this.sumInRange(
      financials,
      prevMonth.start,
      prevMonth.end,
      "occurredAt",
    );

    const completedMonth = appointmentsMonth.filter((item) => item.status === "COMPLETED");
    const monthServiceCost = completedMonth.reduce((acc, appointment) => {
      const service = this.store.services.find((item) => item.id === appointment.serviceId);
      return acc + (service?.costEstimate ?? 0);
    }, 0);
    const salesMonth = this.inRangeByDate(sales, month.start, month.end, "soldAt");
    const monthProductCost = salesMonth.reduce((acc, sale) => {
      return (
        acc +
        sale.items.reduce(
          (itemAcc: number, item: { unitCost: number; quantity: number }) =>
            itemAcc + item.unitCost * item.quantity,
          0,
        )
      );
    }, 0);
    const profitEstimatedMonth = revenueMonth - monthServiceCost - monthProductCost;

    const lowStock = this.store.products
      .filter((item) => item.stockQty <= item.minStockAlert)
      .map((item) => ({ id: item.id, name: item.name, stockQty: item.stockQty }));

    const totalSlots = appointmentsMonth.length;
    const completedSlots = completedMonth.length;
    const cancelledSlots = appointmentsMonth.filter(
      (item) => item.status === "CANCELLED",
    ).length;
    const noShowSlots = appointmentsMonth.filter((item) => item.status === "NO_SHOW").length;
    const occupancyRate = totalSlots ? (completedSlots / totalSlots) * 100 : 0;
    const cancellationRate = totalSlots ? (cancelledSlots / totalSlots) * 100 : 0;
    const noShowRate = totalSlots ? (noShowSlots / totalSlots) * 100 : 0;
    const ticketAverageOverall = completedSlots ? revenueMonth / completedSlots : 0;

    const professionalMap: Record<string, { name: string; revenue: number; count: number }> =
      {};
    for (const appointment of completedMonth) {
      const service = this.store.services.find((item) => item.id === appointment.serviceId);
      const professional = this.store.professionals.find(
        (item) => item.id === appointment.professionalId,
      );
      if (!professional || !service) continue;
      if (!professionalMap[professional.id]) {
        professionalMap[professional.id] = { name: professional.name, revenue: 0, count: 0 };
      }
      professionalMap[professional.id].revenue += service.price;
      professionalMap[professional.id].count += 1;
    }
    const topProfessionals = Object.values(professionalMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((item) => ({
        name: item.name,
        revenue: Number(item.revenue.toFixed(2)),
        ticketAverage: item.count ? Number((item.revenue / item.count).toFixed(2)) : 0,
      }));

    const serviceMap: Record<string, { name: string; count: number; revenue: number }> = {};
    for (const appointment of completedMonth) {
      const service = this.store.services.find((item) => item.id === appointment.serviceId);
      if (!service) continue;
      if (!serviceMap[service.id]) {
        serviceMap[service.id] = { name: service.name, count: 0, revenue: 0 };
      }
      serviceMap[service.id].count += 1;
      serviceMap[service.id].revenue += service.price;
    }
    const topServices = Object.values(serviceMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const productMap: Record<string, { name: string; quantity: number; revenue: number }> = {};
    for (const sale of salesMonth) {
      for (const item of sale.items) {
        const product = this.store.products.find((p) => p.id === item.productId);
        if (!product) continue;
        if (!productMap[item.productId]) {
          productMap[item.productId] = { name: product.name, quantity: 0, revenue: 0 };
        }
        productMap[item.productId].quantity += item.quantity;
        productMap[item.productId].revenue += item.unitPrice * item.quantity;
      }
    }
    const topProducts = Object.values(productMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const clientsOverdue = this.store.clients
      .map((client) => {
        const history = allAppointments
          .filter((item) => item.clientId === client.id && item.status === "COMPLETED")
          .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());
        if (!history.length) return null;
        const last = history[0];
        const daysWithoutReturn = Math.floor(
          (input.date.getTime() - last.endsAt.getTime()) / (1000 * 60 * 60 * 24),
        );
        return {
          id: client.id,
          fullName: client.fullName,
          daysWithoutReturn,
        };
      })
      .filter((item): item is { id: string; fullName: string; daysWithoutReturn: number } =>
        Boolean(item && item.daysWithoutReturn >= thresholds.reactivationMinDays),
      )
      .sort((a, b) => b.daysWithoutReturn - a.daysWithoutReturn)
      .slice(0, 5);

    const goalMonth = 20000;
    const goalProgress = goalMonth ? (revenueMonth / goalMonth) * 100 : 0;
    const serviceRevenueMonth = financials
      .filter(
        (item) =>
          item.source === "SERVICE" &&
          item.occurredAt >= month.start &&
          item.occurredAt <= month.end,
      )
      .reduce((acc, item) => acc + item.amount, 0);
    const productRevenueMonth = financials
      .filter(
        (item) =>
          item.source === "PRODUCT" &&
          item.occurredAt >= month.start &&
          item.occurredAt <= month.end,
      )
      .reduce((acc, item) => acc + item.amount, 0);
    const expensesMonth = this.store.financialEntries
      .filter(
        (item) =>
          item.unitId === input.unitId &&
          item.kind === "EXPENSE" &&
          item.occurredAt >= month.start &&
          item.occurredAt <= month.end,
      )
      .reduce((acc, item) => acc + item.amount, 0);
    const netCashMonth = revenueMonth - expensesMonth;

    const totalCommissionsMonth = this.store.commissionEntries
      .filter((item) => item.occurredAt >= month.start && item.occurredAt <= month.end)
      .reduce((acc, item) => acc + item.commissionAmount, 0);

    const commissionsByProfessional = this.store.professionals.map((professional) => {
      const commission = this.store.commissionEntries
        .filter(
          (item) =>
            item.professionalId === professional.id &&
            item.occurredAt >= month.start &&
            item.occurredAt <= month.end,
        )
        .reduce((acc, item) => acc + item.commissionAmount, 0);
      const produced = completedMonth.filter(
        (item) => item.professionalId === professional.id,
      ).length;
      return {
        professionalId: professional.id,
        name: professional.name,
        commission: Number(commission.toFixed(2)),
        produced,
      };
    });

    const professionalPerformance = this.store.professionals.map((professional) => {
      const completed = completedMonth.filter(
        (item) => item.professionalId === professional.id,
      );
      const total = appointmentsMonth.filter(
        (item) => item.professionalId === professional.id,
      );
      const revenue = completed.reduce((acc, item) => {
        const service = this.store.services.find((row) => row.id === item.serviceId);
        return acc + (service?.price ?? 0);
      }, 0);
      return {
        professionalId: professional.id,
        name: professional.name,
        completed: completed.length,
        total: total.length,
        revenue: Number(revenue.toFixed(2)),
        ticketAverage: completed.length ? Number((revenue / completed.length).toFixed(2)) : 0,
        occupancyRate: total.length
          ? Number(((completed.length / total.length) * 100).toFixed(1))
          : 0,
      };
    });

    const clientRevenueMap: Record<string, { fullName: string; revenue: number; visits: number }> =
      {};
    for (const appointment of completedMonth) {
      const service = this.store.services.find((item) => item.id === appointment.serviceId);
      const client = this.store.clients.find((item) => item.id === appointment.clientId);
      if (!service || !client) continue;
      if (!clientRevenueMap[client.id]) {
        clientRevenueMap[client.id] = { fullName: client.fullName, revenue: 0, visits: 0 };
      }
      clientRevenueMap[client.id].revenue += service.price;
      clientRevenueMap[client.id].visits += 1;
    }
    const topClients = Object.values(clientRevenueMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((item) => ({
        fullName: item.fullName,
        revenue: Number(item.revenue.toFixed(2)),
        visits: item.visits,
      }));

    const lostRevenueEstimate = appointmentsMonth
      .filter((item) => item.status === "CANCELLED" || item.status === "NO_SHOW")
      .reduce((acc, item) => {
        const service = this.store.services.find((row) => row.id === item.serviceId);
        return acc + (service?.price ?? 0);
      }, 0);

    const activeProfessionals = this.store.professionals.filter((item) => item.active);
    const eligibleFutureStatuses = new Set<AppointmentStatus>([
      "SCHEDULED",
      "CONFIRMED",
      "IN_SERVICE",
    ]);
    const forecastAppointments = allAppointments.filter(
      (item) =>
        eligibleFutureStatuses.has(item.status) &&
        item.startsAt >= day.start &&
        item.startsAt <= month.end,
    );
    const servicePriceById = new Map(this.store.services.map((item) => [item.id, item.price]));
    const sumScheduledRevenue = (start: Date, end: Date) =>
      forecastAppointments
        .filter((item) => item.startsAt >= start && item.startsAt <= end)
        .reduce((acc, item) => acc + (servicePriceById.get(item.serviceId) ?? 0), 0);

    const historicalWindowStart = new Date(day.start.getTime() - 90 * 24 * 60 * 60 * 1000);
    const historicalAppointments = allAppointments.filter(
      (item) => item.startsAt >= historicalWindowStart && item.startsAt < day.start,
    );
    const historicalResolved = historicalAppointments.filter(
      (item) =>
        item.status === "COMPLETED" ||
        item.status === "CANCELLED" ||
        item.status === "NO_SHOW",
    );
    const historicalCompleted = historicalResolved.filter(
      (item) => item.status === "COMPLETED",
    ).length;
    const historicalConversionRate = historicalResolved.length
      ? historicalCompleted / historicalResolved.length
      : thresholds.fallbackConversionRate;

    const averageTicket =
      ticketAverageOverall ||
      (this.store.services.reduce((acc, item) => acc + item.price, 0) /
        Math.max(this.store.services.length, 1));

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
        Math.round(thresholds.baseConfidence + Math.min(40, historicalResolved.length * 2)),
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

    for (const professional of activeProfessionals) {
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
    for (const appointment of allAppointments.filter((item) => item.status === "COMPLETED")) {
      const servicePrice = servicePriceById.get(appointment.serviceId) ?? 0;
      const client = this.store.clients.find((item) => item.id === appointment.clientId);
      if (!client) continue;
      const current = completedByClientRevenue.get(client.id) ?? {
        fullName: client.fullName,
        revenue: 0,
        visits: 0,
      };
      current.revenue += servicePrice;
      current.visits += 1;
      completedByClientRevenue.set(client.id, current);
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
      clientsOverdue,
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

  private applyServiceStockConsumption(input: {
    unitId: string;
    serviceId: string;
    appointmentId: string;
    occurredAt: Date;
  }) {
    const profile = this.store.serviceStockConsumptionProfiles.find(
      (item) => item.unitId === input.unitId && item.serviceId === input.serviceId,
    );
    if (!profile || !Array.isArray(profile.items) || profile.items.length === 0) {
      return {
        applied: false,
        movementsCount: 0,
        items: [],
        warnings: [],
      };
    }

    const warnings: string[] = [];
    const appliedItems: Array<{ productId: string; quantity: number; movementId: string }> = [];
    for (const profileItem of profile.items) {
      const product = this.store.products.find(
        (item) => item.id === profileItem.productId && item.active,
      );
      if (!product) {
        warnings.push(`Produto ${profileItem.productId} nao encontrado para consumo.`);
        continue;
      }
      const quantity = computeEffectiveConsumptionQty(profileItem);
      if (quantity <= 0) continue;
      if (product.stockQty < quantity) {
        warnings.push(
          `Saldo insuficiente para ${product.name}. Saldo=${product.stockQty}, consumo=${quantity}.`,
        );
        continue;
      }

      const movementId = crypto.randomUUID();
      this.store.stockMovements.push({
        id: movementId,
        unitId: input.unitId,
        productId: product.id,
        movementType: "OUT",
        quantity,
        occurredAt: input.occurredAt,
        referenceType: "SERVICE_CONSUMPTION",
        referenceId: input.appointmentId,
      });
      appliedItems.push({
        productId: product.id,
        quantity,
        movementId,
      });
    }

    return {
      applied: appliedItems.length > 0,
      movementsCount: appliedItems.length,
      items: appliedItems,
      warnings,
    };
  }

  private replaceAppointment(updated: (typeof this.store.appointments)[number]) {
    const index = this.store.appointments.findIndex((item) => item.id === updated.id);
    if (index === -1) throw new Error("Agendamento nao encontrado para atualizar");
    this.store.appointments[index] = updated;
  }

  private buildAppointmentView(appointment: (typeof this.store.appointments)[number]) {
    const client = this.store.clients.find((item) => item.id === appointment.clientId);
    const professional = this.store.professionals.find(
      (item) => item.id === appointment.professionalId,
    );
    const service = this.store.services.find((item) => item.id === appointment.serviceId);
    const firstHistory = appointment.history[0]?.changedAt ?? appointment.startsAt;
    const lastHistory = appointment.history[appointment.history.length - 1]?.changedAt ?? firstHistory;
    const isConfirmed =
      appointment.status === "CONFIRMED" ||
      appointment.status === "IN_SERVICE" ||
      appointment.status === "COMPLETED" ||
      appointment.history.some((entry) => entry.action === "CONFIRMED");
    const dayStart = new Date(appointment.startsAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(appointment.startsAt);
    dayEnd.setHours(23, 59, 59, 999);
    const productSalesForClient = this.store.productSales.filter(
      (sale) =>
        sale.unitId === appointment.unitId &&
        sale.clientId === appointment.clientId &&
        sale.soldAt >= dayStart &&
        sale.soldAt <= dayEnd,
    );
    const productItemsSoldCount = productSalesForClient.reduce(
      (acc, sale) => acc + sale.items.reduce((itemsAcc, item) => itemsAcc + item.quantity, 0),
      0,
    );

    return {
      ...appointment,
      client: client?.fullName ?? "Cliente",
      clientPhone: client?.phone ?? null,
      clientTags: client?.tags ?? [],
      professional: professional?.name ?? "Profissional",
      service: service?.name ?? "Servico",
      servicePrice: service?.price ?? 0,
      serviceDurationMin: service?.durationMin ?? 0,
      origin: "MANUAL",
      confirmation: isConfirmed,
      createdAt: firstHistory.toISOString(),
      updatedAt: lastHistory.toISOString(),
      hasProductSale: productSalesForClient.length > 0,
      productSalesCount: productSalesForClient.length,
      productItemsSoldCount,
    };
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

  private processAutomationExecution(
    execution: (typeof this.store.automationExecutions)[number],
    startedAt: Date,
  ) {
    const maxAttempts = 3;
    execution.startedAt = startedAt;
    execution.status = "PENDING";
    execution.errorMessage = undefined;

    while (execution.attempts < maxAttempts) {
      execution.attempts += 1;
      if (this.shouldFailAutomationExecution(execution)) {
        continue;
      }
      execution.status = "SUCCESS";
      execution.finishedAt = new Date();
      execution.errorMessage = undefined;
      return;
    }

    execution.status = "FAILED";
    execution.finishedAt = new Date();
    execution.errorMessage = `Falha apos ${maxAttempts} tentativas`;
  }

  private shouldFailAutomationExecution(
    execution: (typeof this.store.automationExecutions)[number],
  ) {
    const payload = (execution.payload ?? {}) as Record<string, unknown>;
    const reprocessCount = Number(payload.reprocessCount ?? 0);
    const campaignType = String(execution.campaignType).toLowerCase();
    if (campaignType.includes("force_fail_always")) return true;
    if (campaignType.includes("force_fail_until_reprocess") && reprocessCount === 0) return true;
    if (campaignType.includes("force_fail_once") && execution.attempts === 1) return true;
    return false;
  }

  private mapMonthlyGoal(goal: MonthlyGoal) {
    return {
      id: goal.id,
      month: goal.month,
      year: goal.year,
      revenueTarget: Number(goal.revenueTarget.toFixed(2)),
      appointmentsTarget: goal.appointmentsTarget,
      averageTicketTarget:
        typeof goal.averageTicketTarget === "number"
          ? Number(goal.averageTicketTarget.toFixed(2))
          : null,
      notes: goal.notes ?? null,
      createdAt: (goal.createdAt ?? new Date()).toISOString(),
      updatedAt: (goal.updatedAt ?? new Date()).toISOString(),
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

  private dayRange(date: Date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  private buildFinancialManagementSnapshot(input: {
    unitId: string;
    start: Date;
    end: Date;
  }): {
    summary: FinancialManagementSnapshot;
    professionals: FinancialManagementProfessionalRow[];
  } {
    const completedAppointments = this.store.appointments.filter(
      (item) =>
        item.unitId === input.unitId &&
        item.status === "COMPLETED" &&
        item.startsAt >= input.start &&
        item.startsAt <= input.end,
    );
    const productSales = this.store.productSales.filter(
      (item) =>
        item.unitId === input.unitId &&
        item.soldAt >= input.start &&
        item.soldAt <= input.end,
    );
    const expenses = this.store.financialEntries.filter(
      (item) =>
        item.unitId === input.unitId &&
        item.kind === "EXPENSE" &&
        item.occurredAt >= input.start &&
        item.occurredAt <= input.end,
    );
    const commissions = this.store.commissionEntries.filter(
      (item) =>
        item.unitId === input.unitId &&
        item.occurredAt >= input.start &&
        item.occurredAt <= input.end,
    );

    let serviceRevenue = 0;
    let serviceCost = 0;
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
      const service = this.store.services.find((row) => row.id === appointment.serviceId);
      const professional = this.store.professionals.find(
        (row) => row.id === appointment.professionalId,
      );
      const price = Number(service?.price ?? 0);
      const cost = Number(service?.costEstimate ?? 0);
      serviceRevenue += price;
      serviceCost += cost;

      const row = professionalMap.get(appointment.professionalId) ?? {
        professionalId: appointment.professionalId,
        name: professional?.name ?? "Profissional",
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
      const saleGross = Number(sale.grossAmount ?? 0);
      const saleCost = sale.items.reduce(
        (acc, item) => acc + Number(item.unitCost ?? 0) * Number(item.quantity ?? 0),
        0,
      );
      productRevenue += saleGross;
      productCost += saleCost;

      if (sale.professionalId) {
        const professional = this.store.professionals.find((row) => row.id === sale.professionalId);
        const row = professionalMap.get(sale.professionalId) ?? {
          professionalId: sale.professionalId,
          name: professional?.name ?? "Profissional",
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

    const operationalExpenses = expenses.reduce((acc, item) => acc + Number(item.amount ?? 0), 0);
    const totalCommissions = commissions.reduce(
      (acc, item) => acc + Number(item.commissionAmount ?? 0),
      0,
    );

    for (const entry of commissions) {
      const professional = this.store.professionals.find((row) => row.id === entry.professionalId);
      const row = professionalMap.get(entry.professionalId) ?? {
        professionalId: entry.professionalId,
        name: professional?.name ?? "Profissional",
        serviceRevenue: 0,
        productRevenue: 0,
        serviceCost: 0,
        productCost: 0,
        commission: 0,
        appointmentsCompleted: 0,
      };
      row.commission += Number(entry.commissionAmount ?? 0);
      professionalMap.set(entry.professionalId, row);
    }

    const grossRevenue = serviceRevenue + productRevenue;
    const operationalProfit =
      grossRevenue - (serviceCost + productCost + operationalExpenses + totalCommissions);
    const operationalMarginPct = grossRevenue ? (operationalProfit / grossRevenue) * 100 : 0;

    const professionals = Array.from(professionalMap.values()).map((item) => {
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
      professionals,
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

  private weekRange(date: Date) {
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

  private monthRange(date: Date) {
    const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }

  private shiftRange(start: Date, end: Date, days: number) {
    const rangeStart = new Date(start);
    rangeStart.setDate(rangeStart.getDate() + days);
    const rangeEnd = new Date(end);
    rangeEnd.setDate(rangeEnd.getDate() + days);
    return { start: rangeStart, end: rangeEnd };
  }

  private inRangeByDate(
    rows: any[],
    start: Date,
    end: Date,
    key: string,
  ) {
    return rows.filter((row) => {
      const date = row[key];
      return date instanceof Date && date >= start && date <= end;
    });
  }

  private sumInRange(
    rows: any[],
    start: Date,
    end: Date,
    dateKey: string,
  ): number {
    return rows.reduce((acc, row) => {
      const date = row[dateKey];
      if (!(date instanceof Date)) return acc;
      if (date < start || date > end) return acc;
      return acc + Number((row.amount as number | undefined) ?? 0);
    }, 0);
  }

  private getCurrentLoyaltyBalance(unitId: string, clientId: string) {
    const latest = this.store.loyaltyLedger
      .filter((item) => item.unitId === unitId && item.clientId === clientId)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
    return latest?.balanceAfter ?? 0;
  }

  private getLatestRetentionScores(
    unitId: string,
    source: Array<(typeof this.store.retentionScoreSnapshots)[number]> = this.store.retentionScoreSnapshots,
  ) {
    const map = new Map<string, (typeof this.store.retentionScoreSnapshots)[number]>();
    for (const item of source
      .filter((row) => row.unitId === unitId)
      .sort((a, b) => b.scoredAt.getTime() - a.scoredAt.getTime())) {
      if (!map.has(item.clientId)) map.set(item.clientId, item);
    }
    return map;
  }

  private buildRetentionScoreSnapshot(
    unitId: string,
    clientId: string,
    scoredAt: Date,
    modelVersion: string,
  ) {
    const completedAppointments = this.store.appointments
      .filter(
        (item) =>
          item.unitId === unitId &&
          item.clientId === clientId &&
          item.status === "COMPLETED",
      )
      .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());
    const lastVisitAt = completedAppointments[0]?.endsAt;
    const daysWithoutReturn = lastVisitAt
      ? Math.floor((scoredAt.getTime() - lastVisitAt.getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    const visits90d = completedAppointments.filter(
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

  private syncRetentionCaseFromScore(
    snapshot: {
      unitId: string;
      clientId: string;
      riskLevel: "LOW" | "MEDIUM" | "HIGH";
      riskScore: number;
      scoredAt: Date;
    },
  ) {
    if (snapshot.riskLevel === "LOW") return;
    const existing = this.store.retentionCases.find(
      (item) =>
        item.unitId === snapshot.unitId &&
        item.clientId === snapshot.clientId &&
        (item.status === "OPEN" || item.status === "IN_PROGRESS"),
    );
    if (existing) {
      existing.riskLevel = snapshot.riskLevel;
      existing.updatedAt = snapshot.scoredAt;
      existing.reason = "Risco preditivo elevado";
      existing.recommendedAction = "Executar automacao de reativacao";
      return;
    }

    this.store.retentionCases.push({
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
    });
  }

  private refreshRetentionCases(unitId: string) {
    const now = new Date();
    for (const client of this.store.clients) {
      const appointments = this.store.appointments
        .filter(
          (item) =>
            item.unitId === unitId &&
            item.clientId === client.id &&
            item.status === "COMPLETED",
        )
        .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());
      const lastVisit = appointments[0]?.endsAt;
      if (!lastVisit) continue;
      const daysWithoutReturn = Math.floor(
        (now.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysWithoutReturn < 30) continue;

      const riskLevel = daysWithoutReturn > 60 ? "HIGH" : daysWithoutReturn > 45 ? "MEDIUM" : "LOW";
      const existing = this.store.retentionCases.find(
        (item) =>
          item.unitId === unitId &&
          item.clientId === client.id &&
          (item.status === "OPEN" || item.status === "IN_PROGRESS"),
      );
      if (existing) {
        existing.daysWithoutReturn = daysWithoutReturn;
        existing.riskLevel = riskLevel;
        existing.lastVisitAt = lastVisit;
        existing.updatedAt = now;
        continue;
      }

      this.store.retentionCases.push({
        id: crypto.randomUUID(),
        unitId,
        clientId: client.id,
        status: "OPEN",
        riskLevel,
        reason: "Sem retorno recente",
        recommendedAction: "Contato ativo com oferta personalizada",
        lastVisitAt: lastVisit,
        daysWithoutReturn,
        ownerUser: "owner",
        updatedAt: now,
      });
    }
  }
}
