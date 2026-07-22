import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  ISOLATED_STARTUP_BLOCKED_MESSAGE,
  OPERATIONAL_STARTUP_BLOCKED_MESSAGE,
  assertSafeServerEnvironment,
} from "../src/server-environment";

const pilotEnv = {
  NODE_ENV: "development",
  SERVER_MODE: "pilot",
  PORT: "3333",
  HOST: "127.0.0.1",
  DATA_BACKEND: "prisma",
  DATABASE_URL: "postgresql://hidden:hidden@localhost:5432/barbearia_pilot",
};

describe("server environment guard", () => {
  it("aceita somente o piloto protegido na porta operacional", () => {
    expect(assertSafeServerEnvironment(pilotEnv)).toEqual({
      mode: "pilot",
      port: 3333,
      host: "127.0.0.1",
      dataBackend: "prisma",
    });
  });

  it.each([
    ["banco generico", { DATABASE_URL: "postgresql://hidden:hidden@localhost:5432/barbearia" }],
    ["backend em memoria", { DATA_BACKEND: "memory" }],
    ["bind em LAN", { HOST: "0.0.0.0" }],
    ["modo ausente", { SERVER_MODE: undefined }],
    ["NODE_ENV incorreto", { NODE_ENV: "production" }],
  ])("bloqueia %s sem revelar configuracao", (_label, override) => {
    expect(() => assertSafeServerEnvironment({ ...pilotEnv, ...override })).toThrow(
      OPERATIONAL_STARTUP_BLOCKED_MESSAGE,
    );
    expect(OPERATIONAL_STARTUP_BLOCKED_MESSAGE).not.toMatch(/hidden|postgres|DATABASE_URL|AUTH_SECRET/);
  });

  it("aceita memoria somente em modo isolado explicito e fora da porta 3333", () => {
    expect(assertSafeServerEnvironment({
      NODE_ENV: "development",
      SERVER_MODE: "isolated",
      ALLOW_NON_PILOT_SERVER: "true",
      PORT: "3334",
      HOST: "127.0.0.1",
      DATA_BACKEND: "memory",
    })).toMatchObject({ mode: "isolated", port: 3334, dataBackend: "memory" });

    expect(() => assertSafeServerEnvironment({
      NODE_ENV: "development",
      SERVER_MODE: "isolated",
      PORT: "3334",
      HOST: "127.0.0.1",
      DATA_BACKEND: "memory",
    })).toThrow(ISOLATED_STARTUP_BLOCKED_MESSAGE);
  });

  it("aceita Prisma tecnico apenas com banco local marcado como teste", () => {
    expect(assertSafeServerEnvironment({
      NODE_ENV: "development",
      SERVER_MODE: "test",
      ALLOW_NON_PILOT_SERVER: "true",
      PORT: "3399",
      HOST: "127.0.0.1",
      DATA_BACKEND: "prisma",
      DATABASE_URL: "postgresql://hidden:hidden@127.0.0.1:5432/barbearia_test_guard",
    })).toMatchObject({ mode: "test", port: 3399, dataBackend: "prisma" });
  });

  it("mantem dev e dev:pilot no mesmo launcher e separa o modo isolado", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    expect(packageJson.scripts.dev).toBe("npm run dev:pilot");
    expect(packageJson.scripts["dev:pilot"]).toBe("node scripts/start-pilot-local.mjs");
    expect(packageJson.scripts["dev:isolated"]).toBe("node scripts/start-isolated-local.mjs");
    expect(packageJson.scripts["dev:api"]).toBeUndefined();
  });

  it("mantem smokes de escrita fora da porta operacional", () => {
    const smokeMjs = readFileSync(join(process.cwd(), "scripts", "smoke-api-flow.mjs"), "utf8");
    const smokePs1 = readFileSync(join(process.cwd(), "scripts", "smoke-api-flow.ps1"), "utf8");
    for (const source of [smokeMjs, smokePs1]) {
      expect(source).toContain("http://127.0.0.1:3334");
      expect(source).toContain("Smoke de escrita recusado na porta operacional 3333");
      expect(source).toContain("dev:isolated");
    }
  });

  it("carrega somente integracao e Whisper locais no modo isolado e mantem o banco descartavel", async () => {
    const moduleUrl = pathToFileURL(join(process.cwd(), "scripts", "start-isolated-local.mjs")).href;
    const launcher = await import(moduleUrl) as {
      buildIsolatedChildEnv: (localEnv: Record<string, string>, baseEnv: Record<string, string>, port: number) => Record<string, string>;
      isLocalWhisperConfigReady: (env: Record<string, string>) => boolean;
      isLocalSemanticConfigReady: (env: Record<string, string>) => boolean;
    };
    const localEnv = {
      AI_WHATSAPP_ENABLED: "true",
      AI_WHATSAPP_OWNER_PHONE: "5511999999999",
      EVOLUTION_API_URL: "http://127.0.0.1:8080",
      EVOLUTION_API_KEY: "local-evolution-key",
      EVOLUTION_INSTANCE_NAME: "local-instance",
      EVOLUTION_WEBHOOK_SECRET: "local-webhook-secret",
      AI_WHATSAPP_AUDIO_ENABLED: "true",
      AI_AUDIO_TRANSCRIPTION_ENABLED: "true",
      ASR_PROVIDER: "local_whisper",
      LOCAL_WHISPER_GPU_ENABLED: "true",
      LOCAL_WHISPER_FFMPEG_PATH: "C:\\local\\ffmpeg.exe",
      LOCAL_WHISPER_CLI_PATH: "C:\\local\\whisper-cli.exe",
      LOCAL_WHISPER_MODEL_PATH: "C:\\local\\ggml-large-v3-turbo-q5_0.bin",
      LOCAL_WHISPER_VAD_MODEL_PATH: "C:\\local\\ggml-silero-v6.2.0.bin",
      AI_AUDIO_TRANSCRIPTION_PROVIDER: "gemini",
      AI_AUDIO_TRANSCRIPTION_API_KEY: "paid-key-must-not-be-loaded",
      AI_AUDIO_TRANSCRIPTION_MODEL: "remote-model-must-not-be-loaded",
      ISOLATED_WHATSAPP_OUTBOUND_MODE: "allowlist",
      ISOLATED_WHATSAPP_OUTBOUND_ALLOWLIST: "5511999999999",
      DATABASE_URL: "postgresql://hidden:hidden@localhost:5432/barbearia_pilot",
    };
    const childEnv = launcher.buildIsolatedChildEnv(localEnv, {
      AI_AUDIO_TRANSCRIPTION_PROVIDER: "remote-provider-from-parent",
      GEMINI_API_KEY: "remote-key-from-parent",
      SEMANTIC_PROVIDER: "local_llama",
    }, 3334);

    expect(launcher.isLocalWhisperConfigReady(childEnv)).toBe(true);
    expect(launcher.isLocalSemanticConfigReady(childEnv)).toBe(true);
    expect(childEnv).toMatchObject({
      NODE_ENV: "development",
      SERVER_MODE: "isolated",
      DATA_BACKEND: "memory",
      HOST: "127.0.0.1",
      PORT: "3334",
      AI_WHATSAPP_UNIT_ID: "unit-01",
      ASR_PROVIDER: "local_whisper",
      AI_WHATSAPP_AUDIO_ENABLED: "true",
      AI_AUDIO_TRANSCRIPTION_ENABLED: "true",
      LOCAL_WHISPER_MODEL_PATH: "C:\\local\\ggml-large-v3-turbo-q5_0.bin",
      ISOLATED_WHATSAPP_OUTBOUND_MODE: "disabled",
      ISOLATED_WHATSAPP_OUTBOUND_ALLOWLIST: "",
      SEMANTIC_PROVIDER: "local_llama",
      LOCAL_LLAMA_URL: "http://127.0.0.1:11435",
      LOCAL_LLAMA_MODEL: "google_gemma-3-4b-it-Q4_K_M.gguf",
      LOCAL_LLAMA_MODEL_SHA256: "4996030242583a40aa151ff93f49ed787ac8c25e4120c3ae4588b2e2a7d1ae94",
      LOCAL_LLAMA_TIMEOUT_MS: "15000",
    });
    expect(childEnv.DATABASE_URL).toContain("barbearia_isolated_not_used");
    expect(childEnv.DATABASE_URL).not.toContain("barbearia_pilot");
    expect(childEnv.AI_AUDIO_TRANSCRIPTION_PROVIDER).toBe("");
    expect(childEnv.AI_AUDIO_TRANSCRIPTION_API_KEY).toBe("");
    expect(childEnv.AI_AUDIO_TRANSCRIPTION_MODEL).toBe("");
    expect(childEnv.GEMINI_API_KEY).toBe("");
    expect(childEnv.SEMANTIC_PROVIDER).toBe("local_llama");
  });

  it("habilita allowlist isolada somente pelo ambiente explicito e normaliza os numeros", async () => {
    const moduleUrl = pathToFileURL(join(process.cwd(), "scripts", "start-isolated-local.mjs")).href;
    const launcher = await import(moduleUrl) as {
      buildIsolatedChildEnv: (localEnv: Record<string, string>, baseEnv: Record<string, string>, port: number) => Record<string, string>;
    };
    const childEnv = launcher.buildIsolatedChildEnv(
      {},
      {
        ISOLATED_WHATSAPP_OUTBOUND_MODE: "allowlist",
        ISOLATED_WHATSAPP_OUTBOUND_ALLOWLIST: "+55 (11) 99999-8888, (21) 98888-7777",
      },
      3334,
    );

    expect(childEnv.ISOLATED_WHATSAPP_OUTBOUND_MODE).toBe("allowlist");
    expect(childEnv.ISOLATED_WHATSAPP_OUTBOUND_ALLOWLIST).toBe("5511999998888,5521988887777");
  });

  it.each([
    ["modo invalido", { ISOLATED_WHATSAPP_OUTBOUND_MODE: "enabled" }],
    ["allowlist ausente", { ISOLATED_WHATSAPP_OUTBOUND_MODE: "allowlist" }],
    ["allowlist invalida", { ISOLATED_WHATSAPP_OUTBOUND_MODE: "allowlist", ISOLATED_WHATSAPP_OUTBOUND_ALLOWLIST: "sem-numero" }],
  ])("recusa %s no launcher isolado sem expor a configuracao", async (_label, outboundEnv) => {
    const moduleUrl = pathToFileURL(join(process.cwd(), "scripts", "start-isolated-local.mjs")).href;
    const launcher = await import(moduleUrl) as {
      buildIsolatedChildEnv: (localEnv: Record<string, string>, baseEnv: Record<string, string>, port: number) => Record<string, string>;
      ISOLATED_WHATSAPP_OUTBOUND_CONFIG_INVALID: string;
    };

    expect(() => launcher.buildIsolatedChildEnv({}, outboundEnv, 3334)).toThrow(
      launcher.ISOLATED_WHATSAPP_OUTBOUND_CONFIG_INVALID,
    );
    expect(launcher.ISOLATED_WHATSAPP_OUTBOUND_CONFIG_INVALID).not.toContain("sem-numero");
  });

  it("bloqueia a execucao direta antes do listener sem expor a URL", () => {
    const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
    const sensitiveUrl = "postgresql://guard_user:guard_password@localhost:5432/barbearia";
    const result = spawnSync(process.execPath, [tsxCli, "src/server.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: "3333",
        HOST: "127.0.0.1",
        DATA_BACKEND: "prisma",
        DATABASE_URL: sensitiveUrl,
        SERVER_MODE: "",
        ALLOW_NON_PILOT_SERVER: "",
      },
      encoding: "utf8",
      timeout: 15_000,
    });
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).not.toBe(0);
    expect(output).toContain(OPERATIONAL_STARTUP_BLOCKED_MESSAGE);
    expect(output).not.toContain(sensitiveUrl);
    expect(output).not.toContain("guard_password");
    expect(output).not.toContain("API online");
  }, 20_000);
});
