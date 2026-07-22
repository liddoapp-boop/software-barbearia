import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

const MODEL = "google_gemma-3-4b-it-Q4_K_M.gguf";
const SHA256 = "4996030242583a40aa151ff93f49ed787ac8c25e4120c3ae4588b2e2a7d1ae94";

async function loadDoctor() {
  return await import(pathToFileURL(join(process.cwd(), "scripts/local-semantic-doctor.mjs")).href) as {
    evaluateLocalSemanticDoctorSnapshot: (
      snapshot: unknown,
      expected: { model: string; sha256: string },
    ) => { ok: boolean; issues: Array<{ code: string }> };
    runLocalSemanticDoctor: (options: Record<string, unknown>) => Promise<{ ok: boolean; issues: Array<{ code: string }> }>;
  };
}

function validSnapshot() {
  return {
    health: { status: "ok" },
    models: { data: [{ id: MODEL }] },
    modelSha256: SHA256,
  };
}

describe("semantic:doctor fail-closed", () => {
  it("aprova somente status, modelo e hash exatos", async () => {
    const doctor = await loadDoctor();
    expect(doctor.evaluateLocalSemanticDoctorSnapshot(validSnapshot(), {
      model: MODEL,
      sha256: SHA256,
    })).toMatchObject({ ok: true, issues: [] });
  });

  it.each([
    ["modelo errado", { models: { data: [{ id: "wrong-model.gguf", sha256: SHA256 }] } }, "model_mismatch"],
    ["hash errado", { modelSha256: "a".repeat(64) }, "model_hash_mismatch"],
    ["hash ausente", { modelSha256: null }, "model_hash_missing"],
    ["health ausente", { health: {} }, "health_fields_missing"],
    ["lista ausente", { models: {} }, "models_fields_missing"],
    ["id ausente", { models: { data: [{ sha256: SHA256 }] } }, "model_fields_missing"],
  ])("reprova %s", async (_label, override, expectedCode) => {
    const doctor = await loadDoctor();
    const result = doctor.evaluateLocalSemanticDoctorSnapshot({ ...validSnapshot(), ...override }, {
      model: MODEL,
      sha256: SHA256,
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain(expectedCode);
  });

  it("mantem falha com health ok quando modelo e hash divergem", async () => {
    const doctor = await loadDoctor();
    const result = doctor.evaluateLocalSemanticDoctorSnapshot({
      health: { status: "ok" },
      models: { data: [{ id: "wrong-model.gguf", sha256: "b".repeat(64) }] },
      modelSha256: "b".repeat(64),
    }, { model: MODEL, sha256: SHA256 });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("model_mismatch");
  });

  it("runner retorna falha fechada para snapshot incorreto", async () => {
    const doctor = await loadDoctor();
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => url.endsWith("/health")
        ? { status: "ok" }
        : { data: [{ id: "wrong-model.gguf", sha256: SHA256 }] },
    }));
    const result = await doctor.runLocalSemanticDoctor({
      env: {},
      fetchImpl,
      inspectModelImpl: vi.fn(async () => ({ actualSha256: SHA256 })),
      print: vi.fn(),
      printError: vi.fn(),
    });
    expect(result.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
