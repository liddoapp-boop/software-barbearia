const SURFACE_ROOT_SELECTOR = [
  ".ds-modal-backdrop",
  ".svc-modal-backdrop",
  ".fn-modal-backdrop",
  ".inv-modal-backdrop",
  ".op-drawer",
  ".sched-drawer",
].join(",");

const SURFACE_SELECTOR = [
  SURFACE_ROOT_SELECTOR,
  "[role='dialog']",
].join(",");

const CONTROL_SELECTOR = [
  "input:not([type='hidden'])",
  "select",
  "textarea",
].join(",");

const FORM_FOOTER_SELECTOR = [
  ".catalog-row-actions",
  ".fn-modal-actions",
  ".inv-modal-foot",
  ".cl-modal-footer",
  ".svc-modal-footer",
].join(",");

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([type='hidden']):not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const decoratedForms = new WeakSet();
const openerState = new WeakMap();
let lastOutsideFocus = null;
const activeSurfaces = [];
let pageLockState = null;
let interactionSurfacesInitialized = false;

function addClassOnce(element, className) {
  if (element instanceof Element && !element.classList.contains(className)) {
    element.classList.add(className);
  }
}

function isElementVisible(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
  if (element.classList.contains("hidden")) return false;
  const hiddenAncestor = element.parentElement?.closest(".hidden, [aria-hidden='true']");
  if (hiddenAncestor) return false;
  return true;
}

function isSurfaceOpen(surface) {
  if (!(surface instanceof HTMLElement) || !isElementVisible(surface)) return false;
  if (surface.classList.contains("op-drawer") || surface.classList.contains("sched-drawer")) {
    return surface.classList.contains("is-open");
  }
  return true;
}

function getSurfaceRoot(surface) {
  if (!(surface instanceof HTMLElement)) return null;
  if (surface.matches(SURFACE_ROOT_SELECTOR)) return surface;
  return surface.closest(SURFACE_ROOT_SELECTOR) || surface;
}

function getSurfacePanel(surface) {
  if (!(surface instanceof HTMLElement)) return null;
  if (surface.matches("[role='dialog']")) return surface;
  return surface.querySelector("[role='dialog']")
    || surface.querySelector(".op-drawer-panel, .sched-drawer-panel, .ds-modal-panel, .svc-modal-panel, .fn-modal, .inv-modal-panel, .cl-modal")
    || surface.firstElementChild;
}

function interactionContext(element) {
  const source = [
    element.id,
    element.getAttribute("aria-label"),
    element.querySelector?.("[aria-labelledby]")?.getAttribute("aria-labelledby"),
    element.querySelector?.("h1, h2, h3, .ux-label")?.textContent,
  ].filter(Boolean).join(" ").toLowerCase();

  if (/checkout|sale|venda|pagamento|pdv/.test(source)) return "checkout";
  if (/refund|devol|exclu|cancel|desbloq|falta/.test(source)) return "destructive";
  if (/settings|config|governan|permission|acesso/.test(source)) return "governance";
  if (/edit|editar|alterar|ajuste|movimenta/.test(source)) return "edit";
  if (/confirm|concluir|iniciar|atraso|bloque/.test(source)) return "confirm";
  return "create";
}

function controlKind(control) {
  if (control instanceof HTMLSelectElement) return control.multiple ? "multi-select" : "select";
  if (control instanceof HTMLTextAreaElement) return "textarea";
  const type = String(control.getAttribute("type") || "text").toLowerCase();
  if (type === "checkbox") return "checkbox";
  if (type === "radio") return "radio";
  if (["date", "datetime-local", "time", "month"].includes(type)) return "temporal";
  if (type === "number" && /price|amount|cost|value|revenue|ticket|total|valor|preco/i.test(control.id + control.name)) {
    return "money";
  }
  return type;
}

function decorateControl(control) {
  if (!(control instanceof HTMLElement)) return;
  addClassOnce(control, "liddo-control");
  control.dataset.controlKind = controlKind(control);
  if (control.hasAttribute("required")) control.dataset.required = "true";
  if (control.disabled) control.dataset.controlState = "disabled";
  else if (control.value) control.dataset.controlState = "filled";
  else control.dataset.controlState = "empty";
}

function syncControlState(control) {
  if (!(control instanceof HTMLElement) || !control.matches(CONTROL_SELECTOR)) return;
  if (control.disabled) control.dataset.controlState = "disabled";
  else if (control.value) control.dataset.controlState = "filled";
  else control.dataset.controlState = "empty";
}

function normalizeModalFormRegions(form) {
  if (!(form instanceof HTMLFormElement)) return;
  const surface = form.closest(SURFACE_ROOT_SELECTOR);
  if (!surface || surface.matches(".op-drawer, .sched-drawer")) return;
  const footer = Array.from(form.children).find((child) => child.matches(FORM_FOOTER_SELECTOR));
  if (!(footer instanceof HTMLElement)) return;

  let body = Array.from(form.children).find((child) => child.classList.contains("liddo-modal-form-body"));
  if (!(body instanceof HTMLElement)) {
    body = document.createElement("div");
    body.className = "liddo-modal-form-body";
    form.insertBefore(body, form.firstElementChild);
  }

  Array.from(form.children).forEach((child) => {
    if (child !== body && child !== footer) body.appendChild(child);
  });
  form.classList.add("liddo-modal-form-shell");
  footer.classList.add("liddo-modal-form-footer");
}

function decorateForm(form) {
  if (!(form instanceof HTMLFormElement)) return;
  addClassOnce(form, "liddo-form");
  normalizeModalFormRegions(form);
  form.dataset.interactionContext = interactionContext(form);
  form.querySelectorAll(CONTROL_SELECTOR).forEach(decorateControl);
  form.querySelectorAll("label").forEach((label) => {
    addClassOnce(label, "liddo-field");
    const control = label.querySelector(CONTROL_SELECTOR);
    if (control?.matches("[type='checkbox'], [type='radio']")) label.dataset.fieldKind = "choice";
    if (control?.hasAttribute("required")) label.dataset.fieldRequired = "true";
  });

  if (decoratedForms.has(form)) return;
  decoratedForms.add(form);

  form.addEventListener("input", (event) => {
    const control = event.target;
    if (!(control instanceof HTMLElement) || !control.matches(CONTROL_SELECTOR)) return;
    syncControlState(control);
    if (control.getAttribute("aria-invalid") === "true" && control.checkValidity?.()) {
      control.removeAttribute("aria-invalid");
    }
  });
  form.addEventListener("change", (event) => syncControlState(event.target));
  form.addEventListener("invalid", (event) => {
    form.dataset.interactionSubmitted = "true";
    if (event.target instanceof HTMLElement) event.target.setAttribute("aria-invalid", "true");
  }, true);
  if (form.id !== "liddoConfirmForm") {
    form.addEventListener("submit", () => {
      form.dataset.interactionSubmitted = "true";
      form.dataset.interactionState = "submitting";
      window.setTimeout(() => {
        if (form.isConnected && form.dataset.interactionState === "submitting") {
          delete form.dataset.interactionState;
        }
      }, 900);
    });
  }
  form.addEventListener("reset", () => {
    delete form.dataset.interactionSubmitted;
    delete form.dataset.interactionState;
    window.setTimeout(() => form.querySelectorAll(CONTROL_SELECTOR).forEach(syncControlState), 0);
  });
}

function decorateSurface(surface) {
  if (!(surface instanceof HTMLElement)) return;
  const isDrawer = surface.matches(".op-drawer, .sched-drawer") || Boolean(surface.closest(".op-drawer, .sched-drawer"));
  addClassOnce(surface, isDrawer ? "liddo-drawer" : "liddo-modal");
  surface.dataset.interactionContext = interactionContext(surface);
  surface.querySelectorAll("form").forEach(decorateForm);
  surface.querySelectorAll(CONTROL_SELECTOR).forEach(decorateControl);
  surface.querySelectorAll(".panel-msg, [role='alert'], [role='status']").forEach((message) => {
    addClassOnce(message, "liddo-message");
  });
}

function enhanceSubtree(root) {
  if (!(root instanceof Element || root instanceof Document)) return;
  const owningForm = root instanceof Element ? root.closest("form") : null;
  if (owningForm) decorateForm(owningForm);
  if (root instanceof Element && root.matches(SURFACE_SELECTOR)) decorateSurface(root);
  root.querySelectorAll?.(SURFACE_SELECTOR).forEach(decorateSurface);
  if (root instanceof HTMLFormElement) decorateForm(root);
  root.querySelectorAll?.("form").forEach(decorateForm);
}

function getOpenSurfaces() {
  for (let index = activeSurfaces.length - 1; index >= 0; index -= 1) {
    const surface = activeSurfaces[index];
    if (!surface?.isConnected || !isSurfaceOpen(surface)) activeSurfaces.splice(index, 1);
  }
  return [...activeSurfaces];
}

function lockPage() {
  if (pageLockState) return;
  const scrollX = window.scrollX || 0;
  const scrollY = window.scrollY || 0;
  pageLockState = { scrollX, scrollY };
  document.documentElement.style.setProperty("--interaction-scroll-x", String(scrollX));
  document.documentElement.style.setProperty("--interaction-scroll-y", String(scrollY));
  document.documentElement.classList.add("interaction-surface-open");
  document.body.classList.add("interaction-surface-open");
}

function unlockPage() {
  if (!pageLockState) return;
  const { scrollX, scrollY } = pageLockState;
  pageLockState = null;
  document.documentElement.classList.remove("interaction-surface-open");
  document.body.classList.remove("interaction-surface-open");
  document.documentElement.style.removeProperty("--interaction-scroll-x");
  document.documentElement.style.removeProperty("--interaction-scroll-y");
  window.scrollTo(scrollX, scrollY);
}

function surfaceScrollContainers(surface) {
  if (!(surface instanceof HTMLElement)) return [];
  const selector = [
    ".op-drawer-body",
    ".sched-drawer-body",
    ".team-drawer-body",
    ".cl-drawer-body",
    ".svc-modal-body",
    ".fn-modal-form",
    ".inv-modal-form",
    ".cl-modal-form",
    ".ds-form-grid",
  ].join(",");
  return Array.from(surface.querySelectorAll(selector));
}

function resetSurfaceScroll(surface) {
  if (!(surface instanceof HTMLElement)) return;
  surfaceScrollContainers(surface).forEach((container) => {
    container.scrollTop = 0;
    container.scrollLeft = 0;
  });
  const panel = getSurfacePanel(surface);
  if (panel) {
    panel.scrollTop = 0;
    panel.scrollLeft = 0;
  }
}

function focusSurface(surface, focusSelector = "") {
  if (!(surface instanceof HTMLElement)) return;
  const panel = getSurfacePanel(surface);
  const target = (
    focusSelector ? panel?.querySelector(focusSelector) : null
  ) || panel?.querySelector(
    "[autofocus], input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex='-1'])",
  ) || panel;
  if (target instanceof HTMLElement) {
    if (target === panel && !target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }
}

function findSurfaceCloseTrigger(surface) {
  return surface?.querySelector?.([
    "[data-drawer-close]",
    "[data-svc-edit-close]",
    "[data-owner-flow-close]",
    "[data-services-modal-close]",
    "[data-checkout-close]",
    "[data-appointment-delay-close]",
    "[data-liddo-confirm-cancel]",
    "[id$='ModalClose']",
    "[id$='ModalCancel']",
    "#scheduleDrawerClose",
  ].join(","));
}

function requestSurfaceClose(surface) {
  const trigger = findSurfaceCloseTrigger(surface);
  if (trigger instanceof HTMLElement) {
    trigger.click();
    return true;
  }
  return false;
}

export function openInteractionSurface(surface, options = {}) {
  const root = getSurfaceRoot(surface);
  if (!(root instanceof HTMLElement)) return null;
  const opener = options.opener instanceof HTMLElement
    ? options.opener
    : document.activeElement instanceof HTMLElement
      ? document.activeElement
      : lastOutsideFocus;
  if (opener && !root.contains(opener)) openerState.set(root, opener);

  decorateSurface(root);
  if (root.matches(".op-drawer, .sched-drawer")) {
    root.classList.add("is-open");
  } else {
    root.classList.remove("hidden", "is-motion-closing");
    root.classList.add("flex");
  }
  root.setAttribute("aria-hidden", "false");

  const existingIndex = activeSurfaces.indexOf(root);
  if (existingIndex >= 0) activeSurfaces.splice(existingIndex, 1);
  activeSurfaces.push(root);
  lockPage();
  resetSurfaceScroll(root);
  window.requestAnimationFrame(() => focusSurface(root, options.focusSelector));
  return root;
}

export function closeInteractionSurface(surface, options = {}) {
  const root = getSurfaceRoot(surface);
  if (!(root instanceof HTMLElement)) return;
  if (root.matches(".op-drawer, .sched-drawer")) {
    root.classList.remove("is-open");
  } else {
    root.classList.add("hidden");
    root.classList.remove("flex", "is-motion-closing");
  }
  root.setAttribute("aria-hidden", "true");

  const activeIndex = activeSurfaces.indexOf(root);
  if (activeIndex >= 0) activeSurfaces.splice(activeIndex, 1);
  if (getOpenSurfaces().length === 0) {
    unlockPage();
    restoreSurfaceFocus(root);
  } else {
    focusSurface(getOpenSurfaces().at(-1));
  }
  options.afterClose?.();
}

function trapSurfaceFocus(event) {
  if (event.key !== "Tab") return;
  const surfaces = getOpenSurfaces();
  const surface = surfaces[surfaces.length - 1];
  if (!surface) return;
  const focusable = Array.from(surface.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((element) => isElementVisible(element));
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (!surface.contains(active)) {
    event.preventDefault();
    first.focus();
    return;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function restoreSurfaceFocus(surface) {
  if (!(surface instanceof HTMLElement)) return;
  const opener = openerState.get(surface) || lastOutsideFocus;
  window.setTimeout(() => {
    if (opener?.isConnected && typeof opener.focus === "function") {
      opener.focus({ preventScroll: true });
    }
  }, 240);
}

export function initInteractionSurfaces(root = document) {
  if (interactionSurfacesInitialized) {
    enhanceSubtree(root);
    return;
  }
  interactionSurfacesInitialized = true;
  enhanceSubtree(root);

  document.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const openSurfaces = getOpenSurfaces();
    const containingSurface = [...openSurfaces].reverse().find((surface) => surface.contains(target));
    if (containingSurface) {
      decorateSurface(containingSurface);
      if (!openerState.has(containingSurface) && lastOutsideFocus instanceof HTMLElement) {
        openerState.set(containingSurface, lastOutsideFocus);
      }
      return;
    }
    if (openSurfaces.length) {
      focusSurface(openSurfaces[openSurfaces.length - 1]);
      return;
    }
    lastOutsideFocus = target;
  }, true);
  document.addEventListener("keydown", trapSurfaceFocus, true);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const surfaces = getOpenSurfaces();
    const surface = surfaces[surfaces.length - 1];
    if (!surface) return;
    event.preventDefault();
    event.stopPropagation();
    requestSurfaceClose(surface);
  }, true);
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (
      !target?.matches(
        ".ds-modal-backdrop, .ui-modal-backdrop, .op-drawer-backdrop, .sched-drawer-scrim",
      )
    ) {
      return;
    }

    const surface = getSurfaceRoot(target);
    if (!surface || !isSurfaceOpen(surface)) return;

    event.preventDefault();
    event.stopPropagation();
    requestSurfaceClose(surface);
  }, true);
}

let confirmationResolver = null;
let confirmationOpener = null;

function ensureConfirmationLayer() {
  let layer = document.getElementById("liddoInteractionConfirm");
  if (layer) return layer;
  layer = document.createElement("div");
  layer.id = "liddoInteractionConfirm";
  layer.className = "ds-modal-backdrop liddo-confirm-layer hidden";
  layer.setAttribute("role", "presentation");
  layer.innerHTML = `
    <section class="ds-modal-panel liddo-confirm-panel" role="dialog" aria-modal="true"
             aria-labelledby="liddoConfirmTitle" aria-describedby="liddoConfirmMessage" tabindex="-1">
      <header class="ds-modal-head">
        <div>
          <p class="ux-label" id="liddoConfirmEyebrow">Confirmação</p>
          <h3 id="liddoConfirmTitle">Confirmar ação</h3>
        </div>
        <button type="button" data-liddo-confirm-cancel aria-label="Fechar">Fechar</button>
      </header>
      <form id="liddoConfirmForm" class="ds-form-grid" novalidate>
        <div class="liddo-confirm-consequence ds-form-full">
          <span>Consequência</span>
          <p id="liddoConfirmMessage"></p>
        </div>
        <label id="liddoConfirmInputField" class="ds-form-label ds-form-full hidden">
          <span id="liddoConfirmInputLabel">Motivo</span>
          <input id="liddoConfirmInput" class="ds-input" type="text" />
        </label>
        <div class="ds-form-full catalog-row-actions">
          <button type="button" data-liddo-confirm-cancel>Voltar</button>
          <button id="liddoConfirmSubmit" type="submit">Confirmar</button>
        </div>
      </form>
    </section>
  `;
  document.body.appendChild(layer);

  const settle = (value) => {
    const resolve = confirmationResolver;
    confirmationResolver = null;
    confirmationOpener = null;
    closeInteractionSurface(layer);
    resolve?.(value);
  };

  layer.querySelectorAll("[data-liddo-confirm-cancel]").forEach((button) => {
    button.addEventListener("click", () => settle(null));
  });
  layer.addEventListener("click", (event) => {
    if (event.target === layer) settle(null);
  });
  layer.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      settle(null);
    }
  });
  layer.querySelector("#liddoConfirmForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const inputField = layer.querySelector("#liddoConfirmInputField");
    const input = layer.querySelector("#liddoConfirmInput");
    if (!inputField?.classList.contains("hidden")) {
      const value = String(input?.value || "").trim();
      if (!value || (input?.minLength > 0 && value.length < input.minLength)) {
        input?.setAttribute("aria-invalid", "true");
        input?.focus();
        return;
      }
      settle(value);
      return;
    }
    settle(true);
  });
  return layer;
}

function openConfirmationLayer({
  title,
  message,
  confirmLabel,
  eyebrow,
  tone,
  inputLabel = "",
  inputValue = "",
  inputMinLength = 0,
} = {}) {
  const layer = ensureConfirmationLayer();
  if (confirmationResolver) confirmationResolver(null);
  confirmationOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  layer.dataset.interactionContext = tone === "destructive" ? "destructive" : "confirm";
  layer.querySelector("#liddoConfirmEyebrow").textContent = eyebrow || "Confirmação";
  layer.querySelector("#liddoConfirmTitle").textContent = title || "Confirmar ação";
  layer.querySelector("#liddoConfirmMessage").textContent = message || "Revise a consequência antes de continuar.";
  layer.querySelector("#liddoConfirmSubmit").textContent = confirmLabel || "Confirmar";

  const inputField = layer.querySelector("#liddoConfirmInputField");
  const input = layer.querySelector("#liddoConfirmInput");
  const inputLabelElement = layer.querySelector("#liddoConfirmInputLabel");
  const hasInput = Boolean(inputLabel);
  inputField?.classList.toggle("hidden", !hasInput);
  if (inputLabelElement) inputLabelElement.textContent = inputLabel;
  if (input) {
    input.value = inputValue;
    input.minLength = Math.max(0, Number(inputMinLength || 0));
    input.required = hasInput;
    input.removeAttribute("aria-invalid");
  }

  layer.dataset.interactionContext = tone === "destructive" ? "destructive" : "confirm";
  openInteractionSurface(layer, {
    opener: confirmationOpener,
    focusSelector: hasInput ? "#liddoConfirmInput" : "#liddoConfirmSubmit",
  });
  if (hasInput) window.requestAnimationFrame(() => input?.select());
  return new Promise((resolve) => {
    confirmationResolver = resolve;
  });
}

export function confirmInteraction(options = {}) {
  return openConfirmationLayer(options).then((value) => value === true);
}

export function promptInteraction(options = {}) {
  return openConfirmationLayer(options).then((value) => typeof value === "string" ? value : null);
}
