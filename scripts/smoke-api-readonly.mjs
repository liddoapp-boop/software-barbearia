import crypto from "node:crypto";
import process from "node:process";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const requiredEnv = [
  "SMOKE_BASE_URL",
  "SMOKE_OWNER_EMAIL",
  "SMOKE_OWNER_PASSWORD",
  "SMOKE_UNIT_ID",
];

const missingEnv = requiredEnv.filter((name) => !process.env[name]?.trim());
if (missingEnv.length) {
  console.error(`Variaveis obrigatorias ausentes: ${missingEnv.join(", ")}`);
  console.error("Configure as variaveis SMOKE_* no ambiente. Valores nao devem ser impressos.");
  process.exit(2);
}

const baseUrl = process.env.SMOKE_BASE_URL.trim().replace(/\/+$/, "");
const ownerEmail = process.env.SMOKE_OWNER_EMAIL.trim();
const ownerPassword = process.env.SMOKE_OWNER_PASSWORD.trim();
const unitId = process.env.SMOKE_UNIT_ID.trim();
const requestTimeoutMs = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || 10_000);
const correlationId = crypto.randomUUID();

function step(message) {
  console.log(`\n==> ${message}`);
}

function pass(label, status) {
  console.log(`OK ${label}: ${status}`);
}

function fail(message) {
  throw new Error(message);
}

function summarizeBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "payload validado";
  return Object.entries(body)
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}=array(${value.length})`;
      if (value && typeof value === "object") return `${key}=object`;
      return `${key}=${typeof value}`;
    })
    .join(", ");
}

function buildQuery(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) query.set(key, String(value));
  }
  return query.toString();
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    return { response, body, contentType };
  } catch (error) {
    if (error?.name === "AbortError") {
      fail(`${options.method || "GET"} requisicao excedeu timeout de ${requestTimeoutMs}ms`);
    }
    fail(`${options.method || "GET"} requisicao falhou sem expor URL ou parametros`);
  } finally {
    clearTimeout(timeout);
  }
}

async function expectJson(label, path, headers, validate = () => true) {
  const result = await request(path, { headers });
  if (!result.response.ok) {
    fail(`${label} retornou HTTP ${result.response.status}`);
  }
  if (!result.contentType.includes("application/json")) {
    fail(`${label} nao retornou JSON`);
  }
  if (!validate(result.body)) {
    fail(`${label} retornou payload fora do contrato minimo`);
  }
  pass(`${label} (${summarizeBody(result.body)})`, result.response.status);
  return result.body;
}

async function expectStatus(label, path, expectedStatuses, options = {}) {
  const result = await request(path, options);
  if (!expectedStatuses.includes(result.response.status)) {
    fail(`${label} retornou HTTP ${result.response.status}`);
  }
  pass(label, result.response.status);
  return result;
}

function hasOwnerRole(role) {
  return String(role || "").toUpperCase() === "OWNER";
}

async function main() {
  step("Validando health publico");
  await expectJson("GET /health", "/health", undefined, (body) => body?.ok === true);

  step("Validando pagina publica");
  await expectStatus("GET /", "/", [200]);

  const now = new Date();
  const todayStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0,
  ));
  const todayEnd = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    23,
    59,
    59,
    999,
  ));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  const dashboardQuery = buildQuery({ unitId, date: now.toISOString() });
  const todayRangeQuery = buildQuery({
    unitId,
    start: todayStart.toISOString(),
    end: todayEnd.toISOString(),
  });
  const monthRangeQuery = buildQuery({
    unitId,
    start: monthStart.toISOString(),
    end: monthEnd.toISOString(),
  });

  step("Validando protecao sem token");
  await expectStatus("GET /dashboard sem token", `/dashboard?${dashboardQuery}`, [401, 403]);

  step("Autenticando owner");
  const login = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: ownerEmail,
      password: ownerPassword,
      activeUnitId: unitId,
    }),
  });
  if (login.response.status === 401 || login.response.status === 403) {
    fail(`POST /auth/login retornou HTTP ${login.response.status}`);
  }
  if (!login.response.ok || !login.contentType.includes("application/json") || !login.body?.accessToken) {
    fail("POST /auth/login nao retornou accessToken valido");
  }
  pass("POST /auth/login", login.response.status);

  const headers = {
    authorization: `Bearer ${login.body.accessToken}`,
    "x-correlation-id": `smoke-readonly-${correlationId}`,
  };

  step("Validando sessao autenticada");
  await expectJson("GET /auth/me", "/auth/me", headers, (body) => {
    const user = body?.user;
    return Boolean(user?.id) && hasOwnerRole(user.role) && user.activeUnitId === unitId;
  });

  step("Validando agenda");
  await expectJson(
    "GET /agenda/range",
    `/agenda/range?${todayRangeQuery}`,
    headers,
    (body) => Array.isArray(body?.appointments) && Boolean(body?.workingHours),
  );

  step("Validando clientes");
  await expectJson(
    "GET /clients",
    `/clients?${buildQuery({ unitId, limit: 5 })}`,
    headers,
    (body) => Array.isArray(body?.clients),
  );

  step("Validando PDV/catalogo");
  await expectJson(
    "GET /catalog",
    `/catalog?${buildQuery({ unitId })}`,
    headers,
    (body) => Array.isArray(body?.services) && Array.isArray(body?.products),
  );

  step("Validando financeiro");
  await expectJson(
    "GET /financial/summary",
    `/financial/summary?${monthRangeQuery}`,
    headers,
    (body) => Boolean(body?.summary),
  );
  await expectJson(
    "GET /financial/transactions",
    `/financial/transactions?${buildQuery({
      unitId,
      start: monthStart.toISOString(),
      end: monthEnd.toISOString(),
      limit: 5,
    })}`,
    headers,
    (body) => Array.isArray(body?.transactions),
  );

  step("Validando servicos");
  await expectJson(
    "GET /services",
    `/services?${buildQuery({ unitId })}`,
    headers,
    (body) => Array.isArray(body?.services),
  );

  step("Validando auditoria owner-only");
  await expectJson(
    "GET /audit/events",
    `/audit/events?${buildQuery({ unitId, limit: 5 })}`,
    headers,
    (body) => Array.isArray(body?.events),
  );

  step("Validando configuracoes");
  await expectJson(
    "GET /settings",
    `/settings?${buildQuery({ unitId })}`,
    headers,
    (body) => Boolean(body) && typeof body === "object" && !Array.isArray(body),
  );

  step("Validando relatorios gerenciais");
  await expectJson(
    "GET /reports/management/summary",
    `/reports/management/summary?${monthRangeQuery}`,
    headers,
    (body) => Array.isArray(body?.reports),
  );

  console.log("\nSMOKE READONLY CONCLUIDO COM SUCESSO");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
