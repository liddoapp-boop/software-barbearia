import {
  Appointment,
  AppointmentStatus,
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
    if (appointment.professionalId !== input.professionalId) return false;
    if (appointment.id === input.ignoreAppointmentId) return false;
    if (!ACTIVE_APPOINTMENT_CONFLICT_STATUSES.includes(appointment.status)) return false;

    const overlapsStart = input.startsAt < appointment.endsAt;
    const overlapsEnd = input.endsAt > appointment.startsAt;
    return overlapsStart && overlapsEnd;
  });
}

export const hasScheduleConflict = hasAppointmentConflict;

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
