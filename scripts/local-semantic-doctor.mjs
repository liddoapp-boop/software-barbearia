import { pathToFileURL } from "node:url";
import {
  DEFAULT_LOCAL_LLAMA_MODEL,
  DEFAULT_LOCAL_LLAMA_MODEL_SHA256,
  inspectExpectedModel,
} from "./local-semantic-service.mjs";

export { DEFAULT_LOCAL_LLAMA_MODEL, DEFAULT_LOCAL_LLAMA_MODEL_SHA256 };

function normalizeSha256(value) {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/^sha256:/, "");
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function advertisedModelSha256(model) {
  if (!model || typeof model !== "object") return null;
  const meta = model.meta && typeof model.meta === "object" ? model.meta : {};
  return normalizeSha256(
    model.sha256
    ?? model.sha_256
    ?? model.hash
    ?? meta.sha256
    ?? meta.sha_256
    ?? meta.hash,
  );
}

export function evaluateLocalSemanticDoctorSnapshot(snapshot, expected) {
  const issues = [];
  const expectedModel = typeof expected?.model === "string" ? expected.model.trim() : "";
  const expectedHash = normalizeSha256(expected?.sha256);
  if (!expectedModel) issues.push({ code: "expected_model_missing", message: "Expected model is missing." });
  if (!expectedHash) issues.push({ code: "expected_hash_invalid", message: "Expected SHA-256 is missing or invalid." });

  const health = snapshot?.health;
  if (!health || typeof health !== "object" || typeof health.status !== "string") {
    issues.push({ code: "health_fields_missing", message: "Health response is missing required fields." });
  } else if (health.status !== "ok") {
    issues.push({ code: "health_not_ok", message: `Unexpected health status: ${health.status}.` });
  }

  const data = snapshot?.models && typeof snapshot.models === "object" ? snapshot.models.data : undefined;
  if (!Array.isArray(data)) {
    issues.push({ code: "models_fields_missing", message: "Models response is missing data[]." });
    return { ok: false, issues, availableModels: [], actualHash: null };
  }
  const validModels = data.filter((item) => item && typeof item === "object" && typeof item.id === "string");
  if (validModels.length !== data.length) {
    issues.push({ code: "model_fields_missing", message: "A model entry is missing its id." });
  }
  const availableModels = validModels.map((item) => item.id);
  const exactMatches = validModels.filter((item) => item.id === expectedModel);
  if (exactMatches.length !== 1) {
    issues.push({ code: "model_mismatch", message: "Loaded model does not exactly match the expected model." });
  }
  const actualHash = normalizeSha256(snapshot?.modelSha256)
    ?? (exactMatches.length === 1 ? advertisedModelSha256(exactMatches[0]) : null);
  if (exactMatches.length === 1 && !actualHash) {
    issues.push({ code: "model_hash_missing", message: "Loaded model SHA-256 is missing or invalid." });
  } else if (exactMatches.length === 1 && expectedHash && actualHash !== expectedHash) {
    issues.push({ code: "model_hash_mismatch", message: "Loaded model SHA-256 differs from the expected hash." });
  }
  return { ok: issues.length === 0, issues, availableModels, actualHash };
}

async function readJson(endpoint, pathname, fetchImpl) {
  const response = await fetchImpl(`${endpoint}${pathname}`, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`${pathname}: HTTP ${response.status}`);
  return await response.json();
}

export async function runLocalSemanticDoctor({
  env = process.env,
  fetchImpl = globalThis.fetch,
  inspectModelImpl = inspectExpectedModel,
  print = console.log,
  printError = console.error,
} = {}) {
  const endpoint = (env.LOCAL_LLAMA_URL?.trim() || "http://127.0.0.1:11435").replace(/\/$/, "");
  const expectedModel = env.LOCAL_LLAMA_MODEL?.trim() || DEFAULT_LOCAL_LLAMA_MODEL;
  const expectedHash = env.LOCAL_LLAMA_MODEL_SHA256?.trim().toLowerCase() || DEFAULT_LOCAL_LLAMA_MODEL_SHA256;
  try {
    const [health, models, installation] = await Promise.all([
      readJson(endpoint, "/health", fetchImpl),
      readJson(endpoint, "/v1/models", fetchImpl),
      inspectModelImpl(env),
    ]);
    const evaluation = evaluateLocalSemanticDoctorSnapshot(
      { health, models, modelSha256: installation.actualSha256 },
      { model: expectedModel, sha256: expectedHash },
    );
    const output = {
      ok: evaluation.ok,
      endpoint,
      health: health && typeof health === "object" ? health.status ?? null : null,
      expectedModel,
      expectedHash: `sha256:${expectedHash}`,
      actualHash: evaluation.actualHash ? `sha256:${evaluation.actualHash}` : null,
      availableModels: evaluation.availableModels,
      issues: evaluation.issues,
    };
    (evaluation.ok ? print : printError)(JSON.stringify(output, null, 2));
    return evaluation;
  } catch (error) {
    const evaluation = {
      ok: false,
      issues: [{
        code: "local_semantic_unavailable",
        message: error instanceof Error ? error.message : "local_semantic_unavailable",
      }],
      availableModels: [],
      actualHash: null,
    };
    printError(JSON.stringify({
      ok: false,
      endpoint,
      expectedModel,
      issues: evaluation.issues,
    }, null, 2));
    return evaluation;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLocalSemanticDoctor().then((evaluation) => {
    process.exitCode = evaluation.ok ? 0 : 1;
  }).catch((error) => {
    console.error(`Local semantic doctor failed safely: ${error.message}`);
    process.exitCode = 1;
  });
}
