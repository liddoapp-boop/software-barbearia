import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const chromePath = "/root/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";
const baseUrl = "http://127.0.0.1:3335";
const port = 9335;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fase-105-cdp-"));

const checks = [
  ["owner", "financeiro"],
  ["owner", "agenda"],
  ["owner", "operacao"],
  ["owner", "configuracoes"],
  ["owner", "agendamento-link"],
  ["recepcao", "auditoria"],
  ["profissional", "auditoria"],
];

const credentials = {
  owner: ["owner@barbearia.local", "owner123"],
  recepcao: ["recepcao@barbearia.local", "recepcao123"],
  profissional: ["profissional@barbearia.local", "profissional123"],
};

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

async function buildStorage(role, moduleId) {
  const [email, password] = credentials[role];
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, activeUnitId: "unit-01" }),
  });
  if (!res.ok) throw new Error(`${role} login failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const user = data.user || {};
  const session = {
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
  return [
    { name: "authToken", value: data.accessToken },
    { name: "sb.authSession", value: JSON.stringify(session) },
    { name: "sb.themeMode", value: "light" },
    { name: "sb.themeModeUserSet", value: "true" },
    { name: "sb.activeModule", value: moduleId },
  ];
}

function initScript(localStorageItems) {
  return `
    (() => {
      const entries = ${JSON.stringify(localStorageItems)};
      for (const item of entries) localStorage.setItem(item.name, item.value);
    })();
  `;
}

const chrome = spawn(chromePath, [
  "--headless=new",
  "--no-sandbox",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  "about:blank",
], { stdio: "ignore" });

try {
  const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const cdp = new Cdp(version.webSocketDebuggerUrl);
  await cdp.open();
  const rows = [];

  for (const [role, moduleId] of checks) {
    const errors = [];
    const httpErrors = [];
    const target = await cdp.send("Target.createTarget", { url: "about:blank" });
    const attached = await cdp.send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    });
    const sessionId = attached.sessionId;

    const onConsole = (msg) => {
      if (msg.sessionId !== sessionId) return;
      const params = msg.params || {};
      if (params.type === "error") {
        errors.push(params.args?.map((arg) => arg.value || arg.description || "").join(" "));
      }
    };
    const onLog = (msg) => {
      if (msg.sessionId !== sessionId) return;
      const params = msg.params || {};
      if (params.entry?.level === "error") errors.push(params.entry.text);
    };
    const onResponse = (msg) => {
      if (msg.sessionId !== sessionId) return;
      const response = msg.params?.response;
      if (response?.status >= 400) {
        httpErrors.push({ status: response.status, url: response.url });
      }
    };

    cdp.on("Runtime.consoleAPICalled", onConsole);
    cdp.on("Log.entryAdded", onLog);
    cdp.on("Network.responseReceived", onResponse);

    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Log.enable", {}, sessionId);
    await cdp.send("Network.enable", {}, sessionId);
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: initScript(await buildStorage(role, moduleId)),
    }, sessionId);
    await cdp.send("Page.navigate", { url: `${baseUrl}/` }, sessionId);
    await delay(4500);
    rows.push({ role, moduleId, errors, httpErrors });
    await cdp.send("Target.closeTarget", { targetId: target.targetId });
  }

  fs.writeFileSync(
    ".planning/evidence/fase-105/console-check.json",
    JSON.stringify(rows, null, 2),
  );
  for (const row of rows) {
    console.log(`${row.role}/${row.moduleId}: ${row.errors.length} console error(s), ${row.httpErrors.length} HTTP error(s)`);
    for (const error of row.errors) console.log(`  - ${error}`);
    for (const error of row.httpErrors) console.log(`  - HTTP ${error.status}: ${error.url}`);
  }
  cdp.close();
} finally {
  chrome.kill("SIGTERM");
}
