import { escapeHtml } from "../modules/sanitize.js";
import { statusLanguage } from "../modules/operational-language.js";

export {
  escapeHtml,
  safeAttr,
  safeCurrency,
  safeDate,
  safeNumber,
  safeText,
} from "../modules/sanitize.js";

function attrsToString(attrs = {}) {
  return Object.entries(attrs)
    .filter(([, value]) => value !== false && value !== null && value !== undefined)
    .map(([key, value]) => (value === true ? escapeHtml(key) : `${escapeHtml(key)}="${escapeHtml(value)}"`))
    .join(" ");
}

function normalizeFilterFieldMarkup(field) {
  const html = String(field || "").trim();
  if (!html) return "";
  return `<div class="op-filter-field">${html}</div>`;
}

function normalizeStatus(status, fallbackLabel = "") {
  const key = String(status || "").trim().toUpperCase();
  const { label, tone } = statusLanguage(key, fallbackLabel || key || "Status");
  return { label, tone, key };
}

export function renderStatusChip(status, options = {}) {
  const meta = normalizeStatus(status, options.label);
  const label = options.label || meta.label;
  return `
    <span class="op-status-chip op-status-chip-${meta.tone}" data-status="${escapeHtml(meta.key)}">
      ${escapeHtml(label)}
    </span>
  `;
}

export function renderPrimaryAction({
  label,
  id = "",
  type = "button",
  href = "",
  disabled = false,
  variant = "primary",
  attrs = {},
} = {}) {
  const safeLabel = escapeHtml(label || "Continuar");
  const dataAttrs = attrsToString(attrs);
  const actionClass = `op-action op-action-${escapeHtml(variant)}`;
  if (href) {
    return `
      <a class="${actionClass} op-primary-action" href="${escapeHtml(href)}" ${id ? `id="${escapeHtml(id)}"` : ""} ${dataAttrs}>
        ${safeLabel}
      </a>
    `;
  }
  return `
    <button class="${actionClass} op-primary-action" type="${escapeHtml(type)}" ${id ? `id="${escapeHtml(id)}"` : ""} ${disabled ? "disabled" : ""} ${dataAttrs}>
      ${safeLabel}
    </button>
  `;
}

export function renderPageHeader({
  title,
  subtitle = "",
  context = "",
  breadcrumb = "",
  eyebrow = "",
  action = "",
  secondaryActions = "",
  meta = "",
} = {}) {
  return `
    <header class="op-page-header">
      <div class="op-page-header-main">
        ${breadcrumb ? `<p class="op-page-breadcrumb">${escapeHtml(breadcrumb)}</p>` : ""}
        ${context || eyebrow ? `<p class="op-page-context">${escapeHtml(eyebrow || context)}</p>` : ""}
        <h1 class="op-page-title">${escapeHtml(title || "Tela")}</h1>
        ${subtitle ? `<p class="op-page-subtitle">${escapeHtml(subtitle)}</p>` : ""}
        ${meta ? `<div class="op-page-meta">${meta}</div>` : ""}
      </div>
      ${
        action || secondaryActions
          ? `<div class="op-page-action">${secondaryActions || ""}${action || ""}</div>`
          : ""
      }
    </header>
  `;
}

export function renderFilterBar({
  id = "",
  essential = [],
  advanced = [],
  expanded = false,
  advancedLabel = "Filtros avancados",
} = {}) {
  const safeId = id || `filter-${Math.random().toString(36).slice(2)}`;
  const hasAdvanced = advanced.length > 0;
  const essentialFields = essential.map(normalizeFilterFieldMarkup).join("");
  const advancedFields = advanced.map(normalizeFilterFieldMarkup).join("");
  return `
    <section class="op-filter-bar" ${id ? `id="${escapeHtml(id)}"` : ""}>
      <div class="op-filter-essential">
        ${essentialFields}
        ${
          hasAdvanced
            ? `<button class="op-filter-toggle" type="button" aria-expanded="${expanded ? "true" : "false"}" data-filter-toggle="${escapeHtml(safeId)}">${escapeHtml(advancedLabel)}</button>`
            : ""
        }
      </div>
      ${
        hasAdvanced
          ? `<div class="op-filter-advanced ${expanded ? "is-open" : ""}" data-filter-panel="${escapeHtml(safeId)}">${advancedFields}</div>`
          : ""
      }
    </section>
  `;
}

export function bindFilterBars(root = document) {
  root.querySelectorAll("[data-filter-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.getAttribute("data-filter-toggle");
      const panel = root.querySelector(`[data-filter-panel="${CSS.escape(target)}"]`);
      if (!panel) return;
      const open = !panel.classList.contains("is-open");
      panel.classList.toggle("is-open", open);
      button.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });
}

export function renderEmptyState({
  title,
  description = "",
  action = "",
} = {}) {
  return `
    <div class="op-empty-state">
      <p class="op-empty-title">${escapeHtml(title || "Nada encontrado.")}</p>
      ${description ? `<p class="op-empty-description">${escapeHtml(description)}</p>` : ""}
      ${action ? `<div class="op-empty-action">${action}</div>` : ""}
    </div>
  `;
}

export function renderTechnicalTrace(_trace = {}, _options = {}) {
  return "";
}

export function renderEntityDrawer({
  id,
  title,
  subtitle = "",
  status = "",
  open = false,
  summary = "",
  details = "",
  history = "",
  technicalTrace = "",
  actions = "",
} = {}) {
  return `
    <aside class="op-drawer ${open ? "is-open" : ""}" id="${escapeHtml(id || "entityDrawer")}" aria-hidden="${open ? "false" : "true"}">
      <div class="op-drawer-backdrop" data-drawer-close></div>
      <article class="op-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="${escapeHtml(id || "entityDrawer")}-title">
        <header class="op-drawer-header">
          <div>
            <h2 id="${escapeHtml(id || "entityDrawer")}-title">${escapeHtml(title || "Detalhe")}</h2>
            ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
          </div>
          <div class="op-drawer-header-actions">
            ${status ? renderStatusChip(status) : ""}
            <button class="op-drawer-close" type="button" data-drawer-close>Fechar</button>
          </div>
        </header>
        <section class="op-drawer-section">
          <h3>Resumo</h3>
          ${summary || "<p>Sem resumo disponivel.</p>"}
        </section>
        ${details ? `<section class="op-drawer-section"><h3>Detalhes operacionais</h3>${details}</section>` : ""}
        ${history ? `<section class="op-drawer-section"><h3>Historico</h3>${history}</section>` : ""}
        ${technicalTrace ? `<section class="op-drawer-section op-drawer-technical">${technicalTrace}</section>` : ""}
        ${actions ? `<footer class="op-drawer-footer">${actions}</footer>` : ""}
      </article>
    </aside>
  `;
}

export function bindEntityDrawers(root = document) {
  root.querySelectorAll(".op-drawer [data-drawer-close]").forEach((button) => {
    button.addEventListener("click", () => {
      const drawer = button.closest(".op-drawer");
      if (!drawer) return;
      drawer.classList.remove("is-open");
      drawer.setAttribute("aria-hidden", "true");
    });
  });
}
