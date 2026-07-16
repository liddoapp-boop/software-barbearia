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
const unavailableAppPort = 3339;
const cdpPort = 9358;
const baseUrl = `http://127.0.0.1:${appPort}`;
const unavailableBaseUrl = `http://127.0.0.1:${unavailableAppPort}`;

let appProcess: ChildProcess | undefined;
let unavailableAppProcess: ChildProcess | undefined;
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

async function loginRole(role: "owner" | "recepcao" | "profissional" = "owner") {
  const credentials = {
    owner: ["owner@barbearia.local", "owner123"],
    recepcao: ["recepcao@barbearia.local", "recepcao123"],
    profissional: ["profissional@barbearia.local", "profissional123"],
  } as const;
  const [email, password] = credentials[role];
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      activeUnitId: "unit-01",
    }),
  });
  expect(res.ok).toBe(true);
  const data = await res.json();
  const setCookies = res.headers.getSetCookie();
  return {
    session: { expiresAt: data.expiresAt, user: data.user },
    cookies: setCookies.map((header) => {
      const [pair] = header.split(";");
      const separator = pair.indexOf("=");
      return { name: pair.slice(0, separator), value: decodeURIComponent(pair.slice(separator + 1)) };
    }),
  };
}

function initScript(auth: any, activeModule: string) {
  return `
    (() => {
      const session = ${JSON.stringify({})};
      Object.assign(session, ${JSON.stringify(auth.session)});
      window.localStorage.removeItem("authToken");
      window.localStorage.setItem("sb.authSession", JSON.stringify(session));
      window.localStorage.setItem("sb.activeModule", ${JSON.stringify(activeModule)});
      window.localStorage.setItem("sb.themeMode", "light");
      window.localStorage.setItem("sb.themeModeUserSet", "true");
    })();
  `;
}

async function installAuthCookies(cdp: Cdp, sessionId: string, auth: any) {
  await cdp.send("Network.enable", {}, sessionId);
  await cdp.send("Network.setCookies", {
    cookies: auth.cookies.map((cookie: { name: string; value: string }) => ({
      ...cookie,
      url: baseUrl,
      path: "/",
      httpOnly: cookie.name === "sb_session",
      sameSite: "Strict",
    })),
  }, sessionId);
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

async function measureModule(
  cdp: Cdp,
  authSession: any,
  activeModule: string,
  openMenu = false,
  viewport = { width: 390, height: 844, mobile: true },
) {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  });
  const sessionId = attached.sessionId;

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 2,
    mobile: viewport.mobile,
  }, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await installAuthCookies(cdp, sessionId, authSession);
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
          sessionRole: JSON.parse(localStorage.getItem("sb.authSession") || "null")?.user?.role || null,
          visibleModules: Array.from(document.querySelectorAll("[data-sidebar-module]"), (item) => item.getAttribute("data-sidebar-module")),
          legacyTokenStored: Boolean(localStorage.getItem("authToken")),
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
  await installAuthCookies(cdp, sessionId, authSession);
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

async function runAuthenticatedOperationalFlow(cdp: Cdp, authSession: any) {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await installAuthCookies(cdp, sessionId, authSession);
  await cdp.send("Page.navigate", { url: `${baseUrl}/` }, sessionId);
  await waitForComplete(cdp, sessionId);
  await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('#appShell'))");

  const evaluated = await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      (async () => {
        const csrf = decodeURIComponent((document.cookie.split('; ').find((item) => item.startsWith('sb_csrf=')) || '').slice(8));
        const call = async (url, method = 'GET', body, idempotencyKey) => {
          const headers = { 'x-csrf-token': csrf };
          if (body !== undefined) headers['content-type'] = 'application/json';
          if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
          const response = await fetch(url, {
            method,
            credentials: 'same-origin',
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
          });
          let data = null;
          try { data = await response.json(); } catch {}
          return { status: response.status, data };
        };
        const suffix = String(Date.now()).slice(-8);
        const client = await call('/clients', 'POST', {
          unitId: 'unit-01', name: 'Cliente Headless ' + suffix, phone: '119' + suffix,
        });
        const appointment = await call('/appointments', 'POST', {
          unitId: 'unit-01', clientId: client.data?.client?.id, professionalId: 'pro-01',
          serviceId: 'svc-corte', startsAt: '2026-07-20T13:00:00.000Z', changedBy: 'e2e-headless',
        });
        const appointmentId = appointment.data?.appointment?.id;
        const confirmed = await call('/appointments/' + appointmentId + '/status', 'PATCH',
          { status: 'CONFIRMED', changedBy: 'e2e-headless' }, 'e2e-confirm-' + suffix);
        const inService = await call('/appointments/' + appointmentId + '/status', 'PATCH',
          { status: 'IN_SERVICE', changedBy: 'e2e-headless' }, 'e2e-service-' + suffix);
        const checkout = await call('/appointments/' + appointmentId + '/checkout', 'POST', {
          changedBy: 'e2e-headless', completedAt: '2026-07-20T14:00:00.000Z', paymentMethod: 'PIX',
          products: [{ productId: 'prd-pomada', quantity: 1 }],
        }, 'e2e-checkout-' + suffix);
        const sale = await call('/sales/products', 'POST', {
          unitId: 'unit-01', soldAt: '2026-07-20T15:00:00.000Z', professionalId: 'pro-01',
          clientId: client.data?.client?.id, paymentMethod: 'PIX',
          items: [{ productId: 'prd-oleo-barba', quantity: 1 }],
        }, 'e2e-sale-' + suffix);
        const stock = await call('/stock/overview?unitId=unit-01');
        const financial = await call('/financial/transactions?unitId=unit-01&start=2026-07-20T00:00:00.000Z&end=2026-07-20T23:59:59.999Z');
        const audit = await call('/audit/events?unitId=unit-01&limit=50');
        const gone = await call('/appointments/' + appointmentId + '/complete', 'POST', {
          changedBy: 'e2e-headless', completedAt: '2026-07-20T14:00:00.000Z',
        });
        const logout = await call('/auth/logout', 'POST');
        const replay = await call('/auth/me');
        return {
          statuses: {
            client: client.status, appointment: appointment.status, confirmed: confirmed.status,
            inService: inService.status, checkout: checkout.status, sale: sale.status,
            stock: stock.status, financial: financial.status, audit: audit.status,
            gone: gone.status, logout: logout.status, replay: replay.status,
          },
          checkoutStatus: checkout.data?.appointment?.status,
          stockMovementCount: stock.data?.recentMovements?.length || 0,
          financialCount: financial.data?.transactions?.length || 0,
          auditCount: audit.data?.events?.length || 0,
        };
      })()
    `,
  }, sessionId);
  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  return evaluated.result.value;
}

async function runPublicBooking(
  cdp: Cdp,
  viewport: { width: number; height: number; mobile: boolean },
  suffix: string,
) {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.mobile ? 2 : 1,
    mobile: viewport.mobile,
  }, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: "localStorage.removeItem('liddo_client'); localStorage.removeItem('liddo_appts');",
  }, sessionId);
  await cdp.send("Page.navigate", { url: `${baseUrl}/agendamento?unitId=unit-01` }, sessionId);
  await waitForComplete(cdp, sessionId);
  await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('#chatInput:not(:disabled)')) && document.querySelector('#chat')?.textContent?.includes('Qual')");

  const answer = async (value: string) => {
    await cdp.send("Runtime.evaluate", {
      expression: `(() => { const input = document.querySelector('#chatInput'); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#btnSend').click(); })()`,
    }, sessionId);
  };
  await answer("Carlos Silva");
  await delay(1_500);
  const nameStep = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `({
      type: document.querySelector('#chatInput')?.type,
      disabled: document.querySelector('#chatInput')?.disabled,
      value: document.querySelector('#chatInput')?.value,
      buttonDisabled: document.querySelector('#btnSend')?.disabled,
      text: document.querySelector('#chat')?.textContent,
      url: location.href
    })`,
  }, sessionId);
  if (nameStep.result.value?.type !== "tel" || nameStep.result.value?.disabled) {
    throw new Error(`Booking name step failed: ${JSON.stringify(nameStep.result.value)}`);
  }
  await answer(`1199${suffix.padStart(7, "0").slice(-7)}`);
  await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('[data-service-id]'))");
  await cdp.send("Runtime.evaluate", { expression: "document.querySelector('[data-service-id]').click()" }, sessionId);
  await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('#btnContinueServices:not(:disabled)'))");
  await cdp.send("Runtime.evaluate", { expression: "document.querySelector('#btnContinueServices').click()" }, sessionId);
  await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('.cal-day:not(.unavail)'))");
  await cdp.send("Runtime.evaluate", { expression: "document.querySelector('.cal-day:not(.unavail)').click()" }, sessionId);
  await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('.slot-btn:not(.taken)'))");
  await cdp.send("Runtime.evaluate", { expression: "document.querySelector('.slot-btn:not(.taken)').click()" }, sessionId);
  await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('#btnConfirm'))");
  await cdp.send("Runtime.evaluate", { expression: "document.querySelector('#btnConfirm').click()" }, sessionId);
  await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('#bookingSuccessWrap'))");

  const result = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `({
      success: Boolean(document.querySelector('#bookingSuccessWrap')),
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth
    })`,
  }, sessionId);
  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  return result.result.value;
}

async function rejectsSession(cdp: Cdp, auth: any) {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Network.enable", {}, sessionId);
  await cdp.send("Network.clearBrowserCookies", {}, sessionId);
  if (auth.cookies?.length) await installAuthCookies(cdp, sessionId, auth);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: initScript(auth, "financeiro") }, sessionId);
  await cdp.send("Page.navigate", { url: `${baseUrl}/` }, sessionId);
  await waitForExpression(cdp, sessionId, "location.pathname === '/login'");
  const result = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: "({ path: location.pathname, token: localStorage.getItem('authToken'), session: localStorage.getItem('sb.authSession') })",
  }, sessionId);
  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  return result.result.value;
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
    unavailableAppProcess = spawn(appCommand, appArgs, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(unavailableAppPort),
        NODE_ENV: "development",
        DATA_BACKEND: "prisma",
        DATABASE_URL: "postgresql://local:local@127.0.0.1:1/unavailable_local?schema=public",
      },
      stdio: "ignore",
      detached: false,
      windowsHide: true,
    });
    await waitForOk(`${unavailableBaseUrl}/health/live`);

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
    killProcessTree(unavailableAppProcess);
    await delay(500);
    if (chromeUserDataDir) {
      rmSync(chromeUserDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });

  testIfChrome("nao cria scroll horizontal geral no painel interno mobile", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();
    const session = await loginRole();

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
    const session = await loginRole();

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

  testIfChrome("perfis reais permanecem fail-closed em desktop e mobile", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();

    const owner = await loginRole("owner");
    const reception = await loginRole("recepcao");
    const professional = await loginRole("profissional");
    const desktop = { width: 1440, height: 900, mobile: false };
    const tablet = { width: 900, height: 1024, mobile: false };
    const mobile = { width: 390, height: 844, mobile: true };

    const checks = [
      await measureModule(cdp, owner, "financeiro", false, desktop),
      await measureModule(cdp, reception, "financeiro", false, desktop),
      await measureModule(cdp, professional, "configuracoes", false, desktop),
      await measureModule(cdp, owner, "operacao", false, tablet),
      await measureModule(cdp, reception, "clientes", false, tablet),
      await measureModule(cdp, owner, "agenda", false, mobile),
      await measureModule(cdp, reception, "agenda", false, mobile),
      await measureModule(cdp, professional, "agenda", false, mobile),
      await measureModule(cdp, { session: owner.session, cookies: reception.cookies }, "financeiro", false, desktop),
    ];
    cdp.close();

    expect(checks[0].activeModule).toBe("financeiro");
    expect(checks[0].visibleModules).toContain("financeiro");
    expect(checks[1].sessionRole).toBe("recepcao");
    expect(checks[1].activeModule).toBe("agenda");
    expect(checks[1].visibleModules).toEqual(expect.arrayContaining(["agenda", "clientes"]));
    expect(checks[1].visibleModules).not.toEqual(expect.arrayContaining(["financeiro", "configuracoes", "auditoria"]));
    expect(checks[2].sessionRole).toBe("profissional");
    expect(checks[2].activeModule).toBe("agenda");
    expect(checks[2].visibleModules).not.toEqual(expect.arrayContaining(["financeiro", "configuracoes", "auditoria"]));
    expect(checks[8].sessionRole).toBe("recepcao");
    expect(checks[8].activeModule).toBe("agenda");
    expect(checks[8].visibleModules).not.toContain("financeiro");
    for (const check of checks) {
      expect(check.legacyTokenStored).toBe(false);
      expect(check.scrollWidth).toBeLessThanOrEqual(check.viewport + 2);
    }
  }, 60_000);

  testIfChrome("executa ciclo operacional autenticado e logout em navegador headless", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();
    const owner = await loginRole("owner");
    const result = await runAuthenticatedOperationalFlow(cdp, owner);
    cdp.close();

    expect(result.statuses).toEqual({
      client: 200,
      appointment: 200,
      confirmed: 200,
      inService: 200,
      checkout: 200,
      sale: 200,
      stock: 200,
      financial: 200,
      audit: 200,
      gone: 410,
      logout: 200,
      replay: 401,
    });
    expect(result.checkoutStatus).toBe("COMPLETED");
    expect(result.stockMovementCount).toBeGreaterThan(0);
    expect(result.financialCount).toBeGreaterThanOrEqual(2);
    expect(result.auditCount).toBeGreaterThan(0);
  }, 60_000);

  testIfChrome("observa 403, 429 e readiness 503 no navegador headless", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();

    const reception = await loginRole("recepcao");
    const target = await cdp.send("Target.createTarget", { url: "about:blank" });
    const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    await cdp.send("Runtime.enable", {}, attached.sessionId);
    await cdp.send("Page.enable", {}, attached.sessionId);
    await installAuthCookies(cdp, attached.sessionId, reception);
    await cdp.send("Page.navigate", { url: `${baseUrl}/` }, attached.sessionId);
    await waitForComplete(cdp, attached.sessionId);
    const statuses = await cdp.send("Runtime.evaluate", {
      awaitPromise: true,
      returnByValue: true,
      expression: `
        (async () => {
          const forbidden = await fetch('/reports/management/summary?unitId=unit-01&start=2026-07-01T00:00:00.000Z&end=2026-07-31T23:59:59.999Z');
          const attempts = [];
          for (let i = 0; i < 15; i += 1) {
            const response = await fetch('/auth/login', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ email: 'owner@barbearia.local', password: 'incorreta' }),
            });
            attempts.push(response.status);
          }
          return { forbidden: forbidden.status, limited: attempts.includes(429) };
        })()
      `,
    }, attached.sessionId);
    await cdp.send("Target.closeTarget", { targetId: target.targetId });

    const unavailableTarget = await cdp.send("Target.createTarget", { url: `${unavailableBaseUrl}/health/live` });
    const unavailableAttached = await cdp.send("Target.attachToTarget", {
      targetId: unavailableTarget.targetId,
      flatten: true,
    });
    await cdp.send("Runtime.enable", {}, unavailableAttached.sessionId);
    await cdp.send("Page.enable", {}, unavailableAttached.sessionId);
    await waitForComplete(cdp, unavailableAttached.sessionId);
    const readiness = await cdp.send("Runtime.evaluate", {
      awaitPromise: true,
      returnByValue: true,
      expression: "fetch('/health/ready').then((response) => response.status)",
    }, unavailableAttached.sessionId);
    await cdp.send("Target.closeTarget", { targetId: unavailableTarget.targetId });
    cdp.close();

    expect(statuses.result.value).toEqual({ forbidden: 403, limited: true });
    expect(readiness.result.value).toBe(503);
  }, 60_000);

  testIfChrome("sessao expirada ou papel invalido sem cookie redireciona para login", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();
    const invalid = await rejectsSession(cdp, {
      session: { expiresAt: new Date(Date.now() + 60_000).toISOString(), user: { role: "admin", activeUnitId: "unit-01" } },
      cookies: [],
    });
    const expired = await rejectsSession(cdp, {
      session: { expiresAt: new Date(Date.now() - 60_000).toISOString(), user: { role: "owner", activeUnitId: "unit-01" } },
      cookies: [],
    });
    cdp.close();
    for (const result of [invalid, expired]) {
      expect(result.path).toBe("/login");
      expect(result.token).toBeNull();
    }
  }, 30_000);

  testIfChrome("agendamento publico conclui fluxo real em desktop e mobile", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();
    const desktop = await runPublicBooking(cdp, { width: 1440, height: 900, mobile: false }, "1010101");
    const mobile = await runPublicBooking(cdp, { width: 390, height: 844, mobile: true }, "2020202");
    cdp.close();

    for (const result of [desktop, mobile]) {
      expect(result.success).toBe(true);
      expect(result.scrollWidth).toBeLessThanOrEqual(result.viewport + 2);
      expect(result.bodyScrollWidth).toBeLessThanOrEqual(result.viewport + 2);
    }
  }, 90_000);
});
