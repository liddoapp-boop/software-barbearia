import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const chromePath = "/root/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";
const baseUrl = process.env.OVERFLOW_BASE_URL || "http://127.0.0.1:3336";
const port = Number(process.env.OVERFLOW_CDP_PORT || 9348);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fase-108-cdp-"));
const outputPath = ".planning/evidence/fase-108/overflow-mobile-check.json";
const modules = ["dashboard", "agenda", "operacao", "financeiro"];
const disableGlobalClamp = process.env.OVERFLOW_DISABLE_GLOBAL_CLAMP === "1";

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
    this.ws = new WebSocket(wsUrl);
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (!msg.id || !this.pending.has(msg.id)) return;
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
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

  close() {
    this.ws.close();
  }
}

async function login() {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    }),
  });
  if (!res.ok) throw new Error(`owner login failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function initScript(session, activeModule) {
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

async function waitForLoad(cdp, sessionId) {
  for (let i = 0; i < 80; i += 1) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: "document.readyState",
      returnByValue: true,
    }, sessionId);
    if (result.result?.value === "complete") return;
    await delay(250);
  }
}

async function measure(cdp, session, moduleId, openMenu = false) {
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
    source: initScript(session, moduleId),
  }, sessionId);
  await cdp.send("Page.navigate", { url: `${baseUrl}/` }, sessionId);
  await waitForLoad(cdp, sessionId);
  await delay(2200);

  if (disableGlobalClamp) {
    await cdp.send("Runtime.evaluate", {
      expression: `
        (() => {
          document.documentElement.style.overflowX = "visible";
          document.body.style.overflowX = "visible";
          document.body.classList.remove("overflow-x-hidden");
        })();
      `,
    }, sessionId);
    await delay(250);
  }

  if (openMenu) {
    await cdp.send("Runtime.evaluate", {
      expression: `
        (() => {
          const btn = document.querySelector('[data-mobile-tab="more"], [data-mobile-more-toggle], #appMobileTabs button:last-child');
          if (btn) btn.click();
        })();
      `,
    }, sessionId);
    await delay(500);
  }

  const result = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `
      (() => {
        const viewport = window.innerWidth;
        const doc = document.documentElement;
        const body = document.body;
        const nodes = Array.from(document.querySelectorAll("body *"));
        const offenders = nodes
          .filter((el) => {
            const style = window.getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden") return false;
            if (el.closest("[aria-hidden='true'], .hidden, .wc-outer")) return false;
            return true;
          })
          .map((el) => {
            const rect = el.getBoundingClientRect();
            return {
              tag: el.tagName.toLowerCase(),
              id: el.id || "",
              className: typeof el.className === "string" ? el.className : "",
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
              overflowRight: Math.round(rect.right - viewport),
            };
          })
          .filter((item) => item.width > 0 && item.overflowRight > 2)
          .sort((a, b) => b.overflowRight - a.overflowRight)
          .slice(0, 12);
        return {
          moduleId: ${JSON.stringify(moduleId)},
          openMenu: ${JSON.stringify(openMenu)},
          viewport,
          documentScrollWidth: doc.scrollWidth,
          bodyScrollWidth: body.scrollWidth,
          documentClientWidth: doc.clientWidth,
          overflow: doc.scrollWidth - viewport,
          offenders,
        };
      })();
    `,
  }, sessionId);

  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  return result.result.value;
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
  const session = await login();
  const rows = [];
  for (const moduleId of modules) {
    rows.push(await measure(cdp, session, moduleId, false));
  }
  rows.push(await measure(cdp, session, "dashboard", true));
  fs.writeFileSync(outputPath, JSON.stringify(rows, null, 2));
  for (const row of rows) {
    const label = row.openMenu ? `${row.moduleId}/menu` : row.moduleId;
    console.log(`${label}: viewport=${row.viewport} scrollWidth=${row.documentScrollWidth} overflow=${row.overflow}`);
    for (const offender of row.offenders.slice(0, 3)) {
      console.log(`  ${offender.tag}${offender.id ? `#${offender.id}` : ""}.${offender.className} right=${offender.right} overflow=${offender.overflowRight}`);
    }
  }
  const failing = rows.filter((row) => row.documentScrollWidth > row.viewport + 2);
  cdp.close();
  if (failing.length) {
    process.exitCode = 1;
  }
} finally {
  chrome.kill("SIGTERM");
}
