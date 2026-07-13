import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { PrismaClient, Prisma } from "@prisma/client";

const EXPECTED_DATABASE = "barbearia_pilot";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const PILOT_ENV_FILE = path.resolve(process.cwd(), ".env.pilot.local");

const UNIT_ID = "unit-geovane-borges";
const OWNER_ID = "usr-geovane-owner";
const OWNER_EMAIL = "bgeovane265@gmail.com";
const OWNER_ACCESS_ID = `access-${OWNER_ID}-${UNIT_ID}`;
const PROFESSIONAL_ID = "pro-geovane-borges";
const COMBINATION_RULE_ID = "rule-geovane-corte-barba-45";

const services = [
  { id: "svc-geovane-corte", name: "Corte", category: "CORTE", price: "30.00", durationMin: 30 },
  { id: "svc-geovane-barba", name: "Barba", category: "BARBA", price: "20.00", durationMin: 30 },
  { id: "svc-geovane-hidratacao", name: "Hidratacao", category: "TRATAMENTO", price: "20.00", durationMin: 30 },
  { id: "svc-geovane-luzes", name: "Luzes", category: "QUIMICA", price: "50.00", durationMin: 60 },
  { id: "svc-geovane-pigmentacao", name: "Pigmentacao", category: "QUIMICA", price: "45.00", durationMin: 60 },
];

const products = [
  { id: "prd-geovane-gel", name: "Gel", category: "Finalizacao", salePrice: "5.50", costPrice: "0.00", stockQty: 30 },
  { id: "prd-geovane-pomada", name: "Pomada", category: "Finalizacao", salePrice: "7.50", costPrice: "0.00", stockQty: 10 },
  { id: "prd-geovane-bucha", name: "Bucha", category: "Acessorio", salePrice: "12.50", costPrice: "0.00", stockQty: 3 },
  { id: "prd-geovane-shampoo", name: "Shampoo", category: "Cabelo", salePrice: "7.50", costPrice: "0.00", stockQty: 10 },
  { id: "prd-geovane-condicionador", name: "Condicionador", category: "Cabelo", salePrice: "7.50", costPrice: "0.00", stockQty: 10 },
  { id: "prd-geovane-mascara", name: "Mascara", category: "Tratamento", salePrice: "7.50", costPrice: "0.00", stockQty: 10 },
];
const CANONICAL_STOCK_TOTAL = products.reduce((total, product) => total + product.stockQty, 0);

const paymentMethods = [
  { id: "pay-geovane-dinheiro", name: "Dinheiro", isDefault: true },
  { id: "pay-geovane-pix", name: "Pix", isDefault: false },
];

const businessHours = [
  { dayOfWeek: 0, opensAt: null, closesAt: null, breakStart: null, breakEnd: null, isClosed: true },
  { dayOfWeek: 1, opensAt: "09:00", closesAt: "19:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false },
  { dayOfWeek: 2, opensAt: "09:00", closesAt: "19:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false },
  { dayOfWeek: 3, opensAt: "09:00", closesAt: "19:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false },
  { dayOfWeek: 4, opensAt: "09:00", closesAt: "19:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false },
  { dayOfWeek: 5, opensAt: "09:00", closesAt: "19:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false },
  { dayOfWeek: 6, opensAt: "09:00", closesAt: "14:00", breakStart: null, breakEnd: null, isClosed: false },
];

const modelDelegates = [
  ["Unit", "unit"],
  ["User", "user"],
  ["UserUnitAccess", "userUnitAccess"],
  ["BusinessSettings", "businessSettings"],
  ["MonthlyGoal", "monthlyGoal"],
  ["BusinessHour", "businessHour"],
  ["PaymentMethod", "paymentMethod"],
  ["BusinessCommissionRule", "businessCommissionRule"],
  ["TeamMember", "teamMember"],
  ["Service", "service"],
  ["Professional", "professional"],
  ["ServiceProfessional", "serviceProfessional"],
  ["CommissionRule", "commissionRule"],
  ["Client", "client"],
  ["Product", "product"],
  ["ServiceStockConsumption", "serviceStockConsumption"],
  ["Appointment", "appointment"],
  ["AppointmentBlock", "appointmentBlock"],
  ["AppointmentCheckout", "appointmentCheckout"],
  ["CheckoutPayment", "checkoutPayment"],
  ["StockInventoryCount", "stockInventoryCount"],
  ["DailyClosing", "dailyClosing"],
  ["AppointmentServiceItem", "appointmentServiceItem"],
  ["ServiceCombinationRule", "serviceCombinationRule"],
  ["ServiceCombinationRuleItem", "serviceCombinationRuleItem"],
  ["AppointmentHistory", "appointmentHistory"],
  ["FinancialEntry", "financialEntry"],
  ["CommissionEntry", "commissionEntry"],
  ["ProductSale", "productSale"],
  ["ProductSaleItem", "productSaleItem"],
  ["Refund", "refund"],
  ["RefundItem", "refundItem"],
  ["StockMovement", "stockMovement"],
  ["IdempotencyRecord", "idempotencyRecord"],
  ["AuditLog", "auditLog"],
  ["LoyaltyProgram", "loyaltyProgram"],
  ["LoyaltyLedger", "loyaltyLedger"],
  ["ServicePackage", "servicePackage"],
  ["ClientPackage", "clientPackage"],
  ["SubscriptionPlan", "subscriptionPlan"],
  ["ClientSubscription", "clientSubscription"],
  ["RetentionCase", "retentionCase"],
  ["RetentionEvent", "retentionEvent"],
  ["AutomationRule", "automationRule"],
  ["AutomationExecution", "automationExecution"],
  ["RetentionScoreSnapshot", "retentionScoreSnapshot"],
  ["IntegrationWebhookLog", "integrationWebhookLog"],
  ["BillingSubscriptionEvent", "billingSubscriptionEvent"],
];

const deletionOrder = [
  "checkoutPayment",
  "appointmentCheckout",
  "refundItem",
  "refund",
  "commissionEntry",
  "productSaleItem",
  "productSale",
  "appointmentHistory",
  "appointmentServiceItem",
  "appointment",
  "billingSubscriptionEvent",
  "retentionEvent",
  "automationExecution",
  "loyaltyLedger",
  "clientPackage",
  "clientSubscription",
  "retentionCase",
  "retentionScoreSnapshot",
  "stockInventoryCount",
  "stockMovement",
  "serviceStockConsumption",
  "appointmentBlock",
  "financialEntry",
  "dailyClosing",
  "idempotencyRecord",
  "auditLog",
  "integrationWebhookLog",
  "automationRule",
  "businessCommissionRule",
  "commissionRule",
  "serviceCombinationRuleItem",
  "serviceCombinationRule",
  "serviceProfessional",
  "product",
  "service",
  "professional",
  "client",
  "loyaltyProgram",
  "servicePackage",
  "subscriptionPlan",
  "monthlyGoal",
  "teamMember",
  "businessHour",
  "paymentMethod",
  "businessSettings",
  "userUnitAccess",
  "unit",
];

const expectedCounts = new Map(modelDelegates.map(([, delegate]) => [delegate, 0]));
for (const [delegate, count] of [
  ["unit", 1],
  ["user", 1],
  ["userUnitAccess", 1],
  ["businessSettings", 1],
  ["businessHour", businessHours.length],
  ["paymentMethod", paymentMethods.length],
  ["service", services.length],
  ["professional", 1],
  ["serviceProfessional", services.length],
  ["product", products.length],
  ["serviceCombinationRule", 1],
  ["serviceCombinationRuleItem", 2],
  ["stockMovement", products.length],
]) {
  expectedCounts.set(delegate, count);
}

function fail(message) {
  throw new Error(message);
}

function parseArguments(argv) {
  let execute = false;
  let explicitDryRun = false;
  let confirmed = false;
  let backupPath;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--execute") {
      execute = true;
    } else if (argument === "--dry-run") {
      explicitDryRun = true;
    } else if (argument === "--confirm-reset-geovane-pilot") {
      confirmed = true;
    } else if (argument === "--backup") {
      backupPath = argv[index + 1];
      index += 1;
    } else if (argument.startsWith("--backup=")) {
      backupPath = argument.slice("--backup=".length);
    } else {
      fail(`Argumento desconhecido: ${argument}`);
    }
  }

  if (execute && explicitDryRun) fail("Escolha somente um modo: --dry-run ou --execute");
  if (!execute && (confirmed || backupPath)) {
    fail("--confirm-reset-geovane-pilot e --backup sao aceitos somente com --execute");
  }
  if (execute && !confirmed) {
    fail("Reset real recusado: flag --confirm-reset-geovane-pilot ausente");
  }
  if (execute && !backupPath) fail("Reset real recusado: informe --backup=<caminho>");

  return { dryRun: !execute, backupPath };
}

function loadPilotEnvironment() {
  if (String(process.env.NODE_ENV ?? "").trim().toLowerCase() === "production") {
    fail("Reset recusado: NODE_ENV=production");
  }
  if (!existsSync(PILOT_ENV_FILE)) {
    fail("Reset recusado: .env.pilot.local nao encontrado");
  }

  const parsed = dotenv.parse(readFileSync(PILOT_ENV_FILE));
  if (String(parsed.NODE_ENV ?? "").trim().toLowerCase() === "production") {
    fail("Reset recusado: NODE_ENV=production");
  }
  if (String(parsed.DATA_BACKEND ?? "").trim() !== "prisma") {
    fail("Reset recusado: DATA_BACKEND deve ser prisma");
  }

  const rawDatabaseUrl = String(parsed.DATABASE_URL ?? "").trim();
  if (!rawDatabaseUrl) fail("Reset recusado: DATABASE_URL ausente");

  let databaseUrl;
  try {
    databaseUrl = new URL(rawDatabaseUrl);
  } catch {
    fail("Reset recusado: DATABASE_URL invalida");
  }

  const host = databaseUrl.hostname.toLowerCase();
  const database = decodeURIComponent(databaseUrl.pathname.replace(/^\//, "").split("?")[0]);
  if (!LOCAL_HOSTS.has(host)) {
    fail("Reset recusado: host deve ser localhost ou 127.0.0.1");
  }
  if (database !== EXPECTED_DATABASE) {
    fail(`Reset recusado: banco deve ser exatamente ${EXPECTED_DATABASE}`);
  }

  process.env.DATABASE_URL = rawDatabaseUrl;
  process.env.DATA_BACKEND = "prisma";

  return { host, database };
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex").toUpperCase();
}

function pgRestoreCandidates() {
  const configured = String(process.env.PG_RESTORE_PATH ?? "").trim();
  if (configured) return [path.resolve(configured)];

  const candidates = ["pg_restore"];
  if (process.platform !== "win32") return candidates;

  const postgresRoot = path.join(process.env.ProgramFiles ?? "C:\\Program Files", "PostgreSQL");
  if (!existsSync(postgresRoot)) return candidates;

  const versions = readdirSync(postgresRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  for (const version of versions) {
    candidates.push(path.join(postgresRoot, version, "bin", "pg_restore.exe"));
    candidates.push(path.join(postgresRoot, version, "pgAdmin 4", "runtime", "pg_restore.exe"));
  }
  return candidates;
}

async function validateBackup(backupPath) {
  const resolvedPath = path.resolve(backupPath);
  if (!existsSync(resolvedPath)) fail(`Backup invalido: arquivo nao encontrado em ${resolvedPath}`);

  const stat = statSync(resolvedPath);
  if (!stat.isFile() || stat.size === 0) fail("Backup invalido: esperado arquivo regular nao vazio");

  let validation;
  let pgRestorePath;
  for (const candidate of pgRestoreCandidates()) {
    const result = spawnSync(candidate, ["--list", resolvedPath], {
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });
    if (result.error?.code === "ENOENT") continue;
    if (result.error) fail(`Backup nao validado por pg_restore: ${result.error.message}`);
    validation = result;
    pgRestorePath = candidate;
    break;
  }
  if (!validation) {
    fail("Backup nao validado: pg_restore indisponivel; configure PG_RESTORE_PATH");
  }
  if (validation.status !== 0 || !String(validation.stdout).trim()) {
    fail(`Backup invalido segundo pg_restore: ${String(validation.stderr).trim() || "conteudo nao reconhecido"}`);
  }

  return {
    path: resolvedPath,
    size: stat.size,
    sha256: await sha256File(resolvedPath),
    pgRestorePath,
  };
}

function serviceSetKey(serviceIds) {
  const canonical = JSON.stringify([...new Set(serviceIds)].sort());
  return createHash("sha256").update(canonical).digest("hex");
}

async function collectCounts(client) {
  const pairs = await Promise.all(
    modelDelegates.map(async ([label, delegate]) => [label, delegate, await client[delegate].count()]),
  );
  return pairs;
}

async function databaseDigest(client) {
  const contents = [];
  for (const [label, delegate] of modelDelegates) {
    const rows = await client[delegate].findMany({ orderBy: { id: "asc" } });
    contents.push([label, rows]);
  }
  return createHash("sha256").update(JSON.stringify(contents)).digest("hex").toUpperCase();
}

async function assertCanonicalOwner(client) {
  const users = await client.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      passwordHash: true,
      unitAccesses: {
        select: { id: true, unitId: true, role: true, isActive: true },
      },
    },
  });

  if (users.length !== 1) fail(`Reset recusado: esperado exatamente 1 owner, encontrados ${users.length} usuarios`);
  const owner = users[0];
  const access = owner.unitAccesses[0];
  if (
    owner.id !== OWNER_ID ||
    owner.email !== OWNER_EMAIL ||
    owner.role !== "owner" ||
    !owner.isActive ||
    !owner.passwordHash ||
    owner.unitAccesses.length !== 1 ||
    access.unitId !== UNIT_ID ||
    access.role !== "owner" ||
    !access.isActive
  ) {
    fail("Reset recusado: owner ou vinculo do piloto fora do estado canonico esperado");
  }
  return owner;
}

async function createCanonicalState(tx) {
  await tx.unit.create({
    data: { id: UNIT_ID, name: "Barbearia Geovane Borges", timezone: "America/Sao_Paulo" },
  });

  await tx.businessSettings.create({
    data: {
      id: "settings-geovane-borges",
      unitId: UNIT_ID,
      businessName: "Barbearia Geovane Borges",
      segment: "barbearia",
      displayName: "Barbearia Geovane Borges",
      defaultAppointmentDuration: 30,
      minimumAdvanceMinutes: 30,
      bufferBetweenAppointmentsMinutes: 0,
      allowWalkIns: true,
      allowOutOfHoursAppointments: false,
      allowOverbooking: false,
    },
  });

  await tx.professional.create({
    data: { id: PROFESSIONAL_ID, businessId: UNIT_ID, name: "Geovane Borges", active: true },
  });

  await tx.businessHour.createMany({
    data: businessHours.map((hour) => ({ id: `hours-geovane-${hour.dayOfWeek}`, unitId: UNIT_ID, ...hour })),
  });

  await tx.service.createMany({
    data: services.map((service) => ({
      ...service,
      businessId: UNIT_ID,
      costEstimate: "0.00",
      active: true,
      notes: "piloto-geovane-dado-confirmado",
    })),
  });
  await tx.serviceProfessional.createMany({
    data: services.map((service) => ({
      id: `svcpro-${service.id}-${PROFESSIONAL_ID}`,
      serviceId: service.id,
      professionalId: PROFESSIONAL_ID,
    })),
  });

  await tx.serviceCombinationRule.create({
    data: {
      id: COMBINATION_RULE_ID,
      unitId: UNIT_ID,
      serviceSetKey: serviceSetKey(["svc-geovane-corte", "svc-geovane-barba"]),
      label: "Corte + Barba - 45 min",
      effectiveDurationMin: 45,
      active: true,
    },
  });
  await tx.serviceCombinationRuleItem.createMany({
    data: [
      { id: `${COMBINATION_RULE_ID}-corte`, ruleId: COMBINATION_RULE_ID, serviceId: "svc-geovane-corte", position: 0 },
      { id: `${COMBINATION_RULE_ID}-barba`, ruleId: COMBINATION_RULE_ID, serviceId: "svc-geovane-barba", position: 1 },
    ],
  });

  await tx.product.createMany({
    data: products.map((product) => ({
      ...product,
      businessId: UNIT_ID,
      minStockAlert: 0,
      active: true,
      notes: "piloto-geovane-preco-e-estoque-confirmados",
    })),
  });
  const initialStockOccurredAt = new Date();
  await tx.stockMovement.createMany({
    data: products.map((product) => ({
      id: `stock-initial-${product.id}`,
      unitId: UNIT_ID,
      productId: product.id,
      movementType: "IN",
      quantity: product.stockQty,
      occurredAt: initialStockOccurredAt,
      referenceType: "INITIAL_STOCK",
      referenceId: "reset-geovane-pilot",
    })),
  });
  await tx.paymentMethod.createMany({
    data: paymentMethods.map((method) => ({ ...method, unitId: UNIT_ID, isActive: true })),
  });

  await tx.user.update({
    where: { id: OWNER_ID },
    data: { email: OWNER_EMAIL, name: "Geovane Borges", role: "owner", isActive: true },
  });
  await tx.userUnitAccess.create({
    data: {
      id: OWNER_ACCESS_ID,
      userId: OWNER_ID,
      unitId: UNIT_ID,
      role: "owner",
      isActive: true,
    },
  });
}

async function assertExpectedState(client, originalPasswordHash) {
  for (const [, delegate, count] of await collectCounts(client)) {
    const expected = expectedCounts.get(delegate);
    if (count !== expected) fail(`Estado final invalido: ${delegate}=${count}, esperado=${expected}`);
  }

  const [owner, unit, professional, storedServices, storedProducts, storedPayments, stockMovements, stockAggregate] = await Promise.all([
    assertCanonicalOwner(client),
    client.unit.findUnique({ where: { id: UNIT_ID } }),
    client.professional.findUnique({ where: { id: PROFESSIONAL_ID } }),
    client.service.findMany({ where: { businessId: UNIT_ID }, orderBy: { id: "asc" } }),
    client.product.findMany({ where: { businessId: UNIT_ID }, orderBy: { id: "asc" } }),
    client.paymentMethod.findMany({ where: { unitId: UNIT_ID }, orderBy: { id: "asc" } }),
    client.stockMovement.findMany({ where: { unitId: UNIT_ID }, orderBy: { id: "asc" } }),
    client.product.aggregate({ where: { businessId: UNIT_ID }, _sum: { stockQty: true } }),
  ]);

  if (owner.passwordHash !== originalPasswordHash) fail("Estado final invalido: credencial do owner foi alterada");
  if (unit?.name !== "Barbearia Geovane Borges" || unit.timezone !== "America/Sao_Paulo") {
    fail("Estado final invalido: unidade canonica divergente");
  }
  if (professional?.businessId !== UNIT_ID || professional.name !== "Geovane Borges" || !professional.active) {
    fail("Estado final invalido: profissional canonico divergente");
  }
  if (JSON.stringify(storedServices.map(({ id, name, category, price, durationMin }) => ({ id, name, category, price: price.toFixed(2), durationMin }))) !== JSON.stringify([...services].sort((a, b) => a.id.localeCompare(b.id)))) {
    fail("Estado final invalido: servicos canonicos divergentes");
  }
  if (JSON.stringify(storedProducts.map(({ id, name, category, salePrice, costPrice, stockQty }) => ({ id, name, category, salePrice: salePrice.toFixed(2), costPrice: costPrice.toFixed(2), stockQty }))) !== JSON.stringify([...products].sort((a, b) => a.id.localeCompare(b.id)))) {
    fail("Estado final invalido: produtos ou estoque canonico divergentes");
  }
  if (JSON.stringify(storedPayments.map(({ id, name, isDefault }) => ({ id, name, isDefault }))) !== JSON.stringify([...paymentMethods].sort((a, b) => a.id.localeCompare(b.id)))) {
    fail("Estado final invalido: metodos de pagamento divergentes");
  }
  const storedMovementSummary = stockMovements.map(({ id, productId, movementType, quantity, referenceType, referenceId }) => ({
    id,
    productId,
    movementType,
    quantity,
    referenceType,
    referenceId,
  }));
  const expectedMovementSummary = [...products]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((product) => ({
      id: `stock-initial-${product.id}`,
      productId: product.id,
      movementType: "IN",
      quantity: product.stockQty,
      referenceType: "INITIAL_STOCK",
      referenceId: "reset-geovane-pilot",
    }));
  if (JSON.stringify(storedMovementSummary) !== JSON.stringify(expectedMovementSummary)) {
    fail("Estado final invalido: movimentos oficiais de estoque inicial divergentes");
  }
  if (Number(stockAggregate._sum.stockQty ?? 0) !== CANONICAL_STOCK_TOTAL) {
    fail(`Estado final invalido: estoque inicial deve somar ${CANONICAL_STOCK_TOTAL}`);
  }
}

function printResetPlan(target, counts) {
  console.log("Reset oficial do piloto Geovane");
  console.log(`modo=dry-run`);
  console.log(`alvo_host=${target.host}`);
  console.log(`alvo_banco=${target.database}`);
  console.log("Registros que seriam apagados:");
  for (const [label, , count] of counts) console.log(`- ${label}: ${count}`);
  console.log("Estado canonico que seria recriado/preservado:");
  console.log("- 1 unidade Barbearia Geovane Borges");
  console.log("- 1 owner Geovane Borges, preservando o hash da credencial atual");
  console.log("- 1 profissional Geovane Borges");
  console.log(`- ${services.length} servicos e 1 regra Corte + Barba`);
  console.log(`- ${paymentMethods.length} metodos de pagamento`);
  console.log(`- ${products.length} produtos; estoque inicial canonico total=${CANONICAL_STOCK_TOTAL}`);
  for (const product of products) console.log(`  - ${product.name}: ${product.stockQty}`);
  console.log(`- ${products.length} movimentos oficiais IN com referenceType=INITIAL_STOCK`);
  console.log("- 0 clientes, agendamentos, checkouts, vendas, financeiros e dados de demonstracao");
}

async function runDryRun(prisma, target) {
  const beforeDigest = await databaseDigest(prisma);
  const counts = await collectCounts(prisma);
  await assertCanonicalOwner(prisma);
  printResetPlan(target, counts);
  const afterDigest = await databaseDigest(prisma);
  console.log(`database_sha256_before=${beforeDigest}`);
  console.log(`database_sha256_after=${afterDigest}`);
  console.log(`database_unchanged=${beforeDigest === afterDigest}`);
  if (beforeDigest !== afterDigest) fail("Dry-run invalido: o estado logico do banco mudou durante a leitura");
  console.log("DRY-RUN CONCLUIDO: nenhuma escrita foi executada.");
}

async function runReset(prisma, target, backup) {
  console.log("Reset oficial do piloto Geovane");
  console.log("modo=execute");
  console.log(`alvo_host=${target.host}`);
  console.log(`alvo_banco=${target.database}`);
  console.log(`backup_path=${backup.path}`);
  console.log(`backup_size=${backup.size}`);
  console.log(`backup_sha256=${backup.sha256}`);
  console.log(`backup_validator=${backup.pgRestorePath}`);

  await prisma.$transaction(
    async (tx) => {
      const owner = await assertCanonicalOwner(tx);
      for (const delegate of deletionOrder) await tx[delegate].deleteMany();
      await tx.user.deleteMany({ where: { id: { not: OWNER_ID } } });
      await createCanonicalState(tx);
      await assertExpectedState(tx, owner.passwordHash);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 120_000 },
  );

  const owner = await assertCanonicalOwner(prisma);
  await assertExpectedState(prisma, owner.passwordHash);
  console.log("RESET REAL CONCLUIDO E VALIDADO.");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const target = loadPilotEnvironment();
  const backup = options.dryRun ? undefined : await validateBackup(options.backupPath);
  const prisma = new PrismaClient();

  try {
    if (options.dryRun) await runDryRun(prisma, target);
    else await runReset(prisma, target, backup);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
