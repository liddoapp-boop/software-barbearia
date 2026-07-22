import { createHash } from "node:crypto";
import { closeSync, createReadStream, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { execFile, spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

export const LOCAL_SEMANTIC_HOST = "127.0.0.1";
export const LOCAL_SEMANTIC_PORT = 11435;
export const DEFAULT_LOCAL_LLAMA_MODEL = "google_gemma-3-4b-it-Q4_K_M.gguf";
export const DEFAULT_LOCAL_LLAMA_MODEL_SHA256 = "4996030242583a40aa151ff93f49ed787ac8c25e4120c3ae4588b2e2a7d1ae94";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(scriptDir, "..");
export const runtimeDir = path.join(projectRoot, ".runtime", "local-semantic");
export const statePath = path.join(runtimeDir, "state.json");
export const stdoutPath = path.join(runtimeDir, "llama-server.out.log");
export const stderrPath = path.join(runtimeDir, "llama-server.err.log");
const endpoint = `http://${LOCAL_SEMANTIC_HOST}:${LOCAL_SEMANTIC_PORT}`;

function normalizeSha256(value) {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/^sha256:/, "");
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function existingFile(candidate) {
  if (!candidate || !existsSync(candidate)) return null;
  try {
    return realpathSync(candidate);
  } catch {
    return null;
  }
}

function findVersionedArtifact(root, middleDirectory, fileName) {
  if (!root || !existsSync(root)) return null;
  const releases = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("ai-local-"))
    .map((entry) => path.join(root, entry.name))
    .sort()
    .reverse();
  for (const release of releases) {
    if (middleDirectory === "models") {
      const match = existingFile(path.join(release, "models", fileName));
      if (match) return match;
      continue;
    }
    const directories = readdirSync(release, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(middleDirectory))
      .map((entry) => entry.name)
      .sort()
      .reverse();
    for (const directory of directories) {
      const match = existingFile(path.join(release, directory, fileName));
      if (match) return match;
    }
  }
  return null;
}

export function resolveLlamaServer(env = process.env) {
  const configured = existingFile(env.LOCAL_LLAMA_SERVER_PATH?.trim());
  if (configured) return configured;

  const lookup = spawnSync(process.platform === "win32" ? "where.exe" : "which", [process.platform === "win32" ? "llama-server.exe" : "llama-server"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (lookup.status === 0) {
    const fromPath = existingFile(String(lookup.stdout).split(/\r?\n/).find(Boolean));
    if (fromPath) return fromPath;
  }

  const localRoot = env.LOCALAPPDATA
    ? path.join(env.LOCALAPPDATA, "software-barbearia")
    : path.join(homedir(), "AppData", "Local", "software-barbearia");
  const installed = findVersionedArtifact(localRoot, "llama-", process.platform === "win32" ? "llama-server.exe" : "llama-server");
  if (!installed) throw new Error("llama-server instalado nao foi localizado. Configure LOCAL_LLAMA_SERVER_PATH.");
  return installed;
}

export function resolveExpectedModel(env = process.env) {
  const modelName = env.LOCAL_LLAMA_MODEL?.trim() || DEFAULT_LOCAL_LLAMA_MODEL;
  if (path.basename(modelName) !== modelName) throw new Error("LOCAL_LLAMA_MODEL deve conter somente o nome do arquivo esperado.");
  const configured = existingFile(env.LOCAL_LLAMA_MODEL_PATH?.trim());
  if (configured) {
    if (path.basename(configured) !== modelName) throw new Error("LOCAL_LLAMA_MODEL_PATH nao corresponde ao modelo esperado.");
    return configured;
  }
  const localRoot = env.LOCALAPPDATA
    ? path.join(env.LOCALAPPDATA, "software-barbearia")
    : path.join(homedir(), "AppData", "Local", "software-barbearia");
  const installed = findVersionedArtifact(localRoot, "models", modelName);
  if (!installed) throw new Error(`Modelo local nao localizado: ${modelName}. Configure LOCAL_LLAMA_MODEL_PATH.`);
  return installed;
}

export async function sha256File(filePath) {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function inspectExpectedModel(env = process.env) {
  const model = env.LOCAL_LLAMA_MODEL?.trim() || DEFAULT_LOCAL_LLAMA_MODEL;
  const expectedSha256 = normalizeSha256(env.LOCAL_LLAMA_MODEL_SHA256) || DEFAULT_LOCAL_LLAMA_MODEL_SHA256;
  const modelPath = resolveExpectedModel(env);
  const actualSha256 = await sha256File(modelPath);
  if (actualSha256 !== expectedSha256) {
    throw new Error(`SHA-256 do modelo diverge: esperado ${expectedSha256}, obtido ${actualSha256}.`);
  }
  return { model, modelPath, expectedSha256, actualSha256 };
}

export const requiredHelpFlags = ["--model", "--alias", "--ctx-size", "--parallel", "--host", "--port", "--no-ui"];

export function validateHelpText(helpText) {
  const missing = requiredHelpFlags.filter((flag) => !new RegExp(`(^|\\s)${flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|,|$)`, "m").test(helpText));
  if (missing.length) throw new Error(`llama-server nao confirma as flags necessarias no --help: ${missing.join(", ")}.`);
  return true;
}

export async function validateExecutableFlags(executable) {
  const result = await execFileAsync(executable, ["--help"], { encoding: "utf8", windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  validateHelpText(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
}

export function buildLlamaArgs(modelPath, modelName = DEFAULT_LOCAL_LLAMA_MODEL) {
  return [
    "--model", modelPath,
    "--alias", modelName,
    "--ctx-size", "4096",
    "--parallel", "1",
    "--host", LOCAL_SEMANTIC_HOST,
    "--port", String(LOCAL_SEMANTIC_PORT),
    "--no-ui",
  ];
}

function readState() {
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    return state && Number.isInteger(state.pid) ? state : null;
  } catch {
    return null;
  }
}

function normalizedPath(value) {
  try {
    const normalized = path.resolve(String(value));
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
  } catch {
    return "";
  }
}

export function isOwnedProcess(state, processInfo) {
  if (!state || !processInfo) return false;
  if (Number(processInfo.pid) !== Number(state.pid)) return false;
  if (normalizedPath(processInfo.executablePath) !== normalizedPath(state.executablePath)) return false;
  const commandLine = String(processInfo.commandLine ?? "").toLowerCase();
  const markers = [
    state.modelPath,
    `--port ${LOCAL_SEMANTIC_PORT}`,
    `--host ${LOCAL_SEMANTIC_HOST}`,
    `--alias ${state.model}`,
  ].map((item) => String(item).toLowerCase());
  return markers.every((marker) => commandLine.includes(marker));
}

async function getProcessInfo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (process.platform === "win32") {
    const command = `$p=Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\"; if($p){$p | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress}`;
    try {
      const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8", windowsHide: true });
      if (!stdout.trim()) return null;
      const data = JSON.parse(stdout);
      return { pid: data.ProcessId, executablePath: data.ExecutablePath, commandLine: data.CommandLine };
    } catch {
      return null;
    }
  }
  try {
    const executablePath = realpathSync(`/proc/${pid}/exe`);
    const commandLine = readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ").trim();
    return { pid, executablePath, commandLine };
  } catch {
    return null;
  }
}

async function readJson(pathname, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`${endpoint}${pathname}`, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`${pathname}: HTTP ${response.status}`);
  return await response.json();
}

function modelsMatch(models, expectedModel) {
  return Array.isArray(models?.data)
    && models.data.filter((item) => item && item.id === expectedModel).length === 1;
}

async function healthSnapshot(fetchImpl = globalThis.fetch) {
  const [health, models] = await Promise.all([readJson("/health", fetchImpl), readJson("/v1/models", fetchImpl)]);
  return { health, models, healthy: health?.status === "ok" };
}

async function portIsAvailable() {
  return await new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(LOCAL_SEMANTIC_PORT, LOCAL_SEMANTIC_HOST, () => server.close(() => resolve(true)));
  });
}

async function waitForHealthy(expectedModel, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "health indisponivel";
  while (Date.now() < deadline) {
    try {
      const snapshot = await healthSnapshot();
      if (snapshot.healthy && modelsMatch(snapshot.models, expectedModel)) return snapshot;
      lastError = "health ou modelo ainda nao esta pronto";
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`llama-server nao ficou pronto no prazo: ${lastError}.`);
}

export async function semanticStatus({ env = process.env, print = console.log, printError = console.error } = {}) {
  const state = readState();
  const processInfo = state ? await getProcessInfo(state.pid) : null;
  const owned = isOwnedProcess(state, processInfo);
  let installation = null;
  let installationError = null;
  try {
    installation = await inspectExpectedModel(env);
  } catch (error) {
    installationError = error instanceof Error ? error.message : String(error);
  }
  let snapshot = null;
  let healthError = null;
  try {
    snapshot = await healthSnapshot();
  } catch (error) {
    healthError = error instanceof Error ? error.message : String(error);
  }
  const ok = Boolean(
    state
    && owned
    && installation
    && state.model === installation.model
    && normalizedPath(state.modelPath) === normalizedPath(installation.modelPath)
    && state.modelSha256 === installation.actualSha256
    && snapshot?.healthy
    && modelsMatch(snapshot.models, installation.model),
  );
  const output = {
    ok,
    endpoint,
    owned,
    pid: state?.pid ?? null,
    health: snapshot?.health?.status ?? null,
    model: installation?.model ?? state?.model ?? null,
    modelSha256: installation?.actualSha256 ? `sha256:${installation.actualSha256}` : null,
    availableModels: Array.isArray(snapshot?.models?.data) ? snapshot.models.data.map((item) => item?.id).filter(Boolean) : [],
    logs: { stdout: stdoutPath, stderr: stderrPath },
    error: installationError || healthError || (!state ? "estado do launcher ausente" : !owned ? "processo registrado nao confere" : null),
  };
  (ok ? print : printError)(JSON.stringify(output, null, 2));
  return output;
}

export async function semanticUp({ env = process.env, print = console.log } = {}) {
  const executablePath = resolveLlamaServer(env);
  await validateExecutableFlags(executablePath);
  const installation = await inspectExpectedModel(env);
  const previous = readState();
  if (previous) {
    const processInfo = await getProcessInfo(previous.pid);
    if (processInfo && !isOwnedProcess(previous, processInfo)) {
      throw new Error("PID registrado pertence a outro processo; inicializacao recusada.");
    }
    if (processInfo && isOwnedProcess(previous, processInfo)) {
      const snapshot = await waitForHealthy(installation.model);
      if (!modelsMatch(snapshot.models, installation.model)) throw new Error("Processo existente carregou modelo divergente.");
      return await semanticStatus({ env, print, printError: print });
    }
  }
  if (!(await portIsAvailable())) {
    throw new Error(`Porta ${LOCAL_SEMANTIC_PORT} ja esta ocupada por processo nao reconhecido; nada foi encerrado.`);
  }

  mkdirSync(runtimeDir, { recursive: true });
  const args = buildLlamaArgs(installation.modelPath, installation.model);
  const stdoutFd = openSync(stdoutPath, "a");
  const stderrFd = openSync(stderrPath, "a");
  let child;
  try {
    child = spawn(executablePath, args, {
      cwd: path.dirname(executablePath),
      detached: true,
      windowsHide: true,
      stdio: ["ignore", stdoutFd, stderrFd],
    });
  } finally {
    closeSync(stdoutFd);
    closeSync(stderrFd);
  }
  if (!child.pid) throw new Error("llama-server nao forneceu PID ao iniciar.");
  const state = {
    version: 1,
    pid: child.pid,
    executablePath,
    model: installation.model,
    modelPath: installation.modelPath,
    modelSha256: installation.actualSha256,
    host: LOCAL_SEMANTIC_HOST,
    port: LOCAL_SEMANTIC_PORT,
    args,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  child.unref();
  await waitForHealthy(installation.model);
  return await semanticStatus({ env, print, printError: print });
}

export async function semanticDown({ print = console.log } = {}) {
  const state = readState();
  if (!state) {
    print(JSON.stringify({ ok: true, stopped: false, reason: "servico oficial ja esta parado" }, null, 2));
    return { ok: true, stopped: false };
  }
  const processInfo = await getProcessInfo(state.pid);
  if (!processInfo) {
    unlinkSync(statePath);
    print(JSON.stringify({ ok: true, stopped: false, reason: "estado obsoleto removido; processo nao existia" }, null, 2));
    return { ok: true, stopped: false };
  }
  if (!isOwnedProcess(state, processInfo)) {
    throw new Error("Processo do PID registrado nao corresponde ao llama-server oficial; encerramento recusado.");
  }
  process.kill(state.pid, "SIGTERM");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (!(await getProcessInfo(state.pid))) break;
  }
  if (await getProcessInfo(state.pid)) process.kill(state.pid, "SIGKILL");
  unlinkSync(statePath);
  print(JSON.stringify({ ok: true, stopped: true, pid: state.pid }, null, 2));
  return { ok: true, stopped: true };
}

async function main() {
  const command = process.argv[2];
  if (command === "up") return await semanticUp();
  if (command === "status") return await semanticStatus();
  if (command === "down") return await semanticDown();
  throw new Error("Uso: node scripts/local-semantic-service.mjs <up|status|down>");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((result) => {
    process.exitCode = result?.ok === false ? 1 : 0;
  }).catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  });
}
