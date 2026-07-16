import { spawn } from "node:child_process";
import path from "node:path";

const requestedPort = Number(process.env.PORT || 3334);
if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65_535 || requestedPort === 3333) {
  console.error("Modo isolado recusado: use uma porta valida diferente de 3333.");
  process.exit(1);
}

const tsxCli = path.resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
console.log(`Modo isolado: backend em memoria, host 127.0.0.1, porta ${requestedPort}.`);

const child = spawn(process.execPath, [tsxCli, "src/server.ts"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "development",
    SERVER_MODE: "isolated",
    ALLOW_NON_PILOT_SERVER: "true",
    DATA_BACKEND: "memory",
    DATABASE_URL: "postgresql://isolated:isolated@127.0.0.1:1/barbearia_isolated_not_used",
    HOST: "127.0.0.1",
    PORT: String(requestedPort),
  },
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
