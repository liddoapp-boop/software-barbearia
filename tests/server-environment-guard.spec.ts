import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  });
});
