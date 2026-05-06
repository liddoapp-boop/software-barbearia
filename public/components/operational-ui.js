const STATUS_MAP = {
  INFO: ["Informativo", "info"],
  WARNING: ["Atencao", "warning"],
  SCHEDULED: ["Agendado", "neutral"],
  AGENDADO: ["Agendado", "neutral"],
  CONFIRMED: ["Confirmado", "info"],
  CONFIRMADO: ["Confirmado", "info"],
  IN_SERVICE: ["Em atendimento", "warning"],
  EM_ATENDIMENTO: ["Em atendimento", "warning"],
  COMPLETED: ["Concluido", "success"],
  CONCLUIDO: ["Concluido", "success"],
  CANCELLED: ["Cancelado", "danger"],
  CANCELADO: ["Cancelado", "danger"],
  NO_SHOW: ["Falta", "danger"],
  NAO_COMPARECEU: ["Falta", "danger"],
  PAID: ["Paga", "success"],
  PAGO: ["Pago", "success"],
  PENDING: ["Pendente", "warning"],
  PENDENTE: ["Pendente", "warning"],
  CANCELED: ["Cancelada", "danger"],
  REFUNDED: ["Devolvido", "danger"],
  DEVOLVIDO: ["Devolvido", "danger"],
  NOT_REFUNDED: ["Sem devolucao", "success"],
  PARTIALLY_REFUNDED: ["Parcialmente devolvido", "warning"],
  PARCIALMENTE_DEVOLVIDO: ["Parcialmente devolvido", "warning"],
  LOW_STOCK: ["Estoque baixo", "warning"],
  ESTOQUE_BAIXO: ["Estoque baixo", "warning"],
  CRITICAL: ["Critico", "danger"],
  CRITICAL_STOCK: ["Critico", "danger"],
  OUT_OF_STOCK: ["Sem estoque", "danger"],
  ESTOQUE_CRITICO: ["Estoque critico", "danger"],
  IN_STOCK: ["Em estoque", "success"],
  EM_ESTOQUE: ["Em estoque", "success"],
  BLOCKED: ["Bloqueado", "danger"],
  BLOQUEADO: ["Bloqueado", "danger"],
  ACTIVE: ["Ativo", "success"],
  ATIVO: ["Ativo", "success"],
  NEW: ["Novo", "info"],
  NOVO: ["Novo", "info"],
  RECURRING: ["Recorrente", "success"],
  RECORRENTE: ["Recorrente", "success"],
  INACTIVE: ["Inativo", "muted"],
  INATIVO: ["Inativo", "muted"],
  VIP: ["VIP", "premium"],
  AT_RISK: ["Em risco", "warning"],
  EM_RISCO: ["Em risco", "warning"],
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function attrsToString(attrs = {}) {
  return Object.entries(attrs)
    .filter(([, value]) => value !== false && value !== null && value !== undefined)
    .map(([key, value]) => (value === true ? escapeHtml(key) : `${escapeHtml(key)}="${escapeHtml(value)}"`))
    .join(" ");
}

function normalizeStatus(status, fallbackLabel = "") {
  const key = String(status || "").trim().toUpperCase();
  const [label, tone] = STATUS_MAP[key] || [fallbackLabel || key || "Status", "neutral"];
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
  attrs = {},
} = {}) {
  const safeLabel = escapeHtml(label || "Continuar");
  const dataAttrs = attrsToString(attrs);
  if (href) {
    return `
      <a class="op-primary-action" href="${escapeHtml(href)}" ${id ? `id="${escapeHtml(id)}"` : ""} ${dataAttrs}>
        ${safeLabel}
      </a>
    `;
  }
  return `
    <button class="op-primary-action" type="${escapeHtml(type)}" ${id ? `id="${escapeHtml(id)}"` : ""} ${disabled ? "disabled" : ""} ${dataAttrs}>
      ${safeLabel}
    </button>
  `;
}

export function renderPageHeader({
  title,
  subtitle = "",
  context = "",
  action = "",
} = {}) {
  return `
    <header class="op-page-header">
      <div class="op-page-header-main">
        ${context ? `<p class="op-page-context">${escapeHtml(context)}</p>` : ""}
        <h1 class="op-page-title">${escapeHtml(title || "Tela")}</h1>
        ${subtitle ? `<p class="op-page-subtitle">${escapeHtml(subtitle)}</p>` : ""}
      </div>
      ${action ? `<div class="op-page-action">${action}</div>` : ""}
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
  return `
    <section class="op-filter-bar" ${id ? `id="${escapeHtml(id)}"` : ""}>
      <div class="op-filter-essential">
        ${essential.join("")}
        ${
          hasAdvanced
            ? `<button class="op-filter-toggle" type="button" aria-expanded="${expanded ? "true" : "false"}" data-filter-toggle="${escapeHtml(safeId)}">${escapeHtml(advancedLabel)}</button>`
            : ""
        }
      </div>
      ${
        hasAdvanced
          ? `<div class="op-filter-advanced ${expanded ? "is-open" : ""}" data-filter-panel="${escapeHtml(safeId)}">${advanced.join("")}</div>`
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

export function renderTechnicalTrace(trace = {}, options = {}) {
  const stringifyTraceValue = (value) => {
    if (value == null || value === "") return "";
    if (typeof value === "string") {
      try {
        return JSON.stringify(JSON.parse(value), null, 2);
      } catch (_error) {
        return value;
      }
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch (_error) {
      return String(value);
    }
  };

  const fields = [
    ["ID interno", trace.id || trace.internalId],
    ["businessSettingsId", trace.businessSettingsId],
    ["paymentMethodId", trace.paymentMethodId],
    ["teamMemberId", trace.teamMemberId],
    ["commissionRuleId", trace.commissionRuleId],
    ["auditLogId", trace.auditLogId],
    ["financialEntryId", trace.financialEntryId],
    ["source", trace.source],
    ["productId", trace.productId],
    ["stockMovementId", trace.stockMovementId],
    ["serviceId", trace.serviceId],
    ["enabledProfessionalIds", Array.isArray(trace.enabledProfessionalIds) ? trace.enabledProfessionalIds.join(", ") : trace.enabledProfessionalIds],
    ["clientId", trace.clientId],
    ["businessId", trace.businessId],
    ["unitId", trace.unitId],
    ["preferredProfessionalId", trace.preferredProfessionalId],
    ["saleId", trace.saleId],
    ["productSaleId", trace.productSaleId],
    ["productSaleItemId", trace.productSaleItemId],
    ["refundId", trace.refundId],
    ["appointmentId", trace.appointmentId],
    ["commissionId", trace.commissionId],
    ["professionalId", trace.professionalId],
    ["userId", trace.userId],
    ["ruleId", trace.ruleId],
    ["commissionRuleIds", Array.isArray(trace.commissionRuleIds) ? trace.commissionRuleIds.join(", ") : trace.commissionRuleIds],
    ["serviceIds", Array.isArray(trace.serviceIds) ? trace.serviceIds.join(", ") : trace.serviceIds],
    ["status", trace.status],
    ["createdAt", trace.createdAt],
    ["updatedAt", trace.updatedAt],
    ["customerId", trace.customerId],
    ["referenceType", trace.referenceType],
    ["referenceId", trace.referenceId],
    ["entity", trace.entity],
    ["entityId", trace.entityId],
    ["action", trace.action],
    ["route", trace.route],
    ["method", trace.method],
    ["requestId", trace.requestId],
    ["idempotencyKey", trace.idempotencyKey],
    ["correlationId", trace.correlationId || trace.requestId],
    ["Entidade de auditoria", trace.auditEntity || trace.entity],
    ["Evento relacionado", trace.auditAction || trace.event],
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");
  const rawFields = [
    ["tags", trace.tags],
    ["beforeJson", trace.beforeJson],
    ["afterJson", trace.afterJson],
    ["metadataJson", trace.metadataJson],
  ]
    .map(([label, value]) => [label, stringifyTraceValue(value)])
    .filter(([, value]) => value);

  if (!fields.length && !rawFields.length) return "";

  return `
    <details class="op-technical-trace" ${options.open ? "open" : ""}>
      <summary>${escapeHtml(options.title || "Rastreabilidade tecnica")}</summary>
      ${
        fields.length
          ? `<dl>
              ${fields
                .map(
                  ([label, value]) => `
                    <div>
                      <dt>${escapeHtml(label)}</dt>
                      <dd>${escapeHtml(value)}</dd>
                    </div>
                  `,
                )
                .join("")}
            </dl>`
          : ""
      }
      ${
        rawFields.length
          ? `<div class="op-technical-raw">
              ${rawFields
                .map(
                  ([label, value]) => `
                    <details>
                      <summary>${escapeHtml(label)}</summary>
                      <pre>${escapeHtml(value)}</pre>
                    </details>
                  `,
                )
                .join("")}
            </div>`
          : ""
      }
    </details>
  `;
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
