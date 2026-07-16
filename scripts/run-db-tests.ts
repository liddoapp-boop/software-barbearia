import "dotenv/config";
import { spawnSync } from "node:child_process";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const SENSITIVE_DATABASE_PATTERNS = [/prod/i, /production/i, /render/i, /railway/i];

function parseDatabaseUrl(raw: string | undefined, label: string) {
  if (!raw?.trim()) throw new Error(`${label} ausente`);
  const url = new URL(raw.trim());
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`${label} recusada: host nao local`);
  }
  if (!database || SENSITIVE_DATABASE_PATTERNS.some((pattern) => pattern.test(database))) {
    throw new Error(`${label} recusada: nome de banco sensivel`);
  }
  return { url, database };
}

function buildTestDatabaseUrl() {
  const configuredTestUrl = process.env.TEST_DATABASE_URL?.trim();
  if (configuredTestUrl) {
    const parsed = parseDatabaseUrl(configuredTestUrl, "TEST_DATABASE_URL");
    if (!/test/i.test(parsed.database)) {
      throw new Error("TEST_DATABASE_URL recusada: o nome do banco deve conter test");
    }
    return parsed;
  }

  const parsed = parseDatabaseUrl(process.env.DATABASE_URL, "DATABASE_URL");
  const testDatabase = /test/i.test(parsed.database) ? parsed.database : `${parsed.database}_test`;
  const testUrl = new URL(parsed.url.toString());
  testUrl.pathname = `/${encodeURIComponent(testDatabase)}`;
  return parseDatabaseUrl(testUrl.toString(), "DATABASE_URL de teste derivada");
}

function runChecked(command: string, args: string[], env: NodeJS.ProcessEnv, options: { allowFailure?: boolean } = {}) {
  console.log(`[test-db] executando: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`Comando falhou: ${command} ${args.join(" ")}`);
  }
  if (result.status !== 0) {
    console.log(`[test-db] status inicial retornou codigo ${result.status}; seguindo para aplicar migrations existentes`);
  }
}

async function main() {
  const { url, database } = buildTestDatabaseUrl();
  if (!/test/i.test(database)) {
    throw new Error("Banco recusado: o nome deve conter test");
  }
  console.log(`[test-db] gate confirmado: host=${url.hostname}; database=${database}`);

  const env = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: url.toString(),
    DATA_BACKEND: "prisma",
    RUN_DB_TESTS: "1",
  };
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  if (String(process.env.SKIP_PRISMA_GENERATE ?? "false").toLowerCase() !== "true") {
    runChecked(npx, ["prisma", "generate"], env);
  } else {
    console.log("[test-db] prisma generate ignorado explicitamente; usando cliente local ja gerado");
  }
  runChecked(npx, ["tsx", "scripts/ensure-test-database.ts"], {
    ...process.env,
    TEST_DATABASE_URL_COMPUTED: url.toString(),
  });
  runChecked(npx, ["prisma", "migrate", "status"], env, { allowFailure: true });
  runChecked(npx, ["prisma", "migrate", "deploy"], env);
  runChecked(npx, ["prisma", "migrate", "status"], env);
  runChecked(npx, ["vitest", "run", "tests/db.integration.spec.ts"], env);
}

main().catch((error) => {
  console.error(`[test-db] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
