import {
  bindEntityDrawers,
  renderEmptyState,
  renderEntityDrawer,
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

function formatDateShort(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function parseRelatedId(notes = "", key = "") {
  const match = String(notes || "").match(new RegExp(`${key}=([^;\\s]+)`));
  return match?.[1] || "";
}

function isExpense(item = {}) {
  return item.type === "EXPENSE";
}

function typeLabel(type) {
  return type === "EXPENSE" ? "Saida" : "Entrada";
}

function typeStatus(type) {
  return type === "EXPENSE" ? "PENDING" : "PAID";
}

function originLabel(item = {}) {
  const source = String(item.source ?? "").toUpperCase();
  const referenceType = String(item.referenceType ?? "").toUpperCase();

  if (source === "SERVICE" || referenceType === "APPOINTMENT") return "Atendimento finalizado";
  if (source === "PRODUCT" || referenceType === "PRODUCT_SALE") return "Venda de produto";
  if (source === "COMMISSION" || referenceType === "COMMISSION") return "Comissao paga";
  if (referenceType === "APPOINTMENT_REFUND") return "Estorno de atendimento";
  if (referenceType === "PRODUCT_SALE_REFUND") return "Devolucao de produto";
  if (source === "MANUAL" || referenceType === "MANUAL") return "Lancamento manual";
  if (source === "REFUND") return "Reverso financeiro";

  return isExpense(item) ? "Despesa operacional" : "Entrada operacional";
}

function impactMessage(item = {}) {
  const source = String(item.source ?? "").toUpperCase();
  const referenceType = String(item.referenceType ?? "").toUpperCase();

  if (source === "SERVICE" || referenceType === "APPOINTMENT") {
    return "Este lancamento foi gerado ao finalizar um atendimento.";
  }
  if (source === "PRODUCT" || referenceType === "PRODUCT_SALE") {
    return "Este lancamento foi gerado por uma venda de produto.";
  }
  if (referenceType === "APPOINTMENT_REFUND") {
    return "Este lancamento reverte um estorno de atendimento.";
  }
  if (referenceType === "PRODUCT_SALE_REFUND") {
    return "Este lancamento reverte uma devolucao.";
  }
  if (source === "COMMISSION" || referenceType === "COMMISSION") {
    return "Este lancamento registra o pagamento de comissao.";
  }
  if (source === "MANUAL" || referenceType === "MANUAL") {
    return "Este lancamento foi criado manualmente.";
  }
  return "Este lancamento compoe o resultado operacional do periodo.";
}

function originRank(item = {}) {
  const referenceType = String(item.referenceType ?? "").toUpperCase();
  const source = String(item.source ?? "").toUpperCase();
  if (referenceType.includes("REFUND") || source === "REFUND") return 4;
  if (source === "COMMISSION" || referenceType === "COMMISSION") return 3;
  if (source === "SERVICE" || referenceType === "APPOINTMENT") return 2;
  if (source === "PRODUCT" || referenceType === "PRODUCT_SALE") return 1;
  return 0;
}

function summarizeOrigins(transactions = []) {
  const grouped = new Map();
  transactions.forEach((item) => {
    const label = originLabel(item);
    const current = grouped.get(label) || { label, amount: 0, count: 0, rank: originRank(item) };
    current.amount += toNumber(item.amount);
    current.count += 1;
    current.rank = Math.max(current.rank, originRank(item));
    grouped.set(label, current);
  });
  return Array.from(grouped.values())
    .sort((a, b) => b.rank - a.rank || b.amount - a.amount)
    .slice(0, 4);
}

function renderCard(title, value, tone = "", subtitle = "") {
  return `
    <article class="fn-kpi ${tone}">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
    </article>
  `;
}

function renderFinancialToolbar(transactions = [], cashFlow = {}) {
  const movement = toNumber(cashFlow.incoming) + toNumber(cashFlow.outgoing);
  const count = transactions.length;
  return `
    <div class="fn-toolbar">
      <div>
        <span class="fn-toolbar-label">${count} ${count === 1 ? "lancamento" : "lancamentos"}</span>
        <strong>Movimento ${escapeHtml(money(movement))}</strong>
      </div>
      <button type="button" id="financialAddTransactionBtn" class="fn-add-btn">
        <span aria-hidden="true">+</span>
        Novo lancamento
      </button>
    </div>
  `;
}

function renderOriginStrip(transactions = []) {
  const origins = summarizeOrigins(transactions);
  if (!origins.length) return "";
  return `
    <article class="fn-origin-strip">
      <div>
        <p>Principais origens</p>
        <strong>De onde veio o movimento do periodo</strong>
      </div>
      <div class="fn-origin-list">
        ${origins
          .map(
            (item) => `
              <span>
                <strong>${escapeHtml(item.label)}</strong>
                ${escapeHtml(money(item.amount))} · ${item.count} lanc.
              </span>
            `,
          )
          .join("")}
      </div>
    </article>
  `;
}

function barPercent(value, max) {
  const numeric = Math.abs(toNumber(value));
  const limit = Math.max(Math.abs(toNumber(max)), 1);
  if (numeric <= 0) return 0;
  return Math.max(4, Math.min(100, Math.round((numeric / limit) * 100)));
}

function renderFinancialCharts(transactions = [], cashFlow = {}) {
  const incoming = toNumber(cashFlow.incoming);
  const outgoing = toNumber(cashFlow.outgoing);
  const balance = toNumber(cashFlow.balance);
  const maxFlow = Math.max(Math.abs(incoming), Math.abs(outgoing), Math.abs(balance), 1);
  const origins = summarizeOrigins(transactions);
  const maxOrigin = Math.max(...origins.map((item) => Math.abs(toNumber(item.amount))), 1);

  return `
    <section class="fn-visual-grid" aria-label="Visualizacao financeira">
      <article class="fn-chart-card">
        <div class="fn-chart-head">
          <span>Fluxo de caixa</span>
          <strong>Entradas, saidas e saldo</strong>
        </div>
        <div class="fn-flow-bars">
          <div class="fn-flow-row fn-flow-income">
            <span>Entradas</span>
            <div><i style="width:${barPercent(incoming, maxFlow)}%"></i></div>
            <strong>${escapeHtml(money(incoming))}</strong>
          </div>
          <div class="fn-flow-row fn-flow-expense">
            <span>Saidas</span>
            <div><i style="width:${barPercent(outgoing, maxFlow)}%"></i></div>
            <strong>${escapeHtml(money(outgoing))}</strong>
          </div>
          <div class="fn-flow-row ${balance >= 0 ? "fn-flow-income" : "fn-flow-expense"}">
            <span>Saldo</span>
            <div><i style="width:${barPercent(balance, maxFlow)}%"></i></div>
            <strong>${escapeHtml(money(balance))}</strong>
          </div>
        </div>
      </article>

      <article class="fn-chart-card">
        <div class="fn-chart-head">
          <span>Origem do movimento</span>
          <strong>${origins.length ? "Principais fontes do periodo" : "Sem origem registrada"}</strong>
        </div>
        <div class="fn-origin-bars">
          ${
            origins.length
              ? origins
                  .map(
                    (item) => `
                      <div class="fn-origin-bar">
                        <div>
                          <span>${escapeHtml(item.label)}</span>
                          <strong>${escapeHtml(money(item.amount))}</strong>
                        </div>
                        <b><i style="width:${barPercent(item.amount, maxOrigin)}%"></i></b>
                      </div>
                    `,
                  )
                  .join("")
              : `<p class="fn-chart-empty">Os graficos aparecem automaticamente quando houver lancamentos no recorte.</p>`
          }
        </div>
      </article>
    </section>
  `;
}

function renderTransactionActions(item = {}) {
  return `
    <button type="button" data-financial-action="detail" data-financial-transaction-id="${escapeHtml(item.id)}" class="fn-row-arrow" title="Ver detalhes">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
    </button>
  `;
}

function renderTransactionRow(item = {}) {
  const expense = isExpense(item);
  return `
    <article class="fn-row ${expense ? "fn-row-expense" : "fn-row-income"}">
      <div class="fn-row-main" data-financial-action="detail" data-financial-transaction-id="${escapeHtml(item.id)}">
        <div class="fn-row-date">
          <strong>${escapeHtml(formatDateShort(item.date))}</strong>
          <span>${escapeHtml(typeLabel(item.type))}</span>
        </div>
        <div class="fn-row-copy">
          <strong>${escapeHtml(item.description || originLabel(item))}</strong>
          <span>${escapeHtml(originLabel(item))} · ${escapeHtml(item.category || "Sem categoria")}</span>
          <small>${escapeHtml(item.paymentMethod || "Metodo nao informado")}</small>
        </div>
        <div class="fn-row-value">
          <strong>${expense ? "-" : "+"} ${escapeHtml(money(item.amount))}</strong>
          <span>${escapeHtml(formatDateTime(item.date))}</span>
        </div>
      </div>
      <div class="fn-row-actions">${renderTransactionActions(item)}</div>
    </article>
  `;
}

function renderOperationalLinks(item = {}) {
  const refundAppointmentId = parseRelatedId(item.notes, "appointmentId");
  const refundProductSaleId = parseRelatedId(item.notes, "productSaleId");
  const rows = [
    ["Atendimento relacionado", item.appointmentId || refundAppointmentId],
    ["Venda relacionada", item.productSaleId || refundProductSaleId],
    ["Devolucao/estorno relacionado", item.referenceType?.includes("REFUND") ? item.referenceId : ""],
    ["Profissional relacionado", item.professionalName || (item.professionalId ? "Profissional vinculado" : "")],
    ["Cliente relacionado", item.customerName || (item.customerId ? "Cliente vinculado" : "")],
    ["Comissao relacionada", item.commissionId],
  ].filter(([, value]) => value);

  if (!rows.length) {
    return `<p class="ds-text-muted">Sem vinculo operacional informado para este lancamento.</p>`;
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

export function renderFinancialLoading(elements) {
  if (elements.summary) renderPanelMessage(elements.summary, "Carregando resultado do periodo...");
  if (elements.toolbar) renderPanelMessage(elements.toolbar, "Preparando acoes financeiras...");
  if (elements.cashflow) renderPanelMessage(elements.cashflow, "Carregando origens financeiras...");
  if (elements.list) renderPanelMessage(elements.list, "Carregando lancamentos financeiros...");
  if (elements.commissions) elements.commissions.innerHTML = "";
  if (elements.reports) elements.reports.innerHTML = "";
}

export function renderFinancialError(elements, message = "Falha ao carregar financeiro.") {
  if (elements.summary) renderPanelMessage(elements.summary, message, "error");
  if (elements.toolbar) renderPanelMessage(elements.toolbar, message, "error");
  if (elements.cashflow) renderPanelMessage(elements.cashflow, message, "error");
  if (elements.list) renderPanelMessage(elements.list, message, "error");
  if (elements.commissions) elements.commissions.innerHTML = "";
  if (elements.reports) elements.reports.innerHTML = "";
}

export function renderFinancialData(elements, payload) {
  const summary = payload?.summary?.summary ?? {
    grossRevenue: 0,
    expenses: 0,
    estimatedProfit: 0,
    netBalance: 0,
  };
  const cashFlow = payload?.summary?.cashFlow ?? {
    incoming: 0,
    outgoing: 0,
    balance: 0,
  };
  const transactions = Array.isArray(payload?.transactions?.transactions)
    ? payload.transactions.transactions
    : [];

  if (elements.summary) {
    elements.summary.innerHTML = [
      renderCard(
        "Resultado",
        money(summary.estimatedProfit ?? cashFlow.balance),
        toNumber(summary.estimatedProfit ?? cashFlow.balance) >= 0 ? "fn-kpi-positive" : "fn-kpi-negative",
        `Saldo ${money(cashFlow.balance)}`,
      ),
      renderCard("Entradas", money(cashFlow.incoming), "fn-kpi-positive", "Receitas no recorte"),
      renderCard("Saidas", money(cashFlow.outgoing), "fn-kpi-negative", "Despesas e reversos"),
    ].join("");
  }

  if (elements.toolbar) {
    elements.toolbar.innerHTML = renderFinancialToolbar(transactions, cashFlow);
  }

  if (elements.cashflow) {
    elements.cashflow.innerHTML = renderFinancialCharts(transactions, cashFlow);
  }

  if (elements.list) {
    if (!transactions.length) {
      elements.list.innerHTML = renderEmptyState({
        title: "Nenhum lancamento financeiro encontrado.",
        description: "Ajuste o periodo ou registre um lancamento manual para compor o caixa.",
      });
    } else {
      elements.list.innerHTML = `
        <div class="fn-list-head">
          <span>Lancamentos no recorte</span>
          <strong>${transactions.length} ${transactions.length === 1 ? "registro" : "registros"}</strong>
        </div>
        <div class="fn-list">${transactions.map((item) => renderTransactionRow(item)).join("")}</div>
      `;
    }
  }
  if (elements.commissions) elements.commissions.innerHTML = "";
  if (elements.reports) elements.reports.innerHTML = "";
}

export function renderFinancialEntryDrawer(elements, item = {}) {
  if (!elements.drawerHost || !item?.id) return;

  const expense = isExpense(item);
  const summary = `
    <dl class="op-summary-grid">
      <div><dt>Tipo</dt><dd>${escapeHtml(typeLabel(item.type))}</dd></div>
      <div><dt>Valor</dt><dd>${escapeHtml(money(item.amount))}</dd></div>
      <div><dt>Data</dt><dd>${escapeHtml(formatDateTime(item.date))}</dd></div>
      <div><dt>Origem</dt><dd>${escapeHtml(originLabel(item))}</dd></div>
      <div><dt>Categoria</dt><dd>${escapeHtml(item.category || "-")}</dd></div>
      <div><dt>Metodo</dt><dd>${escapeHtml(item.paymentMethod || "-")}</dd></div>
      <div><dt>Descricao</dt><dd>${escapeHtml(item.description || "-")}</dd></div>
      <div><dt>Observacao</dt><dd>${escapeHtml(item.notes || "-")}</dd></div>
    </dl>
  `;

  const details = `
    ${renderOperationalLinks(item)}
  `;

  const history = `
    <div class="op-detail-list">
      <p>${escapeHtml(impactMessage(item))}</p>
      <p>O impacto foi conciliado visualmente com a origem operacional e a rastreabilidade completa fica recolhida abaixo.</p>
    </div>
  `;

  const technicalTrace = renderTechnicalTrace({
    financialEntryId: item.id,
    source: item.source,
    referenceType: item.referenceType,
    referenceId: item.referenceId,
    appointmentId: item.appointmentId || parseRelatedId(item.notes, "appointmentId"),
    productSaleId: item.productSaleId || parseRelatedId(item.notes, "productSaleId"),
    commissionId: item.commissionId,
    professionalId: item.professionalId,
    customerId: item.customerId,
    idempotencyKey: item.idempotencyKey,
    auditEntity: "financial_entry",
    auditAction: item.referenceType === "MANUAL" ? "FINANCIAL_MANUAL_ENTRY" : item.referenceType,
  });

  elements.drawerHost.innerHTML = renderEntityDrawer({
    id: "financialEntryDrawer",
    title: item.description || originLabel(item),
    subtitle: `${originLabel(item)} · ${formatDateTime(item.date)}`,
    status: typeStatus(item.type),
    open: true,
    summary,
    details,
    history,
    technicalTrace,
    actions:
      item.referenceType === "MANUAL"
        ? `
          <button type="button" data-financial-action="edit" data-financial-transaction-id="${escapeHtml(item.id)}" class="ux-btn ux-btn-muted">Editar lancamento</button>
          <button type="button" data-financial-action="delete" data-financial-transaction-id="${escapeHtml(item.id)}" class="ux-btn ux-btn-danger">Excluir lancamento</button>
        `
        : "",
  });
  elements.drawerHost.classList.remove("hidden");
  bindEntityDrawers(elements.drawerHost);

  elements.drawerHost.querySelectorAll("[data-drawer-close]").forEach((button) => {
    button.addEventListener("click", () => {
      elements.drawerHost.classList.add("hidden");
    });
  });
}
