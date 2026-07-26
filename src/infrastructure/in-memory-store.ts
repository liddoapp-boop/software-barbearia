import {
  Appointment,
  AppointmentBlock,
  AppointmentCheckout,
  AppointmentServiceItem,
  AuditEvent,
  BusinessCommissionRule,
  BusinessHour,
  BusinessPaymentMethod,
  BusinessSettings,
  BusinessTeamMember,
  AutomationExecution,
  AutomationRule,
  BillingSubscriptionEvent,
  Client,
  ClientPackage,
  ClientSubscription,
  CommissionEntry,
  CheckoutPayment,
  DailyClosing,
  FinancialEntry,
  IntegrationWebhookLog,
  LoyaltyLedgerEntry,
  LoyaltyProgram,
  MonthlyGoal,
  Product,
  ProductSale,
  Professional,
  Refund,
  RetentionScoreSnapshot,
  RetentionCase,
  RetentionEvent,
  Service,
  ServiceCombinationRule,
  ServicePackage,
  ServiceProfessionalAssignment,
  ServiceStockConsumptionProfile,
  StockMovement,
  StockInventoryCount,
  SubscriptionPlan,
  UUID,
} from "../domain/types";
import type { StockAlertRecord } from "../application/stock-alerts";
import type {
  ReactivationCampaignRecord,
  ReactivationRecipientAuditRecord,
  ReactivationRecipientRecord,
} from "../application/reactivation-campaign";
import {
  CANONICAL_DEMO_PRODUCTS,
  CANONICAL_DEMO_PRODUCT_IDS,
  CANONICAL_DEMO_SERVICE_COMBINATION_RULES,
  CANONICAL_DEMO_SERVICES,
  CANONICAL_DEMO_SERVICE_IDS,
  CANONICAL_DEMO_SERVICE_PROFESSIONAL_ASSIGNMENTS,
} from "./canonical-demo-catalog";

export class InMemoryStore {
  units: Array<{ id: UUID; name: string; timezone: string }> = [
    { id: "unit-01", name: "Barbearia Premium - Centro", timezone: "America/Sao_Paulo" },
    { id: "unit-02", name: "Barbearia Premium - Zona Sul", timezone: "America/Sao_Paulo" },
  ];
  services: Service[] = CANONICAL_DEMO_SERVICES.map((service) => ({ ...service }));
  serviceProfessionalAssignments: ServiceProfessionalAssignment[] =
    CANONICAL_DEMO_SERVICE_PROFESSIONAL_ASSIGNMENTS.map((assignment) => ({ ...assignment }));
  professionals: Professional[] = [
    {
      id: "pro-01",
      businessId: "unit-01",
      name: "Geovane Borges",
      active: true,
      commissionRules: process.env.ENABLE_COMMISSION_TEST_RULES === "true"
        ? [
            {
              id: "rule-pro-01-service",
              appliesTo: "SERVICE",
              percentage: 0.4,
            },
            {
              id: "rule-pro-01-product",
              appliesTo: "PRODUCT",
              percentage: 0.1,
            },
          ]
        : [],
    },
  ];
  businessSettings: BusinessSettings[] = [
    {
      id: "settings-unit-01",
      unitId: "unit-01",
      businessName: "Barbearia Premium - Centro",
      segment: "barbearia",
      phone: "11999999999",
      email: "contato@barbeariapremium.com",
      address: "Rua Central, 100",
      city: "Sao Paulo",
      state: "SP",
      document: "",
      displayName: "Barbearia Premium",
      primaryColor: "#0f172a",
      themeMode: "system",
      defaultAppointmentDuration: 45,
      minimumAdvanceMinutes: 30,
      bufferBetweenAppointmentsMinutes: 0,
      reminderLeadMinutes: 60,
      sendAppointmentReminders: true,
      inactiveCustomerDays: 60,
      atRiskCustomerDays: 30,
      allowWalkIns: true,
      allowOutOfHoursAppointments: false,
      allowOverbooking: false,
      houseCommissionType: "PERCENTAGE",
      houseCommissionValue: 0,
      createdAt: new Date("2026-04-22T00:00:00.000Z"),
      updatedAt: new Date("2026-04-27T00:00:00.000Z"),
    },
  ];
  businessHours: BusinessHour[] = [
    { id: "bh-unit-01-0", unitId: "unit-01", dayOfWeek: 0, opensAt: "", closesAt: "", isClosed: true },
    { id: "bh-unit-01-1", unitId: "unit-01", dayOfWeek: 1, opensAt: "08:00", closesAt: "20:00", isClosed: false },
    { id: "bh-unit-01-2", unitId: "unit-01", dayOfWeek: 2, opensAt: "08:00", closesAt: "20:00", isClosed: false },
    { id: "bh-unit-01-3", unitId: "unit-01", dayOfWeek: 3, opensAt: "08:00", closesAt: "20:00", isClosed: false },
    { id: "bh-unit-01-4", unitId: "unit-01", dayOfWeek: 4, opensAt: "08:00", closesAt: "20:00", isClosed: false },
    { id: "bh-unit-01-5", unitId: "unit-01", dayOfWeek: 5, opensAt: "08:00", closesAt: "20:00", isClosed: false },
    { id: "bh-unit-01-6", unitId: "unit-01", dayOfWeek: 6, opensAt: "08:00", closesAt: "14:00", isClosed: false },
  ];
  businessPaymentMethods: BusinessPaymentMethod[] = [
    { id: "pay-unit-01-cash", unitId: "unit-01", name: "Dinheiro", isActive: true, isDefault: false },
    { id: "pay-unit-01-pix", unitId: "unit-01", name: "Pix", isActive: true, isDefault: true },
    { id: "pay-unit-01-credit", unitId: "unit-01", name: "Cartao de credito", isActive: true, isDefault: false },
    { id: "pay-unit-01-debit", unitId: "unit-01", name: "Cartao de debito", isActive: true, isDefault: false },
  ];
  businessCommissionRules: BusinessCommissionRule[] = [];
  businessTeamMembers: BusinessTeamMember[] = [
    {
      id: "team-unit-01-geovane-owner",
      unitId: "unit-01",
      name: "Geovane Borges",
      role: "OWNER",
      accessProfile: "owner",
      isActive: true,
      createdAt: new Date("2026-04-22T00:00:00.000Z"),
      updatedAt: new Date("2026-04-27T00:00:00.000Z"),
    },
  ];
  clients: Client[] = [
    {
      id: "cli-01",
      businessId: "unit-01",
      fullName: "Joao Santos",
      phone: "11999999999",
      preferredProfessionalId: "pro-01",
      tags: ["RECURRING"],
    },
    {
      id: "cli-02",
      businessId: "unit-01",
      fullName: "Carlos Silva",
      phone: "11888888888",
      tags: ["NEW"],
    },
  ];
  products: Product[] = CANONICAL_DEMO_PRODUCTS.map((product) => ({ ...product }));
  appointments: Appointment[] = [];
  appointmentBlocks: AppointmentBlock[] = [];
  appointmentCheckouts: AppointmentCheckout[] = [];
  checkoutPayments: CheckoutPayment[] = [];
  appointmentServiceItems: AppointmentServiceItem[] = [];
  serviceCombinationRules: ServiceCombinationRule[] = CANONICAL_DEMO_SERVICE_COMBINATION_RULES.map((rule) => ({
    ...rule,
    items: rule.items.map((item) => ({ ...item })),
  }));
  financialEntries: FinancialEntry[] = [];
  commissionEntries: CommissionEntry[] = [];
  productSales: ProductSale[] = [];
  refunds: Refund[] = [];
  stockMovements: StockMovement[] = [];
  stockAlerts: StockAlertRecord[] = [];
  reactivationCampaigns: ReactivationCampaignRecord[] = [];
  reactivationRecipients: ReactivationRecipientRecord[] = [];
  reactivationRecipientAudits: ReactivationRecipientAuditRecord[] = [];
  stockAlertCycleStates = new Map<string, { cycle: number; active: boolean }>();
  aiWhatsappStockEntryPreviews = new Map<string, unknown>();
  inventoryCounts: StockInventoryCount[] = [];
  dailyClosings: DailyClosing[] = [];
  auditEvents: AuditEvent[] = [];
  serviceStockConsumptionProfiles: ServiceStockConsumptionProfile[] = [
    {
      unitId: "unit-01",
      serviceId: CANONICAL_DEMO_SERVICE_IDS.corte,
      updatedAt: new Date("2026-04-26T00:00:00.000Z"),
      items: [
        {
          productId: CANONICAL_DEMO_PRODUCT_IDS.pomada,
          quantityPerService: 0.2,
          wastePct: 5,
          isCritical: true,
        },
      ],
    },
    {
      unitId: "unit-01",
      serviceId: CANONICAL_DEMO_SERVICE_IDS.barba,
      updatedAt: new Date("2026-04-26T00:00:00.000Z"),
      items: [
        {
          productId: CANONICAL_DEMO_PRODUCT_IDS.oleoBarba,
          quantityPerService: 0.15,
          wastePct: 4,
          isCritical: true,
        },
      ],
    },
  ];
  loyaltyPrograms: LoyaltyProgram[] = [
    {
      id: "loyalty-unit-01",
      unitId: "unit-01",
      name: "Fidelidade Premium",
      type: "POINTS",
      conversionRate: 0.1,
      isActive: true,
    },
  ];
  loyaltyLedger: LoyaltyLedgerEntry[] = [];
  servicePackages: ServicePackage[] = [
    {
      id: "pkg-corte-4",
      unitId: "unit-01",
      name: "Pacote Corte 4 sessoes",
      price: 260,
      sessionsTotal: 4,
      sessionsByService: { [CANONICAL_DEMO_SERVICE_IDS.corte]: 4 },
      validityDays: 90,
      isActive: true,
    },
    {
      id: "pkg-barba-4",
      unitId: "unit-01",
      name: "Pacote Barba 4 sessoes",
      price: 190,
      sessionsTotal: 4,
      sessionsByService: { [CANONICAL_DEMO_SERVICE_IDS.barba]: 4 },
      validityDays: 90,
      isActive: true,
    },
  ];
  clientPackages: ClientPackage[] = [];
  subscriptionPlans: SubscriptionPlan[] = [
    {
      id: "sub-gold",
      unitId: "unit-01",
      name: "Assinatura Gold",
      priceMonthly: 149,
      billingDay: 5,
      benefits: ["1 corte premium", "10% produtos"],
      isActive: true,
    },
    {
      id: "sub-black",
      unitId: "unit-01",
      name: "Assinatura Black",
      priceMonthly: 249,
      billingDay: 5,
      benefits: ["2 cortes premium", "1 barba", "15% produtos"],
      isActive: true,
    },
  ];
  clientSubscriptions: ClientSubscription[] = [];
  retentionCases: RetentionCase[] = [];
  retentionEvents: RetentionEvent[] = [];
  automationRules: AutomationRule[] = [
    {
      id: "auto-risk-whatsapp",
      unitId: "unit-01",
      name: "Reativacao clientes de alto risco",
      triggerType: "HIGH_RISK",
      channel: "WHATSAPP",
      target: "SEGMENT",
      messageTemplate: "Sentimos sua falta. Temos uma condicao especial para seu retorno.",
      isActive: true,
      createdBy: "system",
      createdAt: new Date("2026-04-24T00:00:00.000Z"),
      updatedAt: new Date("2026-04-24T00:00:00.000Z"),
    },
  ];
  automationExecutions: AutomationExecution[] = [];
  retentionScoreSnapshots: RetentionScoreSnapshot[] = [];
  integrationWebhookLogs: IntegrationWebhookLog[] = [];
  billingSubscriptionEvents: BillingSubscriptionEvent[] = [];
  monthlyGoals: MonthlyGoal[] = [
    {
      id: "goal-unit-01-2026-04",
      businessId: "unit-01",
      month: 4,
      year: 2026,
      revenueTarget: 20000,
      appointmentsTarget: 260,
      averageTicketTarget: 78,
      notes: "Meta focada em aumentar recorrencia e upsell no atendimento.",
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    },
  ];
}
