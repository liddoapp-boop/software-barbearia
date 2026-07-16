import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import net from "node:net";
import process from "node:process";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const baseUrl = (process.env.SMOKE_BASE_URL || "http://127.0.0.1:3334").replace(/\/+$/, "");
const unitId = process.env.SMOKE_UNIT_ID || "unit-01";
const correlationId = crypto.randomUUID();
const explicitBaseUrl = Boolean(process.env.SMOKE_BASE_URL?.trim());
const production = process.env.NODE_ENV === "production";

let apiProcess = null;

function isLocalSmokeTarget(urlString) {
  try {
    const hostname = new URL(urlString).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function isOperationalLocalTarget(urlString) {
  try {
    const url = new URL(urlString);
    return isLocalSmokeTarget(urlString) && Number(url.port || 80) === 3333;
  } catch {
    return false;
  }
}

if (isOperationalLocalTarget(baseUrl)) {
  throw new Error("Smoke de escrita recusado na porta operacional 3333. Use o modo isolado na porta 3334.");
}

const requiresExplicitCredentials = production || (explicitBaseUrl && !isLocalSmokeTarget(baseUrl));

function readEnvValue(name) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function resolveSmokeCredential(name, localDefault) {
  const value = readEnvValue(name);
  if (value) return value;
  if (requiresExplicitCredentials) {
    throw new Error(
      `${name} deve ser informado para smoke em producao ou endpoint remoto. ` +
        "Configure SMOKE_OWNER_EMAIL e SMOKE_OWNER_PASSWORD no ambiente.",
    );
  }
  return localDefault;
}

const ownerEmail = resolveSmokeCredential("SMOKE_OWNER_EMAIL", "owner@barbearia.local");
const ownerPassword = resolveSmokeCredential("SMOKE_OWNER_PASSWORD", "owner123");

function step(message) {
  console.log(`\n==> ${message}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isPortInUse(port, host) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  return { response, body };
}

async function json(path, options = {}) {
  const result = await request(path, options);
  if (!result.response.ok) {
    throw new Error(`${options.method || "GET"} ${path} retornou ${result.response.status}`);
  }
  return result.body;
}

function responseSummary(body) {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const message = body.error || body.message || body.detail;
    if (message) return String(message);
  }
  if (typeof body === "string" && body.trim()) return body.trim().slice(0, 240);
  return "sem detalhes na resposta";
}

async function loginOwner() {
  const result = await request("/auth/login", {
    method: "POST",
    headers: { "x-auth-mode": "bearer" },
    body: JSON.stringify({
      email: ownerEmail,
      password: ownerPassword,
      activeUnitId: unitId,
    }),
  });

  if (result.response.status === 401) {
    throw new Error(
      `POST /auth/login retornou 401 para ${ownerEmail} na unidade ${unitId}: ` +
        "credenciais invalidas ou usuario inexistente neste ambiente. " +
        "Informe SMOKE_OWNER_EMAIL e SMOKE_OWNER_PASSWORD corretos. A senha nao foi impressa.",
    );
  }

  if (result.response.status === 403) {
    throw new Error(
      `POST /auth/login retornou 403 para ${ownerEmail} na unidade ${unitId}: ` +
        "usuario autenticado sem acesso a SMOKE_UNIT_ID, ou unidade incorreta para o ambiente.",
    );
  }

  if (!result.response.ok) {
    throw new Error(
      `POST /auth/login retornou ${result.response.status}: ${responseSummary(result.body)}`,
    );
  }

  return result.body;
}

async function status(path, headers) {
  const result = await request(path, { headers });
  return result.response.status;
}

async function isHealthy() {
  try {
    const health = await json("/health");
    return health.ok === true;
  } catch {
    return false;
  }
}

async function ensureApiReady() {
  if (await isHealthy()) return;

  const url = new URL(baseUrl);
  const host = url.hostname || "127.0.0.1";
  const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  if (await isPortInUse(port, host)) {
    throw new Error(`Porta ${port} ocupada, mas /health nao respondeu em ${baseUrl}`);
  }

  step("API offline. Iniciando servidor local para o smoke");
  const command = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "npm";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm run dev:isolated"]
    : ["run", "dev:isolated"];
  apiProcess = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  let recentLogs = "";
  const capture = (chunk) => {
    recentLogs = `${recentLogs}${chunk.toString()}`.slice(-4000);
  };
  apiProcess.stdout.on("data", capture);
  apiProcess.stderr.on("data", capture);

  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(500);
    if (await isHealthy()) return;
    if (apiProcess.exitCode != null) break;
  }

  throw new Error(`API nao ficou pronta para smoke.\n${recentLogs}`);
}

function stopApiProcess() {
  if (!apiProcess || apiProcess.exitCode != null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(apiProcess.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-apiProcess.pid, "SIGTERM");
  } catch {
    apiProcess.kill("SIGTERM");
  }
}

async function main() {
  await ensureApiReady();

  step("Verificando health da API");
  const health = await json("/health");
  assert(health.ok === true, "Health check nao retornou ok=true");

  step("Autenticando sessao");
  console.log(`Usuario smoke: ${ownerEmail}`);
  console.log(`Unidade smoke: ${unitId}`);
  const login = await loginOwner();
  assert(login.accessToken, "Login nao retornou accessToken");
  const headers = {
    authorization: `Bearer ${login.accessToken}`,
    "x-correlation-id": correlationId,
  };

  step("Validando permissoes basicas");
  const dashboardDate = new Date().toISOString();
  assert(
    (await status(`/dashboard?unitId=${unitId}&date=${encodeURIComponent(dashboardDate)}`)) === 401,
    "Esperado 401 sem token em rota protegida",
  );
  assert(
    (await status(`/dashboard?unitId=unit-02&date=${encodeURIComponent(dashboardDate)}`, headers)) === 403,
    "Esperado 403 para tentativa cross-unit",
  );

  step("Lendo catalogo");
  const catalog = await json("/catalog", { headers });
  const clientId = catalog.clients?.[0]?.id;
  const professionalId = catalog.professionals?.[0]?.id;
  const service = catalog.services?.[0];
  const product = catalog.products?.find((item) => Number(item.stockQty) > 0);
  assert(clientId, "Catalogo sem cliente");
  assert(professionalId, "Catalogo sem profissional");
  assert(service?.id, "Catalogo sem servico");
  assert(product?.id, "Catalogo sem produto com estoque para venda/devolucao");

  step("Criando agendamento");
  let created = null;
  for (let attempt = 0; attempt < 12 && !created; attempt++) {
    const startsAt = new Date(Date.now() + (30 + 60 * attempt) * 60_000).toISOString();
    const result = await request("/appointments", {
      method: "POST",
      headers,
      body: JSON.stringify({
        unitId,
        clientId,
        professionalId,
        serviceId: service.id,
        startsAt,
        changedBy: "smoke-test@owner",
      }),
    });
    if (result.response.ok) created = result.body;
  }
  const appointmentId = created?.appointment?.id;
  assert(appointmentId, "Agendamento nao retornou id");

  step("Confirmando e iniciando atendimento");
  const confirmed = await json(`/appointments/${appointmentId}/status`, {
    method: "PATCH",
    headers: { ...headers, "idempotency-key": `smoke-status-confirmed-${correlationId}` },
    body: JSON.stringify({ status: "CONFIRMED", changedBy: "smoke-test@owner" }),
  });
  assert(confirmed.appointment.status === "CONFIRMED", "Status esperado CONFIRMED");
  const started = await json(`/appointments/${appointmentId}/status`, {
    method: "PATCH",
    headers: { ...headers, "idempotency-key": `smoke-status-started-${correlationId}` },
    body: JSON.stringify({ status: "IN_SERVICE", changedBy: "smoke-test@owner" }),
  });
  assert(started.appointment.status === "IN_SERVICE", "Status esperado IN_SERVICE");

  step("Finalizando atendimento via checkout");
  const checkout = await json(`/appointments/${appointmentId}/checkout`, {
    method: "POST",
    headers: { ...headers, "idempotency-key": `smoke-checkout-${correlationId}` },
    body: JSON.stringify({
      changedBy: "smoke-test@owner",
      completedAt: new Date(new Date(created.appointment.startsAt).getTime() + 45 * 60_000).toISOString(),
      paymentMethod: "PIX",
      expectedTotal: Number(created.appointment.servicePrice || service.price || service.salePrice || 0),
      notes: "Smoke operacional via checkout",
      products: [],
    }),
  });
  assert(checkout.appointment.status === "COMPLETED", "Status esperado COMPLETED");
  assert(Number(checkout.serviceRevenue.amount) > 0, "Receita do atendimento nao foi gerada");

  step("Registrando venda e devolucao de produto");
  const sale = await json("/sales/products", {
    method: "POST",
    headers: { ...headers, "idempotency-key": `smoke-product-sale-${correlationId}` },
    body: JSON.stringify({
      unitId,
      clientId,
      professionalId,
      soldAt: new Date().toISOString(),
      items: [{ productId: product.id, quantity: 1 }],
    }),
  });
  assert(sale.sale?.id, "Venda de produto nao retornou id");

  const refund = await json(`/sales/products/${sale.sale.id}/refund`, {
    method: "POST",
    headers: { ...headers, "idempotency-key": `smoke-product-refund-${correlationId}` },
    body: JSON.stringify({
      unitId,
      changedBy: "smoke-test@owner",
      reason: "Smoke de devolucao operacional",
      refundedAt: new Date().toISOString(),
      items: [{ productId: product.id, quantity: 1 }],
    }),
  });
  assert(refund.refund?.id, "Devolucao nao retornou refund id");

  step("Consultando relatorios e auditoria");
  const start = new Date(Date.now() - 24 * 3600_000).toISOString();
  const end = new Date(Date.now() + 24 * 3600_000).toISOString();
  const query = `unitId=${unitId}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
  const reportsSummary = await json(`/reports/management/summary?${query}`, { headers });
  assert(reportsSummary.reports?.length >= 5, "Resumo de relatorios nao retornou cards gerenciais");
  const managementFinancial = await json(`/reports/management/financial?${query}&limit=50`, { headers });
  assert(Number(managementFinancial.summary.totalIncome) > 0, "Relatorio financeiro gerencial nao retornou entradas");
  const csv = await request(`/reports/management/export.csv?${query}&type=financial`, { headers });
  assert(csv.response.headers.get("content-type")?.startsWith("text/csv"), "CSV gerencial nao retornou text/csv");
  const audit = await json(`/audit/events?unitId=${unitId}&limit=20`, { headers });
  assert(Array.isArray(audit.events), "Auditoria nao retornou lista de eventos");

  console.log("\nSMOKE TEST CONCLUIDO COM SUCESSO");
  console.log(`Agendamento testado: ${appointmentId}`);
  console.log(`Venda testada: ${sale.sale.id}`);
  console.log(`Refund testado: ${refund.refund.id}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    stopApiProcess();
  });
