import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const envExample = readFileSync(join(root, ".env.example"), "utf8");
const productionCompose = readFileSync(
  join(root, "infra", "evolution-production", "docker-compose.yml"),
  "utf8",
);
const productionEvolutionEnv = readFileSync(
  join(root, "infra", "evolution-production", ".env.example"),
  "utf8",
);

describe("configuracao de deploy em producao", () => {
  it("documenta somente flags consumidas e separa runtime de bootstrap", () => {
    for (const variable of [
      "SERVER_MODE",
      "EVOLUTION_MEDIA_DOWNLOAD_URL",
      "AI_WHATSAPP_PENDING_TTL_MS",
      "GEMINI_API_KEY",
      "GEMINI_MODEL",
      "GEMINI_TIMEOUT_MS",
      "GEMINI_TOTAL_BUDGET_MS",
      "GEMINI_MAX_RETRIES",
      "GEMINI_MODEL_FALLBACK_ENABLED",
      "GEMINI_FALLBACK_MODEL",
      "GEMINI_CIRCUIT_429_THRESHOLD",
      "GEMINI_CIRCUIT_COOLDOWN_MS",
      "AI_AUDIO_PRODUCTION_ENABLED",
    ]) {
      expect(envExample).toContain(variable);
    }
    expect(envExample).not.toMatch(/^\s*#?\s*FIREBASE_USERS_JSON=/m);
    expect(envExample).not.toMatch(/^\s*#?\s*AI_ASSISTANT_PANEL_ENABLED=/m);
    expect(envExample).not.toMatch(/^\s*#?\s*SEED_OWNER_/m);
    expect(envExample).toContain("BOOTSTRAP_PRODUCTION_CONFIRM=CREATE_INITIAL_OWNER");
    expect(envExample).toContain("Remova-as do ambiente");
  });

  it("mantem o exemplo local em modo isolado coerente e o exemplo de producao fail-closed", () => {
    expect(envExample).toMatch(/NODE_ENV=development\r?\n#.+\r?\nSERVER_MODE=isolated\r?\nPORT=3334/);
    expect(envExample).toContain("# SERVER_MODE=production");
    expect(envExample).toContain("# HOST=127.0.0.1");
    expect(envExample).toContain("# AI_AUDIO_PRODUCTION_ENABLED=false");
    expect(envExample).toContain("# CORS_ORIGIN=https://app.example.com");
  });

  it("fixa Evolution, PostgreSQL e Redis por versao e digest sem usar latest", () => {
    expect(productionCompose).toContain(
      "evoapicloud/evolution-api:v2.3.7@sha256:1bd8afc4a6cf48822e6cf02469aeae7bd35a12a6b616eacd1291926307f4d339",
    );
    expect(productionCompose).toContain(
      "postgres:15.18-alpine3.24@sha256:3d0f7584ed7d04e27fa050d6683a74746608faf21f202be78460d679cc56461f",
    );
    expect(productionCompose).toContain(
      "redis:7.4.9-alpine3.21@sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99",
    );
    expect(productionCompose).not.toMatch(/:latest(?:\s|$)/);
  });

  it("persiste os tres servicos, aplica healthcheck/restart e nao publica banco ou Redis", () => {
    expect(productionCompose.match(/restart: unless-stopped/g)).toHaveLength(3);
    expect(productionCompose.match(/healthcheck:/g)).toHaveLength(3);
    expect(productionCompose).toContain("127.0.0.1:${EVOLUTION_API_PORT:-8080}:8080");
    expect(productionCompose).toContain("evolution_instances:/evolution/instances");
    expect(productionCompose).toContain("evolution_postgres:/var/lib/postgresql/data");
    expect(productionCompose).toContain("evolution_redis:/data");

    const postgresBlock = productionCompose.split("\n  postgres:")[1].split("\n  redis:")[0];
    const redisBlock = productionCompose.split("\n  redis:")[1].split("\nvolumes:")[0];
    expect(postgresBlock).not.toMatch(/\n\s+ports:/);
    expect(redisBlock).not.toMatch(/\n\s+ports:/);
  });

  it("nao versiona segredos no template da Evolution", () => {
    expect(productionEvolutionEnv).toContain("EVOLUTION_API_PORT=8080");
    for (const variable of [
      "SERVER_URL",
      "AUTHENTICATION_API_KEY",
      "POSTGRES_DATABASE",
      "POSTGRES_USERNAME",
      "POSTGRES_PASSWORD",
    ]) {
      expect(productionEvolutionEnv).toMatch(new RegExp(`^${variable}=$`, "m"));
    }
    expect(productionEvolutionEnv).not.toMatch(/replace|password123|secret/i);
  });
});
