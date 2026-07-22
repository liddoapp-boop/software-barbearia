import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function importMjs(relativePath: string) {
  return import(`${pathToFileURL(join(process.cwd(), relativePath)).href}?test=${Date.now()}-${Math.random()}`);
}

function baseDoctorSnapshot() {
  const lock = {
    runtimeImage: "software-barbearia/evolution-api:2.3.7-local.1",
    baseRef: "evoapicloud/evolution-api:v2.3.7@sha256:locked",
    baseDigest: "sha256:locked",
    evolutionVersion: "2.3.7",
    baileysVersion: "7.0.0-rc.9",
    patchVersion: "software-barbearia-offline-queue-v1",
  };
  return {
    lock,
    composeUsesLatest: false,
    composeDeclaresExpectedImage: true,
    containers: {
      api: { running: true, status: "running", health: "healthy", configuredImage: lock.runtimeImage, imageId: "sha256:runtime" },
      postgres: { running: true, health: "healthy" },
      redis: { running: true, health: "healthy" },
    },
    expectedImage: {
      exists: true,
      imageId: "sha256:runtime",
      labels: {
        "software-barbearia.evolution.base-ref": lock.baseRef,
        "software-barbearia.evolution.patch": lock.patchVersion,
      },
    },
    runtimeVersions: { evolution: "2.3.7", baileys: "7.0.0-rc.9" },
    connectionState: "open",
    backendStatus: 200,
    containerConnectivityStatus: 200,
    webhook: {
      enabled: true,
      url: "http://host.docker.internal:3334/webhooks/evolution/whatsapp",
      events: ["MESSAGES_UPSERT"],
    },
    knownOfflineQueueErrors: 0,
    lastReceptionAt: "2026-07-16T15:10:07.000Z",
    lastWebhookAt: "2026-07-16T15:10:07.000Z",
  };
}

describe("Evolution local hardening", () => {
  it("fixa imagem/base por versao e digest e nunca usa latest", () => {
    const compose = readFileSync(join(process.cwd(), "infra/evolution-local/docker-compose.yml"), "utf8");
    const dockerfile = readFileSync(join(process.cwd(), "infra/evolution-local/Dockerfile"), "utf8");
    const lock = JSON.parse(readFileSync(join(process.cwd(), "infra/evolution-local/image-lock.json"), "utf8"));
    expect(compose).toContain(`image: ${lock.runtimeImage}`);
    expect(compose).not.toMatch(/image:\s*[^\n]*:latest/);
    expect(dockerfile).toContain(lock.baseRef);
    expect(lock.baseDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("descarta messageStubParameters malformado e processa o evento valido seguinte", async () => {
    type FixtureNode = { params?: unknown[]; id?: string };
    const hardening = await importMjs("infra/evolution-local/patches/software-barbearia-hardening.mjs") as {
      safeParseMessageStubParameters: (values: unknown[]) => unknown[];
      makeSafeOfflineNodeProcessor: (
        handlers: Map<string, (node: FixtureNode) => Promise<void>>,
        deps: { isWsOpen: () => boolean; onUnexpectedError: (error: Error, context: string) => void },
      ) => {
        enqueue: (type: string, node: { params?: unknown[]; id?: string }) => void;
        whenIdle: () => Promise<void>;
        diagnosticState: () => { isProcessing: boolean; queued: number };
      };
    };
    const persisted: string[] = [];
    const webhook: string[] = [];
    const errors: string[] = [];
    const handlers = new Map<string, (node: FixtureNode) => Promise<void>>([
      ["notification", async (node) => {
        const participants = hardening.safeParseMessageStubParameters(node.params || []);
        expect(participants).toEqual([]);
      }],
      ["message", async (node) => {
        persisted.push(String(node.id));
        webhook.push(String(node.id));
      }],
    ]);
    const processor = hardening.makeSafeOfflineNodeProcessor(handlers, {
      isWsOpen: () => true,
      onUnexpectedError: (_error, context) => errors.push(context),
    });

    processor.enqueue("notification", { params: ['{"lid":"ok"} trailing-garbage'] });
    processor.enqueue("message", { id: "valid-after-malformed" });
    await processor.whenIdle();

    expect(persisted).toEqual(["valid-after-malformed"]);
    expect(webhook).toEqual(["valid-after-malformed"]);
    expect(errors).toEqual([]);
    expect(processor.diagnosticState()).toEqual({ isProcessing: false, queued: 0 });
  });

  it("restaura isProcessing em finally mesmo quando um handler falha", async () => {
    const hardening = await importMjs("infra/evolution-local/patches/software-barbearia-hardening.mjs");
    const processed: string[] = [];
    const processor = hardening.makeSafeOfflineNodeProcessor(new Map([
      ["notification", async () => { throw new Error("fixture failure"); }],
      ["message", async (node: { id: string }) => { processed.push(node.id); }],
    ]), { isWsOpen: () => true, onUnexpectedError: () => undefined });
    processor.enqueue("notification", {});
    processor.enqueue("message", { id: "still-processed" });
    await processor.whenIdle();
    expect(processed).toEqual(["still-processed"]);
    expect(processor.diagnosticState().isProcessing).toBe(false);
  });
});

describe("evolution:doctor", () => {
  it("aprova somente o contrato integralmente healthy", async () => {
    const common = await importMjs("scripts/evolution-common.mjs");
    const result = common.evaluateEvolutionDoctorSnapshot(baseDoctorSnapshot(), {
      expectedWebhookUrl: "http://host.docker.internal:3334/webhooks/evolution/whatsapp",
    });
    expect(result).toEqual({ ok: true, issues: [] });
  });

  it.each([
    ["api", "unhealthy", "api_unhealthy"],
    ["api", "starting", "api_unhealthy"],
    ["api", undefined, "api_unhealthy"],
    ["postgres", "unhealthy", "postgres_unhealthy"],
    ["postgres", "starting", "postgres_unhealthy"],
    ["postgres", undefined, "postgres_unhealthy"],
    ["redis", "unhealthy", "redis_unhealthy"],
    ["redis", "starting", "redis_unhealthy"],
    ["redis", undefined, "redis_unhealthy"],
  ])("reprova %s com health %s", async (service, health, expectedCode) => {
    const common = await importMjs("scripts/evolution-common.mjs");
    const snapshot = baseDoctorSnapshot();
    const containers = snapshot.containers as Record<string, { running: boolean; health?: string }>;
    containers[service].health = health;
    const result = common.evaluateEvolutionDoctorSnapshot(snapshot, {
      expectedWebhookUrl: "http://host.docker.internal:3334/webhooks/evolution/whatsapp",
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue: { code: string }) => issue.code)).toContain(expectedCode);
  });

  it.each([
    ["api", "api_not_running"],
    ["postgres", "postgres_not_running"],
    ["redis", "redis_not_running"],
  ])("reprova %s parado", async (service, expectedCode) => {
    const common = await importMjs("scripts/evolution-common.mjs");
    const snapshot = baseDoctorSnapshot();
    const containers = snapshot.containers as Record<string, { running: boolean; health?: string }>;
    containers[service].running = false;
    const result = common.evaluateEvolutionDoctorSnapshot(snapshot, {
      expectedWebhookUrl: "http://host.docker.internal:3334/webhooks/evolution/whatsapp",
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue: { code: string }) => issue.code)).toContain(expectedCode);
  });

  it.each([
    ["latest_forbidden", { composeUsesLatest: true }],
    ["runtime_digest_mismatch", { containers: { ...baseDoctorSnapshot().containers, api: { ...baseDoctorSnapshot().containers.api, imageId: "sha256:other" } } }],
    ["webhook_url_mismatch", { webhook: { ...baseDoctorSnapshot().webhook, url: "http://wrong.invalid/webhook" } }],
    ["known_offline_queue_error", { knownOfflineQueueErrors: 1 }],
  ])("detecta %s", async (expectedCode, override) => {
    const common = await importMjs("scripts/evolution-common.mjs");
    const snapshot = { ...baseDoctorSnapshot(), ...override };
    const result = common.evaluateEvolutionDoctorSnapshot(snapshot, {
      expectedWebhookUrl: "http://host.docker.internal:3334/webhooks/evolution/whatsapp",
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue: { code: string }) => issue.code)).toContain(expectedCode);
  });

  it("nao interpreta inatividade como travamento", async () => {
    const common = await importMjs("scripts/evolution-common.mjs");
    const result = common.evaluateEvolutionDoctorSnapshot({
      ...baseDoctorSnapshot(),
      lastReceptionAt: null,
      lastWebhookAt: null,
    }, { expectedWebhookUrl: "http://host.docker.internal:3334/webhooks/evolution/whatsapp" });
    expect(result.ok).toBe(true);
  });
});

describe("evolution:recover", () => {
  it("reutiliza a mesma sessao e nao oferece operacao destrutiva", async () => {
    const recover = await importMjs("scripts/evolution-recover.mjs");
    const restart = vi.fn(async () => undefined);
    const inspections = [
      { safe: true, connectionState: "open", sessionFingerprint: "same-session" },
      { safe: true, connectionState: "open", sessionFingerprint: "same-session" },
    ];
    const stateWrites: unknown[] = [];
    const result = await recover.executeRecoveryCore({
      readState: () => ({ incidents: {} }),
      writeState: (state: unknown) => stateWrites.push(state),
      inspect: async () => inspections.shift(),
      restart,
      waitForReconnect: async () => undefined,
    }, { nowMs: 1_000_000, cooldownMs: 600_000, incidentId: "incident-1", reason: "test", maxAttempts: 1 });
    expect(restart).toHaveBeenCalledOnce();
    expect(result.after.sessionFingerprint).toBe("same-session");
    expect(stateWrites).toHaveLength(2);

    const source = readFileSync(join(process.cwd(), "scripts/evolution-recover.mjs"), "utf8");
    expect(source).not.toContain('method: "DELETE"');
    expect(source).not.toContain("/instance/logout");
    expect(source).not.toContain("/instance/delete");
  });

  it("cooldown e limite por incidente impedem repeticao", async () => {
    const recover = await importMjs("scripts/evolution-recover.mjs");
    expect(() => recover.assertRecoveryAllowed(
      { lastAttemptAt: 900_000, incidents: {} },
      { nowMs: 1_000_000, cooldownMs: 600_000, incidentId: "x", maxAttempts: 1 },
    )).toThrow(/cooldown/i);
    expect(() => recover.assertRecoveryAllowed(
      { lastAttemptAt: 1, incidents: { x: { attempts: 1 } } },
      { nowMs: 1_000_000, cooldownMs: 10, incidentId: "x", maxAttempts: 1 },
    )).toThrow(/attempt limit/i);
  });

  it("trava concorrencia e libera o lock depois da falha", async () => {
    const recover = await importMjs("scripts/evolution-recover.mjs");
    const directory = mkdtempSync(join(tmpdir(), "evolution-recover-test-"));
    temporaryDirectories.push(directory);
    const lockPath = join(directory, "recover.lock");
    let release!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const first = recover.withExclusiveRecoveryLock(async () => hold, { lockPath, nowMs: Date.now() });
    await expect(recover.withExclusiveRecoveryLock(async () => undefined, { lockPath, nowMs: Date.now() }))
      .rejects.toThrow(/already running/i);
    release();
    await first;
    await expect(recover.withExclusiveRecoveryLock(async () => { throw new Error("safe failure"); }, { lockPath, nowMs: Date.now() }))
      .rejects.toThrow("safe failure");
    await expect(recover.withExclusiveRecoveryLock(async () => "ok", { lockPath, nowMs: Date.now() })).resolves.toBe("ok");
  });

  it("nao imprime segredos nos comandos de recuperacao", () => {
    const doctor = readFileSync(join(process.cwd(), "scripts/evolution-doctor.mjs"), "utf8");
    const recover = readFileSync(join(process.cwd(), "scripts/evolution-recover.mjs"), "utf8");
    expect(`${doctor}\n${recover}`).not.toMatch(/console\.(?:log|error)\([^\n]*(?:apiKey|AUTHENTICATION_API_KEY|EVOLUTION_API_KEY)/);
  });
});
