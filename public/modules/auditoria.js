import {
  bindEntityDrawers,
  renderEmptyState,
  renderEntityDrawer,
  renderStatusChip,
  renderTechnicalTrace,
} from "../components/operational-ui.js";
import { renderPanelMessage } from "./feedback.js";

const ACTION_LABELS = {
  APPOINTMENT_CHECKOUT: "Atendimento finalizado",
  APPOINTMENT_CHECKOUT_COMPLETED: "Atendimento finalizado",
  CHECKOUT: "Atendimento finalizado",
  APPOINTMENT_REFUND: "Estorno de atendimento",
  APPOINTMENT_REFUNDED: "Estorno de atendimento",
  PRODUCT_SALE_CREATED: "Venda de produto registrada",
  PRODUCT_SALE_REFUND: "Devolucao de produto registrada",
  PRODUCT_SALE_REFUNDED: "Devolucao de produto registrada",
  FINANCIAL_MANUAL_ENTRY: "Lancamento financeiro manual",
  FINANCIAL_MANUAL_ENTRY_REGISTERED: "Lancamento financeiro manual",
  FINANCIAL_TRANSACTION_CREATED: "Lancamento financeiro registrado",
  COMMISSION_PAID: "Comissao paga",
  STOCK_ADJUSTMENT: "Estoque ajustado",
  STOCK_ADJUSTED: "Estoque ajustado",
  SETTINGS_UPDATED: "Configuracao alterada",
  USER_LOGIN: "Login realizado",
  AUTH_LOGIN: "Login realizado",
  PERMISSION_DENIED: "Acesso bloqueado",
};

const ENTITY_LABELS = {
  appointment: "Agenda",
  Appointment: "Agenda",
  product_sale: "PDV",
  product_sale_refund: "PDV",
  financial_entry: "Financeiro",
  financial_transaction: "Financeiro",
  commission: "Comissoes",
  product: "Estoque",
  inventory: "Estoque",
  stock_movement: "Estoque",
  settings: "Configuracoes",
  user: "Usuarios",
};

const SENSITIVE_ACTIONS = [
  "CHECKOUT",
  "REFUND",
  "DELETE",
  "DENIED",
  "COMMISSION_PAID",
  "FINANCIAL_MANUAL_ENTRY",
  "FINANCIAL_MANUAL_ENTRY_REGISTERED",
  "STOCK_ADJUSTMENT",
  "SETTINGS_UPDATED",
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function dayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sem-data";
  return date.toISOString().slice(0, 10);
}

function dayLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem data";
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startToday.getTime() - startDate.getTime()) / 86_400_000);
  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  return date.toLocaleDateString("pt-BR");
}

function humanizeToken(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function actionLabel(action = "") {
  const key = String(action || "").trim();
  if (ACTION_LABELS[key]) return ACTION_LABELS[key];
  const normalized = key.toUpperCase();
  if (normalized.includes("CHECKOUT")) return "Atendimento finalizado";
  if (normalized.includes("REFUND")) return "Estorno ou devolucao registrada";
  if (normalized.includes("COMMISSION") && normalized.includes("PAID")) return "Comissao paga";
  if (normalized.includes("STOCK") || normalized.includes("INVENTORY")) return "Movimento de estoque";
  if (normalized.includes("SETTING")) return "Configuracao alterada";
  if (normalized.includes("LOGIN")) return "Login realizado";
  if (normalized.includes("DENIED") || normalized.includes("FORBIDDEN")) return "Acesso bloqueado";
  if (normalized.includes("CREATED") || normalized.includes("REGISTERED")) return `${humanizeToken(key.replace(/_(CREATED|REGISTERED)$/i, ""))} registrado`;
  if (normalized.includes("UPDATED")) return `${humanizeToken(key.replace(/_UPDATED$/i, ""))} alterado`;
  if (normalized.includes("DELETED")) return `${humanizeToken(key.replace(/_DELETED$/i, ""))} removido`;
  return humanizeToken(key) || "Evento registrado";
}

function moduleLabel(entity = "") {
  return ENTITY_LABELS[entity] || humanizeToken(entity) || "Operacao";
}

function roleLabel(role = "") {
  const normalized = String(role || "").toLowerCase();
  if (normalized === "owner") return "Dono";
  if (normalized === "recepcao") return "Recepcao";
  if (normalized === "profissional") return "Profissional";
  if (normalized === "anonymous") return "Sem sessao";
  return humanizeToken(role) || "-";
}

function actorLabel(event = {}) {
  return event.actorEmail || event.actorId || "Sistema";
}

function isSensitive(event = {}) {
  const action = String(event.action || "").toUpperCase();
  return SENSITIVE_ACTIONS.some((item) => action.includes(item));
}

function parseJsonValue(value) {
  if (!value || typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return value;
  }
}

function asRecord(value) {
  const parsed = parseJsonValue(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function formatValue(value) {
  if (value == null || value === "") return "-";
  if (typeof value === "number") return Number(value).toLocaleString("pt-BR");
  if (typeof value === "boolean") return value ? "Sim" : "Nao";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value);
  if (typeof value === "object") return "Valor composto";
  return String(value);
}

function collectChangedFields(event = {}) {
  const before = asRecord(event.before ?? event.beforeJson);
  const after = asRecord(event.after ?? event.afterJson);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return Array.from(keys)
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .slice(0, 8)
    .map((key) => ({
      key,
      before: before[key],
      after: after[key],
    }));
}

function impactSummary(event = {}) {
  const label = actionLabel(event.action);
  const module = moduleLabel(event.entity);
  const changes = collectChangedFields(event);
  if (changes.length) {
    const first = changes[0];
    return `${label} em ${module}; principal alteracao: ${humanizeToken(first.key)}.`;
  }
  const metadata = asRecord(event.metadata ?? event.metadataJson);
  const hints = [
    metadata.description,
    metadata.reason,
    metadata.status,
    metadata.total,
    metadata.amount,
  ].filter((item) => item !== undefined && item !== null && item !== "");
  if (hints.length) return `${label} em ${module}; contexto: ${formatValue(hints[0])}.`;
  return `${label} em ${module}.`;
}

function renderSensitivity(event = {}) {
  if (!isSensitive(event)) return "";
  return renderStatusChip("CRITICAL", { label: "Sensivel" });
}

function renderTimelineEvent(event = {}) {
  return `
    <article class="audit-event-card ${isSensitive(event) ? "audit-event-sensitive" : ""}">
      <div class="audit-event-time">
        <span>${escapeHtml(formatDateTime(event.createdAt))}</span>
      </div>
      <div class="audit-event-main">
        <div class="audit-event-head">
          <div>
            <p class="audit-event-action">${escapeHtml(actionLabel(event.action))}</p>
            <p class="audit-event-impact">${escapeHtml(impactSummary(event))}</p>
          </div>
          <div class="audit-event-badges">
            ${renderStatusChip("INFO", { label: moduleLabel(event.entity) })}
            ${renderSensitivity(event)}
          </div>
        </div>
        <div class="audit-event-meta">
          <span><strong>Ator</strong> ${escapeHtml(actorLabel(event))}</span>
          <span><strong>Perfil</strong> ${escapeHtml(roleLabel(event.actorRole || event.role))}</span>
          <span><strong>Modulo</strong> ${escapeHtml(moduleLabel(event.entity))}</span>
        </div>
        <div class="audit-event-actions">
          <button type="button" class="ux-btn ux-btn-muted" data-audit-action="detail" data-audit-event-id="${escapeHtml(event.id)}">Ver detalhes</button>
        </div>
      </div>
    </article>
  `;
}

function groupEventsByDay(events = []) {
  const sorted = [...events].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return sorted.reduce((groups, event) => {
    const key = dayKey(event.createdAt);
    const existing = groups.find((group) => group.key === key);
    if (existing) {
      existing.events.push(event);
      return groups;
    }
    groups.push({ key, label: dayLabel(event.createdAt), events: [event] });
    return groups;
  }, []);
}

function renderTimeline(events = []) {
  return `
    <div class="audit-timeline">
      ${groupEventsByDay(events)
        .map(
          (group) => `
            <section class="audit-day-group">
              <h3>${escapeHtml(group.label)}</h3>
              <div class="audit-day-events">
                ${group.events.map(renderTimelineEvent).join("")}
              </div>
            </section>
          `,
        )
        .join("")}
    </div>
  `;
}

function contextRows(event = {}) {
  const metadata = asRecord(event.metadata ?? event.metadataJson);
  const after = asRecord(event.after ?? event.afterJson);
  const before = asRecord(event.before ?? event.beforeJson);
  const source = { ...metadata, ...before, ...after };
  return [
    ["Atendimento relacionado", source.appointmentId || source.appointment?.id],
    ["Venda relacionada", source.productSaleId || source.saleId || source.sale?.id],
    ["Produto relacionado", source.productId || source.product?.id || source.productName],
    ["Financeiro relacionado", source.financialEntryId || source.financialTransactionId],
    ["Comissao relacionada", source.commissionId],
    ["Configuracao alterada", source.settingKey || source.configKey || source.key],
  ].filter(([, value]) => value);
}

function renderContext(event = {}) {
  const rows = contextRows(event);
  if (!rows.length) {
    return `<p class="text-sm text-slate-400">Sem vinculo operacional explicito neste evento.</p>`;
  }
  return `
    <dl class="op-summary-grid">
      ${rows
        .map(
          ([label, value]) => `
            <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(formatValue(value))}</dd></div>
          `,
        )
        .join("")}
    </dl>
  `;
}

function renderBeforeAfter(event = {}) {
  const changes = collectChangedFields(event);
  const before = event.before ?? event.beforeJson;
  const after = event.after ?? event.afterJson;
  if (!changes.length && !before && !after) {
    return `<p class="text-sm text-slate-400">Evento sem comparativo anterior e posterior.</p>`;
  }
  return `
    <div class="audit-change-list">
      ${
        changes.length
          ? changes
              .map(
                (change) => `
                  <article class="audit-change-item">
                    <strong>${escapeHtml(humanizeToken(change.key))}</strong>
                    <span>Antes: ${escapeHtml(formatValue(change.before))}</span>
                    <span>Depois: ${escapeHtml(formatValue(change.after))}</span>
                  </article>
                `,
              )
              .join("")
          : `<p class="text-sm text-slate-400">Antes e depois foram registrados, mas sem alteracoes simples para destacar.</p>`
      }
      <details class="audit-advanced-details">
        <summary>Ver comparativo avancado</summary>
        <p>O conteudo tecnico completo fica preservado em Rastreabilidade tecnica.</p>
      </details>
    </div>
  `;
}

export function renderAuditLoading(elements) {
  if (elements.feedback) {
    renderPanelMessage(elements.feedback, "Carregando linha do tempo de auditoria...");
  }
  if (elements.list) {
    elements.list.innerHTML = "<p class='text-sm text-slate-500'>Buscando eventos...</p>";
  }
}

export function renderAuditError(elements, message = "Falha ao carregar auditoria.") {
  if (elements.feedback) {
    renderPanelMessage(elements.feedback, message, "error");
  }
  if (elements.list) {
    elements.list.innerHTML = "";
  }
}

export function renderAuditData(elements, payload) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  if (elements.feedback) {
    renderPanelMessage(
      elements.feedback,
      events.length
        ? `${events.length} evento(s) na linha do tempo atual.`
        : "Nenhum evento encontrado no filtro atual.",
      events.length ? "success" : "info",
    );
  }
  if (!elements.list) return;
  if (!events.length) {
    elements.list.innerHTML = renderEmptyState({
      title: "Nenhum evento de auditoria encontrado.",
      description: "Ajuste o periodo, modulo, ator ou acao para revisar a trilha operacional.",
    });
    return;
  }
  elements.list.innerHTML = renderTimeline(events);
}

export function renderAuditEventDrawer(elements, event = {}) {
  if (!elements.drawerHost || !event?.id) return;

  const summary = `
    <dl class="op-summary-grid">
      <div><dt>Acao</dt><dd>${escapeHtml(actionLabel(event.action))}</dd></div>
      <div><dt>Quando</dt><dd>${escapeHtml(formatDateTime(event.createdAt))}</dd></div>
      <div><dt>Ator</dt><dd>${escapeHtml(actorLabel(event))}</dd></div>
      <div><dt>Perfil</dt><dd>${escapeHtml(roleLabel(event.actorRole || event.role))}</dd></div>
      <div><dt>Modulo</dt><dd>${escapeHtml(moduleLabel(event.entity))}</dd></div>
      <div><dt>Entidade</dt><dd>${escapeHtml(moduleLabel(event.entity))}</dd></div>
      <div><dt>Impacto</dt><dd>${escapeHtml(impactSummary(event))}</dd></div>
      <div><dt>Sensibilidade</dt><dd>${escapeHtml(isSensitive(event) ? "Operacao sensivel" : "Operacao comum")}</dd></div>
    </dl>
  `;

  const technicalTrace = renderTechnicalTrace({
    auditLogId: event.id,
    entity: event.entity,
    entityId: event.entityId,
    action: event.action,
    route: event.route,
    method: event.method,
    requestId: event.requestId,
    correlationId: event.correlationId || event.requestId,
    idempotencyKey: event.idempotencyKey,
    beforeJson: event.before ?? event.beforeJson,
    afterJson: event.after ?? event.afterJson,
    metadataJson: event.metadata ?? event.metadataJson,
  });

  elements.drawerHost.innerHTML = renderEntityDrawer({
    id: "auditEventDrawer",
    title: actionLabel(event.action),
    subtitle: `${moduleLabel(event.entity)} · ${formatDateTime(event.createdAt)}`,
    status: isSensitive(event) ? "CRITICAL" : "",
    open: true,
    summary,
    details: renderContext(event),
    history: renderBeforeAfter(event),
    technicalTrace,
  });
  elements.drawerHost.classList.remove("hidden");
  bindEntityDrawers(elements.drawerHost);
  elements.drawerHost.querySelectorAll("[data-drawer-close]").forEach((button) => {
    button.addEventListener("click", () => {
      elements.drawerHost.classList.add("hidden");
    });
  });
}
