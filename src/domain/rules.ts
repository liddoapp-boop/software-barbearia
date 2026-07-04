import {
  Appointment,
  AppointmentStatus,
  BusinessHour,
  BusinessSettings,
  CommissionEntry,
  CommissionRule,
  FinancialEntry,
  Product,
  ProductSale,
  Professional,
  Service,
  StockMovement,
  UUID,
} from "./types";

export interface AppointmentConflictInput {
  businessId?: UUID;
  clientId?: UUID;
  professionalId: UUID;
  startsAt: Date;
  endsAt: Date;
  ignoreAppointmentId?: UUID;
  existingAppointments: Appointment[];
}

export const ACTIVE_APPOINTMENT_CONFLICT_STATUSES: AppointmentStatus[] = [
  "SCHEDULED",
  "CONFIRMED",
  "IN_SERVICE",
];

export function hasAppointmentConflict(input: AppointmentConflictInput): boolean {
  return input.existingAppointments.some((appointment) => {
    if (input.businessId && appointment.unitId !== input.businessId) return false;
    const sameProfessional = appointment.professionalId === input.professionalId;
    const sameClient = input.clientId ? appointment.clientId === input.clientId : false;
    if (!sameProfessional && !sameClient) return false;
    if (appointment.id === input.ignoreAppointmentId) return false;
    if (!ACTIVE_APPOINTMENT_CONFLICT_STATUSES.includes(appointment.status)) return false;

    const overlapsStart = input.startsAt < appointment.endsAt;
    const overlapsEnd = input.endsAt > appointment.startsAt;
    return overlapsStart && overlapsEnd;
  });
}

export const hasScheduleConflict = hasAppointmentConflict;

export interface AppointmentSchedulingWindowInput {
  unitId: UUID;
  startsAt: Date;
  endsAt: Date;
  serviceDurationMin: number;
  bufferAfterMin: number;
  settings: Pick<
    BusinessSettings,
    "minimumAdvanceMinutes" | "allowOutOfHoursAppointments" | "allowOverbooking"
  >;
  businessHours: BusinessHour[];
  timezone?: string;
  now?: Date;
}

type LocalDateTimeParts = {
  dayOfWeek: number;
  minutes: number;
  dateKey: string;
};

const WEEKDAY_TO_NUMBER: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function parseTimeToMinutes(value?: string): number | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function getLocalDateTimeParts(date: Date, timezone = "America/Sao_Paulo"): LocalDateTimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const weekday = String(byType.get("weekday") || "").toLowerCase();
  const dayOfWeek = WEEKDAY_TO_NUMBER[weekday];
  if (dayOfWeek == null) throw new Error(`Timezone invalida para agenda: ${timezone}`);
  const hour = Number(byType.get("hour"));
  const minute = Number(byType.get("minute"));
  return {
    dayOfWeek,
    minutes: hour * 60 + minute,
    dateKey: `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`,
  };
}

export function validateAppointmentSchedulingWindow(input: AppointmentSchedulingWindowInput): void {
  if (!(input.startsAt instanceof Date) || Number.isNaN(input.startsAt.getTime())) {
    throw new Error("Data inicial do agendamento invalida");
  }
  if (!(input.endsAt instanceof Date) || Number.isNaN(input.endsAt.getTime())) {
    throw new Error("Data final do agendamento invalida");
  }
  if (input.endsAt <= input.startsAt) {
    throw new Error("Horario final do agendamento deve ser posterior ao inicio");
  }

  const expectedDurationMs = (input.serviceDurationMin + input.bufferAfterMin) * 60_000;
  const actualDurationMs = input.endsAt.getTime() - input.startsAt.getTime();
  if (actualDurationMs < expectedDurationMs) {
    throw new Error("Duracao do agendamento nao respeita servico e buffer configurado");
  }

  const now = input.now ?? new Date();
  if (input.startsAt.getTime() < now.getTime()) {
    throw new Error("Nao e permitido criar agendamento no passado");
  }

  const minimumAdvanceMinutes = Math.max(0, Math.trunc(input.settings.minimumAdvanceMinutes ?? 0));
  if (input.startsAt.getTime() < now.getTime() + minimumAdvanceMinutes * 60_000) {
    throw new Error(`Agendamento exige antecedencia minima de ${minimumAdvanceMinutes} minutos`);
  }

  if (input.settings.allowOutOfHoursAppointments) return;

  const timezone = input.timezone || "America/Sao_Paulo";
  const startLocal = getLocalDateTimeParts(input.startsAt, timezone);
  const endLocal = getLocalDateTimeParts(input.endsAt, timezone);
  if (startLocal.dateKey !== endLocal.dateKey) {
    throw new Error("Agendamento nao pode atravessar dias de funcionamento");
  }

  const businessHour = input.businessHours.find((item) => item.dayOfWeek === startLocal.dayOfWeek);
  if (!businessHour || businessHour.isClosed) {
    throw new Error("Unidade fechada no dia selecionado");
  }

  const opensAt = parseTimeToMinutes(businessHour.opensAt);
  const closesAt = parseTimeToMinutes(businessHour.closesAt);
  if (opensAt == null || closesAt == null || startLocal.minutes < opensAt || endLocal.minutes > closesAt) {
    throw new Error("Horario fora do expediente da unidade");
  }

  const breakStart = parseTimeToMinutes(businessHour.breakStart);
  const breakEnd = parseTimeToMinutes(businessHour.breakEnd);
  if (breakStart != null && breakEnd != null && startLocal.minutes < breakEnd && endLocal.minutes > breakStart) {
    throw new Error("Horario indisponivel durante intervalo da unidade");
  }
}

export function canTransitionAppointmentStatus(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  const transitions: Record<AppointmentStatus, AppointmentStatus[]> = {
    SCHEDULED: ["CONFIRMED", "CANCELLED", "NO_SHOW", "BLOCKED"],
    CONFIRMED: ["IN_SERVICE", "CANCELLED", "NO_SHOW"],
    IN_SERVICE: ["COMPLETED", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
    NO_SHOW: [],
    BLOCKED: ["SCHEDULED", "CANCELLED"],
  };

  return transitions[from].includes(to);
}

export function calculateServiceCommission(
  professional: Professional,
  service: Service,
  servicePrice: number,
  monthlyProducedValue: number,
  unitId: UUID,
  appointmentId: UUID,
  now: Date,
): CommissionEntry | null {
  const rule = professional.commissionRules.find(
    (item) =>
      item.appliesTo === "SERVICE" &&
      (!item.serviceCategory || item.serviceCategory === service.category),
  );

  if (!rule) return null;
  const percentage = resolveEffectivePercentage(rule, monthlyProducedValue);
  const fixedAmount = rule.fixedAmount ?? 0;
  const commissionAmount = roundMoney(servicePrice * percentage + fixedAmount);
  if (commissionAmount <= 0) return null;

  return {
    id: crypto.randomUUID(),
    professionalId: professional.id,
    unitId,
    appointmentId,
    source: "SERVICE",
    baseAmount: servicePrice,
    commissionRate: percentage,
    commissionAmount,
    status: "PENDING",
    occurredAt: now,
    ruleId: rule.id,
    createdAt: now,
  };
}

export function calculateProductCommission(
  professional: Professional,
  grossAmount: number,
  unitId: UUID,
  productSaleId: UUID,
  now: Date,
): CommissionEntry | null {
  const rule = professional.commissionRules.find(
    (item) => item.appliesTo === "PRODUCT",
  );
  if (!rule) return null;

  const percentage = rule.percentage ?? 0;
  const fixedAmount = rule.fixedAmount ?? 0;
  const commissionAmount = roundMoney(grossAmount * percentage + fixedAmount);
  if (commissionAmount <= 0) return null;

  return {
    id: crypto.randomUUID(),
    professionalId: professional.id,
    unitId,
    productSaleId,
    source: "PRODUCT",
    baseAmount: grossAmount,
    commissionRate: percentage,
    commissionAmount,
    status: "PENDING",
    occurredAt: now,
    ruleId: rule.id,
    createdAt: now,
  };
}

function resolveEffectivePercentage(
  rule: CommissionRule,
  monthlyProducedValue: number,
): number {
  const base = rule.percentage ?? 0;
  if (!rule.goalThreshold || !rule.extraPercentageAfterGoal) return base;
  if (monthlyProducedValue < rule.goalThreshold) return base;
  return base + rule.extraPercentageAfterGoal;
}

export function buildServiceRevenueEntry(input: {
  unitId: UUID;
  appointmentId: UUID;
  amount: number;
  occurredAt: Date;
  description: string;
}): FinancialEntry {
  return {
    id: crypto.randomUUID(),
    unitId: input.unitId,
    kind: "INCOME",
    source: "SERVICE",
    category: "SERVICO",
    amount: roundMoney(input.amount),
    occurredAt: input.occurredAt,
    referenceType: "APPOINTMENT",
    referenceId: input.appointmentId,
    description: input.description,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  };
}

export function buildProductRevenueEntry(input: {
  unitId: UUID;
  productSaleId: UUID;
  amount: number;
  occurredAt: Date;
  description: string;
}): FinancialEntry {
  return {
    id: crypto.randomUUID(),
    unitId: input.unitId,
    kind: "INCOME",
    source: "PRODUCT",
    category: "PRODUTO",
    amount: roundMoney(input.amount),
    occurredAt: input.occurredAt,
    referenceType: "PRODUCT_SALE",
    referenceId: input.productSaleId,
    description: input.description,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  };
}

export function buildCommissionPaymentExpenseEntry(input: {
  unitId: UUID;
  commissionId: UUID;
  professionalId: UUID;
  amount: number;
  occurredAt: Date;
}): FinancialEntry {
  return {
    id: crypto.randomUUID(),
    unitId: input.unitId,
    kind: "EXPENSE",
    source: "COMMISSION",
    category: "COMISSAO",
    amount: roundMoney(input.amount),
    occurredAt: input.occurredAt,
    referenceType: "COMMISSION",
    referenceId: input.commissionId,
    professionalId: input.professionalId,
    description: "Pagamento de comissao",
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  };
}

export function buildServiceRefundExpenseEntry(input: {
  unitId: UUID;
  refundId: UUID;
  appointmentId: UUID;
  professionalId?: UUID;
  customerId?: UUID;
  amount: number;
  occurredAt: Date;
  reason: string;
}): FinancialEntry {
  return {
    id: crypto.randomUUID(),
    unitId: input.unitId,
    kind: "EXPENSE",
    source: "REFUND",
    category: "ESTORNO_SERVICO",
    amount: roundMoney(input.amount),
    occurredAt: input.occurredAt,
    referenceType: "APPOINTMENT_REFUND",
    referenceId: input.refundId,
    professionalId: input.professionalId,
    customerId: input.customerId,
    description: "Estorno de atendimento",
    notes: `appointmentId=${input.appointmentId}; reason=${input.reason}`,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  };
}

export function buildProductRefundExpenseEntry(input: {
  unitId: UUID;
  refundId: UUID;
  productSaleId: UUID;
  professionalId?: UUID;
  customerId?: UUID;
  amount: number;
  occurredAt: Date;
  reason: string;
}): FinancialEntry {
  return {
    id: crypto.randomUUID(),
    unitId: input.unitId,
    kind: "EXPENSE",
    source: "REFUND",
    category: "DEVOLUCAO_PRODUTO",
    amount: roundMoney(input.amount),
    occurredAt: input.occurredAt,
    referenceType: "PRODUCT_SALE_REFUND",
    referenceId: input.refundId,
    professionalId: input.professionalId,
    customerId: input.customerId,
    description: "Devolucao de produto",
    notes: `productSaleId=${input.productSaleId}; reason=${input.reason}`,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  };
}

export function buildStockMovementsFromProductRefund(input: {
  unitId: UUID;
  refundId: UUID;
  occurredAt: Date;
  items: Array<{
    productId: UUID;
    quantity: number;
  }>;
}): StockMovement[] {
  return input.items.map((item) => ({
    id: crypto.randomUUID(),
    unitId: input.unitId,
    productId: item.productId,
    movementType: "IN",
    quantity: item.quantity,
    occurredAt: input.occurredAt,
    referenceType: "PRODUCT_REFUND",
    referenceId: input.refundId,
  }));
}

export function buildStockMovementsFromSale(
  unitId: UUID,
  sale: ProductSale,
  products: Product[],
  now: Date,
): StockMovement[] {
  return sale.items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    if (!product) {
      throw new Error(`Produto ${item.productId} nao encontrado para baixa`);
    }

    if (product.stockQty < item.quantity) {
      throw new Error(
        `Estoque insuficiente para ${product.name}. Disponivel=${product.stockQty}, solicitado=${item.quantity}`,
      );
    }

    return {
      id: crypto.randomUUID(),
      unitId,
      productId: item.productId,
      movementType: "OUT",
      quantity: item.quantity,
      occurredAt: now,
      referenceType: "PRODUCT_SALE",
      referenceId: sale.id,
    };
  });
}

export function calculateProductSaleGrossAmount(sale: ProductSale): number {
  return roundMoney(
    sale.items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0),
  );
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
