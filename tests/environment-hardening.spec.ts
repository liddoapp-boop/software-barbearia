import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/http/app";
import { getAuthSecret } from "../src/http/security";

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
