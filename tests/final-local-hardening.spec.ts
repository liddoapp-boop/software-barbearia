import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/http/app";

const originalEnv = { ...process.env };

function cookiesFrom(response: { headers: Record<string, unknown> }) {
  const raw = response.headers["set-cookie"];
  const values = Array.isArray(raw) ? raw : [String(raw ?? "")];
  return values.map((value) => String(value).split(";")[0]).join("; ");
}

function csrfFrom(response: { headers: Record<string, unknown> }) {
  const cookie = cookiesFrom(response).split("; ").find((item) => item.startsWith("sb_csrf="));
  return decodeURIComponent(cookie?.slice("sb_csrf=".length) ?? "");
}

describe("fechamento tecnico local", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "true";
    process.env.AUTH_SECRET = "01234567890123456789012345678901";
    process.env.HTTP_LOG_ENABLED = "false";
    process.env.RATE_LIMIT_LOGIN_MAX = "20";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("separa liveness de readiness sem expor configuracao sensivel", async () => {
    const app = createApp();
    const live = await app.inject({ method: "GET", url: "/health/live" });
    const ready = await app.inject({ method: "GET", url: "/health/ready" });

    expect(live.statusCode).toBe(200);
    expect(live.json()).toEqual({ status: "ok" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({
      status: "ready",
      checks: { database: "ok", authentication: "ok", audio: "ok" },
    });
    expect(JSON.stringify(ready.json())).not.toMatch(/secret|password|url|provider/i);
    await app.close();
  });

  it("mantem live 200 e ready 503 quando PostgreSQL esta indisponivel", async () => {
    process.env.DATA_BACKEND = "prisma";
    const app = createApp({ readinessProbe: async () => { throw new Error("database unavailable at internal-host"); } });
    const live = await app.inject({ method: "GET", url: "/health/live" });
    const ready = await app.inject({ method: "GET", url: "/health/ready" });
    const commercial = await app.inject({ method: "GET", url: "/catalog?unitId=unit-01" });
    expect(live.statusCode).toBe(200);
    expect(ready.statusCode).toBe(503);
    expect(ready.json().checks.database).toBe("unavailable");
    expect(commercial.statusCode).toBe(401);
    expect(JSON.stringify(ready.json())).not.toMatch(/127\.0\.0\.1|postgresql|invalid|database_url/i);
    await app.close();
  });

  it("emite sessao HttpOnly curta e exige CSRF nas escritas por cookie", async () => {
    const app = createApp();
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "owner@barbearia.local", password: "owner123" },
    });
    const setCookie = ([] as string[]).concat(login.headers["set-cookie"] as string | string[]).join("\n");
    const cookie = cookiesFrom(login);
    const csrf = csrfFrom(login);

    expect(login.statusCode).toBe(200);
    expect(setCookie).toContain("sb_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("sb_csrf=");
    expect(login.headers["cache-control"]).toBe("no-store");

    const me = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.role).toBe("owner");

    const missingCsrf = await app.inject({ method: "POST", url: "/auth/logout", headers: { cookie } });
    expect(missingCsrf.statusCode).toBe(403);
    expect(missingCsrf.json().code).toBe("CSRF_INVALID");

    const logout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie, "x-csrf-token": csrf },
    });
    expect(logout.statusCode).toBe(200);
    expect(String(logout.headers["set-cookie"])).toContain("Max-Age=0");
    const replay = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(replay.statusCode).toBe(401);
    await app.close();
  });

  it("limita login por endereco sem confiar em X-Forwarded-For por padrao", async () => {
    process.env.RATE_LIMIT_LOGIN_MAX = "2";
    const app = createApp();
    const attempt = (forwarded: string) => app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-forwarded-for": forwarded },
      payload: { email: "owner@barbearia.local", password: "incorreta" },
    });

    expect((await attempt("198.51.100.1")).statusCode).not.toBe(429);
    expect((await attempt("198.51.100.2")).statusCode).not.toBe(429);
    const limited = await attempt("198.51.100.3");
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
    expect(limited.json().error).toBe("Muitas requisicoes");
    await app.close();
  });

  it("aceita somente proxies explicitos e normaliza IDs de correlacao", async () => {
    process.env.TRUST_PROXY = "true";
    expect(() => createApp()).toThrow(/proxies conhecidos/);

    process.env.TRUST_PROXY = "127.0.0.1,::1";
    const app = createApp();
    const valid = await app.inject({
      method: "GET",
      url: "/health/live",
      headers: { "x-correlation-id": "local.audit-20260715:01" },
    });
    expect(valid.headers["x-correlation-id"]).toBe("local.audit-20260715:01");

    const invalid = await app.inject({
      method: "GET",
      url: "/health/live",
      headers: { "x-correlation-id": "invalido\nset-cookie: ataque=1" },
    });
    expect(invalid.headers["x-correlation-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(invalid.headers["set-cookie"]).toBeUndefined();
    await app.close();
  });

  it("aplica limites separados a escrita publica e relatorios autenticados", async () => {
    process.env.RATE_LIMIT_PUBLIC_WRITE_MAX = "2";
    process.env.RATE_LIMIT_REPORTS_MAX = "2";
    const app = createApp();
    const preview = () => app.inject({
      method: "POST",
      url: "/public/services/preview",
      payload: { unitId: "unit-01", serviceIds: ["svc-corte"] },
    });
    expect((await preview()).statusCode).not.toBe(429);
    expect((await preview()).statusCode).not.toBe(429);
    expect((await preview()).statusCode).toBe(429);

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "owner@barbearia.local", password: "owner123" },
    });
    const report = () => app.inject({
      method: "GET",
      url: "/reports/management/summary?unitId=unit-01&start=2026-07-01T00:00:00.000Z&end=2026-07-31T23:59:59.999Z",
      headers: { authorization: `Bearer ${login.json().accessToken}` },
    });
    expect((await report()).statusCode).toBe(200);
    expect((await report()).statusCode).toBe(200);
    expect((await report()).statusCode).toBe(429);
    await app.close();
  });

  it("rejeita JSON malformado, payload excessivo e XSS sem refletir detalhes", async () => {
    process.env.HTTP_BODY_LIMIT_BYTES = "1024";
    const app = createApp();
    const malformed = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "content-type": "application/json" },
      payload: '{"email":',
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error).toBe("Dados invalidos");
    expect(JSON.stringify(malformed.json())).not.toMatch(/unexpected token|stack|\\src\\|\/src\//i);

    const oversized = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "owner@barbearia.local", password: "x".repeat(2_000) },
    });
    expect(oversized.statusCode).toBe(413);
    expect(oversized.json().error).toBe("Dados invalidos");

    const xss = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: '<script>alert("xss")</script>', password: "invalida" },
    });
    expect(xss.statusCode).toBe(400);
    expect(JSON.stringify(xss.json())).not.toContain("<script>");
    await app.close();
  });

  it("fecha injecoes, traversal, parametros duplicados e mass assignment", async () => {
    const app = createApp();
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "owner@barbearia.local", password: "owner123" },
    });
    const authorization = `Bearer ${login.json().accessToken}`;

    const sql = await app.inject({
      method: "GET",
      url: "/clients?unitId=unit-01&search=%27%20OR%201%3D1--",
      headers: { authorization },
    });
    expect(sql.statusCode).toBe(200);
    expect(sql.json().clients).toEqual([]);

    const duplicate = await app.inject({
      method: "GET",
      url: "/clients?unitId=unit-01&unitId=unit-02",
      headers: { authorization },
    });
    expect(duplicate.statusCode).toBe(400);

    const traversal = await app.inject({
      method: "GET",
      url: "/..%2F..%2F.env.pilot.local",
    });
    expect([400, 401, 404]).toContain(traversal.statusCode);
    expect(traversal.body).not.toContain("DATABASE_URL");

    const client = await app.inject({
      method: "POST",
      url: "/clients",
      headers: { authorization },
      payload: {
        unitId: "unit-01",
        name: "Cliente Seguro",
        phone: "11999990000",
        role: "owner",
        unitIds: ["unit-02"],
        __proto__: { role: "owner" },
      },
    });
    expect(client.statusCode).toBe(200);
    expect(client.json().client.role).toBeUndefined();
    expect(client.json().client.unitIds).toBeUndefined();

    const manual = await app.inject({
      method: "POST",
      url: "/financial/transactions",
      headers: { authorization, "idempotency-key": "csv-injection-final" },
      payload: {
        unitId: "unit-01",
        type: "INCOME",
        category: "AJUSTE",
        description: "=HYPERLINK(\"https://invalid.local\")",
        amount: 1,
        date: "2026-07-15T12:00:00.000Z",
        paymentMethod: "PIX",
        changedBy: "security-test",
      },
    });
    expect(manual.statusCode).toBe(200);
    const csv = await app.inject({
      method: "GET",
      url: "/reports/management/export.csv?unitId=unit-01&start=2026-07-15T00:00:00.000Z&end=2026-07-15T23:59:59.999Z&type=financial",
      headers: { authorization },
    });
    expect(csv.statusCode).toBe(200);
    expect(csv.body).toContain("'=HYPERLINK");
    expect(csv.body).not.toContain('"=HYPERLINK');
    await app.close();
  });

  it("uniformiza enumeracao e rejeita tokens ausente, adulterado, expirado e algoritmo invalido", async () => {
    const app = createApp();
    const unknown = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "naoexiste@barbearia.local", password: "incorreta" },
    });
    const wrong = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "owner@barbearia.local", password: "incorreta" },
    });
    expect(unknown.statusCode).toBe(wrong.statusCode);
    expect(unknown.json().error).toBe(wrong.json().error);
    expect(unknown.json().code).toBe(wrong.json().code);

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-auth-mode": "bearer" },
      payload: { email: "owner@barbearia.local", password: "owner123" },
    });
    const token = login.json().accessToken as string;
    const [header, payload, signature] = token.split(".");
    const noneHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const cases = [
      undefined,
      `${header}.${payload}.${signature.slice(0, -1)}x`,
      `${noneHeader}.${payload}.`,
    ];
    for (const candidate of cases) {
      const response = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: candidate ? { authorization: `Bearer ${candidate}` } : {},
      });
      expect(response.statusCode).toBe(401);
    }

    const payloadJson = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    payloadJson.exp = 1;
    const expiredPayload = Buffer.from(JSON.stringify(payloadJson)).toString("base64url");
    const expiredSignature = crypto
      .createHmac("sha256", process.env.AUTH_SECRET!)
      .update(`${header}.${expiredPayload}`)
      .digest("base64url");
    const expired = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${header}.${expiredPayload}.${expiredSignature}` },
    });
    expect(expired.statusCode).toBe(401);
    await app.close();
  });

  it("nega acesso direto de recepcao a relatorio de owner", async () => {
    const app = createApp();
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "recepcao@barbearia.local", password: "recepcao123" },
    });
    const denied = await app.inject({
      method: "GET",
      url: "/reports/management/summary?unitId=unit-01&start=2026-07-01T00:00:00.000Z&end=2026-07-31T23:59:59.999Z",
      headers: { authorization: `Bearer ${login.json().accessToken}` },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error).toBe("Acesso negado");
    await app.close();
  });

  it("sustenta repeticao controlada de liveness e leitura autenticada", async () => {
    const app = createApp();
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "owner@barbearia.local", password: "owner123" },
    });
    const authorization = `Bearer ${login.json().accessToken}`;
    const responses = await Promise.all([
      ...Array.from({ length: 100 }, () => app.inject({ method: "GET", url: "/health/live" })),
      ...Array.from({ length: 50 }, () => app.inject({
        method: "GET",
        url: "/catalog?unitId=unit-01",
        headers: { authorization },
      })),
    ]);
    expect(responses.every((response) => response.statusCode === 200)).toBe(true);
    await app.close();
  });

  it("fecha CSP, roles desconhecidas e armazenamento de token no frontend", async () => {
    const app = createApp();
    const response = await app.inject({ method: "GET", url: "/health/live" });
    const csp = String(response.headers["content-security-policy"]);
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");

    const menu = fs.readFileSync(path.join(process.cwd(), "public/components/menu-config.js"), "utf8");
    const frontend = fs.readFileSync(path.join(process.cwd(), "public/app.js"), "utf8");
    const login = fs.readFileSync(path.join(process.cwd(), "public/login.html"), "utf8");
    expect(menu).toContain('value : "unauthenticated"');
    expect(menu).not.toContain('value : "owner"');
    expect(frontend).not.toContain('localStorage.setItem("authToken"');
    expect(login).not.toContain("accessToken: data.accessToken");
    expect(login).not.toContain('localStorage.setItem("authToken"');
    await app.close();
  });

  it("mantem host fail-closed, imagem Evolution fixada e estado de disponibilidade proprio", () => {
    const server = fs.readFileSync(path.join(process.cwd(), "src/server.ts"), "utf8");
    const compose = fs.readFileSync(path.join(process.cwd(), "infra/evolution-local/docker-compose.yml"), "utf8");
    const pipeline = fs.readFileSync(path.join(process.cwd(), "src/application/ai-whatsapp-pipeline.ts"), "utf8");
    const app = fs.readFileSync(path.join(process.cwd(), "src/http/app.ts"), "utf8");
    expect(server).toContain('|| "127.0.0.1"');
    expect(compose).toContain("evoapicloud/evolution-api:v2.3.7");
    expect(compose).not.toContain("evoapicloud/evolution-api:latest");
    expect(pipeline).toContain('"AVAILABILITY_UNAVAILABLE"');
    expect(app).toContain('? "AVAILABILITY_UNAVAILABLE"');
  });
});
