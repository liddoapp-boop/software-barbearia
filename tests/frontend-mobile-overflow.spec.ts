import { existsSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const chromePath = "/root/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";
const chromeAvailable = existsSync(chromePath);
const testIfChrome = chromeAvailable ? it : it.skip;
const appPort = 3338;
const cdpPort = 9358;
const baseUrl = `http://127.0.0.1:${appPort}`;

let appProcess: ChildProcess | undefined;
let chromeProcess: ChildProcess | undefined;
let chromeUserDataDir = "";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForOk(url: string, attempts = 90) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      await delay(250);
    }
  }
  throw new Error(`URL did not become available: ${url}`);
}

async function waitForJson<T>(url: string, attempts = 90): Promise<T> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json() as T;
    } catch {
      await delay(250);
    }
  }
  throw new Error(`JSON endpoint did not become available: ${url}`);
}

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
};

class Cdp {
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private ws: WebSocket;

  constructor(wsUrl: string) {
    this.ws = new WebSocket(wsUrl);
  }

  async open() {
    await new Promise<void>((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve(), { once: true });
      this.ws.addEventListener("error", () => reject(new Error("CDP websocket failed")), { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data));
      if (!msg.id || !this.pending.has(msg.id)) return;
      const request = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (!request) return;
      if (msg.error) request.reject(new Error(msg.error.message));
      else request.resolve(msg.result);
    });
  }

  send(method: string, params: Record<string, any> = {}, sessionId?: string): Promise<any> {
    const id = this.nextId;
    this.nextId += 1;
    const payload: Record<string, any> = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  close() {
    this.ws.close();
  }
}

async function loginOwner() {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    }),
  });
  expect(res.ok).toBe(true);
  return await res.json();
}

function initScript(session: any, activeModule: string) {
  return `
    (() => {
      const session = ${JSON.stringify(session)};
      window.localStorage.setItem("authToken", session.accessToken);
      window.localStorage.setItem("sb.authSession", JSON.stringify(session));
      window.localStorage.setItem("sb.activeModule", ${JSON.stringify(activeModule)});
      window.localStorage.setItem("sb.themeMode", "light");
      window.localStorage.setItem("sb.themeModeUserSet", "true");
    })();
  `;
}

async function waitForComplete(cdp: Cdp, sessionId: string) {
  for (let i = 0; i < 80; i += 1) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: "document.readyState",
      returnByValue: true,
    }, sessionId);
    if (result.result?.value === "complete") return;
    await delay(250);
  }
}

async function measureModule(cdp: Cdp, authSession: any, activeModule: string, openMenu = false) {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  });
  const sessionId = attached.sessionId;

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  }, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: initScript(authSession, activeModule),
  }, sessionId);
  await cdp.send("Page.navigate", { url: `${baseUrl}/` }, sessionId);
  await waitForComplete(cdp, sessionId);
  await delay(1800);

  if (openMenu) {
    await cdp.send("Runtime.evaluate", {
      expression: "document.querySelector('.mobile-sidebar-toggle')?.click()",
    }, sessionId);
    await delay(350);
  }

  const result = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `
      (() => ({
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        activeModule: localStorage.getItem("sb.activeModule"),
        menuOpen: document.querySelector("#appShell")?.classList.contains("mobile-sidebar-open") || false,
      }))()
    `,
  }, sessionId);

  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  return result.result.value;
}

describe("frontend mobile overflow", () => {
  beforeAll(async () => {
    if (!chromeAvailable) return;

    appProcess = spawn("npx", ["tsx", "src/server.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(appPort),
        NODE_ENV: "development",
        DATA_BACKEND: "memory",
      },
      stdio: "ignore",
      detached: false,
    });
    await waitForOk(`${baseUrl}/health`);

    chromeUserDataDir = mkdtempSync(path.join(tmpdir(), "fase-108-vitest-cdp-"));
    chromeProcess = spawn(chromePath, [
      "--headless=new",
      "--no-sandbox",
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${chromeUserDataDir}`,
      "about:blank",
    ], { stdio: "ignore" });
    await waitForJson(`http://127.0.0.1:${cdpPort}/json/version`);
  }, 30_000);

  afterAll(() => {
    if (chromeProcess && !chromeProcess.killed) chromeProcess.kill("SIGTERM");
    if (appProcess && !appProcess.killed) appProcess.kill("SIGTERM");
    if (chromeUserDataDir) rmSync(chromeUserDataDir, { recursive: true, force: true });
  });

  testIfChrome("nao cria scroll horizontal geral no painel interno mobile", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();
    const session = await loginOwner();

    const checks = [
      await measureModule(cdp, session, "dashboard"),
      await measureModule(cdp, session, "agenda"),
      await measureModule(cdp, session, "operacao"),
      await measureModule(cdp, session, "financeiro"),
      await measureModule(cdp, session, "dashboard", true),
    ];

    cdp.close();

    for (const check of checks) {
      expect(check.scrollWidth, `${check.activeModule} scrollWidth`).toBeLessThanOrEqual(check.viewport + 2);
      expect(check.bodyScrollWidth, `${check.activeModule} bodyScrollWidth`).toBeLessThanOrEqual(check.viewport + 2);
    }
    expect(checks.at(-1)?.menuOpen).toBe(true);
  }, 45_000);
});
