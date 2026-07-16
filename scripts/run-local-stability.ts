import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { createApp } from "../src/http/app";

const durationMs = Math.max(5_000, Number(process.env.STABILITY_DURATION_MS ?? 30_000));
process.env.NODE_ENV = "test";
process.env.DATA_BACKEND = "memory";
process.env.AUTH_ENFORCED = "true";
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "local-stability-secret-32-characters-minimum";
process.env.HTTP_LOG_ENABLED = "false";
process.env.RATE_LIMIT_AUTHENTICATED_MAX = "100000";
process.env.RATE_LIMIT_REPORTS_MAX = "100000";
process.env.AI_WHATSAPP_ENABLED = "true";
process.env.AI_AUDIO_TRANSCRIPTION_ENABLED = "false";
process.env.AI_WHATSAPP_OWNER_PHONE = "5511999999999";
process.env.AI_WHATSAPP_UNIT_ID = "unit-01";
process.env.EVOLUTION_WEBHOOK_SECRET = "local-stability-webhook-secret";
process.env.EVOLUTION_API_URL = "http://evolution.invalid";
process.env.EVOLUTION_API_KEY = "local-stability-key";
process.env.EVOLUTION_INSTANCE_NAME = "local-stability";

let simulatedExternalCalls = 0;
globalThis.fetch = (async () => {
  simulatedExternalCalls += 1;
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

function percentile(values: number[], fraction: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

async function main() {
  const app = createApp();
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "owner@barbearia.local", password: "owner123", activeUnitId: "unit-01" },
  });
  if (login.statusCode !== 200) throw new Error("stability_login_failed");
  const authorization = `Bearer ${login.json().accessToken}`;
  const routes = [
    { url: "/health/live", authenticated: false },
    { url: "/health/ready", authenticated: false },
    { url: "/catalog?unitId=unit-01", authenticated: true },
    { url: "/appointments?unitId=unit-01", authenticated: true },
    { url: "/inventory?unitId=unit-01", authenticated: true },
    { url: "/financial/summary?unitId=unit-01&start=2026-07-01T00:00:00.000Z&end=2026-07-31T23:59:59.999Z", authenticated: true },
  ];
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  const memoryBefore = process.memoryUsage();
  const cpuBefore = process.cpuUsage();
  const handlesBefore = (process as NodeJS.Process & { _getActiveHandles?: () => unknown[] })._getActiveHandles?.().length ?? null;
  const latencies: number[] = [];
  const statusCounts = new Map<number, number>();
  let unexpectedErrors = 0;
  let iterations = 0;
  let simulatedTextMessages = 0;
  let controlledSales = 0;
  const startedAt = performance.now();

  while (performance.now() - startedAt < durationMs) {
    iterations += 1;
    for (const route of routes) {
      const requestStarted = performance.now();
      const response = await app.inject({
        method: "GET",
        url: route.url,
        headers: route.authenticated ? { authorization } : undefined,
      });
      latencies.push(performance.now() - requestStarted);
      statusCounts.set(response.statusCode, (statusCounts.get(response.statusCode) ?? 0) + 1);
      if (response.statusCode >= 500 || response.statusCode === 429) unexpectedErrors += 1;
    }
    if (iterations % 10 === 0) {
      const message = await app.inject({
        method: "POST",
        url: "/webhooks/evolution/whatsapp",
        headers: { "x-evolution-webhook-secret": "local-stability-webhook-secret" },
        payload: {
          instance: "local-stability",
          data: {
            key: {
              id: `stability-message-${iterations}`,
              remoteJid: "5511999999999@s.whatsapp.net",
              fromMe: false,
            },
            message: { conversation: "Qual o estoque atual?" },
          },
        },
      });
      simulatedTextMessages += 1;
      statusCounts.set(message.statusCode, (statusCounts.get(message.statusCode) ?? 0) + 1);
      if (message.statusCode >= 500 || message.statusCode === 429) unexpectedErrors += 1;
    }
    if (iterations % 50 === 0 && controlledSales < 4) {
      const sale = await app.inject({
        method: "POST",
        url: "/sales/products",
        headers: {
          authorization,
          "idempotency-key": `stability-sale-${iterations}`,
        },
        payload: {
          unitId: "unit-01",
          soldAt: new Date(Date.UTC(2026, 6, 20, 15, controlledSales)).toISOString(),
          professionalId: "pro-01",
          clientId: "cli-01",
          paymentMethod: "PIX",
          items: [{ productId: "prd-oleo-barba", quantity: 1 }],
        },
      });
      controlledSales += 1;
      statusCounts.set(sale.statusCode, (statusCounts.get(sale.statusCode) ?? 0) + 1);
      if (sale.statusCode >= 500 || sale.statusCode === 429) unexpectedErrors += 1;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await app.close();
  delay.disable();
  const elapsedMs = performance.now() - startedAt;
  const memoryAfter = process.memoryUsage();
  const cpu = process.cpuUsage(cpuBefore);
  const handlesAfter = (process as NodeJS.Process & { _getActiveHandles?: () => unknown[] })._getActiveHandles?.().length ?? null;
  const result = {
    durationMs: Math.round(elapsedMs),
    requests: latencies.length,
    unexpectedErrors,
    statusCounts: Object.fromEntries([...statusCounts.entries()].sort(([a], [b]) => a - b)),
    latencyMs: {
      p50: Number(percentile(latencies, 0.5).toFixed(2)),
      p95: Number(percentile(latencies, 0.95).toFixed(2)),
      max: Number(Math.max(...latencies).toFixed(2)),
    },
    memoryBytes: {
      rssBefore: memoryBefore.rss,
      rssAfter: memoryAfter.rss,
      heapUsedBefore: memoryBefore.heapUsed,
      heapUsedAfter: memoryAfter.heapUsed,
      heapDelta: memoryAfter.heapUsed - memoryBefore.heapUsed,
    },
    cpuMs: {
      user: Number((cpu.user / 1000).toFixed(2)),
      system: Number((cpu.system / 1000).toFixed(2)),
    },
    eventLoopDelayMs: {
      mean: Number((delay.mean / 1e6).toFixed(2)),
      p95: Number((delay.percentile(95) / 1e6).toFixed(2)),
      max: Number((delay.max / 1e6).toFixed(2)),
    },
    activeHandles: { before: handlesBefore, after: handlesAfter },
    workload: { iterations, simulatedTextMessages, controlledSales, simulatedExternalCalls },
    backend: "memory-disposable",
    externalProvidersCalled: false,
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (unexpectedErrors > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : "stability_failed" })}\n`);
  process.exitCode = 1;
});
