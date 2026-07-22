import { existsSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

export const isolatedIntegrationKeys = [
  "AI_WHATSAPP_ENABLED",
  "AI_WHATSAPP_OWNER_PHONE",
  "EVOLUTION_API_URL",
  "EVOLUTION_API_KEY",
  "EVOLUTION_INSTANCE_NAME",
  "EVOLUTION_WEBHOOK_SECRET",
];
export const isolatedLocalWhisperKeys = [
  "AI_WHATSAPP_AUDIO_ENABLED",
  "AI_AUDIO_TRANSCRIPTION_ENABLED",
  "ASR_PROVIDER",
  "LOCAL_WHISPER_GPU_ENABLED",
  "LOCAL_WHISPER_FFMPEG_PATH",
  "LOCAL_WHISPER_CLI_PATH",
  "LOCAL_WHISPER_MODEL_PATH",
  "LOCAL_WHISPER_VAD_MODEL_PATH",
  "LOCAL_WHISPER_PROMPT",
  "LOCAL_WHISPER_TIMEOUT_MS",
  "LOCAL_WHISPER_WARMUP_TIMEOUT_MS",
];

const disabledRemoteAiKeys = [
  "AI_AUDIO_TRANSCRIPTION_PROVIDER",
  "AI_AUDIO_TRANSCRIPTION_API_KEY",
  "AI_AUDIO_TRANSCRIPTION_MODEL",
  "AI_AUDIO_TRANSCRIPTION_FALLBACK_MODEL",
  "AI_AUDIO_TRANSCRIPTION_MODEL_FALLBACK_ENABLED",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
];
const isolatedLocalSemanticEnv = {
  SEMANTIC_PROVIDER: "local_llama",
  LOCAL_LLAMA_URL: "http://127.0.0.1:11435",
  LOCAL_LLAMA_MODEL: "google_gemma-3-4b-it-Q4_K_M.gguf",
  LOCAL_LLAMA_MODEL_SHA256: "4996030242583a40aa151ff93f49ed787ac8c25e4120c3ae4588b2e2a7d1ae94",
  LOCAL_LLAMA_TIMEOUT_MS: "15000",
};
export const ISOLATED_WHATSAPP_OUTBOUND_CONFIG_INVALID =
  "Modo isolado recusado: configuracao de saida WhatsApp invalida.";

function normalizeWhatsappRecipient(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function resolveIsolatedWhatsappOutboundEnv(baseEnv) {
  const configuredMode = String(baseEnv.ISOLATED_WHATSAPP_OUTBOUND_MODE ?? "").trim().toLowerCase();
  const mode = configuredMode || "disabled";
  if (mode === "disabled") {
    return {
      ISOLATED_WHATSAPP_OUTBOUND_MODE: "disabled",
      ISOLATED_WHATSAPP_OUTBOUND_ALLOWLIST: "",
    };
  }
  if (mode !== "allowlist") throw new Error(ISOLATED_WHATSAPP_OUTBOUND_CONFIG_INVALID);

  const entries = String(baseEnv.ISOLATED_WHATSAPP_OUTBOUND_ALLOWLIST ?? "")
    .split(/[,;\r\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const normalized = entries.map(normalizeWhatsappRecipient);
  if (!normalized.length || normalized.some((entry) => !/^\d{12,13}$/.test(entry) || /^(\d)\1+$/.test(entry))) {
    throw new Error(ISOLATED_WHATSAPP_OUTBOUND_CONFIG_INVALID);
  }
  return {
    ISOLATED_WHATSAPP_OUTBOUND_MODE: "allowlist",
    ISOLATED_WHATSAPP_OUTBOUND_ALLOWLIST: [...new Set(normalized)].join(","),
  };
}

function pickConfiguredEnv(keys, localEnv, baseEnv) {
  return Object.fromEntries(
    keys
      .map((key) => [key, String(localEnv[key] ?? baseEnv[key] ?? "").trim()])
      .filter(([, value]) => Boolean(value)),
  );
}

export function isLocalWhisperConfigReady(env) {
  return env.AI_WHATSAPP_AUDIO_ENABLED?.toLowerCase() === "true"
    && env.AI_AUDIO_TRANSCRIPTION_ENABLED?.toLowerCase() === "true"
    && env.ASR_PROVIDER?.toLowerCase() === "local_whisper"
    && env.LOCAL_WHISPER_GPU_ENABLED?.toLowerCase() === "true"
    && [
      "LOCAL_WHISPER_FFMPEG_PATH",
      "LOCAL_WHISPER_CLI_PATH",
      "LOCAL_WHISPER_MODEL_PATH",
      "LOCAL_WHISPER_VAD_MODEL_PATH",
    ].every((key) => Boolean(env[key]));
}

export function isLocalSemanticConfigReady(env) {
  return Object.entries(isolatedLocalSemanticEnv).every(([key, value]) => env[key] === value);
}

export function buildIsolatedChildEnv(localEnv, baseEnv = process.env, requestedPort = Number(baseEnv.PORT || 3334)) {
  const isolatedIntegrationEnv = pickConfiguredEnv(isolatedIntegrationKeys, localEnv, baseEnv);
  const isolatedLocalWhisperEnv = pickConfiguredEnv(isolatedLocalWhisperKeys, localEnv, baseEnv);
  const isolatedWhatsappOutboundEnv = resolveIsolatedWhatsappOutboundEnv(baseEnv);
  return {
    ...baseEnv,
    ...Object.fromEntries(disabledRemoteAiKeys.map((key) => [key, ""])),
    ...isolatedLocalSemanticEnv,
    ...isolatedIntegrationEnv,
    ...isolatedLocalWhisperEnv,
    ...isolatedWhatsappOutboundEnv,
    NODE_ENV: "development",
    SERVER_MODE: "isolated",
    ALLOW_NON_PILOT_SERVER: "true",
    DATA_BACKEND: "memory",
    DATABASE_URL: "postgresql://isolated:isolated@127.0.0.1:1/barbearia_isolated_not_used",
    AI_WHATSAPP_UNIT_ID: "unit-01",
    HOST: "127.0.0.1",
    PORT: String(requestedPort),
  };
}

export function runEvolutionBootstrapCheck({ cwd = process.cwd(), env = process.env, stdio = "inherit" } = {}) {
  const doctorScript = path.resolve(cwd, "scripts", "evolution-doctor.mjs");
  const result = spawnSync(process.execPath, [doctorScript, "--bootstrap"], {
    cwd,
    env,
    stdio,
    shell: false,
    windowsHide: true,
  });
  return result.status === 0;
}

export function startIsolatedLocal() {
  const requestedPort = Number(process.env.PORT || 3334);
  if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65_535 || requestedPort === 3333) {
    console.error("Modo isolado recusado: use uma porta valida diferente de 3333.");
    process.exit(1);
  }

  const tsxCli = path.resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const pilotEnvFile = path.resolve(process.cwd(), ".env.pilot.local");
  const pilotEnv = existsSync(pilotEnvFile) ? dotenv.parse(readFileSync(pilotEnvFile)) : {};
  const childEnv = buildIsolatedChildEnv(pilotEnv, process.env, requestedPort);
  const whatsappIntegrationReady = childEnv.AI_WHATSAPP_ENABLED?.toLowerCase() === "true"
    && isolatedIntegrationKeys.slice(1).every((key) => Boolean(childEnv[key]));
  const localWhisperReady = isLocalWhisperConfigReady(childEnv);
  const localSemanticReady = isLocalSemanticConfigReady(childEnv);

  console.log(
    `Modo isolado: backend em memoria, host 127.0.0.1, porta ${requestedPort}, WhatsApp local ${whatsappIntegrationReady ? "habilitado" : "desabilitado"}, saida WhatsApp ${childEnv.ISOLATED_WHATSAPP_OUTBOUND_MODE}, Whisper local ${localWhisperReady ? "configurado" : "desabilitado"}, semantico local ${localSemanticReady ? "configurado" : "desabilitado"}.`,
  );

  if (whatsappIntegrationReady && !runEvolutionBootstrapCheck({ env: childEnv })) {
    console.error("Modo isolado recusado: Evolution local divergiu da imagem, webhook ou estado essencial esperado. Execute npm run evolution:doctor.");
    process.exit(1);
  }

  const child = spawn(process.execPath, [tsxCli, "src/server.ts"], {
    cwd: process.cwd(),
    env: childEnv,
    stdio: "inherit",
    shell: false,
  });

  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startIsolatedLocal();
}
