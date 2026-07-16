export const OPERATIONAL_STARTUP_BLOCKED_MESSAGE =
  "Inicializacao bloqueada: a porta operacional exige o ambiente piloto. Use npm run dev ou npm run dev:pilot.";

export const ISOLATED_STARTUP_BLOCKED_MESSAGE =
  "Inicializacao isolada bloqueada: use npm run dev:isolated em uma porta diferente de 3333.";

type ServerMode = "pilot" | "isolated" | "test";

export type SafeServerEnvironment = {
  mode: ServerMode;
  port: number;
  host: "127.0.0.1";
  dataBackend: "memory" | "prisma";
};

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
      host: url.hostname.toLowerCase(),
      database: decodeURIComponent(url.pathname.replace(/^\//, "").split("?")[0] ?? ""),
    };
  } catch {
    return null;
  }
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
  if (!explicitlyAllowed || host !== "127.0.0.1" || nodeEnv !== "development") {
    throw new Error(ISOLATED_STARTUP_BLOCKED_MESSAGE);
  }

  if (mode === "isolated" && dataBackend === "memory") {
    return { mode: "isolated", port, host, dataBackend: "memory" };
  }

  const validTestDatabase =
    mode === "test" &&
    dataBackend === "prisma" &&
    Boolean(databaseTarget) &&
    /test/i.test(databaseTarget?.database ?? "") &&
    ["localhost", "127.0.0.1", "::1"].includes(databaseTarget?.host ?? "");
  if (validTestDatabase) {
    return { mode: "test", port, host, dataBackend: "prisma" };
  }

  throw new Error(ISOLATED_STARTUP_BLOCKED_MESSAGE);
}
