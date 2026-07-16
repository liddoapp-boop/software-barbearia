import { closeSync, existsSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  POSTGRES_CONTAINER,
  evolutionApiRequest,
  hashIncident,
  loadEvolutionLocalConfig,
  runCommand,
} from "./evolution-common.mjs";

const DEFAULT_LOCK_PATH = path.join(os.tmpdir(), "software-barbearia-evolution-recover.lock");
const DEFAULT_STATE_PATH = path.join(os.tmpdir(), "software-barbearia-evolution-recover-state.json");

function readJson(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export function assertRecoveryAllowed(state, { nowMs, cooldownMs, incidentId, maxAttempts = 1 }) {
  const lastAttemptAt = Number(state.lastAttemptAt || 0);
  if (lastAttemptAt && nowMs - lastAttemptAt < cooldownMs) {
    throw new Error("Evolution recovery refused: cooldown is active.");
  }
  const attempts = Number(state.incidents?.[incidentId]?.attempts || 0);
  if (attempts >= maxAttempts) {
    throw new Error("Evolution recovery refused: incident attempt limit reached.");
  }
}

export async function withExclusiveRecoveryLock(task, {
  lockPath = DEFAULT_LOCK_PATH,
  nowMs = Date.now(),
  staleAfterMs = 15 * 60_000,
} = {}) {
  if (existsSync(lockPath)) {
    const age = nowMs - statSync(lockPath).mtimeMs;
    if (age > staleAfterMs) unlinkSync(lockPath);
  }

  let fd;
  try {
    fd = openSync(lockPath, "wx", 0o600);
  } catch {
    throw new Error("Evolution recovery refused: another recovery is already running.");
  }

  try {
    return await task();
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(lockPath); } catch {}
  }
}

export async function executeRecoveryCore(deps, {
  nowMs,
  cooldownMs,
  incidentId,
  reason,
  maxAttempts = 1,
}) {
  const state = deps.readState();
  assertRecoveryAllowed(state, { nowMs, cooldownMs, incidentId, maxAttempts });

  const before = await deps.inspect();
  if (!before.safe || !["open", "connecting"].includes(before.connectionState)) {
    throw new Error("Evolution recovery refused: current state is not safe for session-preserving restart.");
  }
  if (!before.sessionFingerprint) {
    throw new Error("Evolution recovery refused: session fingerprint is unavailable.");
  }

  const nextState = {
    lastAttemptAt: nowMs,
    incidents: {
      ...(state.incidents || {}),
      [incidentId]: { attempts: Number(state.incidents?.[incidentId]?.attempts || 0) + 1, reason, status: "started" },
    },
  };
  deps.writeState(nextState);

  try {
    await deps.restart();
    await deps.waitForReconnect();
    const after = await deps.inspect();
    if (!after.safe || after.connectionState !== "open") throw new Error("Evolution did not return to open state.");
    if (after.sessionFingerprint !== before.sessionFingerprint) throw new Error("Session fingerprint changed unexpectedly.");
    nextState.incidents[incidentId].status = "completed";
    deps.writeState(nextState);
    return { before, after, incidentId };
  } catch (error) {
    nextState.incidents[incidentId].status = "failed";
    deps.writeState(nextState);
    throw error;
  }
}

function sessionFingerprint() {
  const inspect = runCommand("docker", ["inspect", POSTGRES_CONTAINER], { allowFailure: true });
  if (inspect.status !== 0) return null;
  const item = JSON.parse(inspect.stdout)[0];
  const env = item?.Config?.Env || [];
  const get = (key) => env.find((entry) => entry.startsWith(`${key}=`))?.slice(key.length + 1) || "";
  const user = get("POSTGRES_USER");
  const database = get("POSTGRES_DB");
  if (!user || !database) return null;
  const sql = "BEGIN TRANSACTION READ ONLY; SELECT md5(creds) FROM evolution_api.\"Session\" LIMIT 1; COMMIT;";
  const result = runCommand("docker", [
    "exec", "-i", POSTGRES_CONTAINER, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", database, "-At",
  ], { input: sql, allowFailure: true });
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).find((line) => /^[a-f0-9]{32}$/.test(line)) || null;
}

async function inspectRecoverySafety(config) {
  let connectionState = null;
  let webhook = null;
  try {
    const state = await evolutionApiRequest(config, `/instance/connectionState/${encodeURIComponent(config.instanceName)}`);
    connectionState = state?.instance?.state || null;
    webhook = await evolutionApiRequest(config, `/webhook/find/${encodeURIComponent(config.instanceName)}`);
  } catch {}

  let backendHealthy = false;
  try {
    backendHealthy = (await fetch(`${config.backendUrl}/health`, { signal: AbortSignal.timeout(4_000) })).status === 200;
  } catch {}

  const webhookSafe = Boolean(
    webhook?.enabled
    && webhook?.url === config.expectedWebhookUrl
    && Array.isArray(webhook?.events)
    && webhook.events.includes("MESSAGES_UPSERT"),
  );
  return {
    connectionState,
    sessionFingerprint: sessionFingerprint(),
    safe: webhookSafe && backendHealthy,
  };
}

export async function runEvolutionRecovery({
  env = process.env,
  reason = "manual",
  incidentId,
  print = console.log,
  lockPath = DEFAULT_LOCK_PATH,
  statePath = DEFAULT_STATE_PATH,
  nowMs = Date.now(),
} = {}) {
  const config = loadEvolutionLocalConfig(env);
  const cooldownMs = Number.isFinite(config.recoveryCooldownMs) && config.recoveryCooldownMs >= 60_000
    ? config.recoveryCooldownMs
    : 600_000;
  const resolvedIncident = incidentId || hashIncident(`manual:${Math.floor(nowMs / cooldownMs)}`);

  return withExclusiveRecoveryLock(async () => {
    print(`Evolution recovery: inicio; motivo=${reason}; sessao sera preservada.`);
    const result = await executeRecoveryCore({
      readState: () => readJson(statePath, { incidents: {} }),
      writeState: (state) => writeJson(statePath, state),
      inspect: () => inspectRecoverySafety(config),
      restart: () => evolutionApiRequest(
        config,
        `/instance/restart/${encodeURIComponent(config.instanceName)}`,
        { method: "POST", body: "{}" },
      ),
      waitForReconnect: () => new Promise((resolve) => setTimeout(resolve, 5_000)),
    }, { nowMs, cooldownMs, incidentId: resolvedIncident, reason, maxAttempts: 1 });
    print("Evolution recovery: concluida; estado=open; webhook=ok; sessao preservada.");
    return result;
  }, { lockPath, nowMs, staleAfterMs: Math.max(cooldownMs, 15 * 60_000) });
}

function parseArg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runEvolutionRecovery({ reason: parseArg("reason") || "manual", incidentId: parseArg("incident") }).catch((error) => {
    console.error(`Evolution recovery failed safely: ${error.message}`);
    process.exitCode = 1;
  });
}
