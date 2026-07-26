import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/http/app";

describe("frontend login", () => {
  it("nao fixa unit-01 no login persistente", () => {
    const html = readFileSync(join(process.cwd(), "public", "login.html"), "utf8");
    const backendLoginStart = html.indexOf("async function loginWithBackend");
    const backendLoginEnd = html.indexOf("loginForm.addEventListener", backendLoginStart);
    const backendLogin = html.slice(backendLoginStart, backendLoginEnd);

    expect(backendLogin).toContain("JSON.stringify({ email, password })");
    expect(backendLogin).not.toContain('activeUnitId: "unit-01"');
  });

  it("usa autenticacao relativa e direta na rede local", () => {
    const html = readFileSync(join(process.cwd(), "public", "login.html"), "utf8");

    expect(html).toContain('fetchWithTimeout("/auth/login"');
    expect(html).toContain('fetchWithTimeout("/auth/firebase"');
    expect(html).not.toMatch(/fetch\(["']https?:\/\/(?:localhost|127\.0\.0\.1)/);
    expect(html).toContain("if (isLocalNetworkHost())");
    expect(html).toMatch(/if \(isLocalNetworkHost\(\)\) \{\s*data = await loginWithBackend/);
    expect(html).not.toContain('import { initializeApp } from "https://www.gstatic.com');
  });

  it("traduz falha de rede do Safari para portugues", () => {
    const html = readFileSync(join(process.cwd(), "public", "login.html"), "utf8");

    expect(html).toContain("load failed|failed to fetch|networkerror|network request failed");
    expect(html).toContain("Não foi possível conectar ao sistema. Verifique a rede Wi-Fi e tente novamente.");
  });

  it("preserva sucesso somente depois da autenticacao confirmada", () => {
    const html = readFileSync(join(process.cwd(), "public", "login.html"), "utf8");
    const finishLogin = html.slice(
      html.indexOf("function finishLogin"),
      html.indexOf("function persistSession"),
    );
    const submitHandler = html.slice(html.indexOf('form.addEventListener("submit"'));

    expect(finishLogin).toContain("persistSession(data)");
    expect(finishLogin).toContain("showSuccess()");
    expect(submitHandler).toMatch(/data = await loginWithBackend\(email, password\);[\s\S]*finishLogin\(data\);/);
    expect(submitHandler).toMatch(/data = await loginWithFirebase\(email, password\);[\s\S]*finishLogin\(data\);/);
  });

  it("mantem o contrato responsivo e seguro para Safari mobile", () => {
    const html = readFileSync(join(process.cwd(), "public", "login.html"), "utf8");
    const css = readFileSync(join(process.cwd(), "public", "styles", "login.css"), "utf8");
    const mobileStart = css.indexOf("@media (max-width: 767px)");
    const mobileEnd = css.indexOf("@media (max-width: 767px) and (max-height: 760px)", mobileStart);
    const mobileCss = css.slice(mobileStart, mobileEnd);

    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain('/styles/login.css?v=20260726-finish1');
    expect(html).toContain('id="login-mobile-failsafe"');
    expect(mobileCss).toContain("min-height: 100dvh");
    expect(mobileCss).toContain("env(safe-area-inset-top)");
    expect(mobileCss).toContain("overflow-x: hidden");
    expect(mobileCss).toContain("width: min(100%, 560px)");
    expect(css).toMatch(/body\.auth-screen input\s*\{[\s\S]*?font-size:\s*16px;/);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("usa a marca 3D local, transparente e com fallback textual", () => {
    const html = readFileSync(join(process.cwd(), "public", "login.html"), "utf8");
    const assetPath = join(process.cwd(), "public", "assets", "brand", "geovane-borges-3d.png");

    expect(existsSync(assetPath)).toBe(true);
    const png = readFileSync(assetPath);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(1536);
    expect(png.readUInt32BE(20)).toBe(1024);
    expect(png[25]).toBe(6);
    expect(html).toContain('src="/assets/brand/geovane-borges-3d.png"');
    expect(html).toContain('alt="Barbearia Geovane Borges"');
    expect(html).toContain('width="1536"');
    expect(html).toContain('height="1024"');
    expect(html).toContain('id="brandFallback"');
    expect(html).toContain('brandImage.addEventListener("error"');
  });

  it("aplica a hierarquia final da Geovane Borges com assinatura unica da Liddo", () => {
    const html = readFileSync(join(process.cwd(), "public", "login.html"), "utf8");

    expect(html).toContain("LIDDO SYSTEM");
    expect(html).toContain("Tecnologia para gestão");
    expect(html).toContain("Ambiente privado");
    expect(html).toContain("Software por Liddo System");
    expect(html).not.toContain("Liddo Barber");
    expect(html).toContain("ÁREA RESTRITA");
    expect(html).toContain("Bem-vindo de volta");
    expect(html).toContain("Acesse o painel operacional da Barbearia Geovane Borges.");
    expect(html).toContain("Entrar no sistema");
    expect(html).toContain("Sessão protegida e monitorada.");
  });

  it("preserva seletores, acessibilidade e estados funcionais do formulario", () => {
    const html = readFileSync(join(process.cwd(), "public", "login.html"), "utf8");

    for (const id of ["loginForm", "loginCard", "email", "password", "submitBtn", "errorMsg", "successMsg"]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('<label for="email">');
    expect(html).toContain('<label for="password">');
    expect(html).toContain('autocomplete="email"');
    expect(html).toContain('autocomplete="current-password"');
    expect(html).toContain('aria-describedby="loginSupport errorMsg"');
    expect(html).toContain('<form id="loginForm" novalidate>');
    expect(html).toContain('role="alert"');
    expect(html).toContain('role="status"');
    expect(html).toContain('submitBtn.setAttribute("aria-busy", "true")');
    expect(html).toContain('emailInput.setAttribute("aria-invalid", "true")');
    expect(html).toContain('id="passwordToggle"');
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-controls="password"');
    expect(html).toContain('passwordInput.type = shouldShowPassword ? "text" : "password"');
    expect(html).toContain('showValidationError("Informe um email válido.", emailInput)');
    expect(html).toContain('showValidationError("Digite sua senha.", passwordInput)');
    expect(html).toContain("async function fetchWithTimeout");
    expect(html).toContain("controller.abort()");
  });

  it("nao eleva o login LAN para HTTPS no desenvolvimento e preserva a regra de producao", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousHttpLog = process.env.HTTP_LOG_ENABLED;
    process.env.NODE_ENV = "development";
    process.env.HTTP_LOG_ENABLED = "false";
    const localApp = createApp();

    try {
      const response = await localApp.inject({ method: "GET", url: "/login" });
      const csp = String(response.headers["content-security-policy"]);
      const source = readFileSync(join(process.cwd(), "src", "http", "app.ts"), "utf8");

      expect(response.statusCode).toBe(200);
      expect(csp).not.toContain("upgrade-insecure-requests");
      expect(csp).toContain("default-src 'self'");
      expect(source).toContain('const htmlEntryPaths = new Set(["/", "/login", "/agendamento", "/login.html", "/booking.html"])');
      expect(source).toContain("htmlEntryPaths.has(pathname) ? getContentSecurityPolicy() : contentSecurityPolicy");
      expect(source).toMatch(/process\.env\.NODE_ENV === "production"[\s\S]*directives\.push\("upgrade-insecure-requests"\)/);
    } finally {
      await localApp.close();
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousHttpLog === undefined) delete process.env.HTTP_LOG_ENABLED;
      else process.env.HTTP_LOG_ENABLED = previousHttpLog;
    }
  });
});
