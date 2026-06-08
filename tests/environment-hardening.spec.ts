import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/http/app";
import {
  getAuthSecret,
  getDataBackend,
  isAuthEnforced,
  loadAuthUsers,
} from "../src/http/security";

const ORIGINAL_ENV = { ...process.env };

afterEach(async () => {
  process.env = { ...ORIGINAL_ENV };
});

describe("Environment hardening", () => {
  it("falha com AUTH_SECRET fraco em ambiente de producao", () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_SECRET = "dev-secret-change-me";
    expect(() => getAuthSecret()).toThrow("AUTH_SECRET forte e obrigatorio em producao");
  });

  it("aceita AUTH_SECRET forte em ambiente de producao", () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_SECRET = "01234567890123456789012345678901";
    expect(getAuthSecret()).toBe("01234567890123456789012345678901");
  });

  it("falha no startup de producao com AUTH_SECRET ausente", () => {
    process.env.NODE_ENV = "production";
    process.env.DATA_BACKEND = "prisma";
    process.env.AUTH_ENFORCED = "true";
    process.env.CORS_ORIGIN = "https://app.barbearia.local";
    delete process.env.AUTH_SECRET;
    expect(() => createApp()).toThrow("AUTH_SECRET forte e obrigatorio em producao");
  });

  it("exige DATA_BACKEND=prisma em ambiente de producao", () => {
    process.env.NODE_ENV = "production";
    process.env.DATA_BACKEND = "memory";
    expect(() => getDataBackend()).toThrow("DATA_BACKEND=prisma e obrigatorio em producao");
  });

  it("recusa AUTH_ENFORCED=false em ambiente de producao", () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_ENFORCED = "false";
    expect(() => isAuthEnforced()).toThrow("AUTH_ENFORCED=false nao e permitido em producao");
  });

  it("exige CORS_ORIGIN restrito em producao", () => {
    process.env.NODE_ENV = "production";
    process.env.DATA_BACKEND = "prisma";
    process.env.AUTH_ENFORCED = "true";
    process.env.AUTH_SECRET = "01234567890123456789012345678901";
    delete process.env.CORS_ORIGIN;
    expect(() => createApp()).toThrow("CORS_ORIGIN restrito e obrigatorio em producao");

    process.env.CORS_ORIGIN = "*";
    expect(() => createApp()).toThrow("CORS_ORIGIN='*' nao e permitido em producao");
  });

  it("nao carrega usuarios padrao em producao sem AUTH_USERS_JSON explicito", () => {
    process.env.NODE_ENV = "production";
    delete process.env.AUTH_USERS_JSON;
    expect(loadAuthUsers()).toEqual([]);
  });

  it("recusa credenciais padrao de desenvolvimento em AUTH_USERS_JSON de producao", () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_USERS_JSON = JSON.stringify([
      {
        id: "usr-owner",
        email: "owner@barbearia.local",
        password: "owner123",
        role: "owner",
        unitIds: ["unit-01"],
      },
    ]);
    expect(() => loadAuthUsers()).toThrow(
      "Usuarios padrao de desenvolvimento nao sao permitidos em producao",
    );
  });

  it("aceita lista de CORS_ORIGIN em producao", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATA_BACKEND = "prisma";
    process.env.AUTH_ENFORCED = "true";
    process.env.AUTH_SECRET = "01234567890123456789012345678901";
    process.env.CORS_ORIGIN =
      "https://app.barbearia.local,https://admin.barbearia.local";
    const app = createApp();
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://admin.barbearia.local" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://admin.barbearia.local",
    );
    await app.close();
  });

  it("retorna CORS restrito quando CORS_ORIGIN esta definido", async () => {
    process.env.CORS_ORIGIN = "https://app.barbearia.local";
    const app = createApp();
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://app.barbearia.local" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("https://app.barbearia.local");
    await app.close();
  });
});
