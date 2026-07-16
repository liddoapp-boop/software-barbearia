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
  "SEMANTIC_PROVIDER",
];

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

export function buildIsolatedChildEnv(localEnv, baseEnv = process.env, requestedPort = Number(baseEnv.PORT || 3334)) {
  const isolatedIntegrationEnv = pickConfiguredEnv(isolatedIntegrationKeys, localEnv, baseEnv);
  const isolatedLocalWhisperEnv = pickConfiguredEnv(isolatedLocalWhisperKeys, localEnv, baseEnv);
  return {
    ...baseEnv,
    ...Object.fromEntries(disabledRemoteAiKeys.map((key) => [key, ""])),
    ...isolatedIntegrationEnv,
    ...isolatedLocalWhisperEnv,
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

  console.log(
    `Modo isolado: backend em memoria, host 127.0.0.1, porta ${requestedPort}, WhatsApp local ${whatsappIntegrationReady ? "habilitado" : "desabilitado"}, Whisper local ${localWhisperReady ? "configurado" : "desabilitado"}.`,
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
