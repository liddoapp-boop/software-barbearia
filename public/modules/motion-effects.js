const layerCloseRuns = new WeakMap();
const buttonStateTimers = new WeakMap();
const kpiUpdateTimers = new WeakMap();
let motionObserver;
let motionListenersReady = false;
let lastActionButton = null;
let lastActionButtonTimer = 0;

function reducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

function animateElements(elements, keyframes, options = {}) {
  if (reducedMotion()) return [];
  const animations = [];
  elements.filter(Boolean).forEach((element, index) => {
    if (typeof element.animate !== "function") return;
    element
      .getAnimations?.()
      .filter((animation) => animation.playState === "running")
      .forEach((animation) => animation.cancel());
    const animation = element.animate(keyframes, {
      duration: options.duration ?? 320,
      delay: Math.min(index, 8) * (options.stagger ?? 0),
      easing: options.easing ?? "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: options.fill ?? "backwards",
    });
    animations.push(animation);
  });
  return animations;
}

function animateInsertedContent(node) {
  const selector = [
    "[data-motion-item]",
    ".op-page-header",
    ".settings-page-head",
    ".op-filter-bar",
    ".ux-kpi",
    ".ux-card",
    ".inv-row",
    ".al-card",
    ".client-row",
    ".finance-row",
    ".svc-card",
    ".team-row",
    "[role='listitem']",
    "tbody tr",
  ].join(",");
  const targets = [
    ...(node.matches?.(selector) ? [node] : []),
    ...(node.querySelectorAll?.(selector) || []),
  ].slice(0, 12);
  const animations = animateElements(
    targets,
    [
      { opacity: 0, transform: "translateY(9px) scale(0.996)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    { duration: 300, stagger: 26 },
  );
  if (animations.length && targets.length) {
    const highlightTarget = targets.find((target) =>
      target.matches(".inv-row, .al-card, .client-row, .finance-row, .svc-card, .team-row, tbody tr"),
    );
    if (highlightTarget) {
      window.setTimeout(() => {
        highlightTarget.classList.add("motion-data-highlight");
        window.setTimeout(() => highlightTarget.classList.remove("motion-data-highlight"), 760);
      }, 180);
    }
  }
}

function animateKpiUpdate(node) {
  if (reducedMotion()) return;
  const element = node instanceof Element ? node : node?.parentElement;
  const instrument = element?.matches?.(".liddo-kpi")
    ? element
    : element?.closest?.(".liddo-kpi");
  if (!(instrument instanceof HTMLElement)) return;

  const previousTimer = kpiUpdateTimers.get(instrument);
  if (previousTimer) window.clearTimeout(previousTimer);
  instrument.classList.remove("is-kpi-updating");
  requestAnimationFrame(() => {
    instrument.classList.add("is-kpi-updating");
    const timer = window.setTimeout(() => {
      instrument.classList.remove("is-kpi-updating");
      kpiUpdateTimers.delete(instrument);
    }, 360);
    kpiUpdateTimers.set(instrument, timer);
  });
}

function animateRevealedElement(element, oldClassName = "") {
  if (!(element instanceof Element) || reducedMotion()) return;
  const oldClasses = new Set(String(oldClassName || "").split(/\s+/).filter(Boolean));
  const becameVisible = oldClasses.has("hidden") && !element.classList.contains("hidden");
  const becameOpen =
    (!oldClasses.has("is-open") && element.classList.contains("is-open"))
    || (!oldClasses.has("open") && element.classList.contains("open"));
  if (!becameVisible && !becameOpen) return;
  if (!element.matches(".agenda-more-menu, .sb-account-menu, [role='menu'], .op-filter-advanced")) return;
  animateElements(
    [element],
    [
      { opacity: 0, transform: "translateY(-6px) scale(0.985)" },
      { opacity: 1, transform: "translateY(0) scale(1)" },
    ],
    { duration: 210 },
  );
}

function setTemporaryButtonState(button, state) {
  if (!(button instanceof HTMLButtonElement)) return;
  const previousTimer = buttonStateTimers.get(button);
  if (previousTimer) window.clearTimeout(previousTimer);
  button.classList.remove("is-loading", "is-success", "is-error");
  if (!state) {
    if (button.dataset.motionAutoBusy === "true") {
      button.removeAttribute("aria-busy");
      delete button.dataset.motionAutoBusy;
    }
    buttonStateTimers.delete(button);
    return;
  }
  button.classList.add(`is-${state}`);
  if (state === "loading" && button.getAttribute("aria-busy") !== "true") {
    button.setAttribute("aria-busy", "true");
    button.dataset.motionAutoBusy = "true";
  }
  if (state !== "loading") {
    if (button.dataset.motionAutoBusy === "true") {
      button.removeAttribute("aria-busy");
      delete button.dataset.motionAutoBusy;
    }
    const timer = window.setTimeout(() => setTemporaryButtonState(button, ""), 1100);
    buttonStateTimers.set(button, timer);
  }
}

function syncClickedButtonBusy(button) {
  if (!(button instanceof HTMLButtonElement)) return;
  if (button.disabled) {
    setTemporaryButtonState(button, "loading");
  } else if (button.classList.contains("is-loading")) {
    setTemporaryButtonState(button, "");
  }
}

function feedbackTone(node) {
  if (!(node instanceof Element)) return "";
  const feedback = node.matches(
    ".panel-message, .panel-msg, .toast, [role='status'], [role='alert']",
  )
    ? node
    : node.querySelector(".panel-message, .panel-msg, .toast, [role='status'], [role='alert']");
  if (!feedback || !feedback.textContent?.trim()) return "";
  const signature = `${feedback.className} ${feedback.getAttribute("data-tone") || ""}`.toLowerCase();
  if (/error|danger|erro/.test(signature)) return "error";
  if (/success|sucesso/.test(signature)) return "success";
  return "";
}

function animateFeedback(node) {
  const tone = feedbackTone(node);
  if (!tone || !(lastActionButton instanceof HTMLButtonElement)) return;
  setTemporaryButtonState(lastActionButton, tone);
  const moduleSection = lastActionButton.closest("[data-module-section], section");
  const changedElement = moduleSection?.querySelector(
    ".motion-data-highlight, .inv-row, .al-card, .client-row, .finance-row, .svc-card, .team-row, tbody tr",
  );
  if (changedElement) {
    changedElement.classList.add("motion-data-highlight");
    window.setTimeout(() => changedElement.classList.remove("motion-data-highlight"), 900);
  }
}

function animateDetailsToggle(details) {
  if (!(details instanceof HTMLDetailsElement) || reducedMotion()) return;
  const content = [...details.children].filter((child) => child.tagName !== "SUMMARY");
  if (details.open && content.length) {
    animateElements(
      content,
      [
        { opacity: 0, transform: "translateY(-5px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 220, stagger: 12 },
    );
  } else {
    animateElements(
      [details.querySelector("summary")],
      [
        { opacity: 0.76, transform: "translateY(-1px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 170 },
    );
  }
}

function animateHeaderContext(control) {
  if (!(control instanceof Element) || reducedMotion()) return;
  const isContextControl = control.matches(
    "select, input[type='date'], input[type='month'], [data-filter-toggle], .shf-preset, .wc-nav-btn, .wc-view-btn, [id$='ApplyBtn']",
  );
  if (!isContextControl) return;

  const section = control.closest(".module-section, [data-settings-screen], section");
  const header = section?.querySelector(".op-page-header, .settings-page-head");
  if (!(header instanceof HTMLElement)) return;

  header.classList.remove("is-context-updating");
  requestAnimationFrame(() => {
    header.classList.add("is-context-updating");
    window.setTimeout(() => header.classList.remove("is-context-updating"), 360);
  });
}

function registerMotionListeners() {
  if (motionListenersReady) return;
  motionListenersReady = true;
  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (!(button instanceof HTMLButtonElement)) return;
    lastActionButton = button;
    window.clearTimeout(lastActionButtonTimer);
    lastActionButtonTimer = window.setTimeout(() => {
      if (lastActionButton === button) lastActionButton = null;
    }, 6000);
    queueMicrotask(() => syncClickedButtonBusy(button));

    const action = [
      button.id,
      button.name,
      button.dataset.action,
      button.dataset.operation,
      button.textContent,
    ].filter(Boolean).join(" ");
    animateHeaderContext(button);
    if (/delete|remove|excluir|remover|inativar|cancelar/i.test(action)) {
      const row = button.closest(
        ".inv-row, .al-card, .client-row, .finance-row, .svc-card, .team-row, tbody tr",
      );
      animateElements(
        [row],
        [
          { opacity: 1, transform: "translateX(0)" },
          { opacity: 0.58, transform: "translateX(4px)" },
          { opacity: 1, transform: "translateX(0)" },
        ],
        { duration: 260 },
      );
    }
  }, true);
  document.addEventListener("change", (event) => animateHeaderContext(event.target), true);
  document.addEventListener("toggle", (event) => animateDetailsToggle(event.target), true);
}

export function initMotionSystem() {
  document.documentElement.classList.add("motion-system-ready");
  document.documentElement.classList.toggle("motion-reduced", reducedMotion());
  registerMotionListeners();
  motionObserver?.disconnect();
  motionObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "childList") {
        animateKpiUpdate(mutation.target);
      }
      if (mutation.type === "attributes") {
        if (mutation.attributeName === "class") {
          animateRevealedElement(mutation.target, mutation.oldValue);
        }
        if (mutation.attributeName === "disabled") {
          syncClickedButtonBusy(mutation.target);
        }
      }
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) {
          animateInsertedContent(node);
          animateFeedback(node);
        }
      });
    });
  });
  motionObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ["class", "aria-hidden", "disabled"],
  });
  requestAnimationFrame(() => document.body.classList.add("shell-motion-ready"));
}

export function animateModuleScreen(section) {
  if (!section) return;
  const targets = [
    section.querySelector(".op-page-header, .settings-page-head"),
    ...section.querySelectorAll(
      ".ux-kpi, .ux-card, .op-filter-bar, .inv-row, .al-card, .client-row, .finance-row, .svc-card, .team-row, table",
    ),
  ].slice(0, 12);
  animateElements(
    targets,
    [
      { opacity: 0, transform: "translateY(12px) scale(0.995)" },
      { opacity: 1, transform: "translateY(0) scale(1)" },
    ],
    { duration: 340, stagger: 30 },
  );
}

export function animateAgendaView(mode, elements = {}) {
  const targets = mode === "list"
    ? [
        elements.list,
        elements.list?.querySelector(".al-list, [role='list'], .ux-card"),
      ]
    : [
        elements.calendar,
        elements.cards,
        elements.calendar?.querySelector(".wc-header-row"),
        elements.calendar?.querySelector(".wc-body-scroll"),
      ];
  animateElements(
    targets,
    [
      { opacity: 0, transform: "translateY(8px) scale(0.996)" },
      { opacity: 1, transform: "translateY(0) scale(1)" },
    ],
    { duration: 280, stagger: 22 },
  );
}

export function showMotionLayer(element) {
  if (!element) return;
  layerCloseRuns.set(element, (layerCloseRuns.get(element) || 0) + 1);
  element.getAnimations?.({ subtree: true }).forEach((animation) => animation.cancel());
  element.classList.remove("is-motion-closing", "hidden");
  element.classList.add("flex");
}

export function hideMotionLayer(element, afterHide) {
  if (!element) return;
  const finalize = () => {
    element.classList.add("hidden");
    element.classList.remove("flex", "is-motion-closing");
    afterHide?.();
  };
  if (element.classList.contains("hidden") || reducedMotion() || typeof element.animate !== "function") {
    finalize();
    return;
  }
  const run = (layerCloseRuns.get(element) || 0) + 1;
  layerCloseRuns.set(element, run);
  element.classList.add("is-motion-closing");
  const panel = element.firstElementChild;
  const animations = [
    element.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 180,
      easing: "ease",
      fill: "forwards",
    }),
    panel?.animate?.(
      [
        { opacity: 1, transform: "translateY(0) scale(1)" },
        { opacity: 0, transform: "translateY(7px) scale(0.99)" },
      ],
      {
        duration: 180,
        easing: "cubic-bezier(0.4, 0, 1, 1)",
        fill: "forwards",
      },
    ),
  ].filter(Boolean);
  Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
    if (layerCloseRuns.get(element) !== run) return;
    finalize();
  });
}

export function showMotionPopover(element) {
  if (!element) return;
  layerCloseRuns.set(element, (layerCloseRuns.get(element) || 0) + 1);
  element.getAnimations?.().forEach((animation) => animation.cancel());
  element.classList.remove("is-motion-closing", "hidden");
}

export function hideMotionPopover(element, afterHide) {
  if (!element || element.classList.contains("hidden")) {
    afterHide?.();
    return;
  }
  const finalize = () => {
    element.classList.add("hidden");
    element.classList.remove("is-motion-closing");
    afterHide?.();
  };
  if (reducedMotion() || typeof element.animate !== "function") {
    finalize();
    return;
  }
  const run = (layerCloseRuns.get(element) || 0) + 1;
  layerCloseRuns.set(element, run);
  element.classList.add("is-motion-closing");
  const animation = element.animate(
    [
      { opacity: 1, transform: "translateY(0) scale(1)" },
      { opacity: 0, transform: "translateY(-5px) scale(0.985)" },
    ],
    {
      duration: 150,
      easing: "cubic-bezier(0.4, 0, 1, 1)",
      fill: "forwards",
    },
  );
  const complete = () => {
    if (layerCloseRuns.get(element) === run) finalize();
  };
  animation.finished.then(complete, complete);
}

export function animateSidebarIndicator(sidebar, previousOffset = null) {
  const nav = sidebar?.querySelector(".sb-nav");
  const active = nav?.querySelector(".sb-item.is-active");
  const indicator = nav?.querySelector(".sb-active-indicator");
  if (!nav || !active || !indicator) return;
  const nextOffset = active.offsetTop;
  indicator.style.setProperty("--sb-active-height", `${active.offsetHeight}px`);
  indicator.style.setProperty("--sb-active-y", `${nextOffset}px`);
  if (previousOffset === null || reducedMotion()) {
    indicator.classList.add("is-ready");
    return;
  }
  indicator.classList.remove("is-travelling");
  indicator.style.setProperty("--sb-active-y", `${previousOffset}px`);
  indicator.classList.add("is-ready");
  requestAnimationFrame(() => {
    indicator.classList.add("is-travelling");
    indicator.style.setProperty("--sb-active-y", `${nextOffset}px`);
  });
}

export function animateSettingsScreen(root) {
  if (!root) return;
  root.classList.remove("settings-motion-ready");
  requestAnimationFrame(() => root.classList.add("settings-motion-ready"));
  animateElements(
    [
      root.querySelector("[data-settings-panel]"),
      ...root.querySelectorAll("[data-motion-item]"),
    ].slice(0, 14),
    [
      { opacity: 0, transform: "translateY(10px) scale(0.994)" },
      { opacity: 1, transform: "translateY(0) scale(1)" },
    ],
    { duration: 340, stagger: 28 },
  );
}
