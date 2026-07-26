import { escapeHtml } from "../modules/sanitize.js";
import { statusLanguage } from "../modules/operational-language.js";
import {
  closeInteractionSurface,
  openInteractionSurface,
} from "./interaction-surfaces.js";

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

const HEADER_PROFILES = Object.freeze({
  agenda: {
    system: "TEMPO / FLUXO",
    focus: "Semana operacional",
    signal: "Grade ativa",
  },
  clientes: {
    system: "RELAÇÃO / RETENÇÃO",
    focus: "Base de relacionamento",
    signal: "Busca unificada",
  },
  financeiro: {
    system: "CAIXA / COMPETÊNCIA",
    focus: "Resultado do período",
    signal: "Leitura monetária",
  },
  estoque: {
    system: "DISPONIBILIDADE / GIRO",
    focus: "Controle de reposição",
    signal: "Saldo operacional",
  },
  pdv: {
    system: "BALCÃO / CONVERSÃO",
    focus: "Venda assistida",
    signal: "Caixa preparado",
  },
  servicos: {
    system: "CATÁLOGO / TEMPO",
    focus: "Gestão do catálogo",
    signal: "Oferta operacional",
  },
  profissionais: {
    system: "EQUIPE / CAPACIDADE",
    focus: "Produção da equipe",
    signal: "Escala operacional",
  },
  auditoria: {
    system: "TRILHA / CONTROLE",
    focus: "Rastreabilidade",
    signal: "Registro íntegro",
  },
  configuracoes: {
    system: "SISTEMA / GOVERNANÇA",
    focus: "Parâmetros da operação",
    signal: "Configuração ativa",
  },
  relatorios: {
    system: "LEITURA / HISTÓRICO",
    focus: "Análise gerencial",
    signal: "Período consolidado",
  },
  comissoes: {
    system: "REPASSE / CONTROLE",
    focus: "Ciclo de pagamento",
    signal: "Regra operacional",
  },
  fidelizacao: {
    system: "VÍNCULO / RECORRÊNCIA",
    focus: "Retenção da base",
    signal: "Relacionamento ativo",
  },
  automacoes: {
    system: "FLUXO / ASSISTÊNCIA",
    focus: "Operação assistida",
    signal: "Regras monitoradas",
  },
  metas: {
    system: "RITMO / PERFORMANCE",
    focus: "Progresso do período",
    signal: "Meta operacional",
  },
  "atendente-ia": {
    system: "IA / REVISÃO HUMANA",
    focus: "Comando assistido",
    signal: "Prévia obrigatória",
  },
  whatsapp: {
    system: "CANAL / AUTOMAÇÃO",
    focus: "Comunicação com clientes",
    signal: "Conexão monitorada",
  },
  "agendamento-link": {
    system: "ACESSO / CONVERSÃO",
    focus: "Agenda pública",
    signal: "Canal compartilhável",
  },
});

function normalizeHeaderKey(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function resolveHeaderProfile(title = "", variant = "") {
  const normalized = normalizeHeaderKey(variant || title);
  const aliases = {
    "venda-de-produtos": "pdv",
    venda: "pdv",
    equipe: "profissionais",
    "metas-e-performance": "metas",
  };
  const key = aliases[normalized] || normalized || "operacao";
  return {
    key,
    system: "LIDDO / OPERAÇÃO",
    focus: "Controle operacional",
    signal: "Ambiente ativo",
    ...(HEADER_PROFILES[key] || {}),
  };
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
  variant = "",
  system = "",
  focus = "",
  signal = "",
} = {}) {
  const profile = resolveHeaderProfile(title, variant);
  const headerSystem = system || profile.system;
  const headerFocus = focus || profile.focus;
  const headerSignal = signal || profile.signal;
  const contextLabel = eyebrow || context;
  return `
    <header class="op-page-header op-page-header-${escapeHtml(profile.key)}" data-header-module="${escapeHtml(profile.key)}" data-motion-item>
      <span class="op-header-link-rail" aria-hidden="true"></span>
      <div class="op-header-context-row">
        ${contextLabel ? `<p class="op-page-context">${escapeHtml(contextLabel)}</p>` : ""}
        ${breadcrumb ? `<p class="op-page-breadcrumb">${escapeHtml(breadcrumb)}</p>` : ""}
        <span class="op-header-system">${escapeHtml(headerSystem)}</span>
      </div>
      <div class="op-header-layout">
        <div class="op-page-header-main">
          <div class="op-header-title-lockup">
            <h1 class="op-page-title">${escapeHtml(title || "Tela")}</h1>
          </div>
          ${subtitle ? `<p class="op-page-subtitle">${escapeHtml(subtitle)}</p>` : ""}
          ${meta ? `<div class="op-page-meta">${meta}</div>` : ""}
        </div>
        <div class="op-header-focus" data-header-context>
          <span>Leitura principal</span>
          <strong>${escapeHtml(headerFocus)}</strong>
          <small><i aria-hidden="true"></i>${escapeHtml(headerSignal)}</small>
        </div>
        ${
          action || secondaryActions
            ? `<div class="op-page-action"><span class="op-header-action-label">Comandos</span>${secondaryActions || ""}${action || ""}</div>`
            : ""
        }
      </div>
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
    <section class="op-filter-bar" data-motion-item ${id ? `id="${escapeHtml(id)}"` : ""}>
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
    <aside class="op-drawer ${open ? "is-open" : ""}" id="${escapeHtml(id || "entityDrawer")}" aria-hidden="${open ? "false" : "true"}" tabindex="-1">
      <div class="op-drawer-backdrop" data-drawer-close></div>
      <article class="op-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="${escapeHtml(id || "entityDrawer")}-title">
        <header class="op-drawer-header">
          <div>
            <h2 id="${escapeHtml(id || "entityDrawer")}-title">${escapeHtml(title || "Detalhe")}</h2>
            ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
          </div>
          <div class="op-drawer-header-actions">
            ${status ? renderStatusChip(status) : ""}
            <button class="op-drawer-close" type="button" data-drawer-close aria-label="Fechar detalhes">Fechar</button>
          </div>
        </header>
        <div class="op-drawer-body">
          <section class="op-drawer-section">
            <h3>Resumo</h3>
            ${summary || "<p>Sem resumo disponivel.</p>"}
          </section>
          ${details ? `<section class="op-drawer-section"><h3>Detalhes operacionais</h3>${details}</section>` : ""}
          ${history ? `<section class="op-drawer-section"><h3>Historico</h3>${history}</section>` : ""}
          ${technicalTrace ? `<section class="op-drawer-section op-drawer-technical">${technicalTrace}</section>` : ""}
        </div>
        ${actions ? `<footer class="op-drawer-footer">${actions}</footer>` : ""}
      </article>
    </aside>
  `;
}

export function bindEntityDrawers(root = document) {
  root.querySelectorAll(".op-drawer.is-open").forEach((drawer) => {
    openInteractionSurface(drawer);
  });
  root.querySelectorAll(".op-drawer [data-drawer-close]").forEach((button) => {
    if (button.dataset.interactionCloseBound === "true") return;
    button.dataset.interactionCloseBound = "true";
    button.addEventListener("click", () => {
      const drawer = button.closest(".op-drawer");
      if (!drawer) return;
      closeInteractionSurface(drawer);
    });
  });
}
