import { renderEmptyState } from "../components/operational-ui.js";

const ACTION_LABELS = {
  // Agenda
  APPOINTMENT_CREATED: "Agendamento criado",
  APPOINTMENT_UPDATED: "Agendamento atualizado",
  APPOINTMENT_CANCELLED: "Agendamento cancelado",
  APPOINTMENT_CONFIRMED: "Agendamento confirmado",
  APPOINTMENT_COMPLETED: "Atendimento concluido",
  APPOINTMENT_CHECKOUT: "Atendimento finalizado",
  APPOINTMENT_CHECKOUT_COMPLETED: "Atendimento finalizado",
  APPOINTMENT_STATUS_UPDATED: "Status do agendamento alterado",
  APPOINTMENT_STATUS_CHANGED: "Status do agendamento alterado",
  APPOINTMENT_NO_SHOW: "Cliente nao compareceu",
  APPOINTMENT_REFUND: "Estorno de atendimento",
  APPOINTMENT_REFUNDED: "Estorno de atendimento",
  CHECKOUT: "Atendimento finalizado",
  // PDV
  PRODUCT_SALE_CREATED: "Venda de produto registrada",
  PRODUCT_SALE_COMPLETED: "Venda de produto concluida",
  PRODUCT_SALE_REFUND: "Devolucao de produto",
  PRODUCT_SALE_REFUNDED: "Devolucao de produto",
  // Financeiro
  FINANCIAL_MANUAL_ENTRY: "Lancamento financeiro manual",
  FINANCIAL_MANUAL_ENTRY_REGISTERED: "Lancamento financeiro manual",
  FINANCIAL_TRANSACTION_CREATED: "Lancamento financeiro registrado",
  FINANCIAL_ENTRY_CREATED: "Lancamento financeiro registrado",
  FINANCIAL_ENTRY_UPDATED: "Lancamento financeiro atualizado",
  FINANCIAL_ENTRY_DELETED: "Lancamento financeiro removido",
  // Comissoes
  COMMISSION_PAID: "Comissao paga",
  COMMISSION_CREATED: "Comissao registrada",
  COMMISSION_UPDATED: "Comissao atualizada",
  // Estoque
  STOCK_ADJUSTMENT: "Ajuste de estoque",
  STOCK_ADJUSTED: "Ajuste de estoque",
  INVENTORY_UPDATED: "Estoque atualizado",
  PRODUCT_CREATED: "Produto cadastrado",
  PRODUCT_UPDATED: "Produto atualizado",
  PRODUCT_DELETED: "Produto removido",
  // Configuracoes / negocio
  SETTINGS_UPDATED: "Configuracao alterada",
  BUSINESS_SETTINGS_UPDATED: "Dados do negocio alterados",
  BUSINESS_HOURS_UPDATED: "Horario de funcionamento alterado",
  SERVICE_CREATED: "Servico cadastrado",
  SERVICE_UPDATED: "Servico atualizado",
  SERVICE_DELETED: "Servico removido",
  PROFESSIONAL_CREATED: "Profissional cadastrado",
  PROFESSIONAL_UPDATED: "Profissional atualizado",
  PROFESSIONAL_DELETED: "Profissional removido",
  // Acesso
  USER_LOGIN: "Login realizado",
  AUTH_LOGIN: "Login realizado",
  USER_CREATED: "Usuario criado",
  USER_UPDATED: "Usuario atualizado",
  PERMISSION_DENIED: "Acesso negado",
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
  business_settings: "Configuracoes",
  business_hours: "Configuracoes",
  service: "Servicos",
  professional: "Profissionais",
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
  const upper = key.toUpperCase();
  if (ACTION_LABELS[key]) return ACTION_LABELS[key];
  if (ACTION_LABELS[upper]) return ACTION_LABELS[upper];
  if (upper.includes("CHECKOUT")) return "Atendimento finalizado";
  if (upper.includes("REFUND")) return "Estorno registrado";
  if (upper.includes("APPOINTMENT") && upper.includes("STATUS")) return "Status do agendamento alterado";
  if (upper.includes("APPOINTMENT") && upper.includes("CANCEL")) return "Agendamento cancelado";
  if (upper.includes("APPOINTMENT") && upper.includes("CREAT")) return "Agendamento criado";
  if (upper.includes("APPOINTMENT")) return "Agendamento atualizado";
  if (upper.includes("COMMISSION")) return "Comissao registrada";
  if (upper.includes("STOCK") || upper.includes("INVENTORY")) return "Movimentacao de estoque";
  if (upper.includes("BUSINESS") && upper.includes("HOUR")) return "Horario de funcionamento alterado";
  if (upper.includes("BUSINESS") || upper.includes("SETTING")) return "Configuracao alterada";
  if (upper.includes("SERVICE") && upper.includes("CREAT")) return "Servico cadastrado";
  if (upper.includes("SERVICE")) return "Servico atualizado";
  if (upper.includes("PROFESSIONAL") && upper.includes("CREAT")) return "Profissional cadastrado";
  if (upper.includes("PROFESSIONAL")) return "Profissional atualizado";
  if (upper.includes("PRODUCT") && upper.includes("SALE")) return "Venda de produto";
  if (upper.includes("PRODUCT") && upper.includes("CREAT")) return "Produto cadastrado";
  if (upper.includes("PRODUCT")) return "Produto atualizado";
  if (upper.includes("FINANCIAL") || upper.includes("ENTRY")) return "Lancamento financeiro";
  if (upper.includes("LOGIN")) return "Login realizado";
  if (upper.includes("DENIED") || upper.includes("FORBIDDEN")) return "Acesso negado";
  if (upper.includes("CREAT") || upper.includes("REGISTER")) return "Registro criado";
  if (upper.includes("UPDAT")) return "Registro atualizado";
  if (upper.includes("DELET") || upper.includes("REMOV")) return "Registro removido";
  return "Evento registrado";
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

function moduleBadgeColor() {
  return "aud-badge-default";
}

function renderTimelineEvent(event = {}) {
  const sensitive = isSensitive(event);
  return `
    <article class="aud-event-card ${sensitive ? "aud-event-sensitive" : ""}" data-audit-action="detail" data-audit-event-id="${escapeHtml(event.id)}">
      <div class="aud-event-left">
        <span class="aud-event-time">${escapeHtml(formatDateTime(event.createdAt))}</span>
        <span class="aud-module-badge ${moduleBadgeColor(event.entity)}">${escapeHtml(moduleLabel(event.entity))}</span>
      </div>
      <div class="aud-event-body">
        <p class="aud-event-action">${escapeHtml(actionLabel(event.action))}</p>
        <p class="aud-event-impact">${escapeHtml(impactSummary(event))}</p>
        <div class="aud-event-meta">
          <span><strong>Ator</strong> ${escapeHtml(actorLabel(event))}</span>
          <span><strong>Perfil</strong> ${escapeHtml(roleLabel(event.actorRole || event.role))}</span>
          ${sensitive ? `<span class="aud-sensitive-tag">Sensivel</span>` : ""}
        </div>
      </div>
      <button type="button" class="aud-detail-btn" data-audit-action="detail" data-audit-event-id="${escapeHtml(event.id)}" title="Ver detalhes">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </button>
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
    <div class="aud-timeline">
      ${groupEventsByDay(events)
        .map(
          (group) => `
            <section class="aud-day-group">
              <h3 class="aud-day-label">${escapeHtml(group.label)}</h3>
              <div class="aud-day-events">
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
    return `<p class="ds-text-muted">Sem vinculo operacional explicito neste evento.</p>`;
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
    return `<p class="ds-text-muted">Evento sem comparativo anterior e posterior.</p>`;
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
          : `<p class="ds-text-muted">Antes e depois foram registrados, mas sem alteracoes simples para destacar.</p>`
      }
      <details class="audit-advanced-details">
        <summary>Ver comparativo avancado</summary>
        <p>O conteudo tecnico completo fica preservado em Rastreabilidade tecnica.</p>
      </details>
    </div>
  `;
}

export function renderAuditLoading(elements) {
  if (elements.list) {
    elements.list.innerHTML = "<p class='aud-status-msg'>Buscando eventos...</p>";
  }
}

export function renderAuditError(elements, message = "Falha ao carregar auditoria.") {
  if (elements.list) {
    elements.list.innerHTML = `<p class='aud-status-msg aud-status-error'>${escapeHtml(message)}</p>`;
  }
}

export function renderAuditData(elements, payload) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
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

  const sensitive = isSensitive(event);
  const changes = collectChangedFields(event);
  const contextRowsList = contextRows(event);

  const changesHtml = changes.length
    ? changes
        .map((c) => {
          const hasBefore = c.before != null && c.before !== "";
          return `
        <div class="aud-change-row">
          <span class="aud-change-key">${escapeHtml(humanizeToken(c.key))}</span>
          <div class="aud-change-diff">
            ${hasBefore ? `<span class="aud-change-before">${escapeHtml(formatValue(c.before))}</span><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>` : ""}
            <span class="aud-change-after">${escapeHtml(formatValue(c.after))}</span>
          </div>
        </div>
      `;
        })
        .join("")
    : `<p class="aud-drawer-empty">Sem alteracoes detectadas neste evento.</p>`;

  const contextHtml = contextRowsList.length
    ? `<dl class="aud-drawer-grid">${contextRowsList.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(formatValue(value))}</dd></div>`).join("")}</dl>`
    : `<p class="aud-drawer-empty">Sem vinculo operacional explicito.</p>`;

  const technicalRows = [
    ["ID do evento", event.id],
    ["Entidade", event.entity],
    ["ID da entidade", event.entityId],
    ["Rota", event.route],
    ["Metodo", event.method],
    ["requestId", event.requestId],
    ["idempotencyKey", event.idempotencyKey],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd></div>`)
    .join("");

  elements.drawerHost.innerHTML = `
    <aside class="op-drawer is-open" id="auditEventDrawer">
      <div class="op-drawer-backdrop" data-drawer-close></div>
      <article class="op-drawer-panel team-drawer" role="dialog" aria-modal="true">

        <header class="team-drawer-head">
          <div class="team-drawer-hero">
            <div class="team-drawer-hero-info">
              <h2>${escapeHtml(actionLabel(event.action))}</h2>
              <p class="team-drawer-role">${escapeHtml(moduleLabel(event.entity))} · ${escapeHtml(formatDateTime(event.createdAt))}</p>
              ${sensitive ? `<div class="team-chips"><span class="team-chip" style="background:rgba(244,63,94,0.1);color:#be123c;border-color:rgba(244,63,94,0.2)">Sensivel</span></div>` : ""}
            </div>
          </div>
          <button type="button" class="team-drawer-close" data-drawer-close aria-label="Fechar">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </header>

        <div class="team-drawer-body">
          <section class="team-drawer-section">
            <h3>Resumo</h3>
            <dl class="aud-drawer-grid">
              <div><dt>Ator</dt><dd>${escapeHtml(actorLabel(event))}</dd></div>
              <div><dt>Perfil</dt><dd>${escapeHtml(roleLabel(event.actorRole || event.role))}</dd></div>
              <div><dt>Modulo</dt><dd>${escapeHtml(moduleLabel(event.entity))}</dd></div>
              <div><dt>Sensibilidade</dt><dd>${escapeHtml(sensitive ? "Operacao sensivel" : "Operacao comum")}</dd></div>
            </dl>
          </section>

          ${changes.length ? `
          <section class="team-drawer-section">
            <h3>Alteracoes detectadas</h3>
            <div class="aud-changes-list">${changesHtml}</div>
          </section>` : ""}

          ${contextRowsList.length ? `
          <section class="team-drawer-section">
            <h3>Vinculos operacionais</h3>
            ${contextHtml}
          </section>` : ""}

          ${technicalRows ? `
          <section class="team-drawer-section">
            <details class="aud-technical-details">
              <summary>Rastreabilidade tecnica</summary>
              <dl class="aud-drawer-grid" style="margin-top:12px">${technicalRows}</dl>
            </details>
          </section>` : ""}
        </div>

        <footer class="team-drawer-footer">
          <button type="button" class="team-footer-btn team-footer-primary" data-drawer-close>Fechar</button>
        </footer>
      </article>
    </aside>
  `;

  elements.drawerHost.classList.remove("hidden");

  elements.drawerHost.querySelectorAll("[data-drawer-close]").forEach((button) => {
    button.addEventListener("click", () => {
      elements.drawerHost.classList.add("hidden");
    });
  });
}
