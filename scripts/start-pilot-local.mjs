import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import dotenv from "dotenv";

const envFile = path.resolve(process.cwd(), ".env.pilot.local");
const pilotDatabaseName = "barbearia_pilot";
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);

if (!existsSync(envFile)) {
  console.error(
    "Arquivo .env.pilot.local nao encontrado. Crie a partir do .env local apontando o DATABASE_URL para barbearia_pilot.",
  );
  process.exit(1);
}

const parsed = dotenv.parse(readFileSync(envFile));
const rawDatabaseUrl = String(parsed.DATABASE_URL ?? "").trim().replace(/^"|"$/g, "");

let databaseUrl;
try {
  databaseUrl = new URL(rawDatabaseUrl);
} catch {
  console.error("DATABASE_URL invalida em .env.pilot.local.");
  process.exit(1);
}

const databaseName = databaseUrl.pathname.replace(/^\//, "").split("?")[0];
if (databaseName !== pilotDatabaseName) {
  console.error(`Modo piloto recusado: banco configurado nao e ${pilotDatabaseName}.`);
  process.exit(1);
}

if (!loopbackHosts.has(databaseUrl.hostname)) {
  console.error("Modo piloto recusado: DATABASE_URL deve usar host local/loopback.");
  process.exit(1);
}

if (String(parsed.DATA_BACKEND ?? "").trim().toLowerCase() !== "prisma") {
  console.error("Modo piloto recusado: DATA_BACKEND deve ser prisma.");
  process.exit(1);
}

const tsxCli = path.resolve(
  process.cwd(),
  "node_modules",
  "tsx",
  "dist",
  "cli.mjs",
);

const child = spawn(process.execPath, [tsxCli, "src/server.ts"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    ...parsed,
    NODE_ENV: "development",
    SERVER_MODE: "pilot",
    PORT: "3333",
    HOST: "127.0.0.1",
  },
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
