import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { AudioTranscriptionService } from "../src/application/audio-transcription";

/**
 * Gate acelerado de 30 dias.
 *
 * Este arquivo e deliberadamente opt-in. Ele nao cria, migra, apaga ou escolhe o
 * banco para o operador: o runner deve fornecer um PostgreSQL local, descartavel,
 * com schema migrado e sem dados de aplicacao, cujo nome contenha `test`,
 * `gate30` (ou `gate_30day`) e a data YYYYMMDD. A unica excecao aceita e removida antes do seed e
 * a Unit `unit-01` inerte criada pela migration 20260523_professional_unit_scope.
 *
 * Exemplo seguro (o provisionamento do banco continua sendo responsabilidade do
 * runner):
 *   RUN_GATE_30DAY=1
 *   TEST_DATABASE_URL=postgresql://.../software_test_gate30_20260722
 *   GATE_EVIDENCE_DIR=.../gate-evidence/20260722
 *   npx vitest run tests/gate-30day-homologation.spec.ts
 */

const RUN_GATE = process.env.RUN_GATE_30DAY === "1";
const suite = RUN_GATE ? describe.sequential : describe.skip;
const DAY_MS = 86_400_000;
const FIXED_SEED = 0x30d2026;
const DEFAULT_ANCHOR = "2026-08-03T11:00:00.000Z";
const MAIN_UNIT_ID = "g30-unit-main";
const SENTINEL_UNIT_ID = "g30-unit-sentinel";
const OWNER_ID = "g30-user-owner";
const RECEPTION_ID = "g30-user-reception";
const OWNER_PHONE = "5511900002400";
const WEBHOOK_SECRET = "gate30-webhook-secret-local-only";
const OWNER_EMAIL = "owner.g30@isolated.invalid";
const RECEPTION_EMAIL = "recepcao.g30@isolated.invalid";
const OWNER_PASSWORD = "Gate30.Owner.Local.2026!";
const RECEPTION_PASSWORD = "Gate30.Reception.Local.2026!";

const PROFESSIONAL_IDS = ["g30-prof-ana", "g30-prof-bruno"] as const;
const SERVICE_IDS = [
  "g30-svc-corte",
  "g30-svc-barba",
  "g30-svc-combo",
  "g30-svc-hidratacao",
  "g30-svc-sobrancelha",
  "g30-svc-pigmentacao",
] as const;
const PRODUCT_IDS = {
  oil: "g30-prd-oleo-barba",
  matte: "g30-prd-pomada-matte",
  mattePremium: "g30-prd-pomada-mate-premium",
  shampoo: "g30-prd-shampoo-mentolado",
  balm: "g30-prd-balm-pos-barba",
  wax: "g30-prd-cera-modeladora",
  blade: "g30-prd-navalha-descartavel",
  talc: "g30-prd-talco-profissional",
  comb: "g30-prd-pente-carbono",
  spray: "g30-prd-spray-fixador",
} as const;

type GateOperation = {
  label: string;
  statusCode?: number;
  outcome: "ok" | "expected_rejection" | "failed";
};

type InjectedResponse = {
  statusCode: number;
  body: string;
  json: <T = any>() => T;
};

type GateDay = {
  day: number;
  virtualDate: string;
  band: string;
  expectedEvents: string[];
  expectedEffects: string[];
  operations: GateOperation[];
  errors: string[];
};

type CapturedMessage = {
  day: number;
  channel: "stock_alert" | "reactivation";
  recipientMasked: string;
  textSha256: string;
  textLength: number;
  simulatedOutcome: string;
  contractValidated?: boolean;
};

type SimulatedInput = {
  day: number;
  event: string;
  messageId: string | null;
  kind: "text" | "audio" | "unknown";
  senderMasked: string;
  contentSha256: string | null;
  contentLength: number | null;
  declaredMediaBytes: number | null;
  durationSeconds: number | null;
};

type CoverageEntry = {
  phase: string;
  requirement: string;
  execution: "harness" | "external_suite" | "external_runner";
  evidence: string;
};

type GateSummary = {
  complete: boolean;
  seed: number;
  anchor: string;
  database: { host: string; name: string } | null;
  migrationBootstrapRemoved: boolean;
  expectedDays: number;
  snapshotsWritten: number;
  operations: Record<string, number>;
  simulatedInputs: number;
  controlledMessages: number;
  mediaDownloadsIntercepted: number;
  realOutboundNetworkCalls: number;
  failures: Array<{ day: number; name: string; recovered: boolean }>;
  reconciliationErrors: string[];
  fatalError: string | null;
  gaps: string[];
};

type Snapshot = {
  day: number;
  virtualTime: string;
  counts: Record<string, number>;
  appointmentStatuses: Record<string, number>;
  stock: Array<{ productId: string; name: string; quantity: number; minimum: number }>;
  finance: {
    incomeEntries: number;
    expenseEntries: number;
    incomeAmount: number;
    expenseAmount: number;
    expectedOperationalIncome: number;
  };
  notifications: {
    stockAlerts: Record<string, number>;
    campaigns: Record<string, number>;
    recipients: Record<string, number>;
  };
  sentinel: Record<string, number>;
  reconciliation: { ok: boolean; errors: string[] };
};

function safeError(error: unknown) {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return raw
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[DATABASE_URL_REDACTED]")
    .replace(/\b55\d{10,11}\b/g, "[PHONE_REDACTED]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [TOKEN_REDACTED]")
    .slice(0, 1_000);
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `(**) *****-${digits.slice(-4)}` : "invalid";
}

function sha256(value: string | Buffer) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function cents(value: number) {
  return Math.round((value + Number.EPSILON) * 100);
}

function addCount(target: Record<string, number>, key: string) {
  target[key] = (target[key] ?? 0) + 1;
}

function dayBand(day: number) {
  if (day <= 5) return "operacao_normal";
  if (day <= 10) return "estoque_whatsapp";
  if (day <= 15) return "alertas_estoque";
  if (day <= 20) return "reativacao";
  if (day <= 24) return "concorrencia_idempotencia";
  if (day <= 27) return "falhas_controladas";
  if (day <= 29) return "regressao_funcional";
  return "fechamento_final";
}

function dailyExpectations(day: number) {
  const commonEffects = [
    "tenant sentinela inalterado",
    "estoque reconciliado por movimentos",
    "financeiro reconciliado por checkouts e vendas",
    "nenhuma duplicidade de idempotencia",
    "auditoria sem segredo, telefone integral ou audio bruto",
  ];
  if (day <= 5) return {
    events: ["agendar", "confirmar", "iniciar", "checkout", "cancelar", "remarcar", "no-show", "vender produto", "consultar agenda/estoque/financeiro", "fechar dia"],
    effects: [...commonEffects, "slot cancelado liberado", "somente atendimentos concluidos geram receita e comissao"],
  };
  if (day <= 10) return {
    events: ["webhook Evolution texto/audio", "previa", "correcao/confirmacao/cancelamento/expiracao", "deduplicacao"],
    effects: [...commonEffects, "nenhuma mutacao antes de CONFIRMAR", "entrada de estoque sem financeiro", "preco de venda somente informativo"],
  };
  if (day <= 15) return {
    events: ["transicao de estoque", "criacao/claim/dispatch de alerta", "falha ou recuperacao controlada"],
    effects: [...commonEffects, "um alerta por tipo e ciclo", "UNCERTAIN sem retry automatico", "claim restrito por unitId"],
  };
  if (day <= 20) return {
    events: ["analise de reativacao", "previa", "CONFIRMAR/CANCELAR", "SAIR", "replay"],
    effects: [...commonEffects, "destinatarios revalidados", "opt-out persistido", "attemptId duravel e sem reenvio de UNCERTAIN"],
  };
  if (day <= 24) return {
    events: ["operacoes concorrentes", "replay", "conflito explicito"],
    effects: [...commonEffects, "uma unica mutacao por chave", "nenhum saldo negativo ou efeito parcial"],
  };
  if (day <= 27) return {
    events: ["falha controlada", "readiness", "reconstrucao do app", "canario pos-recuperacao"],
    effects: [...commonEffects, "falha fechada", "estado pendente/failed/uncertain duravel", "recuperacao sem duplicidade"],
  };
  if (day <= 29) return {
    events: ["login/sessao/logout", "RBAC", "agenda", "checkout", "relatorios", "booking publico", "contratos HTTP"],
    effects: [...commonEffects, "owner-only e tenant guard preservados", "rota legada 410 sem efeito"],
  };
  return {
    events: ["rotina operacional final", "estoque texto/audio e lote", "alerta", "reativacao/SAIR", "restart e replays", "fechamento"],
    effects: [...commonEffects, "reconciliacao final dos 30 dias"],
  };
}

const LITERAL_COVERAGE: CoverageEntry[] = [
  { phase: "0-1", requirement: "PostgreSQL descartavel exclusivo, tenant/unit e seed fixa", execution: "harness", evidence: "safety guard + initial.json" },
  { phase: "0", requirement: "branch, HEAD, origin/main, status, migrations, processos e portas", execution: "external_runner", evidence: "inventario do runner" },
  { phase: "1", requirement: "owner, recepcao, dois profissionais, 40 clientes, seis servicos e dez produtos", execution: "harness", evidence: "initial.json entities" },
  { phase: "1", requirement: "estoques alto/medio/baixo/zero, nomes parecidos, telefones valido/invalido/duplicado/opt-out", execution: "harness", evidence: "seed + initial.json stock" },
  { phase: "1", requirement: "agenda, financeiro, auditoria, campanhas e notificacoes inicialmente zerados", execution: "harness", evidence: "assertInitialOperationalState" },
  { phase: "2", requirement: "webhook oficial Evolution com texto, audio, remoteJid, remoteJidAlt e Long fileLength", execution: "harness", evidence: "stock_canonical_* + stock_batch_audio_preview_long_payload" },
  { phase: "2", requirement: "webhook/audio duplicado, fora de ordem, evento desconhecido, midia invalida e vazia", execution: "harness", evidence: "duplicate_* + out_of_order_* + unknown_evolution_event + invalid/empty_audio_media" },
  { phase: "2", requirement: "audio sem fala, duracao acima do normal e timeout controlado", execution: "harness", evidence: "audio_transcription_no_speech + audio_over_normal_duration + audio_transcription_timeout" },
  { phase: "2", requirement: "Evolution, FFmpeg e Whisper reais e canario allowlisted", execution: "external_runner", evidence: "doctors/canario de infraestrutura" },
  { phase: "3:d1-5", requirement: "todos os dias: agendar, confirmar, iniciar, checkout, cancelar, remarcar e no-show", execution: "harness", evidence: "daily_* operations em cada day-01..05.json" },
  { phase: "3:d1-5", requirement: "todos os dias: metodos de pagamento, venda, agenda, estoque, financeiro e fechamento", execution: "harness", evidence: "product_sale + *_read + daily_closing em cada dia" },
  { phase: "3:d6-10", requirement: "entrada simples/lote por texto e audio; numeros por extenso; cada/por unidade/no total", execution: "harness", evidence: "stock_* preview/confirm days 6-10" },
  { phase: "3:d6-10", requirement: "variantes entrou, entraram e entrando", execution: "harness", evidence: "stock_verb_entrou/entrando + stock_text_preview_each" },
  { phase: "3:d6-10", requirement: "Matte/mate resolve quando inequivoco e ambiguidade no catalogo atual falha fechada", execution: "harness", evidence: "stock_matte_transcribed_mate_unambiguous_preview + stock_matte_mate_ambiguous_in_catalog" },
  { phase: "3:d6-10", requirement: "produto inexistente, ambiguo e produto de outro tenant sem autocriacao", execution: "harness", evidence: "stock_missing/ambiguous/other_tenant_product + product count" },
  { phase: "3:d6-10", requirement: "correcao de quantidade, custo, item especifico, remocao e correcao ambigua", execution: "harness", evidence: "stock_batch_*correction + stock_batch_remove_one_item" },
  { phase: "3:d6-10", requirement: "tentativa de mudar preco de venda falha fechada e preco permanece informativo", execution: "harness", evidence: "stock_sale_price_change_rejected + salePrice assertions" },
  { phase: "3:d6-10", requirement: "CANCELAR, expiracao, CONFIRMAR, replay e deduplicacao", execution: "harness", evidence: "stock_cancel/expired/confirm/replay/duplicate operations" },
  { phase: "3:d6-10", requirement: "nenhuma mutacao pre-confirmacao, lote atomico e nenhuma entrada cria financeiro", execution: "harness", evidence: "stock_batch_atomic_rollback_* + movement/finance deltas" },
  { phase: "3:d11-15", requirement: "limite, abaixo, zero, reset acima do minimo e nova queda", execution: "harness", evidence: "comb exact quantity assertions in cycles 1/2 + talc reset" },
  { phase: "3:d11-15", requirement: "sucesso, falha HTTP, timeout antes/depois, FAILED e UNCERTAIN sem reenvio", execution: "harness", evidence: "controlled-failures.json + alert status waits" },
  { phase: "3:d11-15", requirement: "claim exige unitId, dois dispatchers, claim expirado e finalizacao cross-unit recusada", execution: "harness", evidence: "stock_dispatcher_concurrency_and_tenant_guard + expired claim evidence" },
  { phase: "3:d16-20", requirement: "inativo elegivel; recente/futuro/invalido/opt-out excluidos; cooldown e telefone duplicado", execution: "harness", evidence: "campaign exclusions assertions + duplicate_phone_opt_out" },
  { phase: "3:d16-20", requirement: "previa, CONFIRMAR, CANCELAR, replay, uma campanha aberta, mensagem generica e link publico validado", execution: "harness", evidence: "reactivation_* operations + captured contractValidated" },
  { phase: "3:d16-20", requirement: "PENDING/SENDING/SENT/FAILED/UNCERTAIN/SKIPPED, attemptId e SAIR", execution: "harness", evidence: "PENDING/attemptId antes do envio + SENDING em auditoria + estados terminais persistidos" },
  { phase: "3:d21-24", requirement: "dois checkouts, CONFIRMAR, webhooks, entradas, campanhas, dispatchers e correcoes concorrentes", execution: "harness", evidence: "concurrent_* operations" },
  { phase: "3:d21-24", requirement: "confirmacao expirada, cancelamento pos-confirmacao e replay pos-restart", execution: "harness", evidence: "day24 concurrency_band_expired_confirmation + cancel_after_confirm + stock_replay_after_restart" },
  { phase: "3:d25-27", requirement: "reconstrucao do backend, falhas controladas ASR/Whisper/FFmpeg, readiness e canario", execution: "harness", evidence: "controlled-failures.json + audio_transcription_* operations" },
  { phase: "3:d25-27", requirement: "restart real Evolution/Redis/PostgreSQL, servico semantico, FFmpeg real, webhook, provider, banco app e kill de processo", execution: "external_runner", evidence: "chaos controlado de infraestrutura" },
  { phase: "3:d28-29", requirement: "login, sessao, logout, RBAC, owner-only e contratos 401/403/429/503", execution: "harness", evidence: "day28 regression operations including regression_readiness_contract_503" },
  { phase: "3:d28-29", requirement: "agenda lista/semana, checkout, 410, clientes, PDV, estoque, financeiro, auditoria e booking publico", execution: "harness", evidence: "day-28/29 operations" },
  { phase: "3:d28-29", requirement: "viewports headless mobile/tablet/desktop e overflow", execution: "external_suite", evidence: "suite frontend headless nos tres viewports" },
  { phase: "3:d30", requirement: "rotina completa, estoque audio/lote/correcao, alerta, reativacao/SAIR, restart/replays e fechamento", execution: "harness", evidence: "day-30.json + final.json" },
  { phase: "4", requirement: "reconciliacao diaria de estoque, financeiro, agenda, WhatsApp, auditoria e tenant", execution: "harness", evidence: "30 snapshots day-XX.json" },
  { phase: "5", requirement: "suites nao-DB/PostgreSQL, seguranca, isolamento, idempotencia e concorrencia", execution: "external_suite", evidence: "relatorio consolidado das suites externas" },
  { phase: "5", requirement: "build, diff-check, Prisma validate/generate e doctors oficiais", execution: "external_runner", evidence: "relatorio de comandos e doctors do runner" },
  { phase: "6-7", requirement: "soak real minimo duas horas, telemetria e chaos programado", execution: "external_runner", evidence: "relatorio de soak/chaos" },
];

function assertSafeTarget() {
  const testUrl = process.env.TEST_DATABASE_URL?.trim();
  const defaultUrl = process.env.DATABASE_URL?.trim();
  if (testUrl && defaultUrl && testUrl !== defaultUrl) {
    throw new Error("Gate recusado: TEST_DATABASE_URL e DATABASE_URL divergem.");
  }
  const raw = testUrl || defaultUrl;
  if (!raw) throw new Error("Gate exige TEST_DATABASE_URL (ou DATABASE_URL) para banco exclusivo.");

  const decoded = decodeURIComponent(raw);
  if (/barbearia[_-]?pilot|(^|[^a-z])pilot([^a-z]|$)|production|(^|[^a-z])prod([^a-z]|$)|render|railway/i.test(decoded)) {
    throw new Error("Gate recusou alvo com indicio de piloto/producao.");
  }
  const parsed = new URL(raw);
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(parsed.hostname)) {
    throw new Error("Gate exige PostgreSQL em host local.");
  }
  if (!/test/i.test(name) || !/(gate30|gate_30day)/i.test(name)) {
    throw new Error("Gate exige nome de banco contendo `test` e `gate30`/`gate_30day`.");
  }
  if (!/20\d{6}/.test(name)) {
    throw new Error("Gate exige data YYYYMMDD no nome do banco descartavel.");
  }
  return { raw, host: parsed.hostname, name };
}

function setIsolatedEnvironment(databaseUrl: string) {
  Object.assign(process.env, {
    NODE_ENV: "test",
    TZ: "America/Sao_Paulo",
    DATA_BACKEND: "prisma",
    DATABASE_URL: databaseUrl,
    AUTH_ENFORCED: "true",
    AUTH_SECRET: "gate30-local-auth-secret-with-more-than-thirty-two-characters",
    HTTP_LOG_ENABLED: "false",
    AI_WHATSAPP_ENABLED: "true",
    AI_WHATSAPP_OWNER_PHONE: OWNER_PHONE,
    AI_WHATSAPP_UNIT_ID: MAIN_UNIT_ID,
    AI_WHATSAPP_PENDING_TTL_MS: "60000",
    AI_WHATSAPP_AUDIO_ENABLED: "true",
    AI_AUDIO_TRANSCRIPTION_ENABLED: "true",
    ASR_PROVIDER: "local_whisper",
    EVOLUTION_WEBHOOK_SECRET: WEBHOOK_SECRET,
    EVOLUTION_API_URL: "http://evolution.gate.invalid",
    EVOLUTION_API_KEY: "gate30-intercepted-key",
    EVOLUTION_INSTANCE_NAME: "gate30-instance",
    SERVER_MODE: "isolated",
    ISOLATED_WHATSAPP_OUTBOUND_MODE: "disabled",
    ISOLATED_WHATSAPP_OUTBOUND_ALLOWLIST: "",
    PUBLIC_BOOKING_URL: `https://agenda.example.invalid/agendamento?unitId=${MAIN_UNIT_ID}`,
    REACTIVATION_DEFAULT_RETURN_DAYS: "14",
    REACTIVATION_COOLDOWN_DAYS: "3",
    RATE_LIMIT_LOGIN_MAX: "10000",
    RATE_LIMIT_WHATSAPP_MAX: "10000",
    RATE_LIMIT_AUDIO_MAX: "10000",
    RATE_LIMIT_PUBLIC_WRITE_MAX: "10000",
    RATE_LIMIT_PUBLIC_READ_MAX: "10000",
    RATE_LIMIT_REPORTS_MAX: "10000",
    RATE_LIMIT_AUTHENTICATED_MAX: "10000",
  });
}

function restoreEnvironment(original: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) {
    if (!(key in original)) delete process.env[key];
  }
  Object.assign(process.env, original);
}

async function writeJson(directory: string, fileName: string, value: unknown) {
  await writeFile(path.join(directory, fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function seedGate(db: PrismaClient, passwordHash: (password: string) => string) {
  const migrationBootstrapRemoved = await db.$transaction(async (tx) => {
    const units = await tx.unit.findMany({ orderBy: { id: "asc" } });
    const countNames = [
      "users", "userUnitAccesses", "businessSettings", "monthlyGoals", "businessHours",
      "paymentMethods", "businessCommissionRules", "teamMembers", "services", "professionals",
      "serviceProfessionals", "commissionRules", "clients", "products", "stockAlerts",
      "serviceStockConsumptions", "appointments", "appointmentBlocks", "appointmentCheckouts",
      "checkoutPayments", "stockInventoryCounts", "dailyClosings", "appointmentServiceItems",
      "serviceCombinationRules", "serviceCombinationRuleItems", "appointmentHistory",
      "financialEntries", "commissionEntries", "productSales", "productSaleItems", "refunds",
      "refundItems", "stockMovements", "idempotencyRecords", "auditLogs", "loyaltyPrograms",
      "loyaltyLedger", "servicePackages", "clientPackages", "subscriptionPlans",
      "clientSubscriptions", "retentionCases", "retentionEvents", "automationRules",
      "automationExecutions", "reactivationCampaigns", "reactivationRecipients",
      "reactivationRecipientAudits", "retentionScoreSnapshots", "integrationWebhookLogs",
      "billingSubscriptionEvents",
    ] as const;
    const countValues = await Promise.all([
      tx.user.count(),
      tx.userUnitAccess.count(),
      tx.businessSettings.count(),
      tx.monthlyGoal.count(),
      tx.businessHour.count(),
      tx.paymentMethod.count(),
      tx.businessCommissionRule.count(),
      tx.teamMember.count(),
      tx.service.count(),
      tx.professional.count(),
      tx.serviceProfessional.count(),
      tx.commissionRule.count(),
      tx.client.count(),
      tx.product.count(),
      tx.stockAlert.count(),
      tx.serviceStockConsumption.count(),
      tx.appointment.count(),
      tx.appointmentBlock.count(),
      tx.appointmentCheckout.count(),
      tx.checkoutPayment.count(),
      tx.stockInventoryCount.count(),
      tx.dailyClosing.count(),
      tx.appointmentServiceItem.count(),
      tx.serviceCombinationRule.count(),
      tx.serviceCombinationRuleItem.count(),
      tx.appointmentHistory.count(),
      tx.financialEntry.count(),
      tx.commissionEntry.count(),
      tx.productSale.count(),
      tx.productSaleItem.count(),
      tx.refund.count(),
      tx.refundItem.count(),
      tx.stockMovement.count(),
      tx.idempotencyRecord.count(),
      tx.auditLog.count(),
      tx.loyaltyProgram.count(),
      tx.loyaltyLedger.count(),
      tx.servicePackage.count(),
      tx.clientPackage.count(),
      tx.subscriptionPlan.count(),
      tx.clientSubscription.count(),
      tx.retentionCase.count(),
      tx.retentionEvent.count(),
      tx.automationRule.count(),
      tx.automationExecution.count(),
      tx.reactivationCampaign.count(),
      tx.reactivationCampaignRecipient.count(),
      tx.reactivationRecipientAudit.count(),
      tx.retentionScoreSnapshot.count(),
      tx.integrationWebhookLog.count(),
      tx.billingSubscriptionEvent.count(),
    ]);
    const nonEmpty = countNames
      .map((name, index) => [name, countValues[index] ?? 0] as const)
      .filter(([, count]) => count !== 0);
    if (nonEmpty.length) {
      throw new Error(`Gate exige schema migrado sem dados de aplicacao; encontrados ${nonEmpty.map(([name, count]) => `${name}=${count}`).join(", ")}.`);
    }
    if (units.length === 0) return false;
    const bootstrap = units[0];
    const isExactMigrationBootstrap = units.length === 1
      && bootstrap?.id === "unit-01"
      && bootstrap.name === "Unidade Padrao"
      && bootstrap.timezone === "America/Sao_Paulo";
    if (!isExactMigrationBootstrap) {
      throw new Error(`Gate recusou estado de Unit inesperado: count=${units.length}, ids=${units.map((unit) => unit.id).join(",")}.`);
    }
    await tx.unit.delete({ where: { id: "unit-01" } });
    return true;
  });

  await db.unit.createMany({
    data: [
      { id: MAIN_UNIT_ID, name: "Barbearia Horizonte", timezone: "America/Sao_Paulo" },
      { id: SENTINEL_UNIT_ID, name: "Barbearia Sentinela", timezone: "America/Sao_Paulo" },
    ],
  });
  await db.businessSettings.create({
    data: {
      id: "g30-settings-main",
      unitId: MAIN_UNIT_ID,
      businessName: "Barbearia Horizonte",
      segment: "barbearia",
      defaultAppointmentDuration: 45,
      minimumAdvanceMinutes: 0,
      bufferBetweenAppointmentsMinutes: 0,
      inactiveCustomerDays: 7,
      atRiskCustomerDays: 3,
      allowWalkIns: true,
      allowOutOfHoursAppointments: true,
      allowOverbooking: false,
      houseCommissionType: "PERCENTAGE",
      houseCommissionValue: 40,
    },
  });
  await db.businessHour.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      id: `g30-hour-${dayOfWeek}`,
      unitId: MAIN_UNIT_ID,
      dayOfWeek,
      opensAt: "00:00",
      closesAt: "23:59",
      isClosed: false,
    })),
  });
  await db.paymentMethod.createMany({
    data: ["PIX", "DINHEIRO", "DEBITO", "CREDITO"].map((name, index) => ({
      id: `g30-payment-${index + 1}`,
      unitId: MAIN_UNIT_ID,
      name,
      isActive: true,
      isDefault: index === 0,
    })),
  });
  await db.user.create({
    data: {
      id: OWNER_ID,
      email: OWNER_EMAIL,
      passwordHash: passwordHash(OWNER_PASSWORD),
      name: "Olivia Gestora",
      role: "owner",
      unitAccesses: {
        create: { id: "g30-access-owner", unitId: MAIN_UNIT_ID, role: "owner", isActive: true },
      },
    },
  });
  await db.user.create({
    data: {
      id: RECEPTION_ID,
      email: RECEPTION_EMAIL,
      passwordHash: passwordHash(RECEPTION_PASSWORD),
      name: "Renata Recepcao",
      role: "recepcao",
      unitAccesses: {
        create: { id: "g30-access-reception", unitId: MAIN_UNIT_ID, role: "recepcao", isActive: true },
      },
    },
  });
  await db.teamMember.createMany({
    data: [
      { id: "g30-team-owner", unitId: MAIN_UNIT_ID, name: "Olivia Gestora", role: "owner", accessProfile: "owner", email: OWNER_EMAIL, phone: OWNER_PHONE },
      { id: "g30-team-reception", unitId: MAIN_UNIT_ID, name: "Renata Recepcao", role: "recepcao", accessProfile: "recepcao", email: RECEPTION_EMAIL },
      { id: "g30-team-ana", unitId: MAIN_UNIT_ID, name: "Ana Ribeiro", role: "profissional", accessProfile: "profissional" },
      { id: "g30-team-bruno", unitId: MAIN_UNIT_ID, name: "Bruno Lima", role: "profissional", accessProfile: "profissional" },
    ],
  });
  await db.professional.createMany({
    data: [
      { id: PROFESSIONAL_IDS[0], businessId: MAIN_UNIT_ID, name: "Ana Ribeiro", active: true },
      { id: PROFESSIONAL_IDS[1], businessId: MAIN_UNIT_ID, name: "Bruno Lima", active: true },
    ],
  });
  await db.service.createMany({
    data: [
      { id: SERVICE_IDS[0], businessId: MAIN_UNIT_ID, name: "Corte Classico", category: "CORTE", price: 45, durationMin: 40, defaultCommissionRate: 0.4, costEstimate: 8 },
      { id: SERVICE_IDS[1], businessId: MAIN_UNIT_ID, name: "Barba Terapia", category: "BARBA", price: 35, durationMin: 30, defaultCommissionRate: 0.4, costEstimate: 6 },
      { id: SERVICE_IDS[2], businessId: MAIN_UNIT_ID, name: "Corte e Barba", category: "COMBO", price: 75, durationMin: 65, defaultCommissionRate: 0.4, costEstimate: 13 },
      { id: SERVICE_IDS[3], businessId: MAIN_UNIT_ID, name: "Hidratacao Capilar", category: "TRATAMENTO", price: 30, durationMin: 25, defaultCommissionRate: 0.35, costEstimate: 7 },
      { id: SERVICE_IDS[4], businessId: MAIN_UNIT_ID, name: "Design de Sobrancelha", category: "ESTETICA", price: 20, durationMin: 15, defaultCommissionRate: 0.35, costEstimate: 3 },
      { id: SERVICE_IDS[5], businessId: MAIN_UNIT_ID, name: "Pigmentacao de Barba", category: "BARBA", price: 50, durationMin: 35, defaultCommissionRate: 0.4, costEstimate: 10 },
    ],
  });
  await db.serviceProfessional.createMany({
    data: SERVICE_IDS.flatMap((serviceId) => PROFESSIONAL_IDS.map((professionalId) => ({
      id: `g30-sp-${serviceId.slice(-8)}-${professionalId.slice(-5)}`,
      serviceId,
      professionalId,
    }))),
  });
  await db.commissionRule.createMany({
    data: PROFESSIONAL_IDS.flatMap((professionalId) => [
      { id: `g30-rule-service-${professionalId.slice(-5)}`, professionalId, appliesTo: "SERVICE" as const, percentage: 0.4 },
      { id: `g30-rule-product-${professionalId.slice(-5)}`, professionalId, appliesTo: "PRODUCT" as const, percentage: 0.1 },
    ]),
  });

  await db.client.createMany({
    data: Array.from({ length: 40 }, (_, index) => {
      const ordinal = index + 1;
      const phone = ordinal === 38
        ? "123"
        : ordinal === 39
          ? "551191000037"
          : `55119100${String(ordinal).padStart(4, "0")}`;
      return {
        id: `g30-client-${String(ordinal).padStart(2, "0")}`,
        businessId: MAIN_UNIT_ID,
        fullName: `Cliente Horizonte ${String(ordinal).padStart(2, "0")}`,
        phone,
        whatsappOptOut: ordinal === 40,
        preferredProfessionalId: PROFESSIONAL_IDS[index % PROFESSIONAL_IDS.length],
        tags: ordinal <= 12 ? ["ACTIVE"] : ordinal <= 25 ? ["RECENT"] : ["INACTIVE"],
      };
    }),
  });
  await db.client.create({
    data: {
      id: "g30-sentinel-client",
      businessId: SENTINEL_UNIT_ID,
      fullName: "Cliente Sentinela",
      phone: "5511920000001",
      tags: ["SENTINEL"],
    },
  });

  await db.product.createMany({
    data: [
      { id: PRODUCT_IDS.oil, businessId: MAIN_UNIT_ID, name: "Óleo para Barba", category: "BARBA", salePrice: 39, costPrice: 10, stockQty: 24, minStockAlert: 3 },
      { id: PRODUCT_IDS.matte, businessId: MAIN_UNIT_ID, name: "Pomada Matte", category: "FINALIZADOR", salePrice: 59, costPrice: 18, stockQty: 30, minStockAlert: 4 },
      { id: PRODUCT_IDS.mattePremium, businessId: MAIN_UNIT_ID, name: "Pomada Mate", category: "FINALIZADOR", salePrice: 69, costPrice: 22, stockQty: 8, minStockAlert: 2, active: false },
      { id: PRODUCT_IDS.shampoo, businessId: MAIN_UNIT_ID, name: "Shampoo Mentolado", category: "HIGIENE", salePrice: 45, costPrice: 14, stockQty: 80, minStockAlert: 10 },
      { id: PRODUCT_IDS.balm, businessId: MAIN_UNIT_ID, name: "Balm Pós-Barba", category: "BARBA", salePrice: 42, costPrice: 13, stockQty: 4, minStockAlert: 4 },
      { id: PRODUCT_IDS.wax, businessId: MAIN_UNIT_ID, name: "Cera Modeladora", category: "FINALIZADOR", salePrice: 52, costPrice: 17, stockQty: 2, minStockAlert: 3 },
      { id: PRODUCT_IDS.blade, businessId: MAIN_UNIT_ID, name: "Navalha Descartável", category: "ACESSORIO", salePrice: 8, costPrice: 2, stockQty: 0, minStockAlert: 5 },
      { id: PRODUCT_IDS.talc, businessId: MAIN_UNIT_ID, name: "Talco Profissional", category: "HIGIENE", salePrice: 25, costPrice: 7, stockQty: 12, minStockAlert: 2 },
      { id: PRODUCT_IDS.comb, businessId: MAIN_UNIT_ID, name: "Pente Carbono", category: "ACESSORIO", salePrice: 28, costPrice: 9, stockQty: 6, minStockAlert: 3 },
      { id: PRODUCT_IDS.spray, businessId: MAIN_UNIT_ID, name: "Spray Fixador", category: "FINALIZADOR", salePrice: 48, costPrice: 15, stockQty: 9, minStockAlert: 2 },
      { id: "g30-sentinel-product", businessId: SENTINEL_UNIT_ID, name: "Produto Sentinela", category: "SENTINEL", salePrice: 31, costPrice: 11, stockQty: 9, minStockAlert: 2 },
    ],
  });
  await db.serviceStockConsumption.create({
    data: {
      id: "g30-consumption-shampoo",
      unitId: MAIN_UNIT_ID,
      serviceId: SERVICE_IDS[0],
      productId: PRODUCT_IDS.shampoo,
      quantityPerService: 1,
      wastePct: 0,
      isCritical: true,
    },
  });
  return { migrationBootstrapRemoved };
}

async function assertInitialOperationalState(db: PrismaClient) {
  const counts = {
    appointments: await db.appointment.count(),
    appointmentHistory: await db.appointmentHistory.count(),
    appointmentServiceItems: await db.appointmentServiceItem.count(),
    checkouts: await db.appointmentCheckout.count(),
    payments: await db.checkoutPayment.count(),
    productSales: await db.productSale.count(),
    productSaleItems: await db.productSaleItem.count(),
    stockMovements: await db.stockMovement.count(),
    inventoryCounts: await db.stockInventoryCount.count(),
    stockAlerts: await db.stockAlert.count(),
    financialEntries: await db.financialEntry.count(),
    commissions: await db.commissionEntry.count(),
    refunds: await db.refund.count(),
    dailyClosings: await db.dailyClosing.count(),
    campaigns: await db.reactivationCampaign.count(),
    recipients: await db.reactivationCampaignRecipient.count(),
    recipientAudits: await db.reactivationRecipientAudit.count(),
    idempotencyRecords: await db.idempotencyRecord.count(),
    auditLogs: await db.auditLog.count(),
  };
  expect(Object.values(counts).every((value) => value === 0), JSON.stringify(counts)).toBe(true);
  return counts;
}

function duplicateKeys(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

async function snapshot(
  db: PrismaClient,
  initialStock: Map<string, number>,
  sentinelBaseline: Record<string, number>,
  day: number,
): Promise<Snapshot> {
  const [
    products,
    movements,
    financialEntries,
    checkouts,
    sales,
    appointments,
    commissions,
    alerts,
    campaigns,
    recipients,
    recipientAudits,
    idempotency,
    audits,
  ] = await Promise.all([
    db.product.findMany({ where: { businessId: MAIN_UNIT_ID }, orderBy: { id: "asc" } }),
    db.stockMovement.findMany({ where: { unitId: MAIN_UNIT_ID }, orderBy: { createdAt: "asc" } }),
    db.financialEntry.findMany({ where: { unitId: MAIN_UNIT_ID }, orderBy: { createdAt: "asc" } }),
    db.appointmentCheckout.findMany({ where: { unitId: MAIN_UNIT_ID } }),
    db.productSale.findMany({ where: { unitId: MAIN_UNIT_ID } }),
    db.appointment.findMany({ where: { unitId: MAIN_UNIT_ID }, orderBy: { startsAt: "asc" } }),
    db.commissionEntry.findMany({ where: { unitId: MAIN_UNIT_ID } }),
    db.stockAlert.findMany({ where: { unitId: MAIN_UNIT_ID } }),
    db.reactivationCampaign.findMany({ where: { unitId: MAIN_UNIT_ID } }),
    db.reactivationCampaignRecipient.findMany({ where: { campaign: { unitId: MAIN_UNIT_ID } } }),
    db.reactivationRecipientAudit.findMany({ where: { unitId: MAIN_UNIT_ID } }),
    db.idempotencyRecord.findMany({ where: { unitId: MAIN_UNIT_ID } }),
    db.auditLog.findMany({
      where: { unitId: MAIN_UNIT_ID },
      select: {
        id: true,
        unitId: true,
        actorId: true,
        actorRole: true,
        action: true,
        entity: true,
        route: true,
        method: true,
        requestId: true,
        beforeJson: true,
        afterJson: true,
        metadataJson: true,
      },
    }),
  ]);

  const errors: string[] = [];
  for (const product of products) {
    const expected = movements
      .filter((movement) => movement.productId === product.id)
      .reduce((quantity, movement) => {
        return quantity + (movement.movementType === "IN" ? movement.quantity : -movement.quantity);
      }, initialStock.get(product.id) ?? 0);
    if (product.stockQty !== expected) {
      errors.push(`stock:${product.id}:expected=${expected}:actual=${product.stockQty}`);
    }
    if (product.stockQty < 0) errors.push(`negative_stock:${product.id}:${product.stockQty}`);
  }

  const incomeAmount = financialEntries
    .filter((entry) => entry.kind === "INCOME")
    .reduce((total, entry) => total + Number(entry.amount), 0);
  const expenseAmount = financialEntries
    .filter((entry) => entry.kind === "EXPENSE")
    .reduce((total, entry) => total + Number(entry.amount), 0);
  const expectedOperationalIncome = checkouts
    .filter((checkout) => checkout.status === "PAID")
    .reduce((total, checkout) => total + Number(checkout.totalAmount), 0)
    + sales
      .filter((sale) => sale.appointmentId == null)
      .reduce((total, sale) => total + Number(sale.grossAmount), 0);
  if (cents(incomeAmount) !== cents(expectedOperationalIncome)) {
    errors.push(`finance:expected=${expectedOperationalIncome.toFixed(2)}:actual=${incomeAmount.toFixed(2)}`);
  }
  if (financialEntries.some((entry) => /stock.?entry|entrada.?estoque/i.test(entry.referenceType))) {
    errors.push("stock_entry_created_financial_entry");
  }

  const operationalAppointments = appointments.filter((appointment) => !["CANCELLED", "NO_SHOW"].includes(appointment.status));
  for (let left = 0; left < operationalAppointments.length; left += 1) {
    for (let right = left + 1; right < operationalAppointments.length; right += 1) {
      const a = operationalAppointments[left]!;
      const b = operationalAppointments[right]!;
      const overlaps = a.startsAt < b.endsAt && b.startsAt < a.endsAt;
      if (overlaps && (a.professionalId === b.professionalId || a.clientId === b.clientId)) {
        errors.push(`appointment_conflict:${a.id}:${b.id}`);
      }
    }
  }
  const incompleteCommission = commissions.find((commission) => {
    if (!commission.appointmentId) return false;
    return appointments.find((appointment) => appointment.id === commission.appointmentId)?.status !== "COMPLETED";
  });
  if (incompleteCommission) errors.push(`commission_for_incomplete_appointment:${incompleteCommission.id}`);

  const duplicateIdempotency = duplicateKeys(idempotency.map((item) => `${item.unitId}:${item.action}:${item.idempotencyKey}`));
  const duplicateAlerts = duplicateKeys(alerts.map((item) => `${item.unitId}:${item.productId}:${item.alertType}:${item.cycle}`));
  const duplicateRecipientAttempts = duplicateKeys(recipients.map((item) => item.attemptId));
  if (duplicateIdempotency.length) errors.push("duplicate_idempotency_records");
  if (duplicateAlerts.length) errors.push("duplicate_stock_alerts");
  if (duplicateRecipientAttempts.length) errors.push("duplicate_reactivation_attempt_ids");

  const structurallyInvalidAudit = audits.find((audit) =>
    audit.unitId !== MAIN_UNIT_ID
    || !audit.actorId.trim()
    || !audit.actorRole.trim()
    || !audit.action.trim()
    || !audit.entity.trim()
    || !audit.route.trim()
    || !audit.method.trim()
    || !audit.requestId.trim());
  if (structurallyInvalidAudit) errors.push(`invalid_audit_structure:${structurallyInvalidAudit.id}`);
  const structurallyInvalidRecipientAudit = recipientAudits.find((audit) =>
    audit.unitId !== MAIN_UNIT_ID || !audit.eventKey.trim() || !audit.event.trim());
  if (structurallyInvalidRecipientAudit) errors.push(`invalid_recipient_audit_structure:${structurallyInvalidRecipientAudit.id}`);
  const serializedAudit = JSON.stringify({ audits, recipientAudits });
  if (/\b55\d{10,11}\b|base64|authorization|bearer\s/i.test(serializedAudit)) {
    errors.push("sensitive_material_in_audit");
  }

  const sentinel = {
    products: await db.product.count({ where: { businessId: SENTINEL_UNIT_ID } }),
    productStock: (await db.product.aggregate({ where: { businessId: SENTINEL_UNIT_ID }, _sum: { stockQty: true } }))._sum.stockQty ?? 0,
    clients: await db.client.count({ where: { businessId: SENTINEL_UNIT_ID } }),
    appointments: await db.appointment.count({ where: { unitId: SENTINEL_UNIT_ID } }),
    movements: await db.stockMovement.count({ where: { unitId: SENTINEL_UNIT_ID } }),
    financialEntries: await db.financialEntry.count({ where: { unitId: SENTINEL_UNIT_ID } }),
    alerts: await db.stockAlert.count({ where: { unitId: SENTINEL_UNIT_ID } }),
    campaigns: await db.reactivationCampaign.count({ where: { unitId: SENTINEL_UNIT_ID } }),
    recipients: await db.reactivationCampaignRecipient.count({ where: { campaign: { unitId: SENTINEL_UNIT_ID } } }),
    recipientAudits: await db.reactivationRecipientAudit.count({ where: { unitId: SENTINEL_UNIT_ID } }),
    auditLogs: await db.auditLog.count({ where: { unitId: SENTINEL_UNIT_ID } }),
    idempotencyRecords: await db.idempotencyRecord.count({ where: { unitId: SENTINEL_UNIT_ID } }),
    optedOutClients: await db.client.count({ where: { businessId: SENTINEL_UNIT_ID, whatsappOptOut: true } }),
  };
  if (JSON.stringify(sentinel) !== JSON.stringify(sentinelBaseline)) errors.push("sentinel_tenant_changed");

  const appointmentStatuses: Record<string, number> = {};
  for (const appointment of appointments) addCount(appointmentStatuses, appointment.status);
  const stockAlerts: Record<string, number> = {};
  for (const alert of alerts) addCount(stockAlerts, alert.status);
  const campaignStatuses: Record<string, number> = {};
  for (const campaign of campaigns) addCount(campaignStatuses, campaign.status);
  const recipientStatuses: Record<string, number> = {};
  for (const recipient of recipients) addCount(recipientStatuses, recipient.status);

  return {
    day,
    virtualTime: new Date().toISOString(),
    counts: {
      appointments: appointments.length,
      checkouts: checkouts.length,
      productSales: sales.length,
      stockMovements: movements.length,
      financialEntries: financialEntries.length,
      commissions: commissions.length,
      auditLogs: audits.length,
      recipientAudits: recipientAudits.length,
      idempotencyRecords: idempotency.length,
      dailyClosings: await db.dailyClosing.count({ where: { unitId: MAIN_UNIT_ID } }),
    },
    appointmentStatuses,
    stock: products.map((product) => ({
      productId: product.id,
      name: product.name,
      quantity: product.stockQty,
      minimum: product.minStockAlert,
    })),
    finance: {
      incomeEntries: financialEntries.filter((entry) => entry.kind === "INCOME").length,
      expenseEntries: financialEntries.filter((entry) => entry.kind === "EXPENSE").length,
      incomeAmount: Number(incomeAmount.toFixed(2)),
      expenseAmount: Number(expenseAmount.toFixed(2)),
      expectedOperationalIncome: Number(expectedOperationalIncome.toFixed(2)),
    },
    notifications: { stockAlerts, campaigns: campaignStatuses, recipients: recipientStatuses },
    sentinel,
    reconciliation: { ok: errors.length === 0, errors },
  };
}

function textPayload(text: string, messageId: string, phone = OWNER_PHONE) {
  return {
    event: "messages.upsert",
    instance: "gate30-instance",
    data: {
      key: { id: messageId, remoteJid: `${phone}@s.whatsapp.net`, fromMe: false },
      messageType: "conversation",
      message: { conversation: text },
      messageTimestamp: Math.floor(Date.now() / 1_000),
      source: "android",
    },
  };
}

function audioPayload(messageId: string, fileLength: number, longShape = false, seconds = 5) {
  return {
    event: "messages.upsert",
    instance: "gate30-instance",
    data: {
      key: longShape
        ? {
            id: messageId,
            remoteJid: "123456789012345@lid",
            remoteJidAlt: `${OWNER_PHONE}@s.whatsapp.net`,
            addressingMode: "lid",
            fromMe: false,
          }
        : { id: messageId, remoteJid: `${OWNER_PHONE}@s.whatsapp.net`, fromMe: false },
      messageType: "audioMessage",
      message: {
        audioMessage: {
          mimetype: "audio/ogg; codecs=opus",
          fileLength: longShape ? { low: fileLength, high: 0, unsigned: true } : fileLength,
          seconds,
          ptt: true,
        },
      },
      messageTimestamp: Math.floor(Date.now() / 1_000),
    },
  };
}

suite("GATE FINAL - simulacao acelerada e isolada de 30 dias", () => {
  it("executa 30 dias deterministas, reconcilia diariamente e gera evidencias sanitizadas", async () => {
    const originalEnv = { ...process.env };
    const summary: GateSummary = {
      complete: false,
      seed: FIXED_SEED,
      anchor: process.env.GATE_START_ISO?.trim() || DEFAULT_ANCHOR,
      database: null,
      migrationBootstrapRemoved: false,
      expectedDays: 30,
      snapshotsWritten: 0,
      operations: {},
      simulatedInputs: 0,
      controlledMessages: 0,
      mediaDownloadsIntercepted: 0,
      realOutboundNetworkCalls: 0,
      failures: [],
      reconciliationErrors: [],
      fatalError: null,
      gaps: [
        "Evolution, Redis e PostgreSQL da Evolution reais nao sao iniciados por este spec; payloads oficiais sao injetados no webhook com transporte de midia interceptado.",
        "FFmpeg e Whisper reais nao sao executados: o contrato de AudioTranscriptionService usa transcricoes deterministicas; doctors e canarios reais ficam no gate de infraestrutura.",
        "Reinicio de backend e representado pela reconstrucao completa do Fastify sobre o mesmo PostgreSQL, sem matar processo do Windows.",
        "Falhas de Redis, banco da aplicacao e containers nao sao derrubadas pelo spec; readiness 503, ASR e providers sao exercitados por injecao controlada.",
        "Soak real de duas horas, CPU, memoria, handles, conexoes e chaos de containers pertencem ao runner externo e nao sao simulados como se tivessem ocorrido.",
        "Viewports headless 390x844, 900x1024 e 1440x900 e a suite completa permanecem comandos externos; este harness nao abre navegador.",
        "O ciclo de vida destrutivo do banco (criar/remover) pertence ao runner; este spec exige schema migrado sem dados, aceita apenas o bootstrap inerte unit-01 da migration conhecida e nao executa migrations nem DROP.",
      ],
    };
    const days: GateDay[] = [];
    const snapshots: Snapshot[] = [];
    const messages: CapturedMessage[] = [];
    const simulatedInputs: SimulatedInput[] = [];
    const failureEvidence: Array<{ day: number; name: string; detail: string; recovered: boolean }> = [];
    let currentDay: GateDay | null = null;
    let finalSnapshot: Snapshot | null = null;
    let evidenceDirectory = "";
    let db: PrismaClient | null = null;
    let app: FastifyInstance | null = null;
    let appPrisma: PrismaClient | null = null;
    let thrown: unknown;

    try {
      const target = assertSafeTarget();
      summary.database = { host: target.host, name: target.name };
      const requestedEvidenceDirectory = process.env.GATE_EVIDENCE_DIR?.trim();
      if (!requestedEvidenceDirectory) throw new Error("Gate exige GATE_EVIDENCE_DIR para evidencias locais.");
      evidenceDirectory = path.resolve(requestedEvidenceDirectory);
      await mkdir(evidenceDirectory, { recursive: true });

      const anchor = new Date(summary.anchor);
      if (!Number.isFinite(anchor.getTime())) throw new Error("GATE_START_ISO invalido.");
      summary.anchor = anchor.toISOString();
      setIsolatedEnvironment(target.raw);
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(anchor);

      const audioFixture = await readFile(path.resolve("tests/fixtures/evolution-stock-entry-opus.ogg"));
      const audioQueue: Array<string | Error> = [];
      let mediaDownloadMode: "fixture" | "empty" = "fixture";
      let stockEntryFailureStage: "after_stock" | null = null;
      const audioTranscriptionService: AudioTranscriptionService = {
        transcribe: vi.fn(async () => {
          const next = audioQueue.shift();
          if (next instanceof Error) throw next;
          if (!next) throw new Error("gate30_audio_queue_empty");
          return {
            transcript: next,
            provider: "local_whisper:gate30-controlled",
            diagnostics: { providerCalled: true, durationMs: 1, passCount: 1, vadResult: "speech" as const },
          };
        }),
      };

      vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/chat/getBase64FromMediaMessage/")) {
          summary.mediaDownloadsIntercepted += 1;
          const selectedMode = mediaDownloadMode;
          mediaDownloadMode = "fixture";
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({ base64: selectedMode === "empty" ? "" : audioFixture.toString("base64") }),
          };
        }
        summary.realOutboundNetworkCalls += 1;
        throw new Error(`gate30_blocked_external_fetch:${new URL(url).pathname}`);
      }));

      db = new PrismaClient({ datasources: { db: { url: target.raw } } });
      await db.$queryRaw`SELECT 1`;
      const { hashPassword } = await import("../src/http/security.js");
      const databasePreparation = await seedGate(db, hashPassword);
      summary.migrationBootstrapRemoved = databasePreparation.migrationBootstrapRemoved;
      const initialOperationalCounts = await assertInitialOperationalState(db);
      const initialProducts = await db.product.findMany({ where: { businessId: MAIN_UNIT_ID } });
      const initialStock = new Map(initialProducts.map((product) => [product.id, product.stockQty]));
      const initialSalePrices = new Map(initialProducts.map((product) => [product.id, Number(product.salePrice)]));
      const sentinelBaseline = {
        products: await db.product.count({ where: { businessId: SENTINEL_UNIT_ID } }),
        productStock: (await db.product.aggregate({ where: { businessId: SENTINEL_UNIT_ID }, _sum: { stockQty: true } }))._sum.stockQty ?? 0,
        clients: await db.client.count({ where: { businessId: SENTINEL_UNIT_ID } }),
        appointments: 0,
        movements: 0,
        financialEntries: 0,
        alerts: 0,
        campaigns: 0,
        recipients: 0,
        recipientAudits: 0,
        auditLogs: 0,
        idempotencyRecords: 0,
        optedOutClients: 0,
      };
      await writeJson(evidenceDirectory, "initial.json", {
        seed: FIXED_SEED,
        anchor: summary.anchor,
        unitId: MAIN_UNIT_ID,
        databasePreparation,
        entities: { owners: 1, receptionists: 1, professionals: 2, clients: 40, services: 6, products: 10 },
        operationalCounts: initialOperationalCounts,
        stock: initialProducts.map((product) => ({ id: product.id, name: product.name, quantity: product.stockQty, minimum: product.minStockAlert })),
        sentinel: sentinelBaseline,
      });

      const { createApp } = await import("../src/http/app.js");
      const { prisma: singletonPrisma } = await import("../src/infrastructure/database/prisma.js");
      appPrisma = singletonPrisma;
      const { WhatsappDeliveryError } = await import("../src/notifications/index.js");
      const { AudioTranscriptionError } = await import("../src/application/audio-transcription.js");
      let stockOutcome: "success" | "http_before" | "timeout_before" | "timeout_after" = "success";
      const reactivationOutcomes: Array<"success" | "http" | "timeout"> = [];

      const stockAlertSend = async (phone: string, text: string, attempt?: { onProviderCallStarted: () => Promise<void> }) => {
        const outcome = stockOutcome;
        messages.push({
          day: currentDay?.day ?? 0,
          channel: "stock_alert",
          recipientMasked: maskPhone(phone),
          textSha256: sha256(text),
          textLength: text.length,
          simulatedOutcome: outcome,
        });
        if (outcome === "http_before") throw new WhatsappDeliveryError("http", 503, 1);
        if (outcome === "timeout_before") throw new WhatsappDeliveryError("timeout", undefined, 1);
        await attempt?.onProviderCallStarted();
        if (outcome === "timeout_after") throw new WhatsappDeliveryError("timeout", undefined, 1);
      };
      const reactivationSend = async (phone: string, text: string) => {
        const outcome = reactivationOutcomes.shift() ?? "success";
        const contractValidated = text.includes("Barbearia Horizonte")
          && text.includes(`https://agenda.example.invalid/agendamento?unitId=${MAIN_UNIT_ID}`)
          && text.includes("responda SAIR");
        messages.push({
          day: currentDay?.day ?? 0,
          channel: "reactivation",
          recipientMasked: maskPhone(phone),
          textSha256: sha256(text),
          textLength: text.length,
          simulatedOutcome: outcome,
          contractValidated,
        });
        if (outcome === "http") throw new WhatsappDeliveryError("http", 503, 1);
        if (outcome === "timeout") throw new WhatsappDeliveryError("timeout", undefined, 1);
      };
      const makeApp = (readinessProbe?: () => Promise<void>) => createApp({
        audioTranscriptionService,
        ownerCommandParser: null,
        stockAlertSend,
        stockAlertNow: () => new Date(),
        reactivationSend,
        reactivationNow: () => new Date(),
        readinessProbe,
        stockEntryFailureHook: async (stage) => {
          if (stockEntryFailureStage !== stage) return;
          stockEntryFailureStage = null;
          throw new Error("gate30_batch_atomic_rollback");
        },
      });
      app = makeApp();

      const login = async (email: string, password: string) => {
        const response = await app!.inject({
          method: "POST",
          url: "/auth/login",
          payload: { email, password, activeUnitId: MAIN_UNIT_ID },
        });
        if (response.statusCode !== 200) throw new Error(`login_failed:${email}:${response.statusCode}`);
        return String(response.json().accessToken);
      };
      let ownerToken = "";
      let receptionToken = "";

      const recordOperation = (label: string, statusCode: number | undefined, outcome: GateOperation["outcome"]) => {
        currentDay?.operations.push({ label, statusCode, outcome });
        addCount(summary.operations, label);
      };
      const refreshSessions = async (label: string) => {
        ownerToken = await login(OWNER_EMAIL, OWNER_PASSWORD);
        receptionToken = await login(RECEPTION_EMAIL, RECEPTION_PASSWORD);
        recordOperation(label, 200, "ok");
      };
      const call = async (input: {
        method: "GET" | "POST" | "PATCH";
        url: string;
        payload?: unknown;
        token?: string | null;
        idempotencyKey?: string;
        expected?: number | number[];
        label: string;
      }) => {
        const headers: Record<string, string> = {};
        if (input.token !== null) headers.authorization = `Bearer ${input.token ?? ownerToken}`;
        if (input.idempotencyKey) headers["idempotency-key"] = input.idempotencyKey;
        const response = await app!.inject({
          method: input.method,
          url: input.url,
          headers,
          payload: input.payload as any,
        }) as unknown as InjectedResponse;
        const expected = Array.isArray(input.expected) ? input.expected : [input.expected ?? 200];
        if (!expected.includes(response.statusCode)) {
          recordOperation(input.label, response.statusCode, "failed");
          throw new Error(`${input.label}:status=${response.statusCode}:body=${safeError(response.body)}`);
        }
        recordOperation(input.label, response.statusCode, response.statusCode >= 400 ? "expected_rejection" : "ok");
        return response;
      };
      const webhook = async (payload: Record<string, unknown>, label: string, expected: number | number[] = 200) => {
        const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, any> : {};
        const key = data.key && typeof data.key === "object" ? data.key as Record<string, any> : {};
        const message = data.message && typeof data.message === "object" ? data.message as Record<string, any> : {};
        const audio = message.audioMessage && typeof message.audioMessage === "object"
          ? message.audioMessage as Record<string, any>
          : null;
        const text = typeof message.conversation === "string" ? message.conversation : null;
        const declaredLength = audio?.fileLength;
        const declaredMediaBytes = typeof declaredLength === "number"
          ? declaredLength
          : declaredLength && typeof declaredLength.low === "number" ? declaredLength.low : null;
        const sender = String(key.remoteJidAlt ?? key.remoteJid ?? data.sender ?? "");
        simulatedInputs.push({
          day: currentDay?.day ?? 0,
          event: typeof payload.event === "string" ? payload.event : "unknown",
          messageId: typeof key.id === "string" ? key.id : null,
          kind: audio ? "audio" : text != null ? "text" : "unknown",
          senderMasked: maskPhone(sender),
          contentSha256: text == null ? null : sha256(text),
          contentLength: text?.length ?? null,
          declaredMediaBytes,
          durationSeconds: typeof audio?.seconds === "number" ? audio.seconds : null,
        });
        const response = await app!.inject({
          method: "POST",
          url: "/webhooks/evolution/whatsapp",
          headers: { "x-evolution-webhook-secret": WEBHOOK_SECRET },
          payload,
        });
        const accepted = Array.isArray(expected) ? expected : [expected];
        if (!accepted.includes(response.statusCode)) {
          recordOperation(label, response.statusCode, "failed");
          throw new Error(`${label}:status=${response.statusCode}:body=${safeError(response.body)}`);
        }
        recordOperation(label, response.statusCode, response.statusCode >= 400 ? "expected_rejection" : "ok");
        return response;
      };
      const at = (day: number, hourOffset = 0) => new Date(anchor.getTime() + (day - 1) * DAY_MS + hourOffset * 3_600_000);
      const setClock = (day: number, hourOffset = 0) => vi.setSystemTime(at(day, hourOffset));
      const clientId = (ordinal: number) => `g30-client-${String(ordinal).padStart(2, "0")}`;

      const createAndComplete = async (day: number, ordinal: number, options: {
        concurrent?: boolean;
        product?: string;
        payment?: string;
        startHour?: number;
        completedHour?: number;
      } = {}) => {
        setClock(day, 0);
        const professionalId = PROFESSIONAL_IDS[ordinal % PROFESSIONAL_IDS.length];
        const serviceId = SERVICE_IDS[ordinal % SERVICE_IDS.length];
        const created = await call({
          method: "POST",
          url: "/appointments",
          payload: {
            unitId: MAIN_UNIT_ID,
            clientId: clientId(ordinal),
            professionalId,
            serviceId,
            startsAt: at(day, options.startHour ?? 1 + (ordinal % 2) * 2).toISOString(),
            changedBy: OWNER_ID,
          },
          label: "appointment_create",
        });
        const appointmentId = String(created.json().appointment.id);
        await call({
          method: "PATCH",
          url: `/appointments/${appointmentId}/status`,
          payload: { status: "CONFIRMED", changedBy: OWNER_ID },
          idempotencyKey: `g30-d${day}-a${ordinal}-confirmed`,
          label: "appointment_confirm",
        });
        await call({
          method: "PATCH",
          url: `/appointments/${appointmentId}/status`,
          payload: { status: "IN_SERVICE", changedBy: OWNER_ID },
          idempotencyKey: `g30-d${day}-a${ordinal}-service`,
          label: "appointment_start",
        });
        const checkoutPayload = {
          changedBy: OWNER_ID,
          completedAt: at(day, options.completedHour ?? 5).toISOString(),
          paymentMethod: options.payment ?? ["PIX", "CASH", "DEBIT", "CREDIT"][day % 4],
          products: options.product ? [{ productId: options.product, quantity: 1 }] : undefined,
        };
        const request = () => call({
          method: "POST",
          url: `/appointments/${appointmentId}/checkout`,
          payload: checkoutPayload,
          idempotencyKey: `g30-d${day}-a${ordinal}-checkout`,
          label: "appointment_checkout",
        });
        if (options.concurrent) {
          const before = await db!.financialEntry.count({ where: { unitId: MAIN_UNIT_ID, referenceId: appointmentId } });
          const responses = await Promise.all([request(), request()]);
          expect(responses.every((response) => response.statusCode === 200)).toBe(true);
          const after = await db!.financialEntry.count({ where: { unitId: MAIN_UNIT_ID, referenceId: appointmentId } });
          expect(after - before).toBe(1);
        } else {
          await request();
        }
        return { appointmentId, checkoutPayload };
      };

      const productSale = async (day: number, ordinal: number, concurrent = false) => {
        const payload = {
          unitId: MAIN_UNIT_ID,
          clientId: clientId(ordinal),
          professionalId: PROFESSIONAL_IDS[ordinal % 2],
          paymentMethod: ["PIX", "CASH", "DEBIT", "CREDIT"][day % 4],
          soldAt: at(day, 7).toISOString(),
          items: [{ productId: PRODUCT_IDS.oil, quantity: 1 }],
        };
        const request = () => call({
          method: "POST",
          url: "/sales/products",
          payload,
          idempotencyKey: `g30-d${day}-sale-${ordinal}`,
          label: "product_sale",
        });
        if (!concurrent) return await request();
        const persistedIdempotencyKey = `PRODUCT_SALE_CREATE:g30-d${day}-sale-${ordinal}`;
        const before = await db!.productSale.count({ where: { unitId: MAIN_UNIT_ID, idempotencyKey: persistedIdempotencyKey } });
        const responses = await Promise.all([request(), request()]);
        expect(responses.every((response) => response.statusCode === 200)).toBe(true);
        const after = await db!.productSale.count({ where: { unitId: MAIN_UNIT_ID, idempotencyKey: persistedIdempotencyKey } });
        expect(after - before).toBe(1);
        return responses[0]!;
      };

      const manualStock = async (day: number, productId: string, movementType: "IN" | "OUT" | "LOSS" | "INTERNAL_USE", quantity: number, suffix: string) => {
        return await call({
          method: "POST",
          url: "/stock/movements/manual",
          payload: {
            unitId: MAIN_UNIT_ID,
            productId,
            movementType,
            quantity,
            reason: `Movimento controlado dia ${day}`,
            responsible: OWNER_ID,
            occurredAt: new Date().toISOString(),
            referenceType: "ADJUSTMENT",
            referenceId: `g30-${day}-${suffix}`,
            changedBy: OWNER_ID,
          },
          idempotencyKey: `g30-d${day}-stock-${suffix}`,
          label: "manual_stock_movement",
        });
      };

      const waitForLatestStockAlert = async (input: {
        productId: string;
        alertType: "LOW_STOCK" | "OUT_OF_STOCK";
        status: "SENT" | "FAILED" | "UNCERTAIN";
        label: string;
      }) => {
        let latest: Awaited<ReturnType<PrismaClient["stockAlert"]["findFirst"]>> = null;
        for (let attempt = 0; attempt < 200; attempt += 1) {
          latest = await db!.stockAlert.findFirst({
            where: {
              unitId: MAIN_UNIT_ID,
              productId: input.productId,
              alertType: input.alertType,
            },
            orderBy: [{ cycle: "desc" }, { createdAt: "desc" }],
          });
          if (latest?.status === input.status) {
            recordOperation(input.label, undefined, "ok");
            return latest;
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 25));
        }
        throw new Error(`${input.label}:timeout:expected=${input.status}:actual=${latest?.status ?? "missing"}`);
      };

      const exerciseDailyAppointmentExceptions = async (day: number) => {
        setClock(day, 0);
        const cancelled = await call({
          method: "POST",
          url: "/appointments",
          payload: {
            unitId: MAIN_UNIT_ID,
            clientId: clientId(10 + day),
            professionalId: PROFESSIONAL_IDS[0],
            serviceId: SERVICE_IDS[1],
            startsAt: at(day, 8).toISOString(),
            changedBy: RECEPTION_ID,
          },
          token: receptionToken,
          label: "daily_appointment_create_for_cancel",
        });
        await call({
          method: "PATCH",
          url: `/appointments/${cancelled.json().appointment.id}/status`,
          payload: { status: "CANCELLED", reason: `Cancelamento operacional dia ${day}`, changedBy: RECEPTION_ID },
          token: receptionToken,
          idempotencyKey: `g30-d${day}-daily-cancel`,
          label: "daily_appointment_cancel",
        });

        const rescheduled = await call({
          method: "POST",
          url: "/appointments",
          payload: {
            unitId: MAIN_UNIT_ID,
            clientId: clientId(15 + day),
            professionalId: PROFESSIONAL_IDS[1],
            serviceId: SERVICE_IDS[2],
            startsAt: at(day, 10).toISOString(),
            changedBy: OWNER_ID,
          },
          label: "daily_appointment_create_for_reschedule",
        });
        await call({
          method: "PATCH",
          url: `/appointments/${rescheduled.json().appointment.id}/reschedule`,
          payload: { startsAt: at(day, 12).toISOString(), changedBy: OWNER_ID },
          idempotencyKey: `g30-d${day}-daily-reschedule`,
          label: "daily_appointment_reschedule",
        });
        await call({
          method: "PATCH",
          url: `/appointments/${rescheduled.json().appointment.id}/status`,
          payload: { status: "CANCELLED", reason: `Encerramento do cenario de remarcacao dia ${day}`, changedBy: OWNER_ID },
          idempotencyKey: `g30-d${day}-daily-reschedule-cancel`,
          label: "daily_rescheduled_appointment_cancel",
        });

        const noShow = await call({
          method: "POST",
          url: "/appointments",
          payload: {
            unitId: MAIN_UNIT_ID,
            clientId: clientId(20 + day),
            professionalId: PROFESSIONAL_IDS[0],
            serviceId: SERVICE_IDS[3],
            startsAt: at(day, 14).toISOString(),
            changedBy: OWNER_ID,
          },
          label: "daily_appointment_create_for_no_show",
        });
        await call({
          method: "PATCH",
          url: `/appointments/${noShow.json().appointment.id}/status`,
          payload: { status: "CONFIRMED", changedBy: OWNER_ID },
          idempotencyKey: `g30-d${day}-daily-no-show-confirm`,
          label: "daily_no_show_appointment_confirm",
        });
        setClock(day, 18);
        await refreshSessions("session_refresh_after_daily_no_show_time_jump");
        await call({
          method: "PATCH",
          url: `/appointments/${noShow.json().appointment.id}/status`,
          payload: { status: "NO_SHOW", reason: `Tentativa sem privilegio dia ${day}`, changedBy: RECEPTION_ID },
          token: receptionToken,
          idempotencyKey: `g30-d${day}-daily-no-show-reception-denied`,
          expected: 403,
          label: "daily_no_show_owner_only_rejected",
        });
        await call({
          method: "PATCH",
          url: `/appointments/${noShow.json().appointment.id}/status`,
          payload: { status: "NO_SHOW", reason: `Cliente nao compareceu no dia ${day}`, changedBy: OWNER_ID },
          idempotencyKey: `g30-d${day}-daily-no-show`,
          label: "daily_appointment_no_show",
        });
      };

      const closeDay = async (day: number) => {
        setClock(day, 20);
        await refreshSessions("session_refresh_before_daily_closing");
        await call({
          method: "POST",
          url: "/financial/daily-closing",
          payload: {
            unitId: MAIN_UNIT_ID,
            businessDate: at(day).toISOString().slice(0, 10),
            responsible: OWNER_ID,
            notes: `Fechamento controlado do dia ${day}`,
          },
          idempotencyKey: `g30-d${day}-closing`,
          label: "daily_closing",
        });
      };

      for (let day = 1; day <= 30; day += 1) {
        setClock(day, 0);
        const expected = dailyExpectations(day);
        currentDay = {
          day,
          virtualDate: new Date().toISOString(),
          band: dayBand(day),
          expectedEvents: expected.events,
          expectedEffects: expected.effects,
          operations: [],
          errors: [],
        };
        days.push(currentDay);
        try {
          await refreshSessions("daily_session_refresh");
          const auditCountBeforeDay = await db.auditLog.count({ where: { unitId: MAIN_UNIT_ID } });
          const auditActionsBefore = day <= 5
            ? new Map((await db.auditLog.groupBy({
                by: ["action"],
                where: { unitId: MAIN_UNIT_ID },
                _count: { _all: true },
              })).map((item) => [item.action, item._count._all]))
            : null;
          const stockFinancialEntriesBefore = day >= 6 && day <= 10
            ? await db.financialEntry.count({ where: { unitId: MAIN_UNIT_ID } })
            : null;
          if (day <= 5) {
            await createAndComplete(day, day, { product: day % 2 === 0 ? PRODUCT_IDS.matte : undefined });
            if (day === 3) {
              await createAndComplete(day, 37, { startHour: 6, completedHour: 7 });
              await createAndComplete(day, 39, { startHour: 8, completedHour: 9 });
            }
            if (day === 4) await createAndComplete(day, 38, { startHour: 6, completedHour: 7 });
            if (day === 5) await createAndComplete(day, 40, { startHour: 6, completedHour: 7 });
            await productSale(day, day);
            await exerciseDailyAppointmentExceptions(day);
            const start = at(day, -1).toISOString();
            const end = at(day, 23).toISOString();
            await call({ method: "GET", url: `/appointments?unitId=${MAIN_UNIT_ID}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, label: "agenda_read" });
            await call({ method: "GET", url: `/stock/overview?unitId=${MAIN_UNIT_ID}`, label: "stock_read" });
            await call({ method: "GET", url: `/financial/transactions?unitId=${MAIN_UNIT_ID}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, label: "financial_read" });
          } else if (day === 6) {
            const before = await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } });
            const priceBefore = Number((await db.product.findUniqueOrThrow({ where: { id: PRODUCT_IDS.oil } })).salePrice);
            const preview = await webhook(textPayload("Entraram duas unidades de Óleo para Barba no estoque, por sete reais cada.", "g30-d6-stock-text"), "stock_text_preview_each");
            expect(preview.json()).toMatchObject({ executed: false, preview: { quantity: 2, unitCost: 7, totalCost: 14, salePrice: 39 } });
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(before);
            const confirmed = await webhook(textPayload("CONFIRMAR", "g30-d6-confirm"), "stock_confirm");
            const confirmationReplay = await webhook(textPayload("CONFIRMAR", "g30-d6-confirm-replay"), "stock_confirm_replay");
            expect(confirmed.json()).toMatchObject({ executed: true, replay: false });
            expect(confirmationReplay.json()).toMatchObject({ executed: true, replay: true });
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(before + 1);
            expect(Number((await db.product.findUniqueOrThrow({ where: { id: PRODUCT_IDS.oil } })).salePrice)).toBe(priceBefore);
            for (const [variant, phrase] of [
              ["entrou", "Entrou uma unidade de Óleo para Barba no estoque, por sete reais cada."],
              ["entrando", "Entrando uma unidade de Óleo para Barba no estoque por sete reais cada."],
            ] as const) {
              const movementCount = await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } });
              const variantPreview = await webhook(textPayload(phrase, `g30-d6-${variant}`), `stock_verb_${variant}_preview`);
              expect(variantPreview.json()).toMatchObject({ executed: false, preview: { quantity: 1, unitCost: 7, totalCost: 7 } });
              expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(movementCount);
              await webhook(textPayload("CANCELAR", `g30-d6-${variant}-cancel`), `stock_verb_${variant}_cancel`);
              expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(movementCount);
            }
          } else if (day === 7) {
            const before = await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } });
            const text = "Entraram duas unidades de Óleo para Barba no estoque, por sete reais por unidade.";
            const first = await webhook(textPayload(text, "g30-d7-canonical-text"), "stock_canonical_text_preview");
            const textPreview = first.json().preview;
            await webhook(textPayload("CANCELAR", "g30-d7-canonical-cancel"), "stock_cancel");
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(before);
            audioQueue.push(text);
            const transcribeMock = vi.mocked(audioTranscriptionService.transcribe);
            const transcriptionCallsBefore = transcribeMock.mock.calls.length;
            const mediaDownloadsBefore = summary.mediaDownloadsIntercepted;
            const duplicateAudioPayload = audioPayload("g30-d7-canonical-audio", audioFixture.length);
            const audio = await webhook(duplicateAudioPayload, "stock_canonical_audio_preview");
            const audioReplay = await webhook(duplicateAudioPayload, "stock_canonical_audio_duplicate");
            expect(audio.json().preview).toEqual(textPreview);
            expect(audioReplay.json()).toMatchObject({ replay: true, deduplicated: true, executed: false });
            expect(transcribeMock.mock.calls.length - transcriptionCallsBefore).toBe(1);
            expect(summary.mediaDownloadsIntercepted - mediaDownloadsBefore).toBe(1);
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(before);
            await webhook(textPayload("CONFIRMAR", "g30-d7-canonical-confirm"), "stock_confirm");
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(before + 1);
          } else if (day === 8) {
            const before = await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } });
            const salePricesBefore = new Map((await db.product.findMany({
              where: { id: { in: [PRODUCT_IDS.matte, PRODUCT_IDS.oil] } },
            })).map((product) => [product.id, Number(product.salePrice)]));
            const preview = await webhook(textPayload(
              "Comprei 2 Pomadas Matte por 5 reais cada e 3 Óleos para Barba por 8 reais cada.",
              "g30-d8-batch-text",
            ), "stock_batch_text_preview");
            expect(preview.json()).toMatchObject({ executed: false, preview: { totalCost: 34 } });
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(before);
            const ambiguousCorrection = await webhook(textPayload("Na verdade, são 4.", "g30-d8-batch-ambiguous-correction"), "stock_batch_ambiguous_correction");
            expect(ambiguousCorrection.json()).toMatchObject({ executed: false });
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(before);
            const salePriceAttempt = await webhook(textPayload("Na verdade, o preço de venda da pomada é 99 reais.", "g30-d8-sale-price-attempt"), "stock_sale_price_change_rejected");
            expect(salePriceAttempt.json()).toMatchObject({ executed: false });
            expect(Number((await db.product.findUniqueOrThrow({ where: { id: PRODUCT_IDS.matte } })).salePrice)).toBe(salePricesBefore.get(PRODUCT_IDS.matte));
            const quantityCorrection = await webhook(textPayload("Na verdade, são 4 óleos.", "g30-d8-batch-quantity-correction"), "stock_batch_quantity_correction");
            expect(quantityCorrection.json()).toMatchObject({
              corrected: true,
              preview: {
                items: [
                  { productId: PRODUCT_IDS.matte, quantity: 2, unitCost: 5, totalCost: 10 },
                  { productId: PRODUCT_IDS.oil, quantity: 4, unitCost: 8, totalCost: 32 },
                ],
                totalCost: 42,
              },
            });
            const costCorrection = await webhook(textPayload("O custo da pomada é 6 reais.", "g30-d8-batch-cost-correction"), "stock_batch_cost_correction");
            expect(costCorrection.json()).toMatchObject({
              executed: false,
              corrected: true,
              preview: {
                items: [
                  { productId: PRODUCT_IDS.matte, quantity: 2, unitCost: 6, totalCost: 12 },
                  { productId: PRODUCT_IDS.oil, quantity: 4, unitCost: 8, totalCost: 32 },
                ],
                totalCost: 44,
              },
            });
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(before);
            const batchConfirmation = await webhook(textPayload("CONFIRMAR", "g30-d8-batch-confirm"), "stock_batch_confirm");
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(before + 2);
            const batchMovements = await db.stockMovement.findMany({
              where: { referenceType: "STOCK_ENTRY", referenceId: batchConfirmation.json().operationId },
              orderBy: { productId: "asc" },
            });
            expect(batchMovements.map((movement) => ({
              productId: movement.productId,
              quantity: movement.quantity,
              unitCost: Number(movement.unitCost),
              totalCost: Number(movement.totalCost),
            }))).toEqual([
              { productId: PRODUCT_IDS.oil, quantity: 4, unitCost: 8, totalCost: 32 },
              { productId: PRODUCT_IDS.matte, quantity: 2, unitCost: 6, totalCost: 12 },
            ]);
            for (const [productId, expectedSalePrice] of salePricesBefore) {
              expect(Number((await db.product.findUniqueOrThrow({ where: { id: productId } })).salePrice)).toBe(expectedSalePrice);
            }
          } else if (day === 9) {
            const transcript = "Comprei 2 Shampoo Mentolado por 6 reais cada e 3 Balm Pós-Barba por 7 reais cada.";
            audioQueue.push(transcript);
            const before = await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } });
            const preview = await webhook(audioPayload("g30-d9-batch-audio-long", audioFixture.length, true), "stock_batch_audio_preview_long_payload");
            expect(preview.json()).toMatchObject({ audio: true, executed: false });
            await webhook(textPayload("CANCELAR", "g30-d9-batch-audio-cancel"), "stock_batch_cancel");
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(before);
            await webhook(textPayload(
              "Comprei 2 Pomadas Matte por 5 reais cada e 3 Óleos para Barba por 8 reais cada.",
              "g30-d9-batch-remove-base",
            ), "stock_batch_preview_for_removal");
            const removed = await webhook(textPayload("Retira o óleo dessa entrada.", "g30-d9-batch-remove-oil"), "stock_batch_remove_one_item");
            expect(removed.json()).toMatchObject({
              executed: false,
              corrected: true,
              preview: {
                items: [{ productId: PRODUCT_IDS.matte, quantity: 2, unitCost: 5, totalCost: 10 }],
                totalCost: 10,
              },
            });
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(before);
            const removalConfirmation = await webhook(textPayload("CONFIRMAR", "g30-d9-batch-remove-confirm"), "stock_batch_after_removal_confirm");
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(before + 1);
            const removalMovements = await db.stockMovement.findMany({
              where: { referenceType: "STOCK_ENTRY", referenceId: removalConfirmation.json().operationId },
            });
            expect(removalMovements.map((movement) => ({
              productId: movement.productId,
              quantity: movement.quantity,
              unitCost: Number(movement.unitCost),
              totalCost: Number(movement.totalCost),
            }))).toEqual([{ productId: PRODUCT_IDS.matte, quantity: 2, unitCost: 5, totalCost: 10 }]);
            const totalPreview = await webhook(textPayload("Entraram duas unidades de Óleo para Barba no estoque, por quatorze reais no total.", "g30-d9-total"), "stock_total_preview");
            expect(totalPreview.json()).toMatchObject({ preview: { quantity: 2, unitCost: 7, totalCost: 14 } });
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(before + 1);
            await webhook(textPayload("CONFIRMAR", "g30-d9-total-confirm"), "stock_confirm");
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(before + 2);

            const rollbackProductsBefore = new Map((await db.product.findMany({
              where: { id: { in: [PRODUCT_IDS.shampoo, PRODUCT_IDS.balm] } },
            })).map((product) => [product.id, product.stockQty]));
            const rollbackMovementCount = await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } });
            await webhook(textPayload(
              "Comprei 2 Shampoo Mentolado por 6 reais cada e 3 Balm Pós-Barba por 7 reais cada.",
              "g30-d9-atomic-rollback-preview",
            ), "stock_batch_atomic_rollback_preview");
            stockEntryFailureStage = "after_stock";
            const rolledBack = await webhook(textPayload("CONFIRMAR", "g30-d9-atomic-rollback-confirm"), "stock_batch_atomic_rollback_confirm");
            expect(rolledBack.json()).toMatchObject({ executed: false, unavailable: true });
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(rollbackMovementCount);
            const rollbackProductsAfter = await db.product.findMany({
              where: { id: { in: [PRODUCT_IDS.shampoo, PRODUCT_IDS.balm] } },
            });
            expect(rollbackProductsAfter.every((product) => product.stockQty === rollbackProductsBefore.get(product.id))).toBe(true);
            await webhook(textPayload("CANCELAR", "g30-d9-atomic-rollback-cancel"), "stock_batch_atomic_rollback_cancel");
          } else if (day === 10) {
            const before = await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } });
            const productCountBefore = await db.product.count({ where: { businessId: MAIN_UNIT_ID } });
            const sentinelStockBefore = (await db.product.findUniqueOrThrow({ where: { id: "g30-sentinel-product" } })).stockQty;
            const ambiguous = await webhook(textPayload("Entraram duas unidades de Óleo para Barba no estoque, por sete reais.", "g30-d10-ambiguous"), "stock_ambiguous_value");
            expect(ambiguous.json()).toMatchObject({ executed: false, clarification: true, reason: "cost_ambiguous" });
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(before);
            await webhook(textPayload("CANCELAR", "g30-d10-clear-ambiguous"), "stock_cancel", [200, 409]);
            await db.product.update({ where: { id: PRODUCT_IDS.mattePremium }, data: { active: true } });
            const ambiguousProduct = await webhook(textPayload("Entraram duas pomadas mate no estoque por cinco reais cada.", "g30-d10-ambiguous-product"), "stock_matte_mate_ambiguous_in_catalog");
            expect(ambiguousProduct.json()).toMatchObject({ executed: false, clarification: true, reason: "product_ambiguous" });
            await db.product.update({ where: { id: PRODUCT_IDS.mattePremium }, data: { active: false } });
            try {
              const unambiguousMate = await webhook(textPayload(
                "Entraram duas pomadas mate no estoque por cinco reais cada.",
                "g30-d10-unambiguous-mate",
              ), "stock_matte_transcribed_mate_unambiguous_preview");
              expect(unambiguousMate.json()).toMatchObject({
                executed: false,
                preview: {
                  productId: PRODUCT_IDS.matte,
                  productName: "Pomada Matte",
                  quantity: 2,
                  unitCost: 5,
                  totalCost: 10,
                },
              });
              expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(before);
              await webhook(textPayload("CANCELAR", "g30-d10-unambiguous-mate-cancel"), "stock_matte_transcribed_mate_cancel");
            } finally {
              await db.product.update({ where: { id: PRODUCT_IDS.mattePremium }, data: { active: false } });
            }
            const nonexistent = await webhook(textPayload("Entraram duas unidades de Produto Lunar por cinco reais cada.", "g30-d10-missing-product"), "stock_missing_product");
            expect(nonexistent.json()).toMatchObject({ executed: false, clarification: true, reason: "product_not_found" });
            const otherTenant = await webhook(textPayload("Entraram duas unidades de Produto Sentinela por cinco reais cada.", "g30-d10-other-tenant-product"), "stock_other_tenant_product_rejected");
            expect(otherTenant.json()).toMatchObject({ executed: false, clarification: true, reason: "product_not_found" });
            expect((await db.product.findUniqueOrThrow({ where: { id: "g30-sentinel-product" } })).stockQty).toBe(sentinelStockBefore);
            expect(await db.product.count({ where: { businessId: MAIN_UNIT_ID } })).toBe(productCountBefore);
            const expiringPreview = await webhook(textPayload("Entraram duas unidades de Óleo para Barba no estoque, por sete reais cada.", "g30-d10-expiring-preview"), "stock_expiring_preview");
            expect(expiringPreview.json()).toMatchObject({
              executed: false,
              preview: { productId: PRODUCT_IDS.oil, quantity: 2, unitCost: 7, totalCost: 14 },
            });
            setClock(day, 0.1);
            const expired = await webhook(textPayload("CONFIRMAR", "g30-d10-expired-confirm"), "stock_expired_confirm");
            expect(expired.json()).toMatchObject({ executed: false, expired: true, intent: "stock_entry" });
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(before);
            expect(await db.auditLog.count({
              where: { unitId: MAIN_UNIT_ID, action: "AI_WHATSAPP_STOCK_ENTRY_PREVIEW_EXPIRED" },
            })).toBeGreaterThanOrEqual(1);
          } else if (day === 11) {
            stockOutcome = "success";
            await manualStock(day, PRODUCT_IDS.comb, "OUT", 3, "comb-low-cycle1");
            await waitForLatestStockAlert({
              productId: PRODUCT_IDS.comb,
              alertType: "LOW_STOCK",
              status: "SENT",
              label: "wait_stock_alert_low_sent",
            });
            const combAtMinimum = await db.product.findUniqueOrThrow({ where: { id: PRODUCT_IDS.comb } });
            expect(combAtMinimum.stockQty).toBe(combAtMinimum.minStockAlert);
            expect(await db.stockAlert.count({ where: { unitId: MAIN_UNIT_ID, productId: PRODUCT_IDS.comb, alertType: "LOW_STOCK" } })).toBe(1);
            const messagesBeforeQuery = messages.filter((message) => message.channel === "stock_alert").length;
            await call({ method: "GET", url: `/stock/overview?unitId=${MAIN_UNIT_ID}`, label: "stock_alert_query_does_not_redispatch" });
            expect(await db.stockAlert.count({ where: { unitId: MAIN_UNIT_ID, productId: PRODUCT_IDS.comb, alertType: "LOW_STOCK" } })).toBe(1);
            expect(messages.filter((message) => message.channel === "stock_alert")).toHaveLength(messagesBeforeQuery);
          } else if (day === 12) {
            stockOutcome = "timeout_before";
            await manualStock(day, PRODUCT_IDS.comb, "OUT", 3, "comb-zero-cycle1");
            await waitForLatestStockAlert({
              productId: PRODUCT_IDS.comb,
              alertType: "OUT_OF_STOCK",
              status: "FAILED",
              label: "wait_stock_alert_out_failed",
            });
            expect((await db.product.findUniqueOrThrow({ where: { id: PRODUCT_IDS.comb } })).stockQty).toBe(0);
            expect(await db.stockAlert.count({ where: { unitId: MAIN_UNIT_ID, productId: PRODUCT_IDS.comb, alertType: "OUT_OF_STOCK" } })).toBe(1);
            summary.failures.push({ day, name: "stock_provider_timeout_before_call", recovered: false });
            failureEvidence.push({ day, name: "stock_provider_timeout_before_call", detail: "Timeout antes do marco provider-call-started; retry permaneceu duravel.", recovered: false });
          } else if (day === 13) {
            stockOutcome = "success";
            await manualStock(day, PRODUCT_IDS.comb, "IN", 10, "comb-reset-cycle");
            await waitForLatestStockAlert({
              productId: PRODUCT_IDS.comb,
              alertType: "OUT_OF_STOCK",
              status: "SENT",
              label: "wait_stock_alert_retry_sent",
            });
            const combAboveMinimum = await db.product.findUniqueOrThrow({ where: { id: PRODUCT_IDS.comb } });
            expect(combAboveMinimum.stockQty).toBeGreaterThan(combAboveMinimum.minStockAlert);
            const recovered = await db.stockAlert.count({ where: { unitId: MAIN_UNIT_ID, productId: PRODUCT_IDS.comb, status: "SENT" } });
            expect(recovered).toBeGreaterThanOrEqual(2);
            const pending = summary.failures.find((failure) => failure.name === "stock_provider_timeout_before_call");
            if (pending) pending.recovered = true;
            const failure = failureEvidence.find((item) => item.name === "stock_provider_timeout_before_call");
            if (failure) failure.recovered = true;
          } else if (day === 14) {
            stockOutcome = "timeout_after";
            await manualStock(day, PRODUCT_IDS.comb, "OUT", 8, "comb-low-cycle2");
            await waitForLatestStockAlert({
              productId: PRODUCT_IDS.comb,
              alertType: "LOW_STOCK",
              status: "UNCERTAIN",
              label: "wait_stock_alert_low_uncertain",
            });
            const combBelowMinimum = await db.product.findUniqueOrThrow({ where: { id: PRODUCT_IDS.comb } });
            expect(combBelowMinimum.stockQty).toBeGreaterThan(0);
            expect(combBelowMinimum.stockQty).toBeLessThan(combBelowMinimum.minStockAlert);
            expect(await db.stockAlert.count({ where: { unitId: MAIN_UNIT_ID, productId: PRODUCT_IDS.comb, status: "UNCERTAIN" } })).toBe(1);
            const messagesBeforeUncertainProbe = messages.filter((message) => message.channel === "stock_alert").length;
            await call({ method: "GET", url: `/stock/overview?unitId=${MAIN_UNIT_ID}`, label: "stock_uncertain_probe_does_not_resend" });
            await new Promise<void>((resolve) => setTimeout(resolve, 50));
            expect(messages.filter((message) => message.channel === "stock_alert")).toHaveLength(messagesBeforeUncertainProbe);
            summary.failures.push({ day, name: "stock_provider_timeout_after_call_started", recovered: true });
            failureEvidence.push({ day, name: "stock_provider_timeout_after_call_started", detail: "Entrega marcada UNCERTAIN e nao recolocada automaticamente na fila.", recovered: true });
          } else if (day === 15) {
            stockOutcome = "success";
            await manualStock(day, PRODUCT_IDS.comb, "OUT", 2, "comb-zero-cycle2");
            await waitForLatestStockAlert({
              productId: PRODUCT_IDS.comb,
              alertType: "OUT_OF_STOCK",
              status: "SENT",
              label: "wait_stock_alert_out_sent_cycle2",
            });
            expect((await db.product.findUniqueOrThrow({ where: { id: PRODUCT_IDS.comb } })).stockQty).toBe(0);
            stockOutcome = "http_before";
            await manualStock(day, PRODUCT_IDS.spray, "OUT", 7, "spray-low-for-concurrency");
            await waitForLatestStockAlert({
              productId: PRODUCT_IDS.spray,
              alertType: "LOW_STOCK",
              status: "FAILED",
              label: "wait_stock_alert_spray_failed_before_concurrency",
            });
            const due = await db.stockAlert.findFirstOrThrow({ where: { unitId: MAIN_UNIT_ID, productId: PRODUCT_IDS.spray } });
            await db.stockAlert.update({ where: { id: due.id }, data: { nextAttemptAt: new Date() } });
            const { PrismaStockAlertStore, StockAlertDispatcher } = await import("../src/application/stock-alert-outbox.js");
            const alertStore = new PrismaStockAlertStore(db);
            stockOutcome = "success";
            const dispatcher = () => new StockAlertDispatcher({
              unitId: MAIN_UNIT_ID,
              store: alertStore,
              send: stockAlertSend,
              resolveOwnerPhone: () => OWNER_PHONE,
              now: () => new Date(),
            });
            const dispatchResults = await Promise.all([dispatcher().dispatchDue(), dispatcher().dispatchDue()]);
            expect(dispatchResults.reduce((total, item) => total + item.sent, 0)).toBe(1);
            await expect(alertStore.claimNext("", new Date())).rejects.toThrow();
            const sentRow = await db.stockAlert.findUniqueOrThrow({ where: { id: due.id }, include: { product: { select: { name: true } } } });
            const crossFinalization = await alertStore.markSent(SENTINEL_UNIT_ID, {
              id: sentRow.id,
              unitId: sentRow.unitId,
              productId: sentRow.productId,
              productName: sentRow.product.name,
              alertType: sentRow.alertType,
              cycle: sentRow.cycle,
              status: sentRow.status,
              quantity: sentRow.quantity,
              minimumStock: sentRow.minimumStock,
              attempts: sentRow.attempts,
              maxAttempts: sentRow.maxAttempts,
              deliveryAttemptId: sentRow.deliveryAttemptId ?? undefined,
              createdAt: sentRow.createdAt,
              updatedAt: sentRow.updatedAt,
            }, new Date());
            expect(crossFinalization).toBe(false);
            recordOperation("stock_dispatcher_concurrency_and_tenant_guard", undefined, "ok");

            stockOutcome = "http_before";
            await manualStock(day, PRODUCT_IDS.talc, "OUT", 10, "talc-low-for-stale-claim");
            const staleCandidate = await waitForLatestStockAlert({
              productId: PRODUCT_IDS.talc,
              alertType: "LOW_STOCK",
              status: "FAILED",
              label: "wait_stock_alert_talc_failed_before_stale_claim",
            });
            await db.stockAlert.update({
              where: { id: staleCandidate.id },
              data: {
                status: "SENDING",
                claimedAt: new Date(Date.now() - 10 * 60_000),
                deliveryAttemptId: "g30-stale-alert-attempt",
                providerCallStartedAt: null,
                nextAttemptAt: null,
                failedAt: null,
                lastErrorCode: null,
              },
            });
            const staleRecovery = await alertStore.recoverStale(MAIN_UNIT_ID, new Date());
            expect(staleRecovery).toEqual({ recovered: 1, uncertain: 0 });
            stockOutcome = "success";
            const recoveredDispatch = await dispatcher().dispatchDue();
            expect(recoveredDispatch.sent).toBe(1);
            expect((await db.stockAlert.findUniqueOrThrow({ where: { id: staleCandidate.id } })).status).toBe("SENT");
            await manualStock(day, PRODUCT_IDS.talc, "IN", 5, "talc-reset-after-stale-claim");
            summary.failures.push({ day, name: "stock_alert_expired_claim_before_provider", recovered: true });
            failureEvidence.push({
              day,
              name: "stock_alert_expired_claim_before_provider",
              detail: "Claim SENDING expirado sem providerCallStarted foi reaberto uma vez, despachado e o ciclo voltou acima do minimo.",
              recovered: true,
            });
          } else if (day === 16) {
            await createAndComplete(day, 26);
            const futureAppointment = await call({
              method: "POST",
              url: "/appointments",
              payload: {
                unitId: MAIN_UNIT_ID,
                clientId: clientId(1),
                professionalId: PROFESSIONAL_IDS[0],
                serviceId: SERVICE_IDS[0],
                startsAt: at(20, 10).toISOString(),
                changedBy: OWNER_ID,
              },
              label: "reactivation_future_appointment_setup",
            });
            const draft = await webhook(textPayload("Prepare uma campanha de reativação", "g30-d16-reactivation-draft"), "reactivation_preview");
            expect(draft.json()).toMatchObject({ executed: false });
            const draftedCampaign = await db.reactivationCampaign.findFirstOrThrow({
              where: { unitId: MAIN_UNIT_ID, status: "DRAFT" },
              orderBy: { createdAt: "desc" },
            });
            const exclusions = draftedCampaign.exclusions as Record<string, number>;
            expect(exclusions.FUTURE_APPOINTMENT).toBeGreaterThanOrEqual(1);
            expect(exclusions.INVALID_WHATSAPP).toBeGreaterThanOrEqual(1);
            expect(exclusions.WHATSAPP_OPT_OUT).toBeGreaterThanOrEqual(1);
            expect(exclusions.TOO_EARLY).toBeGreaterThanOrEqual(1);
            await webhook(textPayload("CANCELAR", "g30-d16-reactivation-cancel"), "reactivation_cancel");
            await call({
              method: "PATCH",
              url: `/appointments/${futureAppointment.json().appointment.id}/status`,
              payload: { status: "CANCELLED", reason: "Fim do cenario de exclusao por agenda futura", changedBy: OWNER_ID },
              idempotencyKey: "g30-d16-future-appointment-cancel",
              label: "reactivation_future_appointment_cleanup",
            });
            expect(messages.filter((message) => message.channel === "reactivation")).toHaveLength(0);
          } else if (day === 17) {
            await webhook(textPayload("Prepare uma campanha de reativação", "g30-d17-reactivation-draft"), "reactivation_preview");
            const reactivationDraft = await db.reactivationCampaign.findFirstOrThrow({
              where: { unitId: MAIN_UNIT_ID, status: "DRAFT" },
              orderBy: { createdAt: "desc" },
            });
            const pendingRecipients = await db.reactivationCampaignRecipient.findMany({
              where: { campaignId: reactivationDraft.id },
              orderBy: { id: "asc" },
            });
            expect(pendingRecipients.length).toBeGreaterThan(0);
            expect(pendingRecipients.every((recipient) => recipient.status === "PENDING" && recipient.attemptId.length > 0)).toBe(true);
            expect(new Set(pendingRecipients.map((recipient) => recipient.attemptId)).size).toBe(pendingRecipients.length);
            const durableAttemptIds = new Map(pendingRecipients.map((recipient) => [recipient.id, recipient.attemptId]));
            recordOperation("reactivation_pending_and_attempt_ids_persisted", undefined, "ok");
            const duplicatePhoneRecipient = await db.reactivationCampaignRecipient.findFirstOrThrow({
              where: {
                clientId: { in: [clientId(37), clientId(39)] },
                campaignId: reactivationDraft.id,
              },
              include: { client: true },
              orderBy: { createdAt: "asc" },
            });
            await webhook(textPayload("SAIR", "g30-d17-optout-before-confirm", duplicatePhoneRecipient.client.phone ?? ""), "reactivation_duplicate_phone_opt_out");
            const duplicateClients = await db.client.findMany({ where: { id: { in: [clientId(37), clientId(39)] } } });
            expect(duplicateClients).toHaveLength(2);
            expect(duplicateClients.every((client) => client.whatsappOptOut)).toBe(true);
            reactivationOutcomes.push("success", "timeout", "http", "success", "success");
            const confirmed = await webhook(textPayload("CONFIRMAR", "g30-d17-reactivation-confirm"), "reactivation_confirm");
            expect(confirmed.json()).toMatchObject({ executed: true });
            const statusCounts = await db.reactivationCampaignRecipient.groupBy({
              by: ["status"],
              where: { campaignId: reactivationDraft.id },
              _count: { _all: true },
            });
            const statuses = new Set(statusCounts.map((item) => item.status));
            expect(statuses.has("SENT")).toBe(true);
            expect(statuses.has("UNCERTAIN")).toBe(true);
            expect(statuses.has("FAILED")).toBe(true);
            expect(statuses.has("SKIPPED")).toBe(true);
            const persistedRecipients = await db.reactivationCampaignRecipient.findMany({
              where: { campaignId: reactivationDraft.id },
            });
            expect(persistedRecipients.every((recipient) => durableAttemptIds.get(recipient.id) === recipient.attemptId)).toBe(true);
            const transitionAudits = await db.reactivationRecipientAudit.findMany({
              where: { campaignId: reactivationDraft.id },
            });
            expect(transitionAudits.some((audit) => audit.state === "SENDING")).toBe(true);
            const dayMessages = messages.filter((message) => message.day === day && message.channel === "reactivation");
            expect(dayMessages.length).toBeGreaterThan(0);
            expect(dayMessages.every((message) => message.contractValidated === true)).toBe(true);
            recordOperation("reactivation_transient_states_attempt_and_message_contract", undefined, "ok");
          } else if (day === 18) {
            const before = messages.filter((message) => message.channel === "reactivation").length;
            const replay = await webhook(textPayload("CONFIRMAR", "g30-d18-reactivation-replay"), "reactivation_replay");
            expect(replay.json()).toMatchObject({ executed: true, replay: true });
            expect(messages.filter((message) => message.channel === "reactivation")).toHaveLength(before);
            await createAndComplete(day, 25);
          } else if (day === 19) {
            const sent = await db.reactivationCampaignRecipient.findFirstOrThrow({
              where: { status: "SENT", campaign: { unitId: MAIN_UNIT_ID } },
              include: { client: true },
            });
            await webhook(textPayload("SAIR", "g30-d19-optout-sent", sent.client.phone ?? ""), "reactivation_opt_out");
            expect((await db.client.findUniqueOrThrow({ where: { id: sent.clientId } })).whatsappOptOut).toBe(true);
          } else if (day === 20) {
            const draft = await webhook(textPayload("Prepare uma campanha de reativação", "g30-d20-reactivation-new-draft"), "reactivation_preview_after_cooldown");
            expect(draft.json()).toMatchObject({ executed: false });
            const cooldownDraft = await db.reactivationCampaign.findFirstOrThrow({
              where: { unitId: MAIN_UNIT_ID, status: "DRAFT" },
              orderBy: { createdAt: "desc" },
            });
            const cooldownExclusions = cooldownDraft.exclusions as Record<string, number>;
            expect(cooldownExclusions.RECENT_CONTACT).toBeGreaterThanOrEqual(1);
            expect(cooldownExclusions.WHATSAPP_OPT_OUT).toBeGreaterThanOrEqual(1);
            expect(cooldownExclusions.TOO_EARLY).toBeGreaterThanOrEqual(1);
            expect(await db.reactivationCampaignRecipient.count({
              where: {
                campaignId: cooldownDraft.id,
                client: { whatsappOptOut: true },
              },
            })).toBe(0);
            for (const optedOutClientId of [clientId(37), clientId(39)]) {
              expect(await db.reactivationCampaignRecipient.count({
                where: { campaignId: cooldownDraft.id, clientId: optedOutClientId },
              })).toBe(0);
            }
            recordOperation("reactivation_specific_opt_out_clients_not_reselected", undefined, "ok");
            await webhook(textPayload("CANCELAR", "g30-d20-reactivation-new-cancel"), "reactivation_cancel");
          } else if (day === 21) {
            await createAndComplete(day, 21, { concurrent: true, product: PRODUCT_IDS.matte });
          } else if (day === 22) {
            await productSale(day, 22, true);
          } else if (day === 23) {
            const before = await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID, productId: PRODUCT_IDS.oil } });
            const payload = textPayload("Entraram duas unidades de Óleo para Barba no estoque, por sete reais cada.", "g30-d23-duplicate-webhook");
            const duplicates = await Promise.all([
              webhook(payload, "duplicate_stock_webhook"),
              webhook(payload, "duplicate_stock_webhook"),
            ]);
            expect(duplicates.some((response) => response.json().deduplicated === true)).toBe(true);
            const confirmations = await Promise.all([
              webhook(textPayload("CONFIRMAR", "g30-d23-confirm-a"), "concurrent_stock_confirm"),
              webhook(textPayload("CONFIRMAR", "g30-d23-confirm-b"), "concurrent_stock_confirm"),
            ]);
            expect(confirmations.every((response) => response.statusCode === 200)).toBe(true);
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID, productId: PRODUCT_IDS.oil } })).toBe(before + 1);
            const afterConfirmation = await db.product.findUniqueOrThrow({ where: { id: PRODUCT_IDS.oil } });
            const cancelAfterConfirmation = await webhook(textPayload("CANCELAR", "g30-d23-cancel-after-confirm"), "cancel_after_confirm", [200, 409]);
            if (cancelAfterConfirmation.statusCode === 200) {
              expect(cancelAfterConfirmation.json()).toMatchObject({ executed: false, cancelled: false });
            }
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID, productId: PRODUCT_IDS.oil } })).toBe(before + 1);
            expect((await db.product.findUniqueOrThrow({ where: { id: PRODUCT_IDS.oil } })).stockQty).toBe(afterConfirmation.stockQty);
          } else if (day === 24) {
            const campaignPayload = textPayload("Prepare uma campanha de reativação", "g30-d24-duplicate-campaign");
            await Promise.all([
              webhook(campaignPayload, "duplicate_campaign_webhook"),
              webhook(campaignPayload, "duplicate_campaign_webhook"),
            ]);
            await webhook(textPayload("CANCELAR", "g30-d24-campaign-cancel"), "reactivation_cancel", [200, 409]);
            await Promise.all([
              webhook(textPayload("Prepare uma campanha de reativação", "g30-d24-concurrent-campaign-a"), "concurrent_campaign_open"),
              webhook(textPayload("Prepare uma campanha de reativação", "g30-d24-concurrent-campaign-b"), "concurrent_campaign_open"),
            ]);
            expect(await db.reactivationCampaign.count({ where: { unitId: MAIN_UNIT_ID, status: "DRAFT" } })).toBeLessThanOrEqual(1);
            await webhook(textPayload("CANCELAR", "g30-d24-concurrent-campaign-cancel"), "reactivation_cancel", [200, 409]);

            const movementsBeforeConcurrentEntries = await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID, productId: PRODUCT_IDS.oil } });
            const concurrentEntries = await Promise.all([
              webhook(textPayload("Entraram duas unidades de Óleo para Barba no estoque, por sete reais cada.", "g30-d24-entry-a"), "concurrent_stock_entry_same_product"),
              webhook(textPayload("Entraram três unidades de Óleo para Barba no estoque, por sete reais cada.", "g30-d24-entry-b"), "concurrent_stock_entry_same_product"),
            ]);
            expect(concurrentEntries.every((response) => response.json().executed === false)).toBe(true);
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID, productId: PRODUCT_IDS.oil } })).toBe(movementsBeforeConcurrentEntries);
            const concurrentCorrections = await Promise.all([
              webhook(textPayload("Na verdade são quatro unidades.", "g30-d24-concurrent-correction-a"), "concurrent_stock_correction"),
              webhook(textPayload("Na verdade são cinco unidades.", "g30-d24-concurrent-correction-b"), "concurrent_stock_correction"),
            ]);
            expect(concurrentCorrections.every((response) => response.json().executed === false)).toBe(true);
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID, productId: PRODUCT_IDS.oil } })).toBe(movementsBeforeConcurrentEntries);
            const oilBeforeConcurrentConfirmation = await db.product.findUniqueOrThrow({ where: { id: PRODUCT_IDS.oil } });
            const concurrentWinner = await webhook(textPayload("CONFIRMAR", "g30-d24-concurrent-winner-confirm"), "concurrent_stock_winner_confirm");
            expect(concurrentWinner.json()).toMatchObject({ executed: true, replay: false });
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID, productId: PRODUCT_IDS.oil } })).toBe(movementsBeforeConcurrentEntries + 1);
            const winnerMovements = await db.stockMovement.findMany({
              where: { referenceType: "STOCK_ENTRY", referenceId: concurrentWinner.json().operationId },
            });
            expect(winnerMovements).toHaveLength(1);
            expect([2, 3, 4, 5]).toContain(winnerMovements[0]!.quantity);
            expect((await db.product.findUniqueOrThrow({ where: { id: PRODUCT_IDS.oil } })).stockQty)
              .toBe(oilBeforeConcurrentConfirmation.stockQty + winnerMovements[0]!.quantity);

            const movementsAfterWinner = await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID, productId: PRODUCT_IDS.oil } });
            await app.close();
            app = makeApp();
            ownerToken = await login(OWNER_EMAIL, OWNER_PASSWORD);
            receptionToken = await login(RECEPTION_EMAIL, RECEPTION_PASSWORD);
            const replayAfterRestart = await webhook(textPayload("CONFIRMAR", "g30-d24-confirm-replay-after-restart"), "stock_replay_after_restart");
            expect(replayAfterRestart.json()).toMatchObject({ executed: true, replay: true });
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID, productId: PRODUCT_IDS.oil } })).toBe(movementsAfterWinner);

            const beforeExpiredConfirmation = await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } });
            const expiringConcurrentPreview = await webhook(textPayload(
              "Entraram duas unidades de Óleo para Barba no estoque, por sete reais cada.",
              "g30-d24-expiring-preview",
            ), "concurrency_band_expiring_preview");
            expect(expiringConcurrentPreview.json()).toMatchObject({ executed: false, preview: { quantity: 2, unitCost: 7, totalCost: 14 } });
            setClock(day, 0.1);
            const expiredConcurrentConfirmation = await webhook(textPayload("CONFIRMAR", "g30-d24-expired-confirm"), "concurrency_band_expired_confirmation");
            expect(expiredConcurrentConfirmation.json()).toMatchObject({ executed: false, expired: true });
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(beforeExpiredConfirmation);
            const crossQuery = await call({
              method: "GET",
              url: `/dashboard?unitId=${SENTINEL_UNIT_ID}&date=${encodeURIComponent(new Date().toISOString())}`,
              expected: 403,
              label: "tenant_query_rejected",
            });
            expect(crossQuery.statusCode).toBe(403);
            const crossBody = await call({
              method: "POST",
              url: "/appointments",
              payload: { unitId: SENTINEL_UNIT_ID, clientId: "g30-sentinel-client", professionalId: PROFESSIONAL_IDS[0], serviceId: SERVICE_IDS[0], startsAt: at(day, 8).toISOString(), changedBy: OWNER_ID },
              expected: 403,
              label: "tenant_body_rejected",
            });
            expect(crossBody.statusCode).toBe(403);
          } else if (day === 25) {
            await webhook(textPayload("Entraram duas unidades de Óleo para Barba no estoque, por sete reais cada.", "g30-d25-preview-before-restart"), "stock_preview_before_restart");
            const before = await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } });
            await app.close();
            app = makeApp();
            ownerToken = await login(OWNER_EMAIL, OWNER_PASSWORD);
            receptionToken = await login(RECEPTION_EMAIL, RECEPTION_PASSWORD);
            await webhook(textPayload("CONFIRMAR", "g30-d25-confirm-after-restart"), "stock_confirm_after_restart");
            await webhook(textPayload("CONFIRMAR", "g30-d25-confirm-after-restart-replay"), "stock_confirm_replay_after_restart");
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(before + 1);
            summary.failures.push({ day, name: "backend_reconstruction_with_pending_command", recovered: true });
            failureEvidence.push({ day, name: "backend_reconstruction_with_pending_command", detail: "Fastify reconstruido; preview Prisma confirmou uma vez e replay nao duplicou.", recovered: true });
          } else if (day === 26) {
            const before = await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } });
            audioQueue.push(new AudioTranscriptionError("audio_transcription_whisper_failed"));
            const failedAudio = await webhook(audioPayload("g30-d26-audio-failure", audioFixture.length), "audio_transcription_failure");
            expect(failedAudio.json()).toMatchObject({ audio: true, executed: false, reason: "audio_transcription_whisper_failed" });
            audioQueue.push(new AudioTranscriptionError("audio_transcription_ffmpeg_failed"));
            const failedFfmpeg = await webhook(audioPayload("g30-d26-ffmpeg-failure", audioFixture.length), "audio_transcription_ffmpeg_failure");
            expect(failedFfmpeg.json()).toMatchObject({ audio: true, executed: false, reason: "audio_transcription_ffmpeg_failed" });
            audioQueue.push(new AudioTranscriptionError("audio_transcription_timeout"));
            const timedOutAudio = await webhook(audioPayload("g30-d26-audio-timeout", audioFixture.length), "audio_transcription_timeout");
            expect(timedOutAudio.json()).toMatchObject({ audio: true, executed: false, reason: "audio_transcription_timeout" });
            audioQueue.push(new AudioTranscriptionError("audio_transcription_no_speech"));
            const noSpeech = await webhook(audioPayload("g30-d26-audio-no-speech", audioFixture.length), "audio_transcription_no_speech");
            expect(noSpeech.json()).toMatchObject({ audio: true, executed: false, reason: "audio_transcription_no_speech" });
            const overDuration = await webhook(audioPayload("g30-d26-audio-over-duration", audioFixture.length, false, 121), "audio_over_normal_duration");
            expect(overDuration.json()).toMatchObject({ audio: true, executed: false });
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(before);
            await app.close();
            app = makeApp(async () => { throw new Error("gate30_database_readiness_unavailable"); });
            const unavailable = await call({ method: "GET", url: "/health/ready", token: null, expected: 503, label: "readiness_unavailable" });
            expect(unavailable.json()).toMatchObject({ status: "not_ready" });
            await app.close();
            app = makeApp();
            ownerToken = await login(OWNER_EMAIL, OWNER_PASSWORD);
            receptionToken = await login(RECEPTION_EMAIL, RECEPTION_PASSWORD);
            const recovered = await call({ method: "GET", url: "/health/ready", token: null, label: "readiness_recovered" });
            expect(recovered.json()).toMatchObject({ status: "ready" });
            summary.failures.push({ day, name: "whisper_and_readiness_unavailable", recovered: true });
            failureEvidence.push({ day, name: "whisper_and_readiness_unavailable", detail: "ASR falhou fechado; app 503 em readiness e voltou a ready apos reconstrucao.", recovered: true });
          } else if (day === 27) {
            const unknown = await webhook({ event: "unknown.event", instance: "gate30-instance", data: {} }, "unknown_evolution_event", [200, 202, 204]);
            expect([200, 202, 204]).toContain(unknown.statusCode);
            const transcriptionCallsBeforeEmptyMedia = vi.mocked(audioTranscriptionService.transcribe).mock.calls.length;
            mediaDownloadMode = "empty";
            const emptyMedia = await webhook(audioPayload("g30-d27-empty-media", 0), "empty_audio_media");
            expect(emptyMedia.json()).toMatchObject({ audio: true, executed: false, reason: "download_failed" });
            expect(vi.mocked(audioTranscriptionService.transcribe).mock.calls.length).toBe(transcriptionCallsBeforeEmptyMedia);
            const invalidAudio = audioPayload("g30-d27-invalid-media", audioFixture.length) as any;
            invalidAudio.data.message.audioMessage.mimetype = "image/jpeg";
            const invalid = await webhook(invalidAudio, "invalid_audio_media", [200, 400, 415]);
            expect(invalid.statusCode).toBeGreaterThanOrEqual(200);
            const before = await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } });
            const newerConfirmation = textPayload("CONFIRMAR", "g30-d27-out-of-order-confirm");
            newerConfirmation.data.messageTimestamp += 120;
            await webhook(newerConfirmation, "out_of_order_confirm_delivered_before_preview");
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(before);
            const olderPreview = textPayload("Entraram duas unidades de Óleo para Barba no estoque, por sete reais cada.", "g30-d27-out-of-order-preview");
            olderPreview.data.messageTimestamp -= 120;
            const deliveredLate = await webhook(olderPreview, "out_of_order_older_preview_delivered_late");
            expect(deliveredLate.json()).toMatchObject({ executed: false });
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(before);
            await webhook(textPayload("CANCELAR", "g30-d27-out-of-order-cancel"), "out_of_order_pending_cancel");
            await webhook(textPayload("Entraram duas unidades de Óleo para Barba no estoque, por sete reais cada.", "g30-d27-post-failure-canary"), "post_failure_stock_canary");
            await webhook(textPayload("CANCELAR", "g30-d27-post-failure-cancel"), "stock_cancel");
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(before);
          } else if (day === 28) {
            const temporaryOwnerToken = await login(OWNER_EMAIL, OWNER_PASSWORD);
            await call({ method: "GET", url: "/auth/me", token: temporaryOwnerToken, label: "session_me" });
            const start = at(1, -1).toISOString();
            const end = at(day, 23).toISOString();
            await call({
              method: "GET",
              url: `/dashboard?unitId=${MAIN_UNIT_ID}&date=${encodeURIComponent(at(day).toISOString())}`,
              token: null,
              expected: 401,
              label: "protected_route_without_session_401",
            });
            await call({
              method: "GET",
              url: `/reports/management/summary?unitId=${MAIN_UNIT_ID}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
              token: receptionToken,
              expected: 403,
              label: "owner_only_report_rejected_for_reception",
            });
            await call({
              method: "GET",
              url: `/audit/events?unitId=${MAIN_UNIT_ID}&limit=20`,
              token: receptionToken,
              expected: 403,
              label: "sensitive_audit_rejected_for_reception",
            });
            await call({ method: "GET", url: `/public/services?unitId=${MAIN_UNIT_ID}`, token: null, label: "public_services" });
            const previousLoginLimit = process.env.RATE_LIMIT_LOGIN_MAX;
            try {
              process.env.RATE_LIMIT_LOGIN_MAX = "1";
              const limitedLogin = await app.inject({
                method: "POST",
                url: "/auth/login",
                payload: { email: OWNER_EMAIL, password: "senha-invalida", activeUnitId: MAIN_UNIT_ID },
              });
              expect(limitedLogin.statusCode).toBe(429);
              recordOperation("login_rate_limit_429", limitedLogin.statusCode, "expected_rejection");
            } finally {
              process.env.RATE_LIMIT_LOGIN_MAX = previousLoginLimit ?? "10000";
            }
            await call({ method: "POST", url: "/auth/logout", token: temporaryOwnerToken, label: "logout" });
            await app.close();
            app = makeApp(async () => { throw new Error("gate30_regression_readiness_unavailable"); });
            const regressionUnavailable = await call({
              method: "GET",
              url: "/health/ready",
              token: null,
              expected: 503,
              label: "regression_readiness_contract_503",
            });
            expect(regressionUnavailable.json()).toMatchObject({ status: "not_ready" });
            await app.close();
            app = makeApp();
            await refreshSessions("regression_session_refresh_after_503");
            const legacy = await createAndComplete(day, 28);
            const legacyResponse = await call({
              method: "POST",
              url: `/appointments/${legacy.appointmentId}/complete`,
              payload: { changedBy: OWNER_ID, completedAt: at(day, 6).toISOString() },
              expected: 410,
              label: "legacy_complete_410",
            });
            expect(legacyResponse.statusCode).toBe(410);
            await call({
              method: "GET",
              url: `/appointments?unitId=${MAIN_UNIT_ID}&start=${encodeURIComponent(at(day, -1).toISOString())}&end=${encodeURIComponent(at(day, 23).toISOString())}`,
              label: "agenda_list_regression",
            });
            await call({
              method: "GET",
              url: `/appointments?unitId=${MAIN_UNIT_ID}&start=${encodeURIComponent(at(day, -1).toISOString())}&end=${encodeURIComponent(at(day + 7, 23).toISOString())}`,
              label: "agenda_week_regression",
            });
            const publicBooking = await call({
              method: "POST",
              url: `/public/booking?unitId=${MAIN_UNIT_ID}`,
              token: null,
              idempotencyKey: "g30-d28-public-booking",
              expected: 201,
              payload: {
                unitId: MAIN_UNIT_ID,
                clientName: "Cliente Publico Horizonte",
                clientPhone: "5511930000028",
                serviceId: SERVICE_IDS[4],
                startsAt: at(29, 18).toISOString(),
              },
              label: "public_booking_regression",
            });
            expect(publicBooking.json().id).toBeTruthy();
            await new Promise<void>((resolve) => setImmediate(resolve));
          } else if (day === 29) {
            await createAndComplete(day, 30);
            await productSale(day, 30);
            const rangeStart = at(1, -1).toISOString();
            const rangeEnd = at(day, 23).toISOString();
            await call({ method: "GET", url: `/dashboard?unitId=${MAIN_UNIT_ID}&date=${encodeURIComponent(at(day).toISOString())}`, label: "dashboard_regression" });
            await call({ method: "GET", url: `/reports/management/financial?unitId=${MAIN_UNIT_ID}&start=${encodeURIComponent(rangeStart)}&end=${encodeURIComponent(rangeEnd)}`, label: "financial_report_regression" });
            await call({ method: "GET", url: `/reports/management/stock?unitId=${MAIN_UNIT_ID}&start=${encodeURIComponent(rangeStart)}&end=${encodeURIComponent(rangeEnd)}`, label: "stock_report_regression" });
            await call({ method: "GET", url: `/clients/overview?unitId=${MAIN_UNIT_ID}&start=${encodeURIComponent(rangeStart)}&end=${encodeURIComponent(rangeEnd)}`, label: "clients_regression" });
            await call({ method: "GET", url: `/inventory?unitId=${MAIN_UNIT_ID}`, label: "inventory_regression" });
            await call({ method: "GET", url: `/audit/events?unitId=${MAIN_UNIT_ID}&limit=20`, label: "audit_regression" });
            const oil = await db.product.findUniqueOrThrow({ where: { id: PRODUCT_IDS.oil } });
            await call({
              method: "POST",
              url: "/inventory/counts",
              payload: { unitId: MAIN_UNIT_ID, productId: oil.id, countedQty: oil.stockQty, reason: "Contagem de homologacao", responsible: OWNER_ID, countedAt: new Date().toISOString() },
              idempotencyKey: "g30-d29-inventory-count",
              label: "inventory_count",
            });
          } else {
            const finalAppointment = await createAndComplete(day, 31, { product: PRODUCT_IDS.matte });
            await createAndComplete(day, 32, { startHour: 6, completedHour: 7 });
            const finalSale = await productSale(day, 31);
            audioQueue.push("Entraram duas unidades de Óleo para Barba no estoque, por sete reais cada.");
            await webhook(audioPayload("g30-d30-audio-stock", audioFixture.length), "final_audio_stock_preview");
            await webhook(textPayload("CONFIRMAR", "g30-d30-audio-stock-confirm"), "final_audio_stock_confirm");
            await webhook(textPayload("Comprei 2 Pomadas Matte por 5 reais cada e 3 Óleos para Barba por 8 reais cada.", "g30-d30-batch"), "final_batch_stock_preview");
            await webhook(textPayload("Na verdade, são 4 óleos.", "g30-d30-batch-correction"), "final_batch_stock_correction");
            await webhook(textPayload("CONFIRMAR", "g30-d30-batch-confirm"), "final_batch_stock_confirm");
            stockOutcome = "success";
            const talc = await db.product.findUniqueOrThrow({ where: { id: PRODUCT_IDS.talc } });
            expect(talc.stockQty).toBeGreaterThan(talc.minStockAlert);
            await manualStock(day, PRODUCT_IDS.talc, "OUT", talc.stockQty - talc.minStockAlert, "final-alert");
            await waitForLatestStockAlert({
              productId: PRODUCT_IDS.talc,
              alertType: "LOW_STOCK",
              status: "SENT",
              label: "wait_final_stock_alert_sent",
            });
            const finalCampaignPreview = await webhook(textPayload("Prepare uma campanha de reativação", "g30-d30-reactivation"), "final_reactivation_preview");
            expect(finalCampaignPreview.json()).toMatchObject({ executed: false, mode: "preview_only" });
            const finalCampaign = await db.reactivationCampaign.findFirstOrThrow({
              where: { unitId: MAIN_UNIT_ID, status: "DRAFT" },
              orderBy: { createdAt: "desc" },
            });
            expect(await db.reactivationCampaignRecipient.count({ where: { campaignId: finalCampaign.id } })).toBeGreaterThan(0);
            reactivationOutcomes.push("success", "success", "success");
            const campaignConfirmation = await webhook(textPayload("CONFIRMAR", "g30-d30-reactivation-confirm"), "final_reactivation_confirm");
            expect(campaignConfirmation.json()).toMatchObject({ executed: true, replay: false });
            const recipient = await db.reactivationCampaignRecipient.findFirstOrThrow({
              where: { campaignId: finalCampaign.id, status: "SENT" },
              include: { client: true },
              orderBy: { sentAt: "desc" },
            });
            await webhook(textPayload("SAIR", "g30-d30-optout", recipient.client.phone ?? ""), "final_reactivation_opt_out");
            expect((await db.client.findUniqueOrThrow({ where: { id: recipient.clientId } })).whatsappOptOut).toBe(true);
            const movementsBeforeFinalRestart = await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } });
            await app.close();
            app = makeApp();
            ownerToken = await login(OWNER_EMAIL, OWNER_PASSWORD);
            receptionToken = await login(RECEPTION_EMAIL, RECEPTION_PASSWORD);
            await call({
              method: "POST",
              url: `/appointments/${finalAppointment.appointmentId}/checkout`,
              payload: finalAppointment.checkoutPayload,
              idempotencyKey: "g30-d30-a31-checkout",
              label: "final_checkout_replay_after_restart",
            });
            await call({
              method: "POST",
              url: "/sales/products",
              payload: {
                unitId: MAIN_UNIT_ID,
                clientId: clientId(31),
                professionalId: PROFESSIONAL_IDS[1],
                paymentMethod: ["PIX", "CASH", "DEBIT", "CREDIT"][day % 4],
                soldAt: at(day, 7).toISOString(),
                items: [{ productId: PRODUCT_IDS.oil, quantity: 1 }],
              },
              idempotencyKey: "g30-d30-sale-31",
              label: "final_sale_replay_after_restart",
            });
            expect(finalSale.statusCode).toBe(200);
            const stockReplay = await webhook(textPayload("CONFIRMAR", "g30-d30-batch-confirm"), "final_stock_confirm_replay_after_restart");
            expect(stockReplay.json()).toMatchObject({ executed: false, replay: true, deduplicated: true });
            expect(await db.stockMovement.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(movementsBeforeFinalRestart);
          }

          if (stockFinancialEntriesBefore != null) {
            expect(await db.financialEntry.count({ where: { unitId: MAIN_UNIT_ID } })).toBe(stockFinancialEntriesBefore);
            const currentProducts = await db.product.findMany({ where: { businessId: MAIN_UNIT_ID } });
            expect(currentProducts.every((product) => Number(product.salePrice) === initialSalePrices.get(product.id))).toBe(true);
            recordOperation("stock_entry_zero_financial_and_sale_price_unchanged", undefined, "ok");
          }

          await closeDay(day);
          expect(await db.auditLog.count({ where: { unitId: MAIN_UNIT_ID } })).toBeGreaterThan(auditCountBeforeDay);
          recordOperation("daily_audit_growth", undefined, "ok");
          if (day <= 5) {
            const observed = new Set(currentDay.operations.map((operation) => operation.label));
            for (const required of [
              "appointment_create",
              "appointment_confirm",
              "appointment_start",
              "appointment_checkout",
              "daily_appointment_cancel",
              "daily_appointment_reschedule",
              "daily_appointment_no_show",
              "product_sale",
              "agenda_read",
              "stock_read",
              "financial_read",
              "daily_closing",
            ]) {
              expect(observed.has(required), `dia ${day} sem operacao obrigatoria ${required}`).toBe(true);
            }
            const auditActionsAfter = new Map((await db.auditLog.groupBy({
              by: ["action"],
              where: { unitId: MAIN_UNIT_ID },
              _count: { _all: true },
            })).map((item) => [item.action, item._count._all]));
            for (const action of [
              "APPOINTMENT_CREATED",
              "APPOINTMENT_CHECKOUT_COMPLETED",
              "APPOINTMENT_CANCELLED",
              "APPOINTMENT_RESCHEDULED",
              "APPOINTMENT_NO_SHOW",
              "PRODUCT_SALE_REGISTERED",
              "DAILY_CLOSING_CLOSED",
            ]) {
              expect(auditActionsAfter.get(action) ?? 0, `dia ${day} sem auditoria ${action}`)
                .toBeGreaterThan(auditActionsBefore?.get(action) ?? 0);
            }
          }
          const dailySnapshot = await snapshot(db, initialStock, sentinelBaseline, day);
          snapshots.push(dailySnapshot);
          finalSnapshot = dailySnapshot;
          if (!dailySnapshot.reconciliation.ok) {
            currentDay.errors.push(...dailySnapshot.reconciliation.errors);
            summary.reconciliationErrors.push(...dailySnapshot.reconciliation.errors.map((error) => `day-${day}:${error}`));
          }
          await writeJson(evidenceDirectory, `day-${String(day).padStart(2, "0")}.json`, {
            day: currentDay,
            snapshot: dailySnapshot,
          });
          summary.snapshotsWritten += 1;
          expect(dailySnapshot.reconciliation.ok, JSON.stringify(dailySnapshot.reconciliation.errors)).toBe(true);
        } catch (error) {
          currentDay.errors.push(safeError(error));
          throw error;
        }
      }

      summary.simulatedInputs = simulatedInputs.length;
      summary.controlledMessages = messages.length;
      summary.complete = summary.snapshotsWritten === 30
        && summary.reconciliationErrors.length === 0
        && summary.realOutboundNetworkCalls === 0;
      expect(summary.complete).toBe(true);
    } catch (error) {
      thrown = error;
      summary.fatalError = safeError(error);
    } finally {
      summary.simulatedInputs = simulatedInputs.length;
      summary.controlledMessages = messages.length;
      if (app) await app.close().catch(() => undefined);
      if (db) await db.$disconnect().catch(() => undefined);
      if (appPrisma) await appPrisma.$disconnect().catch(() => undefined);
      vi.unstubAllGlobals();
      vi.useRealTimers();
      restoreEnvironment(originalEnv);

      if (evidenceDirectory) {
        const coverage = LITERAL_COVERAGE.map((entry) => ({
          ...entry,
          status: entry.execution === "harness"
            ? summary.complete ? "executed_in_completed_harness" : "planned_or_partially_executed"
            : entry.execution === "external_suite" ? "required_external_suite_evidence" : "required_external_runner_evidence",
        }));
        await writeJson(evidenceDirectory, "matrix-30-days.json", days);
        await writeJson(evidenceDirectory, "daily-summary.json", snapshots);
        await writeJson(evidenceDirectory, "sanitized-operation-log.json", days.flatMap((day) =>
          day.operations.map((operation) => ({ day: day.day, virtualDate: day.virtualDate, ...operation })),
        ));
        await writeJson(evidenceDirectory, "coverage-matrix.json", coverage);
        await writeJson(evidenceDirectory, "simulated-inputs.json", simulatedInputs);
        await writeJson(evidenceDirectory, "controlled-messages.json", messages);
        await writeJson(evidenceDirectory, "controlled-failures.json", failureEvidence);
        await writeJson(evidenceDirectory, "changed-files.json", [{
          path: "tests/gate-30day-homologation.spec.ts",
          purpose: "harness temporario, opt-in e autocontido do gate acelerado",
        }]);
        await writeJson(
          evidenceDirectory,
          "external-checks-required.json",
          coverage.filter((entry) => entry.execution !== "harness"),
        );
        if (finalSnapshot?.day === 30) {
          await writeJson(evidenceDirectory, "final.json", finalSnapshot);
          await writeJson(evidenceDirectory, "reconciliation-stock.json", {
            day: finalSnapshot.day,
            stock: finalSnapshot.stock,
            stockAlerts: finalSnapshot.notifications.stockAlerts,
            errors: finalSnapshot.reconciliation.errors.filter((error) => error.startsWith("stock:") || error.startsWith("negative_stock:")),
          });
          await writeJson(evidenceDirectory, "reconciliation-financial.json", {
            day: finalSnapshot.day,
            finance: finalSnapshot.finance,
            errors: finalSnapshot.reconciliation.errors.filter((error) => error.startsWith("finance:") || error.includes("financial")),
          });
          await writeJson(evidenceDirectory, "reconciliation-campaigns.json", {
            day: finalSnapshot.day,
            campaigns: finalSnapshot.notifications.campaigns,
            recipients: finalSnapshot.notifications.recipients,
            controlledMessages: messages.filter((message) => message.channel === "reactivation").length,
          });
        }
        await writeJson(evidenceDirectory, "summary.json", summary);
        const decision = summary.complete
          ? "HARNESS CONCLUIDO; decisao final depende dos gates externos declarados"
          : "HARNESS INCOMPLETO OU REPROVADO";
        const report = [
          "# Gate acelerado de 30 dias",
          "",
          `- Resultado do harness: ${decision}`,
          `- Seed: ${summary.seed}`,
          `- Ancora virtual: ${summary.anchor}`,
          `- Snapshots diarios: ${summary.snapshotsWritten}/30`,
          `- Reconciliacoes com erro: ${summary.reconciliationErrors.length}`,
          `- Chamadas outbound reais: ${summary.realOutboundNetworkCalls}`,
          `- Entradas webhook simuladas: ${summary.simulatedInputs}`,
          `- Mensagens controladas/interceptadas: ${summary.controlledMessages}`,
          `- Downloads de midia interceptados: ${summary.mediaDownloadsIntercepted}`,
          `- Itens exercitados pelo harness: ${LITERAL_COVERAGE.filter((entry) => entry.execution === "harness").length}`,
          `- Itens que exigem suites externas: ${LITERAL_COVERAGE.filter((entry) => entry.execution === "external_suite").length}`,
          `- Itens que exigem evidencia do runner/infra externo: ${LITERAL_COVERAGE.filter((entry) => entry.execution === "external_runner").length}`,
          "- O alvo foi aceito somente por ser PostgreSQL local com nome test+gate30; a URL e credenciais nao sao persistidas.",
          `- Bootstrap inerte unit-01 da migration removido antes do seed: ${summary.migrationBootstrapRemoved ? "sim" : "nao estava presente"}.`,
          "- Este arquivo nao cria, migra, derruba nem remove o banco; remove apenas a linha bootstrap inerte validada antes do seed.",
          "",
          "## Lacunas que impedem este harness isolado de declarar o gate total sozinho",
          "",
          ...summary.gaps.map((gap) => `- ${gap}`),
          "",
          "## Erro fatal",
          "",
          summary.fatalError ? `- ${summary.fatalError}` : "- Nenhum.",
          "",
        ].join("\n");
        await writeFile(path.join(evidenceDirectory, "report.md"), report, "utf8");
      }
    }

    if (thrown) throw thrown;
  }, 4 * 60_000);
});
