import {
  bindEntityDrawers,
  renderEmptyState,
  renderEntityDrawer,
  renderPrimaryAction,
  renderStatusChip,
  renderTechnicalTrace,
} from "../components/operational-ui.js";
import { renderPanelMessage } from "./feedback.js";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return Number(toNumber(value)).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

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

function daysSince(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(0, Math.floor((startToday.getTime() - startDate.getTime()) / 86_400_000));
}

function sourceLabel(entry = {}) {
  const source = String(entry.source || entry.appliesTo || entry.referenceType || "").toUpperCase();
  if (source === "SERVICE" || source === "APPOINTMENT") return "Atendimento finalizado";
  if (source === "PRODUCT" || source === "PRODUCT_SALE") return "Venda de produto";
  if (source === "MANUAL") return "Ajuste manual";
  return "Comissao operacional";
}

function sourceImpact(entry = {}) {
  const source = String(entry.source || entry.appliesTo || entry.referenceType || "").toUpperCase();
  if (source === "SERVICE" || source === "APPOINTMENT") {
    return "Esta comissao nasceu de um atendimento finalizado.";
  }
  if (source === "PRODUCT" || source === "PRODUCT_SALE") {
    return "Esta comissao nasceu de uma venda de produto.";
  }
  if (source === "MANUAL") return "Esta comissao nasceu de um ajuste manual.";
  return "Esta comissao faz parte da operacao do periodo.";
}

function statusLabel(status = "") {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "PAID") return "Paga";
  if (normalized === "CANCELED" || normalized === "CANCELLED") return "Cancelada";
  return "Pendente";
}

function ruleSummary(entry = {}) {
  const percentage = entry.percentage ?? entry.commissionRate;
  const fixedAmount = entry.fixedAmount;
  const parts = [];
  if (percentage != null) parts.push(`${toNumber(percentage).toFixed(2)}%`);
  if (fixedAmount != null && toNumber(fixedAmount) > 0) parts.push(`${money(fixedAmount)} fixo`);
  return parts.length ? parts.join(" + ") : "Regra operacional";
}

function normalizeEntries(payload = {}) {
  return (Array.isArray(payload.entries) ? payload.entries : []).map((entry) => ({
    ...entry,
    id: entry.id || entry.commissionId,
    status: entry.status || "PENDING",
    occurredAt: entry.occurredAt || entry.createdAt,
    commissionAmount: toNumber(entry.commissionAmount),
    baseAmount: toNumber(entry.baseAmount),
  }));
}

function summarize(entries = [], payload = {}) {
  const summary = payload.summary || {};
  const pendingEntries = entries.filter((item) => item.status === "PENDING");
  const paidEntries = entries.filter((item) => item.status === "PAID");
  const staleEntries = pendingEntries.filter((item) => daysSince(item.occurredAt) >= 7);
  const professionalsPending = new Set(pendingEntries.map((item) => item.professionalId || item.professionalName).filter(Boolean));

  return {
    pending: summary.pendingCommission ?? pendingEntries.reduce((acc, item) => acc + item.commissionAmount, 0),
    paid: summary.paidCommission ?? paidEntries.reduce((acc, item) => acc + item.commissionAmount, 0),
    professionalsPending: professionalsPending.size,
    stale: staleEntries.length,
  };
}

function groupByProfessional(entries = [], payload = {}) {
  const byProfessionalPayload = Array.isArray(payload.byProfessional) ? payload.byProfessional : [];
  const groups = new Map();

  entries.forEach((entry) => {
    const key = entry.professionalId || entry.professionalName || "sem-profissional";
    const group = groups.get(key) || {
      professionalId: entry.professionalId,
      professionalName: entry.professionalName || "Profissional",
      pendingAmount: 0,
      paidAmount: 0,
      totalAmount: 0,
      entries: [],
    };
    group.entries.push(entry);
    group.totalAmount += entry.commissionAmount;
    if (entry.status === "PENDING") group.pendingAmount += entry.commissionAmount;
    if (entry.status === "PAID") group.paidAmount += entry.commissionAmount;
    groups.set(key, group);
  });

  byProfessionalPayload.forEach((item) => {
    const key = item.professionalId || item.professionalName;
    if (!key || groups.has(key)) return;
    groups.set(key, {
      professionalId: item.professionalId,
      professionalName: item.professionalName || "Profissional",
      pendingAmount: toNumber(item.pendingAmount),
      paidAmount: 0,
      totalAmount: toNumber(item.commissionAmount || item.totalCommission),
      entries: [],
    });
  });

  return Array.from(groups.values()).sort((a, b) => b.pendingAmount - a.pendingAmount || b.totalAmount - a.totalAmount);
}

function renderKpi(title, value, subtitle = "", tone = "") {
  return `
    <article class="ux-kpi commission-kpi">
      <div class="ux-label">${escapeHtml(title)}</div>
      <div class="ux-value-sm ${tone}">${escapeHtml(value)}</div>
      ${subtitle ? `<div class="ux-hint">${escapeHtml(subtitle)}</div>` : ""}
    </article>
  `;
}

function renderQueueAction(entry = {}, canPayCommissions = false) {
  const canPay = canPayCommissions && entry.status === "PENDING";
  return `
    <div class="commission-row-actions">
      <button type="button" data-commission-action="detail" data-commission-id="${escapeHtml(entry.id)}" class="ux-btn ux-btn-muted">Ver detalhes</button>
      ${
        canPay
          ? renderPrimaryAction({
              label: "Pagar",
              attrs: {
                "data-commission-action": "pay",
                "data-commission-id": entry.id,
              },
            })
          : ""
      }
    </div>
  `;
}

function renderCommissionRow(entry = {}, options = {}) {
  const age = daysSince(entry.occurredAt);
  const isOldPending = entry.status === "PENDING" && age >= 7;
  return `
    <article class="commission-row ${isOldPending ? "commission-row-stale" : ""}">
      <div class="commission-row-main">
        <div class="commission-row-copy">
          <div class="commission-row-meta">
            ${renderStatusChip(entry.status, { label: statusLabel(entry.status) })}
            ${isOldPending ? renderStatusChip("WARNING", { label: "Antiga" }) : ""}
            <span>${escapeHtml(formatDateTime(entry.occurredAt))}</span>
          </div>
          <strong>${escapeHtml(sourceLabel(entry))}</strong>
          <span>${escapeHtml(entry.professionalName || "Profissional")}</span>
        </div>
        <div class="commission-row-money">
          <span>Comissao</span>
          <strong>${escapeHtml(money(entry.commissionAmount))}</strong>
        </div>
      </div>
      <div class="commission-row-foot">
        <span>Base ${escapeHtml(money(entry.baseAmount))}</span>
        <span>${escapeHtml(ruleSummary(entry))}</span>
        ${renderQueueAction(entry, options.canPayCommissions)}
      </div>
    </article>
  `;
}

function renderProfessionalGroup(group = {}, options = {}) {
  return `
    <section class="commission-professional-group">
      <header>
        <div>
          <p class="ux-label">Profissional</p>
          <h3>${escapeHtml(group.professionalName)}</h3>
        </div>
        <div class="commission-professional-totals">
          <span>Pendente <strong>${escapeHtml(money(group.pendingAmount))}</strong></span>
          <span>Pago <strong>${escapeHtml(money(group.paidAmount))}</strong></span>
        </div>
      </header>
      <div class="commission-queue-list">
        ${group.entries.map((entry) => renderCommissionRow(entry, options)).join("")}
      </div>
    </section>
  `;
}

function renderCalculation(entry = {}) {
  return `
    <dl class="op-summary-grid">
      <div><dt>Valor base</dt><dd>${escapeHtml(money(entry.baseAmount))}</dd></div>
      <div><dt>Percentual</dt><dd>${entry.commissionRate == null ? "-" : `${escapeHtml(toNumber(entry.commissionRate).toFixed(2))}%`}</dd></div>
      <div><dt>Valor fixo</dt><dd>${entry.fixedAmount == null ? "-" : escapeHtml(money(entry.fixedAmount))}</dd></div>
      <div><dt>Regra aplicada</dt><dd>${escapeHtml(entry.ruleName || ruleSummary(entry))}</dd></div>
      <div><dt>Observacao</dt><dd>${escapeHtml(sourceImpact(entry))}</dd></div>
    </dl>
  `;
}

function renderOperationalLinkRows(entry = {}) {
  const rows = [
    ["Atendimento relacionado", entry.appointmentTitle || (entry.appointmentId ? "Atendimento vinculado" : "")],
    ["Venda relacionada", entry.productSaleTitle || (entry.productSaleId ? "Venda vinculada" : "")],
    ["Cliente relacionado", entry.customerName],
    ["Servico/produto relacionado", entry.serviceName || entry.productName],
    ["Lancamento financeiro de pagamento", entry.financialEntryId ? "Despesa financeira gerada" : ""],
  ].filter(([, value]) => value);

  if (!rows.length) {
    return `<p class="text-sm text-slate-400">Sem vinculo operacional detalhado neste payload.</p>`;
  }

  return `
    <dl class="op-summary-grid">
      ${rows
        .map(
          ([label, value]) => `
            <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
          `,
        )
        .join("")}
    </dl>
  `;
}

function renderCommissionHistory(entry = {}) {
  const paid = entry.status === "PAID";
  return `
    <div class="op-detail-list">
      <p>${escapeHtml(sourceImpact(entry))}</p>
      <p>${paid ? "O pagamento desta comissao gerou uma saida no financeiro." : "Esta comissao ainda esta pendente de pagamento."}</p>
      <p>O detalhe tecnico fica preservado em rastreabilidade tecnica, recolhido por padrao.</p>
    </div>
  `;
}

export function renderCommissionsLoading(elements) {
  if (elements.summary) {
    renderPanelMessage(elements.summary, "Carregando fila de comissoes...");
  }
  if (elements.table) {
    renderPanelMessage(elements.table, "Organizando comissoes por profissional...");
  }
  if (elements.drawerHost) elements.drawerHost.innerHTML = "";
}

export function renderCommissionsError(elements, message = "Falha ao carregar comissoes.") {
  if (elements.summary) {
    renderPanelMessage(elements.summary, message, "error");
  }
  if (elements.table) {
    renderPanelMessage(elements.table, "Fila de comissoes indisponivel.", "error");
  }
  if (elements.drawerHost) elements.drawerHost.innerHTML = "";
}

export function renderCommissionsData(elements, payload, options = {}) {
  const entries = normalizeEntries(payload);
  const totals = summarize(entries, payload);
  const groups = groupByProfessional(entries, payload);
  const topPending = groups.find((group) => group.pendingAmount > 0);

  if (elements.summary) {
    elements.summary.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
        ${renderKpi("Pendente", money(totals.pending), "Valor ainda a pagar", "text-amber-700")}
        ${renderKpi("Pago no periodo", money(totals.paid), "Comissoes ja liquidadas", "text-emerald-700")}
        ${renderKpi("Profissionais pendentes", String(totals.professionalsPending), "Quem precisa receber")}
        ${renderKpi("Antigas ou vencidas", String(totals.stale), "Pendentes ha 7 dias ou mais", totals.stale ? "text-rose-700" : "")}
      </div>
      ${
        topPending
          ? `<div class="commission-priority-strip">
              <span>Prioridade operacional</span>
              <strong>${escapeHtml(topPending.professionalName)} tem ${escapeHtml(money(topPending.pendingAmount))} pendente.</strong>
            </div>`
          : ""
      }
    `;
  }

  if (!elements.table) return;
  if (!entries.length) {
    elements.table.innerHTML = renderEmptyState({
      title: "Nenhuma comissao encontrada.",
      description: "Ajuste o periodo, profissional, origem ou status para revisar a fila de pagamento.",
    });
    return;
  }

  elements.table.innerHTML = groups.map((group) => renderProfessionalGroup(group, options)).join("");
}

export function renderCommissionDrawer(elements, entry = {}, options = {}) {
  if (!elements.drawerHost || !entry?.id) return;

  const summary = `
    <dl class="op-summary-grid">
      <div><dt>Profissional</dt><dd>${escapeHtml(entry.professionalName || "Profissional")}</dd></div>
      <div><dt>Comissao</dt><dd>${escapeHtml(money(entry.commissionAmount))}</dd></div>
      <div><dt>Status</dt><dd>${escapeHtml(statusLabel(entry.status))}</dd></div>
      <div><dt>Data</dt><dd>${escapeHtml(formatDateTime(entry.occurredAt || entry.createdAt))}</dd></div>
      <div><dt>Origem</dt><dd>${escapeHtml(sourceLabel(entry))}</dd></div>
    </dl>
  `;

  const actions = `
    ${
      options.canPayCommissions && entry.status === "PENDING"
        ? renderPrimaryAction({
            label: "Pagar comissao",
            attrs: {
              "data-commission-action": "pay",
              "data-commission-id": entry.id,
            },
          })
        : ""
    }
    <button type="button" data-commission-action="open-financial" class="ux-btn ux-btn-muted" ${entry.financialEntryId ? "" : "disabled"}>Ver financeiro relacionado</button>
    <button type="button" data-commission-action="open-audit" class="ux-btn ux-btn-muted">Ver auditoria relacionada</button>
  `;

  const technicalTrace = renderTechnicalTrace({
    commissionId: entry.id,
    professionalId: entry.professionalId,
    appointmentId: entry.appointmentId,
    productSaleId: entry.productSaleId,
    ruleId: entry.ruleId,
    source: entry.source,
    status: entry.status,
    idempotencyKey: entry.idempotencyKey,
    financialEntryId: entry.financialEntryId,
    auditLogId: entry.auditLogId,
  });

  elements.drawerHost.innerHTML = renderEntityDrawer({
    id: "commissionDrawer",
    title: entry.professionalName || "Comissao",
    subtitle: `${sourceLabel(entry)} - ${formatDateTime(entry.occurredAt || entry.createdAt)}`,
    status: entry.status,
    open: true,
    summary,
    details: `${renderCalculation(entry)}<div class="mt-3">${renderOperationalLinkRows(entry)}</div>`,
    history: renderCommissionHistory(entry),
    technicalTrace,
    actions,
  });
  elements.drawerHost.classList.remove("hidden");
  bindEntityDrawers(elements.drawerHost);
  elements.drawerHost.querySelectorAll("[data-drawer-close]").forEach((button) => {
    button.addEventListener("click", () => {
      elements.drawerHost.classList.add("hidden");
    });
  });
}
