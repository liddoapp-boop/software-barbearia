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
  timeout: ReturnType<typeof setTimeout>;
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
      clearTimeout(request.timeout);
      if (msg.error) request.reject(new Error(msg.error.message));
      else request.resolve(msg.result);
    });
    this.ws.addEventListener("close", () => {
      this.pending.forEach((request) => {
        clearTimeout(request.timeout);
        request.reject(new Error("CDP websocket closed before the command completed"));
      });
      this.pending.clear();
    });
  }

  send(method: string, params: Record<string, any> = {}, sessionId?: string): Promise<any> {
    const id = this.nextId;
    this.nextId += 1;
    const payload: Record<string, any> = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        const detail = method === "Runtime.evaluate"
          ? ` (${String(params.expression || "").replace(/\s+/g, " ").trim().slice(0, 120)})`
          : "";
        reject(new Error(`CDP command timed out: ${method}${detail}`));
      }, 15_000);
      this.pending.set(id, { resolve, reject, timeout });
      this.ws.send(JSON.stringify(payload));
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
  const cookies = setCookies.map((header) => {
    const [pair] = header.split(";");
    const separator = pair.indexOf("=");
    return { name: pair.slice(0, separator), value: decodeURIComponent(pair.slice(separator + 1)) };
  });
  return {
    session: { expiresAt: data.expiresAt, user: data.user },
    cookies,
  };
}

async function configureWorkingHours(
  auth: any,
  hours: Array<{
    dayOfWeek: number;
    opensAt?: string;
    closesAt?: string;
    isClosed: boolean;
  }>,
) {
  const csrfToken = auth.cookies.find((cookie: { name: string }) => cookie.name === "sb_csrf")?.value || "";
  const configuredHours = await fetch(`${baseUrl}/settings/business-hours`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: auth.cookies.map((cookie: { name: string; value: string }) =>
        `${cookie.name}=${encodeURIComponent(cookie.value)}`).join("; "),
      "x-csrf-token": csrfToken,
      origin: baseUrl,
      referer: `${baseUrl}/`,
    },
    body: JSON.stringify({
      unitId: "unit-01",
      hours,
    }),
  });
  if (!configuredHours.ok) {
    throw new Error(`working_hours_setup_failed:${configuredHours.status}:${await configuredHours.text()}`);
  }
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

async function clickSelector(
  cdp: Cdp,
  sessionId: string,
  selector: string,
  position: "center" | "right" = "center",
) {
  const measured = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `
      (() => {
        const element = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
          .find((candidate) => {
            const candidateRect = candidate.getBoundingClientRect();
            const candidateStyle = getComputedStyle(candidate);
            return candidateRect.width > 0
              && candidateRect.height > 0
              && candidateStyle.display !== "none"
              && candidateStyle.visibility !== "hidden";
          });
        if (!(element instanceof HTMLElement)) return null;
        const rect = element.getBoundingClientRect();
        const x = ${JSON.stringify(position)} === "right" ? rect.right - 12 : rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const top = document.elementFromPoint(x, y);
        return {
          x,
          y,
          disabled: "disabled" in element ? Boolean(element.disabled) : false,
          pointerEvents: getComputedStyle(element).pointerEvents,
          inertAncestor: Boolean(element.closest("[inert]")),
          hitTarget: top?.id || top?.getAttribute?.("data-sidebar-module") || top?.className || top?.tagName || null,
          hitMatches: Boolean(top && (top === element || element.contains(top))),
        };
      })()
    `,
  }, sessionId);
  const point = measured.result?.value;
  if (!point) throw new Error(`Elemento ausente para clique: ${selector}`);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  }, sessionId);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  }, sessionId);
  return point;
}

async function pressEscape(cdp: Cdp, sessionId: string) {
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  }, sessionId);
}

async function interactionState(cdp: Cdp, sessionId: string) {
  const result = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `
      (() => {
        const overlaySelectors = [
          ".mobile-sidebar-backdrop",
          ".op-drawer",
          ".sched-drawer",
          ".ds-modal-backdrop",
          ".svc-modal-backdrop",
        ];
        const blockingOverlays = Array.from(document.querySelectorAll(overlaySelectors.join(",")))
          .filter((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== "none"
              && style.visibility !== "hidden"
              && style.pointerEvents !== "none"
              && rect.width > 0
              && rect.height > 0;
          })
          .map((element) => element.id || element.className);
        const appMainStyle = getComputedStyle(document.querySelector("#appMain"));
        const appContentStyle = getComputedStyle(document.querySelector("#appContent"));
        const primaryArea = document.querySelector('[data-sidebar-area="primary"]');
        const administrativeArea = document.querySelector('[data-sidebar-area="administrative"]');
        const footer = document.querySelector("#appSidebar .sb-footer");
        const profileCard = footer?.querySelector(".sb-user-card");
        const lastAdministrativeItem = administrativeArea?.querySelector(".sb-item:last-child");
        const activeSidebarItem = document.querySelector(".sb-item.is-active");
        const activeIndicator = document.querySelector(".sb-active-indicator");
        const dividerStyle = administrativeArea ? getComputedStyle(administrativeArea) : null;
        return {
          activeModule: localStorage.getItem("sb.activeModule"),
          mobileSidebarOpen: document.querySelector("#appShell")?.classList.contains("mobile-sidebar-open") || false,
          appMainInert: document.querySelector("#appMain")?.hasAttribute("inert") || false,
          appMainPointerEvents: appMainStyle.pointerEvents,
          appContentPointerEvents: appContentStyle.pointerEvents,
          inertElements: Array.from(document.querySelectorAll("[inert]"), (element) => element.id || element.className || element.tagName),
          blockingOverlays,
          scheduleOpen: document.querySelector("#scheduleDrawer")?.classList.contains("is-open") || false,
          primaryModules: Array.from(
            primaryArea?.querySelectorAll("[data-sidebar-module]") || [],
            (element) => element.getAttribute("data-sidebar-module"),
          ),
          administrativeModules: Array.from(
            administrativeArea?.querySelectorAll("[data-sidebar-module]") || [],
            (element) => element.getAttribute("data-sidebar-module"),
          ),
          activeSidebarModule: document.querySelector(".sb-item.is-active")?.getAttribute("data-sidebar-module") || null,
          activeIndicatorAligned: activeSidebarItem && activeIndicator
            ? Math.abs(
                (activeSidebarItem.getBoundingClientRect().top + activeSidebarItem.getBoundingClientRect().height / 2)
                - (activeIndicator.getBoundingClientRect().top + activeIndicator.getBoundingClientRect().height / 2)
              ) < 3
            : false,
          footerUser: document.querySelector("#appSidebar .sb-user-name")?.textContent?.trim() || "",
          footerRole: document.querySelector("#appSidebar .sb-user-subtitle")?.textContent?.trim() || "",
          administrativeProfileGap: lastAdministrativeItem && profileCard
            ? profileCard.getBoundingClientRect().top - lastAdministrativeItem.getBoundingClientRect().bottom
            : null,
          hasAdministrativeDivider: Boolean(
            dividerStyle
            && Number.parseFloat(dividerStyle.borderTopWidth) >= 1
            && dividerStyle.borderTopStyle !== "none"
          ),
          errors: window.__interactionErrors || [],
        };
      })()
    `,
  }, sessionId);
  return result.result.value;
}

async function motionState(cdp: Cdp, sessionId: string) {
  const result = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `
      (() => {
        const animations = document.getAnimations()
          .filter((animation) => animation.playState === "running" || animation.playState === "pending")
          .map((animation) => {
            const effect = animation.effect;
            const target = effect && "target" in effect ? effect.target : null;
            const timing = effect?.getComputedTiming?.() || {};
            const keyframes = effect?.getKeyframes?.() || [];
            return {
              target: target?.id || target?.className || target?.tagName || "",
              duration: Number(timing.duration || 0),
              properties: Array.from(new Set(keyframes.flatMap((frame) =>
                ["opacity", "transform"].filter((property) => property in frame)
              ))),
            };
          })
          .filter((animation) => animation.duration >= 120);
        return {
          reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          animations,
          layoutShift: Number(window.__motionLayoutShift || 0),
          scrollWidth: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
        };
      })()
    `,
  }, sessionId);
  return result.result.value;
}

async function exerciseInteractionCycle(
  cdp: Cdp,
  auth: any,
  viewport: { width: number; height: number; mobile: boolean },
) {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  }, sessionId);
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  }, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await installAuthCookies(cdp, sessionId, auth);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `${initScript(auth, "agenda")}
      window.__interactionErrors = [];
      window.addEventListener("error", (event) => window.__interactionErrors.push(String(event.message || event.error)));
      window.addEventListener("unhandledrejection", (event) => window.__interactionErrors.push(String(event.reason)));
      const originalConsoleError = console.error;
      window.__motionLayoutShift = 0;
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) window.__motionLayoutShift += entry.value || 0;
          }
        }).observe({ type: "layout-shift", buffered: true });
      } catch {}
      console.error = (...args) => {
        window.__interactionErrors.push(args.map(String).join(" "));
        originalConsoleError.apply(console, args);
      };
    `,
  }, sessionId);
  await cdp.send("Page.navigate", { url: `${baseUrl}/` }, sessionId);
  await waitForComplete(cdp, sessionId);
  await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('#agendaNewAppointmentBtn'))");
  await delay(900);

  const phases: Record<string, any> = {};
  phases.initial = await interactionState(cdp, sessionId);
  phases.motionBaseline = await motionState(cdp, sessionId);
  phases.primaryHit = await clickSelector(cdp, sessionId, "#agendaNewAppointmentBtn");
  phases.motionDrawerOpen = await motionState(cdp, sessionId);
  await delay(350);
  phases.drawerOpen = await interactionState(cdp, sessionId);
  phases.drawerCloseHit = await clickSelector(cdp, sessionId, "#scheduleDrawerClose");
  await delay(350);
  phases.drawerClosed = await interactionState(cdp, sessionId);

  const compactNavigation = viewport.width < 1280;
  if (compactNavigation) {
    phases.menuOpenHit = await clickSelector(cdp, sessionId, ".mobile-sidebar-toggle");
    phases.motionMenuOpen = await motionState(cdp, sessionId);
    await delay(300);
    phases.menuOpen = await interactionState(cdp, sessionId);
    await pressEscape(cdp, sessionId);
    await delay(300);
    phases.menuEscClosed = await interactionState(cdp, sessionId);

    await clickSelector(cdp, sessionId, ".mobile-sidebar-toggle");
    await delay(300);
    phases.backdropHit = await clickSelector(cdp, sessionId, "#mobileSidebarBackdrop", "right");
    await delay(300);
    phases.menuBackdropClosed = await interactionState(cdp, sessionId);

    await clickSelector(cdp, sessionId, ".mobile-sidebar-toggle");
    await delay(300);
  }

  phases.sidebarHit = await clickSelector(cdp, sessionId, '[data-sidebar-module="clientes"]');
  phases.motionModuleChange = await motionState(cdp, sessionId);
  await delay(500);
  phases.afterNavigation = await interactionState(cdp, sessionId);

  if (compactNavigation) {
    await clickSelector(cdp, sessionId, ".mobile-sidebar-toggle");
    await delay(300);
  }
  await clickSelector(cdp, sessionId, '[data-sidebar-module="agenda"]');
  await delay(500);
  phases.afterReturn = await interactionState(cdp, sessionId);
  if (compactNavigation) {
    await clickSelector(cdp, sessionId, "#viewListBtn");
    phases.motionAgendaList = await motionState(cdp, sessionId);
    await delay(320);
    await clickSelector(cdp, sessionId, "#viewGridBtn");
    phases.motionAgendaWeek = await motionState(cdp, sessionId);
    await delay(320);
  }
  phases.primaryAfterReturnHit = await clickSelector(cdp, sessionId, "#agendaNewAppointmentBtn");
  await delay(300);
  await pressEscape(cdp, sessionId);
  await delay(350);
  phases.final = await interactionState(cdp, sessionId);
  phases.motionFinal = await motionState(cdp, sessionId);

  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  return phases;
}

async function measureAppointmentServiceSelection(
  cdp: Cdp,
  auth: any,
  viewport: { width: number; height: number; mobile: boolean },
) {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  }, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await installAuthCookies(cdp, sessionId, auth);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: initScript(auth, "agenda"),
  }, sessionId);
  await cdp.send("Page.navigate", { url: `${baseUrl}/` }, sessionId);
  await waitForComplete(cdp, sessionId);
  await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('#agendaNewAppointmentBtn'))");
  await delay(900);
  await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('#agendaNewAppointmentBtn')?.click()",
  }, sessionId);
  await waitForExpression(cdp, sessionId, "document.querySelector('#scheduleDrawer')?.classList.contains('is-open')");
  await waitForExpression(cdp, sessionId, "document.querySelectorAll('[data-service-toggle]').length >= 2");
  await delay(250);

  const capture = async (phase: string) => {
    const result = await cdp.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `
        (() => {
          const rect = (element) => {
            if (!element) return null;
            const value = element.getBoundingClientRect();
            return {
              left: value.left,
              right: value.right,
              top: value.top,
              bottom: value.bottom,
              width: value.width,
              height: value.height,
            };
          };
          const overlaps = (first, second) => Boolean(
            first && second
            && first.left < second.right
            && first.right > second.left
            && first.top < second.bottom
            && first.bottom > second.top
          );
          const drawer = document.querySelector("#scheduleDrawer .sched-drawer-panel");
          const body = document.querySelector("#scheduleDrawer .sched-drawer-body");
          const shell = document.querySelector("#serviceSelectionMount");
          const layout = shell?.querySelector(".svc-selection-layout");
          const available = layout?.querySelector(".svc-option-panel");
          const selected = layout?.querySelector(".svc-selected-box");
          const selectedItems = Array.from(shell?.querySelectorAll(".svc-selected-item") || []);
          const removeButtons = Array.from(shell?.querySelectorAll(".svc-remove-btn") || []);
          const names = Array.from(shell?.querySelectorAll(".svc-selected-name b") || []);
          const confirm = document.querySelector("#scheduleDrawer .sched-submit-btn");
          const serviceOptions = Array.from(shell?.querySelectorAll("[data-service-toggle]") || []);
          const lastService = serviceOptions.at(-1);
          const lastServiceRect = rect(lastService);
          const bodyRect = rect(body);
          const formFields = Array.from(
            document.querySelectorAll("#scheduleDrawer input:not([type='hidden']), #scheduleDrawer select, #scheduleDrawer textarea"),
          );
          const selectedRect = rect(selected);
          const confirmRect = rect(confirm);
          const layoutStyle = layout ? getComputedStyle(layout) : null;
          const availableRect = rect(available);
          const shellRect = rect(shell);
          const itemBounds = selectedItems.map((item) => {
            const itemRect = rect(item);
            const buttonRect = rect(item.querySelector(".svc-remove-btn"));
            return {
              item: itemRect,
              button: buttonRect,
              buttonInsideItem: Boolean(
                itemRect && buttonRect
                && buttonRect.left >= itemRect.left - 1
                && buttonRect.right <= itemRect.right + 1
              ),
            };
          });
          return {
            phase: ${JSON.stringify(phase)},
            viewportWidth: window.innerWidth,
            documentScrollWidth: document.documentElement.scrollWidth,
            documentBodyScrollWidth: document.body.scrollWidth,
            drawerClientWidth: drawer?.clientWidth || 0,
            drawerScrollWidth: drawer?.scrollWidth || 0,
            drawerBodyClientWidth: body?.clientWidth || 0,
            drawerBodyScrollWidth: body?.scrollWidth || 0,
            shellClientWidth: shell?.clientWidth || 0,
            shellScrollWidth: shell?.scrollWidth || 0,
            layoutClientWidth: layout?.clientWidth || 0,
            layoutScrollWidth: layout?.scrollWidth || 0,
            bodyOverflowingDescendants: Array.from(body?.querySelectorAll("*") || [])
              .map((element) => ({
                selector: element.id || element.className || element.tagName,
                clientWidth: element.clientWidth,
                scrollWidth: element.scrollWidth,
                left: element.getBoundingClientRect().left,
                right: element.getBoundingClientRect().right,
              }))
              .filter((element) =>
                element.scrollWidth > element.clientWidth + 1
                || element.right > (body?.getBoundingClientRect().right || innerWidth) + 1
              )
              .slice(0, 20),
            selectedClientWidth: selected?.clientWidth || 0,
            selectedScrollWidth: selected?.scrollWidth || 0,
            selectedCount: selectedItems.length,
            availableCount: serviceOptions.length,
            lastServiceLabel: lastService?.textContent?.trim() || "",
            lastServiceVisible: Boolean(
              lastServiceRect
              && bodyRect
              && lastServiceRect.top >= bodyRect.top - 1
              && lastServiceRect.bottom <= bodyRect.bottom + 1
            ),
            removeCount: removeButtons.length,
            namesFit: names.every((name) => name.scrollWidth <= name.clientWidth + 1),
            overflowingDescendants: Array.from(shell?.querySelectorAll("*") || [])
              .map((element) => ({
                selector: element.id || element.className || element.tagName,
                clientWidth: element.clientWidth,
                scrollWidth: element.scrollWidth,
                left: element.getBoundingClientRect().left,
                right: element.getBoundingClientRect().right,
              }))
              .filter((element) =>
                element.scrollWidth > element.clientWidth + 1
                || (shellRect && element.right > shellRect.right + 1)
              ),
            itemsFit: itemBounds.every((item) => item.buttonInsideItem),
            selectedInsideLayout: Boolean(
              selectedRect
              && rect(layout)
              && selectedRect.left >= rect(layout).left - 1
              && selectedRect.right <= rect(layout).right + 1
            ),
            stacked: Boolean(
              availableRect
              && selectedRect
              && selectedRect.top >= availableRect.bottom - 1
            ),
            gridTemplateColumns: layoutStyle?.gridTemplateColumns || "",
            summaryCount: document.querySelector(
              "#appointmentSummaryMount .svc-summary-metrics span:first-child strong",
            )?.textContent?.trim() || "0",
            professionalId: document.querySelector("#professionalId")?.value || "",
            professionalName: document.querySelector("#professionalSelectionMount strong")?.textContent?.trim() || "",
            confirmOverlapsSelected: Boolean(
              overlaps(confirmRect, selectedRect)
              && overlaps(confirmRect, rect(body))
            ),
            minFieldFontSize: Math.min(
              ...formFields.map((field) => parseFloat(getComputedStyle(field).fontSize)),
            ),
            transformedFieldAncestors: formFields.flatMap((field) => {
              const values = [];
              let current = field.parentElement;
              while (current && current !== document.querySelector("#scheduleDrawer")) {
                if (getComputedStyle(current).transform !== "none") {
                  values.push(current.id || current.className || current.tagName);
                }
                current = current.parentElement;
              }
              return values;
            }),
            drawerOpen: document.querySelector("#scheduleDrawer")?.classList.contains("is-open") || false,
          };
        })()
      `,
    }, sessionId);
    return result.result.value;
  };

  const clickInPage = async (expression: string) => {
    await cdp.send("Runtime.evaluate", { expression }, sessionId);
    await delay(700);
  };

  const phases: Record<string, any> = {};
  phases.empty = await capture("empty");

  await clickInPage("document.querySelector('[data-service-toggle]:not(.is-selected)')?.click()");
  await waitForExpression(cdp, sessionId, "document.querySelectorAll('.svc-selected-item').length === 1");
  phases.one = await capture("one");

  await clickInPage("document.querySelector('[data-service-toggle]:not(.is-selected)')?.click()");
  await waitForExpression(cdp, sessionId, "document.querySelectorAll('.svc-selected-item').length === 2");
  phases.multiple = await capture("multiple");

  for (let index = 0; index < 4; index += 1) {
    await clickInPage("document.querySelector('[data-service-toggle]:not(.is-selected)')?.click()");
  }
  await waitForExpression(cdp, sessionId, "document.querySelectorAll('.svc-selected-item').length === 6");
  await clickInPage("Array.from(document.querySelectorAll('#scheduleDrawer [data-service-toggle]')).at(-1)?.scrollIntoView({ block: 'center' })");
  phases.all = await capture("all");

  await clickInPage("document.querySelector('[data-service-clear]')?.click()");
  await clickInPage("document.querySelector('[data-service-toggle]:not(.is-selected)')?.click()");
  await clickInPage("document.querySelector('[data-service-toggle]:not(.is-selected)')?.click()");
  await waitForExpression(cdp, sessionId, "document.querySelectorAll('.svc-selected-item').length === 2");

  await cdp.send("Runtime.evaluate", {
    expression: `
      (() => {
        const name = document.querySelector(".svc-selected-name b");
        const meta = document.querySelector(".svc-selected-copy small");
        if (name) name.textContent = "Corte premium com tratamento capilar, acabamento completo e finalizacao personalizada extralonga";
        if (meta) meta.textContent = "R$ 123.456.789,90 - 12.345 min";
      })()
    `,
  }, sessionId);
  phases.longValues = await capture("long-values");

  await clickInPage("document.querySelector('.svc-remove-btn')?.click()");
  await waitForExpression(cdp, sessionId, "document.querySelectorAll('.svc-selected-item').length === 1");
  phases.removed = await capture("removed");

  await clickInPage("document.querySelector('[data-service-clear]')?.click()");
  await waitForExpression(cdp, sessionId, "document.querySelectorAll('.svc-selected-item').length === 0");
  phases.cleared = await capture("cleared");

  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  return phases;
}

async function measureAppointmentMobileContract(
  cdp: Cdp,
  auth: any,
  viewport: { width: number; height: number; mobile: boolean },
) {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    ...viewport,
    deviceScaleFactor: viewport.mobile ? 2 : 1,
  }, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await installAuthCookies(cdp, sessionId, auth);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: initScript(auth, "agenda"),
  }, sessionId);
  await cdp.send("Page.navigate", { url: `${baseUrl}/` }, sessionId);
  await waitForComplete(cdp, sessionId);
  await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('#agendaNewAppointmentBtn'))");
  await delay(700);
  await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('#appMain').scrollTop = 160",
  }, sessionId);

  const cycles = [];
  for (let index = 0; index < 5; index += 1) {
    await cdp.send("Runtime.evaluate", {
      expression: "document.querySelector('#agendaNewAppointmentBtn').click()",
    }, sessionId);
    await waitForExpression(cdp, sessionId, "document.querySelector('#scheduleDrawer')?.classList.contains('is-open')");
    await waitForExpression(cdp, sessionId, "document.querySelectorAll('#scheduleDrawer [data-service-toggle]').length === 6");
    const opened = await cdp.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const drawer = document.querySelector('#scheduleDrawer');
        const panel = drawer.querySelector('.sched-drawer-panel');
        const body = drawer.querySelector('.sched-drawer-body');
        const grid = drawer.querySelector('.appointment-datetime-fields');
        const startsAt = drawer.querySelector('#startsAt');
        const date = drawer.querySelector('#appointmentDate');
        const time = drawer.querySelector('#appointmentTime');
        const panelRect = panel.getBoundingClientRect();
        const passive = ['clientInsights', 'serviceSuggestions', 'appointmentFeedback', 'alternativeSlots']
          .map((id) => {
            const element = document.getElementById(id);
            return {
              id,
              hidden: element.hidden,
              text: element.textContent.trim(),
              display: getComputedStyle(element).display,
            };
          });
        return {
          pageLocked: document.body.classList.contains('interaction-surface-open'),
          windowScrollX: window.scrollX,
          windowScrollY: window.scrollY,
          mainScrollTop: document.querySelector('#appMain').scrollTop,
          documentScrollWidth: document.documentElement.scrollWidth,
          drawerScrollWidth: drawer.scrollWidth,
          drawerClientWidth: drawer.clientWidth,
          panelLeft: panelRect.left,
          panelRight: panelRect.right,
          panelTransform: getComputedStyle(panel).transform,
          bodyOverflowX: getComputedStyle(body).overflowX,
          bodyOverflowY: getComputedStyle(body).overflowY,
          bodyOverscroll: getComputedStyle(body).overscrollBehavior,
          serviceOverflowY: getComputedStyle(drawer.querySelector('.svc-option-list')).overflowY,
          serviceCount: drawer.querySelectorAll('[data-service-toggle]').length,
          passive,
          startsAtVisible: startsAt.getClientRects().length > 0,
          startsAtDisabled: startsAt.disabled,
          dateDisplay: getComputedStyle(date).display,
          timeDisplay: getComputedStyle(time).display,
          dateType: date.type,
          timeType: time.type,
          dateFontSize: parseFloat(getComputedStyle(date).fontSize),
          timeFontSize: parseFloat(getComputedStyle(time).fontSize),
          temporalColumns: getComputedStyle(grid).gridTemplateColumns,
        };
      })()`,
    }, sessionId);
    cycles.push(opened.result.value);
    await cdp.send("Runtime.evaluate", {
      expression: "document.querySelector('#scheduleDrawerClose').click()",
    }, sessionId);
    await waitForExpression(cdp, sessionId, "!document.querySelector('#scheduleDrawer')?.classList.contains('is-open')");
  }

  await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('#agendaNewAppointmentBtn').click()",
  }, sessionId);
  await waitForExpression(cdp, sessionId, "document.querySelector('#scheduleDrawer')?.classList.contains('is-open')");
  await cdp.send("Runtime.evaluate", {
    expression: "Array.from(document.querySelectorAll('#scheduleDrawer [data-service-toggle]')).at(-1)?.scrollIntoView({ block: 'center' })",
  }, sessionId);
  await delay(80);
  const lastService = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const body = document.querySelector('#scheduleDrawer .sched-drawer-body');
      const options = Array.from(document.querySelectorAll('#scheduleDrawer [data-service-toggle]'));
      const last = options.at(-1);
      const date = document.querySelector('#appointmentDate');
      const time = document.querySelector('#appointmentTime');
      date.value = '2026-08-19';
      time.value = '14:30';
      date.dispatchEvent(new Event('input', { bubbles: true }));
      time.dispatchEvent(new Event('input', { bubbles: true }));
      const bodyRect = body.getBoundingClientRect();
      const lastRect = last.getBoundingClientRect();
      const visible = lastRect.top >= bodyRect.top - 1 && lastRect.bottom <= bodyRect.bottom + 1;
      last.click();
      return {
        visible,
        label: last.textContent.trim(),
        selected: last.getAttribute('aria-pressed') === 'true' || last.classList.contains('is-selected'),
        bodyScrollTop: body.scrollTop,
        bodyScrollHeight: body.scrollHeight,
        bodyClientHeight: body.clientHeight,
        startsAtValue: document.querySelector('#startsAt').value,
      };
    })()`,
  }, sessionId);
  await delay(120);
  const selectedLast = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const options = Array.from(document.querySelectorAll('#scheduleDrawer [data-service-toggle]'));
      const last = options.at(-1);
      return last?.getAttribute('aria-pressed') === 'true' || last?.classList.contains('is-selected') || false;
    })()`,
  }, sessionId);

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: viewport.width - 24, y: Math.floor(viewport.height / 2) }],
  }, sessionId);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 36, y: Math.floor(viewport.height / 2) }],
  }, sessionId);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, sessionId);
  await delay(80);
  const afterGesture = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const panelRect = document.querySelector('#scheduleDrawer .sched-drawer-panel').getBoundingClientRect();
      return {
        windowScrollX: window.scrollX,
        documentScrollWidth: document.documentElement.scrollWidth,
        panelLeft: panelRect.left,
        panelRight: panelRect.right,
        mainScrollTop: document.querySelector('#appMain').scrollTop,
      };
    })()`,
  }, sessionId);
  await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('#scheduleDrawerClose').click()",
  }, sessionId);
  await waitForExpression(cdp, sessionId, "!document.querySelector('#scheduleDrawer')?.classList.contains('is-open')");
  const closed = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `({
      pageLocked: document.body.classList.contains('interaction-surface-open'),
      mainScrollTop: document.querySelector('#appMain').scrollTop,
      windowScrollX: window.scrollX,
      documentScrollWidth: document.documentElement.scrollWidth,
    })`,
  }, sessionId);
  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  return {
    cycles,
    lastService: { ...lastService.result.value, selected: selectedLast.result.value },
    afterGesture: afterGesture.result.value,
    closed: closed.result.value,
  };
}

async function measureFinancialOverlayCycles(cdp: Cdp, auth: any) {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  }, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await installAuthCookies(cdp, sessionId, auth);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `${initScript(auth, "financeiro")}
      window.__surfaceListenerAdds = 0;
      const originalSurfaceAddEventListener = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (...args) {
        window.__surfaceListenerAdds += 1;
        return originalSurfaceAddEventListener.apply(this, args);
      };
    `,
  }, sessionId);
  await cdp.send("Page.navigate", { url: `${baseUrl}/` }, sessionId);
  await waitForComplete(cdp, sessionId);
  await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('#financialAddTransactionBtn'))");
  await delay(900);

  const cycles = [];
  for (let index = 0; index < 10; index += 1) {
    await cdp.send("Runtime.evaluate", {
      expression: "document.querySelector('#financialAddTransactionBtn')?.click()",
    }, sessionId);
    await waitForExpression(
      cdp,
      sessionId,
      "!document.querySelector('#financialTransactionModal')?.classList.contains('hidden')",
    );
    await delay(40);
    const opened = await cdp.send("Runtime.evaluate", {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        const modal = document.querySelector('#financialTransactionModal');
        const panel = modal?.querySelector('.fn-modal');
        const form = modal?.querySelector('#financialTransactionForm');
        const dateField = modal?.querySelector('#financialTransactionDate');
        const fields = Array.from(form?.querySelectorAll('input:not([type="hidden"]), select, textarea') || []);
        const transformedAncestors = fields.flatMap((field) => {
          const values = [];
          let current = field.parentElement;
          while (current && current !== modal) {
            if (getComputedStyle(current).transform !== 'none') {
              values.push(current.id || current.className || current.tagName);
            }
            current = current.parentElement;
          }
          return values;
        });
        form.scrollTop = form.scrollHeight;
        let mutationCount = 0;
        const observer = new MutationObserver((entries) => {
          mutationCount += entries.length;
        });
        observer.observe(modal, { subtree: true, childList: true, attributes: true });
        await new Promise((resolve) => setTimeout(resolve, 120));
        observer.disconnect();
        const actions = modal.querySelector('.fn-modal-actions')?.getBoundingClientRect();
        const panelRect = panel?.getBoundingClientRect();
        return {
          visibleOverlayCount: Array.from(document.querySelectorAll('#financialTransactionModal'))
            .filter((item) => {
              const style = getComputedStyle(item);
              return style.display !== 'none' && !item.classList.contains('hidden');
            }).length,
          listenerAdds: window.__surfaceListenerAdds,
          mutationCount,
          viewportWidth: innerWidth,
          mobileMediaMatches: matchMedia('(max-width: 760px)').matches,
          minFontSize: Math.min(...fields.map((field) => parseFloat(getComputedStyle(field).fontSize))),
          fieldSizes: fields.map((field) => ({
            id: field.id,
            fontSize: getComputedStyle(field).fontSize,
          })),
          transformedAncestors,
          documentScrollWidth: document.documentElement.scrollWidth,
          modalScrollWidth: modal?.scrollWidth || 0,
          modalClientWidth: modal?.clientWidth || 0,
          panelLeft: panelRect?.left ?? -1,
          panelRight: panelRect?.right ?? innerWidth + 1,
          actionsVisible: Boolean(
            actions
            && actions.left >= -1
            && actions.right <= innerWidth + 1
            && actions.bottom <= innerHeight + 1
          ),
          dateField: {
            type: dateField?.type || '',
            fontSize: dateField ? parseFloat(getComputedStyle(dateField).fontSize) : 0,
            width: dateField?.getBoundingClientRect().width || 0,
            parentWidth: dateField?.parentElement?.getBoundingClientRect().width || 0,
            height: dateField?.getBoundingClientRect().height || 0,
          },
          pageLocked: document.body.classList.contains('interaction-surface-open'),
        };
      })()`,
    }, sessionId);
    cycles.push(opened.result.value);

    await cdp.send("Runtime.evaluate", {
      expression: "document.querySelector('#financialTransactionModalClose')?.click()",
    }, sessionId);
    await waitForExpression(
      cdp,
      sessionId,
      "document.querySelector('#financialTransactionModal')?.classList.contains('hidden')",
    );
  }

  const final = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const section = document.querySelector('#financeiroSection');
      const sectionRect = section?.getBoundingClientRect();
      return {
        listenerAdds: window.__surfaceListenerAdds,
        pageLocked: document.body.classList.contains('interaction-surface-open'),
        overlayCount: document.querySelectorAll('#financialTransactionModal').length,
        documentScrollWidth: document.documentElement.scrollWidth,
        sectionLeft: sectionRect?.left ?? -1,
        sectionRight: sectionRect?.right ?? innerWidth + 1,
      };
    })()`,
  }, sessionId);
  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  return { cycles, final: final.result.value };
}

async function measureFinancialNativePeriod(
  cdp: Cdp,
  auth: any,
  viewport: { width: number; height: number; mobile: boolean },
) {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    ...viewport,
    deviceScaleFactor: viewport.mobile ? 2 : 1,
  }, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await installAuthCookies(cdp, sessionId, auth);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: initScript(auth, "financeiro") }, sessionId);
  await cdp.send("Page.navigate", { url: `${baseUrl}/` }, sessionId);
  await waitForComplete(cdp, sessionId);
  await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('#financialPeriod'))");
  await delay(700);

  const result = await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const sleep = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
      const waitForFinancialToolbar = async () => {
        const deadline = performance.now() + 5000;
        while (!document.querySelector('#financialAddTransactionBtn')) {
          if (performance.now() >= deadline) {
            throw new Error('financial toolbar did not return after period refresh');
          }
          await sleep(50);
        }
      };
      const select = document.querySelector('#financialPeriod');
      const custom = document.querySelector('#financialCustomRange');
      const values = [];
      for (const value of ['today', 'week', 'thirty_days', 'month', 'previous_month', 'custom']) {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep();
        await waitForFinancialToolbar();
        values.push({
          value,
          selected: select.value,
          customVisible: !custom.classList.contains('hidden'),
          oldLayers: document.querySelectorAll(
            '#fnPickerPopover, #financialDateTrigger, [data-fn-preset], .fn-period-popover'
          ).length,
          bodyLocked: document.body.classList.contains('interaction-surface-open'),
        });
      }

      const start = document.querySelector('#financialCustomStart');
      const end = document.querySelector('#financialCustomEnd');
      start.value = '2026-07-01';
      end.value = '2026-07-15';
      document.querySelector('#financialCustomApply').click();
      await sleep();
      await waitForFinancialToolbar();
      const customState = {
        start: start.value,
        end: end.value,
        position: getComputedStyle(custom).position,
        minFontSize: Math.min(
          parseFloat(getComputedStyle(start).fontSize),
          parseFloat(getComputedStyle(end).fontSize),
        ),
      };

      select.value = 'month';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep();
      await waitForFinancialToolbar();
      const center = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      const activeBlockingLayers = Array.from(document.querySelectorAll(
        '.ds-modal-backdrop, .ui-modal-backdrop, .svc-modal-backdrop, .op-drawer, .sched-drawer, [class*="backdrop"]'
      )).filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && style.pointerEvents !== 'none'
          && rect.width > 0
          && rect.height > 0;
      }).map((element) => element.id || element.className);
      const addButton = document.querySelector('#financialAddTransactionBtn');
      const addRect = addButton.getBoundingClientRect();
      const addHit = document.elementFromPoint(
        addRect.left + addRect.width / 2,
        addRect.top + addRect.height / 2,
      );
      const pageState = {
        center: center ? (center.id || center.className || center.tagName) : '',
        activeBlockingLayers,
        addButtonHit: addHit === addButton || addButton.contains(addHit),
        bodyLocked: document.body.classList.contains('interaction-surface-open'),
        bodyPosition: getComputedStyle(document.body).position,
        inertCount: document.querySelectorAll('#financeiroSection [inert]').length,
        oldPanelCount: document.querySelectorAll(
          '#fnPickerPopover, #financialDateTrigger, [data-fn-preset], .fn-period-popover, .fn-picker-wrap'
        ).length,
        presetButtons: Array.from(document.querySelectorAll('#financeiroSection button'))
          .filter((button) => button.textContent.trim() === 'Este mês').length,
        scrollWidth: document.documentElement.scrollWidth,
        selectFontSize: parseFloat(getComputedStyle(select).fontSize),
      };

      addButton.click();
      await sleep(80);
      const modal = document.querySelector('#financialTransactionModal');
      const modalOpen = Boolean(modal && !modal.classList.contains('hidden'));
      document.querySelector('#financialTransactionModalClose')?.click();
      await sleep();
      return {
        viewport: innerWidth,
        values,
        customState,
        pageState,
        modalOpen,
        finalBodyLocked: document.body.classList.contains('interaction-surface-open'),
        finalScrollWidth: document.documentElement.scrollWidth,
      };
    })()`,
  }, sessionId);
  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  if (result.exceptionDetails) {
    throw new Error(`financial native period evaluation failed: ${result.exceptionDetails.text || "unknown CDP exception"}`);
  }
  return result.result.value;
}

async function measureClientMobileSurface(cdp: Cdp, auth: any) {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  }, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await installAuthCookies(cdp, sessionId, auth);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: initScript(auth, "clientes"),
  }, sessionId);
  await cdp.send("Page.navigate", { url: `${baseUrl}/` }, sessionId);
  await waitForComplete(cdp, sessionId);
  await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('[data-clients-action=\"add-new\"]'))");
  await delay(700);

  const cycles = [];
  for (let index = 0; index < 3; index += 1) {
    await cdp.send("Runtime.evaluate", {
      expression: "document.querySelector('[data-clients-action=\"add-new\"]')?.click()",
    }, sessionId);
    await waitForExpression(cdp, sessionId, "!document.querySelector('#clientsModal')?.classList.contains('hidden')");
    await delay(80);
    const state = await cdp.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const modal = document.querySelector('#clientsModal');
        const form = modal?.querySelector('#clientsForm');
        const fields = Array.from(form?.querySelectorAll('input:not([type="hidden"]), select, textarea') || []);
        form.scrollTop = form.scrollHeight;
        const footer = modal?.querySelector('.cl-modal-footer')?.getBoundingClientRect();
        return {
          overlayCount: Array.from(document.querySelectorAll('#clientsModal'))
            .filter((item) => !item.classList.contains('hidden')).length,
          minFontSize: Math.min(...fields.map((field) => parseFloat(getComputedStyle(field).fontSize))),
          transformedAncestors: fields.flatMap((field) => {
            const values = [];
            let current = field.parentElement;
            while (current && current !== modal) {
              if (getComputedStyle(current).transform !== 'none') values.push(current.id || current.className || current.tagName);
              current = current.parentElement;
            }
            return values;
          }),
          focusedField: document.activeElement?.id || '',
          bodyScrolled: (form?.scrollHeight || 0) <= (form?.clientHeight || 0) || (form?.scrollTop || 0) > 0,
          footerVisible: Boolean(footer && footer.left >= -1 && footer.right <= innerWidth + 1 && footer.bottom <= innerHeight + 1),
          modalScrollWidth: modal?.scrollWidth || 0,
          modalClientWidth: modal?.clientWidth || 0,
          documentScrollWidth: document.documentElement.scrollWidth,
          pageLocked: document.body.classList.contains('interaction-surface-open'),
        };
      })()`,
    }, sessionId);
    cycles.push(state.result.value);
    await cdp.send("Runtime.evaluate", {
      expression: "document.querySelector('#clientsModalClose')?.click()",
    }, sessionId);
    await waitForExpression(cdp, sessionId, "document.querySelector('#clientsModal')?.classList.contains('hidden')");
  }
  const final = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: "({ pageLocked: document.body.classList.contains('interaction-surface-open'), scrollWidth: document.documentElement.scrollWidth })",
  }, sessionId);
  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  return { cycles, final: final.result.value };
}

async function measureInventoryMobileSurfaces(cdp: Cdp, auth: any) {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  }, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await installAuthCookies(cdp, sessionId, auth);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: initScript(auth, "estoque"),
  }, sessionId);
  await cdp.send("Page.navigate", { url: `${baseUrl}/` }, sessionId);
  await waitForComplete(cdp, sessionId);
  await waitForExpression(cdp, sessionId, "document.querySelectorAll('#inventoryMobileList .inv-row').length === 7");
  await delay(700);

  const cards = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const rows = Array.from(document.querySelectorAll('#inventoryMobileList .inv-row'));
      return {
        count: rows.length,
        documentScrollWidth: document.documentElement.scrollWidth,
        inlineDrawerCount: document.querySelectorAll('#inventoryMobileList .inv-row .op-drawer').length,
        rows: rows.map((row) => {
          const rowRect = row.getBoundingClientRect();
          const main = row.querySelector('.inv-row-main');
          const metrics = Array.from(row.querySelectorAll('.inv-metric'));
          const action = row.querySelector('.inv-arrow-btn')?.getBoundingClientRect();
          return {
            mainClientWidth: main?.clientWidth || 0,
            mainScrollWidth: main?.scrollWidth || 0,
            metricCount: metrics.length,
            metricsInside: metrics.every((metric) => {
              const rect = metric.getBoundingClientRect();
              return rect.left >= rowRect.left - 1 && rect.right <= rowRect.right + 1;
            }),
            metricTextVisible: metrics.every((metric) =>
              Array.from(metric.querySelectorAll('strong, span')).every((value) => {
                const style = getComputedStyle(value);
                return style.visibility !== 'hidden' && style.display !== 'none' && value.getBoundingClientRect().height > 0;
              })
            ),
            actionInside: Boolean(
              action
              && action.left >= rowRect.left - 1
              && action.right <= rowRect.right + 1
              && action.top >= rowRect.top - 1
              && action.bottom <= rowRect.bottom + 1
            ),
          };
        }),
      };
    })()`,
  }, sessionId);

  await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('#inventoryMobileList [data-inventory-action=\"detail\"]')?.click()",
  }, sessionId);
  await waitForExpression(cdp, sessionId, "document.querySelector('#inventoryProductDrawer')?.classList.contains('is-open')");
  await delay(150);
  const detail = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const drawer = document.querySelector('#inventoryProductDrawer');
      const panel = drawer?.querySelector('.op-drawer-panel');
      const body = drawer?.querySelector('.op-drawer-body');
      const actions = Array.from(drawer?.querySelectorAll('.op-drawer-footer button') || []);
      body.scrollTop = body.scrollHeight;
      const panelRect = panel?.getBoundingClientRect();
      const ancestorTransforms = [];
      let current = drawer?.parentElement;
      while (current) {
        const style = getComputedStyle(current);
        if (style.transform !== 'none') {
          ancestorTransforms.push({
            element: current.id || current.className || current.tagName,
            transform: style.transform,
          });
        }
        current = current.parentElement;
      }
      return {
        position: getComputedStyle(drawer).position,
        panelLeft: panelRect?.left ?? -1,
        panelRight: panelRect?.right ?? innerWidth + 1,
        ancestorTransforms,
        bodyScrollable: (body?.scrollHeight || 0) > (body?.clientHeight || 0),
        bodyScrollTop: body?.scrollTop || 0,
        actionCount: actions.length,
        actionsInside: actions.every((button) => {
          const rect = button.getBoundingClientRect();
          return rect.left >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
        }),
        pageLocked: document.body.classList.contains('interaction-surface-open'),
        documentScrollWidth: document.documentElement.scrollWidth,
      };
    })()`,
  }, sessionId);

  await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('#inventoryProductDrawer [data-inventory-action=\"edit\"]')?.click()",
  }, sessionId);
  await waitForExpression(
    cdp,
    sessionId,
    "!document.querySelector('#inventoryProductModal')?.classList.contains('hidden')",
  );
  await delay(100);
  const form = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const modal = document.querySelector('#inventoryProductModal');
      const form = modal?.querySelector('#inventoryProductForm');
      const fields = Array.from(form?.querySelectorAll('input:not([type="hidden"]), select, textarea') || []);
      form.scrollTop = form.scrollHeight;
      const footer = modal?.querySelector('.inv-modal-foot')?.getBoundingClientRect();
      return {
        minFontSize: Math.min(...fields.map((field) => parseFloat(getComputedStyle(field).fontSize))),
        transformedAncestors: fields.flatMap((field) => {
          const values = [];
          let current = field.parentElement;
          while (current && current !== modal) {
            if (getComputedStyle(current).transform !== 'none') {
              values.push(current.id || current.className || current.tagName);
            }
            current = current.parentElement;
          }
          return values;
        }),
        footerVisible: Boolean(footer && footer.left >= -1 && footer.right <= innerWidth + 1 && footer.bottom <= innerHeight + 1),
        modalClientWidth: modal?.clientWidth || 0,
        modalScrollWidth: modal?.scrollWidth || 0,
        documentScrollWidth: document.documentElement.scrollWidth,
      };
    })()`,
  }, sessionId);

  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector('#inventoryProductModalClose')?.click();
      document.querySelector('#inventoryProductDrawer [data-drawer-close]')?.click();`,
  }, sessionId);
  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  return {
    cards: cards.result.value,
    detail: detail.result.value,
    form: form.result.value,
  };
}

async function measureServiceMobileSurfaces(cdp: Cdp, auth: any) {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  }, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await installAuthCookies(cdp, sessionId, auth);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: initScript(auth, "servicos"),
  }, sessionId);
  await cdp.send("Page.navigate", { url: `${baseUrl}/` }, sessionId);
  await waitForComplete(cdp, sessionId);
  await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('#servicesAddBtn'))");
  await waitForExpression(cdp, sessionId, "document.querySelectorAll('[data-service-action=\"detail\"]').length > 0");
  await delay(700);

  await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('#servicesAddBtn')?.click()",
  }, sessionId);
  await waitForExpression(cdp, sessionId, "!document.querySelector('#servicesModal')?.classList.contains('hidden')");
  const addForm = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const modal = document.querySelector('#servicesModal');
      const body = modal?.querySelector('.svc-modal-body');
      const fields = Array.from(modal?.querySelectorAll('input:not([type="hidden"]), select, textarea') || []);
      body.scrollTop = body.scrollHeight;
      const footer = modal?.querySelector('.svc-modal-footer')?.getBoundingClientRect();
      return {
        fieldCount: fields.length,
        minFontSize: Math.min(...fields.map((field) => parseFloat(getComputedStyle(field).fontSize))),
        transformedAncestors: fields.flatMap((field) => {
          const values = [];
          let current = field.parentElement;
          while (current && current !== modal) {
            if (getComputedStyle(current).transform !== 'none') values.push(current.id || current.className || current.tagName);
            current = current.parentElement;
          }
          return values;
        }),
        footerVisible: Boolean(footer && footer.left >= -1 && footer.right <= innerWidth + 1 && footer.bottom <= innerHeight + 1),
        bodyScrolled: (body?.scrollHeight || 0) <= (body?.clientHeight || 0) || (body?.scrollTop || 0) > 0,
        documentScrollWidth: document.documentElement.scrollWidth,
        modalScrollWidth: modal?.scrollWidth || 0,
        modalClientWidth: modal?.clientWidth || 0,
      };
    })()`,
  }, sessionId);
  await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('#servicesModalClose')?.click()",
  }, sessionId);
  await waitForExpression(cdp, sessionId, "document.querySelector('#servicesModal')?.classList.contains('hidden')");

  await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('[data-service-action=\"detail\"]')?.click()",
  }, sessionId);
  await waitForExpression(cdp, sessionId, "document.querySelector('#serviceDrawer')?.classList.contains('is-open')");
  await delay(120);
  const detail = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const drawer = document.querySelector('#serviceDrawer');
      const panel = drawer?.querySelector('.op-drawer-panel');
      const body = drawer?.querySelector('.team-drawer-body');
      body.scrollTop = body.scrollHeight;
      const panelRect = panel?.getBoundingClientRect();
      return {
        position: getComputedStyle(drawer).position,
        panelLeft: panelRect?.left ?? -1,
        panelRight: panelRect?.right ?? innerWidth + 1,
        pageLocked: document.body.classList.contains('interaction-surface-open'),
        bodyScrolled: (body?.scrollHeight || 0) <= (body?.clientHeight || 0) || (body?.scrollTop || 0) > 0,
        documentScrollWidth: document.documentElement.scrollWidth,
      };
    })()`,
  }, sessionId);

  await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('#serviceDrawer [data-service-action=\"edit\"]')?.click()",
  }, sessionId);
  await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('#serviceEditPanel #svcEditForm'))");
  await delay(120);
  const edit = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const drawer = document.querySelector('#serviceEditPanel');
      const body = drawer?.querySelector('.svc-edit-body');
      const fields = Array.from(drawer?.querySelectorAll('input:not([type="hidden"]), select, textarea') || []);
      body.scrollTop = body.scrollHeight;
      const footer = drawer?.querySelector('.team-drawer-footer')?.getBoundingClientRect();
      const notes = drawer?.querySelector('#svcEditNotes')?.getBoundingClientRect();
      const professionals = drawer?.querySelector('#svcEditProfessionals')?.getBoundingClientRect();
      return {
        minFontSize: Math.min(...fields.map((field) => parseFloat(getComputedStyle(field).fontSize))),
        transformedAncestors: fields.flatMap((field) => {
          const values = [];
          let current = field.parentElement;
          while (current && current !== drawer) {
            if (getComputedStyle(current).transform !== 'none') values.push(current.id || current.className || current.tagName);
            current = current.parentElement;
          }
          return values;
        }),
        notesVisible: Boolean(notes && notes.height > 0 && notes.left >= -1 && notes.right <= innerWidth + 1),
        professionalsVisible: Boolean(
          professionals && professionals.height > 0 && professionals.left >= -1 && professionals.right <= innerWidth + 1
        ),
        footerVisible: Boolean(footer && footer.left >= -1 && footer.right <= innerWidth + 1 && footer.bottom <= innerHeight + 1),
        bodyScrolled: (body?.scrollHeight || 0) <= (body?.clientHeight || 0) || (body?.scrollTop || 0) > 0,
        documentScrollWidth: document.documentElement.scrollWidth,
      };
    })()`,
  }, sessionId);

  await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('#serviceEditPanel [data-svc-edit-close]')?.click()",
  }, sessionId);
  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  return {
    addForm: addForm.result.value,
    detail: detail.result.value,
    edit: edit.result.value,
  };
}

async function measureSharedOverlayScrollContract(
  cdp: Cdp,
  auth: any,
  viewport: { width: number; height: number; mobile: boolean },
  config: {
    module: string;
    open: string;
    root: string;
    panel: string;
    body: string;
    footer: string;
    close: string;
  },
) {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    ...viewport,
    deviceScaleFactor: viewport.mobile ? 2 : 1,
  }, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await installAuthCookies(cdp, sessionId, auth);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: initScript(auth, config.module),
  }, sessionId);
  await cdp.send("Page.navigate", { url: `${baseUrl}/` }, sessionId);
  await waitForComplete(cdp, sessionId);
  await waitForExpression(cdp, sessionId, `Boolean(document.querySelector(${JSON.stringify(config.open)}))`);
  await delay(650);
  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(config.open)})?.click()`,
  }, sessionId);
  await waitForExpression(
    cdp,
    sessionId,
    `(() => {
      const root = document.querySelector(${JSON.stringify(config.root)});
      return Boolean(root && !root.classList.contains('hidden') && (root.classList.contains('is-open') || getComputedStyle(root).display !== 'none'));
    })()`,
  );
  await delay(120);

  const measured = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const root = document.querySelector(${JSON.stringify(config.root)});
      const panel = root?.querySelector(${JSON.stringify(config.panel)});
      const body = root?.querySelector(${JSON.stringify(config.body)});
      const footer = root?.querySelector(${JSON.stringify(config.footer)});
      const form = root?.querySelector('form');
      const fields = Array.from(body?.querySelectorAll('input:not([type="hidden"]), select, textarea') || [])
        .filter((field) => field.getClientRects().length > 0);
      const lastField = fields.at(-1);
      lastField?.scrollIntoView({ block: 'end' });
      const bodyRect = body?.getBoundingClientRect();
      const footerRect = footer?.getBoundingClientRect();
      const panelRect = panel?.getBoundingClientRect();
      const lastRect = lastField?.getBoundingClientRect();
      const primary = Array.from(footer?.querySelectorAll('button') || []).at(-1);
      const primaryRect = primary?.getBoundingClientRect();
      const overflowOwners = Array.from(panel?.querySelectorAll('*') || [])
        .filter((element) => !element.matches('input, select, textarea'))
        .filter((element) => element.getClientRects().length > 0)
        .filter((element) => /auto|scroll/.test(getComputedStyle(element).overflowY))
        .map((element) => element.className || element.id || element.tagName);
      return {
        root: ${JSON.stringify(config.root)},
        viewportWidth: innerWidth,
        bodyOverflowY: body ? getComputedStyle(body).overflowY : '',
        bodyOverflowX: body ? getComputedStyle(body).overflowX : '',
        bodyScrollTop: body?.scrollTop || 0,
        bodyScrollable: Boolean(body && body.scrollHeight > body.clientHeight + 1),
        bodyContainsFooter: Boolean(body?.contains(footer)),
        bodyBottom: bodyRect?.bottom ?? innerHeight + 1,
        footerTop: footerRect?.top ?? -1,
        footerBottom: footerRect?.bottom ?? innerHeight + 1,
        footerPosition: footer ? getComputedStyle(footer).position : '',
        footerPaddingRight: footer ? parseFloat(getComputedStyle(footer).paddingRight) : 0,
        primaryVisible: Boolean(
          primaryRect
          && primaryRect.left >= -1
          && primaryRect.right <= innerWidth + 1
          && primaryRect.top >= (footerRect?.top ?? 0) - 1
          && primaryRect.bottom <= (footerRect?.bottom ?? innerHeight) + 1
        ),
        primaryFreeFromBody: Boolean(primaryRect && bodyRect && primaryRect.top >= bodyRect.bottom - 1),
        lastFieldAccessible: Boolean(
          lastRect
          && bodyRect
          && lastRect.top >= bodyRect.top - 1
          && lastRect.bottom <= bodyRect.bottom + 1
        ),
        formOverflowY: form ? getComputedStyle(form).overflowY : '',
        normalizedForm: Boolean(form?.classList.contains('liddo-modal-form-shell')),
        overflowOwners,
        panelLeft: panelRect?.left ?? -1,
        panelRight: panelRect?.right ?? innerWidth + 1,
        panelScrollWidth: panel?.scrollWidth || 0,
        panelClientWidth: panel?.clientWidth || 0,
        documentScrollWidth: document.documentElement.scrollWidth,
      };
    })()`,
  }, sessionId);

  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(config.close)})?.click()`,
  }, sessionId);
  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  return measured.result.value;
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

  await cdp.send("Runtime.evaluate", {
    expression: `
      (() => {
        const appMain = document.querySelector("#appMain");
        const sidebar = document.querySelector("#appSidebar");
        if (!appMain || !sidebar) return;
        appMain.scrollTop = 0;
        const beforeRect = sidebar.getBoundingClientRect();
        window.__shellScrollProbe = {
          beforeScrollTop: appMain.scrollTop,
          sidebarTopBefore: beforeRect.top,
          sidebarBottomBefore: beforeRect.bottom,
        };
        appMain.scrollTop = appMain.scrollHeight;
      })()
    `,
  }, sessionId);

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
        const probe = window.__shellScrollProbe || {};
        const appMain = document.querySelector("#appMain");
        const sidebar = document.querySelector("#appSidebar");
        const sidebarWrap = sidebar?.querySelector(".sidebar-wrap");
        const sidebarScroll = sidebar?.querySelector(".sb-scroll");
        const sidebarFooter = sidebar?.querySelector(".sb-footer");
        const sidebarRect = sidebar?.getBoundingClientRect();
        const sidebarWrapRect = sidebarWrap?.getBoundingClientRect();
        const sidebarFooterRect = sidebarFooter?.getBoundingClientRect();
        const operationalHeader = document.querySelector(
          ".module-section:not(.hidden) .op-page-header, .settings-page-head.op-page-header",
        );
        const headerRect = operationalHeader?.getBoundingClientRect();
        const visibleSection = document.querySelector(".module-section:not(.hidden)");
        const kpiCards = Array.from(visibleSection?.querySelectorAll(".liddo-kpi") || []);
        const kpiGroups = Array.from(visibleSection?.querySelectorAll(".liddo-instruments") || []);
        const kpiRects = kpiCards.map((card) => card.getBoundingClientRect());
        const kpiValueSizes = kpiCards
          .map((card) => card.querySelector(".ux-value, .ux-value-sm, strong, .pdv-total-value"))
          .filter(Boolean)
          .map((value) => Number.parseFloat(getComputedStyle(value).fontSize) || 0);
        const htmlStyle = getComputedStyle(document.documentElement);
        const bodyStyle = getComputedStyle(document.body);
        const appMainStyle = getComputedStyle(appMain);
        const appContentStyle = getComputedStyle(document.querySelector("#appContent"));
        return {
          viewport: window.innerWidth,
          viewportHeight: window.innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          bodyScrollHeight: document.body.scrollHeight,
          windowScrollY: window.scrollY,
          beforeMainScrollTop: probe.beforeScrollTop || 0,
          afterMainScrollTop: appMain?.scrollTop || 0,
          mainScrollHeight: appMain?.scrollHeight || 0,
          mainClientHeight: appMain?.clientHeight || 0,
          htmlOverflowY: htmlStyle.overflowY,
          bodyOverflowY: bodyStyle.overflowY,
          appMainOverflowY: appMainStyle.overflowY,
          appContentOverflowY: appContentStyle.overflowY,
          sidebarTopBefore: probe.sidebarTopBefore ?? null,
          sidebarBottomBefore: probe.sidebarBottomBefore ?? null,
          sidebarTopAfter: sidebarRect?.top ?? null,
          sidebarBottomAfter: sidebarRect?.bottom ?? null,
          sidebarWrapHeight: sidebarWrapRect?.height || 0,
          sidebarFooterBottom: sidebarFooterRect?.bottom ?? null,
          sidebarNavOverflowY: sidebarScroll ? getComputedStyle(sidebarScroll).overflowY : "",
          sidebarNavScrollHeight: sidebarScroll?.scrollHeight || 0,
          sidebarNavClientHeight: sidebarScroll?.clientHeight || 0,
          activeModule: localStorage.getItem("sb.activeModule"),
          sessionRole: JSON.parse(localStorage.getItem("sb.authSession") || "null")?.user?.role || null,
          visibleModules: Array.from(document.querySelectorAll("[data-sidebar-module]"), (item) => item.getAttribute("data-sidebar-module")),
          primaryModules: Array.from(
            document.querySelectorAll('[data-sidebar-area="primary"] [data-sidebar-module]'),
            (item) => item.getAttribute("data-sidebar-module"),
          ),
          administrativeModules: Array.from(
            document.querySelectorAll('[data-sidebar-area="administrative"] [data-sidebar-module]'),
            (item) => item.getAttribute("data-sidebar-module"),
          ),
          footerUser: document.querySelector("#appSidebar .sb-user-name")?.textContent?.trim() || "",
          footerRole: document.querySelector("#appSidebar .sb-user-subtitle")?.textContent?.trim() || "",
          activeSidebarModule: document.querySelector(".sb-item.is-active")?.getAttribute("data-sidebar-module") || null,
          headerModule: operationalHeader?.getAttribute("data-header-module") || null,
          headerTitle: operationalHeader?.querySelector(".op-page-title")?.textContent?.trim() || "",
          headerHasCoordinate: Boolean(operationalHeader?.querySelector(".op-header-coordinate")),
          headerHasContext: Boolean(operationalHeader?.querySelector("[data-header-context]")),
          headerLeft: headerRect?.left ?? null,
          headerRight: headerRect?.right ?? null,
          headerWidth: headerRect?.width || 0,
          kpiCount: kpiCards.length,
          kpiHasOverflow: kpiRects.some((rect) => rect.left < -1 || rect.right > window.innerWidth + 1),
          kpiGroupOverflow: kpiGroups.reduce(
            (largest, group) => Math.max(largest, group.scrollWidth - group.clientWidth),
            0,
          ),
          kpiMinValueSize: kpiValueSizes.length ? Math.min(...kpiValueSizes) : 0,
          activeIndicatorAligned: (() => {
            const active = document.querySelector(".sb-item.is-active");
            const indicator = document.querySelector(".sb-active-indicator");
            if (!active || !indicator) return false;
            const activeRect = active.getBoundingClientRect();
            const indicatorRect = indicator.getBoundingClientRect();
            return Math.abs(
              (activeRect.top + activeRect.height / 2)
              - (indicatorRect.top + indicatorRect.height / 2)
            ) < 3;
          })(),
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
    source: `${initScript(authSession, "agenda")}
      window.localStorage.removeItem("sb.agendaView");
    `,
  }, sessionId);
  await cdp.send("Page.navigate", { url: `${baseUrl}/` }, sessionId);
  await waitForComplete(cdp, sessionId);
  await waitForExpression(
    cdp,
    sessionId,
    "Boolean(document.querySelector('#agendaSection:not(.hidden)') && document.querySelector('#agendaListMode:not(.hidden)'))",
  );

  const initialList = await cdp.send("Runtime.evaluate", {
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

  await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('#viewGridBtn')?.click()",
  }, sessionId);
  await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('#agendaCalendarMode:not(.hidden) .wc-header-row'))");
  await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('#wcWeekLabel')?.textContent?.trim())");

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
          firstTimeLabel: outer?.querySelector(".wc-time-slot")?.textContent?.trim() || "",
          lastTimeLabel: Array.from(outer?.querySelectorAll(".wc-time-slot") || []).at(-1)?.textContent?.trim() || "",
          timeLabelCount: outer?.querySelectorAll(".wc-time-slot").length || 0,
        };
      })()
    `,
  }, sessionId);

  const mobileNavInitial = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const date = document.querySelector('#wcGoToDate');
      return {
        label: document.querySelector('#wcWeekLabel')?.textContent?.trim() || '',
        todayVisible: getComputedStyle(document.querySelector('#wcTodayBtn')).display !== 'none',
        dateVisible: getComputedStyle(date).display !== 'none',
        dateType: date?.type || '',
        dateFontSize: parseFloat(getComputedStyle(date).fontSize),
      };
    })()`,
  }, sessionId);
  await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('#wcNextWeekBtn')?.click()",
  }, sessionId);
  await delay(180);
  const nextWeekLabel = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: "document.querySelector('#wcWeekLabel')?.textContent?.trim() || ''",
  }, sessionId);
  await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('#wcPrevWeekBtn')?.click()",
  }, sessionId);
  await delay(180);
  const previousWeekLabel = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: "document.querySelector('#wcWeekLabel')?.textContent?.trim() || ''",
  }, sessionId);
  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const input = document.querySelector('#wcGoToDate');
      input.value = '2026-08-19';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`,
  }, sessionId);
  await waitForExpression(
    cdp,
    sessionId,
    "document.querySelector('#agendaSection .wc-hdr-num')?.textContent?.trim() === '17'",
  );
  const jumpedWeek = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `({
      label: document.querySelector('#wcWeekLabel')?.textContent?.trim() || '',
      firstDay: document.querySelector('#agendaSection .wc-hdr-num')?.textContent?.trim() || '',
      selectedDate: document.querySelector('#wcGoToDate')?.value || '',
    })`,
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
    expression: `(() => {
      const input = document.querySelector('#wcGoToDate');
      input.value = '2026-09-10';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`,
  }, sessionId);
  await waitForExpression(
    cdp,
    sessionId,
    "document.querySelector('#agendaSection .wc-hdr-num')?.textContent?.trim() === '7'",
  );
  const listAfterDateJump = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `({
      listVisible: !document.querySelector('#agendaListMode')?.classList.contains('hidden'),
      calendarVisible: !document.querySelector('#agendaCalendarMode')?.classList.contains('hidden'),
      listActive: document.querySelector('#viewListBtn')?.classList.contains('is-active') || false,
      firstDay: document.querySelector('#agendaSection .wc-hdr-num')?.textContent?.trim() || '',
      selectedDate: document.querySelector('#wcGoToDate')?.value || '',
    })`,
  }, sessionId);
  await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('#wcTodayBtn')?.click()",
  }, sessionId);
  await delay(180);
  const todayWeek = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const today = new Date();
      const day = today.getDay();
      const monday = new Date(today);
      monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
      return {
        selectedDate: document.querySelector('#wcGoToDate')?.value || '',
        firstDay: document.querySelector('#agendaSection .wc-hdr-num')?.textContent?.trim() || '',
        expectedFirstDay: String(monday.getDate()),
        listActive: document.querySelector('#viewListBtn')?.classList.contains('is-active') || false,
      };
    })()`,
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
    initialList: initialList.result.value,
    calendar: calendar.result.value,
    mobileNavInitial: mobileNavInitial.result.value,
    nextWeekLabel: nextWeekLabel.result.value,
    previousWeekLabel: previousWeekLabel.result.value,
    jumpedWeek: jumpedWeek.result.value,
    list: list.result.value,
    listAfterDateJump: listAfterDateJump.result.value,
    todayWeek: todayWeek.result.value,
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
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: initScript(authSession, "agenda"),
  }, sessionId);
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
        const operationAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        operationAt.setUTCHours(13, 0, 0, 0);
        if (operationAt.getUTCDay() === 0) operationAt.setUTCDate(operationAt.getUTCDate() + 1);
        const completedAt = new Date(operationAt.getTime() + 60 * 60 * 1000);
        const soldAt = new Date(operationAt.getTime() + 2 * 60 * 60 * 1000);
        const financialStart = new Date(operationAt);
        financialStart.setUTCHours(0, 0, 0, 0);
        const financialEnd = new Date(operationAt);
        financialEnd.setUTCHours(23, 59, 59, 999);
        const client = await call('/clients', 'POST', {
          unitId: 'unit-01', name: 'Cliente Headless ' + suffix, phone: '119' + suffix,
        });
        const appointment = await call('/appointments', 'POST', {
          unitId: 'unit-01', clientId: client.data?.client?.id, professionalId: 'pro-01',
          serviceId: 'svc-corte', startsAt: operationAt.toISOString(), changedBy: 'e2e-headless',
        });
        const appointmentId = appointment.data?.appointment?.id;
        const confirmed = await call('/appointments/' + appointmentId + '/status', 'PATCH',
          { status: 'CONFIRMED', changedBy: 'e2e-headless' }, 'e2e-confirm-' + suffix);
        const inService = await call('/appointments/' + appointmentId + '/status', 'PATCH',
          { status: 'IN_SERVICE', changedBy: 'e2e-headless' }, 'e2e-service-' + suffix);
        const checkout = await call('/appointments/' + appointmentId + '/checkout', 'POST', {
          changedBy: 'e2e-headless', completedAt: completedAt.toISOString(), paymentMethod: 'PIX',
          products: [{ productId: 'prd-pomada', quantity: 1 }],
        }, 'e2e-checkout-' + suffix);
        const sale = await call('/sales/products', 'POST', {
          unitId: 'unit-01', soldAt: soldAt.toISOString(), professionalId: 'pro-01',
          clientId: client.data?.client?.id, paymentMethod: 'PIX',
          items: [{ productId: 'prd-oleo-barba', quantity: 1 }],
        }, 'e2e-sale-' + suffix);
        const stock = await call('/stock/overview?unitId=unit-01');
        const financial = await call('/financial/transactions?unitId=unit-01&start=' + encodeURIComponent(financialStart.toISOString()) + '&end=' + encodeURIComponent(financialEnd.toISOString()));
        const audit = await call('/audit/events?unitId=unit-01&limit=50');
        const gone = await call('/appointments/' + appointmentId + '/complete', 'POST', {
          changedBy: 'e2e-headless', completedAt: completedAt.toISOString(),
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

async function measureLoginViewport(
  cdp: Cdp,
  viewport: { width: number; height: number; mobile: boolean },
  blockExternalStyles = false,
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
  if (blockExternalStyles) {
    await cdp.send("Network.enable", {}, sessionId);
    await cdp.send("Network.setBlockedURLs", { urls: ["*/styles/*.css*"] }, sessionId);
  }
  await cdp.send("Page.navigate", { url: `${baseUrl}/login` }, sessionId);
  await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('#loginForm'))");
  await delay(1_050);

  const measured = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
      const card = rect('#loginCard');
      const form = rect('#loginForm');
      const email = rect('#email');
      const password = rect('#password');
      const button = rect('#submitBtn');
      const brand = rect('.auth-brand-image');
      const brandElement = document.querySelector('.auth-brand-image');
      const provider = rect('.auth-provider');
      const footer = rect('.auth-identity-footer');
      const inputSvgs = Array.from(document.querySelectorAll('.auth-input-icon svg'))
        .map((item) => item.getBoundingClientRect());
      const inputFontSizes = Array.from(document.querySelectorAll('#loginForm input'))
        .map((item) => parseFloat(getComputedStyle(item).fontSize));
      const buttonElement = document.querySelector('#submitBtn');
      const hit = button
        ? document.elementFromPoint(button.left + button.width / 2, button.top + button.height / 2)
        : null;
      return {
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        bodyOverflowX: getComputedStyle(document.body).overflowX,
        bodyOverflowY: getComputedStyle(document.body).overflowY,
        titleSize: parseFloat(getComputedStyle(document.querySelector('#accessTitle')).fontSize),
        card: card && { top: card.top, right: card.right, bottom: card.bottom, left: card.left, width: card.width },
        form: form && { top: form.top, bottom: form.bottom },
        emailHeight: email?.height || 0,
        passwordHeight: password?.height || 0,
        minInputFontSize: Math.min(...inputFontSizes),
        buttonHeight: button?.height || 0,
        buttonBottom: button?.bottom || 0,
        buttonHit: Boolean(hit && buttonElement && (hit === buttonElement || buttonElement.contains(hit))),
        brand: brand && { width: brand.width, height: brand.height },
        brandLoaded: Boolean(brandElement?.complete && brandElement?.naturalWidth === 1536 && brandElement?.naturalHeight === 1024),
        brandAlt: brandElement?.alt || '',
        brandObjectFit: brandElement ? getComputedStyle(brandElement).objectFit : '',
        brandOpacity: brandElement ? parseFloat(getComputedStyle(brandElement).opacity) : 0,
        providerVisible: Boolean(provider && provider.width > 0 && provider.height > 0),
        footerVisible: Boolean(footer && footer.width > 0 && footer.height > 0),
        maxInputSvgWidth: Math.max(0, ...inputSvgs.map((item) => item.width)),
        maxInputSvgHeight: Math.max(0, ...inputSvgs.map((item) => item.height)),
        successDisplay: getComputedStyle(document.querySelector('#successMsg')).display,
        reducedMotionQuery: matchMedia('(prefers-reduced-motion: reduce)').media,
      };
    })()`,
  }, sessionId);

  const passwordToggleMeasured = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const password = document.querySelector('#password');
      const toggle = document.querySelector('#passwordToggle');
      const toggleRect = toggle?.getBoundingClientRect();
      let submitEvents = 0;
      const countSubmit = () => { submitEvents += 1; };
      document.querySelector('#loginForm')?.addEventListener('submit', countSubmit);
      password.value = 'senha-teste';
      const initial = {
        inputType: password.type,
        buttonType: toggle?.type,
        label: toggle?.getAttribute('aria-label'),
        pressed: toggle?.getAttribute('aria-pressed'),
        width: toggleRect?.width || 0,
        height: toggleRect?.height || 0,
      };
      toggle?.click();
      const shown = {
        inputType: password.type,
        label: toggle?.getAttribute('aria-label'),
        pressed: toggle?.getAttribute('aria-pressed'),
        value: password.value,
        focus: document.activeElement?.id,
      };
      toggle?.click();
      const hidden = {
        inputType: password.type,
        label: toggle?.getAttribute('aria-label'),
        pressed: toggle?.getAttribute('aria-pressed'),
        value: password.value,
        focus: document.activeElement?.id,
      };
      document.querySelector('#loginForm')?.removeEventListener('submit', countSubmit);
      return { initial, shown, hidden, submitEvents };
    })()`,
  }, sessionId);

  let keyboard = null;
  if (viewport.mobile) {
    const keyboardHeight = Math.max(500, viewport.height - 330);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: keyboardHeight,
      deviceScaleFactor: 2,
      mobile: true,
    }, sessionId);
    await cdp.send("Runtime.evaluate", {
      expression: "document.querySelector('#password').focus(); document.querySelector('#password').scrollIntoView({ block: 'center' });",
    }, sessionId);
    await delay(350);
    const keyboardMeasured = await cdp.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const password = document.querySelector('#password').getBoundingClientRect();
        return {
          focused: document.activeElement?.id,
          viewportHeight: innerHeight,
          passwordTop: password.top,
          passwordBottom: password.bottom,
          scrollWidth: document.documentElement.scrollWidth,
          bodyOverflowY: getComputedStyle(document.body).overflowY,
        };
      })()`,
    }, sessionId);
    keyboard = keyboardMeasured.result.value;
  }

  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  return {
    ...measured.result.value,
    keyboard,
    passwordToggle: passwordToggleMeasured.result.value,
  };
}

async function exerciseLoginForm(
  cdp: Cdp,
  viewport: { width: number; height: number; mobile: boolean },
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
  await cdp.send("Network.enable", {}, sessionId);
  await cdp.send("Network.clearBrowserCookies", {}, sessionId);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      (() => {
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (...args) => {
          if (String(args[0]).includes('/auth/login')) {
            const count = Number(sessionStorage.getItem('__loginPostCount') || '0') + 1;
            sessionStorage.setItem('__loginPostCount', String(count));
          }
          return originalFetch(...args);
        };
      })();
    `,
  }, sessionId);
  await cdp.send("Page.navigate", { url: `${baseUrl}/login` }, sessionId);
  await waitForExpression(cdp, sessionId, "document.readyState === 'complete' && Boolean(document.querySelector('#loginForm'))");
  await delay(250);
  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const email = document.querySelector('#email');
      const password = document.querySelector('#password');
      sessionStorage.setItem('__loginPostCount', '0');
      email.value = 'owner@barbearia.local';
      password.value = 'owner123';
      email.dispatchEvent(new Event('input', { bubbles: true }));
      password.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#loginForm').requestSubmit();
    })()`,
  }, sessionId);
  await waitForExpression(cdp, sessionId, "location.pathname === '/'");
  await waitForExpression(cdp, sessionId, "Boolean(localStorage.getItem('sb.authSession'))");

  const evaluated = await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const sessionBeforeLogout = JSON.parse(localStorage.getItem('sb.authSession') || 'null');
      const me = await fetch('/auth/me', { credentials: 'same-origin' });
      const csrf = document.cookie
        .split(';')
        .map((item) => item.trim())
        .find((item) => item.startsWith('sb_csrf='))
        ?.slice('sb_csrf='.length);
      const logout = await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'x-csrf-token': decodeURIComponent(csrf || '') },
      });
      const replay = await fetch('/auth/me', { credentials: 'same-origin' });
      return {
        path: location.pathname,
        sessionRole: sessionBeforeLogout?.user?.role,
        me: me.status,
        logout: logout.status,
        replay: replay.status,
        loginPostCount: Number(sessionStorage.getItem('__loginPostCount') || '0'),
      };
    })()`,
  }, sessionId);
  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  return evaluated.result.value;
}

async function exerciseRejectedLoginWithEnter(
  cdp: Cdp,
  viewport: { width: number; height: number; mobile: boolean },
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
  await cdp.send("Network.enable", {}, sessionId);
  await cdp.send("Network.clearBrowserCookies", {}, sessionId);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      (() => {
        const originalFetch = window.fetch.bind(window);
        const documentMarker = Math.random().toString(36).slice(2);
        window.__loginDocumentMarker = documentMarker;
        if (!sessionStorage.getItem('__loginInitialDocumentMarker')) {
          sessionStorage.setItem('__loginInitialDocumentMarker', documentMarker);
        }
        window.fetch = async (...args) => {
          if (String(args[0]).includes('/auth/login')) {
            const count = Number(sessionStorage.getItem('__loginPostCount') || '0') + 1;
            sessionStorage.setItem('__loginPostCount', String(count));
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
          return originalFetch(...args);
        };
      })();
    `,
  }, sessionId);
  await cdp.send("Page.navigate", { url: `${baseUrl}/login` }, sessionId);
  await waitForExpression(cdp, sessionId, "document.readyState === 'complete' && Boolean(document.querySelector('#loginForm'))");
  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      localStorage.removeItem('sb.authSession');
      localStorage.removeItem('authToken');
      sessionStorage.setItem('__loginPostCount', '0');
      document.querySelector('#email').value = 'invalido@barbearia.local';
      document.querySelector('#password').value = 'senha-incorreta';
      document.querySelector('#password').focus();
    })()`,
  }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    text: "\r",
    unmodifiedText: "\r",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  }, sessionId);
  await delay(50);
  const loading = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const button = document.querySelector('#submitBtn');
      return {
        disabled: button.disabled,
        loading: button.classList.contains('is-loading'),
        busy: button.getAttribute('aria-busy'),
        label: button.textContent.trim(),
      };
    })()`,
  }, sessionId);
  await waitForExpression(cdp, sessionId, "document.querySelector('#errorMsg').classList.contains('show')");
  const rejected = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => ({
      path: location.pathname,
      error: document.querySelector('#errorMsg').textContent.trim(),
      errorVisible: document.querySelector('#errorMsg').classList.contains('show'),
      emailInvalid: document.querySelector('#email').getAttribute('aria-invalid'),
      passwordInvalid: document.querySelector('#password').getAttribute('aria-invalid'),
      buttonDisabled: document.querySelector('#submitBtn').disabled,
      buttonLoading: document.querySelector('#submitBtn').classList.contains('is-loading'),
      session: localStorage.getItem('sb.authSession'),
      loginPostCount: Number(sessionStorage.getItem('__loginPostCount') || '0'),
      noDocumentReload: window.__loginDocumentMarker === sessionStorage.getItem('__loginInitialDocumentMarker'),
    }))()`,
  }, sessionId);
  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  return { loading: loading.result.value, rejected: rejected.result.value };
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
  it("mantem shell na viewport e rolagem vertical somente no conteudo principal", () => {
    const css = readFileSync(path.join(process.cwd(), "public/styles/design-system.css"), "utf8");
    const contractStart = css.indexOf("Viewport shell contract");
    expect(contractStart).toBeGreaterThan(-1);
    const contract = css.slice(contractStart);

    expect(contract).toMatch(/html:has\(body #appShell\),[\s\S]*height:\s*100dvh\s*!important;[\s\S]*overflow:\s*hidden\s*!important;/);
    expect(contract).toMatch(/#appShell,[\s\S]*#appShell\.settings-mode[\s\S]*height:\s*100dvh\s*!important;[\s\S]*overflow:\s*hidden\s*!important;/);
    expect(contract).toMatch(/#appSidebar,[\s\S]*position:\s*sticky\s*!important;[\s\S]*height:\s*100dvh\s*!important;/);
    expect(contract).toMatch(/#appSidebar \.sb-scroll,[\s\S]*overflow-y:\s*auto\s*!important;/);
    expect(contract).toMatch(/#appMain,[\s\S]*height:\s*100dvh\s*!important;[\s\S]*overflow-y:\s*auto\s*!important;/);
    expect(contract).toMatch(/#appContent,[\s\S]*height:\s*auto\s*!important;[\s\S]*overflow:\s*visible\s*!important;/);
  });

  beforeAll(async () => {
    if (!chromeAvailable) return;

    appProcess = spawn(appCommand, appArgs, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(appPort),
        NODE_ENV: "development",
        SERVER_MODE: "isolated",
        ALLOW_NON_PILOT_SERVER: "true",
        HOST: "127.0.0.1",
        DATA_BACKEND: "memory",
        RATE_LIMIT_LOGIN_MAX: "30",
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
        SERVER_MODE: "test",
        ALLOW_NON_PILOT_SERVER: "true",
        HOST: "127.0.0.1",
        DATA_BACKEND: "prisma",
        DATABASE_URL: "postgresql://local:local@127.0.0.1:1/unavailable_test?schema=public",
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
    await delay(900);
    if (chromeUserDataDir) {
      const resolvedProfile = path.resolve(chromeUserDataDir);
      const resolvedTemp = path.resolve(tmpdir());
      if (
        resolvedProfile.startsWith(`${resolvedTemp}${path.sep}`)
        && path.basename(resolvedProfile).startsWith("fase-108-vitest-cdp-")
      ) {
        let cleanupError: unknown;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          try {
            rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 2, retryDelay: 150 });
            cleanupError = undefined;
            break;
          } catch (error) {
            cleanupError = error;
            await delay(300);
          }
        }
        if (cleanupError) throw cleanupError;
      }
    }
  });

  testIfChrome("nao cria scroll horizontal geral no painel interno mobile", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();
    const session = await loginRole();

    const checks = [
      await measureModule(cdp, session, "agenda", false, { width: 1920, height: 1080, mobile: false }),
      await measureModule(cdp, session, "agenda", false, { width: 1440, height: 900, mobile: false }),
      await measureModule(cdp, session, "agenda", false, { width: 1366, height: 768, mobile: false }),
      await measureModule(cdp, session, "agenda", true, { width: 900, height: 1024, mobile: false }),
      await measureModule(cdp, session, "agenda", true, { width: 768, height: 1024, mobile: false }),
      await measureModule(cdp, session, "agenda", true, { width: 390, height: 844, mobile: true }),
      await measureModule(cdp, session, "agenda", false, { width: 430, height: 932, mobile: true }),
      await measureModule(cdp, session, "financeiro", false, { width: 390, height: 844, mobile: true }),
      await measureModule(cdp, session, "estoque", false, { width: 390, height: 844, mobile: true }),
      await measureModule(cdp, session, "estoque", false, { width: 430, height: 932, mobile: true }),
    ];

    cdp.close();

    for (const check of checks) {
      expect(check.scrollWidth, `${check.activeModule} scrollWidth`).toBeLessThanOrEqual(check.viewport + 2);
      expect(check.bodyScrollWidth, `${check.activeModule} bodyScrollWidth`).toBeLessThanOrEqual(check.viewport + 2);
      expect(check.headerHasCoordinate, `${check.activeModule} decorative header coordinate`).toBe(false);
      expect(check.headerHasContext, `${check.activeModule} header context`).toBe(true);
      expect(check.headerLeft, `${check.activeModule} header left`).toBeGreaterThanOrEqual(0);
      expect(check.headerRight, `${check.activeModule} header right`).toBeLessThanOrEqual(check.viewport + 2);
      expect(check.kpiCount, `${check.activeModule} KPI count`).toBeGreaterThan(0);
      expect(check.kpiHasOverflow, `${check.activeModule} KPI viewport overflow`).toBe(false);
      expect(check.kpiGroupOverflow, `${check.activeModule} KPI group overflow`).toBeLessThanOrEqual(1);
      expect(check.kpiMinValueSize, `${check.activeModule} KPI value legibility`).toBeGreaterThanOrEqual(17);
      expect(check.sidebarWrapHeight, `${check.activeModule} sidebar viewport height`).toBeCloseTo(check.viewportHeight, 0);
      expect(check.sidebarFooterBottom, `${check.activeModule} sidebar footer bottom`).toBeCloseTo(check.viewportHeight, 0);
      expect(check.sidebarNavOverflowY, `${check.activeModule} sidebar nav overflow-y`).toMatch(/auto|scroll/);
    }
    for (const check of checks.filter((item) => !item.menuOpen && ["agenda", "financeiro"].includes(item.activeModule))) {
      expect(check.htmlOverflowY, `${check.activeModule} html overflow-y`).toBe("hidden");
      expect(check.bodyOverflowY, `${check.activeModule} body overflow-y`).toBe("hidden");
      expect(check.appMainOverflowY, `${check.activeModule} appMain overflow-y`).toMatch(/auto|scroll/);
      expect(check.appContentOverflowY, `${check.activeModule} appContent overflow-y`).not.toMatch(/auto|scroll/);
      expect(check.windowScrollY, `${check.activeModule} window scrollY`).toBe(0);
      expect(check.mainScrollHeight, `${check.activeModule} main scrollHeight`).toBeGreaterThan(check.mainClientHeight);
      expect(check.afterMainScrollTop, `${check.activeModule} appMain scrollTop`).toBeGreaterThan(check.beforeMainScrollTop);
      expect(check.sidebarTopAfter, `${check.activeModule} sidebar top`).toBeCloseTo(check.sidebarTopBefore, 0);
      expect(check.sidebarBottomAfter, `${check.activeModule} sidebar bottom`).toBeCloseTo(check.sidebarBottomBefore, 0);
    }
    expect(checks.some((check) => check.menuOpen)).toBe(true);
  }, 60_000);

  testIfChrome("overlays mobile mantem scrollbar somente no body e encerrada antes do footer", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();
    const owner = await loginRole("owner");
    const overlays = [
      {
        name: "Novo Agendamento",
        module: "agenda",
        open: "#agendaNewAppointmentBtn",
        root: "#scheduleDrawer",
        panel: ".sched-drawer-panel",
        body: ".sched-drawer-body",
        footer: ".sched-drawer-footer",
        close: "#scheduleDrawerClose",
        normalizedForm: false,
      },
      {
        name: "Novo Cliente",
        module: "clientes",
        open: "[data-clients-action=\"add-new\"]",
        root: "#clientsModal",
        panel: ".cl-modal",
        body: ".liddo-modal-form-body",
        footer: ".cl-modal-footer",
        close: "#clientsModalClose",
        normalizedForm: true,
      },
      {
        name: "Novo Lancamento",
        module: "financeiro",
        open: "#financialAddTransactionBtn",
        root: "#financialTransactionModal",
        panel: ".fn-modal",
        body: ".liddo-modal-form-body",
        footer: ".fn-modal-actions",
        close: "#financialTransactionModalClose",
        normalizedForm: true,
      },
      {
        name: "Produto",
        module: "estoque",
        open: "#inventoryAddBtn",
        root: "#inventoryProductModal",
        panel: ".inv-modal-panel",
        body: ".liddo-modal-form-body",
        footer: ".inv-modal-foot",
        close: "#inventoryProductModalClose",
        normalizedForm: true,
      },
      {
        name: "Servico",
        module: "servicos",
        open: "#servicesAddBtn",
        root: "#servicesModal",
        panel: ".svc-modal-panel",
        body: ".svc-modal-body",
        footer: ".svc-modal-footer",
        close: "#servicesModalClose",
        normalizedForm: false,
      },
    ];
    const results = [];
    for (const viewport of [
      { width: 390, height: 844, mobile: true },
      { width: 430, height: 932, mobile: true },
    ]) {
      for (const overlay of overlays) {
        results.push({
          viewport,
          overlay,
          measured: await measureSharedOverlayScrollContract(cdp, owner, viewport, overlay),
        });
      }
    }
    cdp.close();

    for (const { viewport, overlay, measured } of results) {
      const label = `${overlay.name} ${viewport.width}x${viewport.height}`;
      expect(measured.bodyOverflowY, `${label}: body vertical`).toMatch(/auto|scroll/);
      expect(measured.bodyOverflowX, `${label}: body lateral`).toBe("hidden");
      expect(measured.bodyContainsFooter, `${label}: footer fora do body`).toBe(false);
      expect(measured.bodyBottom, `${label}: fim da scrollbar`).toBeLessThanOrEqual(measured.footerTop + 1);
      expect(measured.footerBottom, `${label}: footer na viewport`).toBeLessThanOrEqual(viewport.height + 1);
      expect(measured.footerPaddingRight, `${label}: respiro lateral`).toBeGreaterThanOrEqual(13);
      expect(measured.primaryVisible, `${label}: botao salvar visivel`).toBe(true);
      expect(measured.primaryFreeFromBody, `${label}: botao sem sobreposicao`).toBe(true);
      expect(measured.lastFieldAccessible, `${label}: ultimo campo`).toBe(true);
      expect(measured.normalizedForm, `${label}: normalizacao compartilhada`).toBe(overlay.normalizedForm);
      expect(measured.overflowOwners, `${label}: unico dono da rolagem ${JSON.stringify(measured.overflowOwners)}`).toHaveLength(1);
      expect(measured.panelLeft, `${label}: painel lateral`).toBeGreaterThanOrEqual(-1);
      expect(measured.panelRight, `${label}: painel lateral`).toBeLessThanOrEqual(viewport.width + 1);
      expect(measured.panelScrollWidth, `${label}: painel sem overflow`).toBeLessThanOrEqual(measured.panelClientWidth + 1);
      expect(measured.documentScrollWidth, `${label}: pagina sem overflow`).toBeLessThanOrEqual(viewport.width + 1);
      if (overlay.normalizedForm) {
        expect(measured.formOverflowY, `${label}: form nao rola`).toBe("hidden");
      }
    }
  }, 120_000);

  testIfChrome("novo agendamento acomoda servicos selecionados sem cortes nos sete viewports", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();
    const owner = await loginRole("owner");
    const viewports = [
      { width: 390, height: 844, mobile: true },
      { width: 430, height: 932, mobile: true },
      { width: 768, height: 1024, mobile: false },
      { width: 900, height: 1024, mobile: false },
      { width: 1366, height: 768, mobile: false },
      { width: 1440, height: 900, mobile: false },
      { width: 1920, height: 1080, mobile: false },
    ];
    const checks = [];
    for (const viewport of viewports) {
      checks.push({
        viewport,
        phases: await measureAppointmentServiceSelection(cdp, owner, viewport),
      });
    }
    cdp.close();

    for (const { viewport, phases } of checks) {
      const label = `${viewport.width}x${viewport.height}`;
      expect(phases.empty.selectedCount, `${label} estado vazio`).toBe(0);
      expect(phases.one.selectedCount, `${label} um servico`).toBe(1);
      expect(phases.multiple.selectedCount, `${label} varios servicos`).toBe(2);
      expect(phases.all.selectedCount, `${label} todos os servicos`).toBe(6);
      expect(phases.all.availableCount, `${label} catalogo completo`).toBe(6);
      expect(phases.all.lastServiceLabel, `${label} ultimo servico`).not.toBe("");
      expect(phases.all.lastServiceVisible, `${label} ultimo servico visivel`).toBe(true);
      expect(phases.longValues.selectedCount, `${label} nomes e valores longos`).toBe(2);
      expect(phases.removed.selectedCount, `${label} remover servico`).toBe(1);
      expect(phases.cleared.selectedCount, `${label} limpar servicos`).toBe(0);
      expect(phases.one.summaryCount, `${label} resumo com um servico`).toBe("1");
      expect(phases.multiple.summaryCount, `${label} resumo com varios servicos`).toBe("2");
      expect(phases.removed.summaryCount, `${label} resumo apos remover`).toBe("1");
      expect(phases.one.professionalId, `${label} profissional automatico`).toBe("pro-01");
      expect(phases.multiple.professionalId, `${label} profissional para varios servicos`).toBe("pro-01");
      expect(phases.multiple.professionalName, `${label} nome do profissional`).toBe("Geovane Borges");

      for (const phase of Object.values(phases) as any[]) {
        const phaseLabel = `${label} ${phase.phase}`;
        expect(phase.drawerOpen, `${phaseLabel} drawer`).toBe(true);
        expect(phase.documentScrollWidth, `${phaseLabel} pagina`).toBeLessThanOrEqual(phase.viewportWidth + 1);
        expect(phase.documentBodyScrollWidth, `${phaseLabel} body`).toBeLessThanOrEqual(phase.viewportWidth + 1);
        expect(phase.drawerScrollWidth, `${phaseLabel} painel`).toBeLessThanOrEqual(phase.drawerClientWidth + 1);
        expect(
          phase.drawerBodyScrollWidth,
          `${phaseLabel} corpo do drawer ${JSON.stringify(phase.bodyOverflowingDescendants)}`,
        ).toBeLessThanOrEqual(
          phase.drawerBodyClientWidth + 1,
        );
        expect(
          phase.shellScrollWidth,
          `${phaseLabel} seletor ${JSON.stringify(phase.overflowingDescendants)}`,
        ).toBeLessThanOrEqual(phase.shellClientWidth + 1);
        expect(phase.layoutScrollWidth, `${phaseLabel} grid`).toBeLessThanOrEqual(phase.layoutClientWidth + 1);
        expect(phase.selectedScrollWidth, `${phaseLabel} selecionados`).toBeLessThanOrEqual(
          phase.selectedClientWidth + 1,
        );
        expect(phase.selectedInsideLayout, `${phaseLabel} painel dentro do grid`).toBe(true);
        expect(phase.namesFit, `${phaseLabel} nomes`).toBe(true);
        expect(phase.itemsFit, `${phaseLabel} remover visivel`).toBe(true);
        expect(phase.confirmOverlapsSelected, `${phaseLabel} confirmar sem cobrir conteudo`).toBe(false);
      }

      expect(phases.longValues.namesFit, `${label} quebra de nome longo`).toBe(true);
      expect(phases.longValues.itemsFit, `${label} remover com valor longo`).toBe(true);
      expect(phases.multiple.removeCount, `${label} botoes remover`).toBe(2);
      expect(phases.empty.confirmOverlapsSelected, `${label} confirmar no estado vazio`).toBe(false);
      expect(phases.multiple.stacked, `${label} empilhamento responsivo`).toBe(viewport.width <= 430);
      if (viewport.width <= 430) {
        expect(phases.multiple.minFieldFontSize, `${label} fonte computada dos campos`)
          .toBeGreaterThanOrEqual(16);
        expect(phases.multiple.transformedFieldAncestors, `${label} ancestrais transformados`)
          .toEqual([]);
      }
    }
  }, 180_000);

  testIfChrome("Novo Agendamento mobile trava o fundo, resiste ao arrasto e preserva os seis servicos", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();
    const owner = await loginRole("owner");
    const checks = [
      {
        viewport: { width: 390, height: 844, mobile: true },
        result: await measureAppointmentMobileContract(cdp, owner, { width: 390, height: 844, mobile: true }),
      },
      {
        viewport: { width: 430, height: 932, mobile: true },
        result: await measureAppointmentMobileContract(cdp, owner, { width: 430, height: 932, mobile: true }),
      },
    ];
    cdp.close();

    for (const { viewport, result } of checks) {
      expect(result.cycles).toHaveLength(5);
      for (const cycle of result.cycles) {
        expect(cycle.pageLocked).toBe(true);
        expect(cycle.windowScrollX).toBe(0);
        expect(cycle.documentScrollWidth).toBeLessThanOrEqual(viewport.width + 1);
        expect(cycle.drawerScrollWidth).toBeLessThanOrEqual(cycle.drawerClientWidth + 1);
        expect(cycle.panelLeft).toBeGreaterThanOrEqual(-1);
        expect(cycle.panelRight).toBeLessThanOrEqual(viewport.width + 1);
        expect(cycle.panelTransform).toBe("none");
        expect(cycle.bodyOverflowX).toBe("hidden");
        expect(cycle.bodyOverflowY).toMatch(/auto|scroll/);
        expect(cycle.bodyOverscroll).toContain("contain");
        expect(cycle.serviceOverflowY).toBe("visible");
        expect(cycle.serviceCount).toBe(6);
        expect(cycle.passive.every((item: any) => item.hidden && item.display === "none" && item.text === "")).toBe(true);
        expect(cycle.startsAtVisible).toBe(false);
        expect(cycle.startsAtDisabled).toBe(true);
        expect(cycle.dateDisplay).not.toBe("none");
        expect(cycle.timeDisplay).not.toBe("none");
        expect(cycle.dateType).toBe("date");
        expect(cycle.timeType).toBe("time");
        expect(cycle.dateFontSize).toBeGreaterThanOrEqual(16);
        expect(cycle.timeFontSize).toBeGreaterThanOrEqual(16);
        const columns = cycle.temporalColumns.split(" ").filter(Boolean);
        expect(columns).toHaveLength(viewport.width <= 400 ? 1 : 2);
      }
      expect(result.lastService.visible).toBe(true);
      expect(result.lastService.label).not.toBe("");
      expect(result.lastService.selected).toBe(true);
      expect(result.lastService.startsAtValue).toBe("2026-08-19T14:30");
      expect(result.lastService.bodyScrollTop).toBeGreaterThan(0);
      expect(result.afterGesture.windowScrollX).toBe(0);
      expect(result.afterGesture.documentScrollWidth).toBeLessThanOrEqual(viewport.width + 1);
      expect(result.afterGesture.panelLeft).toBeGreaterThanOrEqual(-1);
      expect(result.afterGesture.panelRight).toBeLessThanOrEqual(viewport.width + 1);
      expect(result.afterGesture.mainScrollTop).toBe(result.cycles[0].mainScrollTop);
      expect(result.closed.pageLocked).toBe(false);
      expect(result.closed.mainScrollTop).toBe(result.cycles[0].mainScrollTop);
      expect(result.closed.windowScrollX).toBe(0);
    }
  }, 120_000);

  testIfChrome("Novo Cliente abre, fecha e reabre sem zoom, transformacao ou overflow", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();
    const owner = await loginRole("owner");
    const result = await measureClientMobileSurface(cdp, owner);
    cdp.close();

    expect(result.cycles).toHaveLength(3);
    result.cycles.forEach((cycle: any, index: number) => {
      expect(cycle.overlayCount, `ciclo ${index + 1}: overlay`).toBe(1);
      expect(cycle.minFontSize, `ciclo ${index + 1}: fonte`).toBeGreaterThanOrEqual(16);
      expect(cycle.transformedAncestors, `ciclo ${index + 1}: transforms`).toEqual([]);
      expect(cycle.focusedField, `ciclo ${index + 1}: foco inicial`).toBe("clientsName");
      expect(cycle.bodyScrolled, `ciclo ${index + 1}: rolagem interna`).toBe(true);
      expect(cycle.footerVisible, `ciclo ${index + 1}: footer`).toBe(true);
      expect(cycle.modalScrollWidth, `ciclo ${index + 1}: overlay horizontal`)
        .toBeLessThanOrEqual(cycle.modalClientWidth + 1);
      expect(cycle.documentScrollWidth, `ciclo ${index + 1}: pagina horizontal`).toBeLessThanOrEqual(391);
      expect(cycle.pageLocked, `ciclo ${index + 1}: fundo bloqueado`).toBe(true);
    });
    expect(result.final.pageLocked).toBe(false);
    expect(result.final.scrollWidth).toBeLessThanOrEqual(391);
  }, 60_000);

  testIfChrome("Novo Lancamento abre e fecha 10 vezes sem duplicar overlay ou listeners", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();
    const owner = await loginRole("owner");
    const result = await measureFinancialOverlayCycles(cdp, owner);
    cdp.close();

    expect(result.cycles).toHaveLength(10);
    const stableListenerCount = result.cycles[0].listenerAdds;
    result.cycles.forEach((cycle: any, index: number) => {
      expect(cycle.visibleOverlayCount, `ciclo ${index + 1}: overlay`).toBe(1);
      expect(cycle.listenerAdds, `ciclo ${index + 1}: listeners`).toBe(stableListenerCount);
      expect(cycle.mutationCount, `ciclo ${index + 1}: mutacoes continuas`).toBe(0);
      expect(
        cycle.minFontSize,
        `ciclo ${index + 1}: zoom Safari ${cycle.viewportWidth}/${cycle.mobileMediaMatches} ${JSON.stringify(cycle.fieldSizes)}`,
      )
        .toBeGreaterThanOrEqual(16);
      expect(cycle.transformedAncestors, `ciclo ${index + 1}: transform em ancestrais`).toEqual([]);
      expect(cycle.documentScrollWidth, `ciclo ${index + 1}: overflow da pagina`).toBeLessThanOrEqual(391);
      expect(cycle.modalScrollWidth, `ciclo ${index + 1}: overflow do overlay`)
        .toBeLessThanOrEqual(cycle.modalClientWidth + 1);
      expect(cycle.panelLeft, `ciclo ${index + 1}: painel deslocado`).toBeGreaterThanOrEqual(-1);
      expect(cycle.panelRight, `ciclo ${index + 1}: painel deslocado`).toBeLessThanOrEqual(391);
      expect(cycle.actionsVisible, `ciclo ${index + 1}: acoes visiveis`).toBe(true);
      expect(cycle.dateField.type, `ciclo ${index + 1}: data nativa`).toBe("date");
      expect(cycle.dateField.fontSize, `ciclo ${index + 1}: fonte da data`).toBeGreaterThanOrEqual(16);
      expect(cycle.dateField.height, `ciclo ${index + 1}: altura da data`).toBeGreaterThanOrEqual(44);
      expect(cycle.dateField.width, `ciclo ${index + 1}: largura da data`)
        .toBeLessThanOrEqual(cycle.dateField.parentWidth + 1);
      expect(cycle.pageLocked, `ciclo ${index + 1}: fundo bloqueado`).toBe(true);
    });
    expect(result.final.listenerAdds).toBe(stableListenerCount);
    expect(result.final.pageLocked).toBe(false);
    expect(result.final.overlayCount).toBe(1);
    expect(result.final.documentScrollWidth).toBeLessThanOrEqual(391);
    expect(result.final.sectionLeft).toBeGreaterThanOrEqual(-1);
    expect(result.final.sectionRight).toBeLessThanOrEqual(391);
  }, 60_000);

  testIfChrome("periodo financeiro usa apenas select nativo e mantem a pagina clicavel", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();
    const owner = await loginRole("owner");
    const results = [
      await measureFinancialNativePeriod(cdp, owner, { width: 1440, height: 900, mobile: false }),
      await measureFinancialNativePeriod(cdp, owner, { width: 390, height: 844, mobile: true }),
      await measureFinancialNativePeriod(cdp, owner, { width: 430, height: 932, mobile: true }),
    ];
    cdp.close();

    for (const result of results) {
      expect(result.values.map((item: any) => item.selected)).toEqual([
        "today",
        "week",
        "thirty_days",
        "month",
        "previous_month",
        "custom",
      ]);
      result.values.forEach((item: any) => {
        expect(item.customVisible).toBe(item.value === "custom");
        expect(item.oldLayers).toBe(0);
        expect(item.bodyLocked).toBe(false);
      });
      expect(result.customState).toMatchObject({
        start: "2026-07-01",
        end: "2026-07-15",
        position: "static",
      });
      expect(result.pageState.activeBlockingLayers).toEqual([]);
      expect(result.pageState.addButtonHit).toBe(true);
      expect(result.pageState.bodyLocked).toBe(false);
      expect(result.pageState.bodyPosition).not.toBe("fixed");
      expect(result.pageState.inertCount).toBe(0);
      expect(result.pageState.oldPanelCount).toBe(0);
      expect(result.pageState.presetButtons).toBe(0);
      expect(result.pageState.scrollWidth).toBeLessThanOrEqual(result.viewport + 1);
      expect(result.modalOpen).toBe(true);
      expect(result.finalBodyLocked).toBe(false);
      expect(result.finalScrollWidth).toBeLessThanOrEqual(result.viewport + 1);
      if (result.viewport <= 430) {
        expect(result.customState.minFontSize).toBeGreaterThanOrEqual(16);
        expect(result.pageState.selectFontSize).toBeGreaterThanOrEqual(16);
      }
    }
  }, 60_000);

  testIfChrome("Estoque preserva sete cards legiveis e abre detalhe e formulario em superficies proprias", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();
    const owner = await loginRole("owner");
    const result = await measureInventoryMobileSurfaces(cdp, owner);
    cdp.close();

    expect(result.cards.count).toBe(7);
    expect(result.cards.inlineDrawerCount).toBe(0);
    expect(result.cards.documentScrollWidth).toBeLessThanOrEqual(391);
    result.cards.rows.forEach((row: any, index: number) => {
      expect(row.mainScrollWidth, `produto ${index + 1}: overflow`).toBeLessThanOrEqual(row.mainClientWidth + 1);
      expect(row.metricCount, `produto ${index + 1}: metricas`).toBe(5);
      expect(row.metricsInside, `produto ${index + 1}: metricas dentro do card`).toBe(true);
      expect(row.metricTextVisible, `produto ${index + 1}: textos visiveis`).toBe(true);
      expect(row.actionInside, `produto ${index + 1}: acao visivel`).toBe(true);
    });
    expect(result.detail.position).toBe("fixed");
    expect(result.detail.panelLeft).toBeGreaterThanOrEqual(-1);
    expect(
      result.detail.panelRight,
      `drawer deslocado: ${JSON.stringify(result.detail.ancestorTransforms)}`,
    ).toBeLessThanOrEqual(391);
    expect(result.detail.actionCount).toBe(6);
    expect(result.detail.actionsInside).toBe(true);
    expect(result.detail.pageLocked).toBe(true);
    expect(result.detail.documentScrollWidth).toBeLessThanOrEqual(391);
    if (result.detail.bodyScrollable) expect(result.detail.bodyScrollTop).toBeGreaterThan(0);
    expect(result.form.minFontSize).toBeGreaterThanOrEqual(16);
    expect(result.form.transformedAncestors).toEqual([]);
    expect(result.form.footerVisible).toBe(true);
    expect(result.form.modalScrollWidth).toBeLessThanOrEqual(result.form.modalClientWidth + 1);
    expect(result.form.documentScrollWidth).toBeLessThanOrEqual(391);
  }, 60_000);

  testIfChrome("Servicos mantem formulario, detalhe e edicao acessiveis no mobile", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();
    const owner = await loginRole("owner");
    const result = await measureServiceMobileSurfaces(cdp, owner);
    cdp.close();

    expect(result.addForm.fieldCount).toBeGreaterThanOrEqual(9);
    expect(result.addForm.minFontSize).toBeGreaterThanOrEqual(16);
    expect(result.addForm.transformedAncestors).toEqual([]);
    expect(result.addForm.footerVisible).toBe(true);
    expect(result.addForm.bodyScrolled).toBe(true);
    expect(result.addForm.modalScrollWidth).toBeLessThanOrEqual(result.addForm.modalClientWidth + 1);
    expect(result.addForm.documentScrollWidth).toBeLessThanOrEqual(391);

    expect(result.detail.position).toBe("fixed");
    expect(result.detail.panelLeft).toBeGreaterThanOrEqual(-1);
    expect(result.detail.panelRight).toBeLessThanOrEqual(391);
    expect(result.detail.pageLocked).toBe(true);
    expect(result.detail.bodyScrolled).toBe(true);
    expect(result.detail.documentScrollWidth).toBeLessThanOrEqual(391);

    expect(result.edit.minFontSize).toBeGreaterThanOrEqual(16);
    expect(result.edit.transformedAncestors).toEqual([]);
    expect(result.edit.notesVisible).toBe(true);
    expect(result.edit.professionalsVisible).toBe(true);
    expect(result.edit.footerVisible).toBe(true);
    expect(result.edit.bodyScrolled).toBe(true);
    expect(result.edit.documentScrollWidth).toBeLessThanOrEqual(391);
  }, 60_000);

  testIfChrome("mantem o login premium, clicavel e sem overflow nos sete viewports", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();
    const viewports = [
      { width: 390, height: 844, mobile: true },
      { width: 430, height: 932, mobile: true },
      { width: 768, height: 1024, mobile: false },
      { width: 900, height: 1024, mobile: false },
      { width: 1366, height: 768, mobile: false },
      { width: 1440, height: 900, mobile: false },
      { width: 1920, height: 1080, mobile: false },
    ];
    const checks = [];
    for (const viewport of viewports) {
      checks.push({
        viewport,
        result: await measureLoginViewport(cdp, viewport),
      });
    }
    cdp.close();

    for (const { viewport, result } of checks) {
      const label = `${viewport.width}x${viewport.height}`;
      expect(result.scrollWidth, `${label} document overflow`).toBeLessThanOrEqual(result.viewportWidth + 1);
      expect(result.bodyScrollWidth, `${label} body overflow`).toBeLessThanOrEqual(result.viewportWidth + 1);
      expect(result.card?.left, `${label} card left`).toBeGreaterThanOrEqual(0);
      expect(result.card?.right, `${label} card right`).toBeLessThanOrEqual(result.viewportWidth + 1);
      expect(result.form?.top, `${label} formulario no primeiro recorte`).toBeLessThan(result.viewportHeight * 0.65);
      expect(result.buttonBottom, `${label} botao no primeiro recorte`).toBeLessThanOrEqual(result.viewportHeight);
      expect(result.emailHeight, `${label} toque email`).toBeGreaterThanOrEqual(51.9);
      expect(result.passwordHeight, `${label} toque senha`).toBeGreaterThanOrEqual(51.9);
      expect(result.buttonHeight, `${label} toque botao`).toBeGreaterThanOrEqual(51.9);
      expect(result.buttonHit, `${label} clique no botao`).toBe(true);
      expect(result.minInputFontSize, `${label} fonte dos campos`).toBeGreaterThanOrEqual(16);
      expect(result.titleSize, `${label} tipografia`).toBeGreaterThanOrEqual(29);
      expect(result.titleSize, `${label} tipografia`).toBeLessThanOrEqual(43);
      expect(result.brandLoaded, `${label} asset da marca`).toBe(true);
      expect(result.brandAlt, `${label} alt da marca`).toBe("Barbearia Geovane Borges");
      expect(result.brandObjectFit, `${label} proporcao da marca`).toBe("contain");
      expect(result.brandOpacity, `${label} visibilidade da marca`).toBeGreaterThanOrEqual(0.999);
      expect(result.brand?.width, `${label} largura da marca`).toBeLessThanOrEqual(result.viewportWidth);
      expect(result.brand?.width / result.brand?.height, `${label} aspecto da marca`).toBeCloseTo(1.5, 2);
      expect(result.providerVisible, `${label} assinatura Liddo`).toBe(true);
      expect(result.reducedMotionQuery).toBe("(prefers-reduced-motion: reduce)");
      expect(result.passwordToggle.initial.inputType, `${label} senha inicialmente oculta`).toBe("password");
      expect(result.passwordToggle.initial.buttonType, `${label} controle nao envia formulario`).toBe("button");
      expect(result.passwordToggle.initial.label, `${label} rotulo inicial`).toBe("Mostrar senha");
      expect(result.passwordToggle.initial.pressed, `${label} estado inicial`).toBe("false");
      expect(result.passwordToggle.initial.width, `${label} toque mostrar senha`).toBeGreaterThanOrEqual(43.9);
      expect(result.passwordToggle.initial.height, `${label} toque mostrar senha`).toBeGreaterThanOrEqual(43.9);
      expect(result.passwordToggle.shown.inputType, `${label} senha visivel`).toBe("text");
      expect(result.passwordToggle.shown.label, `${label} rotulo para ocultar`).toBe("Ocultar senha");
      expect(result.passwordToggle.shown.pressed, `${label} estado visivel`).toBe("true");
      expect(result.passwordToggle.shown.value, `${label} valor preservado ao mostrar`).toBe("senha-teste");
      expect(result.passwordToggle.shown.focus, `${label} foco ao mostrar`).toBe("password");
      expect(result.passwordToggle.hidden.inputType, `${label} senha novamente oculta`).toBe("password");
      expect(result.passwordToggle.hidden.label, `${label} rotulo restaurado`).toBe("Mostrar senha");
      expect(result.passwordToggle.hidden.pressed, `${label} estado restaurado`).toBe("false");
      expect(result.passwordToggle.hidden.value, `${label} valor preservado ao ocultar`).toBe("senha-teste");
      expect(result.passwordToggle.submitEvents, `${label} mostrar senha nao envia formulario`).toBe(0);

      if (viewport.width <= 767) {
        expect(result.card?.width, `${label} largura do formulario`).toBeLessThanOrEqual(result.viewportWidth - 40 + 1);
        expect(result.bodyOverflowX, `${label} overflow horizontal`).toBe("hidden");
        expect(result.footerVisible, `${label} rodape reduzido no mobile`).toBe(false);
      } else {
        expect(result.footerVisible, `${label} assinatura de rodape`).toBe(true);
      }

      if (viewport.mobile) {
        expect(result.keyboard?.focused, `${label} foco com teclado`).toBe("password");
        expect(result.keyboard?.passwordTop, `${label} campo acima do teclado`).toBeGreaterThanOrEqual(0);
        expect(result.keyboard?.passwordBottom, `${label} campo acima do teclado`).toBeLessThanOrEqual(
          result.keyboard.viewportHeight,
        );
        expect(result.keyboard?.scrollWidth, `${label} overflow com teclado`).toBeLessThanOrEqual(
          result.viewportWidth + 1,
        );
        expect(result.keyboard?.bodyOverflowY, `${label} rolagem com teclado`).toMatch(/auto|scroll/);
      }
    }
  }, 45_000);

  testIfChrome("mantem o login utilizavel mesmo se o Safari nao carregar CSS externo", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();
    const viewports = [
      { width: 390, height: 844, mobile: true },
      { width: 430, height: 932, mobile: true },
    ];
    const checks = [];
    for (const viewport of viewports) {
      checks.push({
        viewport,
        result: await measureLoginViewport(cdp, viewport, true),
      });
    }
    cdp.close();

    for (const { viewport, result } of checks) {
      const label = `${viewport.width}x${viewport.height}`;
      expect(result.scrollWidth, `${label} fallback document overflow`).toBeLessThanOrEqual(viewport.width + 1);
      expect(result.card?.width, `${label} fallback card`).toBeLessThanOrEqual(viewport.width - 32 + 1);
      expect(result.form?.top, `${label} fallback formulario`).toBeLessThan(viewport.height * 0.65);
      expect(result.buttonBottom, `${label} fallback botao`).toBeLessThanOrEqual(viewport.height);
      expect(result.brandLoaded, `${label} fallback marca`).toBe(true);
      expect(result.brand?.width, `${label} fallback largura da marca`).toBeLessThanOrEqual(viewport.width);
      expect(result.maxInputSvgWidth, `${label} fallback icones SVG`).toBeLessThanOrEqual(18);
      expect(result.maxInputSvgHeight, `${label} fallback icones SVG`).toBeLessThanOrEqual(18);
      expect(result.minInputFontSize, `${label} fallback fonte dos campos`).toBeGreaterThanOrEqual(16);
      expect(result.successDisplay, `${label} fallback sucesso prematuro`).toBe("none");
      expect(result.providerVisible, `${label} fallback Liddo`).toBe(true);
      expect(result.buttonHit, `${label} fallback clique`).toBe(true);
      expect(result.passwordToggle.initial.buttonType, `${label} fallback controle de senha`).toBe("button");
      expect(result.passwordToggle.shown.inputType, `${label} fallback mostra senha`).toBe("text");
      expect(result.passwordToggle.shown.label, `${label} fallback rotulo acessivel`).toBe("Ocultar senha");
      expect(result.passwordToggle.hidden.inputType, `${label} fallback oculta senha`).toBe("password");
    }
  }, 45_000);

  testIfChrome("autentica, cria sessao, redireciona e encerra a sessao pelo formulario", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();
    const result = await exerciseLoginForm(cdp, { width: 390, height: 844, mobile: true });
    cdp.close();

    expect(result.path).toBe("/");
    expect(result.sessionRole).toBe("owner");
    expect(result.me).toBe(200);
    expect(result.logout).toBe(200);
    expect(result.replay).toBe(401);
    expect(result.loginPostCount).toBe(1);
  }, 45_000);

  testIfChrome("login envia com Enter, exibe loading e rejeita credenciais incorretas sem criar sessao", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();
    const result = await exerciseRejectedLoginWithEnter(cdp, { width: 430, height: 932, mobile: true });
    cdp.close();

    expect(result.loading.disabled).toBe(true);
    expect(result.loading.loading).toBe(true);
    expect(result.loading.busy).toBe("true");
    expect(result.loading.label).toContain("Validando acesso");
    expect(result.rejected.path).toBe("/login");
    expect(result.rejected.errorVisible).toBe(true);
    expect(result.rejected.error).not.toBe("");
    expect(result.rejected.emailInvalid).toBe("true");
    expect(result.rejected.passwordInvalid).toBe("true");
    expect(result.rejected.buttonDisabled).toBe(false);
    expect(result.rejected.buttonLoading).toBe(false);
    expect(result.rejected.session).toBeNull();
    expect(result.rejected.loginPostCount).toBe(1);
    expect(result.rejected.noDocumentReload).toBe(true);
  }, 45_000);

  testIfChrome("agenda mobile mantem calendario com scroll interno e lista existente funcional", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();
    const session = await loginRole();
    const geovaneHours = [
      { dayOfWeek: 0, isClosed: true },
      ...Array.from({ length: 5 }, (_item, index) => ({
        dayOfWeek: index + 1,
        opensAt: "08:00",
        closesAt: "20:00",
        isClosed: false,
      })),
      { dayOfWeek: 6, opensAt: "08:00", closesAt: "14:00", isClosed: false },
    ];
    await configureWorkingHours(session, geovaneHours);

    let result;
    try {
      result = await measureAgendaViewToggle(cdp, session);
    } finally {
      await configureWorkingHours(
        session,
        [
          { dayOfWeek: 0, isClosed: true },
          ...Array.from({ length: 5 }, (_item, index) => ({
            dayOfWeek: index + 1,
            opensAt: "08:00",
            closesAt: "20:00",
            isClosed: false,
          })),
          { dayOfWeek: 6, opensAt: "08:00", closesAt: "14:00", isClosed: false },
        ],
      );
    }

    cdp.close();

    expect(result.initialList.scrollWidth, "agenda lista inicial document scrollWidth").toBeLessThanOrEqual(result.initialList.viewport + 2);
    expect(result.initialList.bodyScrollWidth, "agenda lista inicial body scrollWidth").toBeLessThanOrEqual(result.initialList.viewport + 2);
    expect(result.initialList.calendarVisible).toBe(false);
    expect(result.initialList.listVisible).toBe(true);

    expect(result.calendar.scrollWidth, "agenda calendario document scrollWidth").toBeLessThanOrEqual(result.calendar.viewport + 2);
    expect(result.calendar.bodyScrollWidth, "agenda calendario body scrollWidth").toBeLessThanOrEqual(result.calendar.viewport + 2);
    expect(result.calendar.calendarVisible).toBe(true);
    expect(result.calendar.listVisible).toBe(false);
    expect(result.calendar.calendarScrollWidth).toBeGreaterThan(result.calendar.calendarClientWidth);
    expect(result.calendar.calendarOverflowX).toMatch(/auto|scroll/);
    expect(result.calendar.firstTimeLabel).toBe("08h");
    expect(result.calendar.lastTimeLabel).toBe("20h");
    expect(result.calendar.timeLabelCount).toBe(13);
    expect(result.mobileNavInitial.todayVisible).toBe(true);
    expect(result.mobileNavInitial.dateVisible).toBe(true);
    expect(result.mobileNavInitial.dateType).toBe("date");
    expect(result.mobileNavInitial.dateFontSize).toBeGreaterThanOrEqual(16);
    expect(result.nextWeekLabel).not.toBe(result.mobileNavInitial.label);
    expect(result.previousWeekLabel).toBe(result.mobileNavInitial.label);
    expect(result.jumpedWeek.firstDay).toBe("17");
    expect(result.jumpedWeek.selectedDate).toBe("2026-08-19");

    expect(result.list.scrollWidth, "agenda lista document scrollWidth").toBeLessThanOrEqual(result.list.viewport + 2);
    expect(result.list.bodyScrollWidth, "agenda lista body scrollWidth").toBeLessThanOrEqual(result.list.viewport + 2);
    expect(result.list.calendarVisible).toBe(false);
    expect(result.list.listVisible).toBe(true);
    expect(result.list.listHasCards).toBe(true);
    expect(result.listAfterDateJump.listVisible).toBe(true);
    expect(result.listAfterDateJump.calendarVisible).toBe(false);
    expect(result.listAfterDateJump.listActive).toBe(true);
    expect(result.listAfterDateJump.firstDay).toBe("7");
    expect(result.listAfterDateJump.selectedDate).toBe("2026-09-10");
    expect(result.todayWeek.firstDay).toBe(result.todayWeek.expectedFirstDay);
    expect(result.todayWeek.listActive).toBe(true);

    expect(result.calendarAgain.scrollWidth, "agenda calendario apos voltar document scrollWidth").toBeLessThanOrEqual(result.calendarAgain.viewport + 2);
    expect(result.calendarAgain.bodyScrollWidth, "agenda calendario apos voltar body scrollWidth").toBeLessThanOrEqual(result.calendarAgain.viewport + 2);
    expect(result.calendarAgain.calendarVisible).toBe(true);
    expect(result.calendarAgain.listVisible).toBe(false);
  }, 45_000);

  testIfChrome("mantem cliques, navegacao e overlays desbloqueados nos tres viewports", async () => {
    const version = await waitForJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${cdpPort}/json/version`);
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.open();
    const owner = await loginRole("owner");
    const viewports = [
      { width: 390, height: 844, mobile: true },
      { width: 900, height: 1024, mobile: false },
      { width: 1440, height: 900, mobile: false },
    ];

    const checks = [];
    for (const viewport of viewports) {
      checks.push({
        viewport: `${viewport.width}x${viewport.height}`,
        phases: await exerciseInteractionCycle(cdp, owner, viewport),
      });
    }
    cdp.close();

    for (const check of checks) {
      expect(check.phases.initial.blockingOverlays, `${check.viewport} overlay inicial`).toEqual([]);
      expect(check.phases.initial.inertElements, `${check.viewport} inert inicial`).toEqual([]);
      expect(check.phases.initial.primaryModules, `${check.viewport} navegacao principal`).toEqual(
        ["agenda", "clientes", "financeiro", "estoque", "servicos"],
      );
      expect(check.phases.initial.administrativeModules, `${check.viewport} area administrativa`).toEqual(
        ["configuracoes", "auditoria"],
      );
      expect(check.phases.initial.activeSidebarModule, `${check.viewport} item ativo inicial`).toBe("agenda");
      expect(check.phases.initial.activeIndicatorAligned, `${check.viewport} indicador ativo inicial`).toBe(true);
      expect(check.phases.initial.footerUser, `${check.viewport} usuario no rodape`).toBe("Geovane Borges");
      expect(check.phases.initial.footerRole, `${check.viewport} funcao no rodape`).toBe("Proprietário");
      expect(check.phases.initial.hasAdministrativeDivider, `${check.viewport} divisor administrativo`).toBe(true);
      expect(check.phases.initial.administrativeProfileGap, `${check.viewport} espaco antes do perfil`)
        .toBeGreaterThan(10);
      expect(check.phases.primaryHit.hitMatches, `${check.viewport} hit da acao principal`).toBe(true);
      expect(check.phases.primaryHit.inertAncestor, `${check.viewport} acao principal inerte`).toBe(false);
      expect(check.phases.drawerOpen.scheduleOpen, `${check.viewport} drawer abriu`).toBe(true);
      expect(check.phases.drawerCloseHit.hitMatches, `${check.viewport} fechar drawer`).toBe(true);
      expect(check.phases.drawerClosed.scheduleOpen, `${check.viewport} drawer fechou`).toBe(false);
      expect(check.phases.drawerClosed.blockingOverlays, `${check.viewport} overlay residual`).toEqual([]);
      expect(check.phases.drawerClosed.inertElements, `${check.viewport} inert residual do drawer`).toEqual([]);
      expect(
        check.phases.sidebarHit.hitMatches,
        `${check.viewport} link da sidebar: ${JSON.stringify(check.phases.sidebarHit)}`,
      ).toBe(true);
      expect(check.phases.afterNavigation.activeModule, `${check.viewport} troca de modulo`).toBe("clientes");
      expect(check.phases.afterNavigation.activeSidebarModule, `${check.viewport} item ativo apos navegar`).toBe("clientes");
      expect(check.phases.afterNavigation.activeIndicatorAligned, `${check.viewport} indicador apos navegar`).toBe(true);
      expect(check.phases.afterNavigation.mobileSidebarOpen, `${check.viewport} sidebar apos selecao`).toBe(false);
      expect(check.phases.afterNavigation.appMainInert, `${check.viewport} appMain apos navegacao`).toBe(false);
      expect(check.phases.afterNavigation.appMainPointerEvents, `${check.viewport} pointer-events appMain`).not.toBe("none");
      expect(check.phases.afterNavigation.appContentPointerEvents, `${check.viewport} pointer-events appContent`).not.toBe("none");
      expect(check.phases.afterNavigation.blockingOverlays, `${check.viewport} overlay apos navegacao`).toEqual([]);
      expect(check.phases.afterReturn.activeModule, `${check.viewport} retorno para agenda`).toBe("agenda");
      expect(check.phases.afterReturn.activeSidebarModule, `${check.viewport} item ativo ao retornar`).toBe("agenda");
      expect(check.phases.afterReturn.activeIndicatorAligned, `${check.viewport} indicador ao retornar`).toBe(true);
      expect(check.phases.primaryAfterReturnHit.hitMatches, `${check.viewport} acao apos retorno`).toBe(true);
      expect(check.phases.final.blockingOverlays, `${check.viewport} overlay final`).toEqual([]);
      expect(check.phases.final.inertElements, `${check.viewport} inert final`).toEqual([]);
      expect(check.phases.final.appMainPointerEvents, `${check.viewport} pointer-events final`).not.toBe("none");
      expect(check.phases.final.appContentPointerEvents, `${check.viewport} pointer-events conteudo final`).not.toBe("none");
      expect(check.phases.final.errors, `${check.viewport} erros de console`).toEqual([]);
      if (check.viewport !== "1440x900") {
        const motionPhases = [
          check.phases.motionMenuOpen,
          check.phases.motionDrawerOpen,
          check.phases.motionModuleChange,
          check.phases.motionAgendaList,
          check.phases.motionAgendaWeek,
        ];
        expect(check.phases.motionBaseline.reduced, `${check.viewport} reduced-motion`).toBe(false);
        motionPhases.forEach((motion, index) => {
          expect(
            motion.animations.length,
            `${check.viewport} motion perceptivel na fase ${index}: ${JSON.stringify(motion)}`,
          ).toBeGreaterThan(0);
          expect(
            motion.animations.some((animation: any) =>
              animation.properties.includes("opacity") || animation.properties.includes("transform"),
            ),
            `${check.viewport} motion por transform/opacity na fase ${index}`,
          ).toBe(true);
          expect(motion.scrollWidth, `${check.viewport} overflow durante motion ${index}`)
            .toBeLessThanOrEqual(motion.viewport + 2);
        });
        expect(
          check.phases.motionFinal.layoutShift - check.phases.motionBaseline.layoutShift,
          `${check.viewport} layout shift acumulado apos interacoes`,
        ).toBeLessThan(0.1);
        expect(check.phases.menuOpenHit.hitMatches, `${check.viewport} abrir sidebar`).toBe(true);
        expect(check.phases.menuOpen.mobileSidebarOpen, `${check.viewport} sidebar aberta`).toBe(true);
        expect(check.phases.menuOpen.appMainInert, `${check.viewport} appMain nao deve englobar o toggle`).toBe(false);
        expect(check.phases.menuEscClosed.mobileSidebarOpen, `${check.viewport} fechar sidebar com Esc`).toBe(false);
        expect(check.phases.menuEscClosed.appMainInert, `${check.viewport} inert apos Esc`).toBe(false);
        expect(check.phases.backdropHit.hitMatches, `${check.viewport} clique no backdrop`).toBe(true);
        expect(check.phases.menuBackdropClosed.mobileSidebarOpen, `${check.viewport} fechar por backdrop`).toBe(false);
        expect(check.phases.menuBackdropClosed.appMainInert, `${check.viewport} inert apos backdrop`).toBe(false);
      }
    }
  }, 90_000);

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
      await measureModule(cdp, owner, "auditoria", false, desktop),
      await measureModule(cdp, owner, "estoque", false, desktop),
      await measureModule(cdp, owner, "servicos", false, desktop),
      await measureModule(cdp, owner, "configuracoes", false, desktop),
      await measureModule(cdp, owner, "clientes", false, tablet),
      await measureModule(cdp, owner, "operacao", false, desktop),
      await measureModule(cdp, owner, "operacao", false, mobile),
    ];
    cdp.close();

    expect(checks[0].activeModule).toBe("financeiro");
    expect(checks[0].kpiCount).toBeGreaterThanOrEqual(4);
    expect(checks[0].visibleModules).toContain("financeiro");
    expect(checks[0].primaryModules).toEqual(["agenda", "clientes", "financeiro", "estoque", "servicos"]);
    expect(checks[0].administrativeModules).toEqual(["configuracoes", "auditoria"]);
    expect(checks[0].footerUser).toBe("Geovane Borges");
    expect(checks[0].footerRole).toBe("Proprietário");
    expect(checks[1].sessionRole).toBe("recepcao");
    expect(checks[1].activeModule).toBe("agenda");
    expect(checks[1].visibleModules).toEqual(expect.arrayContaining(["agenda", "clientes"]));
    expect(checks[1].visibleModules).not.toEqual(expect.arrayContaining(["financeiro", "configuracoes", "auditoria"]));
    expect(checks[1].primaryModules).toEqual(["agenda", "clientes"]);
    expect(checks[1].administrativeModules).toEqual([]);
    expect(checks[1].footerRole).toBe("Recepção");
    expect(checks[2].sessionRole).toBe("profissional");
    expect(checks[2].activeModule).toBe("agenda");
    expect(checks[2].visibleModules).not.toEqual(expect.arrayContaining(["financeiro", "configuracoes", "auditoria"]));
    expect(checks[2].primaryModules).toEqual(["agenda", "clientes"]);
    expect(checks[2].administrativeModules).toEqual([]);
    expect(checks[2].footerRole).toBe("Profissional");
    expect(checks[8].sessionRole).toBe("recepcao");
    expect(checks[8].activeModule).toBe("agenda");
    expect(checks[8].visibleModules).not.toContain("financeiro");
    expect(checks[9].activeModule).toBe("auditoria");
    expect(checks[9].headerModule).toBe("auditoria");
    expect(checks[9].activeSidebarModule).toBe("auditoria");
    expect(checks[9].activeIndicatorAligned).toBe(true);
    expect(checks[10].activeModule).toBe("estoque");
    expect(checks[10].headerModule).toBe("estoque");
    expect(checks[10].kpiCount).toBeGreaterThanOrEqual(6);
    expect(checks[10].activeSidebarModule).toBe("estoque");
    expect(checks[10].activeIndicatorAligned).toBe(true);
    expect(checks[11].activeModule).toBe("servicos");
    expect(checks[11].headerModule).toBe("servicos");
    expect(checks[11].kpiCount).toBeGreaterThanOrEqual(6);
    expect(checks[11].activeSidebarModule).toBe("servicos");
    expect(checks[11].activeIndicatorAligned).toBe(true);
    expect(checks[12].activeModule).toBe("configuracoes");
    expect(checks[12].headerModule).toBe("configuracoes");
    expect(checks[12].activeIndicatorAligned).toBe(true);
    expect(checks[13].activeModule).toBe("clientes");
    expect(checks[13].headerModule).toBe("clientes");
    expect(checks[13].kpiCount).toBeGreaterThanOrEqual(3);
    expect(checks[13].activeIndicatorAligned).toBe(true);
    expect(checks[14].activeModule).toBe("operacao");
    expect(checks[15].activeModule).toBe("operacao");
    for (const check of checks) {
      expect(check.legacyTokenStored).toBe(false);
      expect(check.scrollWidth).toBeLessThanOrEqual(check.viewport + 2);
      expect(check.headerLeft).toBeGreaterThanOrEqual(0);
      expect(check.headerRight).toBeLessThanOrEqual(check.viewport + 2);
      if (check.kpiCount > 0) {
        expect(check.kpiHasOverflow).toBe(false);
        expect(check.kpiGroupOverflow).toBeLessThanOrEqual(1);
        expect(check.kpiMinValueSize).toBeGreaterThanOrEqual(17);
      }
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
          for (let i = 0; i < 35; i += 1) {
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
