import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(scriptDir, "..");
export const evolutionDir = path.join(projectRoot, "infra", "evolution-local");
export const evolutionComposePath = path.join(evolutionDir, "docker-compose.yml");
export const evolutionLockPath = path.join(evolutionDir, "image-lock.json");
export const API_CONTAINER = "barbearia-evolution-api-local";
export const POSTGRES_CONTAINER = "barbearia-evolution-postgres-local";
export const REDIS_CONTAINER = "barbearia-evolution-redis-local";
export const KNOWN_OFFLINE_QUEUE_ERROR = "Unexpected non-whitespace character after JSON";

export function readEvolutionImageLock() {
  return JSON.parse(readFileSync(evolutionLockPath, "utf8"));
}

function parseEnvFile(filePath) {
  return existsSync(filePath) ? dotenv.parse(readFileSync(filePath)) : {};
}

export function loadEvolutionLocalConfig(env = process.env) {
  const pilot = parseEnvFile(path.join(projectRoot, ".env.pilot.local"));
  const infra = parseEnvFile(path.join(evolutionDir, ".env"));
  const merged = { ...infra, ...pilot, ...env };
  const backendPort = Number(merged.EVOLUTION_ISOLATED_BACKEND_PORT || 3334);
  const evolutionPort = Number(merged.EVOLUTION_API_PORT || 8080);
  return {
    apiUrl: String(merged.EVOLUTION_API_URL || `http://127.0.0.1:${evolutionPort}`).replace(/\/$/, ""),
    apiKey: String(merged.EVOLUTION_API_KEY || merged.AUTHENTICATION_API_KEY || ""),
    instanceName: String(merged.EVOLUTION_INSTANCE_NAME || ""),
    backendUrl: `http://127.0.0.1:${backendPort}`,
    expectedWebhookUrl: String(
      merged.EVOLUTION_EXPECTED_WEBHOOK_URL
      || `http://host.docker.internal:${backendPort}/webhooks/evolution/whatsapp`,
    ),
    autoRecoverEnabled: String(merged.EVOLUTION_AUTO_RECOVER_ENABLED || "false").toLowerCase() === "true",
    recoveryCooldownMs: Number(merged.EVOLUTION_RECOVERY_COOLDOWN_MS || 600_000),
  };
}

export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || projectRoot,
    encoding: "utf8",
    input: options.input,
    timeout: options.timeoutMs || 30_000,
    maxBuffer: options.maxBuffer || 32 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw new Error(`${command} unavailable.`);
  if (result.status !== 0 && !options.allowFailure) throw new Error(`${command} failed with status ${result.status}.`);
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "" };
}

export function dockerJson(args, options = {}) {
  const result = runCommand("docker", args, options);
  if (result.status !== 0 || !result.stdout.trim()) return null;
  return JSON.parse(result.stdout);
}

export async function evolutionApiRequest(config, pathname, init = {}) {
  if (!config.apiKey || !config.instanceName) throw new Error("Evolution local credentials are not configured.");
  const response = await fetch(`${config.apiUrl}${pathname}`, {
    ...init,
    headers: {
      apikey: config.apiKey,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Evolution API returned HTTP ${response.status}.`);
  return response.json();
}

export function hashIncident(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function inspectContainer(name) {
  const data = dockerJson(["inspect", name], { allowFailure: true });
  const item = Array.isArray(data) ? data[0] : null;
  if (!item) return { name, exists: false, running: false, health: "missing" };
  return {
    name,
    exists: true,
    running: Boolean(item.State?.Running),
    status: item.State?.Status || "unknown",
    health: item.State?.Health?.Status || "not-configured",
    startedAt: item.State?.StartedAt || null,
    configuredImage: item.Config?.Image || null,
    imageId: item.Image || null,
    env: Array.isArray(item.Config?.Env) ? item.Config.Env : [],
  };
}

function inspectExpectedImage(image) {
  const data = dockerJson(["image", "inspect", image], { allowFailure: true });
  const item = Array.isArray(data) ? data[0] : null;
  return item ? { exists: true, imageId: item.Id, labels: item.Config?.Labels || {} } : { exists: false };
}

function extractEnv(envList, key) {
  const prefix = `${key}=`;
  const found = envList.find((entry) => entry.startsWith(prefix));
  return found ? found.slice(prefix.length) : "";
}

function queryLastEvolutionMessage() {
  const postgres = inspectContainer(POSTGRES_CONTAINER);
  if (!postgres.running) return null;
  const user = extractEnv(postgres.env, "POSTGRES_USER");
  const database = extractEnv(postgres.env, "POSTGRES_DB");
  if (!user || !database) return null;
  const sql = [
    "BEGIN TRANSACTION READ ONLY;",
    "SELECT COALESCE(MAX(\"messageTimestamp\")::text,'') FROM evolution_api.\"Message\";",
    "COMMIT;",
  ].join("\n");
  const result = runCommand(
    "docker",
    ["exec", "-i", POSTGRES_CONTAINER, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", database, "-At"],
    { input: sql, allowFailure: true },
  );
  if (result.status !== 0) return null;
  const epoch = result.stdout.split(/\r?\n/).map((line) => line.trim()).find((line) => /^\d+$/.test(line));
  return epoch ? new Date(Number(epoch) * 1000).toISOString() : null;
}

function countKnownErrorsSinceStart(container) {
  if (!container.running || !container.startedAt) return 0;
  const result = runCommand("docker", ["logs", "--since", container.startedAt, API_CONTAINER], {
    allowFailure: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  const logs = `${result.stdout}\n${result.stderr}`;
  return logs.split(KNOWN_OFFLINE_QUEUE_ERROR).length - 1;
}

export async function collectEvolutionDoctorSnapshot(config = loadEvolutionLocalConfig()) {
  const lock = readEvolutionImageLock();
  const composeSource = readFileSync(evolutionComposePath, "utf8");
  const api = inspectContainer(API_CONTAINER);
  const postgres = inspectContainer(POSTGRES_CONTAINER);
  const redis = inspectContainer(REDIS_CONTAINER);
  const expectedImage = inspectExpectedImage(lock.runtimeImage);
  let runtimeVersions = null;
  if (api.running) {
    const versionResult = runCommand("docker", [
      "exec", API_CONTAINER, "node", "-e",
      "const fs=require('fs');const app=JSON.parse(fs.readFileSync('/evolution/package.json'));const b=JSON.parse(fs.readFileSync('/evolution/node_modules/baileys/package.json'));console.log(JSON.stringify({evolution:app.version,baileys:b.version}))",
    ], { allowFailure: true });
    if (versionResult.status === 0) runtimeVersions = JSON.parse(versionResult.stdout.trim());
  }

  let connectionState = null;
  let webhook = null;
  try {
    const state = await evolutionApiRequest(config, `/instance/connectionState/${encodeURIComponent(config.instanceName)}`);
    connectionState = state?.instance?.state || null;
    webhook = await evolutionApiRequest(config, `/webhook/find/${encodeURIComponent(config.instanceName)}`);
  } catch {
    // Reported as a failed check without leaking credentials or response bodies.
  }

  let backendStatus = null;
  try {
    backendStatus = (await fetch(`${config.backendUrl}/health`, { signal: AbortSignal.timeout(4_000) })).status;
  } catch {}

  let containerConnectivityStatus = null;
  if (api.running) {
    const connectivity = runCommand("docker", [
      "exec", API_CONTAINER, "node", "-e",
      `fetch('http://host.docker.internal:${new URL(config.backendUrl).port}/health').then(r=>console.log(r.status)).catch(()=>process.exit(2))`,
    ], { allowFailure: true });
    if (connectivity.status === 0) containerConnectivityStatus = Number(connectivity.stdout.trim());
  }

  const lastReceptionAt = queryLastEvolutionMessage();
  return {
    lock,
    composeUsesLatest: /image:\s*[^\n#]*:latest(?:\s|$)/i.test(composeSource),
    composeDeclaresExpectedImage: composeSource.includes(`image: ${lock.runtimeImage}`),
    containers: { api, postgres, redis },
    expectedImage,
    runtimeVersions,
    connectionState,
    webhook: webhook ? {
      enabled: Boolean(webhook.enabled),
      url: webhook.url || null,
      events: Array.isArray(webhook.events) ? webhook.events : [],
    } : null,
    backendStatus,
    containerConnectivityStatus,
    knownOfflineQueueErrors: countKnownErrorsSinceStart(api),
    lastReceptionAt,
    lastWebhookAt: webhook?.enabled && webhook?.events?.includes("MESSAGES_UPSERT") ? lastReceptionAt : null,
    lastWebhookAtIsInferred: true,
  };
}

export function evaluateEvolutionDoctorSnapshot(snapshot, config = loadEvolutionLocalConfig()) {
  const issues = [];
  const check = (condition, code, message, severity = "error") => {
    if (!condition) issues.push({ code, message, severity });
  };
  const { lock } = snapshot;
  check(!snapshot.composeUsesLatest, "latest_forbidden", "Compose must not use a mutable latest tag.");
  check(snapshot.composeDeclaresExpectedImage, "compose_image_mismatch", "Compose image differs from image-lock.json.");
  check(snapshot.expectedImage?.exists, "expected_image_missing", "Expected local Evolution image is not built.");
  check(snapshot.containers.api?.running, "api_not_running", "Evolution API container is not running.");
  check(snapshot.containers.postgres?.running, "postgres_not_running", "Evolution PostgreSQL container is not running.");
  check(snapshot.containers.redis?.running, "redis_not_running", "Evolution Redis container is not running.");
  check(snapshot.containers.api?.health === "healthy", "api_unhealthy", "Evolution API container health is not healthy.");
  check(snapshot.containers.postgres?.health === "healthy", "postgres_unhealthy", "Evolution PostgreSQL container health is not healthy.");
  check(snapshot.containers.redis?.health === "healthy", "redis_unhealthy", "Evolution Redis container health is not healthy.");
  check(snapshot.containers.api?.configuredImage === lock.runtimeImage, "runtime_tag_mismatch", "Running container uses a different image tag.");
  check(snapshot.containers.api?.imageId === snapshot.expectedImage?.imageId, "runtime_digest_mismatch", "Running image ID differs from the locked local image.");
  check(snapshot.expectedImage?.labels?.["software-barbearia.evolution.base-ref"] === lock.baseRef, "base_digest_mismatch", "Local image base digest differs from image-lock.json.");
  check(snapshot.expectedImage?.labels?.["software-barbearia.evolution.patch"] === lock.patchVersion, "patch_label_mismatch", "Local image patch label is missing or divergent.");
  check(snapshot.runtimeVersions?.evolution === lock.evolutionVersion, "evolution_version_mismatch", "Evolution runtime version is divergent.");
  check(snapshot.runtimeVersions?.baileys === lock.baileysVersion, "baileys_version_mismatch", "Baileys runtime version is divergent.");
  check(snapshot.connectionState === "open", "connection_not_open", "Evolution instance is not open.");
  check(snapshot.backendStatus === 200, "backend_unhealthy", "Isolated backend health check failed.");
  check(snapshot.webhook?.enabled, "webhook_disabled", "Evolution webhook is disabled.");
  check(snapshot.webhook?.url === config.expectedWebhookUrl, "webhook_url_mismatch", "Evolution webhook destination is incorrect.");
  check(snapshot.webhook?.events?.includes("MESSAGES_UPSERT"), "messages_upsert_disabled", "MESSAGES_UPSERT is not enabled.");
  check(snapshot.containerConnectivityStatus === 200, "container_connectivity_failed", "Evolution container cannot reach backend health endpoint.");
  check(snapshot.knownOfflineQueueErrors === 0, "known_offline_queue_error", "Known Baileys offline queue error occurred since container start.");
  return { ok: issues.every((issue) => issue.severity !== "error"), issues };
}
