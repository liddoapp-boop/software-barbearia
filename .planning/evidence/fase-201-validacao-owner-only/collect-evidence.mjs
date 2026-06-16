import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const chromePath = "/root/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";
const evidenceDir = ".planning/evidence/fase-201-validacao-owner-only";
const baseUrl = process.env.FASE201_BASE_URL || "https://barbearia.76-13-161-250.nip.io";
const cdpPort = Number(process.env.FASE201_CDP_PORT || 9361);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fase-201-cdp-"));

function parseEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const localEnv = parseEnvFile(".env");
const ownerEmail = process.env.SMOKE_OWNER_EMAIL || localEnv.SMOKE_OWNER_EMAIL || "";
const ownerPassword = process.env.SMOKE_OWNER_PASSWORD || localEnv.SMOKE_OWNER_PASSWORD || "";
const bookingEmail = process.env.FASE201_BOOKING_EMAIL || "tg-validacao@example.invalid";

if (!ownerEmail || !ownerPassword) {
  throw new Error("Owner credentials are required via SMOKE_OWNER_EMAIL and SMOKE_OWNER_PASSWORD.");
}

const desktopChecks = [
  { file: "02-dashboard.png", moduleId: "financeiro", label: "Painel inicial / Inicio" },
  { file: "03-agenda.png", moduleId: "agenda", label: "Agenda" },
  { file: "04-clientes.png", moduleId: "clientes", label: "Clientes" },
  { file: "05-pdv.png", moduleId: "operacao", label: "PDV" },
  { file: "06-financeiro.png", moduleId: "financeiro", label: "Financeiro" },
  { file: "07-servicos.png", moduleId: "servicos", label: "Servicos" },
  { file: "08-equipe.png", moduleId: "profissionais", label: "Equipe" },
  { file: "09-auditoria.png", moduleId: "auditoria", label: "Auditoria" },
  { file: "10-configuracoes.png", moduleId: "configuracoes", label: "Configuracoes" },
];

const mobileChecks = [
  { file: "12-mobile-login.png", kind: "login", label: "Mobile login" },
  { file: "13-mobile-agenda.png", moduleId: "agenda", label: "Mobile Agenda" },
  { file: "13b-mobile-clientes.png", moduleId: "clientes", label: "Mobile Clientes" },
  { file: "13c-mobile-pdv.png", moduleId: "operacao", label: "Mobile PDV" },
  { file: "13d-mobile-financeiro.png", moduleId: "financeiro", label: "Mobile Financeiro" },
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJson(url, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      await delay(250);
    }
  }
  throw new Error(`CDP endpoint not available: ${url}`);
}

class Cdp {
  constructor(wsUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.ws = new WebSocket(wsUrl);
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
        return;
      }
      const callbacks = this.listeners.get(msg.method) || [];
      for (const callback of callbacks) callback(msg);
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  on(method, callback) {
    const current = this.listeners.get(method) || [];
    current.push(callback);
    this.listeners.set(method, current);
  }

  close() {
    this.ws.close();
  }
}

async function ownerLogin() {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ownerEmail, password: ownerPassword, activeUnitId: "unit-01" }),
  });
  if (!res.ok) throw new Error(`owner login failed: ${res.status}`);
  const data = await res.json();
  const user = data.user || {};
  return {
    accessToken: data.accessToken,
    expiresAt: data.expiresAt,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      activeUnitId: user.activeUnitId,
      unitIds: Array.isArray(user.unitIds) ? user.unitIds : [],
    },
  };
}

function initScript(session, activeModule) {
  return `
    (() => {
      const session = ${JSON.stringify(session)};
      localStorage.setItem("authToken", session.accessToken);
      localStorage.setItem("sb.authSession", JSON.stringify(session));
      localStorage.setItem("sb.themeMode", "light");
      localStorage.setItem("sb.themeModeUserSet", "true");
      if (${JSON.stringify(Boolean(activeModule))}) localStorage.setItem("sb.activeModule", ${JSON.stringify(activeModule)});
    })();
  `;
}

async function createPage(cdp, options = {}) {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  const errors = [];
  const httpErrors = [];

  cdp.on("Runtime.consoleAPICalled", (msg) => {
    if (msg.sessionId !== sessionId) return;
    const params = msg.params || {};
    if (params.type === "error") errors.push(params.args?.map((arg) => arg.value || arg.description || "").join(" "));
  });
  cdp.on("Log.entryAdded", (msg) => {
    if (msg.sessionId !== sessionId) return;
    const entry = msg.params?.entry;
    if (entry?.level === "error") errors.push(entry.text);
  });
  cdp.on("Network.responseReceived", (msg) => {
    if (msg.sessionId !== sessionId) return;
    const response = msg.params?.response;
    if (response?.status >= 500) httpErrors.push({ status: response.status, url: response.url });
  });

  if (options.mobile) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    }, sessionId);
  } else {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    }, sessionId);
  }
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Log.enable", {}, sessionId);
  await cdp.send("Network.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  return { targetId: target.targetId, sessionId, errors, httpErrors };
}

async function waitForReady(cdp, sessionId, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: "document.readyState === 'complete'",
      returnByValue: true,
    }, sessionId);
    if (result.result?.value) return;
    await delay(250);
  }
}

async function waitForExpression(cdp, sessionId, expression, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true }, sessionId);
    if (result.result?.value) return true;
    await delay(250);
  }
  return false;
}

async function evalValue(cdp, sessionId, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true }, sessionId);
  return result.result?.value;
}

async function maskDom(cdp, sessionId) {
  await cdp.send("Runtime.evaluate", {
    expression: `
      (() => {
        const mask = (text) => String(text || "")
          .replace(/[\\w.+-]+@[\\w.-]+\\.[a-z]{2,}/gi, (m) => {
            const [name, domain] = m.split("@");
            return (name ? name[0] + "***" : "***") + "@" + (domain ? domain.replace(/^[^.]+/, "***") : "***");
          })
          .replace(/\\b\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2}\\b/g, "***.***.***-**")
          .replace(/\\(?\\b\\d{2}\\)?\\s?9?\\d{4}[-\\s]?\\d{4}\\b/g, "(**) *****-****");
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const node of nodes) node.nodeValue = mask(node.nodeValue);
        for (const el of document.querySelectorAll("input, textarea")) el.value = mask(el.value);
      })();
    `,
  }, sessionId);
}

async function screenshot(cdp, sessionId, fileName) {
  await maskDom(cdp, sessionId);
  const image = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
  }, sessionId);
  fs.writeFileSync(path.join(evidenceDir, fileName), Buffer.from(image.data, "base64"));
}

async function validateAppModule(cdp, session, check, mobile = false) {
  const page = await createPage(cdp, { mobile });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: initScript(session, check.moduleId) }, page.sessionId);
  await cdp.send("Page.navigate", { url: `${baseUrl}/` }, page.sessionId);
  await waitForReady(cdp, page.sessionId);
  await waitForExpression(
    cdp,
    page.sessionId,
    `Boolean(document.querySelector(".module-section:not(.hidden), #appShell"))`,
  );
  await delay(3000);
  const state = await evalValue(cdp, page.sessionId, `
    (() => {
      const section = document.querySelector(".module-section:not(.hidden)");
      return {
        url: location.href,
        title: document.title,
        requestedModule: ${JSON.stringify(check.moduleId)},
        activeModule: localStorage.getItem("sb.activeModule"),
        visibleSection: section?.getAttribute("data-section") || section?.id || "",
        hasShell: Boolean(document.querySelector("#appShell")),
        bodyText: document.body.innerText.slice(0, 600),
        viewport: window.innerWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      };
    })()
  `);
  await screenshot(cdp, page.sessionId, check.file);
  await cdp.send("Target.closeTarget", { targetId: page.targetId });
  return { ...check, mobile, state, consoleErrors: page.errors, http5xx: page.httpErrors };
}

async function captureLogin(cdp, fileName, mobile = false) {
  const page = await createPage(cdp, { mobile });
  await cdp.send("Page.navigate", { url: `${baseUrl}/login` }, page.sessionId);
  await waitForReady(cdp, page.sessionId);
  await delay(1000);
  const state = await evalValue(cdp, page.sessionId, `
    (() => ({
      url: location.href,
      title: document.title,
      hasEmail: Boolean(document.querySelector("#email")),
      hasPassword: Boolean(document.querySelector("#password")),
      hasSubmit: Boolean(document.querySelector("#submitBtn")),
      viewport: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    }))()
  `);
  await screenshot(cdp, page.sessionId, fileName);
  await cdp.send("Target.closeTarget", { targetId: page.targetId });
  return { label: mobile ? "Mobile login" : "Login owner", file: fileName, mobile, state, consoleErrors: page.errors, http5xx: page.httpErrors };
}

async function fillChat(cdp, sessionId, value) {
  await cdp.send("Runtime.evaluate", {
    expression: `
      (() => {
        const input = document.querySelector("#chatInput");
        input.focus();
        input.value = ${JSON.stringify(value)};
        input.dispatchEvent(new Event("input", { bubbles: true }));
        document.querySelector("#btnSend").click();
      })();
    `,
  }, sessionId);
  await delay(900);
}

async function validateBooking(cdp, options = {}) {
  const mobile = Boolean(options.mobile);
  const submit = options.submit !== false;
  const page = await createPage(cdp, { mobile });
  await cdp.send("Page.navigate", { url: `${baseUrl}/agendamento` }, page.sessionId);
  await waitForReady(cdp, page.sessionId);
  await delay(2500);
  await fillChat(cdp, page.sessionId, "Cliente Teste TG");
  await fillChat(cdp, page.sessionId, "11900000000");
  await fillChat(cdp, page.sessionId, bookingEmail);
  await waitForExpression(cdp, page.sessionId, "document.querySelectorAll('.svc-card').length > 0");
  await cdp.send("Runtime.evaluate", { expression: "document.querySelector('.svc-card')?.click()" }, page.sessionId);
  await waitForExpression(cdp, page.sessionId, "document.querySelectorAll('.cal-day:not(.unavail)').length > 0");
  await cdp.send("Runtime.evaluate", { expression: "document.querySelector('.cal-day:not(.unavail)')?.click()" }, page.sessionId);
  await waitForExpression(cdp, page.sessionId, "document.querySelectorAll('.slot-btn:not(.taken)').length > 0");
  await cdp.send("Runtime.evaluate", { expression: "document.querySelector('.slot-btn:not(.taken)')?.click()" }, page.sessionId);
  await waitForExpression(cdp, page.sessionId, "Boolean(document.querySelector('#btnConfirm'))");
  if (submit) {
    await cdp.send("Runtime.evaluate", { expression: "document.querySelector('#btnConfirm')?.click()" }, page.sessionId);
    await waitForExpression(cdp, page.sessionId, "Boolean(document.querySelector('#btnRestartBooking'))", 120);
  }
  await delay(1000);
  const state = await evalValue(cdp, page.sessionId, `
    (() => ({
      url: location.href,
      title: document.title,
      success: Boolean(document.querySelector("#btnRestartBooking")),
      reachedConfirmation: Boolean(document.querySelector("#btnConfirm")),
      submitted: ${JSON.stringify(submit)},
      bodyText: document.body.innerText.slice(0, 900),
      viewport: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      localAppointments: JSON.parse(localStorage.getItem("liddo_appts") || "[]").slice(-2),
    }))()
  `);
  await screenshot(cdp, page.sessionId, mobile ? "14-mobile-booking.png" : "11-booking-publico.png");
  await cdp.send("Target.closeTarget", { targetId: page.targetId });
  return {
    label: mobile ? "Mobile booking publico" : "Booking publico",
    file: mobile ? "14-mobile-booking.png" : "11-booking-publico.png",
    mobile,
    state,
    consoleErrors: page.errors,
    http5xx: page.httpErrors,
  };
}

async function findTestAppointment(session) {
  const res = await fetch(`${baseUrl}/appointments?period=month`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  if (!res.ok) return { ok: false, status: res.status };
  const payload = await res.json();
  const rows = Array.isArray(payload) ? payload : payload.items || payload.appointments || [];
  const matches = rows
    .filter((item) => String(item.clientName || item.client?.fullName || "").includes("Cliente Teste TG"))
    .map((item) => ({
      id: item.id,
      clientName: item.clientName || item.client?.fullName,
      status: item.status,
      startsAt: item.startsAt,
      serviceName: item.serviceName || item.service?.name,
    }));
  return { ok: true, matches: matches.slice(-5) };
}

if (!fs.existsSync(chromePath)) {
  throw new Error(`Chrome headless shell not found: ${chromePath}`);
}

const chrome = spawn(chromePath, [
  "--headless=new",
  "--no-sandbox",
  "--ignore-certificate-errors",
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${userDataDir}`,
  "about:blank",
], { stdio: "ignore" });

try {
  const version = await waitForJson(`http://127.0.0.1:${cdpPort}/json/version`);
  const cdp = new Cdp(version.webSocketDebuggerUrl);
  await cdp.open();
  const session = await ownerLogin();
  const results = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    ownerUserMasked: ownerEmail.replace(/^(.).+(@.+)$/, "$1***$2"),
    screenshots: [],
    bookingCreated: null,
  };

  results.screenshots.push(await captureLogin(cdp, "01-login-owner.png", false));
  for (const check of desktopChecks) {
    results.screenshots.push(await validateAppModule(cdp, session, check, false));
  }
  results.screenshots.push(await validateBooking(cdp, { mobile: false, submit: true }));
  results.screenshots.push(await captureLogin(cdp, "12-mobile-login.png", true));
  for (const check of mobileChecks.filter((item) => item.kind !== "login")) {
    results.screenshots.push(await validateAppModule(cdp, session, check, true));
  }
  results.screenshots.push(await validateBooking(cdp, { mobile: true, submit: false }));
  results.bookingCreated = await findTestAppointment(session);

  fs.writeFileSync(path.join(evidenceDir, "browser-results.json"), JSON.stringify(results, null, 2));
  for (const item of results.screenshots) {
    const state = item.state || {};
    console.log(`${item.file}: ${item.label} | visible=${state.visibleSection || state.success || state.hasEmail || "n/a"} | 5xx=${item.http5xx.length} | consoleErrors=${item.consoleErrors.length} | overflow=${state.horizontalOverflow}`);
  }
  console.log(`booking matches: ${JSON.stringify(results.bookingCreated)}`);
  cdp.close();
} finally {
  chrome.kill("SIGTERM");
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
