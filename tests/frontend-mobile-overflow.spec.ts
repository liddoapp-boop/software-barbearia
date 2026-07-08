import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function resolveChromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.CHROME_BIN,
    process.env.BROWSER_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/root/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ].filter((item): item is string => Boolean(item));
  return candidates.find((candidate) => existsSync(candidate)) ?? "";
}

const chromePath = resolveChromePath();
const chromeAvailable = Boolean(chromePath);
const testIfChrome = chromeAvailable ? it : it.skip;
const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";
const appCommand = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : npxBin;
const appArgs = process.platform === "win32" ? ["/d", "/s", "/c", `${npxBin} tsx src/server.ts`] : ["tsx", "src/server.ts"];
const appPort = 3338;
const cdpPort = 9358;
const baseUrl = `http://127.0.0.1:${appPort}`;

let appProcess: ChildProcess | undefined;
let chromeProcess: ChildProcess | undefined;
let chromeUserDataDir = "";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function killProcessTree(processRef: ChildProcess | undefined) {
  if (!processRef?.pid || processRef.killed) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(processRef.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  processRef.kill("SIGTERM");
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

async function waitForExpression(cdp: Cdp, sessionId: string, expression: string) {
  for (let i = 0; i < 80; i += 1) {
    const result = await cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    }, sessionId);
    if (result.result?.value) return;
    await delay(250);
  }
  throw new Error(`Expression did not become true: ${expression}`);
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
      (() => {
        window.scrollTo(0, 0);
        const beforeScrollY = window.scrollY;
        window.scrollTo(0, document.documentElement.scrollHeight);
        const afterScrollY = window.scrollY;
        const htmlStyle = getComputedStyle(document.documentElement);
        const bodyStyle = getComputedStyle(document.body);
        const appContentStyle = getComputedStyle(document.querySelector("#appContent"));
        return {
          viewport: window.innerWidth,
          viewportHeight: window.innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          bodyScrollHeight: document.body.scrollHeight,
          beforeScrollY,
          afterScrollY,
          htmlOverflowY: htmlStyle.overflowY,
          bodyOverflowY: bodyStyle.overflowY,
          appContentOverflowY: appContentStyle.overflowY,
          activeModule: localStorage.getItem("sb.activeModule"),
          menuOpen: document.querySelector("#appShell")?.classList.contains("mobile-sidebar-open") || false,
        };
      })()
    `,
  }, sessionId);

  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  return result.result.value;
}

async function measureAgendaViewToggle(cdp: Cdp, authSession: any) {
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
    source: initScript(authSession, "agenda"),
  }, sessionId);
  await cdp.send("Page.navigate", { url: `${baseUrl}/` }, sessionId);
  await waitForComplete(cdp, sessionId);
  await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('#agendaSection:not(.hidden) .wc-header-row'))");

  const calendar = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `
      (() => {
        const outer = document.querySelector("#agendaSection .wc-outer");
        const calendarMode = document.querySelector("#agendaCalendarMode");
        const listMode = document.querySelector("#agendaListMode");
        return {
          viewport: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          calendarVisible: !!calendarMode && !calendarMode.classList.contains("hidden"),
          listVisible: !!listMode && !listMode.classList.contains("hidden"),
          calendarClientWidth: outer?.clientWidth || 0,
          calendarScrollWidth: outer?.scrollWidth || 0,
          calendarOverflowX: outer ? getComputedStyle(outer).overflowX : "",
        };
      })()
    `,
  }, sessionId);

  await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('#viewListBtn')?.click()",
  }, sessionId);
  await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('#agendaListMode:not(.hidden)'))");

  const list = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `
      (() => {
        const calendarMode = document.querySelector("#agendaCalendarMode");
        const listMode = document.querySelector("#agendaListMode");
        return {
          viewport: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          calendarVisible: !!calendarMode && !calendarMode.classList.contains("hidden"),
          listVisible: !!listMode && !listMode.classList.contains("hidden"),
          listHasCards: document.querySelectorAll("#agendaListMode .al-card, #agendaListMode .al-empty").length > 0,
        };
      })()
    `,
  }, sessionId);

  await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('#viewGridBtn')?.click()",
  }, sessionId);
  await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('#agendaCalendarMode:not(.hidden) .wc-header-row'))");

  const calendarAgain = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `
      (() => {
        const calendarMode = document.querySelector("#agendaCalendarMode");
        const listMode = document.querySelector("#agendaListMode");
        return {
          viewport: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          calendarVisible: !!calendarMode && !calendarMode.classList.contains("hidden"),
          listVisible: !!listMode && !listMode.classList.contains("hidden"),
        };
      })()
    `,
  }, sessionId);

  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  return {
    calendar: calendar.result.value,
    list: list.result.value,
    calendarAgain: calendarAgain.result.value,
  };
}

describe("frontend mobile overflow", () => {
  it("mantem contrato estrutural de scroll vertical da pagina no mobile", () => {
    const css = readFileSync(path.join(process.cwd(), "public/styles/layout.css"), "utf8");
    const contractStart = css.indexOf("Mobile document scroll contract");
    expect(contractStart).toBeGreaterThan(-1);
    const contract = css.slice(contractStart);

    expect(contract).toMatch(/html,\s*body\s*\{[\s\S]*height:\s*auto\s*!important;[\s\S]*overflow-y:\s*auto\s*!important;/);
    expect(contract).toMatch(/body\s*\{[\s\S]*min-height:\s*100vh\s*!important;[\s\S]*min-height:\s*100dvh\s*!important;/);
    expect(contract).toMatch(/#appShell,[\s\S]*#appShell\.settings-mode[\s\S]*height:\s*auto\s*!important;[\s\S]*overflow-y:\s*visible\s*!important;/);
    expect(contract).toMatch(/#appMain,[\s\S]*#appContent,[\s\S]*height:\s*auto\s*!important;[\s\S]*overflow-y:\s*visible\s*!important;/);
    expect(contract).toMatch(/#appContent,[\s\S]*#appShell\.settings-mode #appContent\s*\{[\s\S]*flex:\s*0 0 auto\s*!important;/);
    expect(contract).toMatch(/#agendaSection \.wc-body-scroll\s*\{[\s\S]*max-height:\s*none\s*!important;[\s\S]*overflow-y:\s*visible\s*!important;/);
    expect(contract).toMatch(/html:has\(body #appShell\.mobile-sidebar-open\),[\s\S]*body:has\(#appShell\.mobile-sidebar-open\)\s*\{[\s\S]*overflow-y:\s*hidden\s*!important;/);

    expect(css).toMatch(/#agendaSection \.wc-outer\s*\{[\s\S]*overflow-x:\s*auto\s*!important;[\s\S]*overflow-y:\s*visible\s*!important;/);
    const financeiroBlocks = Array.from(css.matchAll(/#financeiroSection[^{]*\{([^}]*)\}/g));
    expect(
      financeiroBlocks.some((match) => /overflow-y:\s*(?:hidden|auto|scroll)\s*!important;/.test(match[1])),
    ).toBe(false);
  });

  beforeAll(async () => {
    if (!chromeAvailable) return;

    appProcess = spawn(appCommand, appArgs, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(appPort),
        NODE_ENV: "development",
        DATA_BACKEND: "memory",
      },
      stdio: "ignore",
      detached: false,
      windowsHide: true,
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

  afterAll(async () => {
    killProcessTree(chromeProcess);
    killProcessTree(appProcess);
    await delay(500);
    if (chromeUserDataDir) {
      rmSync(chromeUserDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });

  testIfChrome("nao cria scroll horizontal geral no painel interno mobile", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();
    const session = await loginOwner();

    const checks = [
      await measureModule(cdp, session, "agenda"),
      await measureModule(cdp, session, "operacao"),
      await measureModule(cdp, session, "financeiro"),
      await measureModule(cdp, session, "agenda", true),
    ];

    cdp.close();

    for (const check of checks) {
      expect(check.scrollWidth, `${check.activeModule} scrollWidth`).toBeLessThanOrEqual(check.viewport + 2);
      expect(check.bodyScrollWidth, `${check.activeModule} bodyScrollWidth`).toBeLessThanOrEqual(check.viewport + 2);
    }
    for (const check of checks.filter((item) => !item.menuOpen && ["agenda", "financeiro"].includes(item.activeModule))) {
      expect(check.htmlOverflowY, `${check.activeModule} html overflow-y`).not.toBe("hidden");
      expect(check.bodyOverflowY, `${check.activeModule} body overflow-y`).not.toBe("hidden");
      expect(check.appContentOverflowY, `${check.activeModule} appContent overflow-y`).not.toMatch(/auto|scroll/);
      expect(check.scrollHeight, `${check.activeModule} document scrollHeight`).toBeGreaterThan(check.viewportHeight);
      expect(check.bodyScrollHeight, `${check.activeModule} body scrollHeight`).toBeGreaterThan(check.viewportHeight);
      expect(check.afterScrollY, `${check.activeModule} window scrollY`).toBeGreaterThan(check.beforeScrollY);
    }
    expect(checks.at(-1)?.menuOpen).toBe(true);
  }, 45_000);

  testIfChrome("agenda mobile mantem calendario com scroll interno e lista existente funcional", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();
    const session = await loginOwner();

    const result = await measureAgendaViewToggle(cdp, session);

    cdp.close();

    expect(result.calendar.scrollWidth, "agenda calendario document scrollWidth").toBeLessThanOrEqual(result.calendar.viewport + 2);
    expect(result.calendar.bodyScrollWidth, "agenda calendario body scrollWidth").toBeLessThanOrEqual(result.calendar.viewport + 2);
    expect(result.calendar.calendarVisible).toBe(true);
    expect(result.calendar.listVisible).toBe(false);
    expect(result.calendar.calendarScrollWidth).toBeGreaterThan(result.calendar.calendarClientWidth);
    expect(result.calendar.calendarOverflowX).toMatch(/auto|scroll/);

    expect(result.list.scrollWidth, "agenda lista document scrollWidth").toBeLessThanOrEqual(result.list.viewport + 2);
    expect(result.list.bodyScrollWidth, "agenda lista body scrollWidth").toBeLessThanOrEqual(result.list.viewport + 2);
    expect(result.list.calendarVisible).toBe(false);
    expect(result.list.listVisible).toBe(true);
    expect(result.list.listHasCards).toBe(true);

    expect(result.calendarAgain.scrollWidth, "agenda calendario apos voltar document scrollWidth").toBeLessThanOrEqual(result.calendarAgain.viewport + 2);
    expect(result.calendarAgain.bodyScrollWidth, "agenda calendario apos voltar body scrollWidth").toBeLessThanOrEqual(result.calendarAgain.viewport + 2);
    expect(result.calendarAgain.calendarVisible).toBe(true);
    expect(result.calendarAgain.listVisible).toBe(false);
  }, 45_000);
});
