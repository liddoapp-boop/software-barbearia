export type UUID = string;

export type AppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "IN_SERVICE"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW"
  | "BLOCKED";

export type FinancialKind = "INCOME" | "EXPENSE";

export type RevenueSource = "SERVICE" | "PRODUCT";
export type FinancialSource = RevenueSource | "COMMISSION" | "REFUND";
export type AuditActorRole = "owner" | "recepcao" | "profissional" | "anonymous";

export interface AuditEvent {
  id: UUID;
  unitId: UUID;
  actorId: string;
  actorEmail?: string;
  actorRole: AuditActorRole;
  action: string;
  entity: string;
  entityId?: string;
  route: string;
  method: string;
  requestId: string;
  idempotencyKey?: string;
  beforeJson?: Record<string, unknown>;
  afterJson?: Record<string, unknown>;
  metadataJson?: Record<string, unknown>;
  createdAt: Date;
}

export interface Service {
  id: UUID;
  businessId: UUID;
  name: string;
  description?: string;
  category?: string;
  price: number;
  durationMin: number;
  defaultCommissionRate?: number;
  costEstimate: number;
  notes?: string;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ServiceProfessionalAssignment {
  serviceId: UUID;
  professionalId: UUID;
}

export interface Professional {
  id: UUID;
  name: string;
  active: boolean;
  commissionRules: CommissionRule[];
}

export type BusinessSegment =
  | "barbearia"
  | "estetica"
  | "salao"
  | "pet_shop"
  | "clinica"
  | "outro";

export interface BusinessSettings {
  id: UUID;
  unitId: UUID;
  businessName: string;
  segment: BusinessSegment;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  document?: string;
  displayName?: string;
  primaryColor?: string;
  themeMode?: "light" | "dark" | "system";
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
  houseCommissionType: "PERCENTAGE" | "FIXED";
  houseCommissionValue: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MonthlyGoal {
  id: UUID;
  businessId: UUID;
  month: number;
  year: number;
  revenueTarget: number;
  appointmentsTarget: number;
  averageTicketTarget?: number;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface BusinessHour {
  id: UUID;
  unitId: UUID;
  dayOfWeek: number;
  opensAt?: string;
  closesAt?: string;
  breakStart?: string;
  breakEnd?: string;
  isClosed: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface BusinessPaymentMethod {
  id: UUID;
  unitId: UUID;
  name: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface BusinessCommissionRule {
  id: UUID;
  unitId: UUID;
  professionalId?: UUID;
  serviceId?: UUID;
  type: "PERCENTAGE" | "FIXED";
  value: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface BusinessTeamMember {
  id: UUID;
  unitId: UUID;
  name: string;
  role: "OWNER" | "MANAGER" | "PROFESSIONAL" | "RECEPTION";
  accessProfile: "owner" | "gerente" | "profissional" | "recepcao";
  email?: string;
  phone?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CommissionRule {
  id: UUID;
  appliesTo: "SERVICE" | "PRODUCT";
  serviceCategory?: string;
  percentage?: number;
  fixedAmount?: number;
  goalThreshold?: number;
  extraPercentageAfterGoal?: number;
}

export interface Client {
  id: UUID;
  fullName: string;
  phone?: string;
  preferredProfessionalId?: UUID;
  tags: Array<"NEW" | "RECURRING" | "VIP" | "INACTIVE">;
}

export interface Product {
  id: UUID;
  name: string;
  category: string;
  salePrice: number;
  costPrice: number;
  stockQty: number;
  minStockAlert: number;
  active: boolean;
}

export interface ServiceStockConsumptionItem {
  productId: UUID;
  quantityPerService: number;
  wastePct?: number;
  isCritical?: boolean;
}

export interface ServiceStockConsumptionProfile {
  unitId: UUID;
  serviceId: UUID;
  items: ServiceStockConsumptionItem[];
  updatedAt: Date;
}

export interface Appointment {
  id: UUID;
  unitId: UUID;
  clientId: UUID;
  professionalId: UUID;
  serviceId: UUID;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  isFitting: boolean;
  notes?: string;
  history: AppointmentHistoryItem[];
}

export interface AppointmentHistoryItem {
  changedAt: Date;
  changedBy: string;
  action:
    | "CREATED"
    | "RESCHEDULED"
    | "CANCELLED"
    | "CONFIRMED"
    | "CHECKED_IN"
    | "COMPLETED"
    | "NO_SHOW"
    | "BLOCKED"
    | "REFUNDED";
  reason?: string;
}

export interface FinancialEntry {
  id: UUID;
  unitId: UUID;
  kind: FinancialKind;
  source?: FinancialSource;
  category?: string;
  paymentMethod?: string;
  amount: number;
  occurredAt: Date;
  referenceType:
    | "APPOINTMENT"
    | "PRODUCT_SALE"
    | "MANUAL"
    | "COMMISSION"
    | "APPOINTMENT_REFUND"
    | "PRODUCT_SALE_REFUND";
  referenceId?: UUID;
  professionalId?: UUID;
  customerId?: UUID;
  description: string;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FinancialManagementSnapshot {
  grossRevenue: number;
  serviceRevenue: number;
  productRevenue: number;
  serviceCost: number;
  productCost: number;
  operationalExpenses: number;
  totalCommissions: number;
  operationalProfit: number;
  operationalMarginPct: number;
}

export interface FinancialManagementSnapshotDelta {
  grossRevenue: number;
  serviceRevenue: number;
  productRevenue: number;
  serviceCost: number;
  productCost: number;
  operationalExpenses: number;
  totalCommissions: number;
  operationalProfit: number;
  operationalMarginPct: number;
}

export interface FinancialManagementProfessionalRow {
  professionalId: string;
  name: string;
  serviceRevenue: number;
  productRevenue: number;
  grossRevenue: number;
  serviceCost: number;
  productCost: number;
  commission: number;
  estimatedProfit: number;
  marginPct: number;
  appointmentsCompleted: number;
  ticketAverage: number;
  previousEstimatedProfit?: number;
  previousGrossRevenue?: number;
  deltaEstimatedProfit?: number;
  deltaEstimatedProfitPct?: number;
}

export interface FinancialManagementOverviewPayload {
  period: {
    start: string;
    end: string;
    compareStart: string;
    compareEnd: string;
  };
  summary: {
    current: FinancialManagementSnapshot;
    previous: FinancialManagementSnapshot;
    delta: FinancialManagementSnapshotDelta;
  };
  breakdown: {
    totalCost: number;
    costRatioPct: number;
    profitRatioPct: number;
  };
  professionals: FinancialManagementProfessionalRow[];
  highlights: {
    topProfitProfessional: {
      professionalId: string;
      name: string;
      estimatedProfit: number;
    } | null;
    topRevenueProfessional: {
      professionalId: string;
      name: string;
      grossRevenue: number;
    } | null;
    lowestMarginProfessional: {
      professionalId: string;
      name: string;
      marginPct: number;
    } | null;
  };
}

export interface CommissionEntry {
  id: UUID;
  professionalId: UUID;
  unitId: UUID;
  appointmentId?: UUID;
  productSaleId?: UUID;
  source: RevenueSource;
  baseAmount: number;
  commissionRate?: number;
  commissionAmount: number;
  status?: "PENDING" | "PAID" | "CANCELED";
  occurredAt: Date;
  paidAt?: Date;
  ruleId: UUID;
  createdAt?: Date;
}

export interface ProductSale {
  id: UUID;
  unitId: UUID;
  clientId?: UUID;
  professionalId?: UUID;
  items: ProductSaleItem[];
  grossAmount: number;
  soldAt: Date;
}

export interface ProductSaleItem {
  productId: UUID;
  quantity: number;
  unitPrice: number;
  unitCost: number;
}

export type ProductSaleRefundStatus = "NOT_REFUNDED" | "PARTIALLY_REFUNDED" | "REFUNDED";

export interface ProductSaleHistoryItem extends ProductSaleItem {
  productName?: string;
  refundedQuantity: number;
  refundableQuantity: number;
}

export interface ProductSaleHistoryRow {
  id: UUID;
  unitId: UUID;
  soldAt: Date;
  clientId?: UUID;
  clientName?: string;
  professionalId?: UUID;
  professionalName?: string;
  grossAmount: number;
  items: ProductSaleHistoryItem[];
  totalRefundedAmount: number;
  status: ProductSaleRefundStatus;
  createdAt?: Date;
}

export interface Refund {
  id: UUID;
  unitId: UUID;
  appointmentId?: UUID;
  productSaleId?: UUID;
  totalAmount: number;
  reason: string;
  refundedAt: Date;
  changedBy: string;
  idempotencyKey?: string;
  createdAt?: Date;
  items?: RefundItem[];
}

export interface RefundItem {
  id: UUID;
  refundId: UUID;
  productId: UUID;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface StockMovement {
  id: UUID;
  unitId: UUID;
  productId: UUID;
  movementType: "IN" | "OUT" | "LOSS" | "INTERNAL_USE";
  quantity: number;
  occurredAt: Date;
  referenceType:
    | "PRODUCT_SALE"
    | "SERVICE_CONSUMPTION"
    | "ADJUSTMENT"
    | "INTERNAL"
    | "PRODUCT_REFUND";
  referenceId?: UUID;
}

export interface ServiceStockConsumptionAppliedItem {
  productId: UUID;
  quantity: number;
  movementId: UUID;
}

export interface ServiceStockConsumptionResult {
  applied: boolean;
  movementsCount: number;
  items: ServiceStockConsumptionAppliedItem[];
  warnings: string[];
}

export interface StockReplenishmentSuggestion {
  productId: UUID;
  productName: string;
  currentQty: number;
  minStockAlert: number;
  urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  recommendedPurchaseQty: number;
  estimatedDaysToRupture: number;
  lastConsumptionAt?: string;
}

export type LoyaltyType = "POINTS" | "CASHBACK";
export type LoyaltySourceType = "SERVICE" | "PRODUCT" | "ADJUSTMENT" | "REDEEM";
export type ClientPackageStatus = "ACTIVE" | "EXPIRED" | "DEPLETED" | "CANCELLED";
export type ClientSubscriptionStatus = "ACTIVE" | "PAST_DUE" | "CANCELLED";
export type RetentionCaseStatus = "OPEN" | "IN_PROGRESS" | "CONVERTED" | "LOST";
export type RetentionRiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type AutomationExecutionStatus = "PENDING" | "SUCCESS" | "FAILED";
export type AutomationTriggerType = "INACTIVITY" | "BIRTHDAY" | "HIGH_RISK";
export type AutomationChannel = "WHATSAPP" | "SMS" | "EMAIL" | "MANUAL";
export type AutomationTarget = "CLIENT" | "SEGMENT";
export type AutomationSourceModule = "dashboard" | "clientes" | "automacoes";
export type AutomationPlaybookType =
  | "REACTIVATION"
  | "IDLE_WINDOW_FILL"
  | "FORECAST_PROTECTION";
export type IntegrationWebhookDirection = "INBOUND" | "OUTBOUND";
export type IntegrationWebhookStatus = "SUCCESS" | "FAILED";

export interface LoyaltyProgram {
  id: UUID;
  unitId: UUID;
  name: string;
  type: LoyaltyType;
  conversionRate: number;
  isActive: boolean;
}

export interface LoyaltyLedgerEntry {
  id: UUID;
  unitId: UUID;
  clientId: UUID;
  sourceType: LoyaltySourceType;
  sourceId?: UUID;
  pointsDelta: number;
  balanceAfter: number;
  occurredAt: Date;
  createdBy: string;
}

export interface ServicePackage {
  id: UUID;
  unitId: UUID;
  name: string;
  price: number;
  sessionsTotal: number;
  sessionsByService?: Record<string, number>;
  validityDays: number;
  isActive: boolean;
}

export interface ClientPackage {
  id: UUID;
  unitId: UUID;
  clientId: UUID;
  packageId: UUID;
  purchasedAt: Date;
  expiresAt: Date;
  sessionsRemaining: number;
  status: ClientPackageStatus;
}

export interface SubscriptionPlan {
  id: UUID;
  unitId: UUID;
  name: string;
  priceMonthly: number;
  billingDay: number;
  benefits?: string[];
  isActive: boolean;
}

export interface ClientSubscription {
  id: UUID;
  unitId: UUID;
  clientId: UUID;
  planId: UUID;
  startedAt: Date;
  nextBillingAt: Date;
  status: ClientSubscriptionStatus;
  cycleCount: number;
}

export interface RetentionCase {
  id: UUID;
  unitId: UUID;
  clientId: UUID;
  status: RetentionCaseStatus;
  riskLevel: RetentionRiskLevel;
  reason: string;
  recommendedAction: string;
  lastVisitAt?: Date;
  daysWithoutReturn: number;
  ownerUser?: string;
  updatedAt: Date;
}

export interface RetentionEvent {
  id: UUID;
  caseId: UUID;
  channel: "PHONE" | "WHATSAPP" | "MANUAL";
  note: string;
  outcome?: string;
  occurredAt: Date;
  createdBy: string;
}

export interface AutomationRule {
  id: UUID;
  unitId: UUID;
  name: string;
  triggerType: AutomationTriggerType;
  channel: AutomationChannel;
  target: AutomationTarget;
  messageTemplate: string;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AutomationRuleUpdateInput {
  unitId: string;
  ruleId: string;
  name?: string;
  triggerType?: AutomationTriggerType;
  channel?: AutomationChannel;
  target?: AutomationTarget;
  messageTemplate?: string;
}

export interface AutomationExecution {
  id: UUID;
  unitId: UUID;
  ruleId?: UUID;
  clientId?: UUID;
  campaignType: string;
  status: AutomationExecutionStatus;
  attempts: number;
  idempotencyKey: string;
  errorMessage?: string;
  payload?: Record<string, unknown>;
  startedAt: Date;
  finishedAt?: Date;
}

export interface RetentionScoreSnapshot {
  id: UUID;
  unitId: UUID;
  clientId: UUID;
  riskScore: number;
  riskLevel: RetentionRiskLevel;
  returnProbability: number;
  reasons: string[];
  modelVersion: string;
  scoredAt: Date;
}

export interface IntegrationWebhookLog {
  id: UUID;
  unitId: UUID;
  provider: string;
  direction: IntegrationWebhookDirection;
  endpoint: string;
  status: IntegrationWebhookStatus;
  httpStatus?: number;
  attempt: number;
  correlationId: string;
  payload?: Record<string, unknown>;
  responseBody?: Record<string, unknown>;
  errorMessage?: string;
  occurredAt: Date;
}

export interface BillingSubscriptionEvent {
  id: UUID;
  unitId: UUID;
  subscriptionId?: UUID;
  externalSubscriptionId?: string;
  eventType: "RENEWED" | "CHARGE_FAILED" | "CANCELLED";
  amount?: number;
  status: "PAID" | "FAILED" | "CANCELLED";
  occurredAt: Date;
  payload?: Record<string, unknown>;
}

export interface BillingWebhookEventInput {
  provider: string;
  endpoint: string;
  unitId: UUID;
  eventId?: string;
  idempotencyKey?: string;
  subscriptionId?: UUID;
  externalSubscriptionId?: string;
  eventType: "RENEWED" | "CHARGE_FAILED" | "CANCELLED";
  status: "PAID" | "FAILED" | "CANCELLED";
  amount?: number;
  occurredAt: Date;
  payload?: Record<string, unknown>;
  correlationId?: string;
}

export interface BillingWebhookProcessResult {
  received: boolean;
  deduplicated: boolean;
  event: Omit<BillingSubscriptionEvent, "occurredAt"> & {
    occurredAt: string;
  };
  subscription?: {
    id: string;
    status: ClientSubscriptionStatus;
    nextBillingAt: string;
  } | null;
}

export type BillingReconciliationDiscrepancyType =
  | "MISSING_FINANCIAL_ENTRY"
  | "AMOUNT_MISMATCH"
  | "DUPLICATE_EVENT"
  | "STATUS_MISMATCH";

export type BillingReconciliationDiscrepancyStatus = "OPEN" | "RESOLVED";

export interface BillingReconciliationDiscrepancy {
  id: string;
  unitId: string;
  type: BillingReconciliationDiscrepancyType;
  status: BillingReconciliationDiscrepancyStatus;
  subscriptionId?: string;
  eventId?: string;
  message: string;
  expected?: string;
  actual?: string;
  occurredAt: string;
  metadata?: Record<string, unknown>;
  resolution?: {
    resolvedAt: string;
    resolvedBy: string;
    action: string;
    note?: string;
  };
}

export type ClientPredictiveStatus = "ACTIVE" | "AT_RISK" | "INACTIVE" | "VIP";

export type ClientValueSegment = "VALUE_HIGH" | "VALUE_MEDIUM" | "VALUE_LOW";

export interface ClientPredictiveRow {
  clientId: string;
  fullName: string;
  phone: string | null;
  tags: Array<"NEW" | "RECURRING" | "VIP" | "INACTIVE">;
  status: ClientPredictiveStatus;
  segment: ClientValueSegment;
  visits: number;
  revenue: number;
  ltv: number;
  averageTicket: number;
  visitFrequencyDays: number | null;
  lastVisitAt: string | null;
  daysWithoutReturn: number | null;
  reactivationScore: number;
  estimatedReactivationImpact: number;
  recommendedAction: string;
}

export interface ClientReactivationQueueItem {
  clientId: string;
  fullName: string;
  status: ClientPredictiveStatus;
  daysWithoutReturn: number | null;
  reactivationScore: number;
  estimatedImpact: number;
  recommendedAction: string;
  channelHint: "WHATSAPP" | "PHONE";
}

export interface ClientsOverviewPredictiveSummary {
  active: number;
  atRisk: number;
  warning: number;
  inactive: number;
  vip: number;
  totalRevenue: number;
  averageTicket: number;
  totalClients: number;
  potentialReactivationRevenue: number;
}

export interface ClientsOverviewPayload {
  clients: ClientPredictiveRow[];
  summary: ClientsOverviewPredictiveSummary;
  reactivationQueue: ClientReactivationQueueItem[];
}

export type DashboardSmartAlertType =
  | "FORECAST_DROP"
  | "IDLE_WINDOW"
  | "REACTIVATION_OPPORTUNITY";

export type DashboardSmartAlertSeverity = "LOW" | "MEDIUM" | "HIGH";

export interface DashboardForecast {
  day: number;
  week: number;
  month: number;
  prevDay: number;
  prevWeek: number;
  prevMonth: number;
  deltaDayPct: number;
  deltaWeekPct: number;
  deltaMonthPct: number;
  confidence: number;
  basis: {
    scheduledRevenueDay: number;
    scheduledRevenueWeek: number;
    scheduledRevenueMonth: number;
    historicalConversionRate: number;
    averageTicket: number;
  };
}

export interface DashboardSmartAlert {
  id: string;
  type: DashboardSmartAlertType;
  severity: DashboardSmartAlertSeverity;
  message: string;
  estimatedImpact: number;
  scope?: Record<string, unknown>;
}

export interface DashboardActionSuggestion {
  id: string;
  title: string;
  description: string;
  estimatedImpact: number;
  priorityScore: number;
  actionType: "REACTIVATION_CAMPAIGN" | "FILL_IDLE_SLOTS" | "UPSELL_COMBO";
  ctaLabel?: string;
  ctaModule?: "agenda" | "clientes" | "automacoes" | "operacao";
  actionPayload?: Record<string, unknown>;
}

export type DashboardSuggestionTelemetryOutcome = "EXECUTED" | "IGNORED" | "CONVERTED";

export interface DashboardSuggestionTelemetryEvent {
  id: string;
  unitId: string;
  suggestionId: string;
  actionType: DashboardActionSuggestion["actionType"];
  outcome: DashboardSuggestionTelemetryOutcome;
  estimatedImpact: number;
  realizedRevenue?: number;
  sourceModule?: AutomationSourceModule;
  playbookType?: AutomationPlaybookType;
  note?: string;
  occurredAt: string;
}

export type DashboardPlaybookHistoryStatus = "HEALTHY" | "ATTENTION" | "CRITICAL";

export interface DashboardPlaybookHistoryItem {
  id: string;
  suggestionId: string;
  actionType: DashboardActionSuggestion["actionType"];
  sourceModule?: AutomationSourceModule;
  playbookType?: AutomationPlaybookType;
  totalEvents: number;
  executed: number;
  ignored: number;
  converted: number;
  conversionRate: number;
  estimatedImpactTotal: number;
  realizedRevenueTotal: number;
  netImpact: number;
  status: DashboardPlaybookHistoryStatus;
  lastOutcome: DashboardSuggestionTelemetryOutcome;
  lastOccurredAt: string;
}

export interface DashboardPlaybookHistorySummary {
  windowDays: number;
  totalPlaybooks: number;
  totalEvents: number;
  executed: number;
  ignored: number;
  converted: number;
  estimatedImpactTotal: number;
  realizedRevenueTotal: number;
  netImpact: number;
  conversionRate: number;
}

export interface DashboardPlaybookHistory {
  summary: DashboardPlaybookHistorySummary;
  items: DashboardPlaybookHistoryItem[];
}

export interface DashboardSuggestionTelemetrySummary {
  total: number;
  executed: number;
  ignored: number;
  converted: number;
  conversionRate: number;
  ignoredRate: number;
  estimatedImpactTracked: number;
  realizedRevenue: number;
  netLiftEstimate: number;
  recentEvents: DashboardSuggestionTelemetryEvent[];
}

export interface DashboardThresholdTuning {
  calibrated: boolean;
  confidenceBoost: number;
  adjustments: {
    minSmartAlertImpact: number;
    reactivationMinDays: number;
    forecastDropHighSeverityPct: number;
  };
  rationale: string[];
}

export type GoalPaceStatus = "ABOVE_RHYTHM" | "ON_TRACK" | "BELOW_RHYTHM";

export interface GoalProgressSummary {
  goal: {
    id: string;
    month: number;
    year: number;
    revenueTarget: number;
    appointmentsTarget: number;
    averageTicketTarget: number | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  period: {
    month: number;
    year: number;
    start: string;
    end: string;
  };
  metrics: {
    revenueCurrent: number;
    appointmentsCompleted: number;
    ticketAverageCurrent: number;
    goalProgressPercent: number;
    remainingAmount: number;
    remainingAppointments: number;
    daysTotal: number;
    daysElapsed: number;
    daysRemaining: number;
    requiredRevenuePerDay: number;
    requiredAppointmentsPerDay: number;
    expectedRevenueByNow: number;
    paceStatus: GoalPaceStatus;
  };
  topProfessional: {
    professionalId: string;
    name: string;
    revenue: number;
  } | null;
  topService: {
    serviceId: string;
    name: string;
    revenue: number;
    sharePct: number;
  } | null;
  insights: string[];
}

export interface DashboardPayload {
  appointmentsToday: number;
  completedToday: number;
  cancelledToday: number;
  noShowToday: number;
  revenueToday: number;
  revenueWeek: number;
  revenueMonth: number;
  revenuePrevWeek: number;
  revenuePrevMonth: number;
  profitEstimatedMonth: number;
  ticketAverageOverall: number;
  occupancyRate: number;
  cancellationRate: number;
  noShowRate: number;
  goalMonth: number;
  goalProgress: number;
  topProfessionals: Array<{ name: string; revenue: number; ticketAverage: number }>;
  topServices: Array<{ name: string; count: number; revenue: number }>;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  clientsOverdue: Array<{ id: string; fullName: string; daysWithoutReturn: number }>;
  criticalAlerts: string[];
  lowStock: Array<{ id: string; name: string; stockQty: number }>;
  financialSummary: {
    serviceRevenueMonth: number;
    productRevenueMonth: number;
    expensesMonth: number;
    netCashMonth: number;
    totalCommissionsMonth: number;
  };
  commissionsByProfessional: Array<{
    professionalId: string;
    name: string;
    commission: number;
    produced: number;
  }>;
  professionalPerformance: Array<{
    professionalId: string;
    name: string;
    completed: number;
    total: number;
    revenue: number;
    ticketAverage: number;
    occupancyRate: number;
  }>;
  topClients: Array<{ fullName: string; revenue: number; visits: number }>;
  lostRevenueEstimate: number;
  forecast: DashboardForecast;
  smartAlerts: DashboardSmartAlert[];
  actionSuggestions: DashboardActionSuggestion[];
  suggestionTelemetry: DashboardSuggestionTelemetrySummary;
  playbookHistory: DashboardPlaybookHistory;
  thresholdTuning: DashboardThresholdTuning;
}
