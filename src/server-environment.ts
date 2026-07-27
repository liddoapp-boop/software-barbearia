export const OPERATIONAL_STARTUP_BLOCKED_MESSAGE =
  "Inicializacao bloqueada: a porta operacional exige o ambiente piloto. Use npm run dev ou npm run dev:pilot.";

export const ISOLATED_STARTUP_BLOCKED_MESSAGE =
  "Inicializacao isolada bloqueada: use npm run dev:isolated em uma porta diferente de 3333.";

export const PRODUCTION_STARTUP_BLOCKED_MESSAGE =
  "Inicializacao de producao bloqueada: revise modo, banco, autenticacao, URLs publicas e integracoes habilitadas.";

type ServerMode = "pilot" | "isolated" | "test" | "production";

export type SafeServerEnvironment = {
  mode: ServerMode;
  port: number;
  host: "127.0.0.1" | "0.0.0.0";
  dataBackend: "memory" | "prisma";
};

const KNOWN_PRODUCTION_PLACEHOLDERS = new Set([
  "dev-secret-change-me",
  "replace-with-a-strong-secret",
  "replace-with-real-key",
  "replace-with-local-webhook-secret",
  "change-me",
  "your-secret-here",
  "uma-chave-aleatoria-e-segura-com-32-ou-mais-caracteres",
]);

function parsePort(value: string | undefined) {
  const port = Number(value ?? 3333);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Inicializacao bloqueada: PORT invalida.");
  }
  return port;
}

function parseDatabaseTarget(rawValue: string | undefined) {
  try {
    const url = new URL(String(rawValue ?? "").trim());
    return {
      protocol: url.protocol.toLowerCase(),
      host: url.hostname.toLowerCase(),
      database: decodeURIComponent(url.pathname.replace(/^\//, "").split("?")[0] ?? ""),
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      schema: url.searchParams.get("schema")?.trim().toLowerCase() ?? "",
    };
  } catch {
    return null;
  }
}

function isEnabled(value: string | undefined) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function isStrongSecret(value: string | undefined, minimumLength = 32) {
  const normalized = String(value ?? "").trim();
  return normalized.length >= minimumLength && !KNOWN_PRODUCTION_PLACEHOLDERS.has(normalized.toLowerCase());
}

function isProductionDatabase(target: ReturnType<typeof parseDatabaseTarget>) {
  return Boolean(
    target &&
    ["postgres:", "postgresql:"].includes(target.protocol) &&
    target.host &&
    target.database &&
    target.username &&
    target.username.toLowerCase() !== "postgres" &&
    isStrongSecret(target.password, 16) &&
    !/(?:^|[_-])(test|teste|testing)(?:[_-]|$)/i.test(target.database) &&
    !/(test|teste)/i.test(target.database) &&
    (!target.schema || target.schema === "public"),
  );
}

function isRestrictedCorsOrigin(value: string | undefined) {
  const origins = String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!origins.length || origins.includes("*")) return false;
  return origins.every((origin) => {
    try {
      const url = new URL(origin);
      return url.protocol === "https:" && url.origin === origin.replace(/\/$/, "");
    } catch {
      return false;
    }
  });
}

function isValidPublicBookingUrl(value: string | undefined, unitId: string) {
  try {
    const url = new URL(String(value ?? "").trim());
    return (
      url.protocol === "https:" &&
      url.pathname === "/agendamento" &&
      url.username === "" &&
      url.password === "" &&
      url.searchParams.get("unitId") === unitId
    );
  } catch {
    return false;
  }
}

function hasProductionWhatsappConfig(env: NodeJS.ProcessEnv) {
  if (!isEnabled(env.AI_WHATSAPP_ENABLED)) return true;
  const isSafeIntegrationUrl = (value: string | undefined) => {
    try {
      const url = new URL(String(value ?? "").trim());
      return (
        url.protocol === "https:" ||
        (url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname.toLowerCase()))
      );
    } catch {
      return false;
    }
  };
  const mediaDownloadUrl = String(env.EVOLUTION_MEDIA_DOWNLOAD_URL ?? "").trim();
  if (!isSafeIntegrationUrl(env.EVOLUTION_API_URL)) return false;
  if (mediaDownloadUrl && !isSafeIntegrationUrl(mediaDownloadUrl)) return false;
  return Boolean(
    isStrongSecret(env.EVOLUTION_API_KEY, 24) &&
    isStrongSecret(env.EVOLUTION_WEBHOOK_SECRET, 24) &&
    String(env.EVOLUTION_INSTANCE_NAME ?? "").trim() &&
    /^\d{10,15}$/.test(String(env.AI_WHATSAPP_OWNER_PHONE ?? "").replace(/\D/g, "")) &&
    String(env.AI_WHATSAPP_UNIT_ID ?? "").trim(),
  );
}

function hasProductionAudioConfig(env: NodeJS.ProcessEnv) {
  if (!isEnabled(env.AI_AUDIO_PRODUCTION_ENABLED)) return true;
  return Boolean(
    isEnabled(env.AI_WHATSAPP_ENABLED) &&
    isEnabled(env.AI_WHATSAPP_AUDIO_ENABLED) &&
    isEnabled(env.AI_AUDIO_TRANSCRIPTION_ENABLED) &&
    String(env.ASR_PROVIDER ?? "").trim().toLowerCase() === "local_whisper" &&
    isEnabled(env.LOCAL_WHISPER_GPU_ENABLED) &&
    String(env.LOCAL_WHISPER_FFMPEG_PATH ?? "").trim() &&
    String(env.LOCAL_WHISPER_CLI_PATH ?? "").trim() &&
    String(env.LOCAL_WHISPER_MODEL_PATH ?? "").trim() &&
    String(env.LOCAL_WHISPER_VAD_MODEL_PATH ?? "").trim(),
  );
}

function assertProductionEnvironment(
  env: NodeJS.ProcessEnv,
  input: {
    port: number;
    host: string;
    nodeEnv: string;
    dataBackend: string;
    databaseTarget: ReturnType<typeof parseDatabaseTarget>;
  },
): SafeServerEnvironment {
  const unitId = String(env.PUBLIC_BOOKING_UNIT_ID ?? "").trim();
  const valid =
    input.nodeEnv === "production" &&
    input.host === "127.0.0.1" &&
    input.dataBackend === "prisma" &&
    isProductionDatabase(input.databaseTarget) &&
    isEnabled(env.AUTH_ENFORCED) &&
    isStrongSecret(env.AUTH_SECRET) &&
    isRestrictedCorsOrigin(env.CORS_ORIGIN) &&
    Boolean(unitId) &&
    isValidPublicBookingUrl(env.PUBLIC_BOOKING_URL, unitId) &&
    hasProductionWhatsappConfig(env) &&
    hasProductionAudioConfig(env);

  if (!valid) throw new Error(PRODUCTION_STARTUP_BLOCKED_MESSAGE);
  return {
    mode: "production",
    port: input.port,
    host: "127.0.0.1",
    dataBackend: "prisma",
  };
}

export function assertSafeServerEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): SafeServerEnvironment {
  const port = parsePort(env.PORT);
  const host = String(env.HOST ?? "127.0.0.1").trim();
  const mode = String(env.SERVER_MODE ?? "").trim().toLowerCase();
  const nodeEnv = String(env.NODE_ENV ?? "").trim().toLowerCase();
  const dataBackend = String(env.DATA_BACKEND ?? "").trim().toLowerCase();
  const databaseTarget = parseDatabaseTarget(env.DATABASE_URL);

  if (mode === "production") {
    return assertProductionEnvironment(env, {
      port,
      host,
      nodeEnv,
      dataBackend,
      databaseTarget,
    });
  }

  const operational = mode === "pilot" || port === 3333;

  if (operational) {
    const valid =
      mode === "pilot" &&
      port === 3333 &&
      host === "127.0.0.1" &&
      nodeEnv === "development" &&
      dataBackend === "prisma" &&
      databaseTarget?.database === "barbearia_pilot" &&
      ["localhost", "127.0.0.1", "::1"].includes(databaseTarget.host);
    if (!valid) throw new Error(OPERATIONAL_STARTUP_BLOCKED_MESSAGE);
    return { mode: "pilot", port, host, dataBackend: "prisma" };
  }

  const explicitlyAllowed = String(env.ALLOW_NON_PILOT_SERVER ?? "").trim().toLowerCase() === "true";
  if (!explicitlyAllowed || nodeEnv !== "development") {
    throw new Error(ISOLATED_STARTUP_BLOCKED_MESSAGE);
  }

  const lanExplicitlyAllowed = String(env.ALLOW_LAN_SERVER ?? "").trim().toLowerCase() === "true";
  const validIsolatedHost = host === "127.0.0.1" || (host === "0.0.0.0" && lanExplicitlyAllowed);
  if (mode === "isolated" && dataBackend === "memory" && validIsolatedHost) {
    return { mode: "isolated", port, host, dataBackend: "memory" };
  }

  const validTestDatabase =
    mode === "test" &&
    host === "127.0.0.1" &&
    dataBackend === "prisma" &&
    Boolean(databaseTarget) &&
    /test/i.test(databaseTarget?.database ?? "") &&
    ["localhost", "127.0.0.1", "::1"].includes(databaseTarget?.host ?? "");
  if (validTestDatabase) {
    return { mode: "test", port, host, dataBackend: "prisma" };
  }

  throw new Error(ISOLATED_STARTUP_BLOCKED_MESSAGE);
}
