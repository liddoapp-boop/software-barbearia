const endpoint = (process.env.LOCAL_LLAMA_URL?.trim() || "http://127.0.0.1:11435").replace(/\/$/, "");
const expectedModel = process.env.LOCAL_LLAMA_MODEL?.trim() || "google_gemma-3-4b-it-Q4_K_M.gguf";
const expectedHash = process.env.LOCAL_LLAMA_MODEL_SHA256?.trim().toLowerCase()
  || "4996030242583a40aa151ff93f49ed787ac8c25e4120c3ae4588b2e2a7d1ae94";

async function readJson(path) {
  const response = await fetch(`${endpoint}${path}`, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return await response.json();
}

try {
  const [health, models] = await Promise.all([readJson("/health"), readJson("/v1/models")]);
  const availableModels = Array.isArray(models.data) ? models.data.map((item) => String(item.id ?? "")) : [];
  if (health.status !== "ok") throw new Error(`health inesperado: ${String(health.status)}`);
  console.log(JSON.stringify({
    ok: true,
    endpoint,
    health: health.status,
    expectedModel,
    expectedHash: `sha256:${expectedHash}`,
    availableModels,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    endpoint,
    expectedModel,
    reason: error instanceof Error ? error.message : "local_semantic_unavailable",
  }, null, 2));
  process.exitCode = 1;
}
